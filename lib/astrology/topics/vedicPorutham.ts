// Atlas Roxy kalan teknikler (2026-10-22 gece) — Bilgi Bankası konu eşlemesi (SAF): On Porutham (Dashakoot) ve Papasamyam.
//
//   • vedic.dashakoot → "vedic_porutham" bağlamı: porutham_result:<kriter>:<matched|unmatched>, porutham_constraint:<rajju|vedha>
//     (yalnız etkin kısıt). Ashtakoot (vedic_match) konularından AYRI — iki sistemin kayıtları karışmaz.
//   • vedic.papasamyam → "vedic_papasamyam" bağlamı: papa_affliction:<lagna|moon|venus>:<graha>:<ev> (iki rolün katkıları,
//     tekilleştirilmiş) ve papa_comparison:<within|exceeds>.
// Konu yalnız teknik veriden türetilir; KB içeriği sağlayıcı verisiyle OTOMATİK DOLDURULMAZ. Anahtar biçimi DB regex'ine uyar.

import type { VedicDashakootTechnical, VedicPapasamyamTechnical } from "../model/vedicPorutham";
import { vedicCollect, type VedicTopic } from "./vedic";

export function topicsFromVedicDashakoot(t: VedicDashakootTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const r of t.rows ?? []) items.push(["porutham_result", [r.id, r.matched ? "matched" : "unmatched"]]);
  if (t.rajju?.active) items.push(["porutham_constraint", ["rajju"]]);
  if (t.vedha?.active) items.push(["porutham_constraint", ["vedha"]]);
  return vedicCollect(items);
}

export function topicsFromVedicPapasamyam(t: VedicPapasamyamTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const p of [t.person1, t.person2]) for (const r of p?.byReference ?? []) for (const a of r.afflictions ?? []) items.push(["papa_affliction", [r.reference, a.graha, String(a.house)]]);
  if (t.comparison) items.push(["papa_comparison", [t.comparison]]);
  return vedicCollect(items);
}
