// Astroloji — VEDİK NOKTALAR kanonik modelleri (22.10.2026; SAF, istemci de import edebilir).
//
// İki AYRI teknik:
//   • vedic.upagraha — Upagrahalar (alt gezegenler): sağlayıcının 11 noktası iki AYRI sistemdir ve hiçbir zaman karıştırılmaz:
//       (a) Zaman tabanlı (Kala-velā / Gulika türü): Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka — doğum gündüzse gündüzün,
//           geceyse gecenin 8 eşit parçasından birinin (haftanın gününe göre yönetici sırası) başlangıcında yükselen burç derecesi.
//       (b) Güneş türevli (Aprakasha / Dhuma grubu): Dhuma, Vyatipata, Parivesha, Indra Chapa, Upaketu — yalnız Güneş'in sidereal
//           boylamından aritmetikle türer (saat ve yer etkisi yalnız Güneş boylamı üzerinden).
//     Hiçbiri fiziksel gök cismi değildir: HESAPLANAN DUYARLI NOKTALARDIR. Sağlayıcı ev vermez; ev yalnız aynı doğum verisinin
//     Vedik D1 kaydı önbellekte varsa onun Lagna rashisinden bütün-burç sayımıyla türetilir (yeni istek yok).
//   • vedic.heliacal — Graha Asta / Udaya (heliakal görünürlük): verilen YEREL GÜN ve GÖZLEM YERİ için altı görünür grahanın Güneş
//     parıltısından kurtulup kurtulmadığı (Surya Siddhanta kalamsa — "zaman derecesi" sınırı), son ve sonraki udaya / asta olayı.
//     Vedik D1'deki "yanık (asta)" işareti doğum ANINDAKİ ekliptik boylam farkı (orb) bayrağıdır; bu teknik ise yere bağlı ufuk
//     geometrisiyle günlük görünürlük ve olay tarihleridir — ikisi AYNI hesap değildir ve ayrı gösterilir.

import type { SignId } from "./western";
import type { NakshatraId, VedicFrame } from "./vedic";
import { formatInZone } from "../transitDetail";

// ─── Upagraha ────────────────────────────────────────────────────────────────
export const VEDIC_UPAGRAHA_TECHNICAL_SCHEMA = "astro.vedic.upagraha.v1" as const;
export const UPAGRAHA_TIME_IDS = ["gulika", "mandi", "kala", "mrityu", "ardhaprahara", "yamaghantaka"] as const;
export const UPAGRAHA_SUN_IDS = ["dhuma", "vyatipata", "parivesha", "indra_chapa", "upaketu"] as const;
export const UPAGRAHA_IDS = [...UPAGRAHA_TIME_IDS, ...UPAGRAHA_SUN_IDS] as const;
export type UpagrahaTimeId = (typeof UPAGRAHA_TIME_IDS)[number];
export type UpagrahaSunId = (typeof UPAGRAHA_SUN_IDS)[number];
export type UpagrahaId = UpagrahaTimeId | UpagrahaSunId;

/** Geleneksel adlar (teknik terim; yorum değil). */
export const UPAGRAHA_NAMES: Readonly<Record<UpagrahaId, string>> = {
  gulika: "Gulika",
  mandi: "Mandi",
  kala: "Kala",
  mrityu: "Mrityu",
  ardhaprahara: "Ardhaprahara",
  yamaghantaka: "Yamaghantaka",
  dhuma: "Dhuma",
  vyatipata: "Vyatipata",
  parivesha: "Parivesha",
  indra_chapa: "Indra Chapa",
  upaketu: "Upaketu",
};
/** Hesap dayanağı (sağlayıcı belgesi + klasik tanım; ekran ve rapor aynı metni kullanır). */
export const UPAGRAHA_BASIS: Readonly<Record<UpagrahaId, string>> = {
  gulika: "Satürn parçası (8'li gün / gece bölümü)",
  mandi: "Satürn parçası (8'li gün / gece bölümü)",
  kala: "Güneş parçası (8'li gün / gece bölümü)",
  mrityu: "Mars parçası (8'li gün / gece bölümü)",
  ardhaprahara: "Merkür parçası (8'li gün / gece bölümü)",
  yamaghantaka: "Jüpiter parçası (8'li gün / gece bölümü)",
  dhuma: "Güneş + 133°20′",
  vyatipata: "360° − Dhuma",
  parivesha: "Vyatipata + 180°",
  indra_chapa: "360° − Parivesha",
  upaketu: "Indra Chapa + 16°40′ (= Güneş − 30°)",
};
export const UPAGRAHA_GROUP_LABELS = {
  time: "Zaman tabanlı (Kala-velā / Gulika türü)",
  sun: "Güneş türevli (Aprakasha / Dhuma grubu)",
} as const;

