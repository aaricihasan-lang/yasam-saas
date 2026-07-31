/**
 * Admin kilitlenme (lockout) korumaları — ortak server-side yardımcılar.
 *
 * Amaç: Sistemin admin panelinden tamamen kilitlenmesini önlemek.
 *   - Owner (sistem sahibi) admin pasifleştirilemez / silinemez / rolü düşürülemez.
 *   - Son AKTİF admin pasifleştirilemez / silinemez / rolü düşürülemez.
 *
 * Bu katman uygulama (API) seviyesindedir; tenant/auth/RLS yapısına dokunmaz,
 * migration gerektirmez. Acil kurtarma (tüm adminler bir şekilde pasif kalırsa)
 * yalnızca doğrudan DB ile yapılır — bkz. dosya sonundaki RECOVERY notu.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** admin_level boşsa owner kabul edilen tarihsel ana admin e-postası. */
export const OWNER_FALLBACK_EMAIL = "admin@yasamsistemi.com";

export type AdminTargetRow = {
  id?: unknown;
  role?: unknown;
  admin_level?: unknown;
  email?: unknown;
  active?: unknown;
  is_super_admin?: unknown;
};

/**
 * Kalıcı ana-yönetici (super admin) işareti çözümü — TRANSITION-SAFE.
 *
 * Esas kaynak: public.users.is_super_admin (migration 20260913000000).
 * Kolon henüz yoksa (deploy sırası) SELECT hata verir → bilinen ana-admin
 * e-postasına (OWNER_FALLBACK_EMAIL) düşülür. Kolon geldikten sonra yalnız
 * is_super_admin esastır. Her iki yolda da sonuç aynı hesaba (admin@yasamsistemi.com)
 * çözülür; güvenlik farkı yoktur.
 */
/**
 * STRICT geçiş kapısı: REQUIRE_DB_SUPER_ADMIN_MARKER === "true" ise runtime ana-yönetici
 * kararı YALNIZ DB işaretine (is_super_admin) dayanır; e-posta/admin_level fallback YOK.
 * Yalnız tam string "true" strict'i açar (eksik/boş/false/TRUE/1/yes → transition).
 * Yalnız server-side okunur. Güvenli production sırası:
 *   1) düzeltilmiş migration apply → is_super_admin kolonu + doğru hesap canlı,
 *   2) REQUIRE_DB_SUPER_ADMIN_MARKER=true production ENV + redeploy → transition fallback ölür.
 */
export function isDbSuperAdminMarkerRequired(): boolean {
  return process.env.REQUIRE_DB_SUPER_ADMIN_MARKER === "true";
}

export async function resolveIsSuperAdmin(
  db: SupabaseClient,
  userId: string,
): Promise<boolean> {
  // Ana ve esas karar kaynağı: kalıcı is_super_admin işareti.
  const primary = await db
    .from("users")
    .select("is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!primary.error && primary.data && typeof primary.data.is_super_admin === "boolean") {
    return primary.data.is_super_admin === true;
  }

  // Kolon yok / DB hatası:
  // STRICT modda e-posta/admin_level fallback YOKTUR → fail-closed false (403).
  // Runtime hiçbir kalıcı durumda e-postaya dayanmaz.
  if (isDbSuperAdminMarkerRequired()) {
    return false;
  }

  // TRANSITION (ENV tam "true" değil; migration henüz uygulanmamış olabilir): yalnız
  // mevcut ana yönetici e-postası için geçici fallback. Impersonation-safe: e-posta
  // normalized-unique (BF-11F) + userId token-bound (verifyAdminRequest/verifyUserRequest);
  // normal admin bu e-postaya sahip olamaz ve başkasının id'siyle çözülemez. Migration +
  // ENV=true sonrası bu dal tamamen ölür (kolon geldiğinde primary yol kazanır).
  const fb = await db
    .from("users")
    .select("email, role")
    .eq("id", userId)
    .maybeSingle();
  if (fb.error || !fb.data) return false;
  return (
    String(fb.data.role ?? "").trim().toLowerCase() === "admin" &&
    String(fb.data.email ?? "").trim().toLowerCase() === OWNER_FALLBACK_EMAIL
  );
}

