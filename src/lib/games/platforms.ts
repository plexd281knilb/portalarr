export interface GamePlatformConfig {
  slug: string;
  name: string;
  shortName: string;
  manufacturer: string;
  prowlarrCategories: number[];
  defaultSabCategory: string;
  nintendoSystemCode?: string;
  libretroDatUrl?: string;
  libretroThumbSystem?: string;
  rawgPlatformId?: number;
  prowlarrPlatformTokens: string[];
  preferredExtensions: string[];
  disallowedPlatformTokens: string[];
}

export interface GameCatalogEntry {
  id: string;
  title: string;
  platform: string;
  platformSlug: string;
  coverUrl: string | null;
  releaseDate: string | null;
  publisher: string | null;
  summary: string | null;
  genres: string[];
  source: "nintendo" | "libretro" | "rawg" | "steam" | "wikipedia";
}

export interface EvaluatedGameRelease {
  title: string;
  guid: string;
  downloadUrl: string;
  indexer: string;
  size: number;
  sizeLabel: string;
  ageDays: number | null;
  protocol: string;
  categories: number[];
  formatTag: string;
  isUpdateOrDlc: boolean;
  matchQuality: "match" | "partial" | "mismatch";
  score: number;
  matchReason: string;
}

export const GAME_PLATFORMS: GamePlatformConfig[] = [
  {
    slug: "nintendo-switch",
    name: "Nintendo Switch",
    shortName: "Switch",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000, 1180, 1080, 1030, 4050],
    defaultSabCategory: "games",
    nintendoSystemCode: "hac",
    rawgPlatformId: 7,
    prowlarrPlatformTokens: ["switch", "nsw", "nsp", "nsz", "xci", "xcz", "hac"],
    preferredExtensions: ["NSZ", "NSP", "XCI", "XCZ"],
    disallowedPlatformTokens: ["ps5", "ps4", "ps3", "ps2", "xbox", "xbone", "xsx", "3ds", "wii u", "wiiu", "pc-gog", "fitgirl", "dodi", "elamigos"],
  },
  {
    slug: "nintendo-switch-2",
    name: "Nintendo Switch 2",
    shortName: "Switch 2",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    nintendoSystemCode: "bee",
    prowlarrPlatformTokens: ["switch 2", "switch2", "ns2"],
    preferredExtensions: ["NSZ", "NSP", "XCI"],
    disallowedPlatformTokens: ["ps5", "ps4", "xbox", "fitgirl"],
  },
  {
    slug: "nintendo-3ds",
    name: "Nintendo 3DS",
    shortName: "3DS",
    manufacturer: "Nintendo",
    prowlarrCategories: [1110, 1000],
    defaultSabCategory: "games",
    nintendoSystemCode: "ctr",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Nintendo%203DS.dat",
    libretroThumbSystem: "Nintendo - Nintendo 3DS",
    rawgPlatformId: 8,
    prowlarrPlatformTokens: ["3ds", "cia", "ctr", "new 3ds"],
    preferredExtensions: ["CIA", "3DS", "CCI"],
    disallowedPlatformTokens: ["switch", "nsp", "nsz", "ps4", "ps5", "xbox"],
  },
  {
    slug: "wii-u",
    name: "Nintendo Wii U",
    shortName: "Wii U",
    manufacturer: "Nintendo",
    prowlarrCategories: [1130, 1030, 1000],
    defaultSabCategory: "games",
    nintendoSystemCode: "wup",
    rawgPlatformId: 10,
    prowlarrPlatformTokens: ["wii u", "wiiu", "wup", "wux", "wua"],
    preferredExtensions: ["WUA", "WUX", "WUD", "RPX"],
    disallowedPlatformTokens: ["switch", "nsp", "nsz", "3ds", "ps4", "ps5"],
  },
  {
    slug: "gamecube",
    name: "Nintendo GameCube",
    shortName: "GameCube",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Nintendo%20-%20GameCube.dat",
    libretroThumbSystem: "Nintendo - GameCube",
    rawgPlatformId: 105,
    prowlarrPlatformTokens: ["gamecube", "ngc", "gc", "rvz", "gcz"],
    preferredExtensions: ["RVZ", "ISO", "GCZ", "CISO"],
    disallowedPlatformTokens: ["switch", "wii u", "ps4", "ps5", "xbox"],
  },
  {
    slug: "n64",
    name: "Nintendo 64",
    shortName: "N64",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Nintendo%2064.dat",
    libretroThumbSystem: "Nintendo - Nintendo 64",
    rawgPlatformId: 83,
    prowlarrPlatformTokens: ["n64", "nintendo 64", "z64", "v64"],
    preferredExtensions: ["Z64", "N64", "V64"],
    disallowedPlatformTokens: ["switch", "ps4", "ps5", "xbox"],
  },
  {
    slug: "snes",
    name: "Super Nintendo (SNES)",
    shortName: "SNES",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System.dat",
    libretroThumbSystem: "Nintendo - Super Nintendo Entertainment System",
    rawgPlatformId: 79,
    prowlarrPlatformTokens: ["snes", "super nintendo", "sfc", "smc"],
    preferredExtensions: ["SFC", "SMC"],
    disallowedPlatformTokens: ["switch", "ps4", "ps5", "xbox"],
  },
  {
    slug: "nes",
    name: "Nintendo Entertainment System (NES)",
    shortName: "NES",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Nintendo%20Entertainment%20System.dat",
    libretroThumbSystem: "Nintendo - Nintendo Entertainment System",
    rawgPlatformId: 49,
    prowlarrPlatformTokens: ["nes", "famicom"],
    preferredExtensions: ["NES"],
    disallowedPlatformTokens: ["snes", "switch", "ps4", "ps5", "xbox"],
  },
  {
    slug: "gba",
    name: "Game Boy Advance",
    shortName: "GBA",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Game%20Boy%20Advance.dat",
    libretroThumbSystem: "Nintendo - Game Boy Advance",
    rawgPlatformId: 24,
    prowlarrPlatformTokens: ["gba", "game boy advance"],
    preferredExtensions: ["GBA"],
    disallowedPlatformTokens: ["switch", "3ds", "ps4", "ps5"],
  },
  {
    slug: "nintendo-ds",
    name: "Nintendo DS",
    shortName: "NDS",
    manufacturer: "Nintendo",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    nintendoSystemCode: "ntr",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Nintendo%20-%20Nintendo%20DS.dat",
    libretroThumbSystem: "Nintendo - Nintendo DS",
    rawgPlatformId: 9,
    prowlarrPlatformTokens: ["nds", "nintendo ds"],
    preferredExtensions: ["NDS"],
    disallowedPlatformTokens: ["3ds", "switch", "ps4", "ps5"],
  },
  {
    slug: "ps5",
    name: "PlayStation 5",
    shortName: "PS5",
    manufacturer: "Sony",
    prowlarrCategories: [1000, 1180],
    defaultSabCategory: "games",
    rawgPlatformId: 187,
    prowlarrPlatformTokens: ["ps5", "playstation 5"],
    preferredExtensions: ["PKG", "ISO"],
    disallowedPlatformTokens: ["switch", "nsp", "nsz", "xbox", "fitgirl"],
  },
  {
    slug: "ps4",
    name: "PlayStation 4",
    shortName: "PS4",
    manufacturer: "Sony",
    prowlarrCategories: [1180, 1000],
    defaultSabCategory: "games",
    rawgPlatformId: 18,
    prowlarrPlatformTokens: ["ps4", "playstation 4", "fpkg", "duplex", "cyb1k"],
    preferredExtensions: ["PKG", "FPKG"],
    disallowedPlatformTokens: ["switch", "nsp", "nsz", "xbox"],
  },
  {
    slug: "ps2",
    name: "PlayStation 2",
    shortName: "PS2",
    manufacturer: "Sony",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/redump/Sony%20-%20PlayStation%202.dat",
    libretroThumbSystem: "Sony - PlayStation 2",
    rawgPlatformId: 15,
    prowlarrPlatformTokens: ["ps2", "playstation 2"],
    preferredExtensions: ["CHD", "ISO"],
    disallowedPlatformTokens: ["ps4", "ps5", "switch", "xbox"],
  },
  {
    slug: "psp",
    name: "PlayStation Portable (PSP)",
    shortName: "PSP",
    manufacturer: "Sony",
    prowlarrCategories: [1000],
    defaultSabCategory: "games",
    libretroDatUrl: "https://raw.githubusercontent.com/libretro/libretro-database/master/metadat/no-intro/Sony%20-%20PlayStation%20Portable.dat",
    libretroThumbSystem: "Sony - PlayStation Portable",
    rawgPlatformId: 17,
    prowlarrPlatformTokens: ["psp", "playstation portable"],
    preferredExtensions: ["CHD", "ISO", "CSO"],
    disallowedPlatformTokens: ["ps4", "ps5", "switch", "xbox"],
  },
  {
    slug: "xbox-series",
    name: "Xbox Series X|S",
    shortName: "Xbox Series",
    manufacturer: "Microsoft",
    prowlarrCategories: [1000, 1140],
    defaultSabCategory: "games",
    rawgPlatformId: 186,
    prowlarrPlatformTokens: ["xbox", "xsx", "series x"],
    preferredExtensions: ["XISO", "ISO"],
    disallowedPlatformTokens: ["switch", "nsp", "ps4", "ps5"],
  },
  {
    slug: "pc",
    name: "PC Games",
    shortName: "PC",
    manufacturer: "Windows / Steam",
    prowlarrCategories: [4050, 4000],
    defaultSabCategory: "games",
    rawgPlatformId: 4,
    prowlarrPlatformTokens: ["gog", "codex", "rune", "tenoke", "elamigos", "fitgirl", "dodi", "flt", "skidrow", "pc"],
    preferredExtensions: ["ISO", "RAR", "ZIP"],
    disallowedPlatformTokens: ["nsp", "nsz", "xci", "ps4", "ps5", "3ds"],
  },
];