export type VedicUpagrahaPoint = {
  id: UpagrahaId;
  group: "time" | "sun";
  /** Sidereal boylam (0…360), seçilen ayanamsa ile. */
  longitude: number;
  rashi: SignId;
  degreeInRashi: number;
  nakshatra: NakshatraId;
  /** 1…27 (Ashwini = 1). */
  nakshatraIndex: number;
  pada: 1 | 2 | 3 | 4;
  /** Lagna'dan bütün-burç ev — YALNIZ Vedik D1 kaydı önbellekte varsa türetilir; yoksa alan yok / null. */
  house?: number | null;
};
export type VedicUpagrahaTechnical = {
  schema: typeof VEDIC_UPAGRAHA_TECHNICAL_SCHEMA;
  zodiac: "sidereal";
  frame: VedicFrame;
  timeBased: VedicUpagrahaPoint[];
  sunBased: VedicUpagrahaPoint[];
  /** Dhuma − 133°20′: Güneş türevli zincirin dayandığı Güneş boylamı (sağlayıcı verisinden geri türetme; yeni hesap değil). */
  impliedSun: number;
  /**
   * Vedik D1 bağlamı (yalnız önbellek; 0 istek): Lagna rashisi ve D1 Güneş boylamı ile zincirin Güneş'i arasındaki fark.
   * Fark tolerans dışındaysa ekranda AÇIK uyarı (değer düzeltilmez). Bağlam yoksa alan yok.
   */
  d1?: { lagnaRashi: SignId; sunLongitude: number; sunDiff: number; sunConsistent: boolean } | null;
  /**
   * 24.10.2026 KISMİ SONUÇ: doğum gününde o yerde güneş doğmuyor ya da batmıyorsa (kutup günü / gecesi) sağlayıcı zaman tabanlı listeyi
   * boş verir → timeBased boş, yalnız Güneş türevli 5 nokta. Tam sonuçta alan YOK (eski kayıtlar şema v1 ile aynen okunur).
   */
  partial?: { reason: "sun_does_not_rise_or_set" };
  /**
   * ATL-B01 (30.10.2026): Kala, Mrityu, Ardhaprahara ve Yamaghantaka BPHS sırasıyla (yöneticisiz parça SONDA) yerel hesaplandı.
   * Alan YOKSA kayıt eski sürümdür (bu dört nokta servisin sırasıyla; ekranda eski ekol notu). Gulika, Mandi ve Güneş türevliler servisindir.
   * Kısmi sonuçta (kutup günü/gecesi) yalnız `method` vardır (zaman tabanlı nokta yok; gündüz/gece tanımsız).
   */
  kalaVela?: { method: "bphs_part_start"; isDay?: boolean; weekday?: number };
};
export const UPAGRAHA_PARTIAL_LABEL = "Kısmi sonuç";
export const UPAGRAHA_PARTIAL_NOTE =
  "Kısmi sonuç: doğum gününde bu yerde güneş doğmadığı ya da batmadığı için (kutup günü / kutup gecesi) gündüz ve gece süresinin 8 eşit parçası tanımsızdır. Bu nedenle zaman tabanlı altı upagraha hesaplanmaz ve gösterilmez; Güneş boylamından türeyen beş nokta geçerlidir.";
