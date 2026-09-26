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

console.log("\n[module] Beslenme NORMAL grantable module (owner-only faz KALDIRILDI — parity)");
// KANONİK MODEL: Beslenme owner-only DEĞİL, normal grantable modüldür. admin role short-circuit
// PASS; module_permissions.beslenme=true uzman PASS; beslenme=false uzman ana modül DENY. Karar
// SAF resolveModuleAccess (moduleAccessCore) ile verilir; type union da orada tanımlıdır.
const moduleCore = read(resolve(ROOT, "lib/auth/moduleAccessCore.ts"));
const routeRegistry = read(resolve(ROOT, "lib/auth/moduleRouteRegistry.ts"));
check("ModuleGateKey içerir 'beslenme' (canonical: moduleAccessCore)", /\|\s*"beslenme"/.test(moduleCore));
check("beslenme owner-only special-case KALDIRILDI (non-admin→false YOK)",
  !/moduleKey === "beslenme"\s*\)\s*return false/.test(moduleCore), "eski beslenme→false special-case bulundu");
check("resolveModuleAccess admin role short-circuit PASS", /=== "admin"\)\s*return true/.test(moduleCore));
check("beslenme grantable → hasFlag(module_permissions) ile çözülür (normal modül)",
  /return hasFlag\(flags, moduleKey\)/.test(moduleCore));
check("MODULE_ROUTE_PREFIXES app/api/beslenme → beslenme", /prefix:\s*"app\/api\/beslenme",\s*key:\s*"beslenme"/.test(routeRegistry));

console.log("\n[module guard] canonical Beslenme guard mimarisi (capability-based; owner-only faz yok)");
const ownerGuard = read(resolve(ROOT, "lib/beslenme/ownerGuard.ts"));
const planGuard = read(resolve(ROOT, "lib/beslenme/clientPlanGuard.ts"));
const clientGuard = read(resolve(ROOT, "lib/beslenme/clientRouteGuard.ts"));
check("requireBeslenmeModule canonical global module gate (requireModuleAccess beslenme)",
  /export async function requireBeslenmeModule/.test(ownerGuard) && /requireModuleAccess\(req,\s*"beslenme"\)/.test(ownerGuard));
check("requireBeslenmeOwner KALDIRILDI (owner-only faz yok)", !/export async function requireBeslenmeOwner/.test(ownerGuard));
check("OWNER_ONLY kodu ownerGuard'da KALDIRILDI", !/OWNER_ONLY/.test(ownerGuard));
check("resolveBeslenmeCapabilities export (beslenme|clients yeteneği — capability-aware yüzeyler)",
  /export async function resolveBeslenmeCapabilities/.test(ownerGuard));
check("requireBeslenmePlanAccess capability-based (module|client)",
  /verifyUserRequest\(/.test(planGuard)
  && /resolveModuleAccess\([^)]*"beslenme"\)/.test(planGuard)
  && /resolveModuleAccess\([^)]*"clients"\)/.test(planGuard)
  && /"module"/.test(planGuard) && /"client"/.test(planGuard));
