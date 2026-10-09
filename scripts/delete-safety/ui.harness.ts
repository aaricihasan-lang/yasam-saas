/**
 * SİLME GÜVENLİĞİ — GERÇEK TARAYICI UI harness'i (Playwright + `next start`; TÜM /api/** istekleri
 * ağ seviyesinde taklit edilir → production'a ve hiçbir DB'ye SIFIR temas).
 *
 * Ön koşul: yerel test önüne (127.0.0.1:54398) işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * A bölümü: tüm /api/** taklit. B bölümü: GERÇEK uçtan uca — tarayıcı → gerçek Next route'ları →
 * PostgREST shim → ephemeral embedded-postgres (+ Storage taklidi); veri sentetik.
 * Çalıştır: npx tsx scripts/delete-safety/ui.harness.ts [--out <klasör>]
 *
 * A) Şifa Rehberi toplu silme (masaüstü + mobil): 2 kayıt → mevcut tek onay; 3 kayıt → 3 AYRI aşama;
 *    ESC / Vazgeç / yanlış ifade → DELETE YOK; API hatası → kayıtlar listede kalır + gerçek hata;
 *    çift tıklama → TEK DELETE; başarı → liste + sayaç sayfa yenilenmeden güncellenir; tümünü seç.
 * B) Admin › Üye Yönetimi › Arşiv (gerçek DB): owner "Kalıcı Sil" görür, normal admin görmez; 3 aşamalı
 *    dialog (uyarı → e-posta → ifade + parola); ESC → istek yok; yanlış parola → gerçek hata, veri yerinde;
 *    çift tıklama → TEK POST; satır anında düşer; DB'de hesap + tenant verisi + Storage silindi; diğer
 *    uzman verisi yerinde.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { startProxy } from "./storageProxy";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "delete-safety-ui");
const PORT = 3981;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

const TENANT = "11111111-2222-4333-8444-555555555555";
const EXPERT = {
  id: "aaaaaaaa-0000-4000-8000-000000000001", tenant_id: TENANT, full_name: "ZZ_UI Uzman", email: "zz.ui@example.test",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
  membership_status: "active", subscription_status: "active",
  module_permissions: { sifa_rehberi: true, healing_guide: true, clients: true }, is_demo_account: false,
};
const OWNER = { ...EXPERT, id: "aaaaaaaa-0000-4000-8000-0000000000aa", role: "admin", full_name: "ZZ_UI Owner", email: "zz.owner@example.test" };

const guides = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `bbbbbbbb-0000-4000-8000-00000000000${i}`, tenant_id: TENANT, name: `ZZ Rehber ${i + 1}`, category: "Genel",
    healing_guide_sections: [], created_at: new Date(Date.now() - i * 60_000).toISOString(),
    updated_at: new Date(Date.now() - i * 60_000).toISOString(),
  }));

type Api = { method: string; url: string; body: string | null };

async function newCtx(browser: Browser, user: Record<string, unknown>, viewport: { width: number; height: number }, mobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  await ctx.addInitScript(([u]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", "zz-ui-token-not-a-secret");
  }, [JSON.stringify(user)]);
  return ctx;
}

/** Tüm /api/** → taklit. `handlers` eşleşmezse 200 {ok:true}. Dış ağ istekleri iptal. */
async function mockApi(ctx: BrowserContext, log: Api[], handlers: (api: Api, route: Route) => Promise<boolean>) {
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== APP) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const api: Api = { method: req.method(), url: url.pathname + url.search, body: req.postData() };
    log.push(api);
    if (await handlers(api, route)) return;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const dialogTitle = (page: Page) => page.locator("#confirm-title").innerText().catch(() => "");

