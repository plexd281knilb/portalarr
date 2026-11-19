"use client";

import { BuildBadge } from "@/components/build-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBuildTelemetry } from "@/lib/version";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
} from "lucide-react";

interface SidebarNavContentProps {
  onItemClick?: () => void;
  initialRole?: string;
  initialIsTrial?: boolean;
}

interface SidebarRoleProps {
  initialRole?: string;
  initialIsTrial?: boolean;
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

function SidebarNavContent({ onItemClick, initialRole, initialIsTrial }: SidebarNavContentProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams?.get("tab");
  const isLogsActive = pathname === "/settings" && (currentTab === "logs" || searchParams?.get("subtab") === "logs");
  const isSettingsActive = pathname.startsWith("/settings") && pathname !== "/settings/profile" && !isLogsActive;

  const [isAdmin, setIsAdmin] = useState(initialRole === "ADMIN");
  const [isSuperUser, setIsSuperUser] = useState(initialRole === "SUPER_USER" || initialRole === "ADMIN");
  const [isTrial, setIsTrial] = useState(Boolean(initialIsTrial) && initialRole !== "ADMIN");
  const lastSessionCheckRef = useRef<{ ts: number; hasSession: boolean }>({ ts: 0, hasSession: false });

  useEffect(() => {
    if (initialRole) {
      setIsAdmin(initialRole === "ADMIN");
      setIsSuperUser(initialRole === "SUPER_USER" || initialRole === "ADMIN");
      setIsTrial(Boolean(initialIsTrial) && initialRole !== "ADMIN");
    }
  }, [initialRole, initialIsTrial]);

  useEffect(() => {
    const isAuthBoundary = pathname === "/login" || pathname === "/pending" || pathname.startsWith("/join");
    const now = Date.now();
    if (!isAuthBoundary && lastSessionCheckRef.current.hasSession && now - lastSessionCheckRef.current.ts < 60000) {
      return;
    }
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled) return;
      if (session) {
        lastSessionCheckRef.current = { ts: Date.now(), hasSession: true };
        const userRole = (session.role as string) || "";
        const userStatus = (session.status as string) || "";
        const trial = (userStatus === "TRIAL" || userRole === "TRIAL" || (session as any).isTrial === true) && userStatus !== "APPROVED" && userRole !== "ADMIN";
        setIsAdmin(userRole === "ADMIN");
        setIsSuperUser(userRole === "SUPER_USER" || userRole === "ADMIN");
        setIsTrial(trial);
      } else {
        lastSessionCheckRef.current = { ts: Date.now(), hasSession: false };
        setIsAdmin(false);
        setIsSuperUser(false);
        setIsTrial(false);
      }
    }).catch(() => {
      if (cancelled) return;
      setIsAdmin(false);
      setIsSuperUser(false);
      setIsTrial(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);


  const telemetry = getBuildTelemetry();

  return (
    <div className="space-y-3">
      {/* Brand Header - Vertical Lockup so DomsHomeLab NEVER truncates */}
      <div className="flex items-center gap-3 px-1 py-1 pb-3 border-b border-border/40 select-none">
        <img
          src={telemetry.iconSvgPath}
          alt={`DomsHomeLab ${telemetry.iconKey.toUpperCase()}`}
          className="h-9 w-9 rounded-xl shrink-0 shadow-sm"
        />
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="font-bold text-base tracking-tight text-foreground whitespace-nowrap">
              DomsHomeLab
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <BuildBadge variant="compact" isAdmin={isAdmin} />
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
          iconColor="text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
          activeColorClass="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
          inactiveHoverClass="hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-200"
          onClick={onItemClick}
        />

        <NavItem
          href="/discover"
          label="Media Requests"
          icon={Compass}
          isActive={pathname.startsWith("/discover") || pathname.startsWith("/requests")}
          iconColor="text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300"
          activeColorClass="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
          inactiveHoverClass="hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
          onClick={onItemClick}
        />

        {!isTrial && (
          <NavItem
            href="/library"
            label="Book Library"
            icon={BookOpen}
            isActive={pathname.startsWith("/library")}
            iconColor="text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
            activeColorClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
            inactiveHoverClass="hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-200"
            onClick={onItemClick}
          />
        )}

        <NavItem
          href="/channels"
          label="Live TV & Channels"
          icon={Tv}
          isActive={pathname.startsWith("/channels")}
          iconColor="text-teal-600 dark:text-teal-400 group-hover:text-teal-700 dark:group-hover:text-teal-300"
          activeColorClass="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.2)]"
          inactiveHoverClass="hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-200"
          onClick={onItemClick}
        />

        <NavItem
          href="/guides"
          label="Setup Guides"
          icon={HelpCircle}
          isActive={pathname.startsWith("/guides")}
          iconColor="text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
          activeColorClass="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
          inactiveHoverClass="hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-200"
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
            <div className="w-full flex items-center justify-between p-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 hover:border-amber-500/55 hover:bg-amber-500/15 transition-colors text-amber-900 dark:text-amber-100 shadow-sm cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-md bg-amber-500/20 border border-amber-500/35 flex items-center justify-center shrink-0 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <Bot className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex flex-col text-left min-w-0">
                  <span className="text-xs font-semibold text-foreground tracking-tight leading-none group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                    AI Assistant
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium leading-tight mt-1 truncate">
                    24/7 Server Assistant
                  </span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
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
          iconColor="text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300"
          activeColorClass="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
          inactiveHoverClass="hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-200"
          onClick={onItemClick}
        />

        <NavItem
          href="/profile"
          label="Account Settings"
          icon={User}
          isActive={pathname === "/profile" || pathname === "/settings/profile"}
          iconColor="text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300"
          activeColorClass="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]"
          inactiveHoverClass="hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-200"
          onClick={onItemClick}
        />
      </div>

      {/* Media Apps Section */}
      {(isAdmin || isSuperUser) && (
        <div className="pt-1">
          <div className="border-t border-border/40 pt-3 pb-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground select-none">
            Media Apps
          </div>
          <div className="space-y-1">
            <NavItem
              href="/radarr"
              label="Radarr (Movies)"
              icon={Film}
              isActive={pathname.startsWith("/radarr")}
              iconColor="text-amber-600 dark:text-yellow-400 group-hover:text-amber-700 dark:group-hover:text-yellow-300"
              activeColorClass="bg-yellow-500/15 text-amber-800 dark:text-yellow-300 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]"
              inactiveHoverClass="hover:bg-yellow-500/10 hover:text-amber-800 dark:hover:text-yellow-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/sonarr"
              label="Sonarr (TV Shows)"
              icon={Tv}
              isActive={pathname.startsWith("/sonarr")}
              iconColor="text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
              activeColorClass="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
              inactiveHoverClass="hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-200"
              onClick={onItemClick}
            />
          </div>
        </div>
      )}

      {/* Curation Studios Section */}
      {isAdmin && (
        <div className="pt-1">
          <div className="border-t border-border/40 pt-3 pb-1.5 px-2.5 flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground select-none">
            <Sparkles className="h-3 w-3 text-amber-600 dark:text-amber-400" />
            <span>Curation Studios</span>
          </div>
          <div className="space-y-1">
            <NavItem
              href="/curation/kometa"
              label="Kometa Overlays"
              icon={Sparkles}
              isActive={pathname === "/curation" || pathname.startsWith("/curation/kometa")}
              iconColor="text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300"
              activeColorClass="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
              inactiveHoverClass="hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/curation/agregarr"
              label="Agregarr Hubs"
              icon={Film}
              isActive={pathname.startsWith("/curation/agregarr")}
              iconColor="text-sky-600 dark:text-sky-400 group-hover:text-sky-700 dark:group-hover:text-sky-300"
              activeColorClass="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.2)]"
              inactiveHoverClass="hover:bg-sky-500/10 hover:text-sky-700 dark:hover:text-sky-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/curation/prune"
              label="Maintainerr Prune"
              icon={Trash2}
              isActive={pathname.startsWith("/curation/prune")}
              iconColor="text-rose-600 dark:text-rose-400 group-hover:text-rose-700 dark:group-hover:text-rose-300"
              activeColorClass="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.2)]"
              inactiveHoverClass="hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/curation/tagging"
              label="Tagging Studio"
              icon={Tag}
              isActive={pathname.startsWith("/curation/tagging")}
              iconColor="text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300"
              activeColorClass="bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
              inactiveHoverClass="hover:bg-amber-500/10 hover:text-amber-800 dark:hover:text-amber-200"
              onClick={onItemClick}
            />
          </div>
        </div>
      )}

      {/* Administration Section */}
      {isAdmin && (
        <div className="pt-1">
          <div className="border-t border-border/40 pt-3 pb-1.5 px-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground select-none">
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
              iconColor="text-orange-600 dark:text-orange-400 group-hover:text-orange-700 dark:group-hover:text-orange-300"
              activeColorClass="bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]"
              inactiveHoverClass="hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/admin/monitoring"
              label="Fleet & Monitoring"
              icon={Layers}
              isActive={pathname.startsWith("/admin/monitoring")}
              iconColor="text-cyan-700 dark:text-cyan-400 group-hover:text-cyan-800 dark:group-hover:text-cyan-300"
              activeColorClass="bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
              inactiveHoverClass="hover:bg-cyan-500/10 hover:text-cyan-800 dark:hover:text-cyan-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/admin/scripts"
              label="User Scripts"
              icon={Terminal}
              isActive={pathname.startsWith("/admin/scripts")}
              iconColor="text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
              activeColorClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)]"
              inactiveHoverClass="hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-200"
              onClick={onItemClick}
            />

            <NavItem
              href="/admin/iptv"
              label="Live TV Hub"
              icon={Tv}
              isActive={pathname.startsWith("/admin/iptv")}
              iconColor="text-teal-600 dark:text-teal-400 group-hover:text-teal-700 dark:group-hover:text-teal-300"
              activeColorClass="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.2)]"
              inactiveHoverClass="hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-200"
              onClick={onItemClick}
            />

            {/* System Settings & Live System Logs */}
            <NavItem
              href="/settings"
              label="System Settings"
              icon={Settings}
              isActive={isSettingsActive}
              iconColor="text-muted-foreground group-hover:text-foreground"
              activeColorClass="bg-accent text-foreground border-foreground/40 shadow-sm"
              inactiveHoverClass="hover:bg-accent hover:text-foreground"
              onClick={onItemClick}
            />

            <NavItem
              href="/settings?tab=logs"
              label="Live System Logs"
              icon={Terminal}
              isActive={isLogsActive}
              iconColor="text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300"
              activeColorClass="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
              inactiveHoverClass="hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-200"
              onClick={onItemClick}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  className,
  initialRole,
  initialIsTrial,
}: React.HTMLAttributes<HTMLDivElement> & SidebarRoleProps) {
  return (
    <div className={cn("h-full border-r bg-sidebar text-sidebar-foreground border-border/60 flex flex-col justify-between select-none min-h-0", className)}>
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0 overscroll-y-contain scrollbar-thin">
        <SidebarNavContent initialRole={initialRole} initialIsTrial={initialIsTrial} />
      </div>

      <div className="px-3 py-3 border-t border-border/50 mt-auto space-y-1">
        <ThemeToggle variant="sidebar" />
        <Button 
          variant="ghost" 
          className="w-full justify-start text-xs font-semibold h-9 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-500/10 transition-colors rounded-lg group select-none"
          onClick={() => logout()}
        >
          <LogOut className="mr-2.5 h-4 w-4 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
          <span>Log Out</span>
        </Button>
      </div>
    </div>
  );
}

export function MobileSidebar({ initialRole, initialIsTrial }: SidebarRoleProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams?.toString() ?? "";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname, searchKey]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const drawer = isOpen ? (
    <div
      id="mobile-sidebar-drawer"
      className="fixed inset-0 z-[100] flex animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile Navigation"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative z-10 flex h-full w-72 max-w-[calc(100vw-3rem)] shrink-0 flex-col bg-sidebar text-sidebar-foreground pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl border-r border-border animate-in slide-in-from-left duration-200">
        <div className="flex items-center justify-end px-3 pb-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            aria-label="Close navigation menu"
            className="h-9 w-9 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground touch-manipulation"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 px-3 pb-2 flex flex-col justify-between min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto pr-1 min-h-0 overscroll-y-contain scrollbar-thin">
            <SidebarNavContent
              initialRole={initialRole}
              initialIsTrial={initialIsTrial}
              onItemClick={() => setIsOpen(false)}
            />
          </div>

          <div className="mt-auto border-t border-border/50 pt-3 space-y-1 shrink-0">
            <ThemeToggle variant="sidebar" />
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start text-xs font-semibold h-9 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-200 hover:bg-red-500/10 transition-colors rounded-lg group select-none"
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
            >
              <LogOut className="mr-2.5 h-4 w-4 text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 transition-colors" />
              <span>Log Out</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="mobile-sidebar-drawer"
        className="md:hidden shrink-0 hover:bg-accent rounded-lg text-muted-foreground hover:text-foreground touch-manipulation"
      >
        <Menu className="h-6 w-6" />
      </Button>

      {mounted && drawer ? createPortal(drawer, document.body) : null}
    </>
  );
}
