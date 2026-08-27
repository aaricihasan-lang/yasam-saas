// ============================================================
// Beslenme Knowledge Core (Class B) — STATİK SÖZLEŞME HARNESS'İ
// Deterministik, env-siz. FAIL → exit 1. node scripts/beslenme-knowledge/ddlHarness.mjs
// ============================================================
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const MIG = resolve(ROOT, "supabase", "migrations");
const API = resolve(ROOT, "app", "api", "beslenme");

let pass = 0, fail = 0;
const failures = [];
const ok = (n) => { pass++; console.log(`  PASS  ${n}`); };
const bad = (n, d) => { fail++; failures.push(n); console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`); };
const check = (n, c, d) => (c ? ok(n) : bad(n, d));
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s) => s.replace(/--[^\n]*/g, "");

const CLASS_B = [
  ["nutrition_foods", "20261229000000_nutrition_foods.sql"],
  ["nutrition_topics", "20261229000100_nutrition_topics.sql"],
  ["nutrition_topic_sections", "20261229000200_nutrition_topic_sections.sql"],
  ["nutrition_topic_foods", "20261229000300_nutrition_topic_foods.sql"],
  ["nutrition_sources", "20261229000400_nutrition_sources.sql"],
  ["nutrition_topic_sources", "20261229000500_nutrition_topic_sources.sql"],
  ["nutrition_food_sources", "20261229000600_nutrition_food_sources.sql"],
];
const SRC = {};
for (const [t, f] of CLASS_B) SRC[t] = read(resolve(MIG, f));
const ALL_MIG = Object.values(SRC).join("\n");
const ALL_MIG_S = strip(ALL_MIG);

// recursively collect route.ts files under app/api/beslenme
function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}
const routeFiles = walk(API);
const routeSrc = Object.fromEntries(routeFiles.map((p) => [p.replace(ROOT, "").replace(/\\/g, "/"), read(p)]));

console.log("\n[A/B/D] 7 Class B tablo + tenant_id + RLS");
for (const [t] of CLASS_B) {
  check(`CREATE ${t}`, new RegExp(`CREATE TABLE public\\.${t}\\b`).test(SRC[t]));
  check(`${t} tenant_id NOT NULL`, /tenant_id\s+uuid\s+NOT NULL/.test(SRC[t]));
  check(`${t} RLS enabled`, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(SRC[t]));
  check(`${t} REVOKE anon/authenticated/PUBLIC`, new RegExp(`REVOKE ALL PRIVILEGES ON TABLE public\\.${t} FROM anon, authenticated, PUBLIC`).test(SRC[t]));
  check(`${t} GRANT service_role`, new RegExp(`GRANT ALL PRIVILEGES ON TABLE public\\.${t} TO service_role`).test(SRC[t]));
  check(`${t} anon/authenticated'a GRANT YOK`, !new RegExp(`GRANT[^;]*TO[^;]*(anon|authenticated)\\b`).test(strip(SRC[t])));
}

console.log("\n[C] Class A tablolar tenant-siz (referans bütünlüğü)");
const classAFoodGroups = read(resolve(MIG, "20261228000300_nutrition_food_groups.sql"));
const classAFrameworks = read(resolve(MIG, "20261228000400_nutrition_traditional_frameworks.sql"));
check("nutrition_food_groups tenant_id YOK", classAFoodGroups && !/\btenant_id\b/.test(strip(classAFoodGroups)));
check("nutrition_traditional_frameworks tenant_id YOK", classAFrameworks && !/\btenant_id\b/.test(strip(classAFrameworks)));

