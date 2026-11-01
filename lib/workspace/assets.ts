/**
 * KİŞİSEL DİJİTAL OFİS — görsel varlık servisi (YALNIZ SUNUCU; service-role db + private bucket).
 *
 * - Storage yolu istemciden ASLA alınmaz: <tenant>/<kullanıcı>/<assetId>/{desktop,mobile}.webp sunucuda üretilir ve
 *   expert_workspace_assets satırında kalıcı tutulur. İstemci yalnız assetId (uuid) görür.
 * - Her okuma / silme: tenant_id + user_id + deleted_at IS NULL ile sahiplik doğrulanır (başka uzman → 404).
 * - Yükleme sunucu rotası üzerinden parçalı (≤ 3 MB); parçalar DB'de geçici tutulur, tamamlanınca silinir.
 * - Silme yalnız açık kullanıcı eylemiyle (DELETE + confirm) ve görsel tasarımın uygulanan / taslak / geçmiş
 *   sürümlerinin HİÇBİRİNDE geçmiyorsa yapılır; satır silinmez, deleted_at işaretlenir.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ASSET_BUCKET, ASSET_KINDS, ASSET_MAX_BYTES, UPLOAD_CHUNK_BYTES, type AssetKind } from "./catalog";
import { checkDeclared, processImage, type ImageErrorCode } from "./imageProcess";
import type { WorkspaceDesign } from "./schema";
import { DESIGNS_TABLE, type Owner } from "./service";

assertServerOnly("lib/workspace/assets");

export const ASSETS_TABLE = "expert_workspace_assets";
export const UPLOADS_TABLE = "expert_workspace_uploads";
export const CHUNKS_TABLE = "expert_workspace_upload_chunks";

const ASSET_COLS = "id, kind, original_format, original_bytes, original_width, original_height, desktop_path, desktop_width, desktop_height, desktop_bytes, mobile_path, mobile_width, mobile_height, mobile_bytes, sha256, created_at";
type AssetRow = {
  id: string; kind: AssetKind; original_format: string; original_bytes: number; original_width: number; original_height: number;
  desktop_path: string; desktop_width: number; desktop_height: number; desktop_bytes: number;
  mobile_path: string; mobile_width: number; mobile_height: number; mobile_bytes: number; sha256: string; created_at: string;
};
export type AssetView = {
  id: string; kind: AssetKind; createdAt: string;
  original: { format: string; bytes: number; width: number; height: number };
  desktop: { width: number; height: number; bytes: number; url: string };
  mobile: { width: number; height: number; bytes: number; url: string };
};

const view = (r: AssetRow): AssetView => ({
  id: r.id,
  kind: r.kind,
  createdAt: r.created_at,
  original: { format: r.original_format, bytes: r.original_bytes, width: r.original_width, height: r.original_height },
  desktop: { width: r.desktop_width, height: r.desktop_height, bytes: r.desktop_bytes, url: `/api/settings/workspace/assets/${r.id}?v=desktop` },
  mobile: { width: r.mobile_width, height: r.mobile_height, bytes: r.mobile_bytes, url: `/api/settings/workspace/assets/${r.id}?v=mobile` },
});

export type Fail = { ok: false; status: number; code: string; error: string; cause?: unknown };
const f = (status: number, code: string, error: string, cause?: unknown): Fail => ({ ok: false, status, code, error, cause });
const pgMsg = (e: unknown) => String((e as { message?: string } | null)?.message ?? "");

/** Sunucunun ürettiği yollar (istemci girdisi içermez). */
export function assetPaths(o: Owner, assetId: string) {
  const base = `${o.tenantId}/${o.userId}/${assetId}`;
  return { desktop: `${base}/desktop.webp`, mobile: `${base}/mobile.webp` };
}

export async function listAssets(db: SupabaseClient, o: Owner): Promise<{ ok: true; assets: AssetView[] } | Fail> {
  const { data, error } = await db.from(ASSETS_TABLE).select(ASSET_COLS).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) return f(500, "db", "Görseller okunamadı.", error);
  return { ok: true, assets: ((data ?? []) as AssetRow[]).map(view) };
}

