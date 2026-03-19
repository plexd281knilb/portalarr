import ReactMarkdown from 'react-markdown'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { getBetaCards } from '@/app/actions'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export const dynamic = "force-dynamic";

export default async function BetaPage() {
  const betaCards = await getBetaCards()

  return (
    <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-muted/20">
            <div className="flex h-16 items-center px-6 gap-4 max-w-7xl mx-auto w-full">
                <Button asChild variant="ghost" size="sm">
                    <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard</Link>
                </Button>
            </div>
        </header>

        <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-8 pb-12 mt-8">
            <div className="mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl mb-4">Beta Testing & Services</h1>
                <p className="text-muted-foreground text-lg">
                    Check out the latest features currently in testing. Follow the instructions on the cards below to participate.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {betaCards.length === 0 ? (
                    <div className="col-span-full text-center p-12 text-muted-foreground border rounded-lg border-dashed">
                        No beta tests are currently active. Check back later!
                    </div>
                ) : (
                    betaCards.map((card: any) => (
                    <Card key={card.id} className="flex flex-col shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader>
                        <CardTitle className="text-xl">{card.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex-grow prose prose-sm dark:prose-invert">
                            <ReactMarkdown>{card.content}</ReactMarkdown>
                        </CardContent>
                        {(card.buttonText && card.buttonUrl) && (
                        <CardFooter>
                            <Button asChild className="w-full">
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
  )
}