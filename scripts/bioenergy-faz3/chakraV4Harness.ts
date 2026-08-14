/**
 * BİYOENERJİ FAZ 3.3E — V4 workspace harness (source-evidence gizleme + Kaynakça).
 * npx tsx scripts/bioenergy-faz3/chakraV4Harness.ts
 *
 * Doğrular (saf logic):
 *  - source-evidence block'lar GÖRÜNÜR içerikte render edilmez (workspace'ten elenir)
 *  - görünür block'lar section'lara doğru düşer, sıra korunur
 *  - Kaynakça yalnız source-evidence satırlarından distinct (title,author)
 *  - null/blank başlık elenir; aynı eser tekrar etmez
 *  - ana içerikte kaynak adı sızmaz (görünür block'ta source_title kullanılmaz)
 */
import {
  buildChakraWorkspace,
  deriveChakraBibliography,
  isVisibleChakraBlock,
  SOURCE_EVIDENCE_BLOCK_TYPE,
  type ChakraContentBlock,
} from "../../lib/bioenergy/chakraWorkspace";

let pass = 0, fail = 0;
const failures: string[] = [];
const check = (n: string, c: boolean, d = "") => c ? pass++ : (fail++, failures.push(`✗ ${n}${d ? ` — ${d}` : ""}`));

function mk(p: Partial<ChakraContentBlock> & { id: string; section_key: string; block_type: string | null }): ChakraContentBlock {
  return {
    block_title: null, sort_order: 0, source_excerpt: null, source_translation: null,
    editorial_explanation: null, editorial_interpretation: null, expert_note: null,
    source_title: null, source_author: null, source_ref: null, source_url: null,
    tradition_frame: null, created_at: null, ...p,
  };
}

// Karışık set: 3 görünür (overview/state/application) + 4 source-evidence (2 distinct eser + 1 blank + 1 dup)
const blocks: ChakraContentBlock[] = [
  mk({ id: "v1", section_key: "genel-bakis", block_type: "overview", block_title: "Element", sort_order: 10, editorial_explanation: "Toprak elementi." }),
  mk({ id: "v2", section_key: "enerji-anatomisi", block_type: "state", block_title: "Dengeli", sort_order: 20, editorial_explanation: "Güven, köklenme." }),
  mk({ id: "v3", section_key: "uygulamalar", block_type: "application", block_title: "Mantra", sort_order: 30, editorial_explanation: "LAM." }),
  mk({ id: "e1", section_key: "genel-bakis", block_type: SOURCE_EVIDENCE_BLOCK_TYPE, sort_order: 11, source_excerpt: "…", source_title: "Ruhun 7 Kapısı", source_author: "Kerimali Doğacı" }),
  mk({ id: "e2", section_key: "beden-sistem", block_type: SOURCE_EVIDENCE_BLOCK_TYPE, sort_order: 12, source_excerpt: "…", source_title: "Biyoenerji", source_author: "Dr. Şuayip Dağıstanlı" }),
  mk({ id: "e3", section_key: "genel-bakis", block_type: SOURCE_EVIDENCE_BLOCK_TYPE, sort_order: 13, source_excerpt: "…", source_title: "", source_author: "X" }), // blank title → elenir
  mk({ id: "e4", section_key: "beden-sistem", block_type: SOURCE_EVIDENCE_BLOCK_TYPE, sort_order: 14, source_excerpt: "…", source_title: "Ruhun 7 Kapısı", source_author: "Kerimali Doğacı" }), // dup eser
];

const ws = buildChakraWorkspace({ /* no legacy */ }, blocks, { stonesVisible: false });

// 1) source-evidence görünür içerikte YOK
const allVisibleRich = ws.flatMap((s) => s.richBlocks);
check("görünür rich block'ta source-evidence yok", allVisibleRich.every((b) => b.block_type !== SOURCE_EVIDENCE_BLOCK_TYPE));
check("görünür block sayısı = 3", allVisibleRich.length === 3, String(allVisibleRich.length));
check("isVisibleChakraBlock: source-evidence false", isVisibleChakraBlock(blocks[3]!) === false);
check("isVisibleChakraBlock: overview true", isVisibleChakraBlock(blocks[0]!) === true);

// 2) görünür block'lar doğru section'da
const genel = ws.find((s) => s.id === "genel-bakis");
check("genel-bakis yalnız görünür block (evidence hariç)", genel?.richBlocks.length === 1 && genel.richBlocks[0]?.id === "v1");

// 3) görünür block'ta kaynak adı SIZMAZ (source_title kullanılmıyor — evidence'ta kaldı)
check("görünür block'larda source_title boş/null", allVisibleRich.every((b) => !(b.source_title ?? "").trim()));

// 4) Kaynakça: distinct (title,author); blank elenir; dup tekrar etmez
const bib = deriveChakraBibliography(blocks);
check("Kaynakça 2 distinct eser (blank+dup elendi)", bib.length === 2, JSON.stringify(bib.map((x) => x.title)));
check("Kaynakça blank başlık içermez", bib.every((x) => x.title.trim().length > 0));
check("Kaynakça Dağıstanlı + Doğacı", bib.map((x) => x.author).sort().join(",") === "Dr. Şuayip Dağıstanlı,Kerimali Doğacı");
check("Kaynakça deterministik sıralı (title asc)", bib[0]!.title <= bib[1]!.title);

// 5) boş blocks → boş Kaynakça, workspace legacy davranışı korunur
check("boş blocks → Kaynakça boş", deriveChakraBibliography([]).length === 0);
const wsEmpty = buildChakraWorkspace({ color: "Kırmızı" }, [], { stonesVisible: false });
check("blocks yok → legacy genel-bakis görünür (regresyon yok)", wsEmpty.some((s) => s.id === "genel-bakis"));

// 6) yalnız source-evidence olan section GÖRÜNMEZ (görünür block yok)
check("yalnız evidence içeren beden-sistem görünür section üretmez", !ws.some((s) => s.id === "beden-sistem"));

console.log(`\nBİYOENERJİ FAZ 3.3E — V4 WORKSPACE HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail) { console.log("\nBAŞARISIZ:"); failures.forEach((f) => console.log("  " + f)); console.log("\nOVERALL = FAIL"); process.exit(1); }
console.log("OVERALL = PASS");
