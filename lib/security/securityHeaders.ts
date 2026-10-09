/**
 * Güvenlik başlıkları + CSP (FAZ1 FINAL HARDENING — PAKET INFRA).
 *
 * SAF modül: next.config.ts (build/başlatma anında) ve test harness'i import eder.
 * `@/` alias'ı KULLANILMAZ (next.config.ts transpile'ında alias çözülmez) ve hiçbir
 * runtime bağımlılığı yoktur.
 *
 * STRATEJİ:
 *   - TAM izin listeli CSP artık ZORUNLU (enforced) `Content-Security-Policy` başlığıdır
 *     (satış öncesi AŞAMA 2A; önceki gözlem dönemi Report-Only idi). Supabase (imzalı URL,
 *     TUS resumable upload), blob:/data: önizlemeler, Word/PDF indirmeleri, Vercel Analytics /
 *     Speed Insights ve (yalnız herkese açık sayfalarda yüklenen) Google Analytics hostları
 *     listededir.
 *   - NOT (object-src): Hacamat rapor sayfası PDF önizlemesini `<object data="blob:…">`
 *     ile gösterir (app/cosmic-calendar/hacamat/report). `object-src 'none'` bu önizlemeyi
 *     kırar → 'self' blob: (eklenti/Flash/dış kaynak yine yasak).
 *   - 'unsafe-inline' (script/style) bilinçli olarak KORUNUR; nonce + 'strict-dynamic'
 *     geçişi satış sonrası ayrı iştir.
 *
 * Android WebView uygulamayı üst seviye yükler (iframe DEĞİL) → frame-ancestors 'self' ve
 * X-Frame-Options SAMEORIGIN WebView'ı etkilemez.
 */

export type HeaderEntry = { key: string; value: string };

export type SecurityHeaderOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL (build anında). Yoksa *.supabase.co joker'i kullanılır. */
  supabaseUrl?: string | null;
  /** Geliştirme modunda React hata yığını için 'unsafe-eval' gerekir (Next CSP rehberi). */
  isDev?: boolean;
};

/** Google Analytics (GA4) hostları — GA yalnız herkese açık sayfalarda yüklenir. */
export const GA_SCRIPT_HOSTS = ["https://www.googletagmanager.com"] as const;
export const GA_CONNECT_HOSTS = [
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://*.googletagmanager.com",
] as const;
export const GA_IMG_HOSTS = [
  "https://*.google-analytics.com",
  "https://*.googletagmanager.com",
] as const;

/** Vercel Analytics / Speed Insights (üretimde same-origin /_vercel/*; dev'de CDN). */
const VERCEL_SCRIPT_HOSTS = ["https://va.vercel-scripts.com"] as const;
/** Vercel önizleme (preview) araç çubuğu — yalnız preview dağıtımlarında görünür. */
const VERCEL_LIVE = "https://vercel.live";

/**
 * Supabase origin'lerini çıkarır: REST/Storage (https), doğrudan storage hostu
 * (<ref>.storage.supabase.co — büyük/TUS yüklemeler) ve realtime (wss).
 * Geçersiz/boş URL → *.supabase.co joker'i (env eksik build'ler için güvenli varsayılan).
 */
export function supabaseOrigins(supabaseUrl?: string | null): {
  https: string[];
  wss: string[];
} {
  const raw = (supabaseUrl ?? "").trim();
  if (raw) {
    try {
      const u = new URL(raw);
      if (u.protocol === "https:" || u.protocol === "http:") {
        const host = u.host;
        const https = [`${u.protocol}//${host}`];
        const wss = [`${u.protocol === "https:" ? "wss" : "ws"}://${host}`];
        const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
        if (m) https.push(`https://${m[1]}.storage.supabase.co`);
        return { https, wss };
      }
    } catch {
      /* geçersiz URL → joker */
    }
  }
  return { https: ["https://*.supabase.co"], wss: ["wss://*.supabase.co"] };
}

function joinDirectives(directives: Array<[string, ReadonlyArray<string>]>): string {
  return directives.map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name)).join("; ");
}