async function ownAsset(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true; row: AssetRow | null } | Fail> {
  const { data, error } = await db.from(ASSETS_TABLE).select(ASSET_COLS).eq("id", assetId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).maybeSingle();
  if (error) return f(500, "db", "Görsel okunamadı.", error);
  return { ok: true, row: (data as AssetRow | null) ?? null };
}

// ── Yükleme ──────────────────────────────────────────────────────────────────

/** Dosya adı yalnız görüntü/denetim içindir; yol olarak KULLANILMAZ. Dizin, kontrol karakteri ve yön işareti atılır. */
export function cleanFileName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const base = raw.split(/[\\/]/).pop()!.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, "").trim();
  return base.length >= 1 && base.length <= 200 ? base : null;
}

type UploadRow = { id: string; kind: AssetKind; declared_mime: string; file_name: string; declared_bytes: number; chunk_size: number; chunk_count: number; status: string; expires_at: string; asset_id: string | null };
const UPLOAD_COLS = "id, kind, declared_mime, file_name, declared_bytes, chunk_size, chunk_count, status, expires_at, asset_id";

async function ownUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true; row: UploadRow } | Fail> {
  const { data, error } = await db.from(UPLOADS_TABLE).select(UPLOAD_COLS).eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  if (error) return f(500, "db", "Yükleme okunamadı.", error);
  if (!data) return f(404, "not_found", "Yükleme bulunamadı.");
  return { ok: true, row: data as UploadRow };
}

async function dropChunks(db: SupabaseClient, o: Owner, uploadId: string) {
  await db.from(CHUNKS_TABLE).delete().eq("upload_id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId);
}

/** Süresi geçmiş AÇIK yüklemeler: iptal + geçici parçaları temizle (yalnız bu uzmanın; görsel değil, ara veri). */
async function sweepExpired(db: SupabaseClient, o: Owner) {
  const { data } = await db.from(UPLOADS_TABLE).select("id").eq("tenant_id", o.tenantId).eq("user_id", o.userId).eq("status", "open").lt("expires_at", new Date().toISOString()).limit(20);
  for (const r of (data ?? []) as { id: string }[]) {
    await db.from(UPLOADS_TABLE).update({ status: "aborted" }).eq("id", r.id).eq("status", "open");
    await dropChunks(db, o, r.id);
  }
}

export type StartInput = { kind?: unknown; fileName?: unknown; mimeType?: unknown; size?: unknown };
export async function startUpload(db: SupabaseClient, o: Owner, input: StartInput): Promise<{ ok: true; uploadId: string; chunkSize: number; chunkCount: number; expiresAt: string } | Fail> {
  if (!ASSET_KINDS.includes(input.kind as AssetKind)) return f(400, "invalid_kind", "Görsel türü logo veya photo olmalı.");
  const kind = input.kind as AssetKind;
  const fileName = cleanFileName(input.fileName);
  if (!fileName) return f(400, "invalid_name", "Dosya adı geçersiz.");
  if (typeof input.mimeType !== "string") return f(400, "invalid_type", "Dosya türü eksik.");
  const size = input.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) return f(400, "invalid_size", "Dosya boyutu geçersiz.");
  if (size > ASSET_MAX_BYTES[kind]) return f(413, "too_large", kind === "logo" ? "Logo en fazla 2 MB olabilir." : "Fotoğraf en fazla 10 MB olabilir.");
  const declared = checkDeclared({ fileName, mime: input.mimeType });
  if (!declared.ok) return f(declared.code === "type_mismatch" ? 400 : 415, declared.code, declared.error);
  await sweepExpired(db, o);
  const chunkCount = Math.ceil(size / UPLOAD_CHUNK_BYTES);
  const { data, error } = await db
    .from(UPLOADS_TABLE)
    .insert({ tenant_id: o.tenantId, user_id: o.userId, kind, declared_mime: input.mimeType.toLowerCase(), file_name: fileName, declared_bytes: size, chunk_size: UPLOAD_CHUNK_BYTES, chunk_count: chunkCount })
    .select("id, expires_at")
    .single();
  if (error) {
    if (pgMsg(error).includes("EXPERT_WORKSPACE_UPLOAD_CAP")) return f(429, "upload_cap", "Aynı anda en fazla 5 yükleme açık olabilir. Biraz bekleyip yeniden deneyin.");
    return f(500, "db", "Yükleme başlatılamadı.", error);
  }
  const row = data as { id: string; expires_at: string };
  return { ok: true, uploadId: row.id, chunkSize: UPLOAD_CHUNK_BYTES, chunkCount, expiresAt: row.expires_at };
}

