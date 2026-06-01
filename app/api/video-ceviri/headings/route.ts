import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "video_transcription_jobs";

const SYSTEM_PROMPT =
  "Sen profesyonel bir içerik analistsin. " +
  "Verilen Türkçe metin içeriğini ana bölümlere ayır ve numaralı başlıklar oluştur. " +
  "Format: '1. Başlık Adı' şeklinde her başlık ayrı satırda. " +
  "Tipik olarak 4-8 bölüm yeterli; içeriğe göre az ya da çok olabilir. " +
  "Her başlık kısa ve açıklayıcı olsun. " +
  "Başka açıklama, selamlama veya giriş cümlesi ekleme; sadece numaralı başlıkları yaz.";

const MAX_CHARS = 24_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: unknown;
      tenantId?: unknown;
    };
    const jobId    = String(body.jobId    ?? "").trim();
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
      .select("id, tenant_id, status, transcript_tr")
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
      transcript_tr: string | null;
    };

    if (!job.transcript_tr?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Başlıklar için önce Türkçe çeviri oluşturulmalı." },
        { status: 422 },
      );
    }

    const inputText = job.transcript_tr.slice(0, MAX_CHARS);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user",   content: inputText },
      ],
      temperature: 0.4,
    });

    const headings = response.choices[0]?.message?.content?.trim() ?? "";

    await db
      .from(TABLE)
      .update({ headings_text: headings })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
