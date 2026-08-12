// ============================================================
// Aromaterapi FAZ 1 — Kritik Teknik Sertleştirme statik harness'i
//
// SALT-OKUNUR / STATİK. Canlı DB/Supabase'e bağlanmaz. Kaynak sözleşmelerini
// doğrular: Türkçe arama normalizasyonu (search_norm), raw error leak=0,
// error boundary, dirty-form guard, safety_topic ghost-filter temizliği,
// migration additive yapısı. FAIL → process.exit(1).
// node scripts/aromaterapi-phase1-hardening-harness.mjs
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0;
let fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}
function has(rel) { return existsSync(resolve(ROOT, rel)); }

console.log("Aromaterapi FAZ 1 — Kritik Teknik Sertleştirme\n");

// --- B. Türkçe arama normalizasyonu ----------------------------------------
const NORM = read("lib/aromaterapi/searchNormalize.ts");
check("B searchNormalize mevcut + export", /export\s+function\s+normalizeForSearch/.test(NORM));
check("B Türkçe I ailesi katlanır (İ I ı i)", /İ/.test(NORM) && /ı/.test(NORM));
check("B diakritik katlanır (ş ğ ç ö ü)", /ş/.test(NORM) && /ğ/.test(NORM) && /ç/.test(NORM));
check("B whitespace collapse", /replace\(\/\\s\+\/g/.test(NORM));
check("B null-safe", /if\s*\(!value\)\s*return\s*""/.test(NORM));

const VAL = read("lib/aromaterapi/service/readValidation.ts");
check("B buildSearchNormIlike export", /export\s+function\s+buildSearchNormIlike/.test(VAL));
check("B search normalize + sanitize zinciri", /normalizeForSearch/.test(VAL) && /safeIlikePattern/.test(VAL));

// Server reads search_norm kullanır (ham çok-kolon SEARCH_COLS .ilike DEĞİL).
for (const f of ["catalogReads", "claimReads", "glossaryReads", "sourceReads"]) {
  const src = read(`lib/aromaterapi/service/${f}.ts`);
  check(`B ${f} buildSearchNormIlike kullanır`, /buildSearchNormIlike\(/.test(src));
  check(`B ${f} eski buildOrIlike(SEARCH_COLS) kalmadı`, !/buildOrIlike\(/.test(src));
}
// Client arama aynı sözleşmeye delege.
const DATA = read("lib/aromaterapi/aromatherapyData.ts");
check("B client foldForSearch → normalizeForSearch delege", /return\s+normalizeForSearch\(value\)/.test(DATA));

// --- B/migration: additive search_norm --------------------------------------
const MIG = read("supabase/migrations/20261003000000_aromatherapy_search_normalization.sql");
check("MIG mevcut", MIG.length > 0);
check("MIG IMMUTABLE fonksiyon", /CREATE OR REPLACE FUNCTION public\.aromatherapy_search_normalize/.test(MIG) && /IMMUTABLE/.test(MIG));
for (const t of [
  "aromatherapy_plant_taxa",
  "aromatherapy_preparations",
  "aromatherapy_sources",
  "aromatherapy_source_passages",
  "aromatherapy_glossary_terms",
  "aromatherapy_claims",
]) {
  check(`MIG ${t}.search_norm generated stored`,
    new RegExp(`ALTER TABLE public\\.${t}[\\s\\S]*?search_norm text[\\s\\S]*?GENERATED ALWAYS AS[\\s\\S]*?STORED`).test(MIG));
}
// Yalnız gerçek DDL'i denetle: `--` yorum satırları (ne yapılmadığını AÇIKLAR) çıkarılır.
const MIG_CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
check("MIG ADDITIVE — RLS/policy/grant DDL YOK",
  !/ENABLE ROW LEVEL SECURITY/i.test(MIG_CODE) && !/CREATE POLICY/i.test(MIG_CODE) &&
  !/\bREVOKE\b/i.test(MIG_CODE) && !/\bGRANT\b/i.test(MIG_CODE));
check("VERIFY sql mevcut", has("scripts/verify-aromatherapy-search-normalization.sql"));

// --- C. Raw DB error leak = 0 ----------------------------------------------
const LEGACY = [
  "app/api/admin/aromaterapi/oils/route.ts",
  "app/api/aromaterapi/oils/route.ts",
  "app/api/aromaterapi/oils/[id]/route.ts",
  "app/api/aromaterapi/blends/route.ts",
  "app/api/aromaterapi/blends/[id]/route.ts",
];
check("C legacyErrors helper mevcut + console.error", /console\.error/.test(read("lib/aromaterapi/legacyErrors.ts")) && /legacyDbErrorResponse/.test(read("lib/aromaterapi/legacyErrors.ts")));
for (const r of LEGACY) {
  const src = read(r);
  check(`C ham error.message/err.message YOK: ${r}`, !/\b(error|err)\.message\b/.test(src));
  check(`C güvenli helper kullanır: ${r}`, /legacyDbErrorResponse\(/.test(src));
}

// --- D. Error boundary ------------------------------------------------------
const ERRB = read("app/aromaterapi/error.tsx");
check("D error.tsx mevcut", ERRB.length > 0);
check("D use client + reset + default export", /["']use client["']/.test(ERRB) && /reset/.test(ERRB) && /export default function/.test(ERRB));
check("D teknik detay gösterilmez (error.message JSX'te değil)", !/\{error\.message\}/.test(ERRB) && !/\{error\.stack\}/.test(ERRB));
check("D role=alert a11y", /role="alert"/.test(ERRB));
check("D güvenli dönüş /aromaterapi", /href="\/aromaterapi"/.test(ERRB));

// --- E. Dirty-form navigation guard ----------------------------------------
const GUARD = read("app/aromaterapi/_components/write/useUnsavedChangesGuard.tsx");
check("E useUnsavedChangesGuard mevcut", /export\s+function\s+useUnsavedChangesGuard/.test(GUARD));
check("E ConfirmDialog devrede", /AromaterapiConfirmDialog/.test(GUARD));
check("E çift-navigasyon koruması (önce kapat)", /setPending\(null\)/.test(GUARD));
const SHELL = read("app/aromaterapi/_components/write/AromaterapiFormShell.tsx");
check("E FormShell guard entegre", /useUnsavedChangesGuard/.test(SHELL) && /guardDialog/.test(SHELL));
check("E FormShell Cancel guard'lı", /guard\(onCancel\)/.test(SHELL));
check("E FormShell çift beforeUnload önlenir", /beforeUnload:\s*false/.test(SHELL));

// --- F. safety_topic ghost filter ------------------------------------------
const LQ = read("app/aromaterapi/_components/read/useAromaterapiListQuery.ts");
check("F setFilter clearKeys destekler", /clearKeys\?:\s*readonly string\[\]/.test(LQ) && /for\s*\(const k of clearKeys\)/.test(LQ));
const BKV = read("app/aromaterapi/bilgi-kayitlari/_components/BilgiKayitlariView.tsx");
check("F claim_type→safety dışına çıkınca safety_topic temizlenir",
  /setFilter\("claim_type",\s*v,\s*v === "safety"\s*\?\s*undefined\s*:\s*\["safety_topic"\]\)/.test(BKV));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("FAILURES:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("OVERALL = PASS");
