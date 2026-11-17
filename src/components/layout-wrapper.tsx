"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut, LogIn, Settings, LayoutDashboard, Server, BookOpen, User, HelpCircle } from "lucide-react";
import { logout, getSession, getCurrentUser } from "@/app/auth-actions";
import { checkUserLibraryAccess } from "@/app/actions";
import { isStaleDeploymentError, triggerDeploymentRecoveryReload } from "@/lib/client-recovery";
import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ImpersonationBanner from "@/components/impersonation-banner";
import FloatingAiLauncher from "@/components/floating-ai-launcher";
import FloatingSuggestFixLauncher from "@/components/floating-suggest-fix-launcher";
import { BuildBadge } from "@/components/build-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { getBuildTelemetry } from "@/lib/version";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasLibraryAccess, setHasLibraryAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [isTrial, setIsTrial] = useState(false);
  const [userRole, setUserRole] = useState("USER");
  const lastAuthCheckRef = useRef<{ ts: number; hasSession: boolean }>({ ts: 0, hasSession: false });
  const lastPrewarmTriggerRef = useRef<number>(0);

  // Global stale deployment / Server Action mismatch & ChunkLoad recovery across ALL routes
  useEffect(() => {
    const handleGlobalError = (event: PromiseRejectionEvent | ErrorEvent) => {
      const reason =
        (event as PromiseRejectionEvent).reason ||
        (event as ErrorEvent).error ||
        (event as ErrorEvent).message;
      if (isStaleDeploymentError(reason)) {
        console.warn("[PORTALARR] Stale build session detected across deployment. Auto-refreshing tab...");
        triggerDeploymentRecoveryReload();
      }
    };

    window.addEventListener("unhandledrejection", handleGlobalError);
    window.addEventListener("error", handleGlobalError);
    return () => {
      window.removeEventListener("unhandledrejection", handleGlobalError);
      window.removeEventListener("error", handleGlobalError);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let prewarmTimer: ReturnType<typeof setTimeout> | undefined;
    const isAuthBoundary = pathname === "/login" || pathname.startsWith("/pending") || pathname.startsWith("/join");
    const now = Date.now();

    async function checkAccess() {
      // Skip redundant layout Server Actions during fast internal page switches
      if (!isAuthBoundary && lastAuthCheckRef.current.hasSession && now - lastAuthCheckRef.current.ts < 60000) {
        return;
      }
      try {
        const [user, session] = await Promise.all([
          getCurrentUser().catch((err) => {
            if (isStaleDeploymentError(err)) triggerDeploymentRecoveryReload();
            return null;
          }),
          getSession().catch((err) => {
            if (isStaleDeploymentError(err)) triggerDeploymentRecoveryReload();
            return null;
          }),
        ]);
        if (cancelled) return;

        if (user && (user.status === "EXPIRED" || user.status === "PENDING" || user.status === "REJECTED" || user.status === "SUSPENDED")) {
          if (!pathname.startsWith("/pending") && pathname !== "/login" && !pathname.startsWith("/join")) {
            window.location.href = "/pending";
            return;
          }
        }

        if (session) {
          lastAuthCheckRef.current = { ts: Date.now(), hasSession: true };
          setIsLoggedIn(true);
          const isAdm = session.role === "ADMIN";
          setIsAdmin(isAdm);
          const role = (user?.role || session.role || "USER") as string;
          setUserRole(role);
          const isTr = (user?.status === "TRIAL" || user?.membershipTier === "TRIAL" || (session as any).isTrial === true) && user?.status !== "APPROVED" && role !== "ADMIN";
          setIsTrial(isTr);
          setUsername((session.username as string) || (user?.username as string) || "");

          // Defer prewarming outside the route-navigation critical path so page loaders run first
          if (Date.now() - lastPrewarmTriggerRef.current > 3 * 60 * 1000) {
            prewarmTimer = setTimeout(() => {
              if (cancelled) return;
              lastPrewarmTriggerRef.current = Date.now();
              import("@/app/actions").then((m) => m.prewarmUserSessionAction?.()).catch(() => {});
            }, 2500);
          }

          if (isAdm) {
            setHasLibraryAccess(true);
          } else {
            const hasAcc = await checkUserLibraryAccess().catch(() => false);
            if (!cancelled) setHasLibraryAccess(hasAcc);
          }
        } else {
          lastAuthCheckRef.current = { ts: Date.now(), hasSession: false };
          setIsLoggedIn(false);
          setIsAdmin(false);
          setIsTrial(false);
          setUserRole("USER");
          setUsername("");
          setHasLibraryAccess(false);
        }
      } catch (e) {
        if (isStaleDeploymentError(e)) {
          triggerDeploymentRecoveryReload();
          return;
        }
        console.error("Failed to check layout library access:", e);
      }
    }
    checkAccess();

    return () => {
      cancelled = true;
      if (prewarmTimer !== undefined) clearTimeout(prewarmTimer);
    };
  }, [pathname]);
  
  const isPublicRoute = pathname === "/login" || pathname === "/join" || pathname.startsWith("/join/") || pathname === "/pending";

  const getMobileTitle = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/discover")) return "Media Requests";
    if (pathname.startsWith("/requests")) return "Media Requests";
    if (pathname.startsWith("/library")) return "Book Library";
    if (pathname.startsWith("/radarr")) return "Radarr (Movies)";
    if (pathname.startsWith("/sonarr")) return "Sonarr (TV Shows)";
    if (pathname.startsWith("/admin/tautulli") || pathname.startsWith("/admin/streams") || pathname.startsWith("/tautulli") || pathname.startsWith("/streams")) return "Stream Intelligence";
    if (pathname.startsWith("/curation/kometa")) return "Kometa Overlays";
    if (pathname.startsWith("/curation/agregarr")) return "Agregarr Hubs";
    if (pathname.startsWith("/curation/prune")) return "Maintainerr Prune";
    if (pathname.startsWith("/curation/tagging")) return "Tagging Studio";
    if (pathname.startsWith("/curation")) return "Curation Studio";
    if (pathname.startsWith("/tickets") || pathname.startsWith("/admin/tickets")) return "Support Tickets";
    if (pathname.startsWith("/admin/scripts")) return "User Scripts & Automation";
    if (pathname.startsWith("/admin/monitoring")) return "Fleet & System Monitoring";
    if (pathname.startsWith("/profile") || pathname.startsWith("/settings/profile")) return "Account Settings";
    if (pathname.startsWith("/settings/access")) return "Access Control";
    if (pathname.startsWith("/settings")) return "System Settings";
    if (pathname.startsWith("/guides")) return "Setup Guides";
    if (pathname.startsWith("/beta")) return "Beta Portal";
    return "DomsHomeLab";
  };

  if (isPublicRoute) {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col bg-background">
        <ImpersonationBanner />
        {/* --- GLOBAL USER HEADER --- */}
        {pathname !== "/login" && !pathname.startsWith("/join") && (
          <header className="flex items-center justify-between px-3 sm:px-6 h-14 sm:h-16 border-b bg-muted/20 shrink-0">
            <div className="flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <img
                    src={getBuildTelemetry().iconSvgPath}
                    alt="DomsHomeLab"
                    className="h-6 w-6 sm:h-7 sm:w-7 rounded-lg shrink-0"
                  />
                  <span className="font-bold text-lg sm:text-xl tracking-tight">DomsHomeLab</span>
              </Link>
              <BuildBadge variant="compact" isAdmin={isAdmin} />
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-3">
                {isLoggedIn ? (
                  <>
                    {hasLibraryAccess && (
                        <Button asChild variant="ghost" size="sm" className="flex gap-2 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                            <Link href="/library" title="Book Library">
                                <BookOpen className="h-4 w-4 shrink-0" /> 
                                <span className="hidden sm:inline font-semibold">Book Library</span>
                            </Link>
                        </Button>
                    )}

                    <Button asChild variant="ghost" size="sm" className={`flex gap-2 text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 hover:bg-sky-500/10 hover:ring-2 hover:ring-sky-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${pathname.startsWith("/guides") ? "bg-sky-500/15 ring-1 ring-sky-500/40 font-bold" : ""}`}>
                        <Link href="/guides" title="Plex Device Setup Guides">
                            <HelpCircle className="h-4 w-4 shrink-0" /> 
                            <span className="hidden md:inline font-semibold">Guides</span>
                        </Link>
                    </Button>

                    {/* Account Settings Button */}
                    <Button asChild variant="ghost" size="sm" className={`flex gap-2 text-blue-700 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3 ${pathname.startsWith("/profile") || pathname.startsWith("/settings/profile") ? "bg-blue-500/15 ring-1 ring-blue-500/40 font-bold" : ""}`}>
                        <Link href="/profile" title="Account & Password Settings">
                            <User className="h-4 w-4 shrink-0" /> 
                            <span className="hidden sm:inline font-semibold">Account</span>
                        </Link>
                    </Button>

                    {/* System Settings Button - Visible for Admins */}
                    {isAdmin && (
                        <Button asChild variant="ghost" size="sm" className="flex gap-2 text-primary hover:text-primary hover:bg-primary/10 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                            <Link href="/settings" title="System Settings">
                                <Settings className="h-4 w-4 shrink-0" /> 
                                <span className="hidden sm:inline font-semibold">Settings</span>
                            </Link>
                        </Button>
                    )}

                    <ThemeToggle variant="compact" />
                    <button 
                      onClick={() => logout()} 
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 hover:ring-2 hover:ring-red-500/40 px-2 sm:px-3 py-1.5 rounded-lg active:scale-95 transition-all ml-0.5 sm:ml-1 cursor-pointer h-8 sm:h-9"
                      title="Sign Out"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" /> 
                      <span className="hidden sm:inline">Sign Out</span>
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <ThemeToggle variant="compact" />
                    <Button asChild size="sm" className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-sm text-xs sm:text-sm h-8 sm:h-9">
                      <Link href="/login">
                        <LogIn className="h-4 w-4 shrink-0" />
                        <span>Sign In</span>
                      </Link>
                    </Button>
                  </div>
                )}
            </div>
          </header>
        )}
        {/* ----------------------- */}

        <main className="flex-1 overflow-y-auto w-full min-w-0">
          <div className="w-full max-w-[2560px] mx-auto min-w-0">
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground">
      <ImpersonationBanner />
      
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Desktop Sidebar (Admins / Authenticated) */}
        <div className="w-56 lg:w-64 flex-none hidden md:block h-full min-h-0">
          <Suspense fallback={<div className="w-full h-full bg-sidebar" />}>
            <Sidebar />
          </Suspense>
        </div>
        
        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* Mobile Header */}
          <div className="md:hidden border-b border-border bg-background/95 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2 shrink-0">
             <div className="flex items-center gap-2 min-w-0">
                <Suspense fallback={<div className="w-9 h-9" />}>
                  <MobileSidebar />
                </Suspense>
                <img
                  src={getBuildTelemetry().iconSvgPath}
                  alt="DomsHomeLab"
                  className="h-6 w-6 rounded-md shrink-0"
                />
                <span className="font-bold text-base sm:text-lg truncate">{getMobileTitle()}</span>
                <BuildBadge variant="compact" isAdmin={isAdmin} />
             </div>
             <div className="flex items-center gap-1 shrink-0">
                <ThemeToggle variant="compact" />
                <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded bg-muted/50 touch-manipulation">
                  <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden sm:inline">Home</span>
                </Link>
             </div>
          </div>

          {/* Scrollable Page Content */}
          <main className="flex-1 overflow-y-auto overscroll-y-contain p-2.5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-4 md:p-6 md:pb-8 lg:p-8 3xl:p-10 w-full min-w-0">
            <div className="w-full max-w-[2560px] mx-auto min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Floating 24/7 AI Assistant Launcher */}
      {isLoggedIn && <FloatingAiLauncher />}

      {/* Floating Suggest a Fix Launcher (Full Members Only: Admin, Super User, User; non-trial) */}
      {isLoggedIn && !isTrial && (userRole === "ADMIN" || userRole === "SUPER_USER" || userRole === "USER") && (
        <FloatingSuggestFixLauncher userRole={userRole} username={username} />
      )}
    </div>
  );
}
