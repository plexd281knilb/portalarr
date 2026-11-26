import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import {
  cleanServiceBaseUrl,
  getOwnfoilInstance,
  probeOwnfoilLive,
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

export interface ProwlarrLiveProbe {
  configured: boolean;
  online: boolean;
  name: string | null;
  indexerCount: number;
  error?: string;
}

export interface SabCategoryEntry {
  name: string;
  dir: string;
}

export interface SabnzbdLiveProbe {
  configured: boolean;
  online: boolean;
  name: string | null;
  categories: SabCategoryEntry[];
  expectedCategory: string;
  categoryExists: boolean;
  selectedCategoryDir: string | null;
  completeDir: string | null;
  downloadDir: string | null;
  completeDirMountedInPortalarr: boolean;
  error?: string;
}

export function evaluateSabCategoryStatus(
  categories: SabCategoryEntry[],
  expectedCategory: string
): { exists: boolean; matchedDir: string | null } {
  const cleanTarget = (expectedCategory || "").trim().toLowerCase();
  if (!cleanTarget) {
    return { exists: true, matchedDir: null };
  }
  const found = categories.find(
    (c) => c.name.trim().toLowerCase() === cleanTarget && c.name.trim() !== "*"
  );
  if (!found) {
    return { exists: false, matchedDir: null };
  }
  return { exists: true, matchedDir: found.dir || null };
}

export async function probeProwlarrLive(): Promise<ProwlarrLiveProbe> {
  const prowlarr = await getProwlarrInstance();
  if (!prowlarr) {
    return { configured: false, online: false, name: null, indexerCount: 0 };
  }
  try {
    const [statusRes, idxRes] = await Promise.all([
      fetch(`${prowlarr.url}/api/v1/system/status?apikey=${encodeURIComponent(prowlarr.apiKey)}`, {
        headers: { "X-Api-Key": prowlarr.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }),
      fetch(`${prowlarr.url}/api/v1/indexer?apikey=${encodeURIComponent(prowlarr.apiKey)}`, {
        headers: { "X-Api-Key": prowlarr.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }).catch(() => null),
    ]);
    if (!statusRes.ok) {
      return {
        configured: true,
        online: false,
        name: prowlarr.name,
        indexerCount: 0,
        error: `Prowlarr returned HTTP ${statusRes.status}`,
      };
    }
    const indexers = idxRes && idxRes.ok ? await idxRes.json().catch(() => []) : [];
    const enabledCount = Array.isArray(indexers)
      ? indexers.filter((i: any) => i?.enable !== false).length
      : 0;
    return {
      configured: true,
      online: true,
      name: prowlarr.name,
      indexerCount: enabledCount,
    };
  } catch (err: any) {
    return {
      configured: true,
      online: false,
      name: prowlarr.name,
      indexerCount: 0,
      error: err?.name === "AbortError" ? "Prowlarr check timed out" : err?.message || "Unreachable",
    };
  }
}

export async function probeSabnzbdLive(expectedCategory: string): Promise<SabnzbdLiveProbe> {
  const sab = await getSabnzbdInstance();
  if (!sab) {
    return {
      configured: false,
      online: false,
      name: null,
      categories: [],
      expectedCategory,
      categoryExists: false,
      selectedCategoryDir: null,
      completeDir: null,
      downloadDir: null,
      completeDirMountedInPortalarr: false,
    };
  }

  try {
    const cfgRes = await fetch(
      `${sab.url}/api?mode=get_config&output=json&apikey=${encodeURIComponent(sab.apiKey)}`,
      { signal: AbortSignal.timeout(6000), cache: "no-store" }
    );
    if (!cfgRes.ok) {
      return {
        configured: true,
        online: false,
        name: sab.name,
        categories: [],
        expectedCategory,
        categoryExists: false,
        selectedCategoryDir: null,
        completeDir: null,
        downloadDir: null,
        completeDirMountedInPortalarr: false,
        error: `SABnzbd returned HTTP ${cfgRes.status}`,
      };
    }

    const cfgJson = await cfgRes.json().catch(() => null);
    if (!cfgJson || cfgJson.status === false) {
      return {
        configured: true,
        online: false,
        name: sab.name,
        categories: [],
        expectedCategory,
        categoryExists: false,
        selectedCategoryDir: null,
        completeDir: null,
        downloadDir: null,
        completeDirMountedInPortalarr: false,
        error: cfgJson?.error || "SABnzbd rejected config check (verify API key).",
      };
    }

    const rawCats: any[] = Array.isArray(cfgJson?.config?.categories) ? cfgJson.config.categories : [];
    const categories: SabCategoryEntry[] = rawCats
      .map((c: any) => ({
        name: String(c?.name || "").trim(),
        dir: String(c?.dir || "").trim(),
      }))
      .filter((c) => c.name && c.name !== "*");

    // Also pull get_cats fallback in case categories array wasn't populated
    if (categories.length === 0) {
      const catsRes = await fetch(
        `${sab.url}/api?mode=get_cats&output=json&apikey=${encodeURIComponent(sab.apiKey)}`,
        { signal: AbortSignal.timeout(5000), cache: "no-store" }
      ).catch(() => null);
      if (catsRes && catsRes.ok) {
        const catsJson = await catsRes.json().catch(() => null);
        const list: any[] = Array.isArray(catsJson?.categories) ? catsJson.categories : [];
        for (const name of list) {
          const clean = String(name || "").trim();
          if (clean && clean !== "*") categories.push({ name: clean, dir: "" });
        }
      }
    }

    const completeDir = cfgJson?.config?.misc?.complete_dir ? String(cfgJson.config.misc.complete_dir).trim() : null;
    const downloadDir = cfgJson?.config?.misc?.download_dir ? String(cfgJson.config.misc.download_dir).trim() : null;
    const catCheck = evaluateSabCategoryStatus(categories, expectedCategory);
    const completeDirMounted = Boolean(completeDir && fs.existsSync(completeDir));

    return {
      configured: true,
      online: true,
      name: sab.name,
      categories,
      expectedCategory,
      categoryExists: catCheck.exists,
      selectedCategoryDir: catCheck.matchedDir,
      completeDir,
      downloadDir,
      completeDirMountedInPortalarr: completeDirMounted,
      error: !catCheck.exists
        ? `Category "${expectedCategory}" not found in SABnzbd (configured: ${categories.map((c) => c.name).join(", ") || "none"}).`
        : undefined,
    };
  } catch (err: any) {
    return {
      configured: true,
      online: false,
      name: sab.name,
      categories: [],
      expectedCategory,
      categoryExists: false,
      selectedCategoryDir: null,
      completeDir: null,
      downloadDir: null,
      completeDirMountedInPortalarr: false,
      error: err?.name === "AbortError" ? "SABnzbd check timed out" : err?.message || "Unreachable",
    };
  }
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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[™®©'’ʼ`]/g, "")
    .replace(/[,!?&/:–—]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildGameSearchQueryVariants(rawTitle: string): string[] {
  const base = cleanGameSearchTitle(rawTitle);
  const compactHyphens = base.replace(/\b([A-Za-z0-9])\s*-\s*([A-Za-z0-9])\b/g, "$1$2").trim();
  const spaceHyphens = base.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return Array.from(new Set([base, compactHyphens, spaceHyphens].filter(Boolean)));
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
  const queryVariants = buildGameSearchQueryVariants(rawTitle);
  const primaryQuery = queryVariants[0] || rawTitle.trim();
  const catParams = platform.prowlarrCategories.map((c) => `categories=${c}`).join("&");

  const searchAttempts: string[] = Array.from(
    new Set([
      `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(primaryQuery)}${catParams ? `&${catParams}` : ""}&apikey=${encodeURIComponent(prowlarr.apiKey)}`,
      `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(`${primaryQuery} ${platform.shortName}`)}&apikey=${encodeURIComponent(prowlarr.apiKey)}`,
      ...queryVariants.map(
        (q) => `${prowlarr.url}/api/v1/search?query=${encodeURIComponent(q)}&apikey=${encodeURIComponent(prowlarr.apiKey)}`
      ),
    ])
  );

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

const GAME_ARCHIVE_OR_ROM_EXTS = new Set([
  ".nsp", ".nsz", ".xci", ".xcz", ".cia", ".3ds", ".cci", ".wua", ".wux", ".wud",
  ".rvz", ".iso", ".chd", ".cso", ".pkg", ".fpkg", ".z64", ".n64", ".v64", ".sfc",
  ".smc", ".nes", ".gba", ".nds",
]);

function hasGameFileInsideDir(dirPath: string, depth = 0): boolean {
  if (!fs.existsSync(dirPath) || depth > 3) return false;
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return GAME_ARCHIVE_OR_ROM_EXTS.has(path.extname(dirPath).toLowerCase());
    }
    for (const entry of fs.readdirSync(dirPath)) {
      if (entry.startsWith("_UNPACK_") || entry.startsWith("_FAILED_")) continue;
      if (hasGameFileInsideDir(path.join(dirPath, entry), depth + 1)) return true;
    }
  } catch {}
  return false;
}

export function resolveCompletedGameSourceDir(options: {
  sabStorage?: string;
  downloadsPath?: string | null;
  sabCategory?: string | null;
  releaseTitle?: string | null;
  gameTitle?: string | null;
}): string | null {
  const { sabStorage, downloadsPath, sabCategory, releaseTitle, gameTitle } = options;

  // 1. Direct SABnzbd reported storage path inside container
  if (sabStorage && fs.existsSync(sabStorage)) {
    return sabStorage;
  }

  // 2. Fallback across Settings.downloadsPath (matching Books download resolution)
  const dlRoot = (downloadsPath || process.env.DOWNLOADS_DIR || "/downloads").trim();
  const cat = (sabCategory || "").trim();
  const jobFolderName = sabStorage ? path.basename(sabStorage.replace(/[/\\]+$/, "")) : "";

  const baseSearchDirs = Array.from(
    new Set(
      [
        ...(cat
          ? [
              path.join(dlRoot, cat),
              path.join(dlRoot, "complete", cat),
              path.join(dlRoot, "completed", cat),
            ]
          : []),
        path.join(dlRoot, "complete"),
        path.join(dlRoot, "completed"),
        dlRoot,
      ].filter(Boolean)
    )
  );

  // 2a. Look for exact job folder name inside configured downloads paths
  if (jobFolderName) {
    for (const baseDir of baseSearchDirs) {
      const candidate = path.join(baseDir, jobFolderName);
      if (fs.existsSync(candidate) && hasGameFileInsideDir(candidate)) {
        return candidate;
      }
    }
  }

  // 2b. Fuzzy match job subfolder by release/game title words inside category/downloads folders
  const matchTokens = (releaseTitle || gameTitle || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);

  if (matchTokens.length > 0) {
    for (const baseDir of baseSearchDirs) {
      if (!fs.existsSync(baseDir)) continue;
      try {
        for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
          if (entry.name.startsWith("_UNPACK_") || entry.name.startsWith("_FAILED_")) continue;
          const low = entry.name.toLowerCase();
          const hits = matchTokens.filter((t) => low.includes(t)).length;
          if (hits >= Math.max(1, Math.ceil(matchTokens.length * 0.6))) {
            const candidate = path.join(baseDir, entry.name);
            if (hasGameFileInsideDir(candidate)) return candidate;
          }
        }
      } catch {}
    }
  }

  return null;
}

export function resolveGameDestinationPath(options: {
  configuredGamesLibraryPath?: string | null;
  ownfoilLibraryPaths?: string[];
  extraCandidatePaths?: string[];
}): { path: string | null; source: "Vault Settings" | "Ownfoil Library (Auto)" | "Container Mount (Auto)" | "None Mounted" } {
  const explicit = (options.configuredGamesLibraryPath || "").trim();
  if (explicit && fs.existsSync(explicit)) {
    return { path: explicit, source: "Vault Settings" };
  }
  for (const ownfoilPath of options.ownfoilLibraryPaths || []) {
    const clean = (ownfoilPath || "").trim();
    if (clean && fs.existsSync(clean)) {
      return { path: clean, source: "Ownfoil Library (Auto)" };
    }
  }
  const commonShareMounts = options.extraCandidatePaths || [
    "/switch_games",
    "/mnt/user/switch_games",
    "/games",
  ];
  for (const cand of commonShareMounts) {
    const clean = (cand || "").trim();
    if (clean && fs.existsSync(clean)) {
      return { path: clean, source: "Container Mount (Auto)" };
    }
  }
  if (explicit) {
    return { path: explicit, source: "None Mounted" };
  }
  return { path: null, source: "None Mounted" };
}

export function normalizeGameTitleForLibraryMatch(rawName: string): { cleanTitle: string; normalizedKey: string } {
  const withoutExt = rawName.replace(/\.[^.]+$/, "");
  const cleanTitle = withoutExt
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[._]+/g, " ")
    .replace(/\bv?\d+(?:\.\d+)*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedKey = (cleanTitle || withoutExt).toLowerCase().replace(/[^a-z0-9]/g, "");
  return { cleanTitle: cleanTitle || withoutExt, normalizedKey };
}

export interface LocalLibraryGameFile {
  name: string;
  cleanTitle: string;
  normalizedKey: string;
  ext: string;
  sizeBytes: number;
}

export function scanLocalGamesLibrary(destPath: string | null | undefined): {
  files: LocalLibraryGameFile[];
  normalizedTitles: string[];
} {
  if (!destPath || !fs.existsSync(destPath)) {
    return { files: [], normalizedTitles: [] };
  }
  const root = path.resolve(destPath);
  const files: LocalLibraryGameFile[] = [];
  const normSet = new Set<string>();

  const walk = (dir: string, depth: number) => {
    if (depth > 3) return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.resolve(dir, entry.name);
        if (!full.startsWith(root + path.sep)) continue;
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!GAME_ARCHIVE_OR_ROM_EXTS.has(ext)) continue;
        const stat = fs.statSync(full);
        const { cleanTitle, normalizedKey } = normalizeGameTitleForLibraryMatch(entry.name);
        if (normalizedKey) normSet.add(normalizedKey);
        files.push({
          name: entry.name,
          cleanTitle,
          normalizedKey,
          ext: ext.replace(".", "").toUpperCase(),
          sizeBytes: stat.size,
        });
      }
    } catch {}
  };

  walk(root, 0);
  files.sort((a, b) => a.cleanTitle.localeCompare(b.cleanTitle));
  return { files, normalizedTitles: Array.from(normSet) };
}

export function moveCompletedGameFilesIfMounted(
  sourcePath: string | null | undefined,
  destDirPath: string | null | undefined,
  downloadsRootPath?: string | null
): number {
  if (!sourcePath || !destDirPath) return 0;
  try {
    const srcRoot = path.resolve(sourcePath);
    const destRoot = path.resolve(destDirPath);
    const dlRoot = path.resolve((downloadsRootPath || process.env.DOWNLOADS_DIR || "/downloads").trim());
    if (!fs.existsSync(srcRoot) || !fs.existsSync(destRoot)) return 0;

    // Never move files into themselves
    if (srcRoot === destRoot || srcRoot.startsWith(destRoot + path.sep)) return 0;

    let movedCount = 0;
    const collectAndMove = (dirOrFile: string) => {
      const resolvedItem = path.resolve(dirOrFile);
      if (resolvedItem !== srcRoot && !resolvedItem.startsWith(srcRoot + path.sep)) return;
      const stat = fs.statSync(resolvedItem);
      if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(resolvedItem)) {
          collectAndMove(path.join(resolvedItem, entry));
        }
        return;
      }
      const ext = path.extname(resolvedItem).toLowerCase();
      if (!GAME_ARCHIVE_OR_ROM_EXTS.has(ext)) return;
      const safeName = path.basename(resolvedItem).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_");
      const targetFile = path.resolve(destRoot, safeName);
      if (!targetFile.startsWith(destRoot + path.sep)) return;

      if (fs.existsSync(targetFile)) {
        // Destination already has verified copy — clear cache duplicate so cache disk frees up
        try {
          if (fs.statSync(targetFile).size === stat.size) {
            fs.unlinkSync(resolvedItem);
            movedCount++;
          }
        } catch {}
        return;
      }

      try {
        fs.renameSync(resolvedItem, targetFile);
        movedCount++;
      } catch (renameErr: any) {
        // Cross-device move (e.g. Unraid /downloads cache -> /switch_games array): copy + verify size + remove cache source
        const tmpTarget = `${targetFile}.tmp_${process.pid}_${Date.now()}`;
        try {
          fs.copyFileSync(resolvedItem, tmpTarget);
          const tmpStat = fs.statSync(tmpTarget);
          if (tmpStat.size !== stat.size) {
            throw new Error(`Size verification mismatch (${tmpStat.size} vs ${stat.size})`);
          }
          fs.renameSync(tmpTarget, targetFile);
          fs.unlinkSync(resolvedItem);
          movedCount++;
        } catch (copyErr) {
          if (fs.existsSync(tmpTarget)) {
            fs.unlinkSync(tmpTarget);
          }
          throw copyErr;
        }
      }
    };

    collectAndMove(srcRoot);

    // Clean empty job subfolder / SABnzbd sidecar clutter from /downloads cache once game files moved to array
    if (movedCount > 0 && srcRoot !== dlRoot && fs.existsSync(srcRoot)) {
      const pruneJobDir = (dir: string) => {
        const resolved = path.resolve(dir);
        if (resolved === dlRoot) return;
        const st = fs.statSync(resolved);
        if (!st.isDirectory()) return;
        for (const entry of fs.readdirSync(resolved)) {
          const child = path.join(resolved, entry);
          const childSt = fs.statSync(child);
          if (childSt.isDirectory()) {
            pruneJobDir(child);
          } else if (/\.(?:nfo|txt|sfv|par2|nzb|srr|srs|url)$/i.test(entry)) {
            fs.unlinkSync(child);
          }
        }
        if (fs.readdirSync(resolved).length === 0) {
          fs.rmdirSync(resolved);
        }
      };
      try {
        pruneJobDir(srcRoot);
      } catch {}
    }

    return movedCount;
  } catch (err: any) {
    logger.addLog("WARN", "DOWNLOAD", `[Games] Path move warning: ${err?.message || err}`);
    return 0;
  }
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
    select: { downloadsPath: true, ownfoilScanOnDownload: true, gamesLibraryPath: true, gamesSabCategory: true },
  });
  const shouldScanOwnfoil = settings?.ownfoilScanOnDownload !== false;
  const ownfoilConn = shouldScanOwnfoil ? await getOwnfoilInstance() : null;
  const ownfoilProbe = ownfoilConn ? await probeOwnfoilLive() : null;
  const destResolution = resolveGameDestinationPath({
    configuredGamesLibraryPath: settings?.gamesLibraryPath,
    ownfoilLibraryPaths: ownfoilProbe?.libraryPaths || [],
  });

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
        const sourceDir = resolveCompletedGameSourceDir({
          sabStorage: sabStatus.storage,
          downloadsPath: settings?.downloadsPath,
          sabCategory: req.sabCategory || settings?.gamesSabCategory,
          releaseTitle: req.releaseTitle,
          gameTitle: req.title,
        });
        const moved = moveCompletedGameFilesIfMounted(sourceDir, destResolution.path, settings?.downloadsPath);
        if (moved > 0) {
          logger.addLog(
            "SUCCESS",
            "DOWNLOAD",
            `[Games] Moved ${moved} game file(s) from "${sourceDir}" -> "${destResolution.path}" (${destResolution.source}) and freed cache space for "${req.title}".`
          );
        }
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
