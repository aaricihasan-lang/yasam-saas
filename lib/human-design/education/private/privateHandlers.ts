// Human Design — Eğitmene Özel Eğitim Haritaları · ORTAK İSTEK İŞLEYİCİLERİ (YALNIZ SUNUCU).
// Route dosyaları yalnız kapıyı (requirePrivateTrainer / requirePrivateOwner) seçer ve buraya devreder.
// Yetki kararı DB'dedir; bu katman yalnız biçim doğrulaması, gövde sınırı ve tek tip yanıt üretir.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { bulkDeletePhrase, bulkPhraseMatches, requiresBulkDeleteGuard } from "@/lib/ui/bulkDeleteGuard";
import { PRIV_NO_STORE, privNotFound, type PrivContext } from "./privateAccess";
import { PRIV_UUID_RE, parseConsentInput, parseItemCreate, parseItemPatch } from "./privateContract";
import * as store from "./privateStore";

assertServerOnly("lib/human-design/education/private/privateHandlers");

const MAX_JSON = 64 * 1024;
const MAX_CONSENT_JSON = 3 * 1024 * 1024 + 64 * 1024; // ≤2 MB kanıt (base64 ≈ 2,8 MB) + alanlar

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: PRIV_NO_STORE });
const bad = (code: string, error: string, status = 400) => json({ ok: false, code, error }, status);

async function readBody(req: NextRequest, max: number): Promise<Record<string, unknown> | NextResponse> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > max) return bad("PAYLOAD_TOO_LARGE", "İstek çok büyük.", 413);
  let raw: string;
  try { raw = await req.text(); } catch { return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli."); }
  if (raw.length > max) return bad("PAYLOAD_TOO_LARGE", "İstek çok büyük.", 413);
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return bad("INVALID_BODY", "İstek gövdesi nesne olmalı.");
    return v as Record<string, unknown>;
  } catch {
    return bad("MALFORMED_JSON", "Geçerli JSON gövdesi gerekli.");
  }
}

function fromError(e: unknown): NextResponse {
  if (e instanceof store.PrivStoreError) {
    if (e.notFound) return privNotFound();
    return bad(e.code, e.userMessage, e.status);
  }
  return bad("SERVER_ERROR", "İşlem şu anda tamamlanamadı.", 500);
}

const validId = (id: unknown): id is string => typeof id === "string" && PRIV_UUID_RE.test(id);

// ── Kayıtlar ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Liste. Owner yönetim yüzü: tümü (?trainer= filtresi). Eğitmen yüzü ("Bana Özel"): owner bu yüzden çağırırsa da
 * YALNIZ kendi kayıtları (selfOnly) — kişisel arşiv görünümü başka eğitmenlerin kayıtlarıyla karışmaz.
 */
export async function listItems(req: NextRequest, ctx: PrivContext, opts: { selfOnly?: boolean } = {}): Promise<Response> {
  const t = new URL(req.url).searchParams.get("trainer");
  const trainer = opts.selfOnly ? (ctx.kind === "owner" ? ctx.actorId : null) : ctx.kind === "owner" && t ? t : null;
  if (trainer !== null && !validId(trainer)) return bad("INVALID_FIELD", "Eğitmen filtresi geçersiz.");
  try {
    return json({ ok: true, items: await store.listItems(ctx.db, ctx.actorId, ctx.kind, trainer) });
  } catch (e) { return fromError(e); }
}

export async function createItem(req: NextRequest, ctx: PrivContext): Promise<Response> {
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  const p = parseItemCreate(b);
  if (!p.ok) return bad("INVALID_FIELD", `Alan geçersiz: ${p.field}`);
  try {
    return json({ ok: true, id: await store.addItem(ctx.db, ctx.actorId, p.value) }, 201);
  } catch (e) { return fromError(e); }
}

/**
 * Ayrıntı. Eğitmen: kayıt 'ok' değilse (izin geri çekildi / kaynak değişti / kanıt bozuk) eski bağlantı dahil 404.
 * Owner: yönetim için kayıt + izin durumu görünür; harita verisi yalnız 'ok' iken.
 */
