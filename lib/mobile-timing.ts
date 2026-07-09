export function startMobileTiming(route: string) {
  const startedAt = Date.now();

  return (meta: Record<string, number | string | null | undefined> = {}) => {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    console.info("[mobile-api]", {
      route,
      durationMs: Date.now() - startedAt,
      ...meta
    });
  };
}
