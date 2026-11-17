import Link from "next/link";
import { Compass, FileQuestion, Home, Library, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
    title: "Page Not Found"
};

export default function NotFound() {
    return (
        <div className="min-h-[75vh] w-full flex items-center justify-center p-4 sm:p-6">
            <Card className="w-full max-w-lg border-border/70 bg-card/80 backdrop-blur-sm shadow-xl">
                <CardContent className="pt-8 pb-7 px-6 text-center space-y-5">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
                        <FileQuestion className="h-7 w-7" />
                    </div>
                    <div className="space-y-2">
                        <span className="inline-block font-mono text-xs font-semibold uppercase tracking-widest text-amber-400">
                            404 • Route Not Found
                        </span>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            We could not find that page
                        </h1>
                        <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
                            The link may have moved, expired, or require different account permissions. Choose a destination below to continue.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                        <Button asChild size="sm" className="gap-1.5 font-semibold">
                            <Link href="/">
                                <Home className="h-4 w-4" /> Dashboard
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <Link href="/discover">
                                <Compass className="h-4 w-4" /> Discover
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <Link href="/library">
                                <Library className="h-4 w-4" /> Library
                            </Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                            <Link href="/login">
                                <LogIn className="h-4 w-4" /> Sign In
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
