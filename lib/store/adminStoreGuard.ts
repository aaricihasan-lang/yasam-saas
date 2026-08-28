/**
 * lib/store/adminStoreGuard.ts — Doğal Pazar admin route'ları için OWNER-ONLY guard.
 *
 * Mevcut canonical primitive'leri KOMPOZE eder (yeni auth icat edilmez):
 *   1. verifyAdminRequest  → x-admin-id + x-session-token + DB (role=admin, active).
 *   2. requireMainAdmin    → users.is_super_admin (ana yönetici) — hard-coded email YOK.
 *
 * Mağaza yönetimi tek-satıcılı platform içeriğidir → yalnız ana yönetici (owner)
 * yönetebilir. Başarılıysa service_role db + adminId döner.
 */

import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminRequest } from "@/lib/auth/adminGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";

export type StoreAdminGuardOk = { ok: true; adminId: string; db: SupabaseClient };
export type StoreAdminGuardFail = { ok: false; response: NextResponse };
export type StoreAdminGuardResult = StoreAdminGuardOk | StoreAdminGuardFail;

export async function requireStoreAdmin(req: NextRequest): Promise<StoreAdminGuardResult> {
  const guard = await verifyAdminRequest(req);
  if (!guard.ok) return { ok: false, response: guard.response };

  const owner = await requireMainAdmin(guard.db, guard.adminId);
  if (!owner.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: owner.error, code: "STORE_OWNER_ONLY" },
        { status: owner.status },
      ),
    };
  }

  return { ok: true, adminId: guard.adminId, db: guard.db };
}
