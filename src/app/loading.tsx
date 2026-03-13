import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex flex-col p-6 space-y-8">
      <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
        <Skeleton className="h-10 w-48" /> {/* Logo/Title */}
        <Skeleton className="h-10 w-32" /> {/* Login Button */}
      </div>

      <main className="max-w-7xl mx-auto w-full space-y-8">
        {/* App Links Skeleton */}
        <Card>
          <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </CardContent>
        </Card>

        {/* Active Downloads Skeleton */}
        <div className="w-full">
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}