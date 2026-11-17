import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Book & Audiobook Library",
    description: "Browse ebooks and audiobooks, stream chapters, or send to Kindle."
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
    return children;
}
