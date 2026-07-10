import * as Network from "expo-network";

export type ConnectionFailure = "offline" | "timeout" | "dns" | "server";

export type ConnectionResult =
  | { ok: true; durationMs: number }
  | { ok: false; durationMs: number; reason: ConnectionFailure };

export async function testServerConnection(serverUrl: string, timeoutMs = 7000): Promise<ConnectionResult> {
  const startedAt = Date.now();
  const network = await Network.getNetworkStateAsync().catch(() => null);

  if (network && network.isConnected === false) {
    return { ok: false, durationMs: Date.now() - startedAt, reason: "offline" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${serverUrl}/api/mobile/sync/status`, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    return response.status < 500
      ? { ok: true, durationMs: Date.now() - startedAt }
      : { ok: false, durationMs: Date.now() - startedAt, reason: "server" };
  } catch (error) {
    const reason: ConnectionFailure = error instanceof Error && error.name === "AbortError" ? "timeout" : "dns";
    return { ok: false, durationMs: Date.now() - startedAt, reason };
  } finally {
    clearTimeout(timeout);
  }
}
