// Yaşam Hafızası™ — S2.16 Dictionary Expansion izole harness (saf; DB/ağ/env YOK).
//
// expandConcepts(base, normalizedText, entries) → readonly Concept[] PUBLIC sözleşmesini
// GERÇEK import ile doğrular. base, S2.15 buildConceptSet ile; normalizedText S2.14
// normalizeSearchText ile üretilir (S2.17 orkestrasyon kablolaması taklit edilir).
// Çalıştırma:  npx tsx scripts/yh-dictionary-expansion-harness.ts

import {
  expandConcepts,
  type DictionaryEntry,
} from "../lib/yasam-hafizasi/search/dictionaryExpansion";
import { buildConceptSet } from "../lib/yasam-hafizasi/search/conceptSet";
import { normalizeSearchText } from "../lib/yasam-hafizasi/search/normalize";
import type { Concept } from "../lib/yasam-hafizasi/search/types";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean): void {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

/** S2.17 kablolamasını taklit et: query → base (S2.15) + normalizedText (S2.14) → expand. */
function run(query: string, entries: readonly DictionaryEntry[]): readonly Concept[] {
  const base = buildConceptSet(query);
  const normalizedText = normalizeSearchText(query).normalizedText;
  return expandConcepts(base, normalizedText, entries);
}

const termsOf = (o: readonly Concept[]): string[] => o.map((c) => c.term);

// ─── 1. entries=[] → base içerik korunur, taze frozen ────────────────────────
{
  const base = buildConceptSet("kalp");
  const nt = normalizeSearchText("kalp").normalizedText;
  const out = expandConcepts(base, nt, []);
  check(
    "1 entries=[] → base korunur",
    out.length === base.length && out.every((c, i) => c.term === base[i]?.term && c.origin === base[i]?.origin),
  );
  check("1b entries=[] → çıktı frozen", Object.isFrozen(out));
  check("1c entries=[] → taze dizi (referans farklı)", out !== base);
}

// ─── 2. normalizedText="" → genişleme yok ────────────────────────────────────
{
  const base = buildConceptSet("kalp");
  const out = expandConcepts(base, "", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  check("2 normalizedText='' → genişleme yok", out.length === base.length && out.every((c) => c.origin === "query"));
}

// ─── 3. bozuk runtime girdi → throw yok ──────────────────────────────────────
{
  let threw = false;
  const base = buildConceptSet("kalp");
  const nt = normalizeSearchText("kalp").normalizedText;
  const badEntrySets: unknown[] = [
    null,
    undefined,
    42,
    "notarray",
    true,
    {},
    [null, 5, "x", { canonical: 5 }, { canonical: "kalp", synonyms: "notarray" }, { synonyms: ["yurek"] }],
  ];
  for (const b of badEntrySets) {
    try {
      expandConcepts(base, nt, b as unknown as readonly DictionaryEntry[]);
    } catch {
      threw = true;
    }
  }
  try {
    expandConcepts(null as unknown as readonly Concept[], nt, []);
  } catch {
    threw = true;
  }
  try {
    expandConcepts(base, 123 as unknown as string, []);
  } catch {
    threw = true;
  }
  check("3 bozuk runtime girdi → throw yok", !threw);

  const outBrokenEntries = expandConcepts(base, nt, "notarray" as unknown as readonly DictionaryEntry[]);
  check(
    "3b entries dizi değil → base taze frozen kopya",
    Object.isFrozen(outBrokenEntries) && outBrokenEntries.length === base.length && outBrokenEntries !== base,
  );
  const outBrokenBase = expandConcepts(null as unknown as readonly Concept[], nt, []);
  check("3c base dizi değil → güvenli boş base", Object.isFrozen(outBrokenBase) && outBrokenBase.length === 0);
}

// ─── 4. canonical query eşleşmesi ────────────────────────────────────────────
{
  const out = run("kalp", [{ canonical: "kalp", synonyms: ["yurek", "gonul"] }]);
  check("4 canonical eşleşmesi → grup eklenir", termsOf(out).join(",") === "kalp,yurek,gonul");
  check("4b query 'kalp' origin=query", out[0]?.origin === "query");
  check("4c eklenenler origin=synonym", out.slice(1).every((c) => c.origin === "synonym"));
}

// ─── 5. query bir synonym ile eşleşince çift yönlü genişleme ──────────────────
{
  const out = run("yurek", [{ canonical: "kalp", synonyms: ["yurek", "gonul"] }]);
  check("5 synonym eşleşmesi → çift yönlü", termsOf(out).join(",") === "yurek,kalp,gonul");
  check("5b 'yurek' query kalır", out[0]?.origin === "query");
  const kalp = out.find((c) => c.term === "kalp");
  check("5c 'kalp' synonym+canonical=kalp", kalp?.origin === "synonym" && kalp?.canonical === "kalp");
}

// ─── 6. canonical önce, synonyms sonra sıra ──────────────────────────────────
{
  const out = run("bbb", [{ canonical: "aaa", synonyms: ["bbb", "ccc"] }]);
  // base [bbb]; suffix: canonical aaa önce, sonra ccc (bbb query'de dedup)
  check("6 emit sırası canonical→synonyms", termsOf(out).join(",") === "bbb,aaa,ccc");
}

// ─── 7. query-prefix değişmezliği (opak, aynı referans) ──────────────────────
{
  const base = buildConceptSet("kalp goz");
  const nt = normalizeSearchText("kalp goz").normalizedText;
  const out = expandConcepts(base, nt, [{ canonical: "kalp", synonyms: ["yurek"] }]);
  const prefixOpaque = base.every((c, i) => out[i] === c);
  check("7 query-prefix değişmez (opak referans)", prefixOpaque && out.length > base.length);
}

// ─── 8. synonym == query term dedup (query korunur) ──────────────────────────
{
  const out = run("kalp yurek", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  const kalpN = out.filter((c) => c.term === "kalp").length;
  const yurekN = out.filter((c) => c.term === "yurek").length;
  check("8 synonym==query dedup (query bastırır)", kalpN === 1 && yurekN === 1 && out.every((c) => c.origin === "query"));
}

// ─── 9. entry-içi duplicate synonym dedup ────────────────────────────────────
{
  const out = run("kalp", [{ canonical: "kalp", synonyms: ["yurek", "yurek", "YÜREK", " yürek "] }]);
  const yurekN = out.filter((c) => c.term === "yurek").length;
  check("9 entry-içi duplicate synonym tek kez", yurekN === 1 && termsOf(out).join(",") === "kalp,yurek");
}

// ─── 10. entry'ler arası global term dedup ───────────────────────────────────
{
  const out = run("kalp organ", [
    { canonical: "kalp", synonyms: ["yurek"] },
    { canonical: "organ", synonyms: ["yurek"] },
  ]);
  check("10 entry'ler arası global term dedup", out.filter((c) => c.term === "yurek").length === 1);
}

// ─── 11. origin/canonical provenance ─────────────────────────────────────────
{
  const out = run("kalp", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  const yurek = out.find((c) => c.term === "yurek");
  check("11 synonym provenance (origin=synonym, canonical=kalp)", yurek?.origin === "synonym" && yurek?.canonical === "kalp");
  check("11b query provenance (origin=query, canonical yok)", out[0]?.origin === "query" && !("canonical" in (out[0] as object)));
}

// ─── 12. canonical=self davranışı ────────────────────────────────────────────
{
  const out = run("yurek", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  const kalp = out.find((c) => c.term === "kalp");
  check("12 canonical yeni eklenince canonical=self", kalp?.origin === "synonym" && kalp?.canonical === "kalp");
}

// ─── 13. çok kelimeli canonical eşleşmesi ────────────────────────────────────
{
  const out = run("anne sutu faydalari", [{ canonical: "anne sutu", synonyms: ["laktasyon"] }]);
  const t = termsOf(out);
  check("13 çok kelimeli canonical eşleşmesi", t.includes("anne sutu") && t.includes("laktasyon"));
  const phrase = out.find((c) => c.term === "anne sutu");
  check("13b phrase Concept (origin=synonym, canonical=self)", phrase?.origin === "synonym" && phrase?.canonical === "anne sutu");
}

// ─── 14. çok kelimeli synonym eşleşmesi ──────────────────────────────────────
{
  const out = run("bebek anne sutu icer", [{ canonical: "laktasyon", synonyms: ["anne sutu"] }]);
  const t = termsOf(out);
  check("14 çok kelimeli synonym eşleşmesi", t.includes("laktasyon") && t.includes("anne sutu"));
  const lak = out.find((c) => c.term === "laktasyon");
  check("14b canonical (origin=synonym, canonical=laktasyon)", lak?.origin === "synonym" && lak?.canonical === "laktasyon");
}

// ─── 15. "anne" ⊄ "anneanne" ─────────────────────────────────────────────────
{
  const out = run("anneanne geldi", [{ canonical: "anne", synonyms: ["valide"] }]);
  const t = termsOf(out);
  check("15 'anne' ⊄ 'anneanne' (token sınırı)", !t.includes("valide") && !t.includes("anne"));
}

// ─── 16. dağınık tokenlar phrase eşleşmesi üretmez ───────────────────────────
{
  const out = run("anne bebek sutu", [{ canonical: "anne sutu", synonyms: ["laktasyon"] }]);
  const t = termsOf(out);
  check("16 dağınık token phrase üretmez (bitişik değil)", !t.includes("anne sutu") && !t.includes("laktasyon"));
}

// ─── 17. tek-sıçrama / transitif genişleme yok ───────────────────────────────
{
  const out = run("kalp", [
    { canonical: "kalp", synonyms: ["yurek"] },
    { canonical: "yurek", synonyms: ["gonul"] },
  ]);
  const t = termsOf(out);
  check("17 tek-sıçrama: eklenen synonym yeniden lookup etmez", t.includes("yurek") && !t.includes("gonul"));
}

// ─── 18. A↔B döngüsünde sonlu + tekrarsız çıktı ──────────────────────────────
{
  const out = run("a", [
    { canonical: "a", synonyms: ["b"] },
    { canonical: "b", synonyms: ["a"] },
  ]);
  const t = termsOf(out);
  check("18 A↔B döngüsü sonlu + tekrarsız", t.join(",") === "a,b" && new Set(t).size === t.length);
}

// ─── 19. boş canonical entry tümüyle atlanır ─────────────────────────────────
{
  const out = run("yurek", [
    { canonical: "   ", synonyms: ["yurek"] }, // normalize boş → entry atla (synonym'e rağmen)
    { canonical: "kalp", synonyms: ["damar"] },
  ]);
  const t = termsOf(out);
  check("19 boş canonical entry tümüyle atlanır", t.length === 1 && t[0] === "yurek" && out[0]?.origin === "query");
}

// ─── 20. boş / non-string synonym atlanır ────────────────────────────────────
{
  const out = run("kalp", [
    {
      canonical: "kalp",
      synonyms: ["  ", "-,.", 5 as unknown as string, null as unknown as string, "yurek"],
    },
  ]);
  check("20 boş/non-string synonym atlanır", termsOf(out).join(",") === "kalp,yurek");
}

// ─── 21. entries sırası korunur ──────────────────────────────────────────────
{
  const out = run("zeytin armut elma", [
    { canonical: "zeytin", synonyms: ["zeytinyagi"] },
    { canonical: "armut", synonyms: ["ampul"] },
    { canonical: "elma", synonyms: ["alma"] },
  ]);
  const syn = out.filter((c) => c.origin === "synonym").map((c) => c.term);
  check("21 entries sırası korunur", syn.join(",") === "zeytinyagi,ampul,alma");
}

// ─── 22. sort yapılmadığının kanıtı ──────────────────────────────────────────
{
  const out = run("zeytin armut", [
    { canonical: "zeytin", synonyms: ["yagi"] },
    { canonical: "armut", synonyms: ["bahce"] },
  ]);
  const syn = out.filter((c) => c.origin === "synonym").map((c) => c.term);
  // alfabetik sort [bahce,yagi] olurdu; entries sırası [yagi,bahce] verir
  check("22 sort yok (alfabetik değil)", syn.join(",") === "yagi,bahce");
}

// ─── 23. çıktı dizisi frozen ─────────────────────────────────────────────────
{
  const out = run("kalp", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  check("23 çıktı dizisi frozen", Object.isFrozen(out));
}

// ─── 24. yeni synonym Concept nesneleri frozen ───────────────────────────────
{
  const out = run("kalp", [{ canonical: "kalp", synonyms: ["yurek"] }]);
  const yurek = out.find((c) => c.term === "yurek");
  check("24 yeni synonym Concept frozen", yurek !== undefined && Object.isFrozen(yurek));
  let mutated = false;
  try {
    (yurek as { term: string }).term = "x";
    if (yurek?.term !== "yurek") mutated = true;
  } catch {
    /* frozen → no-op/throw */
  }
  check("24b synonym mutasyonu etkisiz", !mutated && yurek?.term === "yurek");
}

// ─── 25. base ve entries mutasyonu yok ───────────────────────────────────────
{
  const base = buildConceptSet("kalp");
  const baseLen = base.length;
  const baseTerm = base[0]?.term;
  const entries: DictionaryEntry[] = [{ canonical: "kalp", synonyms: ["yurek"] }];
  const synArr = entries[0]!.synonyms;
  const synLen = synArr.length;
  const entriesLen = entries.length;
  const nt = normalizeSearchText("kalp").normalizedText;
  expandConcepts(base, nt, entries);
  check("25 base mutasyonsuz", base.length === baseLen && base[0]?.term === baseTerm);
  check(
    "25b entries mutasyonsuz",
    entries.length === entriesLen && entries[0]?.synonyms.length === synLen && synArr.length === synLen,
  );
}

// ─── 26. aynı girdi ≥3 çalıştırmada eşdeğer çıktı ────────────────────────────
{
  const entries: DictionaryEntry[] = [
    { canonical: "kalp", synonyms: ["yurek", "gonul"] },
    { canonical: "goz", synonyms: ["ayna"] },
  ];
  const sig = (o: readonly Concept[]): string => o.map((c) => `${c.term}|${c.origin}|${c.canonical ?? ""}`).join(";");
  const r1 = sig(run("kalp goz", entries));
  const r2 = sig(run("kalp goz", entries));
  const r3 = sig(run("kalp goz", entries));
  check("26 determinizm (3× aynı çıktı)", r1 === r2 && r2 === r3);
}

// ─── 27. normalize simetrisi: Çakra / çakra / ÇAKRA ──────────────────────────
{
  const entries: DictionaryEntry[] = [{ canonical: "cakra", synonyms: ["enerji"] }];
  const ok = ["Çakra", "çakra", "ÇAKRA"].every((f) => {
    const t = termsOf(run(f, entries));
    return t.includes("cakra") && t.includes("enerji");
  });
  check("27 normalize simetrisi Çakra/çakra/ÇAKRA", ok);
}

// ─── 28. Türkçe normalize: İğne → igne ───────────────────────────────────────
{
  const out = run("igne batmasi", [{ canonical: "İğne", synonyms: ["batma"] }]);
  const batma = out.find((c) => c.term === "batma");
  check("28 Türkçe normalize İğne→igne (canonical eşleşir)", termsOf(out).includes("batma"));
  check("28b synonym canonical normalize = igne", batma?.canonical === "igne");
}

// ─── Özet ────────────────────────────────────────────────────────────────────
console.log("");
console.log("S2.16 expandConcepts harness — saf; DB/ağ/env YOK.");
console.log("");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- çıktı = [değişmez query prefix] + [synonym suffix]; sort yok; entries verilen sırayla; entry içi canonical→synonyms");
console.log("- dedup=normalize term (query synonym'i bastırır); yalnız origin='synonym' üretir; canonical=normalize(entry.canonical)");
console.log("- çok-kelime = bitişik alt-dizi (tam token eşitliği; 'anne'⊄'anneanne'); tek-sıçrama/transitif yok (A→B→A yok)");
console.log("- fail-safe: bozuk base/entries/normalizedText/entry/canonical/synonym → atla/boş; throw yok; çıktı+yeni Concept frozen; deterministik");

if (failed > 0) {
  console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
  process.exit(1);
}
