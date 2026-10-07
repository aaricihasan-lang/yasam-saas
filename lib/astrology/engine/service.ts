// Astroloji Hesap Motoru — ORKESTRASYON (YALNIZ SUNUCU).
//
// Akış (maliyet + güvenlik için bilinçli sıra):
//   1) profil + revizyon TENANT doğrulaması (owner'ın kendi tenant'ı; istemci tenant vermez)
//   2) seçim doğrulama + NORMALİZE (ör. "şimdi" → UTC saat başı) → karşı taraf (synastry/composite)
//      aynı tenant'tan yüklenir; saat gerektiren teknik saat bilinmiyorsa ENGELLENİR (istek yok)
//   3) plan (kapsama budaması + tekilleştirme) → önbellek (tenant_id, input_hash)
//   4) eşik üstü yeni istek → açık onay (confirmNewRequests === plan.newRequestCount)
//   5) eksik birimler: yapılandırma → eşzamanlılık kilidi → kullanıcı/tenant limitleri → sağlayıcı →
//      beyaz liste projeksiyon → TEK INSERT (teknik) + ayrı INSERT (yorum). KISMİ BAŞARI desteklenir.
//   6) görünüm: teknik her zaman; yorum yalnız görünürlük "visible" ise ayrı tablodan
//
// Loglar: yalnız hata türü/durum/teknik + input_hash'in ilk 8 hanesi. Anahtar, doğum verisi,
// koordinat, danışan adı LOGLANMAZ.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASTRO_RATE_LIMITS, type RoxyServerConfig } from "../config";
import { resolveInterpretationVisibility, type AstrologyEntitlements } from "../access/entitlements";
import type { RoxyCallResult } from "../providers/roxy/client";
import type { BirthPoint } from "../providers/roxy/requests";
import { buildPlan, parseSelections, publicPlanSummary, type ExecutionPlan, type PlannedSelection, type PlannedUnit, type Selection } from "./planner";
import { getTechnique, type TechniqueId } from "./techniques";
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
import { publicRevision } from "../view/natalView";
import { buildTechniqueView, type TechniqueView } from "../view/techniqueView";
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
  /** Test/deterministik "şimdi". */
  now?: () => Date;
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

export function revisionToBirth(r: RevisionRow): BirthPoint {
  return {
    birthDate: r.birth_date,
    birthTime: r.time_known && r.birth_time ? normalizeTime(r.birth_time.slice(0, 8)) : null,
    utcOffsetSeconds: r.utc_offset_seconds,
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

/** Seçimlerin bağlamı: karşı taraf yüklenir (aynı tenant), saat kuralı uygulanır. */
export type SelectionContext = PlannedSelection & { partnerRevision: RevisionRow | null };

export async function resolveSelectionContexts(
  ctx: EngineCtx,
  revision: RevisionRow,
  selections: Selection[],
): Promise<{ ok: true; v: SelectionContext[] } | { ok: false; r: ServiceResponse }> {
  const partnerCache = new Map<string, RevisionRow | null>();
  const out: SelectionContext[] = [];
  const birth = revisionToBirth(revision);
  for (const s of selections) {
    const def = getTechnique(s.technique)!;
    const base = { birth, birthUtc: revision.birth_utc, partner: null as BirthPoint | null };
    if (def.requiresKnownTime && !revision.time_known) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "TIME_REQUIRED", error: `${def.label} doğum saati bilinmeden güvenilir hesaplanamaz (dönüş anı doğum saatine bağlıdır).` } });
      continue;
    }
    if (!def.requiresPartner) {
      out.push({ ...s, ctx: base, partnerRevision: null, blocked: null });
      continue;
    }
    const pid = String(s.options.partnerProfileId);
    if (pid === revision.profile_id) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "PARTNER_SAME_PROFILE", error: "Karşı taraf, analiz edilen profilden farklı olmalıdır." } });
      continue;
    }
    const key = `${pid}|${s.options.partnerRevision ?? "current"}`;
    if (!partnerCache.has(key)) {
      const pp = await getProfile(ctx.db, ctx.tenantId, pid);
      if (pp.error) {
        if (isSchemaMissing(pp.error)) return { ok: false, r: ASTRO_NOT_READY };
        logAstroDbError("engine.partner", pp.error);
        return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
      }
      let row: RevisionRow | null = null;
      if (pp.row) {
        const want = s.options.partnerRevision === null || s.options.partnerRevision === undefined ? pp.row.current_revision : Number(s.options.partnerRevision);
        const rv = await getRevision(ctx.db, ctx.tenantId, pid, want);
        if (rv.error) {
          logAstroDbError("engine.partnerRevision", rv.error);
          return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
        }
        row = rv.row;
      }
      partnerCache.set(key, row);
    }
    const prow = partnerCache.get(key) ?? null;
    if (!prow) {
      out.push({ ...s, ctx: null, partnerRevision: null, blocked: { code: "PARTNER_NOT_FOUND", error: "Karşı taraf doğum profili bulunamadı." } });
      continue;
    }
    // Normalize: karşı tarafın KULLANILAN revizyonu seçeneğe yazılır (anahtar + snapshot tutarlılığı).
    const options = { ...s.options, partnerRevision: prow.revision };
    out.push({ ...s, options, ctx: { ...base, partner: revisionToBirth(prow) }, partnerRevision: prow, blocked: null });
  }
  return { ok: true, v: out };
}

