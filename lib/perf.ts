export async function withDevTiming<T>(label: string, work: () => Promise<T>, thresholdMs = 1000): Promise<T> {
  const startedAt = Date.now();

  try {
    return await work();
  } finally {
    const duration = Date.now() - startedAt;

    if (process.env.NODE_ENV !== "production" && duration > thresholdMs) {
      console.warn(`[perf] ${label} took ${duration}ms`);
    }
  }
}
