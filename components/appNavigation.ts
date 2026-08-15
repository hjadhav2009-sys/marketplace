export type NavigationSection =
  | "OVERVIEW"
  | "WORK"
  | "CATALOG"
  | "IMPORTS"
  | "PEOPLE"
  | "INSIGHTS & SYSTEM"
  | "MANAGE"
  | "PROFILE";

export type NavigationIcon =
  | "overview"
  | "work"
  | "pick"
  | "mark"
  | "assemble"
  | "pack"
  | "scan"
  | "problem"
  | "catalog"
  | "import"
  | "people"
  | "insights"
  | "system"
  | "password";

export type AppNavLink = {
  id: string;
  href: string;
  label: string;
  section: NavigationSection;
  icon: NavigationIcon;
  ownedPaths?: readonly string[];
};

export function normalizeNavigationPath(value: string) {
  let pathname: string;
  try {
    pathname = new URL(value, "https://navigation.local").pathname;
  } catch {
    pathname = value.split(/[?#]/, 1)[0] ?? "/";
  }

  const normalized = `/${pathname}`.replace(/\/{2,}/g, "/");
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized;
}

function isPathBoundaryMatch(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

export function resolveCurrentNavigationId(pathname: string, links: readonly AppNavLink[]) {
  const currentPath = normalizeNavigationPath(pathname);
  const candidates = links.flatMap((link, linkIndex) =>
    [link.href, ...(link.ownedPaths ?? [])].map((ownedPath) => ({
      id: link.id,
      linkIndex,
      path: normalizeNavigationPath(ownedPath),
    }))
  );

  const exact = candidates.find((candidate) => candidate.path === currentPath);
  if (exact) return exact.id;

  const prefixes = candidates
    .filter((candidate) => isPathBoundaryMatch(currentPath, candidate.path))
    .sort((left, right) => right.path.length - left.path.length || left.linkIndex - right.linkIndex);

  return prefixes[0]?.id ?? null;
}
