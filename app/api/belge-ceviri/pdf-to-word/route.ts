import { NextResponse, type NextRequest } from "next/server";
import { extractText } from "unpdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { requireDigitalContentUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/octet-stream",
  "application/x-pdf",
]);

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function cleanLine(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// Eski PDF encoder'larının Türkçe karakterleri yanlış kodladığı bilinen durumlar.
// Yalnızca bozuk→doğru eşleşmeleri içerir; standart Türkçe karakterlere dokunulmaz.
const TURKISH_CHAR_MAP: Record<string, string> = {
  "Đ": "İ", // U+0110 Latin Capital Letter D with Stroke → İ
  "đ": "i", // U+0111 Latin Small Letter D with Stroke → i
  "Ð": "İ", // U+00D0 Latin Capital Letter Eth → İ (bazı PDF encoder'ları)
  "ð": "i", // U+00F0 Latin Small Letter Eth → i
  "İ": "İ", // U+0130 zaten İ — ama bazı font'lar farklı noktaya encode eder
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

export async function POST(request: NextRequest) {
  const auth = await requireDigitalContentUser(request);
  if (!auth.ok) return auth.response;
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

    // ── Paragraf listesi oluştur ───────────────────────────────────────────────
    const children: Paragraph[] = [];
    const pageList = Array.isArray(pages) ? pages : [pages as string];

    for (let p = 0; p < pageList.length; p++) {
      const rawLines = pageList[p].split("\n");

      for (const raw of rawLines) {
        const line = normalizeTurkishText(cleanLine(raw));
        if (!line) continue;
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 120 },
          }),
        );
      }

      // Sayfa arası kırılma (son sayfada ekleme)
      if (p < pageList.length - 1) {
        children.push(new Paragraph({ children: [], pageBreakBefore: true }));
      }
    }

    if (children.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "PDF'den metin çıkarılamadı. Dosya taranmış, şifreli veya yalnızca görüntü içeriyor olabilir.",
        },
        { status: 422 },
      );
    }

    // ── DOCX oluştur ───────────────────────────────────────────────────────────
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children,
        },
      ],
    });

    const docxBuffer = await Packer.toBuffer(doc);
    const baseName = file.name.replace(/\.pdf$/i, "");

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName)}.docx`,
        "Content-Length": String(docxBuffer.byteLength),
        "X-Total-Pages": String(totalPages),
      },
    });
  } catch (err) {
    console.error("[pdf-to-word]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