export function getPlatformBySlug(slug: string): GamePlatformConfig {
  const clean = (slug || "").trim().toLowerCase();
  return GAME_PLATFORMS.find((p) => p.slug === clean) || GAME_PLATFORMS[0];
}

// In-memory cache for parsed Libretro DAT game titles (keeps retro searches instant without hitting GitHub repeatedly)
const libretroCache = new Map<string, { fetchedAt: number; entries: Array<{ title: string; rawName: string; region: string }> }>();

function parseLibretroDatEntries(datText: string): Array<{ title: string; rawName: string; region: string }> {
  const results: Array<{ title: string; rawName: string; region: string }> = [];
  const seenNormalized = new Map<string, number>();
  const nameRegex = /^\s*name\s+"([^"]+)"/gm;

  let m: RegExpExecArray | null;
  while ((m = nameRegex.exec(datText)) !== null) {
    const rawName = m[1].trim();
    if (!rawName) continue;
    const lowerRaw = rawName.toLowerCase();
    // Skip BIOS, demos, protos, betas, kiosks, manuals, homebrew clutter in standard browse
    if (/\((?:beta|proto|demo|sample|kiosk|test\s+program|pirate|unl|aftermarket)\b|\[bios\]/i.test(lowerRaw)) {
      continue;
    }

    // Prefer clean display title stripped of trailing region/revision parentheticals
    const cleanTitle = rawName.replace(/\s*\([^)]*\)/g, "").replace(/\s*\[[^\]]*\]/g, "").trim();
    if (!cleanTitle) continue;

    const regionMatch = rawName.match(/\((USA|World|Europe|Japan|En[^)]*)\)/i);
    const region = regionMatch ? regionMatch[1] : "";
    const normKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!normKey) continue;

    const isPreferredRegion = /\((?:usa|world)\b/i.test(rawName);
    const existingIdx = seenNormalized.get(normKey);
    if (existingIdx !== undefined) {
      // Upgrade existing entry if this one is USA/World over EUR/JPN
      if (isPreferredRegion && !/\((?:usa|world)\b/i.test(results[existingIdx].rawName)) {
        results[existingIdx] = { title: cleanTitle, rawName, region: region || "USA" };
      }
      continue;
    }

    seenNormalized.set(normKey, results.length);
    results.push({ title: cleanTitle, rawName, region });
  }

  return results;
}

