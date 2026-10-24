// Astroloji — VEDİK HARİTA kanonik modelleri (22.10.2026; SAF, istemci de import edebilir).
//
// Dört AYRI teknik: Bhav Chalit (vedic.bhav_chalit), Chara Karaka (vedic.chara_karaka), Arudha Pada (vedic.arudha),
// Bhava Bala (vedic.bhava_bala). Hesap motoru sağlayıcıdır; bu dosya yalnız kanonik veri biçimidir. Teknik katmana sağlayıcı
// serbest metni (anlam, signification, ev temaları) GİRMEZ; o metinler ayrı "interp" tiplerinde ve yalnız yetkiyle servis edilir.
//
// KESİN AYRIM: Vedik D1 (vedic.d1) bütün-burç (rashi) evleri kullanır; Bhav Chalit sağlayıcının bhava (Sripati: madhya = cusp,
// sandhi sınırları) evleridir. İki ev numarası HER ZAMAN ayrı etiketle gösterilir ("Rashi evi (D1)" / "Chalit bhavası").

import type { SignId } from "./western";
import type { VedicFrame, VedicGrahaId } from "./vedic";

// ─── A · Bhav Chalit ─────────────────────────────────────────────────────────
export const VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA = "astro.vedic.bhav_chalit.v1" as const;
export const VEDIC_BHAV_CHALIT_INTERP_SCHEMA = "astro.vedic.bhav_chalit.interp.v1" as const;
export type VedicChalitBhava = {
  house: number;
  /** Bhava başlangıcı (önceki sandhi), madhya (bhava ortası = cusp), bitiş (sonraki sandhi) — sidereal boylam. */
  start: number;
  madhya: number;
  end: number;
  span: number;
  /** Bhava madhyasının rashisi. */
  rashi: SignId;
  grahas: VedicGrahaId[];
};
export type VedicChalitGraha = {
  id: VedicGrahaId;
  longitude: number;
  rashi: SignId;
  /** Chalit bhavası (sağlayıcı bhava sınırlarına göre). */
  bhava: number;
  /** Rashi evi: Lagna rashisinden bütün-burç (D1) sayımı — sağlayıcı yanıtındaki karşılaştırma alanı. */
  rashiHouse: number;
  /** Chalit bhavası rashi evinden farklı mı. */
  moved: boolean;
};
export type VedicBhavChalitTechnical = {
  schema: typeof VEDIC_BHAV_CHALIT_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  /** Sağlayıcının bhava yöntemi (golden: "sripati"). */
  houseSystem: string;
  ascendant: number;
  midheaven: number;
  /** Lagna rashisi (Yükselen boylamının burcu) — rashi evlerinin başlangıcı. */
  lagnaRashi: SignId;
  bhavas: VedicChalitBhava[];
  grahas: VedicChalitGraha[];
  movedCount: number;
};
export type VedicBhavChalitInterpretation = { schema: typeof VEDIC_BHAV_CHALIT_INTERP_SCHEMA; houseThemes: { house: number; keywords: string[] }[] };

export const BHAVA_SYSTEM_LABELS: Readonly<Record<string, string>> = {
  sripati: "Sripati (bhava madhya = cusp; sınırlar iki madhya arasındaki sandhi)",
};
export const bhavaSystemLabel = (v: string) => BHAVA_SYSTEM_LABELS[v] ?? v;

