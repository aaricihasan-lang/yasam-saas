/**
 * HD TRANSİT — Roxy /astrology/planets HASSASİYET TARAMASI (ÜCRETLİ; owner onayı 2026-10-19). Amaç: Roxy boylam belirsizlik
 * payını (ROXY_PLANETS_UNCERTAINTY) yeterli örnekle ölçmek + 500 yeni üç kaynaklı doğrulama anı.
 *   RUN_HD_TRANSIT_LIVE=EVET npx tsx scripts/hd-transit/roxy-planets-sweep.ts [adet=500]
 * Anlar: 1900-01-01 … 2100-12-31 arası deterministik (tohum 4242), tam saniye. Sıralı, 300 ms ara; 429 / yetki / 3 hata → DUR.
 * Çıktı: fixtures/roxy-planets-sweep.json — { results: { Pnnn: { utc, planets:[{name, longitude}] } } } (swiss-ephemeris.py ile uyumlu).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyPlanets, roxyPlanetsRequest } from "../../lib/human-design/transit/roxyPlanetsClient";

const FIX = path.resolve(__dirname, "fixtures");
const OUT = path.join(FIX, "roxy-planets-sweep.json");
const LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");

export function sweepMoments(n: number): Array<{ id: string; utc: string }> {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const a = Date.parse("1900-01-01T00:00:00Z");
  const b = Date.parse("2100-12-31T23:59:59Z");
  return Array.from({ length: n }, (_, i) => {
    const ms = Math.floor((a + rnd() * (b - a)) / 1000) * 1000;
    return { id: `P${String(i + 1).padStart(3, "0")}`, utc: new Date(ms).toISOString().replace(".000Z", "Z") };
  });
}

async function main() {
  const n = Number(process.argv[2] ?? 500);
  const plan = sweepMoments(n);
  if (process.env.RUN_HD_TRANSIT_LIVE !== "EVET") { console.log(`PLAN (çağrı yok): ${plan.length} an`); return; }
  const config = readRoxyServerConfig();
  if (!config) { console.log("ROXY_API_KEY yok — çağrı yapılmadı"); return; }
  const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { results: {} };
  let calls = 0, consecutive = 0;
  for (const m of plan) {
    if (out.results[m.id]?.planets) continue;
    const r = await callRoxyPlanets(config, roxyPlanetsRequest(m.utc), { timeoutMs: 20_000 });
    calls++;
    appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), endpoint: "/astrology/planets", purpose: `hassasiyet taraması ${m.id}`, utc: m.utc, ok: r.ok, status: r.ok ? 200 : r.status }) + "\n");
    if (r.ok) {
      consecutive = 0;
      out.results[m.id] = { id: m.id, utc: m.utc, planets: (r.raw as { planets: Array<{ name: string; longitude: number }> }).planets.map((p) => ({ name: p.name, longitude: p.longitude })) };
      if (calls % 25 === 0) writeFileSync(OUT, JSON.stringify(out));
    } else {
      consecutive++;
      console.log(`${m.id}: ${r.kind} ${r.status}`);
      if (r.kind === "rate_limited" || r.kind === "unauthorized" || consecutive >= 3) break;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`Bu çalıştırmada ücretli çağrı: ${calls}. Toplam: ${Object.keys(out.results).length}/${plan.length}`);
}
if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : "hata"); process.exit(1); });
