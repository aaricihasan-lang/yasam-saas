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
import { MONTHLY_PROVIDER_LANG, type MonthlyDeps } from "./service";

assertServerOnly("lib/astrology/pro/monthly/routeKit");

export const isMonthlyProviderEnabled = (env: NodeJS.ProcessEnv = process.env) => env.ATLAS_MONTHLY_EPHEMERIS_PROVIDER !== "0";
/** Kullanıcı başına: tablo isteği (önbellek dahil) saatte 240; YENİ ay hesabı (sağlayıcı isteği) saatte 30. */
export const MONTHLY_RATE = { any: { limit: 240, windowSeconds: 3600 }, provider: { limit: 30, windowSeconds: 3600 } } as const;

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
      const r = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-ephemeris-monthly-provider", `${ctx.tenantId}:${ctx.userId}`), MONTHLY_RATE.provider.limit, MONTHLY_RATE.provider.windowSeconds);
      return r.allowed ? { ok: true } : { ok: false, retryAfterSec: r.retryAfterSec };
    },
  };
}

export async function anyRate(ctx: GateCtx): Promise<Response | null> {
  const rl = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-ephemeris-monthly", `${ctx.tenantId}:${ctx.userId}`), MONTHLY_RATE.any.limit, MONTHLY_RATE.any.windowSeconds);
  if (rl.allowed) return null;
  return NextResponse.json({ ok: false, code: "RATE_LIMITED", error: "Kısa sürede çok fazla tablo istendi. Lütfen biraz sonra tekrar deneyin.", retryAfterSec: rl.retryAfterSec }, { status: 429, headers: { ...ASTRO_NO_STORE, "Retry-After": String(rl.retryAfterSec) } });
}

export const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: ASTRO_NO_STORE });

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
};
