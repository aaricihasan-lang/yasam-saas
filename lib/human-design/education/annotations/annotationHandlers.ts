// Human Design — Eğitim Çalışma Alanı · ÇİZİM KATMANI İSTEK İŞLEYİCİLERİ (YALNIZ SUNUCU, FAZ 8).
// Kapı seçimi route'ta (merkezî: requireEducationViewer + yayımlı kayıt; özel: requirePrivateTrainer; owner:
// requirePrivateOwner). YETKİ KARARI DB'dedir (hd_edu_ann_* RPC'leri aktörü + kaynağı her çağrıda yeniden doğrular);
// bu katman biçim doğrulaması, gövde sınırı, olağan dışı kullanım sınırı ve tek tip yanıt üretir.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { hitDbRateLimit, rateLimitBucket } from "@/lib/security/dbRateLimit";
import { rpcValue } from "@/lib/human-design/education/private/privateAccess";
import { buildEduChartView } from "@/lib/human-design/education/private/privateChartView";
import { getPublishedDetail } from "@/lib/human-design/education/educationStore";
import { bulkPhraseMatches, bulkDeletePhrase } from "@/lib/ui/bulkDeleteGuard";
import {
  ANN_ERROR_MAP, ANN_MAX_JSON_BYTES, ANN_NOT_FOUND_CODE, ANN_RPC, parseAnnDoc,
  type AnnDoc, type AnnLayer, type AnnOwnerLayerDetail, type AnnOwnerLayerRow, type AnnOwnerTrainerRow, type AnnPurgePreview, type AnnSourceKind,
} from "./annotationContract";

assertServerOnly("lib/human-design/education/annotations/annotationHandlers");

const NO_STORE = { "Cache-Control": "no-store" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
const bad = (code: string, error: string, status = 400) => json({ ok: false, code, error }, status);
export const annNotFound = () => json({ ok: false, error: "Bulunamadı." }, 404);

export type AnnActorCtx = { db: SupabaseClient; actorId: string };

/**
 * Owner kararı (FAZ 8): görüntüleme / açma SINIRLANMAZ. Yalnız olağan dışı davranış: yoğun otomatik kayıt,
 * kısa sürede aşırı silme ve kimlik tahmini (çok sayıda "bulunamadı"). Mevcut DB sayacı yeniden kullanılır.
 */
const ABUSE = {
  save: { limit: 600, window: 600, msg: "Kısa sürede çok fazla kayıt isteği. Lütfen biraz bekleyin." },
  remove: { limit: 60, window: 600, msg: "Kısa sürede çok fazla silme isteği. Lütfen biraz bekleyin." },
  miss: { limit: 300, window: 600, msg: "Kısa sürede çok fazla geçersiz istek. Lütfen biraz bekleyin." },
} as const;
async function abuseGuard(ctx: AnnActorCtx, kind: keyof typeof ABUSE): Promise<NextResponse | null> {
  const a = ABUSE[kind];
  const r = await hitDbRateLimit(ctx.db, rateLimitBucket(`hd-edu-ann-${kind}`, ctx.actorId), a.limit, a.window);
  if (r.allowed) return null;
  return json({ ok: false, code: "RATE_LIMITED", error: a.msg }, 429, { "Retry-After": String(r.retryAfterSec || 60) });
}
/** "Bulunamadı" yanıtı — kimlik tahmini sayacına işlenir (aynı gövde; sınır aşılırsa 429). */
export async function annMiss(ctx: AnnActorCtx): Promise<NextResponse> {
  return (await abuseGuard(ctx, "miss")) ?? annNotFound();
}

class AnnError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly userMessage: string, public readonly notFound = false, public readonly current: number | null = null) {
    super(code);
  }
}
async function call(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await db.rpc(fn, args);
  if (r.error) {
    const e = r.error as { code?: string; details?: string | null; message?: string };
    const c = String(e.code ?? "");
    if (c === ANN_NOT_FOUND_CODE) throw new AnnError(404, "NOT_FOUND", "Bulunamadı.", true);
    const m = ANN_ERROR_MAP[c];
    if (m) {
      // Güncel revizyon: PostgREST `details` (DETAIL) veya mesajdaki "(güncel=N)".
      const raw = c === "EA409" ? (e.details && /^\d+$/.test(e.details) ? e.details : /\(güncel=(\d+)\)/.exec(e.message ?? "")?.[1]) : undefined;
      const cur = raw !== undefined ? Number(raw) : null;
      throw new AnnError(m.status, m.code, m.error, false, cur);
    }
    throw new AnnError(500, "SERVER_ERROR", "İşlem şu anda tamamlanamadı.");
  }
  const v = rpcValue(fn, r.data);
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
async function fromError(e: unknown, ctx: AnnActorCtx): Promise<NextResponse> {
  if (e instanceof AnnError) {
    if (e.notFound) return annMiss(ctx);
    return json({ ok: false, code: e.code, error: e.userMessage, ...(e.current !== null ? { currentRevision: e.current } : {}) }, e.status);
  }
  return bad("SERVER_ERROR", "İşlem şu anda tamamlanamadı.", 500);
}

const s = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
function toLayer(v: unknown): AnnLayer | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const layer: AnnLayer = {
    id: s(o.id), sourceKind: s(o.source_kind) as AnnSourceKind, sourceId: s(o.source_id), elCount: n(o.el_count),
    revision: n(o.revision), createdAt: s(o.created_at), updatedAt: s(o.updated_at),
  };
  if (o.doc !== undefined) {
    // DB'den gelen belge de aynı katı şemadan geçer (bozuk / eski satır istemciye ham gitmez).
    const p = parseAnnDoc(o.doc);
    layer.doc = p.ok ? p.doc : { v: 1, els: [], notes: "" };
  }
  return layer;
}

