import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "System Monitoring",
    description: "Inspect Docker containers, Glances hardware metrics, and host health."
};

export default function AdminMonitoringLayout({ children }: { children: React.ReactNode }) {
    return children;
}
