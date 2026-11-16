import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/auth-actions";
import { getTicketsDashboardAction } from "@/app/actions";
import TicketsClient from "@/components/tickets-client";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }

    const initialData = await getTicketsDashboardAction().catch(() => null);
    return <TicketsClient initialData={initialData} />;
}
