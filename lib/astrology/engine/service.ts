// Astroloji Hesap Motoru — ORKESTRASYON (YALNIZ SUNUCU).
//
// Akış (maliyet + güvenlik için bilinçli sıra):
//   1) profil + revizyon TENANT doğrulaması (owner'ın kendi tenant'ı; istemci tenant vermez)
//   2) seçim doğrulama → plan (kapsama budaması + tekilleştirme)
//   3) önbellek (tenant_id, input_hash) → kayıtlı birimler için sağlayıcı ÇAĞRILMAZ
//   4) eşik üstü yeni istek → açık onay (confirmNewRequests === plan.newRequestCount)
//   5) her eksik birim için: yapılandırma → eşzamanlılık kilidi → kullanıcı/tenant limitleri →
//      sağlayıcı çağrısı → beyaz liste projeksiyon → TEK INSERT (teknik) + ayrı INSERT (yorum)
//   6) görünüm: teknik her zaman; yorum yalnız görünürlük kararı "visible" ise ayrı tablodan
//
// Loglar: yalnız hata türü/durum/teknik + input_hash'in ilk 8 hanesi. Anahtar, doğum verisi,
// koordinat, danışan adı LOGLANMAZ.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASTRO_RATE_LIMITS, type RoxyServerConfig } from "../config";
import { resolveInterpretationVisibility, type AstrologyEntitlements } from "../access/entitlements";
import type { RoxyCallResult } from "../providers/roxy/client";
import type { NatalBirthInput } from "../providers/roxy/natal";
import { buildPlan, parseSelections, publicPlanSummary, type ExecutionPlan, type PlannedUnit, type Selection } from "./planner";
import { getTechnique } from "./techniques";
import { resultIdFor } from "./inputHash";
import {
  findResultsByHashes,
  getInterpretation,
  getProfile,
  getResultById,
  getRevision,
  insertInterpretation,
  insertResult,
  isSchemaMissing,
  isUniqueViolation,
  isUuid,
  logAstroDbError,
  touchUnmappedFields,
  type ResultRow,
  type RevisionRow,
} from "../persistence/repo";
import { buildNatalView, publicRevision, type NatalView } from "../view/natalView";
import { normalizeTime } from "../birth/timeResolution";

assertServerOnly("lib/astrology/engine/service");

export type EngineCtx = {
  db: SupabaseClient;
  tenantId: string;
  userId: string;
  entitlements: AstrologyEntitlements;
};

export type EngineDeps = {
  config: RoxyServerConfig | null;
  callProvider: (config: RoxyServerConfig, endpoint: string, body: Record<string, unknown>, opts: { lang: string }) => Promise<RoxyCallResult>;
  rateLimit: (scope: string, value: string, limit: number, windowSeconds: number) => Promise<{ allowed: boolean; retryAfterSec: number }>;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
};

export type ServiceResponse = { status: number; body: Record<string, unknown> };

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});

export const ASTRO_NOT_READY = fail(503, "ASTRO_NOT_READY", "Astroloji veri yapısı bu ortamda henüz hazır değil.");

const PROVIDER_ERRORS: Record<string, { status: number; code: string; error: string }> = {
  timeout: { status: 504, code: "PROVIDER_TIMEOUT", error: "Hesaplama servisi zamanında yanıt vermedi. Lütfen birazdan tekrar deneyin." },
  network: { status: 502, code: "PROVIDER_UNAVAILABLE", error: "Hesaplama servisine şu anda ulaşılamıyor." },
  unauthorized: { status: 502, code: "PROVIDER_CONFIG", error: "Hesaplama servisi yapılandırma hatası (anahtar/plan)." },
  rate_limited: { status: 503, code: "PROVIDER_BUSY", error: "Hesaplama servisi istek sınırına ulaştı. Birkaç dakika sonra tekrar deneyin." },
  saturated: { status: 503, code: "PROVIDER_BUSY", error: "Hesaplama servisi şu anda yoğun. Birkaç dakika sonra tekrar deneyin." },
  bad_request: { status: 422, code: "PROVIDER_REJECTED", error: "Hesaplama servisi bu doğum bilgisini kabul etmedi. Tarih, saat ve yeri kontrol edin." },
  server_error: { status: 502, code: "PROVIDER_UNAVAILABLE", error: "Hesaplama servisinde geçici bir hata oluştu." },
  malformed_json: { status: 502, code: "PROVIDER_INVALID_RESPONSE", error: "Hesaplama servisinden geçersiz yanıt alındı. Sonuç kaydedilmedi." },
};

