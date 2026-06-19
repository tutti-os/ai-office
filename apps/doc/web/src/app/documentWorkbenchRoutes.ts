export type AppRoute = { name: "home" } | { name: "document"; projectId: string };

export function readCurrentRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/(?:doc|d)\/([^/]+)\/?$/);
  if (match?.[1]) return { name: "document", projectId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function documentPath(projectId: string) {
  return `/doc/${encodeURIComponent(projectId)}`;
}

export function routePath(route: AppRoute) {
  return route.name === "document" ? documentPath(route.projectId) : "/";
}

export function pushDocumentRoute(projectId: string) {
  window.history.pushState({}, "", documentPath(projectId));
  return readCurrentRoute();
}

export function pushHomeRoute() {
  window.history.pushState({}, "", "/");
  return readCurrentRoute();
}
