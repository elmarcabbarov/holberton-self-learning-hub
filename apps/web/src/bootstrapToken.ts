/**
 * Captures the one-time token from `/auth#t=…` before the router starts, and removes it from
 * the address bar immediately (D-044). The token is kept only in memory and handed out once.
 */
let pending: string | null = null;

export function captureBootstrapToken(): void {
  if (window.location.pathname !== "/auth" || !window.location.hash) return;
  pending = new URLSearchParams(window.location.hash.slice(1)).get("t");
  window.history.replaceState(null, "", "/auth");
}

export function takeBootstrapToken(): string | null {
  const token = pending;
  pending = null;
  return token;
}
