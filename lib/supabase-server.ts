import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — yalnızca server-side (API route) kullanımı içindir.
 * Bu client RLS'yi bypass eder; browser koduna asla gönderilmemeli.
 *
 * PERF-2A: Client stateless'tir (sabit URL + service_role key, persistSession:false,
 * kullanıcı/tenant/session bilgisi taşımaz). Bu nedenle modül seviyesinde lazy
 * singleton olarak paylaşılır — her çağrıda yeni createClient nesnesi tahsis edilmez.
 * Kimliğe bağlı hiçbir durum bu nesnede tutulmaz; sorgu kapsamı (tenant/user) her
 * zaman çağıran route tarafından belirlenir.
 */
function createServerDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role yapılandırması eksik.");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

let serverDb: ReturnType<typeof createServerDb> | null = null;

export function getServerDb() {
  return (serverDb ??= createServerDb());
}

/**
 * Admin API route'larının kullanıcı sorgularında seçeceği güvenli kolon listesi.
 * password ve password_hash hiçbir zaman client'a dönmez.
 */
export const USERS_SAFE_SELECT =
  "id, full_name, email, role, active, approval_status, module_permissions, " +
  "package_type, membership_status, subscription_status, trial_started_at, " +
  "trial_ends_at, membership_started_at, membership_ends_at, plan, " +
  "admin_level, tenant_id, created_at, " +
  "payment_status, last_payment_date, next_payment_date, paid_amount, payment_note, " +
  "license_type, allowed_active_sessions, allowed_locations, security_mode, security_exempt, license_note, " +
  "allowed_desktop_sessions, allowed_mobile_sessions, allowed_tablet_sessions, allowed_unknown_sessions";
