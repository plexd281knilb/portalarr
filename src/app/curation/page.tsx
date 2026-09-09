import { Suspense } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { redirect } from "next/navigation";
import CurationStudio from "@/components/curation-studio";
import { Loader2 } from "lucide-react";

export const metadata = {
    title: "Curation & Poster Studio | Portalarr",
    description: "Automated Plex collections, high-DPI poster overlays, digital streaming countdowns, and leaving-soon prune management."
};

export default async function CurationPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
            <Suspense fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                </div>
            }>
                <CurationStudio />
            </Suspense>
        </div>
    );
}
