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

// 3) Guard kütüphanesi: requireBeslenmeModule var, requireBeslenmeOwner YOK.
const og = read("lib/beslenme/ownerGuard.ts");
ok("ownerGuard: requireBeslenmeModule export", /export async function requireBeslenmeModule/.test(og));
ok("ownerGuard: requireBeslenmeOwner KALDIRILDI", !/export async function requireBeslenmeOwner/.test(og));
ok("ownerGuard: requireBeslenmeModule OWNER_ONLY narrowing YOK",
   !/export async function requireBeslenmeModule[\s\S]{0,300}OWNER_ONLY/.test(og));
ok("ownerGuard: food READ beslenme modülüne açık", /requireBeslenmeFoodRead[\s\S]{0,400}resolveModuleAccess\([^)]*["']beslenme["']\)/.test(og));
ok("ownerGuard: food WRITE beslenme/clients modülüne açık",
   /moduleWrite\s*=[\s\S]{0,160}resolveModuleAccess\([^)]*["']beslenme["']\)[\s\S]{0,80}resolveModuleAccess\([^)]*["']clients["']\)/.test(og));

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

// 9) Ana panel kartı: admin-kısıtı KALDIRILDI (beslenme modül uzmanı da görür).
const home = read("app/page.tsx");
ok("home kart probe admin-kısıtı KALDIRILDI (isAdminUser gate yok)",
   !/if \(!user \|\| !isAdminUser\(user\)\) \{\s*setBeslenmeOwner\(false\)/.test(home));

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
  ["Besin CRUD (tenant CUSTOM; SYSTEM read-only)",        "PASS",  "PASS",  "PASS",    "PASS",   "requireBeslenmeFoodContributor"],
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
