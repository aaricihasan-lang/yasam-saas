import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * TUS resumable upload için kısa ömürlü upload token üretir.
 * service_role key sunucu tarafında kalır; client'a asla sızmaz.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      storagePath?: unknown;
      jobId?: unknown;
      tenantId?: unknown;
    };

    const storagePath = String(body.storagePath ?? "").trim();
    const jobId       = String(body.jobId       ?? "").trim();
    const tenantId    = String(body.tenantId    ?? "").trim();

    if (!storagePath || !jobId || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "storagePath, jobId ve tenantId gerekli." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { ok: false, error: "Supabase yapılandırması eksik." },
        { status: 500 },
      );
    }

    const db = createClient(supabaseUrl, supabaseKey);

    // İş kaydının bu tenant'a ait olduğunu doğrula
    const { data: job, error: jobErr } = await db
      .from("video_transcription_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("tenant_id", tenantId)
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { ok: false, error: "İş kaydı doğrulanamadı." },
        { status: 403 },
      );
    }

    // storagePath'in bu tenant'a ait olduğunu doğrula (path {tenantId}/... ile başlamalı)
    if (!storagePath.startsWith(tenantId + "/")) {
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
