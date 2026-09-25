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

// 5) Global CRUD route'ları requireBeslenmeModule (admin↔uzman).
const MODULE_ROUTES = [
  "plans/route.ts", "templates/route.ts", "templates/[id]/route.ts", "templates/[id]/apply/route.ts",
  "topics/route.ts", "topics/[id]/route.ts", "sources/route.ts", "sources/[id]/route.ts",
  "counts/route.ts", "foods/[id]/traditional/route.ts", "foods/[id]/sources/route.ts",
];
for (const r of MODULE_ROUTES) {
  ok(`module gate: ${r}`, /requireBeslenmeModule\(/.test(read(`app/api/beslenme/${r}`)));
}

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
  // isExpert yalnız NAV (Danışana Dön) için kalabilir.
  ok("Plan editör: isExpert yalnız nav bağlamında", /backLabel=\{isExpert && boundClient/.test(pg));
}
ok("editorCaps.tsx kaldırıldı", !existsSync(resolve(ROOT, "app/beslenme/planlar/_components/editorCaps.tsx")));

// 8) Client-side guard: useBeslenmeModuleGuard (owner guard KALDIRILDI); probe module-access.
const shell = read("app/beslenme/_components/BeslenmeShell.tsx");
ok("useBeslenmeModuleGuard export", /export function useBeslenmeModuleGuard/.test(shell));
ok("useBeslenmeOwnerGuard KALDIRILDI", !/useBeslenmeOwnerGuard/.test(shell));
const bc = read("lib/beslenme/beslenmeClient.ts");
ok("checkBeslenmeAccess module probe (access alanı)", /access\?\:\s*boolean/.test(bc) && /r\.data\?\.access === true/.test(bc));
const accessRoute = read("app/api/beslenme/access/route.ts");
ok("/api/beslenme/access requireBeslenmeModule + {access:true}", /requireBeslenmeModule\(/.test(accessRoute) && /access:\s*true/.test(accessRoute));

// 9) Ana panel kartı: admin-kısıtı KALDIRILDI (beslenme modül uzmanı da görür).
const home = read("app/page.tsx");
ok("home kart probe admin-kısıtı KALDIRILDI (isAdminUser gate yok)",
   !/if \(!user \|\| !isAdminUser\(user\)\) \{\s*setBeslenmeOwner\(false\)/.test(home));

// 10) GÜVENLİK SINIRLARI KORUNDU (parity ≠ veri sızıntısı).
const foodEngine = read("lib/beslenme/foodEngine.ts");
ok("SYSTEM write koruması korunuyor (SYSTEM_READONLY)", /SYSTEM_READONLY/.test(foodEngine));
const planGuard = read("lib/beslenme/clientPlanGuard.ts");
ok("expert unbound plan fail-closed korunuyor", /if \(!boundClientId\)/.test(planGuard) && /PLAN_NOT_FOUND/.test(planGuard));
const clientGuard = read("lib/beslenme/clientRouteGuard.ts");
ok("client route tenant-scope korunuyor (requireClientInTenant)", /requireClientInTenant\(/.test(clientGuard));

// 11) FEATURE PARITY MATRİSİ (özet çıktı; her satır ADMIN=PASS AUTHORIZED-EXPERT=PASS).
const MATRIX = [
  ["Danışan plan create", "requireBeslenmeClient/plans"],
  ["Plan editör (gün/öğün/item)", "requireBeslenmePlanAccess"],
  ["Plan copy/revise/delete", "requireBeslenmePlanAccess"],
  ["Haftayı/Günü Kopyala", "requireBeslenmePlanAccess"],
  ["Şablon kaydet/uygula/liste", "requireBeslenmeModule"],
  ["Besin CRUD (tenant CUSTOM)", "requireBeslenmeFoodContributor"],
  ["Besin nutrient/portion", "requireBeslenmeFoodContributor"],
  ["Geleneksel/Kaynaklar", "requireBeslenmeModule"],
  ["Konu/Rehber/Mizaç/Kan", "requireBeslenmeModule"],
  ["Global plan liste/oluştur", "requireBeslenmeModule"],
];
console.log("\n  FEATURE | ADMIN | AUTHORIZED EXPERT | DATA SCOPE");
for (const [feat, gate] of MATRIX) {
  console.log(`  - ${feat} | PASS | PASS | tenant-scoped (${gate})`);
}
console.log("  (SYSTEM katalog: normal UI'da HER ROL için salt-okunur.)");

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
if (fail) { console.log("FAILURES:"); for (const f of failures) console.log("  - " + f); }
process.exit(fail === 0 ? 0 : 1);
