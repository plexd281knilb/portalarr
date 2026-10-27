"use client";

import ProfilePage from "@/app/profile/page";

/**
 * Legacy Settings Profile Route (/settings/profile)
 * Re-exports the primary ProfilePage for backward compatibility.
 * All end-user links and Cloudflare Edge bypass policies target /profile directly.
 */
export default function SettingsProfilePage() {
    return <ProfilePage />;
}
