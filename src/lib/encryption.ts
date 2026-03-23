import crypto from "crypto";

if (!process.env.JWT_SECRET) {
    throw new Error("FATAL: JWT_SECRET environment variable is missing. The server cannot start securely.");
}

const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(process.env.JWT_SECRET)).digest('base64').substring(0, 32);
const ALGORITHM = 'aes-256-gcm';

export function encryptData(text: string) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
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
        
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
        decipher.setAuthTag(authTag);
        
        // FIX: Remove 'hex' because encryptedText is already a Buffer
        let decrypted = decipher.update(encryptedText, undefined, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed. Invalid key or tampered data.");
        return "";
    }
}