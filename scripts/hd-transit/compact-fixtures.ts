/**
 * HD TRANSİT — fixture sadeleştirme (telif / boyut): kayıtlı Roxy yanıtlarından sağlayıcının YORUM METİNLERİ çıkarılır,
 * yalnız doğrulamada kullanılan sayısal / teknik alanlar kalır; JSON sıkıştırılır. Sayısal değerler DEĞİŞMEZ.
 *   npx tsx scripts/hd-transit/compact-fixtures.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const FIX = path.resolve(__dirname, "fixtures");
type Obj = Record<string, unknown>;
const TEXT_NOTE = "(sağlayıcı metni çıkarıldı)";

function stripTransit(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("activations" in (raw as Obj))) return raw;
  const r = raw as Obj;
  return {
    date: r.date,
    time: r.time,
    timezone: r.timezone,
    activations: (r.activations as Obj[]).map((a) => ({ body: a.body, gate: a.gate, line: a.line })),
    completedChannels: (r.completedChannels as Obj[]).map((c) => ({ gateA: c.gateA, gateB: c.gateB, kind: c.kind, natalGates: c.natalGates, transitGates: c.transitGates, centers: c.centers })),
    temporaryCenters: (r.temporaryCenters as Obj[]).map((c) => ({ id: c.id, temporarilyDefined: c.temporarilyDefined })),
    summary: TEXT_NOTE,
  };
}
const stripPlanets = (ps: unknown) => (Array.isArray(ps) ? ps.map((p: Obj) => ({ name: p.name, longitude: p.longitude, ...(p.speed !== undefined ? { speed: p.speed } : {}) })) : ps);
const rw = (f: string, fn: (j: Obj) => Obj) => {
  const p = path.join(FIX, f);
  const before = readFileSync(p, "utf8").length;
  const j = fn(JSON.parse(readFileSync(p, "utf8")));
  const s = JSON.stringify(j);
  writeFileSync(p, s);
  console.log(`${f}: ${before} → ${s.length} bayt`);
};

rw("roxy-live-validation.json", (j) => {
  for (const r of Object.values(j.results as Record<string, Obj>)) r.raw = stripTransit(r.raw);
  return j;
});
rw("roxy-planets-validation.json", (j) => {
  for (const r of Object.values(j.results as Record<string, Obj>)) {
    r.planets = stripPlanets(r.planets);
    if (r.hdTransit) r.hdTransit = stripTransit(r.hdTransit);
  }
  return j;
});
rw("roxy-live-contract.json", (j) => ({
  birth: j.birth,
  transitAt: j.transitAt,
  transit: stripTransit(j.transit),
  bodygraph: { gates: ((j.bodygraph as Obj).gates as Obj[]).map((g) => ({ planet: g.planet, side: g.side, gate: g.gate, line: g.line })), note: TEXT_NOTE },
}));
rw("roxy-planets-contract.json", (j) => ({ request: j.request, response: { planets: stripPlanets((j.response as Obj).planets) } }));
for (const f of ["roxy-planets-sweep.json", "swiss-ephemeris-reference.json", "swiss-ephemeris-reference-v2.json", "swiss-ephemeris-reference-sweep.json", "se-boundary-plan.json"]) rw(f, (j) => j);
