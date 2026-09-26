import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireModuleAccess, verifyUserRequest } from "@/lib/auth/userGuard";
import { resolveModuleAccess } from "@/lib/auth/moduleAccess";
import { requireMainAdmin } from "@/lib/admin/adminGuards";
import {
  BESLENME_MANUAL_FOOD_FLAG,
  decideFoodContributorAuthority,
  hasManualFoodFlag,
  type BeslenmeContributorAuthority,
} from "@/lib/beslenme/foodContributorPolicy";

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
// Manuel Besin KATKI kapısı (owner + dar-yetkili uzman) — FAZ: manuel-besin
// ============================================================

/**
 * DAR yetenek bayrağı: uzmanın KENDİ tenant'ına manuel besin ekleme/tamamlama izni.
 *
 * LEGACY DAR BAYRAK (backward-compat). Beslenme artık NORMAL modüldür
 * (module_permissions.beslenme=true → requireBeslenmeModule). Bu bayrak, beslenme/clients
 * modül izni OLMAYAN eski uzmanlar için besin-katkı uçlarını (kendi CUSTOM besni
 * oluştur/oku/güncelle/arşivle +
 * nutrient/porsiyon tamamla) açar. SYSTEM katalog (1258 kayıt) HERKES için salt
 * okunurdur (resolveFoodForWrite → SYSTEM_READONLY 403). tenant_id DAİMA server-side
 * doğrulanmış oturumdan gelir (users.tenant_id); body/query'den tenant seçimi YOK.
 *
 * Bayrak module_permissions JSONB içinde saklanır (mevcut flag-bag mimarisi; yeni
 * tablo/kolon YOK). Hiçbir uzmanda varsayılan olarak bulunmaz → pratikte gated-off;
 * owner (super-admin) her zaman geçer (küratör). Bayrağı verecek admin UI ayrı bir
 * aktivasyon adımıdır (bkz. final rapor). SAF karar mantığı foodContributorPolicy'de.
 */
export { BESLENME_MANUAL_FOOD_FLAG };
export type { BeslenmeContributorAuthority };

export type BeslenmeContributorOk = {
  ok: true;
  userId: string;
  tenantId: string;
  email: string;
  is_demo_account: boolean;
  /** owner = super-admin küratör; expert = dar bayraklı uzman (yalnız kendi tenant). */
  authority: BeslenmeContributorAuthority;
  db: SupabaseClient;
};
export type BeslenmeContributorResult =
  | BeslenmeContributorOk
  | { ok: false; response: NextResponse };

/**
 * Besin-katkı server kapısı. Geçer:
 *   - owner (super-admin) → authority='owner' (mevcut requireBeslenmeOwner ile parite).
 *   - dar bayraklı uzman (module_permissions.beslenme_manual_food===true) → authority='expert'.
 * Aksi halde 403. Kimlik/oturum bağlama + pending/rejected gate verifyUserRequest'ten gelir.
 * tenantId ASLA body/query'den; yalnız doğrulanmış users.tenant_id. Karar SAF
 * decideFoodContributorAuthority (foodContributorPolicy) ile verilir.
 */
export async function requireBeslenmeFoodContributor(
  req: NextRequest,
): Promise<BeslenmeContributorResult> {
  const guard = await verifyUserRequest(req, { includeProfile: true });
  if (!guard.ok) return { ok: false, response: guard.response };

  // Owner (küratör) her zaman geçer; değilse Beslenme/Danışan modül izinli VEYA dar bayraklı uzman.
  // Yazma kapsamı DAİMA yalnız caller tenant CUSTOM food (resolveFoodForWrite → SYSTEM_READONLY).
  const owner = await requireMainAdmin(guard.db, guard.userId);
  const perms = guard.profile?.module_permissions;
  const role = guard.profile?.role;
  const moduleWrite =
    resolveModuleAccess(role, perms, "beslenme") || resolveModuleAccess(role, perms, "clients");
  const authority =
    decideFoodContributorAuthority(owner.ok, perms) ?? (moduleWrite ? "expert" : null);

  if (!authority) {
    return {
      ok: false,
      response: jsonNoStore(
        { ok: false, code: "FOOD_CONTRIB_DENIED", error: "Besin ekleme yetkiniz yok." },
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
    authority,
    db: guard.db,
  };
}

// ============================================================
// Besin OKUMA kapısı (read-only) — plan editörü besin seçimi (AŞAMA 2)
// ============================================================

/**
 * READ ≠ AUTHORING. Plan editörü SYSTEM ∪ kendi tenant CUSTOM besinlerini okuyup
 * seçebilmeli; bunun için besin-katkı (yazma) bayrağı GEREKMEZ.
 *
 * Geçer (salt-okuma):
 *   - owner/admin (resolveModuleAccess role='admin' → true),
 *   - clients (Danışan Yolculuğu) yetkili uzman (resolveModuleAccess "clients"),
 *   - beslenme_manual_food bayraklı uzman (mevcut contributor).
 * tenantId YALNIZ doğrulanmış users.tenant_id; food scope {SYSTEM ∪ caller} (foodEngine).
 * Mutation buraya BAĞLI DEĞİL — POST/PATCH/DELETE hâlâ requireBeslenmeFoodContributor +
 * resolveFoodForWrite (SYSTEM_READONLY) + denyDemoMutation.
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
    resolveModuleAccess(guard.profile?.role, perms, "beslenme") ||
    hasManualFoodFlag(perms);
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
