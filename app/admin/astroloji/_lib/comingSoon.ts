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
  // 22.10.2026 Vedik noktalar. Kalsarpa Dosha yöntem kararı bekliyor (yakında listesinde kalır).
  Upagraha: "vedic.upagraha",
  "Graha Asta (Heliacal Doğuş ve Batış)": "vedic.heliacal",
  // 2026-10-22: Vedik aylık zamanlama. ("Deklinasyon Paralelleri" maddesi yukarıda western.declination_parallels ile karşılanır.)
  "Aylık Vedik Transitler": "vedic.monthly",
  "Aylık Gezegen Açıları": "vedic.monthly",
  "Ay Açıları": "vedic.monthly",
};

export const AVAILABLE_TECHNIQUES: ReadonlySet<string> = new Set<string>(UI_TECHNIQUES);

/** Yalnız henüz kullanıma açılmamış maddeler; boş kalan bölüm düşer (sıra numarası görünen bölümlere göre). Madde metni değişmez. */
export function visibleComingSoonSections<S extends { items: readonly string[] }>(sections: readonly S[], available: ReadonlySet<string>): (S & { items: string[] })[] {
  return sections.map((s) => ({ ...s, items: s.items.filter((it) => !available.has(COMING_SOON_AVAILABLE_AS[it] ?? "")) })).filter((s) => s.items.length > 0);
}

/**
 * I18N-F1-R5: "Yakında" madde metni (TR kaynak = eşleme anahtarı) → dil-bağımsız kod. Ekran metni koddan katalogla
 * (atlas.soon.items.<kod>) çizilir; görünürlük kararı (COMING_SOON_AVAILABLE_AS) çeviriden ETKİLENMEZ.
 */
export const COMING_SOON_ITEM_CODES: Readonly<Record<string, string>> = {
  "William Lilly (1647)": "lilly",
  "Guido Bonatti": "bonatti",
  "Sahl ibn Bishr": "sahl",
  "Māshā'allāh": "mashaallah",
  "Çağdaş Geleneksel Horary": "contemporary_traditional_horary",
  "Modern Horary Yaklaşımları": "modern_horary",
  "Genel Prashna Kundali": "prashna_kundali",
  "Tajika Prashna": "tajika_prashna",
  "Prashna Marga": "prashna_marga",
  "Ashtamangala Prashna": "ashtamangala_prashna",
  Shatpanchasika: "shatpanchasika",
  "Arap Noktaları (Hermetik Lotlar)": "arabic_parts",
  "Gezegen Dönüş Haritaları (Satürn, Jüpiter, Mars, Venüs, Merkür)": "planetary_returns",
  "Asteroit Hesaplamaları (Ceres, Pallas, Juno, Vesta)": "asteroids",
  "Deklinasyon Paralelleri": "declination_parallels",
  "Gerçek Lilith Varyantı": "true_lilith",
  "Ayrıntılı Transit–Natal Açıları": "transit_natal_aspects",
  "Ekliptik Geçişleri": "ecliptic_crossings",
  "Aylık Gezegen Efemerisleri": "monthly_ephemerides",
  "Aylık Açı Olayları": "monthly_aspect_events",
  "Ayrıntılı Burç Geçişleri": "sign_ingresses",
  "Ay Evreleri ve Ay Takvimi": "moon_phases_calendar",
  "Jaimini Arudha Padaları": "arudha_padas",
  "Upapada Lagna": "upapada_lagna",
  "Chara Karaka": "chara_karaka",
  Atmakaraka: "atmakaraka",
  Darakaraka: "darakaraka",
  "Bhava Bala": "bhava_bala",
  "Bhav Chalit": "bhav_chalit",
  Upagraha: "upagraha",
  "Graha Asta (Heliacal Doğuş ve Batış)": "graha_asta",
  "Ayrıntılı Panchanga": "detailed_panchanga",
  "Rahu Kaal": "rahu_kaal",
  Yamaganda: "yamaganda",
  Gulika: "gulika",
  "Hora (Gezegen Saatleri)": "hora",
  Choghadiya: "choghadiya",
  "Güncel Vimshottari Dasha": "current_vimshottari",
  "Sookshma Dasha": "sookshma_dasha",
  "Prana Dasha": "prana_dasha",
  "Ayrıntılı Yoga Tespiti": "yoga_detection",
  "Yoga ve Avastha Açıklamaları": "yoga_avastha",
  "Manglik Dosha": "manglik",
  "Kalsarpa Dosha": "kalsarpa",
  "Sade Sati": "sade_sati",
  "Kundli Eşleştirme": "kundli_matching",
  "Ashtakoot (Ashtakoota)": "ashtakoot",
  Dashakoot: "dashakoot",
  Papasamyam: "papasamyam",
  "Sidereal Gezegen Efemerisleri": "sidereal_ephemerides",
  "Aylık Vedik Transitler": "monthly_vedic_transits",
  "Aylık Gezegen Açıları": "monthly_planet_aspects",
  "Ay Açıları": "moon_aspects",
  "Batı Astrolojisi Uyum Puanı": "western_compat_score",
  "Günlük, Haftalık, Aylık ve Yıllık Burç Yorumları": "horoscopes",
  "Burç ve Gezegen Açıklamaları": "sign_planet_desc",
  "Vedik Günlük Birleşik Okuma": "vedic_daily_reading",
  "Rashi ve Nakshatra Açıklamaları": "rashi_nakshatra_desc",
  "Astrolojik Zaman Çizelgesi": "astro_timeline",
  "Önemli Tarihler": "key_dates",
  "Dönem Özetleri": "period_summaries",
};
/** Bölüm başlığı (TR kaynak) → kod (atlas.soon.sections.<kod>; notlar atlas.soon.notes.<kod>_<n>). */
export const COMING_SOON_SECTION_CODES: Readonly<Record<string, string>> = {
  "Klasik Batı Horary Ekolleri": "western_horary_schools",
  "Vedik Prashna Ekolleri": "vedic_prashna_schools",
  "Yeni Batı Astrolojisi Haritaları ve Hesaplamaları": "new_western",
  "Batı Astrolojisi Ek Hesaplama ve Takvim Ayrıntıları": "western_extra",
  "Yeni Vedik Astroloji Hesaplamaları": "new_vedic",
  "Vedik Panchanga ve Zaman Hesaplamaları": "vedic_panchanga",
  "Vedik Dasha ve Yoga Genişletmeleri": "vedic_dasha_yoga",
  "Vedik Dosha ve Uyumluluk Hesaplamaları": "vedic_dosha_match",
  "Vedik Transit ve Astronomik Hesaplama Ayrıntıları": "vedic_transit_astro",
  "Diğer Astroloji Hesaplama İmkânları": "other",
};
