// HD API — TENANT KAPSAM PRIMITIVE'i + INVARIANT (server-only).
//
// NEDEN (HD-P2-A): Human Design operasyonel tabloları (human_design_clients/charts/
// reports/knowledge_records/knowledge_sources) service_role ile okunur-yazılır.
// service_role RLS'i BYPASS eder → klasik RLS policy'si gerçek bir backstop DEĞİLDİR.
// Gerçek tenant izolasyonu UYGULAMA katmanındadır: her sorgu `.eq("tenant_id", tenantId)`.
//
// Bu modül o davranışı ZAYIFLATMADAN defense-in-depth ekler:
//   1) assertTenantId — fail-closed invariant: tenant_id boş/eksik/null ise İŞLEM
//      hiç başlamadan hata verir (aksi hâlde `.eq("tenant_id","")` sessizce 0 satır
//      döndürüp gizli hatalara yol açabilir; ya da bir refactor filtreyi büsbütün
//      düşürürse tüm tenant'lara sızma riski doğar).
//   2) tenantScoped* primitive'leri — `.eq("tenant_id", tenantId)` filtresini HER
//      ZAMAN uygular. Yeni/değişen HD persistence sorguları bu primitive'lerden
//      geçmelidir; böylece bir geliştiricinin filtreyi UNUTMASI mümkün olmaz.
//
// SINIR: Bu FORCE RLS DEĞİLDİR (service_role mimarisi nedeniyle DB policy backstop
// sağlamaz). Reusable primitive + invariant + negatif testler tercih edilmiştir.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fail-closed tenant invariant. Geçerli (boş olmayan) bir tenant_id yoksa fırlatır.
 * Gerçek tenant_id'ler uuid'dir; ancak test/fixture uyumluluğu için yalnız
 * "boş olmayan string" aranır (asıl tehdit undefined/null/"" footgun'udur).
 */
export function assertTenantId(
  tenantId: unknown,
  context: string,
): asserts tenantId is string {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error(
      `[hd] tenant invariant ihlali (${context}): geçerli tenant_id zorunlu.`,
    );
  }
}

/**
 * SELECT — tenant_id filtresi HER ZAMAN uygulanır. Sonrasında .eq/.or/.in/.order/... zincirlenebilir.
 * `columns` literal generic (C) tutulur → supabase-js kolon-parse tipi KORUNUR (aksi hâlde
 * `string` parametresi `data`'yı GenericStringError'a düşürür ve mevcut cast'ler kırılırdı).
 */
export function tenantScopedSelect<C extends string = "*">(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  columns: C = "*" as C,
  options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
) {
  assertTenantId(tenantId, `select:${table}`);
  return db.from(table).select(columns, options).eq("tenant_id", tenantId);
}

/** DELETE — tenant_id filtresi HER ZAMAN uygulanır. */
export function tenantScopedDelete(db: SupabaseClient, table: string, tenantId: string) {
  assertTenantId(tenantId, `delete:${table}`);
  return db.from(table).delete().eq("tenant_id", tenantId);
}

/** UPDATE — tenant_id filtresi HER ZAMAN uygulanır. */
export function tenantScopedUpdate(
  db: SupabaseClient,
  table: string,
  tenantId: string,
  values: Record<string, unknown>,
) {
  assertTenantId(tenantId, `update:${table}`);
  return db.from(table).update(values).eq("tenant_id", tenantId);
}

/**
 * INSERT payload'una tenant_id'yi güvenle enjekte eder (client'ın gönderdiği tenant_id
 * override edilir). Dönen nesne db.from(table).insert(...) ile kullanılır.
 */
export function tenantInsertPayload<T extends Record<string, unknown>>(
  tenantId: string,
  payload: T,
): T & { tenant_id: string } {
  assertTenantId(tenantId, "insert");
  return { ...payload, tenant_id: tenantId };
}
