import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const BUCKET = "client-analysis-images";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: clientId } = await params;

    const formData  = await request.formData();
    const file       = formData.get("file")       as File | null;
    const analysisId = String(formData.get("analysisId") ?? "").trim();
    const tenantId   = String(formData.get("tenantId")   ?? "").trim();

    if (!file || !analysisId || !tenantId || !clientId) {
      return NextResponse.json(
        { ok: false, error: "file, analysisId ve tenantId gerekli." },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Dosya boyutu 10 MB'ı geçemez." },
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

    // Verify the analysis record belongs to this client and tenant
    const { data: analysis, error: analysisErr } = await db
      .from("client_analyses")
      .select("id")
      .eq("id", analysisId)
      .eq("client_id", clientId)
      .eq("tenant_id", tenantId)
      .single();

    if (analysisErr || !analysis) {
      return NextResponse.json(
        { ok: false, error: "Analiz kaydı doğrulanamadı." },
        { status: 403 },
      );
    }

    const storagePath = `${tenantId}/${clientId}/${analysisId}.png`;
    const fileBuffer  = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: uploadError.message },
        { status: 500 },
      );
    }

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const { error: updateErr } = await db
      .from("client_analyses")
      .update({ image_url: publicUrl })
      .eq("id", analysisId)
      .eq("tenant_id", tenantId);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: "URL kaydedilemedi: " + updateErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, publicUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
