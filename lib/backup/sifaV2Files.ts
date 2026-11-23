/**
 * lib/backup/sifaV2Files.ts — Şifa Rehberi V2 görsel dosyalarının yedek / geri yükleme hattı (SUNUCU).
 *
 * 12. aşama (Owner zorunluluğu): V2 tablo satırları (registry: sifa_block_assets.storage_path) yalnız YOLU taşır;
 * özel bucket 'sifa-arastirma'daki GERÇEK dosya içerikleri bu modülle yedeğe girer. Mimari hdFiles.ts ile AYNI
 * (parçalı base64 + SHA-256; geri yüklemede geçici parça → birleştir → doğrula → upsert:false); HD hattına dokunmaz.
 *
 * Kapsam ve izolasyon (registry ownerScope ile aynı kural):
 *   - Yalnız OTURUMDAKİ uzmanın KİŞİSEL yüklemeleri: sifa_block_assets (tenant = oturum, owner_key = oturum
 *     kullanıcısı, origin = 'upload', bucket = 'sifa-arastirma'). Çöpteki kutuların görselleri de dahildir
 *     (kalıcı silinmemiş kayıt yedeklenir). Başka uzmanın / tenant'ın dosyası listelenmez ve okunamaz.
 *   - Yol biçimi sunucuda zorlanır: '<tenant>/<uzman>/<uuid>.<png|jpg|webp|gif>' (V2 yükleme yolu ile aynı).
 *   - Geri yükleme: yalnız bu uzmanın DB'de (az önce geri yüklenmiş ya da zaten var olan) bir görsel satırının
 *     referans verdiği yol; mevcut dosyanın ÜZERİNE YAZILMAZ; boyut + SHA-256 + görsel imzası doğrulanmadan nihai
 *     dosya oluşmaz; hata → geçici parçalar silinir, mevcut veri etkilenmez.
 *   - V2 kurulmamış ortam (tablo yok: PGRST205/42P01) → boş liste (mevcut yedek bozulmaz).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideTable, type RestoreContext } from "./engine";
import { sniffImageMime } from "@/lib/sifa-rehberi-v2/server/storage";

export const SIFA_V2_FILES_BUCKET = "sifa-arastirma";
/** hdFiles ile aynı parça boyutu (3'ün katı; Vercel yanıt sınırının altında). */
export const SIFA_V2_FILE_PART_BYTES = 3 * 349_525;
export const SIFA_V2_FILE_PART_CHARS = (SIFA_V2_FILE_PART_BYTES / 3) * 4;
/** Bucket sınırı (V2 migration: file_size_limit 10 MB). */
export const SIFA_V2_FILE_MAX_BYTES = 10 * 1024 * 1024;
const RESTORE_TMP_DIR = ".restore-tmp";
const MIME_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MISSING_RELATION = new Set(["PGRST205", "42P01"]);

export type SifaV2BackupFileRef = { bucket: string; path: string; content_type: string };

/** Bu uzmanın V2 yükleme yolu mu? (tam biçim; traversal / alt klasör / beklenmeyen uzantı yok) */
export function isOwnSifaV2FilePath(path: unknown, tenantId: string, userId: string): path is string {
  if (typeof path !== "string") return false;
  return new RegExp(`^${tenantId}/${userId}/${UUID}\\.(png|jpg|webp|gif)$`, "i").test(path) && tenantId !== userId;
}

function extOf(path: string): string {
  return path.slice(path.lastIndexOf(".") + 1).toLowerCase();
}

/** Uzmanın DB satırlarının referans verdiği V2 görsel dosyaları (kişisel yüklemeler; çöptekiler dahil). */
export async function listSifaV2BackupFiles(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ files: SifaV2BackupFileRef[]; error: string | null }> {
  if (!tenantId || !userId || tenantId === userId) return { files: [], error: null };
  const { data, error } = await db
    .from("sifa_block_assets")
    .select("storage_path")
    .eq("tenant_id", tenantId)
    .eq("owner_key", userId)
    .eq("origin", "upload")
    .eq("bucket", SIFA_V2_FILES_BUCKET);
  if (error) {
    if (MISSING_RELATION.has(String((error as { code?: string }).code ?? ""))) return { files: [], error: null };
    return { files: [], error: error.message };
  }
  const paths = new Set<string>();
  for (const r of (data ?? []) as { storage_path: string | null }[]) {
    if (isOwnSifaV2FilePath(r.storage_path, tenantId, userId)) paths.add(r.storage_path);
  }
  return {
    files: [...paths].sort().map((path) => ({ bucket: SIFA_V2_FILES_BUCKET, path, content_type: MIME_BY_EXT[extOf(path)] ?? "application/octet-stream" })),
    error: null,
  };
}

