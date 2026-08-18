/**
 * BİYOENERJİ FAZ 3.3F — SAKRAL ÇAKRA V1 harness.
 * npx tsx scripts/bioenergy-faz3/sakralV1Harness.ts
 *
 * Canonical mapping (SAKRAL_CAKRA_DB_READY_BLOCK_MAPPING_V1.csv) → repo serialization
 * (sakralV1Blocks.json) GENERIC chakra renderer üzerinden doğrulanır. Kök Çakra'ya
 * hardcode YOK; aynı buildChakraWorkspace + deriveChakraBibliography kullanılır.
 * İçerik AYNEN (verbatim) korunur; kaynak iddia gücü değiştirilmez.
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

const raw = JSON.parse(readFileSync("scripts/bioenergy-faz3/sakralV1Blocks.json", "utf8")) as {
  parent: { element: string | null; bija_mantra: string | null; sanskrit_name: string | null; location: string | null };
  blocks: ChakraContentBlock[];
};
const blocks = raw.blocks;

// ── generic renderer ──
const ws = buildChakraWorkspace({} as never, blocks, {
  stonesVisible: false,
  quickFacts: {
    sanskritName: raw.parent.sanskrit_name,
    element: raw.parent.element,
    location: raw.parent.location,
    bijaMantra: raw.parent.bija_mantra,
  },
});
const richAll = ws.flatMap((s) => s.richBlocks);
const bib = deriveChakraBibliography(blocks);

const se = blocks.filter((b) => b.block_type === SOURCE_EVIDENCE_BLOCK_TYPE);
const vis = blocks.filter((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE);
const seExcerpt = (a: string) => se.filter((b) => (b.source_author ?? "") === a);
const nz = (v: string | null | undefined) => (v ?? "").trim();

// 1-5 counts
check("K1 visible = 47", vis.length === 47, String(vis.length));
check("K2 source-evidence = 68", se.length === 68, String(se.length));
check("K3 total = 115", blocks.length === 115, String(blocks.length));
check("K4 sections = 8", new Set(blocks.map((b) => b.section_key)).size === 8);
check("K5 sources = 11", bib.length === 11, String(bib.length));

// 6 source-evidence render = 0 (workspace richBlocks içinde hiç source-evidence yok)
check("K6 source-evidence normal render = 0", richAll.every((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE));
check("K6b visible richBlocks = 47 (tüm visible render'a düştü)", richAll.length === 47, String(richAll.length));

// 7 bibliography render count = 1 (tek liste, non-empty) / 8 order canonical 11/11
check("K7 bibliography single non-empty list", Array.isArray(bib) && bib.length > 0);
check("K8 bibliography order = canonical 11/11",
  JSON.stringify(bib.map((e) => e.title)) === JSON.stringify([...CHAKRA_BIBLIOGRAPHY_EDITORIAL_ORDER]),
  JSON.stringify(bib.map((e) => e.title)));

// 9 body author/source leakage = 0 (visible bloklarda source_title/author boş → gövdede sızmaz)
check("K9 visible body author/source leakage = 0",
  richAll.every((b) => !nz(b.source_title) && !nz(b.source_author)));

// 10-12 raw markdown/details leakage in visible editorial_explanation
const visBody = vis.map((b) => b.editorial_explanation ?? "");
check("K10 raw <details> = 0", visBody.every((t) => !/<details/i.test(t)));
check("K11 raw <summary> = 0", visBody.every((t) => !/<summary/i.test(t)));
check("K12 raw ### heading leakage = 0", visBody.every((t) => !/(^|\n)\s*#{1,6}\s/.test(t)));

// 13-15 null invariants
check("K13 source_translation populated = 0", blocks.every((b) => !nz(b.source_translation)));
check("K14 editorial_interpretation populated = 0", blocks.every((b) => !nz(b.editorial_interpretation)));
check("K15 expert_note populated = 0", blocks.every((b) => !nz(b.expert_note)));

// 16-20 fidelity (verbatim korunmuş kaynak dili)
const dag = seExcerpt("Dr. Şuayip Dağıstanlı");
check("K16 Dağıstanlı Suadhishana + 'neden olur' + 'kendini gösterir'",
  dag.some((b) => (b.source_excerpt ?? "").includes("Suadhishana")) &&
  dag.some((b) => (b.source_excerpt ?? "").includes("neden olur")) &&
  dag.some((b) => (b.source_excerpt ?? "").includes("kendini gösterir")));
const dogaci = seExcerpt("Kerimali Doğacı").map((b) => b.source_excerpt ?? "").join(" || ");
const anyBody = blocks.map((b) => (b.source_excerpt ?? "") + (b.editorial_explanation ?? "")).join(" || ");
check("K17 Doğacı 'oluşabilir'/'yol açabilir'/'yol açtığı'/'tetikler' + corpus 'yol açar'",
  dogaci.includes("oluşabilir") && dogaci.includes("yol açabilir") &&
  dogaci.includes("yol açtığı") && dogaci.includes("tetikler") && anyBody.includes("yol açar"));
check("K18 Hakan 'yaşayabilir'",
  seExcerpt("Hakan Çobanoğlu").some((b) => (b.source_excerpt ?? "").includes("yaşayabilir")));
check("K19 McLaren güçlü iddia (organları bitirici hastalıklardan ölüp giderler)",
  seExcerpt("Karla McLaren").some((b) => (b.source_excerpt ?? "").includes("organları bitirici hastalıklardan ölüp giderler")));
const reikiConflict = se.filter((b) => (b.source_title ?? "").startsWith("Chakralar-Reiki") && (b.source_excerpt ?? "").includes("1. çakra"));
check("K20 Chakralar-Reiki '1. çakra' iç çelişkisi normalize edilmemiş (≥1)", reikiConflict.length >= 1, String(reikiConflict.length));

// Aytaşı özel korunan ifadeler (H)
check("H Aytaşı 'tıkanmış lenf' + 'hormon seviyesini dengeler' korunur",
  anyBody.includes("tıkanmış lenf") && anyBody.includes("hormon seviyesini dengeler"));

console.log(`\nBİYOENERJİ FAZ 3.3F — SAKRAL ÇAKRA V1 HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail) { console.log("\nBAŞARISIZ:"); failures.forEach((f) => console.log("  " + f)); console.log("\nOVERALL = FAIL"); process.exit(1); }
console.log("OVERALL = PASS");
