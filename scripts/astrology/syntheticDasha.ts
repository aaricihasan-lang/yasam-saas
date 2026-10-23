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
  const head = { moonLongitude: major.moonLongitude, ayanamsa: major.ayanamsa, ayanamsaType: major.ayanamsaType, ...(major.houseThemes ? { houseThemes: major.houseThemes, focus: major.focus } : {}) };
  // 6E (KP dasha): golden'da aynı lordun significator'ları düzeyler arasında AYNI (sub/Moon golden = major) → lorddan kopyalanır.
  const sigOf = new Map(mds.filter((x) => (x as { significators?: unknown }).significators).map((x) => [x.planet, (x as { significators?: unknown }).significators]));
  const withSig = <T extends { planet: string }>(x: T): T => (sigOf.has(x.planet) ? { ...x, significators: sigOf.get(x.planet) } : x);
  const mdPeriod = { planet: m.planet, startDate: m.startDate, endDate: m.endDate, durationYears: m.durationYears, ...(m.nominalStartDate ? { nominalStartDate: m.nominalStartDate } : {}) };
  const ads = subPeriods({ lord: mdId, start: m.startDate, end: m.endDate, nominalStart: m.nominalStartDate ?? null }, { mahadashaLord: md });
  if (!ad) return { mahadashaLord: md, ...head, mahadashaPeriod: withSig(mdPeriod), antardashas: ads.map(withSig) };
  const a = ads.find((x) => x.planet === ad);
  if (!a) return null; // doğumdan önce bitmiş antardasha: sağlayıcı da bu yolu vermez (sentetik kapsam dışı)
  const pds = subPeriods({ lord: ID[ad], start: a.startDate, end: a.endDate, nominalStart: a.nominalStartDate ?? null }, { mahadashaLord: md, antardashaLord: ad });
  return { mahadashaLord: md, antardashaLord: ad, ...head, antardashaPeriod: withSig(a), pratyantardashas: pds.map(withSig) };
}

// ─── 2026-10-21 (Atlas P2 Aşama 2): Sookshma · Prana · güncel dönem zinciri ─────────────────────────────────────────────
const LEVEL_KEYS = ["mahadasha", "antardasha", "pratyantardasha", "sookshma"] as const;
/** Major golden + yol (1–4 yönetici adı) → her düzeyin dizisi (subPeriods ile; kök = mahadashas). Doğumdan önce biten yol → null. */
export function syntheticChainLists(major: Record<string, unknown>, path: string[]): { lists: P[][]; picked: P[] } | null {
  const mds = major.mahadashas as P[];
  const lists: P[][] = [mds.map((x) => ({ planet: x.planet, startDate: x.startDate, endDate: x.endDate, durationYears: x.durationYears, ...(x.nominalStartDate ? { nominalStartDate: x.nominalStartDate } : {}) }))];
  const picked: P[] = [];
  for (let i = 0; i < path.length; i++) {
    const cur = lists[i].find((x) => x.planet === path[i]);
    if (!cur || !ID[path[i]]) return null;
    picked.push(cur);
    const extra: Record<string, string> = {};
    path.slice(0, i + 1).forEach((l, k) => (extra[`${LEVEL_KEYS[k]}Lord`] = l));
    lists.push(subPeriods({ lord: ID[cur.planet], start: cur.startDate, end: cur.endDate, nominalStart: cur.nominalStartDate ?? null }, extra));
  }
  return { lists, picked };
}

/** Sentetik /dasha/sub/{md}/{ad}/{pd}[/{sd}] yanıtı (sağlayıcı şekli; golden ile birebir denetlenir). */
export function syntheticDeepResponse(major: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
  if (path.length < 3 || path.length > 4) return null;
  const c = syntheticChainLists(major, path);
  if (!c) return null;
  const head: Record<string, unknown> = {};
  path.forEach((l, k) => (head[`${LEVEL_KEYS[k]}Lord`] = l));
  Object.assign(head, { moonLongitude: major.moonLongitude, ayanamsa: major.ayanamsa, ayanamsaType: major.ayanamsaType, ...(major.houseThemes ? { houseThemes: major.houseThemes, focus: major.focus } : {}) });
  const mds = major.mahadashas as (P & { significators?: unknown })[];
  const sigOf = new Map(mds.filter((x) => x.significators).map((x) => [x.planet, x.significators]));
  const withSig = <T extends { planet: string }>(x: T): T => (sigOf.has(x.planet) ? { ...x, significators: sigOf.get(x.planet) } : x);
  const parent = c.picked[c.picked.length - 1];
  const kids = c.lists[c.lists.length - 1];
  return path.length === 3
    ? { ...head, pratyantardashaPeriod: withSig(parent), sookshmaDashas: kids.map(withSig) }
    : { ...head, sookshmaPeriod: withSig(parent), pranaDashas: kids.map(withSig) };
}

