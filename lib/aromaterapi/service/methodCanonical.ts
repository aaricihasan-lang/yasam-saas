/**
 * Aromaterapi V2 — C3D-B2A method revision canonical serializer + note_hash.
 *
 * SAF + DETERMİNİSTİK. note_hash İSTEMCİDEN ALINMAZ; yalnız bu tek yerde üretilir
 * (SHA-256 → 64 karakter lowercase hex; node:crypto, harici paket yok). Proje doktrini
 * (lib/yasam-hafizasi/indexer/buildCandidate.ts) ile aynı uzunluk-önekli kodlama:
 * enjeksiyon-güvenli, key sırasına bağımsız, dizi sınırları belirgin.
 *
 * İLKE: Yalnız REVISION İÇERİK alanları hash'e girer. id/tenant_id/series_id/revision/
 * status/created_at/updated_at/actor/reason/correlation_id HARİÇ. Kullanıcı içeriği
 * sessizce trim/normalize EDİLMEZ; yalnız yapısal canonicalization yapılır. Aynı semantik
 * payload farklı JS key sırasıyla gelse aynı hash; steps `order` değerine göre sıralanır.
 */

import { createHash } from "node:crypto";

/** Sıralı adım — DB steps JSONB `{order, text}` ile birebir. */
export type MethodStep = { order: number; text: string };

/** note_hash'e giren revision içerik alanları (yalnız içerik; kimlik/denetim HARİÇ). */
export type MethodRevisionContent = {
  plant_part_used: string | null;
  material_state: string | null;
  method_text: string; // NOT NULL (DB)
  equipment: string | null;
  amount_ratio: string | null;
  solvent_carrier: string | null;
  duration_text: string | null;
  temperature_text: string | null;
  steps: readonly MethodStep[] | null;
  filtration: string | null;
  resting: string | null;
  storage: string | null;
  quality_notes: string | null;
  safety_notes: string | null;
};

/** Uzunluk-önekli kodlama: null → "∅"; aksi → "<len>:<value>" (enjeksiyon-güvenli). */
function enc(v: string | null): string {
  return v === null ? "∅" : `${v.length}:${v}`;
}

/** Dizi sayaç kodlaması (sınırları belirginleştirir). */
function encCount(n: number): string {
  return `#${n}`;
}

/**
 * İçerik alanlarını SABİT sırayla, uzunluk-önekli parçalara böler ve "|" ile birleştirir.
 * steps `order` artan sıraya göre deterministik kodlanır (dizi geliş sırası önemsiz).
 */
export function canonicalMethodContent(c: MethodRevisionContent): string {
  const parts: string[] = [];
  parts.push("P", enc(c.plant_part_used));
  parts.push("M", enc(c.material_state));
  parts.push("X", enc(c.method_text));
  parts.push("E", enc(c.equipment));
  parts.push("A", enc(c.amount_ratio));
  parts.push("C", enc(c.solvent_carrier));
  parts.push("D", enc(c.duration_text));
  parts.push("T", enc(c.temperature_text));

  const steps = c.steps ? [...c.steps] : [];
  steps.sort((a, b) => a.order - b.order);
  parts.push("S", encCount(steps.length));
  for (const s of steps) {
    parts.push(enc(String(s.order)), enc(s.text));
  }

  parts.push("F", enc(c.filtration));
  parts.push("R", enc(c.resting));
  parts.push("O", enc(c.storage));
  parts.push("Q", enc(c.quality_notes));
  parts.push("Y", enc(c.safety_notes));
  return parts.join("|");
}

/** SHA-256 hex (64 karakter lowercase) — canonical içerik üzerinden. */
export function computeMethodNoteHash(c: MethodRevisionContent): string {
  return createHash("sha256").update(canonicalMethodContent(c), "utf8").digest("hex");
}