export async function getItem(id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  try {
    const d = await store.getItem(ctx.db, ctx.actorId, id);
    if (!d) return privNotFound();
    if (ctx.kind === "trainer" && d.state !== "ok") return privNotFound();
    return json({ ok: true, item: d });
  } catch (e) { return fromError(e); }
}

export async function patchItem(req: NextRequest, id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  const p = parseItemPatch(b);
  if (!p.ok) return bad("INVALID_FIELD", `Düzenlenemeyen veya geçersiz alan: ${p.field}`);
  try {
    return json({ ok: true, updatedAt: await store.updateItem(ctx.db, ctx.actorId, id, p.value) });
  } catch (e) { return fromError(e); }
}

export async function rebindItem(id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  try {
    return json({ ok: true, updatedAt: await store.rebindItem(ctx.db, ctx.actorId, id) });
  } catch (e) { return fromError(e); }
}

/**
 * Silme sözleşmesi (lib/ui/bulkDeleteGuard ile aynı): confirmCount = kayıt sayısı (tekli/ikili iki aşamalı onay);
 * 3+ kayıtta ayrıca "<N> KAYDI SİL" ifadesi. Hepsi-ya-hiçbiri; görünmeyen tek kimlik tüm isteği 404 yapar.
 */
export async function deleteItems(req: NextRequest, ctx: PrivContext): Promise<Response> {
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  const ids = Array.isArray(b.ids) ? b.ids : null;
  if (!ids || ids.length < 1 || ids.length > 100 || !ids.every(validId) || new Set(ids).size !== ids.length) {
    return bad("INVALID_FIELD", "Silinecek kayıt listesi geçersiz.");
  }
  const count = ids.length;
  if (b.confirmCount !== count) return bad("CONFIRM_REQUIRED", "Silme onayı eksik.");
  let phrase: string | null = null;
  if (requiresBulkDeleteGuard(count)) {
    const expected = bulkDeletePhrase(count);
    if (typeof b.confirmPhrase !== "string" || !bulkPhraseMatches(b.confirmPhrase, expected)) {
      return bad("CONFIRM_REQUIRED", `Doğrulama ifadesi gerekli: "${expected}".`);
    }
    phrase = `${count} KAYDI SIL`;
  }
  try {
    return json({ ok: true, deleted: await store.deleteItems(ctx.db, ctx.actorId, ids as string[], count, phrase) });
  } catch (e) { return fromError(e); }
}

// ── İzin ──────────────────────────────────────────────────────────────────────────────────────────────
export async function consentText(ctx: PrivContext): Promise<Response> {
  try {
    const t = await store.getConsentText(ctx.db, ctx.actorId);
    if (!t) return bad("CONSENT_TEXT_NOT_APPROVED", "Kullanıma onaylı izin metni yok. Owner onayı bekleniyor.", 409);
    return json({ ok: true, text: t });
  } catch (e) { return fromError(e); }
}

export async function listConsents(req: NextRequest, ctx: PrivContext): Promise<Response> {
  const c = new URL(req.url).searchParams.get("hdClientId");
  if (!validId(c)) return bad("INVALID_FIELD", "Danışan kimliği geçersiz.");
  try {
    return json({ ok: true, consents: await store.listConsents(ctx.db, ctx.actorId, c) });
  } catch (e) { return fromError(e); }
}

export async function recordConsent(req: NextRequest, ctx: PrivContext): Promise<Response> {
  const b = await readBody(req, MAX_CONSENT_JSON);
  if (b instanceof NextResponse) return b;
  const p = parseConsentInput(b);
  if (!p.ok) return bad("INVALID_FIELD", `Alan geçersiz: ${p.field}`);
  try {
    return json({ ok: true, id: await store.recordConsent(ctx.db, ctx.actorId, p.value) }, 201);
  } catch (e) { return fromError(e); }
}

