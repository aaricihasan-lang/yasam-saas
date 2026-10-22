/**
 * ATLAS YENİ TEKNİKLER (2026-10-22) — "zamanlama" paketi: KP Ruling Planets ZAMAN ARALIĞI GOLDEN çağrıları (2):
 *   • kp-ruling-interval-a: 2026-10-07 11:30 → 12:30 yerel (+3), 10 dk — mevcut kp.ruling golden anı (12:00) pencerede → aynı an
 *     birebir karşılaştırılır.
 *   • kp-ruling-interval-b: 2026-11-01 07:00 → 08:00 yerel (+3), 10 dk — gün doğumu (07:35) pencerede → gün lordu Cumartesi → Pazar.
 *   • Kişisel veri YOK (yalnız an + konum). İsim yoksa çağrı YAPILMAZ; fixture varsa çağrı YAPILMAZ.
 *   • Ücretli çağrı onayı: RUN_KP_RULING_INTERVAL_GOLDEN=EVET olmadan çağrı YAPILMAZ. Yeniden deneme KAPALI; anahtar yazılmaz.
 *
 * Çalıştırma: RUN_KP_RULING_INTERVAL_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/kp-ruling-interval-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpRulingIntervalBody } from "@/lib/astrology/providers/roxy/kpRulingIntervalBody";
import type { GoldenEntry } from "./phase5-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const ISTANBUL_GEO = { latitude: 41.0082, longitude: 28.9784 };
/** Pencere başlangıçları UTC dakika (yerel 11:30 / 07:00, +3). */
export const RI_A = { startUtc: "2026-10-07T08:30", durationMinutes: 60, intervalMinutes: 10 } as const;
export const RI_B = { startUtc: "2026-11-01T04:00", durationMinutes: 60, intervalMinutes: 10 } as const;

export function goldenPlanKpRulingInterval(): GoldenEntry[] {
  return [
    { name: "kp-ruling-interval-a", subphase: "ZAMANLAMA", endpoint: "/vedic-astrology/kp/ruling-planets-interval", body: kpRulingIntervalBody(RI_A.startUtc, RI_A.durationMinutes, RI_A.intervalMinutes, ISTANBUL_GEO, 3, "kp-newcomb", "mean") },
    { name: "kp-ruling-interval-b", subphase: "ZAMANLAMA", endpoint: "/vedic-astrology/kp/ruling-planets-interval", body: kpRulingIntervalBody(RI_B.startUtc, RI_B.durationMinutes, RI_B.intervalMinutes, ISTANBUL_GEO, 3, "kp-newcomb", "mean") },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlanKpRulingInterval().map((g) => g.name).join(", "));
    return;
  }
  if (process.env.RUN_KP_RULING_INTERVAL_GOLDEN !== "EVET") {
    console.log("RUN_KP_RULING_INTERVAL_GOLDEN=EVET verilmedi — ücretli çağrı YAPILMADI.");
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanKpRulingInterval().filter((x) => wanted.includes(x.name))) {
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
