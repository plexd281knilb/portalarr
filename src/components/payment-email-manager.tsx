"use client";

import { useState, useEffect } from "react";
import { 
    getPaymentEmailSources, 
    savePaymentEmailSource, 
    deletePaymentEmailSource, 
    testPaymentEmailSourceAction, 
    scanPaymentEmailsAction, 
    getPaymentTransactions, 
    manuallyAttributePaymentTransaction, 
    unmatchPaymentTransactionAction,
    unmatchMultiplePaymentTransactionsAction,
    groupAndAttributePaymentsAction,
    splitPaymentTransactionAction,
    bulkDeletePaymentTransactionsAction,
    savePaymentEmailScraperConfig,
    deletePaymentTransactionAction,
    purgeUnmatchedPaymentTransactionsAction,
    reprocessPaymentTransactionsAction
} from "@/app/payment-actions";
import { getAppUsers } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Mail, DollarSign, RefreshCw, Plus, Trash2, Edit2, Play, CheckCircle2, 
    XCircle, AlertTriangle, ShieldCheck, User, Search, Clock, Sparkles, 
    Layers, ExternalLink, HelpCircle, KeyRound, Server, Check, ArrowRight,
    Unlink, Scissors, CheckSquare, Square, Split, Users
} from "lucide-react";
import { format } from "date-fns";

