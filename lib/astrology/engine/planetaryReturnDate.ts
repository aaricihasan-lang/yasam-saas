// Astroloji — GEZEGEN DÖNÜŞÜ için DÖNÜŞ SEÇİMİ yardımcısı (SAF; mevcut astronomy-engine). lunarReturnDate.ts deseninin aynısı.
//
// Sağlayıcı (POST /astrology/planetary-returns) "approximateDate"e EN YAKIN kavuşumu hesaplar (belge: "during a retrograde loop the
// planet crosses its natal degree up to three times and the crossing nearest the date is the one returned"). Retro döngüsünde aynı
// dönüş kümesinde 2–3 kavuşum olabilir (Merkür / Venüs / Mars / Jüpiter / Satürn). Yaşam SAHTE SEÇİM YAPMAZ: uzmanın verdiği hedef
// tarihe en yakın DÖNÜŞ KÜMESİNİN TÜM kavuşumları sıralanır (1., 2., 3. kavuşum; doğrudan / geri hareketle); uzman hangisini istediğini
// seçer → seçilen kavuşumun UTC günü sağlayıcıya gider (o güne en yakın kavuşum = seçilen kavuşum) ve sağlayıcının döndürdüğü an
// seçilen kavuşumla karşılaştırılır (uyuşmazsa sonuç KAYDEDİLMEZ).
//
// Kesin dönüş anını ve haritayı SAĞLAYICI hesaplar (bu ikinci bir hesap motoru değildir; yalnız tarih seçimi + sağlayıcı yanıtının
// seçilen kavuşuma ait olduğunun denetimi). Deterministiktir. Boylam: görünür geosantrik, gerçek ekliptik (ışık zamanı + aberasyon).

import * as Astronomy from "astronomy-engine";
import type { PlanetaryReturnPlanet } from "../model/westernPlanetaryReturn";

export { PLANETARY_RETURN_PLANETS, PLANETARY_RETURN_PROVIDER_NAME, isPlanetaryReturnPlanet, type PlanetaryReturnPlanet } from "../model/westernPlanetaryReturn";

const BODY: Record<PlanetaryReturnPlanet, Astronomy.Body> = {
  saturn: Astronomy.Body.Saturn,
  jupiter: Astronomy.Body.Jupiter,
  mars: Astronomy.Body.Mars,
  venus: Astronomy.Body.Venus,
  mercury: Astronomy.Body.Mercury,
};

/**
 * Tarama parametreleri (gün): adım, arama yarıçapı (en yakın kavuşumu her hedef tarihten bulacak kadar geniş) ve küme aralığı
 * (aynı retro döngüsünün kavuşumları bu süreden kısa aralıklıdır; ardışık dönüşler bundan çok uzundur).
 *   Satürn ~29,5 yıl / döngü ≤ ~10 ay · Jüpiter ~11,9 yıl / döngü ≤ ~8 ay · Mars ~1,9–2,2 yıl / döngü ≤ ~4 ay ·
 *   Venüs ~1 yıl (geosantrik; Güneş'e bağlı) / döngü ≤ ~3 ay · Merkür ~1 yıl (geosantrik) / döngü ≤ ~6 hafta.
 */
const SCAN: Record<PlanetaryReturnPlanet, { stepDays: number; radiusDays: number; clusterGapDays: number }> = {
  saturn: { stepDays: 2, radiusDays: 6600, clusterGapDays: 400 },
  jupiter: { stepDays: 1, radiusDays: 2800, clusterGapDays: 330 },
  mars: { stepDays: 1, radiusDays: 900, clusterGapDays: 250 },
  venus: { stepDays: 0.5, radiusDays: 560, clusterGapDays: 150 },
  mercury: { stepDays: 0.5, radiusDays: 480, clusterGapDays: 90 },
};

function lonAt(planet: PlanetaryReturnPlanet, ms: number): number {
  return Astronomy.Ecliptic(Astronomy.GeoVector(BODY[planet], Astronomy.MakeTime(new Date(ms)), true)).elon;
}

/** Doğum UTC anındaki natal gezegen boylamı (yalnız tarih seçimi / denetim için). */
export function natalPlanetLongitude(planet: PlanetaryReturnPlanet, birthUtcIso: string): number {
  return lonAt(planet, Date.parse(birthUtcIso));
}

/** Verilen UTC anındaki geosantrik görünür boylam (yalnız bağımsız doğrulama / test). */
export function planetLongitudeAt(planet: PlanetaryReturnPlanet, utcIso: string): number {
  return lonAt(planet, Date.parse(utcIso.length === 16 ? `${utcIso}:00Z` : utcIso));
}

export type PlanetaryReturnCrossing = {
  /** Küme içindeki sıra (1 = ilk kavuşum). */
  crossing: number;
  /** Kümedeki kavuşum sayısı (1 = retro döngüsü yok; 2–3 = retro döngüsü). */
  of: number;
  /** Yaklaşık kesin kavuşum anı (UTC, dakika) — yalnız gösterim ve sağlayıcı yanıtı denetimi için. */
  approxUtc: string;
  /** Kavuşum anındaki hareket yönü (geri = retro). */
  motion: "direct" | "retrograde";
  /** Sağlayıcıya gönderilecek gün (YYYY-MM-DD, UTC) — önbellek anahtarına girer. */
  requestDate: string;
  /** Seçilen kavuşumun komşu kavuşumlara uzaklığının yarısı (dk; en çok 36 saat) — yanıt denetimi toleransı. */
  toleranceMinutes: number;
};

const DAY = 86_400_000;

