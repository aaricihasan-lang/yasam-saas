// ============================================================
// Beslenme — Uzman Erişimi AŞAMA 2 STATİK erişim-kontratı harness'i.
//
// Danışan-bound plan create/edit uzmana açıldı; owner global akışı + owner-only kürasyon
// yüzeyleri KORUNDU. Kaynak dosyalar üzerinden §19/§24 sözleşmesini doğrular (DB/migration
// YOK). FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const P = "app/api/beslenme/plans/[id]";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

console.log("Beslenme — Uzman Erişimi AŞAMA 2 (statik kontrat)\n");

// 1) Global /api/beslenme/plans POST owner-only (uzmana AÇILMADI).
const plansIdx = read("app/api/beslenme/plans/route.ts");
ok("global /plans owner-only (requireBeslenmeOwner)", /requireBeslenmeOwner\(req\)/.test(plansIdx));
ok("global /plans \"clients\"e açılmadı", !/requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(plansIdx));
ok("global /plans POST ortak createPlanForTenant kullanıyor", /createPlanForTenant\(/.test(plansIdx));

// 2/3) Client-scoped create POST.
const cPlans = read("app/api/beslenme/clients/[clientId]/plans/route.ts");
ok("client-scoped plans POST var (export async function POST)", /export async function POST/.test(cPlans));
ok("client-scoped POST requireBeslenmeClient kullanıyor", /requireBeslenmeClient\(/.test(cPlans));
ok("client-scoped POST createPlanForTenant + assign RPC + compensating delete", /createPlanForTenant\(/.test(cPlans) && /nutrition_plan_assign_client/.test(cPlans) && /\.delete\(\)/.test(cPlans));
ok("client-scoped POST demo reddi (denyDemoMutation)", /denyDemoMutation\(/.test(cPlans));
ok("client-scoped POST body'den tenant/client/user KABUL ETMİYOR", !/body\.(tenant_id|client_id|user_id)/.test(cPlans));

// 4/5) Plan access helper zinciri + expert unbound fail-closed.
const guard = read("lib/beslenme/clientPlanGuard.ts");
ok("plan-guard requireModuleAccess(\"clients\")", /requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(guard));
ok("plan-guard nutrition_plan_clients binding çözüyor", /nutrition_plan_clients/.test(guard));
ok("plan-guard requireClientInTenant ile tekrar doğruluyor", /requireClientInTenant\(/.test(guard));
ok("plan-guard requireMainAdmin ile owner ayırımı", /requireMainAdmin\(/.test(guard));
ok("plan-guard EXPERT unbound plan → fail-closed", /if \(!boundClientId\)/.test(guard) && /PLAN_NOT_FOUND/.test(guard));

// 6) Editör plan route'ları yeni bound-plan guard'ı kullanıyor (örneklem + tam liste).
const PLAN_ACCESS_ROUTES = [
  `${P}/route.ts`, `${P}/range/route.ts`, `${P}/days/[dayId]/route.ts`,
  `${P}/days/[dayId]/clear/route.ts`, `${P}/days/[dayId]/copy/route.ts`, `${P}/days/[dayId]/meals/route.ts`,
  `${P}/meals/[mealId]/route.ts`, `${P}/meals/reorder/route.ts`, `${P}/meals/[mealId]/copy/route.ts`,
  `${P}/meals/[mealId]/items/route.ts`, `${P}/items/[itemId]/route.ts`, `${P}/items/[itemId]/copy/route.ts`,
  `${P}/items/[itemId]/alternatives/route.ts`, `${P}/analytics/route.ts`, `${P}/word/route.ts`,
];
for (const r of PLAN_ACCESS_ROUTES) {
  ok(`bound-plan guard: ${r.replace(P + "/", "")}`, /requireBeslenmePlanAccess\(req,/.test(read(r)));
}

// 7) Nested day/meal/item scope kontrolleri HÂLÂ mevcut (guard bunların yerine geçmez).
ok("planEngine getDayScope/getMealScope/getItemScope export ediyor",
   /export async function getDayScope/.test(read("lib/beslenme/planEngine.ts")) &&
   /export async function getMealScope/.test(read("lib/beslenme/planEngine.ts")) &&
   /export async function getItemScope/.test(read("lib/beslenme/planEngine.ts")));
ok("item route hâlâ getItemScope ile nested scope doğruluyor", /getItemScope\(/.test(read(`${P}/items/[itemId]/route.ts`)));
ok("meal route hâlâ getMealScope ile nested scope doğruluyor", /getMealScope\(/.test(read(`${P}/meals/[mealId]/route.ts`)));

// 8) assign-client POST expert'e AÇILMADI (GET plan-access, POST owner-only).
const assign = read(`${P}/assign-client/route.ts`);
ok("assign-client GET plan-access ile açık", /requireBeslenmePlanAccess\(req,/.test(assign));
ok("assign-client POST owner-only kaldı (requireBeslenmeOwner)", /requireBeslenmeOwner\(req\)/.test(assign));

// 9/10) Global liste + hub owner-only.
ok("/beslenme/planlar (global liste) owner-only", /useBeslenmeOwnerGuard\(\)/.test(read("app/beslenme/planlar/page.tsx")));
ok("/beslenme (hub) owner-only", /useBeslenmeOwnerGuard\(\)/.test(read("app/beslenme/page.tsx")));

// 11/12/13) Food read split + mutation contributor + SYSTEM write koruması.
const foods = read("app/api/beslenme/foods/route.ts");
ok("foods GET read-split (requireBeslenmeFoodRead)", /export async function GET[\s\S]{0,120}requireBeslenmeFoodRead\(/.test(foods));
ok("foods POST hâlâ contributor", /export async function POST[\s\S]{0,120}requireBeslenmeFoodContributor\(/.test(foods));
const foodsId = read("app/api/beslenme/foods/[id]/route.ts");
ok("foods/[id] GET read-split", /export async function GET[\s\S]{0,120}requireBeslenmeFoodRead\(/.test(foodsId));
ok("foods/[id] PATCH+DELETE hâlâ contributor", (foodsId.match(/requireBeslenmeFoodContributor\(/g) || []).length >= 2);
ok("SYSTEM besin yazma koruması (resolveFoodForWrite SYSTEM_READONLY)", /SYSTEM_READONLY/.test(read("lib/beslenme/foodEngine.ts")));

// 14) traditional/sources owner-only.
ok("foods/[id]/traditional owner-only", /requireBeslenmeOwner\(/.test(read("app/api/beslenme/foods/[id]/traditional/route.ts")));
ok("foods/[id]/sources owner-only", /requireBeslenmeOwner\(/.test(read("app/api/beslenme/foods/[id]/sources/route.ts")));

// 15) QuickAdd manual-food capability'ye bağlı.
ok("FoodPicker quick-add checkBeslenmeFoodAccess ile gated", /checkBeslenmeFoodAccess/.test(read("app/beslenme/planlar/_components/FoodPickerDialog.tsx")));

// 16) Templates owner-only + editörde uzmanda gizli.
ok("templates route owner-only", /requireBeslenmeOwner\(/.test(read("app/api/beslenme/templates/route.ts")));
ok("PlanTools şablon butonları uzmanda gizli (isExpert)", /isExpert/.test(read("app/beslenme/planlar/_components/PlanTools.tsx")));
ok("MealCard 'Öğünü Şablonla' uzmanda gizli (useEditorCaps)", /useEditorCaps/.test(read("app/beslenme/planlar/_components/MealCard.tsx")));

// 17) FAZ 1 client route'ları hâlâ clients-scoped.
ok("FAZ1 client profile route hâlâ requireBeslenmeClient", /requireBeslenmeClient\(/.test(read("app/api/beslenme/clients/[clientId]/profile/route.ts")));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
process.exit(fail === 0 ? 0 : 1);