async function readBody(req: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > ANN_MAX_JSON_BYTES) return bad("PAYLOAD_TOO_LARGE", "İstek çok büyük.", 413);
  let raw: string;
  try { raw = await req.text(); } catch { return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli."); }
  if (raw.length > ANN_MAX_JSON_BYTES) return bad("PAYLOAD_TOO_LARGE", "İstek çok büyük.", 413);
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad("INVALID_BODY", "İstek gövdesi nesne olmalı.");
    return v as Record<string, unknown>;
  } catch {
    return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli.");
  }
}

const validRevision = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < 2_000_000_000;

// ── Eğitmen ──────────────────────────────────────────────────────────────────────────────────────
export async function getLayer(ctx: AnnActorCtx, kind: AnnSourceKind, ref: string): Promise<Response> {
  if (!UUID_RE.test(ref)) return annMiss(ctx);
  try {
    const v = await call(ctx.db, ANN_RPC.get, { p_actor: ctx.actorId, p_kind: kind, p_ref: ref });
    return json({ ok: true, layer: toLayer(v.layer) });
  } catch (e) { return fromError(e, ctx); }
}

export async function saveLayer(req: NextRequest, ctx: AnnActorCtx, kind: AnnSourceKind, ref: string): Promise<Response> {
  if (!UUID_RE.test(ref)) return annMiss(ctx);
  const b = await readBody(req);
  if (b instanceof NextResponse) return b;
  if (!validRevision(b.expectedRevision)) return bad("INVALID_FIELD", "Geçersiz alan: expectedRevision");
  const p = parseAnnDoc(b.doc);
  if (!p.ok) return bad("INVALID_DOC", `Çizim içeriği geçersiz (${p.field}). Metinlerde < ve > kullanılamaz.`);
  const limited = await abuseGuard(ctx, "save");
  if (limited) return limited;
  try {
    const v = await call(ctx.db, ANN_RPC.save, { p_actor: ctx.actorId, p_kind: kind, p_ref: ref, p_doc: p.doc satisfies AnnDoc, p_expected_revision: b.expectedRevision });
    return json({ ok: true, layer: toLayer(v.layer) });
  } catch (e) { return fromError(e, ctx); }
}

