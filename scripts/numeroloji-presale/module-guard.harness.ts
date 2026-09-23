/**
 * NUM-003 + shared routeModuleAccess regresyon kalkanı.
 *
 * evaluateRouteModuleGuard davranışını deterministik doğrular:
 *   • Oturumsuz kullanıcı MODÜL-GATE'li premium route'ta → "deny" (NUM-003 A).
 *   • Oturumsuz + public/admin/non-module → "skip" (aşırı kapatma YOK — diğer akışlar bozulmaz).
 *   • Giriş yapmış: izinli → "allow", izinsiz → "deny", premium değil → "deny_membership".
 *   • Diğer premium modüller (dogaltas/sifa) aynı kurala uyar (shared regresyon).
 *
 * Çalıştır:  tsx scripts/numeroloji-presale/module-guard.harness.ts
 */
import { evaluateRouteModuleGuard } from "@/lib/auth/routeModuleAccess";
import type { YasamUser } from "@/lib/auth/yasamUser";

let pass = 0, fail = 0;
const failures: string[] = [];
function check(path: string, user: YasamUser | null, expected: string, label: string): void {
  const got = evaluateRouteModuleGuard(path, user);
  if (got === expected) pass += 1;
  else { fail += 1; failures.push(`  ✗ ${label} [${path}] beklenen ${expected}, gelen ${got}`); }
}

const expert = (perms: Record<string, boolean>): YasamUser =>
  ({
    id: "u", role: "expert", active: true, approval_status: "approved",
    package_type: "premium", module_permissions: perms,
  } as unknown as YasamUser);

const admin = { id: "a", role: "admin", active: true } as unknown as YasamUser;
const nonPremium = ({
  id: "u2", role: "expert", active: true, approval_status: "approved",
  package_type: "trial", module_permissions: { numerology: true },
} as unknown as YasamUser);

// ── Oturumsuz (NUM-003 A + shared) ───────────────────────────────────────────
check("/numeroloji", null, "deny", "oturumsuz /numeroloji");
check("/numeroloji/analiz", null, "deny", "oturumsuz /numeroloji/analiz");
check("/numeroloji/liste", null, "deny", "oturumsuz /numeroloji/liste");
check("/numeroloji/bilgi-bankasi", null, "deny", "oturumsuz /numeroloji/bilgi-bankasi");
check("/dogaltas", null, "deny", "oturumsuz /dogaltas (shared)");
check("/sifa-rehberi", null, "deny", "oturumsuz /sifa-rehberi (shared)");
check("/human-design", null, "deny", "oturumsuz /human-design (shared)");
// Aşırı kapatma YOK: public/admin/non-module oturumsuz → skip
check("/", null, "skip", "oturumsuz / (public)");
check("/register", null, "skip", "oturumsuz /register (public)");
check("/admin", null, "skip", "oturumsuz /admin");
check("/gizli-olmayan-sayfa", null, "skip", "oturumsuz non-module → skip (regresyon yok)");

// ── Giriş yapmış (değişmeyen mantık — sadece null dalını değiştirdik) ─────────
check("/numeroloji/analiz", expert({ numerology: true }), "allow", "izinli uzman /numeroloji → allow");
check("/numeroloji/analiz", expert({ stones: true }), "deny", "numeroloji izinsiz uzman → deny");
check("/dogaltas", expert({ stones: true }), "allow", "stones izinli uzman /dogaltas → allow (shared regresyon)");
check("/dogaltas", expert({ numerology: true }), "deny", "stones izinsiz uzman /dogaltas → deny (shared regresyon)");
check("/numeroloji/analiz", admin, "allow", "admin → allow");
check("/numeroloji/analiz", nonPremium, "deny_membership", "premium olmayan → deny_membership");
check("/", expert({ numerology: true }), "skip", "public path giriş yapmış → skip");

console.log(`\nMODULE-GUARD HARNESS — ${pass} geçti, ${fail} başarısız`);
if (fail > 0) { console.log(failures.join("\n")); process.exit(1); }
console.log("✓ NUM-003 + shared routeModuleAccess regresyon PASS.");
