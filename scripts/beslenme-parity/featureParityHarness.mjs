// ============================================================
// Beslenme — ADMIN↔UZMAN ÖZELLİK PARİTESİ statik kontrat harness'i.
//
// Kanonik ürün kuralı: Admin Paneli + Dijital İçerik Merkezi HARİÇ, Beslenme'de admin ve
// (module_permissions.beslenme=true) uzman AYNI özellik setine sahiptir. Fark yalnız VERİ
// KAPSAMIDIR (tenant-scoped). Bu harness owner-only role-fork'ların KALDIRILDIĞINI ve modül
// guard mimarisinin kurulduğunu SAF regex ile doğrular. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
let pass = 0, fail = 0; const failures = [];
const ok = (n, c) => (c ? pass++ : (fail++, failures.push(n)));

console.log("Beslenme — Admin↔Uzman Özellik Paritesi (statik kontrat)\n");

// 1) moduleAccess core: beslenme NORMAL modül (owner-only special-case KALDIRILDI).
const core = read("lib/auth/moduleAccessCore.ts");
ok("moduleAccessCore: beslenme→false special-case KALDIRILDI", !/moduleKey === "beslenme"\s*\)\s*return false/.test(core));
ok("moduleAccessCore: ModuleGateKey içinde beslenme var", /\|\s*"beslenme"/.test(core));

// 2) modulePermissions: beslenme grantable (admin panel izin ekranı).
const mp = read("lib/auth/modulePermissions.ts");
ok("modulePermissions: ModulePermissionKey beslenme", /\|\s*"beslenme"/.test(mp));
ok("modulePermissions: MODULE_PERMISSION_KEYS beslenme", /MODULE_PERMISSION_KEYS[\s\S]*?"beslenme"/.test(mp));
ok("modulePermissions: LABEL beslenme", /beslenme:\s*"Beslenme"/.test(mp));
ok("modulePermissions: DEFAULT beslenme:false (opt-in; premium auto-grant YOK)",
   /DEFAULT_MODULE_PERMISSIONS[\s\S]*?beslenme:\s*false/.test(mp));
ok("modulePermissions: beslenme PREMIUM otomatik açılmıyor", !/PREMIUM_EXPERT_MODULE_KEYS[\s\S]*?"beslenme"/.test(mp));

