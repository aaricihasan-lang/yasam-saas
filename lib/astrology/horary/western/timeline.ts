// Gökyüzü Atlası — Klasik Batı Horary: GERÇEK olay çizelgesi + ilişki ADAYLARI (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Konumlar: astronomy-engine 2.1.19 (MIT) geosantrik görünür boylam, gerçek ekliptik (ışık zamanı + aberasyon). 2026-10-28
// karşılaştırması: Swiss Ephemeris DE441 (astro.com swetest) ile 12 soru anında 7 gezegen ≤18″, hız ≤0,8″/gün.
// Kesinleşme / istasyon / burç girişi anları işaret değişimi taraması + ikiye bölme ile bulunur (≤1 sn). DOĞRUSAL tahmin
// (#438 `linearDaysToExact`) kullanılmaz.
//
// HÜKÜM ÜRETİLMEZ. Engelleme, hüsran, refranation, ışık aktarımı ve toplanması yalnız tanımı açık yazılmış ADAY olarak
// listelenir; her aday kendi olay kanıtını (an, açı, gezegen) taşır. Tanımlar Lilly CA s. 110–113 ve s. 125–126'dandır;
// iki sayfanın aktarma/toplama tanımları farklıdır (s. 125–126 ek olarak kabul şartı koşar) → ikisi AYRI bayrak.

import * as Astronomy from "astronomy-engine";
import { CLASSICAL_PLANETS, LILLY_ORB, WEIGHT_ORDER, heavier, moietyLimit, signOf, type ClassicalPlanet } from "./tables";

export type Body = ClassicalPlanet | "uranus" | "neptune" | "pluto";
export const OUTER: readonly Body[] = ["uranus", "neptune", "pluto"];
export const PTOLEMAIC_ANGLES = [0, 60, 90, 120, 180] as const;

const AE: Record<Body, Astronomy.Body> = {
  sun: Astronomy.Body.Sun, moon: Astronomy.Body.Moon, mercury: Astronomy.Body.Mercury, venus: Astronomy.Body.Venus, mars: Astronomy.Body.Mars,
  jupiter: Astronomy.Body.Jupiter, saturn: Astronomy.Body.Saturn, uranus: Astronomy.Body.Uranus, neptune: Astronomy.Body.Neptune, pluto: Astronomy.Body.Pluto,
};
const HOUR = 3_600_000;
const DAY = 86_400_000;
const n360 = (x: number) => ((x % 360) + 360) % 360;
const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
const iso = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");

// Tarama ızgarası t0 + k·adım olduğundan aynı (gövde, an) çiftleri çift analizlerinde tekrar tekrar istenir → sınırlı önbellek.
const CACHE = new Map<string, number>();
const CACHE_MAX = 400_000;
export function lonAt(b: Body, ms: number): number {
  const k = `${b}|${ms}`;
  const hit = CACHE.get(k);
  if (hit !== undefined) return hit;
  const v = Astronomy.Ecliptic(Astronomy.GeoVector(AE[b], Astronomy.MakeTime(new Date(ms)), true)).elon;
  if (CACHE.size >= CACHE_MAX) CACHE.clear();
  CACHE.set(k, v);
  return v;
}
/**
 * Zaman belirsizliği (2026-10-28 kabul denetimi). Kök çözüm hassasiyeti (≤1 sn) ASTRONOMİK doğruluk DEĞİLDİR. Efemeris farkı sınırı:
 * Swiss Ephemeris DE441 ile 12 anda 7 gezegen boylamı ≤17,8″, hız ≤0,76″/gün → güvenli üst sınır 20″ ve 1″/gün. Olay anının
 * belirsizliği = konum hatası / göreli hız (kesinleşme: iki gövde 40″; burç girişi: 20″) ve istasyon için hız hatası / ivme.
 * Örn. Ay açıları ~1–2 dk; Jüpiter–Satürn saatler; istasyonlar saatler–günler. Değer tahmindir (üst sınır mertebesi).
 */