/** Yerel an ("YYYY-MM-DDTHH:MM:SS", doğum ofseti) için 5 düzey zinciri (yalnız tarihler; kalan süre/ortak ev ÜRETİLMEZ). */
export function syntheticCurrentChain(major: Record<string, unknown>, atLocal: string): P[] | null {
  const path: string[] = [];
  let lists = [(major.mahadashas as P[]).map((x) => ({ ...x }))];
  const out: P[] = [];
  for (let lvl = 0; lvl < 5; lvl++) {
    const cur = lists[lists.length - 1].find((x) => x.startDate <= atLocal && atLocal < x.endDate);
    if (!cur) return null;
    out.push(cur);
    path.push(cur.planet);
    if (lvl < 4) {
      const c = syntheticChainLists(major, path);
      if (!c) return null;
      lists = c.lists;
    }
  }
  return out;
}

/**
 * Sentetik /dasha/current yanıtı (sağlayıcı şekli) — tarihler doğrulanmış modelden (golden ile birebir denetlenir); kalan gün =
 * ⌈(bitiş − an)/gün⌉ (sağlayıcı kuralı); KP'de significator'lar major golden'ından lorda göre, commonHouses = signifiedHouses kesişimi. Anlatı YOK.
 * remainingIn*.years/months/days modelde YAKLAŞIK (yalnız totalDays bağlayıcıdır).
 */
export function syntheticCurrentResponse(major: Record<string, unknown>, atLocal: string): Record<string, unknown> | null {
  const ch = syntheticCurrentChain(major, atLocal);
  if (!ch) return null;
  const mds = major.mahadashas as (P & { significators?: { signifiedHouses?: number[] } })[];
  const sigOf = new Map(mds.filter((x) => x.significators).map((x) => [x.planet, x.significators!]));
  const keys = ["mahadasha", "antardasha", "pratyantardasha", "sookshmaDasha", "pranaDasha"];
  const rem = ["remainingInMahadasha", "remainingInAntardasha", "remainingInPratyantardasha", "remainingInSookshma", "remainingInPrana"];
  const parents = ["mahadashaLord", "antardashaLord", "pratyantardashaLord", "sookshmaLord"];
  const out: Record<string, unknown> = {
    ...(major.houseThemes ? { houseThemes: major.houseThemes, focus: major.focus } : {}),
    moonNakshatra: major.moonNakshatra,
    nakshatraName: major.nakshatraName,
    nakshatraLord: major.nakshatraLord,
    moonLongitude: major.moonLongitude,
    ayanamsa: major.ayanamsa,
    ayanamsaType: major.ayanamsaType,
  };
  ch.forEach((p, i) => {
    const o: Record<string, unknown> = { planet: p.planet, startDate: p.startDate, endDate: p.endDate, durationYears: p.durationYears, ...(p.nominalStartDate ? { nominalStartDate: p.nominalStartDate } : {}) };
    parents.slice(0, i).forEach((k, j) => (o[k] = ch[j].planet));
    if (sigOf.has(p.planet)) o.significators = sigOf.get(p.planet);
    out[keys[i]] = o;
    const days = (ms(p.endDate) - ms(atLocal)) / 864e5;
    const y = Math.floor(days / 365.25);
    const mo = Math.floor((days - y * 365.25) / 30.4375);
    out[rem[i]] = { years: y, months: mo, days: Math.floor(days - y * 365.25 - mo * 30.4375), totalDays: Math.ceil(days) };
  });
  if (sigOf.size) {
    const hs = ch.map((p) => sigOf.get(p.planet)?.signifiedHouses ?? []);
    const inter = (xs: number[][]) => xs.slice(1).reduce((a, x) => a.filter((h) => x.includes(h)), [...new Set(xs[0])]);
    out.commonHouses = { allLevels: inter(hs), dashaBhuktiAntara: inter(hs.slice(0, 3)) };
  }
  return out;
}
