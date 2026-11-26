"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { decryptData, encryptData } from "@/lib/encryption";
import { getSession } from "@/app/auth-actions";
import {
  fetchOwnfoilOwnedTitles,
  getOwnfoilInstance,
  testOwnfoilConnection,
  triggerOwnfoilLibraryScan,
} from "@/lib/games/ownfoil";
import {
  GAME_PLATFORMS,
  getPlatformBySlug,
  searchGamesByPlatform,
} from "@/lib/games/platforms";
import {
  launchGameDownloadMonitor,
  pushGameNzbToSabnzbd,
  queryProwlarrForGame,
  syncActiveGameDownloadsInternal,
} from "@/lib/games/downloads";

async function verifyGameVaultAccess() {
  if (process.env.NODE_ENV !== "production" && process.env.PORTALARR_TEST_AUTH === "true") {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (admin) return { ...admin, userId: admin.id };
    return { id: "test-admin", userId: "test-admin", username: "admin", role: "ADMIN", status: "APPROVED" } as any;
  }

  const session = await getSession();
  if (!session || (!session.userId && !session.id)) {
    throw new Error("Unauthorized");
  }
  const role = String(session.role || "").toUpperCase();
  const status = String((session as any).status || "APPROVED").toUpperCase();
  if (role !== "ADMIN" && role !== "SUPER_USER") {
    throw new Error("Forbidden: Admin or Super User access required");
  }
  if (role !== "ADMIN" && ["PENDING", "REJECTED", "SUSPENDED", "EXPIRED"].includes(status)) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getGameVaultOverviewAction() {
  try {
    await verifyGameVaultAccess();

    const [prowlarrApp, sabApp, ownfoilApp, settings, requests, ownfoilInventory] = await Promise.all([
      prisma.mediaApp.findFirst({ where: { OR: [{ type: "prowlarr" }, { name: { contains: "prowlarr" } }] } }),
      prisma.mediaApp.findFirst({ where: { OR: [{ type: "sabnzbd" }, { name: { contains: "sabnzbd" } }] } }),
      getOwnfoilInstance(),
      prisma.settings.findUnique({
        where: { id: "global" },
        select: {
          gamesSabCategory: true,
          ownfoilScanOnDownload: true,
          rawgApiKey: true,
        },
      }),
      prisma.gameRequest.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      fetchOwnfoilOwnedTitles().catch(() => ({ connected: false, ownedTitlesNormalized: [] })),
    ]);

    return {
      success: true,
      integrations: {
        prowlarrConfigured: Boolean(prowlarrApp),
        prowlarrName: prowlarrApp?.name || null,
        sabnzbdConfigured: Boolean(sabApp),
        sabnzbdName: sabApp?.name || null,
        ownfoilConfigured: Boolean(ownfoilApp),
        ownfoilName: ownfoilApp?.name || null,
        ownfoilUrl: ownfoilApp?.externalUrl || ownfoilApp?.baseUrl || null,
        ownfoilConnected: ownfoilInventory.connected,
        ownfoilTitleCount: ownfoilInventory.ownedTitlesNormalized.length,
        hasRawgKey: Boolean(settings?.rawgApiKey),
      },
      settings: {
        gamesSabCategory: settings?.gamesSabCategory || "games",
        ownfoilScanOnDownload: settings?.ownfoilScanOnDownload !== false,
      },
      ownedTitlesNormalized: ownfoilInventory.ownedTitlesNormalized,
      requests,
      platforms: GAME_PLATFORMS.map((p) => ({
        slug: p.slug,
        name: p.name,
        shortName: p.shortName,
        manufacturer: p.manufacturer,
        defaultSabCategory: p.defaultSabCategory,
      })),
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to load Game Vault overview." };
  }
}

export async function searchPlatformGamesAction(
  platformSlug: string,
  query: string = "",
  page: number = 1
) {
  try {
    await verifyGameVaultAccess();
    const settings = await prisma.settings
      .findUnique({
        where: { id: "global" },
        select: { rawgApiKey: true },
      })
      .catch(() => null);
    const rawgKey = settings?.rawgApiKey ? decryptData(settings.rawgApiKey) : "";
    const result = await searchGamesByPlatform(platformSlug, query, page, {
      rawgApiKey: rawgKey,
      pageSize: 24,
    });
    return {
      success: true,
      platform: {
        slug: result.platform.slug,
        name: result.platform.name,
        shortName: result.platform.shortName,
      },
      items: result.items,
      total: result.total,
      sourceLabel: result.sourceLabel,
    };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to search platform games." };
  }
}

export async function searchGameReleasesAction(title: string, platformSlug: string) {
  try {
    await verifyGameVaultAccess();
    return await queryProwlarrForGame(title, platformSlug);
  } catch (e: any) {
    return { success: false, releases: [], error: e?.message || "Prowlarr search failed." };
  }
}

export async function downloadGameReleaseAction(input: {
  title: string;
  platformSlug: string;
  externalId?: string | null;
  coverUrl?: string | null;
  releaseDate?: string | null;
  publisher?: string | null;
  summary?: string | null;
  releaseTitle: string;
  downloadUrl: string;
  indexer?: string | null;
  sizeBytes?: number | null;
  sabCategory?: string | null;
}) {
  try {
    const session = await verifyGameVaultAccess();
    const platform = getPlatformBySlug(input.platformSlug);
    const settings = await prisma.settings
      .findUnique({
        where: { id: "global" },
        select: { gamesSabCategory: true },
      })
      .catch(() => null);

    const effectiveCategory = (input.sabCategory || settings?.gamesSabCategory || platform.defaultSabCategory || "games").trim();
    const username = String((session as any).username || "Admin");

    const sabRes = await pushGameNzbToSabnzbd({
      downloadUrl: input.downloadUrl,
      releaseTitle: input.releaseTitle,
      category: effectiveCategory,
    });

    if (!sabRes.success) {
      return { success: false, error: sabRes.error || "Failed sending release to SABnzbd." };
    }

    const req = await prisma.gameRequest.create({
      data: {
        title: input.title,
        platform: platform.name,
        platformSlug: platform.slug,
        externalId: input.externalId || null,
        coverUrl: input.coverUrl || null,
        releaseDate: input.releaseDate || null,
        publisher: input.publisher || null,
        summary: input.summary || null,
        sabCategory: effectiveCategory,
        status: "Downloading",
        releaseTitle: input.releaseTitle,
        indexer: input.indexer || "Prowlarr",
        sizeBytes: typeof input.sizeBytes === "number" ? input.sizeBytes : null,
        downloadId: sabRes.downloadId || null,
        downloadProgress: 0,
        ownfoilRefreshed: false,
        requestedBy: username,
      },
    });

    launchGameDownloadMonitor(req.id);
    revalidatePath("/games");
    return { success: true, request: req };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed to queue download." };
  }
}

export async function autoGrabBestGameReleaseAction(input: {
  title: string;
  platformSlug: string;
  externalId?: string | null;
  coverUrl?: string | null;
  releaseDate?: string | null;
  publisher?: string | null;
  summary?: string | null;
}) {
  try {
    await verifyGameVaultAccess();
    const searchRes = await queryProwlarrForGame(input.title, input.platformSlug);
    if (!searchRes.success) {
      return { success: false, error: searchRes.error || "Prowlarr search failed." };
    }

    const best =
      searchRes.releases.find((r) => r.matchQuality === "match" && !r.isUpdateOrDlc) ||
      searchRes.releases.find((r) => r.matchQuality === "match") ||
      searchRes.releases.find((r) => r.matchQuality === "partial");

    if (!best) {
      return {
        success: false,
        error: `No matching ${getPlatformBySlug(input.platformSlug).name} release found on Prowlarr for "${input.title}". Try manual search to inspect all releases.`,
      };
    }

    return await downloadGameReleaseAction({
      ...input,
      releaseTitle: best.title,
      downloadUrl: best.downloadUrl,
      indexer: best.indexer,
      sizeBytes: best.size,
    });
  } catch (e: any) {
    return { success: false, error: e?.message || "Auto-grab failed." };
  }
}

export async function syncGameDownloadsAction(): Promise<{
  success: boolean;
  updatedCount?: number;
  ownfoilTriggered?: boolean;
  requests?: any[];
  error?: string;
}> {
  try {
    await verifyGameVaultAccess();
    const syncRes = await syncActiveGameDownloadsInternal();
    const requests = await prisma.gameRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return { success: true, ...syncRes, requests };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed syncing downloads." };
  }
}

export async function triggerOwnfoilRefreshAction() {
  try {
    await verifyGameVaultAccess();
    const res = await triggerOwnfoilLibraryScan();
    if (res.success) {
      await prisma.gameRequest.updateMany({
        where: { status: "Completed", ownfoilRefreshed: false },
        data: {
          status: "Ownfoil Refreshed",
          ownfoilRefreshed: true,
          ownfoilRefreshedAt: new Date(),
        },
      });
    }
    return res;
  } catch (e: any) {
    return { success: false, message: e?.message || "Failed refreshing Ownfoil." };
  }
}

export async function testOwnfoilConfigAction(url: string, credentials: string = "") {
  try {
    await verifyGameVaultAccess();
    return await testOwnfoilConnection(url, credentials);
  } catch (e: any) {
    return { success: false, error: e?.message || "Connection test failed." };
  }
}

export async function updateGameVaultSettingsAction(input: {
  gamesSabCategory?: string;
  ownfoilScanOnDownload?: boolean;
  rawgApiKey?: string;
}) {
  try {
    await verifyGameVaultAccess();
    const data: Record<string, any> = {};
    if (typeof input.gamesSabCategory === "string" && input.gamesSabCategory.trim()) {
      data.gamesSabCategory = input.gamesSabCategory.trim().slice(0, 64);
    }
    if (typeof input.ownfoilScanOnDownload === "boolean") {
      data.ownfoilScanOnDownload = input.ownfoilScanOnDownload;
    }
    if (typeof input.rawgApiKey === "string") {
      const cleanKey = input.rawgApiKey.trim();
      data.rawgApiKey = cleanKey ? encryptData(cleanKey) : null;
    }
    await prisma.settings.upsert({
      where: { id: "global" },
      update: data,
      create: { id: "global", ...data },
    });
    revalidatePath("/games");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed updating settings." };
  }
}

export async function deleteGameRequestAction(id: string) {
  try {
    await verifyGameVaultAccess();
    await prisma.gameRequest.delete({ where: { id } }).catch(() => null);
    revalidatePath("/games");
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || "Failed removing entry." };
  }
}
