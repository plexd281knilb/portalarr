import { checkSystemInitialized } from "@/app/auth-actions";
import LoginClient from "@/components/auth/login-client";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
    const initialized = await checkSystemInitialized().catch(() => true);
    return <LoginClient initialIsSetupMode={!initialized} />;
}
