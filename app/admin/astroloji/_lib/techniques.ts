// Astroloji owner UI — teknik seçimi için İSTEMCİ meta verisi (SAF).
// Sunucudaki teknik tanımları (lib/astrology/engine/techniques) istemci paketine ALINMAZ; burada yalnız
// etiket + hangi parametrenin sorulacağı tutulur. Seçenekler sunucuda yeniden doğrulanır/normalize edilir.

import { addDaysIso, dateInputIssue, formatInZone, horaryDisplayZone, localToUtcPreview, questionMomentLabel, timeInputIssue } from "@/lib/astrology/transitDetail";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";
import type { NatalHouseSystemOption } from "@/lib/astrology/model/natalHouseSystems";
import { NATAL_HOUSE_SYSTEM_LABELS } from "@/lib/astrology/labels/tr";
import { profectionAgeOf, profectionAgeOn } from "@/lib/astrology/model/westernProfections";
import { KP_RI_DEFAULT, kpIntervalWindowOk } from "@/lib/astrology/model/kpRulingInterval";
import { EXTRA_SECTIONS, extraSectionsOf, type ExtraSection } from "@/lib/astrology/model/westernExtraPoints";
// 2026-10-22 — Gezegen dönüşleri (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { PLANETARY_RETURN_LABELS, isPlanetaryReturnPlanet, type PlanetaryReturnPlanet } from "@/lib/astrology/model/westernPlanetaryReturn";
// 2026-10-22 — Deklinasyon paralelleri (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { DECLINATION_ORB_DEFAULT, declinationMonthLabel, declinationMonthOk } from "@/lib/astrology/model/westernDeclination";
// 2026-10-22 — Vedik aylık zamanlama (ayrı satır: paralel teknik eklemeleriyle birleştirme çakışması olmasın).
import { VEDIC_MONTHLY_DEFAULT_SECTIONS, vedicMonthlySectionsOf, vedicMonthOk, type VedicMonthlySection } from "@/lib/astrology/model/vedicMonthly";

export const UI_TECHNIQUES = [
  "western.natal",
  "western.transit",
  "western.forecast",
  "western.progression",
  "western.solar_arc",
  "western.solar_return",
  "western.lunar_return",
  "western.synastry",
  "western.composite",
  "western.astrocartography",
  "western.relocation",
  "western.local_space",
  "western.fixed_stars",
  "western.profections",
  "western.extra_points",
  "western.planetary_return",
  // 2026-10-22: aylık gökyüzü takvimi (doğum verisi kullanılmaz).
  "western.declination_parallels",
  "vedic.d1",
  "vedic.varga",
  "vedic.dasha",
  "vedic.drishti",
  "vedic.ashtakavarga",
  "vedic.shadbala",
  "vedic.panchanga",
  "vedic.transit",
  "vedic.bhav_chalit",
  "vedic.chara_karaka",
  "vedic.arudha",
  "vedic.bhava_bala",
  // 2026-10-22 (yalnız ek): Vedik eşleştirme (iki kişi) + Sade Sati.
  "vedic.gun_milan",
  "vedic.sade_sati",
  // 2026-10-22 gece (yalnız ek): Güney Hint On Porutham + Papasamyam (Gun Milan'dan ayrı teknikler, aynı eşleştirme grubu).
  "vedic.dashakoot",
  "vedic.papasamyam",
  // 22.10.2026 Vedik noktalar (yalnız ek).
  "vedic.upagraha",
  "vedic.heliacal",
  // 2026-10-22 (yalnız ek): Vedik aylık zamanlama.
  "vedic.monthly",
  "kp.chart",
  "kp.dasha",
  "kp.ruling",
  "kp.transit",
  "kp.horary",
  "kp.ruling_interval",
] as const;
export type UiTechniqueId = (typeof UI_TECHNIQUES)[number];

