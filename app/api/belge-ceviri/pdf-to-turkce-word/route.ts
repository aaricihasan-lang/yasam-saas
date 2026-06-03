import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import OpenAI from "openai";
// Belge çevirisi için küçük chunk'lar — video modülündeki 2500 kelimelik
// helper'dan bağımsız, timeout riskini önlemek için 500 kelime kullanılır.
const WORDS_PER_CHUNK = 500;

function splitIntoSmallChunks(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount <= WORDS_PER_CHUNK) return [trimmed];

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);

  if (sentences.length <= 1) {
    const words = trimmed.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
      chunks.push(words.slice(i, i + WORDS_PER_CHUNK).join(" "));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;
  for (const sentence of sentences) {
    const wc = sentence.split(/\s+/).filter(Boolean).length;
    if (currentWords + wc > WORDS_PER_CHUNK && current.length > 0) {
      chunks.push(current.join(" "));
      current = [sentence];
      currentWords = wc;
    } else {
      current.push(sentence);
      currentWords += wc;
    }
  }
  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Sabitler ───────────────────────────────────────────────────────────────────
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 200;
// GEÇİCİ: pipeline doğrulaması için ilk 5 sayfa — onaylandıktan sonra kaldır
const TEMP_TEST_PAGE_LIMIT = 30;
const CHUNK_CONCURRENCY = 8;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/octet-stream",
  "application/x-pdf",
]);

// ── Türkçe karakter normalizasyonu ─────────────────────────────────────────────
const TURKISH_CHAR_MAP: Record<string, string> = {
  "Đ": "İ",
  "đ": "i",
  "Ð": "İ",
  "ð": "i",
};
const TURKISH_CHAR_REGEX = new RegExp(
  Object.keys(TURKISH_CHAR_MAP)
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "g",
);
function normalizeTurkishText(text: string): string {
  return text.replace(TURKISH_CHAR_REGEX, (ch) => TURKISH_CHAR_MAP[ch] ?? ch);
}

function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

// ── OpenAI çeviri ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen deneyimli bir kitap çevirmensin. Görevin verilen metni Türk okuyucu için profesyonel bir kitap bölümü kalitesinde Türkçeye çevirmek.

