/**
 * HUMAN DESIGN MEMBER OPEN — erişim sözleşmesi harness'i (saf fn + statik sözleşme).
 *
 * Çalıştırma:  npx tsx scripts/hd-member-access-harness.ts
 *
 * Human Design'ın NORMAL bir module_permissions modülü olduğunu kanıtlar: DEFAULT
 * fail-closed korunur; Premium payload human_design:true üretir; server resolver ve
 * route guard kişiye özel izne dayanır; admin/canonical sınırı ve migration değişmez.
 * Gerçek DB'ye YAZMAZ.
 */
import { readFileSync } from "node:fs";
import {
  DEFAULT_MODULE_PERMISSIONS,
  buildPremiumModulePermissionsPayload,
  COMING_SOON_MODULE_KEYS,
  PREMIUM_HOME_MODULE_KEYS,
  hasModulePermission,
  getModuleLockReason,
} from "../lib/auth/modulePermissions";
import { resolveModuleAccess } from "../lib/auth/moduleAccess";
import { evaluateRouteModuleGuard } from "../lib/auth/routeModuleAccess";
import type { YasamUser } from "../lib/auth/yasamUser";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) { passed++; }
  else { failed++; fails.push(name); console.log("  ✗ FAIL:", name); }
}

/** Minimal YasamUser fixture (yalnız erişim kararına giren alanlar). */
function mk(o: Partial<Record<string, unknown>>): YasamUser {
  return {
    role: "expert",
    active: true,
    approval_status: "approved",
    package_type: "premium",
    module_permissions: {},
    ...o,
  } as unknown as YasamUser;
}

