"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut, LogIn, Settings, LayoutDashboard, Server, BookOpen, User } from "lucide-react";
import { logout, getSession } from "@/app/auth-actions";
import { checkUserLibraryAccess } from "@/app/actions";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ImpersonationBanner from "@/components/impersonation-banner";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasLibraryAccess, setHasLibraryAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");

  useEffect(() => {
    async function checkAccess() {
      try {
        const session = await getSession();
        if (session) {
          setIsLoggedIn(true);
          const isAdm = session.role === "ADMIN";
          setIsAdmin(isAdm);
          setUsername((session.username as string) || "");
          if (isAdm) {
            setHasLibraryAccess(true);
          } else {
            const hasAcc = await checkUserLibraryAccess();
            setHasLibraryAccess(hasAcc);
          }
        } else {
          setIsLoggedIn(false);
          setIsAdmin(false);
          setUsername("");
          setHasLibraryAccess(false);
        }
      } catch (e) {
        console.error("Failed to check layout library access:", e);
      }
    }
    checkAccess();
  }, [pathname]);
  
  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/beta";

  const getMobileTitle = () => {
    if (pathname.startsWith("/discover")) return "Discover Media";
    if (pathname.startsWith("/requests")) return "Media Requests";
    if (pathname.startsWith("/library")) return "Book Library";
    if (pathname.startsWith("/radarr")) return "Radarr (Movies)";
    if (pathname.startsWith("/sonarr")) return "Sonarr (TV Shows)";
    if (pathname.startsWith("/curation/kometa")) return "Kometa Overlays";
    if (pathname.startsWith("/curation/agregarr")) return "Agregarr Hubs";
    if (pathname.startsWith("/curation/prune")) return "Maintainerr Prune";
    if (pathname.startsWith("/curation/tagging")) return "Tagging Studio";
    if (pathname.startsWith("/curation")) return "Curation Studio";
    if (pathname.startsWith("/admin/tickets")) return "Support Tickets";
    if (pathname.startsWith("/settings/profile")) return "Account Settings";
    if (pathname.startsWith("/settings/access")) return "Access Control";
    if (pathname.startsWith("/settings")) return "System Settings";
    if (pathname.startsWith("/beta")) return "Beta Portal";
    return "Portalarr";
  };

  if (isPublicRoute) {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col bg-background">
        <ImpersonationBanner />
        {/* --- GLOBAL USER HEADER --- */}
        {pathname !== "/login" && (
          <header className="flex items-center justify-between px-3 sm:px-6 h-14 sm:h-16 border-b bg-muted/20 shrink-0">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Server className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
                <span className="font-bold text-lg sm:text-xl tracking-tight">Portalarr</span>
            </Link>
            
            <div className="flex items-center gap-1.5 sm:gap-3">
                {isLoggedIn ? (
                  <>
                    {hasLibraryAccess && (
                        <Button asChild variant="ghost" size="sm" className="flex gap-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                            <Link href="/library" title="Book Library">
                                <BookOpen className="h-4 w-4 shrink-0" /> 
                                <span className="hidden sm:inline font-semibold">Book Library</span>
                            </Link>
                        </Button>
                    )}

                    {pathname === "/beta" ? (
                        <Button asChild variant="ghost" size="sm" className="flex gap-2 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                            <Link href="/" title="Dashboard">
                                <LayoutDashboard className="h-4 w-4 shrink-0" /> 
                                <span className="hidden sm:inline font-semibold">Dashboard</span>
                            </Link>
                        </Button>
                    ) : (
                        <Button asChild variant="ghost" size="sm" className="flex gap-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 hover:ring-2 hover:ring-purple-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                            <Link href="/beta" title="Beta Portal">
                                <LayoutDashboard className="h-4 w-4 shrink-0" /> 
                                <span className="hidden md:inline font-semibold">Beta</span>
                            </Link>
                        </Button>
                    )}

                    {/* Account Settings Button */}
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-400/40 active:scale-95 transition-all text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
                        <Link href="/settings/profile" title="Account & Password Settings">
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

                    <button 
                      onClick={() => logout()} 
                      className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:ring-2 hover:ring-red-500/40 px-2 sm:px-3 py-1.5 rounded-lg active:scale-95 transition-all ml-0.5 sm:ml-1 cursor-pointer h-8 sm:h-9"
                      title="Sign Out"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" /> 
                      <span className="hidden sm:inline">Sign Out</span>
                    </button>
                  </>
                ) : (
                  <Button asChild size="sm" className="font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-sm text-xs sm:text-sm h-8 sm:h-9">
                    <Link href="/login">
                      <LogIn className="h-4 w-4 shrink-0" />
                      <span>Sign In</span>
                    </Link>
                  </Button>
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
          <Suspense fallback={<div className="w-full h-full bg-[#101014]" />}>
            <Sidebar />
          </Suspense>
        </div>
        
        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* Mobile Header */}
          <div className="md:hidden border-b bg-background px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-3 shrink-0">
             <div className="flex items-center gap-2.5 min-w-0">
                <Suspense fallback={<div className="w-9 h-9" />}>
                  <MobileSidebar />
                </Suspense>
                <span className="font-bold text-base sm:text-lg truncate">{getMobileTitle()}</span>
             </div>
             <div className="flex items-center gap-1.5 shrink-0">
                <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded bg-muted/30">
                  <LayoutDashboard className="h-3.5 w-3.5 text-primary" />
                  <span className="hidden xs:inline">Home</span>
                </Link>
             </div>
          </div>

          {/* Scrollable Page Content */}
          <main className="flex-1 overflow-y-auto p-2.5 sm:p-4 md:p-6 lg:p-8 3xl:p-10 w-full min-w-0">
            <div className="w-full max-w-[2560px] mx-auto min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}