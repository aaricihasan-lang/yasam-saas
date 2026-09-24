// ============================================================
// Beslenme — Uzman Erişimi AŞAMA 1 STATİK erişim-kontratı harness'i.
//
// FAZ 1 yalnız app-layer auth + dar reference endpoint + UI capability değişikliğidir
// (DB/migration YOK). Bu harness kaynak dosyalar üzerinden §17-A davranış sözleşmesini
// doğrular: danışan-scoped route'lar "clients" yetkisine açıldı; owner-only global
// yüzeyler (requireBeslenmeOwner, geniş /reference, plan/food route'ları) DEĞİŞMEDİ.
// FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const has = (p) => existsSync(join(ROOT, p));

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n} ${e}`); } };

console.log("Beslenme — Uzman Erişimi AŞAMA 1 (statik kontrat)\n");

// 1) Client-scoped guard artık "clients" yetkisi kullanıyor, owner'a bağlı değil.
const guard = read("lib/beslenme/clientRouteGuard.ts");
ok("clientRouteGuard requireModuleAccess(req, \"clients\") kullanıyor", /requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(guard));
// Gerçek çağrı `requireBeslenmeOwner(req...)` biçimindedir; JSDoc prose'undaki
// "requireBeslenmeOwner (super-admin)" (boşluklu) sayılmaz. import da olmamalı.
ok("clientRouteGuard artık requireBeslenmeOwner çağırmıyor/import etmiyor",
   !/requireBeslenmeOwner\(req/.test(guard) && !/import[^;]*requireBeslenmeOwner[^;]*ownerGuard/.test(guard));
ok("clientRouteGuard hâlâ requireClientInTenant ile tenant-ownership doğruluyor", /requireClientInTenant\(/.test(guard));
ok("clientRouteGuard tenant/client kimliği body'den değil (guard.tenantId + path clientId)", /guard\.tenantId/.test(guard) && !/body\.(tenant|client)/.test(guard));

// 2) Geniş /api/beslenme/reference DEĞİŞMEDİ ve uzmanlara açılmadı.
const ref = read("app/api/beslenme/reference/route.ts");
ok("geniş /reference hâlâ requireBeslenmeFoodContributor ile korunuyor", /requireBeslenmeFoodContributor\(/.test(ref));
ok("geniş /reference \"clients\" yetkisine açılmadı", !/requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(ref));
ok("geniş /reference hâlâ foodGroups + frameworks döndürüyor", /foodGroups/.test(ref) && /frameworks/.test(ref));

// 3) Yeni dar /api/beslenme/client-reference: "clients" + YALNIZ allergens + salt-okuma.
const CR = "app/api/beslenme/client-reference/route.ts";
ok("client-reference endpoint mevcut", has(CR));
if (has(CR)) {
  const cr = read(CR);
  ok("client-reference requireModuleAccess(req, \"clients\") ile korunuyor", /requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(cr));
  ok("client-reference yalnız nutrition_allergens okuyor", /nutrition_allergens/.test(cr));
  ok("client-reference foodGroups/frameworks DÖNDÜRMÜYOR", !/nutrition_food_groups/.test(cr) && !/nutrition_traditional_frameworks/.test(cr));
  ok("client-reference SALT-OKUMA (yalnız GET; POST/PUT/DELETE yok)", /export async function GET/.test(cr) && !/export async function (POST|PUT|PATCH|DELETE)/.test(cr));
  ok("client-reference Cache-Control: no-store", /no-store/.test(cr));
}

// 4) Client fetch köprüsü dar endpoint'e gidiyor.
const ctc = read("lib/beslenme/clientTabClient.ts");
ok("getAllergenVocab → /api/beslenme/client-reference", /getAllergenVocab[\s\S]{0,120}\/api\/beslenme\/client-reference/.test(ctc));
ok("getAllergenVocab artık geniş /api/beslenme/reference kullanmıyor", !/getAllergenVocab[\s\S]{0,120}\/api\/beslenme\/reference`/.test(ctc));