export const POSITION_ERROR_ARCSEC = 20;
export const SPEED_ERROR_ARCSEC_PER_DAY = 1;
export const ROOT_PRECISION_SEC = 1;
const uncPerfection = (relDegPerDay: number) => (Math.abs(relDegPerDay) < 1e-9 ? Infinity : (2 * POSITION_ERROR_ARCSEC * 86_400) / (3600 * Math.abs(relDegPerDay)));
/** İstasyon eşiği: hız hatası sınırının iki katı (±2″/gün). Bu hızın altındaki gövdenin yönü belirlenemez. */
export const STATION_SPEED = (2 * SPEED_ERROR_ARCSEC_PER_DAY) / 3600;
const SUPERIOR: readonly Body[] = ["saturn", "jupiter", "mars"];
const INFERIOR: readonly Body[] = ["venus", "mercury", "moon"];

/** H-04-03: kesinleşme öncesi açı hatasının işareti (sBefore) ve iki hızdan yaklaşma rolleri. Saf; test edilebilir. */
export function classifyApproach(a: Body, b: Body, aSpeed: number, bSpeed: number, sBefore: number): Pick<Perfection, "aToward" | "bToward" | "approach" | "applier" | "lillyApplication"> {
  const aStat = Math.abs(aSpeed) <= STATION_SPEED;
  const bStat = Math.abs(bSpeed) <= STATION_SPEED;
  const aToward = !aStat && aSpeed * sBefore < 0;
  const bToward = !bStat && bSpeed * sBefore > 0;
  const approach = aToward && bToward ? "mutual" : aToward ? "a" : bToward ? "b" : "none";
  const applier = approach === "a" ? a : approach === "b" ? b : null;
  let lillyApplication: Perfection["lillyApplication"];
  if (aStat || bStat || approach === "none") lillyApplication = "station_unresolved";
  else if (approach === "mutual") lillyApplication = "direct_and_retrograde";
  else if (aSpeed < 0 && bSpeed < 0) lillyApplication = "both_retrograde";
  else {
    const mover = applier as Body;
    const other = mover === a ? b : a;
    lillyApplication = SUPERIOR.includes(mover) && INFERIOR.includes(other) ? "superior_overtakes_inferior_unresolved" : "direct_swifter_to_slower";
  }
  return { aToward, bToward, approach, applier, lillyApplication };
}

const uncIngress = (speed: number) => (Math.abs(speed) < 1e-9 ? Infinity : (POSITION_ERROR_ARCSEC * 86_400) / (3600 * Math.abs(speed)));

/** Derece/gün, ±1 saat merkezî fark. */
export const speedAt = (b: Body, ms: number) => wrap180(lonAt(b, ms + HOUR) - lonAt(b, ms - HOUR)) * 12;

/** Tarama adımı: iki gövdeden hızlı olana göre (Ay 1 sa; Merkür/Venüs/Güneş/Mars 6 sa; diğerleri 1 gün). */
function stepFor(a: Body, b?: Body): number {
  const fast = (x: Body) => (x === "moon" ? 0 : x === "mercury" || x === "venus" || x === "sun" || x === "mars" ? 1 : 2);
  const k = Math.min(fast(a), b ? fast(b) : 2);
  return k === 0 ? HOUR : k === 1 ? 6 * HOUR : DAY;
}

