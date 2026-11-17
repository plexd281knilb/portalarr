import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function RouteLoadingShell({
    cards = 3,
    withRows = true
}: {
    cards?: number;
    withRows?: boolean;
}) {
    return (
        <div className="min-h-[70vh] w-full max-w-7xl mx-auto p-4 sm:p-6 space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-52" />
                    <Skeleton className="h-4 w-80 max-w-full" />
                </div>
                <Skeleton className="h-9 w-36" />
            </div>

            {cards > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: cards }).map((_, i) => (
                        <Card key={i} className="py-4 gap-3">
                            <CardHeader className="px-4 space-y-2">
                                <Skeleton className="h-4 w-1/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </CardHeader>
                            <CardContent className="px-4 space-y-2.5">
                                <Skeleton className="h-9 w-full" />
                                <Skeleton className="h-9 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {withRows && (
                <Card className="py-4 gap-3">
                    <CardHeader className="px-4 space-y-2">
                        <Skeleton className="h-5 w-44" />
                    </CardHeader>
                    <CardContent className="px-4 space-y-2.5">
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                        <Skeleton className="h-11 w-full" />
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