function buildLibretroBoxartUrl(systemName: string, rawName: string): string {
  // Libretro thumbnails replace &, *, /, :, `, <, >, ?, \, | with _
  const safeName = rawName.replace(/[&*/:`<>?\\|]/g, "_");
  return `https://thumbnails.libretro.com/${encodeURIComponent(systemName)}/Named_Boxarts/${encodeURIComponent(safeName)}.png`;
}

async function queryNintendoPlatformCatalog(
  platform: GamePlatformConfig,
  query: string,
  page: number,
  pageSize: number
): Promise<{ items: GameCatalogEntry[]; total: number }> {
  const sysCode = platform.nintendoSystemCode;
  if (!sysCode) return { items: [], total: 0 };

  const cleanQ = (query || "").trim();
  const start = Math.max(0, (page - 1) * pageSize);

  // Strict Solr filter guarantees ONLY games playable on the chosen Nintendo platform are returned
  const fq = `type:GAME AND playable_on_txt:${sysCode}`;
  const qExpr = cleanQ
    ? cleanQ
        .split(/\s+/)
        .filter(Boolean)
        .map((t) => `"${t.replace(/["\\]/g, "")}"`)
        .join(" AND ")
    : "*";

  const sortParam = cleanQ
    ? "score desc, popularity desc"
    : "dates_released_dts desc";

  const url = `https://search.nintendo-europe.com/en/select?q=${encodeURIComponent(qExpr)}&fq=${encodeURIComponent(fq)}&start=${start}&rows=${pageSize}&sort=${encodeURIComponent(sortParam)}&wt=json`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Portalarr/1.6" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Nintendo catalog returned HTTP ${res.status}`);
  }

  const data = await res.json();
  const docs: any[] = data?.response?.docs || [];
  const total: number = Number(data?.response?.numFound || docs.length || 0);

  const items: GameCatalogEntry[] = docs.map((d: any) => {
    const rawImg = d.image_url_sq_s || d.image_url || d.image_url_h2x1_s || "";
    const coverUrl = rawImg.startsWith("//") ? `https:${rawImg}` : rawImg || null;
    const rawDate = Array.isArray(d.dates_released_dts) ? d.dates_released_dts[0] : d.pretty_date_s || null;
    const releaseDate = rawDate ? String(rawDate).slice(0, 10) : null;

    return {
      id: `nin_${platform.slug}_${d.fs_id || d.nsuid_txt?.[0] || encodeURIComponent(d.title || "game")}`,
      title: String(d.title || "Unknown Title"),
      platform: platform.name,
      platformSlug: platform.slug,
      coverUrl,
      releaseDate,
      publisher: d.publisher ? String(d.publisher) : null,
      summary: d.excerpt ? String(d.excerpt) : null,
      genres: Array.isArray(d.pretty_game_categories_txt) ? d.pretty_game_categories_txt : [],
      source: "nintendo",
    };
  });

  return { items, total };
}

async function queryLibretroCatalog(
  platform: GamePlatformConfig,
  query: string,
  page: number,
  pageSize: number
): Promise<{ items: GameCatalogEntry[]; total: number }> {
  if (!platform.libretroDatUrl) return { items: [], total: 0 };

  const cached = libretroCache.get(platform.slug);
  let entries = cached && Date.now() - cached.fetchedAt < 1000 * 60 * 60 * 6 ? cached.entries : null;

  if (!entries) {
    const res = await fetch(platform.libretroDatUrl, {
      headers: { "User-Agent": "Portalarr/1.6" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Libretro DAT returned HTTP ${res.status}`);
    }
    const text = await res.text();
    entries = parseLibretroDatEntries(text);
    libretroCache.set(platform.slug, { fetchedAt: Date.now(), entries });
  }

  const cleanQ = (query || "").trim().toLowerCase();
  const tokens = cleanQ.split(/\s+/).filter(Boolean);
  const filtered = tokens.length > 0
    ? entries.filter((e) => tokens.every((t) => e.title.toLowerCase().includes(t)))
    : entries;

  const start = Math.max(0, (page - 1) * pageSize);
  const slice = filtered.slice(start, start + pageSize);

  const items: GameCatalogEntry[] = slice.map((e, idx) => ({
    id: `lr_${platform.slug}_${start + idx}_${encodeURIComponent(e.title)}`,
    title: e.title,
    platform: platform.name,
    platformSlug: platform.slug,
    coverUrl: platform.libretroThumbSystem ? buildLibretroBoxartUrl(platform.libretroThumbSystem, e.rawName) : null,
    releaseDate: null,
    publisher: e.region ? `Region: ${e.region}` : null,
    summary: `${platform.name} verified archive title (${e.rawName})`,
    genres: [],
    source: "libretro",
  }));

  return { items, total: filtered.length };
}

async function queryRawgPlatformCatalog(
  platform: GamePlatformConfig,
  query: string,
  page: number,
  pageSize: number,
  rawgApiKey: string
): Promise<{ items: GameCatalogEntry[]; total: number }> {
  if (!platform.rawgPlatformId || !rawgApiKey) return { items: [], total: 0 };

  const params = new URLSearchParams({
    key: rawgApiKey,
    platforms: String(platform.rawgPlatformId),
    page: String(page),
    page_size: String(pageSize),
  });
  if (query.trim()) {
    params.set("search", query.trim());
  } else {
    params.set("ordering", "-added");
  }

  const res = await fetch(`https://api.rawg.io/api/games?${params.toString()}`, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RAWG returned HTTP ${res.status}`);
  const data = await res.json();
  const results: any[] = data.results || [];

  return {
    total: Number(data.count || results.length || 0),
    items: results.map((g: any) => ({
      id: `rawg_${platform.slug}_${g.id}`,
      title: String(g.name || "Unknown"),
      platform: platform.name,
      platformSlug: platform.slug,
      coverUrl: g.background_image || null,
      releaseDate: g.released || null,
      publisher: g.metacritic ? `Metacritic ${g.metacritic}` : null,
      summary: null,
      genres: Array.isArray(g.genres) ? g.genres.map((x: any) => x.name).filter(Boolean) : [],
      source: "rawg",
    })),
  };
}

async function querySteamOrWikiCatalog(
  platform: GamePlatformConfig,
  query: string,
  pageSize: number
): Promise<{ items: GameCatalogEntry[]; total: number }> {
  const cleanQ = (query || "").trim();

  if (platform.slug === "pc") {
    const term = cleanQ || "top";
    const res = await fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`,
      { signal: AbortSignal.timeout(10000), cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const list: any[] = data.items || [];
      return {
        total: Number(data.total || list.length || 0),
        items: list.slice(0, pageSize).map((it: any) => ({
          id: `steam_pc_${it.id}`,
          title: String(it.name || "Unknown"),
          platform: platform.name,
          platformSlug: platform.slug,
          coverUrl: it.tiny_image ? String(it.tiny_image).replace("capsule_sm_120", "header") : null,
          releaseDate: null,
          publisher: it.metascore ? `Metascore ${it.metascore}` : "Steam Catalog",
          summary: null,
          genres: [],
          source: "steam",
        })),
      };
    }
  }

  // Fallback for modern Sony/Xbox when RAWG key is unset: Wikipedia media query scoped strictly to `<query> <platform> video game`
  const searchTerm = cleanQ ? `${cleanQ} ${platform.name} video game` : `List of ${platform.name} games`;
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchTerm)}&gsrlimit=${Math.min(20, pageSize)}&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=2&pithumbsize=500&format=json&origin=*`;
  const wRes = await fetch(wikiUrl, {
    headers: { "User-Agent": "Portalarr/1.6 (Homelab Game Vault)" },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!wRes.ok) return { items: [], total: 0 };
  const wData = await wRes.json();
  const pages = Object.values(wData?.query?.pages || {}) as any[];
  pages.sort((a, b) => (a.index || 0) - (b.index || 0));

  const cleaned = pages
    .filter((p) => !/^List of /i.test(p.title || ""))
    .map((p) => ({
      id: `wiki_${platform.slug}_${p.pageid}`,
      title: String(p.title || "").replace(/\s*\([^)]*video game[^)]*\)$/i, "").trim(),
      platform: platform.name,
      platformSlug: platform.slug,
      coverUrl: p.thumbnail?.source || null,
      releaseDate: null,
      publisher: null,
      summary: p.extract ? String(p.extract).trim() : null,
      genres: [],
      source: "wikipedia" as const,
    }));

  return { items: cleaned, total: cleaned.length };
}

export async function searchGamesByPlatform(
  platformSlug: string,
  query: string = "",
  page: number = 1,
  options: { rawgApiKey?: string; pageSize?: number } = {}
): Promise<{
  platform: GamePlatformConfig;
  items: GameCatalogEntry[];
  total: number;
  sourceLabel: string;
}> {
  const platform = getPlatformBySlug(platformSlug);
  const pageSize = Math.min(48, Math.max(12, options.pageSize || 24));
  const safePage = Math.max(1, page);
  const rawgKey = (options.rawgApiKey || "").trim();

  // 1. Nintendo Official Public Search API (Switch, Switch 2, 3DS, Wii U, DS) - Zero API Key Required!
  if (platform.nintendoSystemCode) {
    try {
      const nRes = await queryNintendoPlatformCatalog(platform, query, safePage, pageSize);
      if (nRes.items.length > 0 || !platform.libretroDatUrl) {
        return {
          platform,
          items: nRes.items,
          total: nRes.total,
          sourceLabel: "Nintendo Catalog",
        };
      }
    } catch (err) {
      console.warn(`[GAMES] Nintendo catalog notice for ${platform.slug}:`, err);
    }
  }

  // 2. Libretro No-Intro / Redump Verified ROM/ISO Databases + Boxart
  if (platform.libretroDatUrl) {
    try {
      const lRes = await queryLibretroCatalog(platform, query, safePage, pageSize);
      if (lRes.items.length > 0 || !rawgKey) {
        return {
          platform,
          items: lRes.items,
          total: lRes.total,
          sourceLabel: "Libretro No-Intro / Redump",
        };
      }
    } catch (err) {
      console.warn(`[GAMES] Libretro catalog notice for ${platform.slug}:`, err);
    }
  }

  // 3. Optional RAWG API Key (Rich cross-platform metadata for PS5, PS4, Xbox, PC, etc.)
  if (rawgKey && platform.rawgPlatformId) {
    try {
      const rRes = await queryRawgPlatformCatalog(platform, query, safePage, pageSize, rawgKey);
      return {
        platform,
        items: rRes.items,
        total: rRes.total,
        sourceLabel: "RAWG Games DB",
      };
    } catch (err) {
      console.warn(`[GAMES] RAWG catalog notice for ${platform.slug}:`, err);
    }
  }

  // 4. Steam / Wikipedia fallback for PC & modern consoles without RAWG key
  const fRes = await querySteamOrWikiCatalog(platform, query, pageSize);
  return {
    platform,
    items: fRes.items,
    total: fRes.total,
    sourceLabel: platform.slug === "pc" ? "Steam Storefront" : "Open Metadata",
  };
}

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx <= 1 ? val.toFixed(0) : val.toFixed(2)} ${units[idx]}`;
}

function normalizeGameMatchTokens(title: string): string[] {
  return (title || "")
    .toLowerCase()
    .replace(/[™®©:'’\-_,./\\()[\]]+/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !["the", "and", "for", "of", "edition", "nsw", "nsp", "nsz", "xci"].includes(w));
}

export function detectReleaseFormatTag(releaseTitle: string): string {
  const upper = (releaseTitle || "").toUpperCase();
  const formats = ["NSZ", "NSP", "XCI", "XCZ", "CIA", "3DS", "WUA", "WUX", "WUD", "RVZ", "CHD", "CSO", "FPKG", "PKG", "ISO", "Z64", "SFC", "GBA", "NDS", "NES"];
  for (const fmt of formats) {
    if (new RegExp(`(?:\\b|\\[|\\.|\\()${fmt}(?:\\b|\\]|\\)|$)`).test(upper)) {
      return fmt;
    }
  }
  return "NZB";
}

export function evaluateProwlarrGameRelease(
  raw: any,
  expectedTitle: string,
  platformSlug: string
): EvaluatedGameRelease {
  const platform = getPlatformBySlug(platformSlug);
  const title = String(raw?.title || "");
  const titleLower = title.toLowerCase();
  const formatTag = detectReleaseFormatTag(title);
  const isUpdateOrDlc = /\b(?:update|dlc|patch|addon|expansion\s+pass)\b/i.test(titleLower);

  const rawCategories: number[] = Array.isArray(raw?.categories)
    ? raw.categories.map((c: any) => Number(typeof c === "object" ? c.id : c)).filter((n: number) => Number.isFinite(n))
    : [];

  let score = 0;
  const reasons: string[] = [];

  // 1. Expected game title token matching
  const targetTokens = normalizeGameMatchTokens(expectedTitle);
  let matchedCount = 0;
  for (const tok of targetTokens) {
    if (titleLower.includes(tok)) matchedCount++;
  }
  const tokenRatio = targetTokens.length > 0 ? matchedCount / targetTokens.length : 1;

  if (tokenRatio >= 0.85) {
    score += 55;
    reasons.push("Exact Title");
  } else if (tokenRatio >= 0.5) {
    score += 25;
    reasons.push("Partial Title");
  } else {
    score -= 40;
    reasons.push("Title Mismatch");
  }

  // 2. Platform & extension verification
  const hasPlatformToken = platform.prowlarrPlatformTokens.some((tok) => titleLower.includes(tok));
  const hasPreferredExt = platform.preferredExtensions.includes(formatTag);
  const hasDisallowedPlatform = platform.disallowedPlatformTokens.some((tok) =>
    new RegExp(`(?:\\b|\\[|\\.|\\()${tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\b|\\]|\\)|$)`).test(titleLower)
  );

  if (hasPreferredExt) {
    score += 30;
    reasons.push(formatTag);
  }
  if (hasPlatformToken) {
    score += 20;
    reasons.push(platform.shortName);
  }
  if (hasDisallowedPlatform && !hasPreferredExt) {
    score -= 60;
    reasons.push("Wrong Platform");
  }

  // Prefer Base Game over Update/DLC-only files during auto-grab
  if (isUpdateOrDlc && !/\bbase\b|\bbasegame\b|\+\s*(?:upd|update|dlc)/i.test(titleLower)) {
    score -= 18;
    reasons.push("Update / DLC");
  }

  // Exclude obvious non-game audio/video/ebook junk
  if (/\b(?:soundtrack|ost|flac|mp3|pdf|epub|mkv|mp4|1080p|2160p|x264|x265|hevc|web-dl|bluray)\b/i.test(titleLower)) {
    score -= 80;
    reasons.push("Non-Game Media");
  }

  let matchQuality: "match" | "partial" | "mismatch" = "partial";
  if (score >= 55 && !hasDisallowedPlatform) {
    matchQuality = "match";
  } else if (score < 20 || (hasDisallowedPlatform && !hasPreferredExt)) {
    matchQuality = "mismatch";
  }

  const size = Number(raw?.size || 0);
  const publishDate = raw?.publishDate ? new Date(raw.publishDate).getTime() : NaN;
  const ageDays = Number.isFinite(publishDate)
    ? Math.max(0, Math.floor((Date.now() - publishDate) / 86400000))
    : typeof raw?.age === "number"
      ? raw.age
      : null;

  return {
    title,
    guid: String(raw?.guid || raw?.downloadUrl || title),
    downloadUrl: String(raw?.downloadUrl || raw?.magnetUrl || ""),
    indexer: String(raw?.indexer || "Prowlarr"),
    size,
    sizeLabel: formatBytesCompact(size),
    ageDays,
    protocol: String(raw?.protocol || "usenet").toLowerCase(),
    categories: rawCategories,
    formatTag,
    isUpdateOrDlc,
    matchQuality,
    score,
    matchReason: reasons.join(" • ") || platform.shortName,
  };
}
