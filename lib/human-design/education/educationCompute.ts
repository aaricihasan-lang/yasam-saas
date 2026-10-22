// Human Design — Hazır Eğitim Haritaları · OWNER HESAPLAMA SERVİSİ (FAZ 2-B2) · YALNIZ SUNUCU.
//
// Mevcut natal zincir DEĞİŞMEZ; yalnız ÇAĞRILIR: callRoxyBodygraph (deps ile) → validateRoxyBodygraph →
// normalizeRoxyBodygraph → checkDesignInstantConsistency. Kişisel harita servisi (roxyChartService) kullanılmaz;
// human_design_* tablolarına YAZILMAZ; danışan kaydı üretilmez.
//
// MALİYET / GÜVENLİK KAPILARI (hepsi sağlayıcı çağrısından ÖNCE):
//   1) Çağıran route owner kapısını geçmiş olmalı (requireEducationOwner).
//   2) HD_EDUCATION_PROVIDER_CALLS_ENABLED YALNIZ tam "true" ise dış çağrı yapılabilir — varsayılan KAPALI (owner'ın
//      ayrı ücretli çağrı izni). Kapalıyken hiçbir istek gönderilmez.
//   3) Kişi UTC VERIFIED + eğitim UTC katmanı tutarlı + güncel revizyonda doğum saati kaynağı var.
//   4) Aynı istek (kişi + revizyon + UTC gövdesi + adapter) için kayıtlı OK snapshot varsa ÇAĞRI YOK (yeniden kullanım).
//   5) Süreç içi kilit (kişi başına tek uçuş) + ÇOK-INSTANCE KİLİDİ: sağlayıcı çağrısından ÖNCE atomik DB kirası
//      (kişi + istek özeti başına 1 çağrı / EDU_COMPUTE_LEASE_SECONDS; auth_rate_limit_hit advisory-lock) + günlük
//      platform tavanı. DB sayacı kullanılamıyorsa (bellek-içi yedek mod) ÜCRETLİ ÇAĞRI YAPILMAZ (fail-closed).
//      Not: snapshot tablosundaki UNIQUE yalnız ikinci KAYDI reddeder; ikinci ÜCRETLİ ÇAĞRIYI engelleyen bu kiradır.
//   6) TEK çağrı; OTOMATİK TEKRAR YOK. Hata → snapshot YAZILMAZ, yalnız denetim kaydı ('chart_failed').

import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { RoxyBodygraphRequest, RoxyCallResult } from "@/lib/human-design/providers/roxy/client";
import { ROXY_ADAPTER_VERSION, ROXY_BODYGRAPH_ENDPOINT, ROXY_POLICY, ROXY_PROVIDER_ID, type RoxyServerConfig } from "@/lib/human-design/providers/roxy/config";
import { validateRoxyBodygraph } from "@/lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph } from "@/lib/human-design/providers/roxy/normalize";
import { checkDesignInstantConsistency } from "@/lib/human-design/providers/roxy/timeConsistency";
import { ROXY_CONTRACT_VERSION, ROXY_ENGINE_VERSION } from "@/lib/human-design/api/roxyChartService";
import { EDU_TABLES, EDU_UUID_RE } from "./educationContract";
import { resolveEducationBirthUtc } from "./educationUtc";

assertServerOnly("lib/human-design/education/educationCompute");

/** Ücretli sağlayıcı çağrısı kapısı — YALNIZ tam "true". Katalog kapısından AYRI (owner'ın ayrı izni). */
export function isEducationProviderEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HD_EDUCATION_PROVIDER_CALLS_ENABLED === "true";
}

/** Günlük platform tavanı (owner yanlışlıkla art arda tıklasa da sınırlı maliyet). */
export const EDU_COMPUTE_DAILY_CAP = 10;
/** Kişi + istek özeti başına sağlayıcı çağrısı kirası (sn). Hata sonrası aynı istek bu süre dolmadan tekrar çağrılmaz. */
export const EDU_COMPUTE_LEASE_SECONDS = 600;

export type EduComputeDeps = {
  config: RoxyServerConfig | null;
  callRoxy: (config: RoxyServerConfig, body: RoxyBodygraphRequest, opts: { lang?: string; timeoutMs?: number }) => Promise<RoxyCallResult>;
  /** Global (instance-bağımsız) sayaç. `key` kova değeridir (varsayılan platform). `mode !== "db"` → ücretli çağrı yok. */
  rateLimit: (scope: string, limit: number, windowSeconds: number, key?: string) => Promise<{ allowed: boolean; retryAfterSec: number; mode?: "db" | "memory" }>;
  env?: Record<string, string | undefined>;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
};

