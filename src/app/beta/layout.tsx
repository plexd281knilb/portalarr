import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Beta Features",
    description: "Preview experimental Portalarr capabilities."
};

export default function BetaLayout({ children }: { children: React.ReactNode }) {
    return children;
}
