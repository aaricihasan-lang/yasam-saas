// İlişki / Grup — UZMAN YORUMU, BİLGİ BANKASI EŞLEŞMESİ, KAYITLI RAPORLAR (sunucu; service_role + ZORUNLU tenant).
//
//   • Uzman Yorumu: analize özel düz metin (≤ 10.000). İyimser eşzamanlılık (expected_updated_at) → başka
//     sekmedeki değişikliğin üzerine sessizce yazılmaz. Boşaltma yalnız açık onayla (yanlışlıkla silinmez).
//   • Bilgi Bankası: uzmanın KENDİ kayıtları; genel kanal/kapı kayıtları "genel" olarak, kişilerin bireysel
//     tip/otorite/profil kayıtları KİŞİ ADIYLA "bireysel" olarak etiketlenir (sahte ilişki yorumu yok).
//     Ekranda özel çalışma notu sahibine görünür; Word'e ASLA girmez (rapor okuması expert_notes okumaz).
//   • Admin (yalnız rol=admin): Merkezi Bilgi Bankası (yayınlanmış canonical içerik) ayrı kaynak.
//   • Rapor: içerik seçimi (varsayılan hepsi KAPALI) → DONMUŞ snapshot. Sonradan değişen yorum/kayıt eski
//     raporu değiştirmez. Görsel snapshot'taki kayıtlı veriden yeniden çizilir. Roxy çağrısı YOK.

import { randomUUID } from "node:crypto";
import { withTenant, tenantInsertPayload } from "../api/tenantScope";
import { isUuid } from "../api/deterministicId";
import { hdSafeDbError } from "../api/safeError";
import { listKnowledgeByCodes, listKnowledgeForReport } from "../api/knowledgePersistence";
import { getPublishedContentByKeys } from "../knowledge/canonicalReadService";
import { buildHdChannelCanonicalKeyFromCode } from "../knowledge-system/canonicalKeys";
import { computedChartAppCodes, type HdComputedChart } from "../chart/computedChart";
import { hdAuthorityLabelFromCode, hdTypeLabelFromCode } from "../codeHelpers";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "../reporting/xmlSafeText";
import { getRelationAnalysis, isRelationTableMissing, RELATION_ANALYSES, type RelationAnalysisView, type RelationCtx } from "./relationService";
import { buildCompositeModel } from "./compositeModel";
import { connectionExplanations, pentaExplanations, type ExplanationSection } from "./explanations";
import type { HdConnectionResult } from "./connection";
import { connectionFingerprint, HD_RELATION_BIND_KEYWORD, relationBindingText } from "./roxyConnectionChart";
import { readPngTextChunks } from "../reporting/bodygraphBinding";
import type { HdPentaResult } from "./penta";

export const RELATION_REPORTS = "human_design_relation_reports";
import { EXPERT_COMMENT_MAX, PREPARED_BY_MAX } from "./relationExtras.shared";
export { EXPERT_COMMENT_MAX, PREPARED_BY_MAX };

type Res<T> = { status: number; body: ({ ok: true } & T) | { ok: false; code: string; error: string } };
const err = <T,>(status: number, code: string, error: string): Res<T> => ({ status, body: { ok: false, code, error } });
const UNAVAILABLE = "Bu özellik henüz etkin değil (veritabanı güncellemesi bekleniyor). Analiz görüntüleme etkilenmez.";

// Kontrol karakterleri (satır sonu/tab hariç) temizlenir; metin düz metin olarak saklanır.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;
export function sanitizeComment(v: string): string {
  return v.replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/[ \t]+\n/g, "\n").trim();
}

// ─── Uzman Yorumu ────────────────────────────────────────────────────────────

export type RelationComment = { available: boolean; text: string | null; updatedAt: string | null };

