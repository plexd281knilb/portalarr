import { Loader2, Server } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center gap-2 animate-pulse mb-4">
        <Server className="h-10 w-10 text-primary" />
        <span className="text-2xl font-bold">Portalarr</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-lg">Loading system dashboard...</p>
      </div>
      <p className="text-sm text-muted-foreground/60 max-w-xs text-center">
        Fetching real-time stats, app status, and active downloads.
      </p>
    </div>
  );
}