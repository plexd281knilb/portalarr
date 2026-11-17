import type { Metadata } from "next";
import TicketsPage from "@/app/tickets/page";

export const metadata: Metadata = {
    title: "Support Tickets & Triage",
    description: "Review and resolve member support tickets and fix suggestions."
};

export const dynamic = "force-dynamic";

export default async function AdminTicketsPage() {
    return <TicketsPage />;
}
