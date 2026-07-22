/**
 * Yaşam Hafızası™ — İndeks Kaynağı PII Guard (Sprint 2 / S2.19-BF / BF-0, saf).
 *
 * `sources.ts` bildirimsel registry'sindeki `classification` + `enabled` alanlarını
 * değerlendirip bir kaynağın ana PII-DIŞI index'e girip giremeyeceğine SAF + DETERMİNİSTİK
 * + FAIL-CLOSED biçimde karar verir. İndeksleme YALNIZ `safe-non-pii` + `enabled=true`
 * kaynağa izin verir (INV-PII; kaynak: docs/yasam-hafizasi/07-phase-5-pii-security.md).
 *
 * Bu dosya SAFTIR: DB / Supabase / env / fetch / logger / console / IO / global mutable
 * state / retrieval pipeline İÇERMEZ. Aynı girdi → aynı sonuç; side-effect yok. Karar
 * ayrıntısı (reason) YALNIZ iç kullanım/log içindir; HTTP yanıtına sızdırılmaz (route
 * güvenli sabit kod döndürür).
 */

import type { SourceClassification, SourceConfig } from "./sources";

/** Guard'ın ihtiyaç duyduğu minimal kaynak alt kümesi (test edilebilir; tam SourceConfig da uyar). */
export type GuardableSource = Pick<SourceConfig, "enabled" | "classification">;

/** Reddetme gerekçesi (kapalı union; ham içerik taşımaz). */
export type SourceGuardReason = "pii" | "unclassified" | "deferred" | "disabled";

/** Guard kararı — ayrıştırılmış, fail-closed. */
export type SourceGuardResult =
  | { readonly indexable: true }
  | { readonly indexable: false; readonly reason: SourceGuardReason };

/**
 * Kaynağın indekslenebilirliğini değerlendirir (fail-closed). Sınıflandırma önce denetlenir
 * (INV-PII birincil): `safe-non-pii` DEĞİLSE reddedilir (reason = classification değeri). Sonra
 * `enabled !== true` → `disabled`. YALNIZ `safe-non-pii && enabled===true` → `{indexable:true}`.
 *
 * Sınırda `unknown` üzerinden koru: TS tipine rağmen çağıran bozuk değer geçebilir → guard
 * gerçekten gerekli (tanınmayan classification da fail-closed 'unclassified' sayılır).
 */
export function evaluateSourceGuard(source: GuardableSource): SourceGuardResult {
  const raw: unknown = source;
  if (raw === null || typeof raw !== "object") {
    return { indexable: false, reason: "unclassified" };
  }
  const s = raw as { enabled?: unknown; classification?: unknown };

  // 1) Sınıflandırma (INV-PII birincil). Yalnız kesin 'safe-non-pii' ilerler.
  const classification = s.classification;
  if (classification !== "safe-non-pii") {
    return { indexable: false, reason: normalizeReason(classification) };
  }

  // 2) enabled yalnız kesin `true` iken indekslenebilir (aksi → disabled).
  if (s.enabled !== true) {
    return { indexable: false, reason: "disabled" };
  }

  return { indexable: true };
}

/** `safe-non-pii` dışındaki değerleri kapalı reason'a indirger (tanınmayan → 'unclassified'). */
function normalizeReason(classification: unknown): SourceGuardReason {
  if (classification === "pii") return "pii";
  if (classification === "deferred") return "deferred";
  // 'unclassified' + tanınmayan/bozuk her değer → fail-closed 'unclassified'.
  return "unclassified";
}

/** Kısa boolean sözleşmesi (indekslenebilir mi). */
export function isIndexableSource(source: GuardableSource): boolean {
  return evaluateSourceGuard(source).indexable;
}

/** Tip yeniden-export (çağıranların tek yerden import etmesi için). */
export type { SourceClassification };
