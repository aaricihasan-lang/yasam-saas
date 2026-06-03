import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 120;

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

    // ── Adım 1: Dil tespiti (küçük, hızlı çağrı) ────────────────────────────────
    // Sadece ilk 1500 karakter yeterli — büyük metni JSON'a gömmek parse hatası üretiyor.
    let isTurkish = true;
    let translation: string | undefined;

    try {
      const langCheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Verilen metnin birincil dilini tespit et.
Kural: Türkçe metin içinde geçen birkaç yabancı kelime veya terim (ör. "OpenAI", "download", "chakra", "medical") metni yabancı dil saydırMAMALI. Metnin genel kelime çoğunluğuna bak.
- Metin çoğunlukla Türkçe ise tam olarak şunu döndür: {"lang":"tr"}
- Metin çoğunlukla başka bir dildeyse (İngilizce, Almanca, Fransızca vb.) tam olarak şunu döndür: {"lang":"other"}
Yalnızca bu JSON'ı döndür, başka hiçbir şey yazma.`,
          },
          { role: "user", content: text.slice(0, 1500) },
        ],
        max_tokens: 12,
      });

      const raw = langCheck.choices[0]?.message?.content ?? '{"lang":"tr"}';
      const parsed = JSON.parse(raw) as { lang?: string };
      isTurkish = parsed.lang !== "other";
      console.log(`[ocr] dil tespiti: lang=${parsed.lang ?? "?"} → isTurkish=${isTurkish}`);
    } catch (err) {
      console.error("[ocr] dil tespiti hatası:", err);
      // Tespit başarısız olursa Türkçe kabul et (güvenli varsayılan)
      isTurkish = true;
    }

    // ── Adım 2: Çeviri (yalnızca Türkçe değilse, düz metin — JSON içine gömme) ──
    if (!isTurkish) {
      try {
        const translationRes = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Verilen metni doğal, akıcı Türkçeye çevir. Satır sonlarını ve paragraf yapısını koru. Yalnızca çeviriyi döndür — açıklama, not veya ek metin ekleme.",
            },
            { role: "user", content: text },
          ],
          max_tokens: 4096,
        });
        const raw = translationRes.choices[0]?.message?.content ?? "";
        if (raw.trim()) translation = raw.trim();
        console.log(`[ocr] çeviri uzunluğu: ${translation?.length ?? 0} karakter`);
      } catch (err) {
        console.error("[ocr] çeviri hatası:", err);
        // Çeviri başarısız — isTurkish false kalır ama translation undefined → UI fallback mesaj gösterir
      }
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
