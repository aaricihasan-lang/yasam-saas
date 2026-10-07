// Astroloji — ÇALIŞMA ALANI (konu + Bilgi Bankası eşleşmesi + danışana özel uzman notu) ve
// KAYITLI ANALİZ (değişmez snapshot) servisi. YALNIZ SUNUCU.
//
// Katman ayrımı (karışmaz):
//   A profil snapshot'ı · B metodoloji · C teknik · D sağlayıcı yorumu (opsiyonel, yetkiyle)
//   E uzmanın danışana özel yorumu (astro_analysis_notes kopyası) · F Bilgi Bankası eşleşme snapshot'ı
//   G sürüm metadata'sı.
//
// Kurallar:
//   • Snapshot SUNUCUDA, DB'deki gerçek durumdan kurulur; istemci içerik göndermez (yalnız kimlik + seçim).
//   • Sonuç ↔ profil revizyonu tutarlılığı input_hash ile doğrulanır (başka danışanın sonucu karışmaz).
//   • Kayıtlı analizi AÇMAK sağlayıcı bağımlılığı ALMAZ → yapısal olarak 0 Roxy isteği.
//   • Sağlayıcı yorumu: kaydederken dahil etmek yetki + önizleme kapalı gerektirir; açarken de GÜNCEL
//     yetki kontrol edilir (yetki kapanırsa yorum gösterilmez; uzman verisi etkilenmez, silinmez).
//   • Uzman notu Bilgi Bankası'nı değiştirmez (ayrı tablo); analiz kendi kopyasını taşır.

import "server-only";
import { randomUUID } from "node:crypto";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveInterpretationVisibility } from "../access/entitlements";
import { getTechnique } from "../engine/techniques";
import { buildResultView, ASTRO_NOT_READY, type EngineCtx, type ServiceResponse } from "../engine/service";
import { findTenantClient, getProfile, getResultById, getRevision, isSchemaMissing, isUuid, logAstroDbError, type RevisionRow } from "../persistence/repo";
import { matchKbEntries, publicKbEntry } from "../kb/service";
import { parseTopicKey, topicLabelForKey, topicsFromNatal, type NatalTopic } from "../topics/western";
import { publicRevision, type NatalView } from "../view/natalView";
import type { NatalTechnical } from "../model/western";
import { normalizeTime } from "../birth/timeResolution";

assertServerOnly("lib/astrology/analyses/service");

export const ANALYSIS_SNAPSHOT_SCHEMA = "astro.analysis.v1";
export const TOPIC_TAXONOMY_VERSION = "western-topics-1";
const NOTE_TECHNIQUE = "western.natal";

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

// ─── Ortak: sonuç + revizyon bağlamı ─────────────────────────────────────────

type Loaded = { revision: RevisionRow; view: NatalView; profileLabel: string; clientId: string | null; resultRow: Awaited<ReturnType<typeof getResultById>>["row"] & object };

/** Sonucun BU profil revizyonunun girdisinden üretildiğini doğrular (input_hash). */
function resultMatchesRevision(row: { technique: string; input_hash: string; technical: Record<string, unknown> }, rev: RevisionRow): boolean {
  const def = getTechnique(row.technique);
  if (!def) return false;
  const t = row.technical as unknown as Pick<NatalTechnical, "houseSystem" | "nodeType">;
  const options = def.parseOptions({ houseSystem: t.houseSystem, nodeType: t.nodeType });
  if (!options) return false;
  const units = def.units(
    {
      birthDate: rev.birth_date,
      birthTime: rev.time_known && rev.birth_time ? normalizeTime(rev.birth_time.slice(0, 8)) : null,
      utcOffsetSeconds: rev.utc_offset_seconds,
      latitude: rev.latitude,
      longitude: rev.longitude,
    },
    options,
  );
  return units.some((u) => u.inputHash === row.input_hash);
}

