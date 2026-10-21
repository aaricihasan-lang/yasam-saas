// Atlas yeni teknikler (2026-10-22) — Bilgi Bankası konu eşlemesi (SAF; YALNIZ mevcut mekanizma, yeni konu türü YOK).
//
//   • vedic.sade_sati → mevcut Gochara türü `gochara_from_moon:saturn:<12|1|2>` (bağlam vedic_gochara): Sade Sati, Satürn'ün
//     Janma Rashi'den 12./1./2. evdeki gocharasıdır; uzmanın bu türdeki kayıtları aynen eşleşir. KB içeriği sağlayıcı
//     verisiyle OTOMATİK DOLDURULMAZ — yalnız uzmanın kendi kaydı gösterilir.
//   • vedic.gun_milan → mevcut konu türlerinde koota / eşleştirme karşılığı yok → konu üretilmez (yalnız "Genel" notu).

import { SADE_SATI_HOUSE_FROM_MOON, type VedicSadeSatiTechnical } from "../model/vedicMatch";
import { vedicCollect, type VedicTopic } from "./vedic";

export function topicsFromVedicSadeSati(t: VedicSadeSatiTechnical): VedicTopic[] {
  if (!t.present || !t.phase) return [];
  return vedicCollect([["gochara_from_moon", ["saturn", String(SADE_SATI_HOUSE_FROM_MOON[t.phase])]]]);
}