/** Güneş zinciri ↔ D1 Güneş toleransı (derece): sağlayıcı boylamları 2 haneye yuvarlar. */
export const UPAGRAHA_SUN_TOLERANCE = 0.02;

export const UPAGRAHA_NOT_BODY_NOTE =
  "Upagrahalar fiziksel gök cismi değildir; doğum anı, yeri ve Güneş boylamından hesaplanan duyarlı noktalardır. Gözlenemezler; Navagraha ile aynı anlamda kullanılmazlar.";
export const UPAGRAHA_SYSTEMS_NOTE =
  "İki ayrı sistem birlikte verilir ve karıştırılmamalıdır. Zaman tabanlı noktalar (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) doğum gündüzse gündüz süresinin, geceyse gece süresinin 8 eşit parçasından birinin başlangıcında yükselen burç derecesidir; gündüz parçalarının yöneticileri haftanın gününün yöneticisinden, gece parçalarınınki o günün 5. yöneticisinden başlar, 8. parça yöneticisizdir (Kala = Güneş, Mrityu = Mars, Ardhaprahara = Merkür, Yamaghantaka = Jüpiter, Gulika ve Mandi = Satürn parçası). Güneş türevli noktalar (Dhuma, Vyatipata, Parivesha, Indra Chapa, Upaketu) yalnız Güneş'in sidereal boylamından aritmetikle türer: Dhuma = Güneş + 133°20′, Vyatipata = 360° − Dhuma, Parivesha = Vyatipata + 180°, Indra Chapa = 360° − Parivesha, Upaketu = Indra Chapa + 16°40′.";
export const UPAGRAHA_SCHOOL_NOTE =
  "Ekol farkı (16 gerçek hesapla, haftanın 7 günü × gündüz/gece ölçüldü): Gulika, Satürn parçasının başlangıcında yükselen derecedir (BPHS ile aynı). Kala, Mrityu, Ardhaprahara ve Yamaghantaka'yı hesaplama servisi, yöneticisiz 8. parçayı Satürn parçasının hemen ardına koyan sırayla verir; BPHS'de yöneticisiz parça sondadır. Bu yüzden sırada Satürn'den sonra gelen gezegenin noktası BPHS'ye göre bir parça (gün ya da gece süresinin 1/8'i) sonraki başlangıçtadır; Satürn'den önce gelenler BPHS ile aynıdır. Mandi'yi servis, Uttara Kalamrita'nın haftanın gününe göre ghati tablosundaki anın (gündüz: Pazar 26, Pazartesi 22, Salı 18, Çarşamba 14, Perşembe 10, Cuma 6, Cumartesi 2; gece: Pazar 10, Pazartesi 6, Salı 2, Çarşamba 26, Perşembe 22, Cuma 18, Cumartesi 14 ghati) tam bir parça öncesinde yükselen derece olarak verir. Doğumun gündüz mü gece mi olduğu yanıtta bildirilmez.";
/** ATL-B01 (30.10.2026): `kalaVela` alanı olan (BPHS sırasıyla yerel hesaplanmış) kayıtların ekol notu. */
export const UPAGRAHA_SCHOOL_NOTE_BPHS =
  "Ekol farkı ve yöntem: Kala, Mrityu, Ardhaprahara ve Yamaghantaka, BPHS'e (Bölüm 3, şl. 66–70) göre hesaplanır: gün ya da gece süresi 8 eşit parçaya bölünür, yedi parça haftanın günü yöneticisinden (gece: o günün 5. yöneticisinden) başlayarak hafta sırasıyla dağıtılır, yöneticisiz parça sondadır (8. parça); nokta, parçanın başlangıcında yükselen burç derecesidir. Bu sıra Panchanga'daki Yamaganda ve Gulika kāla pencereleriyle aynıdır. Bazı modern kaynaklar yöneticisiz parçayı Satürn parçasının hemen ardına koyar ve noktayı parçanın ortasında alır; burada bu sıra kullanılmaz. Gulika, Satürn parçasının başlangıcında yükselen derecedir (BPHS ile aynı). Mandi, Uttara Kalamrita'nın haftanın gününe göre ghati tablosundaki anın (gündüz: Pazar 26, Pazartesi 22, Salı 18, Çarşamba 14, Perşembe 10, Cuma 6, Cumartesi 2; gece: Pazar 10, Pazartesi 6, Salı 2, Çarşamba 26, Perşembe 22, Cuma 18, Cumartesi 14 ghati) tam bir parça öncesinde yükselen derecedir.";
