/**
 * AYLIK EFEMERİS (2026-11-24) — GOLDEN çağrıları: Batı tropikal + Vedik sideral aylık uçlar (owner bütçesi en çok 100; plan 15).
 *
 *   • Kişisel veri YOK (yalnız yıl + ay). Gövdeler ürünün KENDİ üreticisiyle (lib/astrology/pro/monthly/contract.ts).
 *   • Kapsam: artık yıl Şubatı (2024-02), 30 günlük ay (2026-11), yıl geçişi (2026-12 → 2027-01), yüzyıl artık-olmayan Şubat (Vedik
 *     1900-02), ürün aralığı sınırları (1600-01, 2600-12). Vedik "tropical" iki çağrı YALNIZ tanı içindir (sağlayıcı Lahiri ayanamsası =
 *     tropikal − sideral); ürün Vedik tabloda hep "sidereal" ister.
 *   • 30.10.2026 QA arşivindeki 6 gerçek yanıt (ASTRO-GECE-4-MOTOR) ayrıca `import-archive` adıyla fixture'a aktarılır (çağrı YOK).
 *   • Yanıtlar depoya DEĞİL QA kanıt klasörüne yazılır (MONTHLY_EPHEMERIS_EVIDENCE_DIR ile değiştirilebilir).
 *   • İsim yoksa çağrı YAPILMAZ; fixture varsa çağrı YAPILMAZ; RUN_MONTHLY_EPHEMERIS_GOLDEN=EVET olmadan çağrı YAPILMAZ.
 *     Bir çalıştırmada en çok 20 istek. Yeniden deneme KAPALI; anahtar yazılmaz/loglanmaz/kaydedilmez.
 *
 * Çalıştırma: RUN_MONTHLY_EPHEMERIS_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/monthly-ephemeris-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { MONTHLY_ENDPOINT, monthlyProviderBody, projectMonthly } from "@/lib/astrology/pro/monthly/contract";
import type { MonthlyKind } from "@/lib/astrology/pro/monthly/types";

/** Toplu sağlayıcı verisi DEPOYA KONMAZ (pro-ephemeris-provider ile aynı sözleşme) → yanıtlar QA kanıt klasörüne yazılır. */
export const MONTHLY_GOLDEN_DIR = process.env.MONTHLY_EPHEMERIS_EVIDENCE_DIR || "C:/YasamSistemi-QA/ATLAS-AYLIK-EFEMERIS-2026-11-24/yanit";
const RUN_CAP = 20;

export type MonthlyGolden = { name: string; kind: MonthlyKind; year: number; month: number; coordinateSystem?: "tropical"; purpose: string };

export function monthlyGoldenPlan(): MonthlyGolden[] {
  return [
    { name: "w-2024-02", kind: "western", year: 2024, month: 2, purpose: "artık yıl Şubatı (29 gün)" },
    { name: "w-2026-11", kind: "western", year: 2026, month: 11, purpose: "30 günlük ay; varsayılan (içinde bulunulan) ay" },
    { name: "w-2026-12", kind: "western", year: 2026, month: 12, purpose: "yıl sonu" },
    { name: "w-2027-01", kind: "western", year: 2027, month: 1, purpose: "yıl başı (yıl geçişi)" },
    { name: "w-1600-01", kind: "western", year: 1600, month: 1, purpose: "ürün aralığı alt sınırı" },
    { name: "w-2600-12", kind: "western", year: 2600, month: 12, purpose: "ürün aralığı üst sınırı" },
    { name: "v-2024-02", kind: "vedic", year: 2024, month: 2, purpose: "artık yıl Şubatı (29 gün)" },
    { name: "v-2026-11", kind: "vedic", year: 2026, month: 11, purpose: "30 günlük ay; varsayılan ay" },
    { name: "v-2026-12", kind: "vedic", year: 2026, month: 12, purpose: "yıl sonu" },
    { name: "v-2027-01", kind: "vedic", year: 2027, month: 1, purpose: "yıl başı (yıl geçişi)" },
    { name: "v-1900-02", kind: "vedic", year: 1900, month: 2, purpose: "yüzyıl artık-olmayan Şubat (28 gün)" },
    { name: "v-1600-01", kind: "vedic", year: 1600, month: 1, purpose: "ürün aralığı alt sınırı" },
    { name: "v-2600-12", kind: "vedic", year: 2600, month: 12, purpose: "ürün aralığı üst sınırı" },
    { name: "vt-2026-11", kind: "vedic", year: 2026, month: 11, coordinateSystem: "tropical", purpose: "TANI: sağlayıcı Lahiri ayanamsası = tropikal − sideral" },
    { name: "vt-2024-02", kind: "vedic", year: 2024, month: 2, coordinateSystem: "tropical", purpose: "TANI: sağlayıcı Lahiri ayanamsası = tropikal − sideral" },
  ];
}

/** 30.10.2026 QA arşivi (gerçek sağlayıcı yanıtları; o tarihteki çağrı defterinde kayıtlı) → fixture. Çağrı YOK. */
const ARCHIVE = "C:/YasamSistemi-QA/ASTRO-GECE-4-MOTOR-2026-10-31/ham/yanit";
const ARCHIVE_FILES: Record<string, string> = {
  "w-2026-10": "acd9bef0c4c22ec53988cdbd329cac92",
  "w-2024-03": "97906d2d6d0432d2bc5ad5ffdaf9bbd6",
  "w-1900-02": "e6959ca25d126cb53a7ea8fd74207b20",
  "w-2100-02": "beca61509e8ee7f93c58ada5ee44f57e",
  "v-2026-10": "0f32112a1b6c685b4543e1f99819318b",
  "v-2024-03": "b5b904f9b62a742d44ae88c6feb6aa96",
};

function importArchive() {
  mkdirSync(MONTHLY_GOLDEN_DIR, { recursive: true });
  for (const [name, file] of Object.entries(ARCHIVE_FILES)) {
    const out = join(MONTHLY_GOLDEN_DIR, `${name}.json`);
    if (existsSync(out)) {
      console.log(`${name}: fixture mevcut`);
      continue;
    }
    const j = JSON.parse(readFileSync(join(ARCHIVE, `${file}.json`), "utf8")) as { endpoint: string; body: Record<string, unknown>; raw: unknown; no: number };
    writeFileSync(out, JSON.stringify({ source: `QA arşivi ASTRO-GECE-4-MOTOR-2026-10-31 (çağrı defteri no ${j.no}, 2026-10-30)`, endpoint: j.endpoint, query: null, body: j.body, response: j.raw }) + "\n");
    console.log(`${name}: arşivden aktarıldı`);
  }
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.includes("import-archive")) importArchive();
  const plan = monthlyGoldenPlan().filter((x) => wanted.includes(x.name));
  if (plan.length === 0) {
    console.log("Çağrı adı verilmedi — hiçbir ücretli çağrı yapılmadı. Planlı adlar: " + monthlyGoldenPlan().map((g) => g.name).join(", "));
    return;
  }
  if (process.env.RUN_MONTHLY_EPHEMERIS_GOLDEN !== "EVET") {
    console.log("RUN_MONTHLY_EPHEMERIS_GOLDEN=EVET verilmedi — ücretli çağrı YAPILMADI.");
    return;
  }
  mkdirSync(MONTHLY_GOLDEN_DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of plan) {
    const out = join(MONTHLY_GOLDEN_DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("Sunucu anahtarı yok — çağrı yapılmadı");
      process.exit(2);
    }
    if (made >= RUN_CAP) {
      console.log(`çalıştırma tavanı (${RUN_CAP}) doldu — kalan çağrılar YAPILMADI`);
      break;
    }
    const req = { kind: g.kind, year: g.year, month: g.month };
    const body = g.coordinateSystem ? { ...monthlyProviderBody(req), coordinateSystem: g.coordinateSystem } : monthlyProviderBody(req);
    const at = new Date().toISOString();
    const r = await callRoxy(cfg, MONTHLY_ENDPOINT[g.kind], body, { maxRetries: 0, lang: "en" });
    made += r.attempts;
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw);
    if (json.includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ source: `gerçek sağlayıcı çağrısı ${at}`, purpose: g.purpose, endpoint: MONTHLY_ENDPOINT[g.kind], query: { lang: "en" }, body, response: r.raw }) + "\n");
    const pr = g.coordinateSystem ? null : projectMonthly(req, r.raw);
    console.log(`${g.name}: OK · ${at} · izdüşüm ${pr === null ? "tanı (uygulanmaz)" : pr.ok ? `PASS (${pr.days.length} gün)` : `RED: ${pr.reason}`}`);
  }
  console.log(`bu çalıştırmada gerçek sağlayıcı istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
