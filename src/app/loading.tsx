import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Server, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

function CardSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-500">
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-8">
        <section className="text-center space-y-4 py-8">
          <Skeleton className="h-12 w-2/3 mx-auto" />
          <Skeleton className="h-6 w-1/2 mx-auto" />
        </section>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>

        <div className="w-full">
          <Card className="w-full">
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        </div>

        <div className="w-full">
          <Card className="bg-muted/30 border-primary/20">
            <CardHeader>
              <Skeleton className="h-8 w-1/4" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
