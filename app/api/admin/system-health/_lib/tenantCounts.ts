import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * AA-2 / AA-4 — Sistem sağlığı tenant sayım çekirdeği (YALNIZ sunucu; service_role db).
 *
 * Yalnız SAYI döner: toplam satır + {tenant_id: kayıt_sayısı} haritası + tenant'sız satır
 * sayısı. Satır içeriği/PII/satır başına liste DÖNMEZ. Tablo adı çağırandaki SABİT
 * allowlist'ten gelir; request'ten serbest tablo adı kabul edilmez.
 */
export type TenantCountSummary = {
  total: number;
  /** tenant_id → kayıt sayısı (tenant_id NULL/boş satırlar buraya GİRMEZ). */
  tenants: Record<string, number>;
  /** tenant_id NULL/boş satır sayısı. */
  nullTenantRows: number;
};

const PAGE_SIZE = 1000;

export async function loadTenantCountSummary(
  db: SupabaseClient,
  table: string,
): Promise<{ ok: true; summary: TenantCountSummary } | { ok: false }> {
  const { count, error: countError } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  if (countError) return { ok: false };

  const tenants: Record<string, number> = {};
  let nullTenantRows = 0;
  let from = 0;
  // Sayfalı tenant_id taraması — yalnız sunucuda agregelenir, istemciye satır gitmez.
  while (true) {
    const { data, error } = await db
      .from(table)
      .select("tenant_id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { ok: false };
    if (!data?.length) break;
    for (const row of data as Array<{ tenant_id: string | null }>) {
      const id = row.tenant_id == null ? "" : String(row.tenant_id).trim();
      if (!id) {
        nullTenantRows += 1;
        continue;
      }
      tenants[id] = (tenants[id] ?? 0) + 1;
    }
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { ok: true, summary: { total: count ?? 0, tenants, nullTenantRows } };
}

/** Tablo var mı / erişilebilir mi (head count; veri DÖNMEZ). */
export async function probeTableAvailable(db: SupabaseClient, table: string): Promise<boolean> {
  try {
    const { error } = await db.from(table).select("*", { count: "exact", head: true });
    return !error;
  } catch {
    return false;
  }
}
