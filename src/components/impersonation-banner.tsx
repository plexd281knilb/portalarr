"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Eye, Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getImpersonationStatusAction, stopImpersonationAction } from "@/app/auth-actions";

export default function ImpersonationBanner() {
  const pathname = usePathname();
  const [status, setStatus] = useState<{
    isImpersonating: boolean;
    adminUsername?: string;
    currentUsername?: string;
    currentRole?: string;
  }>({ isImpersonating: false });
  const [exiting, setExiting] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await getImpersonationStatusAction();
      if (res && res.isImpersonating) {
        setStatus(res);
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
      window.location.href = "/settings/access";
    } catch (err) {
      console.error("Error stopping impersonation:", err);
      setExiting(false);
    }
  };

  if (!status.isImpersonating) {
    return null;
  }

  return (
    <div className="sticky top-0 z-[9999] w-full bg-gradient-to-r from-amber-600 via-amber-500 to-orange-600 text-black px-4 py-2 shadow-lg border-b border-amber-400/50 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-in slide-in-from-top-2 duration-300 shrink-0">
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
        <Button
          size="sm"
          variant="secondary"
          onClick={handleExit}
          disabled={exiting}
          className="h-7 px-3 bg-black/85 hover:bg-black text-amber-300 hover:text-white border border-amber-400/40 text-xs font-bold gap-1.5 shadow-md active:scale-95 transition-all hover:ring-2 hover:ring-amber-300/40 cursor-pointer"
        >
          {exiting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
          ) : (
            <Undo2 className="w-3.5 h-3.5 text-amber-300" />
          )}
          <span>Return to Admin ({status.adminUsername || "Admin"})</span>
        </Button>
      </div>
    </div>
  );
}
