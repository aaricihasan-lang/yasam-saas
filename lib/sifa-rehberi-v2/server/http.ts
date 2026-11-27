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
import { assetIdsIn } from "@/lib/sifa-rehberi-v2/contentSafety";
import {
  loadWorkspace, registerUpload, saveChangeset, visibleAssets, type Scope, type SifaV2Db,
} from "@/lib/sifa-rehberi-v2/server/service";
import {
  IMAGE_MIME_EXT, isOwnUploadPath, MAX_IMAGE_BYTES, SIFA_BUCKET, SIGNED_URL_TTL_SEC, sniffImageMime, type SifaV2Storage,
} from "@/lib/sifa-rehberi-v2/server/storage";
import { buildF3Word } from "@/lib/sifa-rehberi-f3/word";
import { checkContentBudget, incomingBlocks, needsStoredContent } from "@/lib/sifa-rehberi-v2/server/contentGuard";
import type { Workspace } from "@/lib/sifa-rehberi-v2/types";

const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Word: tenant başına dakikada 10 (V1 word-report ile aynı eşik). */
export const WORD_RATE = { limit: 10, windowMs: 60_000 };
/** F3: Kaydet — uzman başına dakikada 60 (insan kullanımında aşılmaz; otomatik kötüye kullanımı keser). */
export const SAVE_RATE = { limit: 60, windowMs: 60_000 };
/** F3: görsel yükleme hazırlığı — uzman başına 10 dakikada 120. */
export const UPLOAD_RATE = { limit: 120, windowMs: 600_000 };

const rateLimited = (retryAfterSeconds: number, error: string) =>
  NextResponse.json({ ok: false, error, code: "SIFA_V2_RATE" }, { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfterSeconds) } });

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

export async function handleSave(db: SifaV2Db, scope: Scope, req: NextRequest, storage: SifaV2Storage | null = null): Promise<NextResponse> {
  const rl = checkRateLimit(`sifa-v2-save:${scope.userId}`, SAVE_RATE.limit, SAVE_RATE.windowMs);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds, "Çok sık kayıt isteği. Lütfen biraz sonra tekrar deneyin; değişiklikleriniz ekranda duruyor.");
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
  // İçerik bütçesi: yeni base64/harici görsel yok; eski kayıttaki aynı görsel korunur (bkz. contentGuard.ts).
  const incoming = incomingBlocks(body);
  let stored = new Map<string, unknown>();
  if (needsStoredContent(incoming)) {
    const cur = await loadWorkspace(db, scope, scope.userId);
    if (!cur.ok) return fail(cur.status, cur.error, { code: cur.code });
    stored = new Map(cur.value.blocks.filter((b) => b.scope !== "kurum").map((b) => [b.id, b.contentJson]));
  }
  const issue = checkContentBudget(incoming, stored);
  if (issue) return fail(issue.status, issue.error, { code: issue.code });
  const r = await saveChangeset(db, scope, body);
  if (!r.ok) return fail(r.status, r.error, { code: r.code, ...(r.conflicts ? { conflicts: r.conflicts } : {}) });
  // Kayıt KESİNLEŞTİKTEN sonra: kalıcı silinen kutuların / kaldırılan görsellerin nesneleri Storage'dan silinir.
  // Yalnız kendi kovası + kendi yolu; silinemeyen nesne satırsız kalır → yaşam döngüsü temizliği toplar.
  const paths = r.value.removedAssets
    .filter((a) => a.bucket === SIFA_BUCKET && isOwnUploadPath(a.storage_path, scope.tenantId, scope.userId))
    .map((a) => a.storage_path);
  if (storage && paths.length) {
    try {
      await storage.remove(SIFA_BUCKET, paths);
    } catch {
      /* satırsız nesne — yaşam döngüsü temizliği (sifa_v2_gc_candidates) sonra siler */
    }
  }
  return NextResponse.json({ ok: true, result: { topics: r.value.topics, blocks: r.value.blocks } }, { headers: NO_STORE });
}

/** Görsel yükleme 1/2: sunucu yolu üretir + kısa ömürlü imzalı yükleme bağlantısı. */
// Owner kararı (F3-R1, 27.11.2026): kullanıcı başına toplam depolama / görsel sayısı KOTASI YOK. Yalnız güvenlik amaçlı
// teknik sınırlar: dosya türü + bayt imzası, dosya başına 10 MB, istemcide sıkıştırma, hız sınırı (UPLOAD_RATE).
export async function handleUploadPrepare(storage: SifaV2Storage, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const rl = checkRateLimit(`sifa-v2-upload:${scope.userId}`, UPLOAD_RATE.limit, UPLOAD_RATE.windowMs);
  if (!rl.allowed) return rateLimited(rl.retryAfterSeconds, "Çok fazla görsel yükleme isteği. Lütfen biraz sonra tekrar deneyin.");
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

/**
 * Yarım kalan yükleme: finalize EDİLMEMİŞ (DB kaydı olmayan) KENDİ nesnesini siler. Yol yalnız
 * '<tenant>/<uzman>/<assetId>.<uzantı>' biçiminde ve çağıranın kapsamında kabul edilir. Kayıtlı görsel
 * (içerikte kullanılıyor olabilir) SİLİNMEZ → 409. Yeni yıkıcı davranış yok: yalnız sahipsiz yükleme.
 */
export async function handleUploadDiscard(db: SifaV2Db, storage: SifaV2Storage, scope: Scope, req: NextRequest): Promise<NextResponse> {
  const b = await jsonBody(req);
  const assetId = String(b?.assetId ?? "");
  const path = String(b?.path ?? "");
  if (!UUID.test(assetId) || !isOwnUploadPath(path, scope.tenantId, scope.userId) || !path.includes(`/${assetId}.`)) {
    return fail(403, "Bu yükleme size ait değil.");
  }
  const v = await visibleAssets(db, scope, [assetId]);
  if (!v.ok) return fail(v.status, v.error, { code: v.code });
  if (v.value.length) return fail(409, "Kayıtlı görsel bu yolla silinemez.");
  await storage.remove(SIFA_BUCKET, [path]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
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

/** Word için konunun kayıtlı görsellerini (yalnız çağıranın görebildiklerini) gömülebilir veriye çevirir. */
async function assetData(db: SifaV2Db, storage: SifaV2Storage | null, scope: Scope, ws: Workspace, rootId: string): Promise<Map<string, string>> {
  const data = new Map<string, string>();
  if (!storage) return data;
  const byId = new Map(ws.nodes.map((n) => [n.id, n]));
  const inRoot = (nodeId: string) => {
    let cur = byId.get(nodeId);
    for (let i = 0; cur?.parentId && i < 40; i++) cur = byId.get(cur.parentId);
    return cur?.id === rootId;
  };
  const ids = new Set<string>();
  for (const bl of ws.blocks) {
    if (bl.deletedAt || !inRoot(bl.nodeId)) continue;
    for (const a of bl.assets ?? []) ids.add(a.id);
    assetIdsIn(bl.contentJson as JSONContent | null, ids);
  }
  if (!ids.size) return data;
  const v = await visibleAssets(db, scope, [...ids]);
  if (!v.ok) return data;
  for (const a of v.value) {
    const bytes = await storage.download(a.bucket, a.storage_path);
    const mime = bytes ? sniffImageMime(bytes) : null;
    if (bytes && (mime === "image/png" || mime === "image/jpeg")) data.set(a.id, `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`);
  }
  return data;
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
  const w = await buildF3Word(r.value, rootId, await assetData(db, storage, scope, r.value, rootId));
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
