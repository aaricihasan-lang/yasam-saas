import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess, verifyUserRequest } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";

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
export type BeslenmeModuleOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
};
export type BeslenmeModuleResult = BeslenmeModuleOk | { ok: false; response: NextResponse };

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Beslenme MODÜL kapısı (admin↔uzman özellik paritesi).
 *
 * requireModuleAccess(req, "beslenme") → admin geçer; module_permissions.beslenme===true
 * uzman geçer; izinsiz uzman/anon/pending mevcut sistem kurallarıyla reddedilir. tenantId
 * YALNIZ doğrulanmış session'dan; body/query/path'ten tenant seçilmez. Veri erişimi her
 * route'ta ayrıca .eq("tenant_id", tenantId) ile tenant-scoped kalır (owner-only faz kaldırıldı).
 */
export async function requireBeslenmeModule(req: NextRequest): Promise<BeslenmeModuleResult> {
  const guard = await requireModuleAccess(req, "beslenme");
  if (!guard.ok) return { ok: false, response: guard.response };
  return {
    ok: true,
    userId: guard.userId,
    tenantId: guard.tenantId,
    email: guard.email,
    is_demo_account: guard.is_demo_account,
    db: guard.db,
  };
}

/**
 * Beslenme YETENEK (capability) çözümleyici — CAPABILITY tabanlı yüzeyler için ortak kapı.
 *
 * verifyUserRequest(includeProfile) (header-token binding + pending/rejected gate) üzerine,
 * SAF resolveModuleAccess ile hem `beslenme` hem `clients` yeteneğini çözer. En az biri yoksa
 * → 403. Admin role short-circuit ile hasBeslenme=true olur → admin↔uzman paritesi. tenantId
 * DAİMA server session'dan; body/query'den tenant seçimi YOK. Kullanım: /access probe,
 * capability-aware template LIST (Beslenme VEYA Danışan Yolculuğu izinli görebilir).
 */
export type BeslenmeCapabilitiesOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
  hasBeslenme: boolean;
  hasClients: boolean;
};
export type BeslenmeCapabilitiesResult =
  | BeslenmeCapabilitiesOk
  | { ok: false; response: NextResponse };

export async function resolveBeslenmeCapabilities(
  req: NextRequest,
): Promise<BeslenmeCapabilitiesResult> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };
  const role = guard.profile?.role;
  const perms = guard.profile?.module_permissions;
  const hasBeslenme = resolveModuleAccess(role, perms, "beslenme");
  const hasClients = resolveModuleAccess(role, perms, "clients");
  if (!hasBeslenme && !hasClients) {
    return {
      ok: false,
      response: jsonNoStore(
        { ok: false, code: "FORBIDDEN", error: "Bu modül hesabınız için aktif değil." },
        403,
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
    hasBeslenme,
    hasClients,
  };
}

/** Demo hesap mutation reddi (owner/contributor gate'ten SONRA, yazma route'larında). */
export function denyDemoMutation(guard: { is_demo_account: boolean }): NextResponse | null {
  if (guard.is_demo_account) {
    return jsonNoStore(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında değişiklik yapılamaz." },
      403,
    );
  }
  return null;
}

// ============================================================
// Besin OKUMA kapısı (read-only) — plan editörü besin seçimi
// ============================================================
//
// NOT: Ayrı "Manuel Besin KATKI" (beslenme_manual_food) yeteneği üründen KALDIRILDI. CUSTOM besin
// OLUŞTUR/DÜZENLE/ARŞİVLE artık TAM Beslenme modülünün içindedir (/beslenme/besinler) ve food
// MUTATION route'ları requireBeslenmeModule (admin role short-circuit + beslenme=true) ile korunur.
// Eski module_permissions.beslenme_manual_food anahtarı artık HİÇBİR YERDE OKUNMAZ → inert legacy.

/**
 * READ ≠ AUTHORING. Plan editörü SYSTEM ∪ kendi tenant CUSTOM besinlerini okuyup
 * seçebilmeli; bunun için besin-katkı (yazma) bayrağı GEREKMEZ.
 *
 * Geçer (salt-okuma): admin (role short-circuit) VEYA clients (Danışan Yolculuğu) VEYA tam
 * Beslenme modülü. Manuel-besin bayrağı KALDIRILDI. tenantId YALNIZ doğrulanmış users.tenant_id;
 * food scope {SYSTEM ∪ caller} (foodEngine). Mutation buraya BAĞLI DEĞİL — POST/PATCH/DELETE
 * requireBeslenmeModule (tam Beslenme) + resolveFoodForWrite (SYSTEM_READONLY) + denyDemoMutation.
 */
export type BeslenmeFoodReadOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  db: SupabaseClient;
};
export type BeslenmeFoodReadResult = BeslenmeFoodReadOk | { ok: false; response: NextResponse };

export async function requireBeslenmeFoodRead(req: NextRequest): Promise<BeslenmeFoodReadResult> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };

  const perms = guard.profile?.module_permissions;
  const allowed =
    resolveModuleAccess(guard.profile?.role, perms, "clients") ||
    resolveModuleAccess(guard.profile?.role, perms, "beslenme");
  if (!allowed) {
    return {
      ok: false,
      response: jsonNoStore(
        { ok: false, code: "FOOD_READ_DENIED", error: "Besin kataloğu erişiminiz yok." },
        403,
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

export { jsonNoStore as beslenmeJson };
