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
 * A) Şifa Rehberi F3 (masaüstü + mobil; V1 toplu silme ekranı Owner kararıyla kaldırıldı): konu silme onay paneli
 *    (etki + Kaydet'le kesinleşme); Vazgeç / ESC / Kaydetmeden Çık → istek YOK; API hatası → konu kaybolmaz + gerçek
 *    hata; çift tıklama → TEK istek; başarı → liste sayfa yenilenmeden güncellenir + Silinenler'de; içerik kutusu
 *    kalıcı silme yalnız Kaydet ile (sürüm kontrollü), Kaydetmeden Çık → kutu yerinde.
 * B) Admin › Üye Yönetimi › Arşiv (gerçek DB): owner "Kalıcı Sil" görür, normal admin görmez; 3 aşamalı
 *    dialog (uyarı → e-posta → ifade + parola); ESC → istek yok; yanlış parola → gerçek hata, veri yerinde;
 *    çift tıklama → TEK POST; satır anında düşer; DB'de hesap + tenant verisi + Storage silindi; diğer
 *    uzman verisi yerinde.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { f3Workspace, HEAD_ID, NOTE_ID, ROOT_ID } from "../sifa-rehberi-f3/ui-mock/f3Mock.mjs";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Route } from "playwright";
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
  module_permissions: { sifa_rehberi: true, clients: true }, is_demo_account: false,
};
const OWNER = { ...EXPERT, id: "aaaaaaaa-0000-4000-8000-0000000000aa", role: "admin", full_name: "ZZ_UI Owner", email: "zz.owner@example.test" };

