/**
 * Beslenme — Manuel Besin İZİN harness (SAF; DB'ye BAĞLANMAZ). Kapsam:
 *   P. Admin izin kaydı: beslenme_manual_food registry'de + label + DEFAULT false.
 *   Q. parse/payload round-trip: bayrak boolean-true okunur; string "true"/1 SAYILMAZ; DİĞER
 *      izin alanları KORUNUR (wholesale-write silmez); alias'lar bozulmaz.
 *   R. PREMIUM bayrağı OTOMATİK vermez (yalnız açık grant).
 *   S. page/guard kararının parse edilmiş bayrakla tutarlılığı (decideFoodContributorAuthority).
 */
import {
  ADMIN_MODULE_UI_KEYS,
  ADMIN_MODULE_UI_LABELS,
  DEFAULT_ADMIN_MODULE_PERMISSIONS,
  parseAdminModulePermissions,
  adminPermissionsToPayload,
  premiumAdminModulePermissions,
  mergeAdminModulePermissions,
} from "@/lib/admin/userManagement";
import { decideFoodContributorAuthority, hasManualFoodFlag } from "@/lib/beslenme/foodContributorPolicy";

let pass = 0, fail = 0; const fails: string[] = [];
const chk = (name: string, cond: boolean) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; fails.push(name); console.log(`  FAIL  ${name}`); } };

const FLAG = "beslenme_manual_food";

// ── P. registry integrity ──
console.log("── P. Admin izin kaydı ──");
chk("P1 ADMIN_MODULE_UI_KEYS bayrağı içerir", (ADMIN_MODULE_UI_KEYS as readonly string[]).includes(FLAG));
chk("P2 label var (Manuel Besin Yönetimi)", ADMIN_MODULE_UI_LABELS[FLAG as keyof typeof ADMIN_MODULE_UI_LABELS] === "Manuel Besin Yönetimi");
chk("P3 DEFAULT false (grant-only)", DEFAULT_ADMIN_MODULE_PERMISSIONS[FLAG as keyof typeof DEFAULT_ADMIN_MODULE_PERMISSIONS] === false);

// ── Q. parse / payload round-trip + diğer alan koruması ──
console.log("── Q. parse/payload round-trip ──");
{
  // Uzmanın DB kaydı: bazı gerçek modüller + bizim bayrak true + alakasız extra
  const raw = { numerology: true, stones: false, [FLAG]: true, yasam_hafizasi: true };
  const parsed = parseAdminModulePermissions(raw);
  chk("Q1 bayrak true okunur", parsed[FLAG as keyof typeof parsed] === true);
  chk("Q1 diğer modül (numerology) korunur", parsed.numerology === true);

  const payload = adminPermissionsToPayload(parsed);
  chk("Q2 payload bayrağı içerir (wholesale-write silmez)", payload[FLAG] === true);
  chk("Q2 payload numerology korunur", payload.numerology === true);
  // payload TÜM registry anahtarlarını taşır → route overwrite hiçbir UI iznini düşürmez
  chk("Q2 payload tüm registry anahtarlarını taşır", ADMIN_MODULE_UI_KEYS.every((k) => k in payload));
}
{
  const parsedMissing = parseAdminModulePermissions({ numerology: true });
  chk("Q3 bayrak yoksa false (default)", parsedMissing[FLAG as keyof typeof parsedMissing] === false);
}
{
  // string "true" / number 1 → boolean DEĞİL → false (server hasManualFoodFlag ile tutarlı)
  const parsedStr = parseAdminModulePermissions({ [FLAG]: "true" });
  chk("Q4 string 'true' → false", parsedStr[FLAG as keyof typeof parsedStr] === false);
  const parsedNum = parseAdminModulePermissions({ [FLAG]: 1 });
  chk("Q4 number 1 → false", parsedNum[FLAG as keyof typeof parsedNum] === false);
}
{
  // alias yolları bozulmadı (danisan_yonetimi → clients hâlâ çalışır)
  const parsedAlias = parseAdminModulePermissions({ danisan_yonetimi: true, [FLAG]: true });
  chk("Q5 alias (danisan_yonetimi→clients) korunur", parsedAlias.clients === true && parsedAlias[FLAG as keyof typeof parsedAlias] === true);
}

// ── R. premium OTOMATİK vermez ──
console.log("── R. Premium otomatik vermez ──");
{
  const premium = premiumAdminModulePermissions();
  chk("R1 premium payload bayrağı AÇMAZ (yalnız açık grant)", premium[FLAG as keyof typeof premium] === false);
}