// ─── B · Chara Karaka (Jaimini) ──────────────────────────────────────────────
export const VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA = "astro.vedic.chara_karaka.v1" as const;
export const VEDIC_CHARA_KARAKA_INTERP_SCHEMA = "astro.vedic.chara_karaka.interp.v1" as const;
export const CHARA_KARAKA_IDS_EIGHT = ["atmakaraka", "amatyakaraka", "bhratrikaraka", "matrikaraka", "pitrikaraka", "putrakaraka", "gnatikaraka", "darakaraka"] as const;
export const CHARA_KARAKA_IDS_SEVEN = ["atmakaraka", "amatyakaraka", "bhratrikaraka", "matrikaraka", "putrakaraka", "gnatikaraka", "darakaraka"] as const;
export type CharaKarakaId = (typeof CHARA_KARAKA_IDS_EIGHT)[number];
export const CHARA_KARAKA_ABBR: Readonly<Record<CharaKarakaId, string>> = {
  atmakaraka: "AK", amatyakaraka: "AmK", bhratrikaraka: "BK", matrikaraka: "MK", pitrikaraka: "PiK", putrakaraka: "PK", gnatikaraka: "GK", darakaraka: "DK",
};
export const CHARA_KARAKA_NAMES: Readonly<Record<CharaKarakaId, string>> = {
  atmakaraka: "Atmakaraka", amatyakaraka: "Amatyakaraka", bhratrikaraka: "Bhratrikaraka", matrikaraka: "Matrikaraka", pitrikaraka: "Pitrikaraka", putrakaraka: "Putrakaraka", gnatikaraka: "Gnatikaraka", darakaraka: "Darakaraka",
};
export type CharaKarakaSchemeId = "eight" | "seven";
export const CHARA_KARAKA_SCHEME_LABELS: Readonly<Record<CharaKarakaSchemeId, string>> = {
  eight: "8 karaka (Rahu dahil; Pitrikaraka ayrı)",
  seven: "7 karaka (Rahu hariç; Pitrikaraka yok)",
};
export type VedicCharaKarakaTechnical = {
  schema: typeof VEDIC_CHARA_KARAKA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  scheme: CharaKarakaSchemeId;
  atmakaraka: VedicGrahaId;
  darakaraka: VedicGrahaId;
  /** Sıralama derecesine göre azalan (1. = Atmakaraka). */
  karakas: {
    id: CharaKarakaId;
    graha: VedicGrahaId;
    rashi: SignId;
    degreeInRashi: number;
    /** Sıralama derecesi: burç içi derece; Rahu'da ters (30° − derece). */
    rankingDegree: number;
    reversed: boolean;
  }[];
};
export type VedicCharaKarakaInterpretation = { schema: typeof VEDIC_CHARA_KARAKA_INTERP_SCHEMA; karakas: { id: CharaKarakaId; meaning: string | null; significations: string | null }[] };

// ─── C · Arudha Pada (Jaimini) ───────────────────────────────────────────────
export const VEDIC_ARUDHA_TECHNICAL_SCHEMA = "astro.vedic.arudha.v1" as const;
export const VEDIC_ARUDHA_INTERP_SCHEMA = "astro.vedic.arudha.interp.v1" as const;
export const ARUDHA_PADA_IDS = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "a10", "a11", "a12"] as const;
export type ArudhaPadaId = (typeof ARUDHA_PADA_IDS)[number];
export const ARUDHA_ABBR: Readonly<Record<ArudhaPadaId, string>> = {
  a1: "AL", a2: "A2", a3: "A3", a4: "A4", a5: "A5", a6: "A6", a7: "A7", a8: "A8", a9: "A9", a10: "A10", a11: "A11", a12: "UL",
};
/** Geleneksel pada adları (teknik terim; yorum değil). */
export const ARUDHA_NAMES: Readonly<Record<ArudhaPadaId, string>> = {
  a1: "Arudha Lagna", a2: "Dhana Pada", a3: "Bhratri Pada", a4: "Matri Pada", a5: "Mantra Pada", a6: "Roga Pada",
  a7: "Dara Pada", a8: "Mrityu Pada", a9: "Bhagya Pada", a10: "Karma Pada", a11: "Labha Pada", a12: "Upapada",
};
export type VedicArudhaPada = {
  id: ArudhaPadaId;
  /** Bhava (1–12) ve bhavanın rashisi (Lagna'dan bütün-burç). */
  house: number;
  bhavaRashi: SignId;
  lord: VedicGrahaId;
  lordRashi: SignId;
  /** Bhava rashisinden lordun rashisine sayım (1–12; dahil sayım). */
  count: number;
  /** Lorddan aynı sayı kadar ileri: istisna uygulanmadan önceki rashi. */
  rawRashi: SignId;
  rashi: SignId;
  houseFromLagna: number;
  /** Klasik istisna: ham pada bhavanın kendisine (1.) veya 7.sine düşerse ondan 10. rashi alınır. */
  exceptionApplied: boolean;
};
export type VedicArudhaTechnical = {
  schema: typeof VEDIC_ARUDHA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  lagnaRashi: SignId;
  arudhaLagna: SignId;
  upapada: SignId;
  padas: VedicArudhaPada[];
};
export type VedicArudhaInterpretation = { schema: typeof VEDIC_ARUDHA_INTERP_SCHEMA; padas: { id: ArudhaPadaId; name: string | null; meaning: string | null; significations: string | null }[] };

