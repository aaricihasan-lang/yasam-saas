// Astroloji — EK NOKTALAR Türkçe etiketleri, sembolleri ve yöntem metinleri (SAF; ekran + Word/PDF ortak). 2026-10-22.
// Ortalama ve gerçek Lilith AYRI etiket ve AYRI renk taşır; hiçbir yerde tek "Lilith" olarak birleştirilmez.

import type { AsteroidId, ExtraLot, ExtraSection, LilithVariant, LotId, LotTerm } from "../model/westernExtraPoints";

export const EXTRA_SECTION_LABELS: Record<ExtraSection, string> = {
  asteroids: "Asteroitler (Ceres, Pallas, Juno, Vesta)",
  lots: "Hermetik lotlar (Arap noktaları)",
  lilith: "Kara Ay Lilith — ortalama ve gerçek",
};

export const ASTEROID_LABELS: Record<AsteroidId, string> = { ceres: "Ceres", pallas: "Pallas", juno: "Juno", vesta: "Vesta" };
export const ASTEROID_GLYPHS: Record<AsteroidId, string> = { ceres: "⚳", pallas: "⚴", juno: "⚵", vesta: "⚶" };

export const LOT_LABELS: Record<LotId, string> = {
  fortune: "Şans Noktası (Fortuna)",
  spirit: "Ruh Noktası (Spirit)",
  eros: "Eros Noktası",
  necessity: "Zorunluluk Noktası (Necessity)",
  courage: "Cesaret Noktası (Courage)",
  victory: "Zafer Noktası (Victory)",
  nemesis: "Nemesis Noktası",
};
/** Çark üzerindeki kısa etiket (lotların ortak sembolü yoktur; Fortuna için geleneksel ⊗). */
export const LOT_SHORT: Record<LotId, string> = { fortune: "⊗", spirit: "Ru", eros: "Er", necessity: "Zo", courage: "Ce", victory: "Za", nemesis: "Ne" };

export const LOT_TERM_LABELS: Record<LotTerm, string> = {
  sun: "Güneş",
  moon: "Ay",
  mercury: "Merkür",
  venus: "Venüs",
  mars: "Mars",
  jupiter: "Jüpiter",
  saturn: "Satürn",
  fortune: "Şans Noktası",
  spirit: "Ruh Noktası",
};
export const lotFormulaText = (l: Pick<ExtraLot, "plus" | "minus">) => `Yükselen + ${LOT_TERM_LABELS[l.plus]} − ${LOT_TERM_LABELS[l.minus]}`;

export const LILITH_LABELS: Record<LilithVariant, string> = {
  mean: "Ortalama Kara Ay Lilith (ortalama apoje)",
  true: "Gerçek Kara Ay Lilith (osculating apoje)",
};
export const LILITH_SHORT: Record<LilithVariant, string> = { mean: "⚸ ort.", true: "⚸ gerç." };
/** Ekran + çark renkleri: ortalama koyu arduvaz, gerçek koyu kehribar (iki değişken asla aynı renkte değil). */
export const LILITH_COLORS: Record<LilithVariant, string> = { mean: "#334155", true: "#b45309" };
export const ASTEROID_COLOR = "#0f766e";
export const LOT_COLOR = "#7c3aed";

export const SECT_LABELS: Record<"day" | "night", string> = { day: "Gündüz haritası (Güneş ufkun üstünde)", night: "Gece haritası (Güneş ufkun altında)" };

export const EXTRA_POINTS_METHOD_TEXT =
  "Asteroitler ve Kara Ay Lilith tropikal ekliptik boylamla verilir; evler seçilen ev sistemiyle yerleştirilir. Ortalama Lilith düzleştirilmiş (ortalama) Ay apojesidir; gerçek (osculating) Lilith o andaki anlık apojedir ve iki değer onlarca derece farklı olabilir — ayrı noktalar olarak okunur.";
export const LOTS_METHOD_TEXT =
  "Hermetik lotlar (Paulus Alexandrinus): her lot Yükselen'den, iki noktanın arasındaki yay kadar ileri sayılarak bulunur (Yükselen + A − B). Gündüz haritasında (Güneş ufkun üstünde) gündüz formülü, gece haritasında terimleri yer değiştirmiş gece formülü kullanılır. Şans Noktası: gündüz Yükselen + Ay − Güneş, gece Yükselen + Güneş − Ay; Ruh Noktası bunun tersidir. Gündüz/gece ayrımı geometrik ufuktan belirlenir.";
export const LOT_VICTORY_NOTE =
  "Zafer Noktası (Victory): hesaplama servisinin bildirdiği formül, Paulus geleneğindeki terim sırasının tersidir (gündüz Yükselen + Ruh Noktası − Jüpiter; geleneksel gündüz formülü Yükselen + Jüpiter − Ruh Noktası). Hesaplama yöntemi doğrulanana kadar bu noktanın burcu ve derecesi gösterilmez. Diğer lotlar ve Şans Noktası bu durumdan etkilenmez.";
/** 2026-10-23: Zafer yerel Paulus değeri gösterildiğinde (ekran + Word/PDF ortak). */
export const LOT_VICTORY_LOCAL_NOTE =
  "Zafer Noktası (Victory) Paulus Alexandrinus'un Hermetik formülüyle gösterilir (gündüz Yükselen + Jüpiter − Ruh Noktası, gece tersi). Hesaplama servisi terimleri ters sırayla kullandığından değer, servisin kendi Şans ve Ruh noktalarından kesin aritmetikle hesaplandı (Şans + Ruh = 2 × Yükselen); servisin Zafer yorumu bu yüzden gösterilmez.";
export const LOT_NONTRADITIONAL_NOTE = "Bu lotun formülü Paulus geleneğinden farklı sırayla hesaplanmıştır (yöntem farkı); hesaplama yöntemi doğrulanana kadar burcu ve derecesi gösterilmez.";
/** Gizlenen lotun tablo hücresi (burç/derece ve boylam yerine). */
export const LOT_WITHHELD_CELL = "Yöntem doğrulanıyor";
export const FORTUNE_SINGLE_SOURCE_NOTE =
  "Şans Noktası tek kaynaktan gösterilir: bu tablodaki değer, natal haritada da gösterilen Şans Noktası ile denetlenir (gündüz/gece kuralı aynı). Ayrı bir ikinci hesap yapılmaz.";
export const EXTRA_NATAL_MISSING_NOTE =
  "Aynı doğum bilgisi ve aynı ev sistemiyle kayıtlı natal harita bulunmadığı için natal çark katmanı ve natal tutarlılık denetimi gösterilmiyor. Natal haritayı aynı ev sistemiyle hesaplayıp bu analizi yeniden açabilirsiniz (ek noktalar için yeni istek gerekmez).";

export const fmtDiffDeg = (d: number | null) => (d === null ? "—" : d < 0.01 ? "< 0,01°" : `${d.toFixed(2).replace(".", ",")}°`);
export const CONSISTENCY_LABELS: Record<"consistent" | "inconsistent" | "unavailable", string> = {
  consistent: "Uyumlu",
  inconsistent: "Uyumsuz — sağlayıcı farkı (değerler değiştirilmedi)",
  unavailable: "Denetlenemedi",
};