/**
 * ATL-B01 son kontrol: eski (-1) kayıtlar için ortak "iki sistem" açıklaması — BPHS hesabı yapılmış izlenimi vermez; yöneticisiz parça sırasını
 * o kaydın gerçek (servis) sırasıyla söyler. Yeni kayıtlar `UPAGRAHA_SYSTEMS_NOTE`'u (BPHS sırası) AYNEN kullanır.
 */
export const UPAGRAHA_SYSTEMS_NOTE_LEGACY =
  "İki ayrı sistem birlikte verilir ve karıştırılmamalıdır. Zaman tabanlı noktalar (Gulika, Mandi, Kala, Mrityu, Ardhaprahara, Yamaghantaka) doğum gündüzse gündüz süresinin, geceyse gece süresinin 8 eşit parçasından birinin başlangıcında yükselen burç derecesidir; gündüz parçalarının yöneticileri haftanın gününün yöneticisinden, gece parçalarınınki o günün 5. yöneticisinden başlar (Kala = Güneş, Mrityu = Mars, Ardhaprahara = Merkür, Yamaghantaka = Jüpiter, Gulika ve Mandi = Satürn parçası). Bu kayıt eski hesap sürümüdür: Kala, Mrityu, Ardhaprahara ve Yamaghantaka, yöneticisiz parçayı Satürn parçasının hemen ardına koyan sırayla hesaplanmıştır (BPHS'de yöneticisiz parça sondadır; bkz. ekol notu). Güneş türevli noktalar (Dhuma, Vyatipata, Parivesha, Indra Chapa, Upaketu) yalnız Güneş'in sidereal boylamından aritmetikle türer: Dhuma = Güneş + 133°20′, Vyatipata = 360° − Dhuma, Parivesha = Vyatipata + 180°, Indra Chapa = 360° − Parivesha, Upaketu = Indra Chapa + 16°40′.";
/** Eski (-1) kayıtta, zaman tabanlı tablonun hemen üstünde ekranda ve Word/PDF'te AYNI metinle gösterilen uyarı. */
export const UPAGRAHA_LEGACY_ORDER_NOTE =
  "Eski hesap sürümü: bu kayıttaki Kala, Mrityu, Ardhaprahara ve Yamaghantaka, yöneticisiz parçayı Satürn parçasının hemen ardına koyan eski sırayla hesaplanmıştır; BPHS sırasıyla hesaplanmamıştır. Haftanın gününe ve gündüz/gece doğumuna göre bu dört noktadan bazıları BPHS değerinden bir parça (gün ya da gece süresinin 1/8'i) sonraki başlangıcı gösterebilir. Değerler kayıt anındaki gibidir, değiştirilmedi; BPHS sonucu için yeniden hesaplayıp yeni kayıt oluşturun. Gulika, Mandi ve Güneş türevli beş nokta bu farktan etkilenmez.";
/** Eski sürüm kaydı mı (BPHS işareti yok)? Kısmi sonuçta dört nokta gösterilmediği için uyarı gerekmez. */
export const isLegacyUpagrahaOrder = (t: { kalaVela?: unknown; partial?: unknown; timeBased?: unknown } | null | undefined) =>
  !!t && !t.kalaVela && !t.partial && Array.isArray(t.timeBased) && t.timeBased.length > 0;
