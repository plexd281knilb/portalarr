"use client";

import { BuildBadge } from "@/components/build-badge";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { logout, getSession } from "@/app/auth-actions";
import { 
  LayoutDashboard, 
  Settings, 
  Menu, 
  X, 
  LogOut, 
  LifeBuoy, 
  BookOpen, 
  User, 
  Terminal, 
  Film, 
  Tv, 
  Sparkles, 
  Trash2, 
  Tag, 
  Compass, 
  HelpCircle, 
  Activity, 
  Layers, 
  Bot,
  ChevronDown
} from "lucide-react";

interface SidebarNavContentProps {
  onItemClick?: () => void;
}

function SidebarNavContent({ onItemClick }: SidebarNavContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get("tab");
  const isLogsActive = pathname === "/settings" && currentTab === "logs";
  const isSettingsActive = pathname.startsWith("/settings") && pathname !== "/settings/profile" && !isLogsActive;
  const isCurationActive = pathname.startsWith("/curation");

  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [isTrial, setIsTrial] = useState(false);
  const [curationOpen, setCurationOpen] = useState(true);

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        const userRole = (session.role as string) || "";
        const userStatus = (session.status as string) || "";
        const trial = (userStatus === "TRIAL" || userRole === "TRIAL" || (session as any).isTrial === true) && userStatus !== "APPROVED" && userRole !== "ADMIN";
        setIsAdmin(userRole === "ADMIN");
        setIsSuperUser(userRole === "SUPER_USER" || userRole === "ADMIN");
        setIsTrial(trial);
      } else {
        setIsAdmin(false);
        setIsSuperUser(false);
        setIsTrial(false);
      }
    }).catch(() => {
      setIsAdmin(false);
      setIsSuperUser(false);
      setIsTrial(false);
    });
  }, [pathname]);

  useEffect(() => {
    if (isCurationActive) {
      setCurationOpen(true);
    }
  }, [isCurationActive]);

  const navItemClass = (isActive: boolean) =>
    cn(
      "w-full justify-start text-xs font-medium h-9 rounded-lg transition-colors border-l-2 group select-none",
      isActive
        ? "bg-primary/10 text-primary font-semibold border-primary rounded-l-none pl-2.5 shadow-none"
        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent pl-2.5"
    );

  const iconClass = (isActive: boolean) =>
    cn(
      "mr-2.5 h-4 w-4 shrink-0 transition-colors",
      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
    );

  return (
    <div>
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 px-2.5 mb-5 select-none">
        <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
          <BookOpen className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <h2 className="text-sm font-bold tracking-tight text-foreground truncate">
              DomsHomeLab
            </h2>
            <BuildBadge variant="compact" />
          </div>
          <p className="text-[11px] text-muted-foreground/70 truncate">d281knilb Media Server</p>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="space-y-1">
        <Link href="/" onClick={onItemClick}>
          <Button variant="ghost" className={navItemClass(pathname === "/")}>
            <LayoutDashboard className={iconClass(pathname === "/")} />
            <span className="truncate">Dashboard</span>
          </Button>
        </Link>

        <Link href="/discover" onClick={onItemClick}>
          <Button
            variant="ghost"
            className={navItemClass(pathname.startsWith("/discover") || pathname.startsWith("/requests"))}
          >
            <Compass className={iconClass(pathname.startsWith("/discover") || pathname.startsWith("/requests"))} />
            <span className="truncate">Media Requests</span>
          </Button>
        </Link>

        {!isTrial && (
          <Link href="/library" onClick={onItemClick}>
            <Button variant="ghost" className={navItemClass(pathname.startsWith("/library"))}>
              <BookOpen className={iconClass(pathname.startsWith("/library"))} />
              <span className="truncate">Book Library</span>
            </Button>
          </Link>
        )}

        <Link href="/guides" onClick={onItemClick}>
          <Button variant="ghost" className={navItemClass(pathname.startsWith("/guides"))}>
            <HelpCircle className={iconClass(pathname.startsWith("/guides"))} />
            <span className="truncate">Setup Guides</span>
          </Button>
        </Link>

        <Link 
          href="/?openAssistant=true"
          onClick={() => {
            onItemClick?.();
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("open-ai-assistant"));
            }
          }}
        >
          <Button
            variant="ghost"
            className="w-full justify-between text-xs font-medium h-9 rounded-lg transition-colors border-l-2 border-transparent pl-2.5 text-muted-foreground hover:text-foreground hover:bg-white/[0.05] group select-none"
          >
            <div className="flex items-center min-w-0">
              <Bot className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="truncate">AI Assistant</span>
            </div>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary/90 border border-primary/20 shrink-0">
              24/7 Fixes
            </span>
          </Button>
        </Link>

        <Link href="/tickets" onClick={onItemClick}>
          <Button
            variant="ghost"
            className={navItemClass(pathname.startsWith("/tickets") || pathname.startsWith("/admin/tickets"))}
          >
            <LifeBuoy className={iconClass(pathname.startsWith("/tickets") || pathname.startsWith("/admin/tickets"))} />
            <span className="truncate">Support Tickets</span>
          </Button>
        </Link>

        <Link href="/profile" onClick={onItemClick}>
          <Button
            variant="ghost"
            className={navItemClass(pathname === "/profile" || pathname === "/settings/profile")}
          >
            <User className={iconClass(pathname === "/profile" || pathname === "/settings/profile")} />
            <span className="truncate">Account Settings</span>
          </Button>
        </Link>
      </div>

      {/* Media Apps Section */}
      {(isAdmin || isSuperUser) && (
        <div className="pt-2">
          <div className="border-t border-border/30 pt-3 pb-1 mt-2 px-2.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60 select-none">
            Media Apps
          </div>
          <div className="space-y-1">
            <Link href="/radarr" onClick={onItemClick}>
              <Button variant="ghost" className={navItemClass(pathname.startsWith("/radarr"))}>
                <Film className={iconClass(pathname.startsWith("/radarr"))} />
                <span className="truncate">Radarr (Movies)</span>
              </Button>
            </Link>
            <Link href="/sonarr" onClick={onItemClick}>
              <Button variant="ghost" className={navItemClass(pathname.startsWith("/sonarr"))}>
                <Tv className={iconClass(pathname.startsWith("/sonarr"))} />
                <span className="truncate">Sonarr (TV Shows)</span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Administration Section */}
      {isAdmin && (
        <div className="pt-2">
          <div className="border-t border-border/30 pt-3 pb-1 mt-2 px-2.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60 select-none">
            Administration
          </div>
          <div className="space-y-1">
            <Link href="/admin/tautulli" onClick={onItemClick}>
              <Button
                variant="ghost"
                className={navItemClass(
                  pathname.startsWith("/admin/tautulli") || 
                  pathname.startsWith("/admin/streams") || 
                  pathname.startsWith("/tautulli") || 
                  pathname.startsWith("/streams")
                )}
              >
                <Activity className={iconClass(
                  pathname.startsWith("/admin/tautulli") || 
                  pathname.startsWith("/admin/streams") || 
                  pathname.startsWith("/tautulli") || 
                  pathname.startsWith("/streams")
                )} />
                <span className="truncate">Stream Intelligence</span>
              </Button>
            </Link>

            <Link href="/admin/monitoring" onClick={onItemClick}>
              <Button variant="ghost" className={navItemClass(pathname.startsWith("/admin/monitoring"))}>
                <Layers className={iconClass(pathname.startsWith("/admin/monitoring"))} />
                <span className="truncate">Fleet & Monitoring</span>
              </Button>
            </Link>

            <Link href="/admin/scripts" onClick={onItemClick}>
              <Button variant="ghost" className={navItemClass(pathname.startsWith("/admin/scripts"))}>
                <Terminal className={iconClass(pathname.startsWith("/admin/scripts"))} />
                <span className="truncate">User Scripts</span>
              </Button>
            </Link>

            {/* Curation Studios Group */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setCurationOpen(!curationOpen)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground/60 hover:text-foreground transition-colors group select-none rounded-md hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                  <span>Curation Studios</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/[0.04] text-muted-foreground/60 border border-white/[0.06]">
                    4
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground/60 transition-transform duration-200",
                      !curationOpen && "-rotate-90"
                    )}
                  />
                </div>
              </button>

              {curationOpen && (
                <div className="space-y-1 pl-2.5 ml-2.5 border-l border-border/20 mt-1">
                  <Link href="/curation/kometa" onClick={onItemClick}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-medium h-8 rounded-md transition-colors border group select-none",
                        pathname === "/curation" || pathname.startsWith("/curation/kometa")
                          ? "bg-primary/10 text-primary font-semibold border-primary/20 shadow-none"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent"
                      )}
                    >
                      <Sparkles className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0 transition-colors",
                        (pathname === "/curation" || pathname.startsWith("/curation/kometa")) ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      <span className="truncate">Kometa Overlays</span>
                    </Button>
                  </Link>

                  <Link href="/curation/agregarr" onClick={onItemClick}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-medium h-8 rounded-md transition-colors border group select-none",
                        pathname.startsWith("/curation/agregarr")
                          ? "bg-primary/10 text-primary font-semibold border-primary/20 shadow-none"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent"
                      )}
                    >
                      <Film className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0 transition-colors",
                        pathname.startsWith("/curation/agregarr") ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      <span className="truncate">Agregarr Hubs</span>
                    </Button>
                  </Link>

                  <Link href="/curation/prune" onClick={onItemClick}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-medium h-8 rounded-md transition-colors border group select-none",
                        pathname.startsWith("/curation/prune")
                          ? "bg-primary/10 text-primary font-semibold border-primary/20 shadow-none"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent"
                      )}
                    >
                      <Trash2 className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0 transition-colors",
                        pathname.startsWith("/curation/prune") ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      <span className="truncate">Maintainerr Prune</span>
                    </Button>
                  </Link>

                  <Link href="/curation/tagging" onClick={onItemClick}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-medium h-8 rounded-md transition-colors border group select-none",
                        pathname.startsWith("/curation/tagging")
                          ? "bg-primary/10 text-primary font-semibold border-primary/20 shadow-none"
                          : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent"
                      )}
                    >
                      <Tag className={cn(
                        "mr-2 h-3.5 w-3.5 shrink-0 transition-colors",
                        pathname.startsWith("/curation/tagging") ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )} />
                      <span className="truncate">Tagging Studio</span>
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Consolidated System Settings & Logs */}
            <div className="pt-1.5">
              <div className="flex items-center gap-1.5">
                <Link href="/settings" className="flex-1 min-w-0" onClick={onItemClick}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-xs font-medium h-9 rounded-lg transition-colors border-l-2 group select-none",
                      isSettingsActive
                        ? "bg-primary/10 text-primary font-semibold border-primary rounded-l-none pl-2.5 shadow-none"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent pl-2.5"
                    )}
                  >
                    <Settings className={cn(
                      "mr-2.5 h-4 w-4 shrink-0 transition-colors",
                      isSettingsActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    <span className="truncate">System Settings</span>
                  </Button>
                </Link>
                <Link href="/settings?tab=logs" title="Live System Logs" onClick={onItemClick}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-9 px-2.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 group border select-none",
                      isLogsActive
                        ? "bg-primary/10 text-primary font-semibold border-primary/20 shadow-none"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.05] border-transparent"
                    )}
                  >
                    <Terminal className={cn(
                      "h-3.5 w-3.5 transition-colors",
                      isLogsActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    )} />
                    <span>Logs</span>
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("h-full border-r bg-[#101014] text-sidebar-foreground border-border/40 flex flex-col justify-between select-none min-h-0", className)}>
      <div className="flex-1 overflow-y-auto py-4 px-3 min-h-0">
        <SidebarNavContent />
      </div>

      <div className="px-3 py-3 border-t border-border/30 mt-auto">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-xs font-medium h-9 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-lg group select-none"
          onClick={() => logout()}
        >
          <LogOut className="mr-2.5 h-4 w-4 text-muted-foreground group-hover:text-red-400 transition-colors" />
          <span>Log Out</span>
        </Button>
      </div>
    </div>
  );
}

export function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        className="md:hidden hover:bg-white/[0.05] rounded-lg text-muted-foreground hover:text-foreground"
      >
        <Menu className="h-6 w-6" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative flex w-68 max-w-xs flex-1 flex-col bg-[#101014] text-sidebar-foreground pb-4 pt-5 shadow-2xl transition-all duration-300 ease-in-out border-r border-border/50">
            <div className="absolute right-0 top-0 -mr-12 pt-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="hover:bg-white/10 rounded-full text-white"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>

            <div className="flex-1 px-3 pb-2 flex flex-col justify-between min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                <SidebarNavContent onItemClick={() => setIsOpen(false)} />
              </div>

              <div className="mt-auto border-t border-border/30 pt-3">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-xs font-medium h-9 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-lg group select-none"
                  onClick={() => {
                    setIsOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="mr-2.5 h-4 w-4 text-muted-foreground group-hover:text-red-400 transition-colors" />
                  <span>Log Out</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
