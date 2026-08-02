import { NextResponse, type NextRequest } from "next/server";
import { extractText } from "unpdf";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";
import { requireDigitalContentUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";
export const maxDuration = 60;

// ── Sabitler ───────────────────────────────────────────────────────────────────
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 200;
const STORAGE_BUCKET = "belge-ceviri";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/octet-stream",
  "application/x-pdf",
]);

type TranslationMode = "standard" | "academic";

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

// ── Route handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  console.log("[pdf-to-turkce-word] istek alındı");

  // Güvenlik: kimlik + demo engeli. tenant_id artık SUNUCUDAN (oturumdan) alınır;
  // body'deki tenantId'ye güvenilmez (spoof edilemez) — [[project-digital-content-qa-final]].
  const auth = await requireDigitalContentUser(request, "belge_ceviri");
  if (!auth.ok) return auth.response;
  const tenantId = auth.user.tenantId;
  const userId = auth.user.userId;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const rawMode = formData.get("mode");
    const mode: TranslationMode = rawMode === "academic" ? "academic" : "standard";

    // ── Validasyon ─────────────────────────────────────────────────────────────
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
        {
          success: false,
          message: `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 50 MB.`,
        },
        { status: 400 },
      );
    }

    // ── Sayfa sayısı kontrolü ──────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();

    // arrayBuffer.slice(0) bağımsız bir kopya oluşturur.
    // pdfjs-dist ArrayBuffer'ı internal olarak detach/transfer edebiliyor;
    // kopya vererek orijinali Storage upload için koruyoruz.
    const { totalPages } = await extractText(
      new Uint8Array(arrayBuffer.slice(0)),
      { mergePages: false },
    );
    console.log(`[pdf-to-turkce-word] toplam sayfa: ${totalPages} | mod: ${mode}`);

    if (totalPages > MAX_PAGES) {
      return NextResponse.json(
        {
          success: false,
          message: `Bu belge ${totalPages} sayfa içeriyor. 200 sayfa üstü belgeler için Büyük Dosya Modu hazırlanıyor.`,
        },
        { status: 422 },
      );
    }

    // ── Supabase Storage'a yükle ───────────────────────────────────────────────
    const db = getDb();
    const jobId = crypto.randomUUID();
    const sourcePath = `${tenantId}/input/${jobId}.pdf`;

    const { error: uploadError } = await db.storage
      .from(STORAGE_BUCKET)
      .upload(sourcePath, Buffer.from(arrayBuffer), {  // orijinal — pdfjs dokunmadı
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) {
      console.error("[pdf-to-turkce-word] Storage upload hatası:", uploadError);
      return NextResponse.json(
        { success: false, message: `Dosya yükleme hatası: ${uploadError.message}` },
        { status: 500 },
      );
    }

    console.log(`[pdf-to-turkce-word] Storage'a yüklendi: ${sourcePath}`);

    // ── Job kaydı oluştur ──────────────────────────────────────────────────────
    const { error: dbError } = await db.from("belge_ceviri_jobs").insert({
      id: jobId,
      tenant_id: tenantId,
      user_id: userId,
      status: "pending",
      job_type: "pdf-to-turkce-word",
      file_name: file.name,
      total_pages: totalPages,
      total_chunks: 0,
      done_chunks: 0,
      source_path: sourcePath,
      result_path: null,
      error_message: null,
    });

    if (dbError) {
      await db.storage.from(STORAGE_BUCKET).remove([sourcePath]);
      console.error("[pdf-to-turkce-word] DB insert hatası:", dbError);
      return NextResponse.json(
        { success: false, message: `Job kaydı oluşturulamadı: ${dbError.message}` },
        { status: 500 },
      );
    }

    console.log(`[pdf-to-turkce-word] job oluşturuldu: ${jobId}`);

    // ── Inngest event gönder ───────────────────────────────────────────────────
    await inngest.send({
      name: "document.translation.requested",
      data: { jobId, mode },
    });

    console.log(`[pdf-to-turkce-word] Inngest event gönderildi: ${jobId}`);

    return NextResponse.json({ success: true, jobId, totalPages });
  } catch (err) {
    console.error("[pdf-to-turkce-word] hata:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `İşlem hatası: ${message}` },
      { status: 500 },
    );
  }
}
