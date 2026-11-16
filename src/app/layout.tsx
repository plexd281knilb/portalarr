import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import LayoutWrapper from "@/components/layout-wrapper";
import { getBuildTelemetry } from "@/lib/version";

const inter = Inter({ subsets: ["latin"] });

export function generateMetadata(): Metadata {
  const telemetry = getBuildTelemetry();
  const titlePrefix = telemetry.isBeta ? "[BETA] " : telemetry.isStable ? "" : "[DEV] ";

  return {
    title: `${titlePrefix}DomsHomeLab | d281knilb Media Server`,
    description: "DomsHomeLab (d281knilb) Media Server & Dashboard",
    icons: {
      icon: [
        { url: telemetry.iconSvgPath, type: "image/svg+xml" },
        { url: telemetry.iconPngPath, type: "image/png", sizes: "512x512" },
      ],
      shortcut: [telemetry.faviconIcoPath],
      apple: [{ url: telemetry.iconPngPath, type: "image/png", sizes: "512x512" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            forcedTheme="dark"
            disableTransitionOnChange
          >
          <LayoutWrapper>
              {children}
          </LayoutWrapper>
        </ThemeProvider>
      </body>
    </html>
  );
}