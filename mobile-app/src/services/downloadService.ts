import * as Linking from "expo-linking";
import { isSafeUpdateUrl } from "../security/safeUrl";

export function sanitizeDownloadFilename(value: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return (cleaned || "download").slice(0, 120);
}

export async function openTrustedDownload(url: string, serverUrl: string) {
  if (!isSafeUpdateUrl(url, serverUrl)) {
    throw new Error("This download host is not trusted.");
  }

  await Linking.openURL(url);
}
