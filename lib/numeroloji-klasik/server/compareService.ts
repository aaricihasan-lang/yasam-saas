/**
 * Klasik Numeroloji — KARŞILAŞTIRMA servisi (YALNIZ SUNUCU; 0 sağlayıcı çağrısı).
 *
 *   • Mevcut Numeroloji kaydı (`numerology_records`) ve taş atamaları (`numerology_stone_assignments`) YALNIZ
 *     select ile okunur; Mevcut motor çalıştırılmaz, kayıt yeniden hesaplanmaz (compare/legacyReader).
 *   • Klasik taraf kayıtlı analizin `result` alanıdır; taşlar kayıtlı haritadan eşleştirilir (stonesService).
 *   • Hizalama compare/align — iki ekolün sayıları BİRLEŞTİRİLMEZ (tek sayı alanı yok).
 *   • HER sorgu tenant_id ile; tenant YALNIZ oturum guard'ından.
 */
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alignRecords, buildNoteSnapshot, type Alignment, type ClassicCompareSource, type NoteSnapshot } from "../compare/align";
import { canonicalSha256 } from "../compare/hash";
import { INVISIBLE_FORMAT_RE } from "../sanitizeShared";
// Mevcut Numeroloji'nin "Gelecek Yılları Göster" görüntüleme süzgeci — YALNIZ çağrılır (salt okuma; mevcut kod değişmez).
import { redactAnalysisDataForFutureYears } from "@/app/numeroloji/utils/futureYearsRedaction";
import { currentIstanbulYear } from "@/lib/numeroloji/currentYear";
import { readLegacySnapshot, type LegacyRead } from "../compare/legacyReader";
import { isUuid, utf8Bytes, type Validation } from "../input";
import { getAnalysis, readLegacyNumerologyRecord, type ClassicAnalysisRow, type ComparativeNoteRow, type RepoError } from "./repository";
import { readBodyTextLimited } from "./bodyReader";
import { buildClassicStonesView, defaultClassicStonesDeps, type ClassicStonesDeps, type ClassicStonesView } from "./stonesService";

assertServerOnly("lib/numeroloji-klasik/server/compareService");

export const COMPARE_SOURCE_LIMIT = 20;
export const COMPARE_QUERY_MAX = 60;
export const NOTE_BODY_MAX = 20_000;
/** Not gövdesi 20 000 karaktere kadar (UTF-8 en çok ~80 KB) → JSON gövde sınırı 96 KB. */
export const COMPARE_MAX_BODY_BYTES = 96 * 1024;

const LEGACY = "numerology_records";
const LEGACY_STONES = "numerology_stone_assignments";
const ANALYSES = "numerology_classic_analyses";

type Ok<T> = { ok: true; value: T };

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

// ─── Gövde okuma (not gövdesi 16 KB'tan büyük olabildiği için ayrı sınır) ───────────────────

/** Gövde AKIŞ olarak okunur; sınır aşıldığı an 413 (Content-Length olmasa / chunked olsa da). */
export async function readLimitedJsonBody(req: Request, maxBytes: number): Promise<Validation<unknown>> {
  const r = await readBodyTextLimited(req, maxBytes);
  if (!r.ok) {
    return r.code === "PAYLOAD_TOO_LARGE"
      ? { ok: false, code: "PAYLOAD_TOO_LARGE", error: "İstek çok büyük." }
      : { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." };
  }
  const text = r.text;
  if (utf8Bytes(text) > maxBytes) return { ok: false, code: "PAYLOAD_TOO_LARGE", error: "İstek çok büyük." };
  if (!text.trim()) return { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "MALFORMED_JSON", error: "Geçerli JSON gövdesi gerekli." };
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}
const bad = <T>(code: string, error: string, field?: string): Validation<T> => ({ ok: false, code, error, ...(field ? { field } : {}) });
function onlyKeys(o: Record<string, unknown>, allowed: readonly string[]): Validation<true> {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) return bad("UNKNOWN_FIELD", `Beklenmeyen alan: ${k.slice(0, 40)}`, k);
  return { ok: true, value: true };
}