// ── S. guard kararı parse edilmiş bayrakla tutarlı ──
console.log("── S. guard kararı tutarlılığı ──");
{
  // Admin bayrağı açtı → DB'de boolean true → hasManualFoodFlag true → expert authority
  const grantedRaw = { [FLAG]: true };
  chk("S1 grant → hasManualFoodFlag true", hasManualFoodFlag(grantedRaw) === true);
  chk("S1 grant + non-owner → 'expert'", decideFoodContributorAuthority(false, grantedRaw) === "expert");

  // Bayrak kapalı → yetkisiz (null → 403 / sayfa redirect)
  const revokedRaw = { [FLAG]: false, numerology: true };
  chk("S2 revoke → hasManualFoodFlag false", hasManualFoodFlag(revokedRaw) === false);
  chk("S2 revoke + non-owner → null (erişim yok)", decideFoodContributorAuthority(false, revokedRaw) === null);

  // owner (super-admin) bayrak olmasa da geçer (küratör)
  chk("S3 owner → 'owner' (bayrak gereksiz)", decideFoodContributorAuthority(true, {}) === "owner");
}

// ── T. GÜVENLİ birleştirme: UI'nın yönetmediği izinler kaydederken KORUNUR ──
// (REGRESYON: "Manuel Besin Yönetimi" grant'ı human_design/cosmic_calendar'ı REVOKE etmemeli)
console.log("── T. Unmanaged izin koruması (merge) ──");
{
  // Gerçek prod senaryosu: uzmanda human_design + cosmic_calendar + yasam_hafizasi var.
  // Admin, "Manuel Besin Yönetimi"ni AÇMAK için modülleri kaydeder.
  const oldPerms = {
    clients: true, danisan_yonetimi: true, human_design: true,
    cosmic_calendar: true, yasam_hafizasi: true, numerology: true,
  };
  const parsed = parseAdminModulePermissions({ ...oldPerms, [FLAG]: true }); // admin toggle: flag on
  const uiPayload = adminPermissionsToPayload(parsed);
  const merged = mergeAdminModulePermissions(oldPerms, uiPayload);

  chk("T1 human_design KORUNUR (revoke YOK)", merged.human_design === true);
  chk("T1 cosmic_calendar KORUNUR", merged.cosmic_calendar === true);
  chk("T1 yasam_hafizasi KORUNUR", merged.yasam_hafizasi === true);
  chk("T2 yeni flag uygulanır (beslenme_manual_food=true)", merged[FLAG] === true);
  chk("T2 registry modülü uygulanır (clients=true)", merged.clients === true);
  // UI-managed alias düşürülür (canonical'a göç; mevcut davranış)
  chk("T3 UI-managed alias (danisan_yonetimi) düşürülür", !("danisan_yonetimi" in merged));
}
{
  // Başka bir modül kaydı, ÖNCEDEN verilmiş beslenme_manual_food'u REVOKE etmemeli
  const oldPerms = { [FLAG]: true, human_design: true };
  // Admin numerology açar; parse flag'i true okur (registry'de) → uiPayload flag'i taşır
  const parsed = parseAdminModulePermissions({ ...oldPerms, numerology: true });
  const merged = mergeAdminModulePermissions(oldPerms, adminPermissionsToPayload(parsed));
  chk("T4 önceki flag korunur (başka modül kaydında)", merged[FLAG] === true);
  chk("T4 human_design yine korunur", merged.human_design === true);
}
{
  // non-boolean unmanaged değer boolean'a coerce
  const merged = mergeAdminModulePermissions({ some_future_flag: "yes", other_flag: true }, adminPermissionsToPayload(DEFAULT_ADMIN_MODULE_PERMISSIONS));
  chk("T5 unmanaged string 'yes' → false (coerce)", merged.some_future_flag === false);
  chk("T5 unmanaged true → korunur", merged.other_flag === true);
}
{
  // gelecekteki bilinmeyen yetenek bayrağı korunur (future-proof)
  const merged = mergeAdminModulePermissions({ future_capability_x: true }, adminPermissionsToPayload(DEFAULT_ADMIN_MODULE_PERMISSIONS));
  chk("T6 gelecekteki bilinmeyen bayrak korunur", merged.future_capability_x === true);
}

console.log(`\n${"=".repeat(52)}\n  MANUEL BESİN İZİN HARNESS: ${pass} PASS / ${fail} FAIL`);
if (fail) { console.log("  FAILURES:\n   - " + fails.join("\n   - ")); process.exit(1); }
console.log("  ✅ İzin kaydı + round-trip + premium-off + guard tutarlılığı GEÇTİ"); process.exit(0);
