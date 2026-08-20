"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { 
    getAppUsers, createAppUser, deleteAppUser, 
    getSettings, saveSettings, saveJobSettings, clearSmtpSettings, sendTestEmailAction, syncPlexFriendsAction,
    getTautulliInstances, addTautulliInstance, removeTautulliInstance,
    getGlancesInstances, addGlancesInstance, removeGlancesInstance,
    getMediaApps, addMediaApp, updateMediaApp, removeMediaApp,
    getBetaDashboardText, updateBetaDashboardText,
    getBetaCards, createBetaCard, updateBetaCard, deleteBetaCard,
    getRoadmapText, updateRoadmapText,
    getAlertBanner, updateAlertBanner,
    testAppConnectionAction, testTautulliConnectionAction, testGlancesConnectionAction, validateDownloadsPathAction,
    getAiAgentSettings, saveAiAgentSettings, testAiAgentConnection, resolveBookWithAI, runAiBatchMetadataScanner, testFolderPermissions
} from "@/app/actions";
import { testArrConfig } from "@/app/arr-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; 
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
    Trash2, UserPlus, Shield, User, Send, Pencil, X, Loader2, 
    AlertTriangle, PlaySquare, Activity, Sliders, Megaphone, Beaker, 
    CheckCircle2, XCircle, MailCheck, RefreshCw, Mail, FolderCheck, 
    Radio, ExternalLink, FileCode, Check, Bot, Sparkles, Key, Cpu, Eye, EyeOff, Terminal
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import AccessSettingsPage from "@/app/settings/access/page";
import SystemLogsViewer from "@/components/system-logs-viewer";

export default function SettingsPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <SettingsPageContent />
        </Suspense>
    );
}

function SettingsPageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const activeTabParam = searchParams.get("tab");
    const [activeTab, setActiveTab] = useState("general");

    useEffect(() => {
        const savedTab = localStorage.getItem("settings-active-tab");
        if (activeTabParam) {
            setActiveTab(activeTabParam);
        } else if (savedTab) {
            setActiveTab(savedTab);
            const params = new URLSearchParams(window.location.search);
            params.set("tab", savedTab);
            router.replace(`${pathname}?${params.toString()}`);
        } else {
            setActiveTab("general");
        }
    }, [activeTabParam, router, pathname]);

    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    
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

    // Test Email States
    const [testEmailLoading, setTestEmailLoading] = useState(false);
    const [testEmailMsg, setTestEmailMsg] = useState("");
    const [testEmailErr, setTestEmailErr] = useState("");

    // Connection Testing States
    const [testingAppId, setTestingAppId] = useState<string | null>(null);
    const [appTestResults, setAppTestResults] = useState<{ [id: string]: { success?: boolean, msg?: string, err?: string } }>({});

    const [testingTautulliId, setTestingTautulliId] = useState<string | null>(null);
    const [tautulliTestResults, setTautulliTestResults] = useState<{ [id: string]: { success?: boolean, msg?: string, err?: string } }>({});

    const [testingGlancesId, setTestingGlancesId] = useState<string | null>(null);
    const [glancesTestResults, setGlancesTestResults] = useState<{ [id: string]: { success?: boolean, msg?: string, err?: string } }>({});

    // Path Validation State
    const [validatingPath, setValidatingPath] = useState(false);
    const [pathResult, setPathResult] = useState<{ success?: boolean, msg?: string, err?: string } | null>(null);
    const [inputDownloadsPath, setInputDownloadsPath] = useState("");

    const handleTestSmtp = async () => {
        setTestEmailLoading(true);
        setTestEmailMsg("");
        setTestEmailErr("");
        const res = await sendTestEmailAction();
        setTestEmailLoading(false);
        if (res.success) {
            setTestEmailMsg(res.message || "Test email dispatched successfully!");
        } else {
            setTestEmailErr(res.error || "Failed to send test email.");
        }
    };

    const handleTestApp = async (id: string) => {
        setTestingAppId(id);
        const res = await testAppConnectionAction(id);
        setTestingAppId(null);
        setAppTestResults(prev => ({
            ...prev,
            [id]: res.success ? { success: true, msg: res.message } : { success: false, err: res.error }
        }));
    };

    const handleTestTautulli = async (id: string) => {
        setTestingTautulliId(id);
        const res = await testTautulliConnectionAction(id);
        setTestingTautulliId(null);
        setTautulliTestResults(prev => ({
            ...prev,
            [id]: res.success ? { success: true, msg: res.message } : { success: false, err: res.error }
        }));
    };

    const handleTestGlances = async (id: string) => {
        setTestingGlancesId(id);
        const res = await testGlancesConnectionAction(id);
        setTestingGlancesId(null);
        setGlancesTestResults(prev => ({
            ...prev,
            [id]: res.success ? { success: true, msg: res.message } : { success: false, err: res.error }
        }));
    };

    const handleValidatePath = async (pathStr: string) => {
        setValidatingPath(true);
        setPathResult(null);
        const res = await validateDownloadsPathAction(pathStr);
        setValidatingPath(false);
        setPathResult(res.success ? { success: true, msg: res.message } : { success: false, err: res.error });
    };

    const [arrMeta, setArrMeta] = useState<any>(null);
    const [fetchingArrMeta, setFetchingArrMeta] = useState(false);
    const handleFetchArrMeta = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        if (!form) return;
        const url = (form.elements.namedItem("url") as HTMLInputElement).value;
        const apiKey = (form.elements.namedItem("apiKey") as HTMLInputElement).value;
        if (!url || !apiKey) {
            alert("URL and API Key are required to fetch metadata.");
            return;
        }
        setFetchingArrMeta(true);
        setArrMeta(null);
        const res = await testArrConfig(url, apiKey);
        if (res.success) {
            setArrMeta(res.data);
        } else {
            alert("Failed to fetch profiles/folders: " + res.error);
        }
        setFetchingArrMeta(false);
    };

    const [permTesting, setPermTesting] = useState(false);
    const [permResult, setPermResult] = useState<any>(null);

    const handleTestPermissions = async (folderPath: string, targetLibPath?: string) => {
        setPermTesting(true);
        setPermResult(null);
        try {
            const res = await testFolderPermissions(folderPath, targetLibPath);
            setPermResult(res);
        } catch (e: any) {
            setPermResult({ success: false, error: e.message });
        } finally {
            setPermTesting(false);
        }
    };

    // AI Agent States
    const [aiSettings, setAiSettings] = useState<any>({
        aiProvider: "default",
        aiApiKey: "",
        aiModel: "gemini-1.5-flash",
        aiAutoResolve: true
    });
    const [aiProviderSelect, setAiProviderSelect] = useState("default");
    const [aiModelInput, setAiModelInput] = useState("gemini-1.5-flash");
    const [aiAutoResolveSwitch, setAiAutoResolveSwitch] = useState(true);
    const [showAiKey, setShowAiKey] = useState(false);
    const [testAiLoading, setTestAiLoading] = useState(false);
    const [testAiResult, setTestAiResult] = useState<any>(null);
    const [testAiErr, setTestAiErr] = useState("");
    const [saveAiMsg, setSaveAiMsg] = useState("");

    const handleTestAiAgent = async () => {
        setTestAiLoading(true);
        setTestAiResult(null);
        setTestAiErr("");
        try {
            const res = await testAiAgentConnection();
            if (res.success && res.result) {
                setTestAiResult(res.result);
            } else {
                setTestAiErr(res.error || "AI Agent test failed");
            }
        } catch (e: any) {
            setTestAiErr(e.message || "Failed to test AI Agent");
        } finally {
            setTestAiLoading(false);
        }
    };

    const [batchScanning, setBatchScanning] = useState(false);

    const handleRunAiBatchScan = async () => {
        setBatchScanning(true);
        try {
            const res = await runAiBatchMetadataScanner();
            if (res.success) {
                alert(`✨ AI Batch Scanner Complete: ${res.message}`);
            } else {
                alert(`❌ AI Batch Scanner Failed: ${res.error}`);
            }
        } catch (e: any) {
            alert(`❌ AI Batch Scanner Failed: ${e.message}`);
        } finally {
            setBatchScanning(false);
        }
    };

    const loadAllData = async () => {
        setLoading(true);

        const safetyUnlock = setTimeout(() => {
            setLoading(false);
        }, 2500);

        try {
            const [u, s, t, g, m, bt, bc, rt, ab, ai] = await Promise.all([
                getAppUsers(),
                getSettings(),
                getTautulliInstances(),
                getGlancesInstances(),
                getMediaApps(),
                getBetaDashboardText(), 
                getBetaCards(),
                getRoadmapText(),
                getAlertBanner(),
                getAiAgentSettings().catch(() => null)
            ]);
            setUsers(u || []);
            setSystemSettings(s || {});
            setInputDownloadsPath(s?.downloadsPath || "/downloads");
            setTautulli(t || []);
            setGlances(g || []);
            setMediaApps(m || []);
            setBetaText(bt || "");
            setBetaCards(bc || []);
            setRoadmapText(rt || "");
            
            setAlertBanner(ab || {enabled: false, text: ""});
            setBannerEnabled(ab?.enabled || false);

            if (ai) {
                setAiSettings(ai);
                setAiProviderSelect(ai.aiProvider || "default");
                setAiModelInput(ai.aiModel || "gemini-2.5-flash");
                setAiAutoResolveSwitch(ai.aiAutoResolve ?? true);
            }
        } catch (error) {
            console.error("Failed to load settings data:", error);
        } finally {
            clearTimeout(safetyUnlock);
            setLoading(false);
        }
    };

    useEffect(() => { loadAllData(); }, []);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        localStorage.setItem("settings-active-tab", value);
        startTransition(() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("tab", value);
            router.push(`${pathname}?${params.toString()}`);
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
                <p className="text-muted-foreground">Configure global platform settings, integrations, access control, and monitoring apps.</p>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto p-1 max-w-5xl bg-muted/40 border border-muted/60 rounded-xl">
                    <TabsTrigger value="general" className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <Sliders className="h-4 w-4 text-primary shrink-0" />
                        <span>General & Email</span>
                    </TabsTrigger>
                    <TabsTrigger value="access" className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Access Control</span>
                    </TabsTrigger>
                    <TabsTrigger value="monitoring" className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <Activity className="h-4 w-4 text-sky-400 shrink-0" />
                        <span>Monitoring & Apps</span>
                    </TabsTrigger>
                    <TabsTrigger value="beta" className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <Beaker className="h-4 w-4 text-purple-400 shrink-0" />
                        <span>Beta & Announcements</span>
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer">
                        <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Live System Logs</span>
                    </TabsTrigger>
                </TabsList>
                
                {isPending && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Switching tabs...
                    </div>
                )}

                {/* --- TAB 1: GENERAL SETUP --- */}
                <TabsContent value="general" className="space-y-6">
                    
                    {/* ALERT BANNER CARD */}
                    <Card className="border-orange-500/40 bg-orange-500/5">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-500">
                                <AlertTriangle className="h-5 w-5"/> System Alert Banner
                            </CardTitle>
                            <CardDescription>Display a warning or maintenance notification banner at the top of the main dashboard.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={(e) => handleForm(e, updateAlertBanner)} className="space-y-4">
                                <div className="flex items-center space-x-2">
                                    <Switch 
                                        id="banner-enabled" 
                                        checked={bannerEnabled} 
                                        onCheckedChange={setBannerEnabled} 
                                    />
                                    <Label htmlFor="banner-enabled" className="cursor-pointer font-medium">Enable Dashboard Alert Banner</Label>
                                    <input type="hidden" name="enabled" value={bannerEnabled ? "on" : "off"} />
                                </div>
                                <div className="space-y-2">
                                    <Input 
                                        name="text" 
                                        defaultValue={alertBanner.text} 
                                        placeholder="⚠️ **Maintenance Notice:** Server maintenance scheduled for 2:00 AM EST..." 
                                    />
                                </div>
                                <Button type="submit" variant="outline" className="border-orange-500/50 hover:bg-orange-500/10 text-orange-500 font-semibold">
                                    Save Alert Banner
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* SMTP & EMAIL INTEGRATION */}
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="flex items-center gap-2">
                                            <Mail className="h-5 w-5 text-primary" /> Global SMTP & Kindle Sender
                                        </CardTitle>
                                        <CardDescription>Configure outbound SMTP server for Send-to-Kindle delivery & admin notifications.</CardDescription>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {systemSettings?.smtpHost ? (
                                            <Badge className="bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[10px] gap-1">
                                                <CheckCircle2 className="h-3 w-3" /> SMTP Configured
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]">
                                                SMTP Inactive
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, saveSettings)} className="space-y-4">
                                    {testEmailMsg && (
                                        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                                            <span>{testEmailMsg}</span>
                                        </div>
                                    )}
                                    {testEmailErr && (
                                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                            <XCircle className="h-4 w-4 shrink-0" />
                                            <span>{testEmailErr}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>SMTP Host</Label><Input name="smtpHost" defaultValue={systemSettings.smtpHost || ""} placeholder="smtp.gmail.com"/></div>
                                        <div className="space-y-2"><Label>Port</Label><Input name="smtpPort" defaultValue={systemSettings.smtpPort || ""} placeholder="587"/></div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2"><Label>User / Email</Label><Input name="smtpUser" defaultValue={systemSettings.smtpUser || ""} placeholder="user@gmail.com"/></div>
                                        <div className="space-y-2"><Label>Password</Label><Input name="smtpPass" type="password" defaultValue={systemSettings.smtpPass || ""}/></div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Sender Email Address (From)</Label>
                                        <Input name="smtpFrom" defaultValue={systemSettings.smtpFrom || ""} placeholder="portalarr@domain.com"/>
                                        <div className="text-[11px] text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-muted/50 mt-1 space-y-1">
                                            <div className="font-semibold text-foreground flex items-center gap-1">
                                                <Send className="h-3 w-3 text-amber-500" /> Send-to-Kindle Requirement:
                                            </div>
                                            <div>Add this Sender Email to your users' <strong>Amazon Approved Personal Document E-mail List</strong> under Amazon → Manage Your Content and Devices → Preferences.</div>
                                        </div>
                                    </div>
                                    
                                    {/* PLEX TOKEN SECTION */}
                                    <div className="space-y-2 border-t border-muted/40 pt-4 mt-4">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="mainPlexToken" className="text-xs font-semibold">Admin Plex Token (Auto-Syncs Friends List)</Label>
                                            {systemSettings?.mainPlexToken && (
                                                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" /> Encrypted & Saved
                                                </span>
                                            )}
                                        </div>
                                        <Input 
                                            id="mainPlexToken" 
                                            name="mainPlexToken" 
                                            type="password" 
                                            defaultValue={systemSettings.mainPlexToken || ""} 
                                            placeholder="xxxxxxxxxxxxxxxxxxxx" 
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2 pt-2">
                                        <Button type="submit" className="flex-1 font-bold">
                                            <Send className="h-4 w-4 mr-2"/> 
                                            Save SMTP Settings
                                        </Button>

                                        <Button 
                                            type="button" 
                                            variant="outline"
                                            className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10 font-semibold"
                                            onClick={handleTestSmtp}
                                            disabled={testEmailLoading || !systemSettings?.smtpHost}
                                            title="Send a test email to your SMTP account"
                                        >
                                            {testEmailLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailCheck className="h-3.5 w-3.5" />}
                                            Test Connection
                                        </Button>
                                        
                                        {(systemSettings?.smtpHost || systemSettings?.mainPlexToken) && (
                                            <Button 
                                                type="button" 
                                                variant="destructive" 
                                                onClick={async () => {
                                                    if(confirm("Are you sure you want to wipe SMTP settings?")) {
                                                        await clearSmtpSettings();
                                                        loadAllData();
                                                    }
                                                }}
                                                title="Clear Credentials"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>

                        {/* AUTOMATION & DOWNLOAD DIRECTORY VALIDATOR */}
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <FolderCheck className="h-5 w-5 text-primary" /> Automation & Directory Paths
                                    </CardTitle>
                                    <CardDescription>Configure scan intervals and inspect completed downloads path access.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={(e) => handleForm(e, saveJobSettings)} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label>Library Auto-Scan Interval (Minutes)</Label>
                                            <Input name="autoSyncInterval" type="number" defaultValue={systemSettings.autoSyncInterval || 5} />
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center">
                                                <Label>Completed Downloads Folder Path</Label>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {["/downloads", "/user/downloads", "/user/Books", "/Userbooks", "/mnt/user/Books"].map((preset) => (
                                                        <Button
                                                            key={preset}
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-6 px-2 text-[10px] font-mono border-muted/50 text-muted-foreground hover:text-primary hover:border-primary/50"
                                                            onClick={() => {
                                                                setInputDownloadsPath(preset);
                                                                handleTestPermissions(preset);
                                                            }}
                                                        >
                                                            {preset}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Input 
                                                    name="downloadsPath" 
                                                    type="text" 
                                                    value={inputDownloadsPath}
                                                    onChange={(e) => setInputDownloadsPath(e.target.value)}
                                                    placeholder="/downloads"
                                                    className="flex-1 min-w-[200px]"
                                                />
                                                <Button 
                                                    type="button" 
                                                    variant="outline" 
                                                    className="text-xs shrink-0 font-semibold gap-1"
                                                    disabled={validatingPath}
                                                    onClick={() => handleValidatePath(inputDownloadsPath)}
                                                >
                                                    {validatingPath ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderCheck className="h-3.5 w-3.5" />}
                                                    Check Path
                                                </Button>
                                                <Button 
                                                    type="button" 
                                                    variant="secondary" 
                                                    className="text-xs shrink-0 font-extrabold gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
                                                    disabled={permTesting}
                                                    onClick={() => handleTestPermissions(inputDownloadsPath)}
                                                >
                                                    {permTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <Shield className="h-3.5 w-3.5 text-amber-400" />}
                                                    Run Diagnostic Suite
                                                </Button>
                                            </div>
                                            {pathResult && (
                                                <div className={`text-xs p-2.5 rounded-lg border mt-2 flex items-center gap-2 ${pathResult.success ? "text-emerald-400 bg-emerald-950/40 border-emerald-800/40" : "text-red-400 bg-red-950/40 border-red-800/40"}`}>
                                                    {pathResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                                    <span>{pathResult.msg || pathResult.err}</span>
                                                </div>
                                            )}

                                            {/* FULL FOLDER PERMISSIONS DIAGNOSTIC RESULTS */}
                                            {permResult && (
                                                <div className={`text-xs p-4 rounded-xl border mt-3 space-y-3 ${permResult.success ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-300" : "bg-red-950/30 border-red-800/40 text-slate-200"}`}>
                                                    <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-sm border-b border-muted/30 pb-2">
                                                        <span className="flex items-center gap-2">
                                                            {permResult.success ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-4.5 w-4.5 text-red-400 shrink-0" />}
                                                            Container Folder Diagnostic: <code className="text-amber-400 text-xs">{permResult.results?.folderPath}</code>
                                                        </span>
                                                        <Badge className={permResult.success ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}>
                                                            {permResult.success ? "✓ ALL PERMISSIONS PASS" : "✗ PERMISSIONS DEFICIENT"}
                                                        </Badge>
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 font-mono text-[11px]">
                                                        <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-muted/30">
                                                            <span>📁 Path Exists:</span>
                                                            <span className={permResult.results?.exists ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                                                {permResult.results?.exists ? "✓ PASS" : "✗ FAIL"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-muted/30">
                                                            <span>📖 Read Access:</span>
                                                            <span className={permResult.results?.canRead ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                                                {permResult.results?.canRead ? "✓ PASS" : "✗ FAIL"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-muted/30">
                                                            <span>✏️ Write Access:</span>
                                                            <span className={permResult.results?.canWrite ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                                                {permResult.results?.canWrite ? "✓ PASS" : "✗ FAIL"}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between p-2 rounded bg-background/60 border border-muted/30">
                                                            <span>🗑️ Delete Access:</span>
                                                            <span className={permResult.results?.canDelete ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                                                {permResult.results?.canDelete ? "✓ PASS" : "✗ FAIL"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {permResult.results?.exists && (
                                                        <div className="text-[11px] bg-background/40 p-2.5 rounded-lg border border-muted/30 flex flex-wrap justify-between items-center gap-2 font-mono">
                                                            <span>
                                                                Total Items: <strong className="text-primary">{permResult.results?.itemCount || 0}</strong>
                                                            </span>
                                                            <span>
                                                                Total File Size: <strong className="text-amber-400">{((permResult.results?.totalSizeBytes || 0) / (1024 * 1024)).toFixed(1)} MB</strong>
                                                            </span>
                                                        </div>
                                                    )}

                                                    {permResult.results?.subfolders && permResult.results.subfolders.length > 0 && (
                                                        <div className="space-y-1.5 pt-1">
                                                            <div className="text-[11px] font-bold text-slate-400">Detected Subdirectories:</div>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {permResult.results.subfolders.map((sub: any) => (
                                                                    <Badge key={sub.name} variant="outline" className="bg-muted/40 text-[10px] font-mono">
                                                                        📂 {sub.name} ({sub.count} items)
                                                                    </Badge>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {permResult.results?.error && (
                                                        <div className="text-[11px] text-red-400 bg-red-950/50 p-2.5 rounded-lg border border-red-800/40">
                                                            <strong>Error Details:</strong> {permResult.results.error}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <Button type="submit" variant="secondary" className="w-full font-semibold">
                                            Save Automation Settings
                                        </Button>
                                    </form>
                                </CardContent>
                            </Card>

                            {/* AI METADATA AGENT CARD */}
                            <Card className="border-purple-500/40 bg-purple-500/5">
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="flex items-center gap-2 text-purple-400">
                                                <Bot className="h-5 w-5 text-purple-400"/> AI Metadata Agent
                                            </CardTitle>
                                            <CardDescription>
                                                Automated AI agent to analyze messy release folder names and extract official book titles, authors, and cover art queries.
                                            </CardDescription>
                                        </div>
                                        <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px]">
                                            {aiProviderSelect === "default" ? "Built-In Heuristic" : aiProviderSelect === "gemini" ? "Google Gemini" : "OpenAI"}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <form onSubmit={async (e) => {
                                        e.preventDefault();
                                        const formData = new FormData(e.currentTarget);
                                        formData.append("aiProvider", aiProviderSelect);
                                        formData.append("aiModel", aiModelInput);
                                        formData.append("aiAutoResolve", aiAutoResolveSwitch ? "true" : "false");
                                        const res = await saveAiAgentSettings(formData);
                                        if (res.success) {
                                            setSaveAiMsg("AI Agent settings saved successfully!");
                                            setTimeout(() => setSaveAiMsg(""), 4000);
                                        }
                                    }} className="space-y-4">
                                        {saveAiMsg && (
                                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                <span>{saveAiMsg}</span>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label>AI Provider Engine</Label>
                                            <Select 
                                                value={aiProviderSelect} 
                                                onValueChange={(val) => {
                                                    setAiProviderSelect(val);
                                                    if (val === "gemini" && (!aiModelInput || aiModelInput.startsWith("gpt"))) {
                                                        setAiModelInput("gemini-2.5-flash");
                                                    } else if (val === "openai" && (!aiModelInput || aiModelInput.startsWith("gemini"))) {
                                                        setAiModelInput("gpt-4o-mini");
                                                    }
                                                }}
                                            >
                                                <SelectTrigger className="w-full">
                                                    <SelectValue placeholder="Select AI Provider" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="default">Default Built-In (Free Heuristic & Search)</SelectItem>
                                                    <SelectItem value="gemini">Google Gemini (Gemini 2.5 Flash / Pro)</SelectItem>
                                                    <SelectItem value="openai">OpenAI (GPT-4o / GPT-4o-mini)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {aiProviderSelect !== "default" && (
                                            <>
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <Label>API Key</Label>
                                                        <Button 
                                                            type="button" 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                                            onClick={() => setShowAiKey(!showAiKey)}
                                                        >
                                                            {showAiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </div>
                                                    <Input 
                                                        name="aiApiKey" 
                                                        type={showAiKey ? "text" : "password"}
                                                        defaultValue={aiSettings.aiApiKey || ""}
                                                        placeholder={aiProviderSelect === "gemini" ? "AIzaSy..." : "sk-..."}
                                                    />
                                                </div>

                                                <div className="space-y-2">
                                                    <Label>Model Name</Label>
                                                    <Select 
                                                        value={
                                                            (aiProviderSelect === "gemini" && ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b"].includes(aiModelInput)) ||
                                                            (aiProviderSelect === "openai" && ["gpt-4o-mini", "gpt-4o", "gpt-4.5-preview", "gpt-3.5-turbo"].includes(aiModelInput))
                                                                ? aiModelInput
                                                                : "custom"
                                                        }
                                                        onValueChange={(val) => {
                                                            if (val !== "custom") {
                                                                setAiModelInput(val);
                                                            } else {
                                                                setAiModelInput("");
                                                            }
                                                        }}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select AI Model..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {aiProviderSelect === "gemini" ? (
                                                                <>
                                                                    <SelectItem value="gemini-2.5-flash">gemini-2.5-flash (Recommended)</SelectItem>
                                                                    <SelectItem value="gemini-2.5-pro">gemini-2.5-pro (High Performance)</SelectItem>
                                                                    <SelectItem value="gemini-2.0-flash">gemini-2.0-flash</SelectItem>
                                                                    <SelectItem value="gemini-1.5-flash">gemini-1.5-flash</SelectItem>
                                                                    <SelectItem value="gemini-1.5-pro">gemini-1.5-pro</SelectItem>
                                                                    <SelectItem value="gemini-1.5-flash-8b">gemini-1.5-flash-8b</SelectItem>
                                                                    <SelectItem value="custom">✏️ Custom Model Name...</SelectItem>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <SelectItem value="gpt-4o-mini">gpt-4o-mini (Recommended)</SelectItem>
                                                                    <SelectItem value="gpt-4o">gpt-4o (High Performance)</SelectItem>
                                                                    <SelectItem value="gpt-4.5-preview">gpt-4.5-preview</SelectItem>
                                                                    <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo</SelectItem>
                                                                    <SelectItem value="custom">✏️ Custom Model Name...</SelectItem>
                                                                </>
                                                            )}
                                                        </SelectContent>
                                                    </Select>

                                                    {(![
                                                        "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.5-flash-8b",
                                                        "gpt-4o-mini", "gpt-4o", "gpt-4.5-preview", "gpt-3.5-turbo"
                                                    ].includes(aiModelInput)) && (
                                                        <Input 
                                                            value={aiModelInput}
                                                            onChange={(e) => setAiModelInput(e.target.value)}
                                                            placeholder="Enter custom model identifier..."
                                                            className="mt-2"
                                                        />
                                                    )}
                                                </div>
                                            </>
                                        )}

                                        <div className="flex items-center space-x-2 pt-1">
                                            <Switch 
                                                id="ai-auto-resolve" 
                                                checked={aiAutoResolveSwitch} 
                                                onCheckedChange={setAiAutoResolveSwitch} 
                                            />
                                            <Label htmlFor="ai-auto-resolve" className="cursor-pointer text-xs font-medium">
                                                Auto-run AI Resolution during library scans
                                            </Label>
                                        </div>

                                        {testAiResult && (
                                            <div className="text-xs bg-purple-950/40 border border-purple-800/40 p-3 rounded-lg space-y-1.5 font-mono text-purple-200">
                                                <div className="font-bold flex items-center justify-between text-purple-300">
                                                    <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> AI Resolution Result:</span>
                                                    <Badge variant="outline" className="text-[10px] bg-purple-500/20 border-purple-500/30 text-purple-300">
                                                        {testAiResult.providerUsed}
                                                    </Badge>
                                                </div>
                                                <div><strong>Title:</strong> {testAiResult.title}</div>
                                                <div><strong>Author:</strong> {testAiResult.author}</div>
                                                {testAiResult.series && <div><strong>Series:</strong> {testAiResult.series}</div>}
                                                <div><strong>Confidence:</strong> {(testAiResult.confidence * 100).toFixed(0)}%</div>
                                            </div>
                                        )}

                                        {testAiErr && (
                                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                                <XCircle className="h-4 w-4 shrink-0" />
                                                <span>{testAiErr}</span>
                                            </div>
                                        )}

                                        <div className="flex flex-wrap gap-2 pt-2">
                                            <Button type="submit" className="flex-1 bg-purple-600 hover:bg-purple-700 font-bold text-white">
                                                Save AI Agent Settings
                                            </Button>
                                            <Button 
                                                type="button" 
                                                variant="outline" 
                                                className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10 font-semibold gap-1"
                                                onClick={handleTestAiAgent}
                                                disabled={testAiLoading}
                                            >
                                                {testAiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                                                Test Single Query
                                            </Button>
                                            <Button 
                                                type="button" 
                                                variant="secondary" 
                                                className="bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 font-bold gap-1.5 w-full sm:w-auto"
                                                onClick={handleRunAiBatchScan}
                                                disabled={batchScanning}
                                            >
                                                {batchScanning ? <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" /> : <Sparkles className="h-3.5 w-3.5 text-purple-300" />}
                                                🪄 Run AI Batch Resolution on All Libraries
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* --- TAB 2: ACCESS CONTROL --- */}
                <TabsContent value="access" className="space-y-4">
                    <AccessSettingsPage />
                </TabsContent>

                {/* --- TAB 3: MONITORING & APPS --- */}
                <TabsContent value="monitoring" className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* TAUTULLI INSTANCES */}
                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <PlaySquare className="h-5 w-5 text-primary"/> Tautulli Streams
                                </CardTitle>
                                <CardDescription>Plex stream monitoring instances.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                    {tautulli.length === 0 && <p className="text-xs text-muted-foreground italic">No Tautulli instances added.</p>}
                                    {tautulli.map(t => (
                                        <div key={t.id} className="space-y-1.5 border p-2.5 rounded-xl bg-muted/20 text-sm">
                                            <div className="flex justify-between items-center">
                                                <span className="truncate font-semibold">{t.name}</span>
                                                <div className="flex items-center gap-1">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-7 text-[11px] px-2 text-primary"
                                                        disabled={testingTautulliId === t.id}
                                                        onClick={() => handleTestTautulli(t.id)}
                                                    >
                                                        {testingTautulliId === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(t.id, removeTautulliInstance)}>
                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                    </Button>
                                                </div>
                                            </div>
                                            {tautulliTestResults[t.id] && (
                                                <div className={`text-[11px] p-1.5 rounded flex items-center gap-1 ${tautulliTestResults[t.id].success ? "text-emerald-400 bg-emerald-950/40" : "text-red-400 bg-red-950/40"}`}>
                                                    {tautulliTestResults[t.id].success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    <span className="truncate">{tautulliTestResults[t.id].msg || tautulliTestResults[t.id].err}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addTautulliInstance)} className="space-y-2 border-t pt-4 mt-auto">
                                    <div className="grid gap-2">
                                        <Input name="name" placeholder="Friendly Name (e.g. Main Plex)" required className="h-9 text-sm"/>
                                        <Input name="url" placeholder="URL (http://192.168.1.50:8181)" required className="h-9 text-sm font-mono"/>
                                        <Input name="apiKey" placeholder="Tautulli API Key" required className="h-9 text-sm font-mono"/>
                                    </div>
                                    <Button type="submit" size="sm" className="w-full mt-2 font-semibold">Add Tautulli Instance</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* GLANCES INSTANCES */}
                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Activity className="h-5 w-5 text-sky-400"/> Glances Hardware
                                </CardTitle>
                                <CardDescription>CPU, Memory, and System Metrics.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                    {glances.length === 0 && <p className="text-xs text-muted-foreground italic">No Glances instances added.</p>}
                                    {glances.map(g => (
                                        <div key={g.id} className="space-y-1.5 border p-2.5 rounded-xl bg-muted/20 text-sm">
                                            <div className="flex justify-between items-center">
                                                <span className="truncate font-semibold">{g.name}</span>
                                                <div className="flex items-center gap-1">
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        className="h-7 text-[11px] px-2 text-sky-400"
                                                        disabled={testingGlancesId === g.id}
                                                        onClick={() => handleTestGlances(g.id)}
                                                    >
                                                        {testingGlancesId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                                                    </Button>
                                                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(g.id, removeGlancesInstance)}>
                                                        <Trash2 className="h-3.5 w-3.5"/>
                                                    </Button>
                                                </div>
                                            </div>
                                            {glancesTestResults[g.id] && (
                                                <div className={`text-[11px] p-1.5 rounded flex items-center gap-1 ${glancesTestResults[g.id].success ? "text-emerald-400 bg-emerald-950/40" : "text-red-400 bg-red-950/40"}`}>
                                                    {glancesTestResults[g.id].success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                    <span className="truncate">{glancesTestResults[g.id].msg || glancesTestResults[g.id].err}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <form onSubmit={(e) => handleForm(e, addGlancesInstance)} className="space-y-2 border-t pt-4 mt-auto">
                                    <div className="grid gap-2">
                                        <Input name="name" placeholder="Server Name (e.g. Unraid)" required className="h-9 text-sm"/>
                                        <Input name="url" placeholder="URL (http://192.168.1.50:61208)" required className="h-9 text-sm font-mono"/>
                                    </div>
                                    <Button type="submit" size="sm" className="w-full mt-2 font-semibold">Add Glances Server</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* MEDIA APPS & DOWNLOAD CLIENTS */}
                        <Card className="flex flex-col">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-emerald-400"/> {editingApp ? "Edit Application" : "Media Stack & Apps"}
                                </CardTitle>
                                <CardDescription>{editingApp ? `Modifying ${editingApp.name}` : "Connect Arr apps & download clients."}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 flex-1">
                                {!editingApp && (
                                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                        {mediaApps.length === 0 && <p className="text-xs text-muted-foreground italic">No applications configured.</p>}
                                        {mediaApps.map(app => (
                                            <div key={app.id} className="space-y-1.5 border p-2.5 rounded-xl bg-muted/20 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <div className="truncate">
                                                        <div className="font-semibold">{app.name}</div>
                                                        <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">{app.type}</div>
                                                    </div>
                                                    <div className="flex gap-1 shrink-0">
                                                        <Button 
                                                            size="sm" 
                                                            variant="ghost" 
                                                            className="h-7 text-[11px] px-2 text-emerald-400"
                                                            disabled={testingAppId === app.id}
                                                            onClick={() => handleTestApp(app.id)}
                                                        >
                                                            {testingAppId === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-400" onClick={() => { setEditingApp(app); setArrMeta(null); }}>
                                                            <Pencil className="h-3.5 w-3.5"/>
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(app.id, removeMediaApp)}>
                                                            <Trash2 className="h-3.5 w-3.5"/>
                                                        </Button>
                                                    </div>
                                                </div>
                                                {appTestResults[app.id] && (
                                                    <div className={`text-[11px] p-1.5 rounded flex items-center gap-1 ${appTestResults[app.id].success ? "text-emerald-400 bg-emerald-950/40" : "text-red-400 bg-red-950/40"}`}>
                                                        {appTestResults[app.id].success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                                        <span className="truncate">{appTestResults[app.id].msg || appTestResults[app.id].err}</span>
                                                    </div>
                                                )}
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
                                                <SelectLabel>Utility & Indexers</SelectLabel>
                                                <SelectItem value="prowlarr">Prowlarr</SelectItem>
                                                <SelectItem value="readarr">Readarr</SelectItem>
                                                <SelectItem value="bazarr">Bazarr</SelectItem>
                                                <SelectItem value="lidarr">Lidarr</SelectItem>
                                                <SelectItem value="maintainerr">Maintainerr</SelectItem>
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                    <Input name="name" placeholder="Display Name" required className="h-9 text-sm" defaultValue={editingApp?.name} />
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Internal URL</Label>
                                            <Input name="url" placeholder="http://192.168.1.50:8080" required className="h-9 text-sm font-mono" defaultValue={editingApp?.url} />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">External URL</Label>
                                            <Input name="externalUrl" placeholder="https://app.com" className="h-9 text-sm font-mono" defaultValue={editingApp?.externalUrl} />
                                        </div>
                                    </div>
                                    <Input name="apiKey" placeholder="API Key / Password" className="h-9 text-sm font-mono" defaultValue={editingApp?.apiKey} />
                                    
                                    <div className="space-y-2 border-t pt-3 mt-3">
                                        <div className="flex items-center space-x-2">
                                            <input type="checkbox" id="enabledForUsers" name="enabledForUsers" value="true" defaultChecked={editingApp?.enabledForUsers} className="h-4 w-4 rounded border-gray-300" />
                                            <Label htmlFor="enabledForUsers" className="text-sm font-medium">Enable for Super Users (Radarr/Sonarr)</Label>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground ml-6">If enabled, this instance will appear on the Radarr/Sonarr pages for SUPER_USERs.</p>
                                        
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Allowed Quality Profile IDs</Label>
                                                <Input id="allowedQualityProfileIds" name="allowedQualityProfileIds" placeholder="e.g. 1,4,7" className="h-8 text-xs" defaultValue={editingApp?.allowedQualityProfileIds || ""} />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] uppercase font-bold text-muted-foreground ml-1">Allowed Root Folder IDs</Label>
                                                <Input id="allowedRootFolderIds" name="allowedRootFolderIds" placeholder="e.g. 1,2" className="h-8 text-xs" defaultValue={editingApp?.allowedRootFolderIds || ""} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-[10px] text-muted-foreground ml-1">Comma-separated list of IDs. Super Users will only be able to select from these.</p>
                                            <Button type="button" variant="outline" size="sm" className="h-7 text-[10px] px-2 py-0" onClick={handleFetchArrMeta} disabled={fetchingArrMeta}>
                                                {fetchingArrMeta ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                                                Fetch IDs
                                            </Button>
                                        </div>
                                        {arrMeta && (
                                            <div className="space-y-3 bg-muted/30 p-2 rounded-md border mt-2">
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Quality Profiles (Click to toggle)</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {arrMeta.profiles.map((p: any) => (
                                                            <Badge 
                                                                key={p.id} 
                                                                variant="outline" 
                                                                className="cursor-pointer hover:bg-primary/20 text-[10px] py-0 transition-colors"
                                                                onClick={() => {
                                                                    const input = document.getElementById("allowedQualityProfileIds") as HTMLInputElement;
                                                                    if (!input) return;
                                                                    const current = input.value.split(',').map(s => s.trim()).filter(s => s);
                                                                    const id = p.id.toString();
                                                                    if (!current.includes(id)) input.value = current.length > 0 ? `${current.join(',')},${id}` : id;
                                                                    else input.value = current.filter(s => s !== id).join(',');
                                                                }}
                                                            >
                                                                {p.id}: {p.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Root Folders (Click to toggle)</p>
                                                    <div className="flex flex-wrap gap-1">
                                                        {arrMeta.folders.map((f: any) => (
                                                            <Badge 
                                                                key={f.id} 
                                                                variant="outline" 
                                                                className="cursor-pointer hover:bg-primary/20 text-[10px] py-0 transition-colors"
                                                                onClick={() => {
                                                                    const input = document.getElementById("allowedRootFolderIds") as HTMLInputElement;
                                                                    if (!input) return;
                                                                    const current = input.value.split(',').map(s => s.trim()).filter(s => s);
                                                                    const id = f.id.toString();
                                                                    if (!current.includes(id)) input.value = current.length > 0 ? `${current.join(',')},${id}` : id;
                                                                    else input.value = current.filter(s => s !== id).join(',');
                                                                }}
                                                            >
                                                                {f.id}: {f.path}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <Button type="submit" size="sm" className="w-full h-9 font-semibold">{editingApp ? "Update App" : "Add Application"}</Button>
                                        {editingApp && (
                                            <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { setEditingApp(null); setArrMeta(null); }}>
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
                            <CardTitle className="flex items-center gap-2">🗺️ Roadmap & Feature Announcements</CardTitle>
                            <CardDescription>Update the Markdown roadmap text displayed on the main dashboard.</CardDescription>
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
                                <Button type="submit" className="font-semibold">Save Roadmap Text</Button>
                            </form>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* BETA DASHBOARD INTRO EDITOR */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Beta Dashboard Intro</CardTitle>
                                <CardDescription>This Markdown text appears on the main home dashboard.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form onSubmit={(e) => handleForm(e, updateBetaDashboardText)} className="space-y-4">
                                    <Textarea name="text" rows={6} defaultValue={betaText} required placeholder="### Interested in Beta Testing?..." />
                                    <Button type="submit" className="font-semibold">Save Intro Text</Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* BETA TESTING CARDS EDITOR */}
                        <Card>
                            <CardHeader>
                                <CardTitle>{editingBetaCard ? "Edit Beta Card" : "Beta Testing Cards"}</CardTitle>
                                <CardDescription>Manage the interactive service cards on `/beta`.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                {!editingBetaCard && (
                                    <div className="space-y-4 max-h-[300px] overflow-y-auto">
                                        {betaCards.map((card: any) => (
                                            <div key={card.id} className="flex items-start justify-between border p-3 rounded-xl bg-muted/20">
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
                                        <Input name="title" placeholder="Ex: Audiobookshelf Beta" defaultValue={editingBetaCard?.title} required />
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
                                        <Button type="submit" className="w-full font-semibold">{editingBetaCard ? "Update Beta Card" : "Add Beta Card"}</Button>
                                        {editingBetaCard && <Button type="button" variant="outline" onClick={() => setEditingBetaCard(null)}><X className="h-4 w-4"/></Button>}
                                    </div>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="logs">
                    <SystemLogsViewer />
                </TabsContent>
            </Tabs>
        </div>
    );
}