export default function PaymentEmailManager() {
    const [sources, setSources] = useState<any[]>([]);
    const [config, setConfig] = useState<any>({
        paymentEmailAutoScan: true,
        paymentEmailScanInterval: 15,
        paymentEmailLookbackDays: 365,
        paymentLastScanAt: null,
        paymentLastScanResult: null
    });
    const [transactions, setTransactions] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanLookback, setScanLookback] = useState("365");
    const [scanResult, setScanResult] = useState<any>(null);

    // Source Add/Edit Modal
    const [sourceModalOpen, setSourceModalOpen] = useState(false);
    const [editingSource, setEditingSource] = useState<any | null>(null);
    const [formName, setFormName] = useState("");
    const [formHost, setFormHost] = useState("imap.gmail.com");
    const [formPort, setFormPort] = useState(993);
    const [formSecure, setFormSecure] = useState(true);
    const [formUser, setFormUser] = useState("");
    const [formPass, setFormPass] = useState("");
    const [formMailbox, setFormMailbox] = useState("INBOX");
    const [formEnabled, setFormEnabled] = useState(true);
    const [savingSource, setSavingSource] = useState(false);
    const [sourceMsg, setSourceMsg] = useState("");
    const [sourceErr, setSourceErr] = useState("");

    // Testing Connection State
    const [testingConn, setTestingConn] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    // Manual Assign Modal
    const [assignModalTx, setAssignModalTx] = useState<any | null>(null);
    const [assignUserId, setAssignUserId] = useState("");
    const [assignSearch, setAssignSearch] = useState("");
    const [assigning, setAssigning] = useState(false);
    const [assignMsg, setAssignMsg] = useState("");
    const [assignErr, setAssignErr] = useState("");

    // Batch Selection State
    const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [unmatchingTxId, setUnmatchingTxId] = useState<string | null>(null);

    // Group Modal State
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [groupUserId, setGroupUserId] = useState("");
    const [groupSearch, setGroupSearch] = useState("");
    const [groupNote, setGroupNote] = useState("");
    const [grouping, setGrouping] = useState(false);
    const [groupMsg, setGroupMsg] = useState("");
    const [groupErr, setGroupErr] = useState("");

    // Split Modal State
    const [splitModalTx, setSplitModalTx] = useState<any | null>(null);
    const [splitParts, setSplitParts] = useState<{ amount: string; userId: string; note: string }[]>([
        { amount: "", userId: "", note: "" },
        { amount: "", userId: "", note: "" }
    ]);
    const [splitting, setSplitting] = useState(false);
    const [splitMsg, setSplitMsg] = useState("");
    const [splitErr, setSplitErr] = useState("");

    // Transactions Filter
    const [txFilter, setTxFilter] = useState("ALL");

    const loadData = async () => {
        setLoading(true);
        try {
            const [sourcesRes, txRes, usersRes] = await Promise.all([
                getPaymentEmailSources(),
                getPaymentTransactions(txFilter),
                getAppUsers()
            ]);

            if (sourcesRes.success) {
                setSources(sourcesRes.sources || []);
                if (sourcesRes.config) {
                    setConfig(sourcesRes.config);
                    if (sourcesRes.config.paymentEmailLookbackDays !== undefined && sourcesRes.config.paymentEmailLookbackDays !== null) {
                        setScanLookback(String(sourcesRes.config.paymentEmailLookbackDays));
                    }
                }
            }
            if (txRes.success) {
                setTransactions(txRes.transactions || []);
            }
            if (Array.isArray(usersRes)) {
                setAllUsers(usersRes);
            } else if ((usersRes as any)?.users) {
                setAllUsers((usersRes as any).users);
            }
        } catch (err) {
            console.error("Failed to load payment email data:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [txFilter]);

    const handleOpenAddModal = (preset?: "gmail" | "outlook" | "yahoo" | "custom") => {
        setEditingSource(null);
        setSourceMsg("");
        setSourceErr("");
        setTestResult(null);

        if (preset === "gmail") {
            setFormName("Gmail (Venmo / Zelle / PayPal)");
            setFormHost("imap.gmail.com");
            setFormPort(993);
            setFormSecure(true);
            setFormMailbox("INBOX");
        } else if (preset === "outlook") {
            setFormName("Outlook / Office365");
            setFormHost("outlook.office365.com");
            setFormPort(993);
            setFormSecure(true);
            setFormMailbox("INBOX");
        } else if (preset === "yahoo") {
            setFormName("Yahoo Mail");
            setFormHost("imap.mail.yahoo.com");
            setFormPort(993);
            setFormSecure(true);
            setFormMailbox("INBOX");
        } else {
            setFormName("");
            setFormHost("");
            setFormPort(993);
            setFormSecure(true);
            setFormMailbox("INBOX");
        }

        setFormUser("");
        setFormPass("");
        setFormEnabled(true);
        setSourceModalOpen(true);
    };

    const handleOpenEditModal = (src: any) => {
        setEditingSource(src);
        setSourceMsg("");
        setSourceErr("");
        setTestResult(null);
        setFormName(src.name);
        setFormHost(src.host);
        setFormPort(src.port);
        setFormSecure(src.secure);
        setFormUser(src.user);
        setFormPass(""); // Keep empty unless updating
        setFormMailbox(src.mailbox || "INBOX");
        setFormEnabled(src.enabled);
        setSourceModalOpen(true);
    };

    const handleTestConnection = async () => {
        setTestingConn(true);
        setTestResult(null);
        setSourceErr("");

        const formData = new FormData();
        if (editingSource?.id) formData.append("id", editingSource.id);
        formData.append("host", formHost);
        formData.append("port", String(formPort));
        formData.append("secure", String(formSecure));
        formData.append("user", formUser);
        formData.append("pass", formPass);
        formData.append("mailbox", formMailbox);

        const res = await testPaymentEmailSourceAction(formData);
        setTestingConn(false);
        setTestResult(res);
    };

    const handleSaveSource = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSource(true);
        setSourceMsg("");
        setSourceErr("");

        const formData = new FormData();
        if (editingSource?.id) formData.append("id", editingSource.id);
        formData.append("name", formName);
        formData.append("host", formHost);
        formData.append("port", String(formPort));
        formData.append("secure", String(formSecure));
        formData.append("user", formUser);
        if (formPass) formData.append("pass", formPass);
        formData.append("mailbox", formMailbox);
        formData.append("enabled", String(formEnabled));

        const res = await savePaymentEmailSource(formData);
        setSavingSource(false);

        if (res.success) {
            setSourceMsg(res.message || "Source saved successfully!");
            loadData();
            setTimeout(() => {
                setSourceModalOpen(false);
            }, 1200);
        } else {
            setSourceErr(res.error || "Failed to save email source.");
        }
    };

    const handleDeleteSource = async (id: string) => {
        if (!confirm("Are you sure you want to remove this email source?")) return;
        const res = await deletePaymentEmailSource(id);
        if (res.success) {
            loadData();
        } else {
            alert(res.error || "Failed to delete source");
        }
    };

    const handleRunScan = async (sourceId?: string) => {
        setScanning(true);
        setScanResult(null);
        try {
            const parsed = parseInt(scanLookback, 10);
            const days = !isNaN(parsed) ? parsed : (config.paymentEmailLookbackDays ?? 365);
            const res = await scanPaymentEmailsAction(sourceId, days);
            setScanResult(res);
            loadData();
        } catch (err: any) {
            setScanResult({ success: false, errors: [err.message || "Scan failed"] });
        } finally {
            setScanning(false);
        }
    };

    const handleSaveScheduleConfig = async (enabled: boolean, interval: number) => {
        const parsed = parseInt(scanLookback, 10);
        const lookbackDays = !isNaN(parsed) ? parsed : (config.paymentEmailLookbackDays ?? 365);
        const formData = new FormData();
        formData.append("paymentEmailAutoScan", String(enabled));
        formData.append("paymentEmailScanInterval", String(interval));
        formData.append("paymentEmailLookbackDays", String(lookbackDays));
        await savePaymentEmailScraperConfig(formData);
        setConfig((prev: any) => ({
            ...prev,
            paymentEmailAutoScan: enabled,
            paymentEmailScanInterval: interval,
            paymentEmailLookbackDays: lookbackDays
        }));
    };

    const handleLookbackChange = async (val: string) => {
        setScanLookback(val);
        const parsed = parseInt(val, 10);
        const lookbackDays = isNaN(parsed) ? 365 : parsed;
        const formData = new FormData();
        formData.append("paymentEmailAutoScan", String(config.paymentEmailAutoScan ?? true));
        formData.append("paymentEmailScanInterval", String(config.paymentEmailScanInterval ?? 15));
        formData.append("paymentEmailLookbackDays", String(lookbackDays));
        await savePaymentEmailScraperConfig(formData);
        setConfig((prev: any) => ({
            ...prev,
            paymentEmailLookbackDays: lookbackDays
        }));
    };

    const handleOpenAssignModal = (tx: any) => {
        setAssignModalTx(tx);
        setAssignUserId(tx.matchedUserId || "");
        setAssignSearch("");
        setAssignMsg("");
        setAssignErr("");
    };

    const handleAssignUser = async () => {
        if (!assignModalTx || !assignUserId) return;
        setAssigning(true);
        setAssignMsg("");
        setAssignErr("");

        const res = await manuallyAttributePaymentTransaction(assignModalTx.id, assignUserId);
        setAssigning(false);

        if (res.success) {
            setAssignMsg(res.message || "Payment assigned successfully!");
            loadData();
            setTimeout(() => {
                setAssignModalTx(null);
            }, 1500);
        } else {
            setAssignErr(res.error || "Failed to attribute transaction.");
        }
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!confirm("Are you sure you want to delete this payment transaction?")) return;
        const res = await deletePaymentTransactionAction(id);
        if (res.success) {
            setTransactions(prev => prev.filter(t => t.id !== id));
            setSelectedTxIds(prev => prev.filter(item => item !== id));
        } else {
            alert(res.error || "Failed to delete transaction");
        }
    };

    // --- SELECTION & BULK ACTIONS ---
    const handleToggleSelectTx = (id: string) => {
        setSelectedTxIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const handleSelectAllTx = () => {
        if (selectedTxIds.length === transactions.length) {
            setSelectedTxIds([]);
        } else {
            setSelectedTxIds(transactions.map(t => t.id));
        }
    };

    // --- UNMATCH ACTIONS ---
    const handleUnmatch = async (tx: any) => {
        const username = tx.matchedUser?.username || "this member";
        if (!confirm(`Are you sure you want to unmatch the $${tx.amount.toFixed(2)} payment from "${username}"?\n\nTheir remaining subscription and Plex access will be automatically recalculated.`)) {
            return;
        }
        setUnmatchingTxId(tx.id);
        const res = await unmatchPaymentTransactionAction(tx.id);
        setUnmatchingTxId(null);
        if (res.success) {
            loadData();
        } else {
            alert(res.error || "Failed to unmatch payment transaction.");
        }
    };

    const handleBulkUnmatch = async () => {
        const matchedSelected = transactions.filter(t => selectedTxIds.includes(t.id) && t.matchedUserId);
        if (matchedSelected.length === 0) {
            alert("None of the selected transactions are currently linked to a member.");
            return;
        }
        if (!confirm(`Are you sure you want to unmatch ${matchedSelected.length} payment(s)?\n\nAffected members' subscriptions and Plex access will be recalculated.`)) {
            return;
        }
        setBulkActionLoading(true);
        const res = await unmatchMultiplePaymentTransactionsAction(matchedSelected.map(t => t.id));
        setBulkActionLoading(false);
        if (res.success) {
            setSelectedTxIds([]);
            loadData();
        } else {
            alert(res.error || "Failed to bulk unmatch transactions.");
        }
    };

    const handleBulkDelete = async () => {
        if (!confirm(`Are you sure you want to delete ${selectedTxIds.length} selected payment transaction(s)?\n\nThis will permanently delete the records and recalculate affected member subscriptions.`)) {
            return;
        }
        setBulkActionLoading(true);
        const res = await bulkDeletePaymentTransactionsAction(selectedTxIds);
        setBulkActionLoading(false);
        if (res.success) {
            setSelectedTxIds([]);
            loadData();
        } else {
            alert(res.error || "Failed to bulk delete transactions.");
        }
    };

    // --- GROUPING PAYMENTS ---
    const handleOpenGroupModal = () => {
        if (selectedTxIds.length < 2) {
            alert("Please select at least 2 payment transactions to group together.");
            return;
        }
        const selectedTxs = transactions.filter(t => selectedTxIds.includes(t.id));
        const matchedWithUser = selectedTxs.find(t => t.matchedUserId);
        setGroupUserId(matchedWithUser ? matchedWithUser.matchedUserId : "");
        setGroupSearch("");
        setGroupNote("");
        setGroupMsg("");
        setGroupErr("");
        setGroupModalOpen(true);
    };

    const handleExecuteGroup = async () => {
        if (!groupUserId) {
            setGroupErr("Please select a target member to attribute these payments to.");
            return;
        }
        setGrouping(true);
        setGroupMsg("");
        setGroupErr("");

        const res = await groupAndAttributePaymentsAction(selectedTxIds, groupUserId, groupNote || undefined);
        setGrouping(false);

        if (res.success) {
            setGroupMsg(res.message || "Payments grouped successfully!");
            setSelectedTxIds([]);
            loadData();
            setTimeout(() => {
                setGroupModalOpen(false);
            }, 1500);
        } else {
            setGroupErr(res.error || "Failed to group payments.");
        }
    };

    // --- SPLITTING PAYMENTS ---
    const handleOpenSplitModal = (tx: any) => {
        setSplitModalTx(tx);
        const half = (tx.amount / 2).toFixed(2);
        const remainingHalf = (tx.amount - parseFloat(half)).toFixed(2);
        setSplitParts([
            { amount: half, userId: tx.matchedUserId || "", note: tx.note || "" },
            { amount: remainingHalf, userId: "", note: tx.note || "" }
        ]);
        setSplitMsg("");
        setSplitErr("");
    };

    const handleAddSplitPart = () => {
        setSplitParts(prev => [...prev, { amount: "", userId: "", note: "" }]);
    };

    const handleRemoveSplitPart = (index: number) => {
        if (splitParts.length <= 2) return;
        setSplitParts(prev => prev.filter((_, i) => i !== index));
    };

    const handleSplitPartChange = (index: number, field: "amount" | "userId" | "note", value: string) => {
        setSplitParts(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSplitEvenly = () => {
        if (!splitModalTx || splitParts.length === 0) return;
        const total = splitModalTx.amount;
        const count = splitParts.length;
        const baseAmount = Math.floor((total / count) * 100) / 100;
        const remainder = Math.round((total - baseAmount * count) * 100) / 100;

        setSplitParts(prev => prev.map((part, idx) => ({
            ...part,
            amount: (idx === count - 1 ? (baseAmount + remainder) : baseAmount).toFixed(2)
        })));
    };

    const handleExecuteSplit = async () => {
        if (!splitModalTx) return;
        const totalSplit = splitParts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        if (Math.abs(totalSplit - splitModalTx.amount) > 0.01) {
            setSplitErr(`Split amounts must equal the original total of $${splitModalTx.amount.toFixed(2)}. Current total: $${totalSplit.toFixed(2)}`);
            return;
        }

        setSplitting(true);
        setSplitMsg("");
        setSplitErr("");

        const payload = splitParts.map(p => ({
            amount: parseFloat(p.amount),
            userId: p.userId || null,
            note: p.note || undefined
        }));

        const res = await splitPaymentTransactionAction(splitModalTx.id, payload);
        setSplitting(false);

        if (res.success) {
            setSplitMsg(res.message || "Payment split successfully!");
            loadData();
            setTimeout(() => {
                setSplitModalTx(null);
            }, 1500);
        } else {
            setSplitErr(res.error || "Failed to split payment.");
        }
    };

    const [reprocessing, setReprocessing] = useState(false);
    const [reprocessMsg, setReprocessMsg] = useState("");

    const handleReprocessPayments = async () => {
        setReprocessing(true);
        setReprocessMsg("");
        const res = await reprocessPaymentTransactionsAction();
        setReprocessing(false);
        if (res.success) {
            setReprocessMsg(res.message || "Payments reprocessed successfully!");
            loadData();
            setTimeout(() => setReprocessMsg(""), 4000);
        } else {
            alert(res.error || "Failed to reprocess payments");
        }
    };

    const handlePurgeUnmatched = async () => {
        const unmatchedCount = transactions.filter(t => t.status === "UNMATCHED").length;
        if (!confirm(`Are you sure you want to purge all unmatched payment transactions (${unmatchedCount} found)? This will permanently remove them.`)) return;
        const res = await purgeUnmatchedPaymentTransactionsAction();
        if (res.success) {
            loadData();
        } else {
            alert(res.error || "Failed to purge unmatched transactions");
        }
    };

    const filteredUsers = allUsers.filter(u => {
        if (!assignSearch) return true;
        const s = assignSearch.toLowerCase();
        return u.username.toLowerCase().includes(s) || 
               u.email.toLowerCase().includes(s) || 
               (u.plexUsername && u.plexUsername.toLowerCase().includes(s));
    });

    const groupFilteredUsers = allUsers.filter(u => {
        if (!groupSearch) return true;
        const s = groupSearch.toLowerCase();
        return u.username.toLowerCase().includes(s) || 
               u.email.toLowerCase().includes(s) || 
               (u.plexUsername && u.plexUsername.toLowerCase().includes(s));
    });

    const selectedTransactions = transactions.filter(t => selectedTxIds.includes(t.id));
    const selectedTotalAmount = selectedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    const currentSplitSum = splitParts.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const splitDiff = splitModalTx ? (splitModalTx.amount - currentSplitSum) : 0;
    const isSplitBalanced = Math.abs(splitDiff) < 0.005;

    const getProviderBadge = (provider: string) => {
        switch (provider.toUpperCase()) {
            case "VENMO":
                return <Badge className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px]">Venmo</Badge>;
            case "PAYPAL":
                return <Badge className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px]">PayPal</Badge>;
            case "ZELLE":
                return <Badge className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-[10px]">Zelle</Badge>;
            case "CASHAPP":
                return <Badge className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px]">Cash App</Badge>;
            default:
                return <Badge variant="outline" className="text-[10px]">{provider}</Badge>;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* --- TOP CONTROL PANEL & SCANNER STATUS --- */}
            <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-md shadow-md relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="p-1.5 rounded-lg bg-primary/20 text-primary border border-primary/30">
                                    <Mail className="h-5 w-5" />
                                </span>
                                <CardTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                    Automated Payment Email Scraper & Verification
                                </CardTitle>
                                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold">
                                    {sources.filter(s => s.enabled).length} Active Sources
                                </Badge>
                            </div>
                            <CardDescription className="text-xs sm:text-sm">
                                Scrapes inbound payment confirmation emails from Venmo, PayPal, Zelle, and Cash App across multiple email accounts. Automatically attributes subscription payments to users and grants Plex library access.
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1.5 bg-background/60 p-1 rounded-lg border border-border/60">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold px-1.5 hidden sm:inline">Lookback:</span>
                                <Select value={scanLookback} onValueChange={handleLookbackChange}>
                                    <SelectTrigger className="h-7 text-xs w-36 bg-background border-border/40 font-medium">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="365">Past 1 Year (365d)</SelectItem>
                                        <SelectItem value="180">Past 6 Months (180d)</SelectItem>
                                        <SelectItem value="90">Past 3 Months (90d)</SelectItem>
                                        <SelectItem value="30">Past 30 Days</SelectItem>
                                        <SelectItem value="14">Past 14 Days</SelectItem>
                                        <SelectItem value="0">All Recent (300 msgs)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <Button 
                                onClick={() => handleRunScan()} 
                                disabled={scanning || sources.length === 0}
                                className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-2 text-xs sm:text-sm shadow-md transition-all active:scale-95 cursor-pointer h-9 px-3.5"
                            >
                                <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
                                {scanning ? "Scanning Emails..." : "Scan All Emails Now"}
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                    {/* Telemetry Summary & Schedule Controls */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-black/40 border border-border/40 text-xs">
                        <div className="space-y-1">
                            <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider block">Auto-Scan Schedule</span>
                            <div className="flex items-center gap-2.5">
                                <Switch 
                                    checked={config.paymentEmailAutoScan} 
                                    onCheckedChange={(val) => handleSaveScheduleConfig(val, config.paymentEmailScanInterval || 15)}
                                />
                                <span className="font-semibold text-foreground">
                                    {config.paymentEmailAutoScan ? "Enabled" : "Paused"}
                                </span>
                                {config.paymentEmailAutoScan && (
                                    <Select 
                                        value={String(config.paymentEmailScanInterval || 15)} 
                                        onValueChange={(val) => handleSaveScheduleConfig(true, parseInt(val, 10))}
                                    >
                                        <SelectTrigger className="h-7 text-xs w-28 bg-background border-border/60">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="5">Every 5m</SelectItem>
                                            <SelectItem value="15">Every 15m</SelectItem>
                                            <SelectItem value="30">Every 30m</SelectItem>
                                            <SelectItem value="60">Every 1 hr</SelectItem>
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider block">Last Automated Scan</span>
                            <p className="font-bold text-foreground">
                                {config.paymentLastScanAt ? format(new Date(config.paymentLastScanAt), "MMM d, yyyy • h:mm:ss a") : "Never Scanned"}
                            </p>
                        </div>

                        <div className="space-y-1">
                            <span className="text-muted-foreground uppercase font-bold text-[10px] tracking-wider block">Last Telemetry</span>
                            <p className="text-muted-foreground text-xs truncate">
                                {config.paymentLastScanResult ? (
                                    <span className="text-emerald-400 font-medium">
                                        Scanned {config.paymentLastScanResult.scannedMessages || 0} emails • Found {config.paymentLastScanResult.newPaymentsFound || 0} new
                                    </span>
                                ) : "Ready"}
                            </p>
                        </div>
                    </div>

                    {/* Live Scan Result Toast */}
                    {scanResult && (
                        <div className={`p-3.5 rounded-xl border text-xs animate-in fade-in duration-200 flex items-start gap-2.5 ${
                            scanResult.errors && scanResult.errors.length > 0 
                                ? "bg-amber-950/40 border-amber-500/40 text-amber-300"
                                : "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                        }`}>
                            {scanResult.errors && scanResult.errors.length > 0 ? (
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                            ) : (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                            )}
                            <div className="space-y-1 flex-1">
                                <p className="font-bold">
                                    Scan Completed across {scanResult.totalSources} source(s): Scanned {scanResult.scannedMessages} messages.
                                </p>
                                <p className="text-[11px] opacity-90">
                                    Found <strong className="text-foreground">{scanResult.newPaymentsFound}</strong> new payments (
                                    <span className="text-emerald-400 font-bold">{scanResult.autoAttributed} Auto-Attributed</span>,{" "}
                                    <span className="text-amber-400 font-bold">{scanResult.unmatched} Unmatched</span>
                                    {scanResult.duplicatePaymentsSkipped ? `, ${scanResult.duplicatePaymentsSkipped} already processed in database` : ""}).
                                </p>
                                {scanResult.errors && scanResult.errors.length > 0 && (
                                    <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-red-300">
                                        {scanResult.errors.map((err: string, i: number) => (
                                            <li key={i}>{err}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* --- SECTION 1: CONFIGURED EMAIL SOURCES --- */}
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <Server className="h-5 w-5 text-primary" /> Connected Email Inboxes ({sources.length})
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Add one or multiple email accounts that receive payment notifications from Venmo, PayPal, Zelle, or Cash App.
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleOpenAddModal("gmail")}
                                className="h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add Gmail
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleOpenAddModal("outlook")}
                                className="h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" /> Add Outlook
                            </Button>
                            <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={() => handleOpenAddModal("custom")}
                                className="h-8 text-xs border-border/60 hover:bg-white/10 gap-1.5"
                            >
                                <Plus className="h-3.5 w-3.5" /> Custom IMAP
                            </Button>
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5">
                    {sources.length === 0 ? (
                        <div className="text-center py-10 px-4 border border-dashed rounded-xl border-border/40 space-y-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary mx-auto">
                                <Mail className="h-6 w-6" />
                            </div>
                            <div className="space-y-1 max-w-sm mx-auto">
                                <h4 className="font-bold text-sm text-foreground">No Payment Email Sources Configured</h4>
                                <p className="text-xs text-muted-foreground">
                                    Connect your Gmail, Outlook, or custom IMAP email to automatically scrape inbound Plex subscription payments.
                                </p>
                            </div>
                            <Button 
                                size="sm" 
                                onClick={() => handleOpenAddModal("gmail")}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-2"
                            >
                                <Plus className="h-3.5 w-3.5" /> Connect First Email Inbox
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            {sources.map((src) => (
                                <div 
                                    key={src.id} 
                                    className="p-4 rounded-xl bg-background/80 border border-border/60 hover:border-border transition-all space-y-3 relative overflow-hidden"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-sm text-foreground truncate">{src.name}</h4>
                                                {src.enabled ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-semibold">
                                                        Active
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        Disabled
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs font-mono text-muted-foreground truncate">{src.user}</p>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleOpenEditModal(src)}
                                                className="h-7 w-7 p-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                                                title="Edit email source"
                                            >
                                                <Edit2 className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleDeleteSource(src.id)}
                                                className="h-7 w-7 p-0 hover:bg-red-500/10 text-red-400 hover:text-red-300"
                                                title="Delete email source"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded-lg border border-border/30">
                                        <div>
                                             <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70 block">Host & Port</span>
                                            <span className="font-mono text-foreground truncate block">{src.host}:{src.port}</span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground/70 block">Folder / Mailbox</span>
                                            <span className="font-mono text-foreground truncate block">{src.mailbox || "INBOX"}</span>
                                        </div>
                                    </div>

                                    {src.lastStatus && (
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 truncate">
                                            {src.lastStatus.includes("Error") ? (
                                                <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                                            ) : (
                                                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                                            )}
                                            <span className="truncate">{src.lastStatus}</span>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <span className="text-[10px] text-muted-foreground">
                                            Last scanned: {src.lastScannedAt ? format(new Date(src.lastScannedAt), "MMM d, h:mm a") : "Never"}
                                        </span>
                                        <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            onClick={() => handleRunScan(src.id)}
                                            disabled={scanning}
                                            className="h-6 px-2 text-[10px] font-semibold text-primary hover:text-primary hover:bg-primary/10 gap-1"
                                        >
                                            <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} /> Scan Now
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* --- SECTION 2: SCANNED PAYMENT TRANSACTIONS & ATTRIBUTION --- */}
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardHeader className="pb-3 border-b border-border/40 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                            <CardTitle className="text-lg font-bold flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-emerald-400" /> Payment Transactions Stream ({transactions.length})
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Inbound payments detected from Venmo, PayPal, Zelle, and Cash App notification emails.
                            </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button 
                                size="sm" 
                                variant="outline" 
                                onClick={handleReprocessPayments}
                                disabled={reprocessing || transactions.length === 0}
                                className="h-8 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1.5 font-semibold"
                                title="Auto-match unmatched payments to members and re-align installment dates"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${reprocessing ? "animate-spin" : ""}`} /> 
                                {reprocessing ? "Re-aligning..." : "Auto-Match & Re-align"}
                            </Button>
                            {transactions.some(t => t.status === "UNMATCHED") && (
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={handlePurgeUnmatched}
                                    className="h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 gap-1.5"
                                    title="Purge all unmatched transactions"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Purge Unmatched
                                </Button>
                            )}
                            <Select value={txFilter} onValueChange={setTxFilter}>
                                <SelectTrigger className="h-8 text-xs w-36 bg-background border-border/60">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Payments</SelectItem>
                                    <SelectItem value="UNMATCHED">⚠️ Unmatched</SelectItem>
                                    <SelectItem value="PROCESSED">✅ Auto-Processed</SelectItem>
                                    <SelectItem value="MANUAL">👤 Manual Assigned</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {reprocessMsg && (
                        <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{reprocessMsg}</span>
                        </div>
                    )}

                    {/* Multi-Select & Batch Actions Toolbar */}
                    {transactions.length > 0 && (
                        <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/30">
                            <div className="flex items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleSelectAllTx}
                                    className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5"
                                >
                                    {selectedTxIds.length === transactions.length && transactions.length > 0 ? (
                                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                                    ) : (
                                        <Square className="h-3.5 w-3.5" />
                                    )}
                                    {selectedTxIds.length === transactions.length && transactions.length > 0 ? "Deselect All" : "Select All"}
                                </Button>
                                {selectedTxIds.length > 0 && (
                                    <Badge className="bg-primary/20 text-primary border border-primary/30 text-xs font-bold px-2 py-0.5">
                                        {selectedTxIds.length} Selected (${selectedTotalAmount.toFixed(2)})
                                    </Badge>
                                )}
                            </div>

                            {selectedTxIds.length > 0 && (
                                <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-right-2">
                                    <Button
                                        size="sm"
                                        onClick={handleOpenGroupModal}
                                        disabled={bulkActionLoading || selectedTxIds.length < 2}
                                        className="h-7 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold gap-1.5 shadow-sm"
                                        title="Group selected payments together and attribute to a single member"
                                    >
                                        <Users className="h-3.5 w-3.5" /> Group & Assign ({selectedTxIds.length})
                                    </Button>
                                    {selectedTransactions.some(t => t.matchedUserId) && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={handleBulkUnmatch}
                                            disabled={bulkActionLoading}
                                            className="h-7 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 font-semibold gap-1.5"
                                            title="Unlink selected payments from members"
                                        >
                                            <Unlink className={`h-3.5 w-3.5 ${bulkActionLoading ? "animate-spin" : ""}`} /> Unmatch Selected
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleBulkDelete}
                                        disabled={bulkActionLoading}
                                        className="h-7 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/30 font-semibold gap-1.5"
                                        title="Delete selected payment records"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => setSelectedTxIds([])}
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        Clear
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-0">
                    {transactions.length === 0 ? (
                        <div className="text-center py-12 px-4 text-muted-foreground text-xs italic">
                            No payment transactions found matching the selected filter. Run a scan to fetch recent emails.
                        </div>
                    ) : (
                        <div className="divide-y divide-border/40 overflow-x-auto">
                            {transactions.map((tx) => (
                                <div 
                                    key={tx.id} 
                                    className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                                        selectedTxIds.includes(tx.id) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-white/[0.02]"
                                    }`}
                                >
                                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                        {/* Selection Checkbox */}
                                        <button
                                            type="button"
                                            onClick={() => handleToggleSelectTx(tx.id)}
                                            className={`p-1.5 rounded-lg border transition-all shrink-0 cursor-pointer mt-0.5 ${
                                                selectedTxIds.includes(tx.id)
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-background/60 hover:bg-white/10 border-border/60 text-muted-foreground"
                                            }`}
                                            title="Select transaction"
                                        >
                                            {selectedTxIds.includes(tx.id) ? (
                                                <CheckSquare className="h-4 w-4" />
                                            ) : (
                                                <Square className="h-4 w-4" />
                                            )}
                                        </button>

                                        <div className="pt-0.5 shrink-0">
                                            {getProviderBadge(tx.provider)}
                                        </div>

                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-extrabold text-base text-foreground">
                                                    ${tx.amount.toFixed(2)} {tx.currency}
                                                </span>
                                                <span className="text-xs text-muted-foreground">•</span>
                                                <span className="text-xs font-semibold text-foreground truncate">
                                                    From: {tx.senderName || tx.senderHandle || tx.senderEmail || "Unknown Sender"}
                                                </span>
                                                {tx.senderHandle && (
                                                    <Badge variant="outline" className="text-[10px] font-mono py-0">
                                                        {tx.senderHandle}
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Note / Memo */}
                                            {tx.note && (
                                                <div className="p-2 rounded-lg bg-muted/30 border border-border/40 text-xs text-foreground/90 font-mono">
                                                    <span className="text-[10px] text-muted-foreground font-sans uppercase font-bold mr-1.5">Note:</span>
                                                    "{tx.note}"
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" /> {format(new Date(tx.emailDate), "MMM d, yyyy • h:mm a")}
                                                </span>
                                                <span>•</span>
                                                <span className="truncate max-w-xs text-muted-foreground/80">
                                                    Subject: {tx.emailSubject}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Attribution Status & Action Buttons */}
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 shrink-0 self-end md:self-auto">
                                        {tx.matchedUser ? (
                                            <>
                                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-0.5 sm:text-right">
                                                    <div className="flex items-center gap-1.5 sm:justify-end">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                        <span className="font-bold text-emerald-400 truncate max-w-[140px]">
                                                            {tx.matchedUser.username}
                                                        </span>
                                                        <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[9px]">
                                                            {tx.status}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                                                        {tx.subscriptionPeriodGranted || "Subscription Granted"}
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-1.5">
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        onClick={() => handleUnmatch(tx)}
                                                        disabled={unmatchingTxId === tx.id}
                                                        className="h-8 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 gap-1 font-medium"
                                                        title="Unmatch payment from member"
                                                    >
                                                        <Unlink className={`h-3.5 w-3.5 ${unmatchingTxId === tx.id ? "animate-spin" : ""}`} /> Unmatch
                                                    </Button>
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        onClick={() => handleOpenAssignModal(tx)}
                                                        className="h-8 text-xs border-border/60 hover:bg-white/10 gap-1"
                                                        title="Reassign to a different member"
                                                    >
                                                        <User className="h-3.5 w-3.5" /> Reassign
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs py-1">
                                                    ⚠️ Unmatched
                                                </Badge>
                                                <Button 
                                                    size="sm" 
                                                    onClick={() => handleOpenAssignModal(tx)}
                                                    className="h-8 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-sm"
                                                >
                                                    <User className="h-3.5 w-3.5" /> Assign User
                                                </Button>
                                            </div>
                                        )}

                                        {/* Split & Delete Buttons */}
                                        <div className="flex items-center gap-1 pl-1 border-l border-border/40">
                                            <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => handleOpenSplitModal(tx)}
                                                className="h-8 text-xs border-border/60 hover:bg-white/10 text-muted-foreground hover:text-foreground gap-1"
                                                title="Split payment into multiple parts"
                                            >
                                                <Scissors className="h-3.5 w-3.5" /> Split
                                            </Button>
                                            <Button 
                                                variant="ghost" 
                                                size="sm" 
                                                onClick={() => handleDeleteTransaction(tx.id)}
                                                className="h-8 w-8 p-0 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 shrink-0"
                                                title="Delete transaction record"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* --- ADD / EDIT EMAIL SOURCE MODAL --- */}
            {sourceModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-lg border-border/50 shadow-2xl relative bg-[#121218]/95 backdrop-blur-md">
                        <CardHeader className="pb-4 border-b border-border/40">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                                <Mail className="h-5 w-5 text-primary" />
                                {editingSource ? "Edit Payment Email Source" : "Connect Payment Email Source"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Configure IMAP settings for this email account. For Gmail and Yahoo, make sure to use an <strong>App Password</strong>.
                            </CardDescription>
                        </CardHeader>

                        <form onSubmit={handleSaveSource}>
                            <CardContent className="space-y-4 pt-4">
                                {sourceMsg && (
                                    <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>{sourceMsg}</span>
                                    </div>
                                )}
                                {sourceErr && (
                                    <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-400 font-medium flex items-center gap-2">
                                        <XCircle className="h-4 w-4 shrink-0" />
                                        <span>{sourceErr}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Account Label / Friendly Name</Label>
                                    <Input 
                                        required
                                        value={formName}
                                        onChange={(e) => setFormName(e.target.value)}
                                        placeholder="e.g. Primary Gmail (Venmo/Zelle)"
                                        className="bg-background text-xs"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2 space-y-1.5">
                                        <Label className="text-xs font-semibold">IMAP Host</Label>
                                        <Input 
                                            required
                                            value={formHost}
                                            onChange={(e) => setFormHost(e.target.value)}
                                            placeholder="e.g. imap.gmail.com"
                                            className="bg-background font-mono text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Port</Label>
                                        <Input 
                                            type="number"
                                            required
                                            value={formPort}
                                            onChange={(e) => setFormPort(parseInt(e.target.value, 10) || 993)}
                                            className="bg-background font-mono text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Email Address / Username</Label>
                                    <Input 
                                        type="email"
                                        required
                                        value={formUser}
                                        onChange={(e) => setFormUser(e.target.value)}
                                        placeholder="e.g. yourname@gmail.com"
                                        className="bg-background font-mono text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Password or App Password</Label>
                                        <span className="text-[10px] text-muted-foreground">
                                            {editingSource?.hasPassword && !formPass ? "(Unchanged)" : "Encrypted in SQLite"}
                                        </span>
                                    </div>
                                    <Input 
                                        type="password"
                                        required={!editingSource?.hasPassword}
                                        value={formPass}
                                        onChange={(e) => setFormPass(e.target.value)}
                                        placeholder={editingSource?.hasPassword ? "Leave blank to keep existing password" : "Enter App Password"}
                                        className="bg-background font-mono text-xs"
                                        autoComplete="new-password"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-1">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Mailbox / Folder</Label>
                                        <Input 
                                            value={formMailbox}
                                            onChange={(e) => setFormMailbox(e.target.value)}
                                            placeholder="INBOX"
                                            className="bg-background font-mono text-xs"
                                        />
                                    </div>
                                    <div className="flex flex-col justify-end pb-1.5">
                                        <div className="flex items-center justify-between p-2 rounded-lg bg-background border border-border/60">
                                            <Label className="text-xs font-semibold cursor-pointer">SSL / TLS</Label>
                                            <Switch checked={formSecure} onCheckedChange={setFormSecure} />
                                        </div>
                                    </div>
                                </div>

                                {testResult && (
                                    <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                                        testResult.success 
                                            ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-300"
                                            : "bg-red-950/40 border-red-500/40 text-red-300"
                                    }`}>
                                        {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                        <span>{testResult.message}</span>
                                    </div>
                                )}
                            </CardContent>

                            <CardFooter className="pt-2 pb-4 border-t border-border/40 flex items-center justify-between gap-2">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={handleTestConnection}
                                    disabled={testingConn || !formHost || !formUser || (!formPass && !editingSource?.hasPassword)}
                                    className="text-xs gap-1.5"
                                >
                                    <Play className={`h-3.5 w-3.5 ${testingConn ? "animate-spin text-primary" : ""}`} />
                                    {testingConn ? "Testing..." : "Test Connection"}
                                </Button>

                                <div className="flex items-center gap-2">
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => setSourceModalOpen(false)}
                                        disabled={savingSource}
                                    >
                                        Cancel
                                    </Button>
                                    <Button 
                                        type="submit" 
                                        size="sm" 
                                        disabled={savingSource}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5"
                                    >
                                        {savingSource ? "Saving..." : "Save Source"}
                                    </Button>
                                </div>
                            </CardFooter>
                        </form>
                    </Card>
                </div>
            )}

            {/* --- MANUAL ASSIGN / REASSIGN USER MODAL --- */}
            {assignModalTx && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md border-border/50 shadow-2xl relative bg-[#121218]/95 backdrop-blur-md">
                        <CardHeader className="pb-3 border-b border-border/40">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                                <User className="h-5 w-5 text-primary" /> {assignModalTx.matchedUserId ? "Reassign Payment to Member" : "Manually Assign Payment"}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Select the member who sent this payment. Portalarr will grant their subscription and update their Plex access.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4">
                            {assignMsg && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{assignMsg}</span>
                                </div>
                            )}
                            {assignErr && (
                                <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-400 font-medium flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{assignErr}</span>
                                </div>
                            )}

                            {/* Payment Summary */}
                            <div className="p-3 rounded-xl bg-background border border-border/60 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground uppercase font-bold text-[10px]">Payment Amount</span>
                                    <span className="font-extrabold text-foreground text-sm">${assignModalTx.amount.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground uppercase font-bold text-[10px]">Provider</span>
                                    <span>{getProviderBadge(assignModalTx.provider)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground uppercase font-bold text-[10px]">Sender</span>
                                    <span className="font-semibold text-foreground">{assignModalTx.senderName || assignModalTx.senderEmail || "Unknown"}</span>
                                </div>
                                {assignModalTx.note && (
                                    <div className="pt-1 border-t border-border/40 text-[11px] text-muted-foreground font-mono">
                                        Note: "{assignModalTx.note}"
                                    </div>
                                )}
                            </div>

                            {/* User Selection */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Select Matching Member</Label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input 
                                        value={assignSearch}
                                        onChange={(e) => setAssignSearch(e.target.value)}
                                        placeholder="Search by username or email..."
                                        className="pl-8 bg-background text-xs h-8"
                                    />
                                </div>

                                <div className="max-h-48 overflow-y-auto space-y-1 p-1 bg-background/60 rounded-lg border border-border/40 divide-y divide-border/20">
                                    {filteredUsers.map((u) => (
                                        <div 
                                            key={u.id}
                                            onClick={() => setAssignUserId(u.id)}
                                            className={`p-2 rounded-md cursor-pointer transition-all flex items-center justify-between text-xs ${
                                                assignUserId === u.id 
                                                    ? "bg-primary/20 border border-primary/40 text-primary font-bold" 
                                                    : "hover:bg-white/5 text-foreground"
                                            }`}
                                        >
                                            <div>
                                                <p className="font-semibold">{u.username}</p>
                                                <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                            </div>
                                            {assignUserId === u.id && <Check className="h-4 w-4 text-primary" />}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-4 border-t border-border/40 flex items-center justify-end gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setAssignModalTx(null)}
                                disabled={assigning}
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleAssignUser}
                                disabled={assigning || !assignUserId}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5"
                            >
                                {assigning ? "Assigning & Granting..." : "Assign & Grant Subscription"}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* --- GROUP & ATTRIBUTE PAYMENTS MODAL --- */}
            {groupModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-lg border-border/50 shadow-2xl relative bg-[#121218]/95 backdrop-blur-md">
                        <CardHeader className="pb-3 border-b border-border/40">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                                <Users className="h-5 w-5 text-primary" /> Group & Attribute Payments ({selectedTransactions.length})
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Combine multiple installment payments together and attribute the total sum to a single member.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4">
                            {groupMsg && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{groupMsg}</span>
                                </div>
                            )}
                            {groupErr && (
                                <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-400 font-medium flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{groupErr}</span>
                                </div>
                            )}

                            {/* Selected Transactions Summary */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                    <span>Selected Payments ({selectedTransactions.length})</span>
                                    <Badge className="bg-emerald-500/20 text-emerald-300 font-extrabold text-xs px-2 py-0.5">
                                        Combined Total: ${selectedTotalAmount.toFixed(2)} USD
                                    </Badge>
                                </div>

                                <div className="max-h-36 overflow-y-auto space-y-1.5 p-2 bg-background rounded-lg border border-border/60">
                                    {selectedTransactions.map((tx) => (
                                        <div key={tx.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/20 border border-border/30">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {getProviderBadge(tx.provider)}
                                                <span className="font-semibold truncate">{tx.senderName || tx.senderEmail || "Sender"}</span>
                                                <span className="text-[10px] text-muted-foreground">{format(new Date(tx.emailDate), "MMM d, yyyy")}</span>
                                            </div>
                                            <span className="font-extrabold text-foreground shrink-0">${tx.amount.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Target User Selector */}
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Assign Combined Total To Member</Label>
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input 
                                        value={groupSearch}
                                        onChange={(e) => setGroupSearch(e.target.value)}
                                        placeholder="Search member by username or email..."
                                        className="pl-8 bg-background text-xs h-8"
                                    />
                                </div>

                                <div className="max-h-40 overflow-y-auto space-y-1 p-1 bg-background/60 rounded-lg border border-border/40 divide-y divide-border/20">
                                    {groupFilteredUsers.map((u) => (
                                        <div 
                                            key={u.id}
                                            onClick={() => setGroupUserId(u.id)}
                                            className={`p-2 rounded-md cursor-pointer transition-all flex items-center justify-between text-xs ${
                                                groupUserId === u.id 
                                                    ? "bg-primary/20 border border-primary/40 text-primary font-bold" 
                                                    : "hover:bg-white/5 text-foreground"
                                            }`}
                                        >
                                            <div>
                                                <p className="font-semibold">{u.username}</p>
                                                <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                            </div>
                                            {groupUserId === u.id && <Check className="h-4 w-4 text-primary" />}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Optional Custom Note */}
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Group Note / Memo (Optional)</Label>
                                <Input 
                                    value={groupNote}
                                    onChange={(e) => setGroupNote(e.target.value)}
                                    placeholder="e.g. 2x $90 installments for 2026 Annual Membership"
                                    className="bg-background text-xs h-8"
                                />
                            </div>

                            <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] text-muted-foreground flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                                <span>
                                    Portalarr will calculate the subscription tier from the combined <strong>${selectedTotalAmount.toFixed(2)}</strong> total and update Plex access accordingly.
                                </span>
                            </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-4 border-t border-border/40 flex items-center justify-end gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setGroupModalOpen(false)}
                                disabled={grouping}
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleExecuteGroup}
                                disabled={grouping || !groupUserId}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5"
                            >
                                {grouping ? "Grouping & Granting..." : `Group & Attribute ($${selectedTotalAmount.toFixed(2)})`}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}

            {/* --- SPLIT PAYMENT TRANSACTION MODAL --- */}
            {splitModalTx && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-xl border-border/50 shadow-2xl relative bg-[#121218]/95 backdrop-blur-md max-h-[90vh] flex flex-col">
                        <CardHeader className="pb-3 border-b border-border/40 shrink-0">
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                                <Scissors className="h-5 w-5 text-primary" /> Split Payment Transaction
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Divide a single payment into 2 or more sub-transactions and attribute them to different members or installments.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4 overflow-y-auto flex-1">
                            {splitMsg && (
                                <div className="p-3 bg-emerald-500/15 border border-emerald-500/35 rounded-lg text-xs text-emerald-400 font-medium flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{splitMsg}</span>
                                </div>
                            )}
                            {splitErr && (
                                <div className="p-3 bg-red-500/15 border border-red-500/35 rounded-lg text-xs text-red-400 font-medium flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{splitErr}</span>
                                </div>
                            )}

                            {/* Original Payment Banner */}
                            <div className="p-3 rounded-xl bg-background border border-border/60 text-xs flex flex-wrap items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground uppercase font-bold">Original Payment:</span>
                                        {getProviderBadge(splitModalTx.provider)}
                                        <span className="font-semibold text-foreground">{splitModalTx.senderName || splitModalTx.senderEmail || "Unknown"}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        {format(new Date(splitModalTx.emailDate), "MMM d, yyyy • h:mm a")}
                                        {splitModalTx.note ? ` • "${splitModalTx.note}"` : ""}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-black text-foreground">${splitModalTx.amount.toFixed(2)}</span>
                                </div>
                            </div>

                            {/* Controls: Split Evenly & Add Part */}
                            <div className="flex items-center justify-between pt-1">
                                <Label className="text-xs font-semibold">Split Allocation Parts ({splitParts.length})</Label>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleSplitEvenly}
                                        className="h-7 text-xs border-border/60 hover:bg-white/10 gap-1"
                                        title="Distribute amounts evenly across all parts"
                                    >
                                        <Split className="h-3.5 w-3.5" /> Split Evenly
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleAddSplitPart}
                                        className="h-7 text-xs bg-primary/10 hover:bg-primary/20 text-primary border-primary/30 gap-1"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Part
                                    </Button>
                                </div>
                            </div>

                            {/* Split Parts List */}
                            <div className="space-y-3">
                                {splitParts.map((part, idx) => (
                                    <div key={idx} className="p-3 rounded-xl bg-background/80 border border-border/60 space-y-2.5 relative">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase font-bold text-primary tracking-wider">
                                                Part #{idx + 1}
                                            </span>
                                            {splitParts.length > 2 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveSplitPart(idx)}
                                                    className="h-6 w-6 p-0 hover:bg-red-500/10 text-muted-foreground hover:text-red-400"
                                                    title="Remove split part"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Amount ($ USD)</Label>
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={part.amount}
                                                        onChange={(e) => handleSplitPartChange(idx, "amount", e.target.value)}
                                                        placeholder="0.00"
                                                        className="pl-6 bg-background text-xs h-8 font-mono"
                                                    />
                                                </div>
                                            </div>

                                            <div className="sm:col-span-2 space-y-1">
                                                <Label className="text-[10px] text-muted-foreground uppercase font-bold">Attribute To Member</Label>
                                                <select
                                                    value={part.userId}
                                                    onChange={(e) => handleSplitPartChange(idx, "userId", e.target.value)}
                                                    className="h-8 text-xs bg-background border border-border/60 rounded-md px-2 text-foreground font-medium w-full focus:outline-none focus:ring-1 focus:ring-primary"
                                                >
                                                    <option value="">(Leave Unmatched / Unassigned)</option>
                                                    {allUsers.map((u) => (
                                                        <option key={u.id} value={u.id}>
                                                            {u.username} ({u.email})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold">Part Note / Memo (Optional)</Label>
                                            <Input
                                                value={part.note}
                                                onChange={(e) => handleSplitPartChange(idx, "note", e.target.value)}
                                                placeholder={`e.g. Split ${idx + 1} of ${splitParts.length}`}
                                                className="bg-background text-xs h-7"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Live Balance Validator Banner */}
                            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                                isSplitBalanced 
                                    ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                                    : "bg-red-950/30 border-red-500/40 text-red-300"
                            }`}>
                                <div className="flex items-center gap-2">
                                    {isSplitBalanced ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                    ) : (
                                        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                                    )}
                                    <div>
                                        <span className="font-bold">
                                            {isSplitBalanced ? "Amounts Perfectly Balanced" : "Split Amounts Unbalanced"}
                                        </span>
                                        <p className="text-[10px] opacity-90">
                                            Original: ${splitModalTx.amount.toFixed(2)} • Allocated: ${currentSplitSum.toFixed(2)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] uppercase font-bold block opacity-80">Remaining</span>
                                    <span className="font-mono font-bold text-sm">
                                        ${Math.abs(splitDiff).toFixed(2)} {splitDiff > 0 ? "Left" : splitDiff < 0 ? "Over" : ""}
                                    </span>
                                </div>
                            </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-4 border-t border-border/40 flex items-center justify-end gap-2 shrink-0">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSplitModalTx(null)}
                                disabled={splitting}
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleExecuteSplit}
                                disabled={splitting || !isSplitBalanced}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5"
                            >
                                {splitting ? "Splitting & Updating..." : `Execute Split (${splitParts.length} Parts)`}
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}
