/**
 * BİYOENERJİ FAZ 3.1 — Çakra iç section modeli harness'i.
 * Kod:  npx tsx scripts/bioenergy-faz3/chakraSectionsHarness.ts
 *
 * Doğrular (UI-only, DB/şema/içerik YOK):
 *  - legacy 8 detail alanı doğru section'a map ediliyor, veri kaybı yok
 *  - görünür section sırası kanonik
 *  - boş alan → section gizli (future placeholder YOK)
 *  - stable anchor/hash unique
 *  - "Enerji Anatomisi & Denge" ve "Uygulamalar" ASLA üretilmez (future)
 */
import {
  buildChakraSections,
  CHAKRA_SECTION_DICTIONARY,
  type ChakraSectionInput,
} from "../../lib/bioenergy/chakraSections";

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

const FULL: ChakraSectionInput = {
  color: "Kırmızı",
  causes: "Güvensizlik, korku",
  physical: "Bel, bacaklar",
  organs: "Böbrekler",
  glands: "Böbrek üstü bezi",
  mental: "Topraklanma eksikliği",
  notes: "Kök çakra pilot notu",
};

// 1) Tam kayıt → 6 görünür section, kanonik sırada, doğru hash
const full = buildChakraSections(FULL, { stonesVisible: true });
const expectedOrder = [
  "genel-bakis",
  "nedenler-blokajlar",
  "beden-sistem",
  "duygusal-zihinsel",
  "taslar-destekleyiciler",
  "notlar-kaynaklar",
];
check("Tam kayıt 6 section", full.length === 6, `bulunan ${full.length}`);
check(
  "Section sırası kanonik",
  full.map((s) => s.id).join(",") === expectedOrder.join(","),
  full.map((s) => s.id).join(","),
);
check(
  "hash === id (stable anchor)",
  full.every((s) => s.hash === s.id),
);
check("hash'ler unique", new Set(full.map((s) => s.hash)).size === full.length);

// 2) Legacy → section mapping fidelity (veri kaybı yok)
const byId = Object.fromEntries(full.map((s) => [s.id, s]));
check("color → Genel Bakış/Renk", byId["genel-bakis"]?.blocks.some((b) => b.title === "Renk" && b.text === "Kırmızı") ?? false);
check(
  "causes → Nedenler & Blokajlar",
  byId["nedenler-blokajlar"]?.blocks.some((b) => b.title === "Blokajlı Olmasının Nedenleri" && b.text === "Güvensizlik, korku") ?? false,
);
check("mental → Duygusal & Zihinsel", byId["duygusal-zihinsel"]?.blocks.some((b) => b.title === "Zihinsel Etkiler" && b.text === "Topraklanma eksikliği") ?? false);
check("notes → Notlar & Kaynaklar (title null)", byId["notlar-kaynaklar"]?.blocks.some((b) => b.title === null && b.text === "Kök çakra pilot notu") ?? false);

// 3) Beden & Sistem = physical + organs + glands (alt bloklar, sırayla korunur)
const beden = byId["beden-sistem"];
check("Beden 3 alt blok", beden?.blocks.length === 3, `bulunan ${beden?.blocks.length}`);
check(
  "Beden alt blok sırası physical→organs→glands",
  (beden?.blocks.map((b) => b.title).join(",") ?? "") === "Fiziksel Etkiler,Organlar,Bezler",
  beden?.blocks.map((b) => b.title).join(","),
);
check(
  "Beden alt blok metinleri korunmuş",
  (beden?.blocks[0]?.text === "Bel, bacaklar") &&
    (beden?.blocks[1]?.text === "Böbrekler") &&
    (beden?.blocks[2]?.text === "Böbrek üstü bezi"),
);

// 4) stones kind özel; stonesVisible=false → yok
check("Taşlar section kind=stones + boş blocks", byId["taslar-destekleyiciler"]?.kind === "stones" && byId["taslar-destekleyiciler"]?.blocks.length === 0);
const noStones = buildChakraSections(FULL, { stonesVisible: false });
check("stonesVisible=false → Taşlar section yok", !noStones.some((s) => s.id === "taslar-destekleyiciler"));
check("stonesVisible=false → 5 section", noStones.length === 5, `bulunan ${noStones.length}`);

// 5) Boş alanlar → section gizli (placeholder yok)
const empty = buildChakraSections({}, { stonesVisible: false });
check("Boş kayıt → 0 section (placeholder yok)", empty.length === 0, `bulunan ${empty.length}`);

const onlyCauses = buildChakraSections({ causes: "x" }, { stonesVisible: false });
check("Yalnız causes → tek section (nedenler)", onlyCauses.length === 1 && onlyCauses[0]?.id === "nedenler-blokajlar");

// Beden kısmi: yalnız organs → tek alt blok
const onlyOrgans = buildChakraSections({ organs: "Böbrekler" }, { stonesVisible: false });
const bedenPartial = onlyOrgans.find((s) => s.id === "beden-sistem");
check("Beden kısmi (yalnız organs) → 1 alt blok Organlar", bedenPartial?.blocks.length === 1 && bedenPartial?.blocks[0]?.title === "Organlar");

// 6) Whitespace-only alanlar gizli
const blank = buildChakraSections({ color: "   ", notes: "\n\t " }, { stonesVisible: false });
check("Whitespace-only alanlar → 0 section", blank.length === 0, `bulunan ${blank.length}`);

// 7) Future section'lar ASLA üretilmez
const allIdsEver = new Set([...full, ...noStones, ...empty, ...onlyCauses].map((s) => s.id));
check("Future 'enerji-anatomisi' üretilmiyor", !allIdsEver.has("enerji-anatomisi" as never));
check("Future 'uygulamalar' üretilmiyor", !allIdsEver.has("uygulamalar" as never));

// 8) Sözlük bütünlüğü: 8 kanonik, 2 future
check("Sözlük 8 section", CHAKRA_SECTION_DICTIONARY.length === 8, `bulunan ${CHAKRA_SECTION_DICTIONARY.length}`);
check(
  "Sözlükte 2 future",
  CHAKRA_SECTION_DICTIONARY.filter((s) => s.future).length === 2,
);
check(
  "Future = enerji-anatomisi + uygulamalar",
  CHAKRA_SECTION_DICTIONARY.filter((s) => s.future).map((s) => s.id).sort().join(",") === "enerji-anatomisi,uygulamalar",
);
// Üretilen tüm id'ler sözlükte (future olmayan) var mı?
const dictNonFuture = new Set(CHAKRA_SECTION_DICTIONARY.filter((s) => !s.future).map((s) => s.id));
check("Üretilen section'lar sözlükteki non-future ile tutarlı", full.every((s) => dictNonFuture.has(s.id)));

console.log(`\nBİYOENERJİ FAZ 3.1 — ÇAKRA SECTION HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail > 0) {
  console.log(`\nBAŞARISIZ:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\nOVERALL = FAIL`);
  process.exit(1);
} else {
  console.log(`OVERALL = PASS`);
}