export type SifaV2FilePart = { ok: true; path: string; part: number; parts: number; size: number; sha256: string; content_type: string; data_base64: string };

/** Dosyanın `part`. dilimi (base64) + bütün dosyanın boyut / SHA-256'sı. Yalnız uzmanın referanslı dosyası. */
export async function readSifaV2BackupFilePart(
  db: SupabaseClient,
  tenantId: string,
  userId: string,
  path: string,
  part: number,
): Promise<SifaV2FilePart | { ok: false; status: number; error: string }> {
  if (!isOwnSifaV2FilePath(path, tenantId, userId)) return { ok: false, status: 400, error: "Geçersiz dosya yolu." };
  const list = await listSifaV2BackupFiles(db, tenantId, userId);
  if (list.error) return { ok: false, status: 500, error: "Dosya listesi okunamadı." };
  if (!list.files.some((f) => f.path === path)) return { ok: false, status: 404, error: "Dosya bulunamadı." };
  const { data, error } = await db.storage.from(SIFA_V2_FILES_BUCKET).download(path);
  if (error || !data) return { ok: false, status: 404, error: "Dosya depolamada bulunamadı." };
  const buf = Buffer.from(await data.arrayBuffer());
  const parts = Math.max(1, Math.ceil(buf.length / SIFA_V2_FILE_PART_BYTES));
  if (!Number.isInteger(part) || part < 0 || part >= parts) return { ok: false, status: 400, error: "Geçersiz parça." };
  return {
    ok: true,
    path,
    part,
    parts,
    size: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    content_type: MIME_BY_EXT[extOf(path)] ?? "application/octet-stream",
    data_base64: buf.subarray(part * SIFA_V2_FILE_PART_BYTES, (part + 1) * SIFA_V2_FILE_PART_BYTES).toString("base64"),
  };
}

// ─── Geri yükleme ────────────────────────────────────────────────────────────

export type SifaV2FilePlanInput = { bucket?: unknown; path?: unknown; size?: unknown; sha256?: unknown };
export type SifaV2FilePlanDecision = {
  path: string;
  action: "upload" | "exists" | "skip";
  reason?: "unlicensed" | "invalid_path" | "foreign_tenant" | "too_large" | "invalid_meta" | "unreferenced";
};

const licensed = (ctx: RestoreContext) => decideTable("sifa_block_assets", ctx).action === "restore";

async function objectExists(db: SupabaseClient, path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await db.storage.from(SIFA_V2_FILES_BUCKET).list(dir, { search: name, limit: 100 });
  return (data ?? []).some((o) => o.name === name);
}

async function referencedRestorePaths(db: SupabaseClient, ctx: RestoreContext): Promise<Set<string> | null> {
  const list = await listSifaV2BackupFiles(db, ctx.tenantId, ctx.userId);
  if (list.error) return null;
  return new Set(list.files.map((f) => f.path));
}

export async function planSifaV2FileRestore(db: SupabaseClient, ctx: RestoreContext, files: SifaV2FilePlanInput[]): Promise<SifaV2FilePlanDecision[]> {
  const ok = licensed(ctx);
  const referenced = ok ? await referencedRestorePaths(db, ctx) : new Set<string>();
  const out: SifaV2FilePlanDecision[] = [];
  for (const f of files.slice(0, 500)) {
    const path = typeof f.path === "string" ? f.path : "";
    if (!ok) { out.push({ path, action: "skip", reason: "unlicensed" }); continue; }
    if (f.bucket !== SIFA_V2_FILES_BUCKET || !path) { out.push({ path, action: "skip", reason: "invalid_path" }); continue; }
    if (!path.startsWith(`${ctx.tenantId}/`)) { out.push({ path, action: "skip", reason: "foreign_tenant" }); continue; }
    if (!isOwnSifaV2FilePath(path, ctx.tenantId, ctx.userId)) { out.push({ path, action: "skip", reason: "invalid_path" }); continue; }
    if (!referenced || !referenced.has(path)) { out.push({ path, action: "skip", reason: "unreferenced" }); continue; }
    if (typeof f.size !== "number" || f.size <= 0 || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) {
      out.push({ path, action: "skip", reason: "invalid_meta" });
      continue;
    }
    if (f.size > SIFA_V2_FILE_MAX_BYTES) { out.push({ path, action: "skip", reason: "too_large" }); continue; }
    out.push({ path, action: (await objectExists(db, path)) ? "exists" : "upload" });
  }
  return out;
}

const UPLOAD_ID_RE = /^[0-9a-f-]{36}$/i;
const MAX_PARTS = Math.ceil(SIFA_V2_FILE_MAX_BYTES / SIFA_V2_FILE_PART_BYTES); // 10

