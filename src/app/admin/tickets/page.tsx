"use client";

import { useEffect, useState } from "react";
// 1. Add deleteSupportTicket to your imports
import { getSupportTickets, updateTicketStatus, deleteSupportTicket } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, LifeBuoy, Send, Trash2, Loader2, UserCog, Film, Tv, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

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

        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, adminComment: comment } : t));
        await updateTicketStatus(id, newStatus, comment);
    };

    // 3. Add the delete handler
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to permanently delete this ticket?")) return;
        
        // Optimistic UI update
        setTickets(prev => prev.filter(t => t.id !== id));
        const result = await deleteSupportTicket(id);
        
        if (result.error) {
            alert(result.error);
            loadTickets(); // Refresh if delete fails
        }
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case "Completed": return "bg-green-500";
            case "Acknowledged": return "bg-blue-500";
            default: return "bg-orange-500";
        }
    };

    return (
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <LifeBuoy className="h-8 w-8 text-primary"/> Support Tickets
                    </h2>
                    <p className="text-muted-foreground">Manage and respond to user-submitted issues.</p>
                </div>
                <Button onClick={loadTickets} variant="outline" size="sm" className="w-fit">
                    <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            <div className="grid gap-6">
                {tickets.length === 0 && !loading && (
                    <Card className="border-dashed bg-muted/20">
                        <CardContent className="p-12 text-center text-muted-foreground italic">
                            No support tickets found. All systems go!
                        </CardContent>
                    </Card>
                )}
                
                {tickets.map((ticket) => (
                    <Card key={ticket.id} className="overflow-hidden border-primary/5 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="bg-muted/30 pb-4">
                            <div className="flex justify-between items-start w-full gap-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CardTitle className="text-lg font-bold truncate">
                                            {ticket.name}
                                        </CardTitle>
                                        <Badge variant="secondary" className="font-mono text-[10px] px-1.5 py-0 h-5">
                                            <Mail className="h-3 w-3 mr-1"/> {ticket.email}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-xs">
                                        Submitted {formatDistanceToNow(new Date(ticket.createdAt))} ago
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Badge className={`${getStatusColor(ticket.status)} text-white border-0 shadow-sm px-3`}>
                                        {ticket.status}
                                    </Badge>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(ticket.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="bg-background border rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-inner">
                                {ticket.issue}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 pt-2">
                                <Link href={`/settings/access?search=${encodeURIComponent(ticket.email)}`} passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-blue-500/30 text-blue-500 hover:bg-blue-500 hover:text-white">
                                        <UserCog className="h-3 w-3 mr-1.5" /> Manage User
                                    </Button>
                                </Link>
                                <Link href="/radarr" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-yellow-500/30 text-yellow-500 hover:bg-yellow-500 hover:text-white">
                                        <Film className="h-3 w-3 mr-1.5" /> Radarr
                                    </Button>
                                </Link>
                                <Link href="/sonarr" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-cyan-500/30 text-cyan-500 hover:bg-cyan-500 hover:text-white">
                                        <Tv className="h-3 w-3 mr-1.5" /> Sonarr
                                    </Button>
                                </Link>
                                <Link href="/library" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs border-purple-500/30 text-purple-500 hover:bg-purple-500 hover:text-white">
                                        <BookOpen className="h-3 w-3 mr-1.5" /> Library
                                    </Button>
                                </Link>
                            </div>

                            <form onSubmit={(e) => handleUpdate(e, ticket.id)} className="space-y-4 pt-4 border-t border-dashed">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Send className="h-3 w-3" /> Admin Response
                                    </Label>
                                    <Textarea 
                                        name="adminComment" 
                                        defaultValue={ticket.adminComment || ""} 
                                        placeholder="Type your message to the user..." 
                                        className="min-h-[100px] bg-muted/10 focus-visible:ring-primary/30"
                                    />
                                    <p className="text-[10px] text-muted-foreground italic">
                                        This message will be included in the email notification sent to the user.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs font-medium whitespace-nowrap">Set Status:</Label>
                                        <Select name="status" defaultValue={ticket.status}>
                                            <SelectTrigger className="w-[160px] h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Pending">Pending</SelectItem>
                                                <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                                                <SelectItem value="Completed">Completed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="submit" className="gap-2 h-9 shadow-sm" size="sm">
                                        <Send className="h-4 w-4" /> Save & Notify User
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