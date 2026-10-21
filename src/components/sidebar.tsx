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

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  iconColor: string;
  activeColorClass: string;
  inactiveHoverClass: string;
  onClick?: () => void;
}

function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  iconColor,
  activeColorClass,
  inactiveHoverClass,
  onClick
}: NavItemProps) {
  return (
    <Link href={href} onClick={onClick} className="block w-full">
      <Button
        variant="ghost"
        className={cn(
          "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-150 border-l-2 group select-none",
          isActive
            ? cn("rounded-l-none pl-2.5 font-bold shadow-sm", activeColorClass)
            : cn("text-muted-foreground hover:text-foreground border-transparent pl-2.5", inactiveHoverClass)
        )}
      >
        <Icon className={cn("mr-2.5 h-4 w-4 shrink-0 transition-colors", isActive ? "" : iconColor)} />
        <span className="truncate">{label}</span>
      </Button>
    </Link>
  );
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

  return (
    <div className="space-y-3">
      {/* Brand Header - Vertical Lockup so DomsHomeLab NEVER truncates */}
      <div className="flex items-center gap-3 px-1 py-1 pb-3 border-b border-border/40 select-none">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 via-purple-500/20 to-blue-500/20 border border-primary/30 flex items-center justify-center shrink-0 shadow-sm">
          <BookOpen className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-base tracking-tight text-foreground whitespace-nowrap">
              DomsHomeLab
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <BuildBadge variant="compact" />
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="space-y-1">
        <NavItem
          href="/"
          label="Dashboard"
          icon={LayoutDashboard}
          isActive={pathname === "/"}
          iconColor="text-indigo-400 group-hover:text-indigo-300"
          activeColorClass="bg-indigo-500/15 text-indigo-300 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]"
          inactiveHoverClass="hover:bg-indigo-950/25 hover:text-indigo-200"
          onClick={onItemClick}
        />

        <NavItem
          href="/discover"
          label="Media Requests"
          icon={Compass}
          isActive={pathname.startsWith("/discover") || pathname.startsWith("/requests")}
          iconColor="text-rose-400 group-hover:text-rose-300"
          activeColorClass="bg-rose-500/15 text-rose-300 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
          inactiveHoverClass="hover:bg-rose-950/25 hover:text-rose-200"
          onClick={onItemClick}
        />

        {!isTrial && (
          <NavItem
            href="/library"
            label="Book Library"
            icon={BookOpen}
            isActive={pathname.startsWith("/library")}
            iconColor="text-emerald-400 group-hover:text-emerald-300"
            activeColorClass="bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
            inactiveHoverClass="hover:bg-emerald-950/25 hover:text-emerald-200"
            onClick={onItemClick}
          />
        )}

        <NavItem
          href="/guides"
          label="Setup Guides"
          icon={HelpCircle}
          isActive={pathname.startsWith("/guides")}
          iconColor="text-sky-400 group-hover:text-sky-300"
          activeColorClass="bg-sky-500/15 text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
          inactiveHoverClass="hover:bg-sky-950/25 hover:text-sky-200"
          onClick={onItemClick}
        />

        {/* AI Assistant Premium Card - Perfectly Centered & Balanced */}
        <div className="py-1">
          <Link 
            href="/?openAssistant=true"
            onClick={() => {
              onItemClick?.();
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("open-ai-assistant"));
              }
            }}
            className="block w-full group select-none"
          >
            <div className="w-full flex items-center justify-between p-2.5 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-purple-500/10 to-indigo-500/15 hover:border-purple-500/50 hover:bg-purple-500/20 transition-all text-purple-200 shadow-sm cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-lg bg-purple-500/25 border border-purple-500/40 flex items-center justify-center shrink-0 text-purple-300 group-hover:scale-105 transition-transform">
                  <Bot className="h-4 w-4 text-purple-300" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs font-semibold text-purple-100 tracking-tight leading-none group-hover:text-white transition-colors">
                    AI Assistant
                  </span>
                  <span className="text-[10px] text-purple-300/70 font-medium leading-tight mt-1 truncate">
                    24/7 Homelab AI
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/25 text-purple-200 border border-purple-500/40 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                Fixes
              </span>
            </div>
          </Link>
        </div>

        <NavItem
          href="/tickets"
          label="Support Tickets"
          icon={LifeBuoy}
          isActive={pathname.startsWith("/tickets") || pathname.startsWith("/admin/tickets")}
          iconColor="text-amber-400 group-hover:text-amber-300"
          activeColorClass="bg-amber-500/15 text-amber-300 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
          inactiveHoverClass="hover:bg-amber-950/25 hover:text-amber-200"
          onClick={onItemClick}
        />

        <NavItem
          href="/profile"
          label="Account Settings"
          icon={User}
          isActive={pathname === "/profile" || pathname === "/settings/profile"}
          iconColor="text-blue-400 group-hover:text-blue-300"
          activeColorClass="bg-blue-500/15 text-blue-300 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
          inactiveHoverClass="hover:bg-blue-950/25 hover:text-blue-200"
          onClick={onItemClick}
        />
      </div>

      {/* Media Apps Section */}
      {(isAdmin || isSuperUser) && (
        <div className="pt-1">
          <div className="border-t border-border/30 pt-3 pb-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 select-none">
            Media Apps
          </div>
          <div className="space-y-1">
            <NavItem
              href="/radarr"
              label="Radarr (Movies)"
              icon={Film}
              isActive={pathname.startsWith("/radarr")}
              iconColor="text-yellow-400 group-hover:text-yellow-300"
              activeColorClass="bg-yellow-500/15 text-yellow-300 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]"
              inactiveHoverClass="hover:bg-yellow-950/25 hover:text-yellow-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/sonarr"
              label="Sonarr (TV Shows)"
              icon={Tv}
              isActive={pathname.startsWith("/sonarr")}
              iconColor="text-sky-400 group-hover:text-sky-300"
              activeColorClass="bg-sky-500/15 text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
              inactiveHoverClass="hover:bg-sky-950/25 hover:text-sky-200"
              onClick={onItemClick}
            />
          </div>
        </div>
      )}

      {/* Administration Section */}
      {isAdmin && (
        <div className="pt-1">
          <div className="border-t border-border/30 pt-3 pb-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 select-none">
            Administration
          </div>
          <div className="space-y-1">
            <NavItem
              href="/admin/tautulli"
              label="Stream Intelligence"
              icon={Activity}
              isActive={
                pathname.startsWith("/admin/tautulli") || 
                pathname.startsWith("/admin/streams") || 
                pathname.startsWith("/tautulli") || 
                pathname.startsWith("/streams")
              }
              iconColor="text-orange-400 group-hover:text-orange-300"
              activeColorClass="bg-orange-500/15 text-orange-300 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]"
              inactiveHoverClass="hover:bg-orange-950/25 hover:text-orange-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/admin/monitoring"
              label="Fleet & Monitoring"
              icon={Layers}
              isActive={pathname.startsWith("/admin/monitoring")}
              iconColor="text-cyan-400 group-hover:text-cyan-300"
              activeColorClass="bg-cyan-500/15 text-cyan-300 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
              inactiveHoverClass="hover:bg-cyan-950/25 hover:text-cyan-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/admin/scripts"
              label="User Scripts"
              icon={Terminal}
              isActive={pathname.startsWith("/admin/scripts")}
              iconColor="text-emerald-400 group-hover:text-emerald-300"
              activeColorClass="bg-emerald-500/15 text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
              inactiveHoverClass="hover:bg-emerald-950/25 hover:text-emerald-200"
              onClick={onItemClick}
            />

            {/* Curation Studios Group */}
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setCurationOpen(!curationOpen)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 hover:text-foreground transition-colors group select-none rounded-md hover:bg-white/[0.04]"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-purple-400 group-hover:text-purple-300 transition-colors" />
                  <span className="text-purple-300/90 group-hover:text-purple-200">Curation Studios</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    4
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground/70 transition-transform duration-200",
                      !curationOpen && "-rotate-90"
                    )}
                  />
                </div>
              </button>

              {curationOpen && (
                <div className="space-y-1 pl-2.5 ml-2.5 border-l border-purple-500/20 mt-1">
                  <Link href="/curation/kometa" onClick={onItemClick} className="block w-full">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-8 rounded-md transition-all duration-150 border group select-none",
                        (pathname === "/curation" || pathname.startsWith("/curation/kometa"))
                          ? "bg-violet-500/15 text-violet-300 border-violet-500/40 font-bold shadow-[0_0_8px_rgba(139,92,246,0.15)]"
                          : "text-violet-400/80 hover:text-violet-200 hover:bg-violet-950/25 border-transparent"
                      )}
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5 text-violet-400 group-hover:text-violet-300 shrink-0" />
                      <span className="truncate">Kometa Overlays</span>
                    </Button>
                  </Link>

                  <Link href="/curation/agregarr" onClick={onItemClick} className="block w-full">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-8 rounded-md transition-all duration-150 border group select-none",
                        pathname.startsWith("/curation/agregarr")
                          ? "bg-pink-500/15 text-pink-300 border-pink-500/40 font-bold shadow-[0_0_8px_rgba(236,72,153,0.15)]"
                          : "text-pink-400/80 hover:text-pink-200 hover:bg-pink-950/25 border-transparent"
                      )}
                    >
                      <Film className="mr-2 h-3.5 w-3.5 text-pink-400 group-hover:text-pink-300 shrink-0" />
                      <span className="truncate">Agregarr Hubs</span>
                    </Button>
                  </Link>

                  <Link href="/curation/prune" onClick={onItemClick} className="block w-full">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-8 rounded-md transition-all duration-150 border group select-none",
                        pathname.startsWith("/curation/prune")
                          ? "bg-rose-500/15 text-rose-300 border-rose-500/40 font-bold shadow-[0_0_8px_rgba(244,63,94,0.15)]"
                          : "text-rose-400/80 hover:text-rose-200 hover:bg-rose-950/25 border-transparent"
                      )}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5 text-rose-400 group-hover:text-rose-300 shrink-0" />
                      <span className="truncate">Maintainerr Prune</span>
                    </Button>
                  </Link>

                  <Link href="/curation/tagging" onClick={onItemClick} className="block w-full">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-8 rounded-md transition-all duration-150 border group select-none",
                        pathname.startsWith("/curation/tagging")
                          ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-bold shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                          : "text-amber-400/80 hover:text-amber-200 hover:bg-amber-950/25 border-transparent"
                      )}
                    >
                      <Tag className="mr-2 h-3.5 w-3.5 text-amber-400 group-hover:text-amber-300 shrink-0" />
                      <span className="truncate">Tagging Studio</span>
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Consolidated System Settings & Logs */}
            <div className="pt-2">
              <div className="flex items-center gap-1.5">
                <Link href="/settings" className="flex-1 min-w-0" onClick={onItemClick}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-150 border-l-2 group select-none",
                      isSettingsActive
                        ? "bg-zinc-500/15 text-zinc-200 border-zinc-400 rounded-l-none pl-2.5 font-bold shadow-[0_0_10px_rgba(161,161,170,0.15)]"
                        : "text-muted-foreground hover:text-zinc-200 hover:bg-zinc-800/30 border-transparent pl-2.5"
                    )}
                  >
                    <Settings className={cn(
                      "mr-2.5 h-4 w-4 shrink-0 transition-colors",
                      isSettingsActive ? "text-zinc-200" : "text-zinc-400 group-hover:text-zinc-200"
                    )} />
                    <span className="truncate">System Settings</span>
                  </Button>
                </Link>
                <Link href="/settings?tab=logs" title="Live System Logs" onClick={onItemClick}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-9 px-2.5 text-xs font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 shrink-0 group border select-none",
                      isLogsActive
                        ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 font-bold shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                        : "text-emerald-400/80 hover:text-emerald-200 hover:bg-emerald-950/25 border-transparent"
                    )}
                  >
                    <Terminal className={cn(
                      "h-3.5 w-3.5 transition-colors",
                      isLogsActive ? "text-emerald-300" : "text-emerald-400 group-hover:text-emerald-200"
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
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        <SidebarNavContent />
      </div>

      <div className="px-3 py-3 border-t border-border/30 mt-auto">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-xs font-semibold h-9 text-red-400 hover:text-red-200 hover:bg-red-500/15 transition-colors rounded-lg group select-none"
          onClick={() => logout()}
        >
          <LogOut className="mr-2.5 h-4 w-4 text-red-400 group-hover:text-red-300 transition-colors" />
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
          <div className="relative flex w-72 max-w-xs flex-1 flex-col bg-[#101014] text-sidebar-foreground pb-4 pt-3 shadow-2xl transition-all duration-300 ease-in-out border-r border-border/50">
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
                  className="w-full justify-start text-xs font-semibold h-9 text-red-400 hover:text-red-200 hover:bg-red-500/15 transition-colors rounded-lg group select-none"
                  onClick={() => {
                    setIsOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="mr-2.5 h-4 w-4 text-red-400 group-hover:text-red-300 transition-colors" />
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