/** Geçici parça yolu: uzmanın kendi önekinin DIŞINDA (V2 yükleme yolu biçimine uymaz → kayıtla karışmaz). */
function tmpPartPath(ctx: RestoreContext, uploadId: string, index: number): string {
  return `${ctx.tenantId}/${RESTORE_TMP_DIR}/${ctx.userId}/${uploadId}/${index}.part`;
}

async function guardPath(db: SupabaseClient, ctx: RestoreContext, path: unknown): Promise<{ ok: true; path: string } | { ok: false; status: number; error: string }> {
  if (!licensed(ctx)) return { ok: false, status: 403, error: "Modül lisansı yok." };
  if (!isOwnSifaV2FilePath(path, ctx.tenantId, ctx.userId)) return { ok: false, status: 400, error: "Geçersiz dosya yolu." };
  const referenced = await referencedRestorePaths(db, ctx);
  if (!referenced) return { ok: false, status: 500, error: "Dosya listesi okunamadı." };
  if (!referenced.has(path)) return { ok: false, status: 400, error: "Bu dosya geri yüklenen kayıtlarda yer almıyor." };
  return { ok: true, path };
}

export async function storeSifaV2RestorePart(
  db: SupabaseClient,
  ctx: RestoreContext,
  body: { path?: unknown; upload_id?: unknown; index?: unknown; data_base64?: unknown },
): Promise<{ ok: boolean; status: number; error?: string }> {
  const g = await guardPath(db, ctx, body.path);
  if (!g.ok) return g;
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  const index = typeof body.index === "number" ? body.index : -1;
  const data = typeof body.data_base64 === "string" ? body.data_base64 : "";
  if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(index) || index < 0 || index >= MAX_PARTS) return { ok: false, status: 400, error: "Geçersiz parça bilgisi." };
  if (!data || data.length > SIFA_V2_FILE_PART_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return { ok: false, status: 400, error: "Geçersiz parça verisi." };
  const { error } = await db.storage
    .from(SIFA_V2_FILES_BUCKET)
    .upload(tmpPartPath(ctx, uploadId, index), Buffer.from(data, "base64"), { contentType: MIME_BY_EXT[extOf(g.path)], upsert: true });
  if (error) return { ok: false, status: 500, error: "Parça yazılamadı." };
  return { ok: true, status: 200 };
}

export async function commitSifaV2RestoreFile(
  db: SupabaseClient,
  ctx: RestoreContext,
  body: { path?: unknown; upload_id?: unknown; parts?: unknown; size?: unknown; sha256?: unknown },
): Promise<{ ok: boolean; status: number; result?: "restored" | "exists"; error?: string }> {
  const g = await guardPath(db, ctx, body.path);
  if (!g.ok) return g;
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  const parts = typeof body.parts === "number" ? body.parts : 0;
  if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return { ok: false, status: 400, error: "Geçersiz parça bilgisi." };
  const tmpPaths = Array.from({ length: parts }, (_, i) => tmpPartPath(ctx, uploadId, i));
  const cleanup = async () => {
    await db.storage.from(SIFA_V2_FILES_BUCKET).remove(tmpPaths).catch(() => undefined);
  };
  const bufs: Buffer[] = [];
  for (const p of tmpPaths) {
    const { data, error } = await db.storage.from(SIFA_V2_FILES_BUCKET).download(p);
    if (error || !data) {
      await cleanup();
      return { ok: false, status: 400, error: "Eksik parça." };
    }
    bufs.push(Buffer.from(await data.arrayBuffer()));
  }
  const all = Buffer.concat(bufs);
  const sha = createHash("sha256").update(all).digest("hex");
  // Bütünlük + gerçek görsel imzası (uzantıya güvenilmez; V2 yükleme doğrulamasıyla aynı kural).
  if (all.length !== body.size || sha !== body.sha256 || sniffImageMime(new Uint8Array(all)) !== MIME_BY_EXT[extOf(g.path)]) {
    await cleanup();
    return { ok: false, status: 422, error: "Dosya bütünlük doğrulaması başarısız (boyut/SHA-256/görsel türü)." };
  }
  const { error } = await db.storage.from(SIFA_V2_FILES_BUCKET).upload(g.path, all, { contentType: MIME_BY_EXT[extOf(g.path)], upsert: false });
  await cleanup();
  if (error) {
    if (/exist|duplicate/i.test(error.message)) return { ok: true, status: 200, result: "exists" };
    return { ok: false, status: 500, error: "Dosya yazılamadı." };
  }
  return { ok: true, status: 200, result: "restored" };
}
