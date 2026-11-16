import { getPublicJoinConfig, getPlexSetupGuides } from "@/app/actions";
import JoinClient from "@/components/auth/join-client";

export const dynamic = "force-dynamic";

export default async function JoinPage({
    searchParams,
}: {
    searchParams: Promise<{ ref?: string | string[] }>;
}) {
    const resolvedParams = await searchParams.catch(() => ({} as { ref?: string | string[] }));
    const rawRef = resolvedParams?.ref;
    const refParam = Array.isArray(rawRef) ? (rawRef[0] || "") : (rawRef || "");

    const [joinRes, guides] = await Promise.all([
        getPublicJoinConfig(refParam).catch(() => null),
        getPlexSetupGuides().catch(() => []),
    ]);

    return (
        <JoinClient
            initialConfig={joinRes?.success ? joinRes.config : null}
            initialGuides={Array.isArray(guides) ? guides : []}
            initialRef={refParam}
        />
    );
}
