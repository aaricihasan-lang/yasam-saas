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

// ── Post-processing ────────────────────────────────────────────────────────────
// AI cümleleri birleştirirse bile çıktıyı satır satır hale getirir.

/** "35-36 kanalına bakalım." gibi geçiş/navigasyon cümlelerini tespit eder */
function isNavigationSentence(s: string): boolean {
  return /^[^.!?]{0,80}\b(kanalına|kapısına|konusuna)\s+(bakalım|geçelim|geçiyoruz|dönelim|inceleyelim)\.?$/i.test(s.trim());
}

/**
 * Transkriptte geçmeyen çok belirgin AI sentez cümlelerini tespit eder.
 * Agresif değildir — yalnızca kalıp eşleşmesi varsa siler.
 */
function isLikelySynthesisSentence(s: string): boolean {
  const t = s.trim();

  // "35-36 Kanalı değişim ve kriz kanalıdır/temsil eder/olarak bilinir..." kalıbı:
  // Cümle rakamla başlayan bir kanal adıyla açılıyor → Kanalı → kelime → ve → kelime
  // Sona bakılmaksızın yakalanır: "kanalıdır", "temsil eder", "kapılarıdır" vb.
  if (/^\d[\d\-]+\s+Kanalı\s+\S+\s+ve\s+\S+/i.test(t)) return true;

  // Belirgin sentez başlangıçları
  const bannedStarts: RegExp[] = [
    /^Özetle\b/i,
    /^Genel olarak\b/i,
    /^Bu iki kapı birlikte\b/i,
    /^Bu kanalın temel özelliği\b/i,
    /^Bu nedenle bu kanal\b/i,
  ];
  if (bannedStarts.some((r) => r.test(t))) return true;

  return false;
}

/** Cevap başındaki "Evet, X" → "X"; standalone "Evet." → "" */
function stripFiller(s: string): string {
  const t = s.trim();
  if (/^(Evet|Hayır)[.,]?\s*$/i.test(t)) return "";
  return t.replace(/^(Evet|Hayır),\s+/i, "");
}

/**
 * Geçiş 1: Her satırı bağımsız cümlelere ayırır ve navigasyonu / dolguyu temizler.
 * Geçiş 2: Her cümleyi kendi paragrafına koyar; başlıklar ve etiketler korunur.
 */
function postProcess(raw: string): string {
  // ── Geçiş 1: normalize ───────────────────────────────────────────────────────
  const staging: string[] = [];

  for (const line of raw.split("\n")) {
    const t = line.trim();

    if (t === "") {
      staging.push("");
      continue;
    }

    // Başlıklar ve etiketler değişmeden geçer
    if (t.startsWith("#") || t === "Soru:" || t === "Cevap:") {
      staging.push(t);
      continue;
    }

    // Normal metin: nokta/soru/ünlem sonrası boşluğa göre parçala
    const parts = t
      .split(/(?<=[.?!])\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (isNavigationSentence(part)) continue;
      if (isLikelySynthesisSentence(part)) continue;
      const cleaned = stripFiller(part);
      if (cleaned) staging.push(cleaned);
    }
  }

  // ── Geçiş 2: boş satır ekleme ───────────────────────────────────────────────
  const result: string[] = [];

  for (const cur of staging) {
    const prev = result.length > 0 ? result[result.length - 1] : null;

    if (cur === "") {
      if (prev !== "") result.push("");
      continue;
    }

    // Başlık: kendisi + ardından boş satır
    if (cur.startsWith("#")) {
      result.push(cur);
      result.push("");
      continue;
    }

    // Metin / etiket: önceki satır doluysa araya boş satır ekle
    if (prev !== null && prev !== "" && !prev.startsWith("#")) {
      result.push("");
    }
    result.push(cur);
  }

  // ── 3+ ardışık boş satırı 2'ye indir ────────────────────────────────────────
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

    // Kullanıcı mesajı: kısa bir çerçeve + transkript
    // System prompt'u pekiştirmek için kullanıcı mesajında da minimum-edit talimatı verilir.
    const userMessage =
      `Aşağıdaki ham transkripti MİNİMUM EDİT modunda temizle.\n` +
      `Kural: Cümleleri yeniden YAZMA. Sadece gereksiz teknik/kişisel konuşmaları çıkar. Bilgi içeren her cümleyi AYNEN koru.\n\n---\n\n${preprocessed}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        { role: "system", content: DERS_NOTU_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      max_tokens: 16000,
    });

    const raw = response.choices[0]?.message?.content ?? "";

    if (!raw.trim()) {
      return NextResponse.json(
        { success: false, message: "İşlem tamamlandı ancak çıktı boş geldi. Lütfen tekrar deneyin." },
        { status: 422 },
      );
    }

    // AI cümleleri birleştirse bile çıktıyı satır satır hale getir
    const cleaned = postProcess(raw);

    // Length guard: temizlenmiş çıktı ham metnin %55'inden kısaysa özet yapılmış demektir
    const MIN_RATIO = 0.55;
    if (cleaned.length < preprocessed.length * MIN_RATIO) {
      console.warn(
        `[ders-notu/temizle] length guard: cleaned=${cleaned.length} < preprocessed*0.55=${Math.floor(preprocessed.length * MIN_RATIO)}`,
      );
      return NextResponse.json(
        {
          success: false,
          message:
            "Çıktı fazla kısaldı. Model metni özetlemiş olabilir. Lütfen daha kısa parça ile tekrar deneyin.",
        },
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
