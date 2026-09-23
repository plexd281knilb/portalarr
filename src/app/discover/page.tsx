import { getSession } from "@/app/auth-actions";
import { DiscoverHub } from "@/components/seerr/discover-hub";
import { Compass } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
    const session = await getSession();
    const isAdmin = session?.role === "ADMIN" || session?.role === "SUPER_USER";

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <main className="flex-1 p-3 sm:p-5 lg:p-8 max-w-7xl mx-auto w-full space-y-6">
                {/* Header Section */}
                <section className="space-y-1 sm:space-y-2 py-2 sm:py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-[0_0_15px_rgba(52,211,153,0.25)]">
                            <Compass className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                                Discover & Media Requests
                            </h1>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                Browse trending movies, popular TV shows, watch trailers, and request media with 1-click automatic download.
                            </p>
                        </div>
                    </div>
                </section>

                {/* All-in-one Discover & Request Hub */}
                <DiscoverHub isAdmin={isAdmin} />
            </main>
        </div>
    );
}
