import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Scripts & Automation",
    description: "Manage scheduled and ad-hoc homelab maintenance scripts."
};

export default function AdminScriptsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
