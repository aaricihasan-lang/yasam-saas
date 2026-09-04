import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Danışan (client) tenant-ownership doğrulama — PAYLAŞILAN helper.
 *
 * Mevcut 14 route inline `clientBelongsToTenant` kopyalıyordu; FAZ 7 yeni Beslenme
 * route'ları bu neutral helper'ı REUSE eder (yeni copy-paste varyant üretilmez).
 * Bu tur mevcut 14 route refactor EDİLMEZ (scope). tenant_id ASLA body'den; server
 * session/user kaydından gelen tenantId ile çağrılır. Foreign/not-found → null.
 */
export type ClientTenantRow = {
  id: string;
  ad: string | null;
  soyad: string | null;
  kan: string | null;
  mizac: string | null;
};

const CLIENT_CONTEXT_COLUMNS = "id, ad, soyad, kan, mizac";

export async function requireClientInTenant(
  db: SupabaseClient,
  tenantId: string,
  clientId: string,
): Promise<ClientTenantRow | null> {
  if (!clientId || typeof clientId !== "string") return null;
  const { data, error } = await db
    .from("clients")
    .select(CLIENT_CONTEXT_COLUMNS)
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as ClientTenantRow;
}

/** UI/Word görünen ad: ad + soyad (trim). Boşsa "İsimsiz Danışan". */
export function clientDisplayName(c: { ad?: string | null; soyad?: string | null }): string {
  const raw = `${c.ad ?? ""} ${c.soyad ?? ""}`.trim();
  return raw || "İsimsiz Danışan";
}
