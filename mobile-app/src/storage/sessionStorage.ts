import * as SecureStore from "expo-secure-store";

const COOKIE_KEY = "marketplace.sessionCookie";

export async function getSessionCookie() {
  return SecureStore.getItemAsync(COOKIE_KEY);
}

export async function saveSessionCookie(cookie: string | null) {
  if (!cookie) {
    return;
  }

  await SecureStore.setItemAsync(COOKIE_KEY, cookie);
}

export async function clearSessionCookie() {
  await SecureStore.deleteItemAsync(COOKIE_KEY);
}
