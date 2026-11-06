// Gökyüzü Atlası — İleri Transit: MONOTON PARÇA + SEVİYE KESİŞİMİ çekirdeği (SAF; ÜRÜNE BAĞLI DEĞİL).
//
// Fikir: açısal fark d(t) (bir gövde ile sabit natal nokta ya da iki gövde arası) yalnız göreli hız g(t) = d′(t) işaret
// değiştirdiğinde yön değiştirir. g'nin bütün işaret değişimleri bulunursa [t0, t1] aralığı d'nin MONOTON olduğu parçalara
// bölünür ve her parçada her hedef seviye (kesin açı, orb sınırları, burç sınırı) EN FAZLA BİR KEZ kesilir → ikiye bölme ile
// kesin kök. Kaba günlük örneklemeyle olay kaçırma riski böylece ortadan kalkar.
//
// g'nin işaret değişimini kaçırmama: |g′| ≤ A (derece/gün², gövde ivme üst sınırlarının toplamı). Bir [a, b] aralığında g'nin
// sıfırı varsa |g(a)| + |g(b)| ≤ A·(b − a) olmak ZORUNDADIR. Bu eşitsizlik sağlanmıyorsa aralıkta sıfır yoktur; sağlanıyorsa
// aralık ikiye bölünerek MIN_SPLIT_MS'e kadar incelenir. İki sıfırın MIN_SPLIT_MS (10 dk) içine düştüğü durumda d'nin monoton
// olmayan sapması ≤ A·Δ²/8 (Merkür+Güneş için < 0,01″) — efemeris hatasının (≈20″) çok altında, sonucu değiştirmez.

const DAY = 86_400_000;
export const MIN_SPLIT_MS = 10 * 60_000;
export const ROOT_TOL_MS = 1000;
export const wrap180 = (x: number) => ((((x + 180) % 360) + 360) % 360) - 180;
export const n360 = (x: number) => ((x % 360) + 360) % 360;

/** f'nin [lo, hi] içindeki tek kökü (işaret değişimi varsayılır), ≤ ROOT_TOL_MS. */
export function bisect(f: (ms: number) => number, lo: number, hi: number): number {
  let flo = f(lo);
  if (flo === 0) return lo;
  for (let i = 0; i < 64 && hi - lo > ROOT_TOL_MS; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

/**
 * g'nin [t0, t1] içindeki İŞARET DEĞİŞİMİ anları (artan sırada). `accelBound` = |g′| üst sınırı (derece/gün²).
 * İşaret değiştirmeyen değmeler (d'nin büküm noktası) monotonluğu bozmadığı için döndürülmez.
 */
export function signChanges(g: (ms: number) => number, accelBound: number, t0: number, t1: number, gridMs = DAY): number[] {
  const out: number[] = [];
  const visit = (a: number, ga: number, b: number, gb: number) => {
    const span = b - a;
    const mayHaveZero = Math.abs(ga) + Math.abs(gb) <= accelBound * (span / DAY) * 1.0000001;
    const flips = Math.sign(ga) !== Math.sign(gb) && ga !== 0 && gb !== 0;
    if (!mayHaveZero && !flips) return;
    if (span <= MIN_SPLIT_MS) {
      if (flips) out.push(bisect(g, a, b));
      return;
    }
    // Tam sıfıra denk gelen orta nokta işaret bilgisini yok eder → 1 ms kaydır (sonuç ≤ ROOT_TOL_MS içinde değişmez).
    let m = a + span / 2;
    let gm = g(m);
    if (gm === 0) {
      m += 1;
      gm = g(m);
    }
    visit(a, ga, m, gm);
    visit(m, gm, b, gb);
  };
  let a = t0;
  let ga = g(a);
  while (a < t1) {
    let b = Math.min(a + gridMs, t1);
    let gb = g(b);
    if (gb === 0 && b < t1) {
      b += 1;
      gb = g(b);
    }
    visit(a, ga, b, gb);
    a = b;
    ga = gb;
  }
  // Izgara noktasına tam denk gelen sıfır iki komşu aralıkta bulunabilir → 2 sn içindeki tekrarları birleştir.
  out.sort((x, y) => x - y);
  return out.filter((t, i) => i === 0 || t - out[i - 1] > 2 * ROOT_TOL_MS);
}

/** Bir seviye kesişimi: `level` = hedef boylam farkı (mod 360), `dir` = kesişimdeki d yönü (+1 artan, −1 azalan). */
export type Crossing = { ms: number; level: number; dir: 1 | -1 };

/**
 * d(t) (−180…180 ya da 0…360 sarmalı fark) için [t0, t1] içinde `levels` (derece, mod 360) kesişimleri.
 * `turns` = g'nin işaret değişimleri (signChanges); aralık bunlarla monoton parçalara ayrılır. Izgara adımı, d'nin bir adımda
 * 180°'den az değişmesini sağlayacak kadar küçük olmalıdır (çağıran garanti eder; Ay için 1 gün ≈ 15°).
 */
export function levelCrossings(d: (ms: number) => number, turns: readonly number[], levels: readonly number[], t0: number, t1: number, gridMs = DAY): Crossing[] {
  const cuts = new Set<number>([t0, t1, ...turns.filter((t) => t > t0 && t < t1)]);
  for (let t = t0 + gridMs; t < t1; t += gridMs) cuts.add(t);
  const pts = [...cuts].sort((x, y) => x - y);
  const out: Crossing[] = [];
  let da = d(pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const db = d(b);
    const delta = wrap180(db - da); // |delta| < 180 (ızgara koşulu) → a..b arası yerel sürekli fark
    if (delta !== 0) {
      const dir: 1 | -1 = delta > 0 ? 1 : -1;
      const lo = Math.min(0, delta);
      const hi = Math.max(0, delta);
      for (const L of levels) {
        // L'nin da'ya göre yerel ofseti (−360…360 aralığında olası iki temsil).
        const base = wrap180(L - da);
        for (const off of [base, base + 360, base - 360]) {
          // Yarı açık aralık: başlangıçta tam seviyede ise önceki parçaya aittir (çift sayımı önler).
          const inside = dir > 0 ? off > lo && off <= hi : off >= lo && off < hi;
          if (!inside) continue;
          const f = (ms: number) => wrap180(d(ms) - da) - off;
          out.push({ ms: bisect(f, a, b), level: n360(L), dir });
        }
      }
    }
    da = db;
  }
  return out.sort((x, y) => x.ms - y.ms);
}

/** [a, b] içinde |wrap180(d − T)| en küçük olan an (altın oran araması; d parça içinde monoton değilse uç değer civarı). */
export function closestTo(d: (ms: number) => number, T: number, a: number, b: number): { ms: number; sep: number } {
  const phi = (Math.sqrt(5) - 1) / 2;
  const e = (ms: number) => Math.abs(wrap180(d(ms) - T));
  let lo = a;
  let hi = b;
  let x1 = hi - phi * (hi - lo);
  let x2 = lo + phi * (hi - lo);
  let f1 = e(x1);
  let f2 = e(x2);
  for (let i = 0; i < 80 && hi - lo > ROOT_TOL_MS; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - phi * (hi - lo);
      f1 = e(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + phi * (hi - lo);
      f2 = e(x2);
    }
  }
  const ms = (lo + hi) / 2;
  return { ms, sep: e(ms) };
}
