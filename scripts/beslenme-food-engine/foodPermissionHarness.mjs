// ============================================================
// Beslenme — CANONICAL Food Permission (READ vs WRITE) statik kontrat harness'i.
//
// Yeni kanonik model (ayrı "Besinlerim"/manuel-besin yeteneği KALDIRILDI):
//   READ  (besin kataloğu okuma/seçme)  → clients | beslenme (admin role short-circuit).
//   WRITE (CUSTOM besin oluştur/düzenle/arşivle + nutrient/porsiyon) → tam Beslenme
//          (requireBeslenmeModule; admin dahil). clients TEK BAŞINA write VERMEZ; eski
//          beslenme_manual_food bayrağı artık HİÇBİR YERDE okunmaz → inert legacy.
//   SYSTEM katalog herkes için salt-okunur (resolveFoodForWrite → SYSTEM_READONLY).
// Eski manualFoodPermissionHarness/manualFoodExtendedHarness'in yerine geçer. FAIL → exit 1.
// ============================================================
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(resolve(ROOT, p)) ? readFileSync(resolve(ROOT, p), "utf8") : "");
const gone = (p) => !existsSync(resolve(ROOT, p));
let pass = 0, fail = 0; const failures = [];
const ok = (n, c) => (c ? pass++ : (fail++, failures.push(n)));

console.log("Beslenme — Canonical Food Permission (READ vs WRITE)\n");

const og = read("lib/beslenme/ownerGuard.ts");

// READ kapısı: clients | beslenme; manual bayrak YOK.
const readBlock = (og.match(/export async function requireBeslenmeFoodRead[\s\S]*?^}/m) || [""])[0];
ok("READ requireBeslenmeFoodRead mevcut", /export async function requireBeslenmeFoodRead/.test(og));
ok("READ clients erişimi", /resolveModuleAccess\([^)]*["']clients["']\)/.test(readBlock));
ok("READ beslenme erişimi", /resolveModuleAccess\([^)]*["']beslenme["']\)/.test(readBlock));
ok("READ manual bayrak (hasManualFoodFlag) KALDIRILDI", !/hasManualFoodFlag/.test(readBlock));
// P1-4: READ kapısı da üyelik kapısından geçer (premium/aktif/onaylı; admin muaf).
ok("READ üyelik kapısı (hasMembershipAccessForRow → 403 MEMBERSHIP_INACTIVE)",
   /hasMembershipAccessForRow\(guard\.profile \?\? \{\}\)/.test(readBlock) && /membershipInactiveResponse\(\)/.test(readBlock));

// WRITE: ayrı contributor kapısı + policy KALDIRILDI.
ok("WRITE requireBeslenmeFoodContributor KALDIRILDI", !/requireBeslenmeFoodContributor/.test(og));
ok("WRITE foodContributorPolicy importu/kullanımı YOK",
   !/foodContributorPolicy/.test(og) && !/decideFoodContributorAuthority/.test(og) && !/BESLENME_MANUAL_FOOD_FLAG/.test(og));
ok("foodContributorPolicy.ts dosyası SİLİNDİ", gone("lib/beslenme/foodContributorPolicy.ts"));
ok("/api/beslenme/foods/access probe route SİLİNDİ", gone("app/api/beslenme/foods/access/route.ts"));
ok("client checkBeslenmeFoodAccess KALDIRILDI", !/export async function checkBeslenmeFoodAccess/.test(read("lib/beslenme/beslenmeClient.ts")));

// Food route gate matrisi.
const g = (p) => read(`app/api/beslenme/${p}`);
ok("foods GET → FoodRead, POST → Module",
   /export async function GET[\s\S]{0,120}requireBeslenmeFoodRead\(/.test(g("foods/route.ts")) &&
   /export async function POST[\s\S]{0,120}requireBeslenmeModule\(/.test(g("foods/route.ts")));
{
  const fid = g("foods/[id]/route.ts");
  ok("foods/[id] GET → FoodRead; PATCH+DELETE → Module (contributor yok)",
     /export async function GET[\s\S]{0,120}requireBeslenmeFoodRead\(/.test(fid) &&
     (fid.match(/requireBeslenmeModule\(/g) || []).length >= 2 && !/requireBeslenmeFoodContributor/.test(fid));
}
for (const r of ["foods/[id]/nutrients/route.ts", "foods/[id]/portions/route.ts", "foods/quick/route.ts",
                 "foods/recent/route.ts", "reference/route.ts"]) {
  ok(`${r} → requireBeslenmeModule (contributor yok)`, /requireBeslenmeModule\(/.test(g(r)) && !/requireBeslenmeFoodContributor/.test(g(r)));
}
ok("SYSTEM besin salt-okunur (resolveFoodForWrite → SYSTEM_READONLY)", /SYSTEM_READONLY/.test(read("lib/beslenme/foodEngine.ts")));

// Ayrı "Besinlerim" ürün yüzeyi tamamen kaldırıldı.
ok("/beslenme/besinlerim route SİLİNDİ", gone("app/beslenme/besinlerim/page.tsx"));
ok("BesinYonetimiScreen mode/contributor prop'u KALDIRILDI (tek canonical ekran)",
   !/BesinYonetimiMode/.test(read("app/beslenme/_components/BesinYonetimiScreen.tsx")) &&
   !/mode=/.test(read("app/beslenme/besinler/page.tsx")));
ok("BeslenmeShell useBeslenmeFoodContributorGuard KALDIRILDI",
   !/export function useBeslenmeFoodContributorGuard/.test(read("app/beslenme/_components/BeslenmeShell.tsx")));

// STALE legacy flag inert: beslenme_manual_food hiçbir erişim kararında okunmaz.
{
  const um = read("lib/admin/userManagement.ts");
  // Registry KULLANIMI kaldırıldı: quoted key ("beslenme_manual_food") ya da obje anahtarı
  // (beslenme_manual_food:) YOK. Yorumda geçen açıklama metni hariç.
  ok("admin registry beslenme_manual_food KEY/LABEL/DEFAULT KALDIRILDI",
     !/["']beslenme_manual_food["']/.test(um) && !/beslenme_manual_food\s*:/.test(um));
}
ok("routeModuleAccess /dogal-destek beslenme_manual_food + clients İÇERMEZ", (() => {
  const rule = (read("lib/auth/routeModuleAccess.ts").match(/prefix:\s*"\/dogal-destek",\s*keys:\s*\[([^\]]*)\]/) || [,""])[1];
  return /"beslenme"/.test(rule) && !/"beslenme_manual_food"/.test(rule) && !/"clients"/.test(rule);
})());
ok("moduleAccessCore beslenme_manual_food'u erişim kararında okumuyor",
   !/beslenme_manual_food/.test(read("lib/auth/moduleAccessCore.ts")));

console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"} — ${pass} geçti, ${fail} kaldı`);
if (fail) { console.log("FAILURES:"); for (const f of failures) console.log("  - " + f); }
process.exit(fail === 0 ? 0 : 1);
