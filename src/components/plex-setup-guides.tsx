"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Tv, Tv2, Flame, Monitor, Smartphone, Globe, CheckCircle2, Sparkles, AlertCircle } from "lucide-react";
import { getPlexSetupGuides } from "@/app/actions";

export default function PlexSetupGuides() {
    const [isOpen, setIsOpen] = useState(false);
    const [guides, setGuides] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<string>("appletv");

    useEffect(() => {
        getPlexSetupGuides().then(g => {
            if (g && Array.isArray(g)) {
                setGuides(g);
                if (g.length > 0 && !activeTab) {
                    setActiveTab(g[0].id);
                }
            }
        }).catch(() => {});
    }, []);

    const getDeviceIcon = (id: string) => {
        switch (id) {
            case "appletv": return <Tv className="h-4 w-4 text-cyan-400" />;
            case "roku": return <Tv2 className="h-4 w-4 text-purple-400" />;
            case "firetv": return <Flame className="h-4 w-4 text-orange-400" />;
            case "smarttv": return <Monitor className="h-4 w-4 text-blue-400" />;
            case "googletv": return <Smartphone className="h-4 w-4 text-emerald-400" />;
            case "mobile": return <Smartphone className="h-4 w-4 text-pink-400" />;
            case "web": return <Globe className="h-4 w-4 text-amber-400" />;
            default: return <Tv className="h-4 w-4 text-primary" />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-semibold gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/10 transition-all active:scale-95 shadow-sm"
                >
                    <BookOpen className="h-3.5 w-3.5 text-primary" />
                    Setup Guides
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-4 border-b border-border/40">
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
                        <Sparkles className="h-5 w-5 text-primary" />
                        Plex Device Setup & Quality Optimization Guide
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Configure your devices for 100% Direct Play to eliminate buffering and stream in original studio quality.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Golden Rule Callout */}
                    <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wide">The #1 Rule for Zero Buffering:</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Most Plex apps default to a restricted <strong className="text-foreground">2 Mbps (720p)</strong> remote limit. Changing <strong className="text-foreground">Remote Video Quality</strong> to <strong className="text-foreground">"Maximum / Original"</strong> stops the server from transcoding and gives you crisp, original picture quality.
                            </p>
                        </div>
                    </div>

                    {guides.length > 0 && (
                        <Tabs defaultValue={activeTab} value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4">
                            <TabsList className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 h-auto p-1 bg-muted/30 border border-border/40 rounded-xl gap-1">
                                {guides.map(guide => (
                                    <TabsTrigger 
                                        key={guide.id} 
                                        value={guide.id} 
                                        className="flex items-center justify-center gap-1.5 py-2 px-1 text-[11px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg"
                                    >
                                        {getDeviceIcon(guide.id)}
                                        <span className="truncate">{guide.name.split(" ")[0]}</span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>

                            {guides.map(guide => (
                                <TabsContent key={guide.id} value={guide.id} className="space-y-4 animate-in fade-in-50 duration-200">
                                    <div className="flex items-center justify-between border-b border-border/40 pb-3">
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-foreground">{guide.name}</h3>
                                                {guide.badge && (
                                                    <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30">
                                                        {guide.badge}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">{guide.summary}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {guide.steps.map((step: any, idx: number) => (
                                            <div key={idx} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-primary/30 transition-colors space-y-1">
                                                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                    {step.title}
                                                </div>
                                                <p className="text-xs text-muted-foreground/90 pl-5.5 leading-relaxed">
                                                    {step.desc}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>
                            ))}
                        </Tabs>
                    )}
                </div>

                <div className="p-4 border-t border-border/40 bg-muted/10 flex justify-end">
                    <Button onClick={() => setIsOpen(false)} size="sm" className="font-semibold text-xs px-5">
                        Got It
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
