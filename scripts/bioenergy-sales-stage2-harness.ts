/**
 * BİYOENERJİ SATIŞ ÖNCESİ — AŞAMA 2 doğrulama harness'i (saf mantık).
 *
 * Kod:  npx tsx scripts/bioenergy-sales-stage2-harness.ts
 *
 * Kapsam (yalnız yan-etkisiz saf birimler; React/DOM davranışları AŞAMA 3 tarayıcı):
 *  - BIO-005: sunucu-canonical alan doğrulama (tip / maxLength / required; POST vs PATCH).
 *  - BIO-009: baş/son boşluk trim; iç boşluk & newline KORUNUR; null/"" korunur.
 *  - BIO-007: Android User-Agent tespiti (Word indirme kapatma kararı çekirdeği).
 */
import {
  getBioResource,
  validateBioFields,
} from "../lib/biyoenerji/resourceConfig";
import { isAndroidUserAgent } from "../lib/platform/android";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sessions = getBioResource("sessions")!;
const chakras = getBioResource("chakras")!;

// ── BIO-005: required (POST) ────────────────────────────────────────────────
check(
  "POST: boş title reddedilir (required)",
  validateBioFields(sessions, { title: "   ", content: "x" }, { partial: false }).ok === false,
);
check(
  "POST: eksik title reddedilir",
  validateBioFields(sessions, { content: "x" }, { partial: false }).ok === false,
);
check(
  "POST: geçerli title kabul edilir",
  validateBioFields(sessions, { title: "Seans 1" }, { partial: false }).ok === true,
);

// ── BIO-005: PATCH partial — required yalnız gönderildiyse denetlenir ────────
check(
  "PATCH: title gönderilmezse required denetlenmez",
  validateBioFields(sessions, { content: "yeni not" }, { partial: true }).ok === true,
);
check(
  "PATCH: title gönderilir ve boşsa reddedilir",
  validateBioFields(sessions, { title: "  " }, { partial: true }).ok === false,
);

// ── BIO-005: tip kontrolü ────────────────────────────────────────────────────
check(
  "Sayı tipli alan reddedilir",
  validateBioFields(sessions, { title: 123 as unknown as string }, { partial: false }).ok === false,
);
check(
  "Dizi tipli alan reddedilir",
  validateBioFields(sessions, { title: ["x"] as unknown as string }, { partial: false }).ok === false,
);

// ── BIO-005: maxLength ────────────────────────────────────────────────────────
check(
  "Aşırı uzun kısa-alan (title) reddedilir",
  validateBioFields(sessions, { title: "a".repeat(600) }, { partial: false }).ok === false,
);
check(
  "Uzun içerik alanı (content ~50k) kabul edilir",
  validateBioFields(sessions, { title: "t", content: "b".repeat(50_000) }, { partial: false }).ok === true,
);
check(
  "Çok aşırı içerik (>100k) reddedilir",
  validateBioFields(sessions, { title: "t", content: "b".repeat(100_001) }, { partial: false }).ok === false,
);

// ── BIO-009: trim + koruma ────────────────────────────────────────────────────
const trimmed = validateBioFields(sessions, { title: "  Kök Çakra  " }, { partial: false });
check(
  "Baş/son boşluk trimlenir",
  trimmed.ok === true && trimmed.fields.title === "Kök Çakra",
  trimmed.ok ? String(trimmed.fields.title) : "reddedildi",
);
const multiline = validateBioFields(
  sessions,
  { title: "Başlık", content: "  satır1\n\n  satır2 içi  boşluk  " },
  { partial: false },
);
check(
  "İç newline/boşluk KORUNUR (yalnız uç trim)",
  multiline.ok === true && multiline.fields.content === "satır1\n\n  satır2 içi  boşluk",
  multiline.ok ? JSON.stringify(multiline.fields.content) : "reddedildi",
);
const nulls = validateBioFields(sessions, { title: "t", note: null }, { partial: false });
check(
  "null değer null olarak korunur",
  nulls.ok === true && nulls.fields.note === null,
);
const empties = validateBioFields(sessions, { title: "t", category: "   " }, { partial: false });
check(
  'Boş string trim sonrası "" korunur (null\'a çevrilmez)',
  empties.ok === true && empties.fields.category === "",
);

// ── BIO-005: kolon whitelist (izinsiz alan düşürülür) ────────────────────────
const wl = validateBioFields(
  chakras,
  { name: "Kök", tenant_id: "HACK", id: "HACK", nope: "x" } as Record<string, unknown>,
  { partial: false },
);
check(
  "tenant_id/id/bilinmeyen alanlar sonuçtan düşürülür",
  wl.ok === true &&
    !("tenant_id" in wl.fields) &&
    !("id" in wl.fields) &&
    !("nope" in wl.fields) &&
    wl.fields.name === "Kök",
);

// ── BIO-007: Android UA tespiti ──────────────────────────────────────────────
check("Android telefon UA → true", isAndroidUserAgent(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
) === true);
check("Android WebView UA → true", isAndroidUserAgent(
  "Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
) === true);
check("Android tablet (Mobile token yok) → true", isAndroidUserAgent(
  "Mozilla/5.0 (Linux; Android 12; SM-T870) AppleWebKit/537.36 Chrome/120 Safari/537.36",
) === true);
check("Windows masaüstü → false", isAndroidUserAgent(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
) === false);
check("iPhone → false", isAndroidUserAgent(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
) === false);
check("macOS → false", isAndroidUserAgent(
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
) === false);
check("Boş/eksik UA → false (fail-open)", isAndroidUserAgent(null) === false);

// ── Rapor ─────────────────────────────────────────────────────────────────────
console.log(`\nBİYOENERJİ AŞAMA 2 — VALIDATION + ANDROID HARNESS`);
console.log(`PASS: ${pass}  FAIL: ${fail}  TOTAL: ${pass + fail}`);
if (fail > 0) {
  console.log(`\nBAŞARISIZ KONTROLLER:`);
  for (const f of failures) console.log(`  ${f}`);
  console.log(`\nOVERALL = FAIL`);
  process.exit(1);
} else {
  console.log(`OVERALL = PASS`);
}
