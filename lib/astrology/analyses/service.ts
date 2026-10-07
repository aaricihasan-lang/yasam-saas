// Astroloji — ÇALIŞMA ALANI (konu + Bilgi Bankası eşleşmesi + danışana özel uzman notu) ve
// KAYITLI ANALİZ (değişmez snapshot) servisi. YALNIZ SUNUCU. Tüm teknikler (natal, transit, forecast,
// progression, solar arc, solar/lunar return, synastry, composite) AYNI akıştan geçer.
//
// Katman ayrımı (karışmaz):
//   A profil snapshot'ı (+ karşı taraf) · B metodoloji (teknik + normalize seçenekler) · C teknik
//   D sağlayıcı yorumu (opsiyonel, yetkiyle) · E uzmanın danışana özel yorumu (astro_analysis_notes kopyası)
//   F Bilgi Bankası eşleşme snapshot'ı · G sürüm metadata'sı.
//
// Kurallar:
//   • Snapshot SUNUCUDA, DB'deki gerçek durumdan kurulur; istemci içerik göndermez (kimlik + seçim).
//   • Seçim → planlayıcı ile YENİDEN birimlere çevrilir (sağlayıcı ÇAĞRILMAZ); tüm parçalar önbellekte
//     olmalıdır. Böylece sonuç ↔ profil revizyonu (ve karşı taraf) tutarlılığı input_hash ile garanti olur.
//   • Kayıtlı analizi AÇMAK sağlayıcı bağımlılığı ALMAZ → yapısal olarak 0 Roxy isteği.
//   • Sağlayıcı yorumu: kaydederken dahil etmek yetki + önizleme kapalı gerektirir; açarken de GÜNCEL
//     yetki kontrol edilir.
//   • Not bağlamı: (profil, teknik, karşı taraf, bölüm). Bölüm anahtarı tekniğin konu bağlamında olmalı
//     (ör. transit notu natal konusuna yazılamaz).

import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { resolveAstroLocation } from "../birth/location";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveInterpretationVisibility } from "../access/entitlements";
import { getTechnique, parseNoteContext, type TechniqueId } from "../engine/techniques";
import { ASTRO_NOT_READY, buildSelectionView, loadProfileRevision, planSelections, type EngineCtx, type ServiceResponse } from "../engine/service";
import { findTenantClient, getProfile, getResultById, isSchemaMissing, isUuid, logAstroDbError, type ResultRow, type RevisionRow } from "../persistence/repo";
import { matchKbEntries, publicKbEntry } from "../kb/service";
import { isSectionKeyForTechnique, topicLabelAny, topicsForTechnique, traditionOfTechnique } from "../topics/index";
import { publicRevision } from "../view/natalView";
import type { TechniqueView } from "../view/techniqueView";

assertServerOnly("lib/astrology/analyses/service");

export const ANALYSIS_SNAPSHOT_SCHEMA = "astro.analysis.v2";
export const TOPIC_TAXONOMY_VERSION = "western-topics-2";

const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): ServiceResponse => ({
  status,
  body: { ok: false, code, error, ...extra },
});
const dbFail = (ctx: string, err: { code?: string } | null | undefined): ServiceResponse => {
  if (isSchemaMissing(err)) return ASTRO_NOT_READY;
  logAstroDbError(ctx, err);
  return fail(500, "DB_ERROR", "İşlem tamamlanamadı.");
};

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

const techniqueLabel = (t: string) => `${t.startsWith("vedic.") ? "Vedik" : "Batı"} · ${getTechnique(t)?.label ?? t}`;

// ─── Ortak: seçim + revizyon bağlamı ─────────────────────────────────────────

type Loaded = {
  revision: RevisionRow;
  partnerRevision: RevisionRow | null;
  technique: TechniqueId;
  options: Record<string, unknown>;
  view: TechniqueView;
  rows: ResultRow[];
  profileLabel: string;
  clientId: string | null;
};

/**
 * Girdi: { profileId, revision, technique, options } (genel) VEYA { profileId, revision, resultId }
 * (Aşama 2 uyumu — yalnız tek parçalı natal sonuç; seçenekler sonucun kendisinden türetilir).
 */
