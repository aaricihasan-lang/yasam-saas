/**
 * lib/archive/server/files.ts — Premium Word Arşivi: fotoğraf ve ek dosyalar (YALNIZ SUNUCU).
 *
 * Dosyalar Word'e GÖMÜLMEZ; arşivde ayrı dosya olarak yer alır. Akış:
 *   plan → dosya satırları (tenant + danışan / tarih süzgeci) → iş listesi
 *   parça → satır kimliği SUNUCUDA yeniden okunur, depolama yolu modülün kendi sahiplik doğrulayıcısından geçer,
 *           yalnız o nesne için 60 sn geçerli imzalı indirme bağlantısı döner (herkese açık URL YOK, saklanmaz).
 * Kapsam: analiz görselleri, danışan taş fotoğrafları, anamnez PDF'leri, Kişisel Arşiv dosyaları. Diğer görseller
 * (katalog / stok / şifa rehberi görselleri) bu sürümde arşive girmez ve plan "kapsam dışı" olarak yazar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { ANALYSIS_IMAGE_BUCKET, analysisImagePath } from "@/lib/clients/analysisImageStorage";
import { STONE_PHOTO_BUCKET, isOwnedClientStonePhotoPath } from "@/lib/clients/stonePhotoStorage";
import { ANAMNEZ_BUCKET, isOwnedAttachmentPath } from "@/lib/danisan/anamnez/storage";
import { PERSONAL_ARCHIVE_BUCKET, isOwnedPersonalArchivePath } from "@/lib/kisisel-arsiv/storagePath";
import { safeFileName } from "../zip";
import type { ArchiveFileSource, ArchiveOptions } from "../types";
import { istanbulDayStartIso, nextDay } from "../scope";

assertServerOnly("lib/archive/server/files");

type Row = Record<string, unknown>;

export const SIGNED_URL_TTL_SECONDS = 60;

export const FILE_SOURCES: Record<
  ArchiveFileSource,
  { module: string; table: string; label: string; columns: string; clientLinked: boolean }
> = {
  analysis_image: { module: "clients", table: "client_analyses", label: "Analiz görselleri", columns: "id, client_id, image_url, created_at", clientLinked: true },
  stone_photo: { module: "clients", table: "client_stone_photos", label: "Taş fotoğrafları", columns: "id, client_id, stone_id, file_path, created_at", clientLinked: true },
  anamnez_pdf: { module: "clients", table: "client_anamnesis_attachments", label: "Anamnez belgeleri (PDF)", columns: "id, client_id, anamnesis_id, storage_path, original_name, created_at", clientLinked: true },
  archive_file: { module: "personal_archive", table: "personal_archive_files", label: "Kişisel Arşiv dosyaları", columns: "id, archive_id, file_path, file_name, created_at", clientLinked: false },
};

function hasValue(v: unknown): boolean {
  return typeof v === "string" && v.trim() !== "";
}

/** Kaynağın arşive girecek satırları (keyset, tenant + süzgeç). */
export async function listFileRows(
  db: SupabaseClient,
  tenantId: string,
  source: ArchiveFileSource,
  opts: ArchiveOptions,
  max: number,
): Promise<{ rows: Row[]; error: string | null; truncated: boolean }> {
  const src = FILE_SOURCES[source];
  const out: Row[] = [];
  let after: string | null = null;
  for (let guard = 0; guard < 10_000; guard++) {
    let q = db.from(src.table).select(src.columns).eq("tenant_id", tenantId);
    if (opts.clientIds && src.clientLinked) q = q.in("client_id", opts.clientIds);
    if (opts.dateFrom) q = q.gte("created_at", istanbulDayStartIso(opts.dateFrom));
    if (opts.dateTo) q = q.lt("created_at", istanbulDayStartIso(nextDay(opts.dateTo)));
    if (after) q = q.gt("id", after);
    const res = (await q.order("id", { ascending: true }).limit(500)) as { data: Row[] | null; error: { message?: string } | null };
    if (res.error) return { rows: out, error: res.error.message ?? "okunamadı", truncated: false };
    const rows = res.data ?? [];
    if (rows.length === 0) return { rows: out, error: null, truncated: false };
    for (const r of rows) {
      const ok =
        source === "analysis_image" ? hasValue(r.image_url) : source === "anamnez_pdf" ? hasValue(r.storage_path) : hasValue(r.file_path);
      if (ok) out.push(r);
      if (out.length >= max) return { rows: out, error: null, truncated: true };
    }
    after = String(rows[rows.length - 1].id);
  }
  return { rows: out, error: "sayfalama sınırı", truncated: true };
}

