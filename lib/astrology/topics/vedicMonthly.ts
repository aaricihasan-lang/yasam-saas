// Atlas Vedik aylık zamanlama (2026-10-22) — Bilgi Bankası konu eşlemesi (SAF; KB otomatik DOLDURULMAZ, uzmanın kendi kaydı eşleşir).
//
// Ayrı "vedic_monthly" bağlamı (migration yok; anahtar biçimi DB regex'ine uyar). Astronomik açı konusu (monthly_aspect) Graha
// Drishti konularından (vedic_drishti) BİLİNÇLİ OLARAK ayrıdır; deklinasyon kendi türündedir:
//   monthly_ingress:<graha>:<rashi> · monthly_aspect:<açı> (gezegenler arası + Ay açıları) · monthly_declination:<parallel|contraparallel>
// Doğum anı deklinasyonları natal veridir; aylık konu üretmez. Tekrarlar tekilleştirilir.

import type { VedicMonthlyTechnical } from "../model/vedicMonthly";
import { vedicCollect, type VedicTopic } from "./vedic";

export function topicsFromVedicMonthly(t: VedicMonthlyTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  for (const e of t.ingress?.events ?? []) items.push(["monthly_ingress", [e.planet, e.to]]);
  for (const e of [...(t.aspects?.events ?? []), ...(t.lunar?.events ?? [])]) items.push(["monthly_aspect", [e.aspect]]);
  for (const e of t.parallels?.events ?? []) items.push(["monthly_declination", [e.type]]);
  return vedicCollect(items);
}
