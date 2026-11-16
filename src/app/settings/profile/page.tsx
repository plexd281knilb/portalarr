import { redirect } from "next/navigation";

/**
 * Legacy Settings Profile Route (/settings/profile)
 * Redirects to the canonical /profile route.
 */
export default function SettingsProfilePage() {
    redirect("/profile");
}
