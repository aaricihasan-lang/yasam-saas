import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Dosya bulunamadı. 'file' alanı gerekli." },
        { status: 400 },
      );
    }

    const ext = getExt(file.name);
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { success: false, message: "Yalnızca PNG, JPG, JPEG ve WEBP dosyaları kabul edilir." },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          message: `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 20 MB.`,
        },
        { status: 400 },
      );
    }

    const mimeType = EXT_TO_MIME[ext] ?? "image/jpeg";
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Bu görseldeki tüm metni olduğu gibi çıkar. Satır sonlarını ve paragraf yapısını koru. Yorum veya açıklama ekleme — yalnızca görseldeki metni döndür.",
            },
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "high" },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });

    const text = response.choices[0]?.message?.content ?? "";

    if (!text.trim()) {
      return NextResponse.json(
        { success: false, message: "Görselde okunabilir metin bulunamadı." },
        { status: 422 },
      );
    }

    // Dil tespiti + koşullu çeviri (ayrı çağrı, OCR sonucunu etkilemez)
    let isTurkish = true;
    let translation: string | undefined;

    try {
      const langResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Verilen metnin ana dilini analiz et.
Önemli: Türkçe bir metinde geçen birkaç İngilizce kelime/terim (örn. "download", "chakra", "OpenAI", "medical") metni yabancı dil saydırmamalı. Metnin genel çoğunluğuna bak.
- Metin çoğunlukla Türkçe ise: {"isTurkish": true}
- Metnin ana dili başka bir dilse, tüm metni doğal akıcı Türkçeye çevir ve döndür: {"isTurkish": false, "translation": "<çevrilmiş metin>"}
Yalnızca geçerli JSON döndür, başka hiçbir şey ekleme.`,
          },
          { role: "user", content: text },
        ],
        max_tokens: 4096,
      });

      const raw = langResponse.choices[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw) as { isTurkish?: boolean; translation?: string };
      isTurkish = parsed.isTurkish !== false;
      if (!isTurkish && parsed.translation) translation = parsed.translation;
    } catch {
      // Dil tespiti başarısız — çeviri yapılmamış gibi dön, OCR metni bozulmaz
      isTurkish = true;
    }

    return NextResponse.json({ success: true, text, isTurkish, translation });
  } catch (err) {
    console.error("[ocr] hata:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
