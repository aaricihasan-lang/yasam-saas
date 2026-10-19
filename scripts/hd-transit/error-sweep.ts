/**
 * HD TRANSİT — yerel motor (astronomy-engine) ↔ Swiss Ephemeris yoğun hata ölçümü (ücretsiz; Roxy çağrısı YOK).
 *   python scripts/hd-transit/swiss-ephemeris-sweep.py <ephe> 20000 <sweep.json>
 *   npx tsx scripts/hd-transit/error-sweep.ts <sweep.json>
 * Çıktı: cisim × dönem için |yerel − SE| yay-saniye p50 / p99 / max; ayrıca yerel ↔ SE kapı.çizgi uyuşmazlık sayısı.
 */
import { readFileSync } from "node:fs";
import { AstronomyEnginePlanetLongitudeProvider } from "../../lib/human-design/engine/ae-provider";
import { dateToJulianDay } from "../../lib/human-design/engine/julian";
import { longitudeToGateLine } from "../../lib/human-design/engine/mandala";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { CHANNELS } from "../../lib/human-design/engine/channels";

const j = JSON.parse(readFileSync(process.argv[2], "utf8")) as { utcMs: number[]; lon: Record<string, number[]> };
const p = new AstronomyEnginePlanetLongitudeProvider();
const bodies = Object.keys(j.lon);
const ERAS: Array<[string, number, number]> = [["1900–1949", 1900, 1950], ["1950–1999", 1950, 2000], ["2000–2030", 2000, 2031], ["2031–2060", 2031, 2061], ["2061–2100", 2061, 2101]];
const stat: Record<string, Record<string, number[]>> = {};
const glMismatch: Record<string, number> = {};
j.utcMs.forEach((ms, i) => {
  const y = new Date(ms).getUTCFullYear();
  const era = ERAS.find((e) => y >= e[1] && y < e[2])![0];
  const pos = p.getLongitudes(dateToJulianDay(new Date(ms)));
  for (const b of bodies) {
    const l = pos.find((x) => x.planet === b)!.longitude;
    const s = j.lon[b][i];
    ((stat[b] ??= {})[era] ??= []).push(Math.abs(((((l - s) % 360) + 540) % 360) - 180) * 3600);
    const a = longitudeToGateLine(l);
    const r = longitudeToGateLine(s);
    if (a.gate !== r.gate || a.line !== r.line) glMismatch[b] = (glMismatch[b] ?? 0) + 1;
  }
});
// GÖSTERİLEN sonuç (belirsizlik korumalı computeGeneralTransit) ↔ SE gerçeği
let certain = 0, certainWrong = 0, uncertain = 0, notInCands = 0, momentsUncertain = 0, chanWrong = 0, centerWrong = 0;
const SEB: Record<string, string> = { Earth: "Sun", SouthNode: "NorthNode" };
j.utcMs.forEach((ms, i) => {
  const t = computeGeneralTransit(new Date(ms));
  if (t.hasUncertainty) momentsUncertain++;
  const truth = new Set<number>();
  for (const a of t.activations) {
    const base = j.lon[SEB[a.body] ?? a.body][i];
    const r = longitudeToGateLine(SEB[a.body] ? base + 180 : base);
    truth.add(r.gate);
    if (a.certain) { certain++; if (a.gate !== r.gate || a.line !== r.line) certainWrong++; }
    else { uncertain++; if (![`${a.gate}.${a.line}`, `${a.alternative!.gate}.${a.alternative!.line}`].includes(`${r.gate}.${r.line}`)) notInCands++; }
  }
  const truthCh = CHANNELS.filter((c) => truth.has(c.gateA) && truth.has(c.gateB)).map((c) => c.id);
  const cert = t.channels.map((c) => c.id), poss = t.possibleChannels.map((c) => c.id);
  if (cert.some((x) => !truthCh.includes(x)) || truthCh.some((x) => !cert.includes(x) && !poss.includes(x))) chanWrong++;
  const tc = new Set(CHANNELS.filter((c) => truthCh.includes(c.id)).flatMap((c) => [c.centerA, c.centerB]));
  if (t.definedCenters.some((c) => !tc.has(c)) || t.openCenters.some((c) => tc.has(c))) centerWrong++;
});
const q = (a: number[], f: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
console.log(`${j.utcMs.length} an (1900–2100). |yerel − Swiss Ephemeris| yay-saniye\n`);
console.log("| cisim | dönem | p50 | p99 | max |\n|---|---|---|---|---|");
for (const b of bodies) for (const [era] of ERAS) { const a = stat[b][era]; console.log(`| ${b} | ${era} | ${q(a, 0.5).toFixed(2)} | ${q(a, 0.99).toFixed(2)} | ${Math.max(...a).toFixed(2)} |`); }
console.log("\nKapı.çizgi uyuşmazlığı (yerel ≠ SE), cisim başına: " + JSON.stringify(glMismatch));
console.log("Cisim başına genel max: " + JSON.stringify(Object.fromEntries(bodies.map((b) => [b, +Math.max(...Object.values(stat[b]).flat()).toFixed(2)]))));

console.log(`
GÖSTERİLEN SONUÇ: kesin aktivasyon ${certain}, kesin ama YANLIŞ ${certainWrong}; kesinleştirilemedi ${uncertain} (gerçek adaylarda değil: ${notInCands}); belirsizlik içeren an ${momentsUncertain}/${j.utcMs.length} (%${(100 * momentsUncertain / j.utcMs.length).toFixed(1)}); kanal iddiası yanlış ${chanWrong}; merkez iddiası yanlış ${centerWrong}`);