export const TECHNIQUE_META: Record<UiTechniqueId, { label: string; hint: string; needsPartner: boolean; needsTime: boolean }> = {
  "western.natal": { label: "Natal", hint: "Doğum haritası", needsPartner: false, needsTime: false },
  "western.transit": { label: "Transit (tek an)", hint: "Seçilen andaki gökyüzü → natal açılar", needsPartner: false, needsTime: false },
  "western.forecast": { label: "Transit takvimi", hint: "Dönem boyunca açı, burç girişi, istasyon, tutulma, Ay evresi", needsPartner: false, needsTime: false },
  "western.progression": { label: "Secondary progression", hint: "Gün = yıl ilerletilmiş harita", needsPartner: false, needsTime: false },
  "western.solar_arc": { label: "Solar arc", hint: "Tüm noktalar ilerletilmiş Güneş yayı kadar", needsPartner: false, needsTime: false },
  "western.solar_return": { label: "Solar return", hint: "Güneş'in natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.lunar_return": { label: "Lunar return", hint: "Ay'ın natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.synastry": { label: "Sinastri", hint: "İki kişinin haritaları arası açılar + ev bindirmesi", needsPartner: true, needsTime: false },
  "western.composite": { label: "Composite", hint: "İki haritanın orta nokta haritası", needsPartner: true, needsTime: false },
  "western.astrocartography": { label: "Astrocartography", hint: "Gezegen MC/IC/AC/DC hatları — dünya haritası", needsPartner: false, needsTime: true },
  "western.relocation": { label: "Relocation", hint: "Aynı doğum anı, yeni konum: ASC/MC/evler", needsPartner: false, needsTime: true },
  "western.local_space": { label: "Local Space", hint: "Doğum anında ufuk yönleri (pusula + harita)", needsPartner: false, needsTime: true },
  "western.fixed_stars": { label: "Sabit yıldızlar", hint: "43 sabit yıldızın doğum anındaki konumu + natal noktalarla ekliptik boylam kavuşumları", needsPartner: false, needsTime: false },
  "western.profections": { label: "Yıllık Profeksiyonlar", hint: "Yükselen burçtan her yaş için bir burç (bütün-burç evleri): yılın etkin evi, burcu ve klasik yönetici gezegeni", needsPartner: false, needsTime: true },
  "western.extra_points": { label: "Ek noktalar", hint: "İsteğe bağlı bölümler: asteroitler (Ceres, Pallas, Juno, Vesta), yedi Hermetik lot, Kara Ay Lilith ortalama + gerçek", needsPartner: false, needsTime: false },
  "western.planetary_return": { label: "Gezegen dönüşleri", hint: "Satürn, Jüpiter, Mars, Venüs veya Merkür'ün natal boylamına döndüğü anın haritası; retro döngüsünde kavuşum seçilir", needsPartner: false, needsTime: true },
  "western.declination_parallels": { label: "Deklinasyon paralelleri", hint: "Seçilen ayda iki gök cismi arasındaki paralel (aynı deklinasyon) ve kontraparalel (zıt deklinasyon) temasların kesinleşme anları — gökyüzü takvimi; doğum verisi kullanılmaz", needsPartner: false, needsTime: false },
  "vedic.d1": { label: "Vedik D1 (Rashi)", hint: "Sidereal kundli: Lagna, graha, nakshatra/pada, yogalar", needsPartner: false, needsTime: true },
  "vedic.drishti": { label: "Graha Drishti", hint: "Parashari bütün-burç graha drishti — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.ashtakavarga": { label: "Ashtakavarga", hint: "Bhinna/Sarva bindu ızgarası, Shodhana, Shodhya Pinda", needsPartner: false, needsTime: true },
  "vedic.shadbala": { label: "Shadbala", hint: "Altı katlı graha gücü (BPHS), oran ve sıralama", needsPartner: false, needsTime: true },
  "vedic.panchanga": { label: "Janma Panchanga", hint: "Doğum anı tithi, nakshatra, nitya yoga, karana; isteğe bağlı ayrıntılı gün (vara, gün doğumu, Rahu Kaal…) ve gezegen saatleri (hora) + Choghadiya — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.transit": { label: "Gochara (Vedik transit)", hint: "Seçilen anın sidereal grahaları → Janma Rashi'den / Lagna'dan ev, bütün-burç drishti, kaksha — yalnız Lahiri", needsPartner: false, needsTime: true },
  "vedic.bhav_chalit": { label: "Bhav Chalit", hint: "Bhava (Sripati) ev başlangıçları, madhya ve sandhi; grahaların chalit bhavası ile D1 rashi evi karşılaştırması", needsPartner: false, needsTime: true },
  "vedic.chara_karaka": { label: "Chara Karakalar", hint: "Jaimini: Atmakaraka … Darakaraka; derece sıralaması; 8'li (Rahu dahil) veya 7'li şema", needsPartner: false, needsTime: true },
  "vedic.arudha": { label: "Arudha Padalar", hint: "Jaimini: Arudha Lagna (AL), A2…A11, Upapada (UL); lord, sayım ve 1./7. ev istisnası", needsPartner: false, needsTime: true },
  "vedic.bhava_bala": { label: "Bhava Bala", hint: "12 evin gücü: Bhavadhipati, Dig ve Drishti Bala; toplam ve sıralama (gezegen gücü Shadbala'dan ayrı)", needsPartner: false, needsTime: true },
  "kp.chart": { label: "KP doğum haritası", hint: "Placidus cusp'ları, sign / star / sub / sub-sub lord, 4 düzey significator (KP-Newcomb)", needsPartner: false, needsTime: true },
  "kp.dasha": { label: "KP dasha", hint: "Vimshottari (KP ayanamsa) + dönem lordlarının KP significator'ları; alt dönemler tıklayınca", needsPartner: false, needsTime: true },
  "kp.ruling": { label: "KP ruling planets", hint: "Seçilen anın ruling planet'leri + natal significator'ları", needsPartner: false, needsTime: true },
  "kp.transit": { label: "KP transit", hint: "Tek an KP gökyüzü veya zaman aralığında Sub-Lord / Rasi geçişleri; natal ev analizi yok", needsPartner: false, needsTime: false },
  "kp.horary": { label: "KP horary (1–249)", hint: "Sayı + soru anı + değerlendirme yeri; doğum verisi kullanılmaz", needsPartner: false, needsTime: false },
  "kp.ruling_interval": { label: "KP ruling planets zaman taraması", hint: "Seçilen aralıkta adım adım ruling planet'ler, Lagna/Ay lord zinciri ve o anın haritasından significator'lar; doğum verisi kullanılmaz", needsPartner: false, needsTime: false },
  "vedic.dasha": { label: "Vimshottari Dasha", hint: "Mahadasha zaman çizelgesi; alt dönemler Prana düzeyine kadar tıklayınca yüklenir; güncel dönem zinciri isteğe bağlı", needsPartner: false, needsTime: true },
  "vedic.varga": { label: "Vedik Varga (D9 Navamsa / Dn)", hint: "Bölümsel harita: D9 varsayılan; D2…D60 seçilebilir; vargottama", needsPartner: false, needsTime: true },
  "vedic.gun_milan": { label: "Gun Milan (Ashtakoot)", hint: "İki kişinin Ay nakshatra / burcuna göre 8 koota puanı (36 üzerinden), Nadi / Bhakoot dosha ve klasik iptal, iki kişi Manglik — teknik değerlendirme", needsPartner: true, needsTime: true },
  "vedic.monthly": { label: "Vedik aylık zamanlama", hint: "Seçilen ayın sidereal (Lahiri) gökyüzü takvimi: gezegen burç girişleri, gezegenler arası ve Ay ile astronomik açı kesinleşmeleri, deklinasyon paralelleri; isteğe bağlı doğum anı deklinasyonları. Graha drishti değildir", needsPartner: false, needsTime: false },
  "vedic.sade_sati": { label: "Sade Sati", hint: "Satürn'ün Janma Rashi'den 12. / 1. / 2. ev gocharası: yalnız değerlendirme günündeki durum ve evre (dönem başlangıç / bitiş tarihleri bu sürümde yok)", needsPartner: false, needsTime: true },
  "vedic.dashakoot": { label: "On Porutham (Dashakoot)", hint: "Güney Hint eşleştirme: 10 porutham kriteri (karşılandı / karşılanmadı), 10 üzerinden toplam, Rajju ve Vedha kesin kısıtları; Gun Milan'dan ayrı sistem — teknik değerlendirme", needsPartner: true, needsTime: true },
  "vedic.papasamyam": { label: "Papasamyam", hint: "İki haritada Mars, Satürn, Güneş ve Rahu'nun Lagna / Ay / Venüs'ten 1-2-4-7-8-12. evlerdeki malefik katkıları, ağırlıklı toplamlar ve karşılaştırma — teknik değerlendirme", needsPartner: true, needsTime: true },
  "vedic.upagraha": { label: "Upagrahalar", hint: "11 hesaplanan duyarlı nokta: zaman tabanlı (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) ve Güneş türevli (Dhuma, Vyatipata, Parivesha, Indra Chapa, Upaketu); burç, derece, nakshatra, pada", needsPartner: false, needsTime: true },
  "vedic.heliacal": { label: "Graha Asta / Udaya", hint: "Seçilen gün ve gözlem yerinde altı görünür grahanın Güneş parıltısından kurtulup kurtulmadığı (kalamsa), son ve sonraki heliakal doğuş / batış; doğum saati gerekmez", needsPartner: false, needsTime: false },
};

export const DASHA_LORD_OPTIONS: [string, string][] = [
  ["ketu", "Ketu"],
  ["venus", "Venüs (Shukra)"],
  ["sun", "Güneş (Surya)"],
  ["moon", "Ay (Chandra)"],
  ["mars", "Mars (Mangala)"],
  ["rahu", "Rahu"],
  ["jupiter", "Jüpiter (Guru)"],
  ["saturn", "Satürn (Shani)"],
  ["mercury", "Merkür (Budha)"],
];

export const VEDIC_VARGA_OPTIONS: [number, string][] = [
  [9, "D9 Navamsa (varsayılan)"],
  [2, "D2 Hora"],
  [3, "D3 Drekkana"],
  [4, "D4 Chaturthamsa"],
  [7, "D7 Saptamsa"],
  [10, "D10 Dasamsa"],
  [12, "D12 Dwadasamsa"],
  [16, "D16 Shodasamsa"],
  [20, "D20 Vimsamsa"],
  [24, "D24 Chaturvimsamsa"],
  [27, "D27 Bhamsa"],
  [30, "D30 Trimsamsa"],
  [40, "D40 Khavedamsa"],
  [45, "D45 Akshavedamsa"],
  [60, "D60 Shashtiamsa"],
];

export const KP_AYANAMSA_OPTIONS: [string, string][] = [
  ["kp-newcomb", "KP-Newcomb — varsayılan"],
  ["kp-old", "KP (Krishnamurti eski tablo)"],
];
const KP_AY_LABEL: Record<string, string> = { "kp-newcomb": "KP-Newcomb", "kp-old": "KP (eski tablo)" };

export const VEDIC_AYANAMSA_OPTIONS: [string, string][] = [
  ["lahiri", "Lahiri (Chitrapaksha) — varsayılan"],
  ["raman", "B.V. Raman"],
  ["kp-newcomb", "KP Newcomb"],
  ["kp-old", "KP (eski)"],
];

export type TechniqueParams = {
  /** TRANSİT-01: şimdi (UTC saat başı) · seçilen gün (yerel 12:00) · seçilen gün + saat (dakika). */
  transitMode: "now" | "date" | "custom";
  transitDate: string;
  transitTime: string;
  transitTz: string;
  forecastStart: string;
  forecastDays: number;
  /** Takvim bitiş kutusuna yazılan, henüz geçerli olmayan değer (yazma sırasında ara değer / başlangıçtan önce / sınır dışı). null = yok. */
  forecastEndDraft: string | null;
  /** TRANSİT-01: takvim gösterim saat dilimi (gün gruplaması / yerel saat; istek gövdesine girmez). */
  forecastTz: string;
  targetDate: string;
  returnYear: number;
  lunarMonth: string;
  /** Ay içindeki dönüş sırası (bir takvim ayında 2 lunar return olabilir). */
  lunarSequence: 1 | 2;
  partnerProfileId: string;
  /** Relocation hedefi (konum kimliği sunucuda çözülür). */
  relocationTarget: { id: string; label: string } | null;
  /** Aşama 4.1: Solar/Lunar return dönüş konumu; null = doğum yeri. */
  solarReturnLocation: { id: string; label: string } | null;
  lunarReturnLocation: { id: string; label: string } | null;
  /** Aşama 5: Vedik ayanamsa (tüm Vedik seçimler için ortak). */
  vedicAyanamsa: string;
  /** Aşama 5D: varga bölümü (D9 varsayılan). */
  vargaDivision: number;
  /** Aşama 5E: dasha düzeyi ("" = mahadasha listesi). */
  dashaMd: string;
  dashaAd: string;
  /** 2026-10-21: Sookshma / Prana listesi için pratyantardasha / sookshma yöneticisi ("" = yok). Eski kayıtlı parametrelerde alan olmayabilir. */
  dashaPd?: string;
  dashaSd?: string;
  /** 2026-10-21: "Güncel dönem zinciri" (Vedik + KP ortak): kapalı / şimdi / seçilen an (UTC). */
  dashaChainMode?: "off" | "now" | "custom";
  dashaChainDate?: string;
  dashaChainTime?: string;
  dashaChainTz?: string;
  /** 2026-10-21: Ayrıntılı Panchanga seçeneği (gün + konum). */
  panchangaDetail?: boolean;
  /** 2026-10-22: Gun Milan hesaplama rolü — "partner_first" = karşı taraf 1. rol (geleneksel erkek / damat). Yoksa danışan 1. rol. */
  gunMilanOrder?: "client_first" | "partner_first";
  /** 2026-10-22 gece: On Porutham / Papasamyam hesaplama rolü (Gun Milan'dan bağımsız seçim). Yoksa danışan 1. rol. */
  dashakootOrder?: "client_first" | "partner_first";
  papasamyamOrder?: "client_first" | "partner_first";
  panchangaDate?: string;
  panchangaPlace?: { id: string; label: string } | null;
  /** 2026-10-22: "Gezegen saatleri (Hora) + Choghadiya" seçeneği — Ayrıntılı Panchanga ile AYNI gün + konum alanları. */
  panchangaHours?: boolean;
  /** 22.10.2026 Graha Asta / Udaya: değerlendirme günü ("" = doğum günü) ve gözlem yeri (null = doğum yeri). Eski parametrelerde yok. */
  heliacalDate?: string;
  heliacalPlace?: { id: string; label: string } | null;
  /** Aşama 5.1A: Gochara anı (Batı transitten AYRI parametre). */
  vedicTransitMode: "now" | "custom";
  vedicTransitDate: string;
  vedicTransitTime: string;
  vedicTransitTz: string;
  /** Aşama 6: KP seçenekleri (tüm KP teknikleri ortak). */
  kpAyanamsa: string;
  kpNodeType: string;
  kpDashaMd: string;
  kpDashaAd: string;
  kpDashaPd?: string;
  kpDashaSd?: string;
  /** KP an (ruling / transit / horary ortak): şimdi veya tarih-saat. */
  kpMomentMode: "now" | "custom";
  /** TRANSİT-03: KP transit kipi — tek an (eski) veya zaman aralığı (Sub-Lord / Rasi geçişleri, konum tablosu). */
  kpTransitMode?: "moment" | "range";
  kpRangeStart: string;
  kpRangeDays: number;
  kpRangePlanets: string[];
  kpRangeKinds: string[];
  kpRangeInterval: number;
  kpRangeTz: string;
  kpDate: string;
  kpTime: string;
  kpTz: string;
  horaryNumber: number;
  /** Ruling / horary değerlendirme yeri; null = doğum yeri. */
  kpPlace: { id: string; label: string } | null;
  /**
   * FINAL: gözlem / değerlendirme yeri AÇIK seçimdir — doğum yeri otomatik gözlem yeri kabul edilmez.
   * "unset" → ruling/horary plana alınmaz; "birth" → doğum yeri (istek gövdesi eskisiyle aynı: placeLocationId null);
   * "other" → seçilen konum.
   */
  kpPlaceMode: "unset" | "birth" | "other";
  /** 2026-10-22: KP ruling planets zaman taraması — süre ve adım (dk). Başlangıç = KP ortak an; yer = KP gözlem yeri. Eski parametrelerde yok. */
  kpRiDuration?: number;
  kpRiInterval?: number;
  /** Local space referansı; null = doğum yeri. */
  localSpaceReference: { id: string; label: string } | null;
  /** Sabit yıldızlar: gösterim/rapor orbu (yalnız filtre; sağlayıcıdan her zaman 3° istenir → yeni istek yok). */
  fixedStarsOrb: number;
  /** Sabit yıldızlar: Word/PDF'e 43 yıldızlık katalog eki. */
  fixedStarsCatalog: boolean;
  /** Yıllık profeksiyonlar: seçilen tamamlanmış yaş (null = henüz seçilmedi; doğum tarihi bilinince bu yıl önerilir). */
  profectionAge: number | null;
  /**
   * P2-01 (2026-10-20): profectionAge'in AİT OLDUĞU danışan bağlamı (profectionContextKey: profil | revizyon | doğum tarihi).
   * Bağlam değişince yaş yeni kişinin bu yılına çekilir; uyuşmayan bağlamla profeksiyon plana/çalıştırmaya GİRMEZ.
   */
  profectionFor: string | null;
  /** 22.10.2026 Chara Karaka şeması: "eight" (Rahu dahil, varsayılan) / "seven" (Rahu hariç). Eksikse "eight". */
  charaKarakaScheme?: "eight" | "seven";
  /** 2026-10-22 — Ek noktalar: seçilen bölümler (yoksa üçü de; eski kayıtlı parametrelerde alan yok). */
  extraSections?: ExtraSection[];
  /** 2026-10-22 — Gezegen dönüşü: gezegen, hedef (yaklaşık) tarih, kümedeki kavuşum sırası, dönüş konumu (null = doğum yeri). */
  planetaryReturnPlanet?: PlanetaryReturnPlanet;
  planetaryReturnDate?: string;
  planetaryReturnCrossing?: 1 | 2 | 3;
  planetaryReturnLocation?: { id: string; label: string } | null;
  /** 2026-10-22 — Deklinasyon paralelleri: ay (YYYY-MM, UTC ayı), orb (1 / 1,5 / 2°), gösterim saat dilimi. Eski parametrelerde yok. */
  declinationMonth?: string;
  declinationOrb?: number;
  declinationTz?: string;
  /** 2026-10-22 — Vedik aylık zamanlama: yıl / ay (UTC takvim ayı), bölümler, gösterim saat dilimi. Eski kayıtlı parametrelerde yok. */
  vedicMonthlyYear?: number;
  vedicMonthlyMonth?: number;
  vedicMonthlySections?: VedicMonthlySection[];
  vedicMonthlyTz?: string;
};

export const FORECAST_CHUNK_DAYS = 90;
export const FORECAST_MAX_DAYS = 366;

/**
 * "Bugün" Türkiye takvim günüdür (varsayılan saat dilimi Europe/Istanbul). 2026-10-12 canlı UI testi: UTC günü
 * kullanılınca 00:00–03:00 TSİ arasında ilerletme/solar arc/transit/forecast varsayılanları DÜNÜN tarihini gösteriyordu.
 */
export function istanbulDateIso(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function defaultParams(today: Date): TechniqueParams {
  const iso = istanbulDateIso(today);
  return {
    transitMode: "now",
    transitDate: iso,
    transitTime: "12:00",
    transitTz: "Europe/Istanbul",
    forecastStart: iso,
    forecastDays: 90,
    forecastEndDraft: null,
    forecastTz: "Europe/Istanbul",
    targetDate: iso,
    returnYear: Number(iso.slice(0, 4)),
    lunarMonth: iso.slice(0, 7),
    lunarSequence: 1,
    partnerProfileId: "",
    relocationTarget: null,
    localSpaceReference: null,
    solarReturnLocation: null,
    lunarReturnLocation: null,
    vedicAyanamsa: "lahiri",
    vargaDivision: 9,
    dashaMd: "",
    dashaAd: "",
    vedicTransitMode: "now",
    vedicTransitDate: iso,
    vedicTransitTime: "12:00",
    vedicTransitTz: "Europe/Istanbul",
    kpAyanamsa: "kp-newcomb",
    kpNodeType: "mean",
    kpDashaMd: "",
    kpDashaAd: "",
    kpMomentMode: "now",
    kpTransitMode: "moment",
    kpRangeStart: iso,
    kpRangeDays: 7,
    kpRangePlanets: ["sun", "moon"],
    kpRangeKinds: ["sublord", "rasi"],
    kpRangeInterval: 360,
    kpRangeTz: "Europe/Istanbul",
    kpDate: iso,
    kpTime: "12:00",
    kpTz: "Europe/Istanbul",
    horaryNumber: 1,
    kpPlace: null,
    kpPlaceMode: "unset",
    fixedStarsOrb: 1,
    fixedStarsCatalog: false,
    profectionAge: null,
    profectionFor: null,
    charaKarakaScheme: "eight",
    planetaryReturnPlanet: "saturn",
    planetaryReturnDate: iso,
    planetaryReturnCrossing: 1,
    planetaryReturnLocation: null,
    declinationMonth: iso.slice(0, 7),
    declinationOrb: DECLINATION_ORB_DEFAULT,
    declinationTz: "Europe/Istanbul",
    vedicMonthlyYear: Number(iso.slice(0, 4)),
    vedicMonthlyMonth: Number(iso.slice(5, 7)),
    vedicMonthlySections: [...VEDIC_MONTHLY_DEFAULT_SECTIONS],
    vedicMonthlyTz: "Europe/Istanbul",
  };
}

/** Seçili teknikler → sunucu seçim listesi (sıra sabit: UI_TECHNIQUES sırası). */
/**
 * HORARY-P1: "Analizi Başlat"ta gönderilecek seçenek. Normalde planın NORMALİZE seçeneği (önizlemede gösterilen an) gönderilir.
 * KP horary + "şimdi" ise ham `{ now: true }` gönderilir → soru anı, sunucunun çalıştırmayı işlediği gerçek UTC dakikadır
 * (plan, teknik seçildiğinde dakikalar önce alınmış olabilir). Diğer teknikler (transit, ruling: UTC saat başı) DEĞİŞMEZ.
 */
export function runOptionsFor(technique: string, planned: Record<string, unknown> | null | undefined, raw: Record<string, unknown>): Record<string, unknown> {
  if (technique === "kp.horary" && raw.now === true) return raw;
  return planned ?? raw;
}

/**
 * Batı yöntem seçimi (Aşama 3, #643): `houseSystem` = Natal DIŞINDAKİ Batı tekniklerinin 4'lü ORTAK seçimi (davranış aynen);
 * `natalHouseSystem` = YALNIZ Natal'ın 8'li seçimi. İkisi birbirini değiştirmez. Ay düğümü tüm Batı tekniklerinde ortak.
 */
export type WesternMethod = { houseSystem: HouseSystem; nodeType: NodeType; natalHouseSystem: NatalHouseSystemOption };
export const DEFAULT_WESTERN_METHOD: Readonly<WesternMethod> = Object.freeze({ houseSystem: "placidus", nodeType: "true", natalHouseSystem: "placidus" });

export function buildSelections(
  checked: Partial<Record<UiTechniqueId, boolean>>,
  p: TechniqueParams,
  /** natalHouseSystem verilmezse (eski çağıranlar) Natal ortak seçimi kullanır — eski davranış birebir. */
  method: Omit<WesternMethod, "natalHouseSystem"> & { natalHouseSystem?: NatalHouseSystemOption },
): { technique: UiTechniqueId; options: Record<string, unknown> }[] {
  const out: { technique: UiTechniqueId; options: Record<string, unknown> }[] = [];
  for (const id of UI_TECHNIQUES) {
    if (!checked[id]) continue;
    // Eksik / geçersiz tarih-saat (ör. yıl yazılırken "0002-10-17") plana ve API'ye GİRMEZ; neden missingReason'da.
    if (dateInputReason(id, p)) continue;
    switch (id) {
      case "western.natal":
        out.push({ technique: id, options: { houseSystem: method.natalHouseSystem ?? method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.transit":
        out.push({
          technique: id,
          // TRANSİT-01: saat dilimi gösterim için seçenekte kalır (gövdeye girmez). "Seçilen gün" = o günün yerel 12:00'si.
          options:
            p.transitMode === "now"
              ? { now: true, nodeType: method.nodeType, displayTz: p.transitTz }
              : { date: p.transitDate, time: p.transitMode === "date" ? "12:00" : p.transitTime, timezone: p.transitTz, nodeType: method.nodeType },
        });
        break;
      case "western.forecast":
        out.push({ technique: id, options: { startDate: p.forecastStart, days: p.forecastDays, displayTz: p.forecastTz } });
        break;
      case "western.progression":
      case "western.solar_arc":
        out.push({ technique: id, options: { targetDate: p.targetDate, nodeType: method.nodeType } });
        break;
      case "western.solar_return":
        out.push({ technique: id, options: { returnYear: p.returnYear, houseSystem: method.houseSystem, returnLocationId: p.solarReturnLocation?.id ?? null } });
        break;
      case "western.lunar_return":
        out.push({ technique: id, options: { month: p.lunarMonth, sequence: p.lunarSequence, houseSystem: method.houseSystem, returnLocationId: p.lunarReturnLocation?.id ?? null } });
        break;
      case "western.synastry":
      case "western.composite":
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, houseSystem: method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.astrocartography":
        out.push({ technique: id, options: {} });
        break;
      case "western.relocation":
        if (p.relocationTarget) out.push({ technique: id, options: { targetLocationId: p.relocationTarget.id, houseSystem: method.houseSystem } });
        break;
      case "western.local_space":
        out.push({ technique: id, options: { referenceLocationId: p.localSpaceReference?.id ?? null } });
        break;
      case "western.fixed_stars":
        out.push({ technique: id, options: { nodeType: method.nodeType, orb: p.fixedStarsOrb, reportCatalog: p.fixedStarsCatalog } });
        break;
      case "western.profections":
        // Yalnız yaş gönderilir (ev sistemi bu teknikte sunucuda sabit bütün-burç); yaş seçilmemişse plana alınmaz.
        if (profectionAgeOf(p.profectionAge) !== null) out.push({ technique: id, options: { age: p.profectionAge } });
        break;
      case "western.extra_points": {
        // Yalnız seçilen bölümler istek açar (her bölüm ayrı uç); bölüm seçilmemişse plana alınmaz.
        const sections = extraSectionsOf(p.extraSections ?? [...EXTRA_SECTIONS]);
        if (sections) out.push({ technique: id, options: { sections, houseSystem: method.houseSystem } });
        break;
      }
      case "western.planetary_return":
        out.push({
          technique: id,
          options: {
            planet: p.planetaryReturnPlanet ?? "saturn",
            approxDate: p.planetaryReturnDate ?? p.targetDate,
            crossing: p.planetaryReturnCrossing ?? 1,
            houseSystem: method.houseSystem,
            returnLocationId: p.planetaryReturnLocation?.id ?? null,
          },
        });
        break;
      case "western.declination_parallels":
        // Düğüm türü Batı yöntem seçiminden; gösterim saat dilimi gövdeye girmez (sunucu yalnız gösterim için saklar).
        out.push({ technique: id, options: { month: p.declinationMonth ?? p.lunarMonth, orb: p.declinationOrb ?? DECLINATION_ORB_DEFAULT, nodeType: method.nodeType, displayTz: p.declinationTz ?? "Europe/Istanbul" } });
        break;
      case "vedic.d1":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.drishti":
      case "vedic.ashtakavarga":
      case "vedic.shadbala":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.bhav_chalit":
      case "vedic.arudha":
      case "vedic.bhava_bala":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.chara_karaka":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, scheme: p.charaKarakaScheme ?? "eight" } });
        break;
      case "vedic.panchanga":
        // Seçenek kapalıyken gövde birebir eski ({ ayanamsa }) → eski kayıt ve önbellek anahtarı aynı.
        // 2026-10-22: Hora + Choghadiya seçeneği yalnız işaretliyse eklenir (yoksa nesne birebir eski).
        if (p.panchangaHours && !p.panchangaDetail) out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, detailDate: p.panchangaDate || null, placeLocationId: p.panchangaPlace?.id ?? null, hours: true } });
        else out.push({ technique: id, options: p.panchangaDetail ? { ayanamsa: p.vedicAyanamsa, detail: true, detailDate: p.panchangaDate || null, placeLocationId: p.panchangaPlace?.id ?? null, ...(p.panchangaHours ? { hours: true } : {}) } : { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.dasha":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, ...dashaPathOptions(p.dashaMd, p.dashaAd, p.dashaPd, p.dashaSd), ...dashaChainOptions(p) } });
        break;
      case "vedic.transit":
        out.push({
          technique: id,
          options:
            p.vedicTransitMode === "now"
              ? { ayanamsa: p.vedicAyanamsa, now: true }
              : { ayanamsa: p.vedicAyanamsa, date: p.vedicTransitDate, time: p.vedicTransitTime, timezone: p.vedicTransitTz },
        });
        break;
      case "kp.chart":
        out.push({ technique: id, options: { ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType } });
        break;
      case "kp.dasha":
        out.push({ technique: id, options: { ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, ...dashaPathOptions(p.kpDashaMd, p.kpDashaAd, p.kpDashaPd, p.kpDashaSd), ...dashaChainOptions(p) } });
        break;
      case "kp.ruling":
      case "kp.transit":
      case "kp.horary": {
        const at = p.kpMomentMode === "now" ? { now: true } : { date: p.kpDate, time: p.kpTime, timezone: p.kpTz };
        // Gözlem yeri seçilmemişse (veya "başka konum" seçili ama konum yok) ruling/horary plana alınmaz.
        if (id !== "kp.transit" && !kpPlaceReady(p)) break;
        if (id === "kp.ruling") out.push({ technique: id, options: { ...at, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        else if (id === "kp.transit" && p.kpTransitMode === "range") out.push({ technique: id, options: { range: kpRangeOptions(p), ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, displayTz: p.kpRangeTz ?? "Europe/Istanbul" } });
        else if (id === "kp.transit") out.push({ technique: id, options: { ...at, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType } });
        else out.push({ technique: id, options: { ...at, horaryNumber: p.horaryNumber, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        break;
      }
      case "kp.ruling_interval": {
        // Başlangıç = KP ortak an (şimdi: UTC saat başı); gözlem yeri açıkça seçilmeden plana alınmaz (ruling/horary ile aynı kural).
        if (!kpPlaceReady(p)) break;
        const at = p.kpMomentMode === "now" ? { now: true } : { date: p.kpDate, time: p.kpTime, timezone: p.kpTz };
        out.push({ technique: id, options: { ...at, durationMinutes: p.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes, intervalMinutes: p.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes, ayanamsa: p.kpAyanamsa, nodeType: p.kpNodeType, placeLocationId: p.kpPlaceMode === "other" ? (p.kpPlace?.id ?? null) : null } });
        break;
      }
      case "vedic.varga":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa, division: p.vargaDivision } });
        break;
      case "vedic.gun_milan":
        // Rol yalnız "karşı taraf 1. rol" seçilince gönderilir → varsayılan seçim / anahtar eskisiyle aynı.
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, ayanamsa: p.vedicAyanamsa, ...(p.gunMilanOrder === "partner_first" ? { order: "partner_first" } : {}) } });
        break;
      case "vedic.dashakoot":
      case "vedic.papasamyam": {
        // Rol yalnız "karşı taraf 1. rol" seçilince gönderilir (Gun Milan ile aynı sözleşme).
        const ord = id === "vedic.dashakoot" ? p.dashakootOrder : p.papasamyamOrder;
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, ayanamsa: p.vedicAyanamsa, ...(ord === "partner_first" ? { order: "partner_first" } : {}) } });
        break;
      }
      case "vedic.sade_sati":
        // Değerlendirme günü SUNUCUDA belirlenir (bugün, UTC); istemci tarih göndermez.
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      // 22.10.2026 Vedik noktalar: Upagraha = ayanamsa (Vedik ortak); Heliakal = gün (boş → doğum günü) + gözlem yeri (boş → doğum yeri).
      case "vedic.upagraha":
        out.push({ technique: id, options: { ayanamsa: p.vedicAyanamsa } });
        break;
      case "vedic.heliacal":
        out.push({ technique: id, options: { date: p.heliacalDate || null, placeLocationId: p.heliacalPlace?.id ?? null } });
        break;
      case "vedic.monthly": {
        // Ayanamsa sabit Lahiri (ortak Vedik ayanamsa seçimi bu teknikte kullanılmaz); bölüm seçilmemişse plana alınmaz.
        const sections = vedicMonthlySectionsOf(p.vedicMonthlySections ?? [...VEDIC_MONTHLY_DEFAULT_SECTIONS]);
        const ym = vedicMonthlyYm(p);
        if (sections) out.push({ technique: id, options: { year: ym.year, month: ym.month, sections, ayanamsa: "lahiri", displayTz: p.vedicMonthlyTz ?? "Europe/Istanbul" } });
        break;
      }
    }
  }
  return out;
}

/** 2026-10-21: dasha düzey yolu (boş üst düzeyde alt düzey gönderilmez; yeni anahtarlar yalnız doluysa). */
export function dashaPathOptions(md: string, ad: string, pd?: string, sd?: string): Record<string, string | null> {
  const a = md && ad ? ad : null;
  const p = a && pd ? pd : null;
  const s = p && sd ? sd : null;
  return { mahadasha: md || null, antardasha: a, ...(p ? { pratyantardasha: p } : {}), ...(s ? { sookshma: s } : {}) };
}
/**
 * 2026-10-21: "Güncel dönem zinciri" seçeneği. Şimdi → sunucunun gerçek UTC dakikası (chainNow); seçilen an → yerel tarih/saat +
 * IANA bölgeden UTC dakika (sunucunun aynı çözümleyicisiyle). Kapalı veya geçersiz → seçenek YOK (eski davranış).
 */
export function dashaChainOptions(p: TechniqueParams): Record<string, unknown> {
  if (p.dashaChainMode === "now") return { chainNow: true };
  if (p.dashaChainMode !== "custom" || !p.dashaChainDate || !p.dashaChainTime) return {};
  if (dateInputIssue(p.dashaChainDate) || timeInputIssue(p.dashaChainTime)) return {};
  const r = resolveAstroBirthTime(p.dashaChainDate, p.dashaChainTime, p.dashaChainTz || "Europe/Istanbul", "earlier");
  return r.kind === "ok" ? { chainAtUtc: r.utcIso.slice(0, 16) } : {};
}
const LEVEL_TR = ["Antardasha", "Pratyantardasha", "Sookshma", "Prana"];
function dashaLevelLabel(o: Record<string, unknown>): string {
  const lord = (v: unknown) => DASHA_LORD_OPTIONS.find((x) => x[0] === v)?.[1] ?? String(v);
  const path = [o.mahadasha, o.antardasha, o.pratyantardasha, o.sookshma].filter((x) => typeof x === "string" && x) as string[];
  return path.length ? `${LEVEL_TR[path.length - 1]} · ${path.map(lord).join(" / ")}` : "Mahadasha";
}
const dashaChainLabel = (o: Record<string, unknown>) =>
  typeof o.chainAtUtc === "string" ? ` · güncel dönem zinciri: ${fmtDate(o.chainAtUtc)} ${o.chainAtUtc.slice(11, 16)} UTC` : o.chainNow === true ? " · güncel dönem zinciri: şimdi" : "";

/** 2026-10-22 — Vedik aylık zamanlama: seçilen yıl / ay (eski parametrelerde yoksa transit gününün ayı). */
export function vedicMonthlyYm(p: TechniqueParams): { year: number; month: number } {
  return { year: p.vedicMonthlyYear ?? Number(p.transitDate.slice(0, 4)), month: p.vedicMonthlyMonth ?? Number(p.transitDate.slice(5, 7)) };
}

/** Ruling / horary için gözlem yeri açıkça belirlendi mi? */
export function kpPlaceReady(p: TechniqueParams): boolean {
  return p.kpPlaceMode === "birth" || (p.kpPlaceMode === "other" && !!p.kpPlace);
}

/**
 * Tarih/saat alanı tamamlanmamış veya geçersizse kısa neden (yoksa null). Tarayıcı tarih kutusu yazma sırasında boş
 * dize ya da "0002-10-17" gibi ara değerler üretir; bunlarla hesap / plan / istek YAPILMAZ.
 */
export function dateInputReason(id: UiTechniqueId, p: TechniqueParams): string | null {
  const bad = (date: string, time?: string) => !!(dateInputIssue(date) ?? (time === undefined ? null : timeInputIssue(time)));
  switch (id) {
    case "western.transit":
      // Ekrandaki UTC ön izlemesiyle AYNI karar (sunucunun resolveAstroBirthTime + 1600–2600 UTC yıl sınırı): biçim, yaz saati
      // boşluğu ve UTC'de sınır dışına düşen an da plana / API'ye girmez → ön izleme uyarısı ile Başlat her zaman tutarlı.
      if (p.transitMode === "now") return null;
      if (bad(p.transitDate, p.transitMode === "custom" ? p.transitTime : undefined)) return "transit tarihini / saatini tamamlayın";
      return localToUtcPreview(p.transitDate, p.transitMode === "date" ? "12:00" : p.transitTime, p.transitTz).ok ? null : "transit anı geçersiz (ön izlemeye bakın)";
    case "western.forecast":
      return bad(p.forecastStart) ? "takvim başlangıç tarihini tamamlayın" : p.forecastEndDraft != null ? "takvim bitiş tarihini düzeltin" : null;
    case "western.progression":
    case "western.solar_arc":
      return bad(p.targetDate) ? "hedef tarihi tamamlayın" : null;
    case "vedic.transit":
      return p.vedicTransitMode === "custom" && bad(p.vedicTransitDate, p.vedicTransitTime) ? "Gochara tarihini / saatini tamamlayın" : null;
    case "kp.transit":
      // TRANSİT-03 zaman aralığı: tek-an tarihi bu kipte kullanılmaz; aralık başlangıcı + aralık ayarları (sunucuyla aynı) denetlenir.
      if (p.kpTransitMode === "range") return kpRangeIssue(p);
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? "KP tarihini / saatini tamamlayın" : null;
    case "kp.ruling":
    case "kp.horary":
      return p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime) ? "KP tarihini / saatini tamamlayın" : null;
    case "kp.ruling_interval":
      if (p.kpMomentMode === "custom" && bad(p.kpDate, p.kpTime)) return "tarama başlangıcını tamamlayın";
      return kpIntervalWindowOk(p.kpRiDuration ?? KP_RI_DEFAULT.durationMinutes, p.kpRiInterval ?? KP_RI_DEFAULT.intervalMinutes) ? null : "tarama süresi / adımı geçersiz (en çok 24 saat, en çok 121 an)";
    case "vedic.dasha":
    case "kp.dasha":
      // 2026-10-21: seçilen an kipinde tamamlanmamış/geçersiz an sessizce düşürülmez — plana girmez, neden gösterilir.
      if (p.dashaChainMode !== "custom") return null;
      if (bad(p.dashaChainDate ?? "", p.dashaChainTime ?? "")) return "güncel dönem zinciri tarihini / saatini tamamlayın";
      return localToUtcPreview(p.dashaChainDate ?? "", p.dashaChainTime ?? "", p.dashaChainTz || "Europe/Istanbul").ok ? null : "güncel dönem zinciri anı geçersiz";
    case "vedic.panchanga":
      return (p.panchangaDetail || p.panchangaHours) && p.panchangaDate && bad(p.panchangaDate) ? (p.panchangaDetail ? "ayrıntılı Panchanga gününü tamamlayın" : "hora / choghadiya gününü tamamlayın") : null;
    case "western.planetary_return":
      return bad(p.planetaryReturnDate ?? p.targetDate) ? "dönüş hedef tarihini tamamlayın" : null;
    case "western.declination_parallels":
      return declinationMonthOk(p.declinationMonth ?? p.lunarMonth) ? null : "deklinasyon ayını tamamlayın (1600–2600)";
    case "vedic.heliacal":
      return p.heliacalDate && bad(p.heliacalDate) ? "heliakal değerlendirme gününü tamamlayın" : null;
    case "vedic.monthly": {
      const ym = vedicMonthlyYm(p);
      return vedicMonthOk(ym.year, ym.month) ? null : "takvim ayını tamamlayın (1600–2600)";
    }
    default:
      return null;
  }
}

/** Seçili ama eksik ayar yüzünden plana alınmayan tekniğin kısa nedeni (yoksa null). */
export function missingReason(id: UiTechniqueId, p: TechniqueParams): string | null {
  const dateWhy = dateInputReason(id, p);
  if (dateWhy) return dateWhy;
  if (TECHNIQUE_META[id].needsPartner && !p.partnerProfileId) return "karşı taraf seçin";
  if (id === "western.relocation" && !p.relocationTarget) return "hedef konum seçin";
  if (id === "western.profections" && profectionAgeOf(p.profectionAge) === null) return "profeksiyon yılını seçin";
  if ((id === "kp.ruling" || id === "kp.horary" || id === "kp.ruling_interval") && !kpPlaceReady(p)) return id === "kp.horary" ? "değerlendirme yeri seçin" : "gözlem yeri seçin";
  if (id === "western.extra_points" && !extraSectionsOf(p.extraSections ?? [...EXTRA_SECTIONS])) return "en az bir ek nokta bölümü seçin";
  if (id === "vedic.monthly" && !vedicMonthlySectionsOf(p.vedicMonthlySections ?? [...VEDIC_MONTHLY_DEFAULT_SECTIONS])) return "en az bir aylık takvim bölümü seçin";
  return null;
}

/** P2-01: profeksiyon seçiminin danışan bağlamı (danışan kimliği + doğum kaydı revizyonu + doğum tarihi). */
export function profectionContextKey(profileId: string | null | undefined, revision: number | null | undefined, birthDate: string | null | undefined): string | null {
  return profileId && revision != null && birthDate ? `${profileId}|${revision}|${birthDate}` : null;
}

/**
 * P2-01: bağlam değiştiyse (başka danışan / revizyon / doğum tarihi) yaşı YENİ kişinin bu yılına çeker; aynı bağlamda kullanıcının
 * seçimine DOKUNMAZ (aynı nesneyi döndürür → gereksiz render yok). today = Türkiye takvim günü (YYYY-MM-DD).
 */
export function syncProfectionContext(p: TechniqueParams, ctx: string | null, birthDate: string | null | undefined, today: string): TechniqueParams {
  if (!ctx || p.profectionFor === ctx) return p;
  return { ...p, profectionAge: birthDate ? profectionAgeOn(birthDate, today) : null, profectionFor: ctx };
}

/** P2-01: profeksiyon seçimi yalnız GEÇERLİ danışan bağlamına aitse plana/çalıştırmaya girer (geçiş anında eski yaş gitmez). */
export function profectionSelectionCurrent(p: TechniqueParams, ctx: string | null): boolean {
  return !!ctx && p.profectionFor === ctx;
}

export function forecastPartCount(days: number): number {
  return Math.max(1, Math.ceil(days / FORECAST_CHUNK_DAYS));
}

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

/** Normalize seçeneklerin okunur özeti (sonuç kartı / kayıtlı analiz başlığı). */
export function describeOptions(technique: string, o: Record<string, unknown>, partnerLabel?: (id: string) => string | null): string {
  const partner = typeof o.partnerProfileId === "string" ? (partnerLabel?.(o.partnerProfileId) ?? "karşı taraf") : null;
  switch (technique) {
    case "western.transit": {
      if (typeof o.atUtc !== "string") return "";
      // TRANSİT-01: gösterim saat dilimi varsa yerel an + UTC; yoksa (eski kayıtlar) yalnız UTC — eski metin aynen.
      const utc = `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC`;
      const tz = typeof o.displayTz === "string" && o.displayTz !== "UTC" ? o.displayTz : null;
      const z = tz ? formatInZone(o.atUtc, tz) : null;
      const cal = o.calendar as { startDate?: unknown; days?: unknown } | undefined;
      const calTxt = cal && typeof cal.startDate === "string" ? ` · takvim ${fmtDate(cal.startDate)} + ${String(cal.days)} gün` : "";
      return `${z ? `${z.text} ${z.zone} (${utc})` : utc}${calTxt}`;
    }
    case "western.forecast": {
      const days = Number(o.days);
      if (typeof o.startDate !== "string") return "";
      const end = addDaysIso(o.startDate, days - 1);
      const tz = typeof o.displayTz === "string" ? ` · ${o.displayTz}` : "";
      return `${fmtDate(o.startDate)} + ${days} gün${end ? ` (→ ${fmtDate(end)})` : ""} (${forecastPartCount(days)} parça)${tz}`;
    }
    case "western.progression":
    case "western.solar_arc":
      return typeof o.targetDate === "string" ? `hedef ${fmtDate(o.targetDate)}` : "";
    case "western.solar_return":
      return `${String(o.returnYear)} dönüşü${returnPlace(o)}`;
    case "western.lunar_return":
      if (typeof o.month !== "string") return "";
      // Eski (Aşama 3) kayıtlarda sıra yok: o zaman yalnız ayın ilk dönüşü hesaplanabiliyordu.
      return `${o.month.slice(5, 7)}.${o.month.slice(0, 4)} · ${o.sequence === 2 ? "2." : "1."} dönüş${o.sequence === undefined ? " (ayın ilk dönüşü)" : ""}${returnPlace(o)}`;
    case "western.synastry":
    case "western.composite":
      return `${partner ?? ""}${o.partnerRevision ? ` (karşı taraf rev ${String(o.partnerRevision)})` : ""}`;
    case "western.relocation": {
      const t = o.target as { label?: string } | undefined;
      return t?.label ? `→ ${t.label}` : typeof o.targetLocationId === "string" ? `→ ${o.targetLocationId}` : "";
    }
    case "vedic.drishti":
      return "ayanamsa: Lahiri (sabit)";
    case "vedic.panchanga": {
      if (o.detail !== true && o.hours !== true) return "ayanamsa: Lahiri (sabit)";
      const pl = (o.place as { label?: string } | undefined)?.label;
      const day = typeof o.detailDate === "string" ? fmtDate(o.detailDate) : "doğum günü";
      const what = o.detail === true ? `ayrıntılı: ${day}${o.hours === true ? " · hora + choghadiya" : ""}` : `hora + choghadiya: ${day}`;
      return `ayanamsa: Lahiri (sabit) · ${what}${pl ? ` · ${pl}` : ""}`;
    }
    case "kp.chart":
      return `${o.ayanamsa ? `${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)} · ` : ""}Placidus · düğüm ${o.nodeType === "true" ? "gerçek" : "ortalama"}`;
    case "kp.dasha":
      return `${dashaLevelLabel(o)} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}${dashaChainLabel(o)}`;
    case "kp.ruling":
    case "kp.transit":
    case "kp.horary": {
      const at = typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC` : "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      if (technique === "kp.horary") {
        // HORARY-P2: yerel soru anı esas, UTC parantezde (dilim: displayTz → değerlendirme yeri → UTC + not). Yalnız gösterim.
        // HORARY-P1: başarısız denemeler ham seçenekle listelenir ({ now: true } — an henüz sunucuda belirlenmedi).
        const when = typeof o.atUtc === "string" ? questionMomentLabel(o.atUtc, horaryDisplayZone(o)) : o.now === true ? "şimdi (gerçek soru anı)" : "";
        return `sayı ${String(o.horaryNumber)} · ${when}${pl ? ` · ${pl}` : ""}`;
      }
      if (technique === "kp.ruling") return `${at}${pl ? ` · ${pl}` : ""}`;
      const rg = o.range as { startDate?: string; days?: number; planets?: string[]; kinds?: string[] } | undefined;
      if (technique === "kp.transit" && rg && typeof rg.startDate === "string") {
        const kinds = (rg.kinds ?? []).map((k) => KP_KIND_SHORT[k] ?? k).join(" + ");
        const planets = (rg.planets ?? []).map((x) => KP_PLANET_SHORT[x] ?? x).join(", ");
        return `aralık ${fmtDate(rg.startDate)} + ${String(rg.days)} gün · ${kinds}${planets ? ` · ${planets}` : ""} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
      }
      return `${at} · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}`;
    }
    case "kp.ruling_interval": {
      if (typeof o.atUtc !== "string") return "";
      const pl = (o.place as { label?: string } | undefined)?.label;
      const d = Number(o.durationMinutes);
      const iv = Number(o.intervalMinutes);
      const dur = d >= 60 && d % 60 === 0 ? `${d / 60} sa` : `${d} dk`;
      return `başlangıç ${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC · ${dur} / ${iv} dk adım (${d / iv + 1} an) · ${KP_AY_LABEL[String(o.ayanamsa)] ?? String(o.ayanamsa)}${pl ? ` · ${pl}` : ""}`;
    }
    case "vedic.transit":
      return typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC · ayanamsa: Lahiri (sabit)` : "ayanamsa: Lahiri (sabit)";
    case "vedic.bhav_chalit":
    case "vedic.arudha":
    case "vedic.bhava_bala":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.chara_karaka":
      return `${o.scheme === "seven" ? "7 karaka (Rahu hariç)" : "8 karaka (Rahu dahil)"} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.ashtakavarga":
    case "vedic.shadbala":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.dasha":
      return `${dashaLevelLabel(o)} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}${dashaChainLabel(o)}`;
    case "vedic.varga":
      return `D${Number(o.division ?? 9)} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.d1":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "western.fixed_stars":
      return `orb ${Number(o.orb ?? 1).toLocaleString("tr-TR")}° · ekliptik boylam kavuşumu${o.reportCatalog === true ? " · raporda katalog" : ""}`;
    case "western.profections":
      return profectionAgeOf(o.age) !== null ? `${Number(o.age)} yaş profeksiyon yılı · bütün-burç` : "";
    case "western.extra_points": {
      const names: Record<string, string> = { asteroids: "asteroitler", lots: "Hermetik lotlar", lilith: "Lilith ortalama + gerçek" };
      return Array.isArray(o.sections) ? o.sections.map((s) => names[String(s)] ?? String(s)).join(" · ") : "";
    }
    case "western.planetary_return":
      if (!isPlanetaryReturnPlanet(o.planet) || typeof o.approxDate !== "string") return "";
      return `${PLANETARY_RETURN_LABELS[o.planet].title} · hedef ${fmtDate(o.approxDate)} · ${Number(o.crossing ?? 1)}. kavuşum${returnPlace(o)}`;
    case "vedic.gun_milan":
      return `${partner ?? ""}${o.partnerRevision ? ` (karşı taraf rev ${String(o.partnerRevision)})` : ""} · ${o.order === "partner_first" ? "1. rol: karşı taraf" : "1. rol: danışan"} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "western.declination_parallels":
      return typeof o.month === "string"
        ? `${declinationMonthLabel(o.month)} · orb ${String(o.orb ?? DECLINATION_ORB_DEFAULT).replace(".", ",")}° · ${o.nodeType === "mean" ? "ortalama düğüm" : "gerçek düğüm"}${typeof o.displayTz === "string" ? ` · ${o.displayTz}` : ""}`
        : "";
    case "vedic.dashakoot":
    case "vedic.papasamyam":
      return `${partner ?? ""}${o.partnerRevision ? ` (karşı taraf rev ${String(o.partnerRevision)})` : ""} · ${o.order === "partner_first" ? "1. rol (damat): karşı taraf" : "1. rol (damat): danışan"} · ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.upagraha":
      return `ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.heliacal": {
      const pl = (o.place as { label?: string } | undefined)?.label;
      return `gün ${typeof o.date === "string" ? fmtDate(o.date) : "doğum günü"} · gözlem yeri: ${pl ?? (typeof o.placeLocationId === "string" ? o.placeLocationId : "doğum yeri")}`;
    }
    case "vedic.sade_sati":
      return `${typeof o.asOf === "string" ? `değerlendirme günü ${fmtDate(o.asOf)} · ` : ""}ayanamsa: ${(VEDIC_AYANAMSA_OPTIONS.find((x) => x[0] === o.ayanamsa)?.[1] ?? String(o.ayanamsa ?? "lahiri")).split(" —")[0]}`;
    case "vedic.monthly": {
      const names: Record<string, string> = { ingress: "burç girişleri", aspects: "açılar", lunar: "Ay açıları", parallels: "deklinasyon", natal_parallels: "doğum anı deklinasyonları" };
      const mo = Number(o.month);
      const head = Number.isInteger(mo) && mo >= 1 && mo <= 12 ? `${TR_MONTHS[mo - 1]} ${String(o.year)} (UTC ayı)` : "";
      const secs = Array.isArray(o.sections) ? o.sections.map((s) => names[String(s)] ?? String(s)).join(" · ") : "";
      return [head, secs, "Lahiri", typeof o.displayTz === "string" ? o.displayTz : ""].filter(Boolean).join(" · ");
    }
    case "western.local_space": {
      const r = o.reference as { label?: string } | undefined;
      return `merkez: ${r?.label ?? (o.referenceLocationId ? String(o.referenceLocationId) : "doğum yeri")}`;
    }
    default:
      return "";
  }
}

/** Dönüş konumu etiketi: farklı konumsa " · konum: Londra", doğum yeriyse " · doğum yeri" (eski kayıtlarda boş). */
function returnPlace(o: Record<string, unknown>): string {
  const rl = o.returnLocation as { locationId?: string | null; label?: string } | undefined;
  if (rl?.locationId) return ` · konum: ${rl.label ?? rl.locationId}`;
  if (typeof o.returnLocationId === "string") return ` · konum: ${o.returnLocationId}`;
  return rl || o.returnLocationId === null ? " · doğum yeri" : "";
}

export function techniqueLabel(id: string): string {
  return (TECHNIQUE_META as Record<string, { label: string }>)[id]?.label ?? id;
}

export type LunarReturnInfo = { sequence: number; approxUtc: string };
/** 2026-10-22 — sunucu planının bildirdiği dönüş kümesi kavuşumları (retro döngüsünde 2–3). */
export type PlanetaryReturnInfo = { crossing: number; of: number; approxUtc: string; motion: "direct" | "retrograde" };
/** 2026-10-22: "Önceki / sonraki dönüş" kısayolu — komşu dönüş kümelerinin ilk kavuşum günü (YYYY-MM-DD; yoksa null). */
export type PlanetaryReturnNeighbors = { previous: string | null; next: string | null };

/** "2027-06-28T13:58" → "28.06.2027 13:58 UTC" */
export function fmtUtcMinute(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
}

/** Aşama 5: ev/bhava sistemi etiketi — Vedik "whole_sign" Batı etiket tablosunda yok. */
export function houseSystemLabel(h: string | null | undefined, westernLabels: Record<string, string>): string {
  if (!h) return "ev sistemi yok";
  if (h === "whole_sign") return "Bütün-burç (rashi chakra)";
  if (h === "sripati") return "Sripati (bhava)";
  return westernLabels[h] ?? NATAL_HOUSE_SYSTEM_LABELS[h] ?? h;
}

/** Zodyak çerçevesi: Vedik teknikler sidereal (nirayana), diğerleri tropikal. */
export function zodiacLabel(technique: string): string {
  return technique.startsWith("kp.") ? "Sidereal (KP)" : technique.startsWith("vedic.") ? "Sidereal (nirayana)" : "Tropikal";
}

// ─── TRANSİT-03: KP Transit zaman aralığı (istemci meta; sınırlar sunucudaki engine/techniques ile AYNI, test denetler) ───
export const KP_TIMING_MAX_DAYS = 92;
export const KP_POSITIONS_MAX_DAYS = 7;
export const KP_POSITIONS_INTERVALS = [60, 180, 360, 720, 1440] as const;
const KP_KIND_SHORT: Record<string, string> = { sublord: "Sub-Lord", rasi: "Rasi", positions: "konum tablosu" };
const KP_PLANET_SHORT: Record<string, string> = { sun: "Güneş", moon: "Ay", mars: "Mars", mercury: "Merkür", jupiter: "Jüpiter", venus: "Venüs", saturn: "Satürn" };
export function kpRangeOptions(p: TechniqueParams): Record<string, unknown> {
  const kinds = p.kpRangeKinds ?? [];
  return {
    startDate: p.kpRangeStart,
    days: p.kpRangeDays,
    planets: kinds.includes("sublord") || kinds.includes("rasi") ? (p.kpRangePlanets ?? []) : [],
    kinds,
    ...(kinds.includes("positions") ? { intervalMinutes: p.kpRangeInterval } : {}),
  };
}
/**
 * KP zaman aralığı ayarı eksik / geçersizse kısa neden (yoksa null). Sunucunun parseKpRange'iyle aynı kurallar:
 * başlangıç tarihi (yıl yazılırken "0002-10-07" gibi ara değerler dahil), en az bir tür, Sub-Lord/Rasi için gezegen,
 * konum tablosu ≤ 7 gün. Neden varsa seçim plana / API'ye GİRMEZ.
 */
export function kpRangeIssue(p: TechniqueParams): string | null {
  if (dateInputIssue(p.kpRangeStart)) return "KP aralık başlangıç tarihini tamamlayın";
  const k = p.kpRangeKinds ?? [];
  if (k.length === 0) return "KP aralık türü seçin";
  if ((k.includes("sublord") || k.includes("rasi")) && (p.kpRangePlanets ?? []).length === 0) return "KP aralık gezegeni seçin";
  if (!Number.isInteger(p.kpRangeDays) || p.kpRangeDays < 1 || p.kpRangeDays > KP_TIMING_MAX_DAYS) return `KP aralığı en çok ${KP_TIMING_MAX_DAYS} gün olabilir`;
  if (k.includes("positions") && p.kpRangeDays > KP_POSITIONS_MAX_DAYS) return `KP konum tablosu en çok ${KP_POSITIONS_MAX_DAYS} gün olabilir`;
  return null;
}
/** Tahmini istek sayısı (önbellek hariç): gezegen × (sub-lord + rasi) + konum tablosu. */
export function kpRangeRequestCount(p: TechniqueParams): number {
  const k = p.kpRangeKinds ?? [];
  return (p.kpRangePlanets ?? []).length * ((k.includes("sublord") ? 1 : 0) + (k.includes("rasi") ? 1 : 0)) + (k.includes("positions") ? 1 : 0);
}
