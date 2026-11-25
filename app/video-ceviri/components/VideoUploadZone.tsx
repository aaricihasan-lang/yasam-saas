"use client";

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  UploadCloud,
  Video,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { supabase } from "@/lib/supabase";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getSyncedTenantId } from "@/lib/auth/sessionTenant";
import { readYasamUser } from "@/lib/auth/yasamUser";
import {
  authHeaders,
  insertVideoJob,
  checkVideoFile,
  updateVideoJobStatus,
  validateVideoFile,
} from "@/lib/video-ceviri/videoJobHelpers";
import { resolveVideoUploadMime, VIDEO_TEMP_BUCKET } from "@/lib/video-ceviri/videoTempPath";

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

// I18N: aşama etiketleri videoTranslate.upload.<phase> (yalnız validating / inserting / uploading görünür).
const PHASE_KEY: Partial<Record<UploadPhase, "validating" | "inserting" | "uploading">> = {
  validating: "validating",
  inserting: "inserting",
  uploading: "uploading",
};

type Props = { onSuccess: () => void };

export default function VideoUploadZone({ onSuccess }: Props) {
  const t = useTranslations("videoTranslate.upload");
  const tApi = useTranslations("videoTranslate.apiErrors");
  const tDemo = useTranslations("digitalContent.demo");
  const locale = useLocale();
  const isSource = locale === DEFAULT_LOCALE;
  const phaseLabel = (p: UploadPhase) => (PHASE_KEY[p] ? t(PHASE_KEY[p]!) : "");
  /** Sunucu/depolama ayrıntısı: TR'de aynen; diğer dillerde kod eşlemesi ya da çevrilmiş yedek. */
  const detail = (raw: string, code: string | undefined, fallback: string) =>
    isSource ? raw : code && tApi.has(code) ? tApi(code) : fallback;
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
      setErrorMsg(tDemo("message"));
      setPhase("error");
      return;
    }

    // 1. Validate
    setPhase("validating");
    const validErr = validateVideoFile(selectedFile);
    if (validErr) {
      // TR: kaynak doğrulama metni aynen; diğer dillerde aynı kontrolün kodu → upload.fileErrors.<code>.
      const check = checkVideoFile(selectedFile);
      setErrorMsg(
        isSource || !check
          ? validErr
          : t(`fileErrors.${check.code}`, {
              ext: "ext" in check ? check.ext : "",
              mb: "mb" in check ? check.mb : "",
            }),
      );
      setPhase("error");
      return;
    }

    // 2. Get session
    const tenantId = await getSyncedTenantId();
    const user = readYasamUser();
    if (!tenantId || !user?.id) {
      setErrorMsg(t("sessionMissing"));
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
      setErrorMsg(result.error && isSource ? result.error : t("jobCreateFailed"));
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
      // i18n-ignore: iş kaydına (DB error_message) yazılan kanonik Türkçe hata metni — arayüz dilinden bağımsız.
      const msg = "Dosya türü belirlenemedi. Kabul edilen: MP4, MOV, WEBM, MKV, AVI, OGG · MP3, M4A, WAV, AAC, AMR."; // i18n-ignore: DB'ye yazılır
      await updateVideoJobStatus(jobId, "failed", msg, tenantId);
      setErrorMsg(isSource ? msg : t("typeUnknown"));
      setPhase("error");
      return;
    }

    setUploadProgress(0);

    // Adım 1: sunucudan kısa ömürlü imzalı yükleme token'ı + sunucu-türetilmiş yol al.
    let signedPath: string;
    let signedToken: string;
    let tokenCode: string | undefined;
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
        code?: string;
        error?: string;
      };
      if (!tokenRes.ok || !tokenData.ok || !tokenData.token || !tokenData.path) {
        tokenCode = tokenData.code;
        // i18n-ignore: yedek metin iş kaydına (DB error_message) yazılır — kanonik Türkçe.
        throw new Error(tokenData.error ?? "Yükleme bağlantısı alınamadı."); // i18n-ignore: DB'ye yazılır
      }
      signedPath = tokenData.path;
      signedToken = tokenData.token;
    } catch (tokenErr) {
      // i18n-ignore: iş kaydına (DB error_message) yazılan kanonik Türkçe yedek metin.
      const msg = tokenErr instanceof Error ? tokenErr.message : "Yükleme bağlantısı hatası."; // i18n-ignore: DB'ye yazılır
      await updateVideoJobStatus(jobId, "failed", msg, tenantId);
      setErrorMsg(t("startFailed", { message: detail(msg, tokenCode, t("linkFailed")) }));
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
      setErrorMsg(t("uploadFailed", { message: upErr.message }));
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
        {t("title")}
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
                ? t("progress", { percent: String(uploadProgress) })
                : phaseLabel(phase)}
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
              {t("done")}
            </p>
            <button
              type="button"
              onClick={resetToIdle}
              className="text-[11px] font-bold text-violet-600 underline underline-offset-2 transition hover:text-violet-800"
            >
              {t("newFile")}
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
                  {t("fileSize", { size: (selectedFile.size / 1024 / 1024).toFixed(1) })}
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
                  {t("change")}
                </button>
              </div>
            ) : (
              <>
                <p className="text-xs font-black text-slate-700">
                  {t("dropHint")}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">
                  {t("formatsHint")}
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 text-[11px] font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            >
              <UploadCloud className="h-3 w-3" strokeWidth={2.25} />
              {t("selectFile")}
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
            {t("sourceLanguage")}
          </p>
          <p className="mt-0.5 text-xs font-black text-slate-700">
            {t("autoDetect")}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200/80 bg-slate-50/90 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {t("outputFormat")}
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
            {phaseLabel(phase)}
          </>
        ) : (
          t("start")
        )}
      </button>
    </div>
  );
}
