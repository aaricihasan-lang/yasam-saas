import { NextRequest, NextResponse } from "next/server";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { USERS_SAFE_SELECT } from "@/lib/supabase-server";
import { buildTenantDisplayName, buildTenantSlugBase } from "@/lib/auth/createExpertTenant";
import { provisionExpert } from "@/lib/auth/provisionExpert";
import { DEFAULT_MODULE_PERMISSIONS } from "@/lib/auth/modulePermissions";
import { requireMainAdmin } from "@/lib/admin/adminGuards";

export const runtime = "nodejs";

/** GET /api/admin/users — tüm kullanıcıları listele (password hariç) */
export async function GET(req: NextRequest) {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return guard.response;
  const { db } = guard;

  const [usersResult, eventsResult] = await Promise.all([
    db
      .from("users")
      .select(USERS_SAFE_SELECT)
      .order("created_at", { ascending: false }),
    db
      .from("security_events")
      .select("user_id, severity")
      .in("severity", ["medium", "high"]),
  ]);

  if (usersResult.error) {
    return NextResponse.json({ error: usersResult.error.message }, { status: 500 });
  }

  // user_id → şüpheli olay sayısı
  const suspiciousCounts: Record<string, number> = {};
  for (const ev of eventsResult.data ?? []) {
    const uid = ev.user_id as string;
    suspiciousCounts[uid] = (suspiciousCounts[uid] ?? 0) + 1;
  }

  return NextResponse.json({ users: usersResult.data ?? [], suspiciousCounts });
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
  const role: "admin" | "expert" = body.role === "admin" ? "admin" : "expert";
  const active = body.active !== false;

  // Yeni admin oluşturma yalnız ANA YÖNETİCİYE açıktır (Faz 1/P1). is_super_admin
  // client body'sinden GELMEZ ve provisionExpert kabul etmez → yeni kullanıcıda false kalır.
  if (role === "admin") {
    const main = await requireMainAdmin(db, guard.adminId);
    if (!main.ok) return NextResponse.json({ error: main.error }, { status: main.status });
  }

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { error: "Ad soyad, e-posta ve şifre zorunludur." },
      { status: 400 },
    );
  }

  // Şifreyi server-side bcrypt ile hashle (pgcrypto RPC; DB mutasyonu değil).
  const { data: hashResult, error: hashError } = await db.rpc("hash_password", {
    p_plain: password,
  });
  if (hashError || !hashResult) {
    return NextResponse.json({ error: "Şifre hashlenemedi." }, { status: 500 });
  }

  // BF-11F-B: tenant+user+admin_audit_log TEK atomik `provision_expert` transaction'ında;
  // route tenant/users INSERT veya rollback YAPMAZ. Mevcut rol/active/default davranışı
  // korunur (admin: DB default'lar; expert: module_permissions + trial). actor_admin_id
  // client body'sinden DEĞİL, admin guard'dan gelir.
  const result = await provisionExpert(db, {
    mode: "admin",
    email,
    passwordHash: hashResult as string,
    fullName,
    tenantName: buildTenantDisplayName(fullName, email),
    tenantSlugBase: buildTenantSlugBase(fullName, email),
    role,
    active,
    actorAdminId: guard.adminId,
    ...(role === "expert" ? { modulePermissions: DEFAULT_MODULE_PERMISSIONS } : {}),
  });

  if (result.ok) {
    return NextResponse.json({ ok: true });
  }
  if (result.outcome === "already_exists") {
    return NextResponse.json({ error: "Bu e-posta adresi zaten kayıtlı." }, { status: 409 });
  }
  if (result.outcome === "idempotency_key_conflict") {
    return NextResponse.json({ error: "İşlem kimliği çakışması." }, { status: 409 });
  }
  return NextResponse.json({ error: "Kayıt oluşturulamadı." }, { status: 500 });
}
