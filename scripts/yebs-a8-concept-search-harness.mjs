#!/usr/bin/env node
// ============================================================
// YEBS A8 — Concept label-aware search regression harness (STATIC, no-DB)
//
// TASK 1 doğrulaması: lib/yebs/service/concepts.ts listConcepts fonksiyonunun
// `q` filtresi slug'a EK OLARAK yebs_concept_labels.label metnine de bakar
// (label-aware), fakat READ-ONLY + tek-tablo + satır-tekilliği + DTO kontratı
// bozulmaz. Route q-param kontratı da değişmemiş olmalı.
//
// Statik: DB/ağ yok; yalnız kaynak dosya metnini fs ile okur ve iddia eder.
// Herhangi bir FAIL → exit(1).
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const SERVICE = join(ROOT, "lib", "yebs", "service", "concepts.ts");
const ROUTE = join(ROOT, "app", "api", "admin", "yebs", "concepts", "route.ts");

let pass = 0;
let fail = 0;
function ok(label) { pass++; console.log(`  PASS  ${label}`); }
function bad(label, extra) { fail++; console.log(`  FAIL  ${label}${extra ? `\n         ↳ ${extra}` : ""}`); }
function assert(cond, label, extra) { cond ? ok(label) : bad(label, extra); }

function read(p) {
  try { return readFileSync(p, "utf8"); }
  catch (e) { bad(`dosya okunamadı: ${p}`, String(e && e.message)); return ""; }
}

const svc = read(SERVICE);
const route = read(ROUTE);

// Sadece listConcepts gövdesini izole et (diğer fonksiyonlara sızmadan iddia için).
function sliceFn(src, sig) {
  const start = src.indexOf(sig);
  if (start < 0) return "";
  // Bir sonraki top-level export function / export async function'a kadar
  const rest = src.slice(start + sig.length);
  const nextExport = rest.search(/\nexport (async )?function /);
  return nextExport < 0 ? rest : rest.slice(0, nextExport);
}
const listBody = sliceFn(svc, "export async function listConcepts");

console.log("== YEBS A8 Concept Search Harness ==\n");

