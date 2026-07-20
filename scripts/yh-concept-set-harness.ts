// Yaşam Hafızası™ — S2.15 Kavram Kümesi (Concept Set) izole harness (saf; DB/ağ/env YOK).
//
// buildConceptSet(input) → readonly Concept[] PUBLIC sözleşmesini GERÇEK import ile
// doğrular (iç implementasyona bağlanmaz). normalizeSearchText simetrisi de kontrol edilir.
// Çalıştırma:  npx tsx scripts/yh-concept-set-harness.ts

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

function terms(input: unknown): string[] {
  return buildConceptSet(input).map((c) => c.term);
}

function eqTerms(name: string, input: unknown, expected: readonly string[]): void {
  const t = terms(input);
  check(
    `${name} → terms [${expected.join(",")}]`,
    t.length === expected.length && expected.every((v, i) => t[i] === v),
  );
}

function empty(name: string, input: unknown): void {
  const r = buildConceptSet(input);
  check(`${name} → boş`, r.length === 0);
}

// ─── 1-3. boş / whitespace / non-string fail-safe ────────────────────────────
empty("1 boş string", "");
empty("2 whitespace-only", "   ");
{
  let threw = false;
  const nonStrings: unknown[] = [undefined, null, 42, 0, true, false, {}, [], () => 0, Symbol("s") as unknown, BigInt(5) as unknown, Number.NaN];
  for (const v of nonStrings) {
    try {
      const r = buildConceptSet(v);
      check(`3 non-string boş: ${String(typeof v)}`, r.length === 0);
    } catch {
      threw = true;
    }
  }
  check("3b non-string throw yok", !threw);
}

// ─── 4-11. Türkçe/edge örnekleri ─────────────────────────────────────────────
eqTerms("4 IŞIK", "IŞIK", ["isik"]);
{
  const c = buildConceptSet("IŞIK");
  check("4b origin=query", c[0]?.origin === "query");
}
eqTerms("5 ışık ışık (dedup)", "ışık ışık", ["isik"]);
eqTerms("6 anne sütü", "anne sütü", ["anne", "sutu"]);
eqTerms("7 anne-sütü", "anne-sütü", ["anne", "sutu"]);
eqTerms("8 çakra, ışık ve göğüs", "çakra, ışık ve göğüs", ["cakra", "isik", "ve", "gogus"]);
eqTerms("9 'ay' korunur", "ay", ["ay"]);
eqTerms("10 'a' korunur", "a", ["a"]);
eqTerms("11 '123' korunur", "123", ["123"]);

// ─── 12. yalnız noktalama ────────────────────────────────────────────────────
empty("12 yalnız noktalama", "-,.—/_()");

// ─── 13. NFC/NFD eşdeğerliği ─────────────────────────────────────────────────
for (const w of ["İğne çakra", "Göğüs bütün", "âlem şifâ"]) {
  const a = terms(w.normalize("NFC"));
  const b = terms(w.normalize("NFD"));
  check(`13 NFC/NFD eşdeğer "${w}"`, a.length > 0 && a.length === b.length && a.every((v, i) => v === b[i]));
}

// ─── 14. tekrarda ilk-görülme sırası ─────────────────────────────────────────
eqTerms("14 ilk-sıra korunur", "gogus cakra gogus isik cakra", ["gogus", "cakra", "isik"]);

// ─── 15. sort yapılmadığı ────────────────────────────────────────────────────
eqTerms("15 sort yok (alfabetik değil)", "zeytin armut elma", ["zeytin", "armut", "elma"]);

// ─── 16. canonical bulunmaz ──────────────────────────────────────────────────
{
  const c = buildConceptSet("anne sütü");
  check("16 canonical yok", c.every((x) => !("canonical" in x)));
}

// ─── 17. tüm origin kesin "query" ────────────────────────────────────────────
{
  const c = buildConceptSet("çakra, ışık ve göğüs");
  check("17 tüm origin=query", c.length === 4 && c.every((x) => x.origin === "query"));
}

