/**
 * F3A — İki regresyon dökümünü (regression-dump.ts) normalize parça düzeyinde karşılaştırır.
 * Her senaryo için: parça kümesi (document/header/footer/styles/numbering/rels/[Content_Types]/
 * settings/fontTable…) ve media SHA kümesi BİREBİR aynı olmalı.
 *
 * Çalıştır: npx tsx scripts/expert-branding/regression-compare.ts <A> <B>
 * Çıktı: "N PASS / M FAIL"
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const [A, B] = process.argv.slice(2);
if (!A || !B) throw new Error("iki klasör gerekli");
const sa = JSON.parse(readFileSync(path.join(A, "summary.json"), "utf8")) as Record<string, Record<string, string>>;
const sb = JSON.parse(readFileSync(path.join(B, "summary.json"), "utf8")) as Record<string, Record<string, string>>;

let pass = 0;
let fail = 0;
const names = Array.from(new Set([...Object.keys(sa), ...Object.keys(sb)])).sort();
for (const n of names) {
  const a = sa[n];
  const b = sb[n];
  if (!a || !b) { fail++; console.log(`  ✗ ${n}: bir tarafta yok`); continue; }
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
  const diff = keys.filter((k) => a[k] !== b[k]);
  if (diff.length) { fail++; console.log(`  ✗ ${n}: farklı parça(lar): ${diff.join(", ")}`); }
  else { pass++; console.log(`  ✓ ${n}: ${keys.length} parça eşit (${keys.filter((k) => k.startsWith("media:")).length} media)`); }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
