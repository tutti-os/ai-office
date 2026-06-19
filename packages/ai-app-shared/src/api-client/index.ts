export async function requestJson<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok) {
    const message = isErrorResponse(data) ? data.error : `Request failed: ${response.status}`;
    throw new Error(message);
  }
  if (!data) throw new Error("Response is empty");
  return data as T;
}

export async function requestArrayBuffer(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `Request failed: ${response.status}`);
  }
  return response.arrayBuffer();
}

export function isErrorResponse(value: unknown): value is { error: string } {
  return Boolean(value && typeof value === "object" && "error" in value && typeof (value as { error?: unknown }).error === "string");
}
