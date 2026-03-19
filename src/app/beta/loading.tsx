import { Loader2, Sparkles } from "lucide-react";

export default function BetaLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
      <div className="flex items-center gap-2 animate-pulse mb-4">
        <Sparkles className="h-10 w-10 text-primary" />
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <p className="text-lg font-medium">Loading Beta Services...</p>
      </div>
    </div>
  );
}