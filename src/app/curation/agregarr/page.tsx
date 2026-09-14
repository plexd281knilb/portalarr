import { Suspense } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { redirect } from "next/navigation";
import { AgregarrStudio } from "@/components/curation/agregarr-studio";
import { Loader2 } from "lucide-react";

export const metadata = {
    title: "Agregarr Collections & Coming Soon Hub | Portalarr",
    description: "Automated TMDb/Trakt/MDBList collections, Plex Home screen ranking (#1-#99), seasonal schedules, upcoming releases, and coming soon banners."
};

export default async function CurationAgregarrPage() {
    const user = await getCurrentUser();
    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
            <Suspense fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            }>
                <AgregarrStudio />
            </Suspense>
        </div>
    );
}
