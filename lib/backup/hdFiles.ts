/**
 * lib/backup/hdFiles.ts — Human Design depolama dosyalarının yedek / geri yükleme hattı (SUNUCU).
 *
 * P2-11: Yedek (lib/backup) yalnız DB satırlarını alıyordu; HD harita görselleri ve profesyonel
 * rapor görsel snapshot'ları (bucket `hd-chart-images`, private) yedekte YOKTU → geri yüklemede
 * "DB kaydı var ama dosya yok" durumu oluşuyordu. Bu modül mevcut yedek yapısını bozmadan
 * (tablo registry'sine dokunmadan) dosyaları ayrı bir `files` bölümü olarak taşır:
 *
 *   Dışa aktarım: `listHdBackupFiles` → tenant'a ait referanslı yollar; `readHdBackupFilePart`
 *   → nesneyi okuyup ≤ HD_FILE_PART_BYTES'lık (3'ün katı → base64 parçaları birleştirilebilir)
 *   dilimi + toplam boyut + SHA-256 döndürür (Vercel 4.5 MB yanıt sınırına takılmaz).
 *
 *   Geri yükleme: `planHdFileRestore` → yol/tenant/lisans doğrulaması + mevcut mu?;
 *   `storeHdRestorePart` → parçayı tenant önekli geçici yola yazar; `commitHdRestoreFile` →
 *   parçaları birleştirir, boyut + SHA-256 doğrular, nihai yola `upsert:false` yazar, geçici
 *   parçaları siler. Mevcut dosyanın ÜZERİNE YAZILMAZ (insert-only, DB restore ile aynı ilke).
 *
 * Güvenlik: tüm yollar `{tenantId}/` önekli + traversal'sız olmalı; başka tenant yolu reddedilir
 * (çapraz-tenant geri yükleme DB tarafında da foreign_storage_path ile reddedilir). Lisans:
 * human_design modülü geri yükleme kararı (decideTable) "restore" değilse dosyalar atlanır.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideTable, type RestoreContext } from "./engine";
import { isSafeStoragePath, HD_REPORT_SNAPSHOT_DIR } from "@/lib/human-design/api/chartImagePath";

export const HD_FILES_BUCKET = "hd-chart-images";
/** 3'ün katı → her parçanın base64'ü ayrı kodlanıp birleştirilebilir (dolgu yalnız sonda). */
export const HD_FILE_PART_BYTES = 3 * 349_525; // 1_048_575
/** Base64 karakter karşılığı (4/3). */
export const HD_FILE_PART_CHARS = (HD_FILE_PART_BYTES / 3) * 4; // 1_398_100
export const HD_FILE_MAX_BYTES = 6 * 1024 * 1024;
const RESTORE_TMP_DIR = ".restore-tmp";
const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

export type HdBackupFileRef = { bucket: string; path: string; content_type: string };

function extOf(path: string): string {
  return (path.split(".").pop() ?? "").toLowerCase();
}

/** Bu tenant'ın dosya yolu mu? (önek + güvenli yol + izinli uzantı; geçici klasör hariç) */
export function isTenantHdFilePath(path: unknown, tenantId: string): path is string {
  if (typeof path !== "string" || !tenantId) return false;
  const p = path.trim();
  if (p !== path || !p.startsWith(`${tenantId}/`) || !isSafeStoragePath(p)) return false;
  if (p.split("/")[1] === RESTORE_TMP_DIR) return false;
  return !!MIME_BY_EXT[extOf(p)];
}

/** Tenant'ın DB satırlarının referans verdiği HD dosyaları (danışan görseli + rapor snapshot'ı). */
export async function listHdBackupFiles(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ files: HdBackupFileRef[]; error: string | null }> {
  const paths = new Set<string>();
  const { data: clients, error: cErr } = await db
    .from("human_design_clients")
    .select("chart_image_url")
    .eq("tenant_id", tenantId)
    .not("chart_image_url", "is", null);
  if (cErr) return { files: [], error: cErr.message };
  for (const r of (clients ?? []) as { chart_image_url: string | null }[]) {
    if (isTenantHdFilePath(r.chart_image_url, tenantId)) paths.add(r.chart_image_url);
  }
  const { data: reps, error: rErr } = await db
    .from("human_design_reports")
    .select("snapshot->chartImage->>storagePath")
    .eq("tenant_id", tenantId)
    .like("snapshot->chartImage->>storagePath", `${tenantId}/%`);
  if (rErr) return { files: [], error: rErr.message };
  for (const r of (reps ?? []) as { storagePath?: string | null }[]) {
    if (isTenantHdFilePath(r.storagePath, tenantId)) paths.add(r.storagePath as string);
  }
  const files = [...paths].sort().map((path) => ({
    bucket: HD_FILES_BUCKET,
    path,
    content_type: MIME_BY_EXT[extOf(path)] ?? "application/octet-stream",
  }));
  return { files, error: null };
}

