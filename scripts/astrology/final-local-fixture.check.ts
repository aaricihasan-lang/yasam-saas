// FINAL — yerel "test verisi yok" uyarısının YALNIZ geliştirme ortamında ve YALNIZ yerel sağlayıcı adresinde
// devreye girdiğini doğrular (production'da sahte Roxy / fixture bilgisi asla gösterilmez).
// Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/final-local-fixture.check.ts
import assert from "node:assert/strict";
import { isLocalFakeProvider } from "@/lib/astrology/engine/service";

let pass = 0;
let fail = 0;
const t = (name: string, fn: () => void) => {
  try {
    fn();
    pass++;
    console.log(`PASS ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}: ${(e as Error).message}`);
  }
};
const env = process.env as Record<string, string | undefined>;
const orig = env.NODE_ENV;
const cfg = (baseUrl: string) => ({ apiKey: "x", baseUrl });

t("geliştirme + 127.0.0.1 → yerel uyarı", () => {
  env.NODE_ENV = "development";
  assert.equal(isLocalFakeProvider(cfg("https://127.0.0.1:54330/api/v2")), true);
  assert.equal(isLocalFakeProvider(cfg("https://localhost:54330/api/v2")), true);
});
t("geliştirme + gerçek Roxy adresi → uyarı YOK (gerçek hata davranışı korunur)", () => {
  env.NODE_ENV = "development";
  assert.equal(isLocalFakeProvider(cfg("https://roxyapi.com/api/v2")), false);
});
t("PRODUCTION + yerel adres bile → uyarı YOK", () => {
  env.NODE_ENV = "production";
  assert.equal(isLocalFakeProvider(cfg("https://127.0.0.1:54330/api/v2")), false);
});
t("yapılandırma yok → uyarı YOK", () => {
  env.NODE_ENV = "development";
  assert.equal(isLocalFakeProvider(null), false);
});
env.NODE_ENV = orig;
console.log(`\nfinal local-fixture check: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