const isOpen = (u: UploadRow) => u.status === "open" && new Date(u.expires_at).getTime() > Date.now();

export async function putChunk(db: SupabaseClient, o: Owner, uploadId: string, index: number, bytes: Uint8Array): Promise<{ ok: true; received: number } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  if (!isOpen(u.row)) return f(410, "upload_closed", "Yükleme süresi doldu veya kapandı. Yeniden başlatın.");
  if (!Number.isInteger(index) || index < 0 || index >= u.row.chunk_count) return f(400, "invalid_index", "Parça numarası geçersiz.");
  const expected = index < u.row.chunk_count - 1 ? u.row.chunk_size : u.row.declared_bytes - u.row.chunk_size * (u.row.chunk_count - 1);
  if (bytes.length !== expected) return f(400, "chunk_size", "Parça boyutu beyan edilen dosya boyutuyla uyuşmuyor.");
  const dup = await db.from(CHUNKS_TABLE).select("idx", { count: "exact", head: true }).eq("upload_id", uploadId).eq("idx", index).eq("tenant_id", o.tenantId).eq("user_id", o.userId);
  if (dup.error) return f(500, "db", "Parça okunamadı.", dup.error);
  if ((dup.count ?? 0) > 0) return f(409, "chunk_exists", "Bu parça zaten yüklendi.");
  const ins = await db.from(CHUNKS_TABLE).insert({ upload_id: uploadId, idx: index, tenant_id: o.tenantId, user_id: o.userId, data: `\\x${Buffer.from(bytes).toString("hex")}` });
  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") return f(409, "chunk_exists", "Bu parça zaten yüklendi.");
    return f(500, "db", "Parça kaydedilemedi.", ins.error);
  }
  const { count } = await db.from(CHUNKS_TABLE).select("idx", { count: "exact", head: true }).eq("upload_id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId);
  return { ok: true, received: count ?? 0 };
}

function decodeBytea(v: unknown): Buffer {
  if (typeof v === "string" && v.startsWith("\\x")) return Buffer.from(v.slice(2), "hex");
  if (typeof v === "string") return Buffer.from(v, "base64");
  // Yerel PostgREST şimi (test) bytea'yı Node Buffer JSON'u olarak döndürür.
  if (v && typeof v === "object" && Array.isArray((v as { data?: unknown }).data)) return Buffer.from((v as { data: number[] }).data);
  return Buffer.alloc(0);
}

async function abort(db: SupabaseClient, o: Owner, uploadId: string) {
  await db.from(UPLOADS_TABLE).update({ status: "aborted" }).eq("id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).eq("status", "open");
  await dropChunks(db, o, uploadId);
}

export async function abortUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  if (u.row.status !== "open") return f(409, "upload_closed", "Yükleme zaten kapalı.");
  await abort(db, o, uploadId);
  return { ok: true };
}

const IMAGE_STATUS: Record<ImageErrorCode, number> = {
  unsupported_type: 415, heic_unsupported: 415, type_mismatch: 400, corrupt: 400, trailing_data: 400, animated: 400,
  too_large_pixels: 400, too_small: 400, process_failed: 422,
};