console.log("\n[E] tenant-safe composite FK + Class A gerçek FK");
check("foods → food_groups(id) RESTRICT", /FOREIGN KEY \(food_group_id\)\s*\n?\s*REFERENCES public\.nutrition_food_groups \(id\)\s*\n?\s*ON DELETE RESTRICT/.test(SRC.nutrition_foods));
check("topics → traditional_frameworks(id) RESTRICT", /FOREIGN KEY \(framework_id\)\s*\n?\s*REFERENCES public\.nutrition_traditional_frameworks \(id\)/.test(SRC.nutrition_topics));
check("topic_sections composite FK (tenant_id, topic_id)", /FOREIGN KEY \(tenant_id, topic_id\)\s*\n?\s*REFERENCES public\.nutrition_topics \(tenant_id, id\)\s*\n?\s*ON DELETE CASCADE/.test(SRC.nutrition_topic_sections));
check("topic_foods composite FK topic CASCADE + food RESTRICT",
  /FOREIGN KEY \(tenant_id, topic_id\)[\s\S]*?ON DELETE CASCADE/.test(SRC.nutrition_topic_foods)
  && /FOREIGN KEY \(tenant_id, food_id\)[\s\S]*?ON DELETE RESTRICT/.test(SRC.nutrition_topic_foods));
check("foods additive UNIQUE(tenant_id, id)", /UNIQUE \(tenant_id, id\)/.test(SRC.nutrition_foods));
check("topics additive UNIQUE(tenant_id, id)", /UNIQUE \(tenant_id, id\)/.test(SRC.nutrition_topics));
check("sources additive UNIQUE(tenant_id, id)", /UNIQUE \(tenant_id, id\)/.test(SRC.nutrition_sources));

console.log("\n[F/G] topic_type CHECK + framework invariant");
check("topic_type CHECK (6 değer)", /topic_type IN \('dietary_pattern', 'goal', 'condition', 'sport', 'life_stage', 'traditional_profile'\)/.test(SRC.nutrition_topics));
check("framework invariant CHECK", /topic_type = 'traditional_profile' AND framework_id IS NOT NULL[\s\S]*?topic_type <> 'traditional_profile' AND framework_id IS NULL/.test(SRC.nutrition_topics));
check("relation_type CHECK (6 değer)", /relation_type IN \('recommended', 'suitable', 'neutral', 'limit', 'avoid', 'caution'\)/.test(SRC.nutrition_topic_foods));

console.log("\n[H/S/T] Sources opsiyonel + gerçek FK + polimorfik YOK");
check("sources title dışında zorunlu (NOT NULL) alan yok", !/\b(authors|organization|url|note)\s+text\s+NOT NULL/.test(SRC.nutrition_sources));
check("topic_sources gerçek FK (topic+source)", /REFERENCES public\.nutrition_topics \(tenant_id, id\)/.test(SRC.nutrition_topic_sources) && /REFERENCES public\.nutrition_sources \(tenant_id, id\)/.test(SRC.nutrition_topic_sources));
check("food_sources gerçek FK (food+source)", /REFERENCES public\.nutrition_foods \(tenant_id, id\)/.test(SRC.nutrition_food_sources) && /REFERENCES public\.nutrition_sources \(tenant_id, id\)/.test(SRC.nutrition_food_sources));
check("polimorfik entity_type/entity_id YOK", !/entity_type|entity_id|target_type|target_id/.test(ALL_MIG_S));
check("nutrition_source_links (polimorfik) tablosu YOK", !/CREATE TABLE public\.nutrition_source_links/.test(ALL_MIG));

console.log("\n[I/J/Y] evidence-core / YH / client-private YOK");
for (const w of ["nutrition_claim", "nutrition_passage", "nutrition_verification", "claim_sources", "faithful_translation"]) {
  check(`evidence '${w}' YOK`, !new RegExp(`\\b${w}\\b`).test(ALL_MIG_S));
}
check("YH entegrasyonu YOK (cdc/outbox/activation)", !/yh_cdc_enqueue|yasam_hafizasi_outbox|yh_source_activation|yh_outbox/.test(ALL_MIG_S));
check("client-private kolon YOK (client_id/danisan/weight/diagnosis)", !/\bclient_id\b|\bdanisan|\bpatient_id\b|\bdiagnosis\b|\bweight_kg\b/.test(ALL_MIG_S));

console.log("\n[module] owner-only module wiring");
const moduleAccess = read(resolve(ROOT, "lib/auth/moduleAccess.ts"));
const routeRegistry = read(resolve(ROOT, "lib/auth/moduleRouteRegistry.ts"));
check("ModuleGateKey içerir 'beslenme'", /\|\s*"beslenme"/.test(moduleAccess));
check("resolveModuleAccess beslenme non-admin → false (expert negative)", /moduleKey === "beslenme"\)\s*return false/.test(moduleAccess));
check("MODULE_ROUTE_PREFIXES app/api/beslenme → beslenme", /prefix:\s*"app\/api\/beslenme",\s*key:\s*"beslenme"/.test(routeRegistry));

