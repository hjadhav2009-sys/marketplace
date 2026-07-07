import * as SecureStore from "expo-secure-store";

const COOKIE_KEY = "marketplace.sessionCookie";

export async function getSessionCookie() {
  try {
    return await SecureStore.getItemAsync(COOKIE_KEY);
  } catch {
    return null;
  }
}

export async function saveSessionCookie(cookie: string | null) {
  if (!cookie) {
    return;
  }

  try {
    await SecureStore.setItemAsync(COOKIE_KEY, cookie);
  } catch {
    // The app can still show login again if secure storage is unavailable.
  }
}

export async function clearSessionCookie() {
  try {
    await SecureStore.deleteItemAsync(COOKIE_KEY);
  } catch {
    // A reset should not crash the app if device secure storage is unavailable.
  }
}