export type EduComputeResult =
  | { status: 200; body: { ok: true; chartId: string; version: number; reused: boolean } }
  | { status: number; body: { ok: false; code: string; error: string; retryAfterSec?: number } };

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): EduComputeResult =>
  ({ status, body: { ok: false, code, error, ...extra } }) as EduComputeResult;

const PROVIDER_FAIL: Record<string, [number, string]> = {
  timeout: [504, "Hesaplama servisi zamanında yanıt vermedi. Sonuç kaydedilmedi; otomatik tekrar yapılmaz."],
  network: [502, "Hesaplama servisine ulaşılamadı. Sonuç kaydedilmedi; otomatik tekrar yapılmaz."],
  unauthorized: [502, "Hesaplama servisi yapılandırma hatası. Sonuç kaydedilmedi."],
  rate_limited: [503, "Hesaplama servisi yoğun. Sonuç kaydedilmedi; otomatik tekrar yapılmaz."],
  bad_request: [422, "Hesaplama servisi bu doğum verisini kabul etmedi (UTC biçimi dahil). Sonuç kaydedilmedi."],
  server_error: [502, "Hesaplama servisinde hata. Sonuç kaydedilmedi; otomatik tekrar yapılmaz."],
  malformed_json: [502, "Hesaplama servisinden geçersiz yanıt. Sonuç kaydedilmedi."],
};

const inFlight = new Set<string>();
/** Yalnız testler: süreç içi kilidi sıfırlar. */
export function __resetEducationComputeLocks(): void {
  inFlight.clear();
}

type SubjectRow = {
  id: string; revision: number; birth_date: string; documented_local_time: string; time_standard: string | null;
  utc_offset_seconds: number | null; birth_utc: string | null; utc_status: string; iana_zone: string | null;
  latitude: number | string | null; longitude: number | string | null;
};

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * İstek özeti: kanıt revizyonu + adapter + uç + gövde (API anahtarı YOK). Aynı özet = aynı hesap → yeniden çağrı yok.
 * Revizyon özete DAHİLDİR: kanıt değişince (gövde aynı kalsa bile) eski snapshot yeni veriymiş gibi kullanılmaz;
 * owner'ın açık eylemiyle yeni sürüm hesaplanır.
 */
export function educationRequestHash(body: RoxyBodygraphRequest, lang: string, revision: number): string {
  const canon = JSON.stringify({ r: revision, a: ROXY_ADAPTER_VERSION, e: ROXY_BODYGRAPH_ENDPOINT, l: lang, b: [body.date, body.time, body.timezone, body.latitude, body.longitude, body.nodeType] });
  return createHash("sha256").update(canon).digest("hex");
}

async function audit(db: SupabaseClient, ownerId: string, subjectId: string, action: "chart_recorded" | "chart_failed", detail: Record<string, unknown>) {
  await db.from(EDU_TABLES.audit).insert({ actor_kind: "owner", actor_user_id: ownerId, action, subject_id: subjectId, detail });
}

