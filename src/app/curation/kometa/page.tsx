import { Suspense } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { redirect } from "next/navigation";
import { KometaStudio } from "@/components/curation/kometa-studio";
import { Loader2 } from "lucide-react";

export const metadata = {
    title: "Kometa Overlays & Badges | Portalarr",
    description: "4K UHD, HDR, Dolby Vision dovetailing, studio audio codecs, US age ratings, network logos, and tiered gloss ribbons."
};

export default async function CurationKometaSubPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }
    if (user.role !== "ADMIN") {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
            <Suspense fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                </div>
            }>
                <KometaStudio />
            </Suspense>
        </div>
    );
}
