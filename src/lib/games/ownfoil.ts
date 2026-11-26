import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export interface OwnfoilConnection {
  id: string;
  name: string;
  baseUrl: string;
  externalUrl: string | null;
  credentials: string; // Optional "username:password" or token stored encrypted in MediaApp.apiKey
}

export function cleanServiceBaseUrl(rawUrl: string): string {
  let clean = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
    clean = `http://${clean}`;
  }
  return clean.replace(/\/api(\/v?[123])?$/, "");
}

export async function getOwnfoilInstance(): Promise<OwnfoilConnection | null> {
  const app = await prisma.mediaApp.findFirst({
    where: {
      OR: [{ type: "ownfoil" }, { name: { contains: "ownfoil" } }],
    },
  });
  if (!app) return null;
  return {
    id: app.id,
    name: app.name,
    baseUrl: cleanServiceBaseUrl(app.url),
    externalUrl: app.externalUrl || null,
    credentials: app.apiKey ? decryptData(app.apiKey) : "",
  };
}

function buildOwnfoilAuthHeaders(credentials: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
  };
  const cred = (credentials || "").trim();
  if (cred.includes(":")) {
    headers["Authorization"] = `Basic ${Buffer.from(cred).toString("base64")}`;
  } else if (cred) {
    headers["X-Api-Key"] = cred;
    headers["Authorization"] = `Bearer ${cred}`;
  }
  return headers;
}

/**
 * Ownfoil v2 uses Flask-Login session cookies when authentication is enabled,
 * or open access when authentication is disabled. Attempt session login first
 * if username:password credentials are saved, falling back cleanly to Basic/open headers.
 */
async function resolveOwnfoilSessionCookie(baseUrl: string, credentials: string): Promise<string> {
  const cred = (credentials || "").trim();
  if (!cred.includes(":")) return "";
  const sepIdx = cred.indexOf(":");
  const username = cred.slice(0, sepIdx);
  const password = cred.slice(sepIdx + 1);

  const loginEndpoints: Array<{ url: string; headers: Record<string, string>; body: string }> = [
    {
      url: `${baseUrl}/api/auth/login`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ user: username, username, password }),
    },
    {
      url: `${baseUrl}/api/login`,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ user: username, username, password }),
    },
    {
      url: `${baseUrl}/login`,
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json, text/html" },
      body: new URLSearchParams({ user: username, username, password }).toString(),
    },
  ];

  for (const candidate of loginEndpoints) {
    try {
      const res = await fetch(candidate.url, {
        method: "POST",
        headers: candidate.headers,
        body: candidate.body,
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      const setCookie = res.headers.get("set-cookie");
      if (setCookie && (res.ok || res.status === 302 || res.status === 303)) {
        const cookiePairs = setCookie
          .split(/,(?=\s*[^;,\s]+=[^;]+)/)
          .map((c) => c.split(";")[0].trim())
          .filter(Boolean);
        if (cookiePairs.length > 0) {
          return cookiePairs.join("; ");
        }
      }
    } catch {
      // Ignore unreachable candidate endpoint and try next
    }
  }

  return "";
}

export async function testOwnfoilConnection(
  rawUrl: string,
  credentials: string = ""
): Promise<{ success: boolean; message?: string; error?: string; titleCount?: number }> {
  const baseUrl = cleanServiceBaseUrl(rawUrl);
  if (!baseUrl) {
    return { success: false, error: "Ownfoil URL is required." };
  }

  const sessionCookie = await resolveOwnfoilSessionCookie(baseUrl, credentials);
  const authHeaders: Record<string, string> = {
    ...buildOwnfoilAuthHeaders(credentials),
    ...(sessionCookie ? { Cookie: sessionCookie } : {}),
  };

  // Probe GraphQL first (Ownfoil v2+) and REST/root fallbacks
  try {
    const gqlRes = await fetch(`${baseUrl}/api/graphql`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (gqlRes.ok) {
      return { success: true, message: "Connected to Ownfoil GraphQL API." };
    }
    if (gqlRes.status === 401 || gqlRes.status === 403) {
      return {
        success: false,
        error: "Ownfoil authentication required. Enter username:password in the API Key / Credentials field.",
      };
    }
  } catch {
    // Fall through to HTTP probes
  }

  for (const path of ["/api/settings", "/api/titles", "/"]) {
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        headers: authHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403 || (res.status === 302 && (res.headers.get("location") || "").includes("login"))) {
        return {
          success: false,
          error: "Ownfoil authentication required. Enter username:password in the API Key / Credentials field.",
        };
      }
      if (res.ok || res.status === 302) {
        return { success: true, message: `Connected to Ownfoil (${path}).` };
      }
    } catch {
      // Try next path
    }
  }

  return { success: false, error: `Could not reach Ownfoil at ${baseUrl}.` };
}