// ─── D · Bhava Bala ──────────────────────────────────────────────────────────
export const VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA = "astro.vedic.bhava_bala.v1" as const;
export const VEDIC_BHAVA_BALA_INTERP_SCHEMA = "astro.vedic.bhava_bala.interp.v1" as const;
export const BHAVA_BALA_COMPONENTS = ["bhavadhipatiBala", "digBala", "drishtiBala"] as const;
export type BhavaBalaComponent = (typeof BHAVA_BALA_COMPONENTS)[number];
export type VedicBhavaBalaTechnical = {
  schema: typeof VEDIC_BHAVA_BALA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  houseSystem: string;
  bhavas: ({ house: number; rashi: SignId; madhya: number; lord: VedicGrahaId } & Record<BhavaBalaComponent, number> & { totalVirupas: number; totalRupas: number; rank: number })[];
};
export type VedicBhavaBalaInterpretation = { schema: typeof VEDIC_BHAVA_BALA_INTERP_SCHEMA; houseThemes: { house: number; keywords: string[] }[] };

/** Ekran / rapor açıklaması: gezegen gücü (Shadbala) ile ev gücü (Bhava Bala) ayrımı. */
export const BHAVA_BALA_VS_SHADBALA_NOTE =
  "Bhava Bala EVİN (bhava) gücüdür; Shadbala ise GEZEGENİN (graha) gücüdür. Bhava Bala üç bileşenin toplamıdır: Bhavadhipati Bala (ev lordunun Shadbala toplamı), Dig Bala (bhava burcunun yön gücü) ve Drishti Bala (bhavaya düşen bakışların net etkisi; eksi olabilir). Değerler virupa, toplam ayrıca rupa (virupa / 60). Sıra 1 = en güçlü ev.";
/**
 * 2026-10-22 bağımsız doğrulama (Swiss Ephemeris + BPHS 26–27; 12/12 bhava sağlayıcıyla aynı): hesaplanan ekolün açık beyanı.
 * Yalnız açıklama; değerler sağlayıcınındır, düzeltilmez.
 */
export const BHAVA_BALA_SCHOOL_NOTE =
  "Hesaplama ekolü: Dig Bala burç sınıfına göre verilir (insan burçları Lagna'da, dört ayaklılar 10.'da, su burçları 4.'de, Akrep 7.'de en güçlü; Yay ve Oğlak burç ortasından ikiye bölünür, Yengeç su burcu sayılır) ve tam ev farkı başına 10 virupa azalır. Drishti Bala, bhava madhyasına düşen bakışların BPHS bakış eğrisi ve Mars, Jüpiter, Satürn özel bakışlarıyla hesaplanan değerinin dörtte biridir (iyicil eklenir, kötücül çıkarılır). Merkür ve Jüpiter bakışını tam ekleyen ekol ile farkı dereceyle sürekli ölçen ekol bu hesapta uygulanmaz; bu ekollerde değerler ve sıra farklı olabilir.";
export const CHALIT_VS_D1_NOTE =
  "Bhav Chalit, Vedik D1 (Rashi) haritasından AYRI bir ev yöntemidir: D1'de evler Lagna rashisinden bütün-burç sayılır; Bhav Chalit'te her bhava kendi madhyası (cusp) etrafında, iki madhya arasındaki sandhi sınırlarıyla belirlenir. Bir graha bu nedenle D1 evinden farklı bir chalit bhavasında olabilir.";
export const ARUDHA_METHOD_NOTE =
  "Arudha pada: bhava rashisinden lordunun rashisine kadar sayılır, lorddan aynı sayı kadar ileri gidilir. Sonuç bhavanın kendisine (1.) ya da 7.sine düşerse ondan 10. rashi alınır (klasik istisna). Çift lordlu burçlarda (Akrep, Kova) yalnız klasik lord (Mars, Satürn) kullanılır — lord kendi burcunda olsa bile; bazı ekollerin (ör. Jaimini) Ketu/Rahu'ya geçen ya da güçlü lordu seçen kuralı uygulanmaz ve bu ekollerde bazı padalar farklı burca düşebilir.";
export const CHARA_KARAKA_METHOD_NOTE =
  "Chara karakalar Jaimini yöntemiyle grahaların burç içi derecelerine göre büyükten küçüğe sıralanır; en yüksek derece Atmakaraka, en düşük Darakaraka olur. Rahu geri hareket ettiğinden sıralamada 30° − derece ile değerlendirilir (yalnız 8'li şemada). Şema seçimi bir ekol tercihidir; 7'li şemada Rahu ve Pitrikaraka yoktur.";
