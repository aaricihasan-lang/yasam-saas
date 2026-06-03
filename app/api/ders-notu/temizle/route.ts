import { NextResponse } from "next/server";
import OpenAI from "openai";
import { DERS_NOTU_SYSTEM_PROMPT } from "@/lib/prompts/ders-notu-final-rules";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CHARS = 40_000;

// Bilinen kanal numarası dönüşümleri — agresif regex yerine güvenli map
const CHANNEL_MAP: Record<string, string> = {
  "3710": "37-10",
  "2551": "25-51",
  "3457": "34-57",
  "6447": "64-47",
  "4253": "42-53",
  "2946": "29-46",
  "1156": "11-56",
  "731": "7-31",
  "596": "59-6",
  "4521": "45-21",
  "3536": "35-36",
  "3313": "33-13",
  "3041": "30-41",
};

// Sayıdan önce ve sonra başka rakam yoksa değiştir (13710 gibi durumlar eşleşmez)
function applyChannelMap(text: string): string {
  let result = text;
  for (const [raw, formatted] of Object.entries(CHANNEL_MAP)) {
    const regex = new RegExp(`(?<!\\d)${raw}(?!\\d)`, "g");
    result = result.replace(regex, formatted);
  }
  return result;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const rawText = formData.get("text");

    if (!rawText || typeof rawText !== "string" || !rawText.trim()) {
      return NextResponse.json(
        { success: false, message: "Metin bulunamadı." },
        { status: 400 },
      );
    }

    const trimmed = rawText.trim();

    if (trimmed.length > MAX_CHARS) {
      return NextResponse.json(
        {
          success: false,
          message: `Metin çok uzun (${trimmed.length.toLocaleString("tr-TR")} karakter). Maksimum 40.000 karakter.`,
        },
        { status: 400 },
      );
    }

    // Ön işlem: bilinen kanal numaralarını düzelt
    const preprocessed = applyChannelMap(trimmed);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        { role: "system", content: DERS_NOTU_SYSTEM_PROMPT },
        { role: "user", content: preprocessed },
      ],
      max_tokens: 16000,
    });

    const cleaned = response.choices[0]?.message?.content ?? "";

    if (!cleaned.trim()) {
      return NextResponse.json(
        { success: false, message: "İşlem tamamlandı ancak çıktı boş geldi. Lütfen tekrar deneyin." },
        { status: 422 },
      );
    }

    return NextResponse.json({ success: true, text: cleaned });
  } catch (err) {
    console.error("[ders-notu/temizle] hata:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
