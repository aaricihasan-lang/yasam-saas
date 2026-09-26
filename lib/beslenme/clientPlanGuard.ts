import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { beslenmeJson } from "@/lib/beslenme/ownerGuard";
import { requireClientInTenant } from "@/lib/danisan/clientGuard";
import { isUuid } from "@/lib/beslenme/planContracts";

/**
 * Plan editörü ortak erişim kapısı — CAPABILITY (yetenek) tabanlı, ROLE tabanlı DEĞİL.
 *
 * Kanonik ürün kuralı: Beslenme normal bir modüldür → admin = yetkili uzman. Erişim
 * ROLE ile değil YETENEK ile çözülür (admin resolveModuleAccess short-circuit ile zaten
 * hasBeslenme=true olur; ek requireMainAdmin GEREKMEZ). İki authority:
 *   - "module" : Beslenme modül izinli kullanıcı (admin dahil). KENDİ tenant'ındaki
 *                bound VEYA unbound tüm planları kullanabilir (global Beslenme semantiği).
 *   - "client" : Beslenme izni OLMAYAN ama Danışan Yolculuğu (clients) izinli uzman.
 *                Plan MUTLAKA kendi tenant'ında + kendi danışanına (nutrition_plan_clients
 *                binding) bağlı olmalı; UNBOUND plan → fail-closed (404).
 *
 * Erişim zinciri (hepsi server-authoritative):
 *   verifyUserRequest(includeProfile) → tenant plan (.eq tenant_id .eq id) → plan_family_id
 *   → nutrition_plan_clients binding → (client authority'de) requireClientInTenant.
 * Beslenme+clients izni olmayan → 403. Başka tenant planı → 404 (plan tenant-scoped çözülür).
 *
 * Kimlik: tenantId yalnız session/profile'dan; planId path'ten. Body/query'den tenant/client/user
 * kimliği ASLA kabul edilmez. Sızıntı önlemek için tüm red durumları PLAN_NOT_FOUND(404),
 * yalnız "hiç modül izni yok" → FORBIDDEN(403).
 */
export type BeslenmePlanAuthority = "module" | "client";
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
  /** Bağlı danışan. client authority'de ZORUNLU non-null; module authority'de binding varsa dolu, yoksa null. */
  boundClientId: string | null;
};
export type BeslenmePlanAccessResult = BeslenmePlanAccessOk | { ok: false; response: NextResponse };

export async function requireBeslenmePlanAccess(
  req: NextRequest,
  planId: string,
): Promise<BeslenmePlanAccessResult> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };
  const { db, tenantId } = guard;

  // Yetenekler SAF resolveModuleAccess ile (admin role short-circuit → hasBeslenme=true).
  const role = guard.profile?.role;
  const perms = guard.profile?.module_permissions;
  const hasBeslenme = resolveModuleAccess(role, perms, "beslenme");
  const hasClients = resolveModuleAccess(role, perms, "clients");
  if (!hasBeslenme && !hasClients) {
    return { ok: false, response: beslenmeJson({ ok: false, code: "FORBIDDEN" }, 403) };
  }

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

  // Family binding'i (varsa) çöz — module context + client authz için.
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

  // MODULE (Beslenme izinli; admin dahil) → kendi tenant'ındaki bound/unbound tüm planlar.
  if (hasBeslenme) {
    return { ok: true, ...base, authority: "module", boundClientId };
  }

  // CLIENT-ONLY (yalnız clients izni) → plan MUTLAKA kendi danışanına bağlı olmalı (unbound = fail-closed).
  if (!boundClientId) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };
  const client = await requireClientInTenant(db, tenantId, boundClientId);
  if (!client) return { ok: false, response: beslenmeJson({ ok: false, code: "PLAN_NOT_FOUND" }, 404) };

  return { ok: true, ...base, authority: "client", boundClientId };
}
