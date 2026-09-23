/**
 * Beslenme — Manuel Besin EK harness (SAF; DB'ye BAĞLANMAZ). Kapsam:
 *   A. Enerji KAPSAMI (energyCoverage): bilinen vs BİLİNMEYEN(girilmemiş) vs GERÇEK 0 ayrımı,
 *      eksik-veri sayımı, grams=0 hariç, karışık öğün/gün toplamı; "bilinen korunur, bilinmeyen
 *      0 gibi gösterilmez" (§3).
 *   B. Yetki POLİTİKASI (decideFoodContributorAuthority / hasManualFoodFlag): owner + dar bayraklı
 *      uzman geçer; bayraksız uzman/anon reddedilir; body ile bayrak/tenant sahtekârlığı işe yaramaz
 *      (bayrak yalnız doğrulanmış module_permissions'tan; tenant server-side) (§4/§5).
 *   C. Ek buildQuickAddFood sözleşmeleri (trim, çok-nutrient, açıklama).
 */
import { buildQuickAddFood, type NutrientRefLite, type UnitRefLite } from "@/lib/beslenme/quickAddFood";
import { isUnitAllowedForCategory } from "@/lib/beslenme/contracts";
import { energyCoverage, sumNutrients, energyOf, type ItemNutrientSnapshot } from "@/lib/beslenme/planContracts";
import {
  decideFoodContributorAuthority,
  hasManualFoodFlag,
  BESLENME_MANUAL_FOOD_FLAG,
} from "@/lib/beslenme/foodContributorPolicy";

let pass = 0, fail = 0; const fails: string[] = [];
const chk = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; fails.push(name); console.log(`  FAIL  ${name}`); } };

// ── helpers ──
const en = (amount: number): ItemNutrientSnapshot => ({ nutrient_code: "energy", amount, unit_code: "kcal" });
const pr = (amount: number): ItemNutrientSnapshot => ({ nutrient_code: "protein", amount, unit_code: "g" });

// ════════════════════════════════════════════════════════════════════
console.log("── A. ENERJİ KAPSAMI (bilinen vs girilmemiş vs gerçek 0) ──");

// A1 tüm kcal biliniyor → missingCount 0, known = ham toplam
{
  const items = [{ grams: 100, nutrients: [en(250)] }, { grams: 200, nutrients: [en(100)] }];
  const cov = energyCoverage(items);
  chk("A1 tüm bilinen → missingCount=0", cov.missingCount === 0);
  chk("A1 known = 250 + 200 = 450", cov.known === 450);
}

// A2 bir besinin kcal'ı EKSİK (energy satırı yok) → missingCount=1, known yalnız bileneni toplar
{
  const items = [
    { grams: 100, nutrients: [en(250)] },              // bilinen 250
    { grams: 150, nutrients: [pr(10)] },               // enerji YOK (girilmemiş) — protein var
  ];
  const cov = energyCoverage(items);
  chk("A2 eksik enerji → missingCount=1", cov.missingCount === 1);
  chk("A2 known yalnız bilineni toplar (250)", cov.known === 250);
  chk("A2 bilinmeyen 0 gibi EKLENMEZ", cov.known !== 250 ? false : true);
}

// A3 GERÇEK 0 (energy satırı var, amount=0) → bilinmiyor SAYILMAZ; missingCount=0, known=0 katkı
{
  const items = [{ grams: 100, nutrients: [en(0)] }, { grams: 100, nutrients: [en(90)] }];
  const cov = energyCoverage(items);
  chk("A3 gerçek 0 → missingCount=0 (bilinmiyor değil)", cov.missingCount === 0);
  chk("A3 known = 0 + 90 = 90", cov.known === 90);
}

// A4 grams=0 + enerji yok → katkı vermez → missingCount'a SAYILMAZ
{
  const items = [{ grams: 0, nutrients: [pr(5)] }, { grams: 100, nutrients: [en(120)] }];
  const cov = energyCoverage(items);
  chk("A4 grams=0 eksik-enerji → missingCount=0", cov.missingCount === 0);
  chk("A4 known = 120", cov.known === 120);
}

// A5 karışık gün: 2 bilinen + 2 eksik → known toplanır, missingCount=2
{
  const items = [
    { grams: 100, nutrients: [en(200)] },
    { grams: 100, nutrients: [en(300)] },
    { grams: 100, nutrients: [pr(5)] },   // eksik
    { grams: 50, nutrients: [] },          // eksik (hiç değer yok)
  ];
  const cov = energyCoverage(items);
  chk("A5 known = 500", cov.known === 500);
  chk("A5 missingCount=2", cov.missingCount === 2);
}

// A6 sumNutrients + energyCoverage: tutarlılık — bilinen kısım energyOf ile aynı
{
  const items = [{ grams: 100, nutrients: [en(250)] }, { grams: 100, nutrients: [pr(5)] }];
  const totals = sumNutrients(items);
  const cov = energyCoverage(items);
  chk("A6 energyOf(totals) === cov.known (bilinen kısım)", energyOf(totals) === cov.known && cov.known === 250);
  chk("A6 ama cov.missingCount>0 → toplam EKSİK işaretlenir", cov.missingCount === 1);
}

