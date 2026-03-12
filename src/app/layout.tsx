import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar, MobileSidebar } from "@/components/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Adminarr Dashboard",
  description: "Mission Control for Home Lab",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
          {/* UPDATED: Uses bg-background to switch automatically */}
          <div className="flex h-screen overflow-hidden bg-background text-foreground">
            
            {/* Desktop Sidebar */}
            <div className="w-64 flex-none hidden md:block">
              <Sidebar />
            </div>
            
            {/* Main Content Wrapper */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              
              {/* Mobile Header */}
              <div className="md:hidden border-b bg-background p-4 flex items-center gap-3">
                 <MobileSidebar /> 
                 <span className="font-bold text-lg">Adminarr</span>
              </div>

              {/* Scrollable Page Content */}
              <main className="flex-1 overflow-y-auto p-4">
                {children}
              </main>
            </div>

          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}