export async function completeUpload(db: SupabaseClient, o: Owner, uploadId: string): Promise<{ ok: true; asset: AssetView } | Fail> {
  const u = await ownUpload(db, o, uploadId);
  if (!u.ok) return u;
  const up = u.row;
  if (!isOpen(up)) return f(410, "upload_closed", "Yükleme süresi doldu veya kapandı. Yeniden başlatın.");
  const { data: chunks, error } = await db.from(CHUNKS_TABLE).select("idx, data").eq("upload_id", uploadId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).order("idx", { ascending: true });
  if (error) return f(500, "db", "Parçalar okunamadı.", error);
  const list = (chunks ?? []) as { idx: number; data: unknown }[];
  if (list.length !== up.chunk_count || list.some((c, i) => c.idx !== i)) return f(409, "incomplete", "Tüm parçalar yüklenmedi.");
  const bytes = Buffer.concat(list.map((c) => decodeBytea(c.data)));
  if (bytes.length !== up.declared_bytes) {
    await abort(db, o, uploadId);
    return f(400, "size_mismatch", "Yüklenen veri beyan edilen boyutla uyuşmuyor.");
  }
  const declared = checkDeclared({ fileName: up.file_name, mime: up.declared_mime });
  if (!declared.ok) {
    await abort(db, o, uploadId);
    return f(IMAGE_STATUS[declared.code], declared.code, declared.error);
  }
  const img = await processImage(bytes, up.kind, declared.format);
  if (!img.ok) {
    await abort(db, o, uploadId);
    return f(IMAGE_STATUS[img.code], img.code, img.error);
  }
  const assetId = randomUUID();
  const paths = assetPaths(o, assetId);
  const bucket = db.storage.from(ASSET_BUCKET);
  const uploaded: string[] = [];
  for (const [path, v] of [[paths.desktop, img.desktop], [paths.mobile, img.mobile]] as const) {
    const r = await bucket.upload(path, v.data, { contentType: "image/webp", upsert: false });
    if (r.error) {
      if (uploaded.length) await bucket.remove(uploaded);
      return f(502, "storage", "Görsel kaydedilemedi. Lütfen yeniden deneyin.", r.error);
    }
    uploaded.push(path);
  }
  const ins = await db
    .from(ASSETS_TABLE)
    .insert({
      id: assetId, tenant_id: o.tenantId, user_id: o.userId, kind: up.kind, original_format: img.format, original_bytes: bytes.length,
      original_width: img.originalWidth, original_height: img.originalHeight,
      desktop_path: paths.desktop, desktop_width: img.desktop.width, desktop_height: img.desktop.height, desktop_bytes: img.desktop.bytes,
      mobile_path: paths.mobile, mobile_width: img.mobile.width, mobile_height: img.mobile.height, mobile_bytes: img.mobile.bytes,
      sha256: img.sha256,
    })
    .select(ASSET_COLS)
    .single();
  if (ins.error) {
    await bucket.remove(uploaded); // kayıt yoksa dosya da kalmaz (yetim önlenir)
    if (pgMsg(ins.error).includes("EXPERT_WORKSPACE_ASSET_CAP")) return f(409, "asset_cap", "En fazla 60 görsel saklanabilir. Kullanılmayan bir görseli silip yeniden deneyin.");
    return f(500, "db", "Görsel kaydedilemedi.", ins.error);
  }
  await db.from(UPLOADS_TABLE).update({ status: "completed", asset_id: assetId }).eq("id", uploadId).eq("status", "open");
  await dropChunks(db, o, uploadId);
  return { ok: true, asset: view(ins.data as AssetRow) };
}

// ── Okuma ────────────────────────────────────────────────────────────────────