Çeviri kuralları:
- Yalnızca çeviriyi döndür; açıklama, not veya ek metin ekleme.
- Kelime kelime değil, anlam ve akış odaklı çeviri yap. Cümleler Türkçede doğal ve akıcı okunmalı.
- Başlıkları ve alt başlıkları Türkçeleştir; orijinal dilde bırakma.
- Teknik ve uzmanlık terimlerini Türkçeye çevir. Yaygın Türkçe karşılığı yoksa terimi Türkçeleştir, ardından parantez içinde orijinalini yaz: örn. "enerji alanı (energy field)".
- Tıbbi, astrolojik, psikolojik ve akademik terimleri metnin tamamında tutarlı kullan; aynı kavram için farklı karşılıklar kullanma.
- Paragraf yapısını koru; paragrafları birleştirme veya bölme.
- Liste, madde işareti ve numaralı sıralamayı aynen koru.
- Sayıları, tarihleri ve birimleri değiştirme.
- Tablo yapısı bozulmuş ya da düz metin olarak geldiyse okunabilir ve anlaşılır bir biçimde aktar; satır/sütun ilişkisini mümkün olduğunca koru.
- Çeviri Türk okuyucu için yazılmış, yayına hazır bir kitap bölümü gibi görünmeli.`;

async function translateChunk(
  text: string,
  openai: OpenAI,
  index: number,
  total: number,
): Promise<string> {
  const t0 = Date.now();
  console.log(`[pdf-to-turkce-word] chunk ${index + 1}/${total} başladı (${text.length} karakter)`);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0.3,
  });
  const result = response.choices[0]?.message?.content ?? text;
  console.log(`[pdf-to-turkce-word] chunk ${index + 1}/${total} bitti — ${Date.now() - t0}ms`);
  return result;
}

async function translateAllChunks(chunks: string[], openai: OpenAI): Promise<string[]> {
  const results: string[] = new Array(chunks.length).fill("");
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batchEnd = Math.min(i + CHUNK_CONCURRENCY, chunks.length);
    const batch = chunks.slice(i, batchEnd);
    console.log(`[pdf-to-turkce-word] batch ${Math.floor(i / CHUNK_CONCURRENCY) + 1}: chunk ${i + 1}–${batchEnd} paralel işleniyor`);
    const batchResults = await Promise.all(
      batch.map((c, j) => translateChunk(c, openai, i + j, chunks.length)),
    );
    batchResults.forEach((r, j) => { results[i + j] = r; });
  }
  return results;
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const reqStart = Date.now();
  console.log("[pdf-to-turkce-word] istek alındı");

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Dosya bulunamadı. 'file' alanı gerekli." },
        { status: 400 },
      );
    }

    if (getExt(file.name) !== ".pdf") {
      return NextResponse.json(
        { success: false, message: "Yalnızca PDF dosyaları kabul edilir." },
        { status: 400 },
      );
    }

    const mimeOk = !file.type || file.type === "" || ALLOWED_MIME_TYPES.has(file.type);
    if (!mimeOk) {
      return NextResponse.json(
        { success: false, message: `Geçersiz dosya tipi (${file.type}).` },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, message: `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 50 MB.` },
        { status: 400 },
      );
    }

    // ── Metin çıkarma ──────────────────────────────────────────────────────────
    const t0 = Date.now();
    const arrayBuffer = await file.arrayBuffer();
    const { text: pages, totalPages } = await extractText(
      new Uint8Array(arrayBuffer),
      { mergePages: false },
    );
    console.log(`[pdf-to-turkce-word] metin çıkarma: ${Date.now() - t0}ms | toplam sayfa: ${totalPages}`);

    // Kalıcı limit
    if (totalPages > MAX_PAGES) {
      return NextResponse.json(
        {
          success: false,
          message: `Bu belge ${totalPages} sayfa içeriyor. 200 sayfa üstü belgeler için Büyük Dosya Modu hazırlanıyor. Lütfen daha küçük bir bölümü yükleyin.`,
        },
        { status: 422 },
      );
    }

    // ── Sayfa metinlerini birleştir ────────────────────────────────────────────
    // GEÇİCİ: pipeline doğrulaması için sadece ilk 5 sayfa işleniyor
    // Onaylandıktan sonra slice kaldırılacak
    const allPages = Array.isArray(pages) ? pages : [pages as string];
    const pageList = allPages.slice(0, TEMP_TEST_PAGE_LIMIT);
    if (totalPages > TEMP_TEST_PAGE_LIMIT) {
      console.log(`[pdf-to-turkce-word] GEÇİCİ: ${totalPages} sayfadan ilk ${TEMP_TEST_PAGE_LIMIT} sayfa işleniyor`);
    }
    const lines: string[] = [];
    for (const pageText of pageList) {
      for (const raw of pageText.split("\n")) {
        const line = normalizeTurkishText(cleanLine(raw));
        if (line) lines.push(line);
      }
      lines.push("");
    }
    const fullText = lines.join("\n").trim();
    const totalChars = fullText.length;

    if (!fullText) {
      return NextResponse.json(
        {
          success: false,
          message: "PDF'den metin çıkarılamadı. Dosya taranmış, şifreli veya yalnızca görüntü içeriyor olabilir.",
        },
        { status: 422 },
      );
    }

    const chunks = splitIntoSmallChunks(fullText);
    console.log(`[pdf-to-turkce-word] toplam karakter: ${totalChars} | toplam chunk: ${chunks.length}`);

    // ── Çeviri ────────────────────────────────────────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const tTranslate = Date.now();
    const translatedChunks = await translateAllChunks(chunks, openai);
    const translateMs = Date.now() - tTranslate;
    console.log(`[pdf-to-turkce-word] toplam çeviri süresi: ${translateMs}ms`);

    const translatedText = translatedChunks.join("\n\n");

    // ── DOCX oluştur ───────────────────────────────────────────────────────────
    const tDocx = Date.now();
    const children: Paragraph[] = [];
    for (const raw of translatedText.split("\n")) {
      const line = raw.trim();
      children.push(
        new Paragraph({
          children: line ? [new TextRun({ text: line, size: 22 })] : [],
          spacing: { after: 120 },
        }),
      );
    }

    const doc = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children,
      }],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    console.log(`[pdf-to-turkce-word] docx oluşturma: ${Date.now() - tDocx}ms`);
    console.log(`[pdf-to-turkce-word] toplam süre: ${Date.now() - reqStart}ms`);

    const baseName = file.name.replace(/\.pdf$/i, "") + "_turkce";

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.docx`,
        "Content-Length": String(docxBuffer.byteLength),
        "X-Total-Pages": String(totalPages),
      },
    });
  } catch (err) {
    console.error(`[pdf-to-turkce-word] hata (${Date.now() - reqStart}ms):`, err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
