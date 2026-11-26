import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/auth-actions";
import { getGameVaultOverviewAction } from "@/app/game-actions";
import GamesVaultClient from "@/components/games/games-vault-client";

export const metadata: Metadata = {
  title: "Game Vault",
  description: "Search games by platform, grab releases via Prowlarr and SABnzbd, and auto-refresh Ownfoil.",
};

export const dynamic = "force-dynamic";

export default async function GamesPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "ADMIN") {
    redirect("/");
  }

  const overview = await getGameVaultOverviewAction().catch((e: any) => ({
    success: false,
    error: e?.message || "Failed loading Game Vault",
  }));

  return <GamesVaultClient initialOverview={overview as any} isAdmin={user.role === "ADMIN"} />;
}
