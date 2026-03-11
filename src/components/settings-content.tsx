"use client"

import { useState } from "react";
import { 
  saveSettings, 
  addTautulliInstance, 
  removeTautulliInstance,
  addGlancesInstance,
  removeGlancesInstance,
  saveJobSettings,
  addService,
  removeService,
  addMediaApp,
  removeMediaApp
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Trash2, Plus, Server, Clock, Mail, Activity, AppWindow, Layers } from "lucide-react";

export default function SettingsContent({ 
    settings, 
    initialInstances, 
    glancesInstances, 
    initialServices,
    initialMediaApps
}: any) {
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="space-y-4">
      
      {/* TAB NAVIGATION */}
      <div className="flex space-x-2 border-b pb-2 overflow-x-auto">
        <Button variant={activeTab === "general" ? "default" : "ghost"} onClick={() => setActiveTab("general")}>
            <Server className="mr-2 h-4 w-4" /> User Monitoring
        </Button>
        <Button variant={activeTab === "monitoring" ? "default" : "ghost"} onClick={() => setActiveTab("monitoring")}>
            <Activity className="mr-2 h-4 w-4" /> Hardware Monitoring
        </Button>
        <Button variant={activeTab === "apps" ? "default" : "ghost"} onClick={() => setActiveTab("apps")}>
            <Layers className="mr-2 h-4 w-4" /> Apps/Services
        </Button>
        <Button variant={activeTab === "services" ? "default" : "ghost"} onClick={() => setActiveTab("services")}>
            <AppWindow className="mr-2 h-4 w-4" /> Pings
        </Button>
        <Button variant={activeTab === "jobs" ? "default" : "ghost"} onClick={() => setActiveTab("jobs")}>
            <Clock className="mr-2 h-4 w-4" /> Jobs
        </Button>
        <Button variant={activeTab === "notifications" ? "default" : "ghost"} onClick={() => setActiveTab("notifications")} >
            <Mail className="mr-2 h-4 w-4" /> Email
        </Button>
      </div>

      {/* 1. PLEX TAB (RENAMED) */}
      {activeTab === "general" && (
        <Card>
            <CardHeader><CardTitle>User Monitoring</CardTitle></CardHeader> {/* <--- UPDATED LABEL */}
            <CardContent className="space-y-6">
                {initialInstances.map((instance: any) => (
                    <div key={instance.id} className="flex items-center justify-between border p-3 rounded-md">
                        <div><div className="font-semibold">{instance.name}</div><div className="text-xs">{instance.url}</div></div>
                        <Button variant="ghost" size="icon" onClick={() => removeTautulliInstance(instance.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                ))}
                <form action={addTautulliInstance} className="grid gap-4 md:grid-cols-3 items-end border-t pt-4">
                    <div><Label>Plex Server Name</Label><Input name="name" placeholder="Plex Home" required /></div>
                    <div><Label>Tautulli URL</Label><Input name="url" placeholder="http://192.168.1.50:8181" required /></div>
                    <div><Label>Tautulli API Key</Label><Input name="apiKey" type="password" required /></div>
                    <Button type="submit">Add Tautulli</Button>
                </form>
            </CardContent>
        </Card>
      )}

      {/* 2. HARDWARE TAB */}
      {activeTab === "monitoring" && (
        <Card>
            <CardHeader><CardTitle>Hardware (Glances)</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                {glancesInstances.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between border p-3 rounded-md">
                        <div><div className="font-semibold">{g.name}</div><div className="text-xs">{g.url}</div></div>
                        <Button variant="ghost" size="icon" onClick={() => removeGlancesInstance(g.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                ))}
                <form action={addGlancesInstance} className="grid gap-4 md:grid-cols-2 items-end border-t pt-4">
                    <div><Label>Name</Label><Input name="name" placeholder="Unraid" required /></div>
                    <div><Label>URL</Label><Input name="url" placeholder="http://192.168.1.50:61208" required /></div>
                    <Button type="submit">Add Node</Button>
                </form>
            </CardContent>
        </Card>
      )}

      {/* 3. APPS TAB */}
      {activeTab === "apps" && (
        <Card>
            <CardHeader>
            <CardTitle>Media Applications</CardTitle>
            <CardDescription>Connect Radarr, Sonarr, Sabnzbd, etc.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    {(!initialMediaApps || initialMediaApps.length === 0) ? (
                        <div className="text-sm text-muted-foreground italic">No apps connected.</div>
                    ) : (
                        initialMediaApps.map((app: any) => (
                            <div key={app.id} className="flex items-center justify-between border p-3 rounded-md">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 text-primary px-2 py-1 rounded text-xs uppercase font-bold w-20 text-center">
                                        {app.type}
                                    </div>
                                    <div>
                                        <div className="font-semibold">{app.name}</div>
                                        <div className="text-xs text-muted-foreground">{app.url}</div>
                                    </div>
                                </div>
                                <Button variant="ghost" size="icon" onClick={() => removeMediaApp(app.id)}>
                                    <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                            </div>
                        ))
                    )}
                </div>
                <Separator />
                <div className="space-y-4">
                    <h3 className="text-sm font-medium">Add New App</h3>
                    <form action={addMediaApp} className="grid gap-4 md:grid-cols-4 items-end">
                        <div className="space-y-2">
                            <Label>App Type</Label>
                            <Select name="type" required>
                                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sabnzbd">Sabnzbd</SelectItem>
                                    <SelectItem value="nzbget">NZBGet</SelectItem>
                                    <SelectItem value="sonarr">Sonarr (TV)</SelectItem>
                                    <SelectItem value="radarr">Radarr (Movies)</SelectItem>
                                    <SelectItem value="lidarr">Lidarr (Music)</SelectItem>
                                    <SelectItem value="readarr">Readarr (Books)</SelectItem>
                                    <SelectItem value="bazarr">Bazarr (Subtitles)</SelectItem>
                                    <SelectItem value="prowlarr">Prowlarr (Indexers)</SelectItem>
                                    <SelectItem value="overseerr">Overseerr (Requests)</SelectItem>
                                    <SelectItem value="jellyseerr">Jellyseerr (Requests)</SelectItem>
                                    <SelectItem value="ombi">Ombi (Requests)</SelectItem>
                                    <SelectItem value="maintainerr">Maintainerr (Cleanup)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input name="name" placeholder="Ex: 4K Radarr" required />
                        </div>
                        <div className="space-y-2">
                            <Label>URL</Label>
                            <Input name="url" placeholder="http://192.168.1.50:7878" required />
                        </div>
                        <div className="space-y-2">
                            <Label>API Key</Label>
                            <Input name="apiKey" type="password" required />
                        </div>
                        <div className="md:col-span-4 flex justify-end">
                            <Button type="submit"><Plus className="mr-2 h-4 w-4" /> Add Application</Button>
                        </div>
                    </form>
                </div>
            </CardContent>
        </Card>
      )}

      {/* 4. SERVICES TAB */}
      {activeTab === "services" && (
        <Card>
            <CardHeader><CardTitle>Simple Service Pings</CardTitle></CardHeader>
            <CardContent className="space-y-6">
                {initialServices.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between border p-3 rounded-md">
                        <div><div className="font-semibold">{s.name}</div><div className="text-xs">{s.url}</div></div>
                        <Button variant="ghost" size="icon" onClick={() => removeService(s.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                ))}
                <form action={addService} className="grid gap-4 md:grid-cols-2 items-end border-t pt-4">
                    <div><Label>Name</Label><Input name="name" placeholder="Web Server" required /></div>
                    <div><Label>URL</Label><Input name="url" placeholder="http://google.com" required /></div>
                    <Button type="submit">Add Ping</Button>
                </form>
            </CardContent>
        </Card>
      )}

      {/* 5. JOBS TAB */}
      {activeTab === "jobs" && (
        <Card>
            <CardHeader><CardTitle>Background Jobs</CardTitle></CardHeader>
            <CardContent>
            <form action={saveJobSettings} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                    <div><Label>Sync Interval (Hours)</Label><Input name="autoSyncInterval" type="number" defaultValue={settings.autoSyncInterval} /></div>
                </div>
                <Button type="submit">Save</Button>
            </form>
            </CardContent>
        </Card>
      )}

      {/* 6. NOTIFICATIONS TAB */}
      {activeTab === "notifications" && (
        <Card>
            <CardHeader><CardTitle>Email Settings</CardTitle></CardHeader>
            <CardContent>
            <form action={saveSettings} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div><Label>Host</Label><Input name="smtpHost" defaultValue={settings.smtpHost || "smtp.gmail.com"} /></div>
                    <div><Label>Port</Label><Input name="smtpPort" defaultValue={settings.smtpPort || "587"} /></div>
                    <div><Label>User</Label><Input name="smtpUser" defaultValue={settings.smtpUser || "user@gmail.com"} /></div>
                    <div><Label>Pass</Label><Input name="smtpPass" type="password" defaultValue={settings.smtpPass || ""} /></div>
                </div>
                <Button type="submit">Save SMTP</Button>
            </form>
            </CardContent>
        </Card>
      )}

    </div>
  );
}