export async function readAssetVariant(db: SupabaseClient, o: Owner, assetId: string, variant: "desktop" | "mobile"): Promise<{ ok: true; bytes: Buffer; sha256: string } | Fail> {
  const a = await ownAsset(db, o, assetId);
  if (!a.ok) return a;
  if (!a.row) return f(404, "not_found", "Görsel bulunamadı.");
  const { data, error } = await db.storage.from(ASSET_BUCKET).download(variant === "desktop" ? a.row.desktop_path : a.row.mobile_path);
  if (error || !data) return f(502, "storage", "Görsel okunamadı.", error);
  return { ok: true, bytes: Buffer.from(await data.arrayBuffer()), sha256: a.row.sha256 };
}

// ── Referans kontrolü + silme ───────────────────────────────────────────────

/** Görselin uzmanın tasarım satırında (uygulanan / taslak / geçmiş) geçtiği yerler. Ham JSON taranır → şemaya uymayan eski kayıt da korunur. */
export async function assetReferences(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true; where: string[] } | Fail> {
  const { data, error } = await db.from(DESIGNS_TABLE).select("applied, draft, history").eq("tenant_id", o.tenantId).eq("user_id", o.userId).maybeSingle();
  if (error) return f(500, "db", "Tasarım okunamadı.", error);
  if (!data) return { ok: true, where: [] };
  const row = data as { applied: unknown; draft: unknown; history: unknown };
  const has = (v: unknown) => v !== null && v !== undefined && JSON.stringify(v).includes(assetId);
  const where: string[] = [];
  if (has(row.applied)) where.push("uygulanan tasarım");
  if (has(row.draft)) where.push("taslak");
  if (Array.isArray(row.history)) row.history.forEach((h, i) => { if (has(h)) where.push(`geçmiş tasarım ${i + 1}`); });
  else if (has(row.history)) where.push("geçmiş");
  return { ok: true, where };
}

export async function deleteAsset(db: SupabaseClient, o: Owner, assetId: string): Promise<{ ok: true } | Fail> {
  const a = await ownAsset(db, o, assetId);
  if (!a.ok) return a;
  if (!a.row) return f(404, "not_found", "Görsel bulunamadı.");
  const refs = await assetReferences(db, o, assetId);
  if (!refs.ok) return refs;
  if (refs.where.length) return { ...f(409, "asset_in_use", `Bu görsel kullanılıyor (${refs.where.join(", ")}); önce tasarımdan kaldırın.`), where: refs.where } as Fail & { where: string[] };
  const rm = await db.storage.from(ASSET_BUCKET).remove([a.row.desktop_path, a.row.mobile_path]);
  if (rm.error) return f(502, "storage", "Görsel dosyası silinemedi; kayıt korundu. Yeniden deneyin.", rm.error);
  const upd = await db.from(ASSETS_TABLE).update({ deleted_at: new Date().toISOString(), deleted_by: o.userId }).eq("id", assetId).eq("tenant_id", o.tenantId).eq("user_id", o.userId).is("deleted_at", null).select("id");
  if (upd.error) return f(500, "db", "Görsel kaydı güncellenemedi.", upd.error);
  return { ok: true };
}

/** Tasarımdaki görsel kimlikleri bu uzmana ait, silinmemiş ve doğru türde olmalı (logo ↔ logo, arka plan ↔ photo). */
export async function verifyDesignAssets(db: SupabaseClient, o: Owner, d: WorkspaceDesign): Promise<{ ok: true } | Fail> {
  const need: { id: string; kind: AssetKind; path: string }[] = [];
  if (d.logo.assetId) need.push({ id: d.logo.assetId, kind: "logo", path: "design.logo.assetId" });
  if (d.bg.photoAssetId) need.push({ id: d.bg.photoAssetId, kind: "photo", path: "design.bg.photoAssetId" });
  for (const n of need) {
    const a = await ownAsset(db, o, n.id);
    if (!a.ok) return a;
    if (!a.row) return f(400, "asset_not_found", `Görsel bulunamadı veya size ait değil (${n.path}).`);
    if (a.row.kind !== n.kind) return f(400, "asset_kind", `Görsel türü uygun değil (${n.path}).`);
  }
  return { ok: true };
}
