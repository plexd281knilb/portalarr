"use client";

const STALE_RELOAD_STORAGE_KEY = "portalarr_stale_reload_ts";
const STALE_RELOAD_COOLDOWN_MS = 15000;

/**
 * Detects Next.js deployment skew errors caused when a client tab stays open
 * across a Docker container update / rebuild (Server Action ID mismatch or
 * missing hashed JS chunks).
 */
export function isStaleDeploymentError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as { message?: unknown; name?: unknown; digest?: unknown; stack?: unknown };
  const parts = [
    typeof err === "string" ? err : "",
    anyErr?.name ? String(anyErr.name) : "",
    anyErr?.message ? String(anyErr.message) : "",
    anyErr?.digest ? String(anyErr.digest) : "",
  ];
  const msg = parts.join(" ").toLowerCase();
  if (!msg.trim()) return false;

  if (
    msg.includes("was not found on the server") ||
    msg.includes("failed to find server action") ||
    msg.includes("older or newer deployment") ||
    msg.includes("chunkloaderror") ||
    msg.includes("failed to fetch dynamically imported module")
  ) {
    return true;
  }

  if (msg.includes("loading chunk") && msg.includes("failed")) {
    return true;
  }

  return false;
}

/**
 * Safely triggers a single hard browser reload when stale deployment artifacts
 * are detected, protected by a 15-second sessionStorage cooldown to avoid loops.
 */
export function triggerDeploymentRecoveryReload(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = Date.now();
    const lastReloadRaw = window.sessionStorage.getItem(STALE_RELOAD_STORAGE_KEY);
    const lastReload = lastReloadRaw ? Number(lastReloadRaw) : 0;
    if (Number.isFinite(lastReload) && lastReload > 0 && now - lastReload < STALE_RELOAD_COOLDOWN_MS) {
      return false;
    }
    window.sessionStorage.setItem(STALE_RELOAD_STORAGE_KEY, String(now));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/**
 * Wraps an async promise (such as a Server Action call) with an explicit timeout
 * so UI loading states never spin indefinitely on stalled connections.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 12000,
  label: string = "Request"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

/**
 * Performs a no-store fetch with an AbortController timeout so client loaders
 * bypass Next.js's sequential Server Action queue and fail loudly if needed.
 */
export async function fetchJsonWithTimeout<T = any>(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = 12000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...init,
      signal: controller.signal,
    });
    const text = await res.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }
    if (!res.ok) {
      const serverMsg = payload?.error || payload?.message || `HTTP ${res.status}`;
      throw new Error(serverMsg);
    }
    return payload as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Request to ${url} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
