import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireClientInTenant } from "@/lib/danisan/clientGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

/**
 * Plan editörü ortak erişim kapısı (uzman erişimi AŞAMA 2).
 *
 * OWNER GLOBAL AKIŞI ile EXPERT CLIENT-SCOPED AKIŞINI AYIRIR — requireBeslenmeOwner
 * GLOBAL olarak gevşetilmez. İki authority:
 *   - "owner"  : super-admin. Mevcut owner davranışı; unbound/global plan da erişilebilir.
 *   - "expert" : clients yetkili uzman. Plan MUTLAKA kendi tenant'ında + kendi danışanına
 *                (nutrition_plan_clients binding) bağlı olmalı; aksi halde fail-closed.
 *
 * Expert erişim zinciri (hepsi server-authoritative):
 *   requireModuleAccess("clients") → tenant plan (.eq tenant_id .eq id) → plan_family_id
 *   → nutrition_plan_clients binding → boundClientId → requireClientInTenant(tenant, client).
 * UNBOUND plan (expert) → FAIL. Başka tenant planı → FAIL (plan zaten tenant-scoped çözülür).
 *
 * Kimlik: tenantId yalnız session'dan; planId path'ten. Body/query'den tenant/client/user
 * kimliği ASLA kabul edilmez. Sızıntı önlemek için tüm expert-red durumları PLAN_NOT_FOUND(404).
 */
export type BeslenmePlanAuthority = "owner" | "expert";
export type BeslenmePlanRow = { id: string; plan_family_id: string; status: string };

export type BeslenmePlanAccessOk = {
  ok: true;
  db: SupabaseClient;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  authority: BeslenmePlanAuthority;
  plan: BeslenmePlanRow;
  /** Bağlı danışan. Expert'te ZORUNLU non-null; owner'da binding varsa dolu, yoksa null. */
  boundClientId: string | null;
};
export type BeslenmePlanAccessResult = BeslenmePlanAccessOk | { ok: false; response: NextResponse };

export async function requireBeslenmePlanAccess(
  req: NextRequest,
  planId: string,
): Promise<BeslenmePlanAccessResult> {
  const guard = await requireModuleAccess(req, "clients");
  if (!guard.ok) return { ok: false, response: guard.response };
  const { db, tenantId } = guard;

  if (!isUuid(planId)) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };

  // Plan yalnız session-tenant içinde çözülür → başka tenant planı görünmez (404).
  const { data: planData } = await db
    .from("nutrition_plans")
    .select("id, plan_family_id, status")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();
  if (!planData) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };
  const plan = planData as BeslenmePlanRow;

  // Family binding'i (varsa) çöz — owner context'i + expert authz için.
  const { data: bindData } = await db
    .from("nutrition_plan_clients")
    .select("client_id")
    .eq("tenant_id", tenantId)
    .eq("plan_family_id", plan.plan_family_id)
    .maybeSingle();
  const boundClientId = (bindData as { client_id?: string } | null)?.client_id ?? null;

  const base = {
    db,
    userId: guard.userId,
    tenantId,
    email: guard.email,
    is_demo_account: guard.is_demo_account,
    plan,
  } as const;

  // OWNER (super-admin) → mevcut global davranış; unbound plan da erişilebilir.
  const owner = await requireMainAdmin(db, guard.userId);
  if (owner.ok) {
    return { ok: true, ...base, authority: "owner", boundClientId };
  }

  // EXPERT → plan MUTLAKA kendi danışanına bağlı olmalı (unbound = fail-closed).
  if (!boundClientId) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };
  const client = await requireClientInTenant(db, tenantId, boundClientId);
  if (!client) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };

  return { ok: true, ...base, authority: "expert", boundClientId };
}