async function selectRows(page: Page, names: string[]) {
  for (const n of names) {
    const row = page.locator("tr, li, article, div").filter({ hasText: n }).filter({ has: page.locator('input[type="checkbox"]') }).last();
    await row.locator('input[type="checkbox"]').first().check({ force: true });
  }
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let dbEnv: Awaited<ReturnType<typeof startTestDb>> | null = null;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  const pageErrors: string[] = [];
  try {
    dbEnv = await startTestDb(54423, "delete-safety-ui-db");
    await dbEnv.su.query(readFileSync(path.join(process.cwd(), "supabase/migrations/20271009100000_admin_purge_archived_expert.sql"), "utf8"));
    shim = await startPgrestShim(dbEnv.pool);
    proxy = await startProxy(shim.url, dbEnv.su, 54398);
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // ── A) Şifa Rehberi ──────────────────────────────────────────────────────
    for (const vp of [{ name: "masaüstü 1366x800", width: 1366, height: 800, mobile: false }, { name: "mobil 390x844", width: 390, height: 844, mobile: true }]) {
      section(`A. Şifa Rehberi toplu silme — ${vp.name}`);
      const ctx = await newCtx(browser, EXPERT, vp, vp.mobile);
      const log: Api[] = [];
      let rows = guides(5);
      let deleteMode: "ok" | "error" = "ok";
      await mockApi(ctx, log, async (api, route) => {
        if (api.url.startsWith("/api/sifa-rehberi/guides/categories")) { await json(route, 200, { ok: true, categories: [] }); return true; }
        if (api.url.startsWith("/api/sifa-rehberi/guides") && api.method === "GET") {
          await json(route, 200, { ok: true, rows, hasMore: false, nextCursor: null, total: rows.length }); return true;
        }
        if (api.url.startsWith("/api/sifa-rehberi/guides") && api.method === "DELETE") {
          await new Promise((r) => setTimeout(r, 300));
          if (deleteMode === "error") { await json(route, 500, { ok: false, error: "ZZ sunucu hatası" }); return true; }
          const ids = (JSON.parse(api.body ?? "{}") as { ids?: string[] }).ids ?? [];
          rows = rows.filter((r) => !ids.includes(r.id));
          await json(route, 200, { ok: true, deletedIds: ids }); return true;
        }
        return false;
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`şifa ${vp.name}: ${e.message}`));
      await page.goto(`${APP}/sifa-rehberi?view=list`);
      await page.getByText("ZZ Rehber 1").first().waitFor({ timeout: 30_000 });
      const deletes = () => log.filter((a) => a.method === "DELETE").length;
      const delBtn = page.getByRole("button", { name: /Seçilenleri Sil|Seçilileri Sil|Sil \(/ }).first();

      // 2 kayıt → mevcut onay (3 aşama YOK)
      await selectRows(page, ["ZZ Rehber 1", "ZZ Rehber 2"]);
      await delBtn.click();
      await page.locator("#confirm-title").waitFor();
      const t2 = await dialogTitle(page);
      ok(!/Adım 1\/3/.test(t2), `2 kayıt → mevcut onay (başlık: "${t2}")`);
      await page.getByTestId("confirm-cancel").click();
      await page.waitForTimeout(150);
      ok(deletes() === 0, "2 kayıt onayı iptal → DELETE yok");

      // 3 kayıt → aşama 1, ESC
      await selectRows(page, ["ZZ Rehber 3"]);
      await delBtn.click();
      await page.locator("#confirm-title").waitFor();
      ok(/Adım 1\/3/.test(await dialogTitle(page)), "3 kayıt → Adım 1/3");
      ok(/3 şifa rehberi kaydı kalıcı olarak silinecek\. Bu işlem geri alınamaz\./.test(await page.locator("#confirm-message").innerText()),
        "aşama 1: açık uyarı metni");
      ok(await page.locator("#confirm-require-text").count() === 0, "aşama 1'de gizli doğrulama alanı YOK (ayrı aşama)");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      ok(deletes() === 0 && await page.locator("#confirm-title").count() === 0, "ESC → pencere kapandı, DELETE yok");

      // aşama 2: yanlış ifade → buton kapalı; aşama 3'te Vazgeç → DELETE yok
      await delBtn.click();
      await page.getByTestId("confirm-ok").click();
      ok(/Adım 2\/3/.test(await dialogTitle(page)), "Devam Et → Adım 2/3");
      const input = page.getByTestId("confirm-require-text");
      await input.fill("3 KAYDI");
      ok(await page.getByTestId("confirm-ok").isDisabled(), "eksik ifade → Devam Et kapalı");
      await input.fill("30 KAYDI SİL");
      ok(await page.getByTestId("confirm-ok").isDisabled(), "yanlış sayı → Devam Et kapalı");
      await input.fill("3 kaydi sil");
      ok(await page.getByTestId("confirm-ok").isEnabled(), "doğru ifade (küçük harf, ı/i) → Devam Et açık");
      // Aşama 2 "Devam Et" ile aşama 3 "Kalıcı Olarak Sil" aynı konumda: çift tıklama son onayı ATLAYAMAZ.
      await page.getByTestId("confirm-ok").dblclick();
      await page.waitForTimeout(600);
      const t3 = await dialogTitle(page);
      ok(deletes() === 0 && /Son Onay/.test(t3), "aşama 2'de çift tıklama → son onay atlanmadı, DELETE yok");
      ok(/Son Onay — Bu işlem geri alınamaz\./.test(t3), "Adım 3: Son Onay başlığı");
      ok(/3 şifa rehberi kaydı/.test(await page.locator("#confirm-message").innerText()) &&
         /Kalıcı Olarak Sil \(3\)/.test(await page.getByTestId("confirm-ok").innerText()), "Adım 3: sayı tekrar + Kalıcı Olarak Sil (3)");
      if (vp.mobile) {
        const inView = await page.getByTestId("confirm-ok").evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; });
        ok(inView, "mobil: son onay butonu kaydırmadan görünür");
        await page.screenshot({ path: path.join(OUT, `sifa-adim3-${vp.width}.png`) });
      }
      await page.getByTestId("confirm-cancel").click();
      await page.waitForTimeout(150);
      ok(deletes() === 0, "son onay verilmeden kapatma → DELETE yok");

      // API hatası → kayıtlar listede kalır + gerçek hata
      deleteMode = "error";
      await delBtn.click();
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-require-text").fill("3 KAYDI SİL");
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-ok").click();
      await page.waitForTimeout(800);
      ok(deletes() === 1, "hata senaryosu: tek DELETE gönderildi");
      const body1 = await page.locator("body").innerText();
      ok(/ZZ sunucu hatası/.test(body1), "API hatası kullanıcıya gösterildi");
      ok(["ZZ Rehber 1", "ZZ Rehber 2", "ZZ Rehber 3"].every((n) => body1.includes(n)), "başarısız silmede kayıtlar listede KALDI");

      // başarı + çift tıklama → tek DELETE, liste anında güncellenir
      deleteMode = "ok";
      const before = deletes();
      await delBtn.click();
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-require-text").fill("3 KAYDI SİL");
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-ok").dblclick().catch(() => undefined);
      await page.waitForTimeout(900);
      ok(deletes() - before === 1, `çift tıklama → TEK DELETE (${deletes() - before})`);
      const body2 = await page.locator("body").innerText();
      await page.screenshot({ path: path.join(OUT, `sifa-sonrasi-${vp.width}.png`), fullPage: true });
      ok(!body2.includes("ZZ Rehber 1") && !body2.includes("ZZ Rehber 3") && body2.includes("ZZ Rehber 4"),
        "başarılı silme → satırlar sayfa yenilenmeden kayboldu, diğerleri duruyor",
        { visible: body2.split("\n").filter((l) => /ZZ Rehber|silin/i.test(l)).slice(0, 12),
          deleteBodies: log.filter((x) => x.method === "DELETE").map((x) => x.body) });
      const navs = log.filter((a) => a.method === "GET" && a.url.startsWith("/api/sifa-rehberi/guides?")).length;
      ok(navs >= 1, "sayfa yeniden yüklenmedi (SPA içinde güncellendi)");
      await ctx.close();
    }

    // ── B) Admin arşiv — owner-only kalıcı silme (GERÇEK uçtan uca) ─────────────
    const q = (sql: string, args: unknown[] = []) => dbEnv!.su.query(sql, args);
    const mkTenant = async () => {
      const id = randomUUID();
      await q(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [id, `zz-${id.slice(0, 13)}`]);
      return id;
    };
    const mkUser = async (role: "admin" | "expert", name: string, o: { active?: boolean; superAdmin?: boolean } = {}) => {
      const id = randomUUID();
      const tenant = await mkTenant();
      const email = `zz.dsui.${id.slice(0, 8)}@example.test`;
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at)
               values ($1,$2,$3,$4,$5,'approved',$6,$7,now())`, [id, name, email, role, o.active ?? true, o.superAdmin ?? false, tenant]);
      const token = `zz-dsui-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, email, token, name };
    };
    const owner = await mkUser("admin", "ZZ_DSUI Owner", { superAdmin: true });
    const admin2 = await mkUser("admin", "ZZ_DSUI Admin2");
    const target = await mkUser("expert", "ZZ_DSUI Arşiv Uzman", { active: false });
    const other = await mkUser("expert", "ZZ_DSUI Diğer Uzman", { active: false });
    for (let i = 0; i < 4; i++) await q(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ_DSUI')`, [target.tenant]);
    await q(`insert into public.clients(tenant_id, full_name) values ($1,'ZZ_DSUI other')`, [other.tenant]);
    await q(`insert into storage.objects(bucket_id, name) values ('stone-photos',$1),('client-anamnesis-files',$2),('stone-photos',$3)`,
      [`${target.tenant}/c/a.jpg`, `${target.tenant}/c/an/b.pdf`, `${other.tenant}/c/keep.jpg`]);

    const adminCtx = async (u: typeof owner) => {
      const ctx = await browser!.newContext({ viewport: { width: 1366, height: 860 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: u.token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: u.email, role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => {
        localStorage.setItem("yasam_user", pu as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(profile), u.token]);
      const log: Api[] = [];
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) return route.abort();
        if (url.pathname.startsWith("/api/")) log.push({ method: route.request().method(), url: url.pathname, body: route.request().postData() });
        return route.continue();
      });
      return { ctx, log };
    };

    section("B. Arşiv — normal admin (gerçek DB)");
    {
      const { ctx } = await adminCtx(admin2);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`arşiv admin2: ${e.message}`));
      await page.goto(`${APP}/admin/users?view=archive`);
      await page.getByText(target.name).first().waitFor({ timeout: 45_000 });
      ok(await page.getByTestId("archive-purge-button").count() === 0, "normal admin → Kalıcı Sil butonu YOK");
      ok(await page.getByRole("button", { name: /Yeniden Aktifleştir/ }).count() >= 1, "normal admin → Yeniden Aktifleştir duruyor");
      await ctx.close();
    }

    section("B. Arşiv — owner kalıcı silme (gerçek DB + Storage)");
    {
      const { ctx, log } = await adminCtx(owner);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`arşiv owner: ${e.message}`));
      await page.goto(`${APP}/admin/users?view=archive`);
      await page.getByText(target.name).first().waitFor({ timeout: 45_000 });
      const row = page.locator("article").filter({ hasText: target.name });
      const btn = row.getByTestId("archive-purge-button");
      ok(await page.getByTestId("archive-purge-button").count() === 2, "owner → her arşiv satırında Kalıcı Sil");
      const posts = () => log.filter((a) => a.method === "POST" && a.url.includes("/purge")).length;
      const dlg = page.locator('[role="alertdialog"]');
      await btn.click();
      await page.waitForTimeout(500);
      const d1 = await dlg.innerText();
      ok(/(Adım|ADIM) 1\/3/.test(d1) && /Bu uzman ve ilişkili verileri kalıcı olarak silmek üzeresiniz\./.test(d1) && d1.includes(target.email),
        "aşama 1: uyarı + hedef kimliği", d1);
      await page.getByTestId("purge-step1-continue").click();
      await page.waitForTimeout(500);
      ok(await page.getByTestId("purge-step2-continue").isDisabled(), "aşama 2: e-posta yazılmadan Devam kapalı");
      await page.getByTestId("purge-email").fill(other.email);
      ok(await page.getByTestId("purge-step2-continue").isDisabled(), "başka uzmanın e-postası → Devam kapalı");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
      ok(await dlg.count() === 0 && posts() === 0, "ESC → dialog kapandı, istek yok");

      await btn.click();
      await page.waitForTimeout(500);
      await page.getByTestId("purge-step1-continue").click();
      await page.waitForTimeout(500);
      await page.getByTestId("purge-email").fill(target.email.toUpperCase());
      await page.getByTestId("purge-step2-continue").click();
      await page.waitForTimeout(500);
      ok(/Son Onay — Bu işlem geri alınamaz\./.test(await dlg.innerText()), "aşama 3: Son Onay");
      ok(await page.getByTestId("purge-submit").isDisabled(), "ifade + parola yokken Kalıcı Olarak Sil kapalı");
      await page.getByTestId("purge-phrase").fill("kalıcı olarak sil");
      ok(await page.getByTestId("purge-submit").isDisabled(), "parola yokken hâlâ kapalı");
      await page.getByTestId("purge-password").fill("yanlis-parola");
      await page.getByTestId("purge-submit").click();
      await dlg.getByRole("alert").waitFor({ timeout: 15_000 });
      ok(/parolası doğrulanamadı/i.test(await dlg.getByRole("alert").innerText()), "yanlış parola → gerçek hata gösterildi");
      ok((await q(`select count(*)::int n from public.users where id=$1`, [target.id])).rows[0].n === 1, "yanlış parola → hesap yerinde");
      await page.getByTestId("purge-password").fill("zz-owner-pass");
      await page.screenshot({ path: path.join(OUT, "arsiv-purge-adim3.png") });
      const before = posts();
      await page.getByTestId("purge-submit").dblclick().catch(() => undefined);
      await page.waitForFunction((n) => !document.querySelector("main")?.innerText.includes(n as string), target.name, { timeout: 20_000 }).catch(() => undefined);
      ok(posts() - before === 1, `çift tıklama → TEK purge POST (${posts() - before})`);
      ok(!(await page.locator("main").innerText()).includes(target.name), "satır sayfa yenilenmeden listeden düştü");
      const otherVisible = await page.getByText(other.name).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
      ok(otherVisible, "diğer arşiv uzmanı listede (liste sunucudan tazelendi)");
      ok((await q(`select count(*)::int n from public.users where id=$1`, [target.id])).rows[0].n === 0, "DB: hesap silindi");
      ok((await q(`select count(*)::int n from public.clients where tenant_id=$1`, [target.tenant])).rows[0].n === 0, "DB: tenant danışanları silindi");
      ok((await q(`select count(*)::int n from public.clients where tenant_id=$1`, [other.tenant])).rows[0].n === 1, "DB: diğer uzman verisi yerinde");
      const objs = (await q(`select name from storage.objects`)).rows.map((r) => r.name as string);
      ok(objs.length === 1 && objs[0].startsWith(other.tenant), "Storage: yalnız hedefin dosyaları silindi");
      ok((await q(`select count(*)::int n from public.admin_audit_log where action='user_deleted' and actor_admin_id=$1`, [owner.id])).rows[0].n === 1,
        "DB: purge audit kaydı");
      await ctx.close();
    }

    ok(pageErrors.length === 0, `sayfa JS hatası yok (${pageErrors.length})`, pageErrors);
  } finally {
    await browser?.close().catch(() => undefined);
    await proxy?.close().catch(() => undefined);
    await shim?.close().catch(() => undefined);
    await dbEnv?.stop().catch(() => undefined);
    if (app?.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
        // npx sarmalayıcısı ölse de `next start` düğümü yaşayabilir → port sahibini de kapat.
        spawnSync("powershell", ["-NoProfile", "-Command",
          `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`],
        { stdio: "ignore" });
      } else app.kill("SIGTERM");
    }
  }
  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı  (ekran görüntüleri: ${OUT})`);
  if (fail > 0) {
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
