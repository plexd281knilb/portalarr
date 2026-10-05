import crypto from "crypto";

export function getJwtSecret(): Uint8Array {
    const raw = process.env.JWT_SECRET || "build-time-fallback-key";
    return new TextEncoder().encode(raw);
}

export function getEncryptionKey(): string {
    const raw = process.env.JWT_SECRET || "build-time-fallback-key";
    return crypto.createHash('sha256').update(raw).digest('base64').substring(0, 32);
}
