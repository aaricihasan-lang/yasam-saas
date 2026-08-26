import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { buildTenantDisplayName, buildTenantSlugBase } from "@/lib/auth/createExpertTenant";
import { provisionExpert } from "@/lib/auth/provisionExpert";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";

export const runtime = "nodejs";

/**
 * POST /api/register
 *
 * Public kayıt endpoint — kullanıcı kendi hesabını oluşturur (service_role).
 * BF-11F-B: tenant+user artık atomik `provision_expert` RPC'sinde oluşturulur;
 * bu route tenant/users INSERT veya rollback YAPMAZ. Şifre server-side bcrypt ile
 * hashlenir (hash_password RPC — DB mutasyonu değildir). Public kayıt DEĞİŞMEZ
 * biçimde: role=expert, active=false, approval_status=pending (RPC server-forced).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    password?: string;
  };

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();

  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "Tüm alanları doldurunuz.", code: "missing_fields" }, { status: 400 });
  }

  let db: ReturnType<typeof getServerDb>;
  try {
    db = getServerDb();
  } catch {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası.", code: "config" }, { status: 500 });
  }

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC; DB mutasyonu değil).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", { p_plain: password });
  if (hashError || !hashResult) {
    return NextResponse.json({ error: "Şifre işlenemedi.", code: "hash" }, { status: 500 });
  }

  // Atomik provisioning (tenant+user+event TEK transaction). E-posta tekilliği +
  // race güvenliği DB'de (UNIQUE normalized email); orphan tenant üretilmez.
  const result = await provisionExpert(db, {
    mode: "public",
    email,
    passwordHash: hashResult as string,
    fullName,
    tenantName: buildTenantDisplayName(fullName, email),
    tenantSlugBase: buildTenantSlugBase(fullName, email),
    modulePermissions: DEFAULT_MODULE_PERMISSIONS,
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  if (result.outcome === "already_exists") {
    return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı.", code: "already_exists" }, { status: 409 });
  }
  if (result.outcome === "idempotency_key_conflict") {
    return NextResponse.json({ error: "İşlem kimliği çakışması.", code: "idempotency" }, { status: 409 });
  }
  return NextResponse.json({ error: "Kayıt oluşturulamadı.", code: "failed" }, { status: 500 });
}
