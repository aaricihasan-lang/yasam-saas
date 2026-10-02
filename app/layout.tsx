import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import ModuleRouteGuard from "@/components/auth/ModuleRouteGuard";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { ToastProvider } from "@/components/ui/ToastProvider";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PrivacyAnalytics from "@/components/analytics/PrivacyAnalytics";
import AnalyticsConsentBanner from "@/components/analytics/AnalyticsConsentBanner";
import AppLogoLink from "@/components/layout/AppLogoLink";
import UsageTracker from "@/components/usage/UsageTracker";
import { isUsage360Enabled } from "@/lib/usage/usageFlag";
import { platformFlags } from "@/lib/platform/outputSupport";
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
  // Yetenek bazlı çıktı görünürlüğü (SSR, flash yok): Android → Word gizli; Android uygulama
  // WebView → blob/print tabanlı çıktılar gizli (app/globals.css .no-android / .no-android-app).
  // NOT: layout zaten istek-zamanlı (getLocale); sayfa statik/önbellekli yapılırsa UA'ya bağlı
  // bu attribute'lar önbelleğe girer — o durumda yeniden değerlendirilmeli.
  const platform = platformFlags((await headers()).get("user-agent"));
  return (
    <html
      lang={locale}
      data-android={platform.android ? "" : undefined}
      data-android-app={platform.androidApp ? "" : undefined}
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-x-hidden antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        {/* NextIntlClientProvider, mesajları/locale'i istek yapılandırmasından
            (i18n/request.ts) otomatik devralır — çıkarılan namespace'ler istemci
            bileşenlerinde de kullanılabilir. TR source olduğundan çıkarılmamış
            metinler aynen render olur (regresyon-güvenli). */}
        <NextIntlClientProvider>
          {/* GA yalnız herkese açık sayfa + oturumsuz ziyaretçi + AÇIK RIZA (consent) ile
              (bileşen içinde kapılı); Vercel Analytics/Speed Insights URL'leri maskelenir. */}
          <GoogleAnalytics />
          <PrivacyAnalytics />
          <AnalyticsConsentBanner />
          {/* Usage360: USAGE360_ENABLED (sunucu env, varsayılan KAPALI) false iken ağ isteği YOK. */}
          <UsageTracker enabled={isUsage360Enabled()} />
          <ToastProvider>
            <ConfirmProvider>
              {/* Üst bar bildirim zilini (header akışında, fixed DEĞİL) içerir → toast için
                  ToastProvider içinde. Hub'da zil hero başlığında render edilir. */}
              <AppLogoLink />
              <ModuleRouteGuard>{children}</ModuleRouteGuard>
            </ConfirmProvider>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}