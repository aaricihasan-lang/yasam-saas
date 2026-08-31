/**
 * Faz 1/P3 harness — Kullanıcı Erişim Limitleri ve Yönetim Tamamlama.
 *
 * Çalıştırma:  npx tsx scripts/faz1-p3-access-management-test.ts
 *
 * KAPSAM (Commit 1 — oturum limitleri + login enforcement + limit güncelleme/revoke
 * + filtre sadeleştirme + admin/test uyarı sertleştirmesi). Commit 2 (modül gate)
 * bu dosyaya ayrı bölümler ekler. Gerçek DB'ye YAZMAZ (saf fn + statik sözleşme).
 */
import { readFileSync, readdirSync } from "node:fs";
import {
  normalizeLimit,
  evaluateNewSession,
  classifyDeviceType,
  limitReasonMessage,
  deviceLabel,
} from "../lib/auth/sessionLimits";
import {
  computeExcessSessionsToRevoke,
  type ActiveSessionRow,
} from "../lib/admin/sessionLimitManagement";
import { resolveModuleAccess } from "../lib/auth/moduleAccess";
import {
  MODULE_ROUTE_PREFIXES,
  EXCLUDED_API_PREFIXES,
  EXPLICIT_EXCLUDED_ROUTES,
  DEFERRED_MODULE_PREFIXES,
} from "../lib/auth/moduleRouteRegistry";

let passed = 0;
let failed = 0;
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  if (cond) passed++;
  else {
    failed++;
    fails.push(name);
    console.log("  ✗ FAIL:", name);
  }
}

