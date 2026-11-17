/**
 * F3A — Regresyon dökümü: Kademe A raporlarının `branding: null` çıktısını normalize parça
 * özetlerine (JSON) döker. Aynı komut main ve dal üzerinde koşturulur; `regression-compare.ts`
 * iki dökümü karşılaştırır. Ham dosya SHA'sı KULLANILMAZ (zip zaman damgası / core.xml tarihi).
 *
 * Normalize: docProps/* (tarih/metadata) dışarıda; w:rsid* öznitelikleri silinir; media dosyaları
 * içerik SHA-256 ile temsil edilir ve rels içindeki medya adları bu SHA'ya eşlenir.
 *
 * Çalıştır: npx tsx scripts/expert-branding/regression-dump.ts --out <klasör> [--mode null|undefined]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allReportCases } from "./reportCases";
import { normalizeDocx, sha } from "./normalizeDocx";

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
const MODE = arg("--mode") ?? "null";
if (!OUT) throw new Error("--out gerekli");
mkdirSync(OUT, { recursive: true });

async function main() {
  const cases = await allReportCases();
  const summary: Record<string, Record<string, string>> = {};
  for (const c of cases) {
    const buf = MODE === "undefined"
      ? await c.render({ branding: undefined as unknown as null })
      : await c.render({ branding: null });
    writeFileSync(path.join(OUT!, `${c.name}.docx`), buf);
    const parts = await normalizeDocx(buf);
    writeFileSync(path.join(OUT!, `${c.name}.parts.json`), JSON.stringify(parts, null, 1));
    summary[c.name] = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sha(v)]));
    console.log(`  ${c.name}: ${Object.keys(parts).length} parça`);
  }
  writeFileSync(path.join(OUT!, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(`${cases.length} senaryo döküldü → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
