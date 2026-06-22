import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import logger from "@calcom/lib/logger";

const LOCAL_SHARED_SECRET = "local-whap-calendar-secret";

const cancelBookingSchema = z.object({
  cancellationReason: z.string().optional(),
  cancelledBy: z.string().email().optional(),
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

function hasValidSecret(req: NextRequest) {
  const configuredSecret = getSharedSecret();
  const providedSecret = req.headers.get("X-Whap-Calendar-Secret") || "";

  return configuredSecret !== "" && configuredSecret === providedSecret;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  if (!hasValidSecret(req)) {
    logger.warn("Whap booking cancellation unauthorized request");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { uid } = await params;
  const payload = cancelBookingSchema.parse(await req.json());

  try {
    const result = await handleCancelBooking({
      bookingData: {
        uid,
        cancellationReason: payload.cancellationReason,
        cancelledBy: payload.cancelledBy,
        skipCancellationReasonValidation: true,
      },
      actionSource: "WHAP_ADMIN",
    });

    logger.info("Whap booking cancellation processed", {
      bookingUid: uid,
      success: result.success,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cancellation error";

    if (message === "This booking has already been cancelled.") {
      logger.info("Whap booking cancellation already processed", {
        bookingUid: uid,
      });

      return NextResponse.json({ success: true, alreadyCancelled: true });
    }

    logger.error("Whap booking cancellation failed", {
      bookingUid: uid,
      message,
    });

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
