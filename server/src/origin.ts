/**
 * Origin/host matching shared by the HTTP and Socket.IO layers.
 *
 * A browser always sends an `Origin` header for cross-origin (and WebSocket)
 * requests, so comparing it to the `Host` we were addressed on blocks other
 * sites from opening authenticated sockets with a victim's cookies. Requests
 * without an `Origin` (native clients, health checks) stay allowed.
 */

function normalizeHost(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  // Accept either a bare host (`hive.local:8085`) or an absolute URL.
  try {
    return new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`).host || null;
  } catch {
    return null;
  }
}

export function isSameOrigin(
  origin: string | undefined,
  ...allowedHosts: Array<string | undefined>
): boolean {
  if (!origin) return true;
  const originHost = normalizeHost(origin);
  if (!originHost) return false;
  for (const candidate of allowedHosts) {
    if (normalizeHost(candidate) === originHost) return true;
  }
  return false;
}