export async function clearLayer(req: NextRequest, ctx: AnnActorCtx, kind: AnnSourceKind, ref: string): Promise<Response> {
  if (!UUID_RE.test(ref)) return annMiss(ctx);
  const b = await readBody(req);
  if (b instanceof NextResponse) return b;
  if (b.confirm !== true) return bad("CONFIRM_REQUIRED", "Tüm katmanı silmek için açık onay gerekli.", 422);
  if (!validRevision(b.expectedRevision)) return bad("INVALID_FIELD", "Geçersiz alan: expectedRevision");
  const limited = await abuseGuard(ctx, "remove");
  if (limited) return limited;
  try {
    const v = await call(ctx.db, ANN_RPC.clear, { p_actor: ctx.actorId, p_kind: kind, p_ref: ref, p_expected_revision: b.expectedRevision, p_confirm: true });
    return json({ ok: true, deleted: n(v.deleted) });
  } catch (e) { return fromError(e, ctx); }
}

// ── Owner ────────────────────────────────────────────────────────────────────────────────────────
export async function ownerList(req: NextRequest, ctx: AnnActorCtx): Promise<Response> {
  const sp = new URL(req.url).searchParams;
  const kind = sp.get("kind");
  const ref = sp.get("ref");
  if (kind !== null && kind !== "central" && kind !== "private") return bad("INVALID_FIELD", "Geçersiz alan: kind");
  if (ref !== null && !UUID_RE.test(ref)) return bad("INVALID_FIELD", "Geçersiz alan: ref");
  try {
    const v = await call(ctx.db, ANN_RPC.ownerList, { p_actor: ctx.actorId, p_kind: kind, p_ref: ref });
    const rows: AnnOwnerLayerRow[] = (Array.isArray(v.layers) ? v.layers : []).map((x) => {
      const o = x as Record<string, unknown>;
      return { ...(toLayer(o) as AnnLayer), trainerUserId: s(o.trainer_user_id), trainerName: s(o.trainer_name),
        sourceTitle: typeof o.source_title === "string" ? o.source_title : null, sourceState: s(o.source_state),
        contentClosed: o.content_closed === true, grantActive: o.grant_active === true };
    });
    return json({ ok: true, layers: rows });
  } catch (e) { return fromError(e, ctx); }
}

export async function ownerGet(ctx: AnnActorCtx, layerId: string): Promise<Response> {
  if (!UUID_RE.test(layerId)) return annMiss(ctx);
  try {
    const v = await call(ctx.db, ANN_RPC.ownerGet, { p_actor: ctx.actorId, p_layer: layerId });
    const o = (v.layer ?? {}) as Record<string, unknown>;
    const base = toLayer(o) as AnnLayer;
    const closed = o.content_closed === true;
    // FAZ 9: merkezî YAYIMLI kayıtta gerçek BodyGraph için KAYITLI snapshot (yeni hesap / sağlayıcı çağrısı YOK). Yalnız
    // izin listesindeki yapısal alanlar (buildEduChartView) gönderilir. Özel kayıtta harita, mevcut owner ayrıntı ucundan
    // (izin kontrollü) alınır; izni kapalıysa ne harita ne katman içeriği gönderilir.
    let chartView: Record<string, unknown> | null = null;
    if (!closed && base.sourceKind === "central") {
      const d = await getPublishedDetail(ctx.db, base.sourceId).catch(() => null);
      chartView = d ? ((buildEduChartView(d.chart.result) as unknown as Record<string, unknown>) ?? null) : null;
    }
    const layer: AnnOwnerLayerDetail = { ...base, trainerUserId: s(o.trainer_user_id), trainerName: s(o.trainer_name), sourceState: s(o.source_state), contentClosed: closed, chartView };
    if (closed) delete layer.doc;
    return json({ ok: true, layer });
  } catch (e) { return fromError(e, ctx); }
}

