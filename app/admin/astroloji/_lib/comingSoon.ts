// Gökyüzü Atlası "Yakında" — madde ↔ teknik eşlemesi (SAF; istemci + harness).
// 2026-10-22 owner kararı: kullanıma açılan teknik "Yakında"da kalmaz. Madde, karşıladığı teknik UI kaydında
// (UI_TECHNIQUES) bulunduğunda gizlenir → teknik hangi sürümde açılıyorsa maddesi de o sürümde düşer.
import { UI_TECHNIQUES } from "./techniques";

/**
 * Madde → onu karşılayan Atlas tekniği. Panchanga ayrıntıları (Rahu Kaal, Yamaganda, Gulika) ve Dasha düzeyleri
 * (güncel zincir, Sookshma, Prana) mevcut "vedic.panchanga" / "vedic.dasha" içinde zaten yayında; Hora ve Choghadiya
 * aynı Panchanga tekniğinin seçeneği olarak bu sürümle açılır. Diğer kimlikler ilgili teknik eklendiğinde etkinleşir.
 */
export const COMING_SOON_AVAILABLE_AS: Readonly<Record<string, string>> = {
  "Arap Noktaları (Hermetik Lotlar)": "western.extra_points",
  "Asteroit Hesaplamaları (Ceres, Pallas, Juno, Vesta)": "western.extra_points",
  "Gerçek Lilith Varyantı": "western.extra_points",
  "Gezegen Dönüş Haritaları (Satürn, Jüpiter, Mars, Venüs, Merkür)": "western.planetary_return",
  "Jaimini Arudha Padaları": "vedic.arudha",
  "Upapada Lagna": "vedic.arudha",
  "Chara Karaka": "vedic.chara_karaka",
  Atmakaraka: "vedic.chara_karaka",
  Darakaraka: "vedic.chara_karaka",
  "Bhava Bala": "vedic.bhava_bala",
  "Bhav Chalit": "vedic.bhav_chalit",
  "Ayrıntılı Panchanga": "vedic.panchanga",
  "Rahu Kaal": "vedic.panchanga",
  Yamaganda: "vedic.panchanga",
  Gulika: "vedic.panchanga",
  "Hora (Gezegen Saatleri)": "vedic.panchanga",
  Choghadiya: "vedic.panchanga",
  "Güncel Vimshottari Dasha": "vedic.dasha",
  "Sookshma Dasha": "vedic.dasha",
  "Prana Dasha": "vedic.dasha",
  "Manglik Dosha": "vedic.gun_milan",
  "Kundli Eşleştirme": "vedic.gun_milan",
  "Ashtakoot (Ashtakoota)": "vedic.gun_milan",
  "Sade Sati": "vedic.sade_sati",
  // 2026-10-22: deklinasyon (ekvator koordinatı) gelenekten bağımsızdır → Batı ve Vedik bölümlerindeki aynı madde birlikte düşer.
  "Deklinasyon Paralelleri": "western.declination_parallels",
  Dashakoot: "vedic.dashakoot",
  Papasamyam: "vedic.papasamyam",
};

export const AVAILABLE_TECHNIQUES: ReadonlySet<string> = new Set<string>(UI_TECHNIQUES);

/** Yalnız henüz kullanıma açılmamış maddeler; boş kalan bölüm düşer (sıra numarası görünen bölümlere göre). Madde metni değişmez. */
export function visibleComingSoonSections<S extends { items: readonly string[] }>(sections: readonly S[], available: ReadonlySet<string>): (S & { items: string[] })[] {
  return sections.map((s) => ({ ...s, items: s.items.filter((it) => !available.has(COMING_SOON_AVAILABLE_AS[it] ?? "")) })).filter((s) => s.items.length > 0);
}
