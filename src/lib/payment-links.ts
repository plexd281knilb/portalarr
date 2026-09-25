/**
 * Payment Deep Linking & Universal URL Helper
 * Converts payment handles (Venmo, PayPal, Cash App, Zelle) into clickable deep links
 * that automatically launch native mobile apps on iOS/Android or web portals on desktop,
 * pre-filling amounts and custom memo tags for automatic reconciliation.
 */

export interface PaymentLinkOptions {
    username?: string;
    amount?: number;
    memo?: string;
    cadence?: "yearly" | "monthly" | "custom";
}

export interface PaymentLinkInfo {
    provider: "paypal" | "venmo" | "cashapp" | "zelle";
    providerName: string;
    url: string;
    displayLabel: string;
    actionText: string;
    memoTag: string;
    badgeColorClass: string;
    badgeBgClass: string;
    hoverBorderClass: string;
}

/**
 * Generates standard reconciliation memo tag e.g. "#PORTALARR-ALICE-OCT2026"
 */
export function generatePaymentMemo(username?: string, date: Date = new Date()): string {
    const cleanUser = (username || "USER").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const month = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
    const year = date.getFullYear();
    return `#PORTALARR-${cleanUser}-${month}${year}`;
}

export function getPaymentLink(
    provider: "paypal" | "venmo" | "cashapp" | "zelle",
    rawValue?: string | null,
    options?: PaymentLinkOptions
): PaymentLinkInfo | null {
    const value = (rawValue || "").trim();
    if (!value) return null;

    const providerNames: Record<string, string> = {
        paypal: "PayPal",
        venmo: "Venmo",
        cashapp: "Cash App",
        zelle: "Zelle",
    };

    const providerName = providerNames[provider] || provider;
    const memoTag = options?.memo || generatePaymentMemo(options?.username);
    const amount = options?.amount;

    // 1. If already a full custom URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
        let display = value.replace(/^https?:\/\/(www\.)?/, "");
        if (display.endsWith("/")) display = display.slice(0, -1);

        return {
            provider,
            providerName,
            url: value,
            displayLabel: display,
            actionText: `Open ${providerName}`,
            memoTag,
            badgeColorClass:
                provider === "paypal"
                    ? "text-blue-400"
                    : provider === "venmo"
                    ? "text-sky-400"
                    : provider === "cashapp"
                    ? "text-emerald-400"
                    : "text-purple-400",
            badgeBgClass:
                provider === "paypal"
                    ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    : provider === "venmo"
                    ? "bg-sky-500/10 text-sky-400 border-sky-500/30"
                    : provider === "cashapp"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-purple-500/10 text-purple-400 border-purple-500/30",
            hoverBorderClass:
                provider === "paypal"
                    ? "hover:border-blue-500/50 hover:bg-blue-500/[0.04]"
                    : provider === "venmo"
                    ? "hover:border-sky-500/50 hover:bg-sky-500/[0.04]"
                    : provider === "cashapp"
                    ? "hover:border-emerald-500/50 hover:bg-emerald-500/[0.04]"
                    : "hover:border-purple-500/50 hover:bg-purple-500/[0.04]",
        };
    }

    // 2. Provider-specific normalization
    switch (provider) {
        case "venmo": {
            const cleanHandle = value.replace(/^@+/, "");
            // Deep link format with txn, note, and amount
            let url = `https://venmo.com/u/${encodeURIComponent(cleanHandle)}`;
            const params: string[] = [];
            params.push("txn=pay");
            if (memoTag) params.push(`note=${encodeURIComponent(memoTag)}`);
            if (amount && amount > 0) params.push(`amount=${amount.toFixed(2)}`);
            if (params.length > 0) {
                url += `?${params.join("&")}`;
            }

            return {
                provider,
                providerName: "Venmo",
                url,
                displayLabel: `@${cleanHandle}`,
                actionText: "Open Venmo",
                memoTag,
                badgeColorClass: "text-sky-400",
                badgeBgClass: "bg-sky-500/10 text-sky-400 border-sky-500/30",
                hoverBorderClass: "hover:border-sky-500/50 hover:bg-sky-500/[0.04]",
            };
        }
        case "paypal": {
            if (value.includes("@") && value.includes(".")) {
                return {
                    provider,
                    providerName: "PayPal",
                    url: `https://www.paypal.com/myaccount/transfer/homepage/buy/preview?recipient=${encodeURIComponent(value)}`,
                    displayLabel: value,
                    actionText: "Pay with PayPal",
                    memoTag,
                    badgeColorClass: "text-blue-400",
                    badgeBgClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                    hoverBorderClass: "hover:border-blue-500/50 hover:bg-blue-500/[0.04]",
                };
            }
            const cleanHandle = value.replace(/^@+/, "").replace(/^paypal\.me\//i, "");
            let url = `https://paypal.me/${encodeURIComponent(cleanHandle)}`;
            if (amount && amount > 0) {
                url += `/${amount.toFixed(2)}`;
            }

            return {
                provider,
                providerName: "PayPal",
                url,
                displayLabel: `paypal.me/${cleanHandle}`,
                actionText: "Open PayPal",
                memoTag,
                badgeColorClass: "text-blue-400",
                badgeBgClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                hoverBorderClass: "hover:border-blue-500/50 hover:bg-blue-500/[0.04]",
            };
        }
        case "cashapp": {
            const cleanTag = value.replace(/^[$@]+/, "");
            let url = `https://cash.app/$${encodeURIComponent(cleanTag)}`;
            if (amount && amount > 0) {
                url += `/${amount.toFixed(2)}`;
            }

            return {
                provider,
                providerName: "Cash App",
                url,
                displayLabel: `$${cleanTag}`,
                actionText: "Open Cash App",
                memoTag,
                badgeColorClass: "text-emerald-400",
                badgeBgClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                hoverBorderClass: "hover:border-emerald-500/50 hover:bg-emerald-500/[0.04]",
            };
        }
        case "zelle": {
            const isEmail = value.includes("@") && value.includes(".");
            const subject = `Portalarr Subscription: ${memoTag}`;
            const body = `Hi,\n\nI am submitting my Portalarr subscription payment.\n\nUsername: ${options?.username || "N/A"}\nMemo Tag: ${memoTag}\nAmount: $${amount || "180.00"}\n\nThank you!`;
            const url = isEmail
                ? `mailto:${encodeURIComponent(value)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
                : "https://www.zellepay.com/get-started";

            return {
                provider,
                providerName: "Zelle",
                url,
                displayLabel: value,
                actionText: isEmail ? "Send Email / Zelle" : "Open Zelle",
                memoTag,
                badgeColorClass: "text-purple-400",
                badgeBgClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
                hoverBorderClass: "hover:border-purple-500/50 hover:bg-purple-500/[0.04]",
            };
        }
    }
}
