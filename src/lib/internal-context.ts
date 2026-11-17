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
