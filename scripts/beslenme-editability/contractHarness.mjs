// ============================================================
// Beslenme — Düzenlenebilirlik / Sil / Reset / Analiz / Word SÖZLEŞME harness'i.
//   [1] 4 haneli challenge çekirdeği (kod biçimi, kapsam özeti, kod özeti, hata eşlemesi)
//   [2] TS effective eşlemesi ↔ SQL nutrition_food_resolve_effective PARİTE (PGlite)
//   [3] Sunucu güvenlik sözleşmeleri (auth/modül/demo/tenant/allowlist/challenge sırası)
//   [4] Arşiv ürünü kaldırıldı (UI metni + yeni arşiv durumu üretilmez) + legacy state kapıları
//   [5] Tek kayıt silme onayları (Vazgeç'li ortak dialog) + toplu işlemde 3 aşama
//   [6] "Ortak (Sistem)" / teknik sahiplik etiketi uzman UI'ında YOK; sistem besini düzenlenebilir
//   [7] Veri bütünlüğü: porsiyon quantity/id + source_id koruması + atomik RPC kullanımı
//   [8] Analiz modalı: portal + geniş + mobil tam ekran + tek scroll
//   [9] Word: eksik enerji 0 kcal DEĞİL ("Kalori girilmemiş" / "≥ … eksik") — gerçek DOCX
// Çalıştırma: npx tsx scripts/beslenme-editability/contractHarness.mjs   FAIL → exit 1.
// ============================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { bootstrapNutritionDb, ROOT } from "./pgBootstrap.mjs";
import {
  generateChallengeCode, isWellFormedCode, challengeScopeHash, challengeCodeHash, mapConsumeOutcome, CHALLENGE_TTL_MS,
} from "../../lib/beslenme/challengeCore.ts";
import { computeEffectiveMap, sameNutrientSet } from "../../lib/beslenme/effectiveCore.ts";
import { buildPlanDocxFromTree } from "../../lib/beslenme/word/planDocxBuilder.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };
const src = (p) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
// Yorum satırlarını at (kullanıcıya görünen metin kontrolü için).
const code = (p) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

console.log("\n[1] challenge çekirdeği");
const codes = Array.from({ length: 2000 }, () => generateChallengeCode());
ok("kod daima tam 4 rakam", codes.every((c) => /^[0-9]{4}$/.test(c)));
ok("kod dağılımı rastgele (2000 örnekte ≥ 1500 farklı)", new Set(codes).size >= 1500, String(new Set(codes).size));
ok("baştaki sıfır korunur (0000–0999 üretilebilir)", codes.some((c) => c.startsWith("0")));
ok("isWellFormedCode: '12a4' / '123' / 1234(sayı) reddedilir", !isWellFormedCode("12a4") && !isWellFormedCode("123") && !isWellFormedCode(1234) && isWellFormedCode("0042"));
ok("kapsam özeti sıradan bağımsız", challengeScopeHash("food_reset_all", ["b", "a"]) === challengeScopeHash("food_reset_all", ["a", "b"]));
ok("kapsam özeti tek kayıt değişince değişir", challengeScopeHash("food_reset_all", ["a", "b"]) !== challengeScopeHash("food_reset_all", ["a", "c"]));
ok("kapsam özeti işlem türüne bağlı", challengeScopeHash("food_reset_all", ["a"]) !== challengeScopeHash("food_reset_one", ["a"]));
ok("kod özeti challenge id'ye bağlı", challengeCodeHash("id1", "1234") !== challengeCodeHash("id2", "1234"));
ok("özetler 64 hex (DB CHECK ile uyumlu)", /^[0-9a-f]{64}$/.test(challengeScopeHash("plan_day_clear", ["x"])) && /^[0-9a-f]{64}$/.test(challengeCodeHash("i", "0000")));
ok("TTL 5 dakika", CHALLENGE_TTL_MS === 300000);
ok("tüketim eşlemesi: ok→null, diğerleri hata", mapConsumeOutcome("ok") === null && ["invalid_code", "expired", "used", "locked", "scope_changed", "not_found"].every((o) => mapConsumeOutcome(o)?.code?.startsWith("CHALLENGE_")));

