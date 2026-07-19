// Yaşam Hafızası™ — S2.14 Türkçe retrieval normalize izole harness (saf; DB/ağ/env YOK).
//
// normalizeSearchText(input) → { normalizedText, tokens } sözleşmesini GERÇEK import ile
// doğrular (kopya/taklit YOK). Production Supabase'de salt-okunur SELECT ile teyit edilen
// DB simetri fixture'ı regression guard olarak sabitlenir. Gerçek DB/IO YOK.
// Çalıştırma:  npx tsx scripts/yh-normalize-harness.ts

import {
  normalizeSearchText,
  type NormalizedSearchText,
} from "../lib/yasam-hafizasi/search/normalize";

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

function eqText(name: string, input: unknown, expected: string): void {
  check(`${name} → normalizedText "${expected}"`, normalizeSearchText(input).normalizedText === expected);
}

function eqTokens(name: string, input: unknown, expected: readonly string[]): void {
  const t = normalizeSearchText(input).tokens;
  check(
    `${name} → tokens [${expected.join(",")}]`,
    t.length === expected.length && expected.every((v, i) => t[i] === v),
  );
}

function empty(name: string, input: unknown): void {
  const r = normalizeSearchText(input);
  check(`${name} → boş fail-safe`, r.normalizedText === "" && r.tokens.length === 0);
}

// ─── 1. Production DB ile doğrulanmış Türkçe örnekleri (regression fixture) ───
// KAYNAK: production Supabase salt-okunur SELECT — to_tsvector('simple', yh_immutable_unaccent(x)).
const DB_FIXTURE: ReadonlyArray<readonly [string, string]> = [
  ["IŞIK", "isik"],
  ["Işık", "isik"],
  ["ışık", "isik"],
  ["İĞNE", "igne"],
  ["İğne", "igne"],
  ["igne", "igne"],
  ["ŞİFA", "sifa"],
  ["ÇAKRA", "cakra"],
  ["GÖĞÜS", "gogus"],
  ["BÜTÜN", "butun"],
];
for (const [input, expected] of DB_FIXTURE) {
  eqText(`DB-fixture ${input}`, input, expected);
  eqTokens(`DB-fixture ${input}`, input, [expected]);
}

// ─── 2. Tek karakter matrisi ─────────────────────────────────────────────────
const CHAR_MATRIX: ReadonlyArray<readonly [string, string]> = [
  ["I", "i"], ["İ", "i"], ["ı", "i"], ["i", "i"],
  ["Ç", "c"], ["ç", "c"], ["Ğ", "g"], ["ğ", "g"],
  ["Ö", "o"], ["ö", "o"], ["Ş", "s"], ["ş", "s"],
  ["Ü", "u"], ["ü", "u"], ["Â", "a"], ["â", "a"],
  ["Î", "i"], ["î", "i"], ["Û", "u"], ["û", "u"],
];
for (const [ch, expected] of CHAR_MATRIX) {
  eqText(`char ${ch}`, ch, expected);
}

// ─── 3. Unicode NFC/NFD eşdeğerliği ──────────────────────────────────────────
for (const w of ["İğne", "Göğüs", "Bütün", "âlem", "şifâ"]) {
  const nfc = w.normalize("NFC");
  const nfd = w.normalize("NFD");
  const rc = normalizeSearchText(nfc);
  const rd = normalizeSearchText(nfd);
  check(
    `NFC/NFD eşdeğer "${w}"`,
    rc.normalizedText === rd.normalizedText && rc.normalizedText.length > 0,
  );
}

// ─── 4. Noktalama ve ayırıcılar → boşluk ─────────────────────────────────────
eqTokens("tire", "şifa-çakra", ["sifa", "cakra"]);
eqTokens("altçizgi", "şifa_çakra", ["sifa", "cakra"]);
eqTokens("slash", "şifa/çakra", ["sifa", "cakra"]);
eqTokens("virgül", "şifa,çakra", ["sifa", "cakra"]);
eqTokens("nokta", "şifa.çakra", ["sifa", "cakra"]);
eqTokens("em-dash", "şifa—çakra", ["sifa", "cakra"]);
eqTokens("en-dash", "şifa–çakra", ["sifa", "cakra"]);
eqTokens("parantez/tırnak/apostrof", "(şifa) \"çakra\" anne'nin", ["sifa", "cakra", "anne", "nin"]);

// ─── 5. Whitespace ───────────────────────────────────────────────────────────
eqText("leading/trailing", "   şifa   ", "sifa");
eqTokens("çoklu boşluk", "şifa    çakra", ["sifa", "cakra"]);
eqTokens("tab", "şifa\tçakra", ["sifa", "cakra"]);
eqTokens("newline", "şifa\nçakra", ["sifa", "cakra"]);
eqTokens("carriage return", "şifa\r\nçakra", ["sifa", "cakra"]);
eqTokens("non-breaking space", "şifa çakra", ["sifa", "cakra"]);

