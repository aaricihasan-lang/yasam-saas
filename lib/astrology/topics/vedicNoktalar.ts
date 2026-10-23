// Vedik noktalar (22.10.2026) — Bilgi Bankası konu eşlemesi (SAF). KB içeriği sağlayıcı verisiyle OTOMATİK DOLDURULMAZ; yalnız uzmanın
// kendi kaydı eşleşir. Ayrı bağlamlar (migration yok; anahtar biçimi DB regex'ine uyar):
//   • vedic.upagraha → upagraha_in_rashi:<upagraha>:<rashi> ve (yalnız D1 bağlamı varsa) upagraha_in_bhava:<upagraha>:<1–12>
//   • vedic.heliacal → graha_heliacal:<graha>:<visible|asta> (değerlendirme günündeki durum)

import type { VedicHeliacalTechnical, VedicUpagrahaTechnical } from "../model/vedicNoktalar";
import { vedicCollect, type VedicTopic } from "./vedic";

export function topicsFromVedicUpagraha(t: VedicUpagrahaTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const p of [...(t.timeBased ?? []), ...(t.sunBased ?? [])]) {
    items.push(["upagraha_in_rashi", [p.id, p.rashi]]);
    if (typeof p.house === "number") items.push(["upagraha_in_bhava", [p.id, String(p.house)]]);
  }
  return vedicCollect(items);
}

export function topicsFromVedicHeliacal(t: VedicHeliacalTechnical): VedicTopic[] {
  return vedicCollect((t.grahas ?? []).map((g): [string, string[]] => ["graha_heliacal", [g.id, g.visible ? "visible" : "asta"]]));
}
