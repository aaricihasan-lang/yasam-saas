/**
 * ÜYE YÖNETİMİ FINAL — HUB GÖRÜNÜRLÜK harness (Dijital İçerik Merkezi + Enerji & Beden).
 * Owner kararı: uzman kendisine AÇILMAMIŞ modülü arayüzde görmez; UI gizleme sunucu yetkisinin
 * yerine GEÇMEZ (iki katman). SAF mantık + kaynak sözleşmesi (DB/ağ YOK).
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz2/hub-visibility.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DIGITAL_CONTENT_HUB_CHILDREN,
  DIGITAL_CONTENT_HUB_KEYS,
  ENERGY_BODY_HUB_CHILDREN,
  ENERGY_BODY_HUB_KEYS,
  isHubVisible,
  visibleHubChildren,
} from "../../lib/auth/hubVisibility";
import { evaluateRouteModuleGuard } from "../../lib/auth/routeModuleAccess";
import { resolveModuleAccess } from "../../lib/auth/moduleAccessCore";
import { hasAnyModulePermissionFlag, hasModulePermission } from "../../lib/auth/modulePermissions";
import { ADMIN_MODULE_UI_KEYS, validateApprovalModules, validateModuleChanges } from "../../lib/admin/userManagement";
import type { YasamUser } from "../../lib/auth/yasamUser";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

function expert(perms: Record<string, boolean>): YasamUser {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    role: "expert",
    active: true,
    approval_status: "approved",
    package_type: "premium",
    plan: "premium",
    membership_status: "active",
    module_permissions: perms,
  } as unknown as YasamUser;
}
const ADMIN = { id: "00000000-0000-4000-8000-0000000000aa", role: "admin", active: true, approval_status: "approved", module_permissions: {} } as unknown as YasamUser;
const dcIds = (u: YasamUser | null) => visibleHubChildren(u, DIGITAL_CONTENT_HUB_CHILDREN).map((c) => c.id).join(",");
const ebIds = (u: YasamUser | null) => visibleHubChildren(u, ENERGY_BODY_HUB_CHILDREN).map((c) => c.id).join(",");
/** Dashboard hub kartı kuralı (app/page.tsx anyPermissionKeys → hasAnyModulePermissionFlag). */
const dashboardDc = (u: YasamUser) => hasAnyModulePermissionFlag(u, [...DIGITAL_CONTENT_HUB_KEYS]);

// ─── 1. Yalnız Kişisel Arşiv ──────────────────────────────────────────────────
console.log("\n[1] archive=true, diğerleri false (canlı Esra profili)");
const esraLike = expert({ personal_archive: true, belge_ceviri: false, video_ceviri: false, ders_notu: false, digital_content: true });
ok(dcIds(esraLike) === "personal_archive", `yalnız Kişisel Arşiv kartı (görünen: ${dcIds(esraLike)})`);
ok(isHubVisible(esraLike, DIGITAL_CONTENT_HUB_CHILDREN) && dashboardDc(esraLike), "hub dashboard'da görünür");
ok(evaluateRouteModuleGuard("/digital-content", esraLike) === "allow", "/digital-content → allow");
ok(evaluateRouteModuleGuard("/dashboard/kisisel-arsiv", esraLike) === "allow", "/dashboard/kisisel-arsiv → allow");
ok(evaluateRouteModuleGuard("/belge-ceviri", esraLike) === "deny", "/belge-ceviri direct URL → deny");
ok(evaluateRouteModuleGuard("/video-ceviri", esraLike) === "deny" && evaluateRouteModuleGuard("/ders-notu", esraLike) === "deny", "/video-ceviri + /ders-notu direct URL → deny");
ok(resolveModuleAccess("expert", esraLike.module_permissions, "belge_ceviri") === false, "sunucu belge_ceviri → false");
const aliasArchive = expert({ kisisel_arsiv: true });
ok(dcIds(aliasArchive) === "personal_archive" && dashboardDc(aliasArchive) && hasModulePermission(aliasArchive, "digital_content")
  && resolveModuleAccess("expert", aliasArchive.module_permissions, "digital_content"), "TR alias kisisel_arsiv: UI + sunucu aynı karar");

