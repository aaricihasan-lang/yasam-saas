// Gökyüzü Atlası — William Lilly Horary KAYITLARI (astro_horary_questions; migration 20271210000000). YALNIZ SUNUCU.
//
// Güvenlik: service_role RLS'yi aştığından HER sorgu tenant_id + owner_user_id ile daraltılır; başka uzmanın / tenant'ın
// kaydı "yok" (404) döner (varlığı sızdırılmaz). Danışan yalnız aynı tenant'tan bağlanır (FK ayrıca korur). Hesaplama kayıt
// anında SUNUCUDA yeniden yapılır; istemcinin gönderdiği sonuç kabul edilmez. Kayıtlı anlık görüntü değişmez (DB tetikleyicisi +
// kolon yetkisi); güncellenebilen yalnız başlık ve danışan bağlantısı.
// Soru metni: yalnız uzman AÇIKÇA "soru metnini kaydet" derse yazılır (varsayılan: yazılmaz); günlüğe / URL'ye / hata metnine girmez.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveAstroLocation } from "@/lib/astrology/birth/location";
import { findTenantClient } from "@/lib/astrology/persistence/repo";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { ASTRO_WRITE_LIMITS } from "@/lib/astrology/limits";
import { parseWesternHoraryBody, runWesternHorary, type WesternHoraryResult } from "./westernRun";

assertServerOnly("lib/astrology/horary/westernRecords");

/** Uzman başına kayıt tavanı — DB tetikleyicisiyle (astro_enforce_record_cap('3000')) AYNI. */
export const HORARY_RECORD_CAP = 3000;
/** Kayıtlı sonucun hangi motor / biçimle üretildiği (kayıtla birlikte saklanır; motor değişince bu değer de değişmeli). */
export const HORARY_METHODOLOGY_VERSION = "lilly-1647@horary-western-2026-10-29";
export const HORARY_SNAPSHOT_SCHEMA = 1;
export const QUESTION_MAX = 500;
const TABLE = "astro_horary_questions";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LIST_MAX = 50;

export type Ctx = { db: SupabaseClient; tenantId: string; userId: string };
export type Res = { status: number; body: Record<string, unknown> };
const bad = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { ok: false, code, error, ...extra } });
const notFound = (): Res => bad(404, "NOT_FOUND", "Kayıt bulunamadı.");
const dbFail = (context: string, e: { code?: string } | null): Res => {
  console.error(`[astro-horary] db error (${context})`, { code: e?.code ?? "unknown" });
  return bad(500, "DB_ERROR", "Kayıt işlemi şu anda yapılamıyor. Lütfen biraz sonra tekrar deneyin.");
};

const LIST_COLS = "id, title, client_id, question_local_date, question_local_time, timezone, question_utc, location_label, quesited_house, school, methodology_version, is_demo, created_at, updated_at";
const FULL_COLS = `${LIST_COLS}, question_text, utc_offset_seconds, dst_choice, location_id, latitude, longitude, orb_variant, snapshot_schema, result_snapshot`;

type Row = {
  id: string;
  title: string;
  client_id: string | null;
  question_local_date: string;
  question_local_time: string;
  timezone: string;
  question_utc: string;
  location_label: string;
  quesited_house: number;
  school: string;
  methodology_version: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  question_text?: string | null;
  orb_variant?: string;
  snapshot_schema?: number;
  result_snapshot?: WesternHoraryResult;
};

async function clientLabels(ctx: Ctx, ids: string[]): Promise<Record<string, string>> {
  const uniq = [...new Set(ids.filter((x) => UUID_RE.test(x)))];
  if (uniq.length === 0) return {};
  const { data } = await ctx.db.from("clients").select("id, ad, soyad").eq("tenant_id", ctx.tenantId).in("id", uniq);
  const out: Record<string, string> = {};
  for (const c of (data as { id: string; ad: string | null; soyad: string | null }[] | null) ?? []) out[c.id] = [c.ad, c.soyad].filter(Boolean).join(" ").trim() || "Adsız danışan";
  return out;
}

function publicRow(r: Row, labels: Record<string, string>) {
  return {
    id: r.id,
    title: r.title,
    clientId: r.client_id,
    clientLabel: r.client_id ? (labels[r.client_id] ?? null) : null,
    localDate: r.question_local_date,
    localTime: String(r.question_local_time).slice(0, 5),
    timezone: r.timezone,
    questionUtc: r.question_utc,
    place: r.location_label,
    quesitedHouse: r.quesited_house,
    school: r.school,
    methodologyVersion: r.methodology_version,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function checkClient(ctx: Ctx, clientId: unknown): Promise<{ ok: true; id: string | null } | { ok: false; res: Res }> {
  if (clientId === undefined || clientId === null || clientId === "") return { ok: true, id: null };
  if (typeof clientId !== "string" || !UUID_RE.test(clientId)) return { ok: false, res: bad(400, "INVALID_INPUT", "Danışan seçimi geçersiz.", { field: "client" }) };
  const c = await findTenantClient(ctx.db, ctx.tenantId, clientId);
  if (c.error) return { ok: false, res: dbFail("client", c.error) };
  // Başka tenant'ın danışanı ile var olmayan danışan AYNI yanıtı alır (varlık sızdırılmaz).
  if (!c.row) return { ok: false, res: bad(400, "CLIENT_NOT_FOUND", "Danışan bulunamadı.", { field: "client" }) };
  return { ok: true, id: c.row.id };
}

function parseTitle(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t.length >= 1 && t.length <= 200 ? t : null;
}

async function writeRate(ctx: Ctx): Promise<Res | null> {
  const r = await hitDbRateLimit(ctx.db, rateLimitBucket("astro-write", `${ctx.tenantId}:${ctx.userId}`), ASTRO_WRITE_LIMITS.write.limit, ASTRO_WRITE_LIMITS.write.windowSeconds);
  return r.allowed ? null : bad(429, "WRITE_RATE_LIMITED", "Kısa sürede çok fazla kayıt işlemi yapıldı. Lütfen biraz sonra tekrar deneyin.", { retryAfterSec: r.retryAfterSec });
}

async function byRequestId(ctx: Ctx, saveRequestId: string) {
  return ctx.db.from(TABLE).select(LIST_COLS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("save_request_id", saveRequestId).maybeSingle();
}

/** POST — kaydet. Gövde: hesaplama girdileri + title + saveRequestId (+ saveQuestion, question, clientId, demo). */
export async function saveHoraryRecord(ctx: Ctx, raw: unknown): Promise<Res> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const parsed = parseWesternHoraryBody(b);
  if (!parsed.ok) return { status: 400, body: { ok: false, ...parsed.error } };
  const title = parseTitle(b.title);
  if (!title) return bad(400, "INVALID_INPUT", "Kayıt başlığı gerekli (en çok 200 karakter).", { field: "title" });
  if (typeof b.saveRequestId !== "string" || !UUID_RE.test(b.saveRequestId)) return bad(400, "INVALID_INPUT", "Kayıt isteği kimliği geçersiz.", { field: "saveRequestId" });
  const saveQuestion = b.saveQuestion === true;
  let question: string | null = null;
  if (saveQuestion) {
    if (typeof b.question !== "string" || !b.question.trim()) return bad(400, "INVALID_INPUT", "Kaydedilecek soru metni boş.", { field: "question" });
    question = b.question.trim();
    if (question.length > QUESTION_MAX) return bad(400, "INVALID_INPUT", `Soru metni en çok ${QUESTION_MAX} karakter olabilir.`, { field: "question" });
  }
  const place = resolveAstroLocation(parsed.value.locationId);
  if (!place) return bad(400, "INVALID_INPUT", "Konum bulunamadı. Listeden yeniden seçin.", { field: "place" });

  // İdempotency: aynı istek kimliği daha önce kaydedildiyse AYNI kayıt döner (hesap / yazım yok).
  const prev = await byRequestId(ctx, b.saveRequestId);
  if (prev.error) return dbFail("save-lookup", prev.error);
  if (prev.data) {
    const row = prev.data as unknown as Row;
    return { status: 200, body: { ok: true, reused: true, record: publicRow(row, await clientLabels(ctx, row.client_id ? [row.client_id] : [])) } };
  }
  const cl = await checkClient(ctx, b.clientId);
  if (!cl.ok) return cl.res;
  const rl = await writeRate(ctx);
  if (rl) return rl;

  const run = runWesternHorary({ date: parsed.value.date, time: parsed.value.time, place, quesitedHouse: parsed.value.quesitedHouse, dst: parsed.value.dst });
  if (!run.ok) return { status: 422, body: { ok: false, ...run.error } };
  const r = run.result;
  const insert = {
    tenant_id: ctx.tenantId,
    owner_user_id: ctx.userId,
    client_id: cl.id,
    title,
    question_text: question,
    question_local_date: parsed.value.date,
    question_local_time: parsed.value.time.length === 5 ? `${parsed.value.time}:00` : parsed.value.time,
    timezone: place.timezone,
    utc_offset_seconds: r.question.offsetSeconds,
    dst_choice: parsed.value.dst,
    question_utc: r.question.utc,
    location_id: place.id,
    location_label: place.label,
    latitude: place.latitude,
    longitude: place.longitude,
    quesited_house: parsed.value.quesitedHouse,
    school: "lilly_1647",
    methodology_version: HORARY_METHODOLOGY_VERSION,
    orb_variant: r.chart.methodology.orbVariant,
    snapshot_schema: HORARY_SNAPSHOT_SCHEMA,
    result_snapshot: r,
    is_demo: b.demo === true,
    save_request_id: b.saveRequestId,
  };
  const ins = await ctx.db.from(TABLE).insert(insert).select(LIST_COLS).single();
  if (ins.error) {
    const e = ins.error as { code?: string; message?: string };
    if (e.code === "23505") {
      // Eşzamanlı çift gönderim: kazanan kaydı döndür.
      const again = await byRequestId(ctx, b.saveRequestId);
      if (again.data) {
        const row = again.data as unknown as Row;
        return { status: 200, body: { ok: true, reused: true, record: publicRow(row, await clientLabels(ctx, row.client_id ? [row.client_id] : [])) } };
      }
      return dbFail("save-dup", e);
    }
    if (e.code === "P0001" && /ASTRO_RECORD_CAP/.test(String(e.message))) return bad(409, "RECORD_CAP_REACHED", `${HORARY_RECORD_CAP} Horary kaydı sınırına ulaşıldı.`, { cap: HORARY_RECORD_CAP });
    if (e.code === "23503") return bad(400, "CLIENT_NOT_FOUND", "Danışan bulunamadı.", { field: "client" });
    return dbFail("save", e);
  }
  const row = ins.data as unknown as Row;
  return { status: 201, body: { ok: true, reused: false, record: publicRow(row, await clientLabels(ctx, row.client_id ? [row.client_id] : [])) } };
}

/** Arama metni: PostgREST joker / ayırıcı karakterleri temizlenir (enjeksiyon yok), en çok 80 karakter. */
export function cleanSearch(q: unknown): string {
  return typeof q === "string" ? q.replace(/[%_*,()\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

/** GET — liste. ?q=&from=YYYY-AA-GG&to=YYYY-AA-GG&clientId=&limit=&offset= (yeni → eski, soru anına göre). */
export async function listHoraryRecords(ctx: Ctx, p: URLSearchParams): Promise<Res> {
  const limit = Math.min(Math.max(Number(p.get("limit") ?? 20) || 20, 1), LIST_MAX);
  const offset = Math.max(Number(p.get("offset") ?? 0) || 0, 0);
  if (offset > 100_000) return bad(400, "INVALID_INPUT", "Sayfa geçersiz.");
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return bad(400, "INVALID_INPUT", "Tarih filtresi YYYY-AA-GG olmalı.");
  const clientId = p.get("clientId") ?? "";
  if (clientId && !UUID_RE.test(clientId)) return bad(400, "INVALID_INPUT", "Danışan filtresi geçersiz.");
  let q = ctx.db.from(TABLE).select(LIST_COLS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId);
  const s = cleanSearch(p.get("q"));
  if (s) q = q.ilike("title", `%${s}%`);
  if (from) q = q.gte("question_local_date", from);
  if (to) q = q.lte("question_local_date", to);
  if (clientId) q = q.eq("client_id", clientId);
  // limit+1: bir sonraki sayfanın varlığı (COUNT gerektirmez; arşiv büyüdükçe sabit maliyet, indeks: tenant, owner, question_utc).
  const { data, error } = await q.order("question_utc", { ascending: false }).range(offset, offset + limit);
  if (error) return dbFail("list", error);
  const rows = ((data as unknown as Row[] | null) ?? []).slice(0, limit + 1);
  const page = rows.slice(0, limit);
  const labels = await clientLabels(ctx, page.map((r) => r.client_id ?? "").filter(Boolean));
  return { status: 200, body: { ok: true, records: page.map((r) => publicRow(r, labels)), hasMore: rows.length > limit, limit, offset } };
}

async function loadOwn(ctx: Ctx, id: string): Promise<{ row: Row | null; res?: Res }> {
  if (!UUID_RE.test(id)) return { row: null, res: notFound() };
  const { data, error } = await ctx.db.from(TABLE).select(FULL_COLS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("id", id).maybeSingle();
  if (error) return { row: null, res: dbFail("get", error) };
  if (!data) return { row: null, res: notFound() };
  return { row: data as unknown as Row };
}

/** GET /:id — kayıtlı anlık görüntüyle birlikte. Yeniden hesap YOK. */
export async function getHoraryRecord(ctx: Ctx, id: string): Promise<Res> {
  const { row, res } = await loadOwn(ctx, id);
  if (!row) return res!;
  const labels = await clientLabels(ctx, row.client_id ? [row.client_id] : []);
  return {
    status: 200,
    body: {
      ok: true,
      record: { ...publicRow(row, labels), questionText: row.question_text ?? null, orbVariant: row.orb_variant, snapshotSchema: row.snapshot_schema, clientMissing: !!row.client_id && !labels[row.client_id] },
      result: row.result_snapshot,
    },
  };
}

/** PATCH /:id — yalnız başlık ve danışan bağlantısı (null = bağlantıyı kaldır). */
export async function patchHoraryRecord(ctx: Ctx, id: string, raw: unknown): Promise<Res> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const allowed = new Set(["title", "clientId"]);
  const extra = Object.keys(b).filter((k) => !allowed.has(k));
  if (extra.length) return bad(400, "INVALID_INPUT", "Yalnız başlık ve danışan bağlantısı güncellenebilir.");
  const upd: Record<string, unknown> = {};
  if ("title" in b) {
    const t = parseTitle(b.title);
    if (!t) return bad(400, "INVALID_INPUT", "Kayıt başlığı gerekli (en çok 200 karakter).", { field: "title" });
    upd.title = t;
  }
  if ("clientId" in b) {
    const cl = await checkClient(ctx, b.clientId);
    if (!cl.ok) return cl.res;
    upd.client_id = cl.id;
  }
  if (Object.keys(upd).length === 0) return bad(400, "INVALID_INPUT", "Güncellenecek alan yok.");
  const own = await loadOwn(ctx, id);
  if (!own.row) return own.res!;
  const rl = await writeRate(ctx);
  if (rl) return rl;
  const { data, error } = await ctx.db.from(TABLE).update(upd).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("id", id).select(LIST_COLS);
  if (error) {
    if ((error as { code?: string }).code === "23503") return bad(400, "CLIENT_NOT_FOUND", "Danışan bulunamadı.", { field: "client" });
    return dbFail("patch", error);
  }
  const row = ((data as unknown as Row[] | null) ?? [])[0];
  if (!row) return notFound();
  return { status: 200, body: { ok: true, record: publicRow(row, await clientLabels(ctx, row.client_id ? [row.client_id] : [])) } };
}

/** Rapor için kayıtlı veri (anlık görüntü + izinli alanlar). Yeniden hesap YOK. */
export async function loadHoraryForReport(ctx: Ctx, id: string): Promise<{ ok: true; result: WesternHoraryResult; questionText: string | null; demo: boolean; clientLabel: string | null; title: string; methodologyVersion: string; savedAt: string } | { ok: false; res: Res }> {
  const { row, res } = await loadOwn(ctx, id);
  if (!row) return { ok: false, res: res! };
  if (!row.result_snapshot || typeof row.result_snapshot !== "object") return { ok: false, res: dbFail("report-snapshot", { code: "SNAPSHOT_MISSING" }) };
  const labels = await clientLabels(ctx, row.client_id ? [row.client_id] : []);
  return { ok: true, result: row.result_snapshot, questionText: row.question_text ?? null, demo: row.is_demo, clientLabel: row.client_id ? (labels[row.client_id] ?? null) : null, title: row.title, methodologyVersion: row.methodology_version, savedAt: row.created_at };
}
