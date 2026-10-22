/**
 * ASTROLOJİ — VEDİK HARİTA golden'ı (22.10.2026): Bhav Chalit · Chara Karaka · Arudha Pada · Bhava Bala.
 *
 *   • SENTETİK kişi A (1990-07-15 14:30 İstanbul, +3) — önceki aşamaların golden'ıyla aynı kişi.
 *   • Gövdeler ürünün KENDİ üreticileriyle (requests.ts + vedicHarita.ts). timezone her zaman doğum ofseti.
 *   • Çağrılar İSİMLE çalıştırılır; isim verilmezse hiçbir çağrı YAPILMAZ. Fixture varsa çağrı YAPILMAZ.
 *   • Yeniden deneme KAPALI; anahtar yazılmaz/loglanmaz/kaydedilmez. Pay: en çok 5 çağrı ("vedik-harita").
 *   • Her çağrıdan ÖNCE ortak deftere kayıt eklenir, SONRA sonuç yazılır (VEDIK_HARITA_LEDGER yolu).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/vedik-harita-golden-calls.ts <isim…>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { vedicBirthBody } from "@/lib/astrology/providers/roxy/requests";
import { charaKarakaBody, ROXY_VEDIC_ARUDHA, ROXY_VEDIC_BHAV_CHALIT, ROXY_VEDIC_BHAVA_BALA, ROXY_VEDIC_CHARA_KARAKA } from "@/lib/astrology/providers/roxy/vedicHarita";
import { SYNTH_A } from "./phase3-golden-calls";

const DIR = join(__dirname, "..", "fixtures", "golden");
const LEDGER = process.env.VEDIK_HARITA_LEDGER ?? "";
const AGENT = "vedik-harita";
const BUDGET = 5;

export type GoldenEntry = { name: string; endpoint: string; body: Record<string, unknown> };

export function goldenPlanVedikHarita(): GoldenEntry[] {
  const lahiri = vedicBirthBody(SYNTH_A, "lahiri");
  return [
    { name: "vedic-bhav-chalit", endpoint: ROXY_VEDIC_BHAV_CHALIT.endpoint, body: lahiri },
    { name: "vedic-chara-karakas-eight", endpoint: ROXY_VEDIC_CHARA_KARAKA.endpoint, body: charaKarakaBody(SYNTH_A, "lahiri", "eight") },
    { name: "vedic-arudha", endpoint: ROXY_VEDIC_ARUDHA.endpoint, body: lahiri },
    { name: "vedic-bhava-bala", endpoint: ROXY_VEDIC_BHAVA_BALA.endpoint, body: lahiri },
    // Yedek (5.): 7'li karaka şeması (Rahu hariç) — iki şemanın gerçek yanıt farkını belgelemek için.
    { name: "vedic-chara-karakas-seven", endpoint: ROXY_VEDIC_CHARA_KARAKA.endpoint, body: charaKarakaBody(SYNTH_A, "lahiri", "seven") },
  ];
}

type Ledger = { calls: Record<string, unknown>[] };
function ledgerRead(): Ledger {
  return JSON.parse(readFileSync(LEDGER, "utf8")) as Ledger;
}
function ledgerAppend(entry: Record<string, unknown>): number {
  const l = ledgerRead();
  l.calls.push(entry);
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
  return l.calls.length - 1;
}
function ledgerFinish(name: string, at: string, patch: Record<string, unknown>) {
  const l = ledgerRead();
  const i = l.calls.findIndex((c) => c.agent === AGENT && c.name === name && c.at === at);
  if (i >= 0) Object.assign(l.calls[i], patch);
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + "\n");
}

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.log("İsim verilmedi — hiçbir çağrı yapılmadı. Planlı adlar: " + goldenPlanVedikHarita().map((g) => g.name).join(", "));
    return;
  }
  if (!LEDGER || !existsSync(LEDGER)) {
    console.log("Defter yolu (VEDIK_HARITA_LEDGER) yok — çağrı yapılmadı");
    process.exit(2);
  }
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  const used = () => ledgerRead().calls.filter((c) => c.agent === AGENT).length;
  let made = 0;
  for (const g of goldenPlanVedikHarita().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — çağrı YAPILMADI`);
      continue;
    }
    if (!cfg) {
      console.log("ROXY_API_KEY yok — çağrı yapılmadı");
      process.exit(2);
    }
    if (used() >= BUDGET) {
      console.log(`${g.name}: pay doldu (${BUDGET}) — çağrı YAPILMADI`);
      continue;
    }
    const at = new Date().toISOString();
    const extra = g.body.scheme ? `, scheme ${String(g.body.scheme)}` : "";
    ledgerAppend({ agent: AGENT, name: g.name, endpoint: g.endpoint, body: `sentetik A (1990-07-15 14:30 +3 İstanbul), lahiri${extra}`, at });
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0 });
    made += r.attempts;
    if (!r.ok) {
      ledgerFinish(g.name, at, { result: `BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"}`, attempts: r.attempts, finishedAt: new Date().toISOString() });
      console.log(`${g.name}: BAŞARISIZ kind=${r.kind} status=${r.status ?? "-"} (deneme ${r.attempts})`);
      continue;
    }
    const json = JSON.stringify(r.raw, null, 2);
    if (json.includes(cfg.apiKey)) {
      ledgerFinish(g.name, at, { result: "yanıt anahtar metni içeriyor — KAYDEDİLMEDİ", attempts: r.attempts, finishedAt: new Date().toISOString() });
      console.log(`${g.name}: yanıt anahtar metni içeriyor — KAYDEDİLMEDİ`);
      continue;
    }
    writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: null, body: g.body, response: r.raw }, null, 2) + "\n");
    ledgerFinish(g.name, at, { result: `OK ${g.name}.json`, attempts: r.attempts, finishedAt: new Date().toISOString() });
    console.log(`${g.name}: OK · üst alanlar: ${Object.keys(r.raw as Record<string, unknown>).join(", ")}`);
  }
  console.log(`bu çalıştırmada gerçek istek sayısı: ${made}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("golden hata:", (e as Error).message);
    process.exit(1);
  });
}
