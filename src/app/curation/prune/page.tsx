import { Suspense } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { redirect } from "next/navigation";
import { PruneStudio } from "@/components/curation/prune-studio";
import { Loader2 } from "lucide-react";

export const metadata = {
    title: "Maintainerr Storage & Auto-Prune | Portalarr",
    description: "Storage mount thresholds, rule-based media pruning (unwatched, low rating, ended series), pinned 'Leaving Soon' Plex collection, and safe file cleanup."
};

export default async function CurationPrunePage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }
    if (user.role !== "ADMIN") {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto space-y-4 sm:space-y-6 w-full min-w-0">
            <Suspense fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                </div>
            }>
                <PruneStudio />
            </Suspense>
        </div>
    );
}
