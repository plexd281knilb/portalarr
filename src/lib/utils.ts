import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Universal clipboard copy utility that works seamlessly in HTTPS and non-secure LAN HTTP contexts.
 * Uses navigator.clipboard.writeText when available and falls back to a hidden textarea + execCommand.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn("[CLIPBOARD] navigator.clipboard.writeText failed, falling back to textarea:", err);
    }
  }

  if (typeof document !== "undefined") {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      textArea.style.opacity = "0";
      textArea.style.pointerEvents = "none";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      if (textArea.setSelectionRange) {
        textArea.setSelectionRange(0, text.length);
      }
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (execErr) {
      console.error("[CLIPBOARD] execCommand copy failed:", execErr);
    }
  }

  return false;
}