export async function withdrawConsent(req: NextRequest, id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  const allowed = ctx.kind === "owner" ? ["danisan_talebi", "egitmen_karari", "owner_karari"] : ["danisan_talebi", "egitmen_karari"];
  if (typeof b.channel !== "string" || !allowed.includes(b.channel)) return bad("INVALID_FIELD", "Geri çekme kanalı geçersiz.");
  if (b.confirm !== true) return bad("CONFIRM_REQUIRED", "Geri çekme onayı eksik.");
  try {
    return json({ ok: true, closedItems: await store.withdrawConsent(ctx.db, ctx.actorId, id, b.channel) });
  } catch (e) { return fromError(e); }
}

export async function deleteConsent(req: NextRequest, id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  if (b.confirm !== true) return bad("CONFIRM_REQUIRED", "Silme onayı eksik.");
  try {
    return json({ ok: true, deletedItems: await store.deleteConsent(ctx.db, ctx.actorId, id) });
  } catch (e) { return fromError(e); }
}

/** Kanıt dosyası: yalnız yetkili aktöre; SHA-256 DB'de doğrulanır; indirme olarak, önbelleksiz, MIME koklama kapalı. */
export async function consentEvidence(id: string, ctx: PrivContext): Promise<Response> {
  if (!validId(id)) return privNotFound();
  try {
    const e = await store.getConsentEvidence(ctx.db, ctx.actorId, id);
    const ext = e.mime === "application/pdf" ? "pdf" : e.mime === "image/png" ? "png" : "jpg";
    return new Response(new Uint8Array(e.bytes), {
      status: 200,
      headers: {
        ...PRIV_NO_STORE, "Content-Type": e.mime, "Content-Disposition": `attachment; filename="izin-kaniti-${id.slice(0, 8)}.${ext}"`,
        "X-Content-Type-Options": "nosniff", "X-Evidence-Sha256": e.sha256,
      },
    });
  } catch (e) { return fromError(e); }
}

// ── Owner ─────────────────────────────────────────────────────────────────────────────────────────────
export async function ownerOverview(ctx: PrivContext): Promise<Response> {
  if (ctx.kind !== "owner") return privNotFound();
  try { return json({ ok: true, overview: await store.ownerOverview(ctx.db, ctx.actorId) }); } catch (e) { return fromError(e); }
}

export async function ownerAction(req: NextRequest, ctx: PrivContext): Promise<Response> {
  if (ctx.kind !== "owner") return privNotFound();
  const b = await readBody(req, MAX_JSON);
  if (b instanceof NextResponse) return b;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null;
  try {
    switch (b.action) {
      case "open":
      case "close":
        if (b.confirm !== true) return bad("CONFIRM_REQUIRED", "Onay eksik.");
        await store.ownerSetOpen(ctx.db, ctx.actorId, b.action === "open", note);
        break;
      case "grant":
        if (!validId(b.userId)) return bad("INVALID_FIELD", "Kullanıcı kimliği geçersiz.");
        await store.ownerGrant(ctx.db, ctx.actorId, b.userId, note);
        break;
      case "revoke":
        if (!validId(b.userId)) return bad("INVALID_FIELD", "Kullanıcı kimliği geçersiz.");
        await store.ownerRevoke(ctx.db, ctx.actorId, b.userId);
        break;
      case "approveText":
        if (typeof b.version !== "string" || typeof b.legalRef !== "string" || !b.legalRef.trim() || b.confirm !== true) {
          return bad("INVALID_FIELD", "Sürüm, hukuk referansı ve onay zorunlu.");
        }
        await store.ownerApproveText(ctx.db, ctx.actorId, b.version, b.legalRef.trim().slice(0, 500));
        break;
      default:
        return bad("INVALID_FIELD", "Bilinmeyen işlem.");
    }
    return json({ ok: true, overview: await store.ownerOverview(ctx.db, ctx.actorId) });
  } catch (e) { return fromError(e); }
}
