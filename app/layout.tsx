import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ModuleRouteGuard from "@/components/auth/ModuleRouteGuard";
import DashboardNotifications from "@/shared/DashboardNotifications";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import AppLogoLink from "@/components/layout/AppLogoLink";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yaşam Sistemi",
  description: "Yaşam Sistemi Yönetim Paneli",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <AppLogoLink />
        <GoogleAnalytics />
        <Analytics />
        <SpeedInsights />
        <ToastProvider>
          <ConfirmProvider>
            <DashboardNotifications />
            <ModuleRouteGuard>{children}</ModuleRouteGuard>
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}