// 2b) Admin Paneli izin REGISTRY: tam Beslenme toggle'ı yönetilebilir (beslenme_manual_food
//     dar bayrağının YERİNE geçmez). Save/load zinciri beslenme boolean'ını taşır + yönetilmeyen
//     izinleri korur (wholesale-overwrite değil). Bu, Preview Admin Paneli bloker fix'inin regresyonu.
const um = read("lib/admin/userManagement.ts");
ok("admin registry: ADMIN_MODULE_UI_KEYS içinde canonical 'beslenme'",
   /ADMIN_MODULE_UI_KEYS\s*=\s*\[[\s\S]*?["']beslenme["'][\s\S]*?\]\s*as const/.test(um) && /^\s*"beslenme",\s*$/m.test(um));
ok("admin registry: ADMIN_MODULE_UI_LABELS.beslenme === 'Beslenme'", /\bbeslenme:\s*"Beslenme"/.test(um));
ok("admin registry: DEFAULT_ADMIN_MODULE_PERMISSIONS.beslenme === false",
   /DEFAULT_ADMIN_MODULE_PERMISSIONS[\s\S]*?\bbeslenme:\s*false/.test(um));
ok("admin registry: beslenme_manual_food (Manuel Besin) toggle'ı KALDIRILDI (tek Beslenme izni)",
   !/["']beslenme_manual_food["']/.test(um) && !/"Manuel Besin Yönetimi"/.test(um));
ok("admin registry: beslenme açıklaması tam-modül (CUSTOM besin dahil)",
   /beslenme:\s*"Beslenme modülünün tamamına[\s\S]{0,80}eri[şs]im verir/.test(um));
ok("admin save: adminPermissionsToPayload registry'yi (beslenme dahil) spread eder",
   /export function adminPermissionsToPayload[\s\S]{0,160}\{\s*\.\.\.perms\s*\}/.test(um));
ok("admin save: mergeAdminModulePermissions yönetilmeyen izinleri KORUR (preservation)",
   /UI_MANAGED_PERMISSION_KEYS\s*:?[^=]*=\s*new Set[\s\S]*?\.\.\.ADMIN_MODULE_UI_KEYS/.test(um) &&
   /if \(!UI_MANAGED_PERMISSION_KEYS\.has\(k\)\)\s*merged\[k\]/.test(um));

// 3) Guard kütüphanesi: requireBeslenmeModule var, requireBeslenmeOwner YOK.
const og = read("lib/beslenme/ownerGuard.ts");
ok("ownerGuard: requireBeslenmeModule export", /export async function requireBeslenmeModule/.test(og));
ok("ownerGuard: requireBeslenmeOwner KALDIRILDI", !/export async function requireBeslenmeOwner/.test(og));
ok("ownerGuard: requireBeslenmeModule OWNER_ONLY narrowing YOK",
   !/export async function requireBeslenmeModule[\s\S]{0,300}OWNER_ONLY/.test(og));
// FOOD READ (requireBeslenmeFoodRead): clients | beslenme (manual bayrak KALDIRILDI).
{
  const readBlock = (og.match(/export async function requireBeslenmeFoodRead[\s\S]*?^}/m) || [""])[0];
  ok("food READ clients okumaya devam ediyor", /resolveModuleAccess\([^)]*["']clients["']\)/.test(readBlock));
  ok("food READ beslenme okumaya devam ediyor", /resolveModuleAccess\([^)]*["']beslenme["']\)/.test(readBlock));
  ok("food READ manual bayrak KALDIRILDI (hasManualFoodFlag yok)", !/hasManualFoodFlag\(/.test(readBlock));
}
// FOOD WRITE: ayrı contributor kapısı KALDIRILDI; mutation route'ları requireBeslenmeModule (tam
// Beslenme; admin role short-circuit) ile korunur. clients/manual TEK BAŞINA write VERMEZ.
ok("ownerGuard: requireBeslenmeFoodContributor KALDIRILDI", !/requireBeslenmeFoodContributor/.test(og));
ok("ownerGuard: foodContributorPolicy importu KALDIRILDI (decideFoodContributorAuthority/hasManualFoodFlag yok)",
   !/foodContributorPolicy/.test(og) && !/decideFoodContributorAuthority/.test(og) && !/hasManualFoodFlag/.test(og));
{
  const foodsPost = read("app/api/beslenme/foods/route.ts");
  ok("food WRITE (foods POST) requireBeslenmeModule ile korunuyor",
     /export async function POST[\s\S]{0,120}requireBeslenmeModule\(/.test(foodsPost));
  const foodsId = read("app/api/beslenme/foods/[id]/route.ts");
  ok("food WRITE (foods/[id] PATCH+DELETE) requireBeslenmeModule",
     (foodsId.match(/requireBeslenmeModule\(/g) || []).length >= 2 && !/requireBeslenmeFoodContributor/.test(foodsId));
}

// 4) Hiçbir Beslenme yüzeyinde requireBeslenmeOwner ÇAĞRISI kalmadı.
//    (grep tüm app/lib; comment/prose değil gerçek çağrı — "(" ile.)
function grepCall(dirRel, needle) {
  // basit tarama: yalnız değişen guard kütüphanesi + api ağacı taranır (statik dosya listesi).
  return read(dirRel).includes(needle);
}
const OWNER_CALL_FILES = [
  "app/api/beslenme/plans/route.ts",
  "app/api/beslenme/plans/[id]/route.ts",
  "app/api/beslenme/plans/[id]/copy/route.ts",
  "app/api/beslenme/plans/[id]/revise/route.ts",
  "app/api/beslenme/plans/[id]/week-copy/route.ts",
  "app/api/beslenme/plans/[id]/assign-client/route.ts",
  "app/api/beslenme/templates/route.ts",
  "app/api/beslenme/topics/route.ts",
  "app/api/beslenme/sources/route.ts",
  "app/api/beslenme/foods/[id]/traditional/route.ts",
  "app/api/beslenme/foods/[id]/sources/route.ts",
];
for (const f of OWNER_CALL_FILES) {
  ok(`owner-call yok: ${f.replace("app/api/beslenme/", "")}`, !/requireBeslenmeOwner\(/.test(read(f)));
}

// 5) Global CRUD route'ları requireBeslenmeModule (admin↔uzman). Şablon YÖNETİMİ
//    (liste dışı: rename/duplicate/delete) hâlâ requireBeslenmeModule; şablon LIST/CREATE/APPLY
//    ise capability-aware (aşağıda #6b) — clients-only uzman plan editöründe dead-control kalmasın.
const MODULE_ROUTES = [
  "plans/route.ts", "templates/[id]/route.ts", "templates/[id]/duplicate/route.ts",
  "topics/route.ts", "topics/[id]/route.ts", "sources/route.ts", "sources/[id]/route.ts",
  "counts/route.ts", "foods/[id]/traditional/route.ts", "foods/[id]/sources/route.ts",
];
for (const r of MODULE_ROUTES) {
  ok(`module gate: ${r}`, /requireBeslenmeModule\(/.test(read(`app/api/beslenme/${r}`)));
}

// 6b) CAPABILITY-aware şablon: LIST beslenme|clients; CREATE/APPLY plan-access ile (clients-only
//     bound plan editöründe şablon işlemleri PASS; foreign/unbound → 404).
const tplIdx = read("app/api/beslenme/templates/route.ts");
ok("templates GET capability-aware (resolveBeslenmeCapabilities)", /resolveBeslenmeCapabilities\(/.test(tplIdx));
ok("templates POST create → source plan-access (requireBeslenmePlanAccess + getMealScope/getDayScope)",
   /requireBeslenmePlanAccess\(req,/.test(tplIdx) && /getMealScope\(/.test(tplIdx) && /getDayScope\(/.test(tplIdx));
ok("templates POST create body'den tenant/client kimliği ÇIKARMIYOR", !/body\.(tenant_id|client_id|user_id)/.test(tplIdx));
const tplApply = read("app/api/beslenme/templates/[id]/apply/route.ts");
ok("templates apply → target_plan_id plan-access ile yetkilendiriliyor", /requireBeslenmePlanAccess\(req,\s*body\.target_plan_id/.test(tplApply));
ok("templates apply artık requireBeslenmeModule DEĞİL (capability-aware)", !/requireBeslenmeModule\(/.test(tplApply));

// 6) Plan lifecycle plan-access (owner|bound-expert): copy/revise/DELETE/week-copy.
const copyR = read("app/api/beslenme/plans/[id]/copy/route.ts");
ok("copy plan-access + expert bound auto-bind", /requireBeslenmePlanAccess\(req,/.test(copyR) && /nutrition_plan_assign_client/.test(copyR));
ok("revise plan-access", /requireBeslenmePlanAccess\(req,/.test(read("app/api/beslenme/plans/[id]/revise/route.ts")));
ok("DELETE plan-access", /export async function DELETE[\s\S]{0,200}requireBeslenmePlanAccess\(req,/.test(read("app/api/beslenme/plans/[id]/route.ts")));

// 7) UI: role-fork hide KALDIRILDI (parity) — dead-control yok.
ok("PlanTools isExpert role-fork YOK", !/isExpert/.test(read("app/beslenme/planlar/_components/PlanTools.tsx")));
{
  const mc = read("app/beslenme/planlar/_components/MealCard.tsx");
  ok("MealCard useEditorCaps YOK + Öğünü Şablonla açık", !/useEditorCaps/.test(mc) && /Öğünü Şablonla/.test(mc));
}
{
  const pg = read("app/beslenme/planlar/[id]/page.tsx");
  ok("Plan editör: Planı Kopyala isExpert-gate YOK", !/\{!isExpert \? \([\s\S]{0,120}Planı Kopyala/.test(pg));
  ok("Plan editör: EditorCapsProvider role-fork KALDIRILDI", !/EditorCapsProvider/.test(pg));
  // Nav bağlamı ARTIK authority değil binding varlığı (boundClient) ile — authority UI'da
  // feature ayrımı yaratmaz (admin↔uzman paritesi). "Danışana Dön" yalnız bağlı planda.
  ok("Plan editör: nav boundClient ile (authority role-fork YOK)",
     /cameFromClient && boundClient/.test(pg) && !/authority === ["']expert["']/.test(pg));
}
ok("editorCaps.tsx kaldırıldı", !existsSync(resolve(ROOT, "app/beslenme/planlar/_components/editorCaps.tsx")));

// 7b) /beslenme hub "Danışan Planları" kartı clients yeteneğiyle gate (beslenme-only'da GİZLİ).
{
  const hub = read("app/beslenme/page.tsx");
  ok("hub: Danışan Planları kartı hasClients ile gate", /hasClients \? \(/.test(hub) && /fetchBeslenmeCapabilities\(/.test(hub));
  const access = read("app/api/beslenme/access/route.ts");
  ok("access route clients yeteneğini döner (server-authoritative)",
     /resolveModuleAccess\([^)]*["']clients["']\)/.test(access) && /clients:\s*clients === true/.test(access));
}

// 8) Client-side guard: useBeslenmeModuleGuard (owner guard KALDIRILDI); probe module-access.
const shell = read("app/beslenme/_components/BeslenmeShell.tsx");
ok("useBeslenmeModuleGuard export", /export function useBeslenmeModuleGuard/.test(shell));
ok("useBeslenmeOwnerGuard KALDIRILDI", !/useBeslenmeOwnerGuard/.test(shell));
const bc = read("lib/beslenme/beslenmeClient.ts");
ok("checkBeslenmeAccess module probe (access alanı)", /access\?\:\s*boolean/.test(bc) && /r\.data\?\.access === true/.test(bc));
const accessRoute = read("app/api/beslenme/access/route.ts");
ok("/api/beslenme/access beslenme-gate + {access:true} + clients yeteneği",
   /requireModuleAccess\(req,\s*["']beslenme["']\)/.test(accessRoute) &&
   /access:\s*true/.test(accessRoute) &&
   /clients:\s*clients === true/.test(accessRoute));

// 9) Ana dashboard: bağımsız Beslenme + Besinlerim kartları KALDIRILDI → "Doğal Destek & Rehber"
//    hub'ına taşındı. Stale owner-only UX de kalmadı.
const home = read("app/page.tsx");
ok("home: bağımsız data-beslenme-card KALDIRILDI (hub'a taşındı)", !/data-beslenme-card/.test(home));
ok("home: bağımsız data-besinlerim-card KALDIRILDI (hub'a taşındı)", !/data-besinlerim-card/.test(home));
ok("home: stale owner-only 'Sahip' / 'yalnız sahip' YOK", !/>\s*Sahip\s*</.test(home) && !/yalnız sahip/.test(home));
ok("home: data-beslenme-owner-card + Beslenme stale owner prose YOK",
   !/data-beslenme-owner-card/.test(home) && !/Beslenme[\s\S]{0,120}(OWNER-ONLY|super-admin|requireMainAdmin)/.test(home));
// Doğal Destek hub kartı görünürlüğü (anyPermissionKeys): aromatherapy|sifa|beslenme; clients+manual YOK.
{
  const dogalKeys = (home.match(/href:\s*"\/dogal-destek",[\s\S]*?anyPermissionKeys:\s*\[([^\]]*)\]/) || [,""])[1];
  ok("home: Doğal Destek anyPermissionKeys 'beslenme' içerir", /"beslenme"/.test(dogalKeys));
  ok("home: Doğal Destek anyPermissionKeys aromatherapy/sifa korunur",
     /"aromatherapy"/.test(dogalKeys) && /"sifa_rehberi"/.test(dogalKeys));
  ok("home: Doğal Destek anyPermissionKeys clients + beslenme_manual_food İÇERMEZ",
     !/"clients"/.test(dogalKeys) && !/"beslenme_manual_food"/.test(dogalKeys));
}

// 9b) /dogal-destek route guard: OR keys aromatherapy|sifa|beslenme; clients + manual YOK.
{
  const rma = read("lib/auth/routeModuleAccess.ts");
  const dogalRule = (rma.match(/prefix:\s*"\/dogal-destek",\s*keys:\s*\[([^\]]*)\]/) || [,""])[1];
  ok("route: /dogal-destek keys 'beslenme' içerir", /"beslenme"/.test(dogalRule));
  ok("route: /dogal-destek keys aromatherapy/sifa korunur",
     /"aromatherapy"/.test(dogalRule) && /"sifa_rehberi"/.test(dogalRule));
  ok("route: /dogal-destek keys clients + beslenme_manual_food İÇERMEZ",
     !/"clients"/.test(dogalRule) && !/"beslenme_manual_food"/.test(dogalRule));
}

// 9c) Doğal Destek hub alt kartları (DogalDestekCards): Aromaterapi/Şifa (flag) + Beslenme (server
//     access). Ayrı "Besinlerim" alt kartı KALDIRILDI. Flicker fix: userResolved && beslenmeResolved
//     çözülmeden gerçek kart yok (2→3 sıçraması yok) + iskelet.
{
  const cards = read("app/dogal-destek/DogalDestekCards.tsx");
  ok("hub: Aromaterapi + Şifa Rehberi flag-kartları korunuyor (hasAnyModulePermissionFlag)",
     /hasAnyModulePermissionFlag\(/.test(cards) && /\/aromaterapi/.test(cards) && /\/sifa-rehberi/.test(cards));
  ok("hub: Beslenme alt kartı /beslenme + server access probe (checkBeslenmeAccess)",
     /href:\s*"\/beslenme"/.test(cards) && /checkBeslenmeAccess\(\)/.test(cards));
  ok("hub: ayrı Besinlerim alt kartı KALDIRILDI (/beslenme/besinlerim + food probe yok)",
     !/besinlerim/.test(cards) && !/checkBeslenmeFoodAccess/.test(cards) && !/foodContributor/.test(cards));
  ok("hub: Beslenme kartı yalnız beslenmeAccess iken push edilir",
     /if \(beslenmeAccess\) visible\.push\(BESLENME_FOLDER\)/.test(cards));
  ok("hub: FLICKER FIX — accessResolved (userResolved && beslenmeResolved) çözülmeden kart yok + iskelet",
     /const accessResolved = userResolved && beslenmeResolved/.test(cards) &&
     /if \(!accessResolved\)/.test(cards) && /animate-pulse/.test(cards));
  ok("hub: probe hata/finally ile resolve (sonsuz loading yok, fail-closed)",
     /setUserResolved\(true\)/.test(cards) && /setBeslenmeResolved\(true\)/.test(cards) && /\.finally\(/.test(cards));
  ok("hub: responsive grid (kart sayısına göre) — 3 lg:grid-cols-3",
     /function gridClass\(/.test(cards) && /lg:grid-cols-3/.test(cards) && /sm:grid-cols-2/.test(cards));
}

// 10) GÜVENLİK SINIRLARI KORUNDU (parity ≠ veri sızıntısı).
const foodEngine = read("lib/beslenme/foodEngine.ts");
ok("SYSTEM write koruması korunuyor (SYSTEM_READONLY)", /SYSTEM_READONLY/.test(foodEngine));
const planGuard = read("lib/beslenme/clientPlanGuard.ts");
// CAPABILITY modeli: authority "module"|"client". module (beslenme izinli; admin dahil) → own
// tenant bound+unbound; client-only → yalnız bound (unbound fail-closed). requireMainAdmin YOK.
ok("plan-guard capability-based (verifyUserRequest + resolveModuleAccess)",
   /verifyUserRequest\(/.test(planGuard) &&
   /resolveModuleAccess\([^)]*["']beslenme["']\)/.test(planGuard) &&
   /resolveModuleAccess\([^)]*["']clients["']\)/.test(planGuard));
ok("plan-guard requireMainAdmin ROLE-GATE KALDIRILDI (parity)", !/requireMainAdmin\(/.test(planGuard));
ok("plan-guard authority 'module'|'client'", /"module"/.test(planGuard) && /"client"/.test(planGuard));
ok("plan-guard hasBeslenme → module (unbound dahil own tenant)", /if \(hasBeslenme\)[\s\S]{0,120}authority:\s*"module"/.test(planGuard));
ok("plan-guard clients-only unbound plan → fail-closed (bound zorunlu)",
   /if \(!boundClientId\)[\s\S]{0,120}PLAN_NOT_FOUND/.test(planGuard));
ok("plan-guard beslenme+clients ikisi de yoksa → 403 FORBIDDEN",
   /if \(!hasBeslenme && !hasClients\)[\s\S]{0,120}FORBIDDEN/.test(planGuard));
const clientGuard = read("lib/beslenme/clientRouteGuard.ts");
ok("client route tenant-scope korunuyor (requireClientInTenant)", /requireClientInTenant\(/.test(clientGuard));

// 11) CAPABILITY PARİTE MATRİSİ (özet çıktı). Sütunlar:
//     A=beslenme-only  B=clients-only  C=beslenme+clients  ADMIN (=A üstü, role short-circuit).
//     Fark ÖZELLİKTE değil VERİ KAPSAMINDA (tenant/danışan).
const MATRIX = [
  //  feature                                             A(besl)  B(cli)   C(iki)     ADMIN     gate
  ["Ana /beslenme modül + katalog/rehber",                "PASS",  "DENY",  "PASS",    "PASS",   "requireBeslenmeModule"],
  ["Own-tenant UNBOUND plan edit/copy/revise/delete",     "PASS",  "404",   "PASS",    "PASS",   "plan-access module"],
  ["Danışana BOUND plan edit/copy/revise/delete",         "n/a",   "PASS",  "PASS",    "PASS",   "plan-access"],
  ["Danışan plan create (client Beslenme tab)",           "DENY",  "PASS",  "PASS",    "PASS",   "requireBeslenmeClient"],
  ["Plan editör gün/öğün/item + Word + analytics",        "own",   "bound", "her iki", "PASS",   "plan-access"],
  ["Şablon LIST + CREATE + APPLY (plan-scope)",           "own",   "bound", "her iki", "PASS",   "capability + plan-access"],
  ["Şablon YÖNETİMİ (rename/duplicate/delete)",           "PASS",  "DENY",  "PASS",    "PASS",   "requireBeslenmeModule"],
  ["Besin OKUMA (plan editörü; SYSTEM ∪ tenant)",         "PASS",  "PASS",  "PASS",    "PASS",   "requireBeslenmeFoodRead (clients|beslenme)"],
  ["CUSTOM besin YAZMA (/beslenme/besinler; oluştur/düzenle/arşivle)", "PASS", "DENY", "PASS", "PASS", "requireBeslenmeModule (tam Beslenme; clients DEĞİL)"],
  ["Ayrı 'Besinlerim' route/kart/yetenek",               "YOK",   "YOK",   "YOK",     "YOK",    "ÜRÜNDEN KALDIRILDI (CUSTOM besin tam Beslenme içinde)"],
  ["Ana dashboard bağımsız Beslenme kartı",              "YOK",   "YOK",   "YOK",     "YOK",    "hub'a taşındı (Doğal Destek & Rehber)"],
  ["Doğal Destek hub → Beslenme alt kartı",               "GÖRÜNÜR","GİZLİ", "GÖRÜNÜR", "GÖRÜNÜR","checkBeslenmeAccess (access=true)"],
  ["Doğal Destek hub kartı (dashboard görünürlük)",       "GÖRÜNÜR","GİZLİ*","GÖRÜNÜR", "GÖRÜNÜR","anyPermissionKeys beslenme|aroma|sifa (*clients+stale manual AÇMAZ)"],
  ["Danışan verisi (profil/ölçüm/alerji)",                "DENY",  "PASS",  "PASS",    "PASS",   "requireBeslenmeClient"],
  ["Danışan Planları hub kartı (UI görünürlük)",          "GİZLİ", "n/a",   "GÖRÜNÜR", "GÖRÜNÜR","access.clients"],
  ["Foreign tenant plan/şablon/besin",                    "404",   "404",   "404",     "404",    "tenant-scoped fail-closed"],
];
console.log("\n  FEATURE | A=besl-only | B=cli-only | C=besl+cli | ADMIN | GATE");
for (const [feat, a, b, c, adm, gate] of MATRIX) {
  console.log(`  - ${feat} | ${a} | ${b} | ${c} | ${adm} | ${gate}`);
}
console.log("  (SYSTEM katalog: normal UI'da HER ROL için salt-okunur. Admin ekstra NORMAL feature almaz.)");
console.log("  (D=beslenme:false+clients:false → tüm Beslenme yüzeyleri DENY 401/403.)");

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
if (fail) { console.log("FAILURES:"); for (const f of failures) console.log("  - " + f); }
process.exit(fail === 0 ? 0 : 1);
