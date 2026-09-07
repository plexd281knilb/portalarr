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
        <div className="flex-1 space-y-6 p-4 md:p-8 pt-6 max-w-5xl mx-auto animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                        <LifeBuoy className="h-8 w-8 text-primary"/> Support Tickets
                    </h2>
                    <p className="text-muted-foreground text-sm">Manage and respond to user-submitted issues.</p>
                </div>
                <Button 
                    onClick={loadTickets} 
                    variant="outline" 
                    size="sm" 
                    className="w-fit transition-all duration-200 hover:ring-2 hover:ring-primary/40 active:scale-95"
                >
                    <Loader2 className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Tickets
                </Button>
            </div>

            <div className="grid gap-6">
                {tickets.length === 0 && !loading && (
                    <Card className="border-dashed border-border/50 bg-[#121218]/50 rounded-2xl">
                        <CardContent className="p-12 text-center text-muted-foreground italic">
                            No support tickets found. All systems go!
                        </CardContent>
                    </Card>
                )}
                
                {tickets.map((ticket) => (
                    <Card key={ticket.id} className="overflow-hidden border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 rounded-2xl">
                        <CardHeader className="bg-muted/20 pb-4 border-b border-border/40">
                            <div className="flex justify-between items-start w-full gap-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <CardTitle className="text-lg font-bold truncate text-foreground">
                                            {ticket.name}
                                        </CardTitle>
                                        <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0.5 h-5 bg-muted/40 border border-border/40">
                                            <Mail className="h-3 w-3 mr-1 text-primary"/> {ticket.email}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-xs">
                                        Submitted {formatDistanceToNow(new Date(ticket.createdAt))} ago
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className={`${getStatusColor(ticket.status)} text-white border-0 shadow-sm px-3 py-0.5 font-semibold text-xs`}>
                                        {ticket.status}
                                    </Badge>
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-950/40 transition-all duration-200 hover:ring-2 hover:ring-red-500/40 active:scale-95"
                                        onClick={() => handleDelete(ticket.id)}
                                        title="Delete Ticket"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-6">
                            <div className="bg-background/60 border border-border/40 rounded-xl p-4 text-sm leading-relaxed whitespace-pre-wrap shadow-inner text-foreground">
                                {ticket.issue}
                            </div>
                            
                            <div className="flex flex-wrap gap-2 pt-1">
                                <Link href={`/settings/access?search=${encodeURIComponent(ticket.email)}`} passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:ring-2 hover:ring-emerald-500/40 active:scale-95 transition-all duration-200">
                                        <UserCog className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Manage User
                                    </Button>
                                </Link>
                                <Link href="/radarr" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500/40 active:scale-95 transition-all duration-200">
                                        <Film className="h-3.5 w-3.5 mr-1.5 text-blue-400" /> Radarr (Movies)
                                    </Button>
                                </Link>
                                <Link href="/sonarr" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:ring-2 hover:ring-cyan-500/40 active:scale-95 transition-all duration-200">
                                        <Tv className="h-3.5 w-3.5 mr-1.5 text-cyan-400" /> Sonarr (TV)
                                    </Button>
                                </Link>
                                <Link href="/library" passHref>
                                    <Button variant="outline" size="sm" className="h-8 text-xs font-semibold border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:ring-2 hover:ring-purple-500/40 active:scale-95 transition-all duration-200">
                                        <BookOpen className="h-3.5 w-3.5 mr-1.5 text-purple-400" /> Book Library
                                    </Button>
                                </Link>
                            </div>

                            <form onSubmit={(e) => handleUpdate(e, ticket.id)} className="space-y-4 pt-4 border-t border-border/40 border-dashed">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Send className="h-3.5 w-3.5 text-primary" /> Admin Response
                                    </Label>
                                    <Textarea 
                                        name="adminComment" 
                                        defaultValue={ticket.adminComment || ""} 
                                        placeholder="Type your message to the user..." 
                                        className="min-h-[100px] bg-background/60 border-border/40 focus-visible:ring-primary/40 text-xs sm:text-sm"
                                    />
                                    <p className="text-[10px] text-muted-foreground italic">
                                        This message will be included in the email notification sent to the user.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs font-semibold whitespace-nowrap">Set Status:</Label>
                                        <Select name="status" defaultValue={ticket.status}>
                                            <SelectTrigger className="w-[160px] h-9 bg-background/80 border-border/60 text-xs font-semibold">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="Pending">Pending</SelectItem>
                                                <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                                                <SelectItem value="Completed">Completed</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="submit" className="gap-2 h-9 font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98" size="sm">
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