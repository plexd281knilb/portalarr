"use client";

import { usePathname } from "next/navigation";
import { Sidebar, MobileSidebar } from "@/components/sidebar";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Update this array to include "/beta"
  const isPublicRoute = pathname === "/" || pathname === "/login" || pathname === "/beta";

  if (isPublicRoute) {
    return <div className="w-full min-h-[100dvh]">{children}</div>;
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background text-foreground">
      
      {/* Desktop Sidebar */}
      <div className="w-64 flex-none hidden md:block">
        <Sidebar />
      </div>
      
      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Mobile Header (Admin) */}
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