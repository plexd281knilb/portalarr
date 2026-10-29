import { Metadata } from "next";
import { getIptvCatalogAction } from "@/app/iptv-actions";
import { ChannelsClient } from "@/components/iptv/channels-client";

export const metadata: Metadata = {
    title: "Live TV & Channels | DomsHomeLab",
    description: "Browse live television channels, sports feeds, news networks, and request missing channels."
};

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
    const res = await getIptvCatalogAction();
    const data = res.success && res.data ? res.data : {
        userAccess: { canAccessIptv: false, maxConcurrentStreams: 1, hasPendingAccessRequest: false, isAdmin: false },
        profiles: [],
        channels: [],
        requests: [],
        tokens: []
    };

    return <ChannelsClient initialData={data} />;
}
