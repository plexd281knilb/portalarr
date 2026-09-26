import { getSession } from "@/app/auth-actions";
import { DiscoverHub } from "@/components/seerr/discover-hub";
import { Inbox } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
    const session = await getSession();
    const isAdmin = session?.role === "ADMIN" || session?.role === "SUPER_USER";

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <main className="flex-1 p-2.5 sm:p-5 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto w-full space-y-4 sm:space-y-6 min-w-0">
                {/* Header Section */}
                <section className="space-y-1 sm:space-y-2 py-2 sm:py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.25)]">
                            <Inbox className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
                                Media Requests & Dispatch
                            </h1>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                                Track the real-time download and library availability status of your requested movies and TV series.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Direct to Requests tab on DiscoverHub */}
                <DiscoverHub isAdmin={isAdmin} initialTab="requests" />
            </main>
        </div>
    );
}
