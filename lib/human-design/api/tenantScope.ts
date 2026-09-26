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
//   2) withTenant — ZATEN KURULMUŞ bir sorgu builder'ına `.eq("tenant_id", tenantId)`
//      filtresini uygular (assert + filtre). Yeni/değişen HD persistence sorguları bu
//      helper'dan geçmelidir; böylece bir geliştiricinin filtreyi UNUTMASI zorlaşır.
//
// TİP-MALİYETİ NOTU (build timeout fix): `.select(columns)` ÇAĞRI NOKTASINDA (literal
// tablo + literal kolon string'i) kalır → supabase-js'in PostgREST select-parser tipi
// yalnız orada, HIZLI/önbelleklenmiş yolla çözülür. withTenant SADECE builder tipi (B)
// üzerinden generic'tir (kimlik benzeri) → ağır conditional/generic select-parser
// YENİDEN İNSTANTİYE EDİLMEZ. (Eski `tenantScopedSelect<C extends string>` sarmalayıcısı
// select-parser'ı her çağrıda yeniden büyütüyor ve type-check patlamasına yol açıyordu.)
//
// SINIR: Bu FORCE RLS DEĞİLDİR (service_role mimarisi nedeniyle DB policy backstop
// sağlamaz). Minimal reusable helper + invariant + negatif testler tercih edilmiştir.

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
 * Zaten kurulmuş bir Supabase sorgu builder'ına (`db.from(T).select()/delete()/update()`)
 * tenant filtresini uygular: önce assertTenantId (fail-closed), sonra `.eq("tenant_id", tenantId)`.
 *
 * `.select(...)` çağrı noktasında kalır → builder'ın gerçek tipi (B) buraya inferred gelir
 * ve DEĞİŞMEDEN döner; sonrasında `.eq/.or/.in/.order/.maybeSingle/.single/.select("id")`
 * normal biçimde zincirlenir. Tip-maliyeti düşüktür (yalnız B kimlik-generic'i + tek
 * dar cast; ağır select-parser generic'i yeniden büyütülmez).
 *
 * @example withTenant(db.from(TABLE).select("*"), tenantId, "listHdClients").order("created_at")
 */
export function withTenant<B>(builder: B, tenantId: string, context: string): B {
  assertTenantId(tenantId, context);
  return (builder as B & { eq(column: string, value: string): B }).eq("tenant_id", tenantId);
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