async function loadContext(
  ctx: EngineCtx,
  q: { profileId: unknown; revision: unknown; resultId: unknown },
  ownerPreviewHideInterp: boolean,
): Promise<{ ok: true; v: Loaded } | { ok: false; r: ServiceResponse }> {
  if (!isUuid(q.profileId) || !isUuid(q.resultId)) return { ok: false, r: fail(400, "INVALID_INPUT", "Profil ve hesap sonucu gerekli.") };
  const revNo = typeof q.revision === "number" ? q.revision : Number(q.revision);
  if (!Number.isInteger(revNo) || revNo < 1) return { ok: false, r: fail(400, "INVALID_REVISION", "Geçersiz revizyon.") };
  const p = await getProfile(ctx.db, ctx.tenantId, q.profileId);
  if (p.error) return { ok: false, r: dbFail("ws.profile", p.error) };
  if (!p.row) return { ok: false, r: fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.") };
  const rv = await getRevision(ctx.db, ctx.tenantId, q.profileId, revNo);
  if (rv.error) return { ok: false, r: dbFail("ws.revision", rv.error) };
  if (!rv.row) return { ok: false, r: fail(404, "REVISION_NOT_FOUND", "Doğum profili revizyonu bulunamadı.") };
  const res = await getResultById(ctx.db, ctx.tenantId, q.resultId);
  if (res.error) return { ok: false, r: dbFail("ws.result", res.error) };
  if (!res.row) return { ok: false, r: fail(404, "RESULT_NOT_FOUND", "Hesap sonucu bulunamadı.") };
  if (!resultMatchesRevision(res.row, rv.row)) {
    return { ok: false, r: fail(409, "RESULT_PROFILE_MISMATCH", "Hesap sonucu bu doğum profili revizyonuna ait değil.") };
  }
  const view = await buildResultView(ctx, res.row, rv.row, ownerPreviewHideInterp);
  return { ok: true, v: { revision: rv.row, view, profileLabel: p.row.label, clientId: p.row.client_id, resultRow: res.row } };
}

type NoteRow = { id: string; section_key: string; body: string; revision: number; updated_at: string };

async function loadNotes(ctx: EngineCtx, profileId: string): Promise<{ rows: NoteRow[]; error: { code?: string } | null }> {
  const { data, error } = await ctx.db
    .from("astro_expert_notes")
    .select("id, section_key, body, revision, updated_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("owner_user_id", ctx.userId)
    .eq("profile_id", profileId)
    .eq("technique", NOTE_TECHNIQUE)
    .limit(500);
  return { rows: (data as NoteRow[] | null) ?? [], error };
}

const publicNote = (n: NoteRow) => ({ id: n.id, sectionKey: n.section_key, sectionLabel: n.section_key === "overall" ? "Genel yorum" : topicLabelForKey(n.section_key), body: n.body, revision: n.revision, updatedAt: n.updated_at });

// ─── Çalışma alanı: konular + Bilgi Bankam + danışana özel notlar ────────────

export async function getWorkspace(ctx: EngineCtx, q: { profileId: unknown; revision: unknown; resultId: unknown }): Promise<ServiceResponse> {
  const l = await loadContext(ctx, q, true); // yorum içeriği burada GEREKMEZ → okunmaz
  if (!l.ok) return l.r;
  const topics = topicsFromNatal(l.v.view.technical);
  const kb = await matchKbEntries(ctx, "western", topics.map((t) => t.key));
  if (kb.error) return dbFail("ws.kb", kb.error);
  const notes = await loadNotes(ctx, l.v.revision.profile_id);
  if (notes.error) return dbFail("ws.notes", notes.error);
  return {
    status: 200,
    body: {
      ok: true,
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
  const section = o.sectionKey;
  if (section !== "overall" && !parseTopicKey("western", section)) return fail(400, "INVALID_SECTION", "Geçersiz not bölümü.");
  if (typeof o.body !== "string" || o.body.length > 20000) return fail(400, "INVALID_TEXT", "Not en fazla 20000 karakter olabilir.");
  const p = await getProfile(ctx.db, ctx.tenantId, o.profileId);
  if (p.error) return dbFail("note.profile", p.error);
  if (!p.row) return fail(404, "PROFILE_NOT_FOUND", "Doğum profili bulunamadı.");
  const expected = o.expectedRevision;
  if (expected === null || expected === undefined) {
    const { data, error } = await ctx.db
      .from("astro_expert_notes")
      .insert({ tenant_id: ctx.tenantId, owner_user_id: ctx.userId, profile_id: o.profileId, technique: NOTE_TECHNIQUE, section_key: section, body: o.body })
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
    .eq("technique", NOTE_TECHNIQUE)
    .eq("section_key", section as string)
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
  profileSnapshot: Record<string, unknown>;
  methodSnapshot: Record<string, unknown>;
  technicalSnapshot: NatalTechnical;
  includeInterp: boolean;
  interpSnapshot: Record<string, unknown> | null;
  kbSnapshot: ReturnType<typeof kbSnapshotEntry>[];
  versionsSnapshot: Record<string, unknown>;
  notes: { section_key: string; body: string }[];
  topics: NatalTopic[];
  revision: RevisionRow;
  resultId: string;
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

function fmtDateTr(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
}

async function buildSnapshot(
  ctx: EngineCtx,
  raw: unknown,
  ownerPreviewHideInterp: boolean,
): Promise<{ ok: true; v: SnapshotBundle } | { ok: false; r: ServiceResponse }> {
  if (!ctx.entitlements.engine) return { ok: false, r: fail(403, "ENGINE_NOT_ENTITLED", "Hesap Motoru yetkisi yok.") };
  const o = obj(raw);
  if (!o) return { ok: false, r: fail(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.") };
  const includeInterp = o.includeProviderInterp === true;
  const l = await loadContext(ctx, { profileId: o.profileId, revision: o.revision, resultId: o.resultId }, ownerPreviewHideInterp);
  if (!l.ok) return l;
  const { view, revision } = l.v;

  let interpSnapshot: Record<string, unknown> | null = null;
  if (includeInterp) {
    const vis = resolveInterpretationVisibility(ctx.entitlements, ownerPreviewHideInterp);
    if (!vis.visible) return { ok: false, r: fail(403, "PROVIDER_INTERP_NOT_ENTITLED", "Roxy otomatik yorumu bu görünümde kapalı; analize dahil edilemez.") };
    if (!view.interpretation.visible) return { ok: false, r: fail(409, "PROVIDER_INTERP_UNAVAILABLE", "Bu sonuç için sağlayıcı yorum katmanı yok.") };
    interpSnapshot = {
      provider: view.interpretation.provider,
      lang: view.interpretation.lang,
      notice: view.interpretation.notice,
      content: view.interpretation.content,
    };
  }

  const topics = topicsFromNatal(view.technical);
  const kb = await matchKbEntries(ctx, "western", topics.map((t) => t.key));
  if (kb.error) return { ok: false, r: dbFail("snap.kb", kb.error) };
  const notes = await loadNotes(ctx, revision.profile_id);
  if (notes.error) return { ok: false, r: dbFail("snap.notes", notes.error) };

  let client: { id: string; name: string | null } | null = null;
  if (l.v.clientId) {
    const c = await findTenantClient(ctx.db, ctx.tenantId, l.v.clientId);
    if (c.error) return { ok: false, r: dbFail("snap.client", c.error) };
    if (c.row) client = { id: c.row.id, name: `${c.row.ad ?? ""} ${c.row.soyad ?? ""}`.trim() || null };
  }

  let title = typeof o.title === "string" ? o.title.trim() : "";
  if (title.length > 200) return { ok: false, r: fail(400, "INVALID_TITLE", "Başlık en fazla 200 karakter.") };
  if (!title) title = `${l.v.profileLabel} · Natal · ${fmtDateTr(new Date().toISOString())}`;

  return {
    ok: true,
    v: {
      title,
      profileSnapshot: { schema: "astro.analysis.profile.v1", profileId: revision.profile_id, label: l.v.profileLabel, client, revision: publicRevision(revision) },
      methodSnapshot: {
        technique: view.technique,
        zodiac: view.method.zodiac,
        houseSystem: view.method.houseSystem,
        nodeType: view.method.nodeType,
        variants: view.technical.variants ?? null,
        timeUnknownMasked: view.timeUnknownMasked,
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
        projectionVersion: l.v.resultRow.projection_version,
        technicalSchema: view.technical.schema,
        interpretationSchema: interpSnapshot ? (view.interpretation.visible ? view.interpretation.content.schema : null) : null,
        resultId: view.id,
        resultComputedAt: view.computedAt,
      },
      notes: notes.rows.filter((n) => n.body.trim().length > 0).map((n) => ({ section_key: n.section_key, body: n.body })),
      topics,
      revision,
      resultId: view.id,
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
        technique: "western.natal",
        techniqueLabel: "Batı · Natal",
        revision: v.revision.revision,
        zodiac: "tropical",
        houseSystem: v.methodSnapshot.houseSystem,
        nodeType: v.methodSnapshot.nodeType,
        provider: v.versionsSnapshot.provider,
        resultComputedAt: v.versionsSnapshot.resultComputedAt,
        topicCount: v.topics.length,
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
  const { data, error } = await ctx.db.rpc("astro_analysis_save", {
    p_tenant_id: ctx.tenantId,
    p_user_id: ctx.userId,
    p_profile_id: v.revision.profile_id,
    p_profile_revision: v.revision.revision,
    p_result_id: v.resultId,
    p_technique: "western.natal",
    p_title: v.title,
    p_save_request_id: o.saveRequestId,
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
  client_id: string | null;
  technique: string;
  title: string;
  event_kind: string;
  analysis_at: string;
  profile_snapshot: Record<string, unknown>;
  method_snapshot: Record<string, unknown>;
  technical_snapshot: Record<string, unknown>;
  provider_interp_included: boolean;
  provider_interp_snapshot: Record<string, unknown> | null;
  kb_snapshot: unknown[];
  versions_snapshot: Record<string, unknown>;
  created_at: string;
};

const LIST_COLUMNS = "id, profile_id, profile_revision, client_id, technique, title, event_kind, analysis_at, provider_interp_included, method_snapshot, created_at";

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
  const rows = (data as Pick<AnalysisRow, "id" | "profile_id" | "profile_revision" | "client_id" | "technique" | "title" | "event_kind" | "analysis_at" | "provider_interp_included" | "method_snapshot" | "created_at">[] | null) ?? [];
  return {
    status: 200,
    body: {
      ok: true,
      analyses: rows.map((r) => ({
        id: r.id,
        title: r.title,
        technique: r.technique,
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
      "id, profile_id, profile_revision, client_id, technique, title, event_kind, analysis_at, profile_snapshot, method_snapshot, technical_snapshot, provider_interp_included, provider_interp_snapshot, kb_snapshot, versions_snapshot, created_at",
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

  const technical = a.technical_snapshot as unknown as NatalTechnical;
  return {
    status: 200,
    body: {
      ok: true,
      analysis: {
        id: a.id,
        title: a.title,
        technique: a.technique,
        analysisAt: a.analysis_at,
        eventKind: a.event_kind,
        clientId: a.client_id,
        profile: a.profile_snapshot,
        method: a.method_snapshot,
        technical,
        topics: topicsFromNatal(technical),
        knowledgeBank: a.kb_snapshot,
        notes: ((notesRes.data as { section_key: string; body: string }[] | null) ?? []).map((n) => ({
          sectionKey: n.section_key,
          sectionLabel: n.section_key === "overall" ? "Genel yorum" : topicLabelForKey(n.section_key),
          body: n.body,
        })),
        interpretation,
        versions: a.versions_snapshot,
      },
    },
  };
}
