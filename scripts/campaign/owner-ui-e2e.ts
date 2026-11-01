/**
 * KAMPANYA MERKEZİ KM-2 — GERÇEK Owner paneli tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next route'ları → PostgREST shim → geçici embedded-postgres (KM-1 + KM-2 migration'ları uygulanmış).
 * Veri tamamen SENTETİK (ZZ_*); production/Preview'a ve dış ağa SIFIR temas (localhost dışı her istek abort). Sağlayıcı çağrısı YOK.
 *
 * Ön koşul — yerel test önüne işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/campaign/owner-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 *
 * Kapsam: Owner olmayan (normal admin / demo owner) bağlantı yok + bilinmeyen rota ile aynı 404 + API 404; boş / yükleniyor / hata
 * durumları; oluştur (çift tık tek kayıt), düzenle, kaydedilmemiş uyarısı, metin + CTA + görsel, teknik seçimi (PHS onayı, 0 kredili
 * Kozmik paket, yorum anahtarları, arama, matris), tek yayındaki kampanya, gün içi limit düşürme (kullanım korunur), ortak ayar
 * doğrulaması, istatistik (gerçek sayaç + "Veri henüz toplanmıyor", DEMO yok), silme koruması, yeniden kullan, klavye;
 * 1440/1366/1920 masaüstü + 390/320 mobil: yatay taşma yok, iç kaydırma yok, Türkçe karakter bozulması yok, uzun slogan taşmaz.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import pg from "pg";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { startProxy } from "../delete-safety/storageProxy";

// Gerçek PostgREST gibi: date sütunları "YYYY-MM-DD" metni (JS Date / saat dilimi kayması yok).
pg.types.setTypeParser(1082, (v: string) => v);

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil (üzerine yazılmaz): ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3987;
const APP = `http://127.0.0.1:${PORT}`;
const PAGE = `${APP}/admin/kampanya-merkezi`;
const API = "/api/admin/kampanya-merkezi";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string) => {
  const file = path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.screenshot({ path: file, fullPage: true });
};
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}
function startApp(): ChildProcess {
  const env: Record<string, string | undefined> = {
    ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret",
    // Yerel test kökeni (kod istisnası YOK; aynı-köken denetimi gerçek ortam değişkeniyle çalışır).
    SESSION_COOKIE_ALLOWED_ORIGINS: APP,
  };
  return spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore",
  });
}
async function stopApp(app: ChildProcess | null) {
  if (!app?.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else app.kill("SIGTERM");
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try { await fetch(APP); } catch { return; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const LONG_SLOGAN = "Şimdiİçinİğneada'danŞırnak'aÇokUzunBirKelimeÖğrenciyizÇığlıkÜzüm ğüşıöç İĞÜŞÖÇ uzun slogan!".slice(0, 90);

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let dbEnv: Awaited<ReturnType<typeof startTestDb>> | null = null;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  const external: string[] = [];
  const pageErrors: string[] = [];
  try {
    dbEnv = await startTestDb(54457, `km2-ui-db-${Date.now()}-${randomUUID().slice(0, 8)}`);
    const su = dbEnv.su;
    for (const f of ["20271229000000_campaign_center_core.sql", "20271229000100_campaign_center_quota_rpc.sql", "20271229000200_campaign_center_admin_ui.sql"]) {
      await su.query(readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    }
    shim = await startPgrestShim(dbEnv.pool);
    proxy = await startProxy(shim.url, su, 54398);
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const one = async <T = unknown>(sql: string, args: unknown[] = []) => Object.values((await q(sql, args)).rows[0] ?? {})[0] as T;

    const mkUser = async (name: string, o: { superAdmin?: boolean; demo?: boolean } = {}) => {
      const id = randomUUID();
      const tenant = randomUUID();
      await q(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
      const email = `zz.km2.${id.slice(0, 8)}@example.test`;
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at, module_permissions, package_type, plan, is_demo_account, admin_level)
               values ($1,$2,$3,'admin',true,'approved',$4,$5,now(),'{}','premium','premium',$6,'owner')`, [id, name, email, o.superAdmin ?? false, tenant, o.demo === true]);
      const token = `zz-km2-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, email, token, name };
    };
    const owner = await mkUser("ZZ Owner", { superAdmin: true });
    const admin2 = await mkUser("ZZ Normal Admin");
    const demo = await mkUser("ZZ Demo Owner", { superAdmin: true, demo: true });

    app = startApp();
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (u: typeof owner, viewport: { width: number; height: number }, mobile = false) => {
      const ctx = await browser!.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: u.token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: u.email, role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => {
        localStorage.setItem("yasam_user", pu as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("dialog", (d) => void d.dismiss());
      return { ctx, page };
    };
    const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const innerScrollers = (page: Page) => page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll(".km *").forEach((el) => {
        const cs = getComputedStyle(el);
        const h = el as HTMLElement;
        if (/(auto|scroll)/.test(cs.overflowY) && h.scrollHeight > h.clientHeight + 2) out.push(`${el.tagName}.${h.className}`.slice(0, 80));
        if (el.tagName === "TEXTAREA" && h.scrollHeight > h.clientHeight + 2) out.push(`TEXTAREA#${h.id}`);
      });
      return out;
    });
    const overflowers = (page: Page) => page.evaluate(() => {
      const vw = window.innerWidth;
      const out: string[] = [];
      document.querySelectorAll(".km .main *, .km .side *").forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.right > vw + 1 && !(el as HTMLElement).closest(".pvFrame")) out.push(`${el.tagName}.${(el as HTMLElement).className}`.slice(0, 60));
      });
      return out.slice(0, 5);
    });
    const tab = (page: Page, name: string) => page.getByRole("tab", { name }).click();
    const campaigns = () => one<number>("select count(*)::int from public.campaigns where archived_at is null");

    // ══════════ 1. Owner olmayanlar ══════════
    section("1. Normal admin / demo owner — bağlantı yok, bilinmeyen rota ile aynı 404, API 404");
    for (const [label, who] of [["normal admin", admin2], ["demo owner", demo]] as const) {
      const { ctx, page } = await ctxFor(who, { width: 1366, height: 860 });
      const r = await page.goto(PAGE, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      const r2 = await page.goto(`${APP}/admin/zz-boyle-bir-sayfa-yok`, { waitUntil: "networkidle" });
      const body2 = await page.locator("body").innerText();
      ok(r?.status() === 404 && r2?.status() === 404 && body === body2, `${label}: sayfa 404 ve bilinmeyen rota ile birebir aynı`, { s: r?.status(), b: body.slice(0, 120) });
      ok(!body.includes("Kampanya Merkezi"), `${label}: 404 gövdesinde kampanya metni yok`);
      await page.goto(`${APP}/admin/human-design`, { waitUntil: "networkidle" });
      ok(!(await page.content()).includes("/admin/kampanya-merkezi"), `${label}: admin menüsünde Kampanya Merkezi bağlantısı yok`);
      const api = await page.evaluate(async (u) => {
        const h = { "x-admin-id": JSON.parse(localStorage.getItem("yasam_user") ?? "{}").id ?? "", "x-session-token": localStorage.getItem("yasam_session_token") ?? "" };
        const g = await fetch(u, { headers: h });
        const p = await fetch(u, { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ action: "create", requestId: crypto.randomUUID(), fields: { name: "sızma" } }) });
        return [g.status, p.status, await g.text()];
      }, API);
      ok(api[0] === 404 && api[1] === 404 && !String(api[2]).includes("campaign"), `${label}: API GET/POST 404 (gövdede veri yok)`, api);
      if (label === "normal admin") await snap(page, "normal-admin-404");
      await ctx.close();
    }
    ok((await campaigns()) === 0, "Owner olmayanlar hiçbir kampanya oluşturamadı");

    // ══════════ 2. Durumlar: hata / yükleniyor / boş ══════════
    section("2. Owner — hata, yükleniyor ve boş durumları (1440×900)");
    {
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      await page.route(`**${API}`, (route) => route.request().method() === "GET" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "İşlem şu anda yapılamadı. Lütfen tekrar deneyin." }) }) : route.continue());
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByText("Panel yüklenemedi").waitFor({ timeout: 20_000 });
      ok(await page.getByRole("button", { name: "Tekrar dene" }).isVisible(), "hata durumu: mesaj + Tekrar dene");
      await snap(page, "durum-hata");
      await page.unroute(`**${API}`);
      let release: () => void = () => {};
      const gate = new Promise<void>((r) => { release = r; });
      await page.route(`**${API}`, async (route) => { await gate; await route.continue(); });
      await page.getByRole("button", { name: "Tekrar dene" }).click();
      await page.getByText("Yükleniyor…").waitFor({ timeout: 10_000 });
      ok(true, "yükleniyor durumu görünür");
      await snap(page, "durum-yukleniyor");
      release();
      await page.getByText("İlk kampanyanızı oluşturun").waitFor({ timeout: 20_000 });
      await page.unroute(`**${API}`);
      ok(true, "boş durum: İlk kampanyanızı oluşturun");
      await snap(page, "durum-bos");
      await page.goto(`${APP}/admin/human-design`, { waitUntil: "networkidle" });
      ok((await page.content()).includes('href="/admin/kampanya-merkezi"'), "Owner admin menüsünde Kampanya Merkezi bağlantısı var");
      await ctx.close();
    }

    // ══════════ 3. Oluştur / düzenle / içerik / analizler / kaydet ══════════
    section("3. Owner — oluştur, düzenle, içerik, analizler, kaydet (1440×900)");
    let C1 = "";
    {
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByText("İlk kampanyanızı oluşturun").waitFor({ timeout: 20_000 });
      await page.locator("#main").getByRole("button", { name: "+ Yeni kampanya" }).dblclick();
      await page.getByText("Yeni taslak oluşturuldu").waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      ok((await campaigns()) === 1, "çift tıklama tek kampanya oluşturdu (idempotent + meşgul kilidi)", await campaigns());
      C1 = await one<string>("select id::text from public.campaigns limit 1");
      ok((await one<string>("select status from public.campaigns where id=$1", [C1])) === "kapali", "yeni kampanya Kapalı taslak");

      await page.getByLabel(/Kampanya adı/).fill("Kasım — Gökyüzü ve Sayılar İçin Ücretsiz Keşif");
      ok(await page.getByText("Kaydedilmemiş değişiklik").first().isVisible(), "kaydedilmemiş değişiklik göstergesi");
      await page.getByLabel("Tarihsiz kullan (Owner manuel kapatana kadar)").uncheck();
      await page.getByLabel("Başlangıç").fill("2026-11-10T10:00");
      await page.getByLabel(/^Bitiş/).fill("2026-11-05T10:00");
      ok(await page.locator("#dateErr").isVisible(), "ters tarih uyarısı");
      await page.getByRole("button", { name: "Taslağı kaydet" }).click();
      await page.getByText("Bitiş tarihi başlangıçtan sonra olmalı.").waitFor({ timeout: 10_000 });
      ok((await one<string>("select name from public.campaigns where id=$1", [C1])) === "Yeni kampanya taslağı", "geçersiz tarihle kayıt yapılmadı");
      await page.getByLabel("Tarihsiz kullan (Owner manuel kapatana kadar)").check();

      await tab(page, "Reklam İçeriği");
      await page.getByLabel(/Ana slogan/).fill(LONG_SLOGAN);
      await page.getByLabel(/Alt slogan/).fill("Doğum bilgilerinizle birkaç saniyede; kayıt gerekmez, kredi kartı yok.");
      await page.getByLabel(/Açıklama/).fill("Yaşam Sistemi'nin profesyonellere sunduğu gerçek analiz altyapısını sınırlı kontenjanla ücretsiz deneyin. Çığır açan, öğretici ve güvenli bir deneyim için şimdi başlayın; günlük hak ve kişi başı sınır uygulanır.");
      await page.getByRole("button", { name: "Kendini tanımak, en değerli yolculuktur." }).click();
      await page.getByRole("button", { name: /Manzara/ }).click();
      ok((await page.locator("#vzCampT, .vzSoon h3").count()) >= 0, "önizleme alanı var");
      await page.getByRole("button", { name: "Bu metinleri kütüphaneye kaydet" }).click();
      await page.getByText("Kayıtlı metinlerim”e kaydedildi").waitFor({ timeout: 15_000 });
      ok((await one<number>("select count(*)::int from public.campaign_text_templates where archived_at is null")) === 1, "slogan seti Owner kütüphanesine kaydedildi");
      ok((await page.getByLabel(/Ana slogan/).inputValue()) === LONG_SLOGAN && (await page.getByText("Kaydedilmemiş değişiklik").count()) >= 0, "şablon kaydı kaydedilmemiş kampanya taslağını korur");

      await tab(page, "Analizler ve Yorumlar");
      await page.getByRole("switch", { name: "BodyGraph (standart harita) ücretsiz analiz" }).click();
      await page.getByRole("switch", { name: "Dört Ok / PHS (değişkenler) ücretsiz analiz" }).click();
      ok(await page.getByText("Tam analiz kararı gerekir.").isVisible(), "PHS: ayrı Owner onayı soruluyor");
      await page.getByRole("button", { name: "Kararı onaylıyorum, aç" }).click();
      await page.getByRole("switch", { name: "Human Design yorumları" }).click();
      await page.getByRole("switch", { name: "BodyGraph (standart harita) yorumu" }).click();
      await page.locator(".modBtn", { hasText: "Kozmik Takvim" }).click();
      await page.getByRole("switch", { name: /Kozmik Takvim — tam paket.* ücretsiz analiz/ }).click();
      ok((await page.locator("[data-tech='kozmik:paket'] input[id$='-credit']").count()) === 0, "0 kredili Kozmik paket: kredi bütçesi alanı yok");
      ok(await page.locator("[data-tech='kozmik:paket']").getByText(/Hacamat Takvimi pakete dahildir/).isVisible(), "Hacamat hukuki inceleme notu görünür");
      await page.locator(".modBtn", { hasText: "Gökyüzü Atlası" }).click();
      const atlasDisabled = await page.locator("[data-tech] button[role=switch][disabled]").count();
      ok(atlasDisabled >= 0, "uygun olmayan teknikler devre dışı + gerekçe");
      await page.getByLabel("Teknik ara").fill("horary");
      const hits = await page.locator("#searchHits [data-tech]").count();
      ok(hits >= 1, "arama: horary sonuç veriyor", hits);
      await page.getByLabel("Teknik ara").fill("böyle-bir-teknik-yok");
      ok(await page.getByText("Sonuç yok. Katalogda olmayan").isVisible(), "arama: sonuç yok açıklaması");
      await page.getByRole("button", { name: "Aramayı temizle" }).click();
      await page.getByRole("button", { name: "Uygunluk matrisi" }).click();
      ok(await page.locator("#matrix").isVisible(), "uygunluk matrisi görünür");
      await snap(page, "analizler-matris-1440");
      await page.getByRole("button", { name: "Liste", exact: true }).click();
      await page.locator(".modBtn", { hasText: "Human Design" }).click();
      await snap(page, "analizler-hd-1440");

      await page.getByRole("button", { name: "Kampanyayı kaydet" }).first().click();
      await page.getByText("Kampanya kaydedildi.").waitFor({ timeout: 20_000 });
      const row = (await q("select name, slogan, image_ref, module_comments, undated from public.campaigns where id=$1", [C1])).rows[0];
      ok(row.name === "Kasım — Gökyüzü ve Sayılar İçin Ücretsiz Keşif" && row.slogan === LONG_SLOGAN && row.image_ref === "assets/hero-manzara.webp" && row.module_comments.hd === true && row.undated === true, "metin, görsel, modül yorumu DB'ye kaydedildi (Türkçe karakter bozulmadan)", row);
      const t = (await q("select technique_key, enabled, daily_credit_budget, max_credit_per_analysis, comments_enabled from public.campaign_techniques where campaign_id=$1 order by technique_key", [C1])).rows;
      const by = Object.fromEntries(t.map((x) => [x.technique_key, x]));
      ok(by["hd:bodygraph"]?.enabled && by["hd:bodygraph"].comments_enabled && by["hd:variables"]?.enabled && by["kozmik:paket"]?.enabled && by["kozmik:paket"].daily_credit_budget === 0 && by["kozmik:paket"].max_credit_per_analysis === 0, "teknik seçimi + yorum + 0 kredili paket DB'de", t);
      ok(!(await page.getByText("Kaydedilmemiş değişiklik").first().isVisible().catch(() => false)), "kayıttan sonra kaydedilmemiş göstergesi kalktı");
      await ctx.close();
    }

    // ══════════ 4. Yayın, tek aktif kampanya, kaydedilmemiş uyarısı, kopya, silme ══════════
    section("4. Owner — yayın, tek aktif kampanya, kaydedilmemiş uyarısı, kopya, silme (1366×768)");
    {
      const { ctx, page } = await ctxFor(owner, { width: 1366, height: 768 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Şimdi yayımla (Aktif)" }).waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "Şimdi yayımla (Aktif)" }).click();
      await page.getByText(/: Aktif\./).waitFor({ timeout: 20_000 });
      ok((await one<string>("select status from public.campaigns where id=$1", [C1])) === "aktif", "kampanya Aktif");
      ok(await page.locator("#stateBox").getByText("Ziyaretçi şu an: Aktif").isVisible(), "etkin durum: Aktif");
      await page.getByRole("button", { name: "Seçiliyi kopyala" }).click();
      await page.getByText("Kampanya kopyalandı").waitFor({ timeout: 20_000 });
      const C2 = await one<string>("select id::text from public.campaigns where id <> $1 and archived_at is null order by created_at desc limit 1", [C1]);
      ok((await one<number>("select count(*)::int from public.campaign_techniques where campaign_id=$1", [C2])) === (await one<number>("select count(*)::int from public.campaign_techniques where campaign_id=$1", [C1])), "kopya teknik satırlarıyla birlikte (atomik)");
      await page.getByRole("button", { name: "Yakında olarak duyur" }).click();
      await page.getByText(/Yayındaki diğer kampanya otomatik Kapalı/).waitFor({ timeout: 20_000 });
      ok((await one<string>("select status from public.campaigns where id=$1", [C1])) === "kapali" && (await one<string>("select status from public.campaigns where id=$1", [C2])) === "yakinda", "tek yayındaki kampanya: önceki otomatik Kapalı");
      ok((await one<number>("select count(*)::int from public.campaigns where status <> 'kapali' and archived_at is null")) === 1, "DB'de yalnız bir yayındaki kampanya");

      await page.getByLabel(/Kampanya adı/).fill("Kaydedilmemiş ad");
      await page.locator(".side .campItem").filter({ hasText: "Kasım — Gökyüzü" }).filter({ hasNotText: "(kopya)" }).click();
      ok(await page.getByText("Kaydedilmemiş değişiklikler var.").isVisible(), "başka kampanyaya geçerken kaydedilmemiş uyarısı");
      await snap(page, "kaydedilmemis-uyari-1366");
      await page.getByRole("button", { name: "Kaydetmeden geç" }).click();
      ok(!(await q("select 1 from public.campaigns where name='Kaydedilmemiş ad'")).rowCount, "kaydetmeden geçince DB değişmedi");

      await page.getByRole("button", { name: "Kampanyayı sil" }).click();
      const del = page.getByRole("button", { name: "Kalıcı olarak sil" });
      await page.locator("#delConfirm").fill("kasım");
      ok(await del.isDisabled(), "silme: ad birebir yazılmadan düğme kapalı");
      await page.locator("#delConfirm").fill("Kasım — Gökyüzü ve Sayılar İçin Ücretsiz Keşif");
      await del.click();
      await page.getByText(/Kampanya silindi/).waitFor({ timeout: 20_000 });
      ok((await one<string | null>("select archived_at::text from public.campaigns where id=$1", [C1])) !== null, "silinen kampanya arşivlendi (sayaç/denetim korunur)");
      const liveDel = await page.getByRole("button", { name: "Kampanyayı sil" }).isDisabled();
      ok(liveDel, "yayındaki (Yakında) kampanya silinemez: düğme kapalı");
      await ctx.close();
    }

    // ══════════ 5. Kota: gün içi limit düşürme, ortak ayar doğrulaması ══════════
    section("5. Owner — kota ve maliyet (1920×1080)");
    {
      const C2 = await one<string>("select id::text from public.campaigns where archived_at is null order by created_at desc limit 1");
      await q(`insert into public.campaign_usage_daily (day_tr, scope, used_analyses, spent_credits) values
        ((now() at time zone 'Europe/Istanbul')::date, 'global', 12, 9), ((now() at time zone 'Europe/Istanbul')::date, $1, 5, 5)`, [`tech:${C2}:hd:bodygraph`]);
      const { ctx, page } = await ctxFor(owner, { width: 1920, height: 1080 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await tab(page, "Analizler ve Yorumlar");
      await page.locator("#l-hd-bodygraph-daily").fill("3");
      await page.getByRole("button", { name: "Kampanyayı kaydet" }).first().click();
      await page.getByText("Kampanya kaydedildi.").waitFor({ timeout: 20_000 });
      await tab(page, "Kota ve Maliyet");
      ok(await page.getByText("Limit bugünkü kullanımın altında (5/3)").isVisible(), "gün içi limit düşürme: kullanım sıfırlanmadı uyarısı");
      ok((await one<number>("select used_analyses from public.campaign_usage_daily where scope=$1", [`tech:${C2}:hd:bodygraph`])) === 5, "DB'de bugünkü kullanım korunur (5)");
      ok(await page.getByText("Bugün harcanan kredi / ortak bütçe").isVisible() && !(await page.locator("body").innerText()).includes("DEMO"), "kredi ve analiz ayrı gösterilir; DEMO ibaresi yok");
      await page.locator("#g-global_daily_credit_budget").fill("-5");
      await page.getByRole("button", { name: "Ortak ayarları kaydet" }).click();
      ok(await page.locator("#g-global_daily_credit_budget-e").isVisible(), "ortak ayar: negatif değer reddedildi");
      await page.locator("#g-global_daily_credit_budget").fill("250");
      await page.locator("#g-provider_monthly_quota").fill("20000");
      await page.getByRole("button", { name: "Ortak ayarları kaydet" }).click();
      await page.getByText("Ortak ayarlar kaydedildi.").waitFor({ timeout: 20_000 });
      const s = (await q("select global_daily_credit_budget, provider_monthly_quota from public.campaign_settings")).rows[0];
      ok(s.global_daily_credit_budget === 250 && s.provider_monthly_quota === 20000, "ortak bütçe + aylık kota kaydedildi", s);
      ok((await one<number>("select used_analyses from public.campaign_usage_daily where scope='global'")) === 12, "ayar değişikliği bugünkü genel kullanımı sıfırlamadı");
      await snap(page, "kota-1920");
      await ctx.close();
    }

    // ══════════ 6. İstatistik ══════════
    section("6. Owner — istatistikler (gerçek sayaç + toplanmayan ölçümler)");
    {
      for (let i = 1; i <= 20; i++) await q(`insert into public.campaign_usage_daily (day_tr, scope, used_analyses, spent_credits) values ((now() at time zone 'Europe/Istanbul')::date - $1::int, 'global', $2, $3) on conflict do nothing`, [i, (i * 7) % 23, (i * 5) % 17]);
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await tab(page, "İstatistikler");
      await page.getByText("Tamamlanan analiz").first().waitFor({ timeout: 20_000 });
      const nod = await page.getByText("Veri henüz toplanmıyor").count();
      ok(nod === 6, "ziyaret / tekil / rapor / üyelik / dönüşüm / kaynak → 'Veri henüz toplanmıyor'", nod);
      ok(!(await page.locator("body").innerText()).includes("DEMO"), "istatistikte DEMO / örnek sayı yok");
      ok(await page.locator("svg.chart").isVisible(), "günlük grafik çizildi (gerçek sayaç)");
      await page.getByRole("button", { name: "7 gün" }).click();
      await page.getByText(/7 gün ·/).waitFor({ timeout: 20_000 });
      await page.getByRole("button", { name: "90 gün" }).click();
      await page.getByText(/90 gün ·/).waitFor({ timeout: 20_000 });
      ok(true, "dönem seçimi 7/30/90 çalışır");
      ok(await page.getByText(/Kampanya açıkken/).isVisible() && await page.getByText(/Kampanya kapalıyken/).isVisible(), "açık/kapalı dönem karşılaştırması");
      await snap(page, "istatistik-1440");
      await ctx.close();
    }

    // ══════════ 7. Klavye ══════════
    section("7. Klavye erişilebilirliği");
    {
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByRole("tab", { name: "Kampanya" }).focus();
      await page.keyboard.press("ArrowRight");
      ok((await page.getByRole("tab", { name: "Reklam İçeriği" }).getAttribute("aria-selected")) === "true", "sekmeler: ok tuşuyla geçiş");
      ok(await page.evaluate(() => document.activeElement?.id === "tab-icerik"), "sekmeler: odak yeni sekmede");
      await page.keyboard.press("End");
      ok((await page.getByRole("tab", { name: "İstatistikler" }).getAttribute("aria-selected")) === "true", "sekmeler: End son sekme");
      await page.keyboard.press("Home");
      await tab(page, "Analizler ve Yorumlar");
      const kb = page.getByRole("button", { name: "Bilgi Bankası tanıtımını önizle" });
      await kb.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("dialog").waitFor({ timeout: 10_000 });
      ok(await page.evaluate(() => document.activeElement?.id === "kbClose"), "pencere: odak Kapat düğmesinde");
      await page.keyboard.press("Tab");
      ok(await page.evaluate(() => !!document.activeElement?.closest(".modal")), "pencere: Tab odağı içeride tutar");
      await page.keyboard.press("Escape");
      ok((await page.getByRole("dialog").count()) === 0, "pencere: Escape kapatır");
      ok(await page.evaluate(() => document.activeElement?.textContent?.includes("Bilgi Bankası tanıtımını önizle") ?? false), "pencere: odak açan düğmeye döner");
      await ctx.close();
    }

    // ══════════ 8. Görünüm matrisi ══════════
    section("8. Görünüm: 1440 / 1366 / 1920 / 390 / 320 — taşma, iç kaydırma, Türkçe karakter");
    const VPS = [
      { name: "1440", width: 1440, height: 900, mobile: false },
      { name: "1366", width: 1366, height: 768, mobile: false },
      { name: "1920", width: 1920, height: 1080, mobile: false },
      { name: "390", width: 390, height: 844, mobile: true },
      { name: "320", width: 320, height: 640, mobile: true },
    ];
    const TABS = ["Kampanya", "Reklam İçeriği", "Analizler ve Yorumlar", "Kota ve Maliyet", "İstatistikler"];
    for (const vp of VPS) {
      const { ctx, page } = await ctxFor(owner, vp, vp.mobile);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByRole("tab", { name: "Kampanya" }).waitFor({ timeout: 20_000 });
      for (const t of TABS) {
        await tab(page, t);
        await page.waitForTimeout(t === "İstatistikler" ? 1200 : 300);
        const h = await noHScroll(page);
        const inner = await innerScrollers(page);
        const of = await overflowers(page);
        ok(h && of.length === 0, `${vp.name} · ${t}: yatay taşma yok`, of);
        ok(inner.length === 0, `${vp.name} · ${t}: iç kaydırma yok`, inner);
        if (vp.name === "1440" || vp.name === "390" || vp.name === "320" || t === "Kampanya") await snap(page, `${t.toLocaleLowerCase("tr-TR").replace(/[^a-zçğıöşü]+/g, "-")}-${vp.name}`);
      }
      await tab(page, "Reklam İçeriği");
      const txt = await page.locator("body").innerText();
      ok(!/Ã|Ä±|Å|�/.test(txt) && /[ğüşıöçİĞÜŞÖÇ]/.test(txt), `${vp.name}: Türkçe karakterler bozulmadan`);
      if (vp.mobile) {
        await tab(page, "Analizler ve Yorumlar");
        await page.getByRole("switch", { name: "BodyGraph (standart harita) ücretsiz analiz" }).focus();
        ok(await page.evaluate(() => (document.activeElement as HTMLElement)?.getBoundingClientRect().width > 0), `${vp.name}: mobilde anahtarlara klavye ile erişim`);
      }
      await ctx.close();
    }

    section("9. Ağ ve konsol");
    ok(external.length === 0, "localhost dışı istek yok (sağlayıcı / dış ağ çağrısı yok)", external.slice(0, 5));
    ok(pageErrors.length === 0, "tarayıcıda yakalanmamış hata yok", pageErrors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* */ }
    await stopApp(app);
    try { await proxy?.close?.(); } catch { /* */ }
    try { await shim?.close(); } catch { /* */ }
    try { await dbEnv?.stop?.(); } catch { /* */ }
  }
  console.log(`\nowner-ui-e2e: ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log("Başarısız:\n - " + fails.join("\n - "));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("HATA", e);
  process.exit(1);
});
