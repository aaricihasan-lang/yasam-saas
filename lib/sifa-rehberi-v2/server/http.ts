/**
 * Şifa Rehberi V2 — HTTP işleyicileri (gerçek ve izole-test rotalarının ORTAK gövdesi).
 * Kimlik doğrulama BURADA YAPILMAZ: çağıran rota kapsamı (tenant + kullanıcı) oturumdan çözer
 * ve buraya verir. Böylece izole testte sınanan mantık production ile aynıdır.
 */
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { JSONContent } from "@tiptap/core";
import { checkRateLimit } from "@/lib/rateLimit";
import { CHANGESET_LIMITS } from "@/lib/sifa-rehberi-v2/changeset";
import { ASSET_SRC_RE, assetIdsIn } from "@/lib/sifa-rehberi-v2/contentSafety";
import {
  copySharedToPersonal, loadWorkspace, registerUpload, saveChangeset, visibleAssets, type Scope, type SifaV2Db,
} from "@/lib/sifa-rehberi-v2/server/service";
import {
  IMAGE_MIME_EXT, isOwnUploadPath, MAX_IMAGE_BYTES, SIFA_BUCKET, SIGNED_URL_TTL_SEC, sniffImageMime, type SifaV2Storage,
} from "@/lib/sifa-rehberi-v2/server/storage";
import { buildTopicWord } from "@/lib/sifa-rehberi-v2/word";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Word: tenant başına dakikada 10 (V1 word-report ile aynı eşik). */
export const WORD_RATE = { limit: 10, windowMs: 60_000 };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error, ...extra }, { status, headers: NO_STORE });

async function jsonBody(req: NextRequest, max = 64 * 1024): Promise<Record<string, unknown> | null> {
  try {
    const t = await req.text();
    if (t.length > max) return null;
    const v = JSON.parse(t) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleLoad(db: SifaV2Db, scope: Scope, ownerKey: string): Promise<NextResponse> {
  const r = await loadWorkspace(db, scope, ownerKey);
  if (!r.ok) return fail(r.status, r.error, { code: r.code });
  return NextResponse.json({ ok: true, workspace: r.value }, { headers: NO_STORE });
}

export async function handleSave(db: SifaV2Db, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > CHANGESET_LIMITS.maxBodyBytes) return fail(413, "Kayıt isteği çok büyük. Hiçbir değişiklik yazılmadı.", { code: "SIFA_V2_TOO_LARGE" });
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > CHANGESET_LIMITS.maxBodyBytes) throw new Error("büyük");
    body = JSON.parse(text);
  } catch {
    return fail(400, "Geçersiz kayıt isteği. Hiçbir değişiklik yazılmadı.", { code: "SIFA_V2_BAD_JSON" });
  }
  const r = await saveChangeset(db, scope, body);
  if (!r.ok) return fail(r.status, r.error, { code: r.code, ...(r.conflicts ? { conflicts: r.conflicts } : {}) });
  return NextResponse.json({ ok: true, result: r.value }, { headers: NO_STORE });
}

/** Kurum kaydından kişisel kopya. */
export async function handleCopy(db: SifaV2Db, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const b = await jsonBody(req);
  const r = await copySharedToPersonal(db, scope, b?.rootId);
  if (!r.ok) return fail(r.status, r.error, { code: r.code });
  return NextResponse.json({ ok: true, ...r.value }, { headers: NO_STORE });
}

/** Görsel yükleme 1/2: sunucu yolu üretir + kısa ömürlü imzalı yükleme bağlantısı. */
export async function handleUploadPrepare(storage: SifaV2Storage, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const b = await jsonBody(req);
  const mime = String(b?.mimeType ?? "");
  const size = Number(b?.size ?? 0);
  const ext = IMAGE_MIME_EXT[mime];
  if (!ext) return fail(415, "Yalnız PNG, JPEG, WebP veya GIF görsel yüklenebilir.");
  if (!Number.isInteger(size) || size <= 0 || size > MAX_IMAGE_BYTES) return fail(413, "Görsel en fazla 10 MB olabilir.");
  const assetId = crypto.randomUUID();
  const path = `${scope.tenantId}/${scope.userId}/${assetId}.${ext}`;
  const s = await storage.signUpload(SIFA_BUCKET, path);
  if (!s) return fail(500, "Yükleme bağlantısı oluşturulamadı.");
  return NextResponse.json({ ok: true, assetId, path, token: s.token, signedUrl: s.signedUrl }, { headers: NO_STORE });
}

