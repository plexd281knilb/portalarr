"use client";

import { useState, useEffect, useMemo } from "react";
import { 
    getEmailTemplatesAction, 
    saveEmailTemplateAction, 
    resetEmailTemplateAction, 
    sendTestEmailTemplateAction,
    getBroadcastUsersAction,
    sendBroadcastEmailAction,
    sendTestBroadcastEmailAction,
    getEmailNotificationSettings,
    saveEmailNotificationSettingsAction
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { 
    Mail, Send, Megaphone, CheckCircle2, XCircle, 
    Search, Users, Sparkles, RotateCcw, 
    Loader2, Shield, Key, BookOpen, LifeBuoy, UserCheck, 
    Bell, BellOff, CheckSquare, Square, 
    Code, Eye, Check
} from "lucide-react";

interface BroadcastUser {
    id: string;
    username: string;
    email: string | null;
    kindleEmail: string | null;
    role: string;
    status: string;
    createdAt?: any;
    lastLogin?: any;
}

interface TemplateVariable {
    key: string;
    description: string;
    sampleValue: string;
}

interface EmailTemplate {
    id: string;
    name: string;
    description: string;
    category: "AUTH" | "REQUESTS" | "SUPPORT" | "KINDLE" | "TRIALS" | string;
    subject: string;
    body: string;
    defaultSubject: string;
    defaultBody: string;
    isCustom: boolean;
    updatedAt: string | null;
    variables: TemplateVariable[];
}

export default function EmailManagement() {
    const [subTab, setSubTab] = useState<"broadcast" | "templates" | "notifications">("broadcast");
    const [loading, setLoading] = useState(true);

    // Broadcast state
    const [users, setUsers] = useState<BroadcastUser[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [userSearch, setUserSearch] = useState("");
    const [userFilter, setUserFilter] = useState<"all" | "approved" | "pending" | "admin" | "kindle">("all");
    
    // Broadcast composer state
    const [broadcastSubject, setBroadcastSubject] = useState("");
    const [broadcastBody, setBroadcastBody] = useState("");
    const [broadcastIsHtml, setBroadcastIsHtml] = useState(false);
    const [previewUserIdx, setPreviewUserIdx] = useState(0);
    const [composerTab, setComposerTab] = useState<"write" | "preview">("write");

    // Broadcast actions state
    const [sendingTestBroadcast, setSendingTestBroadcast] = useState(false);
    const [testBroadcastResult, setTestBroadcastResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [broadcasting, setBroadcasting] = useState(false);
    const [broadcastSummary, setBroadcastSummary] = useState<{
        success: boolean;
        total: number;
        sent: number;
        failed: number;
        failures: { username: string; email: string; error: string }[];
    } | null>(null);

    // Templates state
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("user_approval");
    const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>("all");
    const [templateSubject, setTemplateSubject] = useState("");
    const [templateBody, setTemplateBody] = useState("");
    const [templateEditorTab, setTemplateEditorTab] = useState<"write" | "preview">("write");
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [templateSaveMsg, setTemplateSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [testingTemplate, setTestingTemplate] = useState(false);
    const [testTemplateMsg, setTestTemplateMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Notification preferences state
    const [emailSettings, setEmailSettings] = useState({
        emailNotificationsEnabled: true,
        notifyUserApproval: true,
        notifyAdminNewUserRequest: true,
        notifyPasswordReset: true,
        notifyMediaRequests: true,
        notifySupportTickets: true,
        notifySendToKindle: true
    });
    const [savingEmailSettings, setSavingEmailSettings] = useState(false);
    const [emailSettingsMsg, setEmailSettingsMsg] = useState("");

    const loadData = async () => {
        setLoading(true);
        try {
            const [uRes, tRes, sRes] = await Promise.all([
                getBroadcastUsersAction(),
                getEmailTemplatesAction(),
                getEmailNotificationSettings()
            ]);

            if (uRes.success && uRes.users) {
                setUsers(uRes.users);
                // Default select all approved users with valid email
                const defaultApproved = uRes.users
                    .filter(u => u.status === "APPROVED" && u.email && u.email.includes("@"))
                    .map(u => u.id);
                setSelectedUserIds(defaultApproved);
            }

            if (tRes.success && tRes.templates) {
                setTemplates(tRes.templates as EmailTemplate[]);
                const initial = tRes.templates.find(t => t.id === "user_approval") || tRes.templates[0];
                if (initial) {
                    setSelectedTemplateId(initial.id);
                    setTemplateSubject(initial.subject);
                    setTemplateBody(initial.body);
                }
            }

            if (sRes.success && sRes.settings) {
                setEmailSettings(sRes.settings);
            }
        } catch (e) {
            console.error("Failed to load email management data:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filter users list for recipient picker
    const filteredUsers = useMemo(() => {
        return users.filter(u => {
            const matchesSearch = 
                u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
                (u.email && u.email.toLowerCase().includes(userSearch.toLowerCase())) ||
                (u.kindleEmail && u.kindleEmail.toLowerCase().includes(userSearch.toLowerCase()));

            if (!matchesSearch) return false;

            if (userFilter === "approved") return u.status === "APPROVED";
            if (userFilter === "pending") return u.status === "PENDING";
            if (userFilter === "admin") return u.role === "ADMIN";
            if (userFilter === "kindle") return !!u.kindleEmail;
            return true;
        });
    }, [users, userSearch, userFilter]);

    // Recipient selection handlers
    const handleToggleUser = (id: string) => {
        setSelectedUserIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAllFiltered = () => {
        const eligibleFilteredIds = filteredUsers
            .filter(u => u.email && u.email.includes("@"))
            .map(u => u.id);
        setSelectedUserIds(prev => {
            const set = new Set([...prev, ...eligibleFilteredIds]);
            return Array.from(set);
        });
    };

    const handleDeselectAllFiltered = () => {
        const filteredIdSet = new Set(filteredUsers.map(u => u.id));
        setSelectedUserIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    };

    const handleSelectAll = () => {
        const allEligible = users
            .filter(u => u.email && u.email.includes("@"))
            .map(u => u.id);
        setSelectedUserIds(allEligible);
    };

    const handleDeselectAll = () => {
        setSelectedUserIds([]);
    };

    // Variable insertion helper
    const insertMergeTag = (tag: string, target: "subject" | "body") => {
        if (target === "subject") {
            setBroadcastSubject(prev => prev + tag);
        } else {
            setBroadcastBody(prev => prev + tag);
        }
    };

    // Live preview values generator for broadcast
    const sampleUser = useMemo(() => {
        const selectedList = users.filter(u => selectedUserIds.includes(u.id));
        if (selectedList.length > 0 && previewUserIdx < selectedList.length) {
            return selectedList[previewUserIdx];
        }
        return users[0] || {
            username: "DemoUser",
            email: "user@example.com",
            kindleEmail: "demouser_kindle@kindle.com",
            role: "USER",
            status: "APPROVED"
        };
    }, [users, selectedUserIds, previewUserIdx]);

    const renderedBroadcastSubjectPreview = useMemo(() => {
        let text = broadcastSubject || "Broadcast Subject Preview";
        const map: Record<string, string> = {
            "{username}": sampleUser.username,
            "{email}": sampleUser.email || "user@example.com",
            "{kindleEmail}": sampleUser.kindleEmail || "user@kindle.com",
            "{role}": sampleUser.role,
            "{status}": sampleUser.status,
            "{appUrl}": typeof window !== "undefined" ? window.location.origin : "https://portalarr.domain.com",
            "{loginUrl}": typeof window !== "undefined" ? `${window.location.origin}/login` : "https://portalarr.domain.com/login",
            "{portalName}": "Portalarr"
        };
        for (const [k, v] of Object.entries(map)) {
            text = text.replaceAll(k, v);
        }
        return text;
    }, [broadcastSubject, sampleUser]);

    const renderedBroadcastBodyPreview = useMemo(() => {
        let text = broadcastBody || "<p>Hello <strong>{username}</strong>,</p><p>This is a broadcast announcement from your server administrator.</p>";
        const map: Record<string, string> = {
            "{username}": sampleUser.username,
            "{email}": sampleUser.email || "user@example.com",
            "{kindleEmail}": sampleUser.kindleEmail || "user@kindle.com",
            "{role}": sampleUser.role,
            "{status}": sampleUser.status,
            "{appUrl}": typeof window !== "undefined" ? window.location.origin : "https://portalarr.domain.com",
            "{loginUrl}": typeof window !== "undefined" ? `${window.location.origin}/login` : "https://portalarr.domain.com/login",
            "{portalName}": "Portalarr"
        };
        for (const [k, v] of Object.entries(map)) {
            text = text.replaceAll(k, v);
        }
        return text;
    }, [broadcastBody, sampleUser]);

    // Send Test Broadcast to Admin
    const handleSendTestBroadcast = async () => {
        if (!broadcastSubject.trim() || !broadcastBody.trim()) {
            setTestBroadcastResult({
                success: false,
                error: "Please provide both a subject and a message body before testing."
            });
            return;
        }

        setSendingTestBroadcast(true);
        setTestBroadcastResult(null);
        try {
            const res = await sendTestBroadcastEmailAction({
                subject: broadcastSubject,
                body: broadcastBody,
                isCustomHtml: broadcastIsHtml
            });
            if (res.success) {
                setTestBroadcastResult({
                    success: true,
                    message: res.message || "Test preview email sent successfully to your admin inbox!"
                });
            } else {
                setTestBroadcastResult({
                    success: false,
                    error: res.error || "Failed to send test email. Check SMTP settings."
                });
            }
        } catch (e: any) {
            setTestBroadcastResult({
                success: false,
                error: e.message || "An unexpected error occurred."
            });
        } finally {
            setSendingTestBroadcast(false);
        }
    };

    // Execute Mass Broadcast
    const handleExecuteBroadcast = async () => {
        if (selectedUserIds.length === 0) return;
        setBroadcasting(true);
        try {
            const res = await sendBroadcastEmailAction({
                userIds: selectedUserIds,
                subject: broadcastSubject,
                body: broadcastBody,
                isCustomHtml: broadcastIsHtml
            });
            setShowConfirmModal(false);
            if (res.success) {
                setBroadcastSummary({
                    success: true,
                    total: res.total || selectedUserIds.length,
                    sent: res.sent || 0,
                    failed: res.failed || 0,
                    failures: res.failures || []
                });
            } else {
                setBroadcastSummary({
                    success: false,
                    total: selectedUserIds.length,
                    sent: 0,
                    failed: selectedUserIds.length,
                    failures: [{ username: "All", email: "", error: res.error || "Broadcast failed" }]
                });
            }
        } catch (e: any) {
            setShowConfirmModal(false);
            setBroadcastSummary({
                success: false,
                total: selectedUserIds.length,
                sent: 0,
                failed: selectedUserIds.length,
                failures: [{ username: "Error", email: "", error: e.message || "Network error" }]
            });
        } finally {
            setBroadcasting(false);
        }
    };

    const isMatchingCategory = (tplCat: string, filterId: string) => {
        if (filterId === "all") return true;
        const cat = (tplCat || "").toUpperCase();
        const filter = filterId.toUpperCase();
        if (filter === "AUTH" && (cat === "AUTH" || cat === "ACCOUNTS")) return true;
        if (filter === "TRIALS" && (cat === "TRIALS" || cat === "TRIAL" || cat === "BILLING")) return true;
        if (filter === "REQUESTS" && (cat === "REQUESTS" || cat === "MEDIA")) return true;
        if (filter === "KINDLE" && cat === "KINDLE") return true;
        if (filter === "SUPPORT" && (cat === "SUPPORT" || cat === "TICKETS" || cat === "ALERTS")) return true;
        return cat === filter;
    };

    // Template selection and editing
    const currentTemplate = useMemo(() => {
        return templates.find(t => t.id === selectedTemplateId) || templates[0];
    }, [templates, selectedTemplateId]);

    const handleSelectTemplate = (id: string) => {
        setSelectedTemplateId(id);
        const t = templates.find(item => item.id === id);
        if (t) {
            setTemplateSubject(t.subject);
            setTemplateBody(t.body);
            setTemplateSaveMsg(null);
            setTestTemplateMsg(null);
        }
    };

    const handleSaveTemplate = async () => {
        if (!currentTemplate) return;
        setSavingTemplate(true);
        setTemplateSaveMsg(null);
        try {
            const res = await saveEmailTemplateAction(currentTemplate.id, templateSubject, templateBody);
            if (res.success) {
                setTemplateSaveMsg({ type: "success", text: res.message || "Template saved successfully!" });
                // Update local list state
                setTemplates(prev => prev.map(t => {
                    if (t.id === currentTemplate.id) {
                        return { ...t, subject: templateSubject, body: templateBody, isCustom: true };
                    }
                    return t;
                }));
                setTimeout(() => setTemplateSaveMsg(null), 4000);
            } else {
                setTemplateSaveMsg({ type: "error", text: res.error || "Failed to save template" });
            }
        } catch (e: any) {
            setTemplateSaveMsg({ type: "error", text: e.message || "Failed to save template" });
        } finally {
            setSavingTemplate(false);
        }
    };

    const handleResetTemplate = async () => {
        if (!currentTemplate) return;
        if (!confirm(`Are you sure you want to reset "${currentTemplate.name}" back to the default factory template?`)) {
            return;
        }

        try {
            const res = await resetEmailTemplateAction(currentTemplate.id);
            if (res.success) {
                setTemplateSubject(res.defaultSubject || currentTemplate.defaultSubject);
                setTemplateBody(res.defaultBody || currentTemplate.defaultBody);
                setTemplateSaveMsg({ type: "success", text: "Template reset to default!" });
                setTemplates(prev => prev.map(t => {
                    if (t.id === currentTemplate.id) {
                        return { 
                            ...t, 
                            subject: res.defaultSubject || currentTemplate.defaultSubject, 
                            body: res.defaultBody || currentTemplate.defaultBody, 
                            isCustom: false 
                        };
                    }
                    return t;
                }));
                setTimeout(() => setTemplateSaveMsg(null), 4000);
            } else {
                setTemplateSaveMsg({ type: "error", text: res.error || "Failed to reset template" });
            }
        } catch (e: any) {
            setTemplateSaveMsg({ type: "error", text: e.message || "Failed to reset template" });
        }
    };

    const handleSendTestTemplate = async () => {
        if (!currentTemplate) return;
        setTestingTemplate(true);
        setTestTemplateMsg(null);
        try {
            const res = await sendTestEmailTemplateAction(currentTemplate.id, templateSubject, templateBody);
            if (res.success) {
                setTestTemplateMsg({ type: "success", text: res.message || "Test email dispatched to your inbox!" });
                setTimeout(() => setTestTemplateMsg(null), 5000);
            } else {
                setTestTemplateMsg({ type: "error", text: res.error || "Failed to send test email" });
            }
        } catch (e: any) {
            setTestTemplateMsg({ type: "error", text: e.message || "Failed to send test email" });
        } finally {
            setTestingTemplate(false);
        }
    };

    // Render live template preview with mock data
    const renderedTemplateSubjectPreview = useMemo(() => {
        if (!currentTemplate) return "";
        let text = templateSubject || currentTemplate.defaultSubject;
        for (const v of currentTemplate.variables) {
            text = text.replaceAll(v.key, v.sampleValue);
        }
        text = text.replaceAll("{appUrl}", typeof window !== "undefined" ? window.location.origin : "https://portalarr.domain.com");
        text = text.replaceAll("{loginUrl}", typeof window !== "undefined" ? `${window.location.origin}/login` : "https://portalarr.domain.com/login");
        text = text.replaceAll("{portalName}", "Portalarr");
        return text;
    }, [currentTemplate, templateSubject]);

    const renderedTemplateBodyPreview = useMemo(() => {
        if (!currentTemplate) return "";
        let text = templateBody || currentTemplate.defaultBody;
        for (const v of currentTemplate.variables) {
            text = text.replaceAll(v.key, v.sampleValue);
        }
        text = text.replaceAll("{appUrl}", typeof window !== "undefined" ? window.location.origin : "https://portalarr.domain.com");
        text = text.replaceAll("{loginUrl}", typeof window !== "undefined" ? `${window.location.origin}/login` : "https://portalarr.domain.com/login");
        text = text.replaceAll("{portalName}", "Portalarr");
        return text;
    }, [currentTemplate, templateBody]);

    // Handle dispatch settings toggle
    const handleToggleEmailSetting = async (key: string, value: boolean) => {
        const updated = { ...emailSettings, [key]: value };
        setEmailSettings(updated);
        setSavingEmailSettings(true);
        setEmailSettingsMsg("");
        try {
            const res = await saveEmailNotificationSettingsAction(updated);
            if (res.success) {
                setEmailSettingsMsg("Notification preference saved.");
                setTimeout(() => setEmailSettingsMsg(""), 3000);
            }
        } catch (e) {
            console.error("Failed to update notification setting:", e);
        } finally {
            setSavingEmailSettings(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-12 w-full rounded-xl" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="h-[400px] rounded-xl" />
                    <Skeleton className="h-[400px] md:col-span-2 rounded-xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* TOP HEADER & SUB-NAV TABS */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/50 pb-4">
                <div>
                    <h3 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
                        <Mail className="h-6 w-6 text-primary" /> Email Hub & Broadcast Engine
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Broadcast personalized announcements, customize notification email templates, and control automated triggers.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant={subTab === "broadcast" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSubTab("broadcast")}
                        className={`text-xs gap-1.5 font-semibold transition-all ${
                            subTab === "broadcast" 
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                                : "hover:bg-muted/60"
                        }`}
                    >
                        <Megaphone className="h-4 w-4" /> Mass Broadcast
                    </Button>
                    <Button
                        variant={subTab === "templates" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSubTab("templates")}
                        className={`text-xs gap-1.5 font-semibold transition-all ${
                            subTab === "templates" 
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                                : "hover:bg-muted/60"
                        }`}
                    >
                        <Code className="h-4 w-4" /> Notification Templates
                    </Button>
                    <Button
                        variant={subTab === "notifications" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSubTab("notifications")}
                        className={`text-xs gap-1.5 font-semibold transition-all ${
                            subTab === "notifications" 
                                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                                : "hover:bg-muted/60"
                        }`}
                    >
                        <Bell className="h-4 w-4" /> Dispatch Controls
                    </Button>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* --- SUB-TAB 1: MASS EMAIL BROADCAST --- */}
            {/* ========================================================================= */}
            {subTab === "broadcast" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT COLUMN: RECIPIENT SELECTION (5 cols) */}
                    <Card className="lg:col-span-5 flex flex-col bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="h-4.5 w-4.5 text-primary" /> Select Recipients
                                </CardTitle>
                                <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 text-xs font-mono">
                                    {selectedUserIds.length} of {users.length} Selected
                                </Badge>
                            </div>
                            <CardDescription className="text-xs">
                                Choose who will receive this broadcast. Each user receives an isolated, personalized email.
                            </CardDescription>

                            {/* Search & Filter pills */}
                            <div className="space-y-2 pt-2">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by username or email..."
                                        value={userSearch}
                                        onChange={(e) => setUserSearch(e.target.value)}
                                        className="h-8 pl-8 text-xs bg-black/40 border-white/10"
                                    />
                                    {userSearch && (
                                        <button 
                                            onClick={() => setUserSearch("")}
                                            className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground text-xs"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={userFilter === "all" ? "secondary" : "ghost"}
                                        className="h-6 text-[10px] px-2"
                                        onClick={() => setUserFilter("all")}
                                    >
                                        All ({users.length})
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={userFilter === "approved" ? "secondary" : "ghost"}
                                        className="h-6 text-[10px] px-2 text-emerald-400"
                                        onClick={() => setUserFilter("approved")}
                                    >
                                        Approved ({users.filter(u => u.status === "APPROVED").length})
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={userFilter === "pending" ? "secondary" : "ghost"}
                                        className="h-6 text-[10px] px-2 text-amber-400"
                                        onClick={() => setUserFilter("pending")}
                                    >
                                        Pending ({users.filter(u => u.status === "PENDING").length})
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={userFilter === "admin" ? "secondary" : "ghost"}
                                        className="h-6 text-[10px] px-2 text-purple-400"
                                        onClick={() => setUserFilter("admin")}
                                    >
                                        Admins ({users.filter(u => u.role === "ADMIN").length})
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        {/* Quick Selection Buttons */}
                        <div className="px-6 py-1.5 border-y border-border/40 bg-black/20 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground text-[11px]">Quick Select:</span>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] px-2 text-primary hover:bg-primary/10"
                                    onClick={handleSelectAllFiltered}
                                >
                                    Select All Filtered
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                                    onClick={handleDeselectAllFiltered}
                                >
                                    Clear Filtered
                                </Button>
                            </div>
                        </div>

                        {/* Recipient User List */}
                        <CardContent className="p-0 flex-1 overflow-y-auto max-h-[460px]">
                            {filteredUsers.length === 0 ? (
                                <div className="p-6 text-center text-xs text-muted-foreground italic">
                                    No users found matching your search.
                                </div>
                            ) : (
                                <div className="divide-y divide-border/20">
                                    {filteredUsers.map(user => {
                                        const isSelected = selectedUserIds.includes(user.id);
                                        const hasEmail = user.email && user.email.includes("@");

                                        return (
                                            <div
                                                key={user.id}
                                                onClick={() => hasEmail && handleToggleUser(user.id)}
                                                className={`p-3 flex items-center justify-between gap-3 transition-colors text-xs ${
                                                    !hasEmail ? "opacity-40 cursor-not-allowed bg-red-950/10" : "cursor-pointer hover:bg-muted/20"
                                                } ${isSelected ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="shrink-0 text-muted-foreground">
                                                        {isSelected ? (
                                                            <CheckSquare className="h-4 w-4 text-primary" />
                                                        ) : (
                                                            <Square className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                                                            {user.username}
                                                            {user.role === "ADMIN" && (
                                                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/40 text-purple-400 bg-purple-500/10">
                                                                    ADMIN
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                                                            {user.email || <span className="text-red-400 italic">No email address configured</span>}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 flex flex-col items-end gap-1">
                                                    <Badge 
                                                        variant="outline" 
                                                        className={`text-[9px] px-1.5 py-0 ${
                                                            user.status === "APPROVED" 
                                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                                                                : user.status === "PENDING"
                                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                                                : "bg-red-500/10 text-red-400 border-red-500/30"
                                                        }`}
                                                    >
                                                        {user.status}
                                                    </Badge>
                                                    {user.kindleEmail && (
                                                        <span className="text-[9px] text-amber-500 font-mono flex items-center gap-0.5" title={`Kindle: ${user.kindleEmail}`}>
                                                            📖 Kindle
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>

                        <CardFooter className="p-3 border-t border-border/40 bg-black/20 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground text-[11px]">
                                {selectedUserIds.length} user{selectedUserIds.length === 1 ? "" : "s"} will receive individual copies
                            </span>
                            <div className="flex gap-2">
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-primary" onClick={handleSelectAll}>
                                    Select All
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-muted-foreground" onClick={handleDeselectAll}>
                                    Clear All
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>

                    {/* RIGHT COLUMN: BROADCAST COMPOSER & PREVIEW (7 cols) */}
                    <div className="lg:col-span-7 space-y-4">
                        <Card className="bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
                            <CardHeader className="pb-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <CardTitle className="text-base flex items-center gap-2">
                                            <Megaphone className="h-4.5 w-4.5 text-primary" /> Broadcast Message Composer
                                        </CardTitle>
                                        <CardDescription className="text-xs">
                                            Compose your announcement. Use dynamic merge tags to personalize each email.
                                        </CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Tabs value={composerTab} onValueChange={(v) => setComposerTab(v as any)} className="h-8">
                                            <TabsList className="h-8 p-0.5 bg-black/40 border border-white/10">
                                                <TabsTrigger value="write" className="text-xs px-3 h-7">Write</TabsTrigger>
                                                <TabsTrigger value="preview" className="text-xs px-3 h-7 gap-1">
                                                    <Eye className="h-3 w-3" /> Live Preview
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>
                                </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                                {testBroadcastResult && (
                                    <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                                        testBroadcastResult.success 
                                            ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40" 
                                            : "bg-red-950/40 text-red-300 border border-red-800/40"
                                    }`}>
                                        {testBroadcastResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                        <span>{testBroadcastResult.message || testBroadcastResult.error}</span>
                                    </div>
                                )}

                                {broadcastSummary && (
                                    <div className={`p-4 rounded-xl text-xs space-y-2 ${
                                        broadcastSummary.failed === 0 
                                            ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40" 
                                            : "bg-amber-950/40 text-amber-200 border border-amber-800/40"
                                    }`}>
                                        <div className="flex items-center justify-between font-bold text-sm">
                                            <span className="flex items-center gap-1.5">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-400" /> Mass Broadcast Dispatch Complete
                                            </span>
                                            <Badge variant="outline" className="bg-black/40">
                                                {broadcastSummary.sent} Sent / {broadcastSummary.failed} Failed
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            Dispatched individual emails to {broadcastSummary.sent} recipient{broadcastSummary.sent === 1 ? "" : "s"}.
                                        </p>
                                        {broadcastSummary.failures.length > 0 && (
                                            <div className="mt-2 pt-2 border-t border-amber-800/40 space-y-1">
                                                <span className="font-semibold text-red-400">Failed Deliveries:</span>
                                                <ul className="list-disc list-inside space-y-0.5 text-[11px] font-mono">
                                                    {broadcastSummary.failures.map((f, i) => (
                                                        <li key={i}>{f.username} ({f.email}): {f.error}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* SUBJECT INPUT */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Subject Line</Label>
                                        <span className="text-[10px] text-muted-foreground">Supports merge tags</span>
                                    </div>
                                    <Input
                                        placeholder="Important Update for {portalName} Users..."
                                        value={broadcastSubject}
                                        onChange={(e) => setBroadcastSubject(e.target.value)}
                                        className="h-9 text-sm bg-black/40 border-white/10"
                                    />
                                </div>

                                {/* MERGE TAGS PILLS */}
                                <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-lg border border-border/40">
                                    <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                            <Sparkles className="h-3 w-3 text-primary" /> Click to Insert Merge Tag:
                                        </span>
                                        <span className="text-[10px] italic">Replaced dynamically for each recipient</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {[
                                            { tag: "{username}", label: "Username" },
                                            { tag: "{email}", label: "Email" },
                                            { tag: "{role}", label: "Role (Admin/User)" },
                                            { tag: "{status}", label: "Status (Approved)" },
                                            { tag: "{kindleEmail}", label: "Kindle Email" },
                                            { tag: "{portalName}", label: "Portalarr Name" },
                                            { tag: "{appUrl}", label: "Portal URL" },
                                            { tag: "{loginUrl}", label: "Login Link" }
                                        ].map(item => (
                                            <button
                                                key={item.tag}
                                                type="button"
                                                onClick={() => insertMergeTag(item.tag, "body")}
                                                className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 hover:border-primary/40 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                title={`Insert ${item.tag} into message body`}
                                            >
                                                <span>{item.tag}</span>
                                                <span className="text-muted-foreground text-[9px]">({item.label})</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* WRITE OR PREVIEW CONTENT */}
                                {composerTab === "write" ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-semibold">Message Body</Label>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center space-x-1.5 text-[11px]">
                                                    <Switch
                                                        id="raw-html-toggle"
                                                        checked={broadcastIsHtml}
                                                        onCheckedChange={setBroadcastIsHtml}
                                                    />
                                                    <Label htmlFor="raw-html-toggle" className="cursor-pointer text-muted-foreground text-[10px]">
                                                        Raw Full HTML
                                                    </Label>
                                                </div>
                                            </div>
                                        </div>
                                        <Textarea
                                            rows={11}
                                            value={broadcastBody}
                                            onChange={(e) => setBroadcastBody(e.target.value)}
                                            placeholder={`<p>Hi {username},</p>\n<p>We've just added new features and updated our server library. Check it out at <a href="{appUrl}">{portalName}</a>!</p>\n<p>Happy streaming and reading!</p>`}
                                            className="font-mono text-xs leading-relaxed bg-black/40 border-white/10"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            {broadcastIsHtml 
                                                ? "Raw HTML mode enabled: Portalarr will not wrap your message in default email branding layout." 
                                                : "Standard mode: Your message is automatically placed inside the beautiful, dark-themed responsive Portalarr email card layout."}
                                        </p>
                                    </div>
                                ) : (
                                    /* LIVE PREVIEW TAB */
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between bg-black/30 p-2 rounded border border-border/40 text-xs">
                                            <span className="text-muted-foreground text-[11px]">Previewing as user:</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-primary">{sampleUser.username}</span>
                                                <span className="text-muted-foreground font-mono">({sampleUser.email})</span>
                                            </div>
                                        </div>

                                        <div className="border border-border/60 rounded-xl overflow-hidden shadow-inner bg-[#0d0d12]">
                                            {/* Simulated Email Header */}
                                            <div className="bg-[#181822] p-3 border-b border-border/40 space-y-1 text-xs font-sans">
                                                <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                                                    <span><strong>From:</strong> Portalarr &lt;notifications@yourserver.com&gt;</span>
                                                    <span>Today, Just now</span>
                                                </div>
                                                <div className="text-foreground">
                                                    <strong>To:</strong> {sampleUser.email || "user@example.com"}
                                                </div>
                                                <div className="text-foreground font-semibold pt-1 border-t border-border/20">
                                                    <strong>Subject:</strong> {renderedBroadcastSubjectPreview}
                                                </div>
                                            </div>

                                            {/* Simulated Email Body */}
                                            <div className="p-6 text-foreground text-xs leading-relaxed max-h-[340px] overflow-y-auto">
                                                <div className="max-w-[540px] mx-auto bg-[#14141d] border border-white/10 rounded-xl p-6 shadow-xl space-y-4">
                                                    <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                                                        <div className="h-7 w-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-primary text-xs">
                                                            P
                                                        </div>
                                                        <span className="font-bold text-sm tracking-wide text-foreground">PORTALARR</span>
                                                    </div>

                                                    <h4 className="text-base font-bold text-foreground">{renderedBroadcastSubjectPreview}</h4>

                                                    <div 
                                                        className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed text-gray-300"
                                                        dangerouslySetInnerHTML={{ __html: renderedBroadcastBodyPreview }}
                                                    />

                                                    <div className="pt-4 border-t border-white/10 text-center">
                                                        <a 
                                                            href="#" 
                                                            onClick={(e) => e.preventDefault()}
                                                            className="inline-block bg-primary text-primary-foreground font-semibold text-xs px-4 py-2 rounded-lg shadow-md"
                                                        >
                                                            Open Portalarr
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>

                            <CardFooter className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/40">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={sendingTestBroadcast || !broadcastSubject.trim() || !broadcastBody.trim()}
                                    onClick={handleSendTestBroadcast}
                                    className="text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                >
                                    {sendingTestBroadcast ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Send Test to Admin Inbox
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={selectedUserIds.length === 0 || !broadcastSubject.trim() || !broadcastBody.trim() || broadcasting}
                                    onClick={() => setShowConfirmModal(true)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 px-4 shadow-md shadow-primary/20"
                                >
                                    {broadcasting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Megaphone className="h-3.5 w-3.5" />}
                                    Broadcast to {selectedUserIds.length} Selected User{selectedUserIds.length === 1 ? "" : "s"}
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                </div>
            )}

            {/* CONFIRM BROADCAST MODAL */}
            <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
                <DialogContent className="sm:max-w-[500px] bg-[#121218] border-border/60 text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-foreground">
                            <Megaphone className="h-5 w-5 text-primary" /> Confirm Mass Email Broadcast
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            You are about to dispatch personalized emails to {selectedUserIds.length} recipient{selectedUserIds.length === 1 ? "" : "s"}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <div className="bg-black/40 p-3 rounded-lg border border-border/40 space-y-1.5">
                            <div><strong>Subject:</strong> <span className="text-primary">{broadcastSubject}</span></div>
                            <div><strong>Total Recipients:</strong> <Badge variant="outline">{selectedUserIds.length} users</Badge></div>
                            <div><strong>Delivery Method:</strong> Individual SMTP dispatches (Privacy isolated)</div>
                        </div>

                        <div className="text-[11px] text-muted-foreground">
                            <strong>Sample Recipients:</strong> {
                                users
                                    .filter(u => selectedUserIds.includes(u.id))
                                    .slice(0, 5)
                                    .map(u => u.username)
                                    .join(", ")
                            }
                            {selectedUserIds.length > 5 && ` and ${selectedUserIds.length - 5} more...`}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" size="sm" onClick={() => setShowConfirmModal(false)} disabled={broadcasting}>
                            Cancel
                        </Button>
                        <Button 
                            variant="default" 
                            size="sm" 
                            onClick={handleExecuteBroadcast} 
                            disabled={broadcasting}
                            className="font-bold bg-primary text-primary-foreground gap-1.5"
                        >
                            {broadcasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {broadcasting ? "Sending Broadcast..." : "Yes, Send Broadcast"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* --- SUB-TAB 2: NOTIFICATION TEMPLATES --- */}
            {/* ========================================================================= */}
            {subTab === "templates" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT COLUMN: TEMPLATE CHOOSER (4 cols) */}
                    <Card className="lg:col-span-4 flex flex-col bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Code className="h-4.5 w-4.5 text-primary" /> System Templates
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Select an automated notification template to customize its subject line and email body.
                            </CardDescription>

                            {/* Category Filter */}
                            <div className="flex flex-wrap gap-1 pt-2">
                                {[
                                    { id: "all", label: "All" },
                                    { id: "auth", label: "Accounts" },
                                    { id: "trials", label: "Trials & Billing" },
                                    { id: "requests", label: "Media & Requests" },
                                    { id: "kindle", label: "Kindle Delivery" },
                                    { id: "support", label: "Support & Tickets" }
                                ].map(cat => (
                                    <Button
                                        key={cat.id}
                                        type="button"
                                        size="sm"
                                        variant={templateCategoryFilter === cat.id ? "secondary" : "ghost"}
                                        className="h-6 text-[10px] px-2"
                                        onClick={() => {
                                            setTemplateCategoryFilter(cat.id);
                                            if (cat.id !== "all") {
                                                const matching = templates.filter(t => isMatchingCategory(t.category, cat.id));
                                                if (matching.length > 0 && !matching.some(t => t.id === selectedTemplateId)) {
                                                    handleSelectTemplate(matching[0].id);
                                                }
                                            }
                                        }}
                                    >
                                        {cat.label}
                                    </Button>
                                ))}
                            </div>
                        </CardHeader>

                        <CardContent className="p-0 flex-1 overflow-y-auto max-h-[500px]">
                            <div className="divide-y divide-border/20">
                                {templates
                                    .filter(t => isMatchingCategory(t.category, templateCategoryFilter))
                                    .map(tpl => {
                                        const isSelected = tpl.id === selectedTemplateId;
                                        return (
                                            <div
                                                key={tpl.id}
                                                onClick={() => handleSelectTemplate(tpl.id)}
                                                className={`p-3 cursor-pointer transition-colors text-xs space-y-1 ${
                                                    isSelected ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/20"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-semibold text-foreground truncate">
                                                        {tpl.name}
                                                    </div>
                                                    {tpl.isCustom ? (
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400 bg-amber-500/10">
                                                            Customized
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                                                            Default
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                                    {tpl.description}
                                                </p>
                                            </div>
                                        );
                                    })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* RIGHT COLUMN: TEMPLATE EDITOR & PREVIEW (8 cols) */}
                    <div className="lg:col-span-8 space-y-4">
                        {currentTemplate && (
                            <Card className="bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
                                <CardHeader className="pb-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-base text-foreground">
                                                    {currentTemplate.name}
                                                </CardTitle>
                                                {currentTemplate.isCustom ? (
                                                    <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px]">
                                                        Custom Overrides Active
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Portalarr Default
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription className="text-xs mt-0.5">
                                                {currentTemplate.description}
                                            </CardDescription>
                                        </div>

                                        <Tabs value={templateEditorTab} onValueChange={(v) => setTemplateEditorTab(v as any)} className="h-8">
                                            <TabsList className="h-8 p-0.5 bg-black/40 border border-white/10">
                                                <TabsTrigger value="write" className="text-xs px-3 h-7">Edit Template</TabsTrigger>
                                                <TabsTrigger value="preview" className="text-xs px-3 h-7 gap-1">
                                                    <Eye className="h-3 w-3" /> Live Preview
                                                </TabsTrigger>
                                            </TabsList>
                                        </Tabs>
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    {templateSaveMsg && (
                                        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                                            templateSaveMsg.type === "success" 
                                                ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40" 
                                                : "bg-red-950/40 text-red-300 border border-red-800/40"
                                        }`}>
                                            {templateSaveMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                            <span>{templateSaveMsg.text}</span>
                                        </div>
                                    )}

                                    {testTemplateMsg && (
                                        <div className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
                                            testTemplateMsg.type === "success" 
                                                ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40" 
                                                : "bg-red-950/40 text-red-300 border border-red-800/40"
                                        }`}>
                                            {testTemplateMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                            <span>{testTemplateMsg.text}</span>
                                        </div>
                                    )}

                                    {/* DYNAMIC VARIABLES FOR THIS TEMPLATE */}
                                    <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-lg border border-border/40">
                                        <div className="flex items-center justify-between text-[11px] font-semibold text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Sparkles className="h-3 w-3 text-amber-400" /> Available Template Variables:
                                            </span>
                                            <span className="text-[10px] italic">Click to append to template</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 pt-1">
                                            {currentTemplate.variables.map(v => (
                                                <button
                                                    key={v.key}
                                                    type="button"
                                                    onClick={() => setTemplateBody(prev => prev + v.key)}
                                                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 active:scale-95 transition-all flex items-center gap-1 cursor-pointer"
                                                    title={`${v.description} (e.g. "${v.sampleValue}")`}
                                                >
                                                    <span>{v.key}</span>
                                                    <span className="text-muted-foreground text-[9px]">({v.description})</span>
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={() => setTemplateBody(prev => prev + "{appUrl}")}
                                                className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 text-primary border border-primary/30 hover:bg-primary/20 transition-all cursor-pointer"
                                            >
                                                {"{appUrl}"}
                                            </button>
                                        </div>
                                    </div>

                                    {/* SUBJECT INPUT */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs font-semibold">Email Subject</Label>
                                            {templateSubject !== currentTemplate.defaultSubject && (
                                                <button 
                                                    type="button" 
                                                    onClick={() => setTemplateSubject(currentTemplate.defaultSubject)}
                                                    className="text-[10px] text-muted-foreground hover:text-primary underline"
                                                >
                                                    Reset Subject
                                                </button>
                                            )}
                                        </div>
                                        <Input
                                            value={templateSubject}
                                            onChange={(e) => setTemplateSubject(e.target.value)}
                                            className="h-9 text-sm bg-black/40 border-white/10"
                                        />
                                    </div>

                                    {/* WRITE OR PREVIEW BODY */}
                                    {templateEditorTab === "write" ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-semibold">Email Body (HTML)</Label>
                                                <span className="text-[10px] text-muted-foreground">HTML formatting & inline styles supported</span>
                                            </div>
                                            <Textarea
                                                rows={12}
                                                value={templateBody}
                                                onChange={(e) => setTemplateBody(e.target.value)}
                                                className="font-mono text-xs leading-relaxed bg-black/40 border-white/10"
                                            />
                                        </div>
                                    ) : (
                                        /* LIVE TEMPLATE PREVIEW */
                                        <div className="space-y-3">
                                            <div className="border border-border/60 rounded-xl overflow-hidden shadow-inner bg-[#0d0d12]">
                                                {/* Email Header */}
                                                <div className="bg-[#181822] p-3 border-b border-border/40 space-y-1 text-xs font-sans">
                                                    <div className="text-muted-foreground text-[11px]">
                                                        <strong>Subject:</strong> {renderedTemplateSubjectPreview}
                                                    </div>
                                                </div>

                                                {/* Email Card Frame */}
                                                <div className="p-6 text-foreground text-xs leading-relaxed max-h-[340px] overflow-y-auto">
                                                    <div className="max-w-[540px] mx-auto bg-[#14141d] border border-white/10 rounded-xl p-6 shadow-xl space-y-4">
                                                        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                                                            <div className="h-7 w-7 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-primary text-xs">
                                                                P
                                                            </div>
                                                            <span className="font-bold text-sm tracking-wide text-foreground">PORTALARR</span>
                                                        </div>

                                                        <h4 className="text-base font-bold text-foreground">{renderedTemplateSubjectPreview}</h4>

                                                        <div 
                                                            className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed text-gray-300"
                                                            dangerouslySetInnerHTML={{ __html: renderedTemplateBodyPreview }}
                                                        />

                                                        <div className="pt-4 border-t border-white/10 text-center">
                                                            <a 
                                                                href="#" 
                                                                onClick={(e) => e.preventDefault()}
                                                                className="inline-block bg-primary text-primary-foreground font-semibold text-xs px-4 py-2 rounded-lg shadow-md"
                                                            >
                                                                Open Portalarr
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>

                                <CardFooter className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/40">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={testingTemplate}
                                            onClick={handleSendTestTemplate}
                                            className="text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                        >
                                            {testingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                            Send Test Preview
                                        </Button>

                                        {currentTemplate.isCustom && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleResetTemplate}
                                                className="text-xs text-muted-foreground hover:text-red-400 gap-1"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
                                            </Button>
                                        )}
                                    </div>

                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={savingTemplate}
                                        onClick={handleSaveTemplate}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 px-4 shadow-md shadow-primary/20"
                                    >
                                        {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        Save Template
                                    </Button>
                                </CardFooter>
                            </Card>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* --- SUB-TAB 3: DISPATCH CONTROLS & MASTER SWITCHES --- */}
            {/* ========================================================================= */}
            {subTab === "notifications" && (
                <Card className="bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-foreground">
                                    <Bell className="h-5 w-5 text-amber-500" /> Automated Email Dispatch Controls
                                </CardTitle>
                                <CardDescription>
                                    Enable or disable individual automated email notification categories across the system.
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                {emailSettingsMsg && (
                                    <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> {emailSettingsMsg}
                                    </span>
                                )}
                                <div className="flex items-center gap-2 bg-muted/40 p-1.5 px-3 rounded-lg border border-border/50">
                                    <Label htmlFor="master-email-toggle-2" className="text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                                        {emailSettings.emailNotificationsEnabled ? (
                                            <span className="text-emerald-400 flex items-center gap-1">
                                                <Bell className="h-3.5 w-3.5" /> All Outbound Emails Active
                                            </span>
                                        ) : (
                                            <span className="text-red-400 flex items-center gap-1">
                                                <BellOff className="h-3.5 w-3.5" /> All Outbound Emails Disabled
                                            </span>
                                        )}
                                    </Label>
                                    <Switch
                                        id="master-email-toggle-2"
                                        checked={emailSettings.emailNotificationsEnabled}
                                        onCheckedChange={(val) => handleToggleEmailSetting("emailNotificationsEnabled", val)}
                                    />
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                        {!emailSettings.emailNotificationsEnabled && (
                            <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-3.5 text-xs text-red-300 flex items-center gap-2.5">
                                <BellOff className="h-5 w-5 shrink-0 text-red-400" />
                                <span>
                                    <strong>Master Killswitch Engaged:</strong> All automated outgoing email dispatches (approvals, new user alerts, password resets, media ready notifications, ticket alerts, and Send-to-Kindle) are completely suspended.
                                </span>
                            </div>
                        )}

                        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 ${!emailSettings.emailNotificationsEnabled ? "opacity-50 pointer-events-none" : ""}`}>
                            {/* 1. User Account Approvals */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <UserCheck className="h-4 w-4 text-emerald-400" /> User Account Approvals
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Email users a welcome notification when their account request is approved by an admin.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifyUserApproval}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifyUserApproval", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>

                            {/* 2. Admin New Registration Alerts */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <Shield className="h-4 w-4 text-blue-400" /> New User Requests
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Send alert emails to server administrators whenever a new user registers a pending account.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifyAdminNewUserRequest}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifyAdminNewUserRequest", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>

                            {/* 3. Password Resets */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <Key className="h-4 w-4 text-amber-400" /> Password Resets
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Send temporary password emails for user forgot-password and admin reset actions.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifyPasswordReset}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifyPasswordReset", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>

                            {/* 4. Media & Book Requests */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <BookOpen className="h-4 w-4 text-indigo-400" /> Media & Book Requests
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Notify users when requested books/audiobooks are ready, failed, or require admin attention.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifyMediaRequests}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifyMediaRequests", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>

                            {/* 5. Support Tickets */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <LifeBuoy className="h-4 w-4 text-cyan-400" /> Support Tickets
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Dispatch email notifications for submitted tickets, automated error reports, and admin status updates.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifySupportTickets}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifySupportTickets", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>

                            {/* 6. Send-to-Kindle Deliveries */}
                            <div className="flex items-start justify-between p-3.5 rounded-xl border border-muted/50 bg-muted/20 hover:bg-muted/30 transition-all">
                                <div className="space-y-1 pr-3">
                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                        <Send className="h-4 w-4 text-amber-500" /> Send-to-Kindle Deliveries
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-tight">
                                        Allow users and automatic download grabbers to deliver ebook attachments directly to Kindle devices.
                                    </p>
                                </div>
                                <Switch
                                    checked={emailSettings.notifySendToKindle}
                                    onCheckedChange={(val) => handleToggleEmailSetting("notifySendToKindle", val)}
                                    disabled={!emailSettings.emailNotificationsEnabled}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