const BOX_ID = "f3000000-0000-4000-8000-0000000000e1";
type F3Ws = {
  nodes: Array<{ id: string; parentId: string | null; deletedAt: string | null }>;
  blocks: Array<Record<string, unknown> & { id: string }>;
};

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
    // Şifa F4-R2: ekran yalnız yayın hazırlık işareti varsa açılır (üç F3 migration'ı tamam) — bu test ortamında "tamam".
    await dbEnv.su.query("CREATE OR REPLACE FUNCTION public.sifa_v2_f3_hazir() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$; GRANT EXECUTE ON FUNCTION public.sifa_v2_f3_hazir() TO service_role;");
    shim = await startPgrestShim(dbEnv.pool);
    proxy = await startProxy(shim.url, dbEnv.su, 54398);
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // ── A) Şifa Rehberi (F3 kişisel kütüphane) — silme güvenliği ────────────────────────────
    // Owner kararı 26.11.2026: V1 ekranı kaldırıldı. V1'in "toplu kalıcı silme + 3 aşamalı onay" işlevi F3'te YOK
    // (kontrolleri işleviyle birlikte kaldırıldı). F3 silme modeli: konu/başlık/not → onay paneli → Silinenler (30 gün,
    // geri alınabilir) ve YALNIZ Kaydet ile kesinleşir; içerik kutusu (Owner kararı R5) Kaydet'le kalıcı silinir.
    // Geçerli silme güvenliği kuralları burada F3'te sınanır: onaysız/vazgeçilen silme istek üretmez, ESC kapatır,
    // hata → kayıt kaybolmaz + gerçek hata görünür, çift tıklama → TEK istek, başarı → sayfa yenilenmeden güncellenir.
    for (const vp of [{ name: "masaüstü 1366x800", width: 1366, height: 800, mobile: false }, { name: "mobil 390x844", width: 390, height: 844, mobile: true }]) {
      section(`A. Şifa Rehberi (F3) silme güvenliği — ${vp.name}`);
      const ctx = await newCtx(browser, EXPERT, vp, vp.mobile);
      const log: Api[] = [];
      let saveMode: "ok" | "error" = "ok";
      let trashed = false;
      let boxGone = false;
      const ws = () => {
        const w = f3Workspace(EXPERT.id as string) as unknown as F3Ws;
        w.blocks.push({ ...w.blocks[0], id: BOX_ID, parentBlockId: NOTE_ID, title: "ZZ Kutu", contentText: "ZZ kutu metni",
          contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "ZZ kutu metni" }] }] } });
        if (boxGone) w.blocks = w.blocks.filter((b) => b.id !== BOX_ID);
        if (trashed) for (const n of w.nodes) if (n.id === ROOT_ID || n.parentId === ROOT_ID) n.deletedAt = new Date().toISOString();
        return w;
      };
      await mockApi(ctx, log, async (api, route) => {
        if (api.url === "/api/sifa-rehberi-v2/workspace" && api.method === "GET") { await json(route, 200, { ok: true, workspace: ws() }); return true; }
        if (api.url === "/api/sifa-rehberi-v2/workspace" && api.method === "POST") {
          await new Promise((r) => setTimeout(r, 300));
          if (saveMode === "error") { await json(route, 500, { ok: false, error: "ZZ sunucu hatası" }); return true; }
          const b = JSON.parse(api.body ?? "{}") as { topics?: Array<{ id: string; deleted_at: string | null }>; blocks_delete?: Array<{ id: string }> };
          if ((b.topics ?? []).some((t) => t.id === ROOT_ID && t.deleted_at)) trashed = true;
          if ((b.blocks_delete ?? []).some((x) => x.id === BOX_ID)) boxGone = true;
          await json(route, 200, { ok: true }); return true;
        }
        return false;
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`şifa ${vp.name}: ${e.message}`));
      const saves = () => log.filter((a) => a.method === "POST" && a.url === "/api/sifa-rehberi-v2/workspace");
      const tap = (sel: string) => (vp.mobile ? page.locator(sel).first().tap() : page.locator(sel).first().click());
      const toast = () => page.locator("[data-testid=toast]").allInnerTexts().then((x) => x.join(" | "));
      await page.goto(`${APP}/sifa-rehberi#/konu/${ROOT_ID}/${ROOT_ID}`);
      await page.getByTestId("edit").waitFor({ timeout: 30_000 });
      await page.evaluate(() => { (window as unknown as { __zzNoReload: boolean }).__zzNoReload = true; });
      await tap("[data-testid=edit]");
      const openDelete = async () => { await tap("[data-testid=menu]"); await tap("[data-testid=mi-delete]"); await page.getByTestId("delete-confirm").waitFor(); };

      // Onay paneli: açık uyarı + etki; Vazgeç / ESC → istek YOK
      await openDelete();
      const msg = await page.getByTestId("delete-confirm").innerText();
      ok(/“ZZ Migren” konusu Silinenler'e taşınacak/.test(msg) && /\d+ alt başlık, 1 not/.test(msg) && /Kaydet/.test(msg), "onay paneli: ne silineceği, etkisi (alt başlık/not) ve Kaydet'le kesinleşeceği yazıyor", msg.slice(0, 200));
      await tap("[data-testid=delete-no]");
      ok(saves().length === 0 && (await page.getByTestId("delete-confirm").count()) === 0, "Vazgeç → panel kapandı, istek YOK");
      await openDelete();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      ok(saves().length === 0 && (await page.getByTestId("delete-confirm").count()) === 0, "ESC → panel kapandı, istek YOK");
      if (vp.mobile) {
        await openDelete();
        const inView = await page.getByTestId("delete-yes").evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; });
        ok(inView, "mobil: onay düğmesi kaydırmadan görünür");
        await page.screenshot({ path: path.join(OUT, `sifa-f3-onay-${vp.width}.png`) });
        await tap("[data-testid=delete-no]");
      }

      // Onay → henüz istek YOK; Kaydetmeden Çık → silme geri alınır (veri yerinde)
      await openDelete();
      await tap("[data-testid=delete-yes]");
      await page.waitForTimeout(200);
      ok(saves().length === 0, "onay verildi ama Kaydet'e basılmadı → istek YOK");
      await tap("[data-testid=discard]");
      await tap("[data-testid=leave-drop]");
      await page.waitForTimeout(300);
      await page.goto(`${APP}/sifa-rehberi#/kutuphane`);
      await page.getByTestId("library").waitFor();
      ok(saves().length === 0 && (await page.getByTestId("lib-item").filter({ hasText: "ZZ Migren" }).count()) === 1, "Kaydetmeden Çık → silme uygulanmadı, konu yerinde");

      // API hatası → konu kaybolmaz + gerçek hata; Kaydet tekrar denenebilir
      saveMode = "error";
      await page.goto(`${APP}/sifa-rehberi#/konu/${ROOT_ID}/${ROOT_ID}`);
      await page.getByTestId("edit").waitFor();
      await tap("[data-testid=edit]");
      await openDelete();
      await tap("[data-testid=delete-yes]");
      await tap("[data-testid=save]");
      await page.getByTestId("toast").filter({ hasText: "Kaydedilemedi" }).waitFor({ timeout: 8000 }).catch(() => undefined);
      ok(saves().length === 1, "hata senaryosu: tek kayıt isteği gönderildi");
      ok(/Kaydedilemedi: ZZ sunucu hatası/.test(await toast()), "API hatası kullanıcıya gösterildi", await toast());
      ok(await page.getByTestId("save").first().isEnabled(), "başarısız kayıtta silme taslakta KALDI (tekrar denenebilir; veri sunucuda yerinde)");
      ok(!trashed, "sunucu tarafı: konu çöpe taşınmadı");

      // Başarı + çift tıklama → TEK istek; liste sayfa yenilenmeden güncellenir
      saveMode = "ok";
      const before = saves().length;
      await page.getByTestId("save").first().dblclick();
      await page.getByTestId("toast").filter({ hasText: "Kaydedildi." }).waitFor({ timeout: 8000 }).catch(() => undefined);
      ok(saves().length - before === 1, `çift tıklama → TEK kayıt isteği (${saves().length - before})`);
      const last = JSON.parse(saves().at(-1)?.body ?? "{}") as { topics?: Array<{ id: string; deleted_at: string | null }>; blocks_delete?: unknown[] };
      ok((last.topics ?? []).some((t) => t.id === ROOT_ID && !!t.deleted_at) && !(last.blocks_delete ?? []).length, "istek konuyu Silinenler'e taşır (kalıcı silme DEĞİL)");
      await page.goto(`${APP}/sifa-rehberi#/kutuphane`);
      await page.getByTestId("library").waitFor();
      const libText = await page.getByTestId("library").innerText();
      ok(!libText.includes("ZZ Migren") && libText.includes("ZZ Uyku"), "başarılı silme → konu listeden kalktı, diğer konu duruyor");
      await page.goto(`${APP}/sifa-rehberi#/silinenler`);
      await page.getByTestId("trash-view").waitFor();
      ok((await page.getByTestId("restore").filter({ hasText: "Geri al" }).count()) >= 1 && /ZZ Migren/.test(await page.getByTestId("trash-view").innerText()), "silinen konu Silinenler'de, Geri al ile");
      ok(await page.evaluate(() => (window as unknown as { __zzNoReload?: boolean }).__zzNoReload === true), "sayfa yeniden yüklenmedi (SPA içinde güncellendi)");
      await page.screenshot({ path: path.join(OUT, `sifa-f3-sonrasi-${vp.width}.png`), fullPage: true });

      // İçerik kutusu: kalıcı silme YALNIZ Kaydet ile; Kaydetmeden Çık → kutu yerinde
      trashed = false; // (taklit) konu Silinenler'den geri alınmış hâl — sunucudan yeniden yüklenir
      await page.goto(`${APP}/sifa-rehberi#/konu/${ROOT_ID}/${HEAD_ID}`);
      await page.reload();
      await page.getByTestId("edit").waitFor();
      await tap("[data-testid=edit]");
      await tap("[data-testid=box-delete]");
      ok((await page.getByTestId("box-editor").count()) === 0, "kutu taslaktan çıktı (Owner kararı R5: uyarısız, geri al satırı yok)");
      const n0 = saves().length;
      await tap("[data-testid=discard]");
      await tap("[data-testid=leave-drop]");
      await page.waitForTimeout(300);
      ok(saves().length === n0 && !boxGone && /ZZ kutu metni/.test(await page.locator("body").innerText()), "Kaydetmeden Çık → kalıcı silme YOK, kutu yerinde");
      await tap("[data-testid=edit]");
      await tap("[data-testid=box-delete]");
      await page.getByTestId("save").first().dblclick();
      await page.getByTestId("toast").filter({ hasText: "Kaydedildi." }).waitFor({ timeout: 8000 }).catch(() => undefined);
      const boxReq = JSON.parse(saves().at(-1)?.body ?? "{}") as { blocks_delete?: Array<{ id: string; base_version: number }> };
      ok(saves().length - n0 === 1 && (boxReq.blocks_delete ?? []).length === 1 && boxReq.blocks_delete?.[0]?.id === BOX_ID && typeof boxReq.blocks_delete?.[0]?.base_version === "number",
        "Kaydet (çift tık) → TEK istek; yalnız o kutu, sürüm kontrolüyle kalıcı silinir");
      ok(boxGone && !(await page.locator("body").innerText()).includes("ZZ kutu metni") && /ZZ not metni/.test(await page.locator("body").innerText()), "kutu kalktı; ana not yerinde");
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
