/**
 * Payment Deep Linking & Universal URL Helper
 * Converts payment handles (Venmo, PayPal, Cash App, Zelle) into clickable deep links
 * that automatically launch native mobile apps on iOS/Android or web portals on desktop.
 */

export interface PaymentLinkInfo {
    provider: "paypal" | "venmo" | "cashapp" | "zelle";
    providerName: string;
    url: string;
    displayLabel: string;
    actionText: string;
    badgeColorClass: string;
    badgeBgClass: string;
    hoverBorderClass: string;
}

export function getPaymentLink(
    provider: "paypal" | "venmo" | "cashapp" | "zelle",
    rawValue?: string | null
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

    // 1. If already a full URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
        let display = value.replace(/^https?:\/\/(www\.)?/, "");
        if (display.endsWith("/")) display = display.slice(0, -1);

        return {
            provider,
            providerName,
            url: value,
            displayLabel: display,
            actionText: `Open ${providerName}`,
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
            // Venmo handle (strip leading @)
            const cleanHandle = value.replace(/^@+/, "");
            return {
                provider,
                providerName: "Venmo",
                // https://venmo.com/u/handle opens Venmo app on mobile or web profile on desktop
                url: `https://venmo.com/u/${encodeURIComponent(cleanHandle)}`,
                displayLabel: `@${cleanHandle}`,
                actionText: "Open Venmo",
                badgeColorClass: "text-sky-400",
                badgeBgClass: "bg-sky-500/10 text-sky-400 border-sky-500/30",
                hoverBorderClass: "hover:border-sky-500/50 hover:bg-sky-500/[0.04]",
            };
        }
        case "paypal": {
            if (value.includes("@") && value.includes(".")) {
                // Email address recipient
                return {
                    provider,
                    providerName: "PayPal",
                    url: `https://www.paypal.com/myaccount/transfer/homepage/buy/preview?recipient=${encodeURIComponent(value)}`,
                    displayLabel: value,
                    actionText: "Pay with PayPal",
                    badgeColorClass: "text-blue-400",
                    badgeBgClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                    hoverBorderClass: "hover:border-blue-500/50 hover:bg-blue-500/[0.04]",
                };
            }
            // Username / paypal.me handle
            const cleanHandle = value.replace(/^@+/, "").replace(/^paypal\.me\//i, "");
            return {
                provider,
                providerName: "PayPal",
                url: `https://paypal.me/${encodeURIComponent(cleanHandle)}`,
                displayLabel: `paypal.me/${cleanHandle}`,
                actionText: "Open PayPal",
                badgeColorClass: "text-blue-400",
                badgeBgClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
                hoverBorderClass: "hover:border-blue-500/50 hover:bg-blue-500/[0.04]",
            };
        }
        case "cashapp": {
            // Cashtag (strip leading $ or @)
            const cleanTag = value.replace(/^[$@]+/, "");
            return {
                provider,
                providerName: "Cash App",
                // https://cash.app/$tag opens Cash App on mobile or payment screen on desktop
                url: `https://cash.app/$${encodeURIComponent(cleanTag)}`,
                displayLabel: `$${cleanTag}`,
                actionText: "Open Cash App",
                badgeColorClass: "text-emerald-400",
                badgeBgClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                hoverBorderClass: "hover:border-emerald-500/50 hover:bg-emerald-500/[0.04]",
            };
        }
        case "zelle": {
            const isEmail = value.includes("@") && value.includes(".");
            const url = isEmail
                ? `mailto:${encodeURIComponent(value)}?subject=${encodeURIComponent("Portalarr Subscription Payment")}`
                : "https://www.zellepay.com/get-started";
            return {
                provider,
                providerName: "Zelle",
                url,
                displayLabel: value,
                actionText: isEmail ? "Send Email / Zelle" : "Open Zelle",
                badgeColorClass: "text-purple-400",
                badgeBgClass: "bg-purple-500/10 text-purple-400 border-purple-500/30",
                hoverBorderClass: "hover:border-purple-500/50 hover:bg-purple-500/[0.04]",
            };
        }
    }
}
