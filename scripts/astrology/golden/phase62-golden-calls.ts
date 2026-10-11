/**
 * ASTROLOJİ AŞAMA 6.2 — KP Rahu/Ketu son doğrulaması: EN FAZLA 3 gerçek sentetik Roxy çağrısı (owner onayı).
 *
 * Tasarım: scripts/astrology/golden/phase62-design.ts (yerel astronomi; hipotez ızgarası). Her çağrının sınadığı
 * hipotez ASTROLOGY-PHASE6-2-PROGRESS.md'de çağrıdan ÖNCE kayıtlıdır.
 *   • kp62-dasha-x1 — X1 (1967-10-21 07:30 İstanbul): Jüpiter 9. bakışı Rahu'ya; Merkür Ketu burcunda 19.5° uzak (A tipi)
 *   • kp62-dasha-x2 — X2 (1983-06-17 İstanbul, UTC 20:00): Satürn 3. bakışı Ketu'ya; Mars komşu burçta Rahu'ya 2.8° (B tipi)
 *   • kp62-ruling-x1 — X1 natal + an 2026-10-12 10:05 UTC (Ay Swati = Rahu yıldızı, Lagna Mula = Ketu yıldızı)
 * Gerçek kişi verisi YOK. İsimle çalışır; fixture varsa çağrı YAPILMAZ; yeniden deneme KAPALI; tasarım koşulu tutmazsa çağrı YAPILMAZ.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase62-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpRulingBody, vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import type { GoldenEntry } from "./phase5-golden-calls";
import { chartAt, margin, signOf, starOf } from "./phase62-design";

const DIR = join(__dirname, "..", "fixtures", "golden");
const LAT = 41.0082, LON = 28.9784;

function synth(date: string, time: string, expectUtc: string) {
  const t = resolveAstroBirthTime(date, time, "Europe/Istanbul");
  if (t.kind !== "ok") throw new Error(`sentetik zaman çözülemedi: ${date} ${time}`);
  if (Date.parse(t.utcIso) !== Date.parse(expectUtc)) throw new Error(`tasarım UTC'si tutmuyor: ${t.utcIso} ≠ ${expectUtc}`);
  return { birthDate: date, birthTime: `${time}:00`, utcOffsetSeconds: t.offsetSeconds, latitude: LAT, longitude: LON, utc: t.utcIso };
}
export const SYNTH_X1 = synth("1967-10-21", "07:30", "1967-10-21T05:30:00Z");
export const SYNTH_X2 = synth("1983-06-17", localHm("1983-06-17T20:00:00Z"), "1983-06-17T20:00:00Z");
export const KP62_RULING_AT = "2026-10-12T10:05";

function localHm(utc: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(utc));
}

/** Çağrı öncesi tasarım koşulları (yerel model): tutmazsa çağrı yapılmaz. */
export function designChecks(): Record<string, boolean> {
  const sep = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  const x1 = chartAt(Date.parse(SYNTH_X1.utc), LAT, LON);
  const x2 = chartAt(Date.parse(SYNTH_X2.utc), LAT, LON);
  const r = chartAt(Date.parse(`${KP62_RULING_AT}:00Z`), LAT, LON);
  const NAK = 360 / 27;
  return {
    "X1 Jüpiter Rahu'ya 9. bakış": (signOf(x1.lon.rahu) - signOf(x1.lon.jupiter) + 12) % 12 === 8,
    "X1 Merkür Ketu burcunda ≥18° uzak": signOf(x1.lon.mercury) === signOf(x1.lon.ketu) && sep(x1.lon.mercury, x1.lon.ketu) >= 18,
    "X1 sınır payı ≥ 1°": margin(x1) >= 1,
    "X2 Satürn Ketu'ya 3. bakış": (signOf(x2.lon.ketu) - signOf(x2.lon.saturn) + 12) % 12 === 2,
    "X2 Mars komşu burçta Rahu'ya ≤ 3°": signOf(x2.lon.mars) !== signOf(x2.lon.rahu) && sep(x2.lon.mars, x2.lon.rahu) <= 3,
    "X2 sınır payı ≥ 1°": margin(x2) >= 1,
    "Ruling: Ay Rahu yıldızında": starOf(r.lon.moon) === "rahu" && Math.min(r.lon.moon % NAK, NAK - (r.lon.moon % NAK)) > 2,
    "Ruling: Lagna Ketu yıldızında": starOf(r.cusps[0]) === "ketu" && Math.min(r.cusps[0] % NAK, NAK - (r.cusps[0] % NAK)) > 2,
  };
}

export function goldenPlan62(): GoldenEntry[] {
  return [
    { name: "kp62-dasha-x1", subphase: "6.2", endpoint: "/vedic-astrology/dasha/major", body: { ...vedicBirthBody(SYNTH_X1, "kp-newcomb"), significators: true, nodeType: "mean" } },
    { name: "kp62-dasha-x2", subphase: "6.2", endpoint: "/vedic-astrology/dasha/major", body: { ...vedicBirthBody(SYNTH_X2, "kp-newcomb"), significators: true, nodeType: "mean" } },
    { name: "kp62-ruling-x1", subphase: "6.2", endpoint: "/vedic-astrology/kp/ruling-planets", body: kpRulingBody(SYNTH_X1, KP62_RULING_AT, "mean") },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  const checks = designChecks();
  for (const [k, v] of Object.entries(checks)) console.log(`${v ? "✓" : "✗"} ${k}`);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı: " + goldenPlan62().map((g) => `${g.name} ${JSON.stringify(g.body)}`).join("\n  "));
    return;
  }
  if (!Object.values(checks).every(Boolean)) {
    console.log("Tasarım koşulu tutmuyor — çağrı YAPILMADI");
    process.exit(2);
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan62().filter((x) => wanted.includes(x.name))) {
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
