import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { createTenantForNewUser, deleteTenantById } from "@/lib/auth/createExpertTenant";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";

export const runtime = "nodejs";

/** GET /api/admin/users — tüm kullanıcıları listele (password hariç) */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const { data, error } = await db
    .from("users")
    .select(USERS_SAFE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

/** POST /api/admin/users — yeni kullanıcı oluştur */
export async function POST(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const body = (await req.json()) as {
    fullName?: string;
    email?: string;
    password?: string;
    role?: string;
    active?: boolean;
  };

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "").trim();
  const role = body.role === "admin" ? "admin" : "expert";
  const active = body.active !== false;

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { error: "Ad soyad, e-posta ve şifre zorunludur." },
      { status: 400 },
    );
  }

  // E-posta tekrar kontrolü — DB unique constraint öncesi hızlı kontrol
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

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC)
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", {
    p_plain: password,
  });

  if (hashError || !hashResult) {
    return NextResponse.json(
      { error: "Şifre hashlenemedi: " + (hashError?.message ?? "bilinmeyen hata") },
      { status: 500 },
    );
  }

  const tenantResult = await createTenantForNewUser({ fullName, email });
  if (!tenantResult.ok) {
    return NextResponse.json(
      { error: "Çalışma alanı oluşturulamadı: " + tenantResult.error },
      { status: 500 },
    );
  }

  const tenantId = tenantResult.tenantId;
  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 7);

  const payload: Record<string, unknown> = {
    full_name: fullName,
    email,
    password_hash: hashResult as string,
    role,
    active,
    approval_status: active ? "approved" : "pending",
    tenant_id: tenantId,
  };

  if (role === "expert") {
    payload.module_permissions = DEFAULT_MODULE_PERMISSIONS;
    if (active) {
      payload.plan = "trial";
      payload.subscription_status = "trial";
      payload.trial_started_at = now.toISOString();
      payload.trial_ends_at = trialEnds.toISOString();
    }
  }

  const { error: insertError } = await db.from("users").insert(payload);

  if (insertError) {
    await deleteTenantById(tenantId);
    return NextResponse.json(
      { error: "Kayıt hatası: " + insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
