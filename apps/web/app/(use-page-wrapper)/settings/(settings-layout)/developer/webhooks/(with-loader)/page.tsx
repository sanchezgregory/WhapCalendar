import { createRouterCaller } from "app/_trpc/context";
import { _generateMetadata } from "app/_utils";

import { APP_NAME } from "@calcom/lib/constants";
import { webhookRouter } from "@calcom/trpc/server/routers/viewer/webhook/_router";

import WebhooksView from "~/webhooks/views/webhooks-view";
import { verifyDeveloperSettingsAccess } from "../../verifyDeveloperSettingsAccess";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("webhooks"),
    (t) => t("add_webhook_description", { appName: APP_NAME }),
    undefined,
    undefined,
    "/settings/developer/webhooks"
  );

const WebhooksViewServerWrapper = async () => {
  await verifyDeveloperSettingsAccess("/settings/developer/webhooks");

  const caller = await createRouterCaller(webhookRouter);
  const data = await caller.getByViewer();

  return <WebhooksView data={data} />;
};

export default WebhooksViewServerWrapper;