/** Arama metni: harf / rakam / boşluk / kesme / tire; ≤ 60. Boş → null. */
export function validateCompareQuery(raw: string | null): Validation<string | null> {
  if (raw === null) return { ok: true, value: null };
  const q = raw.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!q) return { ok: true, value: null };
  if (q.length > COMPARE_QUERY_MAX) return bad("INVALID_QUERY", "Arama metni en çok 60 karakter olabilir.", "q");
  if (!/^[\p{L}\p{M}\p{N}' -]+$/u.test(q)) return bad("INVALID_QUERY", "Arama metninde yalnız harf, rakam, boşluk, kesme ve tire kullanılabilir.", "q");
  return { ok: true, value: q };
}

export type ComparePairRequest = { legacyId: string | null; classicId: string | null };

function pairFrom(body: Record<string, unknown>): Validation<ComparePairRequest> {
  const out: ComparePairRequest = { legacyId: null, classicId: null };
  for (const [k, field] of [["legacyId", "legacyId"], ["classicId", "classicId"]] as const) {
    const v = body[k];
    if (v === undefined || v === null) continue;
    if (!isUuid(v)) return bad("INVALID_ID", "Kayıt kimliği geçersiz.", field);
    out[k] = v.toLowerCase();
  }
  if (!out.legacyId && !out.classicId) return bad("SOURCE_REQUIRED", "En az bir kayıt seçilmeli.");
  return { ok: true, value: out };
}

export function validateAlignRequest(body: unknown): Validation<ComparePairRequest> {
  if (!isPlainObject(body)) return bad("INVALID_INPUT", "Geçersiz istek.");
  const k = onlyKeys(body, ["legacyId", "classicId"]);
  if (!k.ok) return k;
  return pairFrom(body);
}

/** Kontrol karakterlerini atar (\n ve \t korunur; \r\n → \n). Metin HAM saklanır; kaçışlama UI'dadır. */
export function cleanNoteBody(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(INVISIBLE_FORMAT_RE, "");
}

function validateBody(v: unknown): Validation<string> {
  if (typeof v !== "string") return bad("INVALID_BODY", "Not metni gerekli.", "body");
  const s = cleanNoteBody(v);
  if (s.length > NOTE_BODY_MAX) return bad("BODY_TOO_LONG", "Not en çok 20 000 karakter olabilir.", "body");
  return { ok: true, value: s };
}

export type NoteCreateRequest = ComparePairRequest & { clientId: string | null; body: string };
export type NotePatchRequest = { body: string; rowVersion: number };

export function validateNoteCreate(body: unknown): Validation<NoteCreateRequest> {
  if (!isPlainObject(body)) return bad("INVALID_INPUT", "Geçersiz istek.");
  const k = onlyKeys(body, ["legacyId", "classicId", "clientId", "body"]);
  if (!k.ok) return k;
  const p = pairFrom(body);
  if (!p.ok) return p;
  let clientId: string | null = null;
  if (body.clientId !== undefined && body.clientId !== null) {
    if (!isUuid(body.clientId)) return bad("INVALID_CLIENT_ID", "Geçersiz danışan kimliği.", "clientId");
    clientId = body.clientId.toLowerCase();
  }
  const b = validateBody(body.body);
  if (!b.ok) return b;
  return { ok: true, value: { ...p.value, clientId, body: b.value } };
}

export function validateNotePatch(body: unknown): Validation<NotePatchRequest> {
  if (!isPlainObject(body)) return bad("INVALID_INPUT", "Geçersiz istek.");
  const k = onlyKeys(body, ["body", "rowVersion"]);
  if (!k.ok) return k;
  const rv = body.rowVersion;
  if (typeof rv !== "number" || !Number.isInteger(rv) || rv < 1 || rv > 2_147_483_647) return bad("INVALID_ROW_VERSION", "Sürüm bilgisi gerekli.", "rowVersion");
  const b = validateBody(body.body);
  if (!b.ok) return b;
  return { ok: true, value: { body: b.value, rowVersion: rv } };
}

// ─── Kaynak listeleri ────────────────────────────────────────────────────────────────────

export type LegacySourceItem = { id: string; fullName: string; birthDate: string | null; createdAt: string | null; methodologyVersion: string | null; clientId: string | null };
export type ClassicSourceItem = { id: string; title: string; kind: string; createdAt: string; clientId: string | null };

function fullNameOf(name: unknown, surname: unknown): string {
  return [name, surname].filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()).join(" ");
}
const foldTr = (s: string) => s.toLocaleLowerCase("tr-TR").normalize("NFC");