export async function computeEducationChart(
  ctx: { db: SupabaseClient; ownerId: string },
  subjectId: string,
  deps: EduComputeDeps,
): Promise<EduComputeResult> {
  const log = deps.log ?? (() => undefined);
  if (!EDU_UUID_RE.test(subjectId)) return fail(404, "NOT_FOUND", "Kayıt bulunamadı.");

  const subj = await ctx.db
    .from(EDU_TABLES.subjects)
    .select("id, revision, birth_date, documented_local_time, time_standard, utc_offset_seconds, birth_utc, utc_status, iana_zone, latitude, longitude")
    .eq("id", subjectId)
    .maybeSingle();
  if (subj.error) return fail(500, "DB_ERROR", "Kayıt okunamadı.");
  if (!subj.data) return fail(404, "NOT_FOUND", "Kayıt bulunamadı.");
  const s = subj.data as SubjectRow;

  // UTC: yalnız belgeye dayalı, bağımsız denetimli an. PENDING / tutarsız → çağrı YOK.
  const utc = resolveEducationBirthUtc({
    birthDate: s.birth_date, documentedLocalTime: s.documented_local_time, timeStandard: s.time_standard,
    utcOffsetSeconds: s.utc_offset_seconds, birthUtc: s.birth_utc, utcStatus: s.utc_status, ianaZone: s.iana_zone,
    latitude: numOrNull(s.latitude), longitude: numOrNull(s.longitude),
  });
  if (!utc.ok) return fail(409, utc.code === "UTC_NOT_VERIFIED" ? "BLOCKED_UTC" : utc.code, utc.reason);

  const src = await ctx.db.from(EDU_TABLES.sources).select("id").eq("subject_id", s.id).eq("subject_revision", s.revision).eq("role", "birth_time").limit(1);
  if (src.error) return fail(500, "DB_ERROR", "Kaynak okunamadı.");
  if (!(src.data ?? []).length) return fail(409, "SOURCE_MISSING", "Güncel kanıt revizyonunda doğum saati kaynağı yok — hesaplama yapılmaz.");

  const request: RoxyBodygraphRequest = {
    date: utc.request.date, time: utc.request.time, timezone: utc.request.timezone,
    latitude: numOrNull(s.latitude)!, longitude: numOrNull(s.longitude)!, nodeType: ROXY_POLICY.nodeType,
  };
  const requestHash = educationRequestHash(request, ROXY_POLICY.lang, s.revision);

  // Aynı istek için kayıtlı başarılı snapshot → yeniden kullan (ÇAĞRI YOK).
  const existing = await ctx.db
    .from(EDU_TABLES.charts)
    .select("id, version")
    .eq("subject_id", s.id)
    .eq("request_hash", requestHash)
    .eq("adapter_version", ROXY_ADAPTER_VERSION)
    .limit(1);
  if (existing.error) return fail(500, "DB_ERROR", "Snapshot okunamadı.");
  const prev = (existing.data ?? [])[0] as { id: string; version: number } | undefined;
  if (prev) return { status: 200, body: { ok: true, chartId: prev.id, version: prev.version, reused: true } };

  // Ücretli çağrı kapısı: KAPALIYSA burada durur (hiçbir dış istek yok).
  if (!isEducationProviderEnabled(deps.env)) {
    return fail(409, "PROVIDER_DISABLED", "Gerçek hesaplama çağrısı kapalı. Owner'ın ayrı ücretli çağrı izni ve yapılandırması gerekir.");
  }
  if (!deps.config) return fail(503, "PROVIDER_NOT_CONFIGURED", "Hesaplama servisi yapılandırılmamış.");

  if (inFlight.has(s.id)) return fail(409, "IN_PROGRESS", "Bu kişi için hesaplama sürüyor.");
  inFlight.add(s.id);
  try {
    // Çok-instance kilidi: aynı kişi + aynı istek için yalnız BİR sunucu örneği sağlayıcıyı çağırabilir (atomik DB kirası).
    const lease = await deps.rateLimit("hd-edu-compute-lease", 1, EDU_COMPUTE_LEASE_SECONDS, `${s.id}:${requestHash}`);
    if (lease.mode !== "db") return fail(503, "LOCK_UNAVAILABLE", "Hesaplama kilidi doğrulanamadı; ücretli çağrı yapılmadı.");
    if (!lease.allowed) {
      return fail(409, "IN_PROGRESS", "Bu kişi için hesaplama başka bir istekte sürüyor veya yakın zamanda denendi. Kayıtlı sonucu birkaç dakika sonra kontrol edin.", { retryAfterSec: lease.retryAfterSec });
    }
    // Kira alındıktan sonra yeniden kontrol: başka bir örnek az önce kaydetmiş olabilir → ÇAĞRI YOK.
    const recheck = await ctx.db.from(EDU_TABLES.charts).select("id, version").eq("subject_id", s.id).eq("request_hash", requestHash).eq("adapter_version", ROXY_ADAPTER_VERSION).limit(1);
    if (recheck.error) return fail(500, "DB_ERROR", "Snapshot okunamadı.");
    const done = (recheck.data ?? [])[0] as { id: string; version: number } | undefined;
    if (done) return { status: 200, body: { ok: true, chartId: done.id, version: done.version, reused: true } };

    const cap = await deps.rateLimit("hd-edu-compute-daily", EDU_COMPUTE_DAILY_CAP, 86_400);
    if (cap.mode !== "db") return fail(503, "LOCK_UNAVAILABLE", "Hesaplama tavanı doğrulanamadı; ücretli çağrı yapılmadı.");
    if (!cap.allowed) return fail(429, "DAILY_CAP", "Günlük eğitim hesaplama tavanına ulaşıldı.", { retryAfterSec: cap.retryAfterSec });

    const call = await deps.callRoxy(deps.config, request, { lang: ROXY_POLICY.lang, timeoutMs: ROXY_POLICY.timeoutMs });
    if (!call.ok) {
      const [st, msg] = PROVIDER_FAIL[call.kind] ?? PROVIDER_FAIL.server_error;
      await audit(ctx.db, ctx.ownerId, s.id, "chart_failed", { kod: `PROVIDER_${call.kind.toUpperCase()}`, http: call.status, revizyon: s.revision });
      log("[hd-edu] provider call failed", { kind: call.kind, status: call.status });
      return fail(st, `PROVIDER_${call.kind.toUpperCase()}`, msg);
    }
    const v = validateRoxyBodygraph(call.raw);
    if (!v.ok) {
      await audit(ctx.db, ctx.ownerId, s.id, "chart_failed", { kod: "PROVIDER_INVALID_RESPONSE", revizyon: s.revision });
      return fail(502, "PROVIDER_INVALID_RESPONSE", "Hesaplama yanıtı beklenen biçimde değil. Sonuç kaydedilmedi.");
    }
    const n = normalizeRoxyBodygraph(v.value, {
      date: request.date, time: request.time, timezone: request.timezone, latitude: request.latitude, longitude: request.longitude,
      nodeType: request.nodeType, lang: ROXY_POLICY.lang, birthUtcIso: utc.utcIso,
    });
    if (!n.ok) {
      await audit(ctx.db, ctx.ownerId, s.id, "chart_failed", { kod: "PROVIDER_INCONSISTENT", revizyon: s.revision });
      return fail(502, "PROVIDER_INCONSISTENT", "Hesaplama sonucu kendi içinde tutarsız. Sonuç kaydedilmedi.");
    }
    // Sağlayıcının kullandığı an ↔ belgeli UTC (bağımsız efemeris; Design anı). Uyuşmazsa YANLIŞ HARİTA KAYDEDİLMEZ.
    const tc = checkDesignInstantConsistency(utc.utcIso, v.value.designInstantUtc);
    if (tc.status !== "consistent") {
      await audit(ctx.db, ctx.ownerId, s.id, "chart_failed", { kod: tc.status === "mismatch" ? "TIME_MISMATCH" : "TIME_UNVERIFIABLE", revizyon: s.revision });
      return fail(502, tc.status === "mismatch" ? "TIME_MISMATCH" : "TIME_UNVERIFIABLE",
        tc.status === "mismatch"
          ? "Hesaplama servisinin kullandığı doğum anı belgeli UTC ile uyuşmuyor. Sonuç kaydedilmedi."
          : "Doğum anı bağımsız doğrulanamadı. Eğitim kataloğunda doğrulanamayan sonuç kaydedilmez.");
    }

    const maxv = await ctx.db.from(EDU_TABLES.charts).select("version").eq("subject_id", s.id).order("version", { ascending: false }).limit(1);
    if (maxv.error) return fail(500, "DB_ERROR", "Snapshot sürümü okunamadı.");
    const version = (((maxv.data ?? [])[0] as { version?: number } | undefined)?.version ?? 0) + 1;
    const rawJson = JSON.stringify(call.raw);
    const ins = await ctx.db.from(EDU_TABLES.charts).insert({
      subject_id: s.id,
      subject_revision: s.revision,
      version,
      request_body: { ...request, lang: ROXY_POLICY.lang },
      request_hash: requestHash,
      provider: ROXY_PROVIDER_ID,
      endpoint: ROXY_BODYGRAPH_ENDPOINT,
      adapter_version: ROXY_ADAPTER_VERSION,
      engine_version: ROXY_ENGINE_VERSION,
      contract_version: ROXY_CONTRACT_VERSION,
      computed_result: n.chart,
      provider_raw: call.raw,
      provider_raw_sha256: createHash("sha256").update(rawJson).digest("hex"),
      design_instant_utc: v.value.designInstantUtc,
      time_check: {
        durum: tc.status, beklenenDesignUtc: tc.expectedDesignUtcIso, farkDakika: tc.deltaMinutes,
        yontem: "belgeli UTC → bağımsız efemeris Design anı (tolerans 10 dk)",
        modernIana: utc.ianaModern,
      },
      boundary_flags: { saniyeGonderildi: utc.secondsNonZero, saniyeIslemeDogrulandi: false },
      calc_status: "OK",
      created_by: ctx.ownerId,
    }).select("id, version").single();
    if (ins.error) {
      // Eşzamanlı aynı istek: benzersizlik ihlali → kayıtlı olanı döndür (ikinci ücretli çağrı zaten yapıldıysa bile tek kayıt).
      const again = await ctx.db.from(EDU_TABLES.charts).select("id, version").eq("subject_id", s.id).eq("request_hash", requestHash).eq("adapter_version", ROXY_ADAPTER_VERSION).limit(1);
      const row = (again.data ?? [])[0] as { id: string; version: number } | undefined;
      if (row) return { status: 200, body: { ok: true, chartId: row.id, version: row.version, reused: true } };
      return fail(500, "DB_ERROR", "Snapshot kaydedilemedi.");
    }
    const saved = ins.data as { id: string; version: number };
    await audit(ctx.db, ctx.ownerId, s.id, "chart_recorded", { chart_id: saved.id, surum: saved.version, revizyon: s.revision });
    return { status: 200, body: { ok: true, chartId: saved.id, version: saved.version, reused: false } };
  } finally {
    inFlight.delete(s.id);
  }
}