export type HdFilePart = {
  ok: true;
  path: string;
  part: number;
  parts: number;
  size: number;
  sha256: string;
  content_type: string;
  data_base64: string;
};

/** Dosyanın `part`. dilimini (base64) + bütün dosyanın boyut/SHA-256'sı. */
export async function readHdBackupFilePart(
  db: SupabaseClient,
  tenantId: string,
  path: string,
  part: number,
): Promise<HdFilePart | { ok: false; status: number; error: string }> {
  if (!isTenantHdFilePath(path, tenantId)) return { ok: false, status: 400, error: "Geçersiz dosya yolu." };
  // Yalnız gerçekten bu tenant'ın bir satırının referans verdiği yol okunabilir.
  const list = await listHdBackupFiles(db, tenantId);
  if (list.error) return { ok: false, status: 500, error: "Dosya listesi okunamadı." };
  if (!list.files.some((f) => f.path === path)) return { ok: false, status: 404, error: "Dosya bulunamadı." };
  const { data, error } = await db.storage.from(HD_FILES_BUCKET).download(path);
  if (error || !data) return { ok: false, status: 404, error: "Dosya depolamada bulunamadı." };
  const buf = Buffer.from(await data.arrayBuffer());
  const parts = Math.max(1, Math.ceil(buf.length / HD_FILE_PART_BYTES));
  if (!Number.isInteger(part) || part < 0 || part >= parts) return { ok: false, status: 400, error: "Geçersiz parça." };
  const slice = buf.subarray(part * HD_FILE_PART_BYTES, (part + 1) * HD_FILE_PART_BYTES);
  return {
    ok: true,
    path,
    part,
    parts,
    size: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    content_type: MIME_BY_EXT[extOf(path)] ?? "application/octet-stream",
    data_base64: slice.toString("base64"),
  };
}

// ─── Geri yükleme ────────────────────────────────────────────────────────────

export type HdFilePlanInput = { bucket?: unknown; path?: unknown; size?: unknown; sha256?: unknown };
export type HdFilePlanDecision = {
  path: string;
  action: "upload" | "exists" | "skip";
  reason?: "unlicensed" | "invalid_path" | "foreign_tenant" | "too_large" | "invalid_meta";
};

async function objectExists(db: SupabaseClient, path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data } = await db.storage.from(HD_FILES_BUCKET).list(dir, { search: name, limit: 100 });
  return (data ?? []).some((o) => o.name === name);
}

export async function planHdFileRestore(
  db: SupabaseClient,
  ctx: RestoreContext,
  files: HdFilePlanInput[],
): Promise<HdFilePlanDecision[]> {
  const licensed = decideTable("human_design_clients", ctx).action === "restore";
  const out: HdFilePlanDecision[] = [];
  for (const f of files.slice(0, 500)) {
    const path = typeof f.path === "string" ? f.path : "";
    if (!licensed) { out.push({ path, action: "skip", reason: "unlicensed" }); continue; }
    if (f.bucket !== HD_FILES_BUCKET || !path) { out.push({ path, action: "skip", reason: "invalid_path" }); continue; }
    if (!path.startsWith(`${ctx.tenantId}/`)) { out.push({ path, action: "skip", reason: "foreign_tenant" }); continue; }
    if (!isTenantHdFilePath(path, ctx.tenantId)) { out.push({ path, action: "skip", reason: "invalid_path" }); continue; }
    if (typeof f.size !== "number" || f.size <= 0 || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256)) {
      out.push({ path, action: "skip", reason: "invalid_meta" });
      continue;
    }
    if (f.size > HD_FILE_MAX_BYTES) { out.push({ path, action: "skip", reason: "too_large" }); continue; }
    out.push({ path, action: (await objectExists(db, path)) ? "exists" : "upload" });
  }
  return out;
}

