import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — yalnızca server-side (API route) kullanımı içindir.
 * Bu client RLS'yi bypass eder; browser koduna asla gönderilmemeli.
 */
export function getServerDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase service role yapılandırması eksik.");
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  });
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
  "payment_status, last_payment_date, next_payment_date, paid_amount, payment_note";
