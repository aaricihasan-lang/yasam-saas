/**
 * ASTROLOJİ AŞAMA 5 — VEDİK GOLDEN: endpoint başına (en fazla) 1 gerçek Roxy çağrısı (owner onayı 2026-10-08).
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki aşamaların golden'ıyla aynı kişi.
 *   • Gövdeler ürünün KENDİ üreticileriyle (requests.ts). timezone her zaman doğum ofseti (Roxy Vedik
 *     varsayılanı 5.5 IST'dir).
 *   • Çağrılar alt aşama bazında İSİMLE çalıştırılır:  … phase5-golden-calls.ts vedic-d1 vedic-d9
 *     İsim verilmezse hiçbir çağrı YAPILMAZ (yanlışlıkla toplu çağrı yok). Fixture varsa çağrı YAPILMAZ.
 *   • Yeniden deneme KAPALI; anahtar yazılmaz/loglanmaz/kaydedilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/phase5-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");

export type GoldenEntry = { name: string; subphase: string; endpoint: string; body: Record<string, unknown>; query?: Record<string, string> };

export function goldenPlan5(): GoldenEntry[] {
  const lahiri = vedicBirthBody(SYNTH_A, "lahiri");
  return [
    { name: "vedic-d1", subphase: "5B", endpoint: "/vedic-astrology/birth-chart", body: lahiri },
    { name: "vedic-d9", subphase: "5D", endpoint: "/vedic-astrology/divisional-chart", body: { ...lahiri, division: 9 } },
    { name: "vedic-dasha-major", subphase: "5E", endpoint: "/vedic-astrology/dasha/major", body: lahiri },
    // Alt dönem uçları yol parametresi alır; adlar 5E'de gerçek mahadasha listesinden seçilir (aşağıda sabit).
    { name: "vedic-dasha-sub-md", subphase: "5E", endpoint: "/vedic-astrology/dasha/sub/{md}", body: lahiri },
    { name: "vedic-dasha-sub-md-ad", subphase: "5E", endpoint: "/vedic-astrology/dasha/sub/{md}/{ad}", body: lahiri },
    { name: "vedic-yoga", subphase: "5F", endpoint: "/vedic-astrology/yoga/detect", body: lahiri },
    { name: "vedic-aspects", subphase: "5F", endpoint: "/vedic-astrology/aspects", body: { date: lahiri.date, time: lahiri.time, latitude: lahiri.latitude, longitude: lahiri.longitude, timezone: lahiri.timezone, coordinateSystem: "sidereal" } },
    { name: "vedic-ashtakavarga", subphase: "5F", endpoint: "/vedic-astrology/ashtakavarga", body: lahiri },
    { name: "vedic-shadbala", subphase: "5F", endpoint: "/vedic-astrology/shadbala", body: lahiri },
    // Panchang uçları ayanamsa almaz (Lahiri sabit) → gövdede ayanamsa YOK.
    { name: "vedic-panchang", subphase: "5F", endpoint: "/vedic-astrology/panchang/basic", body: { date: lahiri.date, time: lahiri.time, latitude: lahiri.latitude, longitude: lahiri.longitude, timezone: lahiri.timezone } },
  ];
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlan5().map((g) => g.name).join(", "));
    return;
  }
  // {md}/{ad} yol parametreleri ortam değişkeniyle (5E'de dasha/major golden'ından okunur).
  const md = process.env.VEDIC_MD ?? "";
  const ad = process.env.VEDIC_AD ?? "";
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlan5().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const endpoint = g.endpoint.replace("{md}", md).replace("{ad}", ad);
    if (/[{}]/.test(endpoint) || /\/\//.test(endpoint) || endpoint.endsWith("/")) {
      console.log(`${g.name}: yol parametresi eksik (VEDIC_MD/VEDIC_AD) — çağrı yapılmadı`);
      continue;
    }
    const r = await callRoxy(cfg, endpoint, g.body, { maxRetries: 0, query: g.query });
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
    writeFileSync(out, JSON.stringify({ endpoint, query: g.query ?? null, body: g.body, response: r.raw }, null, 2) + "\n");
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
