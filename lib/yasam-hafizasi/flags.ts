/**
 * Yaşam Hafızası™ — tenant-seviyesi feature flag okuyucu (Sprint 1 / A1).
 *
 * SERVER-ONLY: yalnızca API route / server modüllerinden çağrılır.
 *   - getServerDb (service_role) kullanır; browser Supabase client KULLANMAZ.
 *   - tenantId parametresi YALNIZ server içinden (oturumdan çözülmüş) gelmelidir;
 *     asla body/query'den değil.
 *   - Flag satırı yoksa TÜM değerler false döner (güvenli varsayılan).
 *   - Tenant seviyesinde çalışır (user override YOK).
 */

import { getServerDb } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { YH_TABLES, YH_FLAG_KEYS, YH_DEFAULT_FLAGS, type YhFlags } from "./config";

/**
 * Bir tenant için feature flag durumunu döndürür.
 * @param tenantId  Oturumdan çözülmüş tenant kimliği (server-side).
 * @param db        Opsiyonel mevcut service_role client; verilmezse getServerDb().
 */
export async function getTenantFlags(
  tenantId: string,
  db?: SupabaseClient,
): Promise<YhFlags> {
  if (!tenantId) {
    return { ...YH_DEFAULT_FLAGS };
  }

  const client = db ?? getServerDb();

  const { data, error } = await client
    .from(YH_TABLES.flags)
    .select(YH_FLAG_KEYS.join(", "))
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error || !data) {
    return { ...YH_DEFAULT_FLAGS };
  }

  const row = data as unknown as Record<string, unknown>;
  const out: YhFlags = { ...YH_DEFAULT_FLAGS };
  for (const key of YH_FLAG_KEYS) {
    out[key] = row[key] === true;
  }
  return out;
}
