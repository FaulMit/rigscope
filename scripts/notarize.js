"use strict";

exports.default = async function notarizeMac(context) {
  if (process.platform !== "darwin") return;
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log("Skipping macOS notarization: Apple credentials are not configured.");
    return;
  }
  const { notarize } = require("@electron/notarize");
  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
};
