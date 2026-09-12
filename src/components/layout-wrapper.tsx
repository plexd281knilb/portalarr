"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut, Settings, LayoutDashboard, Server, BookOpen } from "lucide-react";
import { logout, getSession } from "@/app/auth-actions";
import { checkUserLibraryAccess } from "@/app/actions";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasLibraryAccess, setHasLibraryAccess] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const session = await getSession();
        if (session) {
          if (session.role === "ADMIN") {
            setHasLibraryAccess(true);
          } else {
            const hasAcc = await checkUserLibraryAccess();
            setHasLibraryAccess(hasAcc);
          }
        } else {
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
                ) : (
                    <Button asChild variant="ghost" size="sm" className="flex gap-2 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all">
                        <Link href="/settings" title="Settings">
                            <Settings className="h-4 w-4" /> 
                            <span className="hidden sm:inline font-semibold">Settings</span>
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
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      
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
  );
}