function run(): void {
  // ── 1) normalizeLimit ──────────────────────────────────────────────────────
  ok(normalizeLimit(-1) === -1, "normalize: -1 → -1 (sınırsız)");
  ok(normalizeLimit(0) === 0, "normalize: 0 → 0 (yasak, kasıtlı)");
  ok(normalizeLimit(5) === 5, "normalize: 5 → 5");
  ok(normalizeLimit(null) === -1, "normalize: null → -1 (fail-safe)");
  ok(normalizeLimit(undefined) === -1, "normalize: undefined → -1");
  ok(normalizeLimit(NaN) === -1, "normalize: NaN → -1");
  ok(normalizeLimit(-5) === -1, "normalize: <-1 → -1 (fail-safe)");
  ok(normalizeLimit(999999) === 10000, "normalize: >max → 10000");
  ok(normalizeLimit("3") === 3, "normalize: '3' → 3");
  ok(normalizeLimit(3.9) === 3, "normalize: 3.9 → 3 (trunc)");

  // ── 2) evaluateNewSession (reject-new) ─────────────────────────────────────
  ok(evaluateNewSession({ platformLimit: -1, totalLimit: -1, activePlatform: 100, activeTotal: 100 }).allowed === true,
    "eval: sınırsız → izin");
  {
    const r = evaluateNewSession({ platformLimit: 0, totalLimit: -1, activePlatform: 0, activeTotal: 0 });
    ok(!r.allowed && r.reason === "device_forbidden", "eval: platform 0 → device_forbidden");
  }
  {
    const r = evaluateNewSession({ platformLimit: 2, totalLimit: -1, activePlatform: 2, activeTotal: 5 });
    ok(!r.allowed && r.reason === "device_limit", "eval: platform doldu → device_limit");
  }
  ok(evaluateNewSession({ platformLimit: 2, totalLimit: -1, activePlatform: 1, activeTotal: 5 }).allowed === true,
    "eval: platform limiti altında → izin");
  {
    const r = evaluateNewSession({ platformLimit: -1, totalLimit: 0, activePlatform: 0, activeTotal: 0 });
    ok(!r.allowed && r.reason === "total_forbidden", "eval: total 0 → total_forbidden");
  }
  {
    const r = evaluateNewSession({ platformLimit: -1, totalLimit: 3, activePlatform: 0, activeTotal: 3 });
    ok(!r.allowed && r.reason === "total_limit", "eval: total doldu → total_limit");
  }
  ok(evaluateNewSession({ platformLimit: 5, totalLimit: 5, activePlatform: 2, activeTotal: 4 }).allowed === true,
    "eval: her iki limit altında → izin");
  {
    // platform önce değerlendirilir (device_forbidden total'dan önce)
    const r = evaluateNewSession({ platformLimit: 0, totalLimit: 0, activePlatform: 0, activeTotal: 0 });
    ok(!r.allowed && r.reason === "device_forbidden", "eval: platform yasağı total'dan önce");
  }

  // ── 3) classifyDeviceType (server-side; UA loglanmaz) ──────────────────────
  ok(classifyDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)") === "desktop", "device: Windows → desktop");
  ok(classifyDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile") === "mobile", "device: iPhone → mobile");
  ok(classifyDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)") === "tablet", "device: iPad → tablet");
  ok(classifyDeviceType("Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit Mobile Safari") === "mobile", "device: Android telefon (Mobile) → mobile");
  ok(classifyDeviceType("Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit Safari") === "tablet", "device: Android tablet (Mobile yok) → tablet");
  ok(classifyDeviceType("Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit Mobile") === "mobile", "device: Android WebView → mobile");
  ok(classifyDeviceType("") === "unknown", "device: boş UA → unknown");
  ok(classifyDeviceType("SomeUnknownAgent/1.0") === "desktop", "device: bilinmeyen → desktop (güvenli fallback)");

  // ── 4) Mesaj/etiket (Türkçe; secret/UA yok) ────────────────────────────────
  ok(deviceLabel("mobile") === "Mobil" && deviceLabel("tablet") === "Tablet", "label: mobil/tablet");
  ok(/kapal/i.test(limitReasonMessage("device_forbidden", "tablet")), "mesaj: device_forbidden Türkçe");
  ok(/limit/i.test(limitReasonMessage("total_limit", "desktop")), "mesaj: total_limit Türkçe");
  ok(!/Mozilla|user-?agent/i.test(limitReasonMessage("device_limit", "mobile")), "mesaj: ham UA yok");

  // ── 5) computeExcessSessionsToRevoke (deterministik, en eski önce) ─────────
  const S = (id: string, platform: string, iso: string): ActiveSessionRow => ({ id, platform, created_at: iso });
  const T = (n: number) => `2026-01-01T00:0${n}:00Z`;
  {
    // sınırsız → hiç kapatma
    const plan = computeExcessSessionsToRevoke(
      [S("a", "desktop", T(1)), S("b", "mobile", T(2))],
      { total: -1, desktop: -1, mobile: -1, tablet: -1, unknown: -1 },
    );
    ok(plan.total === 0, "revoke: sınırsız → 0");
  }
  {
    // desktop limit 1, 2 desktop → en eski (a) kapanır
    const plan = computeExcessSessionsToRevoke(
      [S("a", "desktop", T(1)), S("b", "desktop", T(3)), S("c", "mobile", T(2))],
      { total: -1, desktop: 1, mobile: -1, tablet: -1, unknown: -1 },
    );
    ok(plan.total === 1 && plan.toRevoke[0] === "a", "revoke: desktop limit → en eski desktop (a)");
    ok(plan.byDevice.desktop === 1, "revoke: byDevice.desktop = 1");
  }
  {
    // device 0 → o türdeki hepsi kapanır
    const plan = computeExcessSessionsToRevoke(
      [S("a", "tablet", T(1)), S("b", "tablet", T(2))],
      { total: -1, desktop: -1, mobile: -1, tablet: 0, unknown: -1 },
    );
    ok(plan.total === 2, "revoke: tablet=0 (yasak) → tüm tablet kapanır");
  }
  {
    // total limit 1, 3 farklı platform → en eski 2 kapanır (a,b)
    const plan = computeExcessSessionsToRevoke(
      [S("a", "desktop", T(1)), S("b", "mobile", T(2)), S("c", "tablet", T(3))],
      { total: 1, desktop: -1, mobile: -1, tablet: -1, unknown: -1 },
    );
    ok(plan.total === 2 && plan.toRevoke.includes("a") && plan.toRevoke.includes("b") && !plan.toRevoke.includes("c"),
      "revoke: total=1 → en yeni (c) kalır");
  }
  {
    // device-sonra-total birleşik: desktop limit 1 (a kapanır) + total 1 (kalan b,c'den en eski b)
    const plan = computeExcessSessionsToRevoke(
      [S("a", "desktop", T(1)), S("b", "desktop", T(2)), S("c", "mobile", T(3))],
      { total: 1, desktop: 1, mobile: -1, tablet: -1, unknown: -1 },
    );
    // desktop excess: a. remaining b,c → total 1 → en eski b kapanır. Kalan c.
    ok(plan.total === 2 && plan.toRevoke.includes("a") && plan.toRevoke.includes("b") && !plan.toRevoke.includes("c"),
      "revoke: device-sonra-total birleşik → c kalır");
  }
  {
    // deterministik sıralama: aynı created_at → id ASC
    const plan = computeExcessSessionsToRevoke(
      [S("z", "desktop", T(1)), S("a", "desktop", T(1))],
      { total: -1, desktop: 1, mobile: -1, tablet: -1, unknown: -1 },
    );
    ok(plan.toRevoke.length === 1 && plan.toRevoke[0] === "a", "revoke: eşit tarih → id ASC (a önce)");
  }

  // ── 6) ROUTE / MIGRATION SÖZLEŞMELERİ (statik) ─────────────────────────────
  const sessionRoute = readFileSync("app/api/auth/session/route.ts", "utf8");
  ok(/status:\s*403/.test(sessionRoute) && /limitReasonMessage/.test(sessionRoute), "session-route: limit reddi 403 + mesaj");
  ok(/reason:\s*result\.reason/.test(sessionRoute), "session-route: reason döner");
  ok(!/sessionToken[\s\S]{0,40}result\.reason/.test(sessionRoute), "session-route: red halinde token dönmez");

  const secSrc = readFileSync("lib/auth/sessionSecurity.ts", "utf8");
  ok(/create_session_within_limits/.test(secSrc), "sessionSecurity: atomik RPC kullanır");
  ok(/reject-new|reddeder/i.test(secSrc), "sessionSecurity: reject-new modeli");
  ok(!/end_reason:\s*"session_limit"/.test(secSrc), "sessionSecurity: eski 'en eskiyi kapat' limit bloğu kaldırıldı");
  ok(/ok:\s*false[\s\S]{0,40}reason/.test(secSrc), "sessionSecurity: reddde {ok:false,reason} döner");

  const licenseRoute = readFileSync("app/api/admin/users/[id]/route.ts", "utf8");
  ok(/computeExcessSessionsToRevoke/.test(licenseRoute), "license-route: fazlalık hesabı bağlı");
  ok(/requiresConfirmation/.test(licenseRoute) && /status:\s*409/.test(licenseRoute), "license-route: onaysız 409 preview");
  ok(/confirmExcessRevocation/.test(licenseRoute), "license-route: onay sözleşmesi");
  ok(/admin_session_limit/.test(licenseRoute), "license-route: revoke end_reason");
  ok(/total_session_limit_changed/.test(licenseRoute), "license-route: mevcut audit action");
  ok(/id === adminId[\s\S]{0,240}403/.test(licenseRoute), "license-route: self-target 403");
  ok(/>=\s*-1/.test(licenseRoute), "license-route: -1/0/N validasyonu");
  ok(/Lisans güncellenemedi/.test(licenseRoute) && /error:\s*"[^"]*güncellenemedi/i.test(licenseRoute), "license-route: ham DB hatası yerine sabit mesaj");

  const mig = readFileSync("supabase/migrations/20260918000000_p3_session_limits.sql", "utf8");
  const migCode = mig.split(/\r?\n/).filter((l) => !/^\s*--/.test(l)).join("\n");
  ok(/set default -1/i.test(migCode), "migration: default -1");
  ok(/set allowed_active_sessions\s*=\s*-1/i.test(migCode) || /allowed_active_sessions\s*=\s*-1/i.test(migCode), "migration: backfill -1");
  ok(/chk_users_session_limits_range/i.test(migCode) && />=\s*-1/.test(migCode), "migration: CHECK >= -1");
  ok(/security definer/i.test(migCode) && /set search_path/i.test(migCode), "migration: RPC SECURITY DEFINER + search_path");
  ok(/pg_advisory_xact_lock/i.test(migCode), "migration: RPC advisory lock (race-safe)");
  ok(/revoke all on function[\s\S]*from public/i.test(migCode), "migration: RPC execute PUBLIC revoke");
  ok(/grant execute on function[\s\S]*to service_role/i.test(migCode), "migration: RPC yalnız service_role");

  // ── 7) FİLTRE SADELEŞTİRME (statik) ────────────────────────────────────────
  const usersList = readFileSync("app/admin/users/page.tsx", "utf8");
  ok(!/Askıda/.test(usersList), "filtre: 'Askıda' kaldırıldı");
  ok(/matchesUserFilters/.test(usersList) && /DEFAULT_USER_FILTERS/.test(usersList), "filtre: gruplu bağımsız boyutlar");
  ok(/STATUS_FILTER_OPTIONS/.test(usersList) && /APPROVAL_FILTER_OPTIONS/.test(usersList) && /ROLE_FILTER_OPTIONS/.test(usersList), "filtre: Durum/Kayıt/Rol grupları");
  ok(/Filtreleri Temizle/.test(usersList), "filtre: tek Temizle davranışı");

  // ── 8) ADMIN/TEST UYARI SERTLEŞTİRME (statik lock — D) ─────────────────────
  // Uzman render path'inde (app/layout + app/page) admin/test/monitoring banner metni
  // KOŞULSUZ render edilmemeli; tüm admin yüzeyi /admin/** server layout-gate arkasında.
  const adminLayout = readFileSync("app/admin/layout.tsx", "utf8");
  ok(/role.*admin|admin.*role/i.test(adminLayout) && /redirect/i.test(adminLayout), "uyarı: /admin/** server layout role-gate (uzman erişemez)");
  const rootLayout = readFileSync("app/layout.tsx", "utf8");
  ok(!/(TEST ORTAMI|STAGING|MONITORING PANEL|DEBUG PANEL|test ortamı)/i.test(rootLayout), "uyarı: kök layout'ta admin/test banner yok");
  const home = readFileSync("app/page.tsx", "utf8");
  ok(!/(TEST ORTAMI|STAGING|MONITORING PANEL|DEBUG PANEL)/i.test(home), "uyarı: ana ekranda admin/test banner yok");

  // ══════════════════════════════════════════════════════════════════════════
  // COMMIT 2 — merkezi modül registry + requireModuleAccess + server-gate + Premium
  // ══════════════════════════════════════════════════════════════════════════

  // ── 9) resolveModuleAccess (Premium bypass YOK; admin/cosmic/coming-soon/hub) ──
  ok(resolveModuleAccess("admin", {}, "stones") === true, "module: admin → tüm modüller");
  ok(resolveModuleAccess("expert", {}, "cosmic_calendar") === true, "module: cosmic_calendar always-on");
  // Human Design artık NORMAL modül: kişiye özel module_permissions.human_design esastır.
  ok(resolveModuleAccess("expert", { human_design: true }, "human_design") === true, "module: human_design izinli expert → true");
  ok(resolveModuleAccess("expert", { human_design: false }, "human_design") === false, "module: human_design izinsiz expert → false");
  ok(resolveModuleAccess("expert", { stones: true }, "human_design") === false, "module: human_design başka izinle AÇILMAZ");
  ok(resolveModuleAccess("admin", {}, "human_design") === true, "module: human_design admin → true");
  ok(resolveModuleAccess("expert", { stones: true }, "stones") === true, "module: açık modül → izin");
  ok(resolveModuleAccess("expert", { stones: false }, "stones") === false, "module: kapalı modül → red");
  ok(resolveModuleAccess("expert", { dogaltas: true }, "stones") === true, "module: alias (dogaltas→stones)");
  ok(resolveModuleAccess("expert", {}, "stones") === false, "module: izin yok → red");
  // Premium bypass KALDIRILDI: package_type premium olsa da module_permissions esastır.
  ok(resolveModuleAccess("expert", {}, "aromatherapy") === false, "module: Premium bypass YOK (izin yoksa red)");
  ok(resolveModuleAccess("expert", { video_ceviri: true }, "digital_content") === true, "module: digital_content hub (alt modülden)");
  ok(resolveModuleAccess("expert", {}, "digital_content") === false, "module: hub alt modül yoksa red");

  // ── 10) ENVANTER / GATE KAPSAMI — her modül route'u ya gate'li ya explicit-exclude ──
  const API_ROOT = "app/api";
  function listRouteFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...listRouteFiles(p));
      else if (entry.name === "route.ts") out.push(p);
    }
    return out;
  }
  const allRoutes = listRouteFiles(API_ROOT);
  ok(allRoutes.length >= 190, `envanter: api route sayısı okundu (${allRoutes.length})`);

  const excludedPrefixes = EXCLUDED_API_PREFIXES.map((e) => e.prefix);
  const deferredPrefixes = DEFERRED_MODULE_PREFIXES.map((e) => e.prefix);
  const explicitExcluded = new Set(EXPLICIT_EXCLUDED_ROUTES.map((e) => e.path));
  const ungated: string[] = [];
  const unclassified: string[] = [];
  const deferred: string[] = [];
  let gatedCount = 0;
  let excludedCount = 0;

  for (const rel of allRoutes) {
    if (excludedPrefixes.some((p) => rel === `${p}/route.ts` || rel.startsWith(`${p}/`))) { excludedCount++; continue; }
    if (explicitExcluded.has(rel)) { excludedCount++; continue; }
    // DEFERRED (paralel workstream): gate HENÜZ uygulanmadı — AYRI sınıf. Gate varmış
    // gibi sayılmaz, gate'siz-hata olarak da sayılmaz; görünür raporlanır (follow-up).
    if (deferredPrefixes.some((p) => rel === `${p}/route.ts` || rel.startsWith(`${p}/`))) { deferred.push(rel); continue; }
    const mod = MODULE_ROUTE_PREFIXES.find((m) => rel === `${m.prefix}/route.ts` || rel.startsWith(`${m.prefix}/`));
    if (!mod) { unclassified.push(rel); continue; }
    const src = readFileSync(rel, "utf8");
    if (/requireModuleAccess\s*\(|assertUserModuleAccess\s*\(|requireDigitalContentUser\s*\([^)]*,\s*"/.test(src)) {
      gatedCount++;
    } else {
      ungated.push(rel);
    }
  }
  // Görünür rapor — 3 AYRI sayı; deferred sahte-PASS değil, follow-up gereksinimi görünür.
  console.log(`  [envanter] gated=${gatedCount} · explicit-excluded=${excludedCount} · DEFERRED=${deferred.length} (aromaterapi — server gate ERTELENDİ, ayrı follow-up PR gerekli)`);

  ok(unclassified.length === 0, `envanter: sınıflandırılamayan route YOK (${unclassified.slice(0, 5).join(", ")})`);
  ok(ungated.length === 0, `envanter: gate-required ama GATE'SİZ modül route YOK (${ungated.slice(0, 8).join(", ")})`);
  ok(gatedCount >= 90, `envanter: gate'li modül route sayısı (${gatedCount})`);
  ok(excludedCount >= 70, `envanter: explicit-exclude route sayısı (${excludedCount})`);
  ok(deferred.length === 20, `envanter: aromaterapi DEFERRED route sayısı = 20 (follow-up) (bulunan ${deferred.length})`);

  // ── 11) Premium bypass KALDIRMA (statik) ───────────────────────────────────
  const modPerms = readFileSync("lib/auth/modulePermissions.ts", "utf8");
  ok(!/if \(isPremiumExpertUser\(user\)\)/.test(modPerms), "premium: hasModulePermission/hasAny'de bypass KALDIRILDI");
  const homeSrc = readFileSync("app/page.tsx", "utf8");
  ok(!/if \(isPremiumExpertUser\(user\)\)\s*\{[\s\S]{0,80}PREMIUM_HOME_MODULE_KEYS/.test(homeSrc), "premium: home display bypass KALDIRILDI");

  // ── 12) requireModuleAccess + moduleAccess sözleşmeleri (statik) ───────────
  const userGuard = readFileSync("lib/auth/userGuard.ts", "utf8");
  ok(/requireModuleAccess/.test(userGuard) && /resolveModuleAccess/.test(userGuard) && /includeProfile: true/.test(userGuard), "requireModuleAccess: verifyUserRequest+profil+resolve");
  const modAccess = readFileSync("lib/auth/moduleAccess.ts", "utf8");
  ok(!/isPremiumExpertUser|package_type/.test(modAccess), "moduleAccess: Premium/paket bypass YOK");

  // ── 13) Premium backfill migration + module audit (statik) ─────────────────
  const bfMig = readFileSync("supabase/migrations/20260919000000_p3_module_permissions_backfill.sql", "utf8");
  ok(/module_permissions\s*=\s*COALESCE/i.test(bfMig) && /\|\|/.test(bfMig), "migration: premium backfill merge (||, kapatmaz)");
  ok(/role\s*=\s*'expert'/i.test(bfMig) && /premium/i.test(bfMig), "migration: yalnız premium expert");
  ok(!/human_design/i.test(bfMig.split("ROLLBACK")[0] ?? bfMig), "migration: human_design backfill'e DAHİL DEĞİL");
  const licRoute2 = readFileSync("app/api/admin/users/[id]/route.ts", "utf8");
  ok(/module_enabled/.test(licRoute2) && /module_disabled/.test(licRoute2), "module-audit: enabled/disabled actions");
  ok(!/Premium pakette modül izinleri değiştirilemez/.test(licRoute2), "module: Premium düzenleme engeli KALDIRILDI");

  console.log(`\nfaz1-p3-access-management harness (Commit 1+2): ${passed} PASS, ${failed} FAIL`);
  if (failed > 0) {
    console.log("Başarısızlar:", fails);
    process.exit(1);
  }
  console.log("✅ Commit 1+2 — oturum limitleri + modül server-gate + envanter kapsamı geçti.");
}

run();
