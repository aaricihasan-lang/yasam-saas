import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STORAGE_BUCKET = "belge-ceviri";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId")?.trim() ?? "";
    const userId   = searchParams.get("userId")?.trim()   ?? "";

    if (!id) {
      return NextResponse.json({ error: "Job ID gerekli." }, { status: 400 });
    }

    // Oturum eksikse 401
    if (!userId) {
      return NextResponse.json({ error: "Oturum bilgisi eksik." }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: "Oturum bilgisi eksik." }, { status: 401 });
    }

    const db = getDb();

    // userId + tenantId çiftini users tablosunda doğrula
    // Eşleşme yoksa veya kullanıcı pasifse 403
    const { data: userRow, error: userErr } = await db
      .from("users")
      .select("id, is_demo_account")
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .maybeSingle();

    if (userErr || !userRow) {
      return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 403 });
    }

    // Demo hesap: gerçek job kaydı tutulmaz; mevcut "bulunamadı" davranışını döndür.
    if (userRow.is_demo_account === true) {
      return NextResponse.json({ error: "Job bulunamadı." }, { status: 404 });
    }

    const { data: job, error } = await db
      .from("belge_ceviri_jobs")
      .select("status, done_chunks, total_chunks, result_path, error_message")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: "Job bulunamadı." }, { status: 404 });
    }

    let downloadUrl: string | null = null;
    if (job.status === "completed" && job.result_path) {
      const { data: signed } = await db.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(job.result_path, 3600);
      downloadUrl = signed?.signedUrl ?? null;
    }

    return NextResponse.json({
      status: job.status,
      doneChunks: job.done_chunks,
      totalChunks: job.total_chunks,
      downloadUrl,
      errorMessage: job.error_message,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
