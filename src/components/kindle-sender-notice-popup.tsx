"use client";

import { useEffect, useState } from "react";
import { getKindleSenderUpdateNoticeStatusAction } from "@/app/actions";
import { KindleSenderUpdateModal } from "@/components/kindle-sender-update-modal";

const SESSION_DISMISS_KEY = "portalarr_kindle_notice_dismissed_session";

export function KindleSenderNoticePopup() {
    const [open, setOpen] = useState(false);
    const [userKindleEmail, setUserKindleEmail] = useState<string | null>(null);
    const [senderEmail, setSenderEmail] = useState("kindle@domshomelab.com");
    const [acknowledged, setAcknowledged] = useState(false);

    useEffect(() => {
        let mounted = true;

        async function checkNotice() {
            // If the user already clicked "Remind Me Later" during this active browser session,
            // don't interrupt them again until their next visit/session.
            try {
                if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "true") {
                    return;
                }
            } catch {}

            try {
                const res = await getKindleSenderUpdateNoticeStatusAction();
                if (!mounted) return;

                if (res?.needsNotice) {
                    setUserKindleEmail(res.kindleEmail);
                    if (res.senderEmail) {
                        setSenderEmail(res.senderEmail);
                    }
                    setOpen(true);
                }
            } catch (err) {
                console.error("[KINDLE-NOTICE-POPUP-CHECK-FAILED]:", err);
            }
        }

        checkNotice();

        return () => {
            mounted = false;
        };
    }, []);

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen && !acknowledged) {
            // Dismissed temporarily for this session (e.g. "Remind Me Later" or backdrop click)
            try {
                sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
            } catch {}
        }
    };

    const handleAcknowledged = () => {
        setAcknowledged(true);
        setOpen(false);
        try {
            sessionStorage.removeItem(SESSION_DISMISS_KEY);
        } catch {}
    };

    if (!open) return null;

    return (
        <KindleSenderUpdateModal
            open={open}
            onOpenChange={handleOpenChange}
            userKindleEmail={userKindleEmail}
            senderEmail={senderEmail}
            onAcknowledged={handleAcknowledged}
        />
    );
}

export default KindleSenderNoticePopup;
