/**
 * ATLAS P2 AŞAMA 2 (2026-10-21) — Dasha derinliği (Sookshma · Prana · güncel dönem) + Ayrıntılı Panchanga GOLDEN çağrıları.
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki dasha golden'larıyla AYNI kişi (major/sub fixture'ları var).
 *   • An: 2026-11-01 09:00 UTC (= doğum ofsetinde 12:00). Yol: Moon / Rahu / Ketu (Lahiri; bu anı içeren pratyantardasha) ve
 *     Sookshma Moon (bu anı içeren sookshma) — sentetik modelle önceden seçildi.
 *   • Ayrıntılı Panchanga: İstanbul (sentetik konum = profil doğum yeri), 2026-11-01, +3.
 *   • Gövdeler ürünün KENDİ üreticileriyle (requests.ts). İsimle çalışır; isim yoksa çağrı YAPILMAZ; fixture varsa çağrı YAPILMAZ.
 *   • Ücretli çağrı onayı: RUN_DASHA_PANCHANGA_GOLDEN=EVET olmadan çağrı YAPILMAZ. Yeniden deneme KAPALI; anahtar yazılmaz.
 *
 * Çalıştırma: RUN_DASHA_PANCHANGA_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/dasha-panchanga-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody, vedicDashaCurrentBody, vedicPanchangDetailedBody } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const DASHA_GOLDEN_AT = "2026-11-01T09:00";
export const DASHA_GOLDEN_PATH = ["Moon", "Rahu", "Ketu", "Moon"] as const;
export const PANCHANG_DETAIL_DATE = "2026-11-01";

export function goldenPlanDashaPanchanga(): GoldenEntry[] {
  const lahiri = vedicBirthBody(SYNTH_A, "lahiri");
  const [md, ad, pd, sd] = DASHA_GOLDEN_PATH;
  return [
    { name: "vedic-dasha-sub-md-ad-pd", subphase: "P2A2", endpoint: `/vedic-astrology/dasha/sub/${md}/${ad}/${pd}`, body: lahiri },
    { name: "vedic-dasha-sub-md-ad-pd-sd", subphase: "P2A2", endpoint: `/vedic-astrology/dasha/sub/${md}/${ad}/${pd}/${sd}`, body: lahiri },
    { name: "kp-dasha-current", subphase: "P2A2", endpoint: "/vedic-astrology/dasha/current", body: vedicDashaCurrentBody(SYNTH_A, "kp-newcomb", DASHA_GOLDEN_AT, { nodeType: "mean" }) },
    { name: "vedic-dasha-current", subphase: "P2A2", endpoint: "/vedic-astrology/dasha/current", body: vedicDashaCurrentBody(SYNTH_A, "lahiri", DASHA_GOLDEN_AT, null) },
    { name: "vedic-panchang-detailed", subphase: "P2A2", endpoint: "/vedic-astrology/panchang/detailed", body: vedicPanchangDetailedBody(PANCHANG_DETAIL_DATE, { latitude: SYNTH_A.latitude, longitude: SYNTH_A.longitude }, 3) },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlanDashaPanchanga().map((g) => g.name).join(", "));
    return;
  }
  if (process.env.RUN_DASHA_PANCHANGA_GOLDEN !== "EVET") {
    console.log("RUN_DASHA_PANCHANGA_GOLDEN=EVET verilmedi — ücretli çağrı YAPILMADI.");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanDashaPanchanga().filter((x) => wanted.includes(x.name))) {
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
