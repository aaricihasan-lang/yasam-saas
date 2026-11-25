/**
 * I18N-F1-R1 — SÖZDE-YERELLEŞTİRME TARAYICI TESTİ (yalnız geliştirme sunucusu; sentetik veri; production'a SIFIR temas).
 *
 * `next dev` I18N_PSEUDO=on + yayın kapısı açık + NEXT_LOCALE=en ile koşar: İngilizce katalog metinleri ⟪ŕéçóŕď···⟫ olur.
 * Ölçülen:
 *   - sözde metin gerçekten uygulanıyor mu (çevrilmiş ekranlarda ⟪ satırları),
 *   - ⟪ İÇERMEYEN harfli satırlar = çevrilmemiş sabit metin / kullanıcı verisi adayları (listelenir; kullanıcı verisi
 *     ve marka beklenen istisnadır),
 *   - %35 uzamada 360 px mobil görünümde yatay taşma.
 * Kullanım: npx tsx scripts/i18n/ui-pseudo.mts <kanıt-klasörü>
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SERVICE_KEY, seedAnamnez, startAnamnezTestEnv } from "../anamnez/testEnv";

const OUT = process.argv[2];
if (!OUT) { console.log("kanıt klasörü gerekli"); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3997;
const APP = `http://127.0.0.1:${PORT}`;
const SUPA_PORT = 54399;
let pass = 0, fail = 0;
const ok = (c: boolean, m: string, extra?: unknown) => { if (c) pass++; else fail++; console.log(`  ${c ? "PASS" : "FAIL"} ${m}${c || extra === undefined ? "" : ` → ${JSON.stringify(extra).slice(0, 400)}`}`); };

const migration = fs.readFileSync(path.join(here, "..", "..", "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8");
const env = await startAnamnezTestEnv({ port: 54478, dirName: "i18n-pseudo-pgdata", httpPort: SUPA_PORT, extraSql: [migration] });
const seed = await seedAnamnez(env.su);
await env.su.query("insert into public.user_locale_prefs(tenant_id,user_id,preferred_locale) values ($1,$2,'en')", [seed.TB, seed.users.B.id]);
const user = { id: seed.users.B.id, tenant_id: seed.TB, full_name: "ZZ_PSEUDO", email: "zz.pseudo@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true }, is_demo_account: false };

const app: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "development", I18N_PSEUDO: "on", NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "on", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "dummy-anon", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "ignore",
});
const browser = await chromium.launch();
const report: Record<string, unknown> = {};
try {
  for (let i = 0; i < 300; i++) { try { const r = await fetch(`${APP}/`); if (r.status < 500) break; } catch { /* bekle */ } await new Promise((r) => setTimeout(r, 1000)); }
  const screens = [
    { id: "panel", path: "/" },
    { id: "client-detail", path: `/dashboard/clients/${seed.clients.b1}` },
    { id: "client-list", path: "/danisan-yolculugu/liste" },
    { id: "settings-language", path: "/settings" },
  ];
  for (const vp of [{ id: "desktop", w: 1366, h: 900, m: false }, { id: "mobile360", w: 360, h: 780, m: true }]) {
    for (const s of screens) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, locale: "en-GB" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "en", url: APP }]);
      await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), seed.users.B.token]);
      const page = await ctx.newPage();
      await page.goto(`${APP}${s.path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => undefined);
      await page.waitForTimeout(3000);
      if (s.id === "settings-language") {
        await page.getByRole("button", { name: /Lánĝúáĝé|Language/ }).first().click().catch(() => undefined);
        await page.waitForTimeout(1500);
      }
      const lines = await page.evaluate(() => document.body.innerText.split("\n").map((l) => l.trim()).filter((l) => /\p{L}{2,}/u.test(l)));
      const pseudo = lines.filter((l) => l.includes("⟪"));
      const plain = lines.filter((l) => !l.includes("⟪"));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const lang = await page.evaluate(() => document.documentElement.lang);
      await page.screenshot({ path: path.join(OUT, `${vp.id}-${s.id}.png`) });
      report[`${vp.id}/${s.id}`] = { lang, lines: lines.length, pseudo: pseudo.length, plain: plain.length, overflowPx: overflow, plainSample: plain.slice(0, 25) };
      ok(lang === "en" && pseudo.length > 0, `${vp.id}/${s.id}: sözde metin uygulandı (⟪ satır: ${pseudo.length}, düz: ${plain.length})`, { lang });
      if (vp.m) ok(overflow <= 1, `${vp.id}/${s.id}: %35 uzamada yatay taşma yok (${overflow}px)`, overflow);
      await ctx.close();
    }
  }
} finally {
  fs.writeFileSync(path.join(OUT, "pseudo-rapor.json"), JSON.stringify(report, null, 1));
  await browser.close().catch(() => undefined);
  try { if (process.platform === "win32" && app.pid) spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
  await env.stop().catch(() => undefined);
}
console.log(`rapor: ${path.join(OUT, "pseudo-rapor.json")}`);
console.log(`=== sözde-yerelleştirme tarayıcı testi: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail === 0 ? 0 : 1);
