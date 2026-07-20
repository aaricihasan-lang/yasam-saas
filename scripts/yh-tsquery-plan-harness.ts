// Yaşam Hafızası™ — S2.17 search_tsv tsquery Plan izole harness (saf; DB/ağ/env YOK).
//
// buildTsQueryPlan(concepts) → TsQueryPlan PUBLIC sözleşmesini GERÇEK import ile doğrular.
// Girdi Concept[] (S2.15/S2.16 çıktısı biçimi). DB/RPC/textSearch/Supabase YOK.
// Çalıştırma:  npx tsx scripts/yh-tsquery-plan-harness.ts

import {
  buildTsQueryPlan,
  type TsQueryPlan,
} from "../lib/yasam-hafizasi/search/tsQueryPlan";
import type { Concept, ConceptOrigin } from "../lib/yasam-hafizasi/search/types";

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

const C = (term: string, origin: ConceptOrigin = "query"): Concept => ({ term, origin });
const frags = (p: TsQueryPlan): string[] => p.clauses.map((c) => c.fragment);

// ─── 1. Boş concept listesi ──────────────────────────────────────────────────
{
  const p = buildTsQueryPlan([]);
  check("1 boş → isEmpty", p.isEmpty === true);
  check("1b boş → tsquery ''", p.tsquery === "");
  check("1c boş → clauses []", p.clauses.length === 0);
}

// ─── 2. Tek query concept → prefix ───────────────────────────────────────────
{
  const p = buildTsQueryPlan([C("isik", "query")]);
  check("2 tek query → 1 clause", p.clauses.length === 1);
  const cl = p.clauses[0]!;
  check("2b kind=prefix", cl.kind === "prefix");
  check("2c fragment isik:*", cl.fragment === "isik:*");
  check("2d term=isik", cl.term === "isik");
  check("2e tsquery isik:*", p.tsquery === "isik:*");
  check("2f isEmpty false", p.isEmpty === false);
}

// ─── 3. Tek synonym concept → prefix, origin korunur ─────────────────────────
{
  const p = buildTsQueryPlan([C("yurek", "synonym")]);
  const cl = p.clauses[0]!;
  check("3 synonym prefix clause", cl.kind === "prefix" && cl.fragment === "yurek:*");
  check("3b origin=synonym korunur", cl.origin === "synonym");
}

// ─── 4. Çok kelimeli query concept → exact phrase, prefix YOK ─────────────────
{
  const p = buildTsQueryPlan([C("anne sutu", "query")]);
  const cl = p.clauses[0]!;
  check("4 kind=phrase", cl.kind === "phrase");
  check("4b fragment (anne <-> sutu)", cl.fragment === "(anne <-> sutu)");
  check("4c prefix yok (:* içermez)", !cl.fragment.includes(":*"));
  check("4d term='anne sutu'", cl.term === "anne sutu");
}

// ─── 5. Çok kelimeli synonym concept → origin korunur, phrase doğru ──────────
{
  const p = buildTsQueryPlan([C("kutsal yag", "synonym")]);
  const cl = p.clauses[0]!;
  check("5 phrase fragment", cl.fragment === "(kutsal <-> yag)");
  check("5b origin=synonym korunur", cl.origin === "synonym");
}

// ─── 6. Çoklu concept → OR birleşimi, giriş sırası korunur ───────────────────
{
  const p = buildTsQueryPlan([C("isik", "query"), C("anne sutu", "synonym"), C("lavanta", "query")]);
  check("6 3 clause", p.clauses.length === 3);
  check("6b OR birleşimi + sıra", p.tsquery === "isik:* | (anne <-> sutu) | lavanta:*");
  check("6c fragment sırası", frags(p).join(",") === "isik:*,(anne <-> sutu),lavanta:*");
}

// ─── 7. Aynı fragment tekrarında serializer dedup ────────────────────────────
{
  const p = buildTsQueryPlan([C("isik", "query"), C("isik", "synonym")]);
  check("7 aynı fragment tek clause", p.clauses.length === 1);
  check("7b ilk görünüm origin=query korunur", p.clauses[0]!.origin === "query");
  check("7c tsquery tek fragment", p.tsquery === "isik:*");
}