console.log("\n[owner guard] super-admin gate");
const ownerGuard = read(resolve(ROOT, "lib/beslenme/ownerGuard.ts"));
check("ownerGuard requireMainAdmin import (super-admin)", /requireMainAdmin/.test(ownerGuard) && /from "@\/lib\/admin\/adminGuards"/.test(ownerGuard));
check("ownerGuard requireModuleAccess(beslenme)", /requireModuleAccess\(req,\s*"beslenme"\)/.test(ownerGuard));
check("ownerGuard OWNER_ONLY 403 kodu", /OWNER_ONLY/.test(ownerGuard));
check("denyDemoMutation mevcut (demo guard)", /export function denyDemoMutation/.test(ownerGuard));

console.log("\n[K/L/O/P/Q/R] route güvenlik sözleşmesi (her route)");
check("access route mevcut", !!routeSrc["/app/api/beslenme/access/route.ts"]);
const mutationRe = /export async function (POST|PATCH|DELETE)/;
let routeGateOk = true, demoOk = true, uuidOk = true, tenantTrustOk = true, massOk = true;
for (const [path, s] of Object.entries(routeSrc)) {
  if (!/requireBeslenmeOwner/.test(s)) { routeGateOk = false; bad(`owner gate eksik: ${path}`); }
  if (mutationRe.test(s) && !/denyDemoMutation/.test(s)) { demoOk = false; bad(`demo guard eksik (mutation): ${path}`); }
  // mass-assignment guard yalnız GÖVDE OKUYAN (req.json()) route'lar için gereklidir.
  if (/req\.json\(\)/.test(s) && !/hasOnlyKeys/.test(s)) { massOk = false; bad(`mass-assignment guard (hasOnlyKeys) eksik: ${path}`); }
  if (/\[/.test(path) && !/isUuid/.test(s)) { uuidOk = false; bad(`UUID validation eksik: ${path}`); }
  // tenant client body'den alınmamalı: insert tenant_id: tenantId (guard) olmalı, body.tenant_id OLMAMALI
  if (/body\.tenant_id|tenant_id:\s*body/.test(s)) { tenantTrustOk = false; bad(`body tenant trust: ${path}`); }
}
check("her route requireBeslenmeOwner (owner gate)", routeGateOk);
check("her mutation denyDemoMutation", demoOk);
check("[id] route'larında isUuid", uuidOk);
check("body tenant_id trust YOK", tenantTrustOk);
check("her mutation hasOnlyKeys (mass-assignment)", massOk);

console.log("\n[count] Genel Bakış sayaçları active-only (arşivli sayılmaz)");
// Arşiv canonical = is_active=false; sayaçlar liste route'larıyla aynı contract'ı
// paylaşmalı: yalnız aktif kayıt sayılır (arşivlenince kart 0 gösterir).
const countsSrc = routeSrc["/app/api/beslenme/counts/route.ts"] ?? "";
check("counts route mevcut", !!countsSrc);
// 4 head-count sorgusunun (foods, guides, sources, profileCount) hepsi is_active=true filtreler.
const activeFilterCount = (countsSrc.match(/\.eq\("is_active",\s*true\)/g) ?? []).length;
check("counts route 4 sorguda da is_active=true filtresi", activeFilterCount >= 4,
  `beklenen ≥4, bulunan ${activeFilterCount}`);
check("counts foods is_active filtreli",
  /nutrition_foods[\s\S]*?\.eq\("tenant_id", tenantId\)[\s\S]*?\.eq\("is_active",\s*true\)/.test(countsSrc));
check("counts topics/dietary_pattern is_active filtreli",
  /"dietary_pattern"\)[\s\S]*?\.eq\("is_active",\s*true\)/.test(countsSrc));
check("counts profile (mizac/blood) is_active filtreli",
  /"traditional_profile"\)[\s\S]*?\.eq\("framework_id", frameworkId\)[\s\S]*?\.eq\("is_active",\s*true\)/.test(countsSrc));

