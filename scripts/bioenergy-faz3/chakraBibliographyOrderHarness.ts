/**
 * BİYOENERJİ FAZ 3.3E-R — Kaynakça DETERMİNİSTİK EDİTORYAL SIRA harness.
 * npx tsx scripts/bioenergy-faz3/chakraBibliographyOrderHarness.ts
 *
 * Kanıtlar (saf logic):
 *  - deriveChakraBibliography çıktısı KANONİK editoryal sırayı üretir (Kök Çakra V4: 11 eser)
 *  - AYNI evidence dizisi farklı GİRDİ sıralarıyla verildiğinde çıktı DEĞİŞMEZ
 *    (sıra sorgu/DB satır dönüş sırasından bağımsız)
 *  - kanonik listede olmayan kaynak alfabetik fallback'e (ranked'lerin sonrasına) düşer
 *  - duplicate/blank dedup korunur
 */
import {
  deriveChakraBibliography,
  CHAKRA_BIBLIOGRAPHY_EDITORIAL_ORDER,
  SOURCE_EVIDENCE_BLOCK_TYPE,
  type ChakraContentBlock,
} from "../../lib/bioenergy/chakraWorkspace";

let pass = 0, fail = 0;
const failures: string[] = [];
const check = (n: string, c: boolean, d = "") => c ? pass++ : (fail++, failures.push(`✗ ${n}${d ? ` — ${d}` : ""}`));

let seq = 0;
function ev(source_title: string, source_author: string | null): ChakraContentBlock {
  return {
    id: `e${seq++}`, section_key: "genel-bakis", block_type: SOURCE_EVIDENCE_BLOCK_TYPE,
    block_title: null, sort_order: 0, source_excerpt: "…", source_translation: null,
    editorial_explanation: null, editorial_interpretation: null, expert_note: null,
    source_title, source_author, source_ref: null, source_url: null,
    tradition_frame: null, created_at: null,
  };
}

// Kök Çakra V4 — 11 gerçek kaynak (source_title, source_author). KANONİK sıra:
const SOURCES: [string, string | null][] = [
  ["Gizli Enerji Terapileri", "Dr. Richard Gerber"],
  ["Aura ve Çakra Kullanma Kılavuzu", "Karla McLaren"],
  ["Chakralar-Reiki Enerji ve Kuantum Merkezi", null],
  ["Enerji Tıbbı", "Donna Eden"],
  ["7 Gün 7 Çakra 7 Bioenerji Çalışması", "Hakan Çobanoğlu"],
  ["Bilinçaltını Açan Anahtar: Kinesiyoloji", "Dr. Isa Grüber"],
  ["Biyoenerji", "Dr. Şuayip Dağıstanlı"],
  ["Ruhun 7 Kapısı", "Kerimali Doğacı"],
  ["Kuantum Dokunuş: Şifa Verme Gücü", "Richard Gordon"],
  ["AURA'lar: Yorumlama ve Anlama", "Bob Sanders"],
  ["Titreşimini Yükselt Hayatın Değişsin", "Ayşe Tolga"],
];

// Deterministik (Math.random YOK) permütasyonlar — sabit indeks düzenleri.
function permute<T>(arr: T[], order: number[]): T[] {
  return order.map((i) => arr[i]!);
}
const P1 = [10, 0, 6, 3, 8, 1, 9, 2, 5, 7, 4]; // karışık
const P2 = [4, 7, 5, 2, 9, 1, 8, 3, 6, 0, 10]; // farklı karışık
const P3 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // kanonik-in-input (çıktı yine kanonik olmalı, girdiyle değil order'la)

const expected = [...CHAKRA_BIBLIOGRAPHY_EDITORIAL_ORDER];

for (const [name, order] of [["P1", P1], ["P2", P2], ["P3", P3]] as [string, number[]][]) {
  const blocks = permute(SOURCES, order).map(([t, a]) => ev(t, a));
  const titles = deriveChakraBibliography(blocks).map((x) => x.title);
  check(`${name}: çıktı KANONİK editoryal sıra (11 eser)`,
    JSON.stringify(titles) === JSON.stringify(expected),
    JSON.stringify(titles));
}

// Girdi sırasından bağımsızlık: P1 ve P2 çıktıları BİREBİR aynı
const outP1 = deriveChakraBibliography(permute(SOURCES, P1).map(([t, a]) => ev(t, a))).map((x) => `${x.title}|${x.author ?? ""}`);
const outP2 = deriveChakraBibliography(permute(SOURCES, P2).map(([t, a]) => ev(t, a))).map((x) => `${x.title}|${x.author ?? ""}`);
check("Girdi sırasından bağımsız: P1 çıktısı === P2 çıktısı", JSON.stringify(outP1) === JSON.stringify(outP2));

// Chakralar-Reiki (author=null) doğru pozisyonda (rank 3 → index 2) ve author null
const full = deriveChakraBibliography(permute(SOURCES, P1).map(([t, a]) => ev(t, a)));
check("Chakralar-Reiki index 2'de ve author=null",
  full[2]!.title === "Chakralar-Reiki Enerji ve Kuantum Merkezi" && full[2]!.author === null);

// Kanonik listede OLMAYAN kaynak → ranked'lerin SONRASINA, alfabetik
const withUnknown = [
  ev("Zzz Bilinmeyen Kaynak", "Anon"),
  ev("Aaa Başka Bilinmeyen", "Anon"),
  ...permute(SOURCES, P2).map(([t, a]) => ev(t, a)),
];
const uTitles = deriveChakraBibliography(withUnknown).map((x) => x.title);
check("bilinmeyen kaynaklar 11 kanonik eserin SONRASINDA", uTitles.length === 13 &&
  JSON.stringify(uTitles.slice(0, 11)) === JSON.stringify(expected));
check("bilinmeyen kaynaklar kendi aralarında alfabetik",
  uTitles[11] === "Aaa Başka Bilinmeyen" && uTitles[12] === "Zzz Bilinmeyen Kaynak",
  JSON.stringify(uTitles.slice(11)));

// Duplicate + blank dedup korunur (girdi sırası farklı olsa da)
const dupBlank = [
  ev("", "X"), // blank title → elenir
  ...permute(SOURCES, P1).map(([t, a]) => ev(t, a)),
  ev("Biyoenerji", "Dr. Şuayip Dağıstanlı"), // dup → tek
];
const dTitles = deriveChakraBibliography(dupBlank).map((x) => x.title);
check("blank elendi + dup tekilleşti (11 eser, kanonik sıra)",
  JSON.stringify(dTitles) === JSON.stringify(expected), JSON.stringify(dTitles));

// Boş girdi → boş çıktı
check("boş blocks → boş Kaynakça", deriveChakraBibliography([]).length === 0);

console.log(`\nBİYOENERJİ FAZ 3.3E-R — KAYNAKÇA DETERMİNİSTİK EDİTORYAL SIRA HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail) { console.log("\nBAŞARISIZ:"); failures.forEach((f) => console.log("  " + f)); console.log("\nOVERALL = FAIL"); process.exit(1); }
console.log("OVERALL = PASS");
