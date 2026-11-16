import { redirect } from "next/navigation";
import { getCurrentUser } from "@/app/auth-actions";
import { getUserProfileBootstrapAction } from "@/app/actions";
import UserProfileClient from "@/components/profile/profile-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const user = await getCurrentUser().catch(() => null);
    if (!user) {
        redirect("/login");
    }

    const bootstrap = await getUserProfileBootstrapAction(false, { skipLiveMediaServers: true }).catch(() => null);
    return <UserProfileClient initialBootstrap={bootstrap} />;
}