export async function triggerOwnfoilLibraryScan(
  overrideConnection?: OwnfoilConnection | null
): Promise<{ success: boolean; message: string; alreadyRunning?: boolean }> {
  const conn = overrideConnection ?? (await getOwnfoilInstance());
  if (!conn) {
    return {
      success: false,
      message: "Ownfoil is not configured yet. Add Ownfoil under Settings -> Integrations -> Media Stack & Apps.",
    };
  }

  try {
    const sessionCookie = await resolveOwnfoilSessionCookie(conn.baseUrl, conn.credentials);
    const headers: Record<string, string> = {
      ...buildOwnfoilAuthHeaders(conn.credentials),
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    };

    const res = await fetch(`${conn.baseUrl}/api/library/scan`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      const msg = "Ownfoil rejected scan request (authentication failed). Check username:password credentials in Settings.";
      logger.addLog("ERROR", "APPS", `[Ownfoil] ${msg}`);
      return { success: false, message: msg };
    }

    if (res.ok) {
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {}
      const alreadyRunning = Boolean(
        parsed?.already_running ||
          String(parsed?.message || text).toLowerCase().includes("already") ||
          String(parsed?.status || "").toLowerCase().includes("running")
      );
      const msg = alreadyRunning
        ? "Ownfoil library scan is already in progress."
        : "Triggered Ownfoil library scan successfully.";
      logger.addLog("SUCCESS", "APPS", `[Ownfoil] ${msg}`, `Target: ${conn.baseUrl}`);
      return { success: true, message: msg, alreadyRunning };
    }

    const errMsg = `Ownfoil scan returned HTTP ${res.status}: ${text.slice(0, 120) || res.statusText}`;
    logger.addLog("WARN", "APPS", `[Ownfoil] ${errMsg}`);
    return { success: false, message: errMsg };
  } catch (err: any) {
    const errMsg = err?.name === "AbortError" ? "Ownfoil scan request timed out after 12s." : err?.message || "Failed to contact Ownfoil.";
    logger.addLog("ERROR", "APPS", `[Ownfoil] ${errMsg}`);
    return { success: false, message: errMsg };
  }
}

export async function fetchOwnfoilOwnedTitles(): Promise<{
  connected: boolean;
  ownedTitlesNormalized: string[];
}> {
  const probe = await probeOwnfoilLive();
  return {
    connected: probe.online,
    ownedTitlesNormalized: probe.ownedTitlesNormalized,
  };
}

export interface OwnfoilLiveProbe {
  configured: boolean;
  online: boolean;
  name: string | null;
  url: string | null;
  libraryPaths: string[];
  ownedTitlesNormalized: string[];
  error?: string;
}

export async function probeOwnfoilLive(): Promise<OwnfoilLiveProbe> {
  const conn = await getOwnfoilInstance();
  if (!conn) {
    return {
      configured: false,
      online: false,
      name: null,
      url: null,
      libraryPaths: [],
      ownedTitlesNormalized: [],
    };
  }

  try {
    const sessionCookie = await resolveOwnfoilSessionCookie(conn.baseUrl, conn.credentials);
    const headers: Record<string, string> = {
      ...buildOwnfoilAuthHeaders(conn.credentials),
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    };

    let online = false;
    let authError = "";
    const libraryPaths: string[] = [];
    let ownedTitlesNormalized: string[] = [];

    // 1. Check GraphQL (v2) for reachability + titles
    try {
      const gqlRes = await fetch(`${conn.baseUrl}/api/graphql`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ titles { name } }" }),
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (gqlRes.status === 401 || gqlRes.status === 403) {
        authError = "Ownfoil authentication failed (check username:password in Settings).";
      } else if (gqlRes.ok) {
        online = true;
        const json = await gqlRes.json().catch(() => null);
        const rows = json?.data?.titles;
        if (Array.isArray(rows)) {
          ownedTitlesNormalized = rows
            .map((r: any) => String(r?.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
            .filter(Boolean);
        }
      }
    } catch {
      // Try REST endpoints below
    }

    // 2. Fetch configured library paths from /api/library/paths or /api/settings
    for (const ep of ["/api/library/paths", "/api/settings"]) {
      try {
        const res = await fetch(`${conn.baseUrl}${ep}`, {
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(5000),
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403 || (res.status === 302 && (res.headers.get("location") || "").includes("login"))) {
          if (!online) authError = "Ownfoil login required — enter username:password in Settings.";
          continue;
        }
        if (res.ok) {
          online = true;
          const json = await res.json().catch(() => null);
          const candidatePaths =
            Array.isArray(json)
              ? json.map((x: any) => (typeof x === "string" ? x : x?.path || "")).filter(Boolean)
              : Array.isArray(json?.paths)
                ? json.paths.map((x: any) => (typeof x === "string" ? x : x?.path || "")).filter(Boolean)
                : Array.isArray(json?.library?.paths)
                  ? json.library.paths.map((x: any) => (typeof x === "string" ? x : x?.path || "")).filter(Boolean)
                  : [];
          for (const p of candidatePaths) {
            if (p && !libraryPaths.includes(p)) libraryPaths.push(String(p));
          }
          if (libraryPaths.length > 0) break;
        }
      } catch {
        // Ignore single endpoint miss
      }
    }

    // 3. Fallback legacy /api/titles or / reachability check if GraphQL failed
    if (!online && !authError) {
      for (const ep of ["/api/titles", "/"]) {
        try {
          const res = await fetch(`${conn.baseUrl}${ep}`, {
            headers,
            redirect: "manual",
            signal: AbortSignal.timeout(5000),
            cache: "no-store",
          });
          if (res.status === 401 || res.status === 403) {
            authError = "Ownfoil authentication required.";
            break;
          }
          if (res.ok || res.status === 302) {
            online = true;
            if (ep === "/api/titles") {
              const json = await res.json().catch(() => null);
              const list = Array.isArray(json) ? json : Array.isArray(json?.titles) ? json.titles : [];
              ownedTitlesNormalized = list
                .map((r: any) => String(r?.name || r?.title || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
                .filter(Boolean);
            }
            break;
          }
        } catch {
          // Next candidate
        }
      }
    }

    return {
      configured: true,
      online,
      name: conn.name,
      url: conn.externalUrl || conn.baseUrl,
      libraryPaths,
      ownedTitlesNormalized,
      error: authError || (!online ? `Could not reach Ownfoil at ${conn.baseUrl}` : undefined),
    };
  } catch (err: any) {
    return {
      configured: true,
      online: false,
      name: conn.name,
      url: conn.externalUrl || conn.baseUrl,
      libraryPaths: [],
      ownedTitlesNormalized: [],
      error: err?.message || "Failed probing Ownfoil.",
    };
  }
}
