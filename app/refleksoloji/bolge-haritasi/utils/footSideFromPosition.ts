import type { FootSide, FootView } from "../types";

/**
 * Bölge Haritası görsellerinde İKİ taraf da aynı görselde yan yana durur; taraf (footSide) çizimin görseldeki
 * konumundan belirlenir (2026-10-24: ayrı "Sol/Sağ" seçici kaldırıldı — veri modeli ve kayıt biçimi aynı).
 *
 * Görselin SOL yarısındaki taraf — her görünüm için görselin KENDİ etiketi / uygulamanın mevcut etiketi esas alınır
 * (2026-10-24 bağımsız anatomik doğrulama: başparmak/başparmak-ayak yönü = parmak yönü × yüzey normali):
 *  - taban  (klinik_taban.png)        : görsel etiketi "Sağ | Sol"; taban görünümünde soldaki ayağın başparmağı
 *                                       sağında (orta çizgi tarafında) → SAĞ ayak ✓
 *  - yan_ic (klinik_yan_ic.png)       : görsel etiketi "Sağ | Sol"
 *  - yan_dis(klinik_yan_dis.png)      : görsel etiketi "Sol | Sağ" (ters sıra — etikete uyulur)
 *  - el_avuc (el_avuc_sag_sol.png)    : HandSideLabels "Sol | Sağ"; avuç görünümünde soldaki elin başparmağı solda → SOL el ✓
 *  - el_sirt (el_sirti_sag_sol.png)   : HandSideLabels "Sol | Sağ"; sırt görünümünde soldaki elin başparmağı sağda → SOL el ✓
 * Yan görsellerin etiketleri parmak dizilişine göre de anatomik olarak tutarlıdır (yan_ic: tüm parmaklar basamaklı →
 * dış yüz; yan_dis: yalnız başparmak + kemer → iç yüz). Sekme adı ↔ görsel içeriği konusu ayrıca owner kararındadır;
 * burada YALNIZ görselin üzerindeki taraf etiketi izlenir (kullanıcının gördüğü ile kaydedilen aynı olsun).
 */
const LEFT_HALF_SIDE: Record<FootView, FootSide> = {
  taban: "right",
  yan_ic: "right",
  yan_dis: "left",
  el_avuc: "left",
  el_sirt: "left",
};

/** `x`: görsele göre normalize (0..1) yatay konum (bölge merkezi). */
export function footSideFromX(x: number, view: FootView): FootSide {
  const leftHalfSide = LEFT_HALF_SIDE[view];
  if (x < 0.5) return leftHalfSide;
  return leftHalfSide === "left" ? "right" : "left";
}

/** Noktalar listesinin yatay ortalaması (serbest çizim). */
export function meanX(points: { x: number }[]): number {
  if (points.length === 0) return 0.5;
  return points.reduce((acc, p) => acc + p.x, 0) / points.length;
}