export type MainAdminGuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * İşlemi yapan adminin ANA YÖNETİCİ olmasını zorunlu kılar (server-side).
 * Normal admin için 403 döner. Yalnızca gerçekten ana-admine özel işlemlerde
 * çağrılır (admin oluşturma, rol=admin verme, silme, ana-admin hedefli kritik
 * işlem, workspace görüntüleme).
 */
export async function requireMainAdmin(
  db: SupabaseClient,
  actorAdminId: string,
): Promise<MainAdminGuardResult> {
  const isSuper = await resolveIsSuperAdmin(db, actorAdminId);
  if (!isSuper) {
    return {
      ok: false,
      status: 403,
      error: "Bu işlem yalnızca ana yöneticiye açıktır.",
    };
  }
  return { ok: true };
}

/**
 * Sunucu feature flag'i — ana yöneticinin uzman workspace'ini görüntüleme izni
 * yalnız tam string "true" ise açıktır. FAIL-CLOSED: eksik/boş/`false`/`TRUE`/`1`/
 * `yes` → kapalı. Yalnız server-side okunur; client'a gönderilmez.
 */
export function isSuperAdminWorkspaceViewEnabled(): boolean {
  return process.env.ALLOW_SUPER_ADMIN_WORKSPACE_VIEW === "true";
}

/**
 * Workspace erişim kapısı (Faz 1/P1) — İKİ şart birlikte:
 *   1) İstek yapan admin ANA YÖNETİCİ (is_super_admin=true), ve
 *   2) ALLOW_SUPER_ADMIN_WORKSPACE_VIEW === "true".
 * Normal admin → ENV ne olursa olsun daima 403. Ana yönetici + flag kapalı → 403.
 * Tüm 8 workspace/özel-içerik route'u bu MERKEZİ gate'i kullanır (env kontrolü
 * route'larda kopyalanmaz). Yayın öncesi bu istisna, flag'i kaldırarak kapatılır.
 */
export async function requireSuperAdminWorkspaceAccess(
  db: SupabaseClient,
  actorAdminId: string,
): Promise<MainAdminGuardResult> {
  const isSuper = await resolveIsSuperAdmin(db, actorAdminId);
  if (!isSuper) {
    return { ok: false, status: 403, error: "Bu işlem yalnızca ana yöneticiye açıktır." };
  }
  if (!isSuperAdminWorkspaceViewEnabled()) {
    return { ok: false, status: 403, error: "Workspace görüntüleme şu anda kapalı." };
  }
  return { ok: true };
}

/**
 * Admin-hedef yönetim kısıtı: HEDEF bir admin ise (role='admin'), yalnız ANA
 * YÖNETİCİ işlem yapabilir (normal admin başka admini yönetemez — kritik alan
 * değiştiremez, pasifleştiremez, silemez). HEDEF expert ise normal admin serbest.
 */
export async function requireMainAdminForAdminTarget(
  db: SupabaseClient,
  actorAdminId: string,
  targetId: string,
): Promise<MainAdminGuardResult> {
  const { data } = await db
    .from("users")
    .select("role")
    .eq("id", targetId)
    .maybeSingle();
  const targetIsAdmin = String(data?.role ?? "").trim().toLowerCase() === "admin";
  if (!targetIsAdmin) return { ok: true };
  return requireMainAdmin(db, actorAdminId);
}

/**
 * Satır owner (sistem sahibi) admin mi?
 *
 * ÖNEMLİ: users.admin_level kolonu canlı DB'de VARSAYILAN olarak 'owner' üretir
 * (her yeni admin admin_level='owner' olur) — bu yüzden owner ayrımı için
 * GÜVENİLİR DEĞİLDİR. Sistem sahibi kimliği e-posta ile belirlenir; aksi halde
 * tüm adminler "owner" sayılıp pasifleştirilemez hale gelirdi.
 */
export function isOwnerAdminRow(row: AdminTargetRow | null | undefined): boolean {
  if (!row) return false;
  if (String(row.role ?? "").trim().toLowerCase() !== "admin") return false;
  return String(row.email ?? "").trim().toLowerCase() === OWNER_FALLBACK_EMAIL;
}

