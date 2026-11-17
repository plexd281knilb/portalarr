import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import LayoutWrapper from "@/components/layout-wrapper";
import { getBuildTelemetry } from "@/lib/version";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export function generateMetadata(): Metadata {
  const telemetry = getBuildTelemetry();
  const titlePrefix = telemetry.isBeta ? "[BETA] " : telemetry.isStable ? "" : "[DEV] ";

  return {
    title: {
      default: `${titlePrefix}DomsHomeLab | d281knilb Media Server`,
      template: `%s | ${titlePrefix}DomsHomeLab`,
    },
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
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
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