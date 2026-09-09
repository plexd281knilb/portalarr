"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, logout } from "@/app/auth-actions";
import { getPublicJoinConfig } from "@/app/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, MailCheck, LogOut, RefreshCw, ShieldAlert, AlertTriangle, CreditCard, DollarSign, Copy, Check, Calendar } from "lucide-react";

export default function PendingPage() {
  const [user, setUser] = useState<{ username: string; email: string; status?: string } | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedHandle(key);
    setTimeout(() => setCopiedHandle(null), 2000);
  };

  useEffect(() => {
    fetchUser();
    getPublicJoinConfig().then(res => {
      if (res?.success && res.config) {
        setPaymentConfig(res.config);
      }
    }).catch(() => {});
  }, []);

  async function fetchUser() {
    setIsRefreshing(true);
    try {
      const u = await getCurrentUser();
      if (u) {
        setUser(u);
        if (u.status === "APPROVED" || u.status === "TRIAL") {
          window.location.href = "/";
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  }

  const isExpired = user?.status === "EXPIRED";
  const isSuspended = user?.status === "SUSPENDED";
  const isRejected = user?.status === "REJECTED";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background px-4 py-12">
      <Card className="w-full max-w-lg border-border/50 shadow-2xl bg-[#121218]/90 backdrop-blur-md">
        <CardHeader className="text-center space-y-3 pb-4">
          <div className={`mx-auto p-4 rounded-2xl w-fit shadow-lg ${
            isExpired || isSuspended 
              ? "bg-orange-500/10 border border-orange-500/30 text-orange-400" 
              : isRejected 
              ? "bg-red-500/10 border border-red-500/30 text-red-400" 
              : "bg-amber-500/10 border border-amber-500/20 text-amber-500"
          }`}>
            {isExpired || isSuspended ? (
              <AlertTriangle className="h-10 w-10 animate-pulse" />
            ) : isRejected ? (
              <ShieldAlert className="h-10 w-10" />
            ) : (
              <Clock className="h-10 w-10 animate-pulse" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
            {isExpired 
              ? "Trial or Subscription Expired" 
              : isSuspended 
              ? "Account Access Suspended" 
              : isRejected 
              ? "Account Request Declined" 
              : "Account Pending Approval"}
          </CardTitle>
          <CardDescription className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
            {isExpired 
              ? "Your access period has elapsed. Please subscribe to reactivate your access."
              : isSuspended 
              ? "Your access to the server has been temporarily paused by the administrator."
              : isRejected 
              ? "Your registration request was declined by the administrator."
              : "Your temporary account request has been submitted to the server administrator."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {isExpired || isSuspended ? (
            <div className="bg-orange-500/5 border border-orange-500/20 p-4 rounded-2xl space-y-3.5">
              <div className="flex items-center justify-between border-b border-orange-500/20 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
                  <CreditCard className="h-4 w-4" />
                  <span>Subscription & Renewal</span>
                </div>
                <Badge variant="outline" className="bg-orange-500/20 text-orange-300 border-orange-500/40 text-xs font-bold">
                  ${paymentConfig?.yearlyPrice ?? 180} / yr (Jan 1)
                </Badge>
              </div>

              {paymentConfig?.proratedBilling ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-xl bg-background/60 border border-border/40 space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Reactivation Amount Due</span>
                    <p className="text-base font-black text-foreground">{paymentConfig.proratedBilling.amountDueText}</p>
                    <p className="text-[11px] text-muted-foreground">Covers {paymentConfig.proratedBilling.remainingMonthsText} @ ${paymentConfig.proratedBilling.monthlyRate}/mo</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Following your initial prorated term, the annual subscription renews at <strong>${paymentConfig.proratedBilling.yearlyRate}/year</strong> on <strong>{paymentConfig.proratedBilling.nextRenewalDate}</strong>.
                  </p>
                </div>
              ) : (
                paymentConfig?.subscriptionPrice && (
                  <div className="text-sm font-bold text-foreground">
                    Rate: {paymentConfig.subscriptionPrice}
                  </div>
                )
              )}

              {paymentConfig?.paymentInstructions && (
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-muted-foreground/90 whitespace-pre-wrap">
                  {paymentConfig.paymentInstructions}
                </div>
              )}

              {/* PAYMENT HANDLES */}
              <div className="space-y-2 pt-1 border-t border-orange-500/20">
                <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-primary" /> Supported Payment Methods
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  {paymentConfig?.paymentPaypal && (
                    <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">PayPal</span>
                        <span className="font-semibold text-foreground truncate block">{paymentConfig.paymentPaypal}</span>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                        onClick={() => handleCopy(paymentConfig.paymentPaypal, "paypal")}
                      >
                        {copiedHandle === "paypal" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                  {paymentConfig?.paymentVenmo && (
                    <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Venmo</span>
                        <span className="font-semibold text-foreground truncate block">{paymentConfig.paymentVenmo}</span>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                        onClick={() => handleCopy(paymentConfig.paymentVenmo, "venmo")}
                      >
                        {copiedHandle === "venmo" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                  {paymentConfig?.paymentCashApp && (
                    <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Cash App</span>
                        <span className="font-semibold text-foreground truncate block">{paymentConfig.paymentCashApp}</span>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                        onClick={() => handleCopy(paymentConfig.paymentCashApp, "cashapp")}
                      >
                        {copiedHandle === "cashapp" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                  {paymentConfig?.paymentZelle && (
                    <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Zelle</span>
                        <span className="font-semibold text-foreground truncate block">{paymentConfig.paymentZelle}</span>
                      </div>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                        onClick={() => handleCopy(paymentConfig.paymentZelle, "zelle")}
                      >
                        {copiedHandle === "zelle" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground italic pt-1">
                Include your username <strong className="text-foreground">({user?.username})</strong> in the payment note. Once received, your access will be restored immediately.
              </p>
            </div>
          ) : isRejected ? (
            <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-xl text-xs text-muted-foreground leading-relaxed">
              If you believe this is a mistake, please contact the server owner directly.
            </div>
          ) : (
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
          )}

          {!isRejected && (
            <div className="text-center space-y-1 text-xs text-muted-foreground">
              <p>Once activated, clicking below will verify your status and grant access to the dashboard.</p>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {!isRejected && (
              <Button 
                type="button" 
                variant="default" 
                className="w-full h-11 font-semibold gap-2 hover:ring-2 hover:ring-primary/40 hover:shadow-lg active:scale-95 transition-all"
                onClick={fetchUser}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                Check Access Status
              </Button>
            )}

            <Button 
              type="button" 
              variant="outline" 
              className="w-full h-11 font-medium gap-2 text-muted-foreground hover:text-foreground hover:ring-1 hover:ring-border active:scale-95 transition-all"
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
