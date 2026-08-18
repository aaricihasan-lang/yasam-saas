// ============================================================
// Aromaterapi FAZ 3 — Hardening + Lifecycle + UX Polish statik harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz. identity_norm additive migration,
// buildIdentityNormIlike, qmode=name identity_norm, Blends soft-delete, dirty
// guard'lar, dialog erişilebilirliği ve "İçerikte geçiyor" rozeti sözleşmelerini
// doğrular. FAIL → process.exit(1).  node scripts/aromaterapi-phase3-harness.mjs
// ============================================================

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
let pass = 0, fail = 0;
const failures = [];
function ok(n) { pass++; console.log(`  PASS  ${n}`); }
function bad(n, d) { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); }
function check(n, c, d) { if (c) ok(n); else bad(n, d); }
function read(rel) { const p = resolve(ROOT, rel); return existsSync(p) ? readFileSync(p, "utf8") : ""; }
function has(rel) { return existsSync(resolve(ROOT, rel)); }

console.log("Aromaterapi FAZ 3 — Hardening + Lifecycle + UX Polish\n");

// --- MUST FIX 1: identity_norm additive migration -----------------------------
const MIG = read("supabase/migrations/20261005000000_aromatherapy_oils_identity_norm.sql");
check("MIG mevcut", MIG.length > 0);
check("MIG identity_norm generated STORED",
  /ADD COLUMN IF NOT EXISTS identity_norm text[\s\S]*?GENERATED ALWAYS AS[\s\S]*?STORED/.test(MIG));
