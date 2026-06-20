import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import hasKeyInMetadata from "@calcom/lib/hasKeyInMetadata";
import prisma from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

export async function verifyDeveloperSettingsAccess(callbackUrl: string) {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${callbackUrl}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { metadata: true },
  });

  if (hasKeyInMetadata(user, "whap")) {
    redirect("/settings/my-account/profile");
  }

  return session;
}
