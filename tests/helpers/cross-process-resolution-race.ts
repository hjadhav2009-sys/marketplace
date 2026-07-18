import { spawn } from "node:child_process";
import { resolve } from "node:path";

export type ResolutionRaceKind = "ORDER" | "CONSIGNMENT";
export type ResolutionChildResponse<TResult> = { ok: true; result: TResult } | { ok: false; error: string };

function startResolutionChild<TResult>(kind: ResolutionRaceKind) {
  const child = spawn(process.execPath, ["--import", "tsx", resolve("tests/helpers/missing-listing-resolution-child.ts")], {
    cwd: process.cwd(),
    env: { ...process.env, RESOLUTION_RACE_KIND: kind },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let readySettled = false;
  let completeSettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  let resolveComplete!: (result: ResolutionChildResponse<TResult>) => void;
  let rejectComplete!: (error: Error) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const completed = new Promise<ResolutionChildResponse<TResult>>((resolvePromise, rejectPromise) => {
    resolveComplete = resolvePromise;
    rejectComplete = rejectPromise;
  });
  const fail = (error: Error) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    if (!completeSettled) {
      completeSettled = true;
      rejectComplete(error);
    }
  };
  const timeout = setTimeout(() => {
    child.kill();
    fail(new Error(`Cross-process ${kind} resolution child timed out. stderr=${stderr.slice(-2_000)}`));
  }, 30_000);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    if (!readySettled && stdout.split(/\r?\n/).includes("READY")) {
      readySettled = true;
      resolveReady();
    }
  });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", (error) => fail(error));
  child.on("close", (code) => {
    clearTimeout(timeout);
    if (completeSettled) return;
    if (code !== 0) {
      fail(new Error(`Cross-process ${kind} resolution child exited ${code}. stderr=${stderr.slice(-2_000)}`));
      return;
    }
    const resultLine = stdout.split(/\r?\n/).find((line) => line.startsWith("RESULT "));
    if (!resultLine) {
      fail(new Error(`Cross-process ${kind} resolution child returned no structured result. stdout=${stdout.slice(-2_000)} stderr=${stderr.slice(-2_000)}`));
      return;
    }
    try {
      const parsed = JSON.parse(resultLine.slice("RESULT ".length)) as ResolutionChildResponse<TResult>;
      completeSettled = true;
      resolveComplete(parsed);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
  return {
    ready,
    completed,
    submit(input: unknown) { child.stdin.end(JSON.stringify(input)); }
  };
}

export async function runCrossProcessResolutionRace<TResult>(kind: ResolutionRaceKind, input: unknown) {
  const first = startResolutionChild<TResult>(kind);
  const second = startResolutionChild<TResult>(kind);
  await Promise.all([first.ready, second.ready]);
  first.submit(input);
  second.submit(input);
  return Promise.all([first.completed, second.completed]);
}
