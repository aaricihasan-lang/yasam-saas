/**
 * HD TRANSİT — GERÇEK Roxy KAPSAMLI DOĞRULAMA (ÜCRETLİ; owner onayı 2026-10-19, kredi sınırı yok, amaçsız çağrı yok).
 *   RUN_HD_TRANSIT_LIVE=EVET npx tsx scripts/hd-transit/roxy-live-validation.ts
 *
 * Her an için 1 transit çağrısı (sıralı, 400 ms ara; 429 / art arda hata → DUR). Test kişileri SENTETİK (PEOPLE[0..2]);
 * natal kapılar her kişi için 1 Roxy bodygraph çağrısından (bağımsız natal kaynak).
 * Anahtar yalnız ROXY_API_KEY'den; hiçbir çıktıya / dosyaya yazılmaz.
 * Ham yanıtlar: scripts/hd-transit/fixtures/roxy-live-validation.json (çevrimdışı tekrar doğrulama + golden).
 * Karşılaştırma ve rapor ayrı adımda (roxy-live-report.ts + swiss-ephemeris.py) — bu betik yalnız toplar.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyBodygraph } from "../../lib/human-design/providers/roxy/client";
import { callRoxyTransit } from "../../lib/human-design/transit/roxyTransitClient";
import { computeGeneralTransit, TRANSIT_BODY_ORDER } from "../../lib/human-design/transit/generalTransit";
import { istanbulLocalParts } from "../../lib/human-design/transit/transitMoment";
import { PEOPLE } from "../hd-relations/fakeRelationRoxy";
import type { PlanetName } from "../../lib/human-design/engine/types";

const FIX = path.resolve(__dirname, "fixtures");
mkdirSync(FIX, { recursive: true });
const LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");
const OUT = path.join(FIX, "roxy-live-validation.json");

export type Planned = { id: string; utc: string; scenario: string; person: number; boundary?: { body: PlanetName; kind: "gate" | "line"; side: "before" | "after"; crossingUtc: string } };

// ── Plan ──────────────────────────────────────────────────────────────────────
let seed = 20261019;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const isoSec = (ms: number) => new Date(Math.round(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
const between = (a: string, b: string) => Date.parse(a) + rnd() * (Date.parse(b) - Date.parse(a));

const STEP_MS: Partial<Record<PlanetName, number>> = { Moon: 5 * 60e3, Sun: 30 * 60e3, Mercury: 60 * 60e3, Venus: 60 * 60e3, Mars: 3 * 3600e3, Jupiter: 12 * 3600e3, Saturn: 24 * 3600e3, Uranus: 48 * 3600e3, Neptune: 72 * 3600e3, Pluto: 96 * 3600e3, NorthNode: 6 * 3600e3 };
const act = (ms: number, b: PlanetName) => computeGeneralTransit(new Date(ms)).activations.find((a) => a.body === b)!;
const key = (ms: number, b: PlanetName, kind: "gate" | "line") => { const a = act(ms, b); return kind === "gate" ? `${a.gate}` : `${a.gate}.${a.line}`; };

/** startMs'den ileri, body'nin kapı/çizgi değiştirdiği ilk anı (ms) bul. */
function findCrossing(body: PlanetName, kind: "gate" | "line", startMs: number): number {
  const step = STEP_MS[body]!;
  let a = startMs;
  for (let i = 0; i < 40000; i++) {
    const k0 = key(a, body, kind);
    const b = a + step;
    if (key(b, body, kind) !== k0) {
      let lo = a, hi = b;
      while (hi - lo > 50) { const mid = (lo + hi) / 2; if (key(mid, body, kind) === k0) lo = mid; else hi = mid; }
      // Çizgi vakası yalnız KAPI İÇİ çizgi geçişi olmalı (kapı sınırı ayrı vakadır).
      if (kind === "gate" || key(lo, body, "gate") === key(hi, body, "gate")) return hi;
    }
    a = b;
  }
  throw new Error(`geçiş bulunamadı ${body} ${kind}`);
}

