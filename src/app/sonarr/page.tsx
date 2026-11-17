import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/auth-actions";
import { getEnabledArrInstances } from "@/app/arr-actions";
import SonarrClient from "@/components/arr/sonarr-client";

export const dynamic = "force-dynamic";

export default async function SonarrPage() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }

    const res = await getEnabledArrInstances("sonarr").catch((e: any) => ({
        success: false,
        data: undefined,
        error: e?.message || "Failed to load Sonarr instances.",
    }));

    return (
        <SonarrClient
            initialInstances={res.success && Array.isArray(res.data) ? res.data : undefined}
            initialInstancesError={!res.success ? (res.error || "Failed to load Sonarr instances.") : undefined}
        />
    );
}
