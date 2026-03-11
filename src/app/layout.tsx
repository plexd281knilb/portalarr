import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/sidebar"; // Ensure this file exists in src/components!

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adminarr Media",
  description: "System Dashboard and Requests",
};

// MAKE SURE THIS LINE SAYS "export default function"
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} flex min-h-screen bg-[#06080D] text-white`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}