console.log("\n[2] effective eşleme TS ↔ SQL parite (PGlite)");
const SYS = "00000000-0000-4000-8000-000000000001";
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const { db } = await bootstrapNutritionDb();
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0];
const all = async (sql, p = []) => (await db.query(sql, p)).rows;
const sysIds = [];
for (let i = 0; i < 12; i++) sysIds.push((await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,$2) RETURNING id`, [SYS, `S${i}`])).id);
const aOwn = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'A özgün') RETURNING id`, [A])).id;
const bOwn = (await one(`INSERT INTO nutrition_foods (tenant_id, name_tr) VALUES ($1,'B özgün') RETURNING id`, [B])).id;
for (const i of [0, 3, 7]) await one(`SELECT nutrition_food_fork_system($1,$2,$3)`, [A, SYS, sysIds[i]]);
for (const i of [1, 5]) await db.query(`INSERT INTO nutrition_food_tenant_hidden (tenant_id, food_id) VALUES ($1,$2)`, [A, sysIds[i]]);
for (const i of [3]) await one(`SELECT nutrition_food_fork_system($1,$2,$3)`, [B, SYS, sysIds[i]]);
const requested = [...sysIds, aOwn, bOwn, "99999999-9999-4999-8999-999999999999"];
for (const T of [A, B]) {
  const rows = await all(`SELECT id, tenant_id, name_tr, origin_food_id FROM nutrition_foods WHERE tenant_id IN ($1,$2) AND id = ANY($3::uuid[])`, [T, SYS, requested]);
  const forks = await all(`SELECT id, tenant_id, name_tr, origin_food_id FROM nutrition_foods WHERE tenant_id=$1 AND origin_food_id = ANY($2::uuid[])`, [T, requested]);
  const hidden = (await all(`SELECT food_id FROM nutrition_food_tenant_hidden WHERE tenant_id=$1`, [T])).map((r) => r.food_id);
  const ts = computeEffectiveMap({ tenantId: T, systemTenantId: SYS, requestedIds: requested, rows, forks, hiddenIds: hidden });
  let mismatch = 0;
  for (const id of requested) {
    const sql = await one(`SELECT id FROM nutrition_food_resolve_effective($1,$2,$3)`, [T, SYS, id]);
    if ((sql?.id ?? null) !== (ts.get(id)?.id ?? null)) mismatch++;
  }
  ok(`tenant ${T === A ? "A" : "B"}: ${requested.length} id için TS == SQL`, mismatch === 0, `${mismatch} fark`);
}
ok("sameNutrientSet: sıra bağımsız + miktar farkını yakalar",
  sameNutrientSet([{ nutrient_code: "energy", amount: 46, unit_code: "kcal" }, { nutrient_code: "protein", amount: 1, unit_code: "g" }],
    [{ nutrient_code: "protein", amount: 1, unit_code: "g" }, { nutrient_code: "energy", amount: 46, unit_code: "kcal" }])
  && !sameNutrientSet([{ nutrient_code: "energy", amount: 46, unit_code: "kcal" }], [{ nutrient_code: "energy", amount: 52, unit_code: "kcal" }]));

