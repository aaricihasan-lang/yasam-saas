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

    // ── Temizleme parametreleri ────────────────────────────────────────────────
    const cleanLevelRaw = formData.get("cleanLevel");
    const keepBookRecsRaw = formData.get("keepBookRecs");

    const cleanLevel: "minimal" | "balanced" | "strict" =
      cleanLevelRaw === "minimal" || cleanLevelRaw === "balanced" || cleanLevelRaw === "strict"
        ? cleanLevelRaw
        : "balanced";

    const keepBookRecs = keepBookRecsRaw !== "false";

    console.log(`[ders-notu/temizle] cleanLevel=${cleanLevel} keepBookRecs=${keepBookRecs}`);

    // ── Temizleme profili metni ───────────────────────────────────────────────
    const CLEAN_PROFILES: Record<"minimal" | "balanced" | "strict", string> = {
      minimal:
        "MİNİMAL TEMİZLİK: Sadece teknik konuşmaları, mikrofon/bağlantı/yoklama gibi tamamen ders dışı bölümleri kaldır. Bilgi taşıyan sohbetleri, kaynak önerilerini, kitap önerilerini ve eğitmen deneyimlerini koru. Metne en yakın çıktı üret.",
      balanced:
        "DENGELİ TEMİZLİK: Teknik konuşmaları ve ders dışı kişisel sohbetleri kaldır. Dersle ilgili kaynak önerileri, kitap önerileri, öğrenci soruları, eğitmen deneyimleri ve örnekleri koru.",
      strict:
        "SIKI DERS NOTU: Teknik konuşmaları, ders organizasyonlarını, kişisel sohbetleri ve konu dışı bölümleri kaldır. Ancak ders bilgisini, örnekleri, soru-cevapları ve konuya hizmet eden açıklamaları koru. Bilgi kaybı yapma.",
    };

    const bookRecsInstruction = keepBookRecs
      ? "Kitap önerileri ve kaynak tavsiyeleri bilgi değeri taşıyorsa koru."
      : "Kitap önerileri, kaynak tavsiyeleri, fiyat/sahaf/PDF paylaşımı gibi kaynak sohbetlerini kaldır.";

    // ── Ön işlem: bilinen kanal numaralarını düzelt ───────────────────────────
    const preprocessed = applyChannelMap(trimmed);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userMessage =
      `${CLEAN_PROFILES[cleanLevel]}\n` +
      `${bookRecsInstruction}\n\n` +
      `Aşağıdaki ham transkripti bu profile göre temizle.\n` +
      `Kural: Cümleleri yeniden YAZMA. Bilgi içeren her cümleyi AYNEN koru.\n\n---\n\n${preprocessed}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
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

    // ── Length guard ─────────────────────────────────────────────────────────
    // keepBookRecs=false durumunda büyük kaynak bölümleri meşru olarak silinir →
    // eşik düşük tutulur (0.40). Minimal mod metne en yakın olduğu için yüksek (0.85).
    let MIN_RATIO: number;
    if (cleanLevel === "minimal")        MIN_RATIO = 0.75;
    else if (!keepBookRecs)              MIN_RATIO = 0.40;
    else if (cleanLevel === "strict")    MIN_RATIO = 0.55;
    else                                 MIN_RATIO = 0.70;  // balanced + keepBookRecs=true

    const ratio = cleaned.length / preprocessed.length;

    if (preprocessed.length >= 1000 && ratio < MIN_RATIO) {
      console.warn(
        `[ders-notu/temizle] length guard: mod=${cleanLevel} keepBooks=${keepBookRecs} cleaned=${cleaned.length} preprocessed=${preprocessed.length} oran=%${Math.round(ratio * 100)} eşik=%${Math.round(MIN_RATIO * 100)}`,
      );
      return NextResponse.json(
        {
          success: false,
          message: `Çıktı fazla kısaldı. Mod: ${cleanLevel}, kitap önerileri: ${keepBookRecs ? "açık" : "kapalı"}, oran: %${Math.round(ratio * 100)}. Lütfen daha kısa parça ile tekrar deneyin.`,
        },
        { status: 422 },
      );
    }

    console.log(`[ders-notu/temizle] tamam: mod=${cleanLevel} oran=%${Math.round(ratio * 100)}`);
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
