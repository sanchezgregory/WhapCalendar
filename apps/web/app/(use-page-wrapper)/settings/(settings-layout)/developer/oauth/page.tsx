import { _generateMetadata } from "app/_utils";

import OAuthClientsView from "~/settings/developer/oauth-clients-view";
import { verifyDeveloperSettingsAccess } from "../verifyDeveloperSettingsAccess";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("oauth_clients"),
    (t) => t("oauth_clients_description"),
    undefined,
    undefined,
    "/settings/developer/oauth"
  );

const Page = async () => {
  await verifyDeveloperSettingsAccess("/settings/developer/oauth");

  return <OAuthClientsView />;
};

export default Page;
