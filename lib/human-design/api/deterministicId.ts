// HD — deterministik UUID (RFC 4122 v5 biçimi, SHA-1 tabanlı; server-only).
//
// NEDEN: Bazı HD yazımları "tek mantıksal kayıt" garantisi ister ama tabloda buna uygun
// UNIQUE kısıt yoktur. Satır id'si mantıksal anahtardan DETERMİNİSTİK türetilirse mevcut
// PRIMARY KEY, eşzamanlı ikinci INSERT'i veritabanı seviyesinde reddeder (23505) — şema
// değişikliği gerekmeden yarış koşuluna karşı kesin tekillik:
//   • Manuel harita: (tenant, danışan) başına tek satır.
//   • Profesyonel rapor: (tenant, istemci istek kimliği) başına tek satır (idempotency).
// Anahtar tenant içerdiği için iki tenant aynı id'yi asla üretemez.

import { createHash } from "node:crypto";

const NAMESPACE = "yasam-hd";

export function deterministicUuid(...parts: string[]): string {
  const h = createHash("sha1").update([NAMESPACE, ...parts].join("\u001f"), "utf8").digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** (tenant, danışan) → manuel harita satır id'si. */
export function manualChartIdFor(tenantId: string, clientId: string): string {
  return deterministicUuid("manual-chart", tenantId, clientId);
}

/** (tenant, istek kimliği) → profesyonel rapor satır id'si. */
export function professionalReportIdFor(tenantId: string, requestId: string): string {
  return deterministicUuid("professional-report", tenantId, requestId);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** PostgREST/Postgres benzersizlik ihlali mi? */
export function isUniqueViolation(error: { code?: string } | null | undefined): boolean {
  return !!error && error.code === "23505";
}

/** İki timestamptz değeri aynı anı mı gösteriyor? (biçim farkına dayanıklı) */
export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  // Date.parse ms hassasiyetindedir; mikro-saniye farkı aynı ms içinde kalırsa string
  // karşılaştırması zaten yukarıda eşleşmiştir. ms eşitliği + mikro farkı = farklı yazım
  // sayılmaz (uygulama updated_at'i ms hassasiyetinde yazar).
  return ta === tb;
}
