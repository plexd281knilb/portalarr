/**
 * Shared security, input canonicalization, CSPRNG, and sanitization helpers.
 * Isomorphic across Node.js Server Actions, Route Handlers, and Client UI components.
 */

const CONFUSABLE_MAP: Record<string, string> = {
  "\u212A": "k", // Kelvin sign
  "\u017F": "s", // Latin small letter long s
  "\u0131": "i", // Latin small letter dotless i
  "\u0130": "i", // Latin capital letter I with dot above
  "\u00DF": "ss",
  "\u1E9E": "ss",
  // Cyrillic lookalikes
  "\u0410": "a", "\u0430": "a",
  "\u0412": "b", "\u0432": "b",
  "\u0415": "e", "\u0435": "e",
  "\u0401": "e", "\u0451": "e",
  "\u0404": "e", "\u0454": "e",
  "\u041A": "k", "\u043A": "k",
  "\u041C": "m", "\u043C": "m",
  "\u041D": "h", "\u043D": "h",
  "\u041E": "o", "\u043E": "o",
  "\u0420": "p", "\u0440": "p",
  "\u0421": "c", "\u0441": "c",
  "\u0422": "t", "\u0442": "t",
  "\u0423": "y", "\u0443": "y",
  "\u0425": "x", "\u0445": "x",
  "\u0406": "i", "\u0456": "i",
  "\u0408": "j", "\u0458": "j",
  "\u0405": "s", "\u0455": "s",
  // Greek lookalikes
  "\u0391": "a", "\u03B1": "a",
  "\u0392": "b", "\u03B2": "b",
  "\u0395": "e", "\u03B5": "e",
  "\u0396": "z", "\u03B6": "z",
  "\u0397": "n", "\u03B7": "n",
  "\u0399": "i", "\u03B9": "i",
  "\u039A": "k", "\u03BA": "k",
  "\u039C": "m", "\u03BC": "m",
  "\u039D": "v", "\u03BD": "v",
  "\u039F": "o", "\u03BF": "o",
  "\u03A1": "p", "\u03C1": "p",
  "\u03A4": "t", "\u03C4": "t",
  "\u03A5": "y", "\u03C5": "u",
  "\u03A7": "x", "\u03C7": "x",
};

const INVISIBLE_OR_CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export function stripDangerousUnicode(raw: unknown): string {
  return String(raw ?? "").replace(INVISIBLE_OR_CONTROL_RE, "").trim();
}

export function canonicalizeIdentifier(raw: unknown): string {
  const nfkc = stripDangerousUnicode(raw).normalize("NFKC");
  let mapped = "";
  for (const ch of nfkc) {
    mapped += CONFUSABLE_MAP[ch] ?? ch;
  }
  return mapped
    .normalize("NFKD")
    .replace(/[\u0300-\u036F]/g, "")
    .toLowerCase()
    .trim();
}

export function validateUsernameInput(
  raw: unknown,
  opts?: { minLen?: number; maxLen?: number }
): { valid: boolean; display: string; canonical: string; error?: string } {
  const str = String(raw ?? "");
  if (INVISIBLE_OR_CONTROL_RE.test(str)) {
    INVISIBLE_OR_CONTROL_RE.lastIndex = 0;
    return {
      valid: false,
      display: "",
      canonical: "",
      error: "Username contains disallowed invisible or control characters.",
    };
  }
  INVISIBLE_OR_CONTROL_RE.lastIndex = 0;

  const display = str.trim();
  const minLen = opts?.minLen ?? 1;
  const maxLen = opts?.maxLen ?? 64;

  if (display.length < minLen) {
    return { valid: false, display: "", canonical: "", error: "Username is required." };
  }
  if (display.length > maxLen) {
    return {
      valid: false,
      display: "",
      canonical: "",
      error: `Username must be ${maxLen} characters or fewer.`,
    };
  }

  const canonical = canonicalizeIdentifier(display);
  if (!canonical) {
    return { valid: false, display: "", canonical: "", error: "Username is invalid." };
  }

  return { valid: true, display, canonical };
}

export function escapeHtml(val: unknown): string {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegex(str: string): string {
  return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function sanitizeHttpUrl(raw: unknown): string {
  const s = stripDangerousUnicode(raw);
  if (!s) return "";
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "";
  } catch {
    return "";
  }
}

export function sanitizeRichHtml(html: unknown): string {
  const raw = String(html ?? "");
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<(object|embed|base|meta|link|form|foreignObject)\b[^>]*>/gi, "")
    .replace(/<\/(object|embed|form|foreignObject)>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|src|action|formaction|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[^"']*\1/gi, "$1#$1");
}

export function sanitizeSvgContent(svg: unknown): string {
  const raw = String(svg ?? "");
  return raw
    .replace(/<!DOCTYPE\b[^>]*>/gi, "")
    .replace(/<!ENTITY\b[^>]*>/gi, "")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:href|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[^"']*\1/gi, "$1#$1");
}

const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function secureRandomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export function secureRandomSlug(length: number = 6): string {
  const bytes = secureRandomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export function secureRandomPassword(byteLength: number = 14): string {
  const bytes = secureRandomBytes(byteLength);
  let b64 = "";
  for (let i = 0; i < bytes.length; i++) {
    b64 += bytes[i].toString(16).padStart(2, "0");
  }
  return `Dh#${b64}!`;
}

export function validateClientIp(rawHeader: string | null | undefined): string {
  const first = String(rawHeader || "")
    .split(",")[0]
    .trim();
  if (!first || first.length > 45) return "127.0.0.1";
  const ipv4Re = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Re = /^[0-9a-fA-F:]+$/;
  if (ipv4Re.test(first)) {
    const octets = first.split(".").map(Number);
    if (octets.every((n) => n >= 0 && n <= 255)) return first;
  }
  if (first.includes(":") && ipv6Re.test(first)) {
    return first;
  }
  return "127.0.0.1";
}

const rateBuckets = new Map<string, number[]>();

export function checkRateLimit(
  bucket: string,
  key: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const compositeKey = `${bucket}:${canonicalizeIdentifier(key) || "anon"}`;
  if (rateBuckets.size > 5000) {
    for (const [k, stamps] of rateBuckets.entries()) {
      const fresh = stamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) rateBuckets.delete(k);
      else rateBuckets.set(k, fresh);
    }
  }
  const existing = (rateBuckets.get(compositeKey) || []).filter((t) => now - t < windowMs);
  if (existing.length >= maxRequests) {
    rateBuckets.set(compositeKey, existing);
    return false;
  }
  existing.push(now);
  rateBuckets.set(compositeKey, existing);
  return true;
}
