import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  buildServerVideoTempPath,
  isVideoTempPathOwned,
  VIDEO_TEMP_BUCKET,
} from "@/lib/video-ceviri/videoTempPath";

export const runtime = "nodejs";

/**
 * FAZ1 FINAL HARDENING (AUTH / item 11) — video-temp'e TEK yükleme yolu.
 *
 * İstemci yalnız `jobId` gönderir. Sunucu:
 *   1. İş kaydının bu oturuma (tenant + user) ait ve 'uploaded' durumda olduğunu doğrular,
 *   2. Nesne yolunu KENDİSİ türetir: `${tenantId}/${jobId}/<güvenli-ad>` (dosya adı iş
 *      kaydındaki original_filename'den; istemcinin gönderdiği yol YOK SAYILIR),
 *   3. Kısa ömürlü imzalı yükleme token'ı üretir (service_role sunucuda kalır),
 *   4. `video_temp_path`'i iş kaydına YALNIZ burada yazar (istemci PATCH ile yazamaz).
 * İstemci `supabase.storage.from("video-temp").uploadToSignedUrl(path, token, file)` ile
 * yükler — bucket'ta anon INSERT/SELECT politikası yoktur (migration 20270129001000).
 * Kimlik yalnız oturumdan (requireModuleAccess); tenant/user body'den ALINMAZ.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requireModuleAccess(request, "video_ceviri");
    if (!guard.ok) return guard.response;
    const { db, tenantId, userId, is_demo_account } = guard;

    // Demo hesap gerçek upload token alamaz.
    if (is_demo_account) {
      return NextResponse.json(
        { ok: false, error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { jobId?: unknown };
    const jobId = String(body?.jobId ?? "").trim();
    if (!jobId || jobId.includes("/")) {
      return NextResponse.json({ ok: false, error: "jobId gerekli." }, { status: 400 });
    }

    // İş kaydının bu oturuma (tenant + user) ait olduğunu doğrula.
    const { data: job, error: jobErr } = await db
      .from("video_transcription_jobs")
      .select("id, status, original_filename")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();

    if (jobErr || !job) {
      return NextResponse.json(
        { ok: false, error: "İş kaydı doğrulanamadı." },
        { status: 403 },
      );
    }
    if (job.status !== "uploaded") {
      return NextResponse.json(
        { ok: false, error: "Bu iş için yükleme artık yapılamaz." },
        { status: 409 },
      );
    }

    const storagePath = buildServerVideoTempPath(
      tenantId,
      jobId,
      String(job.original_filename ?? "video"),
    );
    if (!isVideoTempPathOwned(storagePath, tenantId, jobId)) {
      return NextResponse.json({ ok: false, error: "Geçersiz depolama yolu." }, { status: 403 });
    }

    // Kısa ömürlü signed upload token üret
    const { data: signedData, error: signErr } = await db.storage
      .from(VIDEO_TEMP_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (signErr || !signedData?.token) {
      console.error("[video-ceviri/get-upload-url] sign failed");
      return NextResponse.json(
        { ok: false, error: "Yükleme bağlantısı üretilemedi." },
        { status: 500 },
      );
    }

    // video_temp_path YALNIZ sunucuda yazılır (transcribe/temizlik bu değere güvenir).
    const { error: updErr } = await db
      .from("video_transcription_jobs")
      .update({ video_temp_path: storagePath })
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);
    if (updErr) {
      return NextResponse.json(
        { ok: false, error: "İş kaydı güncellenemedi." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, token: signedData.token, path: storagePath });
  } catch {
    return NextResponse.json({ ok: false, error: "Yükleme başlatılamadı." }, { status: 500 });
  }
}