/** Kayda göre ortak sistem açıklaması (ekran ve Word/PDF aynı seçimi kullanır). */
export const upagrahaSystemsNote = (t: { kalaVela?: unknown } | null | undefined) => (t && t.kalaVela ? UPAGRAHA_SYSTEMS_NOTE : UPAGRAHA_SYSTEMS_NOTE_LEGACY);
/** Kayda göre ekol notu: BPHS yerel hesabı (yeni) ya da eski sürüm (servis sırası). Ekran ve Word/PDF aynı seçimi kullanır. */
export const upagrahaSchoolNote = (t: { kalaVela?: unknown } | null | undefined) => (t && t.kalaVela ? UPAGRAHA_SCHOOL_NOTE_BPHS : UPAGRAHA_SCHOOL_NOTE);
export const UPAGRAHA_HOUSE_NOTE =
  "Ev sütunu yalnız aynı doğum verisinin Vedik D1 (Rashi) kaydı bu ayanamsa ile hesaplanmışsa onun Lagna rashisinden bütün-burç sayımıyla gösterilir (yeni istek yapılmaz).";
export const GULIKA_PANCHANGA_NOTE =
  "Ayrıntılı Panchanga'daki “Gulika” bir ZAMAN PENCERESİDİR (gündüzün Satürn parçası); buradaki Gulika ise o parçanın başlangıcında yükselen burç derecesi olan bir BOYLAMDIR. İkisi aynı bölümlemeden türer ama farklı büyüklüklerdir.";

// ─── Heliakal (Graha Asta / Udaya) ───────────────────────────────────────────
export const VEDIC_HELIACAL_TECHNICAL_SCHEMA = "astro.vedic.heliacal.v1" as const;
export const HELIACAL_GRAHAS = ["moon", "mars", "mercury", "jupiter", "venus", "saturn"] as const;
export type HeliacalGrahaId = (typeof HELIACAL_GRAHAS)[number];
/** Surya Siddhanta kalamsa sınırları (zaman derecesi): [doğrudan, geri]. Ay asla geri değildir. */
export const HELIACAL_KALAMSA: Readonly<Record<HeliacalGrahaId, readonly [number, number]>> = {
  moon: [12, 12],
  mars: [17, 17],
  mercury: [14, 12],
  jupiter: [11, 11],
  venus: [10, 8],
  saturn: [15, 15],
};
export const kalamsaFor = (g: HeliacalGrahaId, retrograde: boolean) => HELIACAL_KALAMSA[g][retrograde ? 1 : 0];
/** Gözlem yeri sınırı: sağlayıcı |enlem| > 60° için hesap yapmaz (kutup ufku). */
export const HELIACAL_MAX_LATITUDE = 60;

export type HeliacalEventType = "udaya" | "asta";
export type HeliacalHorizon = "east" | "west";
export type VedicHeliacalEvent = {
  type: HeliacalEventType;
  horizon: HeliacalHorizon;
  /** Grahanın ufuk geçiş anı — istekteki sabit ofsetle YEREL (YYYY-MM-DDTHH:MM:SS) ve ondan türetilen UTC (YYYY-MM-DDTHH:MM:SSZ). */
  local: string;
  utc: string;
  timeDegrees: number;
  kalamsa: number;
};
export type VedicHeliacalGraha = {
  id: HeliacalGrahaId;
  visible: boolean;
  horizon: HeliacalHorizon;
  /** Güneş ile ufuk geçişleri arasındaki ekvator ölçüsü (zaman derecesi, kalamsa). */
  timeDegrees: number;
  kalamsa: number;
  retrograde: boolean;
  /** Düz ekliptik boylam farkı (derece) — doğum haritası "yanık" bayrağının kullandığı ölçü; karşılaştırma için. */
  longitudeSeparation: number;
  lastEvent: VedicHeliacalEvent | null;
  nextEvent: VedicHeliacalEvent | null;
};
export type VedicHeliacalTechnical = {
  schema: typeof VEDIC_HELIACAL_TECHNICAL_SCHEMA;
  /** Değerlendirilen yerel takvim günü. */
  date: string;
  place: { label: string | null; latitude: number; longitude: number; utcOffsetHours: number; timeZone: string | null };
  grahas: VedicHeliacalGraha[];
  /** Yanıtta olmayan görünür grahalar (o enlemde o gün ufuk geçişi yok). */
  omitted: HeliacalGrahaId[];
};

