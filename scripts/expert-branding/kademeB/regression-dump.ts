/**
 * F3B — Kademe B regresyon dökümü: her senaryonun `branding: null` çıktısını yazar.
 *   - DOCX → <ad>.docx + <ad>.parts.json (normalize parçalar: docProps hariç, w:rsid silinir, media SHA-256; rastgele köprü
 *            kimliği ve yazı tipi gizleme anahtarı sabitlenir — bkz. normalize.ts)
 *   - PDF  → <ad>.pdf (saat sabit + /ID normalize → bayt düzeyinde karşılaştırılabilir; ayrıca compare.py metin / sayfa / görsel / yazı tipi /
 *            render piksel karşılaştırması yapar)
 * Aynı komut main ve dal çalışma ağacında koşar; `compare.py <main> <dal>` iki dökümü karşılaştırır.
 *
 * Çalıştır: npx tsx scripts/expert-branding/kademeB/regression-dump.ts --out <klasör> [--mode null|undefined]
 */
import { allKademeBCases } from "./cases";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeKademeBDocx, normalizePdfBytes, sha } from "./normalize";

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const OUT = arg("--out");
const MODE = arg("--mode") ?? "null";
if (!OUT) throw new Error("--out gerekli");
mkdirSync(OUT, { recursive: true });

async function main() {
  const cases = await allKademeBCases();
  const summary: Record<string, Record<string, string>> = {};
  for (const c of cases) {
    const buf = await c.render(MODE === "undefined" ? (undefined as unknown as null) : null);
    writeFileSync(path.join(OUT!, `${c.name}.${c.kind}`), buf);
    if (c.kind === "docx") {
      const parts = await normalizeKademeBDocx(buf);
      writeFileSync(path.join(OUT!, `${c.name}.parts.json`), JSON.stringify(parts, null, 1));
      summary[c.name] = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sha(v)]));
    } else {
      summary[c.name] = { "pdf:bytes(normalize /ID)": sha(normalizePdfBytes(buf)) };
    }
    console.log(`  ${c.name}: ${c.kind} ${buf.length} bayt`);
  }
  writeFileSync(path.join(OUT!, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(`${cases.length} senaryo döküldü → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
