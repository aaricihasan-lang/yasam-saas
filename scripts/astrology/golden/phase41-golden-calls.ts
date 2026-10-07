/**
 * ASTROLOJİ AŞAMA 4.1 — GOLDEN: RELOCATED Solar/Lunar Return (owner onayı: her biri en fazla 1 çağrı).
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul) — Aşama 3 solar/lunar return golden'larıyla AYNI istek,
 *     yalnız latitude/longitude = Londra (lib/location/world, dış API yok). Böylece:
 *       - dönüş anı + natal nokta İstanbul golden'ıyla AYNI kalmalı (konumdan bağımsız),
 *       - ASC/MC/evler Londra'ya göre değişmeli (bağımsız formülle doğrulanır).
 *   • Fixture varsa çağrı YAPILMAZ; yeniden deneme KAPALI; anahtar yazılmaz/loglanmaz/kaydedilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase41-golden-calls.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { lunarReturnBody, solarReturnBody } from "@/lib/astrology/providers/roxy/requests";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
const LON = WORLD_LOCATIONS.find((l) => l.id === "gb-london")!;
export const RETURN_TARGET = { id: LON.id, latitude: LON.lat, longitude: LON.lon, timezone: LON.tz };

export function goldenPlan41() {
  // Lunar: Aşama 3 golden'ındaki AYNI dönüş günü (2026-10 · 1. dönüş).
  const lunarDay = JSON.parse(readFileSync(join(DIR, "lunar-return.json"), "utf8")).body.returnDate as string;
  return [
    { name: "solar-return-london", endpoint: "/astrology/solar-return", body: solarReturnBody(SYNTH_A, 2026, "placidus", RETURN_TARGET) },
    { name: "lunar-return-london", endpoint: "/astrology/lunar-return", body: lunarReturnBody(SYNTH_A, lunarDay, "placidus", RETURN_TARGET) },
  ] as const;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan41()) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const r = await callRoxy(cfg, g.endpoint, g.body as Record<string, unknown>, { maxRetries: 0 });
    made += r.attempts;
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, body: g.body, response: r.raw }, null, 2) + "\n");
    console.log(`${g.name}: OK · üst alanlar: ${Object.keys(r.raw as Record<string, unknown>).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek Roxy istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
