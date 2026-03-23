"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { LogOut } from "lucide-react";
import { logout } from "@/app/auth-actions";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/beta";

  if (isPublicRoute) {
    return (
      <div className="w-full min-h-[100dvh] flex flex-col">
        {/* --- NEW USER HEADER --- */}
        {/* Only show this header if they are NOT on the login screen */}
        {pathname !== "/login" && (
          <header className="flex items-center justify-between p-4 border-b bg-background shrink-0">
            <span className="font-bold text-lg text-primary">Portalarr</span>
            
            <button 
              onClick={() => logout()} 
              className="flex items-center gap-2 text-sm font-medium text-red-500 hover:text-red-600 transition-colors"
            >
              <LogOut className="w-4 h-4" /> 
              Sign Out
            </button>
          </header>
        )}
        {/* ----------------------- */}

        <main className="flex-1">
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
           <span className="font-bold text-lg">Adminarr Settings</span>
        </div>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>

    </div>
  );
}