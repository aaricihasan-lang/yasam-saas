"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  Video,
} from "lucide-react";
import { Upload as TusUpload } from "tus-js-client";
import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  buildVideoTempPath,
  insertVideoJob,
  updateVideoJobStatus,
  updateVideoJobTempPath,
  validateVideoFile,
} from "@/lib/video-ceviri/videoJobHelpers";

/** 100 MB üzerindeki dosyalar için TUS resumable upload kullanılır */
const RESUMABLE_THRESHOLD = 100 * 1024 * 1024;

/**
 * Supabase TUS endpoint'ine parçalı (resumable) yükleme yapar.
 * authToken: API route'dan createSignedUploadUrl ile alınan kısa ömürlü JWT.
 * 6 MB chunk, otomatik retry, kesintisiz devam desteği.
 */
function uploadWithTus(
  file: File,
  storagePath: string,
  contentType: string,
  authToken: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return new Promise((resolve, reject) => {
    const upload = new TusUpload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${authToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: "video-temp",
        objectName: storagePath,
        contentType,
        cacheControl: "3600",
      },
      chunkSize: 6 * 1024 * 1024,
      onProgress: (uploaded, total) => {
        if (onProgress && total > 0) {
          onProgress(Math.round((uploaded / total) * 100));
        }
      },
      onError: (err) => {
        // TUS DetailedError: originalResponse üzerinden tam HTTP yanıtı okunabilir
        const status  = (err as { originalResponse?: { getStatus?: () => number } })
          ?.originalResponse?.getStatus?.() ?? "?";
        const body    = (err as { originalResponse?: { getBody?: () => string } })
          ?.originalResponse?.getBody?.() ?? "";
        console.error("[TUS] onError — status:", status);
        console.error("[TUS] onError — body:", body);
        console.error("[TUS] onError — message:", err.message);
        reject(err);
      },
      onSuccess: () => resolve(),
    });

    void upload.findPreviousUploads().then((prev) => {
      if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

type UploadPhase =
  | "idle"
  | "validating"
  | "inserting"
  | "uploading"
  | "done"
  | "error";

const ACCEPT = [
  // Video MIME
  "video/mp4", "video/webm", "video/quicktime",
  "video/x-msvideo", "video/x-matroska", "video/mpeg", "video/ogg",
  // Ses MIME
  "audio/mpeg", "audio/mp4", "audio/x-m4a",
  "audio/wav", "audio/x-wav",
  "audio/aac", "audio/x-aac",
  "audio/ogg",
  "audio/amr", "audio/amr-wb",
  "audio/3gpp", "audio/3gpp2",
  // Uzantı fallback (özellikle AMR için gerekli)
  ".amr", ".3gp", ".3gpp", ".mp3", ".m4a", ".wav", ".aac",
].join(",");

const PHASE_LABEL: Record<UploadPhase, string> = {
  idle: "",
  validating: "Dosya kontrol ediliyor…",
  inserting: "Kayıt oluşturuluyor…",
  uploading: "Dosya yükleniyor…",
  done: "",
  error: "",
};

type Props = { onSuccess: () => void };

export default function VideoUploadZone({ onSuccess }: Props) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  function pickFile(file: File) {
    setPhase("idle");
    setErrorMsg("");
    setSelectedFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) pickFile(f);
    e.target.value = "";
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    // 1. Validate
    setPhase("validating");
    const validErr = validateVideoFile(selectedFile);
    if (validErr) {
      setErrorMsg(validErr);
      setPhase("error");
      return;
    }

    // 2. Get session
    const tenantId = await getSyncedTenantId();
    const user = readYasamUser();
    if (!tenantId || !user?.id) {
      setErrorMsg("Oturum bilgisi alınamadı. Lütfen tekrar giriş yapın.");
      setPhase("error");
      return;
    }

    // 3. DB insert → get jobId
    setPhase("inserting");
    const result = await insertVideoJob({
      tenantId,
      userId: user.id,
      originalFilename: selectedFile.name,
      fileSizeBytes: selectedFile.size,
    });
    if (!result.jobId) {
      setErrorMsg(result.error ?? "İş kaydı oluşturulamadı.");
      setPhase("error");
      return;
    }
    const jobId = result.jobId;

    // 4. Upload to video-temp bucket
    setPhase("uploading");
    const storagePath = buildVideoTempPath(tenantId, jobId, selectedFile.name);

    // application/octet-stream (WhatsApp AMR vb.) Supabase Storage tarafından reddedilir.
    // Uzantıya göre doğru MIME'e eşle ve File nesnesini yeniden oluştur.
    // Not: contentType option'ı yeterli değil; File'ın .type özelliği Supabase tarafından kullanılabilir.
    const EXT_MIME: Record<string, string> = {
      amr:  "audio/amr",   "3gp": "audio/3gpp",  "3gpp": "audio/3gpp",
      mp3:  "audio/mpeg",  m4a:  "audio/mp4",
      wav:  "audio/wav",   aac:  "audio/aac",     ogg: "audio/ogg",
      mp4:  "video/mp4",   webm: "video/webm",    mov: "video/quicktime",
      avi:  "video/x-msvideo", mkv: "video/x-matroska",
    };
    const fileExt = selectedFile.name.split(".").pop()?.toLowerCase() ?? "";
    // MIME tipini normalize et (audio/AMR → audio/amr); sonra eşleştir
    const normalizedType = (selectedFile.type ?? "").toLowerCase();
    const resolvedMime =
      normalizedType && normalizedType !== "application/octet-stream"
        ? (EXT_MIME[fileExt] ?? normalizedType) // uzantı eşleşiyorsa uzantıya göre override
        : (EXT_MIME[fileExt] ?? "application/octet-stream");

    setUploadProgress(0);

    if (selectedFile.size > RESUMABLE_THRESHOLD) {
      // ── Büyük dosya: TUS resumable upload ────────────────────────────
      // Adım 1: API route'dan kısa ömürlü upload token al (service role key server'da kalır)
      let tusToken: string;
      try {
        const tokenRes = await fetch("/api/video-ceviri/get-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath, jobId, tenantId }),
        });
        const tokenData = (await tokenRes.json()) as { ok: boolean; token?: string; error?: string };
        if (!tokenData.ok || !tokenData.token) {
          throw new Error(tokenData.error ?? "Upload token alınamadı.");
        }
        tusToken = tokenData.token;
      } catch (tokenErr) {
        const msg = tokenErr instanceof Error ? tokenErr.message : "Upload token hatası.";
        await updateVideoJobStatus(jobId, "failed", msg);
        setErrorMsg(`Yükleme başlatılamadı: ${msg}`);
        setPhase("error");
        return;
      }

      // Adım 2: TUS upload (6 MB chunk)
      try {
        await uploadWithTus(
          selectedFile,
          storagePath,
          resolvedMime,
          tusToken,
          (pct) => setUploadProgress(pct),
        );
      } catch (tusErr) {
        // Ham Supabase/TUS hatasını aynen göster — kaynağı net görmek için wrapper yok
        const raw = tusErr instanceof Error ? tusErr.message : String(tusErr);
        console.error("[TUS] catch — raw error:", raw);
        console.error("[TUS] catch — full object:", tusErr);
        await updateVideoJobStatus(jobId, "failed", raw);
        setErrorMsg(`Yükleme hatası: ${raw}`);
        setPhase("error");
        return;
      }
    } else {
      // ── Küçük dosya: standart tek parça upload ───────────────────────
      const { error: upErr } = await supabase.storage
        .from("video-temp")
        .upload(storagePath, selectedFile, {
          upsert: false,
          cacheControl: "3600",
          contentType: resolvedMime,
        });

      if (upErr) {
        await updateVideoJobStatus(jobId, "failed", upErr.message);
        setErrorMsg(`Dosya yüklenemedi: ${upErr.message}`);
        setPhase("error");
        return;
      }
    }

    // 5. Update job record with storage path
    await updateVideoJobTempPath(jobId, storagePath);

    setPhase("done");
    setSelectedFile(null);
    onSuccess();
  }

  const isBusy =
    phase === "validating" || phase === "inserting" || phase === "uploading";

  function resetToIdle() {
    setPhase("idle");
    setErrorMsg("");
    setSelectedFile(null);
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-base font-black text-slate-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
          <UploadCloud className="h-4 w-4" strokeWidth={2.25} />
        </span>
        Video Yükle
      </h2>

      {/* drop zone */}
      <div
        className={`relative flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
          isDragging
            ? "border-violet-400 bg-violet-50/90"
            : selectedFile && phase === "idle"
              ? "border-violet-300/80 bg-violet-50/60"
              : "border-violet-200/90 bg-gradient-to-br from-violet-50/80 to-indigo-50/60 hover:border-violet-300"
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isBusy && (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-7 w-7 animate-spin text-violet-600" />
            <p className="text-sm font-bold text-slate-600">
              {phase === "uploading" && uploadProgress > 0
                ? `Yükleniyor… %${uploadProgress}`
                : PHASE_LABEL[phase]}
            </p>
            {phase === "uploading" && uploadProgress > 0 && (
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-violet-100">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {!isBusy && phase === "done" && (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2
              className="h-7 w-7 text-emerald-600"
              strokeWidth={1.75}
            />
            <p className="text-sm font-bold text-emerald-700">
              Dosya başarıyla yüklendi.
            </p>
            <button
              type="button"
              onClick={resetToIdle}
              className="mt-1 text-xs font-bold text-violet-600 underline underline-offset-2 transition hover:text-violet-800"
            >
              Yeni dosya yükle
            </button>
          </div>
        )}

        {!isBusy && phase !== "done" && (
          <>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-violet-600 shadow-sm">
              <Video className="h-5 w-5" strokeWidth={1.75} />
            </div>

            {selectedFile ? (
              <div className="flex flex-col items-center gap-1">
                <p className="max-w-[260px] truncate text-sm font-black text-slate-800 sm:max-w-xs">
                  {selectedFile.name}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPhase("idle");
                    setErrorMsg("");
                  }}
                  className="mt-1 text-xs font-semibold text-slate-400 underline underline-offset-2 transition hover:text-slate-600"
                >
                  Değiştir
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm font-black text-slate-700">
                  Video veya ses dosyanızı sürükleyin
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  veya dosya seçin
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  Video: MP4, MOV, WEBM, MKV, AVI, OGG
                </p>
                <p className="text-xs font-semibold text-slate-400">
                  Ses: MP3, M4A, WAV, AAC, AMR — maks. 5 GB
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-xl border border-violet-200 bg-white px-4 text-xs font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            >
              <UploadCloud className="h-3.5 w-3.5" strokeWidth={2.25} />
              Dosya Seç
            </button>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={handleInputChange}
        />
      </div>

      {/* error banner */}
      {phase === "error" && errorMsg && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-200/80 bg-rose-50 px-4 py-3">
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0 text-rose-600"
            strokeWidth={2.25}
          />
          <p className="text-sm font-bold text-rose-700">{errorMsg}</p>
        </div>
      )}

      {/* settings row */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Kaynak Dil
          </p>
          <p className="mt-1 text-sm font-black text-slate-700">
            Otomatik Algıla
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Çıktı Formatı
          </p>
          <p className="mt-1 text-sm font-black text-slate-700">Word + PDF</p>
        </div>
      </div>

      {/* submit */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || isBusy || phase === "done"}
        className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 text-base font-bold text-white shadow-xl transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} />
            {PHASE_LABEL[phase]}
          </>
        ) : (
          "İşlem Başlat"
        )}
      </button>
    </div>
  );
}
