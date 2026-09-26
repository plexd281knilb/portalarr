import { getSession } from "@/app/auth-actions";
import { DiscoverHub } from "@/components/seerr/discover-hub";
import { Compass } from "lucide-react";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default async function DiscoverPage(props: {
    searchParams?: Promise<{ tab?: string; section?: string }>;
}) {
    const session = await getSession();
    const isAdmin = session?.role === "ADMIN" || session?.role === "SUPER_USER";
    const searchParams = props.searchParams ? await props.searchParams : {};
    const tabParam = (searchParams.tab || "").toLowerCase();
    const sectionParam = (searchParams.section || "").toLowerCase();

    const validTabs = ["discover", "movies", "tv", "ebooks", "audiobooks", "requests"];
    const initialTab = (
        validTabs.includes(tabParam) ? tabParam : "discover"
    ) as "discover" | "movies" | "tv" | "ebooks" | "audiobooks" | "requests";

    const initialSection = sectionParam === "kids" ? "kids" : "main";

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <main className="flex-1 p-2.5 sm:p-5 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto w-full space-y-4 sm:space-y-6 min-w-0">
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
                                Browse trending movies, popular TV shows, bestselling books, audiobooks, and request media with 1-click automatic download.
                            </p>
                        </div>
                    </div>
                </section>

                {/* All-in-one Discover & Request Hub */}
                <Suspense fallback={
                    <div className="p-16 text-center space-y-3">
                        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                        <p className="text-xs text-muted-foreground animate-pulse">Loading Discover Hub...</p>
                    </div>
                }>
                    <DiscoverHub 
                        isAdmin={isAdmin} 
                        initialTab={initialTab} 
                        initialSection={initialSection} 
                    />
                </Suspense>
            </main>
        </div>
    );
}
