import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";

/**
 * Beslenme OWNER-ONLY server kapısı.
 *
 * OWNER-ONLY ≠ ADMIN-ONLY. `resolveModuleAccess` tüm role='admin' kullanıcılarını
 * geçirir; owner (sistem sahibi / super-admin) daraltması ayrıca gereklidir.
 *
 * Katmanlar (sırayla):
 *   1) requireModuleAccess(req, "beslenme") → header-token binding + pending/rejected gate
 *      + modül kapısı (uzman/anon 403; admin geçer).
 *   2) requireMainAdmin(db, userId) → users.is_super_admin (adminGuards; normal admin 403).
 * Böylece: super-admin geçer; normal admin 403; expert 403; anon 401.
 *
 * Uzmanlara açılış fazında (ileride): 2. adım kaldırılır + moduleAccess `hasFlag`'e döner.
 * Schema/RLS DEĞİŞMEZ (owner-only yalnız feature-visibility katmanıdır).
 */
export type BeslenmeOwnerOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
};
export type BeslenmeOwnerResult = BeslenmeOwnerOk | { ok: false; response: NextResponse };

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function requireBeslenmeOwner(req: NextRequest): Promise<BeslenmeOwnerResult> {
  const guard = await requireModuleAccess(req, "beslenme");
  if (!guard.ok) return { ok: false, response: guard.response };

  const owner = await requireMainAdmin(guard.db, guard.userId);
  if (!owner.ok) {
    return {
      ok: false,
      response: jsonNoStore(
        { ok: false, code: "OWNER_ONLY", error: owner.error },
        owner.status,
      ),
    };
  }

  return {
    ok: true,
    userId: guard.userId,
    tenantId: guard.tenantId,
    email: guard.email,
    is_demo_account: guard.is_demo_account,
    db: guard.db,
  };
}

/** Demo hesap mutation reddi (owner gate'ten SONRA, yazma route'larında). */
export function denyDemoMutation(guard: BeslenmeOwnerOk): NextResponse | null {
  if (guard.is_demo_account) {
    return jsonNoStore(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında değişiklik yapılamaz." },
      403,
    );
  }
  return null;
}

export { jsonNoStore as beslenmeJson };