check("MIG FAZ 1 normalizer REUSE (yeni normalizer YOK)",
  /aromatherapy_search_normalize\(/.test(MIG) && !/CREATE OR REPLACE FUNCTION public\.aromatherapy_search_normalize\b/.test(MIG));
const MIG_EXPR = (MIG.match(/GENERATED ALWAYS AS \(([\s\S]*?)\) STORED/) || ["", ""])[1];
check("MIG NULL-safe coalesce||' '|| (name/latin/english); concat_ws KULLANILMADI (immutability)",
  /coalesce\(name, ''\)[\s\S]*?coalesce\(latin_name, ''\)[\s\S]*?coalesce\(english_name, ''\)/.test(MIG_EXPR) && !/concat_ws/i.test(MIG_EXPR));
check("MIG identity_norm SADECE 3 kimlik alanı (içerik alanı YOK)",
  !/benefits|usage|aroma_profile|safety_notes|main_components|therapeutic_properties|target_systems|chakra/.test(
    (MIG.match(/GENERATED ALWAYS AS \(([\s\S]*?)\) STORED/) || ["", ""])[1]));
const MIG_CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
check("MIG ADDITIVE — RLS/policy/grant/drop YOK; tek ALTER = ADD COLUMN identity_norm",
  !/ENABLE ROW LEVEL SECURITY/i.test(MIG_CODE) && !/CREATE POLICY/i.test(MIG_CODE) &&
  !/\bREVOKE\b/i.test(MIG_CODE) && !/\bGRANT\b/i.test(MIG_CODE) &&
  !/DROP (TABLE|COLUMN|POLICY|FUNCTION)/i.test(MIG_CODE) &&
  !/ALTER COLUMN|DROP COLUMN/i.test(MIG_CODE) &&
  (MIG_CODE.match(/ALTER TABLE/gi) || []).length === 1 &&
  /ALTER TABLE public\.aromatherapy_oils\s+ADD COLUMN IF NOT EXISTS identity_norm/.test(MIG_CODE));
check("MIG index EKLENMEDİ (ihtiyaç kanıtına kadar)", !/CREATE INDEX/i.test(MIG_CODE));
check("VERIFY sql mevcut", has("scripts/verify-aromatherapy-oils-identity-norm.sql"));

// --- MUST FIX 1: server wiring ------------------------------------------------
const VALID = read("lib/aromaterapi/service/readValidation.ts");
check("readValidation buildIdentityNormIlike (identity_norm + normalizeForSearch)",
  /export function buildIdentityNormIlike/.test(VALID) &&
  /buildOrIlike\(\["identity_norm"\], normalizeForSearch\(q\)\)/.test(VALID));
const API = read("app/api/aromaterapi/oils/route.ts");
check("oils route qmode=name → buildIdentityNormIlike (ham ILIKE kaldırıldı)",
  /qmode"\)\s*===\s*"name"/.test(API) && /buildIdentityNormIlike\(p\.q\)/.test(API) &&
  !/buildOrIlike\(\["name",\s*"latin_name",\s*"english_name"\]/.test(API));
check("oils route default arama search_norm (Kütüphane DEĞİŞMEDİ)", /buildSearchNormIlike\(p\.q\)/.test(API));

// --- MUST FIX 3: Blends soft-delete -------------------------------------------
const BLENDID = read("app/api/aromaterapi/blends/[id]/route.ts");
const delFn = (BLENDID.match(/export async function DELETE[\s\S]*$/) || ["", ""])[0];
// `//` yorumlarını çıkar (yorumda geçen ".delete()" açıklamasını yanlış eşleştirmesin).
const delCode = delFn.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
check("Blends DELETE soft (.update is_active=false), fiziksel .delete() YOK",
  /\.update\(\{ is_active: false \}\)/.test(delCode) && !/\.delete\(\)/.test(delCode));
check("Blends DELETE tenant scope + IDOR korundu", /\.eq\("id", id\)/.test(delFn) && /\.eq\("tenant_id", tenantId\)/.test(delFn));
check("Blends DELETE demo 403/short-circuit korundu", /is_demo_account/.test(delFn));

// --- MUST FIX 5: dialog a11y hook + confirm reuse -----------------------------
check("useDialogA11y hook mevcut (ESC + focus-trap + focus-iade)", has("app/aromaterapi/_components/write/useDialogA11y.ts"));
const HOOK = read("app/aromaterapi/_components/write/useDialogA11y.ts");
check("useDialogA11y: Escape + Tab trap + odak iadesi (prevActive)",
  /Escape/.test(HOOK) && /e\.key !== "Tab"/.test(HOOK) && /prevActive\?\.focus/.test(HOOK));

// --- OilsPage: modal a11y + dirty guard + badge + aria ------------------------
const OILS = read("app/aromaterapi/_components/OilsPage.tsx");
check("OilsPage büyük-metin modal useDialogA11y + aria-labelledby + overlay dismiss",
  /useDialogA11y\(\{/.test(OILS) && /aria-labelledby=\{largeTitleId\}/.test(OILS) &&
  /onMouseDown=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) setLargeKey\(null\)/.test(OILS));
check("OilsPage NewOilForm gerçek dirty (pristine karşılaştırma) + guard + çıkış onayı",
  /const pristine = useMemo/.test(OILS) && /JSON\.stringify\(form\) !== JSON\.stringify\(pristine\)/.test(OILS) &&
  /useAromaterapiDirtyGuard\(isDirty\)/.test(OILS) && /function requestBack/.test(OILS));
check("OilsPage back düğmeleri requestBack (onBack körlemesine değil)",
  /onClick=\{requestBack\}/.test(OILS) && !/onClick=\{onBack\}/.test(OILS));
check("OilsPage 'İçerikte geçiyor' rozeti matchedOnlyInContent(appliedQuery=s.q)",
  /const appliedQuery = s\.q/.test(OILS) && /matchedOnlyInContent\(row, appliedQuery\)/.test(OILS) && /İçerikte geçiyor/.test(OILS));
check("OilsPage search + refresh aria-label", /aria-label="Yağ ara/.test(OILS) && /aria-label="Listeyi yenile"/.test(OILS));

// --- yaglar/[id]: confirm dialog + real dirty ---------------------------------
const DETAIL = read("app/aromaterapi/yaglar/[id]/page.tsx");
check("yaglar/[id] leave+delete → AromaterapiConfirmDialog (hand-rolled modal kaldırıldı)",
  (DETAIL.match(/<AromaterapiConfirmDialog/g) || []).length >= 2 &&
  !/role="dialog" aria-modal="true"/.test(DETAIL));
check("yaglar/[id] gerçek dirty (draft vs oilToFormData) + guard + nav gated on isDirty",
  /JSON\.stringify\(draft\) !== JSON\.stringify\(oilToFormData\(oil\)\)/.test(DETAIL) &&
  /useAromaterapiDirtyGuard\(isDirty\)/.test(DETAIL) && /if \(isDirty\) \{ setPendingNavHref/.test(DETAIL));

// --- Blend Builder: dirty guard + aria ----------------------------------------
const BLEND = read("app/aromaterapi/karisim-olusturucu/page.tsx");
check("Blend Builder dirty guard (pristine/boş → guard yok)",
  /useAromaterapiDirtyGuard\(isBlendDirty\)/.test(BLEND) &&
  /items\.length > 0/.test(BLEND) && /name\.trim\(\) !== ""/.test(BLEND));
check("Blend Builder drops input + remove ✕ aria-label",
  /aria-label=\{`\$\{it\.oil_name\} damla sayısı`\}/.test(BLEND) &&
  /aria-label=\{`\$\{it\.oil_name\} karışımdan çıkar`\}/.test(BLEND) &&
  /aria-label=\{`\$\{b\.name\} karışımını sil`\}/.test(BLEND));

// --- badge helper contract ----------------------------------------------------
const DATA = read("lib/aromaterapi/aromatherapyData.ts");
check("matchedOnlyInContent normalizeForSearch KULLANIR (foldForSearch DEĞİL) + boş→false",
  /export function matchedOnlyInContent/.test(DATA) &&
  /normalizeForSearch\(query\)/.test(DATA) && /if \(!qn\) return false/.test(DATA) &&
  /\[row\.name, row\.latin_name, row\.english_name\]\.join\(" "\)/.test(DATA));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
console.log("OVERALL = PASS");