export const HELIACAL_EVENT_LABELS: Readonly<Record<HeliacalEventType, string>> = { udaya: "Udaya (heliakal doğuş)", asta: "Asta (heliakal batış)" };
export const HELIACAL_HORIZON_LABELS: Readonly<Record<HeliacalHorizon, string>> = { east: "Doğu ufku (sabah, gün doğumundan önce)", west: "Batı ufku (akşam, gün batımından sonra)" };
export const HELIACAL_METHOD_NOTE =
  "Yöntem (Surya Siddhanta): her graha için Güneş ile grahanın ufuk geçişleri arasındaki ekvator ölçüsü (zaman derecesi) hesaplanır ve grahanın kalamsa sınırıyla karşılaştırılır — Ay 12, Jüpiter 11, Satürn 15, Mars 17, Venüs 10 (geri harekette 8), Merkür 14 (geri harekette 12). Sınırı aşan graha Güneş parıltısından kurtulmuş (görünür) sayılır; aşamayan graha astadadır. Değerlendirme o günün gün doğumu / gün batımı ufkunda yapılır ve gözlem yerine bağlıdır (ekliptiğin ufukla yaptığı açı).";
export const HELIACAL_VS_COMBUSTION_NOTE =
  "Vedik D1'deki “yanık (asta)” işareti doğum ANINDAKİ düz ekliptik boylam farkına (orb) bakar ve yere bağlı değildir. Bu teknik ise seçilen GÜN ve YER için ufuk geometrisine göre görünürlüğü ve son / sonraki udaya – asta olaylarını verir. İki sonuç farklı olabilir; tabloda iki ölçü (zaman derecesi ve boylam farkı) yan yana gösterilir.";
export const HELIACAL_SCOPE_NOTE =
  "Kapsam: yalnız görünür altı graha (Ay, Mars, Merkür, Jüpiter, Venüs, Satürn) değerlendirilir; Güneş ve hesaplanan düğümler (Rahu, Ketu) görünür cisim olmadığından yoktur. Gözlem yeri enlemi ±60° ile sınırlıdır. Olay arama penceresi yaklaşık bir sinodik dönemdir; pencerede olay yoksa “arama penceresinde yok” yazılır. Olay anı, grahanın kendisinin o gün ufku geçtiği andır; saatler isteğin sabit UTC ofsetiyle hesaplanır, yerel saat gösterimi yer saat dilimine göre yapılır.";

const dd = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const offTxt = (h: number) => {
  const m = Math.round(Math.abs(h) * 60);
  return `UTC${h < 0 ? "−" : "+"}${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/**
 * Olay anı gösterimi (ekran + rapor ortak; SAF): UTC (yerel − istekteki sabit ofset) ve yerel saat. Yer saat dilimi biliniyorsa yerel
 * saat O ANIN gerçek ofsetiyle (yaz / kış saati) gösterilir; bilinmiyorsa istekteki sabit ofsetle ve ofset yazılarak.
 */
export function heliacalEventTimeText(ev: { local: string; utc: string }, place: { utcOffsetHours: number; timeZone: string | null }): { local: string; utc: string } {
  const utc = `${dd(ev.utc)} ${ev.utc.slice(11, 16)} UTC`;
  const z = place.timeZone ? formatInZone(ev.utc, place.timeZone) : null;
  return { local: z ? `${z.text} (${z.zone})` : `${dd(ev.local)} ${ev.local.slice(11, 16)} (${offTxt(place.utcOffsetHours)})`, utc };
}
export const heliacalPlaceText = (p: { label: string | null; latitude: number; longitude: number; utcOffsetHours: number }) =>
  `${p.label ? `${p.label} · ` : ""}${Math.abs(p.latitude).toFixed(4)}° ${p.latitude >= 0 ? "K" : "G"}, ${Math.abs(p.longitude).toFixed(4)}° ${p.longitude >= 0 ? "D" : "B"} · ${offTxt(p.utcOffsetHours)}`;
export const fmtDayTr = dd;