function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Arşivdeki dosya adı (plan aşamasında; içerik okunmadan). */
export function archiveFileName(source: ArchiveFileSource, r: Row): string {
  if (source === "analysis_image") return `Analiz görseli ${String(r.id).slice(0, 8)}.png`;
  if (source === "anamnez_pdf") return safeFileName(String(r.original_name ?? "") || `Anamnez ${String(r.id).slice(0, 8)}.pdf`);
  if (source === "archive_file") return safeFileName(String(r.file_name ?? "") || baseName(String(r.file_path)));
  return safeFileName(`Taş fotoğrafı ${baseName(String(r.file_path))}`);
}

export type SignedFile = { ok: true; url: string; fileName: string } | { ok: false; status: number; error: string };

/** Tek dosya için kısa ömürlü imzalı bağlantı — satır ve yol SUNUCUDA yeniden doğrulanır. */
export async function signArchiveFile(
  db: SupabaseClient,
  tenantId: string,
  source: ArchiveFileSource,
  rowId: string,
  opts: ArchiveOptions,
): Promise<SignedFile> {
  const src = FILE_SOURCES[source];
  if (!src) return { ok: false, status: 400, error: "Geçersiz dosya kaynağı." };
  if (!opts.modules.includes(src.module)) return { ok: false, status: 403, error: "Modül arşiv kapsamında değil." };
  const { data, error } = (await db.from(src.table).select(src.columns).eq("tenant_id", tenantId).eq("id", rowId).maybeSingle()) as {
    data: Row | null;
    error: unknown;
  };
  if (error) return { ok: false, status: 500, error: "Dosya kaydı okunamadı." };
  if (!data) return { ok: false, status: 404, error: "Dosya kaydı bulunamadı." };
  const clientId = String(data.client_id ?? "");
  if (opts.clientIds && src.clientLinked && !opts.clientIds.includes(clientId)) return { ok: false, status: 404, error: "Dosya kaydı bulunamadı." };
  let bucket: string;
  let path: string;
  if (source === "analysis_image") {
    if (!hasValue(data.image_url)) return { ok: false, status: 404, error: "Analiz görseli yok." };
    bucket = ANALYSIS_IMAGE_BUCKET;
    path = analysisImagePath(tenantId, clientId, String(data.id));
  } else if (source === "stone_photo") {
    if (!isOwnedClientStonePhotoPath(data.file_path, tenantId, clientId)) return { ok: false, status: 403, error: "Dosya yolu bu hesaba ait değil." };
    bucket = STONE_PHOTO_BUCKET;
    path = data.file_path as string;
  } else if (source === "anamnez_pdf") {
    if (!isOwnedAttachmentPath(data.storage_path, tenantId, clientId, String(data.anamnesis_id ?? ""))) {
      return { ok: false, status: 403, error: "Dosya yolu bu hesaba ait değil." };
    }
    bucket = ANAMNEZ_BUCKET;
    path = data.storage_path as string;
  } else {
    if (!isOwnedPersonalArchivePath(data.file_path, tenantId, String(data.archive_id ?? ""))) {
      return { ok: false, status: 403, error: "Dosya yolu bu hesaba ait değil." };
    }
    bucket = PERSONAL_ARCHIVE_BUCKET;
    path = data.file_path as string;
  }
  const signed = await db.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) return { ok: false, status: 404, error: "Dosya depoda bulunamadı." };
  return { ok: true, url: signed.data.signedUrl, fileName: archiveFileName(source, data) };
}
