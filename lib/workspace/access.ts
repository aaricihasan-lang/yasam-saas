/**
 * KİŞİSEL DİJİTAL OFİS — kullanıcı bazlı kademeli açılış (YALNIZ SUNUCU).
 *
 * Erişim = EXPERT_WORKSPACE_DESIGN_ENABLED (genel bayrak, P1) VE aşağıdakilerden biri:
 *   1) Owner (users.is_super_admin — lib/admin/adminGuards.resolveIsSuperAdmin, mevcut doğrulanmış mekanizma)
 *   2) Owner'ın verdiği, geri alınmamış izin (expert_workspace_access_grants; izin verildiği tenant ile aynı tenant)
 *   3) EXPERT_WORKSPACE_ROLLOUT_ALL = "true" (Owner'ın AYRI onayıyla bütün uzmanlar)
 * Varsayılan KAPALI. İzin listesi yalnız Owner uçlarından (verifyAdminRequest + requireMainAdmin) değişir; uzman kendine
 * yetki veremez (DB CHECK user_id <> granted_by + uç Owner'a kapalı). Yetkisiz kullanıcı için uçlar 404 döner.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { resolveIsSuperAdmin } from "@/lib/admin/adminGuards";
import { isWorkspaceDesignEnabled, isWorkspaceRolloutAll } from "./flags";

assertServerOnly("lib/workspace/access");

export const GRANTS_TABLE = "expert_workspace_access_grants";
export type AccessReason = "flag_off" | "owner" | "grant" | "rollout_all" | "not_allowed" | "error";

export async function workspaceAccess(db: SupabaseClient, userId: string, tenantId: string): Promise<{ allowed: boolean; reason: AccessReason }> {
  if (!isWorkspaceDesignEnabled()) return { allowed: false, reason: "flag_off" };
  if (isWorkspaceRolloutAll()) return { allowed: true, reason: "rollout_all" };
  try {
    if (await resolveIsSuperAdmin(db, userId)) return { allowed: true, reason: "owner" };
  } catch {
    return { allowed: false, reason: "error" };
  }
  const { data, error } = await db.from(GRANTS_TABLE).select("id, tenant_id").eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (error) return { allowed: false, reason: "error" };
  if (data && (data as { tenant_id: string }).tenant_id === tenantId) return { allowed: true, reason: "grant" };
  return { allowed: false, reason: "not_allowed" };
}

export type GrantRow = { id: string; tenant_id: string; user_id: string; granted_by: string; granted_at: string; note: string | null; revoked_by: string | null; revoked_at: string | null; revoke_reason: string | null };
const GRANT_COLS = "id, tenant_id, user_id, granted_by, granted_at, note, revoked_by, revoked_at, revoke_reason";

export async function listGrants(db: SupabaseClient): Promise<{ ok: true; grants: GrantRow[] } | { ok: false; cause: unknown }> {
  const { data, error } = await db.from(GRANTS_TABLE).select(GRANT_COLS).order("granted_at", { ascending: false }).limit(500);
  if (error) return { ok: false, cause: error };
  return { ok: true, grants: (data ?? []) as GrantRow[] };
}

export type GrantResult =
  | { ok: true; grant: GrantRow }
  | { ok: false; status: 400 | 404 | 409; error: string }
  | { ok: false; status: 500; cause: unknown };

/** Owner yalnız onaylı, etkin, demo olmayan UZMANA izin verebilir. */
export async function grantAccess(db: SupabaseClient, ownerId: string, targetUserId: string, note: string | null): Promise<GrantResult> {
  if (targetUserId === ownerId) return { ok: false, status: 400, error: "Owner kendine izin vermez (Owner zaten erişir)." };
  const u = await db.from("users").select("id, role, active, approval_status, is_demo_account, tenant_id").eq("id", targetUserId).maybeSingle();
  if (u.error) return { ok: false, status: 500, cause: u.error };
  const user = u.data as { role: string | null; active: boolean | null; approval_status: string | null; is_demo_account: boolean | null; tenant_id: string | null } | null;
  if (!user) return { ok: false, status: 404, error: "Kullanıcı bulunamadı." };
  if (user.role !== "expert" || user.active !== true || user.approval_status !== "approved" || user.is_demo_account === true || !user.tenant_id) {
    return { ok: false, status: 400, error: "İzin yalnız onaylı, etkin ve demo olmayan uzmana verilebilir." };
  }
  const active = await db.from(GRANTS_TABLE).select("id", { count: "exact", head: true }).eq("user_id", targetUserId).is("revoked_at", null);
  if (active.error) return { ok: false, status: 500, cause: active.error };
  if ((active.count ?? 0) > 0) return { ok: false, status: 409, error: "Bu uzmanın zaten etkin izni var." };
  const ins = await db.from(GRANTS_TABLE).insert({ tenant_id: user.tenant_id, user_id: targetUserId, granted_by: ownerId, note }).select(GRANT_COLS).single();
  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") return { ok: false, status: 409, error: "Bu uzmanın zaten etkin izni var." };
    return { ok: false, status: 500, cause: ins.error };
  }
  return { ok: true, grant: ins.data as GrantRow };
}

export async function revokeAccess(db: SupabaseClient, ownerId: string, targetUserId: string, reason: "owner_revoked" | "other"): Promise<GrantResult> {
  const upd = await db
    .from(GRANTS_TABLE)
    .update({ revoked_by: ownerId, revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq("user_id", targetUserId)
    .is("revoked_at", null)
    .select(GRANT_COLS);
  if (upd.error) return { ok: false, status: 500, cause: upd.error };
  const rows = (upd.data ?? []) as GrantRow[];
  if (rows.length !== 1) return { ok: false, status: 404, error: "Etkin izin bulunamadı." };
  return { ok: true, grant: rows[0] };
}