// 5) Global owner-only kapı DEĞİŞMEDİ.
const og = read("lib/beslenme/ownerGuard.ts");
ok("requireBeslenmeOwner hâlâ owner-only (requireMainAdmin)", /export async function requireBeslenmeOwner[\s\S]{0,400}requireMainAdmin\(/.test(og));
const access = read("app/api/beslenme/access/route.ts");
ok("/api/beslenme/access hâlâ requireBeslenmeOwner", /requireBeslenmeOwner\(/.test(access));

// 6) Plan API route'ları hâlâ owner-only (AŞAMA 2 — bu fazda DOKUNULMADI).
for (const p of [
  "app/api/beslenme/plans/route.ts",
  "app/api/beslenme/plans/[id]/route.ts",
]) {
  const src = read(p);
  ok(`plan route owner-only korunuyor: ${p}`, /requireBeslenmeOwner\(/.test(src) && !/requireModuleAccess\(\s*req\s*,\s*["']clients["']\s*\)/.test(src));
}
// client-scoped plan LİSTESİ read'i uzmanlara açık (requireBeslenmeClient üstünden).
const clientPlans = read("app/api/beslenme/clients/[clientId]/plans/route.ts");
ok("clients/[clientId]/plans requireBeslenmeClient (client-scoped read)", /requireBeslenmeClient\(/.test(clientPlans));

// 7) Food route'ları FAZ 1'de policy değişmedi.
const foods = read("app/api/beslenme/foods/route.ts");
ok("foods route hâlâ requireBeslenmeFoodContributor (read/write split YOK)", /requireBeslenmeFoodContributor\(/.test(foods));

// 8) 7 danışan-scoped route requireBeslenmeClient kullanıyor + yazmalarda demo-deny.
const clientRoutes = [
  ["profile", ["GET", "PUT"], true],
  ["measurements", ["GET", "POST"], true],
  ["measurements/[measurementId]", ["DELETE"], true],
  ["allergens", ["GET", "PUT"], true],
  ["preferences", ["GET", "POST"], true],
  ["preferences/[preferenceId]", ["DELETE"], true],
  ["plans", ["GET"], false],
];
for (const [seg, methods, hasMutation] of clientRoutes) {
  const src = read(`app/api/beslenme/clients/[clientId]/${seg}/route.ts`);
  ok(`clients/${seg} requireBeslenmeClient kullanıyor`, /requireBeslenmeClient\(/.test(src));
  ok(`clients/${seg} body'den tenant/client kimliği KABUL ETMİYOR`, !/body\.(tenant_id|client_id|user_id)/.test(src));
  if (hasMutation) ok(`clients/${seg} yazma yolunda denyDemoMutation`, /denyDemoMutation\(/.test(src));
}

// 9) UI: Beslenme sekmesi owner-flag'e bağlı DEĞİL; capability prop olarak geçiyor.
const page = read("app/dashboard/clients/[id]/page.tsx");
ok("page.tsx Beslenme tab'ı owner-flag ile GİZLEMİYOR (eski beslenmeOwner koşulu kalktı)", !/beslenmeOwner\b/.test(page));
// AŞAMA 2: prop canManagePlans → isOwner olarak yeniden adlandırıldı (owner plan mekanizması).
ok("page.tsx BeslenmeTab'a isOwner=isBeslenmeOwner geçiyor", /isOwner=\{isBeslenmeOwner\}/.test(page));

// 10) BeslenmeTab: owner ön-probe kaldırıldı; plan aksiyonları canManagePlans'a bağlı.
const tab = read("app/dashboard/clients/[id]/components/BeslenmeTab.tsx");
ok("BeslenmeTab owner ön-probe (checkBeslenmeAccess) KALDIRILDI", !/checkBeslenmeAccess/.test(tab));
ok("BeslenmeTab canManagePlans prop'u alıyor", /canManagePlans/.test(tab));
ok("BeslenmeTab plan aksiyonları isOwner capability'sine bağlı", /isOwner/.test(tab));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
process.exit(fail === 0 ? 0 : 1);