/** [fromMs, toMs] aralığındaki tüm kavuşumlar (ikiye bölmeyle dakikaya). */
function crossingsBetween(planet: PlanetaryReturnPlanet, natalLon: number, fromMs: number, toMs: number): { ms: number; motion: "direct" | "retrograde" }[] {
  const step = SCAN[planet].stepDays * DAY;
  const diff = (t: number) => ((lonAt(planet, t) - natalLon + 540) % 360) - 180;
  const out: { ms: number; motion: "direct" | "retrograde" }[] = [];
  let prevT = fromMs;
  let prev = diff(prevT);
  for (let t = fromMs + step; t <= toMs; t += step) {
    const cur = diff(t);
    // İşaret değişimi ve ±180° sarma değil (gezegen bir adımda en çok birkaç derece yol alır).
    if (((prev < 0 && cur >= 0) || (prev >= 0 && cur < 0)) && Math.abs(cur - prev) < 90) {
      const rising = prev < 0;
      let lo = prevT;
      let hi = t;
      for (let i = 0; i < 40 && hi - lo > 20_000; i++) {
        const mid = (lo + hi) / 2;
        if (diff(mid) < 0 === rising) lo = mid;
        else hi = mid;
      }
      out.push({ ms: Math.round(((lo + hi) / 2) / 60_000) * 60_000, motion: rising ? "direct" : "retrograde" });
    }
    prev = cur;
    prevT = t;
  }
  return out;
}

/**
 * approxDate'e ("YYYY-MM-DD", UTC gece yarısı) EN YAKIN kavuşumun ait olduğu DÖNÜŞ KÜMESİNİN tüm kavuşumları (zaman sırasıyla).
 * Geçersiz tarih → [].
 */
export function planetaryReturnCluster(planet: PlanetaryReturnPlanet, natalLon: number, approxDate: string): PlanetaryReturnCrossing[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(approxDate)) return [];
  const center = Date.parse(`${approxDate}T00:00:00Z`);
  if (!Number.isFinite(center)) return [];
  const s = SCAN[planet];
  const all = crossingsBetween(planet, natalLon, center - (s.radiusDays + 2 * s.clusterGapDays) * DAY, center + (s.radiusDays + 2 * s.clusterGapDays) * DAY);
  if (all.length === 0) return [];
  let nearest = 0;
  for (let i = 1; i < all.length; i++) if (Math.abs(all[i].ms - center) < Math.abs(all[nearest].ms - center)) nearest = i;
  let a = nearest;
  let b = nearest;
  while (a > 0 && all[a].ms - all[a - 1].ms <= s.clusterGapDays * DAY) a -= 1;
  while (b < all.length - 1 && all[b + 1].ms - all[b].ms <= s.clusterGapDays * DAY) b += 1;
  const cluster = all.slice(a, b + 1);
  return cluster.map((c, i) => {
    const gaps = [i > 0 ? c.ms - cluster[i - 1].ms : Infinity, i < cluster.length - 1 ? cluster[i + 1].ms - c.ms : Infinity];
    const tol = Math.min(36 * 60, Math.floor(Math.min(...gaps) / 2 / 60_000));
    const iso = new Date(c.ms).toISOString();
    return { crossing: i + 1, of: cluster.length, approxUtc: iso.slice(0, 16), motion: c.motion, requestDate: iso.slice(0, 10), toleranceMinutes: tol };
  });
}

/**
 * 2026-10-22 — "Önceki dönüş / Sonraki dönüş" kısayolu (owner): hedef tarihin dönüş KÜMESİNDEN önceki ve sonraki kümenin İLK
 * kavuşumunun UTC günü. Kısayol yalnız hedef tarihi bu güne taşır; o kümenin TÜM kavuşumları (retro döngüsünde 2–3) yine
 * listelenir ve uzman seçer → retro kavuşumları atlanmaz. Yalnız tarih seçimi (ücretli istek yok); bulunamazsa null.
 */
const NEIGHBOR_WINDOW_DAYS: Record<PlanetaryReturnPlanet, number> = { saturn: 11_800, jupiter: 4_800, mars: 1_100, venus: 800, mercury: 600 };

export function planetaryReturnNeighbors(
  planet: PlanetaryReturnPlanet,
  natalLon: number,
  approxDate: string,
  /** Aynı (gezegen, natal, tarih) için zaten hesaplanmış küme (yeniden taramayı önler; sonuç aynı). */
  cluster: PlanetaryReturnCrossing[] = planetaryReturnCluster(planet, natalLon, approxDate),
): { previous: string | null; next: string | null } {
  if (cluster.length === 0) return { previous: null, next: null };
  const first = Date.parse(`${cluster[0].approxUtc}:00Z`);
  const last = Date.parse(`${cluster[cluster.length - 1].approxUtc}:00Z`);
  const win = NEIGHBOR_WINDOW_DAYS[planet] * DAY;
  const gap = SCAN[planet].clusterGapDays * DAY;
  // Önceki küme: pencerede bulunan son kavuşumdan geriye, küme aralığı içinde kalan ilk kavuşum (planetaryReturnCluster ile aynı gruplama).
  const before = crossingsBetween(planet, natalLon, first - win, first - 12 * 3_600_000);
  let i = before.length - 1;
  while (i > 0 && before[i].ms - before[i - 1].ms <= gap) i -= 1;
  const after = crossingsBetween(planet, natalLon, last + 12 * 3_600_000, last + win);
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { previous: i >= 0 && before.length ? day(before[i].ms) : null, next: after.length ? day(after[0].ms) : null };
}
