/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — GEZEGEN DÖNÜŞLERİ GOLDEN çağrıları (pay: en çok 4 çağrı).
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki golden'larla AYNI kişi.
 *   • Kavuşumlar ürünün KENDİ tarih seçicisiyle (engine/planetaryReturnDate) bulunur; gövdeler ürünün üreticisiyle (planetaryReturnBody).
 *       pr-saturn-next   : Satürn, 2049 dönüş kümesinin 1. kavuşumu (3 kavuşumlu retro döngüsü; "sonraki dönüş"), Placidus
 *       pr-jupiter-retro : Jüpiter, 2025–26 kümesinin 2. (GERİ hareketli) kavuşumu — retro döngüsünde sağlayıcı hangisini veriyor; geçmiş dönüş
 *       pr-mars-london   : Mars, 2028 dönüşü, dönüş konumu Londra (relocated; doğum ofseti korunur), Placidus
 *       pr-mercury-ws    : Merkür, 2026 dönüşü, Whole Sign — geosantrik ~yıllık dönüş (belgedeki "~88 gün" değil) doğrulaması
 *   • İsimle çalışır; fixture varsa çağrı YAPILMAZ; ücretli çağrı onayı RUN_PLANETARY_RETURN_GOLDEN=EVET; yeniden deneme KAPALI;
 *     anahtar yazılmaz. Her çağrıdan ÖNCE defter kaydı (PR_LEDGER yolu), sonra sonuç.
 *
 * Çalıştırma: RUN_PLANETARY_RETURN_GOLDEN=EVET PR_LEDGER=<defter> npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/planetary-return-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { planetaryReturnBody } from "@/lib/astrology/providers/roxy/planetaryReturn";
import { natalPlanetLongitude, planetaryReturnCluster, type PlanetaryReturnPlanet } from "@/lib/astrology/engine/planetaryReturnDate";
import type { HouseSystem } from "@/lib/astrology/model/western";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
const LON = WORLD_LOCATIONS.find((l) => l.id === "gb-london")!;
export const PR_LONDON = { id: LON.id, latitude: LON.lat, longitude: LON.lon, timezone: LON.tz };

export type PrGolden = { name: string; planet: PlanetaryReturnPlanet; approx: string; crossing: number; houseSystem: HouseSystem; at: { latitude: number; longitude: number } | null; summary: string };

export const PR_GOLDENS: PrGolden[] = [
  { name: "pr-saturn-next", planet: "saturn", approx: "2049-02-01", crossing: 1, houseSystem: "placidus", at: null, summary: "Satürn, 2049 kümesi 1. kavuşum, İstanbul, placidus" },
  { name: "pr-jupiter-retro", planet: "jupiter", approx: "2025-12-01", crossing: 2, houseSystem: "placidus", at: null, summary: "Jüpiter, 2025-26 kümesi 2. (retro) kavuşum, İstanbul, placidus" },
  { name: "pr-mars-london", planet: "mars", approx: "2028-05-01", crossing: 1, houseSystem: "placidus", at: { latitude: LON.lat, longitude: LON.lon }, summary: "Mars, 2028 dönüşü, konum Londra, doğum ofseti +3, placidus" },
  { name: "pr-mercury-ws", planet: "mercury", approx: "2026-08-01", crossing: 1, houseSystem: "whole-sign", at: null, summary: "Merkür, 2026 dönüşü, İstanbul, whole-sign" },
];

export function goldenPlanPr() {
  return PR_GOLDENS.map((g) => {
    const natal = natalPlanetLongitude(g.planet, SYNTH_A.utc);
    const cluster = planetaryReturnCluster(g.planet, natal, g.approx);
    const pick = cluster.find((c) => c.crossing === g.crossing);
    if (!pick) throw new Error(`${g.name}: kavuşum bulunamadı`);
    return { ...g, natal, cluster, pick, endpoint: "/astrology/planetary-returns", body: planetaryReturnBody(SYNTH_A, g.planet, pick.requestDate, g.houseSystem, g.at) };
  });
}

function ledger(path: string, update: (calls: Record<string, unknown>[]) => void) {
  const j = JSON.parse(readFileSync(path, "utf8")) as { calls: Record<string, unknown>[] };
  update(j.calls);
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
}

async function main() {
  const wanted = process.argv.slice(2);
  const plan = goldenPlanPr();
  if (wanted.length === 0) {
    for (const g of plan) console.log(`${g.name}: ${g.summary} · istek günü ${g.pick.requestDate} · küme ${g.cluster.map((c) => `${c.crossing}/${c.of} ${c.approxUtc} ${c.motion}`).join(" | ")}`);
    return;
  }
  if (process.env.RUN_PLANETARY_RETURN_GOLDEN !== "EVET" || !process.env.PR_LEDGER) {
    console.log("Onay yok (RUN_PLANETARY_RETURN_GOLDEN=EVET ve PR_LEDGER gerekli) — çağrı YAPILMADI");
    process.exit(2);
  }
  const ledgerPath = process.env.PR_LEDGER;
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of plan.filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("anahtar yok — çağrı yapılmadı");
      process.exit(2);
    }
    const at = new Date().toISOString();
    ledger(ledgerPath, (c) => c.push({ agent: "gezegen-donusleri", name: g.name, endpoint: g.endpoint, body: `sentetik A (1990-07-15 14:30 +3 İstanbul); ${g.summary}; approximateDate ${g.pick.requestDate}`, at }));
    const r = await callRoxy(cfg, g.endpoint, g.body as Record<string, unknown>, { maxRetries: 0 });
    made += r.attempts;
    const finish = (result: string) =>
      ledger(ledgerPath, (c) => {
        const e = c.find((x) => x.agent === "gezegen-donusleri" && x.name === g.name && x.at === at);
        if (e) Object.assign(e, { result, attempts: r.attempts, finishedAt: new Date().toISOString() });
      });
    if (!r.ok) {
      finish(`FAIL kind=${r.kind} status=${r.status ?? "-"}`);
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      finish("OK ama anahtar metni içeriyor — kaydedilmedi");
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, body: g.body, selection: { natalLongitude: g.natal, cluster: g.cluster, crossing: g.crossing }, response: r.raw }, null, 2) + "\n");
    finish(`OK ${g.name}.json`);
    console.log(`${g.name}: OK · üst alanlar: ${Object.keys(r.raw as Record<string, unknown>).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
