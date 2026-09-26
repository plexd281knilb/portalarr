"use client";

import { useState, useEffect } from "react";
import { submitSupportTicket } from "@/app/actions";
import { getCurrentUser } from "@/app/auth-actions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LifeBuoy, Send, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function SupportTicketModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [defaultUser, setDefaultUser] = useState({ name: "", email: "" });

    useEffect(() => {
        getCurrentUser().then((user) => {
            if (user) {
                setDefaultUser({ name: user.username, email: user.email });
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData(e.target as HTMLFormElement);
        await submitSupportTicket(formData);
        setLoading(false);
        setSuccess(true);
        (e.target as HTMLFormElement).reset();

        setTimeout(() => {
            setSuccess(false);
            setOpen(false);
        }, 2000);
    };

    return (
        <>
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                className="text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] gap-1.5 h-7 px-2.5 rounded-lg transition-all"
            >
                <LifeBuoy className="h-3.5 w-3.5 text-primary" />
                <span>Need to open a manual support ticket? Click here</span>
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md bg-[#121218] border border-border/60 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                            <LifeBuoy className="h-5 w-5 text-primary" />
                            Submit Server Support Ticket
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Send a direct issue report or question to the server administrator.
                        </DialogDescription>
                    </DialogHeader>

                    {success ? (
                        <div className="py-8 text-center space-y-2">
                            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto animate-bounce" />
                            <h4 className="text-sm font-bold text-foreground">Ticket Submitted Successfully</h4>
                            <p className="text-xs text-muted-foreground">The administrator has been notified via email.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-3.5 pt-2">
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Your Name or Username</Label>
                                <Input
                                    name="name"
                                    required
                                    defaultValue={defaultUser.name}
                                    placeholder="Your Name"
                                    className="h-9 text-xs bg-background/60"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Your Email</Label>
                                <Input
                                    name="email"
                                    type="email"
                                    required
                                    defaultValue={defaultUser.email}
                                    placeholder="email@example.com"
                                    className="h-9 text-xs bg-background/60"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Describe the Issue</Label>
                                <Textarea
                                    name="issue"
                                    required
                                    placeholder="Please describe what happened, which movie/show, or any error message..."
                                    rows={4}
                                    className="text-xs bg-background/60 resize-none"
                                />
                            </div>

                            <DialogFooter className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setOpen(false)}
                                    disabled={loading}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={loading}
                                    className="text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="h-3.5 w-3.5" /> Submit Ticket
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