export async function getRelationComment(ctx: RelationCtx, id: string): Promise<Res<{ comment: RelationComment }>> {
  if (!isUuid(id)) return err(400, "INVALID_ID", "Geçersiz analiz kimliği.");
  const { data, error } = await withTenant(ctx.db.from(RELATION_ANALYSES).select("id, expert_comment, expert_comment_updated_at"), ctx.tenantId, "relation.comment.get").eq("id", id).maybeSingle();
  if (error) {
    if (isRelationTableMissing(error)) return { status: 200, body: { ok: true, comment: { available: false, text: null, updatedAt: null } } };
    return err(500, "DB_ERROR", hdSafeDbError("relation.comment.get", error));
  }
  if (!data) return err(404, "NOT_FOUND", "Analiz bulunamadı.");
  const r = data as { expert_comment: string | null; expert_comment_updated_at: string | null };
  return { status: 200, body: { ok: true, comment: { available: true, text: r.expert_comment, updatedAt: r.expert_comment_updated_at } } };
}

export async function updateRelationComment(ctx: RelationCtx, id: string, raw: unknown): Promise<Res<{ comment: RelationComment }>> {
  if (ctx.isDemo) return err(403, "DEMO_READONLY", "Demo hesabında yorum kaydedilemez.");
  if (!isUuid(id)) return err(400, "INVALID_ID", "Geçersiz analiz kimliği.");
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return err(400, "INVALID_BODY", "İstek gövdesi nesne olmalı.");
  const b = raw as Record<string, unknown>;
  if (typeof b.text !== "string") return err(400, "INVALID_TEXT", "Yorum metni gerekli.");
  const text = sanitizeComment(b.text);
  if (text.length > EXPERT_COMMENT_MAX) return err(422, "TOO_LONG", `Uzman yorumu en fazla ${EXPERT_COMMENT_MAX.toLocaleString("tr-TR")} karakter olabilir.`);
  const expected = b.expected_updated_at === null ? null : typeof b.expected_updated_at === "string" ? b.expected_updated_at : undefined;
  if (expected === undefined) return err(400, "INVALID_VERSION", "Sürüm bilgisi gerekli.");
  const cur = await getRelationComment(ctx, id);
  if (!cur.body.ok) return cur;
  if (!cur.body.comment.available) return err(503, "COMMENTS_UNAVAILABLE", UNAVAILABLE);
  const now = cur.body.comment;
  // İyimser eşzamanlılık: okunan sürüm değiştiyse üzerine YAZILMAZ.
  const same = (a: string | null, c: string | null) => (a === null || c === null ? a === c : Date.parse(a) === Date.parse(c));
  if (!same(expected, now.updatedAt)) return err(409, "CONFLICT", "Bu yorum başka bir oturumda değiştirildi. Sayfayı yenileyip güncel yorumu görün.");
  if (!text && now.text && b.confirm_clear !== true) return err(422, "CLEAR_NOT_CONFIRMED", "Kayıtlı yorumu silmek için açık onay gerekir.");
  const stamp = new Date().toISOString();
  let q = withTenant(ctx.db.from(RELATION_ANALYSES).update({ expert_comment: text || null, expert_comment_updated_at: stamp, expert_comment_updated_by: ctx.userId }), ctx.tenantId, "relation.comment.update").eq("id", id);
  q = now.updatedAt === null ? q.is("expert_comment_updated_at", null) : q.eq("expert_comment_updated_at", now.updatedAt);
  const { data, error } = await q.select("id");
  if (error) {
    if (isRelationTableMissing(error)) return err(503, "COMMENTS_UNAVAILABLE", UNAVAILABLE);
    return err(500, "DB_ERROR", hdSafeDbError("relation.comment.update", error));
  }
  if (!data || (data as unknown[]).length === 0) return err(409, "CONFLICT", "Bu yorum başka bir oturumda değiştirildi. Sayfayı yenileyip güncel yorumu görün.");
  return { status: 200, body: { ok: true, comment: { available: true, text: text || null, updatedAt: stamp } } };
}

// ─── Bilgi Bankası eşleşmesi ─────────────────────────────────────────────────

export type KnowledgeEntry = { id: string; category: string; title: string; code: string; content: string; expertNotes?: string | null };
export type KnowledgeGroup = { key: string; title: string; scope: "general" | "individual"; person?: string; entries: KnowledgeEntry[] };
export type CentralEntry = { key: string; title: string; text: string };