/** Tam izin listeli, zorunlu (enforced) CSP değeri. */
export function buildEnforcedCsp(opts: SecurityHeaderOptions = {}): string {
  const sb = supabaseOrigins(opts.supabaseUrl);
  const self = "'self'";
  return joinDirectives([
    ["default-src", [self]],
    [
      "script-src",
      [
        self,
        // Next.js App Router hidrasyon script'leri + next/script inline'ları (nonce yok).
        "'unsafe-inline'",
        ...(opts.isDev ? ["'unsafe-eval'"] : []),
        ...GA_SCRIPT_HOSTS,
        ...VERCEL_SCRIPT_HOSTS,
        VERCEL_LIVE,
      ],
    ],
    // ~200 inline style kullanımı (style={{…}}) → 'unsafe-inline' şart.
    ["style-src", [self, "'unsafe-inline'"]],
    ["img-src", [self, "data:", "blob:", ...sb.https, ...GA_IMG_HOSTS, VERCEL_LIVE, "https://vercel.com"]],
    // next/font self-host (Geist) → yalnız 'self' + data: (bazı fontlar inline gelebilir).
    ["font-src", [self, "data:"]],
    [
      "connect-src",
      [self, ...sb.https, ...sb.wss, ...GA_CONNECT_HOSTS, ...VERCEL_SCRIPT_HOSTS, VERCEL_LIVE, "wss://ws-us3.pusher.com"],
    ],
    // Kişisel arşiv imzalı Supabase URL iframe'i + refleks PDF data: iframe + blob önizleme.
    ["frame-src", [self, "blob:", "data:", ...sb.https, VERCEL_LIVE]],
    // Kişisel arşiv <audio>/<video> imzalı URL + blob önizleme.
    ["media-src", [self, "blob:", "data:", ...sb.https]],
    ["worker-src", [self, "blob:"]],
    ["manifest-src", [self]],
    ["object-src", [self, "blob:"]],
    ["frame-ancestors", [self]],
    ["base-uri", [self]],
    ["form-action", [self]],
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSP NONCE C1 — CANARY / REPORT-ONLY (yalnız gözlem; hiçbir isteği BLOKLAMAZ)
// ─────────────────────────────────────────────────────────────────────────────

/** C1 canary seçici cookie'si. Kimlik/yetki TAŞIMAZ; yalnız Report-Only gözlem modunu seçer. */
export const CSP_CANARY_COOKIE = "yasam_csp_canary";
/**
 * Report-Only ihlal raporlarının gittiği same-origin uç nokta (yalnız `report-uri`).
 * `report-to` BİLİNÇLİ olarak YOK: Chromium report-to varken report-uri'yi yok sayar ve
 * Reporting API teslimatı gecikmeli/toplu (yerel deneyde 70 sn içinde teslim yok);
 * Firefox report-to desteklemez. report-uri tüm hedef tarayıcılarda anında POST eder.
 */
export const CSP_REPORT_PATH = "/api/security/csp-report";

/**
 * Next.js'in `getScriptNonceFromHeader` kabul ettiği biçim (base64/base64url, ≤2 '=').
 * Bu kalıba uymayan nonce Next tarafından SESSİZCE yok sayılır → üretimde de doğrulanır.
 */
export const CSP_NONCE_RE = /^[A-Za-z0-9+/_-]{16,}={0,2}$/;

export type NonceReportOnlyOptions = {
  /** Geliştirmede React hata yığını eval kullanır; rapor gürültüsünü önlemek için. */
  isDev?: boolean;
};

/**
 * C1 Report-Only CSP: YALNIZ script korumasını gözlemler.
 *   - script-src: 'nonce-…' + 'strict-dynamic' (CSP3 tarayıcıları 'unsafe-inline' ve host
 *     listesini yok sayar; nonce'lı Next chunk'larının createElement ile yüklediği GA /
 *     Vercel Analytics / Roxy bundle'ı 'strict-dynamic' ile güvenilir sayılır).
 *     'self' + host listesi + 'unsafe-inline' yalnız CSP2/eski tarayıcı geri-dönüşüdür.
 *   - style-src ve diğer directive'ler BİLİNÇLİ olarak YOK: zorunlu politika onları zaten
 *     uyguluyor; bu turda stil sıkılaştırması kapsam dışı (211 inline style + <style>).
 *   - 'report-sample' YOK: inline kod parçası rapora girmez.
 */
export function buildNonceReportOnlyCsp(nonce: string, opts: NonceReportOnlyOptions = {}): string {
  if (!CSP_NONCE_RE.test(nonce)) throw new Error("invalid csp nonce");
  return joinDirectives([
    [
      "script-src",
      [
        `'nonce-${nonce}'`,
        "'strict-dynamic'",
        ...(opts.isDev ? ["'unsafe-eval'"] : []),
        "'self'",
        "'unsafe-inline'",
        ...GA_SCRIPT_HOSTS,
        ...VERCEL_SCRIPT_HOSTS,
        VERCEL_LIVE,
      ],
    ],
    ["report-uri", [CSP_REPORT_PATH]],
  ]);
}

/** Tüm rotalara uygulanacak güvenlik başlıkları. */
export function buildSecurityHeaders(opts: SecurityHeaderOptions = {}): HeaderEntry[] {
  return [
    // includeSubDomains BİLİNÇLİ olarak YOK (alt alan adları ayrı değerlendirilecek).
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    {
      key: "Permissions-Policy",
      // camera=(self): Doğaltaş kayıt formundaki <input capture> (kamera) aynı-origin'de kalır.
      value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    },
    { key: "Content-Security-Policy", value: buildEnforcedCsp(opts) },
  ];
}
