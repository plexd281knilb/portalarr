"use client";

import { useEffect, useState } from "react";
import { getCurrentUser, logout } from "@/app/auth-actions";
import { getPublicJoinConfig } from "@/app/actions";
import { recheckUserAccessAndPaymentAction } from "@/app/payment-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PaymentMethodsGrid } from "@/components/payment-methods-grid";
import { Clock, MailCheck, LogOut, RefreshCw, ShieldAlert, AlertTriangle, CreditCard, DollarSign, Copy, Check, Calendar } from "lucide-react";

export default function PendingPage() {
  const [user, setUser] = useState<{ username: string; email: string; status?: string; subscriptionEndsAt?: Date | null; trialEndsAt?: Date | null } | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedHandle(key);
    setTimeout(() => setCopiedHandle(null), 2000);
  };

  useEffect(() => {
    fetchUser(false);
    getPublicJoinConfig().then(res => {
      if (res?.success && res.config) {
        setPaymentConfig(res.config);
      }
    }).catch(() => {});
  }, []);

  async function fetchUser(isManualClick: boolean = false) {
    setIsRefreshing(true);
    setCheckMsg(null);
    setCheckErr(null);
    try {
      if (isManualClick) {
        const res = await recheckUserAccessAndPaymentAction();
        if (res.success && res.user) {
          setUser(res.user);
          if (res.isSubscribed) {
            setCheckMsg(`Payment detected! Subscribed until ${res.user.subscriptionEndsAt ? new Date(res.user.subscriptionEndsAt).toLocaleDateString() : 'Active'}. Redirecting...`);
            setTimeout(() => {
              window.location.href = "/";
            }, 1500);
            return;
          }
          if (res.user.status === "APPROVED" || res.user.status === "TRIAL") {
            setCheckMsg("Account approved! Redirecting to dashboard...");
            setTimeout(() => {
              window.location.href = "/";
            }, 1000);
            return;
          }
          setCheckMsg(res.message || "Checked payment emails. No new payment matching your account was found yet.");
        } else {
          setCheckErr(res.error || "Could not check payment status.");
        }
      } else {
        const u = await getCurrentUser();
        if (u) {
          setUser(u);
          if (u.status === "APPROVED" || u.status === "TRIAL") {
            window.location.href = "/";
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setCheckErr(e.message || "Failed to check status.");
    } finally {
      setIsRefreshing(false);
    }
  }

  const isExpired = user?.status === "EXPIRED";
  const isSuspended = user?.status === "SUSPENDED";
  const isRejected = user?.status === "REJECTED";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background px-3 sm:px-4 py-6 sm:py-12">
      <Card className="w-full max-w-lg sm:max-w-xl border-border/50 shadow-2xl bg-[#121218]/90 backdrop-blur-md">
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
              <div className="pt-1 border-t border-orange-500/20">
                <PaymentMethodsGrid config={paymentConfig} />
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
              <p>Once paid or activated, clicking below will verify your status, check payment emails, and grant access to the dashboard.</p>
            </div>
          )}

          {checkMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 font-medium flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{checkMsg}</span>
            </div>
          )}

          {checkErr && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-medium flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-400" />
              <span>{checkErr}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            {!isRejected && (
              <Button 
                type="button" 
                variant="default" 
                className="w-full h-11 font-semibold gap-2 hover:ring-2 hover:ring-primary/40 hover:shadow-lg active:scale-95 transition-all"
                onClick={() => fetchUser(true)}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Checking Payment Emails..." : "Check Access & Payment Status"}
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
