/**
 * TRANSİT-03 — KP zaman aralığı GERÇEK SAĞLAYICI DOĞRULAMASI (owner onayı 17.10.2026: EN FAZLA 10 gerçek istek).
 *
 * Kurallar (kodla zorlanır):
 *   • Her girişim, istek GÖNDERİLMEDEN ÖNCE deftere yazılır (başarısız / HTTP hata dahil sayılır); defterde ≥10 girişim
 *     varsa yeni istek GÖNDERİLMEZ. Yeniden deneme KAPALI (maxRetries 0).
 *   • İsimle çalışır; fixture zaten varsa istek yapılmaz (aynı sonuç tekrar sorgulanmaz).
 *   • API anahtarı deftere / fixture'a yazılmaz; yanıt anahtar metnini içeriyorsa kaydedilmez.
 *   • Kişi verisi YOK: KP zaman aralığı uçları doğum verisi almaz; planets-interval'daki konum sentetik (İstanbul merkezi).
 *
 * Çalıştırma: RUN_TRANSIT03_GOLDEN=EVET npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/golden/transit03-real-verify.ts <ad…>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAstroRoxyConfig } from "@/lib/astrology/config";
import { callRoxy } from "@/lib/astrology/providers/roxy/client";
import { kpChangesBody, kpPlanetsRangeBody } from "@/lib/astrology/providers/roxy/requests";

export const TRANSIT03_CALL_CAP = 10;
const DIR = join(__dirname, "..", "fixtures", "golden");
const LEDGER = join(__dirname, "..", "fixtures", "transit03-call-ledger.json"); // golden klasörü DIŞINDA (golden tarayıcıları karıştırmasın)
const ISTANBUL = { latitude: 41.0082, longitude: 28.9784 };

type Plan = { name: string; endpoint: string; body: Record<string, unknown>; why: string };
export function transit03VerifyPlan(): Plan[] {
  return [
    { name: "kp-sublord-moon", endpoint: "/vedic-astrology/kp/sublord-changes", body: kpChangesBody("moon", "2026-10-07", "2026-10-08", "kp-newcomb", "mean"), why: "zorunlu 1: Ay sub-lord, 2 gün" },
    { name: "kp-rasi-moon", endpoint: "/vedic-astrology/kp/rasi-changes", body: kpChangesBody("moon", "2026-10-01", "2026-10-31", "kp-newcomb", "mean"), why: "zorunlu 2: Ay rasi, Ekim 2026" },
    { name: "kp-planets-range", endpoint: "/vedic-astrology/kp/planets-interval", body: kpPlanetsRangeBody("2026-10-07", 1, 360, ISTANBUL, "kp-newcomb", "mean"), why: "zorunlu 3: 9 graha, 6 saatte bir" },
    // Ek senaryolar (ilk sonuçlara göre; toplam ≤10):
    { name: "kp-sublord-venus-retro", endpoint: "/vedic-astrology/kp/sublord-changes", body: kpChangesBody("venus", "2026-10-01", "2026-11-30", "kp-newcomb", "mean"), why: "Ay dışı + geri hareket (Venüs retro istasyonu dahil) — ters yönlü KP geçişleri" },
    { name: "kp-rasi-mercury-92d", endpoint: "/vedic-astrology/kp/rasi-changes", body: kpChangesBody("mercury", "2026-10-01", "2026-12-31", "kp-newcomb", "mean"), why: "uzun aralık (ürün üst sınırı 92 gün) + Merkür retro burç dönüşleri" },
    { name: "kp-rasi-moon-berlin-dst", endpoint: "/vedic-astrology/kp/rasi-changes", body: { ...kpChangesBody("moon", "2026-10-20", "2026-10-31", "kp-newcomb", "mean"), timezone: "Europe/Berlin" }, why: "yaz/kış saati: 25.10.2026 Avrupa saat geri alma; sağlayıcının tek-ofset davranışını UTC golden'ıyla kıyas" },
    { name: "kp-planets-7d-kpold", endpoint: "/vedic-astrology/kp/planets-interval", body: kpPlanetsRangeBody("2026-10-07", 7, 1440, ISTANBUL, "kp-old", "mean"), why: "7 gün sınırı + günlük + KP-Old ayanamsa tutarlılığı" },
    { name: "kp-sublord-moon-92d", endpoint: "/vedic-astrology/kp/sublord-changes", body: kpChangesBody("moon", "2026-10-01", "2026-12-31", "kp-newcomb", "mean"), why: "uzun aralık: 92 gün Ay sub-lord (satır sayısı / boyut / süre)" },
  ];
}

type LedgerRow = { n: number; at: string; name: string; endpoint: string; status: number | null; outcome: string; attempts: number };
const readLedger = (): LedgerRow[] => (existsSync(LEDGER) ? (JSON.parse(readFileSync(LEDGER, "utf8")) as LedgerRow[]) : []);
const writeLedger = (rows: LedgerRow[]) => writeFileSync(LEDGER, JSON.stringify(rows, null, 2) + "\n");
const used = (rows: LedgerRow[]) => rows.reduce((n, r) => n + Math.max(1, r.attempts), 0);

async function main() {
  if (process.env.RUN_TRANSIT03_GOLDEN !== "EVET") {
    console.log("RUN_TRANSIT03_GOLDEN=EVET verilmedi — hiçbir çağrı yapılmadı.");
    return;
  }
  const wanted = process.argv.slice(2);
  mkdirSync(DIR, { recursive: true });
  const cfg = readAstroRoxyConfig();
  if (!cfg) {
    console.log("ROXY_API_KEY yok — çağrı yapılmadı");
    process.exit(2);
  }
  for (const g of transit03VerifyPlan().filter((x) => wanted.includes(x.name))) {
    const out = join(DIR, `${g.name}.json`);
    if (existsSync(out)) {
      console.log(`${g.name}: fixture mevcut — istek YAPILMADI`);
      continue;
    }
    const ledger = readLedger();
    if (used(ledger) >= TRANSIT03_CALL_CAP) {
      console.log(`ÜST SINIR: defterde ${used(ledger)} girişim (≤${TRANSIT03_CALL_CAP}) — ${g.name} GÖNDERİLMEDİ. Yeni owner onayı gerekir.`);
      break;
    }
    // Önce deftere yaz (istek başarısız olsa / süreç çökse de sayılır).
    const row: LedgerRow = { n: ledger.length + 1, at: new Date().toISOString(), name: g.name, endpoint: g.endpoint, status: null, outcome: "gönderiliyor", attempts: 1 };
    writeLedger([...ledger, row]);
    const r = await callRoxy(cfg, g.endpoint, g.body, { maxRetries: 0 });
    row.attempts = Math.max(1, r.attempts);
    row.status = r.ok ? 200 : (r.status ?? null);
    if (!r.ok) row.outcome = `BAŞARISIZ ${r.kind}`;
    else if (JSON.stringify(r.raw).includes(cfg.apiKey)) row.outcome = "yanıt anahtar metni içeriyor — KAYDEDİLMEDİ";
    else {
      writeFileSync(out, JSON.stringify({ endpoint: g.endpoint, query: null, body: g.body, response: r.raw, note: g.why }, null, 2) + "\n");
      row.outcome = "OK — fixture kaydedildi";
    }
    writeLedger([...ledger, row]);
    console.log(`#${row.n} ${g.name}: ${row.outcome} (HTTP ${row.status ?? "-"}) · üst alanlar: ${r.ok ? Object.keys(r.raw as Record<string, unknown>).join(", ") : "-"}`);
  }
  console.log(`defterdeki toplam gerçek girişim: ${used(readLedger())} / ${TRANSIT03_CALL_CAP}`);
}

if (require.main === module) {
  void main().catch((e) => {
    console.error("doğrulama hata:", (e as Error).message);
    process.exit(1);
  });
}