export async function ownerDelete(req: NextRequest, ctx: AnnActorCtx, layerId: string): Promise<Response> {
  if (!UUID_RE.test(layerId)) return annMiss(ctx);
  const b = await readBody(req);
  if (b instanceof NextResponse) return b;
  if (b.confirm !== true) return bad("CONFIRM_REQUIRED", "Katmanı kaldırmak için açık onay gerekli.", 422);
  const limited = await abuseGuard(ctx, "remove");
  if (limited) return limited;
  try {
    const v = await call(ctx.db, ANN_RPC.ownerDelete, { p_actor: ctx.actorId, p_layer: layerId, p_confirm: true });
    return json({ ok: true, deleted: n(v.deleted) });
  } catch (e) { return fromError(e, ctx); }
}

// ── FAZ 9 · Owner: eğitmen veri durumu + ayrı kalıcı silme ──────────────────────────────────────
export async function ownerTrainers(ctx: AnnActorCtx): Promise<Response> {
  try {
    const v = await call(ctx.db, ANN_RPC.ownerTrainers, { p_actor: ctx.actorId });
    const rows: AnnOwnerTrainerRow[] = (Array.isArray(v.trainers) ? v.trainers : []).map((x) => {
      const o = x as Record<string, unknown>;
      return { userId: s(o.user_id), name: s(o.name), accountActive: o.account_active === true, grantActive: o.grant_active === true,
        centralLayers: n(o.central_layers), privateLayers: n(o.private_layers), privateItems: n(o.private_items), privateItemsClosed: n(o.private_items_closed),
        lastActivity: typeof o.last_activity === "string" ? o.last_activity : null };
    });
    return json({ ok: true, trainers: rows });
  } catch (e) { return fromError(e, ctx); }
}

async function previewOf(ctx: AnnActorCtx, userId: string): Promise<AnnPurgePreview> {
  const o = await call(ctx.db, ANN_RPC.ownerPurgePreview, { p_actor: ctx.actorId, p_trainer: userId });
  return { userId: s(o.user_id), name: s(o.name), grantActive: o.grant_active === true, layers: n(o.layers), items: n(o.items), keptConsents: n(o.kept_consents), keptAudit: n(o.kept_audit) };
}

export async function ownerPurgePreview(ctx: AnnActorCtx, userId: string): Promise<Response> {
  if (!UUID_RE.test(userId)) return annMiss(ctx);
  try {
    const p = await previewOf(ctx, userId);
    return json({ ok: true, preview: p, phrase: bulkDeletePhrase(p.layers + p.items) });
  } catch (e) { return fromError(e, ctx); }
}

/** POST { expectedLayers, expectedItems, phrase } — 3 aşamalı onayın SON adımı; sayılar önizlemeyle birebir olmalı. */
export async function ownerPurge(req: NextRequest, ctx: AnnActorCtx, userId: string): Promise<Response> {
  if (!UUID_RE.test(userId)) return annMiss(ctx);
  const b = await readBody(req);
  if (b instanceof NextResponse) return b;
  if (!validRevision(b.expectedLayers) || !validRevision(b.expectedItems)) return bad("INVALID_FIELD", "Geçersiz alan: beklenen sayılar");
  const total = (b.expectedLayers as number) + (b.expectedItems as number);
  if (typeof b.phrase !== "string" || !bulkPhraseMatches(b.phrase, bulkDeletePhrase(total))) return bad("CONFIRM_REQUIRED", `Onay ifadesi birebir yazılmalı: ${bulkDeletePhrase(total)}`, 422);
  const limited = await abuseGuard(ctx, "remove");
  if (limited) return limited;
  try {
    const v = await call(ctx.db, ANN_RPC.ownerPurge, { p_actor: ctx.actorId, p_trainer: userId, p_expected_layers: b.expectedLayers, p_expected_items: b.expectedItems, p_confirm_phrase: b.phrase });
    return json({ ok: true, deleted: { layers: n(v.layers), items: n(v.items) } });
  } catch (e) { return fromError(e, ctx); }
}