type PartCodes = { name: string; type: string | null; authority: string | null; profile: string | null };

async function participantCodes(ctx: RelationCtx, a: RelationAnalysisView): Promise<PartCodes[]> {
  const ids = a.participants.map((p) => p.sourceChartId).filter((x): x is string => !!x && a.participants.find((q) => q.sourceChartId === x)?.gates !== null);
  const charts = new Map<string, unknown>();
  if (ids.length) {
    const { data } = await withTenant(ctx.db.from("human_design_charts").select("id, computed_result"), ctx.tenantId, "relation.kb.charts").in("id", ids);
    for (const r of (data ?? []) as Array<{ id: string; computed_result: unknown }>) charts.set(r.id.toLowerCase(), r.computed_result);
  }
  return a.participants.map((p) => {
    const c = p.sourceChartId && p.gates ? charts.get(p.sourceChartId.toLowerCase()) : null;
    if (!c || typeof c !== "object") return { name: p.name, type: null, authority: null, profile: null };
    const codes = computedChartAppCodes(c as HdComputedChart);
    return { name: p.name, type: codes.type_code, authority: codes.authority_code, profile: codes.profile_code };
  });
}

/** Grup tanımları (kod listeleri). Genel kanal/kapı kodları + kişi başına bireysel kodlar. */
function knowledgePlan(a: RelationAnalysisView, parts: PartCodes[]) {
  const general: Array<{ key: string; title: string; codes: string[] }> = [];
  if (a.kind === "connection") {
    const r = a.result as HdConnectionResult;
    general.push({ key: "channels", title: "Birleşik haritadaki kanallar — genel kanal kayıtlarınız", codes: r.channels.map((c) => `kanal_${c.id.replace("-", "_")}`) });
  } else {
    const r = a.result as HdPentaResult;
    general.push({ key: "penta-channels", title: "Tanımlı Penta kanalları — genel kanal kayıtlarınız", codes: r.channels.filter((c) => c.defined).map((c) => `kanal_${c.id.replace("-", "_")}`) });
    general.push({ key: "penta-gates", title: "Penta kapıları — genel kapı kayıtlarınız", codes: r.gates.map((g) => `kapi_${g.gate}`) });
  }
  const individual = parts.map((p, i) => ({
    key: `person-${i}`,
    title: `${p.name} — bireysel kayıtlarınız`,
    person: p.name,
    codes: [p.type ? `tip_${p.type}` : null, p.authority ? `otorite_${p.authority}` : null, p.profile ? `profil_${p.profile}` : null].filter((x): x is string => !!x),
  }));
  return { general, individual };
}

export async function relationKnowledge(ctx: RelationCtx, a: RelationAnalysisView, opts: { forReport: boolean }): Promise<{ ok: true; groups: KnowledgeGroup[] } | { ok: false; error: string }> {
  const parts = await participantCodes(ctx, a);
  const plan = knowledgePlan(a, parts);
  const all = [...new Set([...plan.general, ...plan.individual].flatMap((g) => g.codes))];
  const read = opts.forReport ? await listKnowledgeForReport(ctx.db, ctx.tenantId, all) : await listKnowledgeByCodes(ctx.db, ctx.tenantId, all);
  if (read.error) return { ok: false, error: read.error };
  const rows = read.rows as Array<{ id: string; category: string; title: string; code: string; content: string; expert_notes?: string | null; is_active?: boolean }>;
  const toEntry = (r: (typeof rows)[number]): KnowledgeEntry => ({
    id: r.id,
    category: r.category,
    title: r.title,
    code: r.code,
    content: r.content,
    ...(opts.forReport ? {} : { expertNotes: r.expert_notes ?? null }),
  });
  const pick = (codes: string[]) => codes.flatMap((c) => rows.filter((r) => r.code === c && r.is_active !== false && (r.content ?? "").trim())).map(toEntry);
  const groups: KnowledgeGroup[] = [
    ...plan.general.map((g) => ({ key: g.key, title: g.title, scope: "general" as const, entries: pick(g.codes) })),
    ...plan.individual.map((g) => ({ key: g.key, title: g.title, scope: "individual" as const, person: g.person, entries: pick(g.codes) })),
  ];
  return { ok: true, groups: groups.filter((g) => g.entries.length > 0) };
}