function run(): void {
  // ── A) modulePermissions kontratı ─────────────────────────────────────────
  ok(DEFAULT_MODULE_PERMISSIONS.human_design === false, "A: DEFAULT human_design === false (fail-closed korunur)");
  ok(buildPremiumModulePermissionsPayload().human_design === true, "A: Premium payload human_design === true");
  ok(buildPremiumModulePermissionsPayload().yasam_hafizasi === undefined, "A: Premium payload yasam_hafizasi HÂLÂ hariç (atomik grant)");
  ok(!COMING_SOON_MODULE_KEYS.has("human_design"), "A: human_design artık COMING_SOON değil");
  ok((PREMIUM_HOME_MODULE_KEYS as readonly string[]).includes("human_design"), "A: Premium home listesinde human_design var");

  // ── B) server resolveModuleAccess (Premium bypass YOK) ────────────────────
  ok(resolveModuleAccess("admin", {}, "human_design") === true, "B: admin + HD → true");
  ok(resolveModuleAccess("expert", { human_design: true }, "human_design") === true, "B: expert {human_design:true} → true");
  ok(resolveModuleAccess("expert", { human_design: false }, "human_design") === false, "B: expert {human_design:false} → false");
  ok(resolveModuleAccess("expert", {}, "human_design") === false, "B: expert {} → false (fail-closed)");
  ok(resolveModuleAccess("expert", { stones: true }, "human_design") === false, "B: başka izin HD'yi açmaz");

  // ── C) route guard (evaluateRouteModuleGuard) ─────────────────────────────
  const HD = "/human-design";
  ok(evaluateRouteModuleGuard(HD, mk({ role: "admin" })) === "allow", "C: admin → allow");
  ok(evaluateRouteModuleGuard(HD, mk({ module_permissions: { human_design: true } })) === "allow", "C: Premium+active+approved + HD:true → allow");
  ok(evaluateRouteModuleGuard(HD, mk({ module_permissions: { human_design: false } })) === "deny", "C: Premium+active+approved + HD:false → deny");
  ok(evaluateRouteModuleGuard(HD, mk({ package_type: "pro", module_permissions: { human_design: true } })) === "deny_membership", "C: Pro + HD:true → deny_membership");
  ok(evaluateRouteModuleGuard(HD, mk({ active: false, module_permissions: { human_design: true } })) === "deny_membership", "C: inactive Premium → deny_membership");
  ok(evaluateRouteModuleGuard(HD, mk({ approval_status: "pending", module_permissions: { human_design: true } })) === "deny_membership", "C: unapproved Premium → deny_membership");

  // ── D) client lock reason (home kart görünürlüğü) ─────────────────────────
  ok(getModuleLockReason(mk({ module_permissions: { human_design: true } }), "human_design", true, true) === null, "D: izinli → kilit yok (coming_soon DEĞİL)");
  ok(getModuleLockReason(mk({ module_permissions: { human_design: false } }), "human_design", true, true) === "permission", "D: izinsiz → 'permission' (coming_soon değil)");
  ok(hasModulePermission(mk({ module_permissions: { human_design: true } }), "human_design") === true, "D: hasModulePermission izinli → true");

  // ── E) admin/canonical sınırı REGRESYON (statik — DEĞİŞMEDİ) ──────────────
  const modAccess = readFileSync("lib/auth/moduleAccess.ts", "utf8");
  ok(!/moduleKey === "human_design"\)\s*return false/.test(modAccess), "E: moduleAccess hard-deny KALDIRILDI");
  ok(!/isPremiumExpertUser|package_type/.test(modAccess), "E: moduleAccess Premium/paket bypass YOK (korundu)");
  const userGuard = readFileSync("lib/auth/userGuard.ts", "utf8");
  ok(/requireModuleAccess/.test(userGuard) && /resolveModuleAccess/.test(userGuard) && /includeProfile: true/.test(userGuard), "E: requireModuleAccess güvenlik hattı korundu");

  // ── F) life-analysis kartı: Aktif + comingSoon:false + /human-design ──────
  const la = readFileSync("app/life-analysis/page.tsx", "utf8");
  const hdCard = la.slice(la.indexOf('title: "Human Design"'));
  const hdBlock = hdCard.slice(0, hdCard.indexOf("},") + 2);
  ok(/href:\s*"\/human-design"/.test(hdBlock), "F: HD kartı href /human-design");
  ok(/badge:\s*"Aktif"/.test(hdBlock), "F: HD kartı badge 'Aktif'");
  ok(/comingSoon:\s*false/.test(hdBlock), "F: HD kartı comingSoon false");
  const home = readFileSync("app/page.tsx", "utf8");
  ok(!/YAKINDA[\s\S]{0,400}Human Design/.test(home) || /href="\/human-design"/.test(home), "F: home showcase HD 'Modüle Git' /human-design");

  // ── G) migration statik (idempotent, yalnız human_design, premium expert) ─
  const migRaw = readFileSync("supabase/migrations/20261223000000_enable_human_design_for_premium_experts.sql", "utf8");
  // Yalnız çalıştırılabilir SQL (— yorum satırları hariç): yorumdaki "DEĞİŞMEZ" ifadeleri
  // yanlış-pozitif üretmesin.
  const mig = migRaw.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  ok(/module_permissions\s*=\s*COALESCE\(module_permissions,\s*'\{\}'::jsonb\)\s*\|\|\s*'\{"human_design":\s*true\}'::jsonb/i.test(mig), "G: yalnız human_design:true merge (||)");
  ok(/role\s*=\s*'expert'/i.test(mig) && /premium/i.test(mig), "G: yalnız premium expert hedeflenir");
  ok(/IS DISTINCT FROM\s*'true'/i.test(mig), "G: idempotent guard (zaten true → no-op)");
  ok(!/active|approval_status|membership|yasam_hafizasi|clients|stones|numerology/i.test(mig), "G: başka izin/durum/YH DEĞİŞTİRİLMEZ (executable SQL)");
  ok(!/\b(DROP|ALTER TABLE|CREATE POLICY|GRANT|REVOKE)\b/i.test(mig), "G: schema/RLS/grant değişikliği YOK (yalnız veri)");

  console.log(`\nhd-member-access harness: ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) { console.log("Başarısızlar:", fails); process.exit(1); }
  console.log("✅ Human Design member access — sözleşme + guard + kart + migration geçti.");
}

run();
