/**
 * BİYOENERJİ FAZ 3.2C — Çakra workspace merge harness'i.
 * Kod: npx tsx scripts/bioenergy-faz3/chakraWorkspaceHarness.ts
 *
 * Doğrular (UI-only; DB/şema/içerik YOK — saf merge çekirdeği):
 *  - kanonik 8 section key sözlükle tutarlı
 *  - future section (enerji-anatomisi, uygulamalar) BLOK YOKKEN gizli
 *  - rich block gelince future section görünür
 *  - rich bloklar deterministik sıralanır (sort_order→created_at→id)
 *  - boş-içerikli block gizlenir (placeholder YOK)
 *  - legacy mapping kaybolmaz (FAZ 3.1 davranışının üst kümesi)
 *  - quick facts yalnız Genel Bakış'a ve yalnız gerçek değerle map olur
 *  - içerik katmanları AYRI korunur (kaynak/çeviri/açıklama/yorum/not)
 *  - authority: rich blok legacy atomik değeri duplicate ETMEZ (merge kopyalamaz)
 */
import {
  buildChakraSections,
  CHAKRA_SECTION_DICTIONARY,
} from "../../lib/bioenergy/chakraSections";
import {
  buildChakraWorkspace,
  chakraBlockHasContent,
  chakraQuickFactRows,
  CHAKRA_WORKSPACE_ORDER,
  type ChakraContentBlock,
} from "../../lib/bioenergy/chakraWorkspace";

let pass = 0;
let fail = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function mkBlock(p: Partial<ChakraContentBlock> & { id: string; section_key: string }): ChakraContentBlock {
  return {
    block_type: null,
    block_title: null,
    sort_order: 0,
    source_excerpt: null,
    source_translation: null,
    editorial_explanation: null,
    editorial_interpretation: null,
    expert_note: null,
    source_title: null,
    source_author: null,
    source_ref: null,
    source_url: null,
    tradition_frame: null,
    created_at: null,
    ...p,
  };
}

const FULL = {
  color: "Kırmızı ve siyahtır",
  causes: "Güvensizlik, korku",
  physical: "Bel, bacaklar",
  organs: "Böbrekler",
  glands: "Böbrek üstü bezi",
  mental: "Topraklanma eksikliği",
  notes: "Kök çakra pilot notu",
};

// A) Kanonik 8 key sözlükle tutarlı
check(
  "CHAKRA_WORKSPACE_ORDER = 8 key",
  CHAKRA_WORKSPACE_ORDER.length === 8,
  String(CHAKRA_WORKSPACE_ORDER.length),
);
check(
  "workspace order === sözlük id sırası",
  CHAKRA_WORKSPACE_ORDER.join(",") === CHAKRA_SECTION_DICTIONARY.map((d) => d.id).join(","),
  CHAKRA_WORKSPACE_ORDER.join(","),
);

// B) Blok yokken future section GİZLİ (FAZ 3.1 üst kümesi)
const noBlocks = buildChakraWorkspace(FULL, [], { stonesVisible: true });
const legacyOnly = buildChakraSections(FULL, { stonesVisible: true });
check(
  "blok yok → future section üretilmez",
  !noBlocks.some((s) => s.id === "enerji-anatomisi" || s.id === "uygulamalar"),
);
check(
  "blok yok → legacy section id kümesi FAZ 3.1 ile birebir",
  noBlocks.map((s) => s.id).join(",") === legacyOnly.map((s) => s.id).join(","),
  noBlocks.map((s) => s.id).join(","),
);
check(
  "blok yok → richBlocks hep boş",
  noBlocks.every((s) => s.richBlocks.length === 0),
);

// C) enerji-anatomisi rich block gelince görünür + kanonik konumda
const withEnergy = buildChakraWorkspace(FULL, [
  mkBlock({ id: "b1", section_key: "enerji-anatomisi", block_title: "Dengeli Durum", editorial_explanation: "…", sort_order: 1 }),
], { stonesVisible: true });
const energySec = withEnergy.find((s) => s.id === "enerji-anatomisi");
check("enerji-anatomisi blokla görünür", Boolean(energySec));
check("enerji-anatomisi başlığı sözlükten", energySec?.title === "Enerji Anatomisi & Denge", energySec?.title);
check(
  "enerji-anatomisi kanonik konumda (genel-bakis'ten sonra)",
  withEnergy.findIndex((s) => s.id === "enerji-anatomisi") > withEnergy.findIndex((s) => s.id === "genel-bakis"),
);

// D) uygulamalar rich block gelince görünür
const withApp = buildChakraWorkspace(FULL, [
  mkBlock({ id: "a1", section_key: "uygulamalar", block_title: "Nefes", editorial_explanation: "…" }),
], { stonesVisible: true });
check("uygulamalar blokla görünür", withApp.some((s) => s.id === "uygulamalar"));
check("uygulamalar başlığı sözlükten", withApp.find((s) => s.id === "uygulamalar")?.title === "Uygulamalar");

// E) Deterministik sıralama: sort_order → created_at → id
const unordered = buildChakraWorkspace(FULL, [
  mkBlock({ id: "z", section_key: "uygulamalar", sort_order: 2, editorial_explanation: "x" }),
  mkBlock({ id: "a", section_key: "uygulamalar", sort_order: 1, created_at: "2026-01-02", editorial_explanation: "x" }),
  mkBlock({ id: "b", section_key: "uygulamalar", sort_order: 1, created_at: "2026-01-01", editorial_explanation: "x" }),
], { stonesVisible: true });
const appOrder = unordered.find((s) => s.id === "uygulamalar")?.richBlocks.map((b) => b.id).join(",");
check("rich sıralama sort_order→created_at→id", appOrder === "b,a,z", appOrder);

