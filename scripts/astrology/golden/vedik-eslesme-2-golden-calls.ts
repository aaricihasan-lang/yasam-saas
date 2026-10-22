/**
 * ATLAS ROXY KALAN (2026-10-22 gece) — Vedik eşleştirme 2: Dashakoot (Güney Hint On Porutham) + Papasamyam GOLDEN çağrıları.
 *
 *   • SENTETİK kişiler (gerçek kişi DEĞİL): A = 1990-07-15 14:30 İstanbul (+3) = person1 (1. rol, geleneksel damat),
 *     B = 1988-03-21 06:45 Ankara (+2) = person2 (2. rol, geleneksel gelin). Gövdeler ürünün KENDİ üreticisiyle
 *     (vedicCompatibilityBody — Gun Milan ile aynı iki kişi gövdesi) kurulur.
 *   • İsimle çalışır; isim yoksa çağrı YAPILMAZ; fixture varsa çağrı YAPILMAZ; yeniden deneme KAPALI; anahtar yazılmaz.
 *   • Ücretli çağrı onayı: RUN_VEDIK_ESLESME2_GOLDEN=EVET olmadan çağrı YAPILMAZ. Bütçe: 2 çağrı (Dashakoot 1, Papasamyam 1).
 *   • Rol takaslı gerçek çağrı İZNİ YOK (takas etkisi yalnız kural bazlı beklentiyle harness'ta).
 *   • Defter: her çağrıdan ÖNCE QA defterine kayıt (ajan, ad, uç, sentetik gövde özeti, zaman), SONRA sonuç yazılır.
 *
 * Çalıştırma: RUN_VEDIK_ESLESME2_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/vedik-eslesme-2-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicCompatibilityBody } from "@/lib/astrology/providers/roxy/vedicMatchRequests";
import { SYNTH_A, SYNTH_B } from "./phase3-golden-calls";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
const LEDGER = "C:/YasamSistemi-QA/ATLAS-YENI-TEKNIKLER-2026-10-22/roxy-ledger.json";
const AGENT = "vedik-eslesme-2";

export function goldenPlanVedicMatch2(): GoldenEntry[] {
  return [
    { name: "vedic-dashakoot", subphase: "VE2", endpoint: "/vedic-astrology/compatibility/dashakoot", body: vedicCompatibilityBody(SYNTH_A, SYNTH_B, "lahiri") },
    { name: "vedic-papasamyam", subphase: "VE2", endpoint: "/vedic-astrology/compatibility/papasamyam", body: vedicCompatibilityBody(SYNTH_A, SYNTH_B, "lahiri") },
  ];
}

function ledger(update: (l: { calls: Record<string, unknown>[] }) => void) {
  const l = JSON.parse(readFileSync(LEDGER, "utf8")) as { calls: Record<string, unknown>[] };
  update(l);
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
}

const SUMMARY = "person1 (1. rol / damat) = sentetik A (1990-07-15 14:30 +3 İstanbul), person2 (2. rol / gelin) = sentetik B (1988-03-21 06:45 +2 Ankara), lahiri";

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlanVedicMatch2().map((g) => g.name).join(", "));
    return;
  }
  if (process.env.RUN_VEDIK_ESLESME2_GOLDEN !== "EVET") {
    console.log("RUN_VEDIK_ESLESME2_GOLDEN=EVET verilmedi — ücretli çağrı YAPILMADI.");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanVedicMatch2().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const startedAt = new Date().toISOString();
    ledger((l) => l.calls.push({ agent: AGENT, name: g.name, endpoint: g.endpoint, body: SUMMARY, at: startedAt, result: "BEKLIYOR" }));
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0, query: g.query });
    made += r.attempts;
    const finish = (result: string) =>
      ledger((l) => {
        const e = l.calls.find((c) => c.agent === AGENT && c.name === g.name && c.at === startedAt);
        if (e) Object.assign(e, { result, attempts: r.attempts, finishedAt: new Date().toISOString() });
      });
    if (!r.ok) {
      finish(`BASARISIZ kind=${r.kind} status=${r.status ?? "-"}`);
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      finish("OK ama anahtar metni içeriyor — kaydedilmedi");
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: g.query ?? null, body: g.body, fetchedAt: startedAt, response: r.raw }, null, 2) + "\n");
    finish(`OK ${g.name}.json`);
    console.log(`${g.name}: OK · üst alanlar: ${Object.keys(r.raw as Record<string, unknown>).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek sağlayıcı istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