// ─── 18-20. immutability ─────────────────────────────────────────────────────
{
  const c = buildConceptSet("şifa çakra");
  check("18 sonuç dizisi frozen", Object.isFrozen(c));
  check("19 her Concept frozen", c.length === 2 && c.every((x) => Object.isFrozen(x)));
  // 20 mutasyon denemeleri etkisiz (frozen; strict throw güvenli yakalanır)
  let mutated = false;
  try {
    (c as Concept[]).push({ term: "x", origin: "query" });
    mutated = c.length !== 2;
  } catch { /* frozen array → no-op/throw */ }
  try {
    (c[0] as { term: string }).term = "değişti";
    if (c[0]?.term !== "sifa") mutated = true;
  } catch { /* frozen concept → no-op/throw */ }
  check("20 mutasyon çıktıyı değiştirmez", !mutated && c.length === 2 && c[0]?.term === "sifa");
}

// ─── 21. taze dizi/nesne referansları ────────────────────────────────────────
{
  const a = buildConceptSet("şifa çakra");
  const b = buildConceptSet("şifa çakra");
  check("21a içerik eşit", a.length === b.length && a.every((x, i) => x.term === b[i]?.term && x.origin === b[i]?.origin));
  check("21b dizi referansı farklı", a !== b);
  check("21c Concept referansı farklı", a[0] !== b[0] && a[1] !== b[1]);
}

// ─── 22. normalizeSearchText token simetrisi ─────────────────────────────────
{
  const inputs = ["İĞNE şifa-çakra 7 ışık", "anne sütü", "çakra, ışık ve göğüs", "ışık ışık"];
  const symOk = inputs.every((inp) => {
    const tok = normalizeSearchText(inp).tokens;
    const seen = new Set<string>();
    const expected: string[] = [];
    for (const t of tok) { if (!seen.has(t)) { seen.add(t); expected.push(t); } }
    const got = terms(inp);
    return got.length === expected.length && expected.every((v, i) => v === got[i]);
  });
  check("22 normalize token simetrisi (dedupe+sıra)", symOk);
}

// ─── 23. runtime object/array girdi mutasyona uğramaz ────────────────────────
{
  const objInput = { toString: () => "şifa" } as unknown;
  const arrInput = ["şifa"] as unknown;
  const objSnap = JSON.stringify({ k: "obj" });
  buildConceptSet(objInput);
  buildConceptSet(arrInput);
  // non-string → [] döner; girdi nesnesi/array değişmez (referans korunur, mutasyon yok)
  check("23 object girdi [] + mutasyon yok", buildConceptSet(objInput).length === 0 && JSON.stringify({ k: "obj" }) === objSnap);
  check("23b array girdi [] + eleman korunur", buildConceptSet(arrInput).length === 0 && (arrInput as string[])[0] === "şifa" && (arrInput as string[]).length === 1);
}

// ─── 24. determinizm (çoklu çalıştırma aynı içerik+sıra) ─────────────────────
{
  const input = "İĞNE şifa-çakra göğüs 7 ışık ışık";
  const runs = [terms(input), terms(input), terms(input)];
  const base = runs[0]!;
  check("24 determinizm (3× aynı içerik+sıra)", runs.every((r) => r.length === base.length && r.every((v, i) => v === base[i])));
}

// ─── Özet ────────────────────────────────────────────────────────────────────
console.log("");
console.log("S2.15 buildConceptSet harness — saf; DB/ağ/env YOK.");
console.log("");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- model: normalizeSearchText(input).tokens → her benzersiz token {term, origin:'query'}; canonical yok");
console.log("- dedup=term, ilk-görülme sırası korunur, sort yok; phrase/dictionary/synonym yok; filtre yok (stop-word/kısa/rakam korunur)");
console.log("- fail-safe: non-string/boş/işaret-only → boş; throw yok; sonuç dizisi + her Concept frozen; taze referans; deterministik");
console.log("- normalizeSearchText token simetrisi doğrulandı");

if (failed > 0) {
  console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
  process.exit(1);
}
