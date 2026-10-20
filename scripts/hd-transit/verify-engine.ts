/**
 * HD GENEL TRANSİT — yerel motorun BAĞIMSIZ DOĞRULAMASI (ücretli çağrı YOK; yalnız depodaki kayıtlı Roxy verisi).
 *
 * Bir transit = bir UTC anındaki 13 aktivasyon. Aşağıdaki kaynaklarda Roxy'nin bilinen anlarda verdiği konumlar
 * kayıtlıdır; yerel motor (computeGeneralTransit) aynı anlar için karşılaştırılır:
 *   A. scripts/hd-stage2/golden-roxy-20.txt — canlı sistemde Roxy BodyGraph ile hesaplanmış 20 harita:
 *      doğum UTC (Personality) + tasarım UTC (Design) → 40 an × 13 kapı.çizgi (1935–2020).
 *   B. scripts/astrology/fixtures — Roxy astroloji yanıtları (tropikal boylam, true node): transit 2026-10-07 09:00Z,
 *      natal 1990-07-15 11:30Z, sinastri 2. kişi, güneş / ay dönüşü haritaları (2026). Boylam farkı yay-saniye.
 * Çalıştır: npx tsx scripts/hd-transit/verify-engine.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { computeGeneralTransit, TRANSIT_BODY_ORDER, TRANSIT_NEAR_BOUNDARY_ARCSEC, TransitEngineError } from "../../lib/human-design/transit/generalTransit";
import { longitudeToGateLine } from "../../lib/human-design/engine/mandala";
import { MockPlanetLongitudeProvider } from "../../lib/human-design/engine/planets";
import type { PlanetName } from "../../lib/human-design/engine/types";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 800)}` : ""}`); }
}
const root = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

// ── A. golden-roxy-20 ──────────────────────────────────────────────────────────
console.log("\n[A] Roxy BodyGraph — 20 harita × (doğum + tasarım anı) × 13 cisim");
let aTotal = 0;
let aMatch = 0;
const aMiss: unknown[] = [];
let minMargin = Infinity;
for (const line of read("scripts/hd-stage2/golden-roxy-20.txt").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const f = line.split("~");
  const id = f[0];
  const birthUtc = new Date(`${f[2]}:00Z`);
  const designUtc = new Date(`${f[3]}Z`);
  const acts = f[16].trim().split(/\s+/);
  if (acts.length !== 26) { ok(false, `${id}: 26 aktivasyon satırı`); continue; }
  for (const [side, at, slice] of [["P", birthUtc, acts.slice(0, 13)], ["D", designUtc, acts.slice(13)]] as const) {
    const t = computeGeneralTransit(at);
    TRANSIT_BODY_ORDER.forEach((body, i) => {
      aTotal++;
      const [g, l] = slice[i].split(".").map(Number);
      const mine = t.activations.find((a) => a.body === body)!;
      minMargin = Math.min(minMargin, mine.lineBoundaryArcsec);
      if (mine.gate === g && mine.line === l) aMatch++;
      else aMiss.push({ id, side, body, roxy: `${g}.${l}`, local: `${mine.gate}.${mine.line}`, lineBoundaryArcsec: +mine.lineBoundaryArcsec.toFixed(2), utc: at.toISOString() });
    });
  }
}
ok(aTotal === 520, `A: 520 aktivasyon karşılaştırıldı (${aTotal})`);
ok(aMatch === aTotal, `A: yerel motor = Roxy kapı.çizgi ${aMatch}/${aTotal}`, aMiss);
console.log(`  · en yakın çizgi sınırı mesafesi: ${minMargin.toFixed(1)}″`);

// ── B. Roxy astroloji boylamları ──────────────────────────────────────────────
console.log("\n[B] Roxy astroloji — tropikal boylam (true node) karşılaştırması");
type RoxyPlanet = { name: string; longitude: number };
const NAME: Record<string, PlanetName> = {
  Sun: "Sun", Moon: "Moon", Mercury: "Mercury", Venus: "Venus", Mars: "Mars", Jupiter: "Jupiter", Saturn: "Saturn",
  Uranus: "Uranus", Neptune: "Neptune", Pluto: "Pluto", "North Node": "NorthNode", "South Node": "SouthNode",
};
const fx = (p: string) => JSON.parse(read(`scripts/astrology/fixtures/${p}`));
const sets: Array<{ label: string; utc: string; planets: RoxyPlanet[] }> = [];
const tr = fx("golden/transit.json");
sets.push({ label: "transit 2026-10-07", utc: "2026-10-07T09:00:00Z", planets: tr.response.transitPlanets });
sets.push({ label: "natal 1990-07-15", utc: "1990-07-15T11:30:00Z", planets: fx("roxy-natal-golden-2026-10-07.json").planets });
const syn = fx("golden/synastry.json");
const p2 = syn.body.person2;
const tz2 = Number(p2.timezone);
const p2Utc = new Date(Date.parse(`${p2.date}T${p2.time}Z`) - tz2 * 3_600_000).toISOString();
sets.push({ label: `sinastri 2. kişi ${p2.date}`, utc: p2Utc, planets: syn.response.person2.planets });
// Dönüş anları yanıtta isteğin saat diliminde (yerel, ofsetsiz yazılmış) verilir → UTC = yerel − timezone.
const localToUtc = (local: string, tzHours: number) => new Date(Date.parse(`${local}Z`) - tzHours * 3_600_000).toISOString();
const srF = fx("golden/solar-return.json");
sets.push({ label: "güneş dönüşü 2026", utc: localToUtc(srF.response.solarReturnDate, Number(srF.body.timezone)), planets: srF.response.chart.planets });
const lrF = fx("golden/lunar-return.json");
sets.push({ label: "ay dönüşü 2026", utc: localToUtc(lrF.response.lunarReturnDate, Number(lrF.body.timezone)), planets: lrF.response.chart.planets });

let worst = 0;
const worstBy: Record<string, number> = {};
for (const s of sets) {
  const t = computeGeneralTransit(new Date(s.utc));
  let maxArc = 0;
  let glMatch = 0;
  let glTotal = 0;
  const miss: unknown[] = [];
  for (const rp of s.planets) {
    const body = NAME[rp.name];
    if (!body) continue;
    const mine = t.activations.find((a) => a.body === body)!;
    const d = Math.abs((((mine.longitude - rp.longitude) % 360) + 540) % 360 - 180) * 3600;
    maxArc = Math.max(maxArc, d);
    worstBy[body] = Math.max(worstBy[body] ?? 0, d);
    const r = longitudeToGateLine(rp.longitude);
    glTotal++;
    if (r.gate === mine.gate && r.line === mine.line) glMatch++;
    else miss.push({ body, roxy: `${r.gate}.${r.line}`, local: `${mine.gate}.${mine.line}`, diffArcsec: +d.toFixed(2) });
  }
  worst = Math.max(worst, maxArc);
  ok(glTotal >= 11 && glMatch === glTotal, `B ${s.label} (${s.utc}): kapı.çizgi ${glMatch}/${glTotal}; en büyük boylam farkı ${maxArc.toFixed(2)}″`, miss);
}
console.log("  · cisim başına en büyük fark (″): " + Object.entries(worstBy).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", "));
// Kabul: en büyük fark arayüzdeki "sınıra yakın" eşiğinin (TRANSIT_NEAR_BOUNDARY_ARCSEC) altında olmalı → farkın
// kapı/çizgiyi değiştirebileceği her konum ekranda zaten "sınıra yakın" işaretlenir.
ok(worst < TRANSIT_NEAR_BOUNDARY_ARCSEC, `B: tüm boylam farkları < ${TRANSIT_NEAR_BOUNDARY_ARCSEC}″ (sınıra yakın eşiği; en büyük ${worst.toFixed(2)}″)`);

// ── C. Motor kuralları ─────────────────────────────────────────────────────────
console.log("\n[C] Motor kuralları");
const now = new Date("2026-10-19T09:00:00Z");
const t1 = computeGeneralTransit(now);
const t2 = computeGeneralTransit(new Date(now.getTime()));
ok(JSON.stringify(t1) === JSON.stringify(t2), "C: aynı an → birebir aynı sonuç (deterministik)");
ok(t1.activations.length === 13 && new Set(t1.activations.map((a) => a.body)).size === 13, "C: tam 13 farklı cisim");
ok(!("type" in t1) && !("authority" in t1) && !("profile" in t1) && !("definition" in t1), "C: tip / otorite / profil / tanım ÜRETİLMEZ");
let mockRejected = false;
try { computeGeneralTransit(now, new MockPlanetLongitudeProvider()); } catch (e) { mockRejected = e instanceof TransitEngineError; }
ok(mockRejected, "C: MockPlanetLongitudeProvider reddedilir");
let badRejected = false;
try { computeGeneralTransit(new Date("x")); } catch (e) { badRejected = e instanceof TransitEngineError; }
ok(badRejected, "C: geçersiz an reddedilir");
// Kanal / merkez tutarlılığı: birçok anda tanımlı kanallar iki kapı da aktif, merkezler yalnız bu kanallardan; yarım kanallar tek kapı.
let consistent = true;
let totalChannels = 0;
for (let i = 0; i < 400; i++) {
  const t = computeGeneralTransit(new Date(Date.UTC(1950, 0, 1) + i * 1000 * 3600 * 24 * 137.3));
  const act = new Set(t.activeGates);
  totalChannels += t.channels.length;
  const centers = new Set(t.channels.flatMap((c) => [c.centerA, c.centerB]));
  if (t.channels.some((c) => !act.has(c.gateA) || !act.has(c.gateB))) consistent = false;
  if (t.halfChannels.some((h) => act.has(h.gateA) === act.has(h.gateB))) consistent = false;
  // Kesin kanalların merkezleri kesin tanımlı; tanımlı / açık / sınıra bağlı merkezler 9'u ayrık böler.
  if ([...centers].some((c) => !t.definedCenters.includes(c))) consistent = false;
  if (t.definedCenters.length + t.openCenters.length + t.uncertainCenters.length !== 9) consistent = false;
  if (!t.hasUncertainty && (t.uncertainCenters.length || t.possibleChannels.length || t.definedCenters.length !== centers.size)) consistent = false;
}
ok(consistent && totalChannels > 0, `C: 400 an (1950–2100) — kanal / yarım kanal / merkez tutarlı (toplam ${totalChannels} transit kanalı)`);
// Sınır: Güneş'in bir kapı sınırını geçtiği an ±2 sn içinde kapı değişir; sınıra yakın işareti açılır.
const sunGate = (ms: number) => computeGeneralTransit(new Date(ms)).activations[0];
let lo = Date.parse("2026-10-19T00:00:00Z");
let hi = lo + 7 * 86400_000;
const g0 = sunGate(lo).gate;
ok(sunGate(hi).gate !== g0, "C: 7 gün içinde Güneş kapı değiştirir (sınır arama penceresi)");
while (hi - lo > 1000) { const mid = Math.floor((lo + hi) / 2); if (sunGate(mid).gate === g0) lo = mid; else hi = mid; }
const before = sunGate(lo - 2000);
const after = sunGate(hi + 2000);
ok(before.gate === g0 && after.gate !== g0 && before.nearBoundary && after.nearBoundary && after.line === 1 && before.line === 6, `C: Güneş kapı sınırı ${new Date(hi).toISOString()} — önce ${before.gate}.${before.line}, sonra ${after.gate}.${after.line}, ikisi de "sınıra yakın"`);

console.log(`\nHD GENEL TRANSİT MOTOR DOĞRULAMASI: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