/** ADMIN: Merkezi Bilgi Bankası (yalnız yayınlanmış canonical içerik). Normal uzmana ÇAĞRILMAZ. */
export async function relationCentralKnowledge(ctx: RelationCtx, a: RelationAnalysisView): Promise<{ ok: true; entries: CentralEntry[] } | { ok: false; error: string }> {
  const ids = a.kind === "connection" ? (a.result as HdConnectionResult).channels.map((c) => c.id) : (a.result as HdPentaResult).channels.filter((c) => c.defined).map((c) => c.id);
  const keys: Array<{ key: string; title: string }> = [];
  for (const id of ids) {
    try {
      keys.push({ key: buildHdChannelCanonicalKeyFromCode(id), title: `Kanal ${id}` });
    } catch { /* resmî olmayan kimlik → atla */ }
  }
  const parts = await participantCodes(ctx, a);
  for (const p of parts) {
    if (p.type) keys.push({ key: `tip_${p.type}`, title: `${p.name} — ${hdTypeLabelFromCode(p.type)}` });
    if (p.authority) keys.push({ key: `otorite_${p.authority}`, title: `${p.name} — ${hdAuthorityLabelFromCode(p.authority)}` });
  }
  const r = await getPublishedContentByKeys(ctx.db, keys.map((k) => k.key));
  if (!r.ok) return { ok: false, error: r.error.message };
  const entries: CentralEntry[] = [];
  for (const k of keys) {
    const c = r.data.get(k.key);
    const text = c ? (c.full_channel_text || c.general_description || c.report_text || "").trim() : "";
    if (text) entries.push({ key: k.key, title: k.title, text });
  }
  return { ok: true, entries };
}

// ─── Kayıtlı raporlar ────────────────────────────────────────────────────────

export const RELATION_REPORT_SCHEMA = "hd-relation-report-1";
export type RelationReportSnapshot = {
  schema: typeof RELATION_REPORT_SCHEMA;
  generatedAt: string;
  analysis: Omit<RelationAnalysisView, never>;
  sections: {
    analysis: ExplanationSection[] | null;
    knowledge: KnowledgeGroup[] | null;
    expertComment: string | null;
  };
  preparedBy: string | null;
  /**
   * Rapor görseli. Connection: `source:"standard"` → standart (silüetli) birleşik BodyGraph PNG'si raporda DONDURULUR
   * (`png`, base64; tarayıcıda kayıtlı sonuçla çizilip doğrulanmış, sunucuda biçim + analiz bağı denetlenmiş).
   * `source` yok / "scene" → Yaşam Sistemi şematik çizimi indirmede kayıtlı veriden yeniden çizilir (yedek).
   */
  image: { status: "ok" | "unavailable"; reason: string | null; source?: "standard" | "scene"; png?: string };
};

/** Connection rapor görseli (tarayıcıda yakalanan PNG) — biçim + boyut + analiz bağı denetimi. */
export const RELATION_GRAPHIC_MAX_BYTES = 1_000_000;
export function parseRelationGraphic(raw: unknown, a: RelationAnalysisView): { png: string } | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  if (a.kind !== "connection") return { error: "Bu analiz türü için grafik gönderilemez." };
  if (typeof raw !== "string" || !raw.startsWith("data:image/png;base64,")) return { error: "Grafik PNG biçiminde olmalı." };
  const b64 = raw.slice("data:image/png;base64,".length);
  if (b64.length > Math.ceil((RELATION_GRAPHIC_MAX_BYTES * 4) / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: "Grafik geçersiz ya da çok büyük." };
  const buf = Buffer.from(b64, "base64");
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 33 || buf.length > RELATION_GRAPHIC_MAX_BYTES || SIG.some((v, i) => buf[i] !== v) || buf.toString("latin1", 12, 16) !== "IHDR") return { error: "Grafik geçerli bir PNG değil." };
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < 500 || w > 2600 || h < 700 || h > 3400) return { error: "Grafik ölçüsü beklenen aralıkta değil." };
  const bound = readPngTextChunks(new Uint8Array(buf)).get(HD_RELATION_BIND_KEYWORD) ?? [];
  if (bound.length !== 1 || bound[0] !== relationBindingText(a.id, connectionFingerprint(a.result as HdConnectionResult))) return { error: "Grafik bu analizin kayıtlı sonucuyla eşleşmiyor." };
  return { png: buf.toString("base64") };
}

