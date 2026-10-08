/**
 * ASTROLOJİ AŞAMA 6 — KP GOLDEN: endpoint başına (en fazla) 1 gerçek Roxy çağrısı (owner onayı; tahmin 6 ≤ 10).
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki aşamaların golden'ıyla AYNI kişi (Lahiri D1 ile çapraz denetim).
 *   • An: 2026-10-07 09:00 UTC (Batı transit / Gochara golden'ıyla aynı an). Gövdeler ürünün KENDİ üreticileriyle.
 *   • İsimle çalışır; isim yoksa çağrı YAPILMAZ. Fixture varsa çağrı YAPILMAZ. Yeniden deneme KAPALI; anahtar kaydedilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase6-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpChartBody, kpHoraryBody, kpPlanetsAtBody, kpRulingBody, vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const KP_GOLDEN_AT = "2026-10-07T09:00";
export const KP_HORARY_NUMBER = 108;
const ISTANBUL = { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude };

export function goldenPlan6(): GoldenEntry[] {
  const kpDasha = { ...vedicBirthBody(SYNTH_A, "kp-newcomb"), significators: true, nodeType: "mean" };
  return [
    { name: "kp-chart", subphase: "6B", endpoint: "/vedic-astrology/kp/chart", body: kpChartBody(SYNTH_A, "kp-newcomb", "mean") },
    { name: "kp-dasha-major", subphase: "6E", endpoint: "/vedic-astrology/dasha/major", body: kpDasha },
    // {md}: kp-dasha-major golden'ından bugünkü mahadasha (VEDIC_MD ortam değişkeni).
    { name: "kp-dasha-sub-md", subphase: "6E", endpoint: "/vedic-astrology/dasha/sub/{md}", body: kpDasha },
    { name: "kp-ruling-planets", subphase: "6F", endpoint: "/vedic-astrology/kp/ruling-planets", body: kpRulingBody(SYNTH_A, KP_GOLDEN_AT, "mean") },
    { name: "kp-planets-at", subphase: "6F", endpoint: "/vedic-astrology/kp/planets-interval", body: kpPlanetsAtBody(KP_GOLDEN_AT, ISTANBUL, "kp-newcomb", "mean") },
    { name: "kp-horary", subphase: "6F", endpoint: "/vedic-astrology/kp/horary", body: kpHoraryBody(KP_HORARY_NUMBER, KP_GOLDEN_AT, ISTANBUL, "kp-newcomb", "mean") },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlan6().map((g) => g.name).join(", "));
    return;
  }
  const md = process.env.VEDIC_MD ?? "";
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan6().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const endpoint = g.endpoint.replace("{md}", md);
    if (/[{}]/.test(endpoint) || endpoint.endsWith("/")) {
      console.log(`${g.name}: yol parametresi eksik (VEDIC_MD) — çağrı yapılmadı`);
      continue;
    }
    const r = await callRoxy(cfg, endpoint, g.body, { maxRetries: 0 });
    made += r.attempts;
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    if (JSON.stringify(r.raw).includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint, query: null, body: g.body, response: r.raw }, null, 2) + "\n");
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