/** f'nin [lo, hi] içindeki kökü (işaret değişimi varsayılır), ≤1 sn. */
function bisect(f: (ms: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  for (let i = 0; i < 60 && hi - lo > 1000; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

export type Perfection = {
  ms: number;
  atUtc: string;
  a: Body;
  b: Body;
  /** 0 / 60 / 90 / 120 / 180. */
  angle: number;
  aLon: number;
  bLon: number;
  aSpeed: number;
  bSpeed: number;
  /**
   * H-04-03 (2026-10-28): her gövdenin kesinleşme noktasına DOĞRU hareket edip etmediği AYRI değerlendirilir (mutlak hız
   * büyüklüğüne bakılmaz). Kesinleşmeden hemen önce açı hatası f = (λa − λb − hedef) işaret s'ye sahiptir; a, f'yi sıfıra götürüyorsa
   * (va·s < 0) a yaklaşır; b, λb'yi artırarak f'yi azaltıyorsa (vb·s > 0) b yaklaşır. |v| ≤ STATION_SPEED ise gövde istasyondadır.
   */
  aToward: boolean;
  bToward: boolean;
  /** "a" / "b" = tek taraflı; "mutual" = ikisi de birbirine doğru; "none" = ikisi de istasyonda (kesinleşmeyi göreli hız yapar). */
  approach: "a" | "b" | "mutual" | "none";
  /** Tek taraflı yaklaşmada hareket eden gövde; karşılıklı / istasyon durumunda null (tek gövdeye indirgenmez). */
  applier: Body | null;
  /**
   * CA s. 107–108 application türleri (fiziksel yaklaşmadan AYRI tutulur):
   *  direct_swifter_to_slower  — 1. tür: ikisi doğrudan, hızlı olan yavaşa;
   *  both_retrograde           — 2. tür: ikisi geri (örnek: ☿ geri Koç 10°, ♂ geri Koç 9°);
   *  direct_and_retrograde     — 3. tür: az derecedeki doğrudan ile çok derecedeki geri, karşılıklı ("ill application");
   *  superior_overtakes_inferior_unresolved — ikisi doğrudan ve Satürn/Jüpiter/Mars yavaşlamış Venüs/Merkür/Ay'ı yakalıyor:
   *      s. 108 "the superiour Planets doe not apply to the inferiour (unlesse they be Retrograde)" ile fiziksel yaklaşma
   *      çelişir → kaynak çözmez, sınıflandırılmaz;
   *  station_unresolved        — gövdelerden biri istasyonda (Lilly bu durumu tanımlamaz).
   */
  lillyApplication: "direct_swifter_to_slower" | "both_retrograde" | "direct_and_retrograde" | "superior_overtakes_inferior_unresolved" | "station_unresolved";
  /** Efemeris kaynaklı tahmini zaman belirsizliği (sn), bkz. POSITION_ERROR_ARCSEC. */
  uncertaintySec: number;
};

/** a–b arasındaki tüm kesinleşmeler [t0, t1]. Hedef açı ±θ ikisi de aranır (sağ/sol açı). */
export function findPerfections(a: Body, b: Body, t0: number, t1: number, angles: readonly number[] = PTOLEMAIC_ANGLES): Perfection[] {
  const out: Perfection[] = [];
  const step = stepFor(a, b);
  for (const ang of angles) {
    for (const target of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
      const f = (ms: number) => wrap180(lonAt(a, ms) - lonAt(b, ms) - target);
      let pa = t0;
      let fa = f(pa);
      while (pa < t1) {
        const pz = Math.min(pa + step, t1);
        const fz = f(pz);
        if (fa === 0 || (Math.sign(fa) !== Math.sign(fz) && Math.abs(fa - fz) < 90)) {
          const ms = fa === 0 ? pa : bisect(f, pa, pz);
          const aS = speedAt(a, ms);
          const bS = speedAt(b, ms);
          // Kesinleşme öncesi işaret: tarama adımının başındaki f (sıfırsa göreli hızdan).
          const sBefore = fa !== 0 ? Math.sign(fa) : -Math.sign(aS - bS);
          out.push({ ms, atUtc: iso(ms), a, b, angle: ang, aLon: lonAt(a, ms), bLon: lonAt(b, ms), aSpeed: aS, bSpeed: bS, ...classifyApproach(a, b, aS, bS, sBefore), uncertaintySec: uncPerfection(aS - bS) });
        }
        pa = pz;
        fa = fz;
      }
    }
  }
  return out.sort((x, y) => x.ms - y.ms);
}

export type Station = { ms: number; atUtc: string; body: Body; kind: "retrograde" | "direct"; lon: number; uncertaintySec: number };
export function findStations(body: Body, t0: number, t1: number): Station[] {
  if (body === "sun" || body === "moon") return [];
  const step = body === "mercury" || body === "venus" ? DAY / 2 : DAY;
  const f = (ms: number) => speedAt(body, ms);
  const out: Station[] = [];
  let pa = t0;
  let fa = f(pa);
  while (pa < t1) {
    const pz = Math.min(pa + step, t1);
    const fz = f(pz);
    if (Math.sign(fa) !== Math.sign(fz)) {
      const ms = bisect(f, pa, pz);
      const acc = speedAt(body, ms + DAY / 2) - speedAt(body, ms - DAY / 2); // derece/gün² (1 günlük fark)
      const unc = Math.abs(acc) < 1e-12 ? Infinity : ((SPEED_ERROR_ARCSEC_PER_DAY / 3600) / Math.abs(acc)) * 86_400;
      out.push({ ms, atUtc: iso(ms), body, kind: fz < 0 ? "retrograde" : "direct", lon: lonAt(body, ms), uncertaintySec: unc });
    }
    pa = pz;
    fa = fz;
  }
  return out;
}

export type Ingress = { ms: number; atUtc: string; body: Body; from: string; to: string; retrograde: boolean; uncertaintySec: number };
export function findIngresses(body: Body, t0: number, t1: number): Ingress[] {
  const step = stepFor(body);
  const out: Ingress[] = [];
  let pa = t0;
  let sa = Math.floor(lonAt(body, pa) / 30);
  while (pa < t1) {
    const pz = Math.min(pa + step, t1);
    const sz = Math.floor(lonAt(body, pz) / 30);
    if (sz !== sa) {
      // Sınır: sa ile sz arasındaki 30° katı (geri harekette de doğru taraf).
      const boundary = n360((((sz - sa + 12) % 12) === 1 ? sz : sa) * 30);
      const ms = bisect((m) => wrap180(lonAt(body, m) - boundary), pa, pz);
      const sp = speedAt(body, ms);
      out.push({ ms, atUtc: iso(ms), body, from: signOf(sa * 30), to: signOf(sz * 30), retrograde: sp < 0, uncertaintySec: uncIngress(sp) });
    }
    pa = pz;
    sa = sz;
  }
  return out;
}

// ─── Anlık açı durumu (Ptolemaik, moiety ile) ────────────────────────────────────────────────────────────
export type AspectNow = {
  a: ClassicalPlanet;
  b: ClassicalPlanet;
  angle: number;
  /** İşaretsiz derece: en yakın hedef açıya uzaklık. */
  orb: number;
  applying: boolean;
  /** |orb| ≤ moiety(a) + moiety(b) (CA s. 107, s. 110). */
  withinMoieties: boolean;
  /** Burçlara göre açı (bütün-burç) var mı? Lilly'de burç dışı (out-of-sign) açının sayılması eğitmen kararıdır. */
  bySign: boolean;
  /** H-04-03: yalnız yaklaşan açıda — her gövdenin açı noktasına doğru hareketi ve CA s. 107–108 türü (ayrılan açıda null). */
  roles: Pick<Perfection, "aToward" | "bToward" | "approach" | "applier" | "lillyApplication"> | null;
};
export function aspectNow(a: ClassicalPlanet, b: ClassicalPlanet, ms: number, orbs: Readonly<Record<ClassicalPlanet, number>> = LILLY_ORB): AspectNow {
  const la = lonAt(a, ms);
  const lb = lonAt(b, ms);
  const sep = n360(la - lb);
  let best = { angle: 0, e: 999 };
  for (const ang of PTOLEMAIC_ANGLES) for (const tg of ang === 0 || ang === 180 ? [ang] : [ang, 360 - ang]) {
    const e = wrap180(sep - tg);
    if (Math.abs(e) < Math.abs(best.e)) best = { angle: ang, e };
  }
  const va = speedAt(a, ms);
  const vb = speedAt(b, ms);
  const rel = va - vb;
  const signDist = (((Math.floor(la / 30) - Math.floor(lb / 30)) % 12) + 12) % 12;
  const bySign = [best.angle / 30, (12 - best.angle / 30) % 12].includes(signDist);
  const applying = best.e * rel < 0;
  return {
    a,
    b,
    angle: best.angle,
    orb: Math.abs(best.e),
    applying,
    withinMoieties: Math.abs(best.e) <= moietyLimit(a, b, orbs),
    bySign,
    // Yaklaşan açıda şu anki hata işareti = kesinleşme öncesi işaret.
    roles: applying ? classifyApproach(a, b, va, vb, Math.sign(best.e)) : null,
  };
}

// ─── Ay'ın seyri ───────────────────────────────────────────────────────────────────────────────────────
export type MoonCourse = {
  sign: string;
  ingressUtc: string;
  /** Son kesinleşen Ptolemaik açı (geriye 3 gün). `inCurrentSign`: o kesinleşme Ay bu burçtayken mi oldu. */
  last: (Perfection & { inCurrentSign: boolean }) | null;
  /** Burç değiştirmeden önce kesinleşecek açılar (sırayla). */
  nextInSign: Perfection[];
  /** Burçtan çıktıktan sonraki ilk kesinleşme (bilgi; boşlukta tanımına girmez). */
  firstAfterIngress: Perfection | null;
  /** Varyant A — burç tanımı (CA s. 112 metni + modern yaygın): yalnız `bodies` ile burç içinde kesinleşme yoksa boşlukta. */
  voidOfCourse: boolean;
  /** Varyant B — dış gezegenler de sayılırsa (modern horary) boşlukta mı? */
  voidOfCourseWithOuter: boolean;
  /** Varyant C (bilgi) — şu an moiety toplamı içinde yaklaşılan gezegenler (Lilly "apply" sözcüğünün orb yorumu). */
  applyingWithinMoieties: ClassicalPlanet[];
  bodies: Body[];
};
export function moonCourse(ms: number, bodies: readonly Body[] = CLASSICAL_PLANETS.filter((p) => p !== "moon"), orbs: Readonly<Record<ClassicalPlanet, number>> = LILLY_ORB): MoonCourse {
  const ingress = findIngresses("moon", ms, ms + 3 * DAY)[0];
  const end = ingress ? ingress.ms : ms + 3 * DAY;
  const signStart = findIngresses("moon", ms - 3 * DAY, ms).at(-1)?.ms ?? ms - 3 * DAY;
  const evAll = (bs: readonly Body[], a: number, b: number) => bs.flatMap((x) => findPerfections("moon", x, a, b)).sort((p, q) => p.ms - q.ms);
  const past = evAll(bodies, ms - 3 * DAY, ms);
  const lastEv = past.at(-1) ?? null;
  const nextInSign = evAll(bodies, ms, end);
  const withOuter = evAll([...bodies, ...OUTER.filter((o) => !bodies.includes(o))], ms, end);
  const after = ingress ? evAll(bodies, end, end + 3 * DAY)[0] ?? null : null;
  const applying = CLASSICAL_PLANETS.filter((p) => p !== "moon").filter((p) => {
    const s = aspectNow("moon", p, ms, orbs);
    return s.applying && s.withinMoieties;
  });
  return {
    sign: signOf(lonAt("moon", ms)),
    ingressUtc: iso(end),
    last: lastEv ? { ...lastEv, inCurrentSign: lastEv.ms >= signStart } : null,
    nextInSign,
    firstAfterIngress: after,
    voidOfCourse: nextInSign.length === 0,
    voidOfCourseWithOuter: withOuter.length === 0,
    applyingWithinMoieties: applying,
    bodies: [...bodies],
  };
}

// ─── İki gösterge arasındaki ilişki adayları ────────────────────────────────────────────────────────────
export type ReceptionFn = (guestLon: number, host: ClassicalPlanet) => string[];

export type PairAnalysis = {
  a: ClassicalPlanet;
  b: ClassicalPlanet;
  now: AspectNow;
  /** a–b'nin ufuk içindeki ilk kesinleşmesi (herhangi bir Ptolemaik açı). */
  perfection: (Perfection & { signChangeBefore: Body[]; stationsBefore: Station[] }) | null;
  /** Şu an yaklaşılan açı kesinleşmeden geri dönüyorsa: en küçük uzaklık ve önündeki istasyon (CA s. 111 "Refrenation"). */
  refranation: { minOrb: number; atUtc: string; stations: Station[] } | null;
  /** a ya da b'nin, a–b kesinleşmesinden ÖNCE üçüncü bir gezegenle kesinleşmesi (ufuk içinde a–b kesinleşmesi YOKSA boş). Sınıf: üçüncü gezegen yaklaşıyorsa
   *  "prohibition" (CA s. 110–111), yavaş gösterge kendisi başka gezegene yaklaşıyorsa "frustration" (CA s. 112), hızlı gösterge
   *  önce başka gezegene ulaşıyorsa "faster_significator_elsewhere" (Lilly ad vermez; yalnız olay). */
  /** H-04-03: tek taraflı olmayan (karşılıklı / istasyon) ya da Lilly türü çözülemeyen olaylar "unresolved" olur; isim UYDURULMAZ. */
  interpositions: (Perfection & {
    significator: ClassicalPlanet;
    third: Body;
    kind: "prohibition" | "frustration" | "faster_significator_elsewhere" | "unresolved";
    unresolvedReason: null | "event_mutual" | "event_station" | "event_superior_overtakes_inferior" | "ab_perfection_not_one_sided";
  })[];
  translations: {
    by: ClassicalPlanet;
    from: ClassicalPlanet;
    to: ClassicalPlanet;
    separatedAt: string;
    joinsAt: string;
    /**
     * H-08: olay dizisinin durumu. CA s. 111 "separates … and presently joynes", s. 125 "before he meeteth with the ☌ or aspect of
     * any other planet" → ayrılma ile birleşme ARASINDA (soru anından önce ve sonra) aktaranın başka klasik gezegenle kesinleşmesi
     * olmamalı.
     *  valid          — kesinti yok; klasik koşullar ayrıca değerlendirilir (introduction / judgement);
     *  interrupted    — arada en az bir kesinleşme var (kanıt `interruptions`); yalnız bilgi kaydı, aktarım DEĞİL;
     *  order_uncertain — bir temasın ayrılma/birleşmeye göre sırası zaman belirsizliği içinde; geçerlilik üretilmez;
     *  motion_uncertain — birleşmede aktaran noktaya doğru hareket etmiyor ya da istasyonda; geçerlilik üretilmez.
     */
    status: "valid" | "interrupted" | "order_uncertain" | "motion_uncertain";
    /** Ayrılma ile birleşme arasındaki diğer kesinleşmeler (kanıt); ayrılma/birleşmeye belirsizlik payı içinde yakın temaslar dışarıda kalsa da dahil. `orderUncertain`: sırası belirsizlik payı içinde. */
    interruptions: { with: ClassicalPlanet; angle: number; atUtc: string; orderUncertain: boolean }[];
    /** CA s. 111: hafif gezegen ağır olandan ayrılır ve "presently" daha ağır olana kavuşur (açıyla da olur). Yalnız status=valid iken true olabilir. */
    introduction: boolean;
    /** CA s. 125: ek olarak göstergeler birbirinden ayrılmış olmalı ve aktaran, ayrıldığı göstergece (ev/üçlü/terim) kabul edilmeli. */
    judgement: { significatorsSeparated: boolean; receivedBy: string[]; ok: boolean };
  }[];
  collections: {
    by: ClassicalPlanet;
    aAt: string;
    bAt: string;
    /** CA s. 126: göstergeler birbirine bakmaz, ikisi de daha ağır bir gezegene açı yapar ve ikisi de onu asaletlerinde kabul eder. */
    receivedByA: string[];
    receivedByB: string[];
    significatorsNotAspecting: boolean;
    ok: boolean;
  }[];
};

/**
 * `horizonDays`: a–b kesinleşmesinin aranacağı ufuk (gün). Lilly bir sınır yazmaz; yavaş çiftlerde (Satürn–Jüpiter) yıllar sürer →
 * ufuk dışı = "ufuk içinde kesinleşme yok" (HÜKÜM DEĞİL). `receives(guestLon, host)`: host'un guest'in bulunduğu yerdeki asaletleri.
 */
export function analyzePair(a: ClassicalPlanet, b: ClassicalPlanet, ms: number, horizonDays: number, receives: ReceptionFn, orbs: Readonly<Record<ClassicalPlanet, number>> = LILLY_ORB): PairAnalysis {
  const t1 = ms + horizonDays * DAY;
  const now = aspectNow(a, b, ms, orbs);
  const perfs = findPerfections(a, b, ms, t1);
  const first = perfs[0] ?? null;
  const limit = first ? first.ms : t1;
  const stationsUntil = (t: number) => [...findStations(a, ms, t), ...findStations(b, ms, t)].sort((x, y) => x.ms - y.ms);
  const perfection = first
    ? {
        ...first,
        signChangeBefore: [a, b].filter((x) => signOf(lonAt(x, ms)) !== signOf(lonAt(x, first.ms))) as Body[],
        stationsBefore: stationsUntil(first.ms),
      }
    : null;

  // Refranation: şu an yaklaşılan hedef açı, kesinleşmeden önce yerel minimuma ulaşıp açılıyorsa.
  let refranation: PairAnalysis["refranation"] = null;
  if (now.applying) {
    const targets = now.angle === 0 || now.angle === 180 ? [now.angle] : [now.angle, 360 - now.angle];
    const tg = targets.reduce((m, x) => (Math.abs(wrap180(n360(lonAt(a, ms) - lonAt(b, ms)) - x)) < Math.abs(wrap180(n360(lonAt(a, ms) - lonAt(b, ms)) - m)) ? x : m));
    const g = (t: number) => Math.abs(wrap180(lonAt(a, t) - lonAt(b, t) - tg));
    const step = stepFor(a, b);
    let prev = g(ms);
    let reached = false;
    for (let t = ms + step; t <= t1; t += step) {
      const cur = g(t);
      const sameTargetPerfected = perfs.some((p) => p.ms <= t && (p.angle === now.angle));
      if (sameTargetPerfected) {
        reached = true;
        break;
      }
      if (cur > prev) {
        const st = stationsUntil(t);
        if (st.length > 0) refranation = { minOrb: prev, atUtc: iso(t - step), stations: st };
        break;
      }
      prev = cur;
    }
    if (reached) refranation = null;
  }

  // Araya girenler: a–b kesinleşmesinden önce a ya da b'nin diğer klasik gezegenlerle kesinleşmeleri.
  // CA s. 112 hüsran: "a swift Planet would corporally joyne with a more ponderous" → hızlı gösterge = a–b kesinleşmesinde YAKLAŞAN
  // gösterge (`first.applier`). H-04-03: a–b kesinleşmesi tek taraflı değilse (karşılıklı / istasyon) ya da Lilly türü çözülemiyorsa
  // "hızlı gösterge" yoktur → hüsran ile "hızlı göstergenin başkasına ulaşması" ayrımı yapılamaz (unresolved).
  const abOneSided = first !== null && (first.approach === "a" || first.approach === "b") && (first.lillyApplication === "direct_swifter_to_slower" || first.lillyApplication === "both_retrograde");
  const fasterSig = abOneSided ? (first!.applier as ClassicalPlanet) : null;
  const interpositions: PairAnalysis["interpositions"] = [];
  for (const sig of first ? [a, b] : []) {
    for (const c of CLASSICAL_PLANETS) {
      if (c === a || c === b) continue;
      for (const p of findPerfections(sig, c, ms, limit)) {
        let kind: PairAnalysis["interpositions"][number]["kind"];
        let unresolvedReason: PairAnalysis["interpositions"][number]["unresolvedReason"] = null;
        if (p.approach === "mutual") unresolvedReason = "event_mutual";
        else if (p.approach === "none" || p.lillyApplication === "station_unresolved") unresolvedReason = "event_station";
        else if (p.lillyApplication === "superior_overtakes_inferior_unresolved") unresolvedReason = "event_superior_overtakes_inferior";
        if (unresolvedReason) kind = "unresolved";
        else if (p.applier === c) kind = "prohibition";
        else if (fasterSig === null) {
          kind = "unresolved";
          unresolvedReason = "ab_perfection_not_one_sided";
        } else kind = sig === fasterSig ? "faster_significator_elsewhere" : "frustration";
        interpositions.push({ ...p, significator: sig, third: c, kind, unresolvedReason });
      }
    }
  }
  interpositions.sort((x, y) => x.ms - y.ms);

  // Işık aktarımı (H-08): c'nin `from` ile soru anından önceki SON kesinleşmesi (ayrılma) ve `to` ile soru anından sonraki İLK
  // kesinleşmesi (birleşme); ikisi arasındaki bütün aralıkta c'nin diğer klasik gezegenlerle kesinleşmeleri kesinti sayılır.
  // Önceki sürüm yalnız soru anından SONRAKİ ilk temasa bakıyordu; ayrılma ile soru anı arasındaki temaslar gözden kaçıyordu.
  const translations: PairAnalysis["translations"] = [];
  const back = ms - 30 * DAY;
  const lastAB = findPerfections(a, b, back, ms).at(-1) ?? null;
  for (const c of CLASSICAL_PLANETS) {
    if (c === a || c === b) continue;
    const allC = CLASSICAL_PLANETS.filter((x) => x !== c).flatMap((x) => findPerfections(c, x, back, t1)).sort((x, y) => x.ms - y.ms);
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const sep = allC.filter((p) => p.b === from && p.ms <= ms).at(-1);
      const join = allC.find((p) => p.b === to && p.ms > ms);
      if (!sep || !join) continue;
      const near = (p: Perfection, q: Perfection) => Math.abs(p.ms - q.ms) <= (p.uncertaintySec + q.uncertaintySec) * 1000;
      // Ayrılmadan hemen ÖNCE ya da birleşmeden hemen SONRA olup belirsizlik payı içinde kalan temas da arada olabilir (sırası
      // kesin değil) → aday sayılır; aksi hâlde sırası belirlenemeyen dizi geçerli aktarım olarak gösterilirdi (2025-04-21 ☽☍♂ / ☽□☉, 5 sn).
      const between = allC.filter((p) => p !== sep && p !== join && ((p.ms > sep.ms && p.ms < join.ms) || near(p, sep) || near(p, join)));
      const interruptions = between.map((p) => ({ with: p.b as ClassicalPlanet, angle: p.angle, atUtc: p.atUtc, orderUncertain: near(p, sep) || near(p, join) }));
      // Birleşmede aktaran noktaya doğru hareket etmeli ("joynes"); istasyon / yalnız `to`'nun hareketi → belirsiz.
      const cApplies = join.aToward && join.lillyApplication !== "station_unresolved";
      const status: PairAnalysis["translations"][number]["status"] = interruptions.some((x) => !x.orderUncertain)
        ? "interrupted"
        : interruptions.length > 0
          ? "order_uncertain"
          : !cApplies
            ? "motion_uncertain"
            : "valid";
      // Ağırlık şartı (s. 111): aktaran, ayrıldığı ve kavuşacağı göstergeden daha hafif.
      const introduction = status === "valid" && heavier(from, c) && heavier(to, c);
      const separated = !now.applying && lastAB !== null;
      const receivedBy = receives(lonAt(c, ms), from).filter((k) => k === "domicile" || k === "triplicity" || k === "participating" || k === "term");
      translations.push({
        by: c,
        from,
        to,
        separatedAt: sep.atUtc,
        joinsAt: join.atUtc,
        status,
        interruptions,
        introduction,
        judgement: { significatorsSeparated: separated, receivedBy, ok: introduction && separated && receivedBy.length > 0 },
      });
    }
  }

  // Işık toplanması: a ve b'nin ikisi de daha ağır c'ye yaklaşıyor (ufuk içinde kesinleşme).
  const collections: PairAnalysis["collections"] = [];
  for (const c of CLASSICAL_PLANETS) {
    if (c === a || c === b || !(heavier(c, a) && heavier(c, b))) continue;
    const pa = findPerfections(a, c, ms, t1)[0];
    const pb = findPerfections(b, c, ms, t1)[0];
    // CA s. 126: göstergeler ağır gezegene açı "yaparlar" → her gösterge kendi kesinleşmesinde o noktaya DOĞRU hareket etmeli
    // (H-04-03: karşılıklı yaklaşma da sayılır; yalnız ağır gezegenin hareketiyle oluşan kesinleşme sayılmaz).
    if (!pa || !pb || !pa.aToward || !pb.aToward) continue;
    const receivedByA = receives(lonAt(c, ms), a);
    const receivedByB = receives(lonAt(c, ms), b);
    const notAspecting = !(now.applying && now.withinMoieties);
    collections.push({ by: c, aAt: pa.atUtc, bAt: pb.atUtc, receivedByA, receivedByB, significatorsNotAspecting: notAspecting, ok: notAspecting && receivedByA.length > 0 && receivedByB.length > 0 });
  }

  return { a, b, now, perfection, refranation, interpositions, translations, collections };
}

export const WEIGHT = WEIGHT_ORDER;
