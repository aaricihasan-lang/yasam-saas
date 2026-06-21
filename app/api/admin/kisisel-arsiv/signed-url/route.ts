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
 * GET /api/admin/kisisel-arsiv/signed-url
 *
 * Admin paneli için personal-archive dosya signed URL'i üretir.
 * Yalnızca role=admin kullanıcılar erişebilir; tenant kısıtlaması yoktur.
 *
 * Güvenlik katmanları:
 * 1. adminUserId zorunlu → 401
 * 2. filePath zorunlu → 400
 * 3. users tablosunda adminUserId role=admin AND active=true → 403
 * 4. Service role ile signed URL → 200
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath    = searchParams.get("filePath")?.trim()    ?? "";
    const adminUserId = searchParams.get("adminUserId")?.trim() ?? "";

    if (!adminUserId) {
      return NextResponse.json({ error: "Oturum bilgisi eksik." }, { status: 401 });
    }

    if (!filePath) {
      return NextResponse.json({ error: "Dosya yolu gerekli." }, { status: 400 });
    }

    const db = getDb();

    // Admin rol doğrulaması
    const { data: adminRow, error: adminErr } = await db
      .from("users")
      .select("id, role")
      .eq("id", adminUserId)
      .eq("active", true)
      .maybeSingle();

    if (adminErr || !adminRow || adminRow.role !== "admin") {
      return NextResponse.json({ error: "Yetki yok." }, { status: 403 });
    }

    // Service role ile signed URL üret (bucket PRIVATE olsa bile çalışır)
    const { data: signed, error: signErr } = await db.storage
      .from("personal-archive")
      .createSignedUrl(filePath, 3600);

    if (signErr || !signed?.signedUrl) {
      console.error("[admin/kisisel-arsiv/signed-url]", signErr);
      return NextResponse.json({ error: "URL üretilemedi." }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: signed.signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
