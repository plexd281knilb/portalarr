import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import {
  cleanServiceBaseUrl,
  getOwnfoilInstance,
  triggerOwnfoilLibraryScan,
} from "./ownfoil";
import {
  evaluateProwlarrGameRelease,
  EvaluatedGameRelease,
  getPlatformBySlug,
} from "./platforms";

async function getProwlarrInstance() {
  const app = await prisma.mediaApp.findFirst({
    where: {
      OR: [{ type: "prowlarr" }, { name: { contains: "prowlarr" } }],
    },
  });
  if (!app) return null;
  return {
    id: app.id,
    name: app.name,
    url: cleanServiceBaseUrl(app.url),
    apiKey: decryptData(app.apiKey || ""),
  };
}

async function getSabnzbdInstance() {
  const app = await prisma.mediaApp.findFirst({
    where: {
      OR: [{ type: "sabnzbd" }, { name: { contains: "sabnzbd" } }],
    },
  });
  if (!app) return null;
  return {
    id: app.id,
    name: app.name,
    url: cleanServiceBaseUrl(app.url),
    apiKey: decryptData(app.apiKey || ""),
  };
}

function cleanGameSearchTitle(rawTitle: string): string {
  return (rawTitle || "")
    .replace(/[™®©]/g, "")
    .replace(/\s*[:\-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function queryProwlarrForGame(
  rawTitle: string,
  platformSlug: string
): Promise<{
  success: boolean;
  releases: EvaluatedGameRelease[];
  error?: string;
}> {
  const prowlarr = await getProwlarrInstance();
  if (!prowlarr) {
    return {
      success: false,
      releases: [],
      error: "Prowlarr is not configured in Settings -> Integrations -> Media Stack & Apps.",
    };
  }

  const platform = getPlatformBySlug(platformSlug);
  const cleanTitle = cleanGameSearchTitle(rawTitle);
  const catParams = platform.prowlarrCategories.map((c) => `categories=${c}`).join("&");

  const searchAttempts: string[] = [
    `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(cleanTitle)}${catParams ? `&${catParams}` : ""}&apikey=${encodeURIComponent(prowlarr.apiKey)}`,
    `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(`${cleanTitle} ${platform.shortName}`)}&apikey=${encodeURIComponent(prowlarr.apiKey)}`,
    `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(cleanTitle)}&apikey=${encodeURIComponent(prowlarr.apiKey)}`,
  ];

  const allRaw: any[] = [];
  let lastError = "";

  for (let i = 0; i < searchAttempts.length; i++) {
    // Skip redundant fallback calls if we already have solid platform matches
    if (i > 0 && allRaw.length >= 6) {
      const hasGoodHit = allRaw.some(
        (r) => evaluateProwlarrGameRelease(r, rawTitle, platformSlug).matchQuality === "match"
      );
      if (hasGoodHit) break;
    }

    try {
      const res = await fetch(searchAttempts[i], {
        headers: {
          "X-Api-Key": prowlarr.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });
      if (!res.ok) {
        lastError = `Prowlarr returned HTTP ${res.status}: ${res.statusText}`;
        continue;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        allRaw.push(...data);
      }
    } catch (err: any) {
      lastError = err?.name === "AbortError" ? "Prowlarr search timed out" : err?.message || "Failed querying Prowlarr";
    }
  }

  if (allRaw.length === 0 && lastError) {
    return { success: false, releases: [], error: lastError };
  }

  const seen = new Set<string>();
  const evaluated: EvaluatedGameRelease[] = [];
  for (const item of allRaw) {
    const dedupKey = String(item?.guid || item?.downloadUrl || item?.title || "").toLowerCase();
    if (!dedupKey || seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const scored = evaluateProwlarrGameRelease(item, rawTitle, platformSlug);
    if (scored.downloadUrl) {
      evaluated.push(scored);
    }
  }

  evaluated.sort((a, b) => {
    const rank = { match: 0, partial: 1, mismatch: 2 };
    if (rank[a.matchQuality] !== rank[b.matchQuality]) {
      return rank[a.matchQuality] - rank[b.matchQuality];
    }
    return b.score - a.score;
  });

  logger.addLog(
    "INFO",
    "APPS",
    `[Games/Prowlarr] Found ${evaluated.length} release(s) for "${rawTitle}" (${platform.name})`
  );

  return { success: true, releases: evaluated };
}

export async function pushGameNzbToSabnzbd(params: {
  downloadUrl: string;
  releaseTitle: string;
  category?: string;
}): Promise<{ success: boolean; downloadId?: string; error?: string }> {
  const sab = await getSabnzbdInstance();
  if (!sab) {
    return {
      success: false,
      error: "SABnzbd is not configured in Settings -> Integrations -> Media Stack & Apps.",
    };
  }

  const cat = (params.category || "games").trim() || "games";
  const addUrl =
    `${sab.url}/api?mode=addurl` +
    `&name=${encodeURIComponent(params.downloadUrl)}` +
    `&nzbname=${encodeURIComponent(params.releaseTitle)}` +
    `&cat=${encodeURIComponent(cat)}` +
    `&output=json` +
    `&apikey=${encodeURIComponent(sab.apiKey)}`;

  try {
    const res = await fetch(addUrl, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    if (!res.ok) {
      return { success: false, error: `SABnzbd returned HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (!json || json.status === false) {
      return { success: false, error: json?.error || "SABnzbd rejected the NZB download." };
    }
    const nzoId = Array.isArray(json.nzo_ids) && json.nzo_ids[0] ? String(json.nzo_ids[0]) : "";
    logger.addLog(
      "SUCCESS",
      "DOWNLOAD",
      `[Games/SABnzbd] Queued "${params.releaseTitle}" under category "${cat}" (ID: ${nzoId || "pending"})`
    );
    return { success: true, downloadId: nzoId };
  } catch (err: any) {
    return {
      success: false,
      error: err?.name === "AbortError" ? "SABnzbd request timed out" : err?.message || "Failed communicating with SABnzbd.",
    };
  }
}

export interface SabJobStatus {
  state: "downloading" | "completed" | "failed" | "unknown";
  progress: number;
  storage?: string;
  errorMessage?: string;
}

export async function checkSabnzbdGameJob(
  downloadId: string | null | undefined,
  releaseTitle: string | null | undefined
): Promise<SabJobStatus> {
  const sab = await getSabnzbdInstance();
  if (!sab) return { state: "unknown", progress: 0 };

  const titleLower = (releaseTitle || "").toLowerCase().trim();
  const titlePrefix = titleLower.length > 8 ? titleLower.slice(0, 24) : titleLower;

  try {
    const qRes = await fetch(
      `${sab.url}/api?mode=queue&output=json&apikey=${encodeURIComponent(sab.apiKey)}`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (qRes.ok) {
      const qJson = await qRes.json();
      const slots: any[] = qJson?.queue?.slots || [];
      const match =
        (downloadId ? slots.find((s) => s.nzo_id === downloadId) : null) ||
        (titleLower
          ? slots.find(
              (s) =>
                (s.filename || "").toLowerCase().includes(titleLower) ||
                (titlePrefix && (s.filename || "").toLowerCase().includes(titlePrefix))
            )
          : null);
      if (match) {
        const pct = Math.max(0, Math.min(99, parseInt(String(match.percentage || "0"), 10) || 0));
        if (String(match.status || "").toLowerCase() === "failed") {
          return { state: "failed", progress: pct, errorMessage: "SABnzbd marked job as failed." };
        }
        return { state: "downloading", progress: pct };
      }
    }

    const hRes = await fetch(
      `${sab.url}/api?mode=history&output=json&limit=100&apikey=${encodeURIComponent(sab.apiKey)}`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (hRes.ok) {
      const hJson = await hRes.json();
      const slots: any[] = hJson?.history?.slots || [];
      const match =
        (downloadId ? slots.find((s) => s.nzo_id === downloadId) : null) ||
        (titleLower
          ? slots.find(
              (s) =>
                (s.name || "").toLowerCase().includes(titleLower) ||
                (s.nzb_name || "").toLowerCase().includes(titleLower) ||
                (titlePrefix && (s.name || "").toLowerCase().includes(titlePrefix))
            )
          : null);
      if (match) {
        const st = String(match.status || "").toLowerCase();
        if (st === "failed") {
          return {
            state: "failed",
            progress: 0,
            errorMessage: match.fail_message || "Download or unpack failed in SABnzbd.",
          };
        }
        if (st === "completed") {
          return {
            state: "completed",
            progress: 100,
            storage: match.storage || undefined,
          };
        }
      }
    }
  } catch (err: any) {
    logger.addLog("WARN", "DOWNLOAD", `[Games/SABnzbd] Status check warning: ${err?.message || err}`);
  }

  return { state: "unknown", progress: 0 };
}

export async function syncActiveGameDownloadsInternal(): Promise<{
  updatedCount: number;
  ownfoilTriggered: boolean;
}> {
  const activeRequests = await prisma.gameRequest.findMany({
    where: {
      status: { in: ["Downloading", "Completed"] },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (activeRequests.length === 0) {
    return { updatedCount: 0, ownfoilTriggered: false };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "global" },
    select: { ownfoilScanOnDownload: true },
  });
  const shouldScanOwnfoil = settings?.ownfoilScanOnDownload !== false;
  const ownfoilConn = shouldScanOwnfoil ? await getOwnfoilInstance() : null;

  let updatedCount = 0;
  let needsOwnfoilScan = false;
  const requestsCompletedNeedingScan: string[] = [];

  for (const req of activeRequests) {
    if (req.status === "Downloading") {
      const sabStatus = await checkSabnzbdGameJob(req.downloadId, req.releaseTitle || req.title);
      if (sabStatus.state === "downloading" && sabStatus.progress !== (req.downloadProgress || 0)) {
        await prisma.gameRequest.update({
          where: { id: req.id },
          data: { downloadProgress: sabStatus.progress },
        });
        updatedCount++;
      } else if (sabStatus.state === "failed") {
        await prisma.gameRequest.update({
          where: { id: req.id },
          data: {
            status: "Failed",
            errorMessage: sabStatus.errorMessage || "SABnzbd failed to complete download.",
          },
        });
        updatedCount++;
      } else if (sabStatus.state === "completed") {
        await prisma.gameRequest.update({
          where: { id: req.id },
          data: {
            status: "Completed",
            downloadProgress: 100,
          },
        });
        updatedCount++;
        if (shouldScanOwnfoil && !req.ownfoilRefreshed) {
          needsOwnfoilScan = true;
          requestsCompletedNeedingScan.push(req.id);
        }
      }
    } else if (req.status === "Completed" && !req.ownfoilRefreshed && shouldScanOwnfoil) {
      needsOwnfoilScan = true;
      requestsCompletedNeedingScan.push(req.id);
    }
  }

  let ownfoilTriggered = false;
  if (needsOwnfoilScan && ownfoilConn && requestsCompletedNeedingScan.length > 0) {
    const scanRes = await triggerOwnfoilLibraryScan(ownfoilConn);
    if (scanRes.success) {
      ownfoilTriggered = true;
      const now = new Date();
      await prisma.gameRequest.updateMany({
        where: { id: { in: requestsCompletedNeedingScan } },
        data: {
          status: "Ownfoil Refreshed",
          ownfoilRefreshed: true,
          ownfoilRefreshedAt: now,
        },
      });
    }
  }

  return { updatedCount, ownfoilTriggered };
}

const activeMonitors = new Set<string>();

export function launchGameDownloadMonitor(requestId: string) {
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.PORTALARR_TEST === "true") {
    return;
  }
  if (activeMonitors.has(requestId)) return;
  activeMonitors.add(requestId);

  (async () => {
    try {
      const maxChecks = 120; // Poll up to ~20 minutes
      for (let i = 0; i < maxChecks; i++) {
        await new Promise((r) => setTimeout(r, 10_000));
        const row = await prisma.gameRequest.findUnique({ where: { id: requestId } });
        if (!row || (row.status !== "Downloading" && (row.status !== "Completed" || row.ownfoilRefreshed))) {
          break;
        }
        const sync = await syncActiveGameDownloadsInternal();
        const refreshed = await prisma.gameRequest.findUnique({ where: { id: requestId } });
        if (!refreshed || refreshed.status === "Ownfoil Refreshed" || refreshed.status === "Failed") {
          break;
        }
        if (sync.ownfoilTriggered) break;
      }
    } catch (err) {
      console.error("[Games] Background monitor error:", err);
    } finally {
      activeMonitors.delete(requestId);
    }
  })();
}
