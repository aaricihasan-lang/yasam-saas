/**
 * ÜYE YÖNETİMİ FAZ 1 — SAF MANTIK + KAYNAK SÖZLEŞMESİ harness (DB/ağ YOK).
 *
 * Kapsam: lisans limiti semantiği (MEM-001), modül kataloğu/whitelist tek kaynak (MEM-005/008),
 * onay modül doğrulaması (MEM-004), profil doğrulama (MEM-002/011), yeni üyelik göstergesi ve
 * erişim modeli (MEM-013/014), UI kaynak sözleşmesi (MEM-003/007).
 *
 * Çalıştır: npx tsx scripts/uye-yonetimi-faz1/unit.harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ADMIN_MODULE_KIND,
  ADMIN_MODULE_UI_DESCRIPTIONS,
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  DEFAULT_ADMIN_MODULE_PERMISSIONS,
  DEFAULT_LICENSE_SETTINGS,
  LICENSE_PRESETS,
  adminModuleAliasKeys,
  buildManagedMembershipDisplay,
  enabledAccessModules,
  mapDbUser,
  parseAdminModulePermissions,
  parseLicenseSettings,
  validateApprovalModules,
  validateModuleChanges,
  type LicenseSettings,
} from "../../lib/admin/userManagement";
import {
  analyzeLockout,
  diffLicenseSettings,
  formatLimitLabel,
  isLimitExceeded,
  licenseSettingsEqual,
  validateLicensePayload,
} from "../../lib/admin/licenseLimits";
import { isUuid, rpcErrorStatus, validateProfileEdit } from "../../lib/admin/memberRequestValidation";
import { MODULE_ALIASES } from "../../lib/auth/moduleAccessCore";
import { MODULE_ROUTE_PREFIXES } from "../../lib/auth/moduleRouteRegistry";
import { hasExpertMembershipAccess, buildPremiumMembershipPayload } from "../../lib/auth/membership";
import { ADMIN_AUDIT_ACTIONS } from "../../lib/admin/adminAudit";
import type { YasamUser } from "../../lib/auth/yasamUser";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

// ─── MEM-001: lisans limiti semantiği ────────────────────────────────────────
console.log("\n[MEM-001] Lisans / cihaz limiti");
const rowUnlimited = { allowed_active_sessions: -1, allowed_desktop_sessions: -1, allowed_mobile_sessions: -1, allowed_tablet_sessions: -1, allowed_unknown_sessions: -1, allowed_locations: 1 };
const pu = parseLicenseSettings(rowUnlimited);
ok(pu.allowedActiveSessions === -1 && pu.allowedDesktopSessions === -1 && pu.allowedMobileSessions === -1 && pu.allowedTabletSessions === -1 && pu.allowedUnknownSessions === -1, "-1 → parse → -1 (Math.max dönüşümü YOK)");
const rowZero = { allowed_active_sessions: 4, allowed_desktop_sessions: 0, allowed_mobile_sessions: 0, allowed_tablet_sessions: 2, allowed_unknown_sessions: 0 };
const pz = parseLicenseSettings(rowZero);
ok(pz.allowedDesktopSessions === 0 && pz.allowedMobileSessions === 0 && pz.allowedUnknownSessions === 0 && pz.allowedTabletSessions === 2 && pz.allowedActiveSessions === 4, "0 → 0 ve N → N korunur");
const pn = parseLicenseSettings({});
ok(pn.allowedActiveSessions === -1 && pn.allowedTabletSessions === -1, "null/eksik → -1 (DB default + server normalizeLimit ile aynı)");
// round-trip: parse → validate (UI gönderimi) → aynı değerler
for (const r of [rowUnlimited, rowZero]) {
  const s = parseLicenseSettings(r);
  const v = validateLicensePayload({ ...s });
  ok(v.ok && licenseSettingsEqual(v.value, s), `round-trip kayıpsız (${JSON.stringify(r).slice(0, 40)}…)`);
}
ok(isLimitExceeded(0, -1) === false, "0 aktif / -1 limit → Limit Aşıldı DEĞİL");
ok(isLimitExceeded(50, -1) === false, "50 aktif / -1 limit → Limit Aşıldı DEĞİL");
ok(isLimitExceeded(1, 0) === true && isLimitExceeded(0, 0) === false, "0 limit: 1 oturum aşım, 0 oturum değil");
ok(isLimitExceeded(3, 2) === true && isLimitExceeded(2, 2) === false, "N limit: current > N");
ok(formatLimitLabel(-1) === "Sınırsız" && formatLimitLabel(0) === "Kapalı" && formatLimitLabel(3) === "3", "etiket: Sınırsız / Kapalı / N");
const allZero: LicenseSettings = { ...DEFAULT_LICENSE_SETTINGS, allowedDesktopSessions: 0, allowedMobileSessions: 0, allowedTabletSessions: 0, allowedUnknownSessions: 0 };
ok(analyzeLockout(allZero).fullLockout === true, "tüm cihaz türleri 0 → fullLockout");
ok(analyzeLockout({ ...DEFAULT_LICENSE_SETTINGS, allowedActiveSessions: 0 }).fullLockout === true, "toplam 0 → fullLockout");
ok(analyzeLockout({ ...allZero, securityExempt: true }).fullLockout === false, "güvenlik istisnası → kilitlenme yok (limitler atlanır)");
ok(analyzeLockout({ ...allZero, allowedMobileSessions: -1 }).fullLockout === false, "bir cihaz türü açık → kilitlenme yok");
ok(analyzeLockout(DEFAULT_LICENSE_SETTINGS).fullLockout === false, "varsayılan (-1) → kilitlenme yok");
ok(DEFAULT_LICENSE_SETTINGS.allowedActiveSessions === -1 && DEFAULT_LICENSE_SETTINGS.allowedUnknownSessions === -1, "DEFAULT_LICENSE_SETTINGS = DB default (-1)");
ok(LICENSE_PRESETS.every((p) => analyzeLockout(p.settings).closedDevices.length === 0), "hazır presetler HİÇBİR cihaz türünü kapatmaz (eski 0 → -1)");
ok(diffLicenseSettings(pu, pu).length === 0, "diff: değişiklik yok → boş");
const d1 = diffLicenseSettings(pu, { ...pu, allowedMobileSessions: 0 });
ok(d1.length === 1 && d1[0].before === "Sınırsız" && d1[0].after === "Kapalı", "diff: Sınırsız → Kapalı açıkça gösterilir");
ok(!JSON.stringify(diffLicenseSettings(pu, { ...pu, licenseNote: "özel not" })).includes("özel not"), "diff: not içeriği gösterilmez");
const baseLic = { ...DEFAULT_LICENSE_SETTINGS };
ok(!validateLicensePayload({ ...baseLic, allowedMobileSessions: "3" }).ok, "doğrulama: string sayı reddedilir");
ok(!validateLicensePayload({ ...baseLic, allowedMobileSessions: 101 }).ok, "doğrulama: 101 reddedilir");
ok(!validateLicensePayload({ ...baseLic, allowedMobileSessions: -2 }).ok, "doğrulama: -2 reddedilir");
ok(!validateLicensePayload({ ...baseLic, allowedMobileSessions: undefined }).ok, "doğrulama: eksik alan reddedilir (sessiz -1 yok)");
ok(validateLicensePayload({ ...baseLic, allowedMobileSessions: 100 }).ok, "doğrulama: 100 kabul");

// ─── MEM-005/008: modül kataloğu = whitelist (tek kaynak) ─────────────────────
console.log("\n[MEM-005/008] Modül kataloğu / whitelist");
const gateKeys = Object.keys(MODULE_ALIASES);
const missing = gateKeys.filter((k) => !(ADMIN_MODULE_UI_KEYS as readonly string[]).includes(k));
ok(missing.length === 0, `her server modül kapısı anahtarı admin UI'da yönetilebilir (eksik: ${missing.join(",") || "yok"})`);
const registryKeys = new Set(MODULE_ROUTE_PREFIXES.map((r) => r.key));
ok([...registryKeys].every((k) => (ADMIN_MODULE_UI_KEYS as readonly string[]).includes(k)), "moduleRouteRegistry'deki tüm route anahtarları admin whitelist'inde");
ok((ADMIN_MODULE_UI_KEYS as readonly string[]).includes("human_design"), "Human Design (human_design) yönetilebilir");
ok((ADMIN_MODULE_UI_KEYS as readonly string[]).includes("cosmic_calendar"), "Kozmik Takvim (cosmic_calendar) yönetilebilir");
ok(MODULE_ROUTE_PREFIXES.some((r) => r.prefix === "app/api/hacamat" && r.key === "cosmic_calendar"), "hacamat kural/rapor uçları cosmic_calendar kapısında (doğrulandı)");
ok(MODULE_ROUTE_PREFIXES.some((r) => r.prefix === "app/api/kupa" && r.key === "cupping"), "Kupa & Hacamat modülü cupping kapısında (ayrı anahtar)");
ok(!(ADMIN_MODULE_UI_KEYS as readonly string[]).includes("yasam_hafizasi"), "yasam_hafizasi admin toggle listesinde YOK (yalnız atomik YH kuralı)");
ok(ADMIN_MODULE_UI_KEYS.every((k) => typeof ADMIN_MODULE_UI_LABELS[k] === "string" && ADMIN_MODULE_UI_LABELS[k].length > 0), "her anahtarın etiketi var");
ok(ADMIN_MODULE_UI_KEYS.every((k) => ADMIN_MODULE_KIND[k] !== undefined), "her anahtarın türü (module/hub/capability) var");
ok(ADMIN_MODULE_UI_KEYS.every((k) => DEFAULT_ADMIN_MODULE_PERMISSIONS[k] === false), "varsayılan izinler fail-closed false");
ok(Boolean(ADMIN_MODULE_UI_DESCRIPTIONS.cosmic_calendar?.includes("hacamat")), "cosmic_calendar açıklaması hacamat ilişkisini belirtir");
ok(JSON.stringify(adminModuleAliasKeys("cupping").sort()) === JSON.stringify(["hacamat_terapi", "kupa"]), "cupping alias'ları: kupa + hacamat_terapi");
ok(validateModuleChanges({ human_design: true }).ok, "whitelist: human_design kabul");
ok(!validateModuleChanges({ is_admin: true }).ok, "whitelist: is_admin reddedilir");
ok(!validateModuleChanges({ yasam_hafizasi: true }).ok, "whitelist: yasam_hafizasi reddedilir");
ok(!validateModuleChanges({ dogaltas: true }).ok, "whitelist: TR alias reddedilir (kanonik anahtar zorunlu)");
ok(!validateModuleChanges({ numerology: 1 }).ok && !validateModuleChanges({ numerology: "true" }).ok && !validateModuleChanges({ numerology: null }).ok, "whitelist: non-boolean reddedilir");
ok(!validateModuleChanges([]).ok && !validateModuleChanges(null).ok && !validateModuleChanges({}).ok, "whitelist: dizi/null/boş reddedilir");
const legacy = parseAdminModulePermissions({ dogaltas: true, stones: false, human_design: true });
ok(legacy.stones === true && legacy.human_design === true, "parse: legacy alias + HD okunur");

// ─── MEM-004: onay modül seçimi ──────────────────────────────────────────────
console.log("\n[MEM-004] Onay modül seçimi");
ok(!validateApprovalModules([]).ok, "boş seçim → reddedilir");
ok(!validateApprovalModules(undefined).ok, "seçim yok → reddedilir");
ok(!validateApprovalModules(["digital_content"]).ok, "yalnız hub kartı → reddedilir (gerçek modül yok)");
ok(!validateApprovalModules(["beslenme_manual_food"]).ok, "yalnız ek yetenek → reddedilir");
ok(!validateApprovalModules(["numerology", "foo"]).ok, "bilinmeyen anahtar → reddedilir");
const va = validateApprovalModules(["human_design", "numerology", "numerology"]);
ok(va.ok && va.selected.length === 2, "tekrarlar tekilleştirilir");
ok(va.ok && ADMIN_MODULE_UI_KEYS.every((k) => va.fullMap[k] === (k === "human_design" || k === "numerology")), "fullMap: yalnız seçilenler true, diğer TÜM anahtarlar false");
ok(enabledAccessModules({ ...DEFAULT_ADMIN_MODULE_PERMISSIONS, digital_content: true, beslenme_manual_food: true }).length === 0, "açık modül sayısı hub/yeteneği saymaz");

// ─── MEM-002/011: profil doğrulama ───────────────────────────────────────────
console.log("\n[MEM-002/011] Profil doğrulama");
const goodProfile = { action: "edit", fullName: "Ad Soyad", email: "a@b.co", role: "expert" };
ok(validateProfileEdit(goodProfile).ok, "geçerli profil kabul");
ok(!validateProfileEdit({ ...goodProfile, active: true }).ok && !validateProfileEdit({ ...goodProfile, active: false }).ok, "active alanı REDDEDİLİR (true/false)");
ok(!validateProfileEdit({ ...goodProfile, extra: 1 }).ok, "beklenmeyen alan reddedilir");
ok(!validateProfileEdit({ ...goodProfile, email: "abc" }).ok, "geçersiz e-posta reddedilir");
ok(!validateProfileEdit({ ...goodProfile, fullName: "x".repeat(121) }).ok, "121 karakter isim reddedilir");
ok(!validateProfileEdit({ ...goodProfile, fullName: "a\u0000b" }).ok, "kontrol karakterli isim reddedilir");
ok(!validateProfileEdit({ ...goodProfile, role: "owner" }).ok, "bilinmeyen rol reddedilir (sessiz expert'e çevirme YOK)");
ok(isUuid("00000000-0000-4000-8000-000000000001") && !isUuid("1") && !isUuid("00000000-0000-4000-8000-00000000000g"), "UUID doğrulama");
ok(rpcErrorStatus({ code: "UY001" }) === 409 && rpcErrorStatus({ code: "UY002" }) === 409 && rpcErrorStatus({ code: "UY003" }) === 400 && rpcErrorStatus({ code: "23505" }) === 500, "RPC hata eşleme (409/400/500)");

// ─── MEM-013/014: yeni üyelik modeli ─────────────────────────────────────────
console.log("\n[MEM-013/014] Premium-only model + göstergeler");
ok(buildManagedMembershipDisplay({ role: "expert", approvalStatus: "approved", active: true }).packageLabel === "Premium", "onaylı uzman → Premium");
ok(buildManagedMembershipDisplay({ role: "expert", approvalStatus: "approved", active: false }).statusLabel === "Pasif", "pasif → 'Pasif' (Üyelik: Aktif çelişkisi yok)");
ok(buildManagedMembershipDisplay({ role: "expert", approvalStatus: "pending", active: false }).packageLabel === "Onay bekliyor", "pending → Onay bekliyor");
const mTrial = mapDbUser({ id: "x", role: "expert", approval_status: "approved", active: true, package_type: "trial", plan: "trial" });
ok(mTrial.membershipDisplay.packageLabel === "Premium" && !/Deneme|Pro\b/.test(JSON.stringify(mTrial.membershipDisplay)), "legacy trial satırı: gösterimde Deneme/Pro YOK");
const u = (o: Partial<YasamUser>) => ({ id: "x", role: "expert", ...o }) as YasamUser;
ok(hasExpertMembershipAccess(u({ active: true, approval_status: "approved", package_type: "trial" })) === true, "erişim: onaylı+aktif (legacy trial) → VAR (server ile aynı)");
ok(hasExpertMembershipAccess(u({ active: true, approval_status: "approved", package_type: "pro" })) === true, "erişim: onaylı+aktif (legacy pro) → VAR");
ok(hasExpertMembershipAccess(u({ active: false, approval_status: "approved", package_type: "premium" })) === false, "erişim: pasif → YOK");
ok(hasExpertMembershipAccess(u({ active: true, approval_status: "pending", package_type: "premium" })) === false, "erişim: pending → YOK");
ok(hasExpertMembershipAccess(u({ active: true, approval_status: "rejected" })) === false, "erişim: rejected → YOK");
const prem = buildPremiumMembershipPayload();
ok(prem.package_type === "premium" && prem.plan === "premium" && prem.trial_ends_at === null, "onay payload'ı yalnız Premium (trial alanları null)");
const membershipSrc = read("lib/auth/membership.ts");
ok(!/TRIAL_DURATION_MS|"3 günlük deneme süresi"|plan === "trial"|plan === "pro"/.test(membershipSrc), "membership.ts: Deneme/Pro üretim yolu KALDIRILDI");
const umSrc = read("lib/admin/userManagement.ts");
ok(!/PACKAGE_PLAN_OPTIONS|isExpertModuleEnabled/.test(umSrc), "userManagement: paket seçimi + premium=tüm-modül yardımcıları KALDIRILDI");

// ─── MEM-010: audit sözleşmesi ───────────────────────────────────────────────
console.log("\n[MEM-010] Audit action sözleşmesi");
for (const a of ["user_profile_updated", "license_settings_changed", "security_exempt_changed"]) {
  ok((ADMIN_AUDIT_ACTIONS as readonly string[]).includes(a), `TS audit action: ${a}`);
}
const mig = read("supabase/migrations/20270128000000_admin_member_phase1_hardening.sql");
for (const a of ADMIN_AUDIT_ACTIONS) ok(mig.includes(`'${a}'`), `migration CHECK süperseti içerir: ${a}`);

// ─── UI kaynak sözleşmesi (MEM-003/004/007/013) ──────────────────────────────
console.log("\n[UI] Detay sayfası sözleşmesi");
const page = read("app/admin/users/[id]/page.tsx");
ok(/user\.role === "expert" && user\.approvalStatus === "pending" \? \(/.test(page), "Onayla/Reddet yalnız PENDING uzmanda render edilir");
ok(/onClick=\{\(\) => setRejectOpen\(true\)\}/.test(page) && /confirmReject/.test(page), "Reddet → onay modalı (tek tık ret YOK)");
ok(/Yeniden Onayla/.test(page), "reddedilmiş uzman için kontrollü 'Yeniden Onayla'");
ok(/openApproveModal/.test(page) && /ModuleCheckboxGrid/.test(page) && /disabled=\{actionUserId === user\.id \|\| !approveHasModule\}/.test(page), "Onay modalı modül seçimi zorunlu (modülsüz submit disabled)");
ok(/modül erişime açıldı/.test(page), "başarı mesajı açılan modül sayısını bildirir");
ok(!/Mevcut modül izinleri korundu/.test(page), "eski eksik mesaj ('Premium yapıldı') kaldırıldı");
ok(/changes: \{ \[key\]: nextValue \}/.test(page) && !/modulePermissions: adminPermissionsToPayload/.test(page), "modül toggle YALNIZ değişen anahtarı gönderir");
ok(!/active: editForm\.active/.test(page) && !/active: user\.active,\s*modulePermissions/.test(page), "profil formu active göndermez");
ok(!/\?\s*"VAR"\s*:\s*"YOK"/.test(page), "sabit 'Erişim VAR/YOK' kaldırıldı (gerçek modül sayısı)");
ok(!/Üyelik Durumu/.test(page) && /Hesap Durumu/.test(page), "'Üyelik Durumu' → 'Hesap Durumu' (Aktif/Pasif)");
ok(!/border-emerald-200 bg-emerald-50 text-emerald-950`\}\s*>\s*\{user\.active \?/.test(page) && /border-slate-300 bg-slate-100 text-slate-800/.test(page), "Pasif Yap yeşil DEĞİL (nötr/gri)");
ok(/isLimitExceeded\(s\.totalFresh, lim\.allowedActiveSessions\)/.test(page), "'Limit Aşıldı' sınırsız-farkında hesap");
ok(/licenseLockoutAck/.test(page) && /confirmLockout/.test(page), "kilitleyici lisans ayarı açık onay ister");
ok(/diffLicenseSettings\(user\.licenseSettings, licenseDraft\)/.test(page), "lisans kaydı önce/sonra farkını gösterir");
ok(!/Math\.max\(1, Number\(row\.allowed/.test(umSrc), "parseLicenseSettings'te Math.max dönüşümü YOK");

console.log(`\n──────────\nFAZ 1 UNIT: PASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
