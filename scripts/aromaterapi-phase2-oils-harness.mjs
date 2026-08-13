// ============================================================
// Aromaterapi FAZ 2 — Oils ölçekleme + legacy modernizasyon statik harness'i
//
// SALT-OKUNUR / STATİK. DB'ye bağlanmaz. Server pagination, no-fetch-all,
// server search_norm, slim projection, blend typeahead, OilsPage modern pipeline,
// migration additive yapısı sözleşmelerini doğrular. FAIL → process.exit(1).
// node scripts/aromaterapi-phase2-oils-harness.mjs
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

console.log("Aromaterapi FAZ 2 — Oils ölçekleme + legacy modernizasyon\n");

// --- API: server pagination + no fetch-all ---------------------------------
const API = read("app/api/aromaterapi/oils/route.ts");
check("API parseListParams kullanır", /parseListParams\(/.test(API));
check("API modern paginated envelope (readListOk)", /readListOk\(/.test(API));
check("API stabil hata (readFail/readServerError, ham error.message YOK)",
  /readFail\(/.test(API) && /readServerError\(/.test(API));
check("API search_norm arama (buildSearchNormIlike)", /buildSearchNormIlike\(/.test(API));
check("API tenant scope (guard.tenantId .eq)", /\.eq\("tenant_id", tenantId\)/.test(API));
check("API deterministik sort name+id", /order\("name"[\s\S]*?order\("id"/.test(API));
check("API range pagination (offset+limit)", /\.range\(p\.offset, p\.offset \+ p\.limit - 1\)/.test(API));
check("API NO fetch-all loop (for(let from…range 1000) kaldırıldı)",
  !/for \(let from = 0/.test(API) && !/PAGE = 1000/.test(API));
check("API legacy count/names modları korundu", /count.*===.*"1"/.test(API) && /names.*===.*"1"/.test(API));
check("API oil_type allowlist filtre", /oil_type[\s\S]*?allow[\s\S]*?essential[\s\S]*?carrier[\s\S]*?maceration/.test(API));

// --- Slim list projection ---------------------------------------------------
const FIELDS = read("lib/aromaterapi/oilFields.ts");
const sel = (FIELDS.match(/OIL_LIST_SELECT =([\s\S]*?);/) || ["", ""])[1];
check("Projection preview alanları var (kart için)",
  /physical_benefits/.test(sel) && /emotional_benefits/.test(sel) && /aroma_profile/.test(sel) && /\bbenefits\b/.test(sel));
check("Projection SLIM: ağır arama-only alanlar liste'de YOK",
  !/main_components/.test(sel) && !/usage_methods/.test(sel) && !/safety_notes/.test(sel) &&
  !/therapeutic_properties/.test(sel) && !/target_systems/.test(sel));
check("Projection kart alanları (name/latin/oil_type/is_photosensitive) var",
  /name/.test(sel) && /latin_name/.test(sel) && /oil_type/.test(sel) && /is_photosensitive/.test(sel));

// --- Data layer -------------------------------------------------------------
const DATA = read("lib/aromaterapi/aromatherapyData.ts");
check("fetchOilListPage (paginated ListResult)", /export async function fetchOilListPage/.test(DATA) && /getList<OilListRow>/.test(DATA));
check("fetchOilSearch (blend typeahead, limit)", /export async function fetchOilSearch/.test(DATA) && /limit = 40/.test(DATA));
check("eski fetch-all fetchOilList kaldırıldı", !/export async function fetchOilList\b/.test(DATA));

// --- Blend typeahead --------------------------------------------------------
const BLEND = read("app/aromaterapi/karisim-olusturucu/page.tsx");
check("Blend fetchOilSearch kullanır (fetch-all YOK)", /fetchOilSearch\(/.test(BLEND) && !/fetchOilList\(/.test(BLEND));
check("Blend typeahead debounce + abort", /setTimeout/.test(BLEND) && /AbortController/.test(BLEND) && /controller\.abort\(\)/.test(BLEND));
check("Blend saved snapshot/hydration korunur (fetchOilDetail)", /fetchOilDetail\(/.test(BLEND));

// --- Blend limit contract (FAZ 2 Gate #2: hiçbir istemci isteği API max'i aşmaz) ---
const RTYPES = read("lib/aromaterapi/readTypes.ts");
const maxLimitMatch = RTYPES.match(/READ_MAX_LIMIT\s*=\s*(\d+)/);
const API_MAX_LIMIT = maxLimitMatch ? Number(maxLimitMatch[1]) : NaN;
check("readTypes READ_MAX_LIMIT tanımlı", Number.isInteger(API_MAX_LIMIT), `bulunan: ${API_MAX_LIMIT}`);
const VALID = read("lib/aromaterapi/service/readValidation.ts");
check("readValidation limit>MAX → 400 (AROMA_INVALID_LIMIT)",
  /l > READ_MAX_LIMIT/.test(VALID) && /AROMA_INVALID_LIMIT/.test(VALID));
// Blend'deki her fetchOilSearch çağrısının sayısal limit argümanı ≤ API_MAX_LIMIT olmalı
// (tip string'inden hemen sonra gelen tamsayı: carrier=100, essential=40).
const blendLimits = [...BLEND.matchAll(/"(?:carrier|essential)"\s*,\s*(\d+)/g)].map((m) => Number(m[1]));
check("Blend fetchOilSearch limit argümanları bulundu (≥2)", blendLimits.length >= 2, `bulunan: ${blendLimits.length}`);
check("Blend HİÇBİR çağrı API max limitini aşmaz (no request > API max)",
  blendLimits.length > 0 && blendLimits.every((l) => l <= API_MAX_LIMIT), `limits=[${blendLimits}] max=${API_MAX_LIMIT}`);
check("Blend carrier lookup: boş q + carrier tipi (datalist tek çağrı)",
  /fetchOilSearch\(\s*""\s*,\s*"carrier"/.test(BLEND));
check("Blend essential server typeahead: q(search) + abort signal",
  /fetchOilSearch\(\s*search\.trim\(\)\s*,\s*"essential"\s*,\s*\d+\s*,\s*controller\.signal\)/.test(BLEND));
check("Blend carrier serbest-metin fallback (pickCarrier opsiyonel id-linkage; erişilemez değil)",
  /function pickCarrier/.test(BLEND) && /setCarrierId\(match \? match\.id : null\)/.test(BLEND));

// --- OilsPage modern pipeline ----------------------------------------------
const OILS = read("app/aromaterapi/_components/OilsPage.tsx");
check("OilsPage useAromaterapiListQuery reuse", /useAromaterapiListQuery<OilListRow>/.test(OILS));
check("OilsPage fetch-all/windowing kaldırıldı (IntersectionObserver/visibleCount/RENDER_PAGE yok)",
  !/IntersectionObserver/.test(OILS) && !/visibleCount/.test(OILS) && !/RENDER_PAGE/.test(OILS));
check("OilsPage client sort/searchIndex kaldırıldı", !/sortedRows/.test(OILS) && !/searchIndex/.test(OILS));
check("OilsPage ReadPagination (server pagination UI)", /<ReadPagination/.test(OILS));
check("OilsPage bulk = current-page (seçim page/q/type değişince temizlenir)",
  /prevSelectionKey/.test(OILS) && /setSelectedIds\(new Set\(\)\)/.test(OILS));
check("OilsPage demo client-paginate (demoListResult)", /function demoListResult/.test(OILS));
check("OilsPage tip sayaçları server head-count (fetchOilCounts)", /fetchOilCounts\(\)/.test(OILS));

// --- Filter contract hotfix (oil_type allowlist/counts + stale-row-on-error) ---
const EXPECTED_TYPES = ["essential", "carrier", "maceration", "hydrosol", "resin", "absolute"];
const oilTypesSrc = (DATA.match(/OIL_TYPES\b[\s\S]*?=\s*\[([\s\S]*?)\];/) || ["", ""])[1];
const uiTypes = [...oilTypesSrc.matchAll(/value:\s*"([a-z]+)"/g)].map((m) => m[1]);
check("UI OIL_TYPES = 6 beklenen tip",
  EXPECTED_TYPES.every((t) => uiTypes.includes(t)) && uiTypes.length === EXPECTED_TYPES.length, `bulunan: [${uiTypes}]`);
const allowSrc = (API.match(/allow:\s*\[([\s\S]*?)\]/) || ["", ""])[1];
const allowVals = [...allowSrc.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
check("Server oil_type allowlist = UI OIL_TYPES ile BİREBİR (6 tip)",
  EXPECTED_TYPES.every((t) => allowVals.includes(t)) && allowVals.length === EXPECTED_TYPES.length, `allow=[${allowVals}]`);
check("Server allowlist arbitrary tip kabul etmez (!allow.includes → AROMA_INVALID_FILTER)",
  /!def\.allow\.includes\(val\)/.test(VALID) && /AROMA_INVALID_FILTER/.test(VALID));
check("hydrosol/resin/absolute allowlist'te → 0 kayıt = normal boş sonuç (400 DEĞİL, readListOk)",
  ["hydrosol", "resin", "absolute"].every((t) => allowVals.includes(t)) && /readListOk\(/.test(API));
check("count=1 endpoint 6 oil_type head-count (hydrosol/resin/absolute regresyon fix)",
  /"oil_type",\s*"hydrosol"/.test(API) && /"oil_type",\s*"resin"/.test(API) && /"oil_type",\s*"absolute"/.test(API) &&
  /hydrosol:\s*h\.count/.test(API) && /resin:\s*r\.count/.test(API) && /absolute:\s*a\.count/.test(API));
check("fetchOilCounts tipi 6 oil_type sayaç içerir",
  /hydrosol:\s*number/.test(DATA) && /resin:\s*number/.test(DATA) && /absolute:\s*number/.test(DATA));
check("OilsPage serverTypeCounts 6 tip map eder",
  /hydrosol:\s*counts\.hydrosol/.test(OILS) && /resin:\s*counts\.resin/.test(OILS) && /absolute:\s*counts\.absolute/.test(OILS));
const HOOK = read("app/aromaterapi/_components/read/useAromaterapiListQuery.ts");
check("Hook fetch-fail'de stale rows temizlenir (rows:[]+total:0, errorCode ile)",
  /rows:\s*\[\],[\s\S]*?total:\s*0,[\s\S]*?errorCode:\s*res\.errorCode/.test(HOOK));

// --- Migration additive -----------------------------------------------------
const MIG = read("supabase/migrations/20261004000000_aromatherapy_oils_search_scale.sql");
check("MIG mevcut", MIG.length > 0);
check("MIG FAZ 1 normalizer REUSE (yeni normalizer yok)", /aromatherapy_search_normalize\(/.test(MIG) && !/CREATE OR REPLACE FUNCTION public\.aromatherapy_search_normalize\b/.test(MIG));
check("MIG array immutable helper (IMMUTABLE)", /CREATE OR REPLACE FUNCTION public\.aromatherapy_search_array_text/.test(MIG) && /IMMUTABLE/.test(MIG));
check("MIG oils.search_norm generated STORED", /ALTER TABLE public\.aromatherapy_oils[\s\S]*?search_norm text[\s\S]*?GENERATED ALWAYS AS[\s\S]*?STORED/.test(MIG));
check("MIG search parity 21 kaynak (name…target_systems)",
  /coalesce\(name/.test(MIG) && /coalesce\(latin_name/.test(MIG) && /aromatherapy_search_array_text\(therapeutic_properties\)/.test(MIG) && /aromatherapy_search_array_text\(target_systems\)/.test(MIG));
check("MIG tek index (aro_oils_list_idx)", /CREATE INDEX IF NOT EXISTS aro_oils_list_idx/.test(MIG));
const MIG_CODE = MIG.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
check("MIG ADDITIVE — RLS/policy/grant/drop DDL YOK",
  !/ENABLE ROW LEVEL SECURITY/i.test(MIG_CODE) && !/CREATE POLICY/i.test(MIG_CODE) &&
  !/\bREVOKE\b/i.test(MIG_CODE) && !/\bGRANT\b/i.test(MIG_CODE) && !/DROP (TABLE|COLUMN|POLICY)/i.test(MIG_CODE));
check("MIG pg_trgm EKLENMEDİ (TRGM_DEFERRED)", !/CREATE EXTENSION[\s\S]*?pg_trgm/i.test(MIG_CODE) && !/USING gin/i.test(MIG_CODE));
check("VERIFY sql mevcut", has("scripts/verify-aromatherapy-oils-search-scale.sql"));

console.log(`\n${pass} PASS, ${fail} FAIL`);
if (fail > 0) { console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
console.log("OVERALL = PASS");
