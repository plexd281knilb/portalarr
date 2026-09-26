"use client";

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, Sparkles, HelpCircle, CheckCircle2 } from 'lucide-react';

export default function BetaPage() {
    return (
        <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-300">
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full min-w-0 space-y-8 mt-4 sm:mt-6 pb-16">
                
                <div className="flex items-center justify-between gap-3">
                    <Button asChild variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Dashboard</span>
                        </Link>
                    </Button>
                </div>

                <div className="space-y-3 text-center sm:text-left">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Experimental Features</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
                        Beta Testing & Services
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed">
                        Early preview programs and experimental service integrations for Portalarr members.
                    </p>
                </div>

                <Card className="rounded-2xl border-border/50 bg-[#121218]/80 backdrop-blur-md p-8 sm:p-12 text-center space-y-6">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                        <Sparkles className="h-8 w-8" />
                    </div>

                    <div className="space-y-2 max-w-md mx-auto">
                        <h3 className="text-xl font-bold text-foreground">No Active Beta Tests</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            There are currently no active public beta programs running. New features and preview services will be posted here when ready.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <Button asChild variant="default" size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-4">
                            <Link href="/">Return to Dashboard</Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="text-xs font-semibold gap-1.5 border-border/60">
                            <Link href="/guides">
                                <HelpCircle className="h-3.5 w-3.5 text-sky-400" />
                                <span>View Setup Guides</span>
                            </Link>
                        </Button>
                    </div>
                </Card>

            </main>
        </div>
    );
}