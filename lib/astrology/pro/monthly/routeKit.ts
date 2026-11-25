// Gökyüzü Atlası — AYLIK EFEMERİS rota yardımcıları (YALNIZ SUNUCU): kapı (yetki + bayrak + teknik izni), sağlayıcı bağımlılıkları,
// dosya yanıtı. Yönetici (/api/admin/astroloji/…) ve uzman (/api/astroloji/…) yüzeyleri AYNI handler'ı kullanır.
//
// Bayraklar (yalnız sunucu env'i):
//   ATLAS_PRO_EPHEMERIS_ENABLED=0       → Gökyüzü Araçları acil kapatma (mevcut bayrak): tek tip 404.
//   ATLAS_MONTHLY_EPHEMERIS_PROVIDER=0  → aylık efemeris için YENİ sağlayıcı çağrısı yapılmaz (önbellekteki aylar ve kayıtlar
//                                         açılmaya devam eder). Tanımsız/başka değer → açık (ay başına en çok 1 istek).
import "server-only";
import { NextResponse } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASTRO_NO_STORE, astrologyNotFoundResponse, astrologyTechniqueDenied, type requireAstrologyAccess } from "@/lib/astrology/access/ownerGate";
import { ASTRO_GRANT_SKY_EPHEMERIS } from "@/lib/astrology/access/techniqueGrants";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { isProEphemerisEnabled } from "../ephemeris/flags";
import { MONTHLY_MAX_YEAR, MONTHLY_MIN_YEAR } from "./contract";
import { MONTHLY_RECORD_CAP } from "./records";
import { MONTHLY_PROVIDER_LANG, type MonthlyDeps } from "./service";
import { localizeErrorBody, SOURCE_TEXT, type MonthlyText } from "./text";

assertServerOnly("lib/astrology/pro/monthly/routeKit");

export const isMonthlyProviderEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_MONTHLY_EPHEMERIS_PROVIDER !== "0";
/** Kullanıcı başına: tablo isteği (önbellek dahil) saatte 240; YENİ ay hesabı (sağlayıcı isteği) saatte 30. */
export const MONTHLY_RATE = { any: { limit: 240, windowSeconds: 3600 }, provider: { limit: 30, windowSeconds: 3600 } } as const;
/**
 * Maliyet koruması (2026-11-25 gece denetimi): YENİ ay hesabı (önbellek ıskası = 1 ücretli istek) yalnız kullanıcı-saat sınırıyla
 * korunuyordu → çok sayıda farklı ay isteyen istemci ortak aylık kotayı (HD / Numeroloji ile paylaşılan) aşındırabilirdi. Ek tavanlar:
 * kullanıcı başına günlük ve SİSTEM GENELİ saatlik + günlük. Önbellekteki aylar bu sayaçlara GİRMEZ (yalnız sağlayıcı isteğinden hemen
 * önce sayılır). Tüm farklı aylar en çok 2 × 1001 × 12 = 24 024 anahtardır ve her biri kalıcı önbelleğe bir kez yazılır.
 */
export const MONTHLY_PROVIDER_CAPS = [
  { scope: "astro-ephemeris-monthly-provider", perUser: true, limit: MONTHLY_RATE.provider.limit, windowSeconds: MONTHLY_RATE.provider.windowSeconds },
  { scope: "astro-ephemeris-monthly-provider-day", perUser: true, limit: 150, windowSeconds: 86_400 },
  { scope: "astro-ephemeris-monthly-provider-global", perUser: false, limit: 200, windowSeconds: 3600 },
  { scope: "astro-ephemeris-monthly-provider-global-day", perUser: false, limit: 1000, windowSeconds: 86_400 },
] as const;

type Gate = Extract<Awaited<ReturnType<typeof requireAstrologyAccess>>, { ok: true }>;
export type GateCtx = Gate["ctx"];

/**
 * Kapıdan SONRAKİ adım. Kapının kendisi her route handler'ının İLK satırındadır (`requireAstrologyAccess(req)`; static.harness
 * kuralı): Gökyüzü Araçları bayrağı (kapalıyken yetkiliye de tek tip 404) → efemeris teknik izni (403). null = devam.
 */
