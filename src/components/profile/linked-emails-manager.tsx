"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Mail, Plus, Trash2, Edit2, CheckCircle2, XCircle, AlertCircle, 
    Loader2, Users, CreditCard, Megaphone, Film, CheckSquare, 
    BookOpen, MessageSquare, Sparkles, Heart, Briefcase, UserCheck
} from "lucide-react";
import {
    getUserLinkedEmailsAction,
    addOrUpdateLinkedEmailAction,
    deleteLinkedEmailAction,
    toggleLinkedEmailCategoryAction,
    LinkedEmailRecord
} from "@/app/linked-email-actions";

const PRESET_LABELS = [
    { value: "Spouse / Partner", label: "💍 Spouse / Partner", icon: Heart },
    { value: "Family Member", label: "👨‍👩‍👧‍👦 Family Member", icon: Users },
    { value: "Daily Primary", label: "⭐ Daily Primary Inbox", icon: UserCheck },
    { value: "Work / Alternate", label: "💼 Work / Alternate", icon: Briefcase },
    { value: "Custom", label: "✏️ Custom Label...", icon: Sparkles }
];

interface LinkedEmailsManagerProps {
    targetUserId?: string;
    onChanged?: () => void;
}

export function LinkedEmailsManager({ targetUserId, onChanged }: LinkedEmailsManagerProps) {
    const [linkedEmails, setLinkedEmails] = useState<LinkedEmailRecord[]>([]);
    const [primaryEmail, setPrimaryEmail] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<LinkedEmailRecord | null>(null);
    const [modalEmail, setModalEmail] = useState("");
    const [modalLabelType, setModalLabelType] = useState("Spouse / Partner");
    const [modalCustomLabel, setModalCustomLabel] = useState("");
    const [modalReminders, setModalReminders] = useState(true);
    const [modalAnnouncements, setModalAnnouncements] = useState(true);
    const [modalMediaReady, setModalMediaReady] = useState(false);
    const [modalRequestApproved, setModalRequestApproved] = useState(false);
    const [modalNewContent, setModalNewContent] = useState(false);
    const [modalSupportTickets, setModalSupportTickets] = useState(false);

    // Alert messages
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [modalError, setModalError] = useState("");

    const loadLinkedEmails = async () => {
        try {
            setLoading(true);
            const res = await getUserLinkedEmailsAction(targetUserId);
            if (res.success && res.linkedEmails) {
                setLinkedEmails(res.linkedEmails);
                if (res.primaryEmail) setPrimaryEmail(res.primaryEmail);
            } else if (res.error) {
                setErrorMsg(res.error);
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to load linked inboxes");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLinkedEmails();
    }, [targetUserId]);

    const openCreateModal = () => {
        setEditingItem(null);
        setModalEmail("");
        setModalLabelType("Spouse / Partner");
        setModalCustomLabel("");
        setModalReminders(true);
        setModalAnnouncements(true);
        setModalMediaReady(false);
        setModalRequestApproved(false);
        setModalNewContent(false);
        setModalSupportTickets(false);
        setModalError("");
        setIsModalOpen(true);
    };

    const openEditModal = (item: LinkedEmailRecord) => {
        setEditingItem(item);
        setModalEmail(item.email);
        const isPreset = PRESET_LABELS.some(p => p.value === item.label && p.value !== "Custom");
        if (isPreset) {
            setModalLabelType(item.label || "Spouse / Partner");
            setModalCustomLabel("");
        } else if (item.label) {
            setModalLabelType("Custom");
            setModalCustomLabel(item.label);
        } else {
            setModalLabelType("Custom");
            setModalCustomLabel("");
        }
        setModalReminders(item.receiveSubscriptionReminders);
        setModalAnnouncements(item.receiveAnnouncements);
        setModalMediaReady(item.receiveMediaReady);
        setModalRequestApproved(item.receiveRequestApproved);
        setModalNewContent(item.receiveNewContent);
        setModalSupportTickets(item.receiveSupportTickets);
        setModalError("");
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError("");

        const cleanEmail = modalEmail.trim().toLowerCase();
        if (!cleanEmail) {
            setModalError("Please enter an email address.");
            return;
        }

        const effectiveLabel = modalLabelType === "Custom"
            ? (modalCustomLabel.trim() || null)
            : modalLabelType;

        setSaving(true);
        try {
            const res = await addOrUpdateLinkedEmailAction({
                id: editingItem?.id,
                email: cleanEmail,
                label: effectiveLabel || undefined,
                receiveSubscriptionReminders: modalReminders,
                receiveAnnouncements: modalAnnouncements,
                receiveMediaReady: modalMediaReady,
                receiveRequestApproved: modalRequestApproved,
                receiveNewContent: modalNewContent,
                receiveSupportTickets: modalSupportTickets,
                targetUserId
            });

            if (res.success) {
                setSuccessMsg(res.message || "Linked inbox saved successfully.");
                setTimeout(() => setSuccessMsg(""), 4000);
                setIsModalOpen(false);
                await loadLinkedEmails();
                if (onChanged) onChanged();
            } else {
                setModalError(res.error || "Failed to save linked email.");
            }
        } catch (e: any) {
            setModalError(e.message || "An unexpected error occurred.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Are you sure you want to remove "${email}" from your linked inboxes?`)) {
            return;
        }

        setDeletingId(id);
        setErrorMsg("");
        try {
            const res = await deleteLinkedEmailAction(id, targetUserId);
            if (res.success) {
                setSuccessMsg(res.message || `Removed ${email}`);
                setTimeout(() => setSuccessMsg(""), 4000);
                await loadLinkedEmails();
                if (onChanged) onChanged();
            } else {
                setErrorMsg(res.error || "Failed to delete linked email.");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to delete linked email.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleQuickToggle = async (
        item: LinkedEmailRecord,
        category: "receiveSubscriptionReminders" | "receiveAnnouncements" | "receiveMediaReady" | "receiveRequestApproved" | "receiveNewContent" | "receiveSupportTickets",
        currentVal: boolean
    ) => {
        const newVal = !currentVal;
        // Optimistic update
        setLinkedEmails(prev => prev.map(em => em.id === item.id ? { ...em, [category]: newVal } : em));

        try {
            const res = await toggleLinkedEmailCategoryAction(item.id, category, newVal, targetUserId);
            if (!res.success) {
                // Revert on error
                setLinkedEmails(prev => prev.map(em => em.id === item.id ? { ...em, [category]: currentVal } : em));
                setErrorMsg(res.error || "Failed to update category");
            }
        } catch {
            setLinkedEmails(prev => prev.map(em => em.id === item.id ? { ...em, [category]: currentVal } : em));
        }
    };

    return (
        <Card id="linked-emails" className="border-cyan-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Mail className="h-5 w-5 text-cyan-400" /> Linked Inboxes & Family Email Routing
                            </CardTitle>
                            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30 text-[11px] font-semibold">
                                {linkedEmails.length} Linked {linkedEmails.length === 1 ? "Inbox" : "Inboxes"}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs text-muted-foreground">
                            Route renewal reminders to your spouse, divert notifications to your daily personal email, or keep household members updated on new media.
                        </CardDescription>
                    </div>
                    <Button
                        type="button"
                        onClick={openCreateModal}
                        className="h-8 px-3 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 shadow-sm active:scale-95 transition-all self-start sm:self-auto shrink-0"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add Linked Inbox
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Burner Plex Account Helper Tip */}
                <div className="p-3 sm:p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-start gap-3 text-xs leading-relaxed text-cyan-200/90">
                    <Sparkles className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                        <p className="font-semibold text-cyan-300">
                            Signed up with a burner Plex login?
                        </p>
                        <p className="text-[11px] text-cyan-200/70">
                            Add your personal daily email below and enable <strong>Billing & Renewals</strong> and <strong>Server Announcements</strong> so you never miss renewal notices or server news.
                        </p>
                    </div>
                </div>

                {successMsg && (
                    <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{successMsg}</span>
                    </div>
                )}
                {errorMsg && (
                    <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                        <XCircle className="h-4 w-4 shrink-0" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                {loading ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
                        <span className="text-xs">Loading linked inboxes...</span>
                    </div>
                ) : linkedEmails.length === 0 ? (
                    <div className="p-6 text-center rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                        <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                        <p className="text-xs font-medium text-foreground">No linked inboxes configured yet</p>
                        <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                            All your notifications currently go to your primary account email {primaryEmail ? `(${primaryEmail})` : ""}. Click &quot;Add Linked Inbox&quot; to send alerts to a partner, spouse, or secondary address.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {linkedEmails.map((item) => (
                            <div 
                                key={item.id}
                                className="p-3.5 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-cyan-500/30 transition-all space-y-3"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                                            <Mail className="h-4 w-4 text-cyan-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                                    {item.email}
                                                </span>
                                                {item.label && (
                                                    <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-300 border-cyan-500/25 h-5 px-1.5 font-medium">
                                                        {item.label}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                Added {new Date(item.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEditModal(item)}
                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-cyan-300 hover:bg-cyan-500/10 gap-1"
                                        >
                                            <Edit2 className="h-3 w-3" />
                                            <span>Edit</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            disabled={deletingId === item.id}
                                            onClick={() => handleDelete(item.id, item.email)}
                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 gap-1"
                                        >
                                            {deletingId === item.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin text-rose-400" />
                                            ) : (
                                                <Trash2 className="h-3 w-3" />
                                            )}
                                            <span>Delete</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Category Routing Chips */}
                                <div className="pt-1 border-t border-white/[0.04]">
                                    <p className="text-[10px] font-semibold text-muted-foreground/80 mb-2 uppercase tracking-wider">
                                        Active Routing:
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveSubscriptionReminders", item.receiveSubscriptionReminders)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveSubscriptionReminders
                                                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <CreditCard className="h-3 w-3 shrink-0" />
                                            <span>Billing & Renewals</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveAnnouncements", item.receiveAnnouncements)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveAnnouncements
                                                    ? "bg-purple-500/15 border-purple-500/40 text-purple-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <Megaphone className="h-3 w-3 shrink-0" />
                                            <span>Announcements</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveMediaReady", item.receiveMediaReady)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveMediaReady
                                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <Film className="h-3 w-3 shrink-0" />
                                            <span>Media Ready</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveRequestApproved", item.receiveRequestApproved)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveRequestApproved
                                                    ? "bg-sky-500/15 border-sky-500/40 text-sky-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <CheckSquare className="h-3 w-3 shrink-0" />
                                            <span>Requests Approved</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveNewContent", item.receiveNewContent)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveNewContent
                                                    ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <BookOpen className="h-3 w-3 shrink-0" />
                                            <span>Weekly Digest</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleQuickToggle(item, "receiveSupportTickets", item.receiveSupportTickets)}
                                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
                                                item.receiveSupportTickets
                                                    ? "bg-rose-500/15 border-rose-500/40 text-rose-300 font-medium"
                                                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground opacity-50 line-through"
                                            }`}
                                        >
                                            <MessageSquare className="h-3 w-3 shrink-0" />
                                            <span>Support Tickets</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            {/* ADD / EDIT LINKED INBOX DIALOG MODAL */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-w-lg bg-[#14141c] border-white/[0.1] text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold flex items-center gap-2">
                            <Mail className="h-4 w-4 text-cyan-400" />
                            {editingItem ? "Edit Linked Inbox" : "Add Linked Family / Secondary Inbox"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Configure which notification categories should be delivered to this email address.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSave} className="space-y-4 py-2">
                        {modalError && (
                            <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-lg flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{modalError}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label htmlFor="linked-email-input" className="text-xs font-semibold">
                                Email Address <span className="text-rose-400">*</span>
                            </Label>
                            <Input
                                id="linked-email-input"
                                type="email"
                                placeholder="spouse@example.com"
                                value={modalEmail}
                                onChange={(e) => setModalEmail(e.target.value)}
                                required
                                className="h-9 text-xs bg-white/[0.03] border-white/[0.1]"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="linked-label-select" className="text-xs font-semibold">
                                    Relationship / Label
                                </Label>
                                <Select value={modalLabelType} onValueChange={setModalLabelType}>
                                    <SelectTrigger id="linked-label-select" className="h-9 text-xs bg-white/[0.03] border-white/[0.1]">
                                        <SelectValue placeholder="Select a label..." />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1a1a24] border-white/[0.1] text-foreground">
                                        {PRESET_LABELS.map(p => (
                                            <SelectItem key={p.value} value={p.value} className="text-xs cursor-pointer">
                                                {p.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {modalLabelType === "Custom" && (
                                <div className="space-y-1.5 animate-in fade-in">
                                    <Label htmlFor="linked-custom-label" className="text-xs font-semibold">
                                        Custom Label Name
                                    </Label>
                                    <Input
                                        id="linked-custom-label"
                                        placeholder="e.g. Living Room iPad"
                                        value={modalCustomLabel}
                                        onChange={(e) => setModalCustomLabel(e.target.value)}
                                        className="h-9 text-xs bg-white/[0.03] border-white/[0.1]"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Granular Notification Category Toggles */}
                        <div className="space-y-2 pt-2 border-t border-white/[0.06]">
                            <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                <CheckSquare className="h-3.5 w-3.5 text-cyan-400" />
                                Notification Delivery Preferences
                            </Label>
                            <p className="text-[11px] text-muted-foreground">
                                Select which notifications this email should receive:
                            </p>

                            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                {/* 1. Billing & Renewals */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                                            <CreditCard className="h-3.5 w-3.5 text-amber-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Billing & Subscription Renewals</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Renewal notices, payment confirmations, invoice warnings</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalReminders} onCheckedChange={setModalReminders} />
                                </div>

                                {/* 2. Announcements */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                                            <Megaphone className="h-3.5 w-3.5 text-purple-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Server Announcements & News</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Scheduled maintenance, upgrades, feature announcements</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalAnnouncements} onCheckedChange={setModalAnnouncements} />
                                </div>

                                {/* 3. Media Ready */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                            <Film className="h-3.5 w-3.5 text-emerald-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Media Ready to Stream</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Alerts when requested movies and series finish downloading</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalMediaReady} onCheckedChange={setModalMediaReady} />
                                </div>

                                {/* 4. Requests Approved */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                                            <CheckSquare className="h-3.5 w-3.5 text-sky-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Media Request Approvals</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Alerts when requested items are approved by an admin</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalRequestApproved} onCheckedChange={setModalRequestApproved} />
                                </div>

                                {/* 5. Weekly Digest */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                            <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">New Content Weekly Digest</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Weekly digest of newly added movies, TV shows, and books</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalNewContent} onCheckedChange={setModalNewContent} />
                                </div>

                                {/* 6. Support Tickets */}
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                                            <MessageSquare className="h-3.5 w-3.5 text-rose-400" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-medium text-foreground">Support Ticket Responses</p>
                                            <p className="text-[10px] text-muted-foreground truncate">Updates when an admin replies to your support tickets</p>
                                        </div>
                                    </div>
                                    <Switch checked={modalSupportTickets} onCheckedChange={setModalSupportTickets} />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                disabled={saving}
                                className="h-8 text-xs border-white/[0.1]"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={saving}
                                className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold gap-1.5"
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                {editingItem ? "Save Changes" : "Link Inbox"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
