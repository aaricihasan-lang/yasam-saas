import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isDemoTenantId } from "@/lib/auth/demoServerGuard";

export const runtime = "nodejs";

const BUCKET = "hd-chart-images";
const ALLOWED_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const clientId = String(formData.get("clientId") ?? "").trim();
    const tenantId = String(formData.get("tenantId") ?? "").trim();

    if (!file || !clientId || !tenantId) {
      return NextResponse.json(
        { ok: false, error: "file, clientId ve tenantId gerekli." },
        { status: 400 },
      );
    }

    const origName = file.name.toLowerCase();
    const dotIdx = origName.lastIndexOf(".");
    const ext = dotIdx >= 0 ? origName.slice(dotIdx + 1) : "";

    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "Sadece JPG, PNG veya WebP yüklenebilir." },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "Dosya boyutu 5 MB'ı geçemez." },
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

    // Demo tenant'ı gerçek storage'a upload yapamaz (tenantId taşıyor, userId yok)
    if (await isDemoTenantId(tenantId, db)) {
      return NextResponse.json(
        { ok: false, error: "Demo hesabında bu işlem kullanılamaz." },
        { status: 403 },
      );
    }

    const { data: client, error: clientErr } = await db
      .from("human_design_clients")
      .select("id")
      .eq("id", clientId)
      .eq("tenant_id", tenantId)
      .single();

    if (clientErr || !client) {
      return NextResponse.json(
        { ok: false, error: "Danışan doğrulanamadı." },
        { status: 403 },
      );
    }

    const storagePath = `${tenantId}/${clientId}/bodygraph.${ext}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: MIME_BY_EXT[ext] ?? "image/jpeg",
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

    await db
      .from("human_design_clients")
      .update({ chart_image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", clientId)
      .eq("tenant_id", tenantId);

    return NextResponse.json({ ok: true, publicUrl, storagePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
