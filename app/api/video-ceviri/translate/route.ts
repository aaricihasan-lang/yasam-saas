import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { splitIntoChunks } from "@/lib/video-ceviri/translationHelpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "video_transcription_jobs";

const SYSTEM_PROMPT =
  "Sen profesyonel bir çevirmensin. Verilen Almanca metni doğal ve akıcı Türkçeye çevir. " +
  "Açıklama veya yorum ekleme, yalnızca Türkçe çeviriyi yaz.";

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

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: "OpenAI API anahtarı yapılandırılmamış." },
        { status: 500 },
      );
    }

    const db = createClient(supabaseUrl, supabaseKey);

    const { data: jobData, error: jobErr } = await db
      .from(TABLE)
      .select("id, tenant_id, status, transcript_original")
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
      transcript_original: string | null;
    };

    if (job.status !== "completed") {
      return NextResponse.json(
        { ok: false, error: "Yalnızca tamamlanmış işler çevrilebilir." },
        { status: 409 },
      );
    }

    if (!job.transcript_original?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Çevrilecek transkript bulunamadı." },
        { status: 422 },
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitIntoChunks(job.transcript_original);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: chunk },
        ],
        temperature: 0.3,
      });
      const translated = response.choices[0]?.message?.content ?? "";
      translatedChunks.push(translated);
    }

    const fullTranslation = translatedChunks.join("\n\n");

    await db
      .from(TABLE)
      .update({ transcript_tr: fullTranslation })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
