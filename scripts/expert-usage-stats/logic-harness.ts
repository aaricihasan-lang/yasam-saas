/**
 * UZMAN BAZLI KULLANIM İSTATİSTİKLERİ — FAZ 1 SAF MANTIK harness.
 *
 * Saf (yan-etkisiz) sözleşmeleri test eder: kanal resolver, olay sözlüğü + idempotency,
 * modül envanteri kapsamı, metric contract (null≠0). DB gerektirmez.
 * Çalıştır: npx tsx scripts/expert-usage-stats/logic-harness.ts
 */
import { resolveClientChannel, isClientChannel, CLIENT_CHANNELS, CLIENT_CHANNEL_HEADER } from "../../lib/auth/clientChannel";
import { USAGE_EVENT_TYPES, buildUsageIdempotencyKey } from "../../lib/usage/usageEvents";
import { MODULE_USAGE_REGISTRY, MODULE_USAGE_KEYS, INSTRUMENTED_USAGE_MODULES, LEGACY_TENANT_ID } from "../../lib/admin/stats/moduleUsageRegistry";
import { makeMetric, unavailableMetric, deriveUsed, classifyUsageWindow } from "../../lib/admin/stats/contract";
import { parseRange } from "../../lib/admin/stats/statsRequest";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}`); }
}

// ── (1) Kanal resolver (İP-3) ────────────────────────────────────────────────
console.log("\n[1] clientChannel resolver");
const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
const MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; Pixel) Mobile Safari";
const WEBVIEW_UA = "Mozilla/5.0 (Linux; Android 13; Pixel; wv) Version/4.0 Chrome/120 Mobile Safari";
const TABLET_UA = "Mozilla/5.0 (Linux; Android 13; SM-Tablet) Safari"; // android, no "mobile" → tablet
const IPAD_UA = "Mozilla/5.0 (iPad; CPU OS 16) Safari";

ok(resolveClientChannel(DESKTOP_UA, null) === "desktop_web", "desktop UA + işaret yok → desktop_web");
ok(resolveClientChannel(MOBILE_UA, null) === "mobile_web", "mobil UA + işaret yok → mobile_web");
ok(resolveClientChannel(TABLET_UA, null) === "tablet_web", "android tablet UA → tablet_web");
ok(resolveClientChannel(IPAD_UA, null) === "tablet_web", "iPad UA → tablet_web");
ok(resolveClientChannel("", null) === "unknown", "boş UA + işaret yok → unknown");
// KRİTİK: WebView UA işaret olmadan mobil web'den AYIRT EDİLEMEZ (mobile_web'e düşer).
ok(resolveClientChannel(WEBVIEW_UA, null) === "mobile_web", "WebView UA işaretSİZ → mobile_web (ayırt edilemez, dürüst fallback)");
// İşaret varsa android_app (UA ne olursa olsun).
ok(resolveClientChannel(WEBVIEW_UA, "android") === "android_app", "WebView UA + x-yasam-client:android → android_app");
ok(resolveClientChannel(MOBILE_UA, "android-app") === "android_app", "mobil UA + android-app işareti → android_app");
ok(resolveClientChannel(DESKTOP_UA, "bilinmeyen-deger") === "desktop_web", "tanınmayan işaret → UA fallback (yetki DEĞİL)");
ok(CLIENT_CHANNEL_HEADER === "x-yasam-client", "kanal header adı x-yasam-client");
ok(CLIENT_CHANNELS.length === 5 && isClientChannel("android_app") && !isClientChannel("android"), "kanal sözlüğü 5 değer + isClientChannel");

// ── (2) Olay sözlüğü + idempotency (İP-2C) ───────────────────────────────────
console.log("\n[2] usage events sözlüğü + idempotency");
ok(USAGE_EVENT_TYPES.includes("analysis_created") && USAGE_EVENT_TYPES.includes("protocol_created") && USAGE_EVENT_TYPES.includes("report_generated"), "olay sözlüğü çekirdek türleri içerir");
ok(buildUsageIdempotencyKey("numerology", "analysis_created", "abc") === "numerology:analysis_created:abc", "idempotency anahtarı deterministik format");
ok(buildUsageIdempotencyKey("stones", "record_created", "id1") !== buildUsageIdempotencyKey("stones", "record_created", "id2"), "farklı kaynak → farklı anahtar (çift-sayım önlenir)");

// ── (3) Modül envanteri (İP-2A) ──────────────────────────────────────────────
console.log("\n[3] modül envanteri");
ok(MODULE_USAGE_KEYS.length === 18, `18 kanonik modül (bulundu: ${MODULE_USAGE_KEYS.length})`);
ok(MODULE_USAGE_REGISTRY.numerology.recordSources[0].table === "numerology_records", "numeroloji kanonik tablo numerology_records (analyses DEĞİL)");
ok(MODULE_USAGE_REGISTRY.cosmic_calendar.hasDurableTrace === false && MODULE_USAGE_REGISTRY.ders_notu.hasDurableTrace === false, "kozmik + ders_notu durable-trace YOK");
ok([...INSTRUMENTED_USAGE_MODULES].every((k) => MODULE_USAGE_KEYS.includes(k)), "enstrümante modüller envanterin alt kümesi");
ok(INSTRUMENTED_USAGE_MODULES.has("numerology") && INSTRUMENTED_USAGE_MODULES.has("stones") && INSTRUMENTED_USAGE_MODULES.has("reflexology") && INSTRUMENTED_USAGE_MODULES.has("clients"), "enstrümante set = numerology/stones/reflexology/clients");
ok(LEGACY_TENANT_ID === "11111111-1111-1111-1111-111111111111", "legacy tenant sabiti");

// ── (4) Metric contract (null ≠ 0) ───────────────────────────────────────────
console.log("\n[4] metric contract");
const zero = makeMetric(0, "workspace", "measured", "record");
const na = unavailableMetric<number>("workspace", "record", "ölçülmüyor");
ok(zero.value === 0 && zero.status === "measured", "gerçek sıfır: value=0, status=measured");
ok(na.value === null && na.status === "unavailable", "ölçülemez: value=null, status=unavailable");
ok(zero.value !== na.value, "0 ile null KARIŞTIRILMAZ");

// ── (5) deriveUsed (negatif sonuç YALNIZ tam kapsamda; kısmi enstrümantasyonda null) ──
console.log("\n[5] deriveUsed (coverage-aware)");
ok(deriveUsed(3, null, false) === true, "kayıt>0 → true (olay ölçülmese/kapsam eksik olsa da)");
ok(deriveUsed(null, 2, false) === true, "olay>0 → true");
ok(deriveUsed(0, 0, false) === null, "kayıt=0 ∧ olay=0 ama kapsam EKSİK → null (used=false ÜRETİLMEZ)");
ok(deriveUsed(0, 0, true) === false, "kayıt=0 ∧ olay=0 ∧ TAM KAPSAM → false");
ok(deriveUsed(0, null, false) === null, "kayıt=0 ama olay ölçülemez → null");
ok(deriveUsed(null, 0, true) === null, "olay=0 ama kayıt ölçülemez → null (tam kapsamda bile)");
ok(deriveUsed(null, null, true) === null, "ikisi de ölçülemez → null");

// ── (7) classifyUsageWindow (İ1: tarih aralığı × ölçüm başlangıcı) ──
console.log("\n[7] classifyUsageWindow");
const START = "2027-01-10T00:00:00Z";
ok(classifyUsageWindow(null, null, null) === "unavailable", "başlangıç yok → unavailable (tarih uydurulmaz)");
ok(classifyUsageWindow(START, "2027-01-01T00:00:00Z", "2027-01-05T00:00:00Z") === "unavailable", "aralık başlangıçtan ÖNCE bitiyor → unavailable (measured=0 üretme)");
ok(classifyUsageWindow(START, "2027-01-05T00:00:00Z", "2027-01-20T00:00:00Z") === "approximate", "aralık başlangıcı kesiyor → approximate (kısmi)");
ok(classifyUsageWindow(START, null, "2027-01-20T00:00:00Z") === "approximate", "from yok (tüm zaman) → approximate (öncesi kapsanmaz)");
ok(classifyUsageWindow(START, "2027-01-15T00:00:00Z", "2027-01-20T00:00:00Z") === "measured", "aralık tamamen başlangıç sonrası → measured (gerçek sıfır/pozitif)");
ok(classifyUsageWindow(START, START, null) === "measured", "from == başlangıç → measured (tam kapsanır)");
ok(classifyUsageWindow(START, "2027-01-15T00:00:00Z", null) === "measured", "from>start, to yok → measured");

// ── (6) parseRange KATI (geçersiz/ters → hata; verilmeyen → null) ──
console.log("\n[6] parseRange (katı doğrulama)");
const mk = (o: Record<string, string>) => new URLSearchParams(o);
const rEmpty = parseRange(mk({}));
ok(rEmpty.ok === true && rEmpty.range.from === null && rEmpty.range.to === null, "parametre yok → ok, filtre yok");
const rValid = parseRange(mk({ from: "2027-01-01T00:00:00Z", to: "2027-02-01T00:00:00Z" }));
ok(rValid.ok === true && rValid.range.from !== null && rValid.range.to !== null, "geçerli aralık → ok");
ok(parseRange(mk({ from: "not-a-date" })).ok === false, "geçersiz from → HATA (sessizce filtresiz DEĞİL)");
ok(parseRange(mk({ to: "13/13/2027" })).ok === false, "geçersiz to → HATA");
ok(parseRange(mk({ from: "2027-02-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).ok === false, "ters aralık (from>=to) → HATA");
ok(parseRange(mk({ from: "2027-01-01T00:00:00Z", to: "2027-01-01T00:00:00Z" })).ok === false, "from==to → HATA");

console.log(`\n──────────\nLOGIC: PASS ${passed} · FAIL ${failed}`);
if (failed > 0) process.exit(1);
