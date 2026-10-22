/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — "zamanlama" paketi GOLDEN çağrıları: Hora + Choghadiya (2 çağrı; KP Ruling aralığı ayrı betikte):
 *   • panchang-hora / panchang-choghadiya: İstanbul (sentetik konum = kişi A doğum yeri), 2026-11-01, +3 — #498 ayrıntılı Panchanga
 *     golden'ıyla AYNI gün/konum/ofset (gövde aynı üreticiyle).
 *   • Kişisel veri YOK (yalnız an + konum). İsim yoksa çağrı YAPILMAZ; fixture varsa çağrı YAPILMAZ.
 *   • Ücretli çağrı onayı: RUN_ZAMANLAMA_GOLDEN=EVET olmadan çağrı YAPILMAZ. Yeniden deneme KAPALI; anahtar yazılmaz.
 *
 * Çalıştırma: RUN_ZAMANLAMA_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/zamanlama-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicPanchangDetailedBody } from "@/lib/astrology/providers/roxy/requests";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const HOURS_GOLDEN_DATE = "2026-11-01";
export const ISTANBUL_GEO = { latitude: 41.0082, longitude: 28.9784 };

export function goldenPlanZamanlama(): GoldenEntry[] {
  const day = vedicPanchangDetailedBody(HOURS_GOLDEN_DATE, ISTANBUL_GEO, 3);
  return [
    { name: "vedic-panchang-hora", subphase: "ZAMANLAMA", endpoint: "/vedic-astrology/panchang/hora", body: day },
    { name: "vedic-panchang-choghadiya", subphase: "ZAMANLAMA", endpoint: "/vedic-astrology/panchang/choghadiya", body: day },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlanZamanlama().map((g) => g.name).join(", "));
    return;
  }
  if (process.env.RUN_ZAMANLAMA_GOLDEN !== "EVET") {
    console.log("RUN_ZAMANLAMA_GOLDEN=EVET verilmedi — ücretli çağrı YAPILMADI.");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanZamanlama().filter((x) => wanted.includes(x.name))) {
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
  console.log(`bu çalıştırmada gerçek sağlayıcı istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
