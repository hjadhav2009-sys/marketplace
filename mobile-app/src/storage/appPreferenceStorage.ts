import * as SecureStore from "expo-secure-store";

const DISMISSED_UPDATE_KEY = "marketplace.dismissedUpdate";

export async function getDismissedUpdateVersion() {
  try {
    return await SecureStore.getItemAsync(DISMISSED_UPDATE_KEY);
  } catch {
    return null;
  }
}

export async function setDismissedUpdateVersion(version: string) {
  await SecureStore.setItemAsync(DISMISSED_UPDATE_KEY, version);
}

export async function clearAppPreferences() {
  await SecureStore.deleteItemAsync(DISMISSED_UPDATE_KEY).catch(() => undefined);
}
