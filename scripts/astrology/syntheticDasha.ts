/**
 * ASTROLOJİ 5.1F — SENTETİK Vimshottari alt-dönem yanıtları (YALNIZ test + yerel sahte Roxy; ürün kodunda YOK).
 *
 * Yerel sahte Roxy Aşama 5'te yalnız golden'ı olan iki alt yolu (sub/Mercury, sub/Moon/Rahu) yanıtlayabiliyordu → diğer 7 MD ve
 * 80 AD yolu yerelde denenemiyordu. Bu üretici Roxy'nin golden'lardan GÖZLENEN tarih kuralını taklit eder:
 *   • alt dönem sınırları = üst dönemin GERÇEK süresi (ms) × kümülatif kanonik oran (yönetici yılı / 120), dakikaya YUVARLAMA
 *   • doğumla kesilmiş üst dönemde: dizi teorik başlangıçtan (nominalStart) kurulur; doğumdan önce biten alt dönemler atılır;
 *     ilk kalan alt dönemin başlangıcı = doğum, nominalStartDate = teorik başlangıcı
 *   • durationYears = gerçek gün / 365.25
 * Model ÖNCE iki gerçek golden'ı birebir yeniden üretmek zorundadır (harness denetler); üretmezse sentetik veri kullanılmaz.
 * Anlatı (interpretation) alanları ÜRETİLMEZ.
 */
import { NAKSHATRA_LORDS, VIMSHOTTARI_YEARS, type VedicGrahaId } from "@/lib/astrology/model/vedic";

type P = { planet: string; startDate: string; endDate: string; durationYears: number; nominalStartDate?: string };
const NAME: Record<VedicGrahaId, string> = { sun: "Sun", moon: "Moon", mars: "Mars", mercury: "Mercury", jupiter: "Jupiter", venus: "Venus", saturn: "Saturn", rahu: "Rahu", ketu: "Ketu" };
const ID = Object.fromEntries(Object.entries(NAME).map(([k, v]) => [v, k as VedicGrahaId])) as Record<string, VedicGrahaId>;
const ms = (s: string) => Date.parse(`${s}Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 19);
const minute = (t: number) => Math.round(t / 60_000) * 60_000;
const cycleFrom = (l: VedicGrahaId) => Array.from({ length: 9 }, (_, k) => NAKSHATRA_LORDS[(NAKSHATRA_LORDS.indexOf(l) + k) % 9]);

/** Üst dönem (gerçek başlangıç/bitiş + varsa teorik başlangıç) → alt dönem dizisi. */
export function subPeriods(parent: { lord: VedicGrahaId; start: string; end: string; nominalStart: string | null }, extra: Record<string, string> = {}): P[] {
  const t0 = ms(parent.nominalStart ?? parent.start);
  const t1 = ms(parent.end);
  const birth = ms(parent.start);
  const out: P[] = [];
  let acc = 0;
  for (const l of cycleFrom(parent.lord)) {
    const ax = t0 + ((t1 - t0) * acc) / 120;
    acc += VIMSHOTTARI_YEARS[l];
    const bx = t0 + ((t1 - t0) * acc) / 120;
    const a = minute(ax);
    const b = acc === 120 ? t1 : minute(bx);
    if (b <= birth) continue;
    const s = Math.max(a, birth);
    // Süre yuvarlanmamış sınırlardan (golden: tarih dakikaya yuvarlı, durationYears değil).
    out.push({ planet: NAME[l], startDate: iso(s), endDate: iso(b), durationYears: (bx - Math.max(ax, birth)) / 864e5 / 365.25, ...(a < birth ? { nominalStartDate: iso(a) } : {}), ...extra });
  }
  return out;
}

/** Major golden yanıtından sentetik /dasha/sub/{md}[/{ad}] yanıtı (sağlayıcı şekli). */
export function syntheticSubResponse(major: Record<string, unknown>, md: string, ad: string | null): Record<string, unknown> | null {
  const mdId = ID[md];
  const mds = major.mahadashas as P[];
  const m = mds.find((x) => x.planet === md);
  if (!mdId || !m || (ad && !ID[ad])) return null;
  const head = { moonLongitude: major.moonLongitude, ayanamsa: major.ayanamsa, ayanamsaType: major.ayanamsaType };
  const mdPeriod = { planet: m.planet, startDate: m.startDate, endDate: m.endDate, durationYears: m.durationYears, ...(m.nominalStartDate ? { nominalStartDate: m.nominalStartDate } : {}) };
  const ads = subPeriods({ lord: mdId, start: m.startDate, end: m.endDate, nominalStart: m.nominalStartDate ?? null }, { mahadashaLord: md });
  if (!ad) return { mahadashaLord: md, ...head, mahadashaPeriod: mdPeriod, antardashas: ads };
  const a = ads.find((x) => x.planet === ad);
  if (!a) return null; // doğumdan önce bitmiş antardasha: sağlayıcı da bu yolu vermez (sentetik kapsam dışı)
  const pds = subPeriods({ lord: ID[ad], start: a.startDate, end: a.endDate, nominalStart: a.nominalStartDate ?? null }, { mahadashaLord: md, antardashaLord: ad });
  return { mahadashaLord: md, antardashaLord: ad, ...head, antardashaPeriod: a, pratyantardashas: pds };
}
