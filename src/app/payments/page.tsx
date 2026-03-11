"use client";

import { useState, useEffect } from "react";
import { 
    getPayments, 
    getSubscribers, 
    addManualPayment, 
    linkPaymentToUser, 
    unlinkPayment, // <--- Added this
    splitPayment, 
    deletePayment, 
    getEmailAccounts, 
    addEmailAccount, 
    deleteEmailAccount, 
    triggerPaymentScan,
    mergePayments, 
    clearAllPayments,
    getSettings,      
    saveFeeSettings   
} from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// --- Added Unlink icon here ---
import { Plus, Link as LinkIcon, Unlink, Split, Trash2, Mail, Settings, RefreshCw, Merge, AlertTriangle, CheckSquare, Square, ArrowLeft, DollarSign } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export default function PaymentsPage() {
    const [payments, setPayments] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("all");
    const [isScanning, setIsScanning] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const router = useRouter();

    // Modals
    const [isManualOpen, setIsManualOpen] = useState(false);
    const [isLinkOpen, setIsLinkOpen] = useState(false);
    const [isSplitOpen, setIsSplitOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); 
    
    const [selectedPayment, setSelectedPayment] = useState<any>(null);

    const loadData = async () => {
        setLoading(true);
        const [pData, uData] = await Promise.all([getPayments(), getSubscribers()]);
        setPayments(pData);
        setUsers(uData);
        setLoading(false);
        setSelectedIds(new Set()); 
    };

    useEffect(() => { loadData(); }, []);

    // --- ACTIONS ---

    const handleScan = async () => {
        setIsScanning(true);
        try {
            // @ts-ignore
            const result = await triggerPaymentScan();
            if (result && !result.success) {
                 alert("Scan Failed:\n" + result.logs.join("\n"));
            } else {
                 await loadData();
            }
        } catch (e) {
            alert("Scan failed. Check console.");
        }
        setIsScanning(false);
    };

    const handleMerge = async () => {
        if (selectedIds.size < 2) return;
        if (!confirm(`Merge these ${selectedIds.size} payments into one?`)) return;
        
        await mergePayments(Array.from(selectedIds));
        await loadData();
    };

    const handleClearDatabase = async () => {
        const confirm1 = confirm("⚠️ DANGER: This will delete ALL payment records from the database.");
        if (!confirm1) return;
        
        const confirm2 = confirm("Are you absolutely sure? You will need to re-scan emails to get them back.");
        if (confirm2) {
            await clearAllPayments();
            await loadData();
        }
    };

    const handleAddManual = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await addManualPayment(Object.fromEntries(formData));
        setIsManualOpen(false);
        loadData();
    };

    const handleLink = async (userId: string) => {
        if (!selectedPayment) return;
        await linkPaymentToUser(selectedPayment.id, userId);
        setIsLinkOpen(false);
        setSelectedPayment(null);
        loadData();
    };

    // --- NEW UNLINK HANDLER ---
    const handleUnlink = async (id: string) => {
        if (!confirm("Are you sure you want to unlink this payment?")) return;
        await unlinkPayment(id);
        await loadData();
    };

    const handleSplit = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const amount1 = parseFloat(formData.get("amount1") as string);
        const user1 = formData.get("user1") as string;
        const amount2 = parseFloat(formData.get("amount2") as string);
        const user2 = formData.get("user2") as string;

        await splitPayment(selectedPayment.id, [
            { amount: amount1, subscriberId: user1 || undefined },
            { amount: amount2, subscriberId: user2 || undefined }
        ]);
        setIsSplitOpen(false);
        loadData();
    };

    // --- TABLE HELPERS ---

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const filteredPayments = payments.filter(p => {
        if (p.status === "Split") return false; 
        if (p.status === "Merged") return false; 
        if (activeTab === "all") return true;
        return p.provider.toLowerCase() === activeTab.toLowerCase();
    });

    return (
        <div className="space-y-6 p-8">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    {/* BACK BUTTON */}
                    <Button variant="ghost" size="icon" onClick={() => router.push("/users")} className="shrink-0">
                        <ArrowLeft className="h-6 w-6" />
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Payment Tracking</h2>
                        <p className="text-muted-foreground">Monitor PayPal, Venmo, and Zelle transactions.</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="destructive" onClick={handleClearDatabase}>
                        <AlertTriangle className="h-4 w-4 mr-2" /> Reset DB
                    </Button>

                    {/* SETTINGS BUTTON */}
                    <Button variant="outline" onClick={() => setIsSettingsOpen(true)}>
                        <Settings className="h-4 w-4 mr-2" /> Settings
                    </Button>
                    <Button onClick={() => setIsManualOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Add Payment
                    </Button>
                </div>
            </div>

            {/* TOOLBAR */}
            <div className="flex items-center gap-4 bg-muted/40 p-2 rounded-lg border">
                 <Tabs defaultValue="all" onValueChange={setActiveTab} className="w-[400px]">
                    <TabsList>
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="paypal">PayPal</TabsTrigger>
                        <TabsTrigger value="venmo">Venmo</TabsTrigger>
                        <TabsTrigger value="zelle">Zelle</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="flex gap-2 ml-auto">
                    {selectedIds.size > 1 && (
                        <Button size="sm" onClick={handleMerge} className="animate-in fade-in zoom-in">
                            <Merge className="h-4 w-4 mr-2" /> Merge Selected ({selectedIds.size})
                        </Button>
                    )}

                    <Button size="sm" variant="secondary" onClick={handleScan} disabled={isScanning}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
                        {isScanning ? "Scanning..." : "Scan Emails"}
                    </Button>
                </div>
            </div>

            <Card>
                <div className="relative overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs uppercase bg-muted/50 text-muted-foreground">
                            <tr>
                                <th className="px-4 py-3 w-10">#</th>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Payer Name</th>
                                <th className="px-4 py-3">Provider</th>
                                <th className="px-4 py-3">Amount</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {loading ? (
                                <tr><td colSpan={7} className="p-8 text-center">Loading payments...</td></tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No payments found.</td></tr>
                            ) : (
                                filteredPayments.map((p) => (
                                    <tr key={p.id} className={`hover:bg-muted/50 ${selectedIds.has(p.id) ? "bg-blue-50/50" : ""}`}>
                                        <td className="px-4 py-3">
                                            <button onClick={() => toggleSelect(p.id)}>
                                                {selectedIds.has(p.id) ? 
                                                    <CheckSquare className="h-4 w-4 text-primary" /> : 
                                                    <Square className="h-4 w-4 text-muted-foreground" />
                                                }
                                            </button>
                                        </td>
                                        <td className="px-4 py-3">{format(new Date(p.date), "MMM d, yyyy")}</td>
                                        <td className="px-4 py-3 font-medium">
                                            {p.payerName}
                                            {p.subscriber && (
                                                <div className="text-xs text-blue-500 flex items-center gap-1">
                                                    <LinkIcon className="h-3 w-3"/> {p.subscriber.name}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge variant="outline">{p.provider}</Badge>
                                        </td>
                                        <td className="px-4 py-3 font-bold">${p.amount.toFixed(2)}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={p.status === "Linked" ? "default" : "secondary"}>
                                                {p.status}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {p.status === "Linked" ? (
                                                // --- UNLINK BUTTON ---
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="ghost" disabled className="text-muted-foreground">Linked</Button>
                                                    <Button size="sm" variant="ghost" onClick={() => handleUnlink(p.id)} title="Unlink Payment">
                                                        <Unlink className="h-4 w-4 text-orange-500"/>
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2">
                                                    <Button size="sm" variant="ghost" onClick={() => { setSelectedPayment(p); setIsLinkOpen(true); }}>
                                                        Link
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => { setSelectedPayment(p); setIsSplitOpen(true); }} title="Split">
                                                        <Split className="h-4 w-4" />
                                                    </Button>
                                                    <Button size="sm" variant="ghost" onClick={() => deletePayment(p.id)} title="Delete">
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add Manual Payment</DialogTitle></DialogHeader>
                    <form onSubmit={handleAddManual} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Provider</Label>
                                <Select name="provider" defaultValue="Manual">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="PayPal">PayPal</SelectItem>
                                        <SelectItem value="Venmo">Venmo</SelectItem>
                                        <SelectItem value="Zelle">Zelle</SelectItem>
                                        <SelectItem value="Manual">Manual (Cash/Other)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Amount</Label>
                                <Input name="amount" type="number" step="0.01" required />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Payer Name</Label>
                            <Input name="payerName" placeholder="e.g. John Doe" required />
                        </div>
                        <div className="space-y-2">
                            <Label>Date Received</Label>
                            <Input name="date" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} />
                        </div>
                        <DialogFooter><Button type="submit">Add Payment</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={isLinkOpen} onOpenChange={setIsLinkOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Link Payment to User</DialogTitle>
                        <DialogDescription>
                            Linking this payment will update the user's full name to <b>{selectedPayment?.payerName}</b>.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select Subscriber</Label>
                            <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
                                {users.map(u => (
                                    <div key={u.id} className="p-3 hover:bg-muted cursor-pointer flex justify-between items-center" 
                                         onClick={() => handleLink(u.id)}>
                                        <div>
                                            <div className="font-medium">{u.name}</div>
                                            <div className="text-xs text-muted-foreground">{u.fullName || "No Real Name"}</div>
                                        </div>
                                        {u.fullName === selectedPayment?.payerName && <Badge>Match</Badge>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={isSplitOpen} onOpenChange={setIsSplitOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Split Payment (${selectedPayment?.amount})</DialogTitle>
                        <DialogDescription>Divide this payment between two users.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSplit} className="space-y-4">
                        <div className="p-3 bg-muted rounded-md mb-2">
                            Original: <b>{selectedPayment?.payerName}</b> - ${selectedPayment?.amount}
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Split 1 Amount</Label>
                                <Input name="amount1" type="number" step="0.01" defaultValue={(selectedPayment?.amount / 2).toFixed(2)} />
                            </div>
                            <div className="space-y-2">
                                <Label>User 1 (Optional)</Label>
                                <Select name="user1">
                                    <SelectTrigger><SelectValue placeholder="Select User" /></SelectTrigger>
                                    <SelectContent>
                                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                                <Label>Split 2 Amount</Label>
                                <Input name="amount2" type="number" step="0.01" defaultValue={(selectedPayment?.amount / 2).toFixed(2)} />
                            </div>
                            <div className="space-y-2">
                                <Label>User 2 (Optional)</Label>
                                <Select name="user2">
                                    <SelectTrigger><SelectValue placeholder="Select User" /></SelectTrigger>
                                    <SelectContent>
                                        {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter><Button type="submit">Confirm Split</Button></DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <PaymentSettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
        </div>
    );
}

// Sub-Component for Settings
function PaymentSettingsModal({ open, onOpenChange }: any) {
    const [accounts, setAccounts] = useState<any[]>([]);
    const [fees, setFees] = useState({ monthly: 0, yearly: 0 });

    useEffect(() => {
        if(open) {
            getEmailAccounts().then(setAccounts);
            getSettings().then((s: any) => setFees({
            monthly: s.monthlyFee || 0,
            yearly: s.yearlyFee || 0
            }));
        }
    }, [open]);

    const handleAddEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await addEmailAccount(Object.fromEntries(formData));
        getEmailAccounts().then(setAccounts);
        (e.target as HTMLFormElement).reset();
    };

    const handleSaveFees = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await saveFeeSettings(
            parseFloat(formData.get("monthlyFee") as string),
            parseFloat(formData.get("yearlyFee") as string)
        );
        alert("Fees saved successfully!");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Payment Settings</DialogTitle>
                    <DialogDescription>Manage subscription fees and email integrations.</DialogDescription>
                </DialogHeader>
                
                <Tabs defaultValue="fees">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="fees">Global Fees</TabsTrigger>
                        <TabsTrigger value="email">Email Integration</TabsTrigger>
                    </TabsList>
                    
                    {/* FEES TAB */}
                    <TabsContent value="fees" className="space-y-4 py-4">
                        <form onSubmit={handleSaveFees} className="space-y-4 border p-4 rounded-md bg-muted/20">
                            <h4 className="font-medium flex items-center gap-2"><DollarSign className="h-4 w-4"/> Subscription Pricing</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Monthly Fee ($)</Label>
                                    <Input name="monthlyFee" type="number" step="0.01" defaultValue={fees.monthly} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Yearly Fee ($)</Label>
                                    <Input name="yearlyFee" type="number" step="0.01" defaultValue={fees.yearly} />
                                </div>
                            </div>
                            <Button type="submit">Save Fees</Button>
                        </form>
                    </TabsContent>

                    {/* EMAIL TAB */}
                    <TabsContent value="email" className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Connected Accounts</Label>
                            {accounts.length === 0 ? (
                                <div className="text-sm text-muted-foreground italic border p-2 rounded">No accounts connected.</div>
                            ) : (
                                accounts.map(acc => (
                                    <div key={acc.id} className="flex justify-between items-center border p-2 rounded">
                                        <div className="flex items-center gap-2">
                                            <Mail className="h-4 w-4"/>
                                            <span className="font-medium">{acc.name}</span>
                                            <span className="text-xs text-muted-foreground">({acc.user})</span>
                                        </div>
                                        <Button size="icon" variant="ghost" onClick={async () => { await deleteEmailAccount(acc.id); getEmailAccounts().then(setAccounts); }}>
                                            <Trash2 className="h-4 w-4 text-red-500"/>
                                        </Button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="border-t pt-4">
                            <h4 className="font-medium mb-3">Add New Account</h4>
                            <form onSubmit={handleAddEmail} className="grid gap-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Account Name</Label>
                                        <Input name="name" placeholder="Payment Inbox" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Host (IMAP)</Label>
                                        <Input name="host" placeholder="imap.gmail.com" required />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Email User</Label>
                                        <Input name="user" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Password</Label>
                                        <Input name="pass" type="password" required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Port</Label>
                                        <Input name="port" type="number" defaultValue="993" required />
                                    </div>
                                </div>
                                <Button type="submit" variant="secondary" className="w-full">Connect Account</Button>
                            </form>
                            <p className="text-[10px] text-muted-foreground mt-2">
                                Note: For Gmail, you must use an <b>App Password</b>, not your main password.
                            </p>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}