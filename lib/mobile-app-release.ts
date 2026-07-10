function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeDownloadUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getMobileAppReleaseMetadata() {
  const latestVersionCode = positiveInteger(process.env.MOBILE_APP_LATEST_VERSION_CODE, 1);
  const minimumSupportedVersionCode = positiveInteger(process.env.MOBILE_APP_MIN_VERSION_CODE, 1);
  const downloadUrl = safeDownloadUrl(process.env.MOBILE_APP_UPDATE_URL);
  const releaseNotes = (process.env.MOBILE_APP_RELEASE_NOTES ?? "")
    .split("|")
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, 10);

  return {
    platform: "android" as const,
    available: Boolean(downloadUrl && latestVersionCode > 1),
    latestVersionName: (process.env.MOBILE_APP_LATEST_VERSION_NAME ?? "0.1.0").slice(0, 30),
    latestVersionCode,
    minimumSupportedVersionCode,
    mandatory: process.env.MOBILE_APP_UPDATE_REQUIRED === "true",
    downloadUrl,
    sha256: /^[a-f0-9]{64}$/i.test(process.env.MOBILE_APP_UPDATE_SHA256 ?? "") ? process.env.MOBILE_APP_UPDATE_SHA256 : null,
    releaseNotes,
    publishedAt: process.env.MOBILE_APP_PUBLISHED_AT && !Number.isNaN(Date.parse(process.env.MOBILE_APP_PUBLISHED_AT))
      ? new Date(process.env.MOBILE_APP_PUBLISHED_AT).toISOString()
      : null
  };
}