type Loaded = { revision: RevisionRow; selections: SelectionContext[]; plan: ExecutionPlan; cachedRows: Map<string, ResultRow> };

export async function loadProfileRevision(
  ctx: EngineCtx,
  profileIdRaw: unknown,
  revisionRaw: unknown,
): Promise<{ ok: true; revision: RevisionRow; label: string; clientId: string | null } | { ok: false; r: ServiceResponse }> {
  const profileId = typeof profileIdRaw === "string" ? profileIdRaw.trim() : "";
  if (!isUuid(profileId)) return { ok: false, r: fail(400, "INVALID_PROFILE", "Geçerli bir doğum profili seçilmedi.") };
  const p = await getProfile(ctx.db, ctx.tenantId, profileId);
  if (p.error) {
    if (isSchemaMissing(p.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.profile", p.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!p.row) return { ok: false, r: fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.") };
  let revNo = p.row.current_revision;
  if (revisionRaw !== undefined && revisionRaw !== null) {
    const n = typeof revisionRaw === "number" ? revisionRaw : Number(revisionRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, r: fail(400, "INVALID_REVISION", "Geçersiz revizyon.") };
    revNo = n;
  }
  const rv = await getRevision(ctx.db, ctx.tenantId, profileId, revNo);
  if (rv.error) {
    logAstroDbError("engine.revision", rv.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  if (!rv.row) return { ok: false, r: fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.") };
  return { ok: true, revision: rv.row, label: p.row.label, clientId: p.row.client_id };
}

/** Bir seçim listesini planla (önbellek dahil). Analiz servisi de kullanır. */
export async function planSelections(
  ctx: EngineCtx,
  revision: RevisionRow,
  rawSelections: unknown,
  now: Date,
): Promise<{ ok: true; v: Omit<Loaded, "revision"> } | { ok: false; r: ServiceResponse }> {
  const sel = parseSelections(rawSelections, now);
  if (!sel.ok) return { ok: false, r: fail(400, sel.code, sel.error) };
  const sc = await resolveSelectionContexts(ctx, revision, sel.selections);
  if (!sc.ok) return sc;
  const draft = buildPlan(sc.v, () => false);
  const cached = await findResultsByHashes(ctx.db, ctx.tenantId, draft.units.map((u) => u.inputHash));
  if (cached.error) {
    if (isSchemaMissing(cached.error)) return { ok: false, r: ASTRO_NOT_READY };
    logAstroDbError("engine.cache", cached.error);
    return { ok: false, r: fail(500, "DB_ERROR", "İşlem tamamlanamadı.") };
  }
  const cachedRows = new Map(cached.rows.map((r) => [r.input_hash, r]));
  const plan = buildPlan(sc.v, (h) => cachedRows.has(h));
  return { ok: true, v: { selections: sc.v, plan, cachedRows } };
}

async function loadAndPlan(ctx: EngineCtx, rawBody: unknown, now: Date): Promise<{ ok: true; v: Loaded } | { ok: false; r: ServiceResponse }> {
  if (typeof rawBody !== "object" || rawBody === null || Array.isArray(rawBody)) {
    return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  }
  const body = rawBody as Record<string, unknown>;
  const pr = await loadProfileRevision(ctx, body.profileId, body.revision);
  if (!pr.ok) return pr;
  const p = await planSelections(ctx, pr.revision, body.selections, now);
  if (!p.ok) return p;
  return { ok: true, v: { revision: pr.revision, ...p.v } };
}

/** POST plan — sağlayıcı ÇAĞRILMAZ; yalnız X/Y/Z özeti (+ normalize seçenekler). */
export async function planAstrology(ctx: EngineCtx, rawBody: unknown, now: Date = new Date()): Promise<ServiceResponse> {
  const l = await loadAndPlan(ctx, rawBody, now);
  if (!l.ok) return l.r;
  return { status: 200, body: { ok: true, plan: publicPlanSummary(l.v.plan, l.v.selections), revision: l.v.revision.revision } };
}

type UnitOutcome =
  | { ok: true; row: ResultRow; reused: boolean; providerAttempts: number }
  | { ok: false; status: number; code: string; error: string; providerAttempts: number; retryAfterSec?: number };

async function executeUnit(
  ctx: EngineCtx,
  deps: EngineDeps,
  unit: PlannedUnit,
  selection: SelectionContext,
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

  const claim = await deps.rateLimit("astro-roxy-inflight", `${ctx.tenantId}:${unit.inputHash}`, ASTRO_RATE_LIMITS.inFlight.limit, ASTRO_RATE_LIMITS.inFlight.windowSeconds);
  if (!claim.allowed) {
    for (let i = 0; i < 10; i++) {
      await sleep(1500);
      const again = await reload();
      if (again) return { ok: true, row: again, reused: true, providerAttempts: 0 };
    }
    return { ok: false, status: 409, code: "IN_PROGRESS", error: "Bu hesaplama şu anda sürüyor. Birkaç saniye sonra tekrar deneyin.", providerAttempts: 0, retryAfterSec: 10 };
  }

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
    log("[astro] provider fields not mapped", { ...tag, unmapped: proj.unmappedFields.slice(0, 20), dropped: proj.droppedValues.slice(0, 20) });
    await touchUnmappedFields(ctx.db, unit.provider, unit.endpoint, [...proj.unmappedFields, ...proj.droppedValues.map((d) => `dropped:${d}`)]);
  }

  const id = resultIdFor(ctx.tenantId, unit.inputHash);
  const partner = selection.partnerRevision;
  const ins = await insertResult(ctx.db, ctx.tenantId, ctx.userId, {
    id,
    profileId: revision.profile_id,
    profileRevision: revision.revision,
    partnerProfileId: partner?.profile_id ?? null,
    partnerProfileRevision: partner?.revision ?? null,
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

  const interpIns = await insertInterpretation(ctx.db, ctx.tenantId, id, unit.provider, unit.lang, proj.interpretationSchema, proj.projectionVersion, proj.interpretation);
  if (interpIns.error && !isUniqueViolation(interpIns.error)) logAstroDbError("engine.insertInterpretation", interpIns.error);

  const row: ResultRow = {
    id,
    profile_id: revision.profile_id,
    profile_revision: revision.revision,
    partner_profile_id: partner?.profile_id ?? null,
    partner_profile_revision: partner?.revision ?? null,
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

/** Bir seçimin (1..n parça) satırlarından görünüm. Yorum tablosu YALNIZ görünür olacaksa okunur. */
export async function buildSelectionView(
  ctx: EngineCtx,
  technique: TechniqueId,
  rows: ResultRow[],
  options: Record<string, unknown>,
  timeKnowledge: { primary: boolean; partner: boolean | null },
  ownerPreviewHideInterp: boolean,
  missingParts = 0,
): Promise<TechniqueView> {
  const def = getTechnique(technique)!;
  const visibility = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
  let interps: ({ provider: string; lang: string; content: Record<string, unknown> } | null)[] | null = null;
  if (visibility.visible) {
    interps = [];
    for (const r of rows) {
      const it = await getInterpretation(ctx.db, ctx.tenantId, r.id, r.projection_version);
      if (it.error) logAstroDbError("view.interpretation", it.error);
      interps.push(it.row);
    }
  }
  const combined = def.combineTechnical ? def.combineTechnical(rows.map((r) => r.technical), options) : rows[0].technical;
  return buildTechniqueView({ technique, rows, combined, options, timeKnowledge, visibility, interpretations: interps, missingParts });
}

/** Geriye dönük uyum: tek satırlık sonuç görünümü (natal vb.). */
export async function buildResultView(
  ctx: EngineCtx,
  row: ResultRow,
  revision: Pick<RevisionRow, "time_known">,
  ownerPreviewHideInterp: boolean,
  partnerTimeKnown: boolean | null = null,
): Promise<TechniqueView> {
  const technique = (getTechnique(row.technique)?.id ?? "western.natal") as TechniqueId;
  return buildSelectionView(ctx, technique, [row], {}, { primary: revision.time_known === true, partner: partnerTimeKnown }, ownerPreviewHideInterp);
}

/**
 * GET result — kayıtlı sonucu görüntüle (sağlayıcı ÇAĞRILMAZ). Saat-bilinmiyor maskesi, isteyen
 * profil revizyonuna göre uygulanır (verilmezse sonucu üreten revizyon). Karşı taraf varsa onun da.
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
  let partnerTimeKnown: boolean | null = null;
  if (r.row.partner_profile_id && r.row.partner_profile_revision) {
    const pr = await getRevision(ctx.db, ctx.tenantId, r.row.partner_profile_id, r.row.partner_profile_revision);
    partnerTimeKnown = pr.row ? pr.row.time_known : false;
  }
  const view = await buildResultView(ctx, r.row, rv.row, q.ownerPreviewHideInterp, partnerTimeKnown);
  return { status: 200, body: { ok: true, revision: publicRevision(rv.row), view } };
}

/** POST run — plan + eksik birimleri çalıştır + görünümler (kısmi başarı). */
export async function runAstrology(
  ctx: EngineCtx,
  rawBody: unknown,
  deps: EngineDeps,
  opts: { ownerPreviewHideInterp: boolean },
): Promise<ServiceResponse> {
  if (!ctx.entitlements.engine) return fail(403, "ENGINE_NOT_ENTITLED", "Hesap Motoru yetkisi yok.");
  const now = deps.now ? deps.now() : new Date();
  const l = await loadAndPlan(ctx, rawBody, now);
  if (!l.ok) return l.r;
  const { plan, selections, revision, cachedRows } = l.v;

  if (plan.requiresConfirmation) {
    const confirm = (rawBody as Record<string, unknown>).confirmNewRequests;
    if (confirm !== plan.newRequestCount) {
      return fail(409, "CONFIRMATION_REQUIRED", `Bu işlem ${plan.newRequestCount} yeni sağlayıcı isteği oluşturacak. Onaylayarak tekrar gönderin.`, {
        plan: publicPlanSummary(plan, selections),
      });
    }
  }

  const outcomes = new Map<string, UnitOutcome>();
  let providerAttempts = 0;
  for (const unit of plan.units) {
    if (unit.cached) {
      outcomes.set(unit.inputHash, { ok: true, row: cachedRows.get(unit.inputHash)!, reused: true, providerAttempts: 0 });
      continue;
    }
    const o = await executeUnit(ctx, deps, unit, selections[unit.selectionIndexes[0]], revision);
    providerAttempts += o.providerAttempts;
    outcomes.set(unit.inputHash, o);
  }

  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < selections.length; i++) {
    const s = selections[i];
    const block = plan.blocks[i];
    if (block) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: block.code, error: block.error });
      continue;
    }
    const hashes = plan.selectionUnits[i];
    const outs = hashes.map((h) => outcomes.get(h)!);
    const okRows = outs.filter((o): o is Extract<UnitOutcome, { ok: true }> => o.ok).map((o) => o.row);
    if (okRows.length === 0) {
      const f = outs.find((o): o is Extract<UnitOutcome, { ok: false }> => !o.ok);
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: f?.code ?? "FAILED", error: f?.error ?? "Hesaplanamadı.", retryAfterSec: f?.retryAfterSec });
      continue;
    }
    const view = await buildSelectionView(
      ctx,
      s.technique,
      okRows,
      s.options,
      { primary: revision.time_known === true, partner: s.partnerRevision ? s.partnerRevision.time_known === true : null },
      opts.ownerPreviewHideInterp,
      outs.length - okRows.length,
    );
    results.push({ selectionIndex: i, technique: s.technique, ok: true, partial: okRows.length < outs.length, reused: outs.every((o) => o.ok && o.reused), view });
  }

  const executedNew = [...outcomes.values()].filter((o) => o.ok && !o.reused).length;
  const fromCache = [...outcomes.values()].filter((o) => o.ok && o.reused).length;
  const anyOk = results.some((r) => r.ok === true);
  const firstFailure = [...outcomes.values()].find((o): o is Extract<UnitOutcome, { ok: false }> => !o.ok);
  const firstBlock = plan.blocks.find(Boolean) ?? null;
  const status = anyOk ? 200 : firstFailure?.status ?? (firstBlock ? 422 : 500);

  return {
    status,
    body: {
      ok: anyOk,
      ...(anyOk ? {} : firstFailure ? { code: firstFailure.code, error: firstFailure.error } : firstBlock ? { code: firstBlock.code, error: firstBlock.error } : {}),
      plan: publicPlanSummary(plan, selections),
      executed: { newResults: executedNew, cachedResults: fromCache, providerAttempts },
      revision: publicRevision(revision),
      results,
    },
  };
}

/**
 * POST view — YALNIZ ÖNBELLEKTEN görünüm (sağlayıcı bağımlılığı ALMAZ → yapısal olarak 0 istek).
 * Önizleme anahtarı değişince / sayfa yeniden açılınca seçimlerin kayıtlı sonuçlarını göstermek için.
 * Hiç parçası kayıtlı olmayan seçim → NOT_COMPUTED; eksik parça → missingParts ile kısmi görünüm.
 */
export async function viewCachedSelections(ctx: EngineCtx, rawBody: unknown, opts: { ownerPreviewHideInterp: boolean }): Promise<ServiceResponse> {
  const l = await loadAndPlan(ctx, rawBody, new Date());
  if (!l.ok) return l.r;
  const { plan, selections, revision, cachedRows } = l.v;
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < selections.length; i++) {
    const s = selections[i];
    const block = plan.blocks[i];
    if (block) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: block.code, error: block.error });
      continue;
    }
    const hashes = plan.selectionUnits[i];
    const rows = hashes.map((h) => cachedRows.get(h)).filter((r): r is ResultRow => !!r);
    if (rows.length === 0) {
      results.push({ selectionIndex: i, technique: s.technique, ok: false, code: "NOT_COMPUTED", error: "Bu seçim için kayıtlı sonuç yok." });
      continue;
    }
    const view = await buildSelectionView(
      ctx,
      s.technique,
      rows,
      s.options,
      { primary: revision.time_known === true, partner: s.partnerRevision ? s.partnerRevision.time_known === true : null },
      opts.ownerPreviewHideInterp,
      hashes.length - rows.length,
    );
    results.push({ selectionIndex: i, technique: s.technique, ok: true, partial: rows.length < hashes.length, reused: true, view });
  }
  return { status: 200, body: { ok: true, revision: publicRevision(revision), results } };
}
