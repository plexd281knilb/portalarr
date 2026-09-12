"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { logout, getSession } from "@/app/auth-actions" 
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
  Sparkles
} from "lucide-react"

export function Sidebar({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const pathname = usePathname()
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState("")

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        setRole((session.role as string) || "");
        if (session.role === "ADMIN") {
          setIsAdmin(true);
        }
      }
    });
  }, []);

  return (
    <div className={cn("pb-12 h-screen border-r bg-[#101014] text-sidebar-foreground border-border/40 flex flex-col justify-between select-none", className)}>
      <div className="space-y-4 py-4">
        <div className="px-3 py-2">
          <div className="flex items-center gap-2.5 px-3 mb-6">
            <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-[0_0_12px_rgba(52,211,153,0.3)]">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
                Portalarr
                <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  v3.0-beta
                </span>
              </h2>
              <p className="text-[10px] text-muted-foreground font-medium">Media Ecosystem Portal</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Link href="/">
              <Button
                variant={pathname === "/" ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                  pathname === "/"
                    ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-muted-foreground/30"
                )}
              >
                <LayoutDashboard className="mr-2 h-4 w-4 text-primary" />
                Dashboard
              </Button>
            </Link>

            <Link href="/library">
              <Button
                variant={pathname.startsWith("/library") ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                  pathname.startsWith("/library")
                    ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-primary/40"
                )}
              >
                <BookOpen className="mr-2 h-4 w-4 text-emerald-400" />
                Book Library
              </Button>
            </Link>

            <Link href="/beta">
              <Button
                variant={pathname.startsWith("/beta") ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                  pathname.startsWith("/beta")
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/40 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-purple-500/40"
                )}
              >
                <Terminal className="mr-2 h-4 w-4 text-purple-400" />
                Beta Portal
              </Button>
            </Link>

            <Link href="/admin/tickets">
              <Button
                variant={pathname.startsWith("/admin/tickets") ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                  pathname.startsWith("/admin/tickets")
                    ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/40 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-amber-500/40"
                )}
              >
                <LifeBuoy className="mr-2 h-4 w-4 text-amber-400" />
                Support Tickets
              </Button>
            </Link>

            <Link href="/settings/profile">
              <Button
                variant={pathname === "/settings/profile" ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                  pathname === "/settings/profile"
                    ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/40 font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-blue-500/40"
                )}
              >
                <User className="mr-2 h-4 w-4 text-blue-400" />
                Account Settings
              </Button>
            </Link>

            {(isAdmin || role === "SUPER_USER") && (
              <>
                <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Media Apps
                </div>
                <Link href="/radarr">
                  <Button
                    variant={pathname.startsWith("/radarr") ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                      pathname.startsWith("/radarr")
                        ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.25)] ring-1 ring-blue-500/40 font-bold"
                        : "text-blue-400/80 hover:text-blue-300 hover:bg-blue-950/30 hover:ring-1 hover:ring-blue-500/40"
                    )}
                  >
                    <Film className="mr-2 h-4 w-4 text-blue-400" />
                    Radarr (Movies)
                  </Button>
                </Link>
                <Link href="/sonarr">
                  <Button
                    variant={pathname.startsWith("/sonarr") ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                      pathname.startsWith("/sonarr")
                        ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/40 font-bold"
                        : "text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-950/30 hover:ring-1 hover:ring-cyan-500/40"
                    )}
                  >
                    <Tv className="mr-2 h-4 w-4 text-cyan-400" />
                    Sonarr (TV Shows)
                  </Button>
                </Link>
              </>
            )}

            {isAdmin && (
              <>
                <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Administration
                </div>
                <Link href="/curation">
                  <Button
                    variant={pathname.startsWith("/curation") ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                      pathname.startsWith("/curation")
                        ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.25)] ring-1 ring-purple-500/40 font-bold"
                        : "text-purple-400/80 hover:text-purple-300 hover:bg-purple-950/30 hover:ring-1 hover:ring-purple-500/40"
                    )}
                  >
                    <Sparkles className="mr-2 h-4 w-4 text-purple-400" />
                    Curation Studio
                  </Button>
                </Link>

                <Link href="/settings">
                  <Button
                    variant={pathname.startsWith("/settings") && pathname !== "/settings/profile" ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                      pathname.startsWith("/settings") && pathname !== "/settings/profile"
                        ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-primary/40"
                    )}
                  >
                    <Settings className="mr-2 h-4 w-4 text-primary" />
                    System Settings
                  </Button>
                </Link>

                <Link href="/settings?tab=logs">
                  <Button
                    variant={pathname.includes("tab=logs") ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                      pathname.includes("tab=logs")
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/40 font-bold"
                        : "text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-950/30 hover:ring-1 hover:ring-emerald-500/40"
                    )}
                  >
                    <Terminal className="mr-2 h-4 w-4 text-emerald-400" />
                    Live System Logs
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 py-4 space-y-1 border-t border-border/30">
        <Button 
            variant="ghost" 
            className="w-full justify-start text-xs font-semibold h-9 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:ring-1 hover:ring-red-500/40 transition-all rounded-lg"
            onClick={() => logout()}
        >
            <LogOut className="mr-2 h-4 w-4 text-red-400" /> Log Out
        </Button>
      </div>
    </div>
  )
}