// ─── 8. Boş term → clause atlanır, throw yok ─────────────────────────────────
{
  let threw = false;
  let p: TsQueryPlan | null = null;
  try {
    p = buildTsQueryPlan([C("", "query"), C("isik", "query")]);
  } catch {
    threw = true;
  }
  check("8 boş term → throw yok", !threw);
  check("8b boş term clause atlanır", p !== null && p.clauses.length === 1 && p.clauses[0]!.term === "isik");
}

// ─── 9. Yalnız whitespace term → clause atlanır ──────────────────────────────
{
  const p = buildTsQueryPlan([C("   ", "query"), C("\t\n ", "synonym"), C("isik", "query")]);
  check("9 whitespace term atlanır", p.clauses.length === 1 && p.clauses[0]!.term === "isik");
}

// ─── 10. Geçersiz meta-karakter içeren term clause olarak kabul edilmez ──────
{
  const metas = ["|", "&", "!", ":", "*", "(", ")", "<", ">"];
  let allSkipped = true;
  for (const m of metas) {
    const p = buildTsQueryPlan([C(`is${m}ik`, "query")]);
    if (!p.isEmpty || p.clauses.length !== 0) allSkipped = false;
  }
  check("10 meta-karakterli term reddedilir (9 meta)", allSkipped);
  // bare operatör term de reddedilir
  const bare = buildTsQueryPlan([C("*", "query"), C(":*", "query"), C("<->", "query")]);
  check("10b bare operatör term reddedilir", bare.isEmpty === true);
}

// ─── 11. Kısmen bozuk phrase: tek token geçersizse tüm phrase atlanır ────────
{
  const p = buildTsQueryPlan([C("anne su:tu", "query"), C("temiz kelime", "query")]);
  check("11 kısmi bozuk phrase tümüyle atlanır", p.clauses.length === 1 && p.clauses[0]!.fragment === "(temiz <-> kelime)");
}

// ─── 12. Güvenli rakamlı lexeme kabul edilir ─────────────────────────────────
{
  const p = buildTsQueryPlan([C("b12", "query"), C("omega3", "synonym"), C("vitamin b12", "query")]);
  check("12 b12 prefix", p.clauses[0]!.fragment === "b12:*");
  check("12b omega3 prefix", p.clauses[1]!.fragment === "omega3:*");
  check("12c 'vitamin b12' phrase", p.clauses[2]!.fragment === "(vitamin <-> b12)");
}

// ─── 13. Determinizm (aynı girdi ≥3 çalıştırma) ──────────────────────────────
{
  const input = [C("isik", "query"), C("anne sutu", "synonym"), C("lavanta", "query")];
  const sig = (p: TsQueryPlan): string =>
    `${p.config}|${p.column}|${p.isEmpty}|${p.tsquery}|` +
    p.clauses.map((c) => `${c.term}~${c.origin}~${c.kind}~${c.fragment}`).join(";");
  const r1 = sig(buildTsQueryPlan(input));
  const r2 = sig(buildTsQueryPlan(input));
  const r3 = sig(buildTsQueryPlan(input));
  check("13 determinizm (3× aynı)", r1 === r2 && r2 === r3);
}

// ─── 14. Immutability + girdi değişmezliği ───────────────────────────────────
{
  const input: Concept[] = [C("isik", "query"), C("anne sutu", "synonym")];
  const inLenBefore = input.length;
  const inTermBefore = input[0]!.term;
  const p = buildTsQueryPlan(input);
  check("14 plan frozen", Object.isFrozen(p));
  check("14b clauses frozen", Object.isFrozen(p.clauses));
  check("14c her clause frozen", p.clauses.every((c) => Object.isFrozen(c)));
  let mutated = false;
  try {
    (p.clauses[0] as { term: string }).term = "x";
    if (p.clauses[0]!.term !== "isik") mutated = true;
  } catch {
    /* frozen → no-op/throw */
  }
  check("14d clause mutasyonu etkisiz", !mutated);
  check("14e girdi değişmedi", input.length === inLenBefore && input[0]!.term === inTermBefore);
}