// ─── 2. İki erişilebilir child ────────────────────────────────────────────────
console.log("\n[2] archive + belge");
const two = expert({ personal_archive: true, belge_ceviri: true });
ok(dcIds(two) === "personal_archive,belge_ceviri", `yalnız bu iki kart (görünen: ${dcIds(two)})`);
ok(evaluateRouteModuleGuard("/belge-ceviri", two) === "allow", "/belge-ceviri → allow");

// ─── 3. Admin-only child uzmana görünmez ──────────────────────────────────────
console.log("\n[3] admin-only child (video_ceviri / ders_notu)");
const legacyAi = expert({ video_ceviri: true, ders_notu: true });
ok(dcIds(legacyAi) === "", "eski video/ders bayrağı true olsa da uzmanda AI kartı YOK");
ok(!dashboardDc(legacyAi) && !isHubVisible(legacyAi, DIGITAL_CONTENT_HUB_CHILDREN), "yalnız AI bayrağı hub'ı uzmana AÇMAZ");
ok(evaluateRouteModuleGuard("/digital-content", legacyAi) === "deny", "yalnız AI bayrağı: /digital-content → deny");
ok(!DIGITAL_CONTENT_HUB_KEYS.includes("video_ceviri") && !DIGITAL_CONTENT_HUB_KEYS.includes("ders_notu"), "hub anahtarları admin-only anahtar içermez");
ok(!(ADMIN_MODULE_UI_KEYS as readonly string[]).includes("video_ceviri") && !(ADMIN_MODULE_UI_KEYS as readonly string[]).includes("ders_notu"),
  "Üye Yönetimi: video/ders notu uzmana verilebilir toggle DEĞİL");
ok(!validateModuleChanges({ video_ceviri: true }).ok && !validateModuleChanges({ ders_notu: true }).ok, "modül değişikliği: video/ders anahtarı → reddedilir (400)");
ok(!validateApprovalModules(["video_ceviri"]).ok, "onay: yalnız video_ceviri seçimi reddedilir");
const four = expert({ personal_archive: true, belge_ceviri: true, video_ceviri: true, ders_notu: true });
ok(dcIds(four) === "personal_archive,belge_ceviri", "dört bayrak true olan uzman bile yalnız 2 erişilebilir kartı görür");

// ─── 4. Hiç child yok ─────────────────────────────────────────────────────────
console.log("\n[4] hiç erişilebilir alt modül yok");
const none = expert({ numerology: true, digital_content: true });
ok(dcIds(none) === "" && !dashboardDc(none), "digital_content bayrağı TEK BAŞINA hub açmaz; dashboard'da hub YOK");
ok(evaluateRouteModuleGuard("/digital-content", none) === "deny", "/digital-content direct URL → deny");
ok(resolveModuleAccess("expert", none.module_permissions, "digital_content") === false, "sunucu digital_content → false");
ok(evaluateRouteModuleGuard("/digital-content", null) === "deny", "oturumsuz /digital-content → deny");

// ─── 5/6. Permission aç / kapat ───────────────────────────────────────────────
console.log("\n[5-6] izin aç / kapat (kart türetilmiş — önbellek yok)");
const before = expert({ personal_archive: true });
const opened = expert({ personal_archive: true, belge_ceviri: true });
const closed = expert({ personal_archive: true, belge_ceviri: false });
ok(!dcIds(before).includes("belge_ceviri") && dcIds(opened).includes("belge_ceviri"), "belge izni açılınca kart görünür");
ok(!dcIds(closed).includes("belge_ceviri"), "belge izni kapanınca kart kaybolur");
ok(dashboardDc(expert({ personal_archive: false, belge_ceviri: true })) && !dashboardDc(expert({ personal_archive: false, belge_ceviri: false })),
  "son alt modül kapanınca hub dashboard'dan kaybolur");