check("requireBeslenmePlanAccess requireMainAdmin ROLE-GATE KULLANMIYOR (parity)", !/requireMainAdmin\(/.test(planGuard));
check("client-scoped route guard requireBeslenmeClient (clients modülü + tenant ownership)",
  /export async function requireBeslenmeClient/.test(clientGuard)
  && /requireModuleAccess\(req,\s*"clients"\)/.test(clientGuard)
  && /requireClientInTenant\(/.test(clientGuard));
check("denyDemoMutation mevcut (demo guard)", /export function denyDemoMutation/.test(ownerGuard));

console.log("\n[K/L/O/P/Q/R] route güvenlik sözleşmesi (her route — canonical capability gates)");
check("access route mevcut", !!routeSrc["/app/api/beslenme/access/route.ts"]);
// KANONİK KAPILAR (owner-only faz KALDIRILDI). Her Beslenme route'u aşağıdakilerden EN AZ birini
// kullanmalı: modül (requireBeslenmeModule) · plan-access (requireBeslenmePlanAccess, module|client) ·
// client-scoped (requireBeslenmeClient) · besin katkı/okuma (requireBeslenmeFoodContributor/…FoodRead) ·
// capability probe (resolveBeslenmeCapabilities) · doğrudan modül kapısı (requireModuleAccess — access
// "beslenme", client-reference "clients"). Kimliksiz/gate'siz Beslenme route'u YASAK.
const CANONICAL_GATE = /requireBeslenmeModule|requireBeslenmePlanAccess|requireBeslenmeClient|requireBeslenmeFoodContributor|requireBeslenmeFoodRead|resolveBeslenmeCapabilities|requireModuleAccess/;
const mutationRe = /export async function (POST|PATCH|DELETE)/;
let routeGateOk = true, demoOk = true, uuidOk = true, tenantTrustOk = true, massOk = true;
for (const [path, s] of Object.entries(routeSrc)) {
  if (!CANONICAL_GATE.test(s)) { routeGateOk = false; bad(`canonical gate eksik: ${path}`); }
  if (mutationRe.test(s) && !/denyDemoMutation/.test(s)) { demoOk = false; bad(`demo guard eksik (mutation): ${path}`); }
  // mass-assignment guard yalnız GÖVDE OKUYAN (req.json()) route'lar için gereklidir. Plan create
  // yolları allowlist'i ortak createPlanForTenant helper'ında (PLAN_CREATE_KEYS hasOnlyKeys) uygular.
  if (/req\.json\(\)/.test(s) && !/hasOnlyKeys/.test(s) && !/createPlanForTenant\(/.test(s)) { massOk = false; bad(`mass-assignment guard (hasOnlyKeys) eksik: ${path}`); }
  // dinamik segment id doğrulaması: isUuid VEYA requireBeslenmeClient (paylaşılan kapı clientId'yi
  // isUuid ile doğrular + DB ownership kontrolü yapar — literal isUuid'den güçlüdür).
  if (/\[/.test(path) && !/isUuid/.test(s) && !/requireBeslenmeClient/.test(s)) { uuidOk = false; bad(`UUID validation eksik: ${path}`); }
  // tenant client body'den alınmamalı: insert tenant_id: tenantId (guard) olmalı, body.tenant_id OLMAMALI
  if (/body\.tenant_id|tenant_id:\s*body/.test(s)) { tenantTrustOk = false; bad(`body tenant trust: ${path}`); }
}
check("her route canonical capability gate kullanır", routeGateOk);
check("her mutation denyDemoMutation", demoOk);
check("[id] route'larında isUuid", uuidOk);
check("body tenant_id trust YOK (spoofing korunuyor)", tenantTrustOk);
check("her mutation hasOnlyKeys / createPlanForTenant allowlist (mass-assignment)", massOk);

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

console.log("\n[W/X] Word YOK + lisanslı-veri kapısı (beslenme scope; FAZ 4 güncel)");
const beslenmeAll = [ownerGuard, contracts, ...Object.values(routeSrc)].join("\n");
check("Word/docx import YOK", !/reportHelpers|from "docx"|Packer/.test(beslenmeAll));
// FAZ 4: USDA FoodData Central (CC0/public domain) provider desteği MEVCUT ve serbesttir.
//   TÜRKOMP ticari lisans gerektirir → veri sisteme GİRMEZ (yalnız enum olarak geleceğe hazır).
const dataDir = resolve(ROOT, "data", "nutrition");
const dataFiles = existsSync(dataDir) ? readdirSync(dataDir) : [];
check("TÜRKOMP veri fixture'ı YOK (lisanssız veri bundle edilmez)",
  !dataFiles.some((f) => /turkomp/i.test(f)));
check("API otomatik import provider yalnız usda_fdc (CC0)",
  /IMPORT_PROVIDERS\s*=\s*\[\s*"usda_fdc"\s*\]/.test(contracts));

console.log("\n[Z] dashboard Beslenme kartı fail-closed + server-authoritative module probe");
// Kart görünürlüğü admin↔uzman parity: server probe (/api/beslenme/access) admin VEYA
// module_permissions.beslenme=true uzman → true. Default false (fail-closed). State değişkeni
// legacy adıyla `beslenmeOwner` kalsa da karar server modül probe'udur (rol değil).
const page = read(resolve(ROOT, "app/page.tsx"));
check("Beslenme kart state default false (fail-closed)", /useState\(false\)/.test(page) && /const \[beslenmeOwner, setBeslenmeOwner\]/.test(page));
check("server-authoritative module probe checkBeslenmeAccess", /checkBeslenmeAccess\(\)/.test(page));
check("kart yalnız probe (beslenmeOwner) true ise render", /\{beslenmeOwner \?/.test(page));

console.log(`\n${"=".repeat(56)}`);
console.log(`  TOPLAM: ${pass} PASS · ${fail} FAIL`);
if (fail) { console.log(`  FAILURES:\n   - ${failures.join("\n   - ")}`); console.log("=".repeat(56)); process.exit(1); }
console.log("  ✅ Beslenme Knowledge Core static contract: TÜM KONTROLLER GEÇTİ");
console.log("=".repeat(56));
