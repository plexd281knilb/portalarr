import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserNavbar } from "@/components/user-navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Dom's Homelab",
  description: "User Portal for Dom's Server",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <UserNavbar />
        <main className="min-h-screen bg-background text-foreground">{children}</main>
      </body>
    </html>
  );
}