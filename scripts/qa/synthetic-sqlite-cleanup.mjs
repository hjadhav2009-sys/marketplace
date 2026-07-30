import { DatabaseSync } from "node:sqlite";

const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isSqliteContention(error) {
  return error?.code === "SQLITE_BUSY"
    || error?.code === "SQLITE_LOCKED"
    || error?.errcode === SQLITE_BUSY
    || error?.errcode === SQLITE_LOCKED
    || /\bSQLITE_(?:BUSY|LOCKED)\b|database (?:is locked|table is locked|is busy)/i.test(String(error?.message ?? ""));
}

export async function clearSyntheticSecurityThrottle({
  databasePath,
  scope,
  busyTimeoutMs = 75,
  retryDelayMs = 25,
  maximumElapsedMs = 2_000,
  onRetry = () => {},
} = {}) {
  if (!databasePath || !scope) throw new Error("Synthetic throttle cleanup requires a database path and scope.");
  const boundedBusyTimeout = Math.max(1, Math.min(500, Math.trunc(busyTimeoutMs)));
  const boundedRetryDelay = Math.max(1, Math.min(250, Math.trunc(retryDelayMs)));
  const boundedMaximumElapsed = Math.max(100, Math.min(5_000, Math.trunc(maximumElapsedMs)));
  const startedAt = Date.now();
  let attempts = 0;

  while (true) {
    attempts += 1;
    let database;
    let contentionError;
    try {
      database = new DatabaseSync(databasePath);
      database.exec(`PRAGMA busy_timeout = ${boundedBusyTimeout}`);
      const result = database.prepare("DELETE FROM SecurityThrottle WHERE scope = ?").run(scope);
      return {
        attempts,
        changes: Number(result.changes),
        elapsedMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (!isSqliteContention(error)) throw error;
      contentionError = error;
    } finally {
      database?.close();
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= boundedMaximumElapsed) {
      throw new Error(
        `Synthetic throttle cleanup remained locked for ${elapsedMs} ms after ${attempts} attempts.`,
        { cause: contentionError },
      );
    }
    onRetry({ attempts, elapsedMs });
    await delay(Math.min(boundedRetryDelay * attempts, 150));
  }
}
