"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  Video,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  authHeaders,
  insertVideoJob,
  updateVideoJobStatus,
  validateVideoFile,
} from "@/lib/video-ceviri/videoJobHelpers";
import { resolveVideoUploadMime, VIDEO_TEMP_BUCKET } from "@/lib/video-ceviri/videoTempPath";
import { DIGITAL_CONTENT_DEMO_MESSAGE } from "@/lib/demo/digitalContentDemo";

/*
 * FAZ1 FINAL HARDENING (AUTH / item 11): TEK yükleme yolu — sunucudan imzalı yükleme
 * token'ı (/api/video-ceviri/get-upload-url) + `uploadToSignedUrl`. Nesne yolunu SUNUCU
 * türetir ve iş kaydına yazar; tarayıcı anon `.upload` ve istemci video_temp_path PATCH'i
 * KALDIRILDI. İstemci limiti 25 MB (Whisper) olduğundan eski TUS/resumable (>100 MB)
 * dalı ölüydü → kaldırıldı.
 */

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

    // Demo hesapta yükleme engeli
    if (readYasamUser()?.is_demo_account === true) {
      setErrorMsg(DIGITAL_CONTENT_DEMO_MESSAGE);
      setPhase("error");
      return;
    }

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

    // 4. Upload to video-temp bucket (imzalı yükleme; yol sunucuda türetilir)
    setPhase("uploading");

    // application/octet-stream (WhatsApp AMR vb.) bucket MIME listesinde yok → uzantıya
    // göre gerçek MIME'e eşlenir (paylaşılan harita: lib/video-ceviri/videoTempPath).
    const resolvedMime = resolveVideoUploadMime(selectedFile.name, selectedFile.type);
    if (!resolvedMime) {
      const msg = "Dosya türü belirlenemedi. Kabul edilen: MP4, MOV, WEBM, MKV, AVI, OGG · MP3, M4A, WAV, AAC, AMR.";
      await updateVideoJobStatus(jobId, "failed", msg, tenantId);
      setErrorMsg(msg);
      setPhase("error");
      return;
    }

    setUploadProgress(0);

    // Adım 1: sunucudan kısa ömürlü imzalı yükleme token'ı + sunucu-türetilmiş yol al.
    let signedPath: string;
    let signedToken: string;
    try {
      const tokenRes = await fetch("/api/video-ceviri/get-upload-url", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ jobId }),
      });
      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        ok?: boolean;
        token?: string;
        path?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokenData.ok || !tokenData.token || !tokenData.path) {
        throw new Error(tokenData.error ?? "Yükleme bağlantısı alınamadı.");
      }
      signedPath = tokenData.path;
      signedToken = tokenData.token;
    } catch (tokenErr) {
      const msg = tokenErr instanceof Error ? tokenErr.message : "Yükleme bağlantısı hatası.";
      await updateVideoJobStatus(jobId, "failed", msg, tenantId);
      setErrorMsg(`Yükleme başlatılamadı: ${msg}`);
      setPhase("error");
      return;
    }

    // Adım 2: imzalı URL'e tek parça yükleme (≤25 MB).
    const { error: upErr } = await supabase.storage
      .from(VIDEO_TEMP_BUCKET)
      .uploadToSignedUrl(signedPath, signedToken, selectedFile, {
        contentType: resolvedMime,
        cacheControl: "3600",
      });

    if (upErr) {
      await updateVideoJobStatus(jobId, "failed", upErr.message, tenantId);
      setErrorMsg(`Dosya yüklenemedi: ${upErr.message}`);
      setPhase("error");
      return;
    }
    setUploadProgress(100);

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
    <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-slate-900">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
          <UploadCloud className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        Video Yükle
      </h2>

      {/* drop zone */}
      <div
        className={`relative flex min-h-[110px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-3 text-center transition ${
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
            <Loader2 className="h-6 w-6 animate-spin text-violet-600" />
            <p className="text-xs font-bold text-slate-600">
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
          <div className="flex flex-col items-center gap-1.5">
            <CheckCircle2
              className="h-6 w-6 text-emerald-600"
              strokeWidth={1.75}
            />
            <p className="text-xs font-bold text-emerald-700">
              Dosya başarıyla yüklendi.
            </p>
            <button
              type="button"
              onClick={resetToIdle}
              className="text-[11px] font-bold text-violet-600 underline underline-offset-2 transition hover:text-violet-800"
            >
              Yeni dosya yükle
            </button>
          </div>
        )}

        {!isBusy && phase !== "done" && (
          <>
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-violet-600 shadow-sm">
              <Video className="h-4 w-4" strokeWidth={1.75} />
            </div>

            {selectedFile ? (
              <div className="flex flex-col items-center gap-0.5">
                <p className="max-w-[260px] truncate text-xs font-black text-slate-800 sm:max-w-xs">
                  {selectedFile.name}
                </p>
                <p className="text-[11px] font-medium text-slate-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPhase("idle");
                    setErrorMsg("");
                  }}
                  className="text-[11px] font-semibold text-slate-400 underline underline-offset-2 transition hover:text-slate-600"
                >
                  Değiştir
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-black text-slate-700">
                  Sürükleyin veya seçin
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  MP4 · MOV · MP3 · WAV · M4A · maks. 25 MB
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-[11px] font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            >
              <UploadCloud className="h-3 w-3" strokeWidth={2.25} />
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
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-rose-200/80 bg-rose-50 px-3 py-2">
          <AlertCircle
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600"
            strokeWidth={2.25}
          />
          <p className="text-[11px] font-bold text-rose-700">{errorMsg}</p>
        </div>
      )}

      {/* settings row */}
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Kaynak Dil
          </p>
          <p className="mt-0.5 text-xs font-black text-slate-700">
            Otomatik Algıla
          </p>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Çıktı Formatı
          </p>
          <p className="mt-0.5 text-xs font-black text-slate-700">Word + PDF</p>
        </div>
      </div>

      {/* submit */}
      <button
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || isBusy || phase === "done"}
        className="mt-2.5 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-950 via-violet-900 to-fuchsia-700 text-sm font-bold text-white shadow-md transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
            {PHASE_LABEL[phase]}
          </>
        ) : (
          "İşlem Başlat"
        )}
      </button>
    </div>
  );
}
