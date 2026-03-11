"use client";

import { useEffect, useState } from "react";
import { getSupportTickets, updateTicketStatus } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, LifeBuoy } from "lucide-react";
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

    const handleStatusChange = async (id: string, newStatus: string) => {
        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t));
        await updateTicketStatus(id, newStatus);
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
                            <div className="flex justify-between items-start">
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
                                <Select 
                                    defaultValue={ticket.status} 
                                    onValueChange={(val) => handleStatusChange(ticket.id, val)}
                                >
                                    <SelectTrigger className={`w-[140px] text-white ${getStatusColor(ticket.status)}`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Pending">Pending</SelectItem>
                                        <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                                        <SelectItem value="Completed">Completed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="bg-muted/50 p-3 rounded-md text-sm whitespace-pre-wrap">
                                {ticket.issue}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}