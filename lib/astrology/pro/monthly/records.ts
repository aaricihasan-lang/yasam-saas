// Gökyüzü Atlası — AYLIK EFEMERİS KAYITLARI (astro_sky_monthly_ephemeris; migration 20280125000000). YALNIZ SUNUCU.
//
// Güvenlik: service_role RLS'yi aştığından HER sorgu tenant_id + owner_user_id ile daraltılır; başka uzmanın / tenant'ın kaydı "yok"
// (404) döner (varlığı sızdırılmaz). Kaydedilen içerik SUNUCUDAN gelir: istemcinin gönderdiği tablo kabul edilmez; ayın sonucu yalnız
// önbellekten alınır (`allowProvider: false`) → kaydetme yeni ücretli çağrı BAŞLATAMAZ. Kayıtlı anlık görüntü değişmez (DB tetikleyicisi
// + kolon yetkisi); yeniden açma ve rapor bu anlık görüntüyü kullanır (sağlayıcı çağrısı YOK).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { ASTRO_WRITE_LIMITS } from "@/lib/astrology/limits";
import { parseMonthlyRequest } from "./contract";
import { kindLabel, periodLabel } from "./format";
import { CROSSCHECK_UNAVAILABLE_ERROR, ensureVerified, getMonthlyEphemeris, isVerifiedPass, MONTHLY_METHODOLOGY_VERSION, type MonthlyDeps } from "./service";
import type { MonthlyEphemeris, MonthlyKind } from "./types";

assertServerOnly("lib/astrology/pro/monthly/records");

export const MONTHLY_RECORD_CAP = 3000;
export const MONTHLY_SNAPSHOT_SCHEMA = 1;
const TABLE = "astro_sky_monthly_ephemeris";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const LIST_MAX = 50;

export type Ctx = { db: SupabaseClient; tenantId: string; userId: string };
export type Res = { status: number; body: Record<string, unknown> };
const bad = (status: number, code: string, error: string, extra: Record<string, unknown> = {}): Res => ({ status, body: { ok: false, code, error, ...extra } });
const notFound = (): Res => bad(404, "NOT_FOUND", "Kayıt bulunamadı.");
/** Tablo yoksa (migration uygulanmamış) açık mesaj; diğer hatalar genel. */
const dbFail = (context: string, e: { code?: string } | null): Res => {
  console.error(`[astro-monthly-records] db error (${context})`, { code: e?.code ?? "unknown" });
  if (e?.code === "42P01" || e?.code === "PGRST205") return bad(503, "STORE_UNAVAILABLE", "Efemeris kayıt altyapısı henüz etkin değil. Tablo yine görüntülenebilir; kayıt yapılamaz.");
  return bad(500, "DB_ERROR", "Kayıt işlemi şu anda yapılamıyor. Lütfen biraz sonra tekrar deneyin.");
};

const LIST_COLS = "id, title, kind, year, month, zodiac, ayanamsa, time_reference, methodology_version, created_at, updated_at";
const FULL_COLS = `${LIST_COLS}, source_endpoint, adapter_version, provider_api_version, snapshot_schema, result_snapshot`;

type Row = {
  id: string;
  title: string;
  kind: MonthlyKind;
  year: number;
  month: number;
  zodiac: "tropical" | "sidereal";
  ayanamsa: "lahiri" | null;
  time_reference: string;
  methodology_version: string;
  created_at: string;
  updated_at: string;
  result_snapshot?: MonthlyEphemeris;
};