// ─── 6. Sayılar korunur ──────────────────────────────────────────────────────
eqTokens("çakra 7", "çakra 7", ["cakra", "7"]);
eqTokens("80 mg", "80 mg", ["80", "mg"]);
eqTokens("b12 vitamini", "b12 vitamini", ["b12", "vitamini"]);

// ─── 7. Duplicate token'lar korunur (dedupe YOK) ─────────────────────────────
eqTokens("duplicate", "şifa şifa çakra", ["sifa", "sifa", "cakra"]);

// ─── 8. Empty / fail-safe girdiler ───────────────────────────────────────────
empty("boş string", "");
empty("yalnız boşluk", "   ");
empty("yalnız noktalama", "-,.—/_()");
empty("null", null);
empty("undefined", undefined);
empty("number", 42);
empty("boolean", true);
empty("object", {});
empty("array", []);
empty("function", () => "x");
empty("symbol", Symbol("x") as unknown);
empty("bigint", (BigInt(10) as unknown));
empty("NaN", Number.NaN);

// ─── 9. Determinizm ──────────────────────────────────────────────────────────
{
  const input = "İĞNE şifa-çakra 7 ışık";
  const a = normalizeSearchText(input);
  const b = normalizeSearchText(input);
  const c = normalizeSearchText(input);
  const deepEq = (x: NormalizedSearchText, y: NormalizedSearchText) =>
    x.normalizedText === y.normalizedText &&
    x.tokens.length === y.tokens.length &&
    x.tokens.every((v, i) => v === y.tokens[i]);
  check("determinizm (3× deep-equal)", deepEq(a, b) && deepEq(b, c));
}

// ─── 10. Mutasyonsuzluk ──────────────────────────────────────────────────────
{
  const input = "şifa çakra";
  const r = normalizeSearchText(input);
  check("sonuç objesi frozen", Object.isFrozen(r));
  check("tokens dizisi frozen", Object.isFrozen(r.tokens));
  // Girdi string zaten değişmez (primitive); referans korunur.
  check("input değişmedi", input === "şifa çakra");
  // Frozen array'e mutasyon denemesi (strict mode'da throw; güvenli yakala).
  let mutated = false;
  try {
    (r.tokens as string[]).push("x");
    mutated = r.tokens.length !== 2;
  } catch {
    mutated = false;
  }
  check("frozen tokens mutasyona dirençli", !mutated && r.tokens.length === 2);
}

// ─── 11. DB simetri fixture (regression guard — açık) ────────────────────────
{
  const SYMMETRY: ReadonlyArray<readonly [string, string]> = [
    ["ışık", "isik"],
    ["İğne", "igne"],
    ["Göğüs", "gogus"],
    ["Bütün", "butun"],
  ];
  const ok = SYMMETRY.every(([q, tok]) => normalizeSearchText(q).tokens[0] === tok);
  check("DB simetri fixture (production teyitli)", ok);
}

// ─── 12. throw etmezlik (fail-safe garanti) ──────────────────────────────────
{
  let threw = false;
  const evil: unknown[] = [
    null, undefined, 0, -0, 1.5, true, false, {}, [], () => 0,
    Symbol("s") as unknown, BigInt(5) as unknown, Number.NaN, Infinity,
    "İĞNE", "ışık", "", "   ", "a".repeat(10000),
  ];
  for (const v of evil) {
    try {
      normalizeSearchText(v);
    } catch {
      threw = true;
    }
  }
  check("hiçbir girdide throw etmez", !threw);
}

// ─── Özet ────────────────────────────────────────────────────────────────────
console.log("");
console.log("S2.14 normalizeSearchText harness — saf; DB/ağ/env YOK.");
console.log("");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- production DB fixture (to_tsvector('simple',unaccent)): ışık→isik · İğne→igne · Göğüs→gogus · Bütün→butun");
console.log("- fold: I/İ/ı/i→i · ç→c · ğ→g · ö→o · ş→s · ü→u · â→a · î→i · û→u; NFD + combining-mark strip; generic lowercase (locale YOK)");
console.log("- noktalama/tire/altçizgi/sembol→boşluk; çoklu whitespace→tek; trim; whitespace tokenize (dedupe/sort/stop-list/stemmer YOK)");
console.log("- fail-safe: string-olmayan/boş/işaret-only → {\"\",[]}; hiçbir girdide throw yok; sonuç+tokens frozen (mutasyonsuz); deterministik");

if (failed > 0) {
  console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
  process.exit(1);
}
