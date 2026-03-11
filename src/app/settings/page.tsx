"use client";

import { useState, useEffect } from "react";
import { 
    // Auth
    getAppUsers, createAppUser, deleteAppUser, 
    // General Settings
    getSettings, saveSettings, saveFeeSettings, saveJobSettings, 
    // Email (Scanning)
    getEmailAccounts, addEmailAccount, deleteEmailAccount, 
    // Apps & Monitoring
    getTautulliInstances, addTautulliInstance, removeTautulliInstance,
    getGlancesInstances, addGlancesInstance, removeGlancesInstance,
    getMediaApps, addMediaApp, updateMediaApp, removeMediaApp 
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Shield, User, Mail, Send, Pencil, X } from "lucide-react";

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    
    // Data States
    const [users, setUsers] = useState<any[]>([]);
    const [emailAccounts, setEmailAccounts] = useState<any[]>([]);
    const [systemSettings, setSystemSettings] = useState<any>({});
    
    // App States
    const [tautulli, setTautulli] = useState<any[]>([]);
    const [glances, setGlances] = useState<any[]>([]);
    const [mediaApps, setMediaApps] = useState<any[]>([]);

    // Edit Mode State
    const [editingApp, setEditingApp] = useState<any>(null);

    const loadAllData = async () => {
        setLoading(true);
        const [u, e, s, t, g, m] = await Promise.all([
            getAppUsers(),
            getEmailAccounts(),
            getSettings(),
            getTautulliInstances(),
            getGlancesInstances(),
            getMediaApps()
        ]);
        setUsers(u);
        setEmailAccounts(e);
        setSystemSettings(s || {});
        setTautulli(t);
        setGlances(g);
        setMediaApps(m);
        setLoading(false);
    };

    useEffect(() => { loadAllData(); }, []);

    // --- HANDLERS ---
    const handleForm = async (e: React.FormEvent, action: Function) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await action(formData); 
        (e.target as HTMLFormElement).reset();
        setEditingApp(null); // Clear edit mode
        loadAllData();
    };

    const handleObjectForm = async (e: React.FormEvent, action: Function) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await action(Object.fromEntries(formData)); 
        (e.target as HTMLFormElement).reset();
        loadAllData();
    };

    const handleDelete = async (id: string, action: Function) => {
        if(confirm("Are you sure?")) {
            await action(id);
            loadAllData();
        }
    };

    const handleSaveFees = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await saveFeeSettings(
            parseFloat(formData.get("monthlyFee") as string),
            parseFloat(formData.get("yearlyFee") as string)
        );
        alert("Fee settings saved.");
    };

    // Populate form for editing
    const startEdit = (app: any) => {
        setEditingApp(app);
    };

    const cancelEdit = () => {
        setEditingApp(null);
    };

    return (
        <div className="space-y-6 p-8 max-w-6xl mx-auto">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                <p className="text-muted-foreground">Configure the platform, integrations, and access.</p>
            </div>

            <Tabs defaultValue="general" className="space-y-4">
                {/* UPDATED: grid-cols-2 on mobile, grid-cols-4 on desktop, h-auto to allow wrapping */}
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto">
                    <TabsTrigger value="general">General & SMTP</TabsTrigger>
                    <TabsTrigger value="access">Access Control</TabsTrigger>
                    <TabsTrigger value="monitoring">Monitoring & Apps</TabsTrigger>
                    <TabsTrigger value="payments">Payment Scanning</TabsTrigger>
                </TabsList>

                {/* --- TAB 1: GENERAL & SMTP --- */}
                <TabsContent value="general" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* SMTP SETTINGS */}
                        <Card className="col-span-2 md:col-span-1">
                            <CardHeader>
                                <CardTitle>SMTP Settings (Sending)</CardTitle>
                                <CardDescription>Used for sending welcome emails and notifications.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, saveSettings)} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>SMTP Host</Label><Input name="smtpHost" defaultValue={systemSettings.smtpHost} placeholder="smtp.gmail.com"/></div>
                                        <div className="space-y-2"><Label>Port</Label><Input name="smtpPort" defaultValue={systemSettings.smtpPort} placeholder="587"/></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>User</Label><Input name="smtpUser" defaultValue={systemSettings.smtpUser} placeholder="user@gmail.com"/></div>
                                        <div className="space-y-2"><Label>Password</Label><Input name="smtpPass" type="password" defaultValue={systemSettings.smtpPass}/></div>
                                    </div>
                                    <Button type="submit"><Send className="h-4 w-4 mr-2"/> Save SMTP</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* FEES & JOB INTERVAL */}
                        <div className="space-y-4">
                            <Card>
                                <CardHeader><CardTitle>Pricing</CardTitle></CardHeader>
                                <CardContent>
                                    <form onSubmit={handleSaveFees} className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2"><Label>Monthly ($)</Label><Input name="monthlyFee" type="number" step="0.01" defaultValue={systemSettings.monthlyFee}/></div>
                                            <div className="space-y-2"><Label>Yearly ($)</Label><Input name="yearlyFee" type="number" step="0.01" defaultValue={systemSettings.yearlyFee}/></div>
                                        </div>
                                        <Button type="submit" variant="secondary" className="w-full">Update Fees</Button>
                                    </form>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader><CardTitle>Automation</CardTitle></CardHeader>
                                <CardContent>
                                    <form onSubmit={(e) => handleForm(e, saveJobSettings)} className="flex gap-4 items-end">
                                        <div className="space-y-2 flex-1">
                                            <Label>Scan Interval (Hours)</Label>
                                            <Input name="autoSyncInterval" type="number" defaultValue={systemSettings.autoSyncInterval || 24} />
                                        </div>
                                        <Button type="submit" variant="secondary">Save</Button>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* --- TAB 2: ACCESS CONTROL --- */}
                <TabsContent value="access" className="space-y-4">
                     <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Create Account</CardTitle>
                                <CardDescription>Add a new administrator.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, createAppUser)} className="space-y-4">
                                    <div className="space-y-2"><Label>Username</Label><Input name="username" required autoComplete="off" /></div>
                                    <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" required autoComplete="off" /></div>
                                    <div className="space-y-2"><Label>Password</Label><Input name="password" type="password" required autoComplete="new-password" /></div>
                                    <div className="space-y-2">
                                        <Label>Role</Label>
                                        <Select name="role" defaultValue="USER">
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="ADMIN">Admin</SelectItem><SelectItem value="USER">User</SelectItem></SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="submit" className="w-full"><UserPlus className="h-4 w-4 mr-2"/> Create</Button>
                                </form>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle>Existing Users</CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                                    {users.map((user) => (
                                        <div key={user.id} className="flex justify-between items-center border p-3 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">{user.role === "ADMIN" ? <Shield className="h-4 w-4"/> : <User className="h-4 w-4"/>}</div>
                                                <div><div className="font-medium">{user.username}</div><div className="text-xs text-muted-foreground">{user.email}</div></div>
                                            </div>
                                            <Button size="icon" variant="ghost" className="text-red-500" onClick={() => handleDelete(user.id, deleteAppUser)}><Trash2 className="h-4 w-4"/></Button>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- TAB 3: MONITORING & APPS --- */}
                <TabsContent value="monitoring" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                        {/* TAUTULLI */}
                        <Card className="col-span-1">
                            <CardHeader><CardTitle>Tautulli</CardTitle><CardDescription>For syncing users.</CardDescription></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    {tautulli.map(t => (
                                        <div key={t.id} className="flex justify-between items-center border p-2 rounded text-sm">
                                            <span className="truncate">{t.name}</span>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => handleDelete(t.id, removeTautulliInstance)}><Trash2 className="h-3 w-3"/></Button>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addTautulliInstance)} className="space-y-2 border-t pt-2">
                                    <Input name="name" placeholder="Name" size={1} required className="h-8 text-xs"/>
                                    <Input name="url" placeholder="URL (http://...)" required className="h-8 text-xs"/>
                                    <Input name="apiKey" placeholder="API Key" required className="h-8 text-xs"/>
                                    <Button type="submit" size="sm" className="w-full">Add Tautulli</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* GLANCES */}
                        <Card className="col-span-1">
                            <CardHeader><CardTitle>Glances</CardTitle><CardDescription>Server stats.</CardDescription></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    {glances.map(g => (
                                        <div key={g.id} className="flex justify-between items-center border p-2 rounded text-sm">
                                            <span className="truncate">{g.name}</span>
                                            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => handleDelete(g.id, removeGlancesInstance)}><Trash2 className="h-3 w-3"/></Button>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addGlancesInstance)} className="space-y-2 border-t pt-2">
                                    <Input name="name" placeholder="Name" required className="h-8 text-xs"/>
                                    <Input name="url" placeholder="URL" required className="h-8 text-xs"/>
                                    <Button type="submit" size="sm" className="w-full">Add Glances</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* MEDIA APPS (EDITABLE) */}
                        <Card className="col-span-1">
                            <CardHeader>
                                <CardTitle>{editingApp ? "Edit Application" : "Applications"}</CardTitle>
                                <CardDescription>{editingApp ? `Editing: ${editingApp.name}` : "Services for the Apps page."}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {/* List of Apps */}
                                {!editingApp && (
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                        {mediaApps.map(app => (
                                            <div key={app.id} className="flex justify-between items-center border p-2 rounded text-sm">
                                                <div className="truncate">
                                                    <div className="font-medium">{app.name}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase">{app.type}</div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-blue-500" onClick={() => startEdit(app)}>
                                                        <Pencil className="h-3 w-3"/>
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => handleDelete(app.id, removeMediaApp)}>
                                                        <Trash2 className="h-3 w-3"/>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Form (Add or Update) */}
                                <form 
                                    onSubmit={(e) => handleForm(e, editingApp ? updateMediaApp : addMediaApp)} 
                                    className={`space-y-2 ${!editingApp && "border-t pt-2"}`}
                                >
                                    {/* Hidden ID for Update */}
                                    {editingApp && <input type="hidden" name="id" value={editingApp.id} />}

                                    <Select name="type" required defaultValue={editingApp?.type}>
                                        <SelectTrigger className="h-8"><SelectValue placeholder="Select App Type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectLabel>Downloads</SelectLabel>
                                                <SelectItem value="sabnzbd">SABnzbd</SelectItem>
                                                <SelectItem value="nzbget">NZBGet</SelectItem>
                                            </SelectGroup>
                                            <SelectGroup>
                                                <SelectLabel>Movies & TV</SelectLabel>
                                                <SelectItem value="radarr">Radarr</SelectItem>
                                                <SelectItem value="sonarr">Sonarr</SelectItem>
                                            </SelectGroup>
                                            <SelectGroup>
                                                <SelectLabel>Requests</SelectLabel>
                                                <SelectItem value="overseerr">Overseerr</SelectItem>
                                                <SelectItem value="jellyseerr">Jellyseerr</SelectItem>
                                                <SelectItem value="ombi">Ombi</SelectItem>
                                            </SelectGroup>
                                            <SelectGroup>
                                                <SelectLabel>Utility</SelectLabel>
                                                <SelectItem value="bazarr">Bazarr</SelectItem>
                                                <SelectItem value="prowlarr">Prowlarr</SelectItem>
                                                <SelectItem value="readarr">Readarr</SelectItem>
                                                <SelectItem value="lidarr">Lidarr</SelectItem>
                                                <SelectItem value="maintainerr">Maintainerr</SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    
                                    <Input name="name" placeholder="App Name" required className="h-8 text-xs" defaultValue={editingApp?.name} />
                                    
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">Internal URL (API)</Label>
                                            <Input name="url" placeholder="http://192.168.1.X:PORT" required className="h-8 text-xs" defaultValue={editingApp?.url} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-muted-foreground">External URL (User)</Label>
                                            <Input name="externalUrl" placeholder="https://requests.domain.com" className="h-8 text-xs" defaultValue={editingApp?.externalUrl} />
                                        </div>
                                    </div>

                                    <Input name="apiKey" placeholder="API Key" className="h-8 text-xs" defaultValue={editingApp?.apiKey} />
                                    
                                    <div className="flex gap-2">
                                        <Button type="submit" size="sm" className="w-full">
                                            {editingApp ? "Update App" : "Add App"}
                                        </Button>
                                        {editingApp && (
                                            <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
                                                <X className="h-4 w-4"/>
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- TAB 4: PAYMENT SCANNING (IMAP) --- */}
                <TabsContent value="payments" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Payment Email Scanning (IMAP)</CardTitle>
                            <CardDescription>Connect email accounts to scan for Venmo/PayPal receipts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                {emailAccounts.length === 0 && <div className="text-sm italic text-muted-foreground">No accounts connected.</div>}
                                {emailAccounts.map(acc => (
                                    <div key={acc.id} className="flex justify-between items-center border p-3 rounded-md">
                                        <div className="flex items-center gap-3">
                                            <Mail className="h-5 w-5 text-blue-500"/>
                                            <div>
                                                <div className="font-medium">{acc.name}</div>
                                                <div className="text-xs text-muted-foreground">{acc.host} ({acc.user})</div>
                                            </div>
                                        </div>
                                        <Button size="sm" variant="destructive" onClick={() => handleDelete(acc.id, deleteEmailAccount)}>Disconnect</Button>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t pt-4">
                                <h4 className="text-sm font-medium mb-3">Connect New Account</h4>
                                <form onSubmit={(e) => handleObjectForm(e, addEmailAccount)} className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2"><Label>Name</Label><Input name="name" placeholder="Payment Inbox" required /></div>
                                    <div className="space-y-2"><Label>Host</Label><Input name="host" placeholder="imap.gmail.com" required /></div>
                                    <div className="space-y-2"><Label>User</Label><Input name="user" placeholder="email@gmail.com" required /></div>
                                    <div className="space-y-2"><Label>Password</Label><Input name="pass" type="password" required /></div>
                                    <div className="space-y-2"><Label>Port</Label><Input name="port" defaultValue="993" required /></div>
                                    <div className="flex items-end"><Button type="submit" className="w-full">Connect</Button></div>
                                </form>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}