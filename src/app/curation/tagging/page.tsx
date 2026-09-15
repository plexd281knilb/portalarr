import { Suspense } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { redirect } from "next/navigation";
import { TaggingStudio } from "@/components/curation/tagging-studio";
import { Loader2 } from "lucide-react";

export const metadata = {
    title: "Plex Media Tagging & Content Advisory Studio | Portalarr",
    description: "IMDb Parental Guide advisory severity tags (Nudity, Violence, Profanity, Alcohol/Drugs, Frightening), custom Plex labels/genres, and rule-based auto-taggers."
};

export default async function CurationTaggingPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
            <Suspense fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                </div>
            }>
                <TaggingStudio />
            </Suspense>
        </div>
    );
}
