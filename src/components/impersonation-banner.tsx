"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Eye, Undo2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    getImpersonationStatusAction, 
    stopImpersonationAction, 
    impersonateUserAction, 
    getImpersonationUserListAction 
} from "@/app/auth-actions";

export default function ImpersonationBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<{
    isImpersonating: boolean;
    adminUsername?: string;
    adminUserId?: string;
    currentUsername?: string;
    currentUserId?: string;
    currentRole?: string;
  }>({ isImpersonating: false });
  const [candidateUsers, setCandidateUsers] = useState<any[]>([]);
  const [exiting, setExiting] = useState(false);
  const [switching, setSwitching] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await getImpersonationStatusAction();
      if (res && res.isImpersonating) {
        setStatus(res);
        // Preload fast candidate user list for the inline dropdown (under 2ms)
        getImpersonationUserListAction().then((list) => {
          if (Array.isArray(list)) setCandidateUsers(list);
        }).catch(() => {});
      } else {
        setStatus({ isImpersonating: false });
      }
    } catch {
      setStatus({ isImpersonating: false });
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [pathname, checkStatus]);

  const handleExit = async () => {
    setExiting(true);
    try {
      const res = await stopImpersonationAction();
      if (res?.error) {
        alert("Failed to restore admin session: " + res.error);
        setExiting(false);
        return;
      }
      // Return to current page unless on /pending, where an admin belongs on root /
      if (window.location.pathname === "/pending") {
        window.location.assign("/");
      } else {
        window.location.assign(window.location.pathname + window.location.search);
      }
    } catch (err) {
      console.error("Error stopping impersonation:", err);
      setExiting(false);
    }
  };

  const handleQuickSwitch = async (targetId: string) => {
    if (!targetId || targetId === "none" || targetId === status.currentUserId) return;
    setSwitching(true);

    try {
      if (targetId === "admin" || targetId === status.adminUserId) {
        await handleExit();
        return;
      }

      const res = await impersonateUserAction(targetId);
      if (res?.error) {
        alert("Failed to switch user: " + res.error);
        setSwitching(false);
        return;
      }

      // Reload the current page as the new user cleanly
      if (window.location.pathname.startsWith("/settings/access") || window.location.pathname.startsWith("/admin")) {
        window.location.assign("/");
      } else {
        window.location.assign(window.location.pathname + window.location.search);
      }
    } catch (err: any) {
      alert("Error switching user: " + (err.message || "Unknown error"));
      setSwitching(false);
    }
  };

  if (!status.isImpersonating) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[9999] w-full bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 text-black px-3 sm:px-4 py-2 shadow-lg border-b border-amber-400/50 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm font-medium animate-in slide-in-from-top-2 duration-300 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="p-1 rounded-md bg-black/20 text-white shrink-0 shadow-inner">
          <Eye className="w-4 h-4 animate-pulse text-amber-200" />
        </span>
        <div className="truncate text-white font-medium flex items-center gap-1.5 flex-wrap">
          <span>Viewing site as</span>
          <strong className="font-bold text-amber-100 underline decoration-amber-300/60 decoration-2 underline-offset-2 truncate">
            {status.currentUsername || "User"}
          </strong>
          <span className="px-1.5 py-0.5 rounded bg-black/30 text-amber-200 text-[10px] font-extrabold uppercase tracking-wider border border-amber-400/30">
            {status.currentRole || "USER"}
          </span>
          {status.adminUsername && (
            <span className="hidden md:inline-flex items-center gap-1 text-amber-100/85 text-xs ml-1 font-normal">
              • Admin: <span className="font-semibold">{status.adminUsername}</span>
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
        {/* Quick Inline User Switcher Dropdown */}
        {candidateUsers.length > 0 && (
          <div className="w-36 sm:w-48">
            <Select 
              value={status.currentUserId || ""} 
              onValueChange={handleQuickSwitch} 
              disabled={exiting || switching}
            >
              <SelectTrigger className="h-7 text-xs bg-black/40 text-amber-200 border-amber-400/50 hover:bg-black/60 focus:ring-0 focus:ring-offset-0 px-2 py-0">
                {switching ? (
                  <span className="flex items-center gap-1.5 text-amber-200">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Switching...</span>
                  </span>
                ) : (
                  <SelectValue placeholder="Switch user..." />
                )}
              </SelectTrigger>
              <SelectContent className="max-h-64 bg-[#14141c] border-amber-500/30 text-foreground">
                <SelectItem value="admin" className="text-xs font-bold text-amber-400 border-b border-border/40 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Undo2 className="h-3 w-3 text-amber-400" />
                    <span>Return to Admin</span>
                  </span>
                </SelectItem>
                {candidateUsers.map((u) => {
                  const isCurrent = u.id === status.currentUserId;
                  const label = u.role === "SUPER_USER" ? "Super" : u.status === "TRIAL" ? "Trial" : "Full";
                  return (
                    <SelectItem key={u.id} value={u.id} className="text-xs py-1.5">
                      <span className={isCurrent ? "font-bold text-amber-300" : ""}>
                        {u.username} ({label}) {isCurrent && "✓"}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}

        <Button
          size="sm"
          variant="secondary"
          onClick={handleExit}
          disabled={exiting || switching}
          className="h-7 px-3 bg-black/85 hover:bg-black text-amber-300 hover:text-white border border-amber-400/40 text-xs font-bold gap-1.5 shadow-md active:scale-95 transition-all hover:ring-2 hover:ring-amber-300/40 cursor-pointer"
        >
          {exiting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
          ) : (
            <Undo2 className="w-3.5 h-3.5 text-amber-300" />
          )}
          <span className="hidden sm:inline">Return to Admin ({status.adminUsername || "Admin"})</span>
          <span className="sm:hidden">Exit ({status.adminUsername || "Admin"})</span>
        </Button>
      </div>
    </div>
  );
}
