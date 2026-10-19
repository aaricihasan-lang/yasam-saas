/**
 * HD TRANSİT — Roxy PLANETARY POSITIONS (+ yeni anlar için HD Transit) GERÇEK doğrulama çağrıları (ÜCRETLİ; owner onayı 2026-10-19).
 *   RUN_HD_TRANSIT_LIVE=EVET npx tsx scripts/hd-transit/roxy-planets-validation.ts
 * Anlar: önceki 120 (roxy-live-validation.json) + Swiss Ephemeris'le bulunan 54 gerçek sınır anı (se-boundary-plan.json).
 * Sıralı, 400 ms ara; 429 / yetki / art arda 3 hata → DUR. Anahtar hiçbir çıktıya yazılmaz. Kaldığı yerden devam eder.
 * Çıktı: fixtures/roxy-planets-validation.json (yalnız ad + boylam + hız; yorum metinleri saklanmaz).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyTransit } from "../../lib/human-design/transit/roxyTransitClient";
import { callRoxyPlanets, roxyPlanetsRequest } from "../../lib/human-design/transit/roxyPlanetsClient";
import { istanbulLocalParts } from "../../lib/human-design/transit/transitMoment";
import { PEOPLE } from "../hd-relations/fakeRelationRoxy";

const FIX = path.resolve(__dirname, "fixtures");
const LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");
const OUT = path.join(FIX, "roxy-planets-validation.json");
type Moment = { id: string; utc: string; scenario: string; person: number; boundary?: unknown };

function moments(): Moment[] {
  const prev = JSON.parse(readFileSync(path.join(FIX, "roxy-live-validation.json"), "utf8")).results as Record<string, Moment>;
  const se = JSON.parse(readFileSync(path.join(FIX, "se-boundary-plan.json"), "utf8")) as Moment[];
  return [...Object.values(prev).map((m) => ({ id: m.id, utc: m.utc, scenario: m.scenario, person: m.person, boundary: m.boundary })), ...se.map((m, i) => ({ ...m, person: i % 3 }))];
}

async function main() {
  const all = moments();
  if (process.env.RUN_HD_TRANSIT_LIVE !== "EVET") { console.log(`PLAN (çağrı yok): ${all.length} an planets + ${all.filter((m) => m.id.startsWith("S")).length} HD transit`); return; }
  const config = readRoxyServerConfig();
  if (!config) { console.log("ROXY_API_KEY yok — çağrı yapılmadı"); return; }
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { results: {} };
  const ledger = (o: object) => appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
  const save = () => writeFileSync(OUT, JSON.stringify(out, null, 1));
  let calls = 0;
  let consecutive = 0;
  const persons = [0, 1, 2].map((i) => ({ ...PEOPLE[i], nodeType: "true" }));
  for (const m of all) {
    const row = (out.results[m.id] ??= { ...m, local: Object.values(istanbulLocalParts(new Date(m.utc))).join(" ") });
    const steps: Array<["planets" | "hdTransit", () => Promise<import("../../lib/human-design/providers/roxy/client").RoxyCallResult>]> = [];
    if (!row.planets) steps.push(["planets", () => callRoxyPlanets(config, roxyPlanetsRequest(m.utc), { timeoutMs: 20_000 })]);
    if (m.id.startsWith("S") && !row.hdTransit) steps.push(["hdTransit", () => callRoxyTransit(config, { birthData: persons[m.person], date: m.utc.slice(0, 10), time: m.utc.slice(11, 19) }, { lang: "tr", timeoutMs: 20_000 })]);
    for (const [kind, call] of steps) {
      const r = await call();
      calls++;
      ledger({ endpoint: kind === "planets" ? "/astrology/planets" : "/human-design/transit", purpose: `${m.id} ${m.scenario}`, utc: m.utc, ok: r.ok, status: r.ok ? 200 : r.status });
      if (r.ok) {
        consecutive = 0;
        row[kind] = kind === "planets"
          ? (r.raw as { planets: Array<{ name: string; longitude: number; speed: number }> }).planets.map((p) => ({ name: p.name, longitude: p.longitude, speed: p.speed }))
          : r.raw;
      } else {
        consecutive++;
        console.log(`${m.id} ${kind}: ${r.kind} ${r.status}`);
        if (r.kind === "rate_limited" || r.kind === "unauthorized" || consecutive >= 3) { save(); console.log(`DUR. Bu çalıştırmada ücretli çağrı: ${calls}`); return; }
      }
      save();
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  const done = Object.values(out.results as Record<string, { planets?: unknown }>).filter((r) => r.planets).length;
  console.log(`Bu çalıştırmada ücretli çağrı: ${calls}. Planets yanıtı: ${done}/${all.length}.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "hata"); process.exit(1); });
