/**
 * ANDROID KABUL — GEÇİŞ ANI ÖLÇÜMÜ (EMÜLASYON). header → cookie geçişinden sonraki İLK sayfa yüklemesinde, eski token
 * çereze taşınmadan giden istekler 401 alıyor mu; kullanıcı ne görüyor; kendiliğinden düzeliyor mu? N tekrar.
 * Ortam çalışır olmalı (127.0.0.1:3999). Ekran görüntüleri: argv[2] dizini.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const CTRL = process.env.KABUL_CTRL ?? "http://127.0.0.1:3999";
const APEX = "https://yasamsistemi.com";
const UA = "Mozilla/5.0 (Linux; Android 10; Pixel 3 Build/QQ3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ctrl = async (p: string, method = "GET") => (await fetch(`${CTRL}${p}`, { method })).json();

async function main() {
  const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
  const N = Number(process.env.TEKRAR ?? 3);
  const req2 = createRequire(process.env.PLAYWRIGHT_REQUIRE ?? path.join(process.cwd(), "package.json"));
  const { chromium } = req2("playwright") as typeof import("playwright");
  const rows: unknown[] = [];
  for (let n = 1; n <= N; n++) {
    await ctrl("/kip?android=header&killswitch=off", "POST");
    const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "gecis-")), {
      ignoreHTTPSErrors: true, userAgent: UA, extraHTTPHeaders: { "X-Requested-With": "com.yasamsistemi.app" }, locale: "tr-TR",
      viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true,
      args: ["--host-resolver-rules=MAP www.yasamsistemi.com 127.0.0.1, MAP yasamsistemi.com 127.0.0.1"],
    });
    const page = ctx.pages()[0] ?? await ctx.newPage();
    await page.goto(APEX, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Giriş Yap", exact: true }).first().click();
    await page.locator("#login-email").fill("free@test.local");
    await page.locator("#login-password").fill("parola-free");
    await page.getByRole("button", { name: /Uzman Paneline Gir/ }).click();
    await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().waitFor({ timeout: 25000 });
    await sleep(3000);
    await ctrl("/kip?android=cookie&killswitch=off", "POST");
    const ev: { t: number; s: number; p: string }[] = [];
    const t0 = Date.now();
    ctx.on("response", (r) => { if (/\/api\//.test(r.url())) ev.push({ t: Date.now() - t0, s: r.status(), p: new URL(r.url()).pathname }); });
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(8000);
    await page.screenshot({ path: path.join(OUT, `gecis-${n}-ilk-yukleme.png`), fullPage: false });
    const boot = ev.find((e) => e.p === "/api/auth/session/cookie");
    const u401 = ev.filter((e) => e.s === 401);
    const loggedIn = await page.getByRole("button", { name: "Çıkış Yap", exact: true }).first().isVisible().catch(() => false);
    const errText = await page.locator("text=/yüklenemedi|hata|tekrar dene|Yeniden dene/i").count();
    // Kullanıcının bir sonraki doğal eylemi: yenileme
    ev.length = 0;
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(6000);
    await page.screenshot({ path: path.join(OUT, `gecis-${n}-sonraki-yukleme.png`), fullPage: false });
    const after401 = ev.filter((e) => e.s === 401).length;
    const row = { tekrar: n, bootstrapMs: boot?.t ?? null, bootstrapStatus: boot?.s ?? null,
      ilk401: u401.map((e) => `${e.t}ms ${e.p}`), oturumAcik: loggedIn, hataMetniSayisi: errText, sonrakiYukleme401: after401 };
    rows.push(row);
    console.log(JSON.stringify(row));
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, "gecis-olcum.json"), JSON.stringify(rows, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
