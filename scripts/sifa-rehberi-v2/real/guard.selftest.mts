/**
 * guard.mts öz-sınaması — SAHTE değerlerle (gerçek sır okunmaz) fail-closed davranışı + ağ çiti.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/guard.selftest.mts
 */
import { EXPECTED_REF, installNetworkFence, validateTarget } from "./guard";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}`);
};

let netCalls = 0;
const g = globalThis as unknown as { fetch: typeof fetch };
g.fetch = (async () => {
  netCalls++;
  return new Response("{}");
}) as typeof fetch;

const good = {
  SIFA_TEST_PROJECT_REF: EXPECTED_REF,
  SIFA_TEST_SUPABASE_URL: `https://${EXPECTED_REF}.supabase.co`,
  SIFA_TEST_REGION: "eu-west-1",
  SIFA_TEST_PUBLISHABLE_KEY: "sb_publishable_" + "f".repeat(31),
  SIFA_TEST_SECRET_KEY: "sb_secret_" + "f".repeat(31),
  SIFA_TEST_DB_PASSWORD: "f".repeat(32),
};
const rejects = (env: Record<string, string>) => {
  try {
    validateTarget(env);
    return false;
  } catch (e) {
    return /FAIL-CLOSED/.test((e as Error).message);
  }
};
console.log("guard öz-sınaması (sahte değerler)");
ok(validateTarget(good).host === `${EXPECTED_REF}.supabase.co`, "doğru ref + URL kabul edilir");
ok(rejects({ ...good, SIFA_TEST_PROJECT_REF: "abcdefghijabcdefghij" }), "farklı ref → reddedilir");
ok(rejects({ ...good, SIFA_TEST_SUPABASE_URL: "https://wctopfooxxxxxxxxxxxx.supabase.co" }), "production (Frankfurt) URL → reddedilir");
ok(rejects({ ...good, SIFA_TEST_SUPABASE_URL: "https://ylasompuxxxxxxxxxxxx.supabase.co" }), "Tokyo URL → reddedilir");
ok(rejects({ ...good, SIFA_TEST_SUPABASE_URL: `https://${EXPECTED_REF}.supabase.co.evil.example` }), "benzer görünen sahte host → reddedilir");
ok(rejects({ ...good, SIFA_TEST_SUPABASE_URL: `http://${EXPECTED_REF}.supabase.co` }), "https olmayan URL → reddedilir");
ok(rejects({ ...good, SIFA_TEST_REGION: "eu-central-1" }), "farklı bölge → reddedilir");
ok(rejects({ ...good, SIFA_TEST_SECRET_KEY: "" }), "boş secret key → reddedilir");
ok(rejects({ ...good, SIFA_TEST_PUBLISHABLE_KEY: "eyJhbGciOi.legacy.jwt" }), "eski JWT biçimli anahtar → reddedilir");
ok(rejects({ ...good, SIFA_TEST_DB_PASSWORD: "" }), "boş DB parolası → reddedilir");
ok(netCalls === 0, "reddetmelerde ağ çağrısı SIFIR");

installNetworkFence(validateTarget(good));
let blocked = false;
try {
  await fetch("https://wctopfooxxxxxxxxxxxx.supabase.co/rest/v1/");
} catch (e) {
  blocked = /ağ çiti/.test((e as Error).message);
}
ok(blocked && netCalls === 0, "ağ çiti: production host'a fetch engellenir (istek çıkmaz)");
await fetch(`https://${EXPECTED_REF}.supabase.co/x`);
ok(netCalls === 1, "ağ çiti: test host'una izin verilir");

console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
