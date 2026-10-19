/**
 * Geçici test kotası muafiyeti (lib/security/testQuotaExemption.ts) — saf birim testleri.
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/security/testQuotaExemption.harness.ts
 */
import assert from "node:assert/strict";
import { readTestQuotaExemption, testQuotaLimit, TEST_QUOTA_MULTIPLIER, TEST_QUOTA_SCOPES } from "@/lib/security/testQuotaExemption";

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
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
const silent = console.info;
console.info = () => undefined; // PII'siz bilgi logu testte susturulur

t("T1 env yok → sınır birebir aynı (davranış değişmez)", () => {
  for (const s of TEST_QUOTA_SCOPES) assert.equal(testQuotaLimit(s, U, 60, {}, START + 1000), 60);
  assert.deepEqual(readTestQuotaExemption({}, START), { active: false, reason: "not-configured" });
});
t("T2 geçerli pencere + listeli kullanıcı → ×10 (sınırsız DEĞİL)", () => {
  assert.equal(testQuotaLimit("astro-roxy-user", U, 60, env(U, WIN8), START + 1000), 60 * TEST_QUOTA_MULTIPLIER);
  assert.equal(testQuotaLimit("hd-roxy-tenant", U, 100, env(U, WIN8), START + 1000), 1000);
});
t("T3 listede olmayan kullanıcı → normal sınır", () => assert.equal(testQuotaLimit("astro-roxy-user", OTHER, 60, env(U, WIN8), START + 1000), 60));
t("T4 kimlik yok (null/boş) → normal sınır", () => {
  assert.equal(testQuotaLimit("astro-roxy-user", null, 60, env(U, WIN8), START + 1000), 60);
  assert.equal(testQuotaLimit("astro-roxy-user", "", 60, env(U, WIN8), START + 1000), 60);
});
t("T5 pencere başlamadan / bitiminde / sonrasında → normal sınır (otomatik sona erme)", () => {
  assert.equal(testQuotaLimit("astro-roxy-user", U, 60, env(U, WIN8), START - 1), 60);
  assert.equal(testQuotaLimit("astro-roxy-user", U, 60, env(U, WIN8), Date.parse("2026-10-20T04:00:00Z")), 60);
  assert.equal(testQuotaLimit("astro-roxy-user", U, 60, env(U, WIN8), Date.parse("2026-10-20T09:00:00Z")), 60);
  assert.equal(readTestQuotaExemption(env(U, WIN8), Date.parse("2026-10-20T04:00:00Z")).active, false);
});
t("T6 8 saatten uzun pencere → muafiyet KAPALI (fail-closed)", () => {
  const w = "2026-10-19T20:00:00Z/2026-10-20T04:00:01Z";
  assert.equal(readTestQuotaExemption(env(U, w), START + 1000).active, false);
  assert.equal(testQuotaLimit("astro-roxy-user", U, 60, env(U, w), START + 1000), 60);
});
t("T7 hatalı pencere / ters sıra / tek tarih → KAPALI", () => {
  for (const w of ["2026-10-19T20:00:00Z", "abc/def", "2026-10-20T04:00:00Z/2026-10-19T20:00:00Z", "2026-10-19T20:00:00Z/2026-10-19T20:00:00Z", "a/b/c"]) assert.equal(readTestQuotaExemption(env(U, w), START + 1000).active, false, w);
});
t("T8 hatalı kimlik listesi (UUID değil, 10'dan fazla) → KAPALI", () => {
  assert.equal(readTestQuotaExemption(env("admin", WIN8), START + 1000).active, false);
  assert.equal(readTestQuotaExemption(env(`${U},owner`, WIN8), START + 1000).active, false);
  const eleven = Array.from({ length: 11 }, (_, i) => `0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a${String(i).padStart(2, "0")}`).join(",");
  assert.equal(readTestQuotaExemption(env(eleven, WIN8), START + 1000).active, false);
});
t("T9 büyük/küçük harf ve boşluk toleransı (aynı UUID)", () => assert.equal(testQuotaLimit("astro-roxy-user", U.toUpperCase(), 60, env(` ${U} , ${OTHER} `, WIN8), START + 1000), 600));
t("T10 listede olmayan kapsam (kilit / güvenlik) asla yükseltilmez", () => {
  for (const s of ["astro-roxy-inflight", "hd-roxy-inflight", "hd-roxy-identity-inflight", "reg-ip", "reg-email", "support-ip", "hd-word"]) {
    assert.equal(testQuotaLimit(s as never, U, 1, env(U, WIN8), START + 1000), 1, s);
  }
});
t("T11 iz logu kullanıcı kimliği / tenant içermez", () => {
  const seen: unknown[] = [];
  console.info = (...a: unknown[]) => void seen.push(a);
  testQuotaLimit("astro-write", U, 120, env(U, WIN8), START + 1000);
  console.info = () => undefined;
  const txt = JSON.stringify(seen);
  assert.ok(seen.length === 1 && !txt.includes(U) && txt.includes("astro-write"), txt);
});
console.info = silent;
console.log(`\ntest-quota exemption harness: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
