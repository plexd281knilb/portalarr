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
    if (user.role !== "ADMIN") {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-background p-3 sm:p-6 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto space-y-4 sm:space-y-6 w-full min-w-0">
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