function revisionToBirth(r: RevisionRow): NatalBirthInput {
  return {
    birthDate: r.birth_date,
    birthTime: r.time_known && r.birth_time ? normalizeTime(r.birth_time.slice(0, 8)) : null,
    utcOffsetSeconds: r.utc_offset_seconds,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

type Loaded = { revision: RevisionRow; selections: Selection[]; plan: ExecutionPlan; cachedRows: Map<string, ResultRow> };

async function loadAndPlan(ctx: EngineCtx, rawBody: unknown): Promise<{ ok: true; v: Loaded } | { ok: false; r: ServiceResponse }> {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  }
  const body = rawBody as Record<string, unknown>;
  const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
  if (!isUuid(profileId)) return { ok: false, r: fail(400, "INVALID_PROFILE", "Geçerli bir doğum profili seçilmedi.") };

  const p = await getProfile(ctx.db, ctx.tenantId, profileId);
  if (p.error) {
    if (isSchemaMissing(p.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.profile", p.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!p.row) return { ok: false, r: fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.") };

  let revNo = p.row.current_revision;
  if (body.revision !== undefined && body.revision !== null) {
    if (typeof body.revision !== "number" || !Number.isInteger(body.revision) || body.revision < 1) {
      return { ok: false, r: fail(400, "INVALID_REVISION", "Geçersiz revizyon.") };
    }
    revNo = body.revision;
  }
  const rv = await getRevision(ctx.db, ctx.tenantId, profileId, revNo);
  if (rv.error) {
    logAstroDbError("engine.revision", rv.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!rv.row) return { ok: false, r: fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.") };

  const sel = parseSelections(body.selections);
  if (!sel.ok) return { ok: false, r: fail(400, sel.code, sel.error) };

  const birth = revisionToBirth(rv.row);
  const draft = buildPlan(sel.selections, birth, () => false);
  const cached = await findResultsByHashes(ctx.db, ctx.tenantId, draft.units.map((u) => u.inputHash));
  if (cached.error) {
    if (isSchemaMissing(cached.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.cache", cached.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  const cachedRows = new Map(cached.rows.map((r) => [r.input_hash, r]));
  const plan = buildPlan(sel.selections, birth, (h) => cachedRows.has(h));
  return { ok: true, v: { revision: rv.row, selections: sel.selections, plan, cachedRows } };
}

/** POST plan — sağlayıcı ÇAĞRILMAZ; yalnız X/Y/Z özeti. */
export async function planAstrology(ctx: EngineCtx, rawBody: unknown): Promise<ServiceResponse> {
  const l = await loadAndPlan(ctx, rawBody);
  if (!l.ok) return l.r;
  return { status: 200, body: { ok: true, plan: publicPlanSummary(l.v.plan), revision: l.v.revision.revision } };
}

type UnitOutcome =
  | { ok: true; row: ResultRow; reused: boolean; providerAttempts: number }
  | { ok: false; status: number; code: string; error: string; providerAttempts: number; retryAfterSec?: number };

async function executeUnit(
  ctx: EngineCtx,
  deps: EngineDeps,
  unit: PlannedUnit,
  selection: Selection,
  revision: RevisionRow,
): Promise<UnitOutcome> {
  const log = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tag = { technique: unit.technique, hash: unit.inputHash.slice(0, 8) };
  const def = getTechnique(unit.technique);
  if (!def) return { ok: false, status: 400, code: "UNKNOWN_TECHNIQUE", error: "Bilinmeyen hesaplama türü.", providerAttempts: 0 };

  const reload = async (): Promise<ResultRow | null> => {
    const r = await findResultsByHashes(ctx.db, ctx.tenantId, [unit.inputHash]);
    return r.rows.find((x) => x.input_hash === unit.inputHash) ?? null;
  };

  if (!deps.config) {
    return { ok: false, status: 503, code: "PROVIDER_NOT_CONFIGURED", error: "Hesaplama sağlayıcısı bu ortamda yapılandırılmamış. Kayıtlı sonuçlar görüntülenebilir.", providerAttempts: 0 };
  }

  // Eşzamanlılık kilidi (aynı tenant + aynı girdi).
  const claim = await deps.rateLimit("astro-roxy-inflight", `${ctx.tenantId}:${unit.inputHash}`, ASTRO_RATE_LIMITS.inFlight.limit, ASTRO_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    for (let i = 0; i < 10; i++) {
      await sleep(1500);
      const again = await reload();
      if (again) return { ok: true, row: again, reused: true, providerAttempts: 0 };
    }
    return { ok: false, status: 409, code: "IN_PROGRESS", error: "Bu hesaplama şu anda sürüyor. Birkaç saniye sonra tekrar deneyin.", providerAttempts: 0, retryAfterSec: 10 };
  }

  // Ücretli çağrı limitleri (yalnız gerçek çağrılar sayılır).
  const userRl = await deps.rateLimit("astro-roxy-user", ctx.userId, ASTRO_RATE_LIMITS.perUser.limit, ASTRO_RATE_LIMITS.perUser.windowSeconds);
  if (!userRl.allowed) {
    return { ok: false, status: 429, code: "RATE_LIMITED", error: "Kısa sürede çok fazla yeni hesaplama yapıldı. Lütfen daha sonra tekrar deneyin.", providerAttempts: 0, retryAfterSec: userRl.retryAfterSec };
  }
  const tenantRl = await deps.rateLimit("astro-roxy-tenant", ctx.tenantId, ASTRO_RATE_LIMITS.perTenant.limit, ASTRO_RATE_LIMITS.perTenant.windowSeconds);
  if (!tenantRl.allowed) {
    return { ok: false, status: 429, code: "RATE_LIMITED", error: "Günlük yeni hesaplama sınırına ulaşıldı.", providerAttempts: 0, retryAfterSec: tenantRl.retryAfterSec };
  }

  const call = await deps.callProvider(deps.config, unit.endpoint, unit.body, { lang: unit.lang });
  if (!call.ok) {
    log("[astro] provider call failed", { ...tag, kind: call.kind, status: call.status, attempts: call.attempts });
    const e = PROVIDER_ERRORS[call.kind] ?? PROVIDER_ERRORS.server_error;
    return { ok: false, ...e, providerAttempts: call.attempts };
  }

  const proj = def.project(unit, call.raw, selection.options);
  if (!proj.ok) {
    log("[astro] provider schema mismatch", { ...tag, errors: proj.errors.slice(0, 10) });
    return { ok: false, status: 502, code: "PROVIDER_INVALID_RESPONSE", error: "Hesaplama servisinden beklenmeyen biçimde yanıt alındı. Sonuç kaydedilmedi.", providerAttempts: call.attempts };
  }
  if (proj.unmappedFields.length > 0 || proj.droppedValues.length > 0) {
    // Yalnız YOL adları (değer yok) — sonraki adaptör sürümünde sınıflandırılmak üzere.
    log("[astro] provider fields not mapped", { ...tag, unmapped: proj.unmappedFields.slice(0, 20), dropped: proj.droppedValues.slice(0, 20) });
    // Owner denetim görünümü: yalnız yol kaydı (değer ASLA). Fail-closed korunur: kayıt adaptörü DEĞİŞTİRMEZ.
    await touchUnmappedFields(ctx.db, unit.provider, unit.endpoint, [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)]);
  }

  const id = resultIdFor(ctx.tenantId, unit.inputHash);
  const ins = await insertResult(ctx.db, ctx.tenantId, ctx.userId, {
    id,
    profileId: revision.profile_id,
    profileRevision: revision.revision,
    technique: unit.technique,
    provider: unit.provider,
    providerApiVersion: unit.providerApiVersion,
    adapterVersion: unit.adapterVersion,
    endpoint: unit.endpoint,
    input: { ...unit.body, lang: unit.lang },
    inputHash: unit.inputHash,
    raw: call.raw,
    technical: proj.technical,
    technicalSchema: proj.technicalSchema,
    projectionVersion: proj.projectionVersion,
    unmappedFields: [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)],
  });
  if (ins.error) {
    if (isUniqueViolation(ins.error)) {
      const again = await reload();
      if (again) return { ok: true, row: again, reused: true, providerAttempts: call.attempts };
    }
    if (isSchemaMissing(ins.error)) {
      return { ok: false, status: 503, code: "ASTRO_NOT_READY", error: "Astroloji veri yapısı bu ortamda henüz hazır değil.", providerAttempts: call.attempts };
    }
    logAstroDbError("engine.insertResult", ins.error);
    return { ok: false, status: 500, code: "DB_INSERT_FAILED", error: "Hesap sonucu kaydedilemedi.", providerAttempts: call.attempts };
  }

  const interpIns = await insertInterpretation(
    ctx.db,
    ctx.tenantId,
    id,
    unit.provider,
    unit.lang,
    proj.interpretationSchema,
    proj.projectionVersion,
    proj.interpretation,
  );
  if (interpIns.error && !isUniqueViolation(interpIns.error)) {
    // Teknik sonuç kaydedildi; yorum katmanı eksik kalır (görünümde "unavailable").
    logAstroDbError("engine.insertInterpretation", interpIns.error);
  }

  const row: ResultRow = {
    id,
    profile_id: revision.profile_id,
    profile_revision: revision.revision,
    technique: unit.technique,
    provider: unit.provider,
    provider_api_version: unit.providerApiVersion,
    adapter_version: unit.adapterVersion,
    endpoint: unit.endpoint,
    input_hash: unit.inputHash,
    technical: proj.technical as Record<string, unknown>,
    technical_schema: proj.technicalSchema,
    projection_version: proj.projectionVersion,
    unmapped_fields: proj.unmappedFields,
    created_at: new Date().toISOString(),
  };
  return { ok: true, row, reused: false, providerAttempts: call.attempts };
}

export async function buildResultView(
  ctx: EngineCtx,
  row: ResultRow,
  revision: Pick<RevisionRow, "time_known">,
  ownerPreviewHideInterp: boolean,
): Promise<NatalView> {
  const visibility = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
  let interp: { provider: string; lang: string; content: Record<string, unknown> } | null = null;
  if (visibility.visible) {
    // Yorum tablosu YALNIZ görünür olacaksa okunur.
    const r = await getInterpretation(ctx.db, ctx.tenantId, row.id, row.projection_version);
    if (r.error) logAstroDbError("view.interpretation", r.error);
    interp = r.row;
  }
  return buildNatalView(row, revision, visibility, interp);
}

/**
 * GET result — kayıtlı sonucu görüntüle (sağlayıcı ÇAĞRILMAZ). Saat-bilinmiyor maskesi, isteyen
 * profil revizyonuna göre uygulanır (verilmezse sonucu üreten revizyon).
 */
export async function getAstrologyResult(
  ctx: EngineCtx,
  resultId: string,
  q: { profileId: string | null; revision: string | null; ownerPreviewHideInterp: boolean },
): Promise<ServiceResponse> {
  if (!isUuid(resultId)) return fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.");
  const r = await getResultById(ctx.db, ctx.tenantId, resultId);
  if (r.error) {
    if (isSchemaMissing(r.error)) return ASTRO_NOT_READY;
    logAstroDbError("result.get", r.error);
    return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
  }
  if (!r.row) return fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.");

  let profileId = r.row.profile_id;
  let revNo = r.row.profile_revision;
  if (q.profileId !== null || q.revision !== null) {
    const n = Number(q.revision);
    if (!isUuid(q.profileId) || !Number.isInteger(n) || n < 1) return fail(400, "INVALID_REVISION", "Geçersiz profil/revizyon.");
    profileId = q.profileId;
    revNo = n;
  }
  const rv = await getRevision(ctx.db, ctx.tenantId, profileId, revNo);
  if (rv.error) {
    logAstroDbError("result.revision", rv.error);
    return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
  }
  if (!rv.row) return fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.");
  const view = await buildResultView(ctx, r.row, rv.row, q.ownerPreviewHideInterp);
  return { status: 200, body: { ok: true, revision: publicRevision(rv.row), view } };
}

/** POST run — plan + eksik birimleri çalıştır + görünümler. */
export async function runAstrology(
  ctx: EngineCtx,
  rawBody: unknown,
  deps: EngineDeps,
  opts: { ownerPreviewHideInterp: boolean },
): Promise<ServiceResponse> {
  if (!ctx.entitlements.engine) return fail(403, "ENGINE_NOT_ENTITLED", "Hesap Motoru yetkisi yok.");
  const l = await loadAndPlan(ctx, rawBody);
  if (!l.ok) return l.r;
  const { plan, selections, revision, cachedRows } = l.v;

  if (plan.requiresConfirmation) {
    const confirm = (rawBody as Record<string, unknown>).confirmNewRequests;
    if (confirm !== plan.newRequestCount) {
      return fail(409, "CONFIRMATION_REQUIRED", `Bu işlem ${plan.newRequestCount} yeni sağlayıcı isteği oluşturacak. Onaylayarak tekrar gönderin.`, {
        plan: publicPlanSummary(plan),
      });
    }
  }

  const outcomes = new Map<string, UnitOutcome>();
  let providerAttempts = 0;
  for (const unit of plan.units) {
    if (unit.cached) {
      const row = cachedRows.get(unit.inputHash)!;
      outcomes.set(unit.inputHash, { ok: true, row, reused: true, providerAttempts: 0 });
      continue;
    }
    const selection = selections[unit.selectionIndexes[0]];
    const o = await executeUnit(ctx, deps, unit, selection, revision);
    providerAttempts += o.providerAttempts;
    outcomes.set(unit.inputHash, o);
  }

  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < selections.length; i++) {
    const unit = plan.units.find((u) => u.selectionIndexes.includes(i));
    if (!unit) {
      results.push({ selectionIndex: i, technique: selections[i].technique, ok: false, code: "NO_UNIT", error: "Hesap birimi oluşturulamadı." });
      continue;
    }
    const o = outcomes.get(unit.inputHash)!;
    if (!o.ok) {
      results.push({ selectionIndex: i, technique: selections[i].technique, ok: false, code: o.code, error: o.error, retryAfterSec: o.retryAfterSec });
      continue;
    }
    const view = await buildResultView(ctx, o.row, revision, opts.ownerPreviewHideInterp);
    results.push({ selectionIndex: i, technique: selections[i].technique, ok: true, reused: o.reused, view });
  }

  const executedNew = [...outcomes.values()].filter((o) => o.ok && !o.reused).length;
  const fromCache = [...outcomes.values()].filter((o) => o.ok && o.reused).length;
  const anyOk = results.some((r) => r.ok === true);
  const firstFailure = [...outcomes.values()].find((o): o is Extract<UnitOutcome, { ok: false }> => !o.ok);
  // Kısmi başarı 200'dür (her seçimin durumu results[] içinde); hepsi başarısızsa ilk hatanın kodu.
  const status = anyOk ? 200 : firstFailure?.status ?? 500;

  return {
    status,
    body: {
      ok: anyOk,
      // Hepsi başarısızsa ilk hatanın kodu/mesajı üst düzeyde de döner (istemci tek mesaj gösterir).
      ...(anyOk || !firstFailure ? {} : { code: firstFailure.code, error: firstFailure.error }),
      plan: publicPlanSummary(plan),
      executed: { newResults: executedNew, cachedResults: fromCache, providerAttempts },
      revision: publicRevision(revision),
      results,
    },
  };
}
