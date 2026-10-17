/**
 * TRANSİT-03 — KP zaman aralığı GOLDEN: 3 gerçek Roxy çağrısı. ⚠ OWNER ONAYI GEREKİR — onaysız ÇALIŞTIRMAYIN.
 *
 *   1) kp-sublord-moon     POST /vedic-astrology/kp/sublord-changes  Ay, 2026-10-07 … 2026-10-08 (≈ 18 geçiş)
 *   2) kp-rasi-moon        POST /vedic-astrology/kp/rasi-changes     Ay, 2026-10-01 … 2026-10-31 (≈ 13 geçiş)
 *   3) kp-planets-range    POST /vedic-astrology/kp/planets-interval 2026-10-07 00:00 … 18:00 UTC, 6 saatte bir (4 nokta)
 * Hepsi KP-Newcomb + ortalama düğüm + timezone 0; gövdeler ürünün KENDİ üreticileriyle (önbellek anahtarıyla birebir).
 *
 * Güvenlik: (a) RUN_TRANSIT03_GOLDEN=EVET olmadan HİÇBİR çağrı yapılmaz; (b) isimle çalışır; (c) fixture varsa çağrı YAPILMAZ;
 * (d) yeniden deneme KAPALI; (e) anahtar kaydedilmez. Sonrasında doğrulama: npm run test:astrology:transit03 (golden varsa
 * adaptör kabulü + bağımsız astronomiyle kesinleşme anı / konum karşılaştırması otomatik koşar).
 *
 * Çalıştırma (onaydan SONRA): RUN_TRANSIT03_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/transit03-golden-calls.ts kp-sublord-moon kp-rasi-moon kp-planets-range
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpChangesBody, kpPlanetsRangeBody } from "@/lib/astrology/providers/roxy/requests";

const DIR = join(__dirname, "..", "fixtures", "golden");
const ISTANBUL = { latitude: 41.0082, longitude: 28.9784 };

export function goldenPlanTransit03(): { name: string; endpoint: string; body: Record<string, unknown> }[] {
  return [
    { name: "kp-sublord-moon", endpoint: "/vedic-astrology/kp/sublord-changes", body: kpChangesBody("moon", "2026-10-07", "2026-10-08", "kp-newcomb", "mean") },
    { name: "kp-rasi-moon", endpoint: "/vedic-astrology/kp/rasi-changes", body: kpChangesBody("moon", "2026-10-01", "2026-10-31", "kp-newcomb", "mean") },
    { name: "kp-planets-range", endpoint: "/vedic-astrology/kp/planets-interval", body: kpPlanetsRangeBody("2026-10-07", 1, 360, ISTANBUL, "kp-newcomb", "mean") },
  ];
}

async function main() {
  if (process.env.RUN_TRANSIT03_GOLDEN !== "EVET") {
    console.log("RUN_TRANSIT03_GOLDEN=EVET verilmedi — hiçbir çağrı yapılmadı (owner onayı gerekir). Planlı: " + goldenPlanTransit03().map((g) => g.name).join(", "));
    return;
  }
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı.");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanTransit03().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
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