export function MobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [role, setRole] = useState("");

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        setRole((session.role as string) || "");
        if (session.role === "ADMIN") {
          setIsAdmin(true);
        }
      }
    });
  }, []);

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)} className="md:hidden hover:ring-1 hover:ring-primary/40 rounded-lg">
        <Menu className="h-6 w-6" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" onClick={() => setIsOpen(false)} />
          <div className="relative flex w-68 max-w-xs flex-1 flex-col bg-[#101014] text-sidebar-foreground pb-4 pt-5 shadow-2xl transition-all duration-300 ease-in-out border-r border-border/50">
            <div className="absolute right-0 top-0 -mr-12 pt-2">
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="hover:bg-white/10 rounded-full">
                <X className="h-6 w-6 text-white" />
              </Button>
            </div>

            <div className="flex-1 px-3 pb-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 px-3 mb-6">
                  <div className="h-8 w-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shadow-[0_0_12px_rgba(52,211,153,0.3)]">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
                      Portalarr
                      <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.2 rounded bg-primary/20 text-primary border border-primary/30">
                        v2.0
                      </span>
                    </h2>
                    <p className="text-[10px] text-muted-foreground font-medium">Media Ecosystem Portal</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Link href="/" onClick={() => setIsOpen(false)}>
                    <Button
                      variant={pathname === "/" ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                        pathname === "/"
                          ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-muted-foreground/30"
                      )}
                    >
                      <LayoutDashboard className="mr-2 h-4 w-4 text-primary" /> Dashboard
                    </Button>
                  </Link>

                  <Link href="/library" onClick={() => setIsOpen(false)}>
                    <Button
                      variant={pathname.startsWith("/library") ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                        pathname.startsWith("/library")
                          ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-primary/40"
                      )}
                    >
                      <BookOpen className="mr-2 h-4 w-4 text-emerald-400" /> Book Library
                    </Button>
                  </Link>

                  <Link href="/beta" onClick={() => setIsOpen(false)}>
                    <Button
                      variant={pathname.startsWith("/beta") ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                        pathname.startsWith("/beta")
                          ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)] ring-1 ring-purple-500/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-purple-500/40"
                      )}
                    >
                      <Terminal className="mr-2 h-4 w-4 text-purple-400" /> Beta Portal
                    </Button>
                  </Link>
                  
                  <Link href="/admin/tickets" onClick={() => setIsOpen(false)}>
                    <Button
                      variant={pathname.startsWith("/admin/tickets") ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                        pathname.startsWith("/admin/tickets")
                          ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-amber-500/40"
                      )}
                    >
                      <LifeBuoy className="mr-2 h-4 w-4 text-amber-400" /> Support Tickets
                    </Button>
                  </Link>

                  <Link href="/settings/profile" onClick={() => setIsOpen(false)}>
                    <Button
                      variant={pathname === "/settings/profile" ? "secondary" : "ghost"}
                      className={cn(
                        "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                        pathname === "/settings/profile"
                          ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.2)] ring-1 ring-blue-500/40 font-bold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-blue-500/40"
                      )}
                    >
                      <User className="mr-2 h-4 w-4 text-blue-400" /> Account Settings
                    </Button>
                  </Link>

                  {(isAdmin || role === "SUPER_USER") && (
                    <>
                      <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Media Apps
                      </div>
                      <Link href="/radarr" onClick={() => setIsOpen(false)}>
                        <Button
                          variant={pathname.startsWith("/radarr") ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                            pathname.startsWith("/radarr")
                              ? "bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.25)] ring-1 ring-blue-500/40 font-bold"
                              : "text-blue-400/80 hover:text-blue-300 hover:bg-blue-950/30 hover:ring-1 hover:ring-blue-500/40"
                          )}
                        >
                          <Film className="mr-2 h-4 w-4 text-blue-400" /> Radarr (Movies)
                        </Button>
                      </Link>
                      <Link href="/sonarr" onClick={() => setIsOpen(false)}>
                        <Button
                          variant={pathname.startsWith("/sonarr") ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                            pathname.startsWith("/sonarr")
                              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/40 font-bold"
                              : "text-cyan-400/80 hover:text-cyan-300 hover:bg-cyan-950/30 hover:ring-1 hover:ring-cyan-500/40"
                          )}
                        >
                          <Tv className="mr-2 h-4 w-4 text-cyan-400" /> Sonarr (TV Shows)
                        </Button>
                      </Link>
                    </>
                  )}

                  {isAdmin && (
                    <>
                      <div className="pt-2 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Administration
                      </div>
                      <Link href="/curation" onClick={() => setIsOpen(false)}>
                        <Button
                          variant={pathname.startsWith("/curation") ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                            pathname.startsWith("/curation")
                              ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.25)] ring-1 ring-purple-500/40 font-bold"
                              : "text-purple-400/80 hover:text-purple-300 hover:bg-purple-950/30 hover:ring-1 hover:ring-purple-500/40"
                          )}
                        >
                          <Sparkles className="mr-2 h-4 w-4 text-purple-400" /> Curation Studio
                        </Button>
                      </Link>

                      <Link href="/settings" onClick={() => setIsOpen(false)}>
                        <Button
                          variant={pathname.startsWith("/settings") && pathname !== "/settings/profile" ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                            pathname.startsWith("/settings") && pathname !== "/settings/profile"
                              ? "bg-primary/15 text-primary border border-primary/30 shadow-[0_0_10px_rgba(52,211,153,0.15)] ring-1 ring-primary/40 font-bold"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:ring-1 hover:ring-primary/40"
                          )}
                        >
                          <Settings className="mr-2 h-4 w-4 text-primary" /> System Settings
                        </Button>
                      </Link>

                      <Link href="/settings?tab=logs" onClick={() => setIsOpen(false)}>
                        <Button
                          variant={pathname.includes("tab=logs") ? "secondary" : "ghost"}
                          className={cn(
                            "w-full justify-start text-xs font-semibold h-9 rounded-lg transition-all duration-200",
                            pathname.includes("tab=logs")
                              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.25)] ring-1 ring-emerald-500/40 font-bold"
                              : "text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-950/30 hover:ring-1 hover:ring-emerald-500/40"
                          )}
                        >
                          <Terminal className="mr-2 h-4 w-4 text-emerald-400" /> Live System Logs
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-8 border-t border-border/30 pt-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start text-xs font-semibold h-9 text-red-400 hover:text-red-300 hover:bg-red-950/30 hover:ring-1 hover:ring-red-500/40 transition-all rounded-lg"
                  onClick={() => logout()}
                >
                  <LogOut className="mr-2 h-4 w-4 text-red-400" /> Log Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}