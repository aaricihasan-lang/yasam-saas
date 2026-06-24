import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service role yapılandırması eksik.");
  return createClient(url, key);
}

/**
 * GET /api/kisisel-arsiv/signed-url
 *
 * Service role key ile personal-archive bucket'ı için kısa ömürlü (3600s) signed URL üretir.
 *
 * Güvenlik katmanları:
 * 1. userId zorunlu → 401
 * 2. tenantId zorunlu → 401
 * 3. filePath zorunlu → 400
 * 4. filePath bu tenantId prefix'i ile başlamalı → 403 (path traversal koruması)
 * 5. users tablosunda id=userId AND tenant_id=tenantId AND active=true → 403
 * 6. Tüm kontroller geçti → service role ile signed URL → 200
 *
 * Anon client asla storage'a dokunmaz; bucket PRIVATE olabilir.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("filePath")?.trim() ?? "";
    const tenantId = searchParams.get("tenantId")?.trim() ?? "";
    const userId   = searchParams.get("userId")?.trim()   ?? "";

    if (!userId || !tenantId) {
      return NextResponse.json({ error: "Oturum bilgisi eksik." }, { status: 401 });
    }

    if (!filePath) {
      return NextResponse.json({ error: "Dosya yolu gerekli." }, { status: 400 });
    }

    // Path traversal koruması: filePath mutlaka bu tenantId'ye ait klasörde olmalı
    if (!filePath.startsWith(`${tenantId}/`)) {
      return NextResponse.json({ error: "Geçersiz dosya yolu." }, { status: 403 });
    }

    const db = getDb();

    // userId + tenantId çiftini users tablosunda doğrula
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

    // Demo hesap: signed URL üretimi engellenir.
    if (userRow.is_demo_account === true) {
      return NextResponse.json({ error: "Demo hesabında bu işlem kullanılamaz." }, { status: 403 });
    }

    // Service role ile signed URL üret (bucket PRIVATE olsa bile çalışır)
    const { data: signed, error: signErr } = await db.storage
      .from("personal-archive")
      .createSignedUrl(filePath, 3600);

    if (signErr || !signed?.signedUrl) {
      console.error("[kisisel-arsiv/signed-url]", signErr);
      return NextResponse.json({ error: "URL üretilemedi." }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: signed.signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
