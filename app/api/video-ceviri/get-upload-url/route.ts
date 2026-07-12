import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * TUS resumable upload için kısa ömürlü upload token üretir.
 * service_role key sunucu tarafında kalır; client'a asla sızmaz.
 * Kimlik yalnız oturumdan (verifyUserRequest); tenant/user body'den ALINMAZ.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await verifyUserRequest(request);
    if (!guard.ok) return guard.response;
    const { db, tenantId, userId, is_demo_account } = guard;

    // Demo hesap gerçek upload token alamaz.
    if (is_demo_account) {
      return NextResponse.json(
        { ok: false, error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      storagePath?: unknown;
      jobId?: unknown;
    };

    const storagePath = String(body.storagePath ?? "").trim();
    const jobId       = String(body.jobId       ?? "").trim();

    if (!storagePath || !jobId) {
      return NextResponse.json(
        { ok: false, error: "storagePath ve jobId gerekli." },
        { status: 400 },
      );
    }

    // İş kaydının bu oturuma (tenant + user) ait olduğunu doğrula.
    const { data: job, error: jobErr } = await db
      .from("video_transcription_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { ok: false, error: "İş kaydı doğrulanamadı." },
        { status: 403 },
      );
    }

    // storagePath yalnız oturum tenant'ı + DOĞRULANMIŞ job klasöründe olabilir.
    // Beklenen: {tenantId}/{jobId}/{dosyaAdı}. Başka tenant/başka job klasörü
    // veya traversal (.., ters slash) reddedilir → token yalnız bu job için üretilir.
    const expectedPrefix = `${tenantId}/${jobId}/`;
    if (
      !storagePath.startsWith(expectedPrefix) ||
      storagePath.includes("..") ||
      storagePath.includes("\\")
    ) {
      return NextResponse.json(
        { ok: false, error: "Geçersiz depolama yolu." },
        { status: 403 },
      );
    }

    // Kısa ömürlü signed upload token üret
    const { data: signedData, error: signErr } = await db.storage
      .from("video-temp")
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (signErr || !signedData?.token) {
      return NextResponse.json(
        { ok: false, error: signErr?.message ?? "Upload token üretilemedi." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, token: signedData.token });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
