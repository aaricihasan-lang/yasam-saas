/**
 * scripts/cosmic-longrange/jpl_cmp.ts
 * production getPlanetLongitude (lib/cosmic/aspects.ts; planets.ts ile aynı AE formülü)
 * vs NASA/JPL Horizons DE441 (görünür, yer merkezli, tarihin ekliptiği), AYNI TT anında (ΔT eşitlenmiş).
 * Yalnız 2026-01-01…2100-12-31 satırları değerlendirilir. Kabul: ≤60″ (AE belgelenmiş ±1′).
 * Kullanım: npx tsx scripts/cosmic-longrange/jpl_cmp.ts <jplDir> <out.json>
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as AE from "astronomy-engine";
import { getPlanetLongitude, type AspectBody } from "../../lib/cosmic/aspects";

const JPL = path.resolve(process.argv[2]!);
const MAP: Record<string, AspectBody> = {
  sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars",
  jupiter: "Jüpiter", saturn: "Satürn", uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton",
};
const MON: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const wrap = (d: number) => ((d + 180) % 360 + 360) % 360 - 180;
type Agg = { n: number; max: number; sum: number; maxAt: string; signMis: number; signMisDetail: string[]; byEra: Record<string, number> };
const res: Record<string, Agg> = {};
for (const fn of fs.readdirSync(JPL).filter(f => f.endsWith(".csv")).sort()) {
  const body = fn.split("_")[0]!;
  const key = MAP[body]!;
  const a = (res[body] ??= { n: 0, max: 0, sum: 0, maxAt: "", signMis: 0, signMisDetail: [], byEra: {} });
  for (const line of fs.readFileSync(path.join(JPL, fn), "utf8").trim().split("\n")) {
    const [ts, lonS] = line.split(",");
    const m = /(\d+)-(\w+)-(\d+) (\d+):(\d+)/.exec(ts!)!;
    const ttMs = Date.UTC(+m[1]!, MON[m[2]!]!, +m[3]!, +m[4]!, +m[5]!);
    const ttDays = (ttMs - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
    // AE'nin kendi ΔT modeliyle UT'yi bul → production fonksiyonu tam bu TT'de değerlendirilir
    let ms = ttMs - 70_000;
    for (let i = 0; i < 4; i++) { const t = AE.MakeTime(new Date(ms)); ms -= (t.tt - ttDays) * 86_400_000; }
    const lon = getPlanetLongitude(key, new Date(ms));
    const ref = Number(lonS);
    const d = Math.abs(wrap(lon - ref)) * 3600;
    a.n++; a.sum += d;
    if (d > a.max) { a.max = d; a.maxAt = ts!; }
    if (m[1]! > "2100") continue;
    const era = m[1]! < "2051" ? "2026-2050" : m[1]! < "2076" ? "2051-2075" : m[1]! < "2100" ? "2076-2099" : "2100";
    a.byEra[era] = Math.max(a.byEra[era] ?? 0, d);
    if (Math.floor(lon / 30) !== Math.floor(ref / 30)) {
      a.signMis++;
      if (a.signMisDetail.length < 10) a.signMisDetail.push(`${ts} prod=${lon.toFixed(5)} jpl=${ref.toFixed(5)}`);
    }
  }
}
const out: Record<string, unknown> = {};
let total = 0;
for (const [b, a] of Object.entries(res)) {
  total += a.n;
  out[b] = { n: a.n, max_arcsec: +a.max.toFixed(2), mean_arcsec: +(a.sum / a.n).toFixed(2), maxAt_TT: a.maxAt,
    maxByEra_arcsec: Object.fromEntries(Object.entries(a.byEra).map(([k, v]) => [k, +v.toFixed(2)])), signMismatch: a.signMis, signMisDetail: a.signMisDetail };
}
const maxAll = Math.max(...Object.values(out).map(o => (o as { max_arcsec: number }).max_arcsec));
fs.writeFileSync(path.resolve(process.argv[3]!), JSON.stringify({ total, max_arcsec_all: maxAll, PASS: maxAll <= 60, bodies: out }, null, 1));
console.log("JPL max arcsec (tüm cisimler, TT eşitlenmiş):", maxAll, maxAll <= 60 ? "PASS" : "FAIL");
if (maxAll > 60) process.exitCode = 1;
console.log("JPL comparisons:", total);
for (const [b, o] of Object.entries(out)) console.log(b, JSON.stringify(o));
