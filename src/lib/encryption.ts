import crypto from "crypto";
import { getEncryptionKey } from "./auth-secret";

const ALGORITHM = 'aes-256-gcm';

export function encryptData(text: string) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptData(text: string) {
    if (!text) return text;
    try {
        const parts = text.split(':');
        if (parts.length !== 3) return text; 
        
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encryptedText = Buffer.from(parts[2], 'hex');
        const key = getEncryptionKey();
        
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedText, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed. Invalid key or tampered data.");
        return "";
    }
}