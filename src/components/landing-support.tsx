"use client";

import { useState } from "react";
import { submitSupportTicket } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function LandingSupport({ initialTickets }: { initialTickets: any[] }) {
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target as HTMLFormElement);
        await submitSupportTicket(formData);
        setLoading(false);
        setSuccess(true);
        (e.target as HTMLFormElement).reset();
        
        // Reset success message after 3 seconds
        setTimeout(() => setSuccess(false), 3000);
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case "Completed": return "bg-green-500 hover:bg-green-600";
            case "Acknowledged": return "bg-blue-500 hover:bg-blue-600";
            default: return "bg-orange-500 hover:bg-orange-600";
        }
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary"/> Support
                </CardTitle>
                <CardDescription>Report issues or check status.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
                <Tabs defaultValue="report" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                        <TabsTrigger value="report">Report Issue</TabsTrigger>
                        <TabsTrigger value="status">Ticket Status</TabsTrigger>
                    </TabsList>

                    <TabsContent value="report" className="flex-1">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input name="name" required placeholder="Your Name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input name="email" type="email" required placeholder="For replies..." />
                            </div>
                            <div className="space-y-2">
                                <Label>Issue</Label>
                                <Textarea name="issue" required placeholder="Describe the problem..." rows={4} />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : (success ? <CheckCircle2 className="h-4 w-4"/> : <Send className="h-4 w-4 mr-2"/>)}
                                {success ? "Sent!" : "Submit Ticket"}
                            </Button>
                        </form>
                    </TabsContent>

                    <TabsContent value="status" className="flex-1 overflow-auto max-h-[300px] space-y-3">
                        {initialTickets.length === 0 && <div className="text-center text-sm text-muted-foreground py-8">No active tickets.</div>}
                        {initialTickets.map(ticket => (
                            <div key={ticket.id} className="border rounded p-3 text-sm space-y-2">
                                <div className="flex justify-between items-start">
                                    <span className="font-semibold truncate w-[60%]">{ticket.issue}</span>
                                    <Badge className={`${getStatusColor(ticket.status)} text-[10px]`}>{ticket.status}</Badge>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>{ticket.name}</span>
                                    <span>{formatDistanceToNow(new Date(ticket.createdAt))} ago</span>
                                </div>
                            </div>
                        ))}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}