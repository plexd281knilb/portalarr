"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getBetaCards } from '@/app/actions';
import Link from 'next/link';
import { ArrowLeft, Server } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import FeatureVotingPoll from '@/components/feature-voting-poll';

export default function BetaPage() {
    const [betaCards, setBetaCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadCards() {
            try {
                const cards = await getBetaCards();
                setBetaCards(cards || []);
            } catch (error) {
                console.error("Failed to load beta cards:", error);
            } finally {
                setLoading(false);
            }
        }
        loadCards();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-500">
                <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-8 mt-8">
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-2/3" />
                        <Skeleton className="h-6 w-1/2" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="flex flex-col p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-24 w-full"/><Skeleton className="h-10 w-full"/></Card>
                        <Card className="flex flex-col p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-24 w-full"/><Skeleton className="h-10 w-full"/></Card>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col animate-in fade-in duration-500">
            <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto w-full space-y-8 pb-12 mt-4 sm:mt-6">
                <div className="space-y-3">
                    <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
                        🧪 Beta Testing & Services
                    </h1>
                    <p className="text-muted-foreground text-sm sm:text-base lg:text-lg max-w-3xl">
                        Preview and test upcoming services, features, and integrations. Follow the instructions on the cards below to participate.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {betaCards.length === 0 ? (
                        <div className="col-span-full text-center p-12 text-muted-foreground border rounded-2xl border-dashed border-border/50 bg-muted/10">
                            No beta tests are currently active. Check back later!
                        </div>
                    ) : (
                        betaCards.map((card: any) => (
                            <Card key={card.id} className="flex flex-col shadow-sm border-purple-500/20 bg-[#121218]/80 backdrop-blur-md hover:border-purple-500/40 hover:ring-2 hover:ring-purple-500/20 hover:shadow-lg transition-all duration-200 rounded-2xl">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-lg sm:text-xl font-bold text-foreground flex items-center justify-between">
                                        <span>{card.title}</span>
                                        <span className="text-[10px] font-semibold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                                            BETA
                                        </span>
                                    </CardTitle>
                                </CardHeader>
                                
                                <CardContent className="flex-1 prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden pb-6 text-muted-foreground">
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]} 
                                        rehypePlugins={[rehypeRaw]}
                                    >
                                        {card.content}
                                    </ReactMarkdown>
                                </CardContent>
                                
                                {card.buttonText && card.buttonUrl && (
                                    <CardFooter className="pt-0">
                                        <Button asChild className="w-full font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all duration-200 hover:ring-2 hover:ring-purple-400/50 hover:shadow-md active:scale-98 h-10">
                                            <a href={card.buttonUrl} target="_blank" rel="noreferrer">
                                                {card.buttonText}
                                            </a>
                                        </Button>
                                    </CardFooter>
                                )}
                            </Card>
                        ))
                    )}
                </div>

                <div className="w-full pt-4">
                    <FeatureVotingPoll />
                </div>
            </main>
        </div>
    );
}