// F) Boş-içerikli block gizlenir (placeholder YOK)
check(
  "chakraBlockHasContent: tüm katman null → false",
  chakraBlockHasContent(mkBlock({ id: "e", section_key: "uygulamalar" })) === false,
);
check(
  "chakraBlockHasContent: whitespace → false",
  chakraBlockHasContent(mkBlock({ id: "e2", section_key: "uygulamalar", expert_note: "   " })) === false,
);
const emptyOnly = buildChakraWorkspace(FULL, [
  mkBlock({ id: "e3", section_key: "uygulamalar", block_title: "Boş", source_url: "http://x" }),
], { stonesVisible: true });
check("yalnız boş-içerik block → uygulamalar görünmez", !emptyOnly.some((s) => s.id === "uygulamalar"));

// G) Legacy mapping kaybolmaz (beden-sistem alt blokları korunur)
const beden = withEnergy.find((s) => s.id === "beden-sistem");
check(
  "legacy beden-sistem 3 alt blok korunur",
  beden?.legacyBlocks.length === 3 &&
    beden?.legacyBlocks.map((b) => b.title).join(",") === "Fiziksel Etkiler,Organlar,Bezler",
  beden?.legacyBlocks.map((b) => b.title).join(","),
);

// H) Quick facts yalnız Genel Bakış + yalnız gerçek değer
const withQF = buildChakraWorkspace(FULL, [], {
  stonesVisible: true,
  quickFacts: { sanskritName: "Muladhara", element: "Toprak", location: "", bijaMantra: "LAM" },
});
const genel = withQF.find((s) => s.id === "genel-bakis");
check("quick facts Genel Bakış'a map olur", (genel?.quickFacts.length ?? 0) === 3, String(genel?.quickFacts.length));
check(
  "boş quick fact (location:'') elenir",
  !genel?.quickFacts.some((r) => r.key === "location"),
);
check(
  "quick fact yalnız Genel Bakış'ta",
  withQF.filter((s) => s.quickFacts.length > 0).every((s) => s.id === "genel-bakis"),
);
check(
  "chakraQuickFactRows sıra: sanskrit→element→konum→bija",
  chakraQuickFactRows({ sanskritName: "M", element: "T", location: "L", bijaMantra: "LAM" })
    .map((r) => r.key).join(",") === "sanskritName,element,location,bijaMantra",
);
// Quick fact yoksa Genel Bakış yalnız color legacy ile görünür (FAZ 3.1 gibi)
check("quick fact + legacy yoksa genel-bakis yalnız color ile görünür", Boolean(genel));

// I) İçerik katmanları AYRI korunur (kaynak/çeviri/açıklama/yorum/not)
const layered = buildChakraWorkspace(FULL, [
  mkBlock({
    id: "L1", section_key: "nedenler-blokajlar", sort_order: 5,
    source_excerpt: "SRC", source_translation: "TR", editorial_explanation: "EXP",
    editorial_interpretation: "INT", expert_note: "NOTE",
    source_title: "Kitap", source_author: "Yazar", tradition_frame: "modern",
  }),
], { stonesVisible: true });
const lb = layered.find((s) => s.id === "nedenler-blokajlar")?.richBlocks[0];
check(
  "5 içerik katmanı ayrı korunur",
  lb?.source_excerpt === "SRC" && lb?.source_translation === "TR" &&
    lb?.editorial_explanation === "EXP" && lb?.editorial_interpretation === "INT" &&
    lb?.expert_note === "NOTE",
);
check("citation + tradition_frame korunur", lb?.source_title === "Kitap" && lb?.source_author === "Yazar" && lb?.tradition_frame === "modern");
// nedenler-blokajlar hem legacy (causes) hem rich taşır — ayrı alanlarda
const neden = layered.find((s) => s.id === "nedenler-blokajlar");
check(
  "aynı section legacy + rich AYRI alanlarda (birleştirilmez)",
  (neden?.legacyBlocks.length ?? 0) === 1 && (neden?.richBlocks.length ?? 0) === 1,
);

// J) Authority: rich merge legacy atomik değeri DUPLICATE etmez
// (Genel Bakış legacy color bloğu var; workspace color'ı richBlocks'a KOPYALAMAZ)
const genelFull = withEnergy.find((s) => s.id === "genel-bakis");
check(
  "authority: Genel Bakış richBlocks color'ı duplicate etmez",
  (genelFull?.richBlocks.length ?? 0) === 0,
);
check(
  "authority: legacy color bloğu legacyBlocks'ta authoritative",
  genelFull?.legacyBlocks.some((b) => b.title === "Renk" && b.text === "Kırmızı ve siyahtır") ?? false,
);

// Taşlar legacy kind korunur (stones section kind='stones')
const stonesSec = withEnergy.find((s) => s.id === "taslar-destekleyiciler");
check("stones section kind='stones' korunur", stonesSec?.kind === "stones");

console.log(`\nBİYOENERJİ FAZ 3.2C — ÇAKRA WORKSPACE HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail > 0) {
  console.log(`\nBAŞARISIZ:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\nOVERALL = FAIL`);
  process.exit(1);
} else {
  console.log(`OVERALL = PASS`);
}
