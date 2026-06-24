export type AppRoute = { name: "home" } | { name: "slide"; projectId: string };

export function readCurrentRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/slide\/([^/]+)\/?$/);
  if (match?.[1]) return { name: "slide", projectId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

export function slidePath(projectId: string) {
  return `/slide/${encodeURIComponent(projectId)}`;
}

export function pushSlideRoute(projectId: string) {
  window.history.pushState({}, "", slidePath(projectId));
  return readCurrentRoute();
}

export function pushHomeRoute() {
  window.history.pushState({}, "", "/");
  return readCurrentRoute();
}

export function routePath(route: AppRoute) {
  return route.name === "slide" ? slidePath(route.projectId) : "/";
}
