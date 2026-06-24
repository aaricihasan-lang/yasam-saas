import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";

export const runtime = "nodejs";

/**
 * GET /api/auth/profile — oturum açmış kullanıcının güncel profili (Faz 2A).
 *
 * Amaç: Profil yenileme artık tarayıcıdan publishable key ile users tablosunu
 *       okumaz; service_role'lü bu route üzerinden gelir.
 *
 * Güvenlik:
 *   - verifyUserRequest → x-user-id + x-session-token + token↔user_id binding.
 *   - user_id SUNUCUDA oturum token'ından doğrulanır.
 *   - Yalnızca GÜVENLİ whitelist kolonları döner.
 *   - password / password_hash KESİNLİKLE seçilmez/dönmez.
 */

// Güvenli profil kolonları — password / password_hash YOK.
const PROFILE_SELECT =
  "id, email, full_name, name, role, active, approval_status, module_permissions, " +
  "package_type, membership_status, subscription_status, trial_started_at, trial_ends_at, " +
  "membership_started_at, membership_ends_at, plan, admin_level, tenant_id, status, is_demo_account";

export async function GET(req: NextRequest): Promise<Response> {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;

  const { db, userId } = guard;

  const { data, error } = await db
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Kullanıcı bulunamadı." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, profile: data });
}
