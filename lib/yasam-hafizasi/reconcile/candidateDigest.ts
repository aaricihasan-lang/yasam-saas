/**
 * Yaşam Hafızası™ — Apply Candidate Fingerprint (BF-11D6, SAF + deterministik).
 * ============================================================================
 *
 * SAF. IO / DB / env / zaman / rastgelelik YOK. Yalnız `node:crypto` (SHA-256).
 *
 * Bir apply candidate setinden deterministik `{candidateCount, candidateDigest}`
 * üretir. Digest güvenlik kapısıdır: apply, eski/yanlış aday setiyle çalışamaz.
 *
 * KURALLAR:
 *   - Canonical item = source_key|source_table|source_id|tenant_id|classification|content_hash
 *   - UUID'ler lowercase normalize (case/format bağımsızlığı).
 *   - Uzunluk-önekli, ayıraç-güvenli kodlama (injektif; alan sınırları belirgin).
 *   - Deterministik sıralama (canonical item string'e göre) → giriş sırası önemsiz.
 *   - Taş adı / açıklama / snippet / PII digest'e ASLA girmez (yalnız identity + hash).
 *   - Boş set → count 0 + sabit boş-set digest (güvenli no-op).
 */

import { createHash } from "node:crypto";
import type { ReconApplyCandidate } from "./applyTypes";

/** Uzunluk-önekli kodlama: null → "∅"; aksi → "<len>:<value>" (enjeksiyon-güvenli). */
function enc(v: string | null): string {
  return v === null ? "∅" : `${v.length}:${v}`;
}

/** UUID/kimlik normalize: string ise trim+lowercase; aksi null (coercion yok). */
function norm(v: unknown): string | null {
  return typeof v === "string" ? v.trim().toLowerCase() : null;
}

/** Bir candidate'in canonical item string'i (sabit alan sırası + uzunluk-önek). */
export function canonicalCandidateItem(c: ReconApplyCandidate): string {
  return [
    enc(norm(c.sourceKey)),
    enc(norm(c.sourceTable)),
    enc(norm(c.sourceId)),
    enc(norm(c.tenantId)),
    enc(c.classification),
    enc(norm(c.contentHash)),
  ].join("|");
}

/**
 * Candidate setinin deterministik fingerprint'i. Giriş sırası önemsiz (canonical
 * item'e göre sıralanır); aynı set → aynı digest. Duplicate item'ler tekilleştirilir
 * (aynı source_id iki kez gelirse tek sayılır) — count DE tekil sayıdır.
 */
export function computeCandidateFingerprint(
  candidates: readonly ReconApplyCandidate[],
): { readonly candidateCount: number; readonly candidateDigest: string } {
  const items = new Set<string>();
  for (const c of candidates) items.add(canonicalCandidateItem(c));
  const sorted = [...items].sort();
  const h = createHash("sha256");
  h.update(`#${sorted.length}`, "utf8"); // sayaç önekli (uzunluk enjeksiyonu güvenli)
  for (const it of sorted) h.update("|" + it, "utf8");
  return { candidateCount: sorted.length, candidateDigest: h.digest("hex") };
}
