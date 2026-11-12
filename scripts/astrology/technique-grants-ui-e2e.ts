/**
 * Gökyüzü Atlası — TEKNİK İZİNLERİ PANELİ gerçek tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next sayfası / route'ları → PostgREST shim → geçici embedded-postgres (üye yönetimi zinciri + migration
 * 20271230000000). Veri tamamen SENTETİK (ZZ_*); production'a ve dış ağa SIFIR temas (127.0.0.1 dışı her istek abort).
 *
 * Ön koşul — yerel test yığınına işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54397 SUPABASE_SERVICE_ROLE_KEY=zz-smoke npx next build --webpack
 * Çalıştır: npx tsx scripts/astrology/technique-grants-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 *
 * Kontroller: Astroloji anahtarı açılırken panel açılır ve HİÇBİR istek kaydedilmez · İptal → DB değişmez · TÜMÜNÜ SEÇ /
 * kategori Tümünü seç / tek teknik kaldırınca "bir kısmı" · SEÇİMİ TEMİZLE · boş kayıtta uyarı (istek yok) · kaydet → modül + teknikler
 * birlikte · düzenle ile yeniden açılır (kayıtlı seçimle) · kapatınca seçim korunur · masaüstü ≈%50 genişlik · mobilde tam genişlik,
 * yalnız içerik alanı kayar, Kaydet/İptal görünür · yatay taşma yok · konsol hatası yok.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { startPgrestShim } from "../usage360/pgrestShim";
import { startTestDb360 } from "../uye-yonetimi-360/testDb360";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil (üzerine yazılmaz): ${OUT}`);
mkdirSync(OUT, { recursive: true });
const SHIM_PORT = 54397;
const PORT = 3927;
const APP = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string, fullPage = false) => {
  const file = path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.screenshot({ path: file, fullPage });
};
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const db = await startTestDb360(54396, `atlas-teknik-ui-${Date.now()}-${randomUUID().slice(0, 8)}`);
  const shim = await startPgrestShim(db.pool, SHIM_PORT);
  const external: string[] = [];
  const pageErrors: string[] = [];
  try {
    const su = db.su;
    await su.query(readFileSync(path.join(process.cwd(), "supabase/migrations/20271230000000_astrology_technique_grants.sql"), "utf8"));
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const mkUser = async (role: "admin" | "expert", name: string, perms: Record<string, unknown>, grants: unknown = null, approval: "approved" | "pending" = "approved") => {
      const id = randomUUID();
      const tenant = randomUUID();
      await q(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at, module_permissions, package_type, plan, admin_level, astrology_technique_grants)
               values ($1,$2,$3,$4,$10,$11,$5,$6,now(),$7,'premium','premium',$8,$9)`,
        [id, name, `zz.atlasui.${id.slice(0, 8)}@example.test`, role, role === "admin", tenant, JSON.stringify(perms), role === "admin" ? "owner" : null, grants === null ? null : JSON.stringify(grants), approval === "approved", approval]);
      const token = `zz-atlasui-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, token, name };
    };
    const owner = await mkUser("admin", "ZZ Owner", {});
    const student = await mkUser("expert", "ZZ Öğrenci Ayşe", { clients: true });
    const paid = await mkUser("expert", "ZZ Ücretli Uzman", { clients: true, astrology: true }, { mode: "all" });
    const applicant = await mkUser("expert", "ZZ Başvuran Öğrenci", {}, null, "pending");
    const netUser = await mkUser("expert", "ZZ Ağ Testi", { clients: true }, null);
    const row = async (id: string) => (await q(`select module_permissions, astrology_technique_grants from public.users where id=$1`, [id])).rows[0] as { module_permissions: Record<string, unknown>; astrology_technique_grants: unknown };
    const auditCount = async (id: string) => Number((await q(`select count(*) from public.admin_audit_log where target_user_id=$1`, [id])).rows[0].count);

    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", stdio: "ignore",
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: "zz-smoke", ASTROLOGY_MODULE_ENABLED: "true" } as NodeJS.ProcessEnv,
    });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (viewport: { width: number; height: number }, mobile = false) => {
      const ctx = await browser!.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: owner.token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: owner.id, tenant_id: owner.tenant, full_name: owner.name, email: "zz@example.test", role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => {
        localStorage.setItem("yasam_user", pu as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(profile), owner.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      const puts: string[] = [];
      page.on("request", (r) => { if (r.method() !== "GET" && r.url().includes("/api/admin/users/")) puts.push(`${r.method()} ${new URL(r.url()).pathname}`); });
      return { ctx, page, puts };
    };
    const openUser = async (page: Page, id: string) => {
      // Üye Detayı V2 (PR #779): Modül İzinleri "Modüller ve Kredi" sekmesinde → sekmeyle aç.
      await page.goto(`${APP}/admin/users/${id}#moduller`, { waitUntil: "networkidle" });
      await page.locator("#uye-erisim").waitFor({ timeout: 30_000 });
      await page.locator("#uye-erisim").scrollIntoViewIfNeeded();
    };
    const astroSwitch = (page: Page) => page.locator("#uye-erisim").getByRole("switch", { name: "Astroloji", exact: true });
    const drawer = (page: Page) => page.locator("[data-astro-tech-drawer]");
    const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

    section("1. Eğitim öğrencisi — Astroloji anahtarı açılırken panel (masaüstü 1440×900)");
    {
      const { ctx, page, puts } = await ctxFor({ width: 1440, height: 900 });
      await openUser(page, student.id);
      ok((await astroSwitch(page).getAttribute("aria-checked")) === "false", "başlangıç: Astroloji kapalı");
      await astroSwitch(page).click();
      await drawer(page).waitFor({ timeout: 15_000 });
      const box = await drawer(page).boundingBox();
      ok(!!box && box.width >= 1440 * 0.45 && box.width <= 1440 * 0.55 && Math.round(box.x + box.width) === 1440, "panel sağdan açılır, genişlik ≈%50", box);
      ok((await drawer(page).getByRole("heading").first().innerText()).includes("GÖKYÜZÜ ATLASI — TEKNİK İZİNLERİ"), "başlık");
      ok(puts.length === 0 && (await row(student.id)).module_permissions.astrology !== true, "anahtara basmak tek başına HİÇBİR şey kaydetmedi", puts);
      ok((await page.locator("[data-astro-tech-count]").innerText()).includes("0 / 48"), "kayıt yok → 0/48 seçili");
      for (const c of ["western", "vedic", "kp", "other"]) ok(await page.locator(`[data-astro-tech-category="${c}"]`).isVisible(), `kategori görünür: ${c}`);
      await snap(page, "ogrenci-panel-bos-masaustu");

      await page.getByTestId("astro-tech-all").check();
      ok((await page.locator("[data-astro-tech-count]").innerText()).includes("48 / 48"), "TÜMÜNÜ SEÇ → 48/48");
      await page.locator('[data-astro-tech-item="kp.horary"]').uncheck();
      const mixed = await page.evaluate(() => ({
        top: (document.querySelector('[data-testid="astro-tech-all"]') as HTMLInputElement).indeterminate,
        kp: (document.querySelector('[data-testid="astro-tech-cat-kp"]') as HTMLInputElement).indeterminate,
        west: (document.querySelector('[data-testid="astro-tech-cat-western"]') as HTMLInputElement).checked,
      }));
      ok(mixed.top && mixed.kp && mixed.west, "tek teknik kaldırılınca üst + KP kutusu 'bir kısmı'; Batı tam", mixed);
      await page.locator("[data-astro-tech-clear]").click();
      ok((await page.locator("[data-astro-tech-count]").innerText()).includes("0 / 48"), "SEÇİMİ TEMİZLE → 0");
      await page.locator("[data-astro-tech-save]").click();
      ok((await page.locator("[data-astro-tech-warn]").innerText()).includes("Hiç teknik seçilmedi"), "boş kayıtta açık uyarı");
      ok(puts.length === 0, "boş kayıtta istek gönderilmedi", puts);
      await snap(page, "ogrenci-bos-kayit-uyarisi");

      await page.getByTestId("astro-tech-cat-kp").check();
      await page.locator("[data-astro-tech-cancel]").click();
      ok(!(await drawer(page).isVisible()), "İptal → panel kapandı");
      const r1 = await row(student.id);
      ok(r1.module_permissions.astrology !== true && r1.astrology_technique_grants === null && puts.length === 0, "İptal → DB değişmedi, istek yok", r1);
      ok((await astroSwitch(page).getAttribute("aria-checked")) === "false", "İptal → anahtar kapalı kaldı");

      await astroSwitch(page).click();
      await drawer(page).waitFor();
      ok((await page.locator("[data-astro-tech-count]").innerText()).includes("0 / 48"), "yeniden açılınca iptal edilen taslak taşınmadı");
      await page.locator('[data-astro-tech-item="western.natal"]').check();
      await page.locator('[data-astro-tech-item="western.transit"]').check();
      const before = await auditCount(student.id);
      await page.locator("[data-astro-tech-save]").click();
      await drawer(page).waitFor({ state: "detached", timeout: 15_000 });
      const r2 = await row(student.id);
      ok(r2.module_permissions.astrology === true && r2.module_permissions.clients === true, "kayıt → Astroloji açıldı, diğer modül korundu", r2.module_permissions);
      ok(JSON.stringify(r2.astrology_technique_grants) === JSON.stringify({ mode: "list", techniques: ["western.natal", "western.transit"] }), "kayıt → yalnız seçilen 2 teknik", r2.astrology_technique_grants);
      ok(puts.length === 1 && puts[0].endsWith("/astrology-techniques"), "tek istek (modül + teknikler birlikte)", puts);
      ok((await auditCount(student.id)) - before === 2, "aynı işlemde 2 denetim satırı (modül + teknik)");
      ok((await astroSwitch(page).getAttribute("aria-checked")) === "true", "anahtar açık görünür");
      ok((await page.locator("[data-astro-tech-summary-text]").innerText()).includes("2/48"), "özet 2/48");
      await snap(page, "ogrenci-kayit-sonrasi-ozet");

      await page.locator("[data-astro-tech-edit]").click();
      await drawer(page).waitFor();
      ok(await page.locator('[data-astro-tech-item="western.natal"]').isChecked() && (await page.locator("[data-astro-tech-count]").innerText()).includes("2 / 48"), "Teknikleri Düzenle → kayıtlı seçimle açılır");
      await page.keyboard.press("Escape");
      ok(!(await drawer(page).isVisible()), "Esc → panel kapandı (kayıt yok)");

      await astroSwitch(page).click(); // kapat (mevcut modül anahtarı akışı)
      await page.waitForTimeout(1500);
      const r3 = await row(student.id);
      ok(r3.module_permissions.astrology === false && JSON.stringify(r3.astrology_technique_grants) === JSON.stringify(r2.astrology_technique_grants), "Astroloji kapatıldı; teknik seçimi KORUNDU", r3);
      ok((await page.locator("[data-astro-tech-summary-text]").innerText()).includes("korunuyor"), "kapalıyken 'seçim korunuyor' bilgisi");
      await astroSwitch(page).click();
      await drawer(page).waitFor();
      ok((await page.locator("[data-astro-tech-count]").innerText()).includes("2 / 48"), "yeniden açılınca kayıtlı seçim geri geldi");
      await page.locator("[data-astro-tech-save]").click();
      await drawer(page).waitFor({ state: "detached", timeout: 15_000 });
      ok((await row(student.id)).module_permissions.astrology === true, "yeniden kaydedince Astroloji açık");
      ok(await noHScroll(page), "masaüstü: yatay taşma yok");
      await ctx.close();
    }

    section("2. Ücretli uzman (Tümü) — masaüstü özet + düzenle");
    {
      const { ctx, page } = await ctxFor({ width: 1440, height: 900 });
      await openUser(page, paid.id);
      ok((await page.locator("[data-astro-tech-summary-text]").innerText()).includes("Tüm teknikler açık (48/48)"), "özet: Tüm teknikler (48/48)");
      await page.locator("[data-astro-tech-edit]").click();
      await drawer(page).waitFor();
      ok(await page.getByTestId("astro-tech-all").isChecked(), "TÜMÜNÜ SEÇ işaretli");
      await snap(page, "ucretli-panel-tumu-masaustu");
      await page.locator("[data-astro-tech-cancel]").click();
      await ctx.close();
    }

    section("3. Mobil 390×844 — tam genişlik, yalnız içerik kayar, düğmeler görünür");
    {
      const { ctx, page } = await ctxFor({ width: 390, height: 844 }, true);
      await openUser(page, paid.id);
      await page.locator("[data-astro-tech-edit]").click();
      await drawer(page).waitFor();
      const box = await drawer(page).boundingBox();
      ok(!!box && Math.round(box.width) === 390, "mobil: panel tam genişlik", box);
      const save = await page.locator("[data-astro-tech-save]").boundingBox();
      ok(!!save && save.y + save.height <= 844, "mobil: Kaydet düğmesi ekranda", save);
      const sc = await page.evaluate(() => {
        const el = document.querySelector("[data-astro-tech-scroll]") as HTMLElement;
        const before = el.scrollTop;
        el.scrollTop = 600;
        return { scrollable: el.scrollHeight > el.clientHeight, moved: el.scrollTop > before, bodyLocked: getComputedStyle(document.body).overflow === "hidden" };
      });
      ok(sc.scrollable && sc.moved && sc.bodyLocked, "mobil: yalnız panel içeriği kayar (sayfa kilitli)", sc);
      const save2 = await page.locator("[data-astro-tech-save]").boundingBox();
      ok(!!save2 && save2.y + save2.height <= 844, "mobil: kaydırınca da Kaydet görünür");
      ok(await noHScroll(page), "mobil: yatay taşma yok");
      await snap(page, "mobil-panel-kaydirilmis");
      await ctx.close();
    }

    section("4. Uzman onaylama — Astroloji seçilince teknik paneli; teknik seçmeden onay yok (masaüstü)");
    {
      const { ctx, page } = await ctxFor({ width: 1440, height: 900 });
      await page.goto(`${APP}/admin/users/${applicant.id}`, { waitUntil: "networkidle" });
      // TRIAL7 sonrası başvuru onayı: "Pro Üyeliği Onayla" (eski "Onayla" düğmesi yok). Gönder düğmesi pencerede aynı adı taşır.
      await page.getByRole("button", { name: "Pro Üyeliği Onayla", exact: true }).first().click();
      await page.locator("#approve-title").waitFor({ timeout: 15_000 });
      await page.locator("#module-astrology").click();
      await drawer(page).waitFor({ timeout: 10_000 });
      ok(true, "Astroloji işaretlenince teknik paneli açıldı");
      await page.locator("[data-astro-tech-cancel]").click();
      ok(!(await drawer(page).isVisible()) && !(await page.locator("#module-astrology").isChecked()) && (await page.locator("#approve-title").isVisible()), "panel İptal → Astroloji seçilmedi, onay penceresi açık kaldı");
      await page.getByRole("button", { name: "Tüm modülleri seç" }).click();
      ok(await page.locator("[data-approve-astro-missing]").isVisible(), "Tüm modüller + teknik yok → açık uyarı");
      const approveDialog = page.locator('[role="dialog"][aria-labelledby="approve-title"]');
      const approveSubmit = approveDialog.getByRole("button", { name: "Pro Üyeliği Onayla", exact: true });
      // Ücretli Pro onay kutusu işaretlenir ki pasiflik YALNIZ eksik teknikten kaynaklansın (sahte PASS olmasın).
      await approveDialog.locator('input[type="checkbox"]').last().check();
      ok(await approveSubmit.isDisabled(), "onay kutusu işaretli + teknik seçilmeden onay düğmesi pasif");
      await page.locator("[data-approve-astro-edit]").click();
      await drawer(page).waitFor();
      await page.keyboard.press("Escape");
      ok(!(await drawer(page).isVisible()) && (await page.locator("#approve-title").isVisible()), "Esc yalnız teknik panelini kapattı (onay penceresi açık)");
      await page.locator("[data-approve-astro-edit]").click();
      await drawer(page).waitFor();
      await page.locator('[data-astro-tech-item="western.natal"]').check();
      await page.locator('[data-astro-tech-item="western.solar_return"]').check();
      await snap(page, "onay-teknik-paneli");
      await page.locator("[data-astro-tech-save]").click();
      ok(!(await drawer(page).isVisible()) && (await page.locator("[data-approve-astro-summary]").innerText()).includes("2/48"), "Seçimi Uygula → özet 2/48, panel kapandı");
      ok((await row(applicant.id)).astrology_technique_grants === null, "seçim uygulandı ama henüz HİÇBİR şey kaydedilmedi");
      await snap(page, "onay-penceresi-ozet");
      ok(await approveSubmit.isEnabled(), "teknik seçildi + onay kutusu işaretli → onay düğmesi etkin");
      await approveSubmit.click();
      await page.locator("#approve-title").waitFor({ state: "detached", timeout: 20_000 });
      const r = await q(`select approval_status, active, module_permissions, astrology_technique_grants from public.users where id=$1`, [applicant.id]);
      const u = r.rows[0] as { approval_status: string; active: boolean; module_permissions: Record<string, unknown>; astrology_technique_grants: unknown };
      ok(u.approval_status === "approved" && u.active === true && u.module_permissions.astrology === true, "onay: uzman onaylı + Astroloji açık", u);
      ok(JSON.stringify(u.astrology_technique_grants) === JSON.stringify({ mode: "list", techniques: ["western.natal", "western.solar_return"] }), "onay: teknik izinleri onayla birlikte kaydedildi", u.astrology_technique_grants);
      await ctx.close();
    }

    section("5. Yeni Uzman formu — Astroloji için teknik seçimi zorunlu (mobil 390×844)");
    {
      const { ctx, page } = await ctxFor({ width: 390, height: 844 }, true);
      // Üye Listesi V2 (#759) sonrası "Yeni Uzman" formu klasik listede.
      await page.goto(`${APP}/admin/users/klasik`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Yeni Uzman" }).click();
      await page.locator("#create-name").fill("ZZ Formdan Öğrenci");
      await page.locator("#create-email").fill("zz.formdan@example.test");
      await page.locator("#create-password").fill("Zz-Gecici-Parola-91");
      await page.locator("#create-module-astrology").click();
      await drawer(page).waitFor({ timeout: 10_000 });
      const box = await drawer(page).boundingBox();
      ok(!!box && Math.round(box.width) === 390, "mobil: form içinden açılan panel tam genişlik", box);
      await page.locator('[data-astro-tech-item="sky.lunations"]').check();
      await page.locator("[data-astro-tech-save]").click();
      ok((await page.locator("[data-create-astro]").innerText()).includes("1/48"), "formda özet 1/48");
      await page.getByRole("button", { name: "Uzmanı Oluştur ve Onayla" }).click();
      await page.waitForTimeout(2500);
      const r = await q(`select module_permissions, astrology_technique_grants from public.users where email='zz.formdan@example.test'`);
      const u = r.rows[0] as { module_permissions: Record<string, unknown>; astrology_technique_grants: unknown } | undefined;
      ok(!!u && u.module_permissions.astrology === true && JSON.stringify(u.astrology_technique_grants) === JSON.stringify({ mode: "list", techniques: ["sky.lunations"] }), "yeni uzman: Astroloji + yalnız seçilen teknik", u);
      ok(await noHScroll(page), "mobil: yatay taşma yok");
      await ctx.close();
    }

    section("6. Kayıtta ağ hatası — sunucudan gerçek durum doğrulanır");
    {
      const { ctx, page } = await ctxFor({ width: 1440, height: 900 });
      await openUser(page, netUser.id);
      const PUT_URL = `**/api/admin/users/${netUser.id}/astrology-techniques`;
      // a) İstek SUNUCUYA ULAŞTI, yanıt kayboldu → geri okuma "kaydedilmiş" demeli.
      await page.route(PUT_URL, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        await route.fetch();
        return route.abort("connectionreset");
      });
      await astroSwitch(page).click();
      await drawer(page).waitFor();
      await page.locator('[data-astro-tech-item="western.natal"]').check();
      await page.locator("[data-astro-tech-save]").click();
      await page.locator("[data-astro-tech-msg]").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-astro-tech-msg]").innerText()).includes("sunucu kaydı doğrulandı"), "yanıt kayboldu + kayıt yapılmış → 'doğrulandı: kaydedilmiş'");
      ok((await row(netUser.id)).module_permissions.astrology === true, "DB: kayıt gerçekten yapılmış");
      await page.unroute(PUT_URL);
      // b) İstek sunucuya HİÇ ulaşmadı → geri okuma "değişmedi" (doğrulanmış) demeli.
      await page.route(PUT_URL, (route) => (route.request().method() === "PUT" ? route.abort("connectionreset") : route.continue()));
      await page.locator("[data-astro-tech-edit]").click();
      await drawer(page).waitFor();
      await page.locator('[data-astro-tech-item="western.transit"]').check();
      await page.locator("[data-astro-tech-save]").click();
      await page.locator("[data-astro-tech-warn]").waitFor({ timeout: 15_000 });
      ok((await page.locator("[data-astro-tech-warn]").innerText()).includes("sunucu doğrulandı, önceki izinler aynen duruyor"), "istek ulaşmadı → 'değişmedi' (geri okumayla doğrulandı)");
      ok(JSON.stringify((await row(netUser.id)).astrology_technique_grants) === JSON.stringify({ mode: "list", techniques: ["western.natal"] }), "DB: değişmedi");
      await page.unroute(PUT_URL);
      // c) Geri okuma da başarısız → belirsizlik AÇIKÇA bildirilir (kesin "değişmedi" yok).
      await page.route(PUT_URL, (route) => route.abort("connectionreset"));
      await page.locator("[data-astro-tech-save]").click();
      await page.waitForFunction(() => /doğrulanamadı/.test(document.querySelector("[data-astro-tech-warn]")?.textContent ?? ""), null, { timeout: 15_000 });
      const w = await page.locator("[data-astro-tech-warn]").innerText();
      ok(w.includes("doğrulanamadı") && w.includes("kaydedilmiş OLABİLİR") && !w.includes("değişmedi"), "geri okuma da yok → belirsizlik açıkça bildirildi", w);
      await snap(page, "ag-hatasi-belirsiz");
      await page.unroute(PUT_URL);
      await ctx.close();
    }

    section("7. Ağ / konsol");
    ok(external.length === 0, "dış ağ isteği yok", external.slice(0, 3));
    ok(pageErrors.length === 0, "sayfa hatası yok", pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await shim.close().catch(() => undefined);
    await db.stop().catch(() => undefined);
  }
  console.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail > 0) {
    console.log(fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
