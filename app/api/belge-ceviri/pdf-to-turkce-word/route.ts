import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import OpenAI from "openai";
import { splitIntoChunks } from "@/lib/video-ceviri/translationHelpers";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Sabitler ───────────────────────────────────────────────────────────────────
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 200;
const CHUNK_CONCURRENCY = 4;

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
const SYSTEM_PROMPT = `Sen profesyonel bir çevirmensin.
Verilen metni Türkçeye çevir.
Kurallar:
- Yalnızca çeviriyi döndür, açıklama veya ek metin ekleme.
- Paragraf ve satır yapısını olduğu gibi koru.
- Özel isimler, teknik terimler ve kısaltmaları değiştirme.
- Türkçeye doğal ve akıcı çeviri yap.`;

async function translateChunk(text: string, openai: OpenAI): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content ?? text;
}

async function translateAllChunks(chunks: string[], openai: OpenAI): Promise<string[]> {
  const results: string[] = new Array(chunks.length).fill("");
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, Math.min(i + CHUNK_CONCURRENCY, chunks.length));
    const batchResults = await Promise.all(batch.map((c) => translateChunk(c, openai)));
    batchResults.forEach((r, j) => { results[i + j] = r; });
  }
  return results;
}

// ── Route handler ──────────────────────────────────────────────────────────────
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
    const arrayBuffer = await file.arrayBuffer();
    const { text: pages, totalPages } = await extractText(
      new Uint8Array(arrayBuffer),
      { mergePages: false },
    );

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
    const pageList = Array.isArray(pages) ? pages : [pages as string];
    const lines: string[] = [];

    for (const pageText of pageList) {
      for (const raw of pageText.split("\n")) {
        const line = normalizeTurkishText(cleanLine(raw));
        if (line) lines.push(line);
      }
      lines.push(""); // sayfa sonu boş satır
    }

    const fullText = lines.join("\n").trim();

    if (!fullText) {
      return NextResponse.json(
        {
          success: false,
          message: "PDF'den metin çıkarılamadı. Dosya taranmış, şifreli veya yalnızca görüntü içeriyor olabilir.",
        },
        { status: 422 },
      );
    }

    // ── Chunk'lara böl ve çevir ────────────────────────────────────────────────
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitIntoChunks(fullText);
    const translatedChunks = await translateAllChunks(chunks, openai);
    const translatedText = translatedChunks.join("\n\n");

    // ── DOCX oluştur ───────────────────────────────────────────────────────────
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
    console.error("[pdf-to-turkce-word]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
