// Human Design — Eğitmene Özel Eğitim Haritaları · FAZ 14 KURGUSAL EĞİTİM HARİTASI HESABI (YALNIZ SUNUCU).
//
// Owner kararı (24.10.2026): eğitmen tamamen kurgusal doğum bilgisiyle eğitim haritası oluşturabilir; danışan izni istenmez,
// gerçek kişi kaydı (Danışan Yolculuğu / HD danışan / normal HD arşivi) OLUŞMAZ. Hesap MEVCUT motorla yapılır — yeni hesap motoru
// YOK: aynı konum çözümü (resolveHdBirthLocation), aynı yerel saat / DST kuralı (resolveBirthLocalTime), aynı Roxy istemcisi
// (callRoxyBodygraph), aynı şema doğrulaması + normalizasyon + doğum anı tutarlılık kontrolü, AYNI ücret / kota anahtarları
// (hd-roxy-user / hd-roxy-tenant / hd-roxy-inflight; normal analizlerle ortak sayaç). Ortak danışan servisi (roxyChartService)
// DEĞİŞTİRİLMEDİ; bu modül yalnız aynı adımları eğitim arşivi için sırayla uygular ve sonucu yalnız eğitim kaydında saklar.
// Aynı eğitmen + aynı kurgusal girdi → kayıtlı sonuç (Roxy ÇAĞRILMAZ).

