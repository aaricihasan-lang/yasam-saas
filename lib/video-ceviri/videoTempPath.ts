/**
 * FAZ1 FINAL HARDENING (AUTH / item 11) — video-temp SAF yardımcıları.
 *
 * Zero-import: client + server + harness güvenle import eder (IO/env/DB YOK).
 *
 * Kurallar:
 *   - video-temp nesne yolu YALNIZ sunucuda türetilir: `${tenantId}/${jobId}/<güvenli-dosya-adı>`.
 *   - İstemci `video_temp_path` YAZAMAZ (PATCH allowlist'inde yok).
 *   - Sunucu bir yolu kullanmadan/silmeden önce `isVideoTempPathOwned` ile tenant+job
 *     önekini ve traversal ('..', '\\', '//') yokluğunu doğrular.
 *   - Bucket MIME allow-list'i (migration 20270129001000) `VIDEO_TEMP_BUCKET_MIME_TYPES` ile birebir.
 */

export const VIDEO_TEMP_BUCKET = "video-temp";

/** Whisper limiti = bucket file_size_limit (26214400). */
export const VIDEO_TEMP_MAX_BYTES = 25 * 1024 * 1024;

/** Geçici nesnelerin azami ömrü (temizlik işi eşiği). */
export const VIDEO_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Uzantı → yükleme Content-Type (istemci ve sunucu aynı haritayı kullanır). */
export const VIDEO_EXT_MIME: Readonly<Record<string, string>> = {
  amr: "audio/amr",
  "3gp": "audio/3gpp",
  "3gpp": "audio/3gpp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  aac: "audio/aac",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
};

/**
 * Bucket'ın kabul ettiği Content-Type listesi (lowercase). Kodda gerçekten kabul edilen
 * MIME'ler (validateVideoFile allow-list'i, application/octet-stream HARİÇ — octet-stream
 * istemcide uzantıya göre gerçek MIME'e çevrilir) + uzantı haritasının tüm değerleri.
 */
export const VIDEO_TEMP_BUCKET_MIME_TYPES: readonly string[] = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
  "video/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/aac",
  "audio/x-aac",
  "audio/ogg",
  "audio/amr",
  "audio/amr-wb",
  "audio/x-amr",
  "audio/3gpp",
  "audio/3gpp2",
];

const BUCKET_MIME_SET = new Set(VIDEO_TEMP_BUCKET_MIME_TYPES);

function fileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Yükleme Content-Type'ını çözer: uzantı haritası önceliklidir; yoksa normalize edilmiş
 * tarayıcı MIME'i. Bucket allow-list'inde olmayan sonuç → null (yükleme yapılmaz).
 */
export function resolveVideoUploadMime(fileName: string, browserType: string | null | undefined): string | null {
  const byExt = VIDEO_EXT_MIME[fileExt(fileName)];
  if (byExt) return byExt;
  const normalized = String(browserType ?? "").trim().toLowerCase();
  if (normalized && BUCKET_MIME_SET.has(normalized)) return normalized;
  return null;
}

/** Dosya adını güvenli bir nesne adına çevirir (yalnız [a-zA-Z0-9._-], ≤60 kar. taban). */
export function buildSafeVideoFileName(originalName: string, now: number = Date.now()): string {
  const name = String(originalName ?? "");
  const dotIndex = name.lastIndexOf(".");
  const rawExt = dotIndex >= 0 ? name.slice(dotIndex + 1).toLowerCase() : "";
  const ext = /^[a-z0-9]{1,8}$/.test(rawExt) ? `.${rawExt}` : "";
  const base = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
  const safeBase = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+|[_.]+$/g, "")
    .slice(0, 60);
  return `${now}_${safeBase || "video"}${ext}`;
}

/** Sunucu tarafı nesne yolu: `${tenantId}/${jobId}/<güvenli-ad>`. */
export function buildServerVideoTempPath(
  tenantId: string,
  jobId: string,
  originalName: string,
  now: number = Date.now(),
): string {
  return `${tenantId}/${jobId}/${buildSafeVideoFileName(originalName, now)}`;
}

/**
 * Yol bu tenant + job'a mı ait ve traversal içermiyor mu?
 * Beklenen tam biçim: `${tenantId}/${jobId}/<tek-seviye-ad>` (alt klasör yok).
 */
export function isVideoTempPathOwned(path: unknown, tenantId: string, jobId: string): boolean {
  if (typeof path !== "string" || !path) return false;
  if (!tenantId || !jobId) return false;
  if (tenantId.includes("/") || jobId.includes("/")) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("//")) return false;
  if (/[\u0000-\u001f]/.test(path)) return false;
  const prefix = `${tenantId}/${jobId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  if (!rest || rest.includes("/")) return false;
  return true;
}

/**
 * PATCH /api/video-ceviri/job gövdesinden istemcinin yazabileceği alanlar.
 * `videoTempPath` / `video_temp_path` BİLİNÇLİ OLARAK YOK SAYILIR (yalnız sunucu yazar).
 */
export function pickClientJobPatchFields(body: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (body.status === "failed") fields.status = "failed";
  if (typeof body.errorMessage === "string") fields.error_message = body.errorMessage.slice(0, 2000);
  return fields;
}

// ─── Günlük temizlik seçimi (SAF) ─────────────────────────────────────────────

export type CleanupJob = {
  id: string;
  tenant_id: string;
  video_temp_path: string | null;
  video_deleted_at: string | null;
  created_at: string;
};

export type CleanupObject = {
  /** Bucket içindeki tam yol (`tenant/job/ad`). */
  path: string;
  created_at: string | null;
};

export type CleanupPlan = {
  /** video_deleted_at set edilecek iş id'leri. */
  jobIdsToMark: string[];
  /** Silinecek nesne yolları (tekil). */
  objectPathsToDelete: string[];
};

function isOlderThan(iso: string | null | undefined, cutoffMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < cutoffMs;
}

/**
 * 24 saatten eski ve `video_deleted_at` boş işler → nesnesi silinir (yalnız sahip-önek
 * doğrulanmış yol) + video_deleted_at set. Bucket'taki 24 saatten eski nesneler → işi
 * yoksa (sahipsiz) veya işi de eskiyse silinir; SON 24 saatte oluşturulmuş bir işe ait
 * nesneye DOKUNULMAZ.
 */
export function planVideoTempCleanup(
  jobs: readonly CleanupJob[],
  objects: readonly CleanupObject[],
  now: number,
  maxAgeMs: number = VIDEO_TEMP_MAX_AGE_MS,
): CleanupPlan {
  const cutoff = now - maxAgeMs;
  const jobIdsToMark: string[] = [];
  const paths = new Set<string>();
  const recentJobIds = new Set<string>();

  for (const job of jobs) {
    if (!isOlderThan(job.created_at, cutoff)) {
      recentJobIds.add(job.id);
      continue;
    }
    if (job.video_deleted_at) continue;
    jobIdsToMark.push(job.id);
    if (job.video_temp_path && isVideoTempPathOwned(job.video_temp_path, job.tenant_id, job.id)) {
      paths.add(job.video_temp_path);
    }
  }

  for (const obj of objects) {
    if (!obj.path || obj.path.includes("..") || obj.path.includes("\\")) continue;
    if (!isOlderThan(obj.created_at, cutoff)) continue;
    const jobId = obj.path.split("/")[1] ?? "";
    if (jobId && recentJobIds.has(jobId)) continue;
    paths.add(obj.path);
  }

  return { jobIdsToMark, objectPathsToDelete: [...paths] };
}
