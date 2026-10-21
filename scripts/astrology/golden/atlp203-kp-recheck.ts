/**
 * ATL-P2-03 — KP transit KONTROLLÜ YENİDEN DOĞRULAMA (21.10.2026; ortak defterde "kp-transit" payı EN FAZLA 2 ücretli çağrı).
 *
 *   (i)  planets-interval Mars 2036-03-06T00:00Z kp-newcomb: sağlayıcı bölünmüş sub 2. parçasında hâlâ KP 22 mi veriyor (doğrusu 23)?
 *   (ii) sublord-changes Merkür 2026-06-01…2026-08-31 kp-newcomb: ileri çıkış (Haz 23 / Ağu 5, 62|63→64), GERİ giriş
 *        (Tem 6, 64→63) ve geri çıkış (Tem 8, 62→61) — bağımsız tahmin: ham/atl-p2-03/mercury_sublord_indep_cikti.jsonl.
 *
 * Kurallar (kodla zorlanır):
 *   • RUN_ATLP203_GOLDEN=EVET ve ATLP203_LEDGER (ortak defter yolu) verilmeden çağrı YOK.
 *   • Fixture zaten varsa istek YAPILMAZ. Defterde "kp-transit" ajanının ≥2 kaydı varsa yeni istek GÖNDERİLMEZ.
 *   • Her girişim istekten ÖNCE deftere yazılır (amaç, uç, sentetik gövde özeti); sonuç sonra eklenir. Yeniden deneme KAPALI.
 *   • Anahtar deftere / fixture'a yazılmaz; yanıt anahtar metnini içeriyorsa kaydedilmez. Kişi verisi YOK (gökyüzü anı; konum 0/0).
 *
 * Çalıştırma: RUN_ATLP203_GOLDEN=EVET ATLP203_LEDGER=<defter.json> npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/atlp203-kp-recheck.ts <ad…>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpChangesBody, kpPlanetsAtBody } from "@/lib/astrology/providers/roxy/requests";

const DIR = join(__dirname, "..", "fixtures", "golden");
const AGENT = "kp-transit";
const CAP = 2;

type Plan = { name: string; endpoint: string; body: Record<string, unknown>; why: string; summary: string };
export function atlp203Plan(): Plan[] {
  return [
    {
      name: "kp-planets-mars-2036-split",
      endpoint: "/vedic-astrology/kp/planets-interval",
      body: kpPlanetsAtBody("2036-03-06T00:00", { latitude: 0, longitude: 0 }, "kp-newcomb", "mean"),
      why: "ATL-P2-03 (i): Mars 30.06° (Krittika/Rahu 2. parça) — sağlayıcı KP 22 mi 23 mü veriyor",
      summary: "gökyüzü anı 2036-03-06T00:00Z, 15 dk aralık, konum 0/0, timezone 0, kp-newcomb, mean",
    },
    {
      name: "kp-sublord-mercury-retro-2026",
      endpoint: "/vedic-astrology/kp/sublord-changes",
      body: kpChangesBody("mercury", "2026-06-01", "2026-08-31", "kp-newcomb", "mean"),
      why: "ATL-P2-03 (ii): Merkür retro — bölünmüş sub 62/63'e geri giriş (64→63) ve geri çıkış; ileri çıkışlar",
      summary: "Mercury 2026-06-01…2026-08-31, timezone 0, kp-newcomb, mean",
    },
  ];
}

type Row = { agent: string; name: string; purpose: string; endpoint: string; body_summary: string; planned_at: string; result?: string; done_at?: string };
type Ledger = { budget_total: number; allocation: Record<string, number>; calls: Row[] };

async function main() {
  const ledgerPath = process.env.ATLP203_LEDGER;
  if (process.env.RUN_ATLP203_GOLDEN !== "EVET" || !ledgerPath) {
    console.log("RUN_ATLP203_GOLDEN=EVET / ATLP203_LEDGER verilmedi — hiçbir çağrı yapılmadı.");
    return;
  }
  const cfg = readAstroRoxyConfig();
  if (!cfg) {
    console.log("anahtar yok — çağrı yapılmadı");
    process.exit(2);
  }
  const read = (): Ledger => JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger;
  const write = (l: Ledger) => writeFileSync(ledgerPath, JSON.stringify(l, null, 1) + "\n");
  for (const g of atlp203Plan().filter((x) => process.argv.slice(2).includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — istek YAPILMADI`);
      continue;
    }
    const l0 = read();
    const mine = l0.calls.filter((c) => c.agent === AGENT).length;
    const total = l0.calls.length;
    if (mine >= Math.min(CAP, l0.allocation[AGENT] ?? 0) || total >= l0.budget_total) {
      console.log(`ÜST SINIR: ${AGENT} ${mine}/${CAP}, toplam ${total}/${l0.budget_total} — ${g.name} GÖNDERİLMEDİ`);
      break;
    }
    const row: Row = { agent: AGENT, name: g.name, purpose: g.why, endpoint: g.endpoint, body_summary: g.summary, planned_at: new Date().toISOString() };
    l0.calls.push(row);
    write(l0); // istekten ÖNCE
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0 });
    let result: string;
    if (!r.ok) result = `BAŞARISIZ ${r.kind} (HTTP ${r.status ?? "-"}, ${r.attempts} deneme)`;
    else if (JSON.stringify(r.raw).includes(cfg.apiKey)) result = "yanıt anahtar metni içeriyor — KAYDEDİLMEDİ";
    else {
      writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: null, body: g.body, response: r.raw, note: g.why }, null, 2) + "\n");
      result = `OK 200 (${r.attempts} deneme) — fixture scripts/astrology/fixtures/golden/${g.name}.json`;
    }
    const l1 = read(); // başka ajanların eşzamanlı kayıtlarını koru
    const mineRow = l1.calls.find((c) => c.agent === AGENT && c.name === g.name && c.planned_at === row.planned_at);
    if (mineRow) Object.assign(mineRow, { result, done_at: new Date().toISOString() });
    write(l1);
    console.log(`${g.name}: ${result}`);
  }
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("doğrulama hata:", (e as Error).message);
    process.exit(1);
  });
}
