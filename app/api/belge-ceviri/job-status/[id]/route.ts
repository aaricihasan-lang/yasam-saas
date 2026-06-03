import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const STORAGE_BUCKET = "belge-ceviri";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env değişkenleri eksik.");
  return createClient(url, key);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "Job ID gerekli." }, { status: 400 });
    }

    const db = getDb();

    const { data: job, error } = await db
      .from("belge_ceviri_jobs")
      .select("status, done_chunks, total_chunks, result_path, error_message")
      .eq("id", id)
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
