// Extends app.json for local iPhone installs made with scripts/iphone-mac.sh.
//
// IOS_BUNDLE_ID   overrides the bundle identifier (a free Apple ID needs one
//                 that no other team has registered).
// IOS_FREE_TEAM=1 removes the push-notification entitlement, which free
//                 (personal) Apple teams cannot sign. Push already needs an
//                 EAS project ID, so the app behaves the same without it.
import type { ConfigContext, ExpoConfig } from "expo/config";
import { withEntitlementsPlist, type ConfigPlugin } from "expo/config-plugins";

const withoutPushEntitlement: ConfigPlugin = (config) =>
  withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const result: ExpoConfig = {
    ...(config as ExpoConfig),
    ios: {
      ...config.ios,
      bundleIdentifier:
        process.env.IOS_BUNDLE_ID || config.ios?.bundleIdentifier,
    },
  };
  // Registered before the listed plugins; Expo runs mods in reverse order,
  // so this removal runs after expo-notifications adds the entitlement.
  return process.env.IOS_FREE_TEAM === "1"
    ? (withoutPushEntitlement(result) as ExpoConfig)
    : result;
};
