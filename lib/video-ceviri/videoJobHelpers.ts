import { readYasamUser, readSessionToken } from "@/lib/auth/yasamUser";

/** Güvenli /api/video-ceviri/* çağrıları için oturum kimlik başlıkları
 *  (x-user-id + x-session-token). Sunucu tarafı verifyUserRequest bunları okur. */
export function authHeaders(json = false): Record<string, string> {
  const h: Record<string, string> = { "x-user-id": readYasamUser()?.id ?? "" };
  const t = readSessionToken();
  if (t) h["x-session-token"] = t;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export const ALLOWED_VIDEO_MIME_TYPES = new Set([
  // Video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
  "video/ogg",
  // Ses
  "audio/mpeg",    // mp3
  "audio/mp3",
  "audio/mp4",     // m4a
  "audio/x-m4a",
  "audio/m4a",
  "audio/wav",     // wav
  "audio/x-wav",
  "audio/wave",
  "audio/aac",     // aac
  "audio/x-aac",
  "audio/ogg",     // ogg ses
  "audio/amr",     // amr — tarayıcı/cihaza göre farklı yazılabilir
  "audio/amr-wb",
  "audio/x-amr",
  "audio/AMR",     // büyük harf varyant (normalize ediliyor ama yedek olarak)
  "audio/3gpp",    // .amr / .3gp WhatsApp formatı
  "audio/3gpp2",
  // WhatsApp ve bazı sistemlerde generic MIME tipi; uzantı kontrolü ek güvenlik sağlar
  "application/octet-stream",
]);

/** AMR ve az tanınan formatlar için uzantı tabanlı ikincil kontrol */
const ALLOWED_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "avi", "mkv", "mpeg", "mpg", "ogg",
  "mp3", "m4a", "wav", "aac", "amr", "3gp", "3gpp",
]);

export const MAX_VIDEO_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB — storage limiti
export const MAX_WHISPER_SIZE_BYTES = 25 * 1024 * 1024;    // 25 MB — Whisper API limiti

export type VideoJobRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  status: string;
  original_filename: string;
  file_size_bytes: number | null;
  source_language: string;
  error_message: string | null;
  transcript_original: string | null;
  transcript_tr: string | null;
  summary_text: string | null;
  headings_text: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  video_deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InsertVideoJobParams = {
  tenantId: string;
  userId: string;
  originalFilename: string;
  fileSizeBytes: number;
  sourceLanguage?: string;
};

export type InsertVideoJobResult =
  | { jobId: string; error: null }
  | { jobId: null; error: string };

export function validateVideoFile(file: File): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  // MIME tipini lowercase'e normalize et (audio/AMR → audio/amr)
  const normalizedMime = (file.type ?? "").toLowerCase();
  const mimeOk = ALLOWED_VIDEO_MIME_TYPES.has(file.type) || ALLOWED_VIDEO_MIME_TYPES.has(normalizedMime);
  const extOk  = ALLOWED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) {
    return `Bu format desteklenmiyor. Kabul edilen: MP4, MOV, WEBM, MKV, AVI, OGG · MP3, M4A, WAV, AAC, AMR.`;
  }

  // application/octet-stream yalnızca bilinen uzantılarla kabul edilir
  if (normalizedMime === "application/octet-stream" && !extOk) {
    return `Dosya tipi belirlenemiyor (.${ext || "?"} uzantısı desteklenmiyor). Kabul edilen ses formatları: MP3, M4A, WAV, AAC, AMR.`;
  }
  if (file.size === 0) {
    return "Dosya boş görünüyor.";
  }
  if (file.size > MAX_WHISPER_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Dosya ${mb} MB — transkripsiyon için maksimum 25 MB desteklenmektedir. Lütfen daha kısa bir ses veya video dosyası yükleyin.`;
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Dosya çok büyük (${mb} MB). Maksimum 5 GB yüklenebilir.`;
  }
  return null;
}

export function buildSafeFileName(originalName: string): string {
  const dotIndex = originalName.lastIndexOf(".");
  const ext = dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const base = dotIndex >= 0 ? originalName.slice(0, dotIndex) : originalName;
  const safeBase = base
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return `${Date.now()}_${safeBase || "video"}${ext}`;
}

export function buildVideoTempPath(
  tenantId: string,
  jobId: string,
  originalName: string,
): string {
  return `${tenantId}/${jobId}/${buildSafeFileName(originalName)}`;
}

export function formatFileSizeTr(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatJobDateTr(iso: string): string {
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

// K-3: iş kaydı yazmaları/listesi artık SUNUCU route'undan (service_role) geçer;
// tarayıcıdan anon key ile video_transcription_jobs'a yazma KALDIRILDI.
// tenantId/userId parametreleri imza uyumu için korunur; sunucu oturumdan alır.

export async function insertVideoJob(
  params: InsertVideoJobParams,
): Promise<InsertVideoJobResult> {
  try {
    const res = await fetch("/api/video-ceviri/job", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        originalFilename: params.originalFilename,
        fileSizeBytes: params.fileSizeBytes,
        sourceLanguage: params.sourceLanguage ?? "auto",
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; jobId?: string; error?: string };
    if (!res.ok || !j.ok || !j.jobId) {
      return { jobId: null, error: j.error ?? "Kayıt oluşturulamadı." };
    }
    return { jobId: String(j.jobId), error: null };
  } catch (e) {
    return { jobId: null, error: e instanceof Error ? e.message : "Bağlantı hatası." };
  }
}

async function patchVideoJob(payload: Record<string, unknown>, label: string): Promise<void> {
  try {
    const res = await fetch("/api/video-ceviri/job", {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`[videoJobHelpers] ${label}: HTTP ${res.status}`);
  } catch (e) {
    console.error(`[videoJobHelpers] ${label}:`, e);
  }
}

export async function updateVideoJobTempPath(
  jobId: string,
  videoTempPath: string,
  _tenantId?: string,
): Promise<void> {
  await patchVideoJob({ jobId, videoTempPath }, "updateVideoJobTempPath");
}

export async function updateVideoJobStatus(
  jobId: string,
  status: string,
  errorMessage?: string,
  _tenantId?: string,
): Promise<void> {
  await patchVideoJob(
    { jobId, status, ...(errorMessage !== undefined ? { errorMessage } : {}) },
    "updateVideoJobStatus",
  );
}

export async function fetchVideoJobs(
  tenantId: string,
  userId: string,
): Promise<VideoJobRow[]> {
  // Güvenlik: liste tenant + KULLANICI ile sınırlı (sunucuda) — aynı tenant'taki
  // başka kullanıcının video kayıtları listelenmez (tenant-içi IDOR).
  if (!userId) return [];
  try {
    const res = await fetch("/api/video-ceviri/job", { headers: authHeaders() });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: VideoJobRow[] };
    if (!res.ok || !j.ok) return [];
    return (j.rows ?? []) as VideoJobRow[];
  } catch (e) {
    console.error("[videoJobHelpers] fetchVideoJobs:", e);
    return [];
  }
}
