// Atlas yeni teknikler (2026-10-22) — Bilgi Bankası konu eşlemesi (SAF; YALNIZ mevcut mekanizma, yeni konu türü YOK).
//
//   • vedic.sade_sati → mevcut Gochara türü `gochara_from_moon:saturn:<12|1|2>` (bağlam vedic_gochara): Sade Sati, Satürn'ün
//     Janma Rashi'den 12./1./2. evdeki gocharasıdır; uzmanın bu türdeki kayıtları aynen eşleşir. KB içeriği sağlayıcı
//     verisiyle OTOMATİK DOLDURULMAZ — yalnız uzmanın kendi kaydı gösterilir.
//   • vedic.gun_milan → 22.10.2026: ayrı "vedic_match" bağlamı (migration yok; anahtar biçimi DB regex'ine uyar):
//     match_koota_score:<koota>:<full|partial|zero>, match_dosha:<nadi|bhakoot>, match_dosha_cancelled:<…>, manglik:<derece>.
//     Konu yalnız teknik veriden (puan bandı / dosha / Manglik derecesi) türetilir; tekrarlar tekilleştirilir.

import { SADE_SATI_HOUSE_FROM_MOON, type VedicGunMilanTechnical, type VedicSadeSatiTechnical } from "../model/vedicMatch";
import { vedicCollect, type VedicTopic } from "./vedic";

export function topicsFromVedicGunMilan(t: VedicGunMilanTechnical): VedicTopic[] {
  const items: [string, string[]][] = [];
  // Maskeli / eksik teknik veride (ör. eski ya da kısmi kayıt) konu üretilmez; yanlış konu atanmaz.
  for (const k of t.kootas ?? []) items.push(["match_koota_score", [k.id, k.score >= k.maxScore ? "full" : k.score <= 0 ? "zero" : "partial"]]);
  for (const d of t.doshas ?? []) items.push(["match_dosha", [d]]);
  for (const c of t.cancellations ?? []) items.push(["match_dosha_cancelled", [c.dosha]]);
  for (const m of t.manglik ? [t.manglik.person1, t.manglik.person2] : []) if (m.present && m.severity) items.push(["manglik", [m.severity]]);
  return vedicCollect(items);
}

export function topicsFromVedicSadeSati(t: VedicSadeSatiTechnical): VedicTopic[] {
  if (!t.present || !t.phase) return [];
  return vedicCollect([["gochara_from_moon", ["saturn", String(SADE_SATI_HOUSE_FROM_MOON[t.phase])]]]);
}
