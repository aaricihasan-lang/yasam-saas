/**
 * BİYOENERJİ FAZ 3.3 FINAL — 6-ÇAKRA BATCH harness (Sakral + Solar + Kalp + Boğaz + Üçüncü Göz + Taç).
 * npx tsx scripts/bioenergy-faz3/chakraBatchV1Harness.ts
 *
 * Her chakra fixture'ı (canonical mapping CSV'den verbatim serialization) GENERIC chakra renderer
 * üzerinden doğrulanır. Kök'e hardcode/write YOK. İçerik AYNEN korunur (kaynak dili değişmez);
 * yapısal sözleşme + UTF-8 sentinel + bibliography order test edilir.
 */
import { readFileSync } from "fs";
import {
  buildChakraWorkspace,
  deriveChakraBibliography,
  CHAKRA_BIBLIOGRAPHY_EDITORIAL_ORDER,
  SOURCE_EVIDENCE_BLOCK_TYPE,
  type ChakraContentBlock,
} from "../../lib/bioenergy/chakraWorkspace";

let pass = 0, fail = 0;
const failures: string[] = [];
const check = (n: string, c: boolean, d = "") => c ? pass++ : (fail++, failures.push(`✗ ${n}${d ? ` — ${d}` : ""}`));
const nz = (v: string | null | undefined) => (v ?? "").trim();

type Parent = { name: string; element: string | null; bija_mantra: string | null; sanskrit_name: string | null; location: string | null; color: string | null };
type Fix = { parent: Parent; blocks: ChakraContentBlock[] };

const CH: { file: string; name: string; total: number; visible: number; evidence: number;
  element: string | null; bija: string | null; sanskrit: string | null }[] = [
  { file: "sakralV1Blocks",      name: "Sakral Çakra",         total: 115, visible: 47, evidence: 68,  element: "Su",   bija: "VAM", sanskrit: null },
  { file: "solarPleksusV1Blocks", name: "Solar Pleksus Çakrası", total: 152, visible: 52, evidence: 100, element: "Ateş", bija: "RAM", sanskrit: "Manipura" },
  { file: "kalpV1Blocks",        name: "Kalp Çakrası",          total: 185, visible: 70, evidence: 115, element: "Hava", bija: "YAM", sanskrit: "Anahata" },
  { file: "bogazV1Blocks",       name: "Boğaz Çakrası",         total: 228, visible: 77, evidence: 151, element: "Eter", bija: "HAM", sanskrit: null },
  { file: "ucuncuGozV1Blocks",   name: "Üçüncü Göz Çakrası",    total: 233, visible: 80, evidence: 153, element: null,   bija: null,  sanskrit: null },
  { file: "tacV1Blocks",         name: "Taç Çakra",             total: 279, visible: 88, evidence: 191, element: null,   bija: null,  sanskrit: null },
];

const CANON = JSON.stringify([...CHAKRA_BIBLIOGRAPHY_EDITORIAL_ORDER]);
const MOJIBAKE = /[�]|Ã|Â|Ä|Å|â€/; // beklenmedik mojibake dizileri
let batchTotal = 0, batchVisible = 0, batchEvidence = 0;

for (const c of CH) {
  const fx = JSON.parse(readFileSync(`scripts/bioenergy-faz3/${c.file}.json`, "utf8")) as Fix;
  const blocks = fx.blocks;
  const ws = buildChakraWorkspace({} as never, blocks, {
    stonesVisible: false,
    quickFacts: { sanskritName: fx.parent.sanskrit_name, element: fx.parent.element, location: fx.parent.location, bijaMantra: fx.parent.bija_mantra },
  });
  const rich = ws.flatMap((s) => s.richBlocks);
  const se = blocks.filter((b) => b.block_type === SOURCE_EVIDENCE_BLOCK_TYPE);
  const vis = blocks.filter((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE);
  const bib = deriveChakraBibliography(blocks);
  batchTotal += blocks.length; batchVisible += vis.length; batchEvidence += se.length;

  const P = `[${c.name}]`;
  check(`${P} total = ${c.total}`, blocks.length === c.total, String(blocks.length));
  check(`${P} visible = ${c.visible}`, vis.length === c.visible, String(vis.length));
  check(`${P} evidence = ${c.evidence}`, se.length === c.evidence, String(se.length));
  check(`${P} sections = 8`, new Set(blocks.map((b) => b.section_key)).size === 8);
  check(`${P} sources = 11`, bib.length === 11, String(bib.length));
  check(`${P} visible richBlocks = ${c.visible} (hepsi render)`, rich.length === c.visible, String(rich.length));
  check(`${P} source-evidence render = 0`, rich.every((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE));
  check(`${P} bibliography order = canonical 11/11`, JSON.stringify(bib.map((e) => e.title)) === CANON, JSON.stringify(bib.map((e) => e.title)));
  check(`${P} visible author/source leakage = 0`, rich.every((b) => !nz(b.source_title) && !nz(b.source_author)));
  const visBody = vis.map((b) => b.editorial_explanation ?? "");
  check(`${P} raw <details>/<summary> = 0`, visBody.every((t) => !/<details|<summary/i.test(t)));
  check(`${P} raw ### heading leakage = 0`, visBody.every((t) => !/(^|\n)\s*#{1,6}\s/.test(t)));
  check(`${P} null invariants (translation/interp/expert) = 0`,
    blocks.every((b) => !nz(b.source_translation) && !nz(b.editorial_interpretation) && !nz(b.expert_note)));
  // parent facts
  check(`${P} parent facts exact`,
    fx.parent.name === c.name && fx.parent.element === c.element && fx.parent.bija_mantra === c.bija &&
    fx.parent.sanskrit_name === c.sanskrit && fx.parent.location === null && fx.parent.color === null);
  // UTF-8 sentinel: parent name doğru Türkçe + hiçbir alanda mojibake yok
  const allText = fx.parent.name + " || " + blocks.map((b) => `${b.block_title ?? ""}${b.editorial_explanation ?? ""}${b.source_excerpt ?? ""}${b.source_author ?? ""}${b.source_title ?? ""}`).join(" || ");
  check(`${P} UTF-8 mojibake = 0`, !MOJIBAKE.test(allText));
  check(`${P} parent name Türkçe sentinel korunur`, fx.parent.name.includes("Çakra") || fx.parent.name.includes("Çakrası"));
}

// batch totals
check("BATCH total = 1192", batchTotal === 1192, String(batchTotal));
check("BATCH visible = 414", batchVisible === 414, String(batchVisible));
check("BATCH evidence = 778", batchEvidence === 778, String(batchEvidence));
// Türkçe sentinel spot-check (Boğaz / Üçüncü Göz)
check("sentinel 'Boğaz Çakrası' + 'Üçüncü Göz Çakrası' fixture adları doğru",
  CH.some((c) => c.name === "Boğaz Çakrası") && CH.some((c) => c.name === "Üçüncü Göz Çakrası"));

console.log(`\nBİYOENERJİ FAZ 3.3 FINAL — 6-ÇAKRA BATCH HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail) { console.log("\nBAŞARISIZ:"); failures.forEach((f) => console.log("  " + f)); console.log("\nOVERALL = FAIL"); process.exit(1); }
console.log("OVERALL = PASS");
