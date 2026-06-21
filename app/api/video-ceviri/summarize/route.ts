import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "video_transcription_jobs";

const SYSTEM_PROMPT =
  "Sen profesyonel bir içerik özetleyicisisin. " +
  "Verilen Türkçe metin içeriğini madde madde özetle. " +
  "5-8 kısa ve net madde yeterli; metin çok kısaysa 2-3 madde olabilir. " +
  "Her madde '- ' ile başlasın, tek bir cümle veya kısa açıklama olsun. " +
  "Başlık, selamlama veya başka açıklama ekleme; sadece maddeleri yaz.";

const MAX_CHARS = 24_000; // gpt-4o-mini için güvenli üst limit

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      jobId?: unknown;
      tenantId?: unknown;
      userId?: unknown;
    };
    const jobId    = String(body.jobId    ?? "").trim();
    const tenantId = String(body.tenantId ?? "").trim();
    const userId   = String(body.userId   ?? "").trim();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "Oturum bilgisi eksik." },
        { status: 401 },
      );
    }
    if (!jobId) {
      return NextResponse.json(
        { ok: false, error: "jobId gerekli." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Sunucu yapılandırması eksik." },
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

    const { data: userRow, error: userErr } = await db
      .from("users")
      .select("id")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .maybeSingle();

    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "Oturum doğrulanamadı." },
        { status: 403 },
      );
    }

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
        { ok: false, error: "Özet için önce Türkçe çeviri oluşturulmalı." },
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

    const summary = response.choices[0]?.message?.content?.trim() ?? "";

    await db
      .from(TABLE)
      .update({ summary_text: summary })
      .eq("id", jobId);

    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