async function loadContext(ctx: EngineCtx, raw: Record<string, unknown>, ownerPreviewHideInterp: boolean): Promise<{ ok: true; v: Loaded } | { ok: false; r: ServiceResponse }> {
  if (!isUuid(raw.profileId)) return { ok: false, r: fail(400, "INVALID_INPUT", "Profil ve hesap seçimi gerekli.") };
  if (raw.revision === undefined || raw.revision === null) return { ok: false, r: fail(400, "INVALID_REVISION", "Geçersiz revizyon.") };
  const pr = await loadProfileRevision(ctx, raw.profileId, raw.revision);
  if (!pr.ok) return pr;

  let selection: { technique: unknown; options: unknown };
  let legacyRow: ResultRow | null = null;
  if (raw.technique === undefined && raw.resultId !== undefined) {
    if (!isUuid(raw.resultId)) return { ok: false, r: fail(400, "INVALID_INPUT", "Profil ve hesap sonucu gerekli.") };
    const res = await getResultById(ctx.db, ctx.tenantId, raw.resultId);
    if (res.error) return { ok: false, r: dbFail("ws.result", res.error) };
    if (!res.row) return { ok: false, r: fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.") };
    if (res.row.technique !== "western.natal") return { ok: false, r: fail(400, "SELECTION_REQUIRED", "Bu sonuç türü için teknik ve seçenekler gönderilmelidir.") };
    legacyRow = res.row;
    const t = res.row.technical as { houseSystem?: unknown; nodeType?: unknown };
    selection = { technique: "western.natal", options: { houseSystem: t.houseSystem, nodeType: t.nodeType } };
  } else {
    selection = { technique: raw.technique, options: raw.options };
  }

  const p = await planSelections(ctx, pr.revision, [selection], new Date());
  if (!p.ok) return p;
  const s = p.v.selections[0];
  const block = p.v.plan.blocks[0];
  if (block) return { ok: false, r: fail(409, block.code, block.error) };
  const hashes = p.v.plan.selectionUnits[0];
  if (legacyRow && !hashes.includes(legacyRow.input_hash)) {
    return { ok: false, r: fail(409, "RESULT_PROFILE_MISMATCH", "Hesap sonucu bu doğum profili revizyonuna ait değil.") };
  }
  const all = hashes.map((h) => p.v.cachedRows.get(h));
  // Zorunlu birimli tekniklerde (relocation) yalnız zorunlu birim şart; karşılaştırma birimi isteğe bağlı.
  const primaryPart = getTechnique(s.technique)?.primaryPart;
  const missing = primaryPart !== undefined ? !all[primaryPart] : all.some((r) => !r);
  if (missing) {
    return { ok: false, r: fail(409, "RESULT_NOT_COMPUTED", "Bu seçimin hesabı (tüm parçalarıyla) henüz yapılmamış. Önce hesaplayın.") };
  }
  const rows = all.filter((r): r is ResultRow => !!r);
  const view = await buildSelectionView(
    ctx,
    s.technique,
    rows,
    s.options,
    { primary: pr.revision.time_known === true, partner: s.partnerRevision ? s.partnerRevision.time_known === true : null },
    ownerPreviewHideInterp,
    all.length - rows.length,
  );
  return {
    ok: true,
    v: { revision: pr.revision, partnerRevision: s.partnerRevision, technique: s.technique, options: s.options, view, rows: rows as ResultRow[], profileLabel: pr.label, clientId: pr.clientId },
  };
}

/**
 * Konum bağlamı (Aşama 4): not tablosunun bağlam CHECK'i uuid ister → konum kimliğinden DETERMİNİSTİK
 * uuid türetilir (migration gerekmez). New York relocation notu Berlin relocation notuna karışmaz.
 */
export function locationContextKey(technique: string, locationId: string): string {
  const h = createHash("sha1").update(`yasam-astro-note-ctx\u001f${technique}\u001f${locationId}`, "utf8").digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Notun bağlam konum kimliği (relocation hedefi / local space referansı; doğum yeri = null). */
function contextLocationIdOf(technique: string, options: Record<string, unknown>): string | null {
  if (technique === "western.relocation") return typeof options.targetLocationId === "string" ? options.targetLocationId : null;
  if (technique === "western.local_space") return typeof options.referenceLocationId === "string" ? options.referenceLocationId : null;
  // Aşama 4.1: relocated return notu kendi konum bağlamında; doğum yeri (null) → "" (Aşama 3 notları aynen).
  if (technique === "western.solar_return" || technique === "western.lunar_return") return typeof options.returnLocationId === "string" ? options.returnLocationId : null;
  return null;
}

/** Aşama 5: Vedik not bağlamı (ayanamsa [+ varga/dasha]) → deterministik uuid (ayrı ad alanı). */
export function vedicContextKey(technique: string, noteContext: string): string {
  return locationContextKey(technique, `vedic${noteContext}`);
}

function noteContextOf(technique: string, options: Record<string, unknown>): string | null {
  const def = getTechnique(technique);
  return def?.noteContext ? def.noteContext(options) : null;
}

function contextKeyOf(technique: string, options: Record<string, unknown>, partner: RevisionRow | null): string {
  if (partner) return partner.profile_id;
  const nc = noteContextOf(technique, options);
  if (nc) return vedicContextKey(technique, nc);
  const loc = contextLocationIdOf(technique, options);
  return loc ? locationContextKey(technique, loc) : "";
}

type NoteRow = { id: string; section_key: string; body: string; revision: number; updated_at: string };

async function loadNotes(ctx: EngineCtx, profileId: string, technique: string, contextKey: string): Promise<{ rows: NoteRow[]; error: { code?: string } | null }> {
  const { data, error } = await ctx.db
    .from("astro_expert_notes")
    .select("id, section_key, body, revision, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("profile_id", profileId)
    .eq("technique", technique)
    .eq("context_key", contextKey)
    .limit(500);
  return { rows: (data as NoteRow[] | null) ?? [], error };
}

const sectionLabel = (k: string) => (k === "overall" ? "Genel yorum" : topicLabelAny(k));
const publicNote = (n: NoteRow) => ({ id: n.id, sectionKey: n.section_key, sectionLabel: sectionLabel(n.section_key), body: n.body, revision: n.revision, updatedAt: n.updated_at });

// ─── Çalışma alanı: konular + Bilgi Bankam + danışana özel notlar ────────────

export async function getWorkspace(ctx: EngineCtx, q: Record<string, unknown>): Promise<ServiceResponse> {
  const l = await loadContext(ctx, q, true); // yorum içeriği burada GEREKMEZ → okunmaz
  if (!l.ok) return l.r;
  const topics = topicsForTechnique(l.v.technique, l.v.view.technical);
  const kb = await matchKbEntries(ctx, traditionOfTechnique(l.v.technique), topics.map((t) => t.key));
  if (kb.error) return dbFail("ws.kb", kb.error);
  const contextKey = contextKeyOf(l.v.technique, l.v.options, l.v.partnerRevision);
  const notes = await loadNotes(ctx, l.v.revision.profile_id, l.v.technique, contextKey);
  if (notes.error) return dbFail("ws.notes", notes.error);
  return {
    status: 200,
    body: {
      ok: true,
      technique: l.v.technique,
      contextKey,
      contextLocationId: contextLocationIdOf(l.v.technique, l.v.options),
      noteContext: noteContextOf(l.v.technique, l.v.options),
      knowledgeBankEnabled: ctx.entitlements.knowledgeBank,
      topics,
      kbMatches: kb.rows.map(publicKbEntry),
      notes: notes.rows.map(publicNote),
    },
  };
}

/** Danışana özel uzman notu (upsert, iyimser kilitli). Bilgi Bankası'na DOKUNMAZ. */
export async function saveExpertNote(ctx: EngineCtx, raw: unknown): Promise<ServiceResponse> {
  const o = obj(raw);
  if (!o) return fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  if (!isUuid(o.profileId)) return fail(400, "INVALID_PROFILE", "Geçerli profil gerekli.");
  const def = getTechnique(o.technique ?? "western.natal");
  if (!def) return fail(400, "UNKNOWN_TECHNIQUE", "Bilinmeyen hesaplama türü.");
  let contextKey = o.contextKey === undefined || o.contextKey === null || o.contextKey === "" ? "" : o.contextKey;
  const isLocationCtx = ["western.relocation", "western.local_space", "western.solar_return", "western.lunar_return"].includes(def.id);
  if (def.noteContext) {
    // Vedik bağlam: metin sunucuda parseOptions ile doğrulanır ve uuid SUNUCUDA türetilir.
    const opts = parseNoteContext(def, o.noteContext);
    if (!opts) return fail(400, "INVALID_CONTEXT", "Geçersiz not bağlamı (ayanamsa).");
    const derived = vedicContextKey(def.id, def.noteContext(opts));
    if (contextKey !== "" && contextKey !== derived) return fail(400, "INVALID_CONTEXT", "Geçersiz not bağlamı.");
    contextKey = derived;
  } else if (isLocationCtx) {
    // Konum bağlamı istemcinin uuid'sine güvenilmez: konum kimliğinden SUNUCUDA türetilir ve konum doğrulanır.
    const locIdRaw = o.contextLocationId;
    if (locIdRaw === undefined || locIdRaw === null || locIdRaw === "") {
      if (def.id === "western.relocation") return fail(400, "INVALID_CONTEXT", "Relocation notu için hedef konum gerekli.");
      if (contextKey !== "") return fail(400, "INVALID_CONTEXT", "Geçersiz not bağlamı.");
    } else {
      if (!resolveAstroLocation(locIdRaw)) return fail(404, "LOCATION_NOT_FOUND", "Konum bulunamadı.");
      const derived = locationContextKey(def.id, String(locIdRaw));
      if (contextKey !== "" && contextKey !== derived) return fail(400, "INVALID_CONTEXT", "Geçersiz not bağlamı.");
      contextKey = derived;
    }
  } else if (def.requiresPartner ? !isUuid(contextKey) : contextKey !== "") return fail(400, "INVALID_CONTEXT", "Geçersiz not bağlamı.");
  const section = o.sectionKey;
  if (typeof section !== "string" || !isSectionKeyForTechnique(def.id, section)) return fail(400, "INVALID_SECTION", "Geçersiz not bölümü.");
  if (typeof o.body !== "string" || o.body.length > 20000) return fail(400, "INVALID_TEXT", "Not en fazla 20000 karakter olabilir.");
  const p = await getProfile(ctx.db, ctx.tenantId, o.profileId);
  if (p.error) return dbFail("note.profile", p.error);
  if (!p.row) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  if (contextKey !== "" && def.requiresPartner) {
    const pp = await getProfile(ctx.db, ctx.tenantId, contextKey as string);
    if (pp.error) return dbFail("note.partner", pp.error);
    if (!pp.row) return fail(404, "PARTNER_NOT_FOUND", "Karşı taraf doğum profili bulunamadı.");
  }
  const expected = o.expectedRevision;
  if (expected === null || expected === undefined) {
    const { data, error } = await ctx.db
      .from("astro_expert_notes")
      .insert({ tenant_id: ctx.tenantId, owner_user_id: ctx.userId, profile_id: o.profileId, technique: def.id, context_key: contextKey, section_key: section, body: o.body })
      .select("id, section_key, body, revision, updated_at")
      .single();
    if (error) {
      if (error.code === "23505") return fail(409, "NOTE_REVISION_CONFLICT", "Bu not bu arada oluşturulmuş. Yenileyip tekrar deneyin.");
      return dbFail("note.insert", error);
    }
    return { status: 201, body: { ok: true, note: publicNote(data as NoteRow) } };
  }
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 1) return fail(400, "INVALID_EXPECTED_REVISION", "Beklenen revizyon gerekli.");
  const { data, error } = await ctx.db
    .from("astro_expert_notes")
    .update({ body: o.body, revision: expected + 1 })
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("profile_id", o.profileId)
    .eq("technique", def.id)
    .eq("context_key", contextKey as string)
    .eq("section_key", section)
    .eq("revision", expected)
    .select("id, section_key, body, revision, updated_at");
  if (error) return dbFail("note.update", error);
  const rows = (data as NoteRow[] | null) ?? [];
  if (rows.length !== 1) return fail(409, "NOTE_REVISION_CONFLICT", "Not bu arada değişmiş. Yenileyip tekrar deneyin.");
  return { status: 200, body: { ok: true, note: publicNote(rows[0]) } };
}

// ─── Kayıtlı analiz ──────────────────────────────────────────────────────────

type SnapshotBundle = {
  title: string;
  technique: TechniqueId;
  options: Record<string, unknown>;
  profileSnapshot: Record<string, unknown>;
  methodSnapshot: Record<string, unknown>;
  technicalSnapshot: unknown;
  includeInterp: boolean;
  interpSnapshot: Record<string, unknown> | null;
  kbSnapshot: ReturnType<typeof kbSnapshotEntry>[];
  versionsSnapshot: Record<string, unknown>;
  notes: { section_key: string; body: string }[];
  topicCount: number;
  revision: RevisionRow;
  partnerRevision: RevisionRow | null;
  resultIds: string[];
  partnerLabel: string | null;
};

function kbSnapshotEntry(e: ReturnType<typeof publicKbEntry>) {
  return {
    entryId: e.id,
    tradition: e.tradition,
    topicKey: e.topicKey,
    topicLabel: e.topicLabel,
    title: e.title,
    body: e.body,
    sourceNote: e.sourceNote,
    tags: e.tags,
    revision: e.revision,
    updatedAt: e.updatedAt,
  };
}

export function fmtDateTr(iso: string): string {
  // Aşama 5G: sunucu UTC'de çalışır; başlık tarihi kullanıcının takvim günü (Europe/Istanbul) olmalı —
  // 00:00–03:00 TR arasında kaydedilen analiz önceki günü göstermesin.
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

async function clientRef(ctx: EngineCtx, clientId: string | null): Promise<{ ok: true; v: { id: string; name: string | null } | null } | { ok: false; r: ServiceResponse }> {
  if (!clientId) return { ok: true, v: null };
  const c = await findTenantClient(ctx.db, ctx.tenantId, clientId);
  if (c.error) return { ok: false, r: dbFail("snap.client", c.error) };
  return { ok: true, v: c.row ? { id: c.row.id, name: `${c.row.ad ?? ""} ${c.row.soyad ?? ""}`.trim() || null } : null };
}

async function buildSnapshot(ctx: EngineCtx, raw: unknown, ownerPreviewHideInterp: boolean): Promise<{ ok: true; v: SnapshotBundle } | { ok: false; r: ServiceResponse }> {
  if (!ctx.entitlements.engine) return { ok: false, r: fail(403, "ENGINE_NOT_ENTITLED", "Hesap Motoru yetkisi yok.") };
  const o = obj(raw);
  if (!o) return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  const includeInterp = o.includeProviderInterp === true;
  const l = await loadContext(ctx, o, ownerPreviewHideInterp);
  if (!l.ok) return l;
  const { view, revision, partnerRevision, technique } = l.v;

  let interpSnapshot: Record<string, unknown> | null = null;
  if (includeInterp) {
    const vis = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
    if (!vis.visible) return { ok: false, r: fail(403, "PROVIDER_INTERP_NOT_ENTITLED", "Roxy otomatik yorumu bu görünümde kapalı; analize dahil edilemez.") };
    if (!view.interpretation.visible) return { ok: false, r: fail(409, "PROVIDER_INTERP_UNAVAILABLE", "Bu sonuç için sağlayıcı yorum katmanı yok.") };
    interpSnapshot = { provider: view.interpretation.provider, lang: view.interpretation.lang, notice: view.interpretation.notice, content: view.interpretation.content };
  }

  const topics = topicsForTechnique(technique, view.technical);
  const kb = await matchKbEntries(ctx, traditionOfTechnique(technique), topics.map((t) => t.key));
  if (kb.error) return { ok: false, r: dbFail("snap.kb", kb.error) };
  const notes = await loadNotes(ctx, revision.profile_id, technique, contextKeyOf(technique, l.v.options, partnerRevision));
  if (notes.error) return { ok: false, r: dbFail("snap.notes", notes.error) };

  const client = await clientRef(ctx, l.v.clientId);
  if (!client.ok) return client;
  let partner: Record<string, unknown> | null = null;
  let partnerLabel: string | null = null;
  if (partnerRevision) {
    const pp = await getProfile(ctx.db, ctx.tenantId, partnerRevision.profile_id);
    if (pp.error) return { ok: false, r: dbFail("snap.partner", pp.error) };
    if (!pp.row) return { ok: false, r: fail(404, "PARTNER_NOT_FOUND", "Karşı taraf doğum profili bulunamadı.") };
    const pc = await clientRef(ctx, pp.row.client_id);
    if (!pc.ok) return pc;
    partnerLabel = pp.row.label;
    partner = { profileId: partnerRevision.profile_id, label: pp.row.label, client: pc.v, revision: publicRevision(partnerRevision) };
  }

  let title = typeof o.title === "string" ? o.title.trim() : "";
  if (title.length > 200) return { ok: false, r: fail(400, "INVALID_TITLE", "Başlık en fazla 200 karakter.") };
  if (!title) {
    const def = getTechnique(technique)!;
    const rl = l.v.options.returnLocation as { locationId?: string | null; label?: string } | undefined;
    const place = (l.v.options.target ?? l.v.options.reference ?? (rl?.locationId ? rl : undefined)) as { label?: string } | undefined;
    title = `${l.v.profileLabel}${partnerLabel ? ` & ${partnerLabel}` : ""} · ${def.label}${place?.label ? ` → ${place.label}` : ""} · ${fmtDateTr(new Date().toISOString())}`.slice(0, 200);
  }

  const tech = view.technical as { schema?: string; variants?: unknown };
  return {
    ok: true,
    v: {
      title,
      technique,
      options: l.v.options,
      profileSnapshot: { schema: "astro.analysis.profile.v2", profileId: revision.profile_id, label: l.v.profileLabel, client: client.v, revision: publicRevision(revision), partner },
      methodSnapshot: {
        technique,
        techniqueLabel: techniqueLabel(technique),
        options: l.v.options,
        zodiac: view.method.zodiac,
        houseSystem: view.method.houseSystem,
        nodeType: view.method.nodeType,
        variants: tech.variants ?? null,
        timeUnknownMasked: view.timeUnknownMasked,
        warnings: view.warnings,
      },
      technicalSnapshot: view.technical,
      includeInterp,
      interpSnapshot,
      kbSnapshot: kb.rows.map(publicKbEntry).map(kbSnapshotEntry),
      versionsSnapshot: {
        snapshotSchema: ANALYSIS_SNAPSHOT_SCHEMA,
        topicTaxonomy: TOPIC_TAXONOMY_VERSION,
        provider: view.provider,
        providerApiVersion: view.providerApiVersion,
        adapterVersion: view.adapterVersion,
        projectionVersion: view.projectionVersion,
        technicalSchema: tech.schema ?? null,
        interpretationSchema: interpSnapshot && view.interpretation.visible ? ((view.interpretation.content as { schema?: string }).schema ?? null) : null,
        resultId: view.id,
        resultIds: view.resultIds,
        resultComputedAt: view.computedAt,
      },
      notes: notes.rows.filter((n) => n.body.trim().length > 0).map((n) => ({ section_key: n.section_key, body: n.body })),
      topicCount: topics.length,
      revision,
      partnerRevision,
      resultIds: view.resultIds,
      partnerLabel,
    },
  };
}

/** Kaydetmeden önce özet (yazım YOK, sağlayıcı çağrısı YOK). */
export async function previewAnalysis(ctx: EngineCtx, raw: unknown, ownerPreviewHideInterp: boolean): Promise<ServiceResponse> {
  const s = await buildSnapshot(ctx, raw, ownerPreviewHideInterp);
  if (!s.ok) return s.r;
  const v = s.v;
  return {
    status: 200,
    body: {
      ok: true,
      summary: {
        title: v.title,
        client: (v.profileSnapshot.client as { name: string | null } | null)?.name ?? null,
        profileLabel: v.profileSnapshot.label,
        partnerLabel: v.partnerLabel,
        partnerRevision: v.partnerRevision?.revision ?? null,
        technique: v.technique,
        techniqueLabel: techniqueLabel(v.technique),
        options: v.options,
        revision: v.revision.revision,
        zodiac: "tropical",
        houseSystem: v.methodSnapshot.houseSystem,
        nodeType: v.methodSnapshot.nodeType,
        provider: v.versionsSnapshot.provider,
        resultComputedAt: v.versionsSnapshot.resultComputedAt,
        partCount: v.resultIds.length,
        topicCount: v.topicCount,
        kbMatchCount: v.kbSnapshot.length,
        noteCount: v.notes.length,
        providerInterpIncluded: v.includeInterp,
        timeUnknownMasked: v.methodSnapshot.timeUnknownMasked,
      },
    },
  };
}

export async function saveAnalysis(ctx: EngineCtx, raw: unknown, ownerPreviewHideInterp: boolean): Promise<ServiceResponse> {
  const o = obj(raw);
  if (!o || !isUuid(o.saveRequestId)) return fail(400, "INVALID_REQUEST_ID", "Kaydetme isteği kimliği gerekli.");
  const s = await buildSnapshot(ctx, raw, ownerPreviewHideInterp);
  if (!s.ok) return s.r;
  const v = s.v;
  const { data, error } = await ctx.db.rpc("astro_analysis_save_v2", {
    p_tenant_id: ctx.tenantId,
    p_user_id: ctx.userId,
    p_profile_id: v.revision.profile_id,
    p_profile_revision: v.revision.revision,
    p_partner_profile_id: v.partnerRevision?.profile_id ?? null,
    p_partner_profile_revision: v.partnerRevision?.revision ?? null,
    p_result_ids: v.resultIds,
    p_technique: v.technique,
    p_title: v.title,
    p_save_request_id: o.saveRequestId,
    p_technique_params: v.options,
    p_profile_snapshot: v.profileSnapshot,
    p_method_snapshot: v.methodSnapshot,
    p_technical_snapshot: v.technicalSnapshot,
    p_kb_snapshot: v.kbSnapshot,
    p_provider_interp_included: v.includeInterp,
    p_provider_interp_snapshot: v.interpSnapshot,
    p_versions_snapshot: v.versionsSnapshot,
    p_notes: v.notes,
  });
  if (error) {
    if (/ASTRO_PROFILE_NOT_FOUND/.test(String((error as { message?: string }).message ?? ""))) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
    return dbFail("analysis.save", error);
  }
  const d = data as { analysis_id?: unknown; reused?: unknown } | null;
  if (!d || !isUuid(d.analysis_id)) return fail(500, "DB_ERROR", "Analiz kaydedilemedi.");
  return { status: d.reused === true ? 200 : 201, body: { ok: true, analysisId: d.analysis_id, reused: d.reused === true } };
}

export function newSaveRequestId(): string {
  return randomUUID();
}

type AnalysisRow = {
  id: string;
  profile_id: string;
  profile_revision: number;
  partner_profile_id: string | null;
  partner_profile_revision: number | null;
  client_id: string | null;
  technique: string;
  title: string;
  event_kind: string;
  analysis_at: string;
  technique_params: Record<string, unknown>;
  profile_snapshot: Record<string, unknown>;
  method_snapshot: Record<string, unknown>;
  technical_snapshot: Record<string, unknown>;
  provider_interp_included: boolean;
  provider_interp_snapshot: Record<string, unknown> | null;
  kb_snapshot: unknown[];
  versions_snapshot: Record<string, unknown>;
  created_at: string;
};

const LIST_COLUMNS =
  "id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, client_id, technique, title, event_kind, analysis_at, technique_params, provider_interp_included, method_snapshot, profile_snapshot, created_at";

export async function listAnalyses(ctx: EngineCtx, profileId: unknown): Promise<ServiceResponse> {
  if (!isUuid(profileId)) return fail(400, "INVALID_PROFILE", "Geçerli profil gerekli.");
  const { data, error } = await ctx.db
    .from("astro_analyses")
    .select(LIST_COLUMNS)
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("profile_id", profileId)
    .order("analysis_at", { ascending: false })
    .limit(200);
  if (error) return dbFail("analysis.list", error);
  const rows = (data as AnalysisRow[] | null) ?? [];
  return {
    status: 200,
    body: {
      ok: true,
      analyses: rows.map((r) => ({
        id: r.id,
        title: r.title,
        technique: r.technique,
        techniqueLabel: techniqueLabel(r.technique),
        params: r.technique_params ?? {},
        partnerLabel: ((r.profile_snapshot?.partner as { label?: string } | null | undefined)?.label ?? null) as string | null,
        analysisAt: r.analysis_at,
        profileRevision: r.profile_revision,
        clientId: r.client_id,
        eventKind: r.event_kind,
        houseSystem: (r.method_snapshot as { houseSystem?: string }).houseSystem ?? null,
        providerInterpIncluded: r.provider_interp_included,
      })),
    },
  };
}

/** Kayıtlı analizi AÇ — yalnız snapshot okunur; sağlayıcı bağımlılığı YOK (0 Roxy isteği). */
export async function getAnalysis(ctx: EngineCtx, id: string, ownerPreviewHideInterp: boolean): Promise<ServiceResponse> {
  if (!isUuid(id)) return fail(404, "ANALYSIS_NOT_FOUND", "Analiz bulunamadı.");
  const { data, error } = await ctx.db
    .from("astro_analyses")
    .select(
      "id, profile_id, profile_revision, partner_profile_id, partner_profile_revision, client_id, technique, title, event_kind, analysis_at, technique_params, profile_snapshot, method_snapshot, technical_snapshot, provider_interp_included, provider_interp_snapshot, kb_snapshot, versions_snapshot, created_at",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("id", id)
    .maybeSingle();
  if (error) return dbFail("analysis.get", error);
  const a = data as AnalysisRow | null;
  if (!a) return fail(404, "ANALYSIS_NOT_FOUND", "Analiz bulunamadı.");
  const notesRes = await ctx.db.from("astro_analysis_notes").select("section_key, body").eq("tenant_id", ctx.tenantId).eq("analysis_id", id).limit(500);
  if (notesRes.error) return dbFail("analysis.notes", notesRes.error);

  let interpretation: Record<string, unknown>;
  if (!a.provider_interp_included || !a.provider_interp_snapshot) {
    interpretation = { visible: false, reason: "not_included" };
  } else {
    // GÜNCEL yetki: kayıtta yorum olsa bile yetki/önizleme kapalıysa İÇERİK GÖNDERİLMEZ.
    const vis = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
    interpretation = vis.visible ? { visible: true, ...a.provider_interp_snapshot } : { visible: false, reason: vis.reason };
  }

  return {
    status: 200,
    body: {
      ok: true,
      analysis: {
        id: a.id,
        title: a.title,
        technique: a.technique,
        techniqueLabel: techniqueLabel(a.technique),
        params: a.technique_params ?? {},
        analysisAt: a.analysis_at,
        eventKind: a.event_kind,
        clientId: a.client_id,
        profile: a.profile_snapshot,
        method: a.method_snapshot,
        technical: a.technical_snapshot,
        topics: topicsForTechnique(a.technique, a.technical_snapshot),
        knowledgeBank: a.kb_snapshot,
        notes: ((notesRes.data as { section_key: string; body: string }[] | null) ?? []).map((n) => ({
          sectionKey: n.section_key,
          sectionLabel: sectionLabel(n.section_key),
          body: n.body,
        })),
        interpretation,
        versions: a.versions_snapshot,
      },
    },
  };
}