const UPLOAD_ID_RE = /^[0-9a-f-]{36}$/i;

function tmpPartPath(tenantId: string, uploadId: string, index: number): string {
  return `${tenantId}/${RESTORE_TMP_DIR}/${uploadId}/${index}.part`;
}

/** Bir parçayı tenant önekli geçici yola yaz (bucket MIME kısıtı için hedef dosyanın tipiyle). */
export async function storeHdRestorePart(
  db: SupabaseClient,
  ctx: RestoreContext,
  body: { path?: unknown; upload_id?: unknown; index?: unknown; data_base64?: unknown },
): Promise<{ ok: boolean; status: number; error?: string }> {
  if (decideTable("human_design_clients", ctx).action !== "restore") return { ok: false, status: 403, error: "Modül lisansı yok." };
  const path = body.path;
  if (!isTenantHdFilePath(path, ctx.tenantId)) return { ok: false, status: 400, error: "Geçersiz dosya yolu." };
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  const index = typeof body.index === "number" ? body.index : -1;
  const data = typeof body.data_base64 === "string" ? body.data_base64 : "";
  if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(index) || index < 0 || index > 16) {
    return { ok: false, status: 400, error: "Geçersiz parça bilgisi." };
  }
  if (!data || data.length > HD_FILE_PART_CHARS || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    return { ok: false, status: 400, error: "Geçersiz parça verisi." };
  }
  const bytes = Buffer.from(data, "base64");
  const { error } = await db.storage
    .from(HD_FILES_BUCKET)
    .upload(tmpPartPath(ctx.tenantId, uploadId, index), bytes, { contentType: MIME_BY_EXT[extOf(path)], upsert: true });
  if (error) return { ok: false, status: 500, error: "Parça yazılamadı." };
  return { ok: true, status: 200 };
}

/** Parçaları birleştir, doğrula, nihai yola yaz (üzerine yazmadan), geçici parçaları sil. */
export async function commitHdRestoreFile(
  db: SupabaseClient,
  ctx: RestoreContext,
  body: { path?: unknown; upload_id?: unknown; parts?: unknown; size?: unknown; sha256?: unknown },
): Promise<{ ok: boolean; status: number; result?: "restored" | "exists"; error?: string }> {
  if (decideTable("human_design_clients", ctx).action !== "restore") return { ok: false, status: 403, error: "Modül lisansı yok." };
  const path = body.path;
  if (!isTenantHdFilePath(path, ctx.tenantId)) return { ok: false, status: 400, error: "Geçersiz dosya yolu." };
  const uploadId = typeof body.upload_id === "string" ? body.upload_id : "";
  const parts = typeof body.parts === "number" ? body.parts : 0;
  if (!UPLOAD_ID_RE.test(uploadId) || !Number.isInteger(parts) || parts < 1 || parts > 17) {
    return { ok: false, status: 400, error: "Geçersiz parça bilgisi." };
  }
  const tmpPaths = Array.from({ length: parts }, (_, i) => tmpPartPath(ctx.tenantId, uploadId, i));
  const cleanup = async () => {
    await db.storage.from(HD_FILES_BUCKET).remove(tmpPaths).catch(() => undefined);
  };
  const bufs: Buffer[] = [];
  for (const p of tmpPaths) {
    const { data, error } = await db.storage.from(HD_FILES_BUCKET).download(p);
    if (error || !data) {
      await cleanup();
      return { ok: false, status: 400, error: "Eksik parça." };
    }
    bufs.push(Buffer.from(await data.arrayBuffer()));
  }
  const all = Buffer.concat(bufs);
  const sha = createHash("sha256").update(all).digest("hex");
  if (all.length !== body.size || sha !== body.sha256) {
    await cleanup();
    return { ok: false, status: 422, error: "Dosya bütünlük doğrulaması başarısız (boyut/SHA-256)." };
  }
  const { error } = await db.storage
    .from(HD_FILES_BUCKET)
    .upload(path, all, { contentType: MIME_BY_EXT[extOf(path)], upsert: false });
  await cleanup();
  if (error) {
    if (/exist|duplicate/i.test(error.message)) return { ok: true, status: 200, result: "exists" };
    return { ok: false, status: 500, error: "Dosya yazılamadı." };
  }
  return { ok: true, status: 200, result: "restored" };
}

export { HD_REPORT_SNAPSHOT_DIR };
