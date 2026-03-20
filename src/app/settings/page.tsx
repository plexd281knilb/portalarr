"use client";

import { useState, useEffect, useTransition } from "react";
import { 
    // Auth
    getAppUsers, createAppUser, deleteAppUser, 
    // General Settings
    getSettings, saveSettings, saveJobSettings, clearSmtpSettings,
    // Apps & Monitoring
    getTautulliInstances, addTautulliInstance, removeTautulliInstance,
    getGlancesInstances, addGlancesInstance, removeGlancesInstance,
    getMediaApps, addMediaApp, updateMediaApp, removeMediaApp,
    // Beta & Roadmap Actions
    getBetaDashboardText, updateBetaDashboardText,
    getBetaCards, createBetaCard, updateBetaCard, deleteBetaCard,
    getRoadmapText, updateRoadmapText,
    // --- NEW ALERT ACTIONS ---
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
import { Trash2, UserPlus, Shield, User, Send, Pencil, X, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

    // Beta & Roadmap States
    const [betaText, setBetaText] = useState<string>("");
    const [betaCards, setBetaCards] = useState<any[]>([]);
    const [roadmapText, setRoadmapText] = useState<string>("");

    // --- NEW ALERT STATES ---
    const [alertBanner, setAlertBanner] = useState<{enabled: boolean, text: string}>({enabled: false, text: ""});
    const [bannerEnabled, setBannerEnabled] = useState(false);

    // Edit Mode States
    const [editingApp, setEditingApp] = useState<any>(null);
    const [editingBetaCard, setEditingBetaCard] = useState<any>(null); // <-- NEW STATE FOR BETA CARDS

    const loadAllData = async () => {
        setLoading(true);

        // Fail-Safe: Force unlock after 2.5 seconds if the database hangs
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
            
            // Set Banner State
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

    // --- TAB HANDLER ---
    const handleTabChange = (value: string) => {
        startTransition(() => {
            setActiveTab(value);
        });
    };

    // --- FORM HANDLERS ---
    const handleForm = async (e: React.FormEvent, action: Function) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await action(formData); 
        (e.target as HTMLFormElement).reset();
        setEditingApp(null); 
        setEditingBetaCard(null); // Reset beta card edit mode on save
        loadAllData();
    };

    const handleDelete = async (id: string, action: Function) => {
        if(confirm("Are you sure?")) {
            await action(id);
            loadAllData();
        }
    };

    // App Edit Handlers
    const startEdit = (app: any) => setEditingApp(app);
    const cancelEdit = () => setEditingApp(null);

    // Beta Card Edit Handlers
    const startEditBetaCard = (card: any) => setEditingBetaCard(card);
    const cancelEditBetaCard = () => setEditingBetaCard(null);

    // Initial Loading Screen
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Loading settings...</p>
            </div>
        );
    }

    return (
        <div className={`space-y-6 p-8 max-w-6xl mx-auto transition-opacity duration-200 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
            <div>
                <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                <p className="text-muted-foreground">Configure the platform, integrations, and access.</p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
                <TabsList className="grid w-full grid-cols-1 md:grid-cols-4 h-auto">
                    <TabsTrigger value="general" className="cursor-pointer">General & SMTP</TabsTrigger>
                    <TabsTrigger value="access" className="cursor-pointer">Access Control</TabsTrigger>
                    <TabsTrigger value="monitoring" className="cursor-pointer">Monitoring & Apps</TabsTrigger>
                    <TabsTrigger value="beta" className="cursor-pointer">Beta Testing</TabsTrigger>
                </TabsList>
                
                {isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Switching tabs...
                    </div>
                )}

                {/* --- TAB 1: GENERAL & SMTP --- */}
                <TabsContent value="general" className="space-y-4">
                    
                    {/* --- NEW ALERT BANNER CARD --- */}
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
                                        <CardTitle>SMTP Settings (Sending)</CardTitle>
                                        <CardDescription>Used for sending welcome emails and notifications.</CardDescription>
                                    </div>
                                    {systemSettings?.smtpHost ? (
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
                                    <div className="flex gap-2">
                                        <Button type="submit" className="flex-1">
                                            <Send className="h-4 w-4 mr-2"/> 
                                            {systemSettings?.smtpHost ? "Update SMTP" : "Save SMTP"}
                                        </Button>
                                        
                                        {systemSettings?.smtpHost && (
                                            <Button 
                                                type="button" 
                                                variant="destructive" 
                                                onClick={async () => {
                                                    if(confirm("Are you sure you want to clear the SMTP settings?")) {
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

                        <Card className="col-span-1">
                            <CardHeader>
                                <CardTitle>{editingApp ? "Edit Application" : "Applications"}</CardTitle>
                                <CardDescription>{editingApp ? `Editing: ${editingApp.name}` : "Services for the Apps page."}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
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

                                <form onSubmit={(e) => handleForm(e, editingApp ? updateMediaApp : addMediaApp)} className={`space-y-2 ${!editingApp && "border-t pt-2"}`}>
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
                                        <Button type="submit" size="sm" className="w-full">{editingApp ? "Update App" : "Add App"}</Button>
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

                {/* --- TAB 4: BETA TESTING & ROADMAP TAB --- */}
                <TabsContent value="beta" className="space-y-6">
                    
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">🗺️ Roadmap & New Features</CardTitle>
                            <CardDescription>
                                Update the text shown on the home page Roadmap card (Supports Markdown formatting).
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={(e) => handleForm(e, updateRoadmapText)} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Roadmap Markdown</Label>
                                    <Textarea 
                                        name="text" 
                                        defaultValue={roadmapText} 
                                        rows={6} 
                                        className="font-mono text-sm"
                                        placeholder="### 🚀 Upcoming Features..."
                                        required
                                    />
                                </div>
                                <Button type="submit">Save Roadmap Text</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader>
                                <CardTitle>Beta Dashboard Text</CardTitle>
                                <CardDescription>This Markdown text appears on the main home dashboard.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, updateBetaDashboardText)} className="space-y-4">
                                    <div className="space-y-2">
                                        <Label>Markdown Text</Label>
                                        <Textarea name="text" rows={6} defaultValue={betaText} required placeholder="### Interested in Beta Testing?..." />
                                    </div>
                                    <Button type="submit">Save Beta Text</Button>
                                </form>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>{editingBetaCard ? "Edit Beta Card" : "Beta Testing Cards"}</CardTitle>
                                <CardDescription>{editingBetaCard ? `Editing: ${editingBetaCard.title}` : "Add the instruction cards that appear on the /beta page."}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {!editingBetaCard && (
                                    <div className="space-y-4 max-h-[300px] overflow-y-auto">
                                        {(!betaCards || betaCards.length === 0) ? (
                                            <div className="text-sm text-muted-foreground italic">No beta cards created yet.</div>
                                        ) : (
                                            betaCards.map((card: any) => (
                                                <div key={card.id} className="flex items-start justify-between border p-3 rounded-md">
                                                    <div className="space-y-1">
                                                        <div className="font-semibold">{card.title}</div>
                                                        <div className="text-xs text-muted-foreground line-clamp-1">{card.content}</div>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0 ml-2">
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => startEditBetaCard(card)}>
                                                            <Pencil className="h-4 w-4 text-blue-500" />
                                                        </Button>
                                                        <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(card.id, deleteBetaCard)}>
                                                            <Trash2 className="h-4 w-4 text-red-500" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                                <form onSubmit={(e) => handleForm(e, editingBetaCard ? updateBetaCard : createBetaCard)} className={`space-y-4 ${!editingBetaCard && "border-t pt-4"}`}>
                                    {editingBetaCard && <input type="hidden" name="id" value={editingBetaCard.id} />}
                                    <div className="space-y-2">
                                        <Label>Card Title</Label>
                                        <Input name="title" placeholder="Ex: New Music App" defaultValue={editingBetaCard?.title} required />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Content (Supports Markdown)</Label>
                                        <Textarea name="content" placeholder="Instructions go here..." rows={4} defaultValue={editingBetaCard?.content} required />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>Button Text (Optional)</Label>
                                            <Input name="buttonText" placeholder="Ex: Download Plexamp" defaultValue={editingBetaCard?.buttonText} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Button URL (Optional)</Label>
                                            <Input name="buttonUrl" placeholder="https://..." defaultValue={editingBetaCard?.buttonUrl} />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button type="submit" className="w-full">{editingBetaCard ? "Update Beta Card" : "Add Beta Card"}</Button>
                                        {editingBetaCard && (
                                            <Button type="button" variant="outline" onClick={cancelEditBetaCard}>
                                                <X className="h-4 w-4"/>
                                            </Button>
                                        )}
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