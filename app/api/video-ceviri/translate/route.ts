import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { splitIntoChunks } from "@/lib/video-ceviri/translationHelpers";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "video_transcription_jobs";

/**
 * İlk chunk için: dil tespiti + çeviri — JSON format zorunlu.
 * GPT her zaman JSON döndürür; translatedText boşsa metin zaten Türkçe demektir.
 */
const FIRST_CHUNK_PROMPT = `Sen profesyonel bir çevirmensin ve dil analizcisin.

Verilen transkript metnini analiz et, ardından aşağıdaki JSON formatında yanıt ver:
{
  "sourceLanguageCode": "<ISO 639-1 kodu, örn: de, en, fr, es, ar, ru, tr>",
  "sourceLanguageName": "<Türkçe dil adı, örn: Almanca, İngilizce, Fransızca, İspanyolca, Türkçe>",
  "translatedText": "<doğal ve akıcı Türkçe çeviri — metin zaten Türkçeyse boş string>"
}

Kurallar:
- Metin Türkçe değilse: anlamı ve tonunu koruyan doğal Türkçeye çevir, translatedText'e yaz.
- Metin zaten Türkçeyse: translatedText alanını boş string olarak bırak ("").
- Yalnızca JSON döndür, başka hiçbir açıklama ekleme.`;

/** Sonraki chunk'lar için: saf çeviri, JSON gerekmez. */
const SUBSEQUENT_CHUNK_PROMPT =
  "Aşağıdaki metni Türkçeye çevir. " +
  "Çeviriyi doğal ve akıcı tut, açıklama veya yorum ekleme. " +
  "Yalnızca çeviriyi yaz.";

type FirstChunkParsed = {
  sourceLanguageCode: string;
  sourceLanguageName: string;
  translatedText: string;
};

function parseFirstChunk(raw: string): FirstChunkParsed | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    return {
      sourceLanguageCode: String(obj.sourceLanguageCode ?? "").toLowerCase().trim() || "auto",
      sourceLanguageName: String(obj.sourceLanguageName ?? "").trim() || "Bilinmiyor",
      translatedText: String(obj.translatedText ?? "").trim(),
    };
  } catch {
    return null;
  }
}

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
      .select("id, is_demo_account")
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

    // Demo hesap: video çevirisi engellenir.
    if (userRow.is_demo_account === true) {
      return NextResponse.json(
        { ok: false, error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      );
    }

    const { data: jobData, error: jobErr } = await db
      .from(TABLE)
      .select("id, tenant_id, status, transcript_original, source_language")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
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
      source_language: string | null;
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

    let detectedLangCode = job.source_language ?? "auto";

    // ── İlk chunk: dil tespiti + çeviri ──────────────────────────
    const firstRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: FIRST_CHUNK_PROMPT },
        { role: "user", content: chunks[0] },
      ],
      temperature: 0.3,
    });

    const firstRaw = firstRes.choices[0]?.message?.content ?? "{}";
    const firstParsed = parseFirstChunk(firstRaw);

    if (firstParsed) {
      detectedLangCode = firstParsed.sourceLanguageCode;

      // Metin zaten Türkçe → sadece source_language güncelle, çeviri yok
      if (detectedLangCode === "tr" || !firstParsed.translatedText) {
        await db
          .from(TABLE)
          .update({ source_language: "tr" })
          .eq("id", jobId);
        return NextResponse.json({ ok: true, jobId, alreadyTurkish: true });
      }

      translatedChunks.push(firstParsed.translatedText);
    } else {
      // JSON parse başarısız: içeriği olduğu gibi ilk parça yap
      translatedChunks.push(firstRaw);
    }

    // ── Sonraki chunk'lar: saf çeviri ─────────────────────────────
    for (let i = 1; i < chunks.length; i++) {
      const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SUBSEQUENT_CHUNK_PROMPT },
          { role: "user", content: chunks[i] },
        ],
        temperature: 0.3,
      });
      translatedChunks.push(res.choices[0]?.message?.content ?? "");
    }

    const fullTranslation = translatedChunks.join("\n\n");

    await db
      .from(TABLE)
      .update({
        transcript_tr: fullTranslation,
        source_language: detectedLangCode,
      })
      .eq("id", jobId);

    return NextResponse.json({
      ok: true,
      jobId,
      alreadyTurkish: false,
      detectedLanguageCode: detectedLangCode,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
