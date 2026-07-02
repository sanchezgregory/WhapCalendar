type VerifyInvitationResponse = {
  valid: boolean;
  email?: string;
  name?: string | null;
  about?: string | null;
  username?: string | null;
  whap_user_id?: number;
  mediator_profile_id?: number;
  expires_at?: string;
};

type ConsumeInvitationParams = {
  token: string;
  whapCalendarUserId: string;
  email: string;
};

const LOCAL_SHARED_SECRET = "local-whap-calendar-secret";

function getWhapApiBaseUrl() {
  return (process.env.WHAP_API_BASE_URL || "http://host.docker.internal:8001/api").replace(/\/$/, "");
}

function isLocalUrl(url: string | undefined) {
  if (!url) {
    return false;
  }

  try {
    const { hostname } = new URL(url);

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "host.docker.internal";
  } catch {
    return false;
  }
}

function getSharedSecret() {
  const configuredSecret = process.env.WHAPCALENDAR_WEBHOOK_SECRET?.trim() ?? "";
  if (configuredSecret) {
    return configuredSecret;
  }

  if (isLocalUrl(process.env.WHAP_API_BASE_URL) || isLocalUrl(process.env.NEXT_PUBLIC_WEBAPP_URL)) {
    return LOCAL_SHARED_SECRET;
  }

  return "";
}

async function requestWhap(path: string, body: Record<string, unknown>) {
  const secret = getSharedSecret();

  if (!secret) {
    throw new Error("WHAPCALENDAR_WEBHOOK_SECRET is not configured");
  }

  return fetch(`${getWhapApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Whap-Calendar-Secret": secret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
}

export async function verifyWhapCalendarInvitation(token: string): Promise<VerifyInvitationResponse> {
  const response = await requestWhap("/calendar-invitations/verify", { token });

  if (!response.ok) {
    return { valid: false };
  }

  return (await response.json()) as VerifyInvitationResponse;
}

export async function consumeWhapCalendarInvitation({ token, whapCalendarUserId, email }: ConsumeInvitationParams) {
  const response = await requestWhap("/calendar-invitations/consume", {
    token,
    whapcalendar_user_id: whapCalendarUserId,
    email,
  });

  if (!response.ok) {
    throw new Error("Unable to consume Whap Calendar invitation");
  }
}