import "server-only";
import { createHash } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveHdBirthLocation } from "@/lib/human-design/api/hdBirthLocation";
import { birthLocalTimeIssue, resolveBirthLocalTime, toHms } from "@/lib/human-design/api/birthTimeResolution";
import { ROXY_POLICY, ROXY_RATE_LIMITS, type RoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import type { RoxyBodygraphRequest, RoxyCallResult } from "@/lib/human-design/providers/roxy/client";
import { validateRoxyBodygraph } from "@/lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "@/lib/human-design/providers/roxy/normalize";
import { checkDesignInstantConsistency } from "@/lib/human-design/providers/roxy/timeConsistency";

assertServerOnly("lib/human-design/education/private/fictionalCompute");

export type FictionalComputeDeps = {
  config: RoxyServerConfig | null;
  callRoxy: (config: RoxyServerConfig, body: RoxyBodygraphRequest, opts: { lang: string; timeoutMs: number }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  /** Aynı eğitmen + aynı kurgusal girdi daha önce kaydedildi mi (kayıt kimliği). */
  findExisting: (inputHash: string) => Promise<string | null>;
  log?: (msg: string, detail?: unknown) => void;
};
export type FictionalComputeInput = { trainerId: string; tenantId: string; isDemo: boolean; birthDate: string; birthTime: string; locationRef: unknown };
export type FictionalComputeOk = {
  ok: true;
  /** Daha önce aynı girdiyle kaydedilmiş kurgusal kayıt (Roxy çağrılmadı). */
  existingItemId: string | null;
  inputHash: string;
  input: { date: string; time: string; place: string; timezone: string; latitude: number; longitude: number; nodeType: string; lang: string } | null;
  chart: Record<string, unknown> | null;
  raw: Record<string, unknown> | null;
};
export type FictionalComputeFail = { ok: false; status: number; code: string; error: string; retryAfterSec?: number };

const fail = (status: number, code: string, error: string, extra: { retryAfterSec?: number } = {}): FictionalComputeFail => ({ ok: false, status, code, error, ...extra });

/** Kurgusal girdi kimliği: eğitmen + tenant + hesap girdisi (gerçek kişi kimliği YOK). */
export function fictionalInputHash(x: { trainerId: string; tenantId: string; date: string; time: string; timezone: string; latitude: number; longitude: number; nodeType: string; lang: string }): string {
  return createHash("sha256").update(JSON.stringify(["hd-edu-kurgusal-1", x.tenantId, x.trainerId, x.date, x.time, x.timezone,
    x.latitude.toFixed(6), x.longitude.toFixed(6), x.nodeType, x.lang])).digest("hex");
}

export async function computeFictionalChart(inp: FictionalComputeInput, deps: FictionalComputeDeps): Promise<FictionalComputeOk | FictionalComputeFail> {
  const policy = ROXY_POLICY;
  const log = deps.log ?? (() => undefined);
  // 1) Demo / vitrin hesap ücretli hesap yapamaz (normal analizle aynı kural).
  if (inp.isDemo) return fail(403, "DEMO_READONLY", "Demo hesabında otomatik hesaplama yapılamaz.");
  // 2) Kurgusal doğum tarihi + kesin saat.
  const date = typeof inp.birthDate === "string" ? inp.birthDate.trim().slice(0, 10) : "";
  const hms = typeof inp.birthTime === "string" ? toHms(inp.birthTime.trim()) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !hms) return fail(422, "MISSING_BIRTH_DATA", "Kurgusal doğum tarihi ve kesin saati girilmelidir.");
  const year = Number(date.slice(0, 4));
  if (year < 1800 || year > 2100) return fail(422, "BIRTH_DATE_RANGE", "Doğum tarihi 1800–2100 aralığında olmalıdır.");
  // 3) Konum → IANA tz + koordinat (sunucuda; istemci koordinatına güvenilmez).
  const location = resolveHdBirthLocation(inp.locationRef);
  if (!location) return fail(422, "LOCATION_REQUIRED", "Doğum yeri listeden seçilmelidir. Saat dilimi bilinmeden hesaplama yapılmaz.");
  // 4) DST — sessiz tahmin yok.
  const t = resolveBirthLocalTime(date, hms, location.timezone);
  if (t.kind === "gap" || t.kind === "ambiguous") {
    const issue = birthLocalTimeIssue(date, hms, location.timezone);
    return fail(422, t.kind === "gap" ? "BIRTH_TIME_NONEXISTENT" : "BIRTH_TIME_AMBIGUOUS", issue?.message ?? "Doğum saati yaz/kış saati geçişine denk geliyor; otomatik hesap yapılmadı.");
  }
  if (t.kind === "invalid") return fail(422, "INVALID_BIRTH_DATA", "Doğum tarihi/saati geçersiz.");
  // 5) Kayıtlı sonuç → Roxy ÇAĞRILMAZ.
  const inputHash = fictionalInputHash({ trainerId: inp.trainerId, tenantId: inp.tenantId, date, time: hms, timezone: location.timezone,
    latitude: location.latitude, longitude: location.longitude, nodeType: policy.nodeType, lang: policy.lang });
  const existing = await deps.findExisting(inputHash);
  if (existing) return { ok: true, existingItemId: existing, inputHash, input: null, chart: null, raw: null };
  // 6) Yapılandırma.
  if (!deps.config) return fail(503, "AUTO_CALC_NOT_CONFIGURED", "Otomatik hesaplama şu anda yapılandırılmamış.");
  // 7) Aynı girdi için eşzamanlı çağrı kilidi + ücretli çağrı limitleri (normal analizle AYNI anahtarlar / sayaçlar).
  const claim = await deps.rateLimit("hd-roxy-inflight", inputHash, ROXY_RATE_LIMITS.inFlight.limit, ROXY_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) return fail(409, "IN_PROGRESS", "Bu hesaplama şu anda sürüyor. Birkaç saniye sonra tekrar deneyin.", { retryAfterSec: claim.retryAfterSec || 10 });
  const userRl = await deps.rateLimit("hd-roxy-user", inp.trainerId, ROXY_RATE_LIMITS.perUser.limit, ROXY_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) return fail(429, "RATE_LIMITED", "Kısa sürede çok fazla otomatik hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", { retryAfterSec: userRl.retryAfterSec });
  const tenantRl = await deps.rateLimit("hd-roxy-tenant", inp.tenantId, ROXY_RATE_LIMITS.perTenant.limit, ROXY_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) return fail(429, "RATE_LIMITED", "Hesabınızın günlük otomatik hesaplama sınırına ulaşıldı. Lütfen daha sonra tekrar deneyin.", { retryAfterSec: tenantRl.retryAfterSec });
  // 8) Roxy → doğrulama → normalizasyon (normal analizle AYNI zincir).
  const request: RoxyBodygraphRequest = { date, time: hms, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, nodeType: policy.nodeType };
  const call = await deps.callRoxy(deps.config, request, { lang: policy.lang, timeoutMs: policy.timeoutMs });
  if (!call.ok) {
    log("[hd-edu-kurgusal] provider call failed", { kind: call.kind, status: call.status });
    return fail(502, "PROVIDER_ERROR", "Hesaplama servisine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.");
  }
  const v = validateRoxyBodygraph(call.raw);
  if (!v.ok) return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.");
  const n = normalizeRoxyBodygraph(v.value, { date, time: hms, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude,
    nodeType: policy.nodeType, lang: policy.lang, birthUtcIso: t.utcIso });
  if (!n.ok) return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama sonucu doğrulanamadı (tutarsız veri). Sonuç kaydedilmedi.");
  const tc = checkDesignInstantConsistency(t.utcIso, v.value.designInstantUtc);
  if (tc.status === "mismatch") return fail(502, "PROVIDER_TIME_MISMATCH", "Hesaplama servisinin kullandığı doğum anı beklenen anla uyuşmuyor. Yanlış sonuç kaydedilmedi.");
  return {
    ok: true, existingItemId: null, inputHash,
    input: { date, time: hms, place: location.label, timezone: location.timezone, latitude: location.latitude, longitude: location.longitude, nodeType: policy.nodeType, lang: policy.lang },
    chart: n.chart as unknown as Record<string, unknown>,
    raw: (call.raw && typeof call.raw === "object" ? call.raw : null) as Record<string, unknown> | null,
  };
}