function publicRow(r: Row) {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    year: r.year,
    month: r.month,
    zodiac: r.zodiac,
    ayanamsa: r.ayanamsa,
    timeReference: r.time_reference,
    methodologyVersion: r.methodology_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const defaultTitle = (kind: MonthlyKind, year: number, month: number) => `Efemeris · ${kindLabel(kind)} · ${periodLabel(year, month)}`;

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

/** POST — kaydet. Gövde: { kind, year, month, title?, saveRequestId }. İçerik önbellekteki sunucu sonucundan alınır. */
export async function saveMonthlyRecord(ctx: Ctx, raw: unknown, deps: Pick<MonthlyDeps, "db">): Promise<Res> {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const parsed = parseMonthlyRequest(b);
  if (!parsed.ok) return { status: 400, body: { ok: false, ...parsed.error } };
  const req = parsed.value;
  const title = b.title === undefined || b.title === null || b.title === "" ? defaultTitle(req.kind, req.year, req.month) : parseTitle(b.title);
  if (!title) return bad(400, "INVALID_INPUT", "Kayıt başlığı en çok 200 karakter olabilir.", { field: "title" });
  if (typeof b.saveRequestId !== "string" || !UUID_RE.test(b.saveRequestId)) return bad(400, "INVALID_INPUT", "Kayıt isteği kimliği geçersiz.", { field: "saveRequestId" });

  // İdempotency: aynı istek kimliği daha önce kaydedildiyse AYNI kayıt döner.
  const prev = await byRequestId(ctx, b.saveRequestId);
  if (prev.error) return dbFail("save-lookup", prev.error);
  if (prev.data) return { status: 200, body: { ok: true, reused: true, record: publicRow(prev.data as unknown as Row) } };

  // Ücretli çağrı YOK: yalnız önbellek. Önbellekte yoksa uzman önce tabloyu hesaplamalıdır.
  const got = await getMonthlyEphemeris(req, { db: deps.db, callProvider: null }, { allowProvider: false });
  if (!got.ok) {
    if (got.error.code === "NOT_CACHED") return bad(409, "NOT_CACHED", "Bu ayın tablosu sunucuda bulunamadı. Tabloyu yeniden hesaplayıp sonra kaydedin.");
    // Doğrulanmamış içerik KAYDA YAZILMAZ.
    return bad(got.error.code === "CROSSCHECK_UNAVAILABLE" ? 503 : got.error.code === "CROSSCHECK_FAILED" ? 502 : 500, got.error.code, got.error.error);
  }
  if (!isVerifiedPass(got.result.crossCheck)) return bad(503, CROSSCHECK_UNAVAILABLE_ERROR.code, CROSSCHECK_UNAVAILABLE_ERROR.error);
  const rl = await writeRate(ctx);
  if (rl) return rl;
  const e = got.result;
  const insert = {
    tenant_id: ctx.tenantId,
    owner_user_id: ctx.userId,
    title,
    kind: e.kind,
    year: e.year,
    month: e.month,
    zodiac: e.zodiac,
    ayanamsa: e.ayanamsa,
    time_reference: "12:00 UTC",
    source_endpoint: e.source.endpoint,
    adapter_version: e.source.adapterVersion,
    provider_api_version: e.source.providerApiVersion,
    methodology_version: MONTHLY_METHODOLOGY_VERSION,
    snapshot_schema: MONTHLY_SNAPSHOT_SCHEMA,
    result_snapshot: e,
    save_request_id: b.saveRequestId,
  };
  const ins = await ctx.db.from(TABLE).insert(insert).select(LIST_COLS).single();
  if (ins.error) {
    const er = ins.error as { code?: string; message?: string };
    if (er.code === "23505") {
      const again = await byRequestId(ctx, b.saveRequestId);
      if (again.data) return { status: 200, body: { ok: true, reused: true, record: publicRow(again.data as unknown as Row) } };
      return dbFail("save-dup", er);
    }
    if (er.code === "P0001" && /ASTRO_RECORD_CAP/.test(String(er.message))) return bad(409, "RECORD_CAP_REACHED", `${MONTHLY_RECORD_CAP} efemeris kaydı sınırına ulaşıldı.`, { cap: MONTHLY_RECORD_CAP });
    return dbFail("save", er);
  }
  return { status: 201, body: { ok: true, reused: false, record: publicRow(ins.data as unknown as Row) } };
}

/** GET — liste. ?kind=western|vedic&year=&limit=&offset= (yeni → eski, kayıt anına göre). */
export async function listMonthlyRecords(ctx: Ctx, p: URLSearchParams): Promise<Res> {
  const limit = Math.min(Math.max(Number(p.get("limit") ?? 20) || 20, 1), LIST_MAX);
  const offset = Math.max(Number(p.get("offset") ?? 0) || 0, 0);
  if (offset > 100_000) return bad(400, "INVALID_INPUT", "Sayfa geçersiz.");
  const kind = p.get("kind") ?? "";
  if (kind && kind !== "western" && kind !== "vedic") return bad(400, "INVALID_INPUT", "Tür filtresi geçersiz.");
  const year = p.get("year") ?? "";
  if (year && !/^\d{4}$/.test(year)) return bad(400, "INVALID_INPUT", "Yıl filtresi geçersiz.");
  let q = ctx.db.from(TABLE).select(LIST_COLS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId);
  if (kind) q = q.eq("kind", kind);
  if (year) q = q.eq("year", Number(year));
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit);
  if (error) return dbFail("list", error);
  const rows = ((data as unknown as Row[] | null) ?? []).slice(0, limit + 1);
  return { status: 200, body: { ok: true, records: rows.slice(0, limit).map(publicRow), hasMore: rows.length > limit, limit, offset } };
}

async function loadOwn(ctx: Ctx, id: string): Promise<{ row: Row | null; res?: Res }> {
  if (!UUID_RE.test(id)) return { row: null, res: notFound() };
  const { data, error } = await ctx.db.from(TABLE).select(FULL_COLS).eq("tenant_id", ctx.tenantId).eq("owner_user_id", ctx.userId).eq("id", id).maybeSingle();
  if (error) return { row: null, res: dbFail("get", error) };
  if (!data) return { row: null, res: notFound() };
  const row = data as unknown as Row;
  if (!row.result_snapshot || typeof row.result_snapshot !== "object" || !Array.isArray(row.result_snapshot.days)) return { row: null, res: dbFail("snapshot", { code: "SNAPSHOT_MISSING" }) };
  // Kayıt değişmezdir; PASS dışı (eski) bir anlık görüntü yerelde yeniden kontrol edilir — PASS değilse açılmaz / rapora girmez.
  const v = ensureVerified(row.result_snapshot);
  if (!v.ok) return { row: null, res: bad(v.error.code === "CROSSCHECK_FAILED" ? 502 : 503, v.error.code, v.error.error) };
  return { row: { ...row, result_snapshot: v.result } };
}

/** GET /:id — kayıtlı anlık görüntüyle birlikte. Yeniden hesap / sağlayıcı çağrısı YOK. */
export async function getMonthlyRecord(ctx: Ctx, id: string): Promise<Res> {
  const { row, res } = await loadOwn(ctx, id);
  if (!row) return res!;
  return { status: 200, body: { ok: true, record: publicRow(row), result: row.result_snapshot } };
}

/** Rapor için kayıtlı veri. Yeniden hesap YOK. */
export async function loadMonthlyForReport(ctx: Ctx, id: string): Promise<{ ok: true; result: MonthlyEphemeris; title: string; savedAt: string; methodologyVersion: string } | { ok: false; res: Res }> {
  const { row, res } = await loadOwn(ctx, id);
  if (!row) return { ok: false, res: res! };
  return { ok: true, result: row.result_snapshot!, title: row.title, savedAt: row.created_at, methodologyVersion: row.methodology_version };
}
