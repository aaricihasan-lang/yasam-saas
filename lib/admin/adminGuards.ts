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
};

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

    if (isOwnerAdminRow(target)) {
      return {
        ok: false,
        status: 403,
        error: "Sistem sahibi (owner) admin pasifleştirilemez, rolü düşürülemez veya silinemez.",
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
  return guardAdminLockout(db, target as AdminTargetRow, opts);
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