/** Görsel yükleme 2/2: nesne GERÇEKTEN var mı + baytları görsel mi → yalnız sonra DB'ye kayıt. */
export async function handleUploadFinalize(db: SifaV2Db, storage: SifaV2Storage, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const b = await jsonBody(req);
  const assetId = String(b?.assetId ?? "");
  const path = String(b?.path ?? "");
  if (!UUID.test(assetId) || !isOwnUploadPath(path, scope.tenantId, scope.userId) || !path.includes(`/${assetId}.`)) {
    return fail(403, "Bu yükleme size ait değil.");
  }
  const bytes = await storage.download(SIFA_BUCKET, path);
  if (!bytes) return fail(404, "Yüklenen dosya bulunamadı.");
  const mime = sniffImageMime(bytes);
  if (!mime || IMAGE_MIME_EXT[mime] !== path.split(".").pop()) {
    await storage.remove(SIFA_BUCKET, [path]);
    return fail(415, "Dosya içeriği geçerli bir görsel değil; yükleme silindi.");
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    await storage.remove(SIFA_BUCKET, [path]);
    return fail(413, "Görsel en fazla 10 MB olabilir; yükleme silindi.");
  }
  const caption = typeof b?.caption === "string" ? b.caption.slice(0, 500) : null;
  const r = await registerUpload(db, scope, { id: assetId, storage_path: path, mime_type: mime, byte_size: bytes.byteLength, caption });
  if (!r.ok) return fail(r.status, r.error, { code: r.code });
  return NextResponse.json({ ok: true, assetId, src: `sifa-asset:${assetId}` }, { headers: NO_STORE });
}

/** Görsel okuma: YALNIZ görebileceği görseller için kısa ömürlü imzalı bağlantı (diğerleri sessizce yok). */
export async function handleAssetUrls(db: SifaV2Db, storage: SifaV2Storage, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const b = await jsonBody(req);
  const ids = Array.isArray(b?.ids) ? (b.ids as unknown[]).map(String) : [];
  const v = await visibleAssets(db, scope, ids);
  if (!v.ok) return fail(v.status, v.error, { code: v.code });
  const urls: Record<string, string> = {};
  for (const a of v.value) {
    const u = await storage.signRead(a.bucket, a.storage_path, SIGNED_URL_TTL_SEC);
    if (u) urls[a.id] = u;
  }
  return NextResponse.json({ ok: true, urls, ttlSec: SIGNED_URL_TTL_SEC }, { headers: NO_STORE });
}

/** Word için kalıcı görselleri (yalnız görünür olanları) gömülebilir veriye çevirir. */
async function inlineAssets(db: SifaV2Db, storage: SifaV2Storage | null, scope: Scope, ws: Workspace): Promise<Workspace> {
  if (!storage) return ws;
  const ids = new Set<string>();
  for (const bl of ws.blocks) assetIdsIn(bl.contentJson, ids);
  if (!ids.size) return ws;
  const v = await visibleAssets(db, scope, [...ids]);
  if (!v.ok) return ws;
  const data = new Map<string, string>();
  for (const a of v.value) {
    const bytes = await storage.download(a.bucket, a.storage_path);
    const mime = bytes ? sniffImageMime(bytes) : null;
    if (bytes && (mime === "image/png" || mime === "image/jpeg")) data.set(a.id, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
  }
  const swap = (n: JSONContent): JSONContent => {
    if (n.type === "figure") {
      const m = ASSET_SRC_RE.exec(String(n.attrs?.src ?? ""));
      if (m && data.has(m[1])) return { ...n, attrs: { ...n.attrs, src: data.get(m[1]) } };
    }
    return n.content ? { ...n, content: n.content.map(swap) } : n;
  };
  return { ...ws, blocks: ws.blocks.map((bl) => (bl.contentJson ? { ...bl, contentJson: swap(bl.contentJson) } : bl)) };
}

/** Tek ana konunun Word raporu — YALNIZ çağıranın GÖREBİLDİĞİ (kişisel + kendi kurum) KAYDEDİLMİŞ veriden. */
export async function handleWord(db: SifaV2Db, scope: Scope, req: NextRequest, storage: SifaV2Storage | null = null): Promise<NextResponse> {
  const rl = checkRateLimit(`sifa-v2-word:${scope.tenantId}`, WORD_RATE.limit, WORD_RATE.windowMs);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Çok fazla rapor isteği. Lütfen biraz sonra tekrar deneyin." }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfterSeconds) } });
  }
  const b = await jsonBody(req);
  const rootId = String(b?.rootId ?? "");
  if (!UUID.test(rootId)) return fail(400, "Geçersiz konu.");
  const r = await loadWorkspace(db, scope, scope.userId);
  if (!r.ok) return fail(r.status, r.error, { code: r.code });
  const root = r.value.nodes.find((n) => n.id === rootId && n.parentId === null && !n.deletedAt);
  // Başka uzmanın/tenant'ın konusu: yüklenen çalışma alanında YOK → "bulunamadı" (varlığı sızdırılmaz).
  if (!root) return fail(404, "Konu bulunamadı.");
  const ws = await inlineAssets(db, storage, scope, r.value);
  const w = await buildTopicWord(ws, rootId);
  if (!w) return fail(404, "Konu bulunamadı.");
  return new NextResponse(new Uint8Array(w.buffer), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="sifa-rehberi.docx"; filename*=UTF-8''${encodeURIComponent(w.fileName)}`,
      "X-Sifa-Word-Report": encodeURIComponent(JSON.stringify(w.report)),
    },
  });
}
