"use client";

import { useState, useEffect } from "react";
import { getCurrentUser } from "@/app/auth-actions";
import { submitLibraryAccessRequest } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { BookOpen, X, Loader2, Check, ShieldAlert } from "lucide-react";

export default function RequestLibraryAccess() {
    const [isOpen, setIsOpen] = useState(false);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    const [userEmail, setUserEmail] = useState("");
    const [userKindleEmail, setUserKindleEmail] = useState("");
    const [hasExistingEmail, setHasExistingEmail] = useState(false);

    useEffect(() => {
        async function fetchProfile() {
            try {
                const profile = await getCurrentUser();
                if (profile) {
                    setUserEmail(profile.email || "");
                    setUserKindleEmail(profile.kindleEmail || "");
                    if (profile.email) {
                        setHasExistingEmail(true);
                    }
                }
            } catch (e) {
                console.error("Failed to load user profile for access request:", e);
            } finally {
                setLoadingProfile(false);
            }
        }
        fetchProfile();
    }, [isOpen]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setError("");
        
        try {
            await submitLibraryAccessRequest(userEmail, userKindleEmail);
            setSuccess(true);
            setTimeout(() => {
                setIsOpen(false);
                setSuccess(false);
            }, 3000);
        } catch (err: any) {
            setError(err.message || "Failed to submit access request.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <>
            <Button 
                onClick={() => setIsOpen(true)}
                className="w-full text-base font-semibold h-12 shadow-sm hover:shadow transition-all bg-primary text-black"
            >
                <BookOpen className="mr-2 h-4 w-4" />
                Request Book Library Access
            </Button>

            {isOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md border-muted shadow-2xl relative">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="absolute right-3 top-3 h-8 w-8"
                            onClick={() => setIsOpen(false)}
                            disabled={submitting}
                        >
                            <X className="h-4 w-4" />
                        </Button>

                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <BookOpen className="h-5 w-5 text-primary" /> Request Library Access
                            </CardTitle>
                            <CardDescription>
                                Submit a request to the administrator to access the book shelves.
                            </CardDescription>
                        </CardHeader>

                        <CardContent>
                            {loadingProfile ? (
                                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <p className="text-xs text-muted-foreground">Loading account details...</p>
                                </div>
                            ) : success ? (
                                <div className="flex flex-col items-center justify-center py-8 space-y-3 text-center">
                                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                                        <Check className="h-6 w-6" />
                                    </div>
                                    <h3 className="font-semibold text-sm text-foreground">Request Sent!</h3>
                                    <p className="text-xs text-muted-foreground max-w-xs">
                                        Your request has been emailed to the administrator. They will assign you to the correct library.
                                    </p>
                                </div>
                            ) : (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {error && (
                                        <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-500 font-medium flex gap-2">
                                            <ShieldAlert className="h-4 w-4 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    {!hasExistingEmail && (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="reqEmail" className="text-xs font-semibold">Your Personal Email</Label>
                                            <Input
                                                id="reqEmail"
                                                type="email"
                                                placeholder="you@domain.com"
                                                value={userEmail}
                                                onChange={(e) => setUserEmail(e.target.value)}
                                                required
                                            />
                                            <p className="text-[10px] text-muted-foreground">
                                                Please provide your email address to receive delivery reports.
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="reqKindleEmail" className="text-xs font-semibold">Send-to-Kindle Email</Label>
                                        <Input
                                            id="reqKindleEmail"
                                            type="email"
                                            placeholder="e.g. name@kindle.com"
                                            value={userKindleEmail}
                                            onChange={(e) => setUserKindleEmail(e.target.value)}
                                            required
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Your Kindle email address. Ask the admin for the server's sending address to approve it on Amazon.
                                        </p>
                                    </div>

                                    <Button 
                                        type="submit" 
                                        disabled={submitting} 
                                        className="w-full text-black font-bold mt-2"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Sending Request...
                                            </>
                                        ) : (
                                            "Submit Request"
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
