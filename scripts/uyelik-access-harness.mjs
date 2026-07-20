/**
 * uyelik-access-harness.mjs
 *
 * Tek üyelik modeli (active + approved + premium) erişim gate'inin regresyon
 * doğrulaması. Gerçek kaynak fonksiyonları içe aktarır (kopya mantık YOK):
 *   - hasExpertMembershipAccess  (lib/auth/membership.ts)
 *   - evaluateRouteModuleGuard   (lib/auth/routeModuleAccess.ts)
 *
 * Çalıştırma (worktree kökünden):  node_modules/.bin/tsx scripts/uyelik-access-harness.mjs
 * tsx, tsconfig "@/*" alias'ını ve TS import'larını çözer.
 */
import { hasExpertMembershipAccess } from "@/lib/auth/membership";
import { evaluateRouteModuleGuard } from "@/lib/auth/routeModuleAccess";

let pass = 0;
let fail = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass++;
  else {
    fail++;
    failures.push(`${name}: beklenen=${JSON.stringify(expected)} gerçek=${JSON.stringify(actual)}`);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (=${JSON.stringify(actual)})`);
}

const PAST = "2020-01-01T00:00:00.000Z";

// Temel expert şablonu
const base = {
  id: "u1",
  role: "expert",
  active: true,
  approval_status: "approved",
  package_type: "premium",
  module_permissions: {},
};

// ── hasExpertMembershipAccess senaryoları ──
check("1) premium+approved+active -> acik",
  hasExpertMembershipAccess({ ...base }), true);

check("2) premium+approved+active=false -> kapali",
  hasExpertMembershipAccess({ ...base, active: false }), false);

check("3) premium+pending+active -> kapali",
  hasExpertMembershipAccess({ ...base, approval_status: "pending" }), false);

check("4) pro+approved+active -> kapali",
  hasExpertMembershipAccess({ ...base, package_type: "pro" }), false);

check("5) trial+approved+active -> kapali",
  hasExpertMembershipAccess({ ...base, package_type: "trial" }), false);

check("6) premium + gecmis trial_ends_at -> acik",
  hasExpertMembershipAccess({ ...base, trial_ends_at: PAST }), true);

check("7) premium + gecmis membership_ends_at -> acik",
  hasExpertMembershipAccess({ ...base, membership_ends_at: PAST }), true);

check("6b) premium + expired/passive statu (yok sayilmali) -> acik",
  hasExpertMembershipAccess({
    ...base,
    membership_status: "expired",
    subscription_status: "passive",
    trial_ends_at: PAST,
    membership_ends_at: PAST,
  }), true);

check("8) admin -> acik",
  hasExpertMembershipAccess({ id: "a1", role: "admin", active: true }), true);

check("8b) admin + active=false -> yine acik (admin bypass)",
  hasExpertMembershipAccess({ id: "a1", role: "admin", active: false }), true);

check("9) null kullanici -> kapali",
  hasExpertMembershipAccess(null), false);

check("9b) approval bos (approved degil) -> kapali",
  hasExpertMembershipAccess({ ...base, approval_status: "" }), false);

check("9c) package_type bos (premium degil) -> kapali",
  hasExpertMembershipAccess({ ...base, package_type: "" }), false);

// ── 10) routeModuleAccess üyelik gate'iyle uyumlu mu ──
// Premium erişimli kullanıcı bir modül rotasına girebilmeli.
check("10a) route /dogaltas premium+approved+active -> allow",
  evaluateRouteModuleGuard("/dogaltas", { ...base }), "allow");

// Üyelik kapalıysa (active=false) route guard 'deny_membership' vermeli.
check("10b) route /dogaltas active=false -> deny_membership",
  evaluateRouteModuleGuard("/dogaltas", { ...base, active: false }), "deny_membership");

// Pending -> membership gate kapalı -> deny_membership
check("10c) route /dogaltas pending -> deny_membership",
  evaluateRouteModuleGuard("/dogaltas", { ...base, approval_status: "pending" }), "deny_membership");

// Admin -> allow
check("10d) route /dogaltas admin -> allow",
  evaluateRouteModuleGuard("/dogaltas", { id: "a1", role: "admin", active: true }), "allow");

console.log(`\n== SONUC: ${pass}/${pass + fail} PASS ==`);
if (fail > 0) {
  console.log("BASARISIZLAR:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
