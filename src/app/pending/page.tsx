"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, logout } from "@/app/auth-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, MailCheck, LogOut, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";

export default function PendingPage() {
  const [user, setUser] = useState<{ username: string; email: string; status?: string } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    setIsRefreshing(true);
    try {
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
        if (u.status === "APPROVED") {
          window.location.href = "/";
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background px-4 py-12">
      <Card className="w-full max-w-md border-border/40 shadow-2xl bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className="mx-auto bg-amber-500/10 border border-amber-500/20 p-4 rounded-2xl w-fit">
            <Clock className="h-10 w-10 text-amber-500 animate-pulse" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            Account Pending Approval
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
            Your temporary account request has been submitted to the server administrator.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
              <MailCheck className="h-4 w-4" />
              <span>Email Notification Sent</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              An email notification was automatically dispatched to the server admin with your registration details.
            </p>

            {user && (
              <div className="pt-2 border-t border-amber-500/10 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground block">Username</span>
                  <span className="font-semibold text-foreground">{user.username}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Email</span>
                  <span className="font-semibold text-foreground truncate block">{user.email || "Not Provided"}</span>
                </div>
              </div>
            )}
          </div>

          <div className="text-center space-y-1 text-xs text-muted-foreground">
            <p>Once approved, refreshing this page will grant immediate access to your dashboard.</p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button 
              type="button" 
              variant="default" 
              className="w-full h-11 font-medium gap-2"
              onClick={fetchUser}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Check Approval Status
            </Button>

            <Button 
              type="button" 
              variant="outline" 
              className="w-full h-11 font-medium gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