console.log("\n[archive] SourcesPanel kaynak arşivleme (is_active=false, hard-delete DEĞİL)");
const sourcesPanel = read(resolve(ROOT, "app/beslenme/_components/SourcesPanel.tsx"));
check("SourcesPanel updateSource ile is_active:false çağırır",
  /updateSource\([^)]*\{\s*is_active:\s*false\s*\}\)/.test(sourcesPanel));
check("SourcesPanel arşiv onayı (iki adımlı, confirmArchiveId)", /confirmArchiveId/.test(sourcesPanel));
check("SourcesPanel arşivde hard-delete (deleteSource) KULLANMAZ", !/deleteSource/.test(sourcesPanel));

console.log("\n[U/V] mizaç + kan grubu canonical");
const contracts = read(resolve(ROOT, "lib/beslenme/contracts.ts"));
for (const code of ["dem", "safra", "sovdavi", "balgam"]) check(`mizaç kodu '${code}'`, new RegExp(`code:\\s*"${code}"`).test(contracts));
check("blood type 4 profil (0/A/B/AB)", /BLOOD_TYPE_PROFILES = \["0", "A", "B", "AB"\]/.test(contracts));

console.log("\n[IMM] search_tsv immutability regression (GENERATED column YOK → trigger)");
// KÖK NEDEN (prod 42P17): GENERATED ALWAYS AS ifadesi IMMUTABLE olmak zorundadır;
// array_to_string(anyarray,text) STABLE'dır → generated column reddedilir. Fix: search_tsv
// plain kolon + BEFORE INSERT OR UPDATE trigger (repo canonical deseni; STABLE fn güvenli).
check("hiçbir migration'da tsvector GENERATED ALWAYS YOK",
  !/search_tsv\s+tsvector\s+GENERATED ALWAYS/i.test(ALL_MIG), "generated search_tsv bulundu (42P17 riski)");
check("GENERATED ALWAYS içinde array_to_string (STABLE) YOK",
  !/GENERATED ALWAYS AS \([\s\S]*?array_to_string[\s\S]*?\)\s*STORED/i.test(ALL_MIG), "generated column'da STABLE fn");
for (const t of ["nutrition_foods", "nutrition_topics", "nutrition_sources"]) {
  check(`${t} search_tsv plain tsvector kolon`, new RegExp(`search_tsv\\s+tsvector,`).test(SRC[t]));
  check(`${t} search_tsv trigger fonksiyonu`, new RegExp(`CREATE FUNCTION public\\.${t}_search_tsv\\(\\)`).test(SRC[t]));
  check(`${t} search_tsv BEFORE INSERT OR UPDATE trigger`,
    new RegExp(`CREATE TRIGGER trg_${t}_search_tsv\\s*\\n?\\s*BEFORE INSERT OR UPDATE ON public\\.${t}`).test(SRC[t]));
}
check("search trigger yalnız IMMUTABLE yh_immutable_unaccent kullanır (unaccent tek-arg YOK)",
  /yh_immutable_unaccent/.test(ALL_MIG) && !/[^_]unaccent\s*\(\s*NEW\./i.test(ALL_MIG));

console.log("\n[W/X] Word YOK + dış-DB import YOK (beslenme scope)");
const beslenmeAll = [ownerGuard, contracts, ...Object.values(routeSrc)].join("\n");
check("Word/docx import YOK", !/reportHelpers|from "docx"|Packer/.test(beslenmeAll));
check("USDA/TÜRKOMP import YOK", !/usda|turkomp/i.test(beslenmeAll));

console.log("\n[Z] dashboard owner-only hidden-by-default");
const page = read(resolve(ROOT, "app/page.tsx"));
check("beslenmeOwner default false", /useState\(false\)/.test(page) && /const \[beslenmeOwner, setBeslenmeOwner\]/.test(page));
check("owner probe checkBeslenmeAccess", /checkBeslenmeAccess\(\)/.test(page));
check("kart yalnız beslenmeOwner ise render", /\{beslenmeOwner \?/.test(page));

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Knowledge Core static contract: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
