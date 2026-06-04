import { NextResponse } from "next/server";
import OpenAI from "openai";
import { DERS_NOTU_SYSTEM_PROMPT } from "@/lib/prompts/ders-notu-final-rules";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_CHARS = 40_000;
const CHUNK_THRESHOLD = 12_000;   // bu uzunluğun üzerinde chunk moduna geç
const CHUNK_TARGET_SIZE = 9_000;  // hedef parça boyutu

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

// Çıktıda "Örnek:" etiketi varsa başa bilgi notu ekler
function withExampleNote(text: string): string {
  if (!/(?:^|\n)Örnek:\n/m.test(text)) return text;
  return (
    `Not: Bu çıktıda eğitmenin verdiği örneklemeler "Örnek:" etiketiyle işaretlenmiştir. ` +
    `Örnekler konuyu anlamayı kolaylaştırabilir. İsterseniz manuel olarak kaldırabilirsiniz.\n\n` +
    text
  );
}

// ── Chunk bölme ────────────────────────────────────────────────────────────────
// Cümlenin ortasında kesmemek için \n\n → \n → ". " öncelik sırasıyla böler.
function splitIntoChunks(text: string, targetSize: number): string[] {
  if (text.length <= targetSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    if (text.length - start <= targetSize) {
      const last = text.slice(start).trim();
      if (last) chunks.push(last);
      break;
    }

    const searchStart = start + Math.floor(targetSize * 0.7);
    const searchEnd = start + targetSize;
    const window = text.slice(searchStart, searchEnd);

    let localSplit = -1;
    const nnIdx = window.lastIndexOf("\n\n");
    if (nnIdx !== -1) {
      localSplit = nnIdx + 2;
    } else {
      const nIdx = window.lastIndexOf("\n");
      if (nIdx !== -1) {
        localSplit = nIdx + 1;
      } else {
        const pIdx = window.lastIndexOf(". ");
        if (pIdx !== -1) localSplit = pIdx + 2;
      }
    }

    const splitAt = localSplit !== -1 ? searchStart + localSplit : start + targetSize;
    chunks.push(text.slice(start, splitAt).trim());
    start = splitAt;
  }

  return chunks.filter((c) => c.length > 0);
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

    const cleanLevel: "balanced" | "strict" =
      cleanLevelRaw === "balanced" || cleanLevelRaw === "strict"
        ? cleanLevelRaw
        : "balanced";

    const keepBookRecs = keepBookRecsRaw !== "false";

    console.log(`[ders-notu/temizle] cleanLevel=${cleanLevel} keepBookRecs=${keepBookRecs}`);

    // ── Temizleme profili metni ───────────────────────────────────────────────
    const CLEAN_PROFILES: Record<"balanced" | "strict", string> = {
      balanced: `DENGELİ DERS NOTU modu:
YAPILACAKLAR:
- Yazım, noktalama ve paragraf düzenini iyileştir.
- Gereksiz teknik konuşmaları (mikrofon, bağlantı, yoklama vb.) ve ders dışı kişisel sohbetleri kaldır.
- Gereksiz dolgu ifadelerini azalt.
- Eğitmenin verdiği somut örnekleri, hayattan anlatıları ve benzetmeleri "Örnek:" etiketiyle işaretle.
  Format: boş satır, ardından tek başına "Örnek:" satırı, ardından örnek içeriği.

YAPILMAYACAKLAR:
- Anlam değiştirme.
- Bilgi ekleme veya çıkarma.
- Cümleleri yeniden yazma.
- Örnekleri silme.
- Öğretmenin vermediği açıklama ekleme.
Bilgi taşıyan cümleleri mümkün olduğunca eğitmenin orijinal ifadesiyle koru.`,

      strict: `SIKI DERS NOTU modu:
YAPILACAKLAR:
- Teknik konuşmaları, ders organizasyonlarını, kişisel sohbetleri ve konu dışı bölümleri kaldır.
- Başlıkları belirginleştir ve doğru konumlarına taşı. Konu geçişlerini düzenle.
- Gereksiz tekrarları kaldır.
- Soru-cevap bölümlerini ve önemli vurguları koru.
- Yazım ve noktalama düzeltmelerini yap.
- Eğitmenin verdiği somut örnekleri, hayattan anlatıları ve benzetmeleri "Örnek:" etiketiyle işaretle.
  Format: boş satır, ardından tek başına "Örnek:" satırı, ardından örnek içeriği.

YAPILMAYACAKLAR:
- Bilgi kaybı yapma.
- Örnekleri silme.
- Öğretmenin anlatmadığı bilgi ekleme.
- Cümleleri kendi yorumunla yeniden kurma.
- Anlam değiştirme.`,
    };

    const bookRecsInstruction = keepBookRecs
      ? "Kitap önerileri ve kaynak tavsiyeleri bilgi değeri taşıyorsa koru."
      : "Kitap önerileri, kaynak tavsiyeleri, fiyat/sahaf/PDF paylaşımı gibi kaynak sohbetlerini kaldır.";

    // ── Ön işlem: bilinen kanal numaralarını düzelt ───────────────────────────
    const preprocessed = applyChannelMap(trimmed);

    // ── Length guard eşiği ───────────────────────────────────────────────────
    let MIN_RATIO: number;
    if (!keepBookRecs)                MIN_RATIO = 0.12;
    else if (cleanLevel === "strict") MIN_RATIO = 0.15;
    else                              MIN_RATIO = 0.30;  // balanced + keepBookRecs=true

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Kullanıcı mesajı şablonu (chunk için parça etiketi eklenir)
    function buildMsg(text: string, chunkLabel?: string): string {
      return (chunkLabel ? `${chunkLabel}\n` : "") +
        `${CLEAN_PROFILES[cleanLevel]}\n` +
        `${bookRecsInstruction}\n\n` +
        `Aşağıdaki ham transkripti bu profile göre temizle.\n` +
        `Kural: Cümleleri yeniden YAZMA. Bilgi içeren her cümleyi AYNEN koru.\n\n---\n\n${text}`;
    }

    // ── TEK PARÇA (≤ 12.000 karakter) ────────────────────────────────────────
    if (preprocessed.length <= CHUNK_THRESHOLD) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          { role: "system", content: DERS_NOTU_SYSTEM_PROMPT },
          { role: "user",   content: buildMsg(preprocessed) },
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

      const cleaned = postProcess(raw);
      const ratio = cleaned.length / preprocessed.length;

      if (preprocessed.length >= 1000 && ratio < MIN_RATIO) {
        console.warn(`[ders-notu/temizle] guard (tek): mod=${cleanLevel} keepBooks=${keepBookRecs} oran=%${Math.round(ratio * 100)} eşik=%${Math.round(MIN_RATIO * 100)}`);
        return NextResponse.json(
          {
            success: false,
            message: `Çıktı güvenlik kontrolünden geçmedi. İşlem OpenAI tarafından yapılmış olabilir. Lütfen daha kısa bir metin parçası deneyin veya örnek/kitap önerilerini koru seçeneğini kapatarak tekrar deneyin. (Mod: ${cleanLevel}, oran: %${Math.round(ratio * 100)})`,
          },
          { status: 422 },
        );
      }

      console.log(`[ders-notu/temizle] tek parça tamam: mod=${cleanLevel} oran=%${Math.round(ratio * 100)}`);
      return NextResponse.json({ success: true, text: withExampleNote(cleaned) });
    }

    // ── CHUNK MODU (> 12.000 karakter) ───────────────────────────────────────
    const chunks = splitIntoChunks(preprocessed, CHUNK_TARGET_SIZE);
    console.log(`[ders-notu/temizle] chunk modu: ${chunks.length} parça, toplam ${preprocessed.length} karakter`);

    const rawChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const label = `[PARÇA ${i + 1}/${chunks.length}]`;

      const chunkResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0,
        messages: [
          { role: "system", content: DERS_NOTU_SYSTEM_PROMPT },
          { role: "user",   content: buildMsg(chunk, label) },
        ],
        max_tokens: 16000,
      });

      const chunkRaw = chunkResponse.choices[0]?.message?.content ?? "";
      if (!chunkRaw.trim()) {
        return NextResponse.json(
          { success: false, message: `Parça ${i + 1}/${chunks.length} işlenemedi. Lütfen tekrar deneyin.` },
          { status: 422 },
        );
      }

      // Chunk başına length guard
      if (chunk.length >= 1000) {
        const chunkRatio = chunkRaw.length / chunk.length;
        if (chunkRatio < MIN_RATIO) {
          console.warn(`[ders-notu/temizle] guard (chunk ${i + 1}): oran=%${Math.round(chunkRatio * 100)} eşik=%${Math.round(MIN_RATIO * 100)}`);
          return NextResponse.json(
            {
              success: false,
              message: `Çıktı güvenlik kontrolünden geçmedi. Parça ${i + 1}/${chunks.length}. İşlem OpenAI tarafından yapılmış olabilir. Lütfen daha kısa bir metin parçası deneyin veya örnek/kitap önerilerini koru seçeneğini kapatarak tekrar deneyin. (Mod: ${cleanLevel}, oran: %${Math.round(chunkRatio * 100)})`,
            },
            { status: 422 },
          );
        }
      }

      rawChunks.push(chunkRaw);
      console.log(`[ders-notu/temizle] chunk ${i + 1}/${chunks.length} tamam (${chunkRaw.length} karakter)`);
    }

    const combined = rawChunks.join("\n\n");
    const cleaned = postProcess(combined);

    console.log(`[ders-notu/temizle] chunk mod tamamlandı: ${chunks.length} parça → ${cleaned.length} karakter`);
    return NextResponse.json({ success: true, text: withExampleNote(cleaned), chunked: true, chunkCount: chunks.length });
  } catch (err) {
    console.error("[ders-notu/temizle] hata:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