// ─── 7. Direct URL (üyelik) ───────────────────────────────────────────────────
console.log("\n[7] direct URL üyelik/red");
const pending = { ...esraLike, approval_status: "pending", active: false } as YasamUser;
ok(evaluateRouteModuleGuard("/digital-content", pending) === "deny_membership", "onaysız uzman /digital-content → deny_membership");

// ─── 8. Admin ─────────────────────────────────────────────────────────────────
console.log("\n[8] admin");
ok(dcIds(ADMIN) === "personal_archive,belge_ceviri,video_ceviri,ders_notu", "admin dört kartı görür (admin-only dahil)");
ok(evaluateRouteModuleGuard("/video-ceviri", ADMIN) === "allow" && evaluateRouteModuleGuard("/ders-notu", ADMIN) === "allow"
  && evaluateRouteModuleGuard("/digital-content", ADMIN) === "allow", "admin route'ları allow");
ok(resolveModuleAccess("admin", {}, "video_ceviri") && resolveModuleAccess("admin", {}, "ders_notu"), "sunucu: admin video/ders erişimi korunur");

// ─── Enerji & Beden (aynı pattern — dar kapsam) ────────────────────────────────
console.log("\n[EB] Enerji & Beden hub");
const reflexOnly = expert({ reflexology: true });
ok(ebIds(reflexOnly) === "reflexology", `yalnız refleksoloji → yalnız Refleksoloji kartı (görünen: ${ebIds(reflexOnly)})`);
const cupOnly = expert({ kupa: true });
ok(ebIds(cupOnly) === "cupping" && evaluateRouteModuleGuard("/enerji-beden", cupOnly) === "allow"
  && hasAnyModulePermissionFlag(cupOnly, [...ENERGY_BODY_HUB_KEYS]), "yalnız kupa → hub görünür + yalnız Kupa kartı");
ok(ebIds(expert({ energy_body: true })) === "energy_body", "REF-020: energy_body Refleksoloji kartını AÇMAZ");
ok(evaluateRouteModuleGuard("/enerji-beden", expert({ numerology: true })) === "deny", "hiç alt modül yok → /enerji-beden deny");
ok(ebIds(ADMIN) === "energy_body,reflexology,cupping", "admin üç kartı görür");

// ─── Kaynak sözleşmesi ────────────────────────────────────────────────────────
console.log("\n[SRC] tek kaynak / hard-code yok");
const grid = read("app/digital-content/DigitalContentModuleGrid.tsx");
ok(/canSeeHubChild\(user, child\)/.test(grid) && /syncYasamUserFromDb/.test(grid) && !/adminOnly/.test(grid), "grid: kart görünürlüğü canlı izinden türetilir");
ok(/if \(!resolved\)/.test(grid), "grid: izin kesinleşmeden kart render edilmez (flash yok)");
const home = read("app/page.tsx");
ok(/href: "\/digital-content",[\s\S]{0,200}anyPermissionKeys: \[\.\.\.DIGITAL_CONTENT_HUB_KEYS\]/.test(home), "dashboard Dijital İçerik kartı hub anahtarlarını kullanır");
ok(/href: "\/enerji-beden",[\s\S]{0,200}anyPermissionKeys: \[\.\.\.ENERGY_BODY_HUB_KEYS\]/.test(home), "dashboard Enerji & Beden kartı hub anahtarlarını kullanır");
ok(!/digital_content: \[[^\]]*(video_ceviri|ders_notu)/.test(home), "dashboard alias listesi admin-only anahtar içermez");
const eb = read("app/enerji-beden/EnergyFoldersClient.tsx");
ok(/canSeeHubChild\(user, child\)/.test(eb), "Enerji & Beden kartları izinden türetilir");

console.log(`\n──────────\nHUB GÖRÜNÜRLÜK: PASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
