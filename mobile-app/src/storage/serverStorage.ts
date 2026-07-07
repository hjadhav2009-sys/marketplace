import * as SecureStore from "expo-secure-store";

const SERVER_URL_KEY = "marketplace.serverUrl";

export function normalizeServerUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function isValidServerUrl(value: string) {
  const normalized = normalizeServerUrl(value);
  return /^https?:\/\/[^/]+/i.test(normalized);
}

export async function getServerUrl() {
  return SecureStore.getItemAsync(SERVER_URL_KEY);
}

export async function saveServerUrl(value: string) {
  const normalized = normalizeServerUrl(value);

  if (!isValidServerUrl(normalized)) {
    throw new Error("Enter a valid http:// or https:// server URL.");
  }

  await SecureStore.setItemAsync(SERVER_URL_KEY, normalized);
  return normalized;
}

export async function clearServerUrl() {
  await SecureStore.deleteItemAsync(SERVER_URL_KEY);
}
