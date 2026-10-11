/**
 * ASTROLOJİ AŞAMA 3 — GOLDEN DOĞRULAMA: endpoint başına TEK gerçek Roxy çağrısı (owner onayı 2026-10-07).
 *
 *   • SENTETİK kişiler (gerçek kişi DEĞİL):
 *       A: 1990-07-15 14:30 İstanbul (Aşama 1 golden ile aynı)
 *       B: 1988-03-21 06:45 Ankara
 *   • Gövdeler ürünün KENDİ üreticileriyle kurulur (requests.ts) → gerçek çağrı = ürün gövdesi.
 *   • Fixture dosyası varsa o çağrı YAPILMAZ (yanlışlıkla tekrar ücretli çağrı engellenir).
 *   • Yeniden deneme KAPALI. ROXY_API_KEY yazılmaz/loglanmaz/kaydedilmez; yanıt kaydedilmeden önce
 *     anahtar metni içerip içermediği kontrol edilir. Ekrana yalnız yapı özeti basılır.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase3-golden-calls.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import {
  forecastBody,
  lunarReturnBody,
  pairBody,
  solarReturnBody,
  targetDateBody,
  transitBody,
  type BirthPoint,
} from "@/lib/astrology/providers/roxy/requests";
import { lunarReturnApproxDate, natalMoonLongitude } from "@/lib/astrology/engine/lunarReturnDate";

const DIR = join(__dirname, "..", "fixtures", "golden");

function birth(date: string, time: string, tz: string, lat: number, lon: number): BirthPoint & { utc: string } {
  const t = resolveAstroBirthTime(date, time, tz);
  if (t.kind !== "ok") throw new Error("sentetik zaman çözülemedi");
  return { birthDate: date, birthTime: `${time}:00`, utcOffsetSeconds: t.offsetSeconds, latitude: lat, longitude: lon, utc: t.utcIso };
}

export const SYNTH_A = birth("1990-07-15", "14:30", "Europe/Istanbul", 41.0082, 28.9784);
export const SYNTH_B = birth("1988-03-21", "06:45", "Europe/Istanbul", 39.9334, 32.8597);

export function goldenPlan() {
  const lunarDate = lunarReturnApproxDate(natalMoonLongitude(SYNTH_A.utc), "2026-10");
  if (!lunarDate) throw new Error("lunar return tarihi bulunamadı");
  return [
    { name: "transit", endpoint: "/astrology/transits", body: transitBody(SYNTH_A, { date: "2026-10-07", time: "09:00:00" }, "true") },
    { name: "forecast", endpoint: "/forecast/transits", body: forecastBody(SYNTH_A, "2026-10-01", "2026-12-29") },
    { name: "progression", endpoint: "/astrology/progressions", body: targetDateBody(SYNTH_A, "2026-10-07", "true") },
    { name: "solar-arc", endpoint: "/astrology/solar-arc", body: targetDateBody(SYNTH_A, "2026-10-07", "true") },
    { name: "solar-return", endpoint: "/astrology/solar-return", body: solarReturnBody(SYNTH_A, 2026, "placidus") },
    { name: "lunar-return", endpoint: "/astrology/lunar-return", body: lunarReturnBody(SYNTH_A, lunarDate, "placidus") },
    { name: "synastry", endpoint: "/astrology/synastry", body: pairBody(SYNTH_A, SYNTH_B, "true", "placidus") },
    { name: "composite", endpoint: "/astrology/composite-chart", body: pairBody(SYNTH_A, SYNTH_B, "true", "placidus") },
  ] as const;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan()) {
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
    const raw = r.raw as Record<string, unknown>;
    console.log(`${g.name}: OK · üst alanlar: ${Object.keys(raw).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek Roxy istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