export type ReportOptions = { analysis: boolean; knowledge: boolean; expertComment: boolean; preparedBy: string | null };

export function parseReportOptions(raw: unknown): ReportOptions | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { error: "İstek gövdesi nesne olmalı." };
  const b = raw as Record<string, unknown>;
  const s = (typeof b.sections === "object" && b.sections !== null ? b.sections : {}) as Record<string, unknown>;
  const flag = (v: unknown) => v === true; // varsayılan KAPALI
  let preparedBy: string | null = null;
  if (b.prepared_by !== undefined && b.prepared_by !== null && b.prepared_by !== "") {
    if (typeof b.prepared_by !== "string") return { error: "Raporu Hazırlayan metin olmalı." };
    const t = hdXmlSafeLine(b.prepared_by).trim();
    if (t.length > PREPARED_BY_MAX) return { error: `Raporu Hazırlayan en fazla ${PREPARED_BY_MAX} karakter olabilir.` };
    preparedBy = t || null;
  }
  return { analysis: flag(s.analysis), knowledge: flag(s.knowledge), expertComment: flag(s.expert_comment), preparedBy };
}

export function imageStatusFor(a: RelationAnalysisView): RelationReportSnapshot["image"] {
  if (a.kind === "penta") return { status: "ok", reason: null };
  const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, a.result as HdConnectionResult);
  return m.ok ? { status: "ok", reason: null } : { status: "unavailable", reason: "Kaynak bireysel analiz verisi artık mevcut değil; birleşik harita görseli rapora eklenemiyor." };
}

export async function createRelationReport(ctx: RelationCtx, id: string, raw: unknown): Promise<Res<{ id: string; image: RelationReportSnapshot["image"]; sections: { analysis: boolean; knowledge: boolean; expertComment: boolean } }>> {
  if (ctx.isDemo) return err(403, "DEMO_READONLY", "Demo hesabında rapor hazırlanamaz.");
  const opts = parseReportOptions(raw);
  if ("error" in opts) return err(400, "INVALID_OPTIONS", opts.error);
  const g = await getRelationAnalysis(ctx, id);
  if (!g.body.ok) return err(g.status, g.body.code, g.body.error);
  const a = g.body.analysis;
  const graphic = parseRelationGraphic((raw as Record<string, unknown>).graphic_png, a);
  if (graphic && "error" in graphic) return err(400, "GRAPHIC_INVALID", graphic.error);
  let knowledge: KnowledgeGroup[] | null = null;
  if (opts.knowledge) {
    const k = await relationKnowledge(ctx, a, { forReport: true });
    if (!k.ok) return err(500, "KNOWLEDGE_READ_FAILED", "Bilgi Bankası okunamadı.");
    knowledge = k.groups.map((gr) => ({ ...gr, title: hdXmlSafeLine(gr.title), entries: gr.entries.map((e) => ({ ...e, title: hdXmlSafeLine(e.title), content: hdXmlSafeMultiline(e.content) })) }));
  }
  let expertComment: string | null = null;
  if (opts.expertComment) {
    const c = await getRelationComment(ctx, id);
    if (!c.body.ok) return err(c.status, c.body.code, c.body.error);
    if (!c.body.comment.available) return err(503, "COMMENTS_UNAVAILABLE", UNAVAILABLE);
    if (!c.body.comment.text) return err(422, "NO_EXPERT_COMMENT", "Bu analiz için kaydedilmiş bir uzman yorumu yok.");
    expertComment = hdXmlSafeMultiline(c.body.comment.text);
  }
  const names = a.participants.map((p) => p.name);
  const snapshot: RelationReportSnapshot = {
    schema: RELATION_REPORT_SCHEMA,
    generatedAt: new Date().toISOString(),
    analysis: a,
    sections: {
      analysis: opts.analysis ? (a.kind === "connection" ? connectionExplanations(a.result as HdConnectionResult, names[0], names[1]) : pentaExplanations(a.result as HdPentaResult, names)) : null,
      knowledge,
      expertComment,
    },
    preparedBy: opts.preparedBy,
    image: graphic ? { status: "ok", reason: null, source: "standard", png: graphic.png } : { ...imageStatusFor(a), source: "scene" },
  };
  const reportId = randomUUID();
  const { error } = await ctx.db.from(RELATION_REPORTS).insert(tenantInsertPayload(ctx.tenantId, { id: reportId, analysis_id: a.id, created_by: ctx.userId, snapshot })).select("id").single();
  if (error) {
    if (isRelationTableMissing(error)) return err(503, "REPORTS_UNAVAILABLE", UNAVAILABLE);
    return err(500, "DB_INSERT_FAILED", hdSafeDbError("relation.report.insert", error));
  }
  return { status: 200, body: { ok: true, id: reportId, image: { status: snapshot.image.status, reason: snapshot.image.reason, source: snapshot.image.source }, sections: { analysis: !!snapshot.sections.analysis, knowledge: !!snapshot.sections.knowledge, expertComment: !!snapshot.sections.expertComment } } };
}