/** Geçişin iki yanında, yerel marj ≈ hedef yay-saniyesi olacak tam-saniye anlar. */
function boundaryPair(body: PlanetName, kind: "gate" | "line", startIso: string, targetArcsec: number, id: string, person: number): Planned[] {
  const t = findCrossing(body, kind, Date.parse(startIso));
  const a1 = act(t + 60_000, body).longitude, a0 = act(t - 60_000, body).longitude;
  const speedArcsecPerMs = Math.abs(((((a1 - a0) % 360) + 540) % 360) - 180) * 3600 / 120_000 || 1e-9;
  const dMs = Math.max(1000, targetArcsec / speedArcsecPerMs);
  const crossingUtc = new Date(t).toISOString();
  return (["before", "after"] as const).map((side, i) => ({
    id: `${id}-${side === "before" ? "a" : "b"}`,
    utc: isoSec(t + (i === 0 ? -dMs : dMs)),
    scenario: `${body} ${kind === "gate" ? "kapı" : "çizgi"} sınırı ${side === "before" ? "öncesi" : "sonrası"} (~${targetArcsec}″)`,
    person,
    boundary: { body, kind, side, crossingUtc },
  }));
}

function plan(): Planned[] {
  const p: Planned[] = [];
  let n = 0;
  const push = (utc: string, scenario: string) => { n++; p.push({ id: `R${String(n).padStart(3, "0")}`, utc, scenario, person: n % 3 }); };
  for (let i = 0; i < 18; i++) push(isoSec(between("1901-01-01T00:00:00Z", "2000-12-31T23:59:59Z")), "geçmiş (1901–2000)");
  for (let i = 0; i < 10; i++) push(isoSec(between("2001-01-01T00:00:00Z", "2025-12-31T23:59:59Z")), "yakın geçmiş (2001–2025)");
  for (let i = 0; i < 12; i++) push(isoSec(between("2026-01-01T00:00:00Z", "2026-12-31T23:59:59Z")), "2026");
  for (let i = 0; i < 18; i++) push(isoSec(between("2027-01-01T00:00:00Z", "2100-12-31T20:59:59Z")), "gelecek (2027–2100)");
  // Türkiye gece yarısı / UTC gün değişimi (yerel 00:00–02:59 → önceki UTC günü; yerel 23:59 / 00:00 / 03:00)
  for (const [d, t] of [["2026-10-19", "00:00"], ["2026-10-20", "00:00"], ["2026-10-19", "23:59"], ["2026-12-31", "23:59"], ["2027-01-01", "00:00"], ["2026-03-01", "02:59"], ["2026-03-01", "03:00"], ["2028-02-29", "00:30"], ["1999-12-31", "23:59"], ["2000-01-01", "00:00"]]) {
    const local = Date.parse(`${d}T${t}:00Z`);
    const off = d < "2016-09-07" ? (Number(d.slice(5, 7)) >= 4 && Number(d.slice(5, 7)) <= 10 ? 3 : 2) : 3; // TR: 2016 öncesi kış +2 / yaz +3 (bu tarihlerde geçiş yok)
    push(isoSec(local - off * 3600e3), `Türkiye ${d} ${t} (gece yarısı / gün değişimi)`);
  }
  // Sınır vakaları (kapı + çizgi; öncesi + sonrası)
  const b: Planned[] = [];
  const bodies: Array<[PlanetName, string]> = [["Sun", "2026-11-01T00:00:00Z"], ["Moon", "2026-10-19T00:00:00Z"], ["Mercury", "2027-03-01T00:00:00Z"], ["Venus", "2026-12-01T00:00:00Z"], ["Mars", "2026-11-10T00:00:00Z"], ["Jupiter", "2026-11-01T00:00:00Z"], ["Saturn", "2026-11-01T00:00:00Z"], ["Uranus", "2026-11-01T00:00:00Z"], ["Neptune", "2026-11-01T00:00:00Z"], ["Pluto", "2026-11-01T00:00:00Z"], ["NorthNode", "2026-11-01T00:00:00Z"]];
  let k = 0;
  for (const [body, start] of bodies) {
    for (const kind of ["gate", "line"] as const) b.push(...boundaryPair(body, kind, start, 5, `B${String(++k).padStart(2, "0")}`, k % 3));
  }
  // Hızlı Ay: geçmiş / gelecek tarihlerde ek çizgi sınırları (~2″ — en sert vaka)
  for (const start of ["1955-05-05T00:00:00Z", "1988-08-08T00:00:00Z", "2041-04-04T00:00:00Z", "2077-07-07T00:00:00Z"]) b.push(...boundaryPair("Moon", "line", start, 2, `B${String(++k).padStart(2, "0")}`, k % 3));
  return [...p, ...b];
}