/** Aktif admin sayısı (role='admin' AND active=true). */
export async function countActiveAdmins(db: SupabaseClient): Promise<number> {
  const { count } = await db
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("active", true);
  return count ?? 0;
}

export type LockoutGuardResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Bir admin kullanıcı üzerinde "etkisizleştirici" değişiklik güvenli mi?
 * Etkisizleştirici = active=false yapma, admin rolünden çıkarma veya (soft) silme.
 *
 * Kurallar:
 *   - Hedef admin değilse (ör. expert) → serbest.
 *   - İşlem hedefi aktif admin havuzundan ÇIKARMIYORSA → serbest.
 *   - Owner admin → ENGELLE.
 *   - Hedef şu an aktif admin ve toplam aktif admin <= 1 → ENGELLE.
 */
export function guardAdminLockout(
  db: SupabaseClient,
  target: AdminTargetRow,
  opts: { willBeActive?: boolean; willBeAdmin?: boolean; isDelete?: boolean },
): Promise<LockoutGuardResult> {
  return (async (): Promise<LockoutGuardResult> => {
    const role = String(target.role ?? "").trim().toLowerCase();
    if (role !== "admin") return { ok: true }; // expert vb. → kapsam dışı

    const willBeActive = opts.isDelete ? false : opts.willBeActive ?? true;
    const willBeAdmin = opts.isDelete ? false : opts.willBeAdmin ?? true;

    // Hedef hâlâ aktif admin kalıyorsa etkisizleştirme değildir.
    if (willBeActive && willBeAdmin) return { ok: true };

    // Ana yönetici (super admin) mutlak korumalı: kalıcı is_super_admin işareti
    // VEYA (transition/legacy) owner e-postası → pasifleştirilemez/düşürülemez/silinemez.
    if (target.is_super_admin === true || isOwnerAdminRow(target)) {
      return {
        ok: false,
        status: 403,
        error: "Ana yönetici pasifleştirilemez, rolü düşürülemez veya silinemez.",
      };
    }

    // Hedef şu an aktif admin değilse zaten havuzda değil → düşürmez.
    if (target.active === true) {
      const activeAdmins = await countActiveAdmins(db);
      if (activeAdmins <= 1) {
        return {
          ok: false,
          status: 409,
          error: "Son aktif admin pasifleştirilemez veya silinemez. Önce başka bir admini aktif yapın.",
        };
      }
    }

    return { ok: true };
  })();
}

/** Hedef satırı id ile çekip guardAdminLockout uygular. */
export async function guardAdminLockoutById(
  db: SupabaseClient,
  targetId: string,
  opts: { willBeActive?: boolean; willBeAdmin?: boolean; isDelete?: boolean },
): Promise<LockoutGuardResult> {
  const { data: target } = await db
    .from("users")
    .select("id, role, admin_level, email, active")
    .eq("id", targetId)
    .maybeSingle();
  if (!target) return { ok: true }; // hedef yok → route kendi 404'ünü verir
  // is_super_admin'i AYRI ve defensive oku (kolon henüz yoksa e-posta fallback'ine
  // düşer) — böylece ana-yönetici koruması transition sırasında da çalışır.
  const t = { ...(target as AdminTargetRow), is_super_admin: await resolveIsSuperAdmin(db, targetId) };
  return guardAdminLockout(db, t, opts);
}

/*
 * ── ACİL KURTARMA (RECOVERY) ────────────────────────────────────────────────
 * Tüm admin hesapları bir şekilde active=false kalırsa admin paneli kilitlenir
 * (layout + adminGuard + admin-session hepsi active=true ister). Tek kurtarma
 * yolu doğrudan veritabanıdır. Supabase SQL editöründe (service_role):
 *
 *   UPDATE public.users SET active = true
 *   WHERE email = 'admin@yasamsistemi.com';   -- owner/sistem sahibi
 *
 * Bu guard'lar normal akışta o duruma düşmeyi engeller; recovery yalnızca
 * doğrudan DML hatası / dışarıdan yapılan değişiklik içindir.
 */
