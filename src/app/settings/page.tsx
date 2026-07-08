"use client";

import { useState, useEffect, useTransition } from "react";
import { 
    getAppUsers, createAppUser, deleteAppUser, 
    getSettings, saveSettings, saveJobSettings, clearSmtpSettings,
    getTautulliInstances, addTautulliInstance, removeTautulliInstance,
    getGlancesInstances, addGlancesInstance, removeGlancesInstance,
    getMediaApps, addMediaApp, updateMediaApp, removeMediaApp,
    getBetaDashboardText, updateBetaDashboardText,
    getBetaCards, createBetaCard, updateBetaCard, deleteBetaCard,
    getRoadmapText, updateRoadmapText,
    getAlertBanner, updateAlertBanner
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; 
import { Tabs, TabsContent, TabsList, TabsTrigger, } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Trash2, UserPlus, Shield, User, Send, Pencil, X, Loader2, AlertTriangle, PlaySquare, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [activeTab, setActiveTab] = useState("general");
    
    // Data States
    const [users, setUsers] = useState<any[]>([]);
    const [systemSettings, setSystemSettings] = useState<any>({});
    
    // App States
    const [tautulli, setTautulli] = useState<any[]>([]);
    const [glances, setGlances] = useState<any[]>([]);
    const [mediaApps, setMediaApps] = useState<any[]>([]);

    // Content States
    const [betaText, setBetaText] = useState<string>("");
    const [betaCards, setBetaCards] = useState<any[]>([]);
    const [roadmapText, setRoadmapText] = useState<string>("");

    // Alert States
    const [alertBanner, setAlertBanner] = useState<{enabled: boolean, text: string}>({enabled: false, text: ""});
    const [bannerEnabled, setBannerEnabled] = useState(false);

    // Edit Mode States
    const [editingApp, setEditingApp] = useState<any>(null);
    const [editingBetaCard, setEditingBetaCard] = useState<any>(null);

    const loadAllData = async () => {
        setLoading(true);

        const safetyUnlock = setTimeout(() => {
            setLoading(false);
        }, 2500);

        try {
            const [u, s, t, g, m, bt, bc, rt, ab] = await Promise.all([
                getAppUsers(),
                getSettings(),
                getTautulliInstances(),
                getGlancesInstances(),
                getMediaApps(),
                getBetaDashboardText(), 
                getBetaCards(),
                getRoadmapText(),
                getAlertBanner()          
            ]);
            setUsers(u || []);
            setSystemSettings(s || {});
            setTautulli(t || []);
            setGlances(g || []);
            setMediaApps(m || []);
            setBetaText(bt || "");
            setBetaCards(bc || []);
            setRoadmapText(rt || "");
            
            setAlertBanner(ab || {enabled: false, text: ""});
            setBannerEnabled(ab?.enabled || false);
        } catch (error) {
            console.error("Failed to load settings data:", error);
        } finally {
            clearTimeout(safetyUnlock);
            setLoading(false);
        }
    };

    useEffect(() => { loadAllData(); }, []);

    const handleTabChange = (value: string) => {
        startTransition(() => {
            setActiveTab(value);
        });
    };

    const handleForm = async (e: React.FormEvent, action: Function) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        
        await action(formData); 
        
        const isEditor = form.querySelector('textarea[name="text"]') || form.querySelector('input[name="text"]');
        if (!isEditor) {
            form.reset();
        }

        setEditingApp(null); 
        setEditingBetaCard(null);
        loadAllData();
    };

    const handleDelete = async (id: string, action: Function) => {
        if(confirm("Are you sure?")) {
            await action(id);
            loadAllData();
        }
    };

    if (loading) {
        return (
            <div className="flex-1 space-y-6 p-8 max-w-6xl mx-auto animate-in fade-in duration-500">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-1/4" />
                    <Skeleton className="h-4 w-1/3" />
                </div>
                <div className="space-y-4">
                    <div className="flex gap-2 border-b pb-2">
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-24" />
                        <Skeleton className="h-8 w-24" />
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                        <Card className="p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-32 w-full"/></Card>
                        <Card className="p-6 space-y-4"><Skeleton className="h-6 w-1/3"/><Skeleton className="h-32 w-full"/></Card>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-6 p-4 sm:p-8 max-w-6xl mx-auto transition-opacity duration-200 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
            <div>
                <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                <p className="text-muted-foreground">Configure the platform, integrations, and access.</p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 h-auto p-1">
                    <TabsTrigger value="general" className="py-2 cursor-pointer">General Setup</TabsTrigger>
                    <TabsTrigger value="access" className="py-2 cursor-pointer">Access Control</TabsTrigger>
                    <TabsTrigger value="monitoring" className="py-2 cursor-pointer">Monitoring & Apps</TabsTrigger>
                    <TabsTrigger value="beta" className="py-2 cursor-pointer">Beta Testing</TabsTrigger>
                </TabsList>
                
                {isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Switching tabs...
                    </div>
                )}

                {/* --- TAB 1: GENERAL SETUP --- */}
                <TabsContent value="general" className="space-y-4">
                    
                    <Card className="col-span-2 border-orange-500/50 bg-orange-500/5 dark:bg-orange-500/10">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                                <AlertTriangle className="h-5 w-5"/> System Alert Banner
                            </CardTitle>
                            <CardDescription>Display a warning or maintenance banner across the top of the home page.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={(e) => handleForm(e, updateAlertBanner)} className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Switch 
                                        id="banner-enabled" 
                                        checked={bannerEnabled} 
                                        onCheckedChange={setBannerEnabled} 
                                    />
                                    <Label htmlFor="banner-enabled" className="cursor-pointer">Enable Banner</Label>
                                    <input type="hidden" name="enabled" value={bannerEnabled ? "on" : "off"} />
                                </div>
                                <div className="space-y-2">
                                    <Input 
                                        name="text" 
                                        defaultValue={alertBanner.text} 
                                        placeholder="⚠️ **Maintenance:** Server will be down tonight at 2AM..." 
                                    />
                                </div>
                                <Button type="submit" variant="outline" className="border-orange-500/50 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400">
                                    Save Alert Banner
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card className="col-span-2 md:col-span-1">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle>Global Integrations</CardTitle>
                                        <CardDescription>Configure SMTP emails and Plex Auto-Sync tokens.</CardDescription>
                                    </div>
                                    {systemSettings?.smtpHost || systemSettings?.mainPlexToken ? (
                                        <Badge className="bg-green-500 hover:bg-green-600">Saved</Badge>
                                    ) : (
                                        <Badge variant="secondary">Not Configured</Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, saveSettings)} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>SMTP Host</Label><Input name="smtpHost" defaultValue={systemSettings.smtpHost || ""} placeholder="smtp.gmail.com"/></div>
                                        <div className="space-y-2"><Label>Port</Label><Input name="smtpPort" defaultValue={systemSettings.smtpPort || ""} placeholder="587"/></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>User</Label><Input name="smtpUser" defaultValue={systemSettings.smtpUser || ""} placeholder="user@gmail.com"/></div>
                                        <div className="space-y-2"><Label>Password</Label><Input name="smtpPass" type="password" defaultValue={systemSettings.smtpPass || ""}/></div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Sender Email Address</Label>
                                        <Input name="smtpFrom" defaultValue={systemSettings.smtpFrom || ""} placeholder="portalarr@gmail.com"/>
                                        <p className="text-[10px] text-muted-foreground">
                                            The email address from which ebooks will be delivered (must be added to your users' Amazon Approved Senders list).
                                        </p>
                                    </div>
                                    
                                    {/* NEW PLEX TOKEN SECTION */}
                                    <div className="space-y-2 border-t pt-4 mt-4">
                                        <Label htmlFor="mainPlexToken">Admin Plex Token (For Auto-Syncing Users)</Label>
                                        <Input 
                                            id="mainPlexToken" 
                                            name="mainPlexToken" 
                                            type="password" 
                                            defaultValue={systemSettings.mainPlexToken || ""} 
                                            placeholder="xxxxxxxxxxxxxxxxxxxx" 
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            This token securely checks your friends list to automatically approve users.
                                        </p>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <Button type="submit" className="flex-1">
                                            <Send className="h-4 w-4 mr-2"/> 
                                            Update Settings
                                        </Button>
                                        
                                        {(systemSettings?.smtpHost || systemSettings?.mainPlexToken) && (
                                            <Button 
                                                type="button" 
                                                variant="destructive" 
                                                onClick={async () => {
                                                    if(confirm("Are you sure you want to wipe these settings?")) {
                                                        await clearSmtpSettings();
                                                        loadAllData();
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        <div className="space-y-4">
                            <Card>
                                <CardHeader><CardTitle>Automation & Downloads</CardTitle></CardHeader>
                                <CardContent>
                                    <form onSubmit={(e) => handleForm(e, saveJobSettings)} className="space-y-4">
                                        <div className="grid gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label>Scan Interval (Minutes)</Label>
                                                <Input name="autoSyncInterval" type="number" defaultValue={systemSettings.autoSyncInterval || 5} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Completed Downloads Folder</Label>
                                                <Input 
                                                    name="downloadsPath" 
                                                    type="text" 
                                                    defaultValue={systemSettings.downloadsPath || "/downloads"} 
                                                    placeholder="/downloads"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end">
                                            <Button type="submit" variant="secondary">Save Automation Settings</Button>
                                        </div>
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
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <PlaySquare className="h-5 w-5 text-primary"/> Tautulli
                                </CardTitle>
                                <CardDescription>Plex monitoring instances.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                    {tautulli.length === 0 && <p className="text-xs text-muted-foreground italic">No instances added.</p>}
                                    {tautulli.map(t => (
                                        <div key={t.id} className="flex justify-between items-center border p-2 rounded-md bg-muted/20 text-sm">
                                            <span className="truncate font-medium">{t.name}</span>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(t.id, removeTautulliInstance)}><Trash2 className="h-4 w-4"/></Button>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addTautulliInstance)} className="space-y-2 border-t pt-4 mt-auto">
                                    <div className="grid gap-2">
                                        <Input name="name" placeholder="Friendly Name (e.g. Main Plex)" required className="h-9 text-sm"/>
                                        <Input name="url" placeholder="URL (http://192.168.1.50:8181)" required className="h-9 text-sm"/>
                                        <Input name="apiKey" placeholder="Tautulli API Key" required className="h-9 text-sm"/>
                                    </div>
                                    <Button type="submit" size="sm" className="w-full mt-2">Add Instance</Button>
                                </form>
                            </CardContent>
                        </Card>

                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-primary"/> Glances
                                </CardTitle>
                                <CardDescription>Hardware monitoring instances.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                    {glances.length === 0 && <p className="text-xs text-muted-foreground italic">No instances added.</p>}
                                    {glances.map(g => (
                                        <div key={g.id} className="flex justify-between items-center border p-2 rounded-md bg-muted/20 text-sm">
                                            <span className="truncate font-medium">{g.name}</span>
                                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(g.id, removeGlancesInstance)}><Trash2 className="h-4 w-4"/></Button>
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addGlancesInstance)} className="space-y-2 border-t pt-4 mt-auto">
                                    <div className="grid gap-2">
                                        <Input name="name" placeholder="Server Name (e.g. Unraid)" required className="h-9 text-sm"/>
                                        <Input name="url" placeholder="URL (http://192.168.1.50:61208)" required className="h-9 text-sm"/>
                                    </div>
                                    <Button type="submit" size="sm" className="w-full mt-2">Add Instance</Button>
                                </form>
                            </CardContent>
                        </Card>

                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-primary"/> {editingApp ? "Edit Application" : "Applications"}
                                </CardTitle>
                                <CardDescription>{editingApp ? `Modifying ${editingApp.name}` : "Connect your Arr apps and requests."}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                {!editingApp && (
                                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                        {mediaApps.length === 0 && <p className="text-xs text-muted-foreground italic">No apps added.</p>}
                                        {mediaApps.map(app => (
                                            <div key={app.id} className="flex justify-between items-center border p-2 rounded-md bg-muted/20 text-sm">
                                                <div className="truncate">
                                                    <div className="font-semibold">{app.name}</div>
                                                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{app.type}</div>
                                                </div>
                                                <div className="flex gap-1 shrink-0">
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-500 hover:bg-blue-50" onClick={() => setEditingApp(app)}>
                                                        <Pencil className="h-4 w-4"/>
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => handleDelete(app.id, removeMediaApp)}>
                                                        <Trash2 className="h-4 w-4"/>
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <form onSubmit={(e) => handleForm(e, editingApp ? updateMediaApp : addMediaApp)} className={`space-y-3 ${!editingApp && "border-t pt-4 mt-auto"}`}>
                                    {editingApp && <input type="hidden" name="id" value={editingApp.id} />}
                                    <Select name="type" required defaultValue={editingApp?.type}>
                                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="App Type" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                <SelectLabel>Downloads</SelectLabel>
                                                <SelectItem value="sabnzbd">SABnzbd</SelectItem>
                                                <SelectItem value="nzbget">NZBGet</SelectItem>
                                                <SelectItem value="qBittorrent">qBittorrent</SelectItem>
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
                                    <Input name="name" placeholder="Display Name" required className="h-9 text-sm" defaultValue={editingApp?.name} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Internal URL</Label>
                                            <Input name="url" placeholder="IP:PORT" required className="h-9 text-sm font-mono" defaultValue={editingApp?.url} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">External URL</Label>
                                            <Input name="externalUrl" placeholder="requests.com" className="h-9 text-sm font-mono" defaultValue={editingApp?.externalUrl} />
                                        </div>
                                    </div>
                                    <Input name="apiKey" placeholder="API Key" className="h-9 text-sm font-mono" defaultValue={editingApp?.apiKey} />
                                    <div className="flex gap-2">
                                        <Button type="submit" size="sm" className="w-full h-9">{editingApp ? "Update App" : "Add App"}</Button>
                                        {editingApp && (
                                            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => setEditingApp(null)}>
                                                <X className="h-4 w-4"/>
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* --- TAB 4: BETA TESTING & ROADMAP --- */}
                <TabsContent value="beta" className="space-y-6">
                    
                    {/* ROADMAP CARD EDITOR */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">🗺️ Roadmap & New Features</CardTitle>
                            <CardDescription>Update the text shown on the home page Roadmap card.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={(e) => handleForm(e, updateRoadmapText)} className="space-y-4">
                                <Textarea 
                                    name="text" 
                                    defaultValue={roadmapText} 
                                    rows={8} 
                                    className="font-mono text-sm"
                                    placeholder="### 🚀 Upcoming Features..."
                                    required
                                />
                                <Button type="submit">Save Roadmap Text</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        {/* BETA DASHBOARD INTRO EDITOR */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Beta Dashboard Intro</CardTitle>
                                <CardDescription>This Markdown text appears on the main home dashboard.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, updateBetaDashboardText)} className="space-y-4">
                                    <Textarea name="text" rows={6} defaultValue={betaText} required placeholder="### Interested in Beta Testing?..." />
                                    <Button type="submit">Save Intro Text</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* BETA TESTING CARDS EDITOR */}
                        <Card>
                            <CardHeader>
                                <CardTitle>{editingBetaCard ? "Edit Beta Card" : "Beta Testing Cards"}</CardTitle>
                                <CardDescription>Manage the instruction cards on the /beta page.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {!editingBetaCard && (
                                    <div className="space-y-4 max-h-[300px] overflow-y-auto">
                                        {betaCards.map((card: any) => (
                                            <div key={card.id} className="flex items-start justify-between border p-3 rounded-md">
                                                <div className="space-y-1">
                                                    <div className="font-semibold">{card.title}</div>
                                                    <div className="text-xs text-muted-foreground line-clamp-1">{card.content}</div>
                                                </div>
                                                <div className="flex gap-1 shrink-0 ml-2">
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => setEditingBetaCard(card)}>
                                                        <Pencil className="h-4 w-4 text-blue-500" />
                                                    </Button>
                                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(card.id, deleteBetaCard)}>
                                                        <Trash2 className="h-4 w-4 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <form onSubmit={(e) => handleForm(e, editingBetaCard ? updateBetaCard : createBetaCard)} className={`space-y-4 ${!editingBetaCard && "border-t pt-4"}`}>
                                    {editingBetaCard && <input type="hidden" name="id" value={editingBetaCard.id} />}
                                    <div className="space-y-2">
                                        <Label>Card Title</Label>
                                        <Input name="title" placeholder="Ex: New Music App" defaultValue={editingBetaCard?.title} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Content (Markdown)</Label>
                                        <Textarea name="content" placeholder="Instructions..." rows={4} defaultValue={editingBetaCard?.content} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>Button Text</Label><Input name="buttonText" defaultValue={editingBetaCard?.buttonText} /></div>
                                        <div className="space-y-2"><Label>Button URL</Label><Input name="buttonUrl" defaultValue={editingBetaCard?.buttonUrl} /></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="submit" className="w-full">{editingBetaCard ? "Update Beta Card" : "Add Beta Card"}</Button>
                                        {editingBetaCard && <Button type="button" variant="outline" onClick={() => setEditingBetaCard(null)}><X className="h-4 w-4"/></Button>}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}