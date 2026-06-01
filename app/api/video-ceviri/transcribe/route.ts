import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_WHISPER_BYTES = 25 * 1024 * 1024; // 25 MB
const TABLE = "video_transcription_jobs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: unknown;
      tenantId?: unknown;
    };
    const jobId = String(body.jobId ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();

    if (!jobId || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "jobId ve tenantId gerekli." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase yapılandırması eksik." },
        { status: 500 },
      );
    }

    const db = createClient(supabaseUrl, supabaseKey);

    // İş kaydını al, tenant izolasyonu kontrol et
    const { data: jobData, error: jobErr } = await db
      .from(TABLE)
      .select(
        "id, tenant_id, status, video_temp_path, file_size_bytes, source_language",
      )
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .single();

    if (jobErr || !jobData) {
      return NextResponse.json(
        { ok: false, error: "İş kaydı bulunamadı." },
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

    // Yalnızca 'uploaded' durumu işlenebilir
    if (job.status !== "uploaded") {
      return NextResponse.json(
        { ok: false, error: `İş zaten '${job.status}' durumunda.` },
        { status: 409 },
      );
    }

    if (!job.video_temp_path) {
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: "Video depolama yolu eksik." })
        .eq("id", jobId);
      return NextResponse.json(
        { ok: false, error: "Video dosya yolu eksik." },
        { status: 422 },
      );
    }

    // DB'deki boyut bilgisiyle Whisper limitini önceden kontrol et
    if (job.file_size_bytes && job.file_size_bytes > MAX_WHISPER_BYTES) {
      const mb = (job.file_size_bytes / 1024 / 1024).toFixed(1);
      const msg = `Dosya (${mb} MB) Whisper 25 MB limitini aşıyor. Daha kısa video yükleyin.`;
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, error: msg }, { status: 422 });
    }

    // Durumu 'transcribing' yap
    await db
      .from(TABLE)
      .update({
        status: "transcribing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // video-temp bucket'tan dosyayı indir
    const { data: blob, error: dlErr } = await db.storage
      .from("video-temp")
      .download(job.video_temp_path);

    if (dlErr || !blob) {
      const msg = dlErr?.message ?? "Dosya indirilemedi.";
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    // İndirilen dosyanın gerçek boyutunu da kontrol et
    if (blob.size > MAX_WHISPER_BYTES) {
      const mb = (blob.size / 1024 / 1024).toFixed(1);
      const msg = `İndirilen dosya (${mb} MB) Whisper 25 MB limitini aşıyor.`;
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, error: msg }, { status: 422 });
    }

    // Blob'u OpenAI SDK'nın beklediği File nesnesine çevir
    const ext =
      job.video_temp_path.split(".").pop()?.toLowerCase() ?? "mp4";
    const file = await toFile(blob, `audio.${ext}`, {
      type: blob.type || `video/${ext}`,
    });

    // OpenAI Whisper çağrısı
    if (!process.env.OPENAI_API_KEY) {
      const msg = "OpenAI API anahtarı yapılandırılmamış.";
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
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
        file,
        model: "whisper-1",
        response_format: "verbose_json",
        ...(language ? { language } : {}),
      })) as { text: string; language: string };
      transcript = response.text;
      detectedLanguage =
        (response.language ?? "").toLowerCase().trim() || "auto";
    } catch (whisperErr) {
      const msg =
        whisperErr instanceof Error
          ? whisperErr.message
          : "Whisper API hatası.";
      await db
        .from(TABLE)
        .update({ status: "failed", error_message: msg })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    // Transkripti, tespit edilen dili ve tamamlanma bilgisini kaydet
    await db
      .from(TABLE)
      .update({
        status: "completed",
        transcript_original: transcript,
        source_language: detectedLanguage,
        processing_completed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
