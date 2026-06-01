import { supabase } from "@/lib/supabase";

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
  "audio/amr",     // amr — bazı tarayıcılarda boş MIME döner, ek kontrol var
  "audio/amr-wb",
  "audio/x-amr",
  // WhatsApp ve bazı sistemlerde generic MIME tipi; uzantı kontrolü ek güvenlik sağlar
  "application/octet-stream",
]);

/** AMR ve az tanınan formatlar için uzantı tabanlı ikincil kontrol */
const ALLOWED_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "avi", "mkv", "mpeg", "mpg", "ogg",
  "mp3", "m4a", "wav", "aac", "amr",
]);

export const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;

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
  const mimeOk = ALLOWED_VIDEO_MIME_TYPES.has(file.type);
  const extOk  = ALLOWED_EXTENSIONS.has(ext);

  if (!mimeOk && !extOk) {
    return `Bu format desteklenmiyor. Kabul edilen: MP4, MOV, WEBM, MKV, AVI, OGG · MP3, M4A, WAV, AAC, AMR.`;
  }

  // application/octet-stream yalnızca bilinen uzantılarla kabul edilir
  if (file.type === "application/octet-stream" && !extOk) {
    return `Dosya tipi belirlenemiyor (.${ext || "?"} uzantısı desteklenmiyor). Kabul edilen ses formatları: MP3, M4A, WAV, AAC, AMR.`;
  }
  if (file.size === 0) {
    return "Dosya boş görünüyor.";
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Dosya çok büyük (${mb} MB). Maksimum 200 MB yüklenebilir.`;
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

export async function insertVideoJob(
  params: InsertVideoJobParams,
): Promise<InsertVideoJobResult> {
  const { data, error } = await supabase
    .from("video_transcription_jobs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      status: "uploaded",
      original_filename: params.originalFilename,
      file_size_bytes: params.fileSizeBytes,
      source_language: params.sourceLanguage ?? "auto",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    return { jobId: null, error: error?.message ?? "Kayıt oluşturulamadı." };
  }
  return { jobId: String(data.id), error: null };
}

export async function updateVideoJobTempPath(
  jobId: string,
  videoTempPath: string,
): Promise<void> {
  const { error } = await supabase
    .from("video_transcription_jobs")
    .update({ video_temp_path: videoTempPath })
    .eq("id", jobId);
  if (error) {
    console.error("[videoJobHelpers] updateVideoJobTempPath:", error);
  }
}

export async function updateVideoJobStatus(
  jobId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  const { error } = await supabase
    .from("video_transcription_jobs")
    .update({
      status,
      ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
    })
    .eq("id", jobId);
  if (error) {
    console.error("[videoJobHelpers] updateVideoJobStatus:", error);
  }
}

export async function saveTranscriptOriginal(
  jobId: string,
  transcript: string,
): Promise<void> {
  const { error } = await supabase
    .from("video_transcription_jobs")
    .update({
      transcript_original: transcript,
      status: "completed",
      processing_completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) {
    console.error("[videoJobHelpers] saveTranscriptOriginal:", error);
  }
}

export async function fetchVideoJobs(tenantId: string): Promise<VideoJobRow[]> {
  const { data, error } = await supabase
    .from("video_transcription_jobs")
    .select(
      "id, tenant_id, user_id, status, original_filename, file_size_bytes, source_language, error_message, transcript_original, transcript_tr, summary_text, headings_text, processing_started_at, processing_completed_at, video_deleted_at, created_at, updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[videoJobHelpers] fetchVideoJobs:", error);
    return [];
  }
  return (data ?? []) as VideoJobRow[];
}
