import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Geçerli Word uzantıları.
 * Gerçek dönüşüm altyapısı bir sonraki aşamada eklenecek:
 *   - mammoth  → DOCX içeriğini HTML/düz metne çıkarır
 *   - jspdf    → HTML'den PDF üretir (projede zaten kurulu)
 * Şimdilik: dosya alımı + tip doğrulaması.
 */
const ALLOWED_EXTENSIONS = new Set([".doc", ".docx"]);

const ALLOWED_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Bazı işletim sistemleri/tarayıcılar generic MIME gönderir
  "application/octet-stream",
  "application/zip", // DOCX içsel olarak ZIP yapısındadır
]);

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    // 1. Dosya varlık kontrolü
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, message: "Dosya bulunamadı. 'file' alanı gerekli." },
        { status: 400 },
      );
    }

    // 2. Uzantı kontrolü (birincil güvenlik katmanı)
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        {
          success: false,
          message: `Desteklenmeyen format (.${ext.replace(".", "") || "bilinmiyor"}). Yalnızca .doc ve .docx dosyalar kabul edilir.`,
        },
        { status: 400 },
      );
    }

    // 3. MIME tipi kontrolü (ikincil güvenlik katmanı)
    // Uzantı geçerliyse ve MIME boş/bilinmiyorsa da devam et
    const mimeOk =
      !file.type ||
      file.type === "" ||
      ALLOWED_MIME_TYPES.has(file.type);

    if (!mimeOk) {
      return NextResponse.json(
        {
          success: false,
          message: `Geçersiz dosya tipi (${file.type}). Lütfen geçerli bir .doc veya .docx dosyası yükleyin.`,
        },
        { status: 400 },
      );
    }

    // 4. Boyut kontrolü — 50 MB üst limit (Word dosyaları için makul)
    const MAX_BYTES = 50 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return NextResponse.json(
        {
          success: false,
          message: `Dosya çok büyük (${mb} MB). Maksimum 50 MB yüklenebilir.`,
        },
        { status: 400 },
      );
    }

    // ── Dönüşüm altyapısı buraya gelecek ──────────────────────────────────
    // TODO: mammoth ile DOCX → HTML/metin, ardından jspdf ile PDF üretimi.
    // Vercel serverless uyumlu — LibreOffice veya sistem binary gerektirmez.
    // ──────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      success: true,
      message: "Dosya alındı. Dönüşüm altyapısı hazırlanıyor.",
      fileName: file.name,
      fileSize: file.size,
      extension: ext,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