export type RelationReportListRow = { id: string; createdAt: string; sections: { analysis: boolean; knowledge: boolean; expertComment: boolean }; preparedBy: string | null; image: "ok" | "unavailable" };

export async function listRelationReports(ctx: RelationCtx, id: string): Promise<Res<{ rows: RelationReportListRow[]; available: boolean }>> {
  if (!isUuid(id)) return err(400, "INVALID_ID", "Geçersiz analiz kimliği.");
  const { data, error } = await withTenant(ctx.db.from(RELATION_REPORTS).select("id, created_at, snapshot"), ctx.tenantId, "relation.report.list").eq("analysis_id", id).order("created_at", { ascending: false }).limit(50);
  if (error) {
    if (isRelationTableMissing(error)) return { status: 200, body: { ok: true, rows: [], available: false } };
    return err(500, "DB_ERROR", hdSafeDbError("relation.report.list", error));
  }
  const rows = ((data ?? []) as Array<{ id: string; created_at: string; snapshot: RelationReportSnapshot }>).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    sections: { analysis: !!r.snapshot?.sections?.analysis, knowledge: !!r.snapshot?.sections?.knowledge, expertComment: !!r.snapshot?.sections?.expertComment },
    preparedBy: r.snapshot?.preparedBy ?? null,
    image: r.snapshot?.image?.status === "ok" ? ("ok" as const) : ("unavailable" as const),
  }));
  return { status: 200, body: { ok: true, rows, available: true } };
}

export async function getRelationReportSnapshot(ctx: RelationCtx, reportId: string): Promise<Res<{ snapshot: RelationReportSnapshot }>> {
  if (!isUuid(reportId)) return err(400, "INVALID_ID", "Geçersiz rapor kimliği.");
  const { data, error } = await withTenant(ctx.db.from(RELATION_REPORTS).select("id, snapshot"), ctx.tenantId, "relation.report.get").eq("id", reportId).maybeSingle();
  if (error) {
    if (isRelationTableMissing(error)) return err(503, "REPORTS_UNAVAILABLE", UNAVAILABLE);
    return err(500, "DB_ERROR", hdSafeDbError("relation.report.get", error));
  }
  if (!data) return err(404, "NOT_FOUND", "Rapor bulunamadı.");
  const s = (data as { snapshot: RelationReportSnapshot }).snapshot;
  if (!s || s.schema !== RELATION_REPORT_SCHEMA) return err(422, "UNSUPPORTED_REPORT", "Rapor biçimi desteklenmiyor.");
  return { status: 200, body: { ok: true, snapshot: s } };
}

