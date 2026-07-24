/**
 * Yaşam Hafızası™ — Tenant Scope IO Adapter (Model C, BF-4B, IO katmanı).
 *
 * `tenantScopeGate` SAF çekirdeği için GERÇEK Supabase okumasını yapar. YALNIZ iki
 * PII-DIŞI sorgu:
 *   - tenants(id,status)  → .eq(id).limit(1) (DbSelectBuilder'da maybeSingle YOK → ilk satır)
 *   - users(tenant_id,role,active,is_demo_account,approval_status,status) → .eq(tenant_id)
 *     DİZİ döner (single/maybeSingle YOK). PII kolonu (isim/e-posta/telefon) OKUNMAZ.
 *
 * Ham Supabase/DB mesajı DIŞARI TAŞINMAZ: herhangi bir tenants VEYA users sorgu
 * hatası → tek sabit kod `tenant-scope-validation-unavailable` (fail-closed).
 */

import {
  canonicalTenantRejection,
  evaluateTenantScope,
  type TenantScopeEvaluation,
  type TenantScopeRows,
} from "./tenantScopeGate";
import type { IndexDbClient } from "./supabaseIndexAdapters";

export type TenantScopeReadResult =
  | { ok: true; rows: TenantScopeRows }
  | { ok: false; code: "tenant-scope-validation-unavailable" };

export interface TenantScopeReader {
  read(tenantId: string): Promise<TenantScopeReadResult>;
}

/**
 * Gerçek Supabase okuyucu. tenants + users sorgularını yapar; herhangi bir hata
 * (DB error veya beklenmeyen exception) → validation-unavailable (ham mesaj sızmaz).
 */
export function createSupabaseTenantScopeReader(db: IndexDbClient): TenantScopeReader {
  return {
    read: async (tenantId) => {
      // 1) tenants(id,status) — maybeSingle yok; select+eq+limit(1) → ilk satır.
      let tenant: { readonly id: string; readonly status: unknown } | null = null;
      try {
        const { data, error } = await db
          .from("tenants")
          .select("id,status")
          .eq("id", tenantId)
          .limit(1);
        if (error) return { ok: false, code: "tenant-scope-validation-unavailable" };
        const first = (data ?? [])[0];
        if (first !== undefined) {
          const id = first["id"];
          tenant = typeof id === "string" ? { id, status: first["status"] } : null;
        }
      } catch {
        return { ok: false, code: "tenant-scope-validation-unavailable" };
      }

      // 2) users(...) — .eq(tenant_id) DİZİ döner (single/maybeSingle YOK); PII kolonu yok.
      let users: Record<string, unknown>[];
      try {
        const { data, error } = await db
          .from("users")
          .select("tenant_id,role,active,is_demo_account,approval_status,status")
          .eq("tenant_id", tenantId);
        if (error) return { ok: false, code: "tenant-scope-validation-unavailable" };
        users = (data ?? []).map((r) => ({ ...r })); // shallow clone → saf çekirdeğe
      } catch {
        return { ok: false, code: "tenant-scope-validation-unavailable" };
      }

      return { ok: true, rows: { tenant, users } };
    },
  };
}

/**
 * Tenant scope doğrulaması: canonicalTenantRejection kısa-devresi (sentetik/demo →
 * okumadan red), sonra reader.read; okuma hatası → unavailable; aksi →
 * evaluateTenantScope (SAF karar).
 */
export async function validateScopedTenant(
  tenantId: string,
  reader: TenantScopeReader,
): Promise<TenantScopeEvaluation | { ok: false; code: "tenant-scope-validation-unavailable" }> {
  const canonical = canonicalTenantRejection(tenantId);
  if (canonical !== null) return { ok: false, code: canonical };

  const read = await reader.read(tenantId);
  if (!read.ok) return { ok: false, code: "tenant-scope-validation-unavailable" };

  return evaluateTenantScope(tenantId, read.rows);
}