console.log("\n[3] sunucu güvenlik sözleşmeleri");
const R = {
  foodDetail: src("app/api/beslenme/foods/[id]/route.ts"),
  nutrients: src("app/api/beslenme/foods/[id]/nutrients/route.ts"),
  portions: src("app/api/beslenme/foods/[id]/portions/route.ts"),
  traditional: src("app/api/beslenme/foods/[id]/traditional/route.ts"),
  foodSources: src("app/api/beslenme/foods/[id]/sources/route.ts"),
  resetCh: src("app/api/beslenme/foods/reset/challenge/route.ts"),
  reset: src("app/api/beslenme/foods/reset/route.ts"),
  clear: src("app/api/beslenme/plans/[id]/days/[dayId]/clear/route.ts"),
  clearCh: src("app/api/beslenme/plans/[id]/days/[dayId]/clear/challenge/route.ts"),
  refresh: src("app/api/beslenme/plans/[id]/refresh-snapshots/route.ts"),
  recent: src("app/api/beslenme/foods/recent/route.ts"),
  foodEngine: src("lib/beslenme/foodEngine.ts"),
  challenge: src("lib/beslenme/destructiveChallenge.ts"),
};
const writeRoutes = ["foodDetail", "nutrients", "portions", "traditional", "foodSources", "resetCh", "reset"];
for (const k of writeRoutes) ok(`${k}: requireBeslenmeModule + denyDemoMutation`, /requireBeslenmeModule\(req\)/.test(R[k]) && /denyDemoMutation\(guard\)/.test(R[k]));
for (const k of ["clear", "clearCh", "refresh"]) ok(`${k}: requireBeslenmePlanAccess + denyDemoMutation`, /requireBeslenmePlanAccess\(/.test(R[k]) && /denyDemoMutation\(guard\)/.test(R[k]));
const allSrc = Object.values(R).join("\n");
ok("hiçbir yeni route tenant_id'yi body/query'den okumaz", !/body\.tenant_id|searchParams\.get\("tenant/.test(allSrc));
ok("reset: challenge TÜKETİLMEDEN reset RPC çağrılmaz", R.reset.indexOf("consumeDestructiveChallenge") > 0 && R.reset.indexOf("consumeDestructiveChallenge") < R.reset.indexOf("nutrition_food_reset_personalized"));
ok("reset: kapsam onay anında SUNUCUDA yeniden hesaplanır", (R.reset.match(/computeFoodResetScope\(/g) || []).length >= 1);
ok("clear: challenge TÜKETİLMEDEN öğün silinmez + yalnız onaylı öğünler (.in id)", R.clear.indexOf("consumeDestructiveChallenge") < R.clear.indexOf(`.from("nutrition_plan_meals")`) && /\.in\("id", clear\.mealIds\)/.test(R.clear));
ok("challenge: kullanıcı+tenant+işlem+kapsam+kod RPC'ye verilir", /p_user_id: args\.userId/.test(R.challenge) && /p_tenant_id: args\.tenantId/.test(R.challenge) && /p_scope_hash:/.test(R.challenge) && /p_code_hash:/.test(R.challenge));
ok("challenge: kodun kendisi DB'ye yazılmaz (yalnız özet)", !/code: code|code_hash: code\b/.test(R.challenge) && /code_hash: challengeCodeHash\(/.test(R.challenge));
ok("write kapısı gövde doğrulamasından SONRA (geçersiz istek kopya üretmez) — PATCH/PUT",
  ["foodDetail", "nutrients", "portions", "traditional"].every((k) => R[k].indexOf("hasOnlyKeys") < R[k].indexOf("resolveFoodForWrite(db, tenantId")));
ok("allowlist'lerde is_active YOK (yeni arşiv durumu üretilmez) — foods/topics/sources/templates",
  !/"is_active"/.test(R.foodDetail.split("UPDATE_KEYS")[1].split("] as const")[0])
  && !/"is_active"/.test(src("app/api/beslenme/topics/[id]/route.ts").split("UPDATE_KEYS = ")[1].split(";")[0])
  && !/"is_active"/.test(src("app/api/beslenme/sources/[id]/route.ts").split("UPDATE_KEYS = [")[1].split("]")[0])
  && !/"is_active"/.test(src("lib/beslenme/templateContracts.ts").split("TEMPLATE_PATCH_KEYS = ")[1].split(";")[0]));
ok("plan PATCH status='archived' reddedilir", /body\.status === "archived"/.test(src("app/api/beslenme/plans/[id]/route.ts")));
ok("/foods/recent tenant ∪ SYSTEM effective (tenant filtresiz .in('id') YOK)", /resolveEffectiveFoodsBatch/.test(R.recent) && !/from\("nutrition_foods"\)[\s\S]{0,80}\.in\("id", foodIds\)/.test(R.recent));
ok("SQL: sistem satırına uzman UPDATE yolu yok (fork RPC yalnız INSERT)", !/UPDATE public\.nutrition_foods/.test(src("supabase/migrations/20270201000100_nutrition_food_personalization.sql")));

console.log("\n[4] arşiv ürünü kaldırıldı + legacy state kapıları");
const uiFiles = [
  "app/beslenme/_components/BesinYonetimiScreen.tsx", "app/beslenme/_components/TopicDetailEditor.tsx",
  "app/beslenme/_components/SourcesPanel.tsx", "app/beslenme/_components/FoodNutrition.tsx",
  "app/beslenme/planlar/page.tsx", "app/beslenme/planlar/[id]/page.tsx", "app/beslenme/sablonlar/page.tsx",
  "app/beslenme/planlar/_components/PlanTools.tsx", "app/beslenme/planlar/_components/DayEditor.tsx",
  "app/beslenme/planlar/_components/planFormat.ts", "app/beslenme/rehber/page.tsx", "app/beslenme/_components/ProfileTopicPage.tsx",
];
const archiveHits = uiFiles.filter((f) => /Arşiv|arşivle|Arşivle|Geri Yükle/.test(code(f)));
ok("Beslenme UI'ında kullanıcıya görünen 'Arşiv/Arşivle/Geri Yükle' yok", archiveHits.length === 0, archiveHits.join(", "));
ok("plan listesinde 'Arşiv' filtresi yok", !/value: "archived"/.test(src("app/beslenme/planlar/page.tsx")));
ok("UI arşiv PATCH'i (status:'archived' / is_active:false) göndermez", uiFiles.every((f) => !/status: "archived"|is_active: false/.test(code(f))));
const topicSub = ["sections/route.ts", "sections/[sectionId]/route.ts", "foods/route.ts", "foods/[relId]/route.ts", "sources/route.ts", "sources/[linkId]/route.ts"];
ok("legacy pasif rehber: tüm alt kayıt route'ları isActiveTopicInTenant kapısında", topicSub.every((f) => /isActiveTopicInTenant\(db, tenantId, topicId\)/.test(src(`app/api/beslenme/topics/[id]/${f}`))));
ok("legacy pasif şablon: apply/duplicate/PATCH activeOnly", ["apply/route.ts", "duplicate/route.ts", "route.ts"].every((f) => /activeOnly: true/.test(src(`app/api/beslenme/templates/[id]/${f}`))));
ok("legacy arşiv plandan revizyon açılamaz (isPlanEditable)", /isPlanEditable\(guard\.plan\.status\)/.test(src("app/api/beslenme/plans/[id]/revise/route.ts")));
ok("rehber DELETE gerçek silme (arşiv dalı yok)", !/is_active: false/.test(src("app/api/beslenme/topics/[id]/route.ts")));
ok("besin DELETE gerçek Sil (nutrition_food_remove; arşiv dalı yok)", /nutrition_food_remove/.test(R.foodDetail) && !/is_active: false/.test(R.foodDetail));

console.log("\n[5] silme onayları + toplu işlem 3 aşama");
const confirmFiles = {
  "besin Sil": "app/beslenme/_components/BesinYonetimiScreen.tsx",
  "rehber/bölüm/besin-bağı Sil": "app/beslenme/_components/TopicDetailEditor.tsx",
  "kaynak Sil + bağ kaldır": "app/beslenme/_components/SourcesPanel.tsx",
  "plan Sil (liste)": "app/beslenme/planlar/page.tsx",
  "plan Sil (detay)": "app/beslenme/planlar/[id]/page.tsx",
  "şablon Sil": "app/beslenme/sablonlar/page.tsx",
  "plan kalemi Sil": "app/beslenme/planlar/_components/MealCard.tsx",
  "danışan ölçüm/tercih Sil": "app/dashboard/clients/[id]/components/BeslenmeTab.tsx",
};
for (const [n, f] of Object.entries(confirmFiles)) {
  const s = src(f);
  ok(`${n}: onay (useDeleteConfirm) + onaysız DELETE yok`, /useDeleteConfirm\(\)/.test(s) && /if \(!ok\) return;/.test(s));
}
ok("TopicDetailEditor: 3 ayrı silme yolunda onay (rehber + bölüm + besin bağı)", (src(confirmFiles["rehber/bölüm/besin-bağı Sil"]).match(/await deleteConfirm\(/g) || []).length >= 3);
const dlg = src("app/beslenme/_components/DestructiveChallengeDialog.tsx");
ok("3 aşama: Kapsam → Uyarı → Kod (ayrı adımlar)", /stage === 1/.test(dlg) && /stage === 2/.test(dlg) && /stage === 3/.test(dlg) && /setStage\(2\)/.test(dlg) && /setStage\(3\)/.test(dlg));
ok("son buton kod birebir eşleşmeden PASİF", /disabled=\{!codeMatches\}/.test(dlg) && /typed === info\.code/.test(dlg));
ok("ikinci uyarı 'geri alınamaz' metni", /Bu işlem geri alınamaz/.test(dlg));
ok("Günü Temizle → 3 aşamalı dialog + sunucu kodu", /DestructiveChallengeDialog/.test(src("app/beslenme/planlar/_components/DayEditor.tsx")) && /requestClearDayChallenge/.test(src("app/beslenme/planlar/_components/DayEditor.tsx")));
ok("Tek besin + tüm besinler reset → 3 aşamalı dialog", (src("app/beslenme/_components/BesinYonetimiScreen.tsx").match(/<DestructiveChallengeDialog/g) || []).length === 2);
ok("Sil ≠ Sistem değerine dön (ayrı buton/ayrı akış)", /Sistem Değerine Dön/.test(src("app/beslenme/_components/BesinYonetimiScreen.tsx")) && /deleteFood\(effectiveId\)/.test(src("app/beslenme/_components/BesinYonetimiScreen.tsx")));

console.log("\n[6] teknik sahiplik etiketi yok + sistem besini düzenlenebilir");
const ownerLabelFiles = ["app/beslenme/_components/BesinYonetimiScreen.tsx", "app/beslenme/planlar/_components/FoodPickerDialog.tsx", "app/beslenme/_components/FoodNutrition.tsx"];
ok("'Ortak (Sistem)' / 'Sistem' / 'Özel' rozeti uzman UI'ında yok", ownerLabelFiles.every((f) => !/Ortak \(Sistem\)|"Sistem"|>\s*Özel\s*<|"Özel"/.test(code(f))));
ok("FoodNutrition: isSystem ile düzenleme kilidi YOK", !/isSystem/.test(code("app/beslenme/_components/FoodNutrition.tsx")));
ok("BesinYonetimiScreen: sistem besininde 'salt-okunur' mesajı yok; Kaydet her zaman", !/salt-okunur/.test(code("app/beslenme/_components/BesinYonetimiScreen.tsx")));
const nf = src("lib/beslenme/nutrientFields.ts");
ok("20 besin öğesinin tamamı düzenlenebilir alan listesinde", ["energy","protein","carbohydrate","total_fat","saturated_fat","fiber","sugar","sodium","potassium","calcium","iron","magnesium","zinc","vitamin_a","vitamin_c","vitamin_d","vitamin_b12","folate","epa","dha"].every((c) => nf.includes(`"${c}"`)));
const nutrientSeed = src("supabase/migrations/20261228000600_nutrition_class_a_seed.sql").split("INSERT INTO public.nutrition_nutrients")[1].split("INSERT INTO")[0];
const seedCodes = [...nutrientSeed.matchAll(/^\s*\('([a-z0-9_]+)',\s+'[^']*',\s+'[^']*',\s+'\{/gm)].map((m) => m[1]);
ok("alan listesi Class A nutrient sözlüğünün tamamını kapsar", seedCodes.length === 20 && seedCodes.every((c) => nf.includes(`"${c}"`)), seedCodes.join(","));

console.log("\n[7] veri bütünlüğü (quantity / source_id / atomik)");
const fn = src("app/beslenme/_components/FoodNutrition.tsx");
ok("porsiyon kaydı id + quantity gönderir (1'e sıfırlanmaz)", /d\.id \? \{ id: d\.id \}/.test(fn) && /d\.quantity != null \? \{ quantity: d\.quantity \}/.test(fn));
ok("besin değeri/geleneksel kaydı source_id GÖNDERMEZ (sunucu korur)", !/source_id/.test(code("app/beslenme/_components/FoodNutrition.tsx")));
ok("nutrients/portions/traditional PUT atomik RPC (route'ta delete→insert YOK)",
  /nutrition_food_nutrients_replace/.test(R.nutrients) && !/\.delete\(\)/.test(R.nutrients)
  && /nutrition_food_portions_replace/.test(R.portions) && !/\.delete\(\)/.test(R.portions)
  && /nutrition_food_traditional_replace/.test(R.traditional) && !/\.delete\(\)/.test(R.traditional));
ok("route source_id'yi yalnız anahtar varsa yazar ('source_id' in it)", /"source_id" in it/.test(R.nutrients) && /"source_id" in body/.test(R.traditional));
ok("Oluştur ve Bağla tek istek (new_source) + başarısız bağda kaynak geri silinir", /new_source/.test(R.foodSources) && /Kompanzasyon/.test(src("lib/beslenme/sourceLink.ts")));
ok("UI Oluştur ve Bağla önce createSource ÇAĞIRMAZ (orphan yok)", !/createSource\(/.test(src("app/beslenme/_components/SourcesPanel.tsx")));

console.log("\n[8] Analiz modalı");
const ui = src("app/beslenme/planlar/_components/planUi.tsx");
const modalBody = ui.split("export function Modal(")[1].split("/* ── Kompakt aksiyon menüsü")[0];
ok("Modal document.body'e portal edilir", /createPortal\(/.test(modalBody) && /document\.body/.test(modalBody));
ok("Modal kartında iç scroll (max-h + overflow-y-auto) YOK → tek doğal scroll", !/max-h-\[92vh\]/.test(modalBody));
ok("Modal üst kırpma önlemi (min-h-full sarmalayıcı) + arka plan kaydırma kilidi", /min-h-full/.test(modalBody) && /document\.body\.style\.overflow = "hidden"/.test(modalBody));
const tools = src("app/beslenme/planlar/_components/PlanTools.tsx");
ok("Analiz geniş (sm:max-w-6xl) + mobil tam ekran", /maxWidthClass="sm:max-w-6xl"/.test(tools) && /fullScreenOnMobile/.test(tools));
ok("Analiz API'nin günlük dökümünü + haftalık makro/hedef farkını gösterir", /Günlük Döküm/.test(tools) && /w\.avgMacros/.test(tools) && /w\.delta/.test(tools));
ok("QuickAdd dialog da portal (modal içinden açıldığında kaymaz)", /createPortal\(/.test(src("app/beslenme/_components/QuickAddFoodDialog.tsx")));

console.log("\n[9] Word eksik enerji (gerçek DOCX)");
const tree = {
  plan: { id: "p", title: "Test Planı", note: null, start_date: "2026-10-01", end_date: "2026-10-01", daily_energy_target: 1800, status: "draft", revision_number: 1 },
  days: [{ id: "d", plan_date: "2026-10-01", energy_target_override: null, note: null, meals: [{ id: "m", meal_type: "breakfast", label: "Kahvaltı", sort_order: 0, items: [
    { id: "i1", food_name_snapshot: "Elma", quantity: null, portion_label_snapshot: null, grams: 100, sort_order: 0, nutrients: [{ nutrient_code: "energy", amount: 52, unit_code: "kcal" }] },
    { id: "i2", food_name_snapshot: "Bilinmeyen Kek", quantity: null, portion_label_snapshot: null, grams: 50, sort_order: 1, nutrients: [{ nutrient_code: "protein", amount: 5, unit_code: "g" }] },
  ] }] }],
};
const res = await buildPlanDocxFromTree(tree);
const xml = res.ok ? strFromU8(unzipSync(new Uint8Array(res.buffer))["word/document.xml"]) : "";
ok("DOCX üretildi", res.ok);
ok("enerjisi olmayan kalem 'Kalori girilmemiş' (0 kcal DEĞİL)", xml.includes("Kalori girilmemiş"));
ok("gün toplamı '≥ 52 kcal (1 kalemde enerji verisi eksik)'", xml.includes("≥ 52 kcal (1 kalemde enerji verisi eksik)"));
ok("özet: eksik kalem satırı", xml.includes("Enerji Verisi Eksik Kalem"));
const tree2 = JSON.parse(JSON.stringify(tree));
tree2.days[0].meals[0].items[1].nutrients.push({ nutrient_code: "energy", amount: 0, unit_code: "kcal" });
const res2 = await buildPlanDocxFromTree(tree2);
const xml2 = res2.ok ? strFromU8(unzipSync(new Uint8Array(res2.buffer))["word/document.xml"]) : "";
ok("gerçek 0 kcal (girilmiş) eksik sayılmaz", res2.ok && !xml2.includes("Kalori girilmemiş") && !xml2.includes("eksik"));

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
