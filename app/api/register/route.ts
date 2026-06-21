import { NextRequest, NextResponse } from "next/server";
import { getServerDb } from "@/lib/supabase-server";
import { createTenantForNewUser, deleteTenantById } from "@/lib/auth/createExpertTenant";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";

export const runtime = "nodejs";

/**
 * POST /api/register
 *
 * Public kayıt endpoint — kullanıcı kendi hesabını oluşturur.
 * RLS nedeniyle client-side insert artık çalışmaz; bu route service_role kullanır.
 * Şifre server-side bcrypt ile hashlenir.
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
    return NextResponse.json(
      { error: "Tüm alanları doldurunuz." },
      { status: 400 },
    );
  }

  let db: ReturnType<typeof getServerDb>;
  try {
    db = getServerDb();
  } catch {
    return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 500 });
  }

  // E-posta tekrar kontrolü
  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Bu e-posta adresi zaten kayıtlı." },
      { status: 409 },
    );
  }

  // Şifreyi server-side bcrypt ile hashle
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", {
    p_plain: password,
  });

  if (hashError || !hashResult) {
    return NextResponse.json(
      { error: "Şifre işlenemedi: " + (hashError?.message ?? "bilinmeyen hata") },
      { status: 500 },
    );
  }

  const tenantResult = await createTenantForNewUser({ fullName, email });
  if (!tenantResult.ok) {
    return NextResponse.json(
      { error: tenantResult.error },
      { status: 500 },
    );
  }

  const tenantId = tenantResult.tenantId;
  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 7);

  const { error: insertError } = await db.from("users").insert([
    {
      full_name: fullName,
      email,
      password_hash: hashResult as string,
      role: "expert",
      active: false,
      approval_status: "pending",
      module_permissions: DEFAULT_MODULE_PERMISSIONS,
      tenant_id: tenantId,
      plan: "trial",
      subscription_status: "trial",
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
    },
  ]);

  if (insertError) {
    await deleteTenantById(tenantId);
    return NextResponse.json(
      { error: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
