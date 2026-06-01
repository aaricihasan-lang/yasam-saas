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
  buildVideoTempPath,
  insertVideoJob,
  updateVideoJobStatus,
  updateVideoJobTempPath,
  validateVideoFile,
} from "@/lib/video-ceviri/videoJobHelpers";

type UploadPhase =
  | "idle"
  | "validating"
  | "inserting"
  | "uploading"
  | "done"
  | "error";

const ACCEPT = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/mpeg",
  "video/ogg",
].join(",");

const PHASE_LABEL: Record<UploadPhase, string> = {
  idle: "",
  validating: "Dosya kontrol ediliyor…",
  inserting: "Kayıt oluşturuluyor…",
  uploading: "Video yükleniyor…",
  done: "",
  error: "",
};

type Props = { onSuccess: () => void };

export default function VideoUploadZone({ onSuccess }: Props) {
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
    const { error: upErr } = await supabase.storage
      .from("video-temp")
      .upload(storagePath, selectedFile, { upsert: false, cacheControl: "3600" });

    if (upErr) {
      await updateVideoJobStatus(jobId, "failed", upErr.message);
      setErrorMsg(`Video yüklenemedi: ${upErr.message}`);
      setPhase("error");
      return;
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
    <div className="rounded-[28px] border border-white/80 bg-white/90 p-6 shadow-md sm:p-8">
      <h2 className="mb-5 flex items-center gap-2.5 text-xl font-black text-slate-900">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md">
          <UploadCloud className="h-5 w-5" strokeWidth={2.25} />
        </span>
        Video Yükle
      </h2>

      {/* drop zone */}
      <div
        className={`relative flex min-h-[210px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed px-6 py-8 text-center transition ${
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
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-violet-600" />
            <p className="text-sm font-bold text-slate-600">
              {PHASE_LABEL[phase]}
            </p>
          </div>
        )}

        {!isBusy && phase === "done" && (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2
              className="h-10 w-10 text-emerald-600"
              strokeWidth={1.75}
            />
            <p className="text-sm font-bold text-emerald-700">
              Video başarıyla yüklendi.
            </p>
            <button
              type="button"
              onClick={resetToIdle}
              className="mt-1 text-xs font-bold text-violet-600 underline underline-offset-2 transition hover:text-violet-800"
            >
              Yeni video yükle
            </button>
          </div>
        )}

        {!isBusy && phase !== "done" && (
          <>
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 text-violet-600 shadow-sm">
              <Video className="h-7 w-7" strokeWidth={1.75} />
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
                  Videoyu buraya sürükleyin
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  veya dosya seçin
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-400">
                  MP4, MOV, WEBM, MKV, AVI, OGG — maks. 200 MB
                </p>
              </>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 text-sm font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
            >
              <UploadCloud className="h-4 w-4" strokeWidth={2.25} />
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
