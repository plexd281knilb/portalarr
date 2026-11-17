import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Stream Intelligence & Tautulli",
    description: "View stream analytics, quality doctor telemetry, and sharing alerts."
};

export default function AdminTautulliLayout({ children }: { children: React.ReactNode }) {
    return children;
}
