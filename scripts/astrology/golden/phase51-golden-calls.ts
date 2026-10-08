/**
 * ASTROLOJİ AŞAMA 5.1 — VEDİK GOLDEN: endpoint başına (en fazla) 1 gerçek Roxy çağrısı.
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki aşamaların golden'ıyla aynı kişi.
 *   • vedic-transit: transit anı 2026-10-07 09:00 UTC (Batı transit golden'ıyla AYNI an → karşılaştırma).
 *     Gövde ürünün kendi üreticisiyle (vedicTransitBody): timezone = doğum ofseti, transit saati bu ofsette.
 *   • İsimle çalışır; isim yoksa çağrı YAPILMAZ. Fixture varsa çağrı YAPILMAZ. Yeniden deneme KAPALI;
 *     anahtar yazılmaz/loglanmaz/kaydedilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase51-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody, vedicTransitBody } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const VEDIC_TRANSIT_GOLDEN_AT = "2026-10-07T09:00";

export function goldenPlan51(): GoldenEntry[] {
  return [
    { name: "vedic-transit", subphase: "5.1A", endpoint: "/vedic-astrology/transit", body: vedicTransitBody(SYNTH_A, VEDIC_TRANSIT_GOLDEN_AT) },
    // 5.1B: D9 golden'ı BPHS ile "Koç'tan düz eşit bölme"yi AYIRT EDEMEZ (ikisi D9'da aynı). D30 Trimsamsa
    // (Parashari: eşit olmayan 5/5/8/7/5 dilim, tek/çift burçta ters sıra) ayırt edicidir → endpoint'in tek yeni çağrısı.
    { name: "vedic-d30", subphase: "5.1B", endpoint: "/vedic-astrology/divisional-chart", body: { ...vedicBirthBody(SYNTH_A, "lahiri"), division: 30 } },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlan51().map((g) => g.name).join(", "));
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan51().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0, query: g.query });
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