// ─── 15. Her çağrıda yeni referans ───────────────────────────────────────────
{
  const input = [C("isik", "query")];
  const a = buildTsQueryPlan(input);
  const b = buildTsQueryPlan(input);
  check("15 plan referansı farklı", a !== b);
  check("15b clauses referansı farklı", a.clauses !== b.clauses);
  check("15c clause referansı farklı", a.clauses[0] !== b.clauses[0]);
  check("15d içerik eşit", a.tsquery === b.tsquery && a.clauses[0]!.fragment === b.clauses[0]!.fragment);
}

// ─── 16. Sabit değişmezler ───────────────────────────────────────────────────
{
  const p = buildTsQueryPlan([C("isik", "query")]);
  check("16 config==='simple'", p.config === "simple");
  check("16b column==='search_tsv'", p.column === "search_tsv");
  const empty = buildTsQueryPlan([]);
  check("16c boş planda da sabitler", empty.config === "simple" && empty.column === "search_tsv");
}

// ─── 17. Tüm girdiler geçersizse → boş plan ──────────────────────────────────
{
  const p = buildTsQueryPlan([C("", "query"), C("  ", "query"), C("is|ik", "query"), C("a*b", "synonym")]);
  check("17 hepsi geçersiz → clauses []", p.clauses.length === 0);
  check("17b isEmpty true + tsquery ''", p.isEmpty === true && p.tsquery === "");
}

// ─── 18. tsquery'de kullanıcıdan gelen operatör bulunmaz ─────────────────────
{
  const p = buildTsQueryPlan([C("isik", "query"), C("an|ne", "query"), C("ka&lp", "synonym")]);
  // enjekte terimler tümüyle düşer → yalnız güvenli "isik:*" kalır
  check("18 enjekte terim düşer → yalnız güvenli fragment", p.tsquery === "isik:*");
  // güvenli çoklu build: tsquery yalnız izinli alfabe + kod operatörleri içerir
  const safe = buildTsQueryPlan([C("isik", "query"), C("anne sutu", "synonym"), C("lavanta", "query")]);
  check("18b tsquery yalnız izinli alfabe/operatör", /^[a-z0-9 :*<>()|-]*$/.test(safe.tsquery));
}

// ─── 19. Phrase'de :* yok, & yok, yalnız <-> ────────────────────────────────
{
  const cl = buildTsQueryPlan([C("bir iki uc", "query")]).clauses[0]!;
  check("19 phrase 3-token doğru", cl.fragment === "(bir <-> iki <-> uc)");
  check("19b phrase :* içermez", !cl.fragment.includes(":*"));
  check("19c phrase & içermez", !cl.fragment.includes("&"));
  check("19d phrase yalnız <-> operatörü", cl.fragment.includes("<->") && !cl.fragment.includes("|"));
}

// ─── 20. Plan tipinde candidateLimit bulunmadığı (runtime key kontrolü) ──────
{
  const p = buildTsQueryPlan([C("isik", "query")]);
  check("20 candidateLimit key yok", !("candidateLimit" in p));
  check("20b limit key yok", !("limit" in p));
  check("20c tsRank/weights key yok", !("tsRank" in p) && !("ts_rank" in p) && !("weights" in p));
  // plan yüzeyi tam olarak beklenen 5 anahtar
  check("20d plan yüzeyi = {config,column,clauses,tsquery,isEmpty}", Object.keys(p).sort().join(",") === "clauses,column,config,isEmpty,tsquery");
}

// ─── Özet ────────────────────────────────────────────────────────────────────
console.log("");
console.log("S2.17 buildTsQueryPlan harness — saf; DB/ağ/env YOK.");
console.log("");
console.log(`CHECK: ${passed} kontrol OK, ${failed} FAIL.`);
console.log("- tek kelime → prefix (term:*); çok kelime → exact phrase ((t1 <-> t2)); phrase'e prefix YOK");
console.log("- clause'lar giriş sırasıyla ' | ' (OR); config='simple'; column='search_tsv'");
console.log("- güvenlik: her lexeme ^[a-z0-9]+$ re-assert; geçersiz lexeme → clause atlanır; operatörler yalnız koddan; SQL/DB yok");
console.log("- fail-safe (boş/bozuk atlanır, throw yok); serializer fragment dedup; plan+clauses+clause frozen; deterministik");
console.log("- candidateLimit/ts_rank/weights plan yüzeyinde YOK");

if (failed > 0) {
  console.error(`\n✗ ${failed} kontrol BAŞARISIZ.`);
  process.exit(1);
}
