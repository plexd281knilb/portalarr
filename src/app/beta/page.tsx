"use client";

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Sparkles, HelpCircle, CheckCircle2 } from 'lucide-react';

export default function BetaPage() {
    return (
        <div className="flex-1 max-w-4xl mx-auto w-full min-w-0 space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between gap-3">
                <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <Link href="/">
                        <ArrowLeft className="h-4 w-4" />
                        <span>Back to Dashboard</span>
                    </Link>
                </Button>
            </div>

            <div className="space-y-2 text-center sm:text-left">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground text-balance">
                    Beta Testing & Services
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm max-w-2xl leading-relaxed">
                    Early preview programs and experimental service integrations for community members.
                </p>
            </div>

            <Card className="rounded-xl border-border/50 bg-card/95 dark:bg-[#121218]/80 backdrop-blur-md p-6 sm:p-12 text-center space-y-6">
                <div className="mx-auto w-14 h-14 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-700 dark:text-amber-400">
                    <Sparkles className="h-7 w-7" />
                </div>

                <div className="space-y-2 max-w-md mx-auto">
                    <h3 className="text-lg sm:text-xl font-bold text-foreground">No Active Beta Tests</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        There are currently no active public beta programs running. New features and preview services will be posted here when ready.
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                    <Button asChild variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4">
                        <Link href="/">Return to Dashboard</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="text-xs font-semibold gap-1.5 border-border/60">
                        <Link href="/guides">
                            <HelpCircle className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" />
                            <span>View Setup Guides</span>
                        </Link>
                    </Button>
                </div>
            </Card>
        </div>
    );
}