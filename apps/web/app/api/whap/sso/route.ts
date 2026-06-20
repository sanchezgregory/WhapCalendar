import { NextResponse, type NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";

import { defaultCookies } from "@calcom/lib/default-cookies";
import { getSafeRedirectUrl } from "@calcom/lib/getSafeRedirectUrl";
import logger from "@calcom/lib/logger";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { prisma } from "@calcom/prisma";

const LOCAL_SHARED_SECRET = "local-whap-calendar-secret";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const tokenPayloadSchema = z.object({
  whap_user_id: z.number(),
  email: z.string().email(),
  iat: z.number(),
  exp: z.number(),
  nonce: z.string().min(16),
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
  if (process.env.WHAP_CALDIY_SHARED_SECRET) return process.env.WHAP_CALDIY_SHARED_SECRET;
  if (isLocalUrl(process.env.WHAP_API_BASE_URL) || isLocalUrl(process.env.NEXT_PUBLIC_WEBAPP_URL)) {
    return LOCAL_SHARED_SECRET;
  }

  return "";
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

async function verifyToken(token: string) {
  const [payloadPart, signaturePart] = token.split(".");
  const sharedSecret = getSharedSecret();

  if (!payloadPart || !signaturePart || !sharedSecret) return null;

  const { createHmac, timingSafeEqual } = await import("node:crypto");
  const expectedSignature = createHmac("sha256", sharedSecret).update(payloadPart).digest();
  const providedSignature = base64UrlDecode(signaturePart);

  if (
    expectedSignature.length !== providedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return null;
  }

  const payload = tokenPayloadSchema.safeParse(JSON.parse(base64UrlDecode(payloadPart).toString("utf8")));
  if (!payload.success) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.data.exp < now || payload.data.iat > now + 60) return null;

  return payload.data;
}

function getRedirectUrl(callbackUrl: string | null) {
  if (!callbackUrl) return `${WEBAPP_URL}/event-types`;

  const absoluteUrl = callbackUrl.startsWith("http://") || callbackUrl.startsWith("https://")
    ? callbackUrl
    : `${WEBAPP_URL}/${callbackUrl.replace(/^\/+/, "")}`;

  return getSafeRedirectUrl(absoluteUrl) || `${WEBAPP_URL}/event-types`;
}

export async function GET(req: NextRequest) {
  const payload = await verifyToken(req.nextUrl.searchParams.get("token") || "");

  if (!payload) {
    logger.warn("Whap SSO rejected invalid token");
    return NextResponse.redirect(`${WEBAPP_URL}/auth/login`);
  }

  const user = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      role: true,
      locale: true,
      profiles: {
        select: { id: true, uid: true, username: true, organizationId: true },
        orderBy: { id: "asc" },
        take: 1,
      },
    },
  });

  if (!user) {
    logger.warn("Whap SSO user not found", {
      whapUserId: payload.whap_user_id,
      email: payload.email,
    });
    return NextResponse.redirect(`${WEBAPP_URL}/auth/login`);
  }

  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextAuthSecret) {
    logger.error("Whap SSO missing NEXTAUTH_SECRET");
    return NextResponse.json({ message: "SSO is not configured" }, { status: 500 });
  }

  const profile = user.profiles[0];
  const sessionToken = await encode({
    secret: nextAuthSecret,
    maxAge: SESSION_MAX_AGE_SECONDS,
    token: {
      sub: String(user.id),
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      locale: user.locale || "en",
      profileId: profile?.id ?? null,
      upId: profile?.uid ?? `usr-${user.id}`,
      orgAwareUsername: profile?.username ?? user.username,
      belongsToActiveTeam: false,
    },
  });

  logger.info("Whap SSO session created", {
    whapUserId: payload.whap_user_id,
    calDiyUserId: user.id,
    email: user.email,
  });

  const response = NextResponse.redirect(getRedirectUrl(req.nextUrl.searchParams.get("callbackUrl")));
  const sessionCookie = defaultCookies(WEBAPP_URL.startsWith("https://")).sessionToken;
  response.cookies.set(sessionCookie.name, sessionToken, {
    ...sessionCookie.options,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}
