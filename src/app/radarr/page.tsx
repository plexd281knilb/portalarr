import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/auth-actions";
import { getEnabledArrInstances } from "@/app/arr-actions";
import RadarrClient from "@/components/arr/radarr-client";

export const dynamic = "force-dynamic";

export default async function RadarrPage() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }

    const res = await getEnabledArrInstances("radarr").catch((e: any) => ({
        success: false,
        data: undefined,
        error: e?.message || "Failed to load Radarr instances.",
    }));

    return (
        <RadarrClient
            initialInstances={res.success && Array.isArray(res.data) ? res.data : undefined}
            initialInstancesError={!res.success ? (res.error || "Failed to load Radarr instances.") : undefined}
        />
    );
}
