/**
 * ASTROLOJİ AŞAMA 4 — GOLDEN DOĞRULAMA: endpoint başına TEK gerçek Roxy çağrısı (owner onayı 2026-10-07).
 *
 *   • SENTETİK kişi (gerçek kişi DEĞİL): A = 1990-07-15 14:30 İstanbul (Aşama 1/3 golden ile aynı).
 *   • Relocation hedefi: New York (lib/location/world — sabit veri, dış API yok).
 *   • Local space referansı: doğum yeri (İstanbul).
 *   • Gövdeler ürünün KENDİ üreticileriyle kurulur (requests.ts) → gerçek çağrı = ürün gövdesi.
 *   • Fixture dosyası varsa o çağrı YAPILMAZ. Yeniden deneme KAPALI. ROXY_API_KEY yazılmaz/loglanmaz/
 *     kaydedilmez; yanıt kaydedilmeden önce anahtar metni içerip içermediği kontrol edilir.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase4-golden-calls.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { astrocartographyBody, LOCATION_EXTRA_BODIES, localSpaceBody, relocationBody } from "@/lib/astrology/providers/roxy/requests";
import { WORLD_LOCATIONS } from "@/lib/location/world";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");

const NY = WORLD_LOCATIONS.find((l) => l.id === "us-ny-new-york")!;
export const RELOCATION_TARGET = { id: NY.id, latitude: NY.lat, longitude: NY.lon, timezone: NY.tz };

export function goldenPlan4() {
  return [
    { name: "astrocartography", endpoint: "/astrology/astrocartography", body: astrocartographyBody(SYNTH_A), query: { include: LOCATION_EXTRA_BODIES } },
    { name: "relocation", endpoint: "/astrology/relocation-chart", body: relocationBody(SYNTH_A, RELOCATION_TARGET, "placidus"), query: undefined },
    { name: "local-space", endpoint: "/astrology/local-space", body: localSpaceBody(SYNTH_A, { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude }), query: { include: LOCATION_EXTRA_BODIES } },
  ] as const;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan4()) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const r = await callRoxy(cfg, g.endpoint, g.body as Record<string, unknown>, { maxRetries: 0, query: g.query });
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
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: g.query ?? null, body: g.body, response: r.raw }, null, 2) + "\n");
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
