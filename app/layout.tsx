import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import ModuleRouteGuard from "@/components/auth/ModuleRouteGuard";
import DashboardNotifications from "@/shared/DashboardNotifications";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PrivacyAnalytics from "@/components/analytics/PrivacyAnalytics";
import AppLogoLink from "@/components/layout/AppLogoLink";
import UsageTracker from "@/components/usage/UsageTracker";
import { isUsage360Enabled } from "@/lib/usage/usageFlag";
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
          {/* GA yalnız herkese açık sayfa + oturumsuz ziyaretçi (bileşen içinde kapılı);
              Vercel Analytics/Speed Insights URL'leri maskelenir (UUID/query yok). */}
          <GoogleAnalytics />
          <PrivacyAnalytics />
          {/* Usage360: USAGE360_ENABLED (sunucu env, varsayılan KAPALI) false iken ağ isteği YOK. */}
          <UsageTracker enabled={isUsage360Enabled()} />
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