import type { Metadata } from "next";
import AccessSettingsClient from "@/components/settings/access-settings-client";

export const metadata: Metadata = {
    title: "Access & Users Settings",
    description: "Manage Portalarr user accounts, approvals, payments, and Plex permissions."
};

export default function AccessSettingsPage() {
    return <AccessSettingsClient />;
}
