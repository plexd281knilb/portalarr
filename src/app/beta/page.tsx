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
            <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-8 pb-12 mt-8">
                <div className="mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4 text-primary">
                        Beta Testing & Services
                    </h1>
                    <p className="text-muted-foreground text-lg">
                        Check out the latest features currently in testing. Follow the instructions on the cards below to participate.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {betaCards.length === 0 ? (
                        <div className="col-span-full text-center p-12 text-muted-foreground border rounded-lg border-dashed bg-muted/10">
                            No beta tests are currently active. Check back later!
                        </div>
                    ) : (
                        betaCards.map((card: any) => (
                            <Card key={card.id} className="flex flex-col shadow-sm border-primary/10 hover:shadow-md transition-all">
                                <CardHeader>
                                    <CardTitle className="text-xl font-bold">{card.title}</CardTitle>
                                </CardHeader>
                                
                                <CardContent className="flex-1 prose prose-sm dark:prose-invert max-w-none break-words overflow-hidden pb-6">
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]} 
                                        rehypePlugins={[rehypeRaw]}
                                    >
                                        {card.content}
                                    </ReactMarkdown>
                                </CardContent>
                                
                                {card.buttonText && card.buttonUrl && (
                                    <CardFooter className="pt-0">
                                        <Button asChild className="w-full font-semibold">
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
            </main>
        </div>
    );
}