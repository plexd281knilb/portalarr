import type { Metadata } from "next";
import { getCurrentUser } from "@/app/auth-actions";
import { getPublicJoinConfig } from "@/app/actions";
import PendingClient from "@/components/auth/pending-client";

export const metadata: Metadata = {
    title: "Membership Status",
    description: "Review pending approval, trial status, or subscription renewal payment options."
};

export const dynamic = "force-dynamic";

export default async function PendingPage() {
    const [user, joinConfig] = await Promise.all([
        getCurrentUser().catch(() => null),
        getPublicJoinConfig().catch(() => null),
    ]);

    return (
        <PendingClient
            initialUser={user}
            initialPaymentConfig={joinConfig?.success ? joinConfig.config : null}
        />
    );
}