async function main() {
  if (process.env.RUN_HD_TRANSIT_LIVE !== "EVET") {
    const pl = plan();
    console.log(`PLAN (çağrı yok): ${pl.length} an + 3 bodygraph`);
    for (const x of pl) console.log(`  ${x.id} ${x.utc} ${x.scenario}`);
    return;
  }
  const config = readRoxyServerConfig();
  if (!config) { console.log("ROXY_API_KEY yok — çağrı yapılmadı"); return; }
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { natal: {}, results: {} };
  const persons = [0, 1, 2].map((i) => ({ ...PEOPLE[i], nodeType: "true" }));
  let calls = 0;
  let consecutiveErr = 0;
  const save = () => writeFileSync(OUT, JSON.stringify(prev, null, 1));
  const ledger = (o: object) => appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");
  for (let i = 0; i < 3; i++) {
    if (prev.natal[i]) continue;
    const r = await callRoxyBodygraph(config, persons[i], { lang: "tr", timeoutMs: 20_000 });
    calls++;
    ledger({ endpoint: "/human-design/bodygraph", purpose: `natal kaynak — sentetik kişi ${i}`, ok: r.ok, status: r.ok ? 200 : r.status });
    if (!r.ok) { console.log(`bodygraph ${i}: ${r.kind} ${r.status} — DUR`); save(); return; }
    const raw = r.raw as { gates: Array<{ planet: string; side: string; gate: number; line: number }> };
    prev.natal[i] = { birth: persons[i], gates: raw.gates.map((g) => ({ planet: g.planet, side: g.side, gate: g.gate, line: g.line })) };
    save();
  }
  const pl = plan();
  for (const x of pl) {
    if (prev.results[x.id]?.ok) continue;
    const date = x.utc.slice(0, 10);
    const time = x.utc.slice(11, 19);
    const r = await callRoxyTransit(config, { birthData: persons[x.person], date, time }, { lang: "tr", timeoutMs: 20_000 });
    calls++;
    ledger({ endpoint: "/human-design/transit", purpose: `${x.id} ${x.scenario}`, utc: x.utc, ok: r.ok, status: r.ok ? 200 : r.status });
    const local = istanbulLocalParts(new Date(x.utc));
    prev.results[x.id] = { ...x, local: `${local.localDate} ${local.localTime}`, ok: r.ok, raw: r.ok ? r.raw : { error: r.kind, status: r.status } };
    save();
    if (!r.ok) {
      consecutiveErr++;
      console.log(`${x.id}: ${r.kind} ${r.status}`);
      if (r.kind === "rate_limited" || r.kind === "unauthorized" || consecutiveErr >= 3) { console.log("DUR: sağlayıcı sınırı / yetki / art arda hata"); break; }
    } else consecutiveErr = 0;
    await new Promise((res) => setTimeout(res, 400));
  }
  const okCount = Object.values(prev.results as Record<string, { ok: boolean }>).filter((r) => r.ok).length;
  console.log(`Bu çalıştırmada ücretli çağrı: ${calls}. Toplam başarılı transit yanıtı: ${okCount}/${pl.length}.`);
  void TRANSIT_BODY_ORDER;
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : "hata"); process.exit(1); });
export { plan };
