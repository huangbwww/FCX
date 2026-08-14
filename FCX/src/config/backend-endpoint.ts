export const DEFAULT_BACKEND_PORT = 8000;
export const MIN_BACKEND_PORT = 1024;
export const MAX_BACKEND_PORT = 65535;

export function parseBackendPort(value: unknown): number | null {
  const port = Number(value);
  return Number.isInteger(port)
    && port >= MIN_BACKEND_PORT
    && port <= MAX_BACKEND_PORT
    ? port
    : null;
}

export function normalizeBackendPort(value: unknown): number {
  return parseBackendPort(value) ?? DEFAULT_BACKEND_PORT;
}

export function portFromLegacyApiUrl(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (
      parsed.protocol !== "http:"
      || parsed.hostname !== "127.0.0.1"
      || parsed.username
      || parsed.password
    ) return null;
    return parseBackendPort(parsed.port ? Number(parsed.port) : 80);
  } catch {
    return null;
  }
}

export function localBackendUrl(value: unknown, path = ""): string {
  return `http://127.0.0.1:${normalizeBackendPort(value)}${path}`;
}
