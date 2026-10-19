/**
 * Geçici test kotası muafiyeti (lib/security/testQuotaExemption.ts) — saf birim testleri.
 * Owner kesin kararı (2026-10-19): ARTIRMA DEĞİL — yetkili test hesabında, ≤8 saatlik pencerede hacim kotası kontrolü TAMAMEN atlanır.
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/security/testQuotaExemption.harness.ts
 */
import assert from "node:assert/strict";
import { isTestQuotaExempt, quotaCheck, readTestQuotaExemption, TEST_QUOTA_BYPASSED, TEST_QUOTA_SCOPES } from "@/lib/security/testQuotaExemption";

let pass = 0;
let fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
const U = "0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a";
const OTHER = "0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e";
const START = Date.parse("2026-10-19T20:00:00Z");
const env = (ids: string, win: string) => ({ TEST_QUOTA_EXEMPT_USER_IDS: ids, TEST_QUOTA_EXEMPT_WINDOW: win });
const WIN8 = "2026-10-19T20:00:00Z/2026-10-20T04:00:00Z";
const IN = START + 1000;
const silent = console.info;
console.info = () => undefined; // PII'siz bilgi logu testte susturulur

async function main() {
  await t("T1 env yok → hiçbir kapsam atlanmaz (davranış değişmez)", () => {
    for (const s of TEST_QUOTA_SCOPES) assert.equal(isTestQuotaExempt(s, U, {}, {}, IN), false);
    assert.deepEqual(readTestQuotaExemption({}, START), { active: false, reason: "not-configured" });
  });
  await t("T2 geçerli pencere + listeli kullanıcı → TÜM hacim kapsamları atlanır (çarpan / yapay sınır YOK)", () => {
    for (const s of TEST_QUOTA_SCOPES) assert.equal(isTestQuotaExempt(s, U, {}, env(U, WIN8), IN), true, s);
  });
  await t("T3 listede olmayan kullanıcı → atlanmaz", () => assert.equal(isTestQuotaExempt("hd-roxy-user", OTHER, {}, env(U, WIN8), IN), false));
  await t("T4 kimlik yok (null/boş) → atlanmaz", () => {
    assert.equal(isTestQuotaExempt("hd-roxy-user", null, {}, env(U, WIN8), IN), false);
    assert.equal(isTestQuotaExempt("hd-roxy-user", "", {}, env(U, WIN8), IN), false);
  });
  await t("T5 pencere başlamadan / bitiminde / sonrasında → atlanmaz (otomatik sona erme)", () => {
    assert.equal(isTestQuotaExempt("hd-roxy-user", U, {}, env(U, WIN8), START - 1), false);
    assert.equal(isTestQuotaExempt("hd-roxy-user", U, {}, env(U, WIN8), Date.parse("2026-10-20T04:00:00Z")), false);
    assert.equal(isTestQuotaExempt("hd-roxy-user", U, {}, env(U, WIN8), Date.parse("2026-10-20T09:00:00Z")), false);
  });
  await t("T6 8 saatten uzun pencere → KAPALI (fail-closed)", () => {
    const w = "2026-10-19T20:00:00Z/2026-10-20T04:00:01Z";
    assert.equal(readTestQuotaExemption(env(U, w), IN).active, false);
    assert.equal(isTestQuotaExempt("hd-roxy-user", U, {}, env(U, w), IN), false);
  });
  await t("T7 hatalı pencere / ters sıra / tek tarih → KAPALI", () => {
    for (const w of ["2026-10-19T20:00:00Z", "abc/def", "2026-10-20T04:00:00Z/2026-10-19T20:00:00Z", "2026-10-19T20:00:00Z/2026-10-19T20:00:00Z", "a/b/c"]) assert.equal(readTestQuotaExemption(env(U, w), IN).active, false, w);
  });
  await t("T8 hatalı kimlik listesi (UUID değil, 10'dan fazla) → KAPALI", () => {
    assert.equal(readTestQuotaExemption(env("admin", WIN8), IN).active, false);
    assert.equal(readTestQuotaExemption(env(`${U},owner`, WIN8), IN).active, false);
    const eleven = Array.from({ length: 11 }, (_, i) => `0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a${String(i).padStart(2, "0")}`).join(",");
    assert.equal(readTestQuotaExemption(env(eleven, WIN8), IN).active, false);
  });
  await t("T9 büyük/küçük harf ve boşluk toleransı (aynı UUID)", () => assert.equal(isTestQuotaExempt("hd-roxy-user", U.toUpperCase(), {}, env(` ${U} , ${OTHER} `, WIN8), IN), true));
  await t("T10 kilit / güvenlik kapsamları asla atlanmaz", () => {
    for (const s of ["astro-roxy-inflight", "hd-roxy-inflight", "hd-roxy-relation-inflight", "hd-roxy-identity-inflight", "hd-roxy-location", "reg-ip", "reg-email", "support-ip", "hd-word", "hd-word-dl", "auth-login"]) {
      assert.equal(isTestQuotaExempt(s, U, {}, env(U, WIN8), IN), false, s);
    }
  });
  await t("T11 demo hesap listede olsa bile asla muaf değil", () => assert.equal(isTestQuotaExempt("hd-compute-user", U, { isDemo: true }, env(U, WIN8), IN), false));
  await t("T12 iz logu kullanıcı kimliği / tenant içermez", () => {
    const seen: unknown[] = [];
    console.info = (...a: unknown[]) => void seen.push(a);
    isTestQuotaExempt("astro-write", U, {}, env(U, WIN8), IN);
    console.info = () => undefined;
    const txt = JSON.stringify(seen);
    assert.ok(seen.length === 1 && !txt.includes(U) && txt.includes("astro-write"), txt);
  });
  // quotaCheck: process.env üzerinden (route'ların kullandığı yol)
  const saved = { ids: process.env.TEST_QUOTA_EXEMPT_USER_IDS, win: process.env.TEST_QUOTA_EXEMPT_WINDOW };
  const nowWin = `${new Date(Date.now() - 60_000).toISOString()}/${new Date(Date.now() + 3600_000).toISOString()}`;
  await t("T13 quotaCheck — muaf istekte sayaç HİÇ çağrılmaz (1000 istek, 0 çağrı)", async () => {
    process.env.TEST_QUOTA_EXEMPT_USER_IDS = U;
    process.env.TEST_QUOTA_EXEMPT_WINDOW = nowWin;
    let calls = 0;
    for (let i = 0; i < 1000; i++) {
      const r = await quotaCheck("hd-roxy-user", U, async () => { calls++; return { allowed: false, retryAfterSec: 60 }; });
      assert.equal(r.allowed, true);
      assert.equal(r, TEST_QUOTA_BYPASSED);
    }
    assert.equal(calls, 0);
  });
  await t("T14 quotaCheck — muaf olmayan kullanıcıda mevcut kontrol AYNEN çalışır ve sonucu döner", async () => {
    let calls = 0;
    const r = await quotaCheck("hd-roxy-user", OTHER, async () => { calls++; return { allowed: false, retryAfterSec: 42 }; });
    assert.equal(calls, 1);
    assert.deepEqual(r, { allowed: false, retryAfterSec: 42 });
  });
  await t("T15 quotaCheck — muaf kullanıcıda bile kilit kapsamı (inflight) kontrol edilir", async () => {
    let calls = 0;
    const r = await quotaCheck("hd-roxy-relation-inflight", U, async () => { calls++; return { allowed: false, retryAfterSec: 20 }; });
    assert.equal(calls, 1);
    assert.equal(r.allowed, false);
  });
  await t("T16 quotaCheck — pencere bitince eski kontrol geri döner", async () => {
    process.env.TEST_QUOTA_EXEMPT_WINDOW = `${new Date(Date.now() - 7200_000).toISOString()}/${new Date(Date.now() - 1000).toISOString()}`;
    let calls = 0;
    const r = await quotaCheck("hd-roxy-user", U, async () => { calls++; return { allowed: false, retryAfterSec: 9 }; });
    assert.equal(calls, 1);
    assert.equal(r.allowed, false);
  });
  if (saved.ids === undefined) delete process.env.TEST_QUOTA_EXEMPT_USER_IDS; else process.env.TEST_QUOTA_EXEMPT_USER_IDS = saved.ids;
  if (saved.win === undefined) delete process.env.TEST_QUOTA_EXEMPT_WINDOW; else process.env.TEST_QUOTA_EXEMPT_WINDOW = saved.win;
  console.info = silent;
  console.log(`\ntest-quota exemption harness: ${pass} PASS / ${fail} FAIL`);
  if (fail > 0) process.exit(1);
}
void main();
