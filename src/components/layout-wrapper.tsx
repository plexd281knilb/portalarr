"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut, Settings, LayoutDashboard, Server, BookOpen, User } from "lucide-react";
import { logout, getSession } from "@/app/auth-actions";
import { checkUserLibraryAccess } from "@/app/actions";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import ImpersonationBanner from "@/components/impersonation-banner";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasLibraryAccess, setHasLibraryAccess] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const session = await getSession();
        if (session) {
          const isAdm = session.role === "ADMIN";
          setIsAdmin(isAdm);
          if (isAdm) {
            setHasLibraryAccess(true);
          } else {
            const hasAcc = await checkUserLibraryAccess();
            setHasLibraryAccess(hasAcc);
          }
        } else {
          setIsAdmin(false);
          setHasLibraryAccess(false);
        }
      } catch (e) {
        console.error("Failed to check layout library access:", e);
      }
    }
    checkAccess();
  }, [pathname]);
  
  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/beta";

  if (isPublicRoute) {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col bg-background">
        <ImpersonationBanner />
        {/* --- GLOBAL USER HEADER --- */}
        {pathname !== "/login" && (
          <header className="flex items-center justify-between px-6 h-16 border-b bg-muted/20 shrink-0">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Server className="h-6 w-6 text-primary" />
                <span className="font-bold text-xl tracking-tight">Portalarr</span>
            </Link>
            
            <div className="flex items-center gap-3">
                {hasLibraryAccess && (
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 transition-all">
                        <Link href="/library" title="Book Library">
                            <BookOpen className="h-4 w-4" /> 
                            <span className="hidden sm:inline font-semibold">Book Library</span>
                        </Link>
                    </Button>
                )}

                {pathname === "/beta" ? (
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all">
                        <Link href="/" title="Dashboard">
                            <LayoutDashboard className="h-4 w-4" /> 
                            <span className="hidden sm:inline font-semibold">Dashboard</span>
                        </Link>
                    </Button>
                ) : isAdmin ? (
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 text-primary hover:text-primary hover:bg-primary/10 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all">
                        <Link href="/settings" title="System Settings">
                            <Settings className="h-4 w-4" /> 
                            <span className="hidden sm:inline font-semibold">Settings</span>
                        </Link>
                    </Button>
                ) : (
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-400/40 active:scale-95 transition-all">
                        <Link href="/settings/profile" title="Account Settings">
                            <User className="h-4 w-4" /> 
                            <span className="hidden sm:inline font-semibold">Account</span>
                        </Link>
                    </Button>
                )}

                <button 
                  onClick={() => logout()} 
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 hover:ring-2 hover:ring-red-500/40 px-3 py-1.5 rounded-lg active:scale-95 transition-all ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" /> 
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
            </div>
          </header>
        )}
        {/* ----------------------- */}

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-background text-foreground">
      <ImpersonationBanner />
      
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Desktop Sidebar (Admins Only) */}
        <div className="w-56 lg:w-64 flex-none hidden md:block">
          <Sidebar />
        </div>
        
        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* Mobile Header (Admins Only) */}
          <div className="md:hidden border-b bg-background p-4 flex items-center gap-3 shrink-0">
             <MobileSidebar /> 
             <span className="font-bold text-lg">Portalarr Settings</span>
          </div>

          {/* Scrollable Page Content */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}