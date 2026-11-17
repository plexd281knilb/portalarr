import type { Metadata } from "next";
import { getCurrentUser } from "@/app/auth-actions";
import { getPlexSetupGuides, getUserGuideAccessAction } from "@/app/actions";
import GuidesClient from "@/components/guides-client";

export const metadata: Metadata = {
    title: "Setup Guides",
    description: "Step-by-step setup guides for Plex, Jellyfin, Emby, ebooks, and player optimization."
};

export const dynamic = "force-dynamic";

export default async function GuidesPage() {
    const [guides, user, access] = await Promise.all([
        getPlexSetupGuides().catch(() => []),
        getCurrentUser().catch(() => null),
        getUserGuideAccessAction().catch(() => null),
    ]);

    return (
        <GuidesClient
            initialGuides={guides}
            initialUser={user}
            initialAccess={access}
        />
    );
}
