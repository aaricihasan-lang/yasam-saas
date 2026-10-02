import { NextResponse, type NextRequest } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { isAndroidUserAgent } from "@/lib/platform/android";

export const runtime = "nodejs";

const STORAGE_BUCKET = "belge-ceviri";

/**
 * GET /api/belge-ceviri/job-status/[id]
 *
 * FAZ1 FINAL HARDENING (AUTH): kimlik YALNIZ header'dan (verifyUserRequest); query
 * userId/tenantId YOK SAYILIR. Job yalnız guard.tenantId + guard.userId sahipliğiyle
 * okunur → başka kullanıcının/tenant'ın job'u 404 (varlık sızmaz). Üyelik kapısı yok
 * (üyeliği biten uzman kendi çıktısını indirebilir). Ham hata mesajı sızmaz.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await verifyUserRequest(request);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Job ID gerekli." }, { status: 400 });
    }

    // Demo hesap: gerçek job kaydı tutulmaz; mevcut "bulunamadı" davranışını döndür.
    if (guard.is_demo_account) {
      return NextResponse.json({ error: "Job bulunamadı." }, { status: 404 });
    }

    const db = guard.db;
    const { data: job, error } = await db
      .from("belge_ceviri_jobs")
      .select("status, done_chunks, total_chunks, result_path, error_message")
      .eq("id", id)
      .eq("tenant_id", guard.tenantId)
      .eq("user_id", guard.userId)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: "Job bulunamadı." }, { status: 404 });
    }

    // Çıktı Word (.docx): Android'de imzalı indirme URL'i hiç üretilmez (ürün kararı;
    // UI zaten gizler — defense-in-depth). Durum/ilerleme bilgisi aynen döner.
    const wordBlocked = isAndroidUserAgent(request.headers.get("user-agent"));
    let downloadUrl: string | null = null;
    if (!wordBlocked && job.status === "completed" && job.result_path) {
      const { data: signed } = await db.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(job.result_path as string, 3600);
      downloadUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({
      status: job.status,
      doneChunks: job.done_chunks,
      totalChunks: job.total_chunks,
      downloadUrl,
      errorMessage: job.error_message,
    });
  } catch {
    return NextResponse.json({ error: "Durum sorgulanamadı." }, { status: 500 });
  }
}
