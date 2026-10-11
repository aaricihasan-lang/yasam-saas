/**
 * ASTROLOJİ AŞAMA 5.2 — kalan 13 varga için GERÇEK golden (owner onayı 2026-10-08; üst sınır 13 çağrı).
 *
 *   • SENTETİK kişi A (önceki aşamalarla aynı), Lahiri, gövde ürünün kendi üreticisiyle (vedic.varga birimi).
 *   • Bölüm başına EN FAZLA 1 çağrı; fixture varsa çağrı YAPILMAZ; yeniden deneme KAPALI; anahtar kaydedilmez.
 *   • İsim verilmezse hiçbir çağrı yapılmaz.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase52-golden-calls.ts <isim…|all>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
/** 5.2'de doğrulanacak bölümler (D9 ve D30 zaten golden'lı — tekrar çağrılmaz). */
export const PHASE52_DIVISIONS = [2, 3, 4, 7, 10, 12, 16, 20, 24, 27, 40, 45, 60] as const;

export function goldenPlan52(): GoldenEntry[] {
  return PHASE52_DIVISIONS.map((d) => ({ name: `vedic-d${d}`, subphase: "5.2", endpoint: "/vedic-astrology/divisional-chart", body: { ...vedicBirthBody(SYNTH_A, "lahiri"), division: d } }));
}

async function main() {
  const args = process.argv.slice(2);
  const plan = goldenPlan52();
  const wanted = args.includes("all") ? plan.map((g) => g.name) : args;
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + plan.map((g) => g.name).join(", "));
    return;
  }
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
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    if (made >= 13) {
      console.log("üst sınır (13) — durduruldu");
      break;
    }
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0 });
    made += r.attempts;
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    if (JSON.stringify(r.raw).includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: null, body: g.body, response: r.raw }, null, 2) + "\n");
    console.log(`${g.name}: OK · division=${JSON.stringify((r.raw as { division?: unknown }).division ?? null).slice(0, 120)}`);
  }
  console.log(`bu çalıştırmada gerçek Roxy istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
