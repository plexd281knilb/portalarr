"use client";

import React, { useState } from "react";
import { ExternalLink, Copy, Check, DollarSign, QrCode, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPaymentLink, PaymentLinkInfo } from "@/lib/payment-links";
import { PaymentQrModal } from "@/components/payment-qr-modal";

interface PaymentConfigProps {
    paymentPaypal?: string | null;
    paymentVenmo?: string | null;
    paymentCashApp?: string | null;
    paymentZelle?: string | null;
    yearlyPrice?: number | null;
    monthlyPrice?: number | null;
}

interface PaymentMethodsGridProps {
    config?: PaymentConfigProps | null;
    username?: string;
    className?: string;
    onCopy?: (text: string, provider: string) => void;
}

export function PaymentMethodsGrid({ config, username = "USER", className = "", onCopy }: PaymentMethodsGridProps) {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [selectedProvider, setSelectedProvider] = useState<"paypal" | "venmo" | "cashapp" | "zelle">("venmo");

    if (!config) return null;

    const providers: Array<{ key: "paypal" | "venmo" | "cashapp" | "zelle"; value?: string | null }> = [
        { key: "paypal", value: config.paymentPaypal },
        { key: "venmo", value: config.paymentVenmo },
        { key: "cashapp", value: config.paymentCashApp },
        { key: "zelle", value: config.paymentZelle },
    ];

    const activeItems: Array<{ link: PaymentLinkInfo; rawValue: string; key: "paypal" | "venmo" | "cashapp" | "zelle" }> = [];
    providers.forEach(({ key, value }) => {
        if (value && value.trim()) {
            const linkInfo = getPaymentLink(key, value, {
                username,
                amount: config.yearlyPrice || 180,
            });
            if (linkInfo) {
                activeItems.push({ link: linkInfo, rawValue: value.trim(), key });
            }
        }
    });

    if (activeItems.length === 0) return null;

    const handleCopyClick = (e: React.MouseEvent, text: string, key: string) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        if (onCopy) onCopy(text, key);
        setTimeout(() => {
            setCopiedKey((curr) => (curr === key ? null : curr));
        }, 2000);
    };

    const handleOpenQr = (e: React.MouseEvent, key: "paypal" | "venmo" | "cashapp" | "zelle") => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedProvider(key);
        setQrModalOpen(true);
    };

    return (
        <div className={`space-y-2.5 ${className}`}>
            <div className="flex items-center justify-between">
                <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-primary" /> Supported Payment Methods
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setSelectedProvider(activeItems[0]?.key || "venmo");
                        setQrModalOpen(true);
                    }}
                    className="h-7 px-2 text-[11px] font-semibold text-primary border-primary/30 hover:bg-primary/10 gap-1.5"
                >
                    <QrCode className="h-3.5 w-3.5" /> Scan QR Code
                </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {activeItems.map(({ link: item, rawValue, key }) => {
                    const isCopied = copiedKey === item.provider;
                    return (
                        <div
                            key={item.provider}
                            className={`group relative p-2.5 rounded-xl bg-background/80 border border-border/40 transition-all duration-200 flex items-center justify-between gap-2 ${item.hoverBorderClass}`}
                        >
                            {/* CLICKABLE LINK: OPENS IN NEW TAB OR LAUNCHES APP */}
                            <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="min-w-0 flex-1 flex flex-col text-left no-underline cursor-pointer group-hover:opacity-95"
                                title={`${item.actionText} - Opens in new tab/app`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider">
                                        {item.providerName}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 text-[9px] font-sans px-1.5 py-0.5 rounded border font-medium transition-colors ${item.badgeBgClass}`}>
                                        Pay / App <ExternalLink className="h-2.5 w-2.5" />
                                    </span>
                                </div>
                                <span className="font-bold text-foreground truncate block mt-0.5 group-hover:text-primary transition-colors text-xs">
                                    {item.displayLabel}
                                </span>
                            </a>

                            <div className="flex items-center gap-1">
                                {/* SCAN QR BUTTON */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => handleOpenQr(e, key)}
                                    title={`Show QR code for ${item.providerName}`}
                                >
                                    <QrCode className="h-3.5 w-3.5 text-primary/80" />
                                </Button>

                                {/* 1-CLICK COPY BUTTON */}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                                    onClick={(e) => handleCopyClick(e, rawValue, item.provider)}
                                    title={`Copy ${item.providerName} handle`}
                                >
                                    {isCopied ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                    ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                    )}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* QR CODE MODAL */}
            <PaymentQrModal
                isOpen={qrModalOpen}
                onClose={() => setQrModalOpen(false)}
                config={config}
                username={username}
                initialProvider={selectedProvider}
            />
        </div>
    );
}
