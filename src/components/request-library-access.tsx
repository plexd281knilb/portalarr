"use client";

import { useState, useEffect } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { setupBookLibraryAccessAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { BookOpen, X, Loader2, Check, ShieldAlert, Download, Mail } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RequestLibraryAccess() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [error, setError] = useState("");

    const [userKindleEmail, setUserKindleEmail] = useState("");
    const [bypassKindle, setBypassKindle] = useState(false);

    useEffect(() => {
        async function fetchProfile() {
            try {
                const profile = await getCurrentUser();
                if (profile) {
                    if (profile.kindleEmail && profile.kindleEmail !== "DIRECT_DOWNLOAD") {
                        setUserKindleEmail(profile.kindleEmail);
                    } else if (profile.kindleEmail === "DIRECT_DOWNLOAD") {
                        setBypassKindle(true);
                    }
                }
            } catch (e) {
                console.error("Failed to load user profile for access request:", e);
            } finally {
                setLoadingProfile(false);
            }
        }
        if (isOpen) {
            fetchProfile();
        }
    }, [isOpen]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        
        try {
            const res = await setupBookLibraryAccessAction({
                kindleEmail: bypassKindle ? undefined : userKindleEmail,
                bypassKindle
            });
            if (res && !res.success) {
                setError(res.error || "Failed to setup library access.");
            } else {
                setSuccess(true);
                setSuccessMsg(res.message || "Book Library access unlocked!");
                setTimeout(() => {
                    setIsOpen(false);
                    setSuccess(false);
                    router.push("/library");
                }, 1500);
            }
        } catch (err: any) {
            setError(err.message || "Failed to setup library access.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Button 
                onClick={() => setIsOpen(true)}
                className="w-full text-sm sm:text-base font-semibold h-11 sm:h-12 shadow-md transition-all bg-emerald-500 hover:bg-emerald-600 text-black hover:ring-2 hover:ring-emerald-400/50 active:scale-95 rounded-xl cursor-pointer"
            >
                <BookOpen className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                Setup Book Library Access
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md border-border/50 shadow-2xl relative bg-[#121218]/95 backdrop-blur-md">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-3 top-3 h-8 w-8 hover:ring-1 hover:ring-border active:scale-95 transition-all text-muted-foreground hover:text-foreground"
                            onClick={() => setIsOpen(false)}
                            disabled={submitting}
                        >
                            <X className="h-4 w-4" />
                        </Button>

                        <CardHeader className="pb-3 pt-5">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-emerald-400">
                                <BookOpen className="h-5 w-5 text-emerald-400" /> Unlock Book & Audiobook Library
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground">
                                Choose how you want to receive your books (Kindle wireless delivery or direct download).
                            </CardDescription>
                        </CardHeader>

                        <CardContent>
                            {loadingProfile ? (
                                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                                    <p className="text-xs text-muted-foreground">Loading account details...</p>
                                </div>
                            ) : success ? (
                                <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center animate-in zoom-in-95 duration-200">
                                    <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]">
                                        <Check className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-semibold text-sm text-foreground">{successMsg}</h3>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        Opening the Book Library now...
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {error && (
                                        <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-400 font-medium flex gap-2">
                                            <ShieldAlert className="h-4 w-4 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    {/* Option 1: Send-to-Kindle */}
                                    <div className={`p-3.5 rounded-xl border transition-all space-y-2 ${!bypassKindle ? "bg-emerald-950/20 border-emerald-500/40" : "bg-muted/10 border-border/40 opacity-70"}`}>
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="reqKindleEmail" className="text-xs font-bold flex items-center gap-1.5 text-foreground cursor-pointer">
                                                <Mail className="h-3.5 w-3.5 text-emerald-400" />
                                                Send-to-Kindle Email
                                            </Label>
                                            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Wireless Delivery</span>
                                        </div>
                                        <Input
                                            id="reqKindleEmail"
                                            type="email"
                                            placeholder="e.g. yourname@kindle.com"
                                            value={userKindleEmail}
                                            onChange={(e) => {
                                                setUserKindleEmail(e.target.value);
                                                if (e.target.value) setBypassKindle(false);
                                            }}
                                            disabled={bypassKindle}
                                            className="bg-black/40 border-border/60 text-xs h-9"
                                        />
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            Find your Send-to-Kindle address in Amazon Account → Manage Devices.
                                        </p>
                                    </div>

                                    {/* Option 2: Direct Download Bypass */}
                                    <div 
                                        onClick={() => setBypassKindle(!bypassKindle)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${bypassKindle ? "bg-purple-950/30 border-purple-500/50 ring-1 ring-purple-500/40" : "bg-muted/10 border-border/40 hover:bg-muted/20"}`}
                                    >
                                        <input 
                                            type="checkbox"
                                            checked={bypassKindle}
                                            onChange={(e) => setBypassKindle(e.target.checked)}
                                            className="mt-0.5 rounded border-border text-purple-500 focus:ring-purple-400 accent-purple-500 cursor-pointer"
                                        />
                                        <div className="space-y-0.5">
                                            <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <Download className="h-3.5 w-3.5 text-purple-400" />
                                                Bypass Kindle (Direct Phone/PC Download)
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                                I don't have a Kindle or prefer downloading .EPUB / .MP3 directly to my phone or computer.
                                            </p>
                                        </div>
                                    </div>

                                    <Button 
                                        type="submit" 
                                        disabled={submitting || (!bypassKindle && !userKindleEmail)} 
                                        className="w-full text-black font-bold h-10 mt-1 bg-emerald-500 hover:bg-emerald-400 hover:ring-2 hover:ring-emerald-400/50 hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Unlocking Access...
                                            </>
                                        ) : (
                                            "Unlock Book Library Access"
                                        )}
                                    </Button>
                                </form>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </>
    );
}
