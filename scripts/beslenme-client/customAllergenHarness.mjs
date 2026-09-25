// ============================================================
// Beslenme — Danışan "Diğer" (custom) alerjen STATİK route/tip/tüketici kontratı.
// Deterministik, env-siz, deps-siz (kaynak-regex). DB/behavior kontratı ayrıca
// behaviorHarness (PGlite) + ddlHarness'ta doğrulanır. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
let pass = 0, fail = 0; const failures = [];
const ok = (n, c) => (c ? pass++ : (fail++, failures.push(n)));

console.log("Beslenme — Custom Alerjen (Diğer) statik kontrat\n");

// 1) Allergens route — union + doğrulama.
const route = read("app/api/beslenme/clients/[clientId]/allergens/route.ts");
ok("route requireBeslenmeClient kullanıyor", /requireBeslenmeClient\(/.test(route));
ok("route PUT denyDemoMutation korunuyor", /denyDemoMutation\(/.test(route));
ok("GET select custom_label içeriyor", /select\([^)]*custom_label/.test(route));
ok("PUT item hasOnlyKeys allergen_id/custom_label/note", /hasOnlyKeys\(rec,\s*\[\s*["']allergen_id["'],\s*["']custom_label["'],\s*["']note["']\s*\]\)/.test(route));
ok("tam-olarak-biri: hasStd === hasCustom reddi", /hasStd === hasCustom/.test(route));
ok("custom trim + boş-değil kontrolü", /custom_label[\s\S]*\.trim\(\)/.test(route));
ok("custom max 120 → CUSTOM_TOO_LONG", /rawLabel\.length > 120/.test(route) && /CUSTOM_TOO_LONG/.test(route));
ok("custom case-insensitive dedup (toLowerCase)", /toLowerCase\(\)/.test(route) && /seenCustom/.test(route));
ok("vocab doğrulama YALNIZ standart id'ler (seenStd)", /seenStd\.size > 0/.test(route) && /nutrition_allergens/.test(route));
ok("MAX_ALLERGENS toplam sınırı (standart+custom)", /MAX_ALLERGENS = 30/.test(route) && /parsed\.length > MAX_ALLERGENS/.test(route));
ok("insert rows allergen_id + custom_label yazıyor", /allergen_id: p\.allergen_id, custom_label: p\.custom_label/.test(route));
ok("duplicate 23505 → CUSTOM_DUPLICATE 409", /"23505"/.test(route) && /CUSTOM_DUPLICATE/.test(route));
ok("body'den tenant/client/user KABUL ETMİYOR", !/body\.(tenant_id|client_id|user_id)/.test(route));
ok("tam-set replacement (delete → insert) korunuyor", /\.delete\(\)[\s\S]*\.insert\(/.test(route));

// 2) Client tipleri.
const types = read("lib/beslenme/clientTabClient.ts");
ok("ClientAllergen.allergen_id nullable + custom_label", /allergen_id: string \| null; custom_label: string \| null/.test(types));
ok("AllergenSetItem union (allergen_id | custom_label)", /AllergenSetItem =[\s\S]*allergen_id: string[\s\S]*custom_label: string/.test(types));
ok("PlanClientSummary.allergens custom_label alanı", /allergens: Array<\{ code: string \| null; name_tr: string \| null; name_en: string \| null; custom_label: string \| null \}>/.test(types));

// 3) Plan binding context (assign-client) custom_label taşıyor.
const assign = read("app/api/beslenme/plans/[id]/assign-client/route.ts");
ok("assign-client select custom_label", /select\("custom_label, nutrition_allergens/.test(assign));
ok("assign-client custom_label map (code null fallback)", /r\.custom_label/.test(assign) && /custom_label: r\.custom_label/.test(assign));

// 4) Plan editör context render custom_label gösterir.
const planCtx = read("app/beslenme/planlar/[id]/_components/PlanClientContext.tsx");
ok("PlanClientContext custom_label render", /a\.custom_label \|\|/.test(planCtx));

// 5) BeslenmeTab UI — "Diğer" + custom state.
const tab = read("app/dashboard/clients/[id]/components/BeslenmeTab.tsx");
ok("AllergensSection custom state (customs)", /const \[customs, setCustoms\]/.test(tab));
ok("'Diğer' butonu (allergens.other)", /allergens\.other/.test(tab));
ok("custom chip kaldırılabilir (removeCustom)", /removeCustom/.test(tab));
ok("save standart + custom birlikte PUT (AllergenSetItem)", /AllergenSetItem\[\]/.test(tab));
ok("standart+custom current'tan ayrıştırılıyor", /filter\(\(a\) => a\.allergen_id\)/.test(tab) && /filter\(\(a\) => a\.custom_label\)/.test(tab));

// 6) i18n anahtarları (tr + en).
const tr = read("messages/tr/beslenme.json");
const en = read("messages/en/beslenme.json");
for (const k of ["other", "customPlaceholder", "add", "cancel", "remove", "customTooLong"]) {
  ok(`i18n tr allergens.${k}`, new RegExp(`"${k}"\\s*:`).test(tr));
  ok(`i18n en allergens.${k}`, new RegExp(`"${k}"\\s*:`).test(en));
}

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
if (fail) { console.log("FAILURES:"); for (const f of failures) console.log("  - " + f); }
process.exit(fail === 0 ? 0 : 1);