/** Mevcut Numeroloji kayıtları (YALNIZ select; analysis_data taşınmaz — yalnız metodoloji damgası). */
export async function listLegacySources(
  db: SupabaseClient,
  tenantId: string,
  opts: { clientId?: string | null; q?: string | null },
): Promise<Ok<LegacySourceItem[]> | RepoError> {
  const tokens = opts.q ? opts.q.split(" ").filter(Boolean) : [];
  let q = db
    .from(LEGACY)
    .select("id, name, surname, birth_date, created_at, client_id, analysis_data->calc->>methodology")
    .eq("tenant_id", tenantId);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (tokens.length) {
    const t = [...tokens].sort((a, b) => b.length - a.length)[0];
    q = q.or(`name.ilike.*${t}*,surname.ilike.*${t}*`);
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(tokens.length > 1 ? 100 : COMPARE_SOURCE_LIMIT);
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  const rows = (data as unknown as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    fullName: fullNameOf(r.name, r.surname),
    birthDate: strOrNull(r.birth_date),
    createdAt: strOrNull(r.created_at),
    methodologyVersion: strOrNull(r.methodology),
    clientId: strOrNull(r.client_id),
  }));
  const ft = tokens.map(foldTr);
  const filtered = ft.length > 1 ? rows.filter((r) => ft.every((t) => foldTr(r.fullName).includes(t))) : rows;
  return { ok: true, value: filtered.slice(0, COMPARE_SOURCE_LIMIT) };
}

export async function listClassicSources(
  db: SupabaseClient,
  tenantId: string,
  opts: { clientId?: string | null; q?: string | null },
): Promise<Ok<ClassicSourceItem[]> | RepoError> {
  let q = db.from(ANALYSES).select("id, title, kind, created_at, client_id").eq("tenant_id", tenantId).is("deleted_at", null);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  if (opts.q) q = q.ilike("title", `*${opts.q}*`);
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: true }).limit(COMPARE_SOURCE_LIMIT);
  if (error || !Array.isArray(data)) return { ok: false, reason: "db_error" };
  return {
    ok: true,
    value: (data as unknown as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      title: typeof r.title === "string" ? r.title : "",
      kind: String(r.kind),
      createdAt: String(r.created_at),
      clientId: strOrNull(r.client_id),
    })),
  };
}

// ─── Mevcut taş atamaları (YALNIZ select) ─────────────────────────────────────────────────

export type LegacyStoneAssignment = { analysisType: string; labelTr: string; value: string; stones: string[] };

const LEGACY_STONE_TYPES: readonly { type: string; labelTr: string; pick: (r: ReturnType<typeof readLegacySnapshot>) => LegacyRead }[] = [
  { type: "hayat-yolu", labelTr: "Hayat Yolu", pick: (r) => r.hayatYolu },
  { type: "ifade-sayisi", labelTr: "İfade Sayısı", pick: (r) => r.ifade },
  { type: "ana-kulvar", labelTr: "Ana Kulvar", pick: (r) => r.anaKulvar },
  { type: "yan-kulvar", labelTr: "Yan Kulvar", pick: (r) => r.yanKulvar },
];

/** Kayıtlı gösterim → arama değerleri (gösterim birebir, sonra son sayı). */
function lookupValues(r: LegacyRead): string[] {
  if (!r.ok) return [];
  const out: string[] = [];
  const d = r.value.display.trim();
  if (d) out.push(d);
  if (r.value.value !== null) out.push(String(r.value.value));
  return [...new Set(out)].filter((v) => v.length <= 40 && /^[\p{L}\p{N} /|()-]+$/u.test(v) && !/[(),]/.test(v));
}

