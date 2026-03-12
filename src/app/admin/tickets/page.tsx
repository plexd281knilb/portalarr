"use client";

import { useEffect, useState } from "react";
import { getSupportTickets, updateTicketStatus } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, LifeBuoy, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AdminTicketsPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTickets = async () => {
        setLoading(true);
        const data = await getSupportTickets();
        setTickets(data);
        setLoading(false);
    };

    useEffect(() => { loadTickets(); }, []);

    const handleUpdate = async (e: React.FormEvent, id: string) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const newStatus = formData.get("status") as string;
        const comment = formData.get("adminComment") as string;

        // Optimistically update the UI
        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, adminComment: comment } : t));
        
        await updateTicketStatus(id, newStatus, comment);
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case "Completed": return "bg-green-500";
            case "Acknowledged": return "bg-blue-500";
            default: return "bg-orange-500";
        }
    };

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    <LifeBuoy className="h-8 w-8 text-primary"/> Support Tickets
                </h2>
                <Button onClick={loadTickets} variant="outline" size="sm">Refresh</Button>
            </div>

            <div className="grid gap-4">
                {tickets.length === 0 && !loading && (
                    <div className="p-12 text-center border border-dashed rounded-lg text-muted-foreground">
                        No support tickets found. Good job!
                    </div>
                )}
                
                {tickets.map((ticket) => (
                    <Card key={ticket.id}>
                        <CardHeader className="pb-2">
                            <div className="space-y-1">
                                <CardTitle className="text-base flex items-center gap-2">
                                    {ticket.name}
                                    <Badge variant="outline" className="font-normal text-xs">
                                        <Mail className="h-3 w-3 mr-1"/> {ticket.email}
                                    </Badge>
                                </CardTitle>
                                <CardDescription>
                                    Submitted {formatDistanceToNow(new Date(ticket.createdAt))} ago
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-muted/50 p-3 rounded-md text-sm whitespace-pre-wrap mb-4 border">
                                {ticket.issue}
                            </div>
                            
                            <form onSubmit={(e) => handleUpdate(e, ticket.id)} className="space-y-4 border-t pt-4">
                                <div className="space-y-2">
                                    <Label>Admin Reply (Included in email notification)</Label>
                                    <Textarea 
                                        name="adminComment" 
                                        defaultValue={ticket.adminComment || ""} 
                                        placeholder="Type your reply or internal notes here..." 
                                        className="min-h-[80px]"
                                    />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Select name="status" defaultValue={ticket.status}>
                                        <SelectTrigger className={`w-[150px] text-white ${getStatusColor(ticket.status)}`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Pending">Pending</SelectItem>
                                            <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                                            <SelectItem value="Completed">Completed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button type="submit" className="gap-2">
                                        <Send className="h-4 w-4" /> Save & Notify
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}