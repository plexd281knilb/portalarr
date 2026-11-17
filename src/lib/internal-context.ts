import { AsyncLocalStorage } from "node:async_hooks";

const internalExecutionStorage = new AsyncLocalStorage<boolean>();

/**
 * Marks the asynchronous call chain as originating from trusted server-side business logic
 * (cannot be spoofed by external Next-Action HTTP requests or serialized arguments).
 */
export function runAsServerInternal<T>(fn: () => Promise<T>): Promise<T> {
    return internalExecutionStorage.run(true, fn);
}

export function isServerInternalActive(): boolean {
    return internalExecutionStorage.getStore() === true;
}

/**
 * Returns true only when invoked directly over HTTP as a Next.js Server Action (`next-action` header)
 * outside a trusted `runAsServerInternal()` execution chain or test harness.
 */
export async function isDirectExternalServerActionCall(): Promise<boolean> {
    if (isServerInternalActive()) return false;
    if (process.env.NODE_ENV !== "production" && (process.env.PORTALARR_TEST === "true" || process.env.PORTALARR_TEST_AUTH === "true")) {
        return false;
    }
    try {
        const { headers } = await import("next/headers");
        const h = await headers();
        return Boolean(h.get("next-action"));
    } catch {
        return false;
    }
}
