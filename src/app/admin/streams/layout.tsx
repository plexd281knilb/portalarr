import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Live Streams",
    description: "Monitor live Plex, Jellyfin, Emby, and Live TV sessions."
};

export default function AdminStreamsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
