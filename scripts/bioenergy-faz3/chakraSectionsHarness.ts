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
  partitionBedenSistemBlocks,
  resolveActiveChakraSection,
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

// 9) Tek-section workspace seçim sözleşmesi (resolveActiveChakraSection)
// Default: param yok → İLK görünür section
check("Default (param null) → ilk görünür section", resolveActiveChakraSection(full, null)?.id === "genel-bakis");
check("Default (param boş string) → ilk görünür", resolveActiveChakraSection(full, "")?.id === "genel-bakis");
// Geçerli param → o section
check("Geçerli param → o section", resolveActiveChakraSection(full, "beden-sistem")?.id === "beden-sistem");
check("Geçerli param 2 → taslar", resolveActiveChakraSection(full, "taslar-destekleyiciler")?.id === "taslar-destekleyiciler");
// Geçersiz param → güvenli fallback İLK görünür
check("Geçersiz param → ilk görünür fallback", resolveActiveChakraSection(full, "bilinmeyen-xyz")?.id === "genel-bakis");
// Future section hash → görünür değil → fallback ilk
check("Future hash (enerji-anatomisi) → fallback ilk", resolveActiveChakraSection(full, "enerji-anatomisi")?.id === "genel-bakis");
check("Future hash (uygulamalar) → fallback ilk", resolveActiveChakraSection(full, "uygulamalar")?.id === "genel-bakis");
// Görünmeyen (bu kayıtta boş) section param → fallback ilk
const partial = buildChakraSections({ causes: "x", notes: "y" }, { stonesVisible: false });
check("Kayıtta olmayan section param → fallback ilk görünür", resolveActiveChakraSection(partial, "beden-sistem")?.id === "nedenler-blokajlar");
// Boş sections → null
check("Boş sections → null", resolveActiveChakraSection([], "genel-bakis") === null);
// Her görünür section kendi hash'iyle seçilebilir (all-selectable)
check(
  "6 görünür section'ın hepsi kendi hash'iyle seçilebilir",
  full.every((s) => resolveActiveChakraSection(full, s.hash)?.id === s.id),
);
// stones section param stonesVisible=false iken seçilemez → fallback
check(
  "stones param ama stones görünmez → fallback ilk",
  resolveActiveChakraSection(noStones, "taslar-destekleyiciler")?.id === "genel-bakis",
);

// 10) Adaptif workspace — Beden & Sistem bölümlemesi (SAF SUNUM, veri kaybı yok)
const bedenFull = byId["beden-sistem"]!;
const part = partitionBedenSistemBlocks(bedenFull);
check(
  "Beden partition: primary = Fiziksel Etkiler",
  part.primary.length === 1 && part.primary[0]?.title === "Fiziksel Etkiler" && part.primary[0]?.text === "Bel, bacaklar",
);
check(
  "Beden partition: context = Organlar + Bezler (sıra korunur)",
  part.context.map((b) => b.title).join(",") === "Organlar,Bezler",
  part.context.map((b) => b.title).join(","),
);
check(
  "Beden partition: context metinleri korunmuş",
  part.context[0]?.text === "Böbrekler" && part.context[1]?.text === "Böbrek üstü bezi",
);
check(
  "Beden partition: veri kaybı yok (primary+context == tüm bloklar)",
  part.primary.length + part.context.length === bedenFull.blocks.length,
);
// Yalnız physical → context boş → çağıran tek kolona döner (adaptif değil)
const onlyPhysical = buildChakraSections({ physical: "x" }, { stonesVisible: false });
const partPhysical = partitionBedenSistemBlocks(onlyPhysical.find((s) => s.id === "beden-sistem")!);
check("Yalnız physical → context boş (tek kolon)", partPhysical.primary.length === 1 && partPhysical.context.length === 0);
// Yalnız organs/glands → primary boş → çağıran tek kolona döner (boş sol yok)
const onlyStructural = buildChakraSections({ organs: "o", glands: "g" }, { stonesVisible: false });
const partStructural = partitionBedenSistemBlocks(onlyStructural.find((s) => s.id === "beden-sistem")!);
check("Yalnız organs+glands → primary boş (tek kolon, boş sol yok)", partStructural.primary.length === 0 && partStructural.context.length === 2);
// Adaptif iki kolon yalnız her iki alan da doluyken (physical + en az bir yapısal)
check(
  "Adaptif iki kolon koşulu: full record'da primary>0 && context>0",
  part.primary.length > 0 && part.context.length > 0,
);

// 11) Genel Bakış domain izolasyonu — yalnız kendi verisi (Renk); taş/organ/bez
// gibi başka section'ın verisini ASLA içermez (context panel "boşluk doldurma"
// için başka domain'i ödünç almaz). Sağ panel taş sayaçları buradan üretilemez.
const genelSec = byId["genel-bakis"]!;
check("Genel Bakış tek blok (Renk)", genelSec.blocks.length === 1 && genelSec.blocks[0]?.title === "Renk");
check(
  "Genel Bakış yalnız color verisi (taş/organ/bez ödünç YOK)",
  genelSec.blocks.every((b) => b.title === "Renk"),
);
const FORBIDDEN_GENEL_TITLES = ["Organlar", "Bezler", "Fiziksel Etkiler", "Kayıtlı taş", "Doğaltaş’ta eşleşen", "Kütüphanede ek taş"];
check(
  "Genel Bakış'ta yabancı-domain başlık yok",
  !genelSec.blocks.some((b) => b.title && FORBIDDEN_GENEL_TITLES.includes(b.title)),
);
// Genel Bakış color'a bağlı: color yoksa section hiç üretilmez (placeholder yok)
const noColor = buildChakraSections({ causes: "x" }, { stonesVisible: true });
check("Color yoksa Genel Bakış section üretilmez", !noColor.some((s) => s.id === "genel-bakis"));
// partitionBedenSistemBlocks yalnız Beden domain'ine anlamlı: Genel Bakış'a
// uygulanınca "Renk" context'e DÜŞMEZ (primary'de kalır) → yanlış bağlam yok
const genelPart = partitionBedenSistemBlocks(genelSec);
check("Genel Bakış partition: Renk primary'de kalır, context boş", genelPart.primary.length === 1 && genelPart.context.length === 0);

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
