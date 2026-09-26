"use client";

import React, { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QrCode, Copy, Check, ExternalLink, Sparkles, DollarSign, Smartphone } from "lucide-react";
import { getPaymentLink, generatePaymentMemo, PaymentLinkInfo } from "@/lib/payment-links";
import { generateQRSvg } from "@/lib/qr-code";

interface PaymentQrModalProps {
    isOpen: boolean;
    onClose: () => void;
    config?: {
        paymentPaypal?: string | null;
        paymentVenmo?: string | null;
        paymentCashApp?: string | null;
        paymentZelle?: string | null;
        yearlyPrice?: number | null;
        monthlyPrice?: number | null;
    } | null;
    username?: string;
    initialProvider?: "paypal" | "venmo" | "cashapp" | "zelle";
}

export function PaymentQrModal({
    isOpen,
    onClose,
    config,
    username = "USER",
    initialProvider = "venmo",
}: PaymentQrModalProps) {
    const [cadence, setCadence] = useState<"yearly" | "monthly">("yearly");
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const yearlyAmount = config?.yearlyPrice || 180;
    const monthlyAmount = config?.monthlyPrice || 17.5;
    const selectedAmount = cadence === "yearly" ? yearlyAmount : monthlyAmount;

    const memoTag = useMemo(() => generatePaymentMemo(username), [username]);

    const activeProviders = useMemo(() => {
        if (!config) return [];
        const list: Array<{ key: "paypal" | "venmo" | "cashapp" | "zelle"; raw: string }> = [];
        if (config.paymentVenmo?.trim()) list.push({ key: "venmo", raw: config.paymentVenmo.trim() });
        if (config.paymentPaypal?.trim()) list.push({ key: "paypal", raw: config.paymentPaypal.trim() });
        if (config.paymentCashApp?.trim()) list.push({ key: "cashapp", raw: config.paymentCashApp.trim() });
        if (config.paymentZelle?.trim()) list.push({ key: "zelle", raw: config.paymentZelle.trim() });
        return list;
    }, [config]);

    const defaultTab = useMemo(() => {
        if (activeProviders.some((p) => p.key === initialProvider)) return initialProvider;
        return activeProviders[0]?.key || "venmo";
    }, [activeProviders, initialProvider]);

    const [activeTab, setActiveTab] = useState<string>(defaultTab);

    // Sync active tab when initial provider changes
    React.useEffect(() => {
        if (initialProvider && activeProviders.some((p) => p.key === initialProvider)) {
            setActiveTab(initialProvider);
        }
    }, [initialProvider, activeProviders]);

    const handleCopy = (text: string, key: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    if (activeProviders.length === 0) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[96vw] sm:max-w-md max-h-[85vh] flex flex-col bg-[#101018] border-border/60 text-foreground p-0 overflow-hidden shadow-2xl">
                <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
                    <DialogHeader className="space-y-1 text-left shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                <QrCode className="h-5 w-5 text-primary" /> Scan to Pay (P2P Direct)
                            </DialogTitle>
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-bold">
                                Zero Gateway Fees
                            </Badge>
                        </div>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Scan with your phone camera or payment app to send funds with your username memo pre-filled.
                        </DialogDescription>
                    </DialogHeader>

                    {/* CADENCE PICKER */}
                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/[0.06]">
                        <Button
                            type="button"
                            size="sm"
                            variant={cadence === "yearly" ? "default" : "ghost"}
                            onClick={() => setCadence("yearly")}
                            className="flex-1 text-xs font-semibold h-8 rounded-lg"
                        >
                            Annual (${yearlyAmount}/yr)
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={cadence === "monthly" ? "default" : "ghost"}
                            onClick={() => setCadence("monthly")}
                            className="flex-1 text-xs font-semibold h-8 rounded-lg"
                        >
                            Monthly (${monthlyAmount}/mo)
                        </Button>
                    </div>

                    {/* PROVIDER TABS */}
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="w-full grid grid-cols-4 bg-black/50 p-1 rounded-xl h-9">
                            {activeProviders.map(({ key }) => {
                                const names: Record<string, string> = {
                                    venmo: "Venmo",
                                    paypal: "PayPal",
                                    cashapp: "Cash App",
                                    zelle: "Zelle",
                                };
                                return (
                                    <TabsTrigger
                                        key={key}
                                        value={key}
                                        className="text-[11px] font-bold py-1 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                                    >
                                        {names[key]}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>

                        {activeProviders.map(({ key, raw }) => {
                            const linkInfo = getPaymentLink(key, raw, {
                                username,
                                amount: selectedAmount,
                                memo: memoTag,
                            });
                            if (!linkInfo) return null;

                            const qrSvg = generateQRSvg(linkInfo.url, {
                                size: 200,
                                fgColor: "#ffffff",
                                bgColor: "transparent",
                                margin: 1,
                            });

                            return (
                                <TabsContent key={key} value={key} className="space-y-4 pt-2">
                                    {/* QR CODE CONTAINER */}
                                    <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] shadow-inner space-y-3">
                                        <div
                                            className="p-3 bg-white rounded-xl shadow-lg"
                                            dangerouslySetInnerHTML={{
                                                __html: qrSvg.replace(
                                                    'fill="#ffffff"',
                                                    key === "venmo"
                                                        ? 'fill="#008CFF"'
                                                        : key === "paypal"
                                                        ? 'fill="#003087"'
                                                        : key === "cashapp"
                                                        ? 'fill="#00D632"'
                                                        : 'fill="#7414CA"'
                                                ),
                                            }}
                                        />
                                        <div className="text-center space-y-0.5">
                                            <p className="font-mono font-bold text-sm text-foreground">
                                                {linkInfo.displayLabel}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1">
                                                <Smartphone className="h-3 w-3" /> Scan or tap below to open {linkInfo.providerName}
                                            </p>
                                        </div>
                                    </div>

                                    {/* MEMO & ACTION BUTTON */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
                                            <div className="space-y-0.5 truncate pr-2">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">
                                                    Required Memo Tag
                                                </span>
                                                <span className="font-mono font-bold text-purple-300 truncate block">
                                                    {memoTag}
                                                </span>
                                            </div>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCopy(memoTag, "memo")}
                                                className="h-8 text-xs shrink-0 border-purple-500/30 hover:bg-purple-500/20 font-semibold"
                                            >
                                                {copiedKey === "memo" ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                                <span className="ml-1.5">{copiedKey === "memo" ? "Copied" : "Copy"}</span>
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-2 pt-1">
                                            <a
                                                href={linkInfo.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1"
                                            >
                                                <Button
                                                    type="button"
                                                    className="w-full font-bold text-xs h-10 gap-2 shadow-md hover:scale-[1.01] active:scale-98 transition-all"
                                                >
                                                    <ExternalLink className="h-4 w-4" /> Open in {linkInfo.providerName} (${selectedAmount.toFixed(2)})
                                                </Button>
                                            </a>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleCopy(linkInfo.displayLabel, "handle")}
                                                className="h-10 text-xs shrink-0 border-border/60"
                                            >
                                                {copiedKey === "handle" ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            );
                        })}
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