/**
 * Kayıtlı Mevcut analizin çekirdek değerleri için uzmanın KENDİ taş atamaları (tenant + analysis_type + value).
 * YALNIZ okuma; tip başına ilk eşleşen değer. Okuma hatasında boş liste (karşılaştırma bozulmaz).
 */
export async function lookupLegacyStoneAssignments(db: SupabaseClient, tenantId: string, analysisData: unknown): Promise<LegacyStoneAssignment[]> {
  const snap = readLegacySnapshot(analysisData);
  const plan = LEGACY_STONE_TYPES.map((t) => ({ ...t, values: lookupValues(t.pick(snap)) })).filter((t) => t.values.length > 0);
  if (!plan.length) return [];
  const allValues = [...new Set(plan.flatMap((p) => p.values))];
  try {
    const { data, error } = await db
      .from(LEGACY_STONES)
      .select("analysis_type, value, stones")
      .eq("tenant_id", tenantId)
      .in("analysis_type", plan.map((p) => p.type))
      .in("value", allValues)
      .limit(200);
    if (error || !Array.isArray(data)) return [];
    const rows = data as unknown as { analysis_type?: unknown; value?: unknown; stones?: unknown }[];
    const out: LegacyStoneAssignment[] = [];
    for (const p of plan) {
      for (const v of p.values) {
        const row = rows.find((r) => r.analysis_type === p.type && r.value === v);
        if (!row) continue;
        const stones = (Array.isArray(row.stones) ? row.stones : []).map((s) => String(s).trim()).filter((s) => s.length > 0 && s.length <= 120).slice(0, 30);
        if (stones.length) out.push({ analysisType: p.type, labelTr: p.labelTr, value: v, stones });
        break;
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ─── Hizalama ───────────────────────────────────────────────────────────────────────────

export type LegacyLoaded = { id: string; fullName: string; birthDate: string | null; createdAt: string | null; clientId: string | null; methodologyVersion: string | null; analysisData: unknown };

export async function loadLegacy(db: SupabaseClient, tenantId: string, id: string): Promise<Ok<LegacyLoaded> | RepoError> {
  if (!isUuid(id)) return { ok: false, reason: "not_found" };
  const r = await readLegacyNumerologyRecord(db, tenantId, id);
  if (!r.ok) return r;
  const x = r.value;
  const calc = rec(rec(x.analysis_data)?.calc);
  return {
    ok: true,
    value: {
      id: String(x.id),
      fullName: fullNameOf(x.name, x.surname),
      birthDate: strOrNull(x.birth_date),
      createdAt: strOrNull(x.created_at),
      clientId: strOrNull(x.client_id),
      methodologyVersion: strOrNull(calc?.methodology),
      analysisData: x.analysis_data ?? null,
    },
  };
}

/** Kayıtlı klasik sonuç → karşılaştırma kaynağı (yeniden hesap yok). */
export function classicCompareSourceOf(row: Pick<ClassicAnalysisRow, "result">, stones: ClassicStonesView | null): ClassicCompareSource | null {
  const r = rec(row.result) ?? {};
  const src: ClassicCompareSource = {};
  if (rec(r.chart)) src.chart = r.chart as ClassicCompareSource["chart"];
  if (r.personal_day !== undefined) src.personalDay = r.personal_day;
  if (r.bridge !== undefined) src.bridge = r.bridge;
  if (r.chaldean !== undefined) src.chaldean = r.chaldean;
  if (r.business_name !== undefined) src.businessName = r.business_name;
  if (stones) src.stones = stones.result;
  return Object.keys(src).length ? src : null;
}

export type ComparisonSources = {
  legacy: { id: string; fullName: string; birthDate: string | null; createdAt: string | null; methodologyVersion: string | null; clientId: string | null } | null;
  classic: { id: string; title: string; kind: string; createdAt: string; clientId: string | null; methodologyVersion: string } | null;
};

export type ComparisonBuild = {
  alignment: Alignment;
  stones: { classic: ClassicStonesView | null; legacyAssignments: LegacyStoneAssignment[] };
  sources: ComparisonSources;
  /** Rapor için (uzmana JSON olarak dönmez). */
  classicRow: ClassicAnalysisRow | null;
};

/**
 * futureYears: görüntüleyenin Numeroloji "Gelecek Yılları Göster" alt-yetkisi (canSeeNumerologyFutureYears).
 * Verilmezse FALSE (fail-closed): Mevcut kayıt, mevcut modülün tüm uçlarındaki AYNI süzgeçten geçer.
 */
export type CompareCtx = { db: SupabaseClient; tenantId: string; viewerId: string; futureYears?: boolean; canSeeStock?: boolean };

/** Kayıtlı iki kaydı hizalar. Kimliklerden biri bu tenant'ta yoksa not_found. */
export async function buildComparison(
  ctx: CompareCtx,
  pair: ComparePairRequest,
  stonesDeps: ClassicStonesDeps = defaultClassicStonesDeps(),
): Promise<Ok<ComparisonBuild> | RepoError> {
  let legacy: LegacyLoaded | null = null;
  let classic: ClassicAnalysisRow | null = null;
  if (pair.legacyId) {
    const l = await loadLegacy(ctx.db, ctx.tenantId, pair.legacyId);
    if (!l.ok) return l;
    legacy = l.value;
  }
  if (pair.classicId) {
    const c = await getAnalysis(ctx.db, ctx.tenantId, pair.classicId);
    if (!c.ok) return c;
    classic = c.value;
  }
  const stones = classic ? await buildClassicStonesView(ctx, classic.result, stonesDeps) : null;
  // NK-R1: hizalama süzülmüş görüntüleme kopyasıyla yapılır; "değişti mi" özeti HAM veriden kalır (not karşılaştırması).
  const legacyView = legacy
    ? redactAnalysisDataForFutureYears(legacy.analysisData, { futureYears: ctx.futureYears === true, currentYear: currentIstanbulYear(), birthDate: legacy.birthDate })
    : null;
  const aligned = alignRecords(legacyView, classic ? classicCompareSourceOf(classic, stones) : null);
  const alignment = legacy && legacy.analysisData !== null && legacy.analysisData !== undefined
    ? { ...aligned, sourceHashes: { ...aligned.sourceHashes, legacy: canonicalSha256(legacy.analysisData) } }
    : aligned;
  const legacyAssignments = legacy ? await lookupLegacyStoneAssignments(ctx.db, ctx.tenantId, legacy.analysisData) : [];
  return {
    ok: true,
    value: {
      alignment,
      stones: { classic: stones, legacyAssignments },
      sources: {
        legacy: legacy
          ? { id: legacy.id, fullName: legacy.fullName, birthDate: legacy.birthDate, createdAt: legacy.createdAt, methodologyVersion: legacy.methodologyVersion, clientId: legacy.clientId }
          : null,
        classic: classic
          ? { id: classic.id, title: classic.title, kind: classic.kind, createdAt: classic.created_at, clientId: classic.client_id, methodologyVersion: classic.methodology_version }
          : null,
      },
      classicRow: classic,
    },
  };
}

// ─── Notlar ──────────────────────────────────────────────────────────────────────────────

export type NoteSnapshotStored = NoteSnapshot & { savedAt: string };

export function noteSnapshotOf(a: Alignment, now: Date = new Date()): NoteSnapshotStored {
  return { ...buildNoteSnapshot(a), savedAt: now.toISOString() };
}

export type NoteView = {
  id: string;
  clientId: string | null;
  legacyId: string | null;
  classicId: string | null;
  body: string;
  snapshot: unknown;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
  /** Bağlı klasik analiz silinmiş (yumuşak veya kalıcı) → classicId null + anlık görüntüde klasik taraf YOK. */
  classicDeleted: boolean;
};

/**
 * Not anlık görüntüsünden KLASİK tarafı çıkarır (silinmiş analizin verisi notta yaşamasın):
 * satırlarda c → null (yalnız klasik olan satırlar düşer), ilişki → one_missing; klasik taşlar / örtüşme / klasik
 * özet boşalır; rowsHash yeniden hesaplanır; classicDeleted: true işareti eklenir. Mevcut (legacy) taraf + gövde korunur.
 */
export function stripClassicFromSnapshot(snapshot: unknown): Record<string, unknown> {
  const s = rec(snapshot);
  if (!s) return { classicDeleted: true };
  const rows = Array.isArray(s.rows) ? s.rows : [];
  const keptRows = rows
    .map((r) => rec(r))
    .filter((r): r is Record<string, unknown> => !!r && r.l !== null && r.l !== undefined)
    .map((r) => ({ ...r, c: null, rel: "one_missing" }));
  const stones = rec(s.stones);
  const missing = s.missing === "legacy" || s.missing === "both" ? "both" : "classic";
  const hashes = rec(s.sourceHashes);
  return {
    ...s,
    missing,
    sourceHashes: { legacy: hashes && typeof hashes.legacy === "string" ? hashes.legacy : null, classic: null },
    rows: keptRows,
    stones: { legacy: stones && Array.isArray(stones.legacy) ? stones.legacy : [], classicDirect: [], classicDerived: [], overlap: [] },
    rowsHash: canonicalSha256(keptRows),
    classicDeleted: true,
  };
}

export type NoteViewOpts = { classicDeleted?: boolean; canSeeClients?: boolean };

export function toNoteView(n: ComparativeNoteRow, opts: NoteViewOpts = {}): NoteView {
  const flagged = rec(n.snapshot)?.classicDeleted === true;
  const classicDeleted = opts.classicDeleted === true || flagged;
  return {
    id: n.id,
    clientId: opts.canSeeClients === false ? null : n.client_id,
    legacyId: n.legacy_record_id,
    classicId: classicDeleted ? null : n.classic_analysis_id,
    body: n.body,
    snapshot: classicDeleted && !flagged ? stripClassicFromSnapshot(n.snapshot) : n.snapshot,
    rowVersion: n.row_version,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    classicDeleted,
  };
}

/**
 * Notlardaki klasik analiz kimliklerinden CANLI (silinmemiş) olanlar. Okuma hatası → null (çağıran DB_ERROR döner;
 * silinmiş analizin verisi yanlışlıkla gösterilmesin diye kapalı-hata).
 */
export async function liveClassicIds(db: SupabaseClient, tenantId: string, ids: readonly string[]): Promise<Set<string> | null> {
  const uniq = [...new Set(ids.filter((x) => isUuid(x)))];
  if (!uniq.length) return new Set();
  const { data, error } = await db.from(ANALYSES).select("id").eq("tenant_id", tenantId).in("id", uniq).is("deleted_at", null);
  if (error || !Array.isArray(data)) return null;
  return new Set((data as { id: unknown }[]).map((r) => String(r.id).toLowerCase()));
}

/** Not satırları → uzman görünümü (silinmiş klasik analiz + clients izni maskesi). DB hatası → null. */
export async function toNoteViews(
  db: SupabaseClient,
  tenantId: string,
  rows: readonly ComparativeNoteRow[],
  opts: { canSeeClients: boolean },
): Promise<NoteView[] | null> {
  const live = await liveClassicIds(db, tenantId, rows.map((r) => r.classic_analysis_id).filter((x): x is string => !!x));
  if (!live) return null;
  return rows.map((n) =>
    toNoteView(n, { canSeeClients: opts.canSeeClients, classicDeleted: !!n.classic_analysis_id && !live.has(n.classic_analysis_id.toLowerCase()) }),
  );
}

/** clients izni yoksa kaynak / görünüm nesnelerinde clientId → null. */
export function maskClientId<T extends { clientId: string | null }>(x: T, canSeeClients: boolean): T {
  return canSeeClients ? x : { ...x, clientId: null };
}
