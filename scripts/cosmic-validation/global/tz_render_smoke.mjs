/**
 * scripts/cosmic-validation/global/tz_render_smoke.mjs
 * FAZ 5 / P5e-1 — Timezone render helper doğrulama scripti.
 *
 * lib/location/tz.ts helper'larını (P5a) bilinen IANA offset/DST değerleriyle ve
 * Türkiye'nin mevcut UTC+3 (isoTR) davranışıyla doğrular. SWE/astronomi GEREKTİRMEZ;
 * saf Intl karşılaştırması. Motor/UI/DB'ye dokunmaz.
 *
 * Çalıştırma:  node scripts/cosmic-validation/global/tz_render_smoke.mjs
 * Çıktı: her kontrol için PASS/FAIL + Istanbul regresyon uyumsuz sayısı; exit 0/1.
 *
 * NOT: Bu aşamada run-all'a BAĞLI DEĞİLDİR (P5e-4'te bağlanacak).
 */
import {
  formatInTimeZone,
  getTimeZoneOffsetMinutes,
  isValidTimeZone,
} from "../../../lib/location/tz.ts";

// Kuzey yarımküre: Ocak = kış, Temmuz = yaz. (Güney yarımkürede tersi.)
const WINTER = new Date("2026-01-15T12:00:00Z"); // Ocak
const SUMMER = new Date("2026-07-15T12:00:00Z"); // Temmuz

// isoTR referansı — lib/cosmic/eclipses.ts'in UTC+3-sabit davranışının BAĞIMSIZ kopyası
// (motor import edilmez; yalnız beklenen davranış yeniden türetilir).
const TR_OFFSET_MS = 3 * 3_600_000;
function isoTR(d) {
  const t = new Date(d.getTime() + TR_OFFSET_MS);
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}T${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}+03:00`;
}

let fail = 0;
const rows = [];
function check(name, cond, detail = "") {
  const ok = Boolean(cond);
  rows.push({ name, ok, detail });
  if (!ok) fail++;
}

const offW = (tz) => getTimeZoneOffsetMinutes(WINTER, tz);
const offS = (tz) => getTimeZoneOffsetMinutes(SUMMER, tz);

// ── 1) Europe/Istanbul — sabit +180 (DST yok) ──
check("Europe/Istanbul kış  +180", offW("Europe/Istanbul") === 180, `gerçek ${offW("Europe/Istanbul")}`);
check("Europe/Istanbul yaz  +180", offS("Europe/Istanbul") === 180, `gerçek ${offS("Europe/Istanbul")}`);

// ── 2) Istanbul isoTR REGRESYON — 200 örnek, 0 uyumsuz ──
let istMismatch = 0;
for (let i = 0; i < 200; i++) {
  const d = new Date(Date.UTC(2026, 0, 1) + i * 7 * 86_400_000 + i * 137 * 60_000);
  if (isoTR(d).slice(11, 16) !== formatInTimeZone(d, "Europe/Istanbul")) istMismatch++;
}
check(`Istanbul isoTR regresyon (200 örnek)`, istMismatch === 0, `uyumsuz ${istMismatch}`);

// ── 3) Europe/Berlin — kış +60 / yaz +120 (EU DST) ──
check("Europe/Berlin kış  +60",  offW("Europe/Berlin") === 60,  `gerçek ${offW("Europe/Berlin")}`);
check("Europe/Berlin yaz  +120", offS("Europe/Berlin") === 120, `gerçek ${offS("Europe/Berlin")}`);

// ── 4) America/New_York — kış -300 / yaz -240 (US DST) ──
check("America/New_York kış  -300", offW("America/New_York") === -300, `gerçek ${offW("America/New_York")}`);
check("America/New_York yaz  -240", offS("America/New_York") === -240, `gerçek ${offS("America/New_York")}`);

// ── 5) Asia/Tokyo — sabit +540 (DST yok) ──
check("Asia/Tokyo kış  +540", offW("Asia/Tokyo") === 540, `gerçek ${offW("Asia/Tokyo")}`);
check("Asia/Tokyo yaz  +540", offS("Asia/Tokyo") === 540, `gerçek ${offS("Asia/Tokyo")}`);

// ── 6) Australia/Sydney — TERS mevsim: Ocak +660 / Temmuz +600 ──
check("Australia/Sydney Ocak  +660", offW("Australia/Sydney") === 660, `gerçek ${offW("Australia/Sydney")}`);
check("Australia/Sydney Temmuz +600", offS("Australia/Sydney") === 600, `gerçek ${offS("Australia/Sydney")}`);

// ── 7) isValidTimeZone ──
check("isValidTimeZone geçerli",  isValidTimeZone("Europe/Istanbul") && isValidTimeZone("America/New_York"));
check("isValidTimeZone geçersiz", !isValidTimeZone("Foo/Bar") && !isValidTimeZone(""));

// ── Rapor ──
console.log("═══ FAZ 5 / P5e-1 — Timezone Render Smoke ═══");
for (const r of rows) {
  console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\nIstanbul regresyon uyumsuz sayısı: ${istMismatch}`);
console.log(fail === 0
  ? "\nSONUÇ: ✅ PASS — tüm timezone kontrolleri geçti (exit 0)"
  : `\nSONUÇ: ❌ FAIL — ${fail} kontrol başarısız (exit 1)`);

process.exit(fail === 0 ? 0 : 1);
