"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut, Settings, LayoutDashboard, Server } from "lucide-react";
import { logout } from "@/app/auth-actions";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
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
            
            <div className="flex items-center gap-4">
                {pathname === "/beta" ? (
                    <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-2">
                        <Link href="/">
                            <LayoutDashboard className="h-4 w-4" /> 
                            Dashboard
                        </Link>
                    </Button>
                ) : (
                    <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-2">
                        <Link href="/settings">
                            <Settings className="h-4 w-4" /> 
                            Settings
                        </Link>
                    </Button>
                )}

                <button 
                onClick={() => logout()} 
                className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors ml-2"
                >
                <LogOut className="w-4 h-4" /> 
                <span className="hidden xs:inline">Sign Out</span>
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
      <div className="w-64 flex-none hidden md:block">
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
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>

    </div>
  );
}