"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import { logout } from "@/app/auth-actions" 
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  Activity, 
  Layers,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ExternalLink,
  Shield,
  LifeBuoy,
  Trash2 // <--- 1. Import Trash Icon
} from "lucide-react"

export function Sidebar({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <div className={cn("pb-12 h-screen border-r bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col justify-between", className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
            Adminarr
          </h2>
          <div className="space-y-1">
            <Link href="/">
              <Button variant={pathname === "/" ? "secondary" : "ghost"} className="w-full justify-start">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
            </Link>

            <Link href="/admin">
              <Button variant={pathname === "/admin" ? "secondary" : "ghost"} className="w-full justify-start">
                <Shield className="mr-2 h-4 w-4" />
                Admin Overview
              </Button>
            </Link>

            <Link href="/monitoring">
              <Button variant={pathname.startsWith("/monitoring") ? "secondary" : "ghost"} className="w-full justify-start">
                <Activity className="mr-2 h-4 w-4" />
                Live Monitoring
              </Button>
            </Link>

            <Link href="/apps">
              <Button variant={pathname.startsWith("/apps") ? "secondary" : "ghost"} className="w-full justify-start">
                <Layers className="mr-2 h-4 w-4" />
                Apps
              </Button>
            </Link>

            {/* --- 2. NEW CLEANUP LINK (Desktop) --- */}
            <Link href="/cleanup">
              <Button variant={pathname.startsWith("/cleanup") ? "secondary" : "ghost"} className="w-full justify-start">
                <Trash2 className="mr-2 h-4 w-4" />
                Cleanup
              </Button>
            </Link>
            {/* ------------------------------------ */}
            
            <Link href="/users">
              <Button variant={pathname.startsWith("/users") ? "secondary" : "ghost"} className="w-full justify-start">
                <Users className="mr-2 h-4 w-4" />
                User List
              </Button>
            </Link>

            <Link href="/admin/tickets">
              <Button variant={pathname.startsWith("/admin/tickets") ? "secondary" : "ghost"} className="w-full justify-start">
                <LifeBuoy className="mr-2 h-4 w-4" />
                Support Tickets
              </Button>
            </Link>

            <Link href="/settings">
              <Button variant={pathname.startsWith("/settings") ? "secondary" : "ghost"} className="w-full justify-start">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="px-3 py-4 space-y-1">
        <Link href="/" target="_blank">
            <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground">
                <ExternalLink className="mr-2 h-4 w-4" /> View Public Site
            </Button>
        </Link>

        {mounted && (
            <Button 
                variant="ghost" 
                className="w-full justify-start"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
                {theme === "dark" ? (
                    <><Sun className="mr-2 h-4 w-4" /> Light Mode</>
                ) : (
                    <><Moon className="mr-2 h-4 w-4" /> Dark Mode</>
                )}
            </Button>
        )}

        <Button 
            variant="ghost" 
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
            onClick={() => logout()}
        >
            <LogOut className="mr-2 h-4 w-4" /> Log Out
        </Button>
      </div>
    </div>
  )
}

export function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="md:hidden">
        <Menu className="h-6 w-6" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/80 transition-opacity" onClick={() => setIsOpen(false)} />
          <div className="relative flex w-64 max-w-xs flex-1 flex-col bg-sidebar text-sidebar-foreground pb-4 pt-5 shadow-xl transition-all duration-300 ease-in-out border-r border-sidebar-border">
            <div className="absolute right-0 top-0 -mr-12 pt-2">
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-6 w-6 text-white" />
              </Button>
            </div>

            <div className="flex-1 px-2 pb-4 flex flex-col justify-between">
              <div className="px-3 py-2">
                <h2 className="mb-6 px-4 text-lg font-semibold tracking-tight">Adminarr</h2>
                <div className="space-y-1">
                  <Link href="/" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname === "/" ? "secondary" : "ghost"} className="w-full justify-start">
                      <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                    </Button>
                  </Link>
                  <Link href="/admin" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname === "/admin" ? "secondary" : "ghost"} className="w-full justify-start">
                      <Shield className="mr-2 h-4 w-4" /> Admin Overview
                    </Button>
                  </Link>
                  <Link href="/monitoring" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname.startsWith("/monitoring") ? "secondary" : "ghost"} className="w-full justify-start">
                      <Activity className="mr-2 h-4 w-4" /> Live Monitoring
                    </Button>
                  </Link>
                  <Link href="/apps" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname.startsWith("/apps") ? "secondary" : "ghost"} className="w-full justify-start">
                      <Layers className="mr-2 h-4 w-4" /> Apps
                    </Button>
                  </Link>

                  {/* --- 3. NEW CLEANUP LINK (Mobile) --- */}
                  <Link href="/cleanup" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname.startsWith("/cleanup") ? "secondary" : "ghost"} className="w-full justify-start">
                      <Trash2 className="mr-2 h-4 w-4" /> Cleanup
                    </Button>
                  </Link>
                  {/* ---------------------------------- */}

                  <Link href="/users" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname.startsWith("/users") ? "secondary" : "ghost"} className="w-full justify-start">
                      <Users className="mr-2 h-4 w-4" /> User List
                    </Button>
                  </Link>
                  <Link href="/admin/tickets" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname.startsWith("/admin/tickets") ? "secondary" : "ghost"} className="w-full justify-start">
                      <LifeBuoy className="mr-2 h-4 w-4" /> Support Tickets
                    </Button>
                  </Link>
                  <Link href="/settings" onClick={() => setIsOpen(false)}>
                    <Button variant={pathname === "/settings" ? "secondary" : "ghost"} className="w-full justify-start">
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </Button>
                  </Link>

                   <div className="mt-8 border-t pt-4">
                        <Button variant="ghost" className="w-full justify-start text-red-500" onClick={() => logout()}>
                            <LogOut className="mr-2 h-4 w-4" /> Log Out
                        </Button>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}