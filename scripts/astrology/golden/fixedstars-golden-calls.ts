/**
 * ASTROLOJİ — SABİT YILDIZLAR GOLDEN DOĞRULAMA (owner talimatı 2026-10-14; bütçe ≤ 300 gerçek istek).
 *
 *   • SENTETİK kişiler (gerçek kişi DEĞİL):
 *       A: 1990-07-15 14:30 İstanbul (Aşama 1/3 golden ile aynı)
 *       C: 1997-03-18 12:00 Ankara — tasarım: ortalama Kara Ay (Lilith) ≈ Regulus (yerel Meeus hesabı, Δ≈0,01°);
 *          Roxy'nin Lilith'i kavuşum noktası olarak sayıp saymadığını ölçmek için.
 *   • Gövdeler ürünün KENDİ üreticileriyle (requests.ts fixedStarsBody) kurulur → gerçek çağrı = ürün gövdesi.
 *   • Çağrılar: A orb=3 (ürün sorgusu), A orb=1 (filtre eşdeğerliği kanıtı), A orb=3 ortalama düğüm (nodeType etkisi),
 *     A orb=3 TEKRAR (tekrar üretilebilirlik), C orb=3 (Lilith).
 *   • Fixture dosyası varsa o çağrı YAPILMAZ. Yeniden deneme KAPALI. Anahtar yazılmaz/loglanmaz/kaydedilmez.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/fixedstars-golden-calls.ts
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { fixedStarsBody, type BirthPoint } from "@/lib/astrology/providers/roxy/requests";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
export const LEDGER = join(__dirname, "..", "fixtures", "golden", "roxy-call-ledger-2026-10-14.jsonl");

function birth(date: string, time: string, tz: string, lat: number, lon: number): BirthPoint {
  const t = resolveAstroBirthTime(date, time, tz);
  if (t.kind !== "ok") throw new Error("sentetik zaman çözülemedi");
  return { birthDate: date, birthTime: `${time}:00`, utcOffsetSeconds: t.offsetSeconds, latitude: lat, longitude: lon };
}
export const SYNTH_C = birth("1997-03-18", "12:00", "Europe/Istanbul", 39.9334, 32.8597);

export function goldenPlanFixedStars() {
  return [
    { name: "fixed-stars", query: { orb: "3" }, body: fixedStarsBody(SYNTH_A, "true") },
    { name: "fixed-stars-orb1", query: { orb: "1" }, body: fixedStarsBody(SYNTH_A, "true") },
    { name: "fixed-stars-mean", query: { orb: "3" }, body: fixedStarsBody(SYNTH_A, "mean") },
    { name: "fixed-stars-repeat", query: { orb: "3" }, body: fixedStarsBody(SYNTH_A, "true") },
    { name: "fixed-stars-lilith", query: { orb: "3" }, body: fixedStarsBody(SYNTH_C, "true") },
  ] as const;
}

export function ledger(entry: Record<string, unknown>) {
  appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanFixedStars()) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const r = await callRoxy(cfg, "/astrology/fixed-stars", g.body as Record<string, unknown>, { maxRetries: 0, query: g.query });
    made += r.attempts;
    ledger({ purpose: `golden ${g.name}`, endpoint: "/astrology/fixed-stars", query: g.query, attempts: r.attempts, ok: r.ok, status: r.ok ? 200 : (r.status ?? null) });
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: "/astrology/fixed-stars", query: g.query, body: g.body, response: r.raw }, null, 2) + "\n");
    const raw = r.raw as { stars?: unknown[]; conjunctions?: unknown[] };
    console.log(`${g.name}: OK · yıldız ${raw.stars?.length ?? "?"} · kavuşum ${raw.conjunctions?.length ?? "?"}`);
  }
  console.log(`bu çalıştırmada gerçek Roxy istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
