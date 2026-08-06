"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, changeUserPassword } from "@/app/auth-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { User, Mail, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, MailCheck } from "lucide-react";

export default function UserProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Change Password State
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    useEffect(() => {
        async function fetchProfile() {
            setLoading(true);
            const u = await getCurrentUser();
            setUser(u);
            setLoading(false);
        }
        fetchProfile();
    }, []);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPassLoading(true);
        setPassMsg("");
        setPassErr("");

        const formData = new FormData();
        formData.append("currentPassword", passCurrent);
        formData.append("newPassword", passNew);

        const res = await changeUserPassword(formData);
        setPassLoading(false);

        if (res?.error) {
            setPassErr(res.error);
        } else if (res?.success) {
            setPassMsg(res.message || "Your password has been updated successfully!");
            setPassCurrent("");
            setPassNew("");
        }
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
                    <User className="h-6 w-6 text-primary" /> Account Profile & Settings
                </h1>
                <p className="text-muted-foreground text-sm">
                    Manage your personal account credentials and security settings.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* ACCOUNT INFORMATION CARD */}
                <Card className="border-muted/60 bg-card/95">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" /> Account Details
                        </CardTitle>
                        <CardDescription>Your registered profile information.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Username</Label>
                            <div className="font-semibold text-base flex items-center gap-2">
                                <span>{user?.username || "Unknown"}</span>
                                <Badge variant={user?.role === "ADMIN" ? "default" : "secondary"}>
                                    {user?.role || "USER"}
                                </Badge>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-muted/40">
                            <Label className="text-xs text-muted-foreground">Email Address</Label>
                            <div className="text-sm font-medium flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{user?.email || "No Email Associated"}</span>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-muted/40">
                            <Label className="text-xs text-muted-foreground">Send-to-Kindle Email</Label>
                            <div className="text-sm font-medium flex items-center gap-2">
                                <MailCheck className="h-4 w-4 text-primary" />
                                <span>{user?.kindleEmail || "Not Configured (Set up under Book Library)"}</span>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-muted/40">
                            <Label className="text-xs text-muted-foreground">Account Access Status</Label>
                            <div>
                                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 text-xs">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Approved Access
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CHANGE PASSWORD CARD */}
                <Card className="border-muted/60 bg-card/95">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary" /> Change Password
                        </CardTitle>
                        <CardDescription>Update your login password for Portalarr.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleChangePassword} className="space-y-4">
                            {passMsg && (
                                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{passMsg}</span>
                                </div>
                            )}
                            {passErr && (
                                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{passErr}</span>
                                </div>
                            )}
                            
                            <div className="space-y-1.5">
                                <Label htmlFor="currentPassword">Current or Temporary Password</Label>
                                <Input 
                                    id="currentPassword"
                                    type="password" 
                                    required 
                                    value={passCurrent} 
                                    onChange={(e) => setPassCurrent(e.target.value)} 
                                    placeholder="Enter current or temp password"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="newPassword">New Password</Label>
                                <Input 
                                    id="newPassword"
                                    type="password" 
                                    required 
                                    value={passNew} 
                                    onChange={(e) => setPassNew(e.target.value)} 
                                    placeholder="Minimum 6 characters"
                                />
                            </div>

                            <Button type="submit" disabled={passLoading} className="w-full font-bold">
                                {passLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="h-4 w-4 mr-2" /> Update Password
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