export function monthlyAfterGate(ctx: GateCtx): Response | null {
  if (!isProEphemerisEnabled()) return astrologyNotFoundResponse();
  return astrologyTechniqueDenied(ctx, ASTRO_GRANT_SKY_EPHEMERIS);
}

export function monthlyDeps(ctx: GateCtx, allowProvider: boolean): MonthlyDeps {
  const config = allowProvider && isMonthlyProviderEnabled() ? readAstroRoxyConfig() : null;
  return {
    db: ctx.db,
    // Ücretli çağrı: yeniden deneme YOK. Dil "en": sağlayıcı cisim/burç adları her dilde İngilizce (yerelleştirilmiş alanlar alınmaz).
    callProvider: config ? (endpoint, body) => callRoxy(config, endpoint, body, { maxRetries: 0, lang: MONTHLY_PROVIDER_LANG }) : null,
    beforeProviderCall: async () => {
      // Sırayla: dar (kullanıcı-saat) → geniş (sistem-gün). İlk dolu tavanda istek ATILMAZ.
      for (const c of MONTHLY_PROVIDER_CAPS) {
        const r = await hitDbRateLimit(ctx.db, rateLimitBucket(c.scope, c.perUser ? `${ctx.tenantId}:${ctx.userId}` : "global"), c.limit, c.windowSeconds);
        if (!r.allowed) {
          if (!c.perUser) console.error("[astro-monthly] sistem geneli yeni ay hesap tavanı doldu", { scope: c.scope, limit: c.limit });
          return { ok: false, retryAfterSec: r.retryAfterSec };
        }
      }
      return { ok: true };
    },
  };
}

export async function anyRate(ctx: GateCtx, L: MonthlyText = SOURCE_TEXT): Promise<Response | null> {
  const rl = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-ephemeris-monthly", `${ctx.tenantId}:${ctx.userId}`), MONTHLY_RATE.any.limit, MONTHLY_RATE.any.windowSeconds);
  if (rl.allowed) return null;
  return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: L.t("errors.tableRate"), retryAfterSec: rl.retryAfterSec }, { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } });
}

export const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: ASTRO_NO_STORE });
/**
 * I18N-F1-R5 (ATLAS-E): kütüphanenin kaynak dilde (tr) ürettiği hata gövdesi → istek dili. Dil ROTA katmanında
 * (lib/i18n/output.resolveOutputLocale — ekranla aynı çerez + yayın kapısı) çözülüp `L` olarak verilir; bu dizin dil katmanını bilmez.
 * Kaynak dilde gövde AYNEN döner (Türkçe yanıt bayt-bayt aynı); yalnız `error` metni değişir — `code`, durum kodu ve diğer alanlar aynı.
 */
export const localizeBody = <B extends Record<string, unknown>>(body: B, L: MonthlyText): B =>
  localizeErrorBody(body, L, { minYear: MONTHLY_MIN_YEAR, maxYear: MONTHLY_MAX_YEAR, recordCap: MONTHLY_RECORD_CAP });

export function fileResponse(out: { bytes: Uint8Array; filename: string; contentType: string }): Response {
  const asciiName = out.filename.replace(/[^\x20-\x7E]/g, "_");
  return new NextResponse(Buffer.from(out.bytes), {
    status: 200,
    headers: {
      "Content-Type": out.contentType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`,
      "Content-Length": String(out.bytes.byteLength),
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const MONTHLY_ERROR_STATUS: Readonly<Record<string, number>> = {
  INVALID_INPUT: 400,
  OUT_OF_RANGE: 400,
  NOT_CACHED: 409,
  RATE_LIMITED: 429,
  PROVIDER_DISABLED: 503,
  PROVIDER_FAILED: 502,
  PROVIDER_INCONSISTENT: 502,
  CROSSCHECK_FAILED: 502,
  CROSSCHECK_UNAVAILABLE: 503,
};
