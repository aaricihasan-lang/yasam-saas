/**
 * ASTROLOJİ — EK NOKTALAR GOLDEN DOĞRULAMA (2026-10-22; pay: en çok 4 gerçek çağrı, "ek-noktalar").
 *
 *   • SENTETİK kişiler (gerçek kişi DEĞİL):
 *       A: 1990-07-15 14:30 İstanbul (+3) — natal golden (fixtures/roxy-natal-golden-2026-10-07.json) ile AYNI doğum
 *       N: 1990-07-15 23:30 İstanbul (+3) — GECE doğumu (Güneş ufkun altında) → lotların gece formülü
 *   • Gövdeler ürünün KENDİ üreticileriyle (providers/roxy/extraPoints.ts) kurulur → gerçek çağrı = ürün gövdesi; lang=tr.
 *   • Çağrılar: A asteroids · A arabic-lots · A lilith · N arabic-lots (toplam 4).
 *   • Fixture dosyası varsa o çağrı YAPILMAZ. Yeniden deneme KAPALI. Onay ortamı zorunlu: EXTRA_POINTS_GOLDEN_OK=1.
 *   • Anahtar yazılmaz/loglanmaz/kaydedilmez. Ortak defter: C:/YasamSistemi-QA/ATLAS-YENI-TEKNIKLER-2026-10-22/roxy-ledger.json
 *     (çağrıdan ÖNCE kayıt, SONRA sonuç).
 *
 * Çalıştırma: EXTRA_POINTS_GOLDEN_OK=1 npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/extra-points-golden-calls.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { resolveAstroBirthTime } from "@/lib/astrology/birth/timeResolution";
import { asteroidsBody, lilithBody, lotsBody, ROXY_EXTRA_POINTS } from "@/lib/astrology/providers/roxy/extraPoints";
import type { BirthPoint } from "@/lib/astrology/providers/roxy/requests";

const DIR = join(__dirname, "..", "fixtures", "golden");
const SHARED_LEDGER = "C:/YasamSistemi-QA/ATLAS-YENI-TEKNIKLER-2026-10-22/roxy-ledger.json";
const AGENT = "ek-noktalar";

function birth(date: string, time: string, tz: string, lat: number, lon: number): BirthPoint {
  const t = resolveAstroBirthTime(date, time, tz);
  if (t.kind !== "ok") throw new Error("sentetik zaman çözülemedi");
  return { birthDate: date, birthTime: `${time}:00`, utcOffsetSeconds: t.offsetSeconds, latitude: lat, longitude: lon };
}
export const EXTRA_A = birth("1990-07-15", "14:30", "Europe/Istanbul", 41.0082, 28.9784);
export const EXTRA_NIGHT = birth("1990-07-15", "23:30", "Europe/Istanbul", 41.0082, 28.9784);

export function goldenPlanExtraPoints() {
  return [
    { name: "extra-asteroids", endpoint: ROXY_EXTRA_POINTS.asteroids.endpoint, body: asteroidsBody(EXTRA_A, "placidus"), who: "A 1990-07-15 14:30 İstanbul +3, placidus" },
    { name: "extra-lots", endpoint: ROXY_EXTRA_POINTS.lots.endpoint, body: lotsBody(EXTRA_A), who: "A 1990-07-15 14:30 İstanbul +3 (gündüz)" },
    { name: "extra-lilith", endpoint: ROXY_EXTRA_POINTS.lilith.endpoint, body: lilithBody(EXTRA_A, "placidus"), who: "A 1990-07-15 14:30 İstanbul +3, placidus" },
    { name: "extra-lots-night", endpoint: ROXY_EXTRA_POINTS.lots.endpoint, body: lotsBody(EXTRA_NIGHT), who: "N 1990-07-15 23:30 İstanbul +3 (gece, sentetik)" },
  ] as const;
}

type Ledger = { calls: Record<string, unknown>[] } & Record<string, unknown>;
function ledgerUpdate(fn: (l: Ledger) => void) {
  const l = JSON.parse(readFileSync(SHARED_LEDGER, "utf8")) as Ledger;
  fn(l);
  writeFileSync(SHARED_LEDGER, JSON.stringify(l, null, 2) + "\n");
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  let made = 0;
  for (const g of goldenPlanExtraPoints()) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (process.env.EXTRA_POINTS_GOLDEN_OK !== "1") {
      console.log(`${g.name}: onay ortamı yok (EXTRA_POINTS_GOLDEN_OK=1) — çağrı yapılmadı`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    const used = (JSON.parse(readFileSync(SHARED_LEDGER, "utf8")) as Ledger).calls.filter((c) => c.agent === AGENT).length;
    if (used >= 4) {
      console.log(`${g.name}: pay doldu (${used}/4) — çağrı yapılmadı`);
      continue;
    }
    const at = new Date().toISOString();
    ledgerUpdate((l) => l.calls.push({ agent: AGENT, name: g.name, endpoint: g.endpoint, body: g.who, at, result: "pending" }));
    const r = await callRoxy(cfg, g.endpoint, g.body as Record<string, unknown>, { maxRetries: 0 });
    made += r.attempts;
    ledgerUpdate((l) => {
      const e = l.calls.find((c) => c.agent === AGENT && c.name === g.name && c.at === at);
      if (e) Object.assign(e, { result: r.ok ? "ok" : `fail:${r.kind}`, status: r.ok ? 200 : (r.status ?? null), attempts: r.attempts, doneAt: new Date().toISOString() });
    });
    if (!r.ok) {
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: { lang: "tr" }, body: g.body, response: r.raw }, null, 2) + "\n");
    console.log(`${g.name}: OK · üst alanlar ${Object.keys(r.raw as object).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
