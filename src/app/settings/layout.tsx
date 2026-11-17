import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Admin Settings",
    description: "Configure Portalarr integrations, billing, email delivery, and schedules."
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
