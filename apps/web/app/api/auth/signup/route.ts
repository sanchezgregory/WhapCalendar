import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { parseRequestData } from "app/api/parseRequestData";
import { NextResponse, type NextRequest } from "next/server";

import calcomSignupHandler from "./handlers/calcomSignupHandler";
import selfHostedSignupHandler from "./handlers/selfHostedHandler";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { IS_PREMIUM_USERNAME_ENABLED } from "@calcom/lib/constants";
import getIP from "@calcom/lib/getIP";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import { checkCfTurnstileToken } from "@calcom/lib/server/checkCfTurnstileToken";
import { prisma } from "@calcom/prisma";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { signupSchema } from "@calcom/prisma/zod-utils";

import {
  consumeWhapCalendarInvitation,
  verifyWhapCalendarInvitation,
} from "@lib/whapCalendarInvitations";

type WhapInvitation = {
  token: string;
  email: string;
  name?: string | null;
  about?: string | null;
  username: string;
  whapUserId?: number;
  mediatorProfileId?: number;
};

async function ensureSignupIsEnabled(body: Record<string, string>) {
  const { token } = signupSchema
    .pick({
      token: true,
    })
    .parse(body);

  // Still allow signups if there is a team invite
  if (token) return;

  const featuresRepository = new FeaturesRepository(prisma);
  const signupDisabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("disable-signup");

  if (process.env.NEXT_PUBLIC_DISABLE_SIGNUP === "true" || signupDisabled) {
    throw new HttpError({
      statusCode: 403,
      message: "Signup is disabled",
    });
  }
}

async function requireValidWhapInvitation(body: Record<string, string>): Promise<WhapInvitation> {
  const { invite, email } = signupSchema
    .pick({
      invite: true,
      email: true,
    })
    .parse(body);

  if (!invite) {
    throw new HttpError({
      statusCode: 403,
      message: "Signup is only available for Whap mediators",
    });
  }

  const invitation = await verifyWhapCalendarInvitation(invite);

  if (!invitation.valid || !invitation.email || !invitation.username) {
    throw new HttpError({
      statusCode: 403,
      message: "Whap Calendar invitation is missing or has expired",
    });
  }

  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new HttpError({
      statusCode: 403,
      message: "Signup email must match the Whap mediator invitation",
    });
  }

  return {
    token: invite,
    email: invitation.email,
    name: invitation.name,
    about: invitation.about,
    username: invitation.username,
    whapUserId: invitation.whap_user_id,
    mediatorProfileId: invitation.mediator_profile_id,
  };
}

async function handler(req: NextRequest) {
  const remoteIp = getIP(req);
  // Use a try catch instead of returning res every time
  try {
    // Rate limit: 10 signups per 60 seconds per IP
    await checkRateLimitAndThrowError({
      rateLimitingType: "core",
      identifier: `api:signup:${piiHasher.hash(remoteIp)}`,
    });

    const body = await parseRequestData(req);
    const query = Object.fromEntries(req.nextUrl.searchParams.entries());
    await checkCfTurnstileToken({
      token: req.headers.get("cf-access-token") as string,
      remoteIp,
    });

    const whapInvitation = await requireValidWhapInvitation(body);
    const signupBody = {
      ...body,
      email: whapInvitation.email,
      username: whapInvitation.username,
    };

    await ensureSignupIsEnabled(signupBody);

    /**
     * Im not sure its worth merging these two handlers. They are different enough to be separate.
     * Calcom handles things like creating a stripe customer - which we don't need to do for self hosted.
     * It also handles things like premium username.
     * TODO: (SEAN) - Extract a lot of the logic from calcomHandler into a separate file and import it into both handlers.
     * @zomars: We need to be able to test this with E2E. They way it's done RN it will never run on CI.
     */
    if (IS_PREMIUM_USERNAME_ENABLED) {
      const response = await calcomSignupHandler(signupBody, query);
      await consumeInvitationAfterSuccessfulSignup(response, whapInvitation);

      return response;
    }

    const response = await selfHostedSignupHandler(signupBody);
    await consumeInvitationAfterSuccessfulSignup(response, whapInvitation);

    return response;
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ message: e.message }, { status: e.statusCode });
    }
    logger.error(e);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

async function consumeInvitationAfterSuccessfulSignup(response: NextResponse, invitation: WhapInvitation) {
  if (response.status < 200 || response.status >= 300) {
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: invitation.email.toLowerCase() },
    select: { id: true, metadata: true },
  });

  if (!user) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: UserPermissionRole.USER,
      name: invitation.name || undefined,
      bio: invitation.about || undefined,
      metadata: {
        ...((user.metadata && typeof user.metadata === "object" && !Array.isArray(user.metadata)
          ? user.metadata
          : {}) as Record<string, unknown>),
        whap: {
          userId: invitation.whapUserId,
          mediatorProfileId: invitation.mediatorProfileId,
        },
      },
    },
  });

  await consumeWhapCalendarInvitation({
    token: invitation.token,
    calDiyUserId: String(user.id),
    email: invitation.email,
  });
}

export const POST = defaultResponderForAppDir(handler);