// A7 boş liste → {0,0}
{
  const cov = energyCoverage([]);
  chk("A7 boş → known=0, missingCount=0", cov.known === 0 && cov.missingCount === 0);
}

// ════════════════════════════════════════════════════════════════════
console.log("── B. YETKİ POLİTİKASI (owner + dar bayraklı uzman) ──");

// B1 owner (super-admin) → 'owner' (module_permissions ne olursa olsun)
chk("B1 owner → 'owner'", decideFoodContributorAuthority(true, null) === "owner");
chk("B1 owner (perms boş) → 'owner'", decideFoodContributorAuthority(true, {}) === "owner");

// B2 uzman + dar bayrak açık → 'expert'
chk("B2 flag=true → 'expert'", decideFoodContributorAuthority(false, { [BESLENME_MANUAL_FOOD_FLAG]: true }) === "expert");

// B3 uzman bayraksız → null (403)
chk("B3 flag yok → null", decideFoodContributorAuthority(false, {}) === null);
chk("B3 perms null → null", decideFoodContributorAuthority(false, null) === null);
chk("B3 flag=false → null", decideFoodContributorAuthority(false, { [BESLENME_MANUAL_FOOD_FLAG]: false }) === null);

// B4 bayrak yalnız BOOLEAN true kabul edilir (truthy string/1 SAHTEKÂRLIĞI işe yaramaz)
chk("B4 flag='true' (string) → null", decideFoodContributorAuthority(false, { [BESLENME_MANUAL_FOOD_FLAG]: "true" }) === null);
chk("B4 flag=1 (number) → null", decideFoodContributorAuthority(false, { [BESLENME_MANUAL_FOOD_FLAG]: 1 }) === null);
chk("B4 hasManualFoodFlag(true) === true", hasManualFoodFlag({ [BESLENME_MANUAL_FOOD_FLAG]: true }) === true);
chk("B4 hasManualFoodFlag(1) === false", hasManualFoodFlag({ [BESLENME_MANUAL_FOOD_FLAG]: 1 }) === false);

// B5 ALAKASIZ modül bayrağı besin-katkı yetkisi VERMEZ (dar bayrak izolasyonu)
chk("B5 başka modül flag'i → null", decideFoodContributorAuthority(false, { stones: true, numerology: true }) === null);

// B6 array/garbage perms → güvenli false
chk("B6 array perms → null", decideFoodContributorAuthority(false, [BESLENME_MANUAL_FOOD_FLAG]) === null);
chk("B6 string perms → null", decideFoodContributorAuthority(false, "beslenme_manual_food") === null);

// ════════════════════════════════════════════════════════════════════
console.log("── C. Ek buildQuickAddFood sözleşmeleri ──");

const T = "11111111-1111-4111-8111-111111111111";
const nutrientDict = new Map<string, NutrientRefLite>([
  ["energy", { id: "n-en", code: "energy", category: "energy" }],
  ["protein", { id: "n-pr", code: "protein", category: "macronutrient" }],
]);
const unitDict = new Map<string, UnitRefLite>([
  ["kcal", { id: "u-kcal", code: "kcal", unit_type: "energy" }],
  ["g", { id: "u-g", code: "g", unit_type: "mass" }],
]);
const ctx = { tenantId: T, nutrientDict, unitDict, isUnitAllowedForCategory };
const build = (input: Record<string, unknown>) => buildQuickAddFood(input, ctx);

// C1 ad trimlenir
{
  const r = build({ name_tr: "  Ev Yoğurdu  " });
  chk("C1 ad trimlenir", r.ok === true && r.ok && r.foodInsert.name_tr === "Ev Yoğurdu");
}

// C2 yalnız-boşluk ad → NAME_REQUIRED
chk("C2 boşluk ad → NAME_REQUIRED", (() => { const r = build({ name_tr: "   " }); return !r.ok && r.code === "NAME_REQUIRED"; })());

// C3 çok fazla nutrient (>60) → TOO_MANY
{
  const many = Array.from({ length: 61 }, () => ({ nutrient_code: "protein", amount: 1, unit_code: "g" }));
  const r = build({ name_tr: "X", nutrients: many });
  chk("C3 >60 nutrient → TOO_MANY", !r.ok && r.code === "TOO_MANY");
}

// C4 açıklama korunur (kaynak notu); is_active=true default
{
  const r = build({ name_tr: "X", description: "Ürün etiketi: 2026" });
  chk("C4 açıklama korunur", r.ok === true && r.ok && r.foodInsert.description === "Ürün etiketi: 2026");
  chk("C4 is_active=true default", r.ok === true && r.ok && r.foodInsert.is_active === true);
}

// C5 nutrients null (alan hiç yollanmadı) → satır yok, ok
{
  const r = build({ name_tr: "X", nutrients: null });
  chk("C5 nutrients null → ok, 0 satır", r.ok === true && r.ok && r.nutrientRows.length === 0);
}

console.log(`\n${"=".repeat(52)}\n  MANUEL BESİN EK HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("  FAILURES:\n   - " + fails.join("\n   - ")); process.exit(1); }
console.log("  ✅ Kapsam + yetki + ek sözleşmeler GEÇTİ"); process.exit(0);
