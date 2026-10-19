/**
 * HD TRANSİT — GERÇEK Roxy SÖZLEŞME TESTİ (ÜCRETLİ: 1 transit + 1 bodygraph çağrısı). Owner onayı 2026-10-19.
 *   RUN_HD_TRANSIT_LIVE=EVET npx tsx scripts/hd-transit/roxy-live-contract.ts
 * Anahtar yalnız ROXY_API_KEY ortam değişkeninden okunur; HİÇBİR çıktıya / dosyaya yazılmaz.
 * Test kişisi SENTETİKTİR (gerçek danışan değil): PEOPLE[0] = 2018-07-20 19:00 İstanbul.
 * Çıktı: scripts/hd-transit/fixtures/roxy-live-contract.json (ham yanıtlar) + defter satırları.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readRoxyServerConfig } from "../../lib/human-design/providers/roxy/config";
import { callRoxyBodygraph } from "../../lib/human-design/providers/roxy/client";
import { callRoxyTransit } from "../../lib/human-design/transit/roxyTransitClient";
import { validateRoxyTransit } from "../../lib/human-design/transit/personalTransit";
import { PEOPLE } from "../hd-relations/fakeRelationRoxy";

const FIX = path.resolve(__dirname, "fixtures");
mkdirSync(FIX, { recursive: true });
const LEDGER = path.join(FIX, "roxy-live-ledger.jsonl");

const typeTree = (v: unknown, d = 0): unknown => {
  if (Array.isArray(v)) return v.length ? [typeTree(v[0], d + 1), `…×${v.length}`] : [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, d > 3 ? typeof x : typeTree(x, d + 1)]));
  return typeof v === "string" && v.length > 40 ? "string" : `${typeof v}:${JSON.stringify(v)}`;
};

async function main() {
  if (process.env.RUN_HD_TRANSIT_LIVE !== "EVET") { console.log("RUN_HD_TRANSIT_LIVE=EVET değil — çağrı yapılmadı"); return; }
  const config = readRoxyServerConfig();
  if (!config) { console.log("ROXY_API_KEY yok — çağrı yapılmadı"); return; }
  const birth = { ...PEOPLE[0], nodeType: "true" };
  const transitAt = { date: "2026-10-19", time: "09:00:00" };

  const t0 = Date.now();
  const tr = await callRoxyTransit(config, { birthData: birth, date: transitAt.date, time: transitAt.time }, { lang: "tr", timeoutMs: 20_000 });
  appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), endpoint: "/human-design/transit", purpose: "sözleşme testi", utc: `${transitAt.date}T${transitAt.time}Z`, ok: tr.ok, status: tr.ok ? 200 : tr.status, ms: Date.now() - t0 }) + "\n");
  const bg = await callRoxyBodygraph(config, birth, { lang: "tr", timeoutMs: 20_000 });
  appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), endpoint: "/human-design/bodygraph", purpose: "sözleşme testi — test kişisinin Roxy natal kapıları", ok: bg.ok, status: bg.ok ? 200 : bg.status }) + "\n");

  writeFileSync(path.join(FIX, "roxy-live-contract.json"), JSON.stringify({ birth, transitAt, transit: tr.ok ? tr.raw : { error: tr.kind, status: tr.status }, bodygraph: bg.ok ? bg.raw : { error: bg.kind, status: bg.status } }, null, 1));
  console.log("transit:", tr.ok ? "200" : `${tr.kind} ${tr.status}`, " bodygraph:", bg.ok ? "200" : `${bg.kind} ${bg.status}`);
  if (tr.ok) {
    console.log("\n[transit yanıt şeması]\n" + JSON.stringify(typeTree(tr.raw), null, 1).slice(0, 6000));
    const v = validateRoxyTransit(tr.raw, transitAt);
    console.log("\nvalidateRoxyTransit:", v.ok ? "OK" : JSON.stringify(v.errors));
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : "hata"); process.exit(1); });
