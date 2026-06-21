import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";

export const runtime = "nodejs";

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return NextResponse.json(
        { success: false, message: "Supabase service role yapılandırması eksik." },
        { status: 500 },
      );
    }

    const db = createClient(url, key);

    // 1. Test kayıt ekle
    const { data, error } = await db
      .from("belge_ceviri_jobs")
      .insert({
        status: "pending",
        job_type: "pdf-to-turkce-word",
        file_name: "test.pdf",
        total_pages: 1,
        total_chunks: 3,
        done_chunks: 0,
        source_path: "test/input.pdf",
        result_path: null,
        error_message: null,
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { success: false, message: `DB insert hatası: ${error?.message}` },
        { status: 500 },
      );
    }

    const jobId: string = data.id;

    // 2. Inngest event gönder
    await inngest.send({
      name: "document.translation.requested",
      data: { jobId },
    });

    return NextResponse.json({ success: true, jobId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, message: `Hata: ${message}` },
      { status: 500 },
    );
  }
}
