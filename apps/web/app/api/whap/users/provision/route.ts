import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { z } from "zod";

import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { CreationSource, IdentityProvider, UserPermissionRole, WebhookTriggerEvents } from "@calcom/prisma/enums";

const LOCAL_SHARED_SECRET = "local-whap-calendar-secret";
const WHAP_WEBHOOK_TRIGGERS = [
  WebhookTriggerEvents.BOOKING_CREATED,
  WebhookTriggerEvents.BOOKING_RESCHEDULED,
  WebhookTriggerEvents.BOOKING_CANCELLED,
];

const provisionSchema = z.object({
  whap_user_id: z.number(),
  mediator_profile_id: z.number(),
  name: z.string().min(1),
  email: z.string().email(),
  username: z.string().regex(/^[a-z]{1,12}$/),
  about: z.string().min(1),
});

function isLocalUrl(url: string | undefined) {
  if (!url) return false;

  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal";
  } catch {
    return false;
  }
}

function getSharedSecret() {
  const configuredSecret = process.env.WHAPCALENDAR_WEBHOOK_SECRET?.trim() ?? "";
  if (configuredSecret) return configuredSecret;
  if (isLocalUrl(process.env.WHAP_API_BASE_URL) || isLocalUrl(process.env.NEXT_PUBLIC_WEBAPP_URL)) {
    return LOCAL_SHARED_SECRET;
  }

  return "";
}

function getWhapWebhookUrl() {
  return `${(process.env.WHAP_API_BASE_URL || "http://host.docker.internal:8001/api").replace(/\/$/, "")}/webhooks/whapcalendar`;
}

function hasValidSecret(req: NextRequest) {
  const configuredSecret = getSharedSecret();
  const providedSecret = (req.headers.get("X-Whap-Calendar-Secret") || "").trim();

  return configuredSecret !== "" && configuredSecret === providedSecret;
}

async function ensureWhapBookingWebhook(userId: number, payload: z.infer<typeof provisionSchema>) {
  const subscriberUrl = getWhapWebhookUrl();
  const secret = getSharedSecret();

  if (!secret) {
    logger.warn("Whap user provision skipped webhook setup: missing shared secret", {
      whapUserId: payload.whap_user_id,
      mediatorProfileId: payload.mediator_profile_id,
      userId,
      subscriberUrl,
    });

    return;
  }

  await prisma.webhook.upsert({
    where: {
      courseIdentifier: {
        userId,
        subscriberUrl,
      },
    },
    create: {
      id: uuid(),
      userId,
      subscriberUrl,
      secret,
      active: true,
      eventTriggers: WHAP_WEBHOOK_TRIGGERS,
    },
    update: {
      secret,
      active: true,
      eventTriggers: WHAP_WEBHOOK_TRIGGERS,
    },
  });

  logger.info("Whap booking webhook ensured", {
    whapUserId: payload.whap_user_id,
    mediatorProfileId: payload.mediator_profile_id,
    userId,
    subscriberUrl,
  });
}

export async function POST(req: NextRequest) {
  if (!hasValidSecret(req)) {
    logger.warn("Whap user provision unauthorized request");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const payload = provisionSchema.parse(body);
  const email = payload.email.toLowerCase();
  const username = payload.username.toLowerCase();

  logger.info("Whap user provision request", {
    whapUserId: payload.whap_user_id,
    mediatorProfileId: payload.mediator_profile_id,
    email,
    username,
    payload,
  });

  const existingUsernameOwner = await prisma.user.findFirst({
    where: {
      username,
      email: {
        not: email,
      },
    },
    select: { id: true, email: true },
  });

  if (existingUsernameOwner) {
    logger.warn("Whap user provision username conflict", {
      whapUserId: payload.whap_user_id,
      mediatorProfileId: payload.mediator_profile_id,
      username,
      existingUserId: existingUsernameOwner.id,
      existingUserEmail: existingUsernameOwner.email,
    });

    return NextResponse.json({ message: "Username already exists" }, { status: 409 });
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, metadata: true },
  });

  const metadata = {
    ...((existingUser?.metadata && typeof existingUser.metadata === "object" && !Array.isArray(existingUser.metadata)
      ? existingUser.metadata
      : {}) as Record<string, unknown>),
    whap: {
      userId: payload.whap_user_id,
      mediatorProfileId: payload.mediator_profile_id,
    },
  };

  const user = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: payload.name,
          username,
          bio: payload.about,
          role: UserPermissionRole.USER,
          locale: "es",
          emailVerified: new Date(),
          completedOnboarding: true,
          identityProvider: IdentityProvider.CAL,
          metadata,
        },
        select: { id: true, email: true, username: true, role: true },
      })
    : await prisma.user.create({
        data: {
          name: payload.name,
          email,
          username,
          bio: payload.about,
          role: UserPermissionRole.USER,
          locale: "es",
          emailVerified: new Date(),
          completedOnboarding: true,
          identityProvider: IdentityProvider.CAL,
          creationSource: CreationSource.WEBAPP,
          metadata,
        },
        select: { id: true, email: true, username: true, role: true },
      });

  await ensureWhapBookingWebhook(user.id, payload);

  const responseBody = {
    ok: true,
    whapcalendar_user_id: String(user.id),
    email: user.email,
    username: user.username,
    role: user.role,
  };

  logger.info("Whap user provision response", {
    whapUserId: payload.whap_user_id,
    mediatorProfileId: payload.mediator_profile_id,
    response: responseBody,
  });

  return NextResponse.json(responseBody);
}
