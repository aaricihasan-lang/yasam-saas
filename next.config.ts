import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// Relative import (alias YOK): next.config.ts transpile'ında `@/` çözülmez.
import { buildBaseSecurityHeaders, buildSecurityHeaders } from "./lib/security/securityHeaders";

// next-intl (URL-prefix'siz, TR source). İstek yapılandırması: ./i18n/request.ts
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // "X-Powered-By: Next.js" başlığı gönderilmez (sürüm/altyapı ifşası azaltılır).
  poweredByHeader: false,

  // FAZ1 FINAL HARDENING (INFRA): tüm yanıtlara güvenlik başlıkları. Ayrıntı:
  // lib/security/securityHeaders.ts.
  // CSP NONCE C1-v2: DOKÜMAN CSP'sinin tek kaynağı proxy.ts'tir (Vercel'de next.config CSP'si
  // render'ın istek başlığını ezer → nonce kaybolur, vercel/next.js#99360). Burada CSP YALNIZ
  // proxy'nin ÇALIŞMADIĞI yollara verilir (proxy matcher'ının tersi) → bugünkü kapsam korunur,
  // doküman render'ıyla çakışma yoktur.
  async headers() {
    const csp = buildSecurityHeaders({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      isDev: process.env.NODE_ENV === "development",
    }).filter((h) => h.key === "Content-Security-Policy");
    return [
      { source: "/:path*", headers: buildBaseSecurityHeaders() },
      { source: "/api/:path*", headers: csp },
      { source: "/_next/:path*", headers: csp },
      { source: "/_vercel/:path*", headers: csp },
      // Uzantılı statik dosyalar (favicon, robots.txt, görseller…) — proxy bunları hariç tutar.
      { source: "/:path((?!api/|_next/|_vercel/|admin/).*\\..*)", headers: csp },
      // Prefetch / RSC istekleri proxy'ye girmez (yalnız /admin hariç; orada proxy CSP'yi kendi yazar).
      { source: "/:path((?!admin$|admin/).*)", has: [{ type: "header", key: "rsc" }], headers: csp },
      { source: "/:path((?!admin$|admin/).*)", has: [{ type: "header", key: "next-router-prefetch" }], headers: csp },
      { source: "/:path((?!admin$|admin/).*)", has: [{ type: "header", key: "purpose", value: "prefetch" }], headers: csp },
    ];
  },
  async redirects() {
    return [
      { source: "/dashboard/cosmic-calendar",                  destination: "/cosmic-calendar",                  permanent: true },
      { source: "/dashboard/cosmic-calendar/hacamat",          destination: "/cosmic-calendar/hacamat",          permanent: true },
      { source: "/dashboard/cosmic-calendar/hacamat/report",   destination: "/cosmic-calendar/hacamat/report",   permanent: true },
      { source: "/dashboard/cosmic-calendar/moon-phases",      destination: "/cosmic-calendar/moon-phases",      permanent: true },
      { source: "/dashboard/cosmic-calendar/power-days",       destination: "/cosmic-calendar/power-days",       permanent: true },
      { source: "/dashboard/cosmic-calendar/retro-calendar",   destination: "/cosmic-calendar/retro-calendar",   permanent: true },
      { source: "/dashboard/cosmic-calendar/transits/:planet", destination: "/cosmic-calendar/transits/:planet", permanent: true },
      // Vücut & Nokta Atlası V1'den çıkarıldı (ileri versiyona ertelendi); altyapı korunur.
      // Geçici (permanent:false) — ileri versiyonda geri gelebilir. Spesifik kurallar
      // /dashboard/kupa/:path* joker'inden ÖNCE gelmeli (ilk eşleşen kazanır).
      { source: "/dashboard/kupa/nokta-atlasi", destination: "/kupa",    permanent: false },
      { source: "/kupa/nokta-atlasi",      destination: "/kupa",         permanent: false },
      { source: "/dashboard/kupa",         destination: "/kupa",         permanent: true },
      { source: "/dashboard/kupa/:path*",  destination: "/kupa/:path*",  permanent: true },
    ];
  },
  // unpdf uses dynamic import('unpdf/pdfjs') internally (1.6MB ESM bundle).
  // Bundling it via Turbopack causes the dynamic import to fail at runtime on Vercel.
  // Marking as external lets Node.js resolve it directly from node_modules.
  serverExternalPackages: ["unpdf", "@resvg/resvg-js"],

  // Refleksoloji premium Word raporu klinik ayak PNG'lerini server-side (fs) okur;
  // Vercel output tracing bunları route bundle'ına dahil etsin (ağ fetch YOK).
  outputFileTracingIncludes: {
    "/api/refleksoloji/protocol-report": ["./public/refleksoloji/klinik_*.png"],
    // Anamnez boş form PDF'i Türkçe karakter için Geist TTF'yi fs ile okur.
    "/api/clients/[id]/anamnez/blank-form": ["./public/fonts/Geist-Regular.ttf"],
    // Kayıtlı (dolu) anamnez PDF'i aynı fontu kullanır.
    "/api/clients/[id]/anamnez/[anamnesisId]/pdf": ["./public/fonts/Geist-Regular.ttf"],
    // Human Design profesyonel Word (v2) kapak logosu fs ile okunur.
    "/api/hd/reports/professional/download": ["./public/assets/yasam-sistemi-chart-logo.png"],
  },

  experimental: {
    // Next.js routes ALL multipart/form-data POST requests through the Server Actions
    // pipeline, even regular Route Handlers. The default bodySizeLimit is 1MB.
    // Large file uploads (PDF conversion) require a higher limit.
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default withNextIntl(nextConfig);