// --- (a) DTO değişmedi: exact YEBS_CONCEPT_COLUMNS seçilir; select("*") yok ---
assert(
  /YEBS_CONCEPT_COLUMNS\s*=\s*"id, tradition_id, school_id, slug, concept_type, status, created_at, updated_at"/.test(svc),
  "(a) YEBS_CONCEPT_COLUMNS canonical 8 kolon aynen korunmuş",
);
assert(
  listBody.includes('.select(YEBS_CONCEPT_COLUMNS, { count: "exact" })'),
  "(a) ana concepts sorgusu YEBS_CONCEPT_COLUMNS + count:exact seçiyor",
);
assert(!/\.select\(\s*["'`]\*["'`]/.test(svc), "(a) hiçbir yerde select(\"*\") yok");

// Etiket ön-sorgusu YALNIZ concept_id seçmeli (fazla kolon / DTO sızıntısı yok)
assert(
  /from\("yebs_concept_labels"\)\s*\.select\("concept_id"\)/.test(listBody.replace(/\s+/g, (m) => m.includes("\n") ? "\n" : " ")) ||
    /\.from\("yebs_concept_labels"\)[\s\S]{0,60}\.select\("concept_id"\)/.test(listBody),
  "(a) etiket ön-sorgusu yalnız concept_id seçer (ekstra kolon yok)",
);

// --- (b) q dalı hem slug hem label-arama referansı içerir ---
assert(listBody.includes("filters.q"), "(b) q dalı filters.q kullanır");
assert(
  listBody.includes('yebs_concept_labels') && /\.ilike\("label"/.test(listBody),
  "(b) label-aware: yebs_concept_labels.label ilike ön-sorgusu var",
);
assert(
  /slug\.ilike\.\*\$\{filters\.q\}\*/.test(listBody) || /slug\.ilike\.\*/.test(listBody),
  "(b) .or() içinde slug.ilike (slug hâlâ aranıyor)",
);
assert(
  /id\.in\.\(/.test(listBody),
  "(b) .or() içinde id.in.(<concept_ids>) (etiket eşleşmeleri)",
);
assert(
  /\.or\(`slug\.ilike[\s\S]*id\.in\.\(/.test(listBody),
  "(b) tek .or() çağrısı slug.ilike + id.in birleşimi",
);
// Boş id listesinde slug-only ilike fallback
assert(
  /conceptIds\.length\s*>\s*0/.test(listBody) && /\.ilike\("slug"/.test(listBody),
  "(b) eşleşen etiket yoksa slug-only ilike fallback korunur",
);

// --- (c) satır çoğaltacak JOIN / nested-select yok ---
// Not: JS Array.join (ör. conceptIds.join(",")) meşrudur; yalnız string-argümanlı
// dizi-join'leri hariç tutup gerçek (foreign-table) join arıyoruz — supabase-js
// zaten .join() query-builder metodu sunmaz; embed'ler select string'indedir.
const listNoArrayJoin = listBody.replace(/\.join\(\s*["'`][^"'`]*["'`]\s*\)/g, ".__arrjoin__()");
assert(!/\.join\(/.test(listNoArrayJoin), "(c) listConcepts içinde (dizi-dışı) .join( yok");
// nested embed pattern: select("...yebs_concept_labels(...)") gibi
assert(
  !/select\([^)]*\([^)]*\)[^)]*\)/.test(listBody.replace(/count:\s*"exact"/g, "")),
  "(c) select içinde nested embed (foreign-table paranteziyle) yok",
);
assert(
  !/yebs_concept_labels\([^)]*\)/.test(svc),
  "(c) 'yebs_concept_labels(...)' nested-select embed yok",
);

// --- (d) yeni write fiili yok ---
for (const verb of ["insert", "update", "delete", "upsert"]) {
  assert(
    !new RegExp(`\\.${verb}\\(`).test(svc),
    `(d) service içinde .${verb}( yok (READ-ONLY korunur)`,
  );
}
assert(!/\.rpc\(/.test(svc), "(d) service içinde .rpc( yok");

// --- (e) tüm mevcut filtreler duruyor ---
const filterChecks = [
  ['.eq("tradition_id"', "tradition_id"],
  ['.is("school_id", null)', "scope=tradition (school_id IS NULL)"],
  ['.eq("school_id"', "school_id"],
  ['.eq("status"', "status"],
  ['.eq("concept_type"', "concept_type"],
  ['.eq("slug"', "slug (tam eşleşme)"],
];
for (const [needle, name] of filterChecks) {
  assert(listBody.includes(needle), `(e) filtre korunmuş: ${name}`);
}
assert(/filters\.scope === "tradition"/.test(listBody), "(e) scope='tradition' dalı korunmuş");

// --- (f) route q-param kontratı değişmemiş (trim + cap + strip + forward) ---
assert(/const MAX_Q_LEN = 100/.test(route), "(f) route MAX_Q_LEN=100 korunur");
assert(
  /rawQ\.trim\(\)\.replace\(\/\[,\(\)\*%\]\/g, ""\)\.slice\(0, MAX_Q_LEN\)/.test(route),
  "(f) route q: trim + `,()*%` strip + slice(MAX_Q_LEN)",
);
assert(/listConcepts\(db, \{[\s\S]*\bq,[\s\S]*\}\)/.test(route), "(f) route q'yu listConcepts'e forward eder");
assert(
  /ok: true,\s*rows: result\.rows,\s*count: result\.count,\s*limit,\s*offset,/.test(route),
  "(f) route response DTO {ok,rows,count,limit,offset} değişmemiş",
);

console.log(`\n== A8 CONCEPT-SEARCH SONUC: ${pass} PASS / ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
