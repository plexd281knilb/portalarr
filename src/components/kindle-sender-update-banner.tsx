"use client";

import { useEffect, useState } from "react";
import { getKindleSenderUpdateNoticeStatusAction, acknowledgeKindleSenderUpdateAction } from "@/app/actions";
import { KindleSenderUpdateModal } from "@/components/kindle-sender-update-modal";
import { KindleSetupGuideModal } from "@/components/kindle-setup-guide-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Send, ExternalLink, Check, AlertTriangle, BookOpen, Sparkles } from "lucide-react";

interface KindleSenderUpdateBannerProps {
    autoOpenModal?: boolean;
    className?: string;
    onKindleConfigured?: (email: string) => void;
}

export function KindleSenderUpdateBanner({
    autoOpenModal = false,
    className = "",
    onKindleConfigured
}: KindleSenderUpdateBannerProps) {
    const [hasKindleEmail, setHasKindleEmail] = useState<boolean | null>(null);
    const [needsNotice, setNeedsNotice] = useState(false);
    const [userKindleEmail, setUserKindleEmail] = useState<string | null>(null);
    const [senderEmail, setSenderEmail] = useState("kindle@domshomelab.com");
    const [noticeModalOpen, setNoticeModalOpen] = useState(false);
    const [setupModalOpen, setSetupModalOpen] = useState(false);
    const [acknowledging, setAcknowledging] = useState(false);

    useEffect(() => {
        let isMounted = true;

        async function checkNotice() {
            try {
                const res = await getKindleSenderUpdateNoticeStatusAction();
                if (!isMounted) return;

                if (res) {
                    setHasKindleEmail(Boolean(res.hasKindleEmail));
                    setUserKindleEmail(res.kindleEmail || null);
                    if (res.senderEmail) {
                        setSenderEmail(res.senderEmail);
                    }

                    if (res.hasKindleEmail && res.needsNotice) {
                        setNeedsNotice(true);
                        if (autoOpenModal) {
                            try {
                                const dismissedSession = sessionStorage.getItem("portalarr_kindle_notice_dismissed_session");
                                if (dismissedSession !== "true") {
                                    setNoticeModalOpen(true);
                                }
                            } catch {
                                setNoticeModalOpen(true);
                            }
                        }
                    } else if (!res.hasKindleEmail) {
                        setNeedsNotice(false);
                        if (autoOpenModal) {
                            try {
                                const dismissedSetupSession = sessionStorage.getItem("portalarr_kindle_setup_dismissed_session");
                                if (dismissedSetupSession !== "true") {
                                    setSetupModalOpen(true);
                                }
                            } catch {
                                setSetupModalOpen(true);
                            }
                        }
                    } else {
                        setNeedsNotice(false);
                    }
                }
            } catch (err) {
                console.error("[KINDLE-BANNER-CHECK-ERROR]:", err);
            }
        }

        checkNotice();

        return () => {
            isMounted = false;
        };
    }, [autoOpenModal]);

    const handleAcknowledge = async () => {
        setAcknowledging(true);
        try {
            await acknowledgeKindleSenderUpdateAction();
            setNeedsNotice(false);
            setNoticeModalOpen(false);
            try {
                sessionStorage.removeItem("portalarr_kindle_notice_dismissed_session");
            } catch {}
        } catch (e) {
            console.error("[KINDLE-ACK-ERROR]:", e);
        } finally {
            setAcknowledging(false);
        }
    };

    const handleSetupCompleted = (configuredEmail: string) => {
        setHasKindleEmail(true);
        setUserKindleEmail(configuredEmail);
        setNeedsNotice(false);
        setSetupModalOpen(false);
        if (onKindleConfigured) {
            onKindleConfigured(configuredEmail);
        }
    };

    // If still loading or user has Kindle and doesn't need notice, don't show banner
    if (hasKindleEmail === null) return null;
    if (hasKindleEmail && !needsNotice) return null;

    // CASE 1: User does NOT have Send-to-Kindle configured
    if (!hasKindleEmail) {
        return (
            <>
                <div className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-purple-950/70 border border-purple-500/40 shadow-xl space-y-3 ${className}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                                    <Send className="h-3 w-3 mr-1 inline" /> Send-to-Kindle Setup
                                </Badge>
                                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                                    Not Configured
                                </Badge>
                            </div>

                            <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                                <span>⚡ Set Up 1-Click Send-to-Kindle Wireless Delivery</span>
                            </h4>

                            <p className="text-xs text-muted-foreground leading-relaxed max-w-4xl">
                                Request or download any ebook and have it fly wirelessly straight to your Kindle e-reader or Kindle app automatically. Authorize our server sender (
                                <span className="font-mono font-bold text-purple-300 bg-purple-500/10 px-1 py-0.5 rounded border border-purple-500/20">
                                    {senderEmail}
                                </span>
                                ) on Amazon at{" "}
                                <a
                                    href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:text-purple-300 underline font-semibold break-all inline-flex items-center gap-0.5"
                                >
                                    <span>https://www.amazon.com/hz/mycd/myx#/home/settings/payment</span>
                                    <ExternalLink className="h-2.5 w-2.5 inline shrink-0" />
                                </a>{" "}
                                and link your device email in 30 seconds.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                asChild
                                className="text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10 h-8 sm:h-9 shrink-0 whitespace-nowrap"
                            >
                                <a
                                    href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1"
                                >
                                    <span>Amazon Settings</span>
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                </a>
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                onClick={() => setSetupModalOpen(true)}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-purple-900/30 h-8 sm:h-9 shrink-0 whitespace-nowrap cursor-pointer"
                            >
                                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                                <span>Set Up Send-to-Kindle</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <KindleSetupGuideModal
                    open={setupModalOpen}
                    onOpenChange={setSetupModalOpen}
                    senderEmail={senderEmail}
                    onConfigured={handleSetupCompleted}
                />
            </>
        );
    }

    // CASE 2: User HAS Send-to-Kindle configured, but NEEDS sender update notice
    return (
        <>
            <div className={`p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-purple-950/70 via-indigo-950/50 to-purple-950/70 border border-purple-500/40 shadow-xl space-y-3 ${className}`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5">
                                <Send className="h-3 w-3 mr-1 inline" /> Send-to-Kindle Notice
                            </Badge>
                            <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px]">
                                Action Required
                            </Badge>
                            {userKindleEmail && (
                                <span className="text-[11px] text-muted-foreground font-mono hidden sm:inline">
                                    Target: {userKindleEmail}
                                </span>
                            )}
                        </div>

                        <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-1.5">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>⚡ Outbound Sender Updated to {senderEmail}</span>
                        </h4>

                        <p className="text-xs text-muted-foreground leading-relaxed max-w-4xl">
                            If you previously configured your Kindle settings with an older address, please update your Amazon Approved Personal Document E-mail List with{" "}
                            <span className="font-mono font-bold text-purple-300 bg-purple-500/10 px-1 py-0.5 rounded border border-purple-500/20">
                                {senderEmail}
                            </span>{" "}
                            at{" "}
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 underline font-semibold break-all inline-flex items-center gap-0.5"
                            >
                                <span>https://www.amazon.com/hz/mycd/myx#/home/settings/payment</span>
                                <ExternalLink className="h-2.5 w-2.5 inline shrink-0" />
                            </a>{" "}
                            so your wireless Kindle deliveries continue uninterrupted.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            asChild
                            className="text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10 h-8 sm:h-9 shrink-0 whitespace-nowrap"
                        >
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1"
                            >
                                <span>Amazon Settings</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setNoticeModalOpen(true)}
                            className="text-xs bg-purple-950/60 hover:bg-purple-900/60 text-purple-200 border border-purple-500/30 h-8 sm:h-9 gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            <BookOpen className="h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-nowrap">View Guide</span>
                        </Button>

                        <Button
                            type="button"
                            size="sm"
                            onClick={handleAcknowledge}
                            disabled={acknowledging}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-md shadow-purple-900/30 h-8 sm:h-9 shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-nowrap">{acknowledging ? "Saving..." : "I've Updated on Amazon"}</span>
                        </Button>
                    </div>
                </div>
            </div>

            {noticeModalOpen && (
                <KindleSenderUpdateModal
                    open={noticeModalOpen}
                    onOpenChange={setNoticeModalOpen}
                    userKindleEmail={userKindleEmail}
                    senderEmail={senderEmail}
                    onAcknowledged={() => {
                        setNeedsNotice(false);
                        setNoticeModalOpen(false);
                    }}
                />
            )}
        </>
    );
}

export default KindleSenderUpdateBanner;
