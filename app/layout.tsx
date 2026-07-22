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

// KÖK NEDEN (HD-0 image UX mobil bug'ları): width=device-width olmadan Next.js
// App Router kısmi viewport export'u <meta viewport>'a device-width EKLEMEZ →
// mobil tarayıcı ~980px layout viewport kullanır → window.innerWidth ≥ 768 →
// useIsMobileOrPwa telefonda false döner → mobil UI dalları (Değiştir gizleme,
// iki aşamalı silme) aktifleşmez. width=device-width + initialScale bunu düzeltir.
// (maximumScale bilinçli olarak set EDİLMEZ → sayfa pinch-zoom a11y'si korunur.)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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