"use client";

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getBetaCards } from '@/app/actions';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

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
            <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading beta services...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <header className="border-b bg-muted/20">
                <div className="flex h-16 items-center px-6 gap-4 max-w-7xl mx-auto w-full">
                    <Button asChild variant="ghost" size="sm">
                        <Link href="/">
                            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
                        </Link>
                    </Button>
                </div>
            </header>

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