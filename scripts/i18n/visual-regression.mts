/**
 * I18N-F1-R1 — GÖRSEL REGRESYON (ekran görüntüsü yakalama + piksel karşılaştırma; sentetik veri; production'a SIFIR temas).
 *
 * Amaç: Türkçe arayüzün F1/F1-R1 değişikliklerinden sonra GÖRSEL olarak değişmediğini kanıtlamak ve İngilizce /
 * mobil görünümler için karşılaştırılabilir taban üretmek.
 *
 * Kullanım (uygulama yerel test önüne işaret eden build ile; bkz. scripts/i18n/ui-e2e.ts başlığı):
 *   npx tsx scripts/i18n/visual-regression.mts capture <klasör> [--locales tr,en]
 *   npx tsx scripts/i18n/visual-regression.mts compare <taban-klasör> <yeni-klasör> [--max-diff 0.001]
 *
 * Kararlılık: saat sabitlenir (page.clock), animasyon / geçiş / imleç kapatılır, saat / tarih / "son etkinlik" gibi
 * zamana bağlı alanlar maskelenir. Fark eşiği varsayılan %0,1 piksel (yazı tipi kenar yumuşatma toleransı).
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import { SERVICE_KEY, seedAnamnez, startAnamnezTestEnv } from "../anamnez/testEnv";

const [mode, a, b] = process.argv.slice(2);
const arg = (f: string, d: string) => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d);
const APP_PORT = 3996;
const APP = `http://127.0.0.1:${APP_PORT}`;
const SUPA_PORT = Number(process.env.I18N_E2E_SUPA_PORT ?? 54398);
const FIXED_TIME = new Date("2026-11-24T10:00:00+03:00");

const SCREENS = [
  { id: "landing", path: "/", auth: false },
  { id: "panel", path: "/", auth: true },
  { id: "client-detail", path: "/dashboard/clients/{client}", auth: true },
  { id: "client-list", path: "/danisan-yolculugu/liste", auth: true },
  { id: "settings", path: "/settings", auth: true },
] as const;
const VIEWPORTS = [{ id: "desktop", width: 1366, height: 900, mobile: false }, { id: "mobile390", width: 390, height: 844, mobile: true }] as const;
const STABILIZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
[data-testid*="time"],[data-testid*="clock"],time,[class*="relative-time"],[aria-live]{visibility:hidden!important}`;

async function capture(outDir: string) {
  const locales = arg("--locales", "tr,en").split(",");
  fs.mkdirSync(outDir, { recursive: true });
  // Migration betiğin bulunduğu depodan okunur (taban yakalaması main worktree'sinde cwd ile koşabilir).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migration = fs.readFileSync(path.join(here, "..", "..", "supabase/migrations/20280126000000_user_locale_prefs.sql"), "utf8");
  const env = await startAnamnezTestEnv({ port: 54477, dirName: "i18n-visual-pgdata", httpPort: SUPA_PORT, extraSql: [migration] });
  const seed = await seedAnamnez(env.su);
  const user = {
    id: seed.users.B.id, tenant_id: seed.TB, full_name: "ZZ_VISUAL", email: "zz.visual@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true }, is_demo_account: false,
  };
  const app: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
  });
  const browser = await chromium.launch();
  let count = 0;
  try {
    for (let i = 0; i < 180; i++) { try { const r = await fetch(`${APP}/`); if (r.status < 500) break; } catch { /* bekle */ } await new Promise((r) => setTimeout(r, 1000)); }
    for (const locale of locales) {
      for (const vp of VIEWPORTS) {
        for (const s of SCREENS) {
          const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: locale === "en" ? "en-GB" : "tr-TR", timezoneId: "Europe/Istanbul", deviceScaleFactor: 1 });
          await ctx.addCookies([{ name: "NEXT_LOCALE", value: locale, url: APP }]);
          if (s.auth) {
            await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), seed.users.B.token]);
            if (locale === "en") await env.su.query("insert into public.user_locale_prefs(tenant_id,user_id,preferred_locale) values ($1,$2,'en') on conflict (tenant_id,user_id) do update set preferred_locale='en'", [seed.TB, seed.users.B.id]).catch(() => undefined);
            else await env.su.query("delete from public.user_locale_prefs where user_id=$1", [seed.users.B.id]).catch(() => undefined);
          }
          const page: Page = await ctx.newPage();
          await page.clock.setFixedTime(FIXED_TIME);
          await page.goto(`${APP}${s.path.replace("{client}", seed.clients.b1)}`, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle").catch(() => undefined);
          await page.waitForTimeout(2500);
          await page.addStyleTag({ content: STABILIZE_CSS });
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(outDir, `${locale}-${vp.id}-${s.id}.png`), fullPage: false });
          count++;
          await ctx.close();
        }
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    try { if (process.platform === "win32" && app.pid) spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGKILL"); } catch { /* yok */ }
    await env.stop().catch(() => undefined);
  }
  console.log(`yakalandı: ${count} ekran → ${outDir}`);
  console.log(`=== görsel yakalama: ${count} PASS / 0 FAIL ===`);
}

type Region = { x: number; y: number; w: number; h: number };
function acceptedRegions(file: string): Region[] {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const j = JSON.parse(fs.readFileSync(path.join(here, "baseline", "visual-accepted.json"), "utf8")) as { regions: (Region & { file: string })[] };
    return j.regions.filter((r) => r.file === file);
  } catch {
    return [];
  }
}

async function diff(fa: string, fb: string, masks: Region[] = []) {
  const A = await sharp(fa).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(fb).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (A.info.width !== B.info.width || A.info.height !== B.info.height) return { ratio: 1, sizeMismatch: true };
  let differing = 0;
  const total = A.info.width * A.info.height;
  const w = A.info.width;
  for (let i = 0; i < A.data.length; i += 4) {
    const p = i / 4, x = p % w, y = Math.floor(p / w);
    if (masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h)) continue;
    const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
    if (d > 48) differing++;
  }
  return { ratio: differing / total, sizeMismatch: false };
}

async function compare(baseDir: string, newDir: string) {
  const max = Number(arg("--max-diff", "0.001"));
  const files = fs.readdirSync(baseDir).filter((f) => f.endsWith(".png") && f.startsWith("tr-"));
  let pass = 0, fail = 0;
  for (const f of files) {
    const nb = path.join(newDir, f);
    if (!fs.existsSync(nb)) { fail++; console.error(`  FAIL ${f}: yeni klasörde yok`); continue; }
    const masks = acceptedRegions(f);
    const r = await diff(path.join(baseDir, f), nb, masks);
    const okk = !r.sizeMismatch && r.ratio <= max;
    if (okk) pass++; else fail++;
    console.log(`  ${okk ? "PASS" : "FAIL"} ${f}: fark ${(r.ratio * 100).toFixed(3)}%${r.sizeMismatch ? " (boyut farklı)" : ""}${masks.length ? ` (kabul edilen bölge: ${masks.length})` : ""}`);
  }
  console.log(`=== görsel regresyon (TR): ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

if (mode === "capture" && a) await capture(a);
else if (mode === "compare" && a && b) await compare(a, b);
else { console.log("kullanım: capture <klasör> | compare <taban> <yeni>"); process.exit(2); }
