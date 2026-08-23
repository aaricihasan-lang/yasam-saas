import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl (URL-prefix'siz, TR source). İstek yapılandırması: ./i18n/request.ts
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
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
  serverExternalPackages: ["unpdf"],

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
