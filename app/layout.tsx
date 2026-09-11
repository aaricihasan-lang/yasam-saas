import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {/* NextIntlClientProvider, mesajları/locale'i istek yapılandırmasından
            (i18n/request.ts) otomatik devralır — çıkarılan namespace'ler istemci
            bileşenlerinde de kullanılabilir. TR source olduğundan çıkarılmamış
            metinler aynen render olur (regresyon-güvenli). */}
        <NextIntlClientProvider>
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
        </NextIntlClientProvider>
      </body>
    </html>
  );
}