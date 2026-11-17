import type { Metadata } from "next";
import { checkSystemInitialized } from "@/app/auth-actions";
import LoginClient from "@/components/auth/login-client";

export const metadata: Metadata = {
    title: "Sign In",
    description: "Sign in to DomsHomeLab via Plex SSO or portal credentials."
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
    const initialized = await checkSystemInitialized().catch(() => true);
    return <LoginClient initialIsSetupMode={!initialized} />;
}
