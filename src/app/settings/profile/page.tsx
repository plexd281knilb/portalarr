import ProfilePage from "@/app/profile/page";

export const dynamic = "force-dynamic";

/**
 * Legacy Settings Profile Route (/settings/profile)
 * Re-exports the primary ProfilePage for backward compatibility.
 * All end-user links target /profile directly (kept open at the Cloudflare edge, while /settings* is locked down).
 */
export default async function SettingsProfilePage() {
    return <ProfilePage />;
}
