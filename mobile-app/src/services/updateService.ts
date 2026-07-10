import * as Application from "expo-application";
import { isSafeUpdateUrl } from "../security/safeUrl";

export type AppUpdateMetadata = {
  platform: "android";
  available: boolean;
  latestVersionName: string;
  latestVersionCode: number;
  minimumSupportedVersionCode: number;
  mandatory: boolean;
  downloadUrl: string | null;
  sha256: string | null;
  releaseNotes: string[];
  publishedAt: string | null;
};

export function getCurrentVersion() {
  const versionName = Application.nativeApplicationVersion ?? "0.1.0";
  const versionCode = Number(Application.nativeBuildVersion ?? 1);
  return { versionName, versionCode: Number.isFinite(versionCode) ? versionCode : 1 };
}

export function isMandatoryUpdate(metadata: AppUpdateMetadata) {
  return getCurrentVersion().versionCode < metadata.minimumSupportedVersionCode || metadata.mandatory;
}

export async function checkForAppUpdate(serverUrl: string, timeoutMs = 6000): Promise<AppUpdateMetadata | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${serverUrl}/api/mobile/app-update`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      return null;
    }

    const metadata = (await response.json()) as AppUpdateMetadata;

    if (metadata.downloadUrl && !isSafeUpdateUrl(metadata.downloadUrl, serverUrl)) {
      return { ...metadata, downloadUrl: null };
    }

    return metadata;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
