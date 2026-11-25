import { requestTranslator } from "@/lib/i18n/serverMessages";
import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { isVideoTempPathOwned, VIDEO_TEMP_BUCKET } from "@/lib/video-ceviri/videoTempPath";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import {
  copyFile,
  chmod,
  writeFile,
  readFile,
  unlink,
  access,
} from "node:fs/promises";
import { constants as fsConstants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ffmpegStatic from "ffmpeg-static";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_WHISPER_BYTES = 25 * 1024 * 1024;
const TABLE = "video_transcription_jobs";

/** Whisper'ın kabul etmediği; dönüştürme gerektiren formatlar */
const NEEDS_CONVERSION = new Set(["amr", "3gp", "3gpp"]);

const execFileAsync = promisify(execFile);

/**
 * ffmpeg-static binary'sini /tmp'ye kopyalar ve çalıştırma izni verir.
 * Vercel serverless'ta orijinal path execute edilemiyor; /tmp geçici çözüm.
 */
async function getExecutableFfmpeg(): Promise<string> {
  const staticPath = ffmpegStatic as string | null;

  // --- Debug (Vercel fonksiyon loglarında görünecek) ---
  console.log("[ffmpeg] process.cwd():", process.cwd());
  console.log("[ffmpeg] ffmpegPath:", staticPath);
  console.log(
    "[ffmpeg] exists at staticPath:",
    staticPath ? existsSync(staticPath) : false,
  );

  if (!staticPath) {
    throw new Error("ffmpeg-static: path null/undefined.");
  }

  const tmpBin = join(tmpdir(), "ffmpeg_vc");
  console.log("[ffmpeg] tmpBin:", tmpBin);

  // Zaten kopyalanmış ve çalıştırılabilir durumdaysa yeniden kopyalama
  const alreadyReady = await access(tmpBin, fsConstants.X_OK)
    .then(() => true)
    .catch(() => false);

  if (!alreadyReady) {
    await copyFile(staticPath, tmpBin);
    await chmod(tmpBin, 0o755);
  }

  console.log("[ffmpeg] exists at tmpBin:", existsSync(tmpBin));
  return tmpBin;
}

/**
 * AMR / 3GP dosyasını Whisper'ın kabul ettiği WAV formatına çevirir.
 * Giriş ve çıkış dosyaları /tmp'de tutulur, işlem bitince silinir.
 */
async function convertToWav(
  inputBuffer: Buffer,
  ext: string,
  jobId: string,
): Promise<Buffer> {
  const ffmpegBin  = await getExecutableFfmpeg();
  const tmp        = tmpdir();
  const inputFile  = join(tmp, `vc_in_${jobId}.${ext}`);
  const outputFile = join(tmp, `vc_out_${jobId}.wav`);

  console.log("[ffmpeg] inputFile:", inputFile);
  console.log("[ffmpeg] outputFile:", outputFile);

  await writeFile(inputFile, inputBuffer);

  try {
    await execFileAsync(ffmpegBin, [
      "-y",
      "-i",   inputFile,
      "-ar",  "16000",      // 16 kHz — Whisper için optimal
      "-ac",  "1",          // mono
      "-c:a", "pcm_s16le",  // standart WAV codec
      outputFile,
    ]);
    return await readFile(outputFile);
  } finally {
    await unlink(inputFile).catch(() => undefined);
    await unlink(outputFile).catch(() => undefined);
  }
}

/**
 * FAZ1 FINAL HARDENING (AUTH / item 11): işlem bitince (başarı/hata) geçici nesneyi sil
 * ve `video_deleted_at`'i yaz. Yalnız sahip-önek doğrulaması GEÇMİŞ yol için çağrılır.
 * Silme başarısızsa video_deleted_at YAZILMAZ → günlük temizlik işi yeniden dener.
 */
async function deleteVideoTempObject(
  db: SupabaseClient,
  path: string,
  jobId: string,
  tenantId: string,
  userId: string,
): Promise<void> {
  try {
    const { error } = await db.storage.from(VIDEO_TEMP_BUCKET).remove([path]);
    if (error) {
      console.error("[video-ceviri/transcribe] temp delete failed", { jobId });
      return;
    }
    await db
      .from(TABLE)
      .update({ video_deleted_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);
  } catch {
    console.error("[video-ceviri/transcribe] temp delete threw", { jobId });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Kimlik yalnız oturumdan: tenant/user body'den ALINMAZ (spoof engellenir).
    const guard = await requireModuleAccess(request, "video_ceviri");
    if (!guard.ok) return guard.response;
    const { db, tenantId, userId, is_demo_account } = guard;

    // Demo hesap: video işleme engellenir.
    if (is_demo_account) {
      return NextResponse.json(
        { ok: false, code: "DEMO_READONLY", error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, code: "INVALID_BODY", error: "Geçersiz istek gövdesi." },
        { status: 400 },
      );
    }
    const jobId = String(body.jobId ?? "").trim();
    if (!jobId) {
      return NextResponse.json(
        { ok: false, code: "JOB_ID_REQUIRED", error: "jobId gerekli." },
        { status: 400 },
      );
    }

    const { data: jobData, error: jobErr } = await db
      .from(TABLE)
      .select(
        "id, tenant_id, status, video_temp_path, file_size_bytes, source_language",
      )
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .single();

    if (jobErr || !jobData) {
      return NextResponse.json(
        { ok: false, code: "JOB_NOT_FOUND", error: "İş kaydı bulunamadı." },
        { status: 404 },
      );
    }

    const job = jobData as {
      id: string;
      tenant_id: string;
      status: string;
      video_temp_path: string | null;
      file_size_bytes: number | null;
      source_language: string;
    };

    if (job.status !== "uploaded") {
      return NextResponse.json(
        { ok: false, code: "JOB_ALREADY_PROCESSED", error: `İş zaten '${job.status}' durumunda.` },
        { status: 409 },
      );
    }

    if (!job.video_temp_path) {
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: "Video depolama yolu eksik." })
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      return NextResponse.json(
        { ok: false, code: "VIDEO_PATH_MISSING", error: "Video dosya yolu eksik." },
        { status: 422 },
      );
    }

    // Yol YALNIZ sunucuda türetilir (get-upload-url); yine de kullanmadan önce tenant+job
    // önekini ve traversal yokluğunu doğrula. Yabancı yol → 403; nesneye DOKUNULMAZ.
    const tempPath = job.video_temp_path;
    if (!isVideoTempPathOwned(tempPath, tenantId, jobId)) {
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: "Geçersiz video depolama yolu." })
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);
      return NextResponse.json(
        { ok: false, code: "INVALID_STORAGE_PATH", error: "Geçersiz depolama yolu." },
        { status: 403 },
      );
    }

    // Bu noktadan sonra iş başarıyla da bitse hata da verse geçici nesne SİLİNİR.
    try {
      if (job.file_size_bytes && job.file_size_bytes > MAX_WHISPER_BYTES) {
        const mb  = (job.file_size_bytes / 1024 / 1024).toFixed(1);
        const msg = `Dosya (${mb} MB) 25 MB limitini aşıyor. Daha kısa dosya yükleyin.`;
        await db
          .from(TABLE)
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: false, code: "FILE_TOO_LARGE", error: msg }, { status: 422 });
      }

      await db
        .from(TABLE)
        .update({
          status: "transcribing",
          processing_started_at: new Date().toISOString(),
        })
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      const { data: blob, error: dlErr } = await db.storage
        .from(VIDEO_TEMP_BUCKET)
        .download(tempPath);

      if (dlErr || !blob) {
        // R5-A1: depolama hata ayrıntısı yalnız sunucu günlüğüne.
        if (dlErr) console.error("[video-ceviri/transcribe] indirme hatası:", dlErr);
        const msg = "Dosya indirilemedi.";
        await db
          .from(TABLE)
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: false, code: "TRANSCRIBE_FAILED", error: msg }, { status: 500 });
      }

      if (blob.size > MAX_WHISPER_BYTES) {
        const mb  = (blob.size / 1024 / 1024).toFixed(1);
        const msg = `İndirilen dosya (${mb} MB) 25 MB limitini aşıyor.`;
        await db
          .from(TABLE)
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: false, code: "FILE_TOO_LARGE", error: msg }, { status: 422 });
      }

      const ext = tempPath.split(".").pop()?.toLowerCase() ?? "mp4";

      const EXT_MIME: Record<string, string> = {
        mp3:  "audio/mpeg",  m4a:  "audio/mp4",
        wav:  "audio/wav",   aac:  "audio/aac",   ogg: "audio/ogg",
        "3gp": "audio/3gpp", "3gpp": "audio/3gpp",
        mp4:  "video/mp4",   webm: "video/webm",  mov: "video/quicktime",
        avi:  "video/x-msvideo", mkv: "video/x-matroska",
      };

      let whisperFile: Awaited<ReturnType<typeof toFile>>;

      if (NEEDS_CONVERSION.has(ext)) {
        // AMR / 3GP → WAV (Whisper bu formatları desteklemiyor)
        let wavBuffer: Buffer;
        try {
          const inputBuffer = Buffer.from(await blob.arrayBuffer());
          wavBuffer = await convertToWav(inputBuffer, ext, jobId);
        } catch (convErr) {
          const detail =
            convErr instanceof Error ? convErr.message : String(convErr);
          console.error("[ffmpeg] conversion error:", detail);

          const msg =
            "AMR dosyası dönüştürülemedi. Lütfen MP3, M4A veya WAV deneyin.";
          await db
            .from(TABLE)
            .update({ status: "failed", error_message: msg })
            .eq("id", jobId)
            .eq("tenant_id", tenantId)
            .eq("user_id", userId);
          return NextResponse.json({ ok: false, code: "TRANSCRIBE_FAILED", error: msg }, { status: 500 });
        }
        whisperFile = await toFile(wavBuffer, "audio.wav", { type: "audio/wav" });
      } else {
        // Whisper'ın doğrudan desteklediği formatlar
        const resolvedType =
          blob.type && blob.type !== "application/octet-stream"
            ? blob.type
            : (EXT_MIME[ext] ?? `video/${ext}`);
        whisperFile = await toFile(blob, `audio.${ext}`, { type: resolvedType });
      }

      if (!process.env.OPENAI_API_KEY) {
        const msg = requestTranslator(request, "videoTranslate.apiErrors")("AI_NOT_CONFIGURED");
        await db
          .from(TABLE)
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: false, code: "TRANSCRIBE_FAILED", error: msg }, { status: 500 });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const language =
        job.source_language && job.source_language !== "auto"
          ? job.source_language
          : undefined;

      let transcript: string;
      let detectedLanguage = "auto";
      try {
        const response = (await openai.audio.transcriptions.create({
          file: whisperFile,
          model: "whisper-1",
          response_format: "verbose_json",
          ...(language ? { language } : {}),
        })) as { text: string; language: string };
        transcript = response.text;
        detectedLanguage =
          (response.language ?? "").toLowerCase().trim() || "auto";
      } catch (whisperErr) {
        // R5-A1: sağlayıcı (SDK) hata metni yalnız sunucu günlüğüne; iş kaydına ve yanıta nötr metin.
        console.error("[video-ceviri/transcribe] transkripsiyon hatası:", whisperErr);
        const msg = requestTranslator(request, "videoTranslate.apiErrors")("TRANSCRIBE_FAILED");
        await db
          .from(TABLE)
          .update({ status: "failed", error_message: msg })
          .eq("id", jobId)
          .eq("tenant_id", tenantId)
          .eq("user_id", userId);
        return NextResponse.json({ ok: false, code: "TRANSCRIBE_FAILED", error: msg }, { status: 500 });
      }

      await db
        .from(TABLE)
        .update({
          status: "completed",
          transcript_original: transcript,
          source_language: detectedLanguage,
          processing_completed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", jobId)
        .eq("tenant_id", tenantId)
        .eq("user_id", userId);

      return NextResponse.json({ ok: true, jobId });
    } finally {
      await deleteVideoTempObject(db, tempPath, jobId, tenantId, userId);
    }
  } catch (err) {
    // R5-A1: iç ayrıntı (Supabase/OpenAI/SDK metni) yalnız sunucu günlüğüne; kullanıcıya nötr metin + dil-bağımsız code.
    console.error("[video-ceviri/transcribe] hata:", err);
    return NextResponse.json({ ok: false, code: "PROCESSING_FAILED", error: requestTranslator(request, "videoTranslate.apiErrors")("PROCESSING_FAILED") }, { status: 500 });
  }
}
