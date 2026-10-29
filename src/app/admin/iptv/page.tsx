import { Metadata } from "next";
import {
    getIptvSettingsAction,
    getIptvProvidersAction,
    getDvrConnectionsStatusAction,
    getIptvLiveTelemetryAction,
    getIptvUsersAccessAction,
    getIptvCatalogAction,
    auditLiveTvEcosystemAction
} from "@/app/iptv-actions";
import { AdminIptvClient } from "@/components/iptv/admin-iptv-client";

export const metadata: Metadata = {
    title: "Live TV & IPTV Mission Control | DomsHomeLab",
    description: "Manage IPTV providers, credential vault, Dispatcharr lineups, Plex/Jellyfin DVR connections, and live stream telemetry."
};

export const dynamic = "force-dynamic";

export default async function AdminIptvPage() {
    const [settingsRes, providersRes, dvrRes, telemetryRes, usersRes, catalogRes, auditRes] = await Promise.all([
        getIptvSettingsAction(),
        getIptvProvidersAction(),
        getDvrConnectionsStatusAction(),
        getIptvLiveTelemetryAction(),
        getIptvUsersAccessAction(),
        getIptvCatalogAction(),
        auditLiveTvEcosystemAction()
    ]);

    const initialData = {
        settings: settingsRes.success && settingsRes.data ? settingsRes.data : null,
        providers: providersRes.success && providersRes.data?.providers ? providersRes.data.providers : [],
        capacity: providersRes.success && providersRes.data?.capacity ? providersRes.data.capacity : null,
        dvr: dvrRes.success && dvrRes.data ? dvrRes.data : { dispatcharrBaseUrl: "", dvrNodes: [], profileEndpoints: [] },
        telemetry: telemetryRes.success && telemetryRes.data ? telemetryRes.data : { activeSessions: [], recentSessions: [], topChannels: [] },
        users: usersRes.success && usersRes.data?.users ? usersRes.data.users : [],
        pendingApprovals: usersRes.success && usersRes.data?.pendingApprovals ? usersRes.data.pendingApprovals : [],
        channels: catalogRes.success && catalogRes.data?.channels ? catalogRes.data.channels : [],
        requests: catalogRes.success && catalogRes.data?.requests ? catalogRes.data.requests : [],
        auditReport: auditRes.success && auditRes.data ? auditRes.data : null
    };

    return <AdminIptvClient initialData={initialData} />;
}
