/**
 * Danışan Yolculuğu web + mobil düzeltmeleri (DY-01 / DY-02 / DY-03 / DY-04) — gerçek tarayıcı UI harness.
 * PRODUCTION'A SIFIR TEMAS: gömülü Postgres + test shim (startDyEnv), ZZ_* sentetik veri.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/dy-web-mobil-duzeltmeler/ui.harness.ts [--out <klasör>]
 *
 * DY-01  Seanslar + Ödevler: kayıt başına TEK özet kart (tarih + kısa başlık), iç kart yok, Aç → kaydın tamamı;
 *        Düzenle → güncelleme (PATCH, sürüm) çalışır; Sil onayı açılır; Ödev hızlı durum düğmeleri yerinde.
 * DY-02  Beslenme: bölümler başlangıçta kapalı; alerjen seçimi yalnız Düzenle ile, Vazgeç geri alır (istek yok),
 *        Kaydet PUT gönderir ve düzenleme kapanır; ölçüm/tercih ekleme alanı yalnız Düzenle ile;
 *        /beslenme/planlar?newForClient=… → Yeni Plan bir kez açılır, adres temizlenir, yenilemede tekrar açılmaz.
 * DY-03  Mobil 390: sekmeye basınca bölüm başına kaydırılır; masaüstünde sayfa kaymaz.
 * DY-04  Kayıt olmayan sekmenin Word'ü → dosya inmez + anlaşılır uyarı; kayıtlı sekmenin Word'ü iner.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { MIG_ALLERGEN_RPC, MIG_ALLERGEN_RPC_V2, readMig, startDyEnv } from "../dy-presale-closeout/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "dy-web-mobil-ui");
const PORT = 3981;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
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
async function waitFor(fn: () => Promise<boolean>, ms = 10000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean };
const DESKTOP: Device = { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false };
const MOBILE: Device = { name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true };

async function newContext(browser: Browser, seed: Seed, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
    ...(d.mobile ? { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36" } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_DYF_A", email: "zz.anamnez.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true, beslenme: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", t as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}
const tab = (page: Page, name: RegExp) => page.getByRole("tab", { name });
const panel = (page: Page, id: string) => page.locator(`#tabpanel-${id}`);

async function main() {
  const { env, seed } = await startDyEnv({ port: 54485, dirName: "dy-web-mobil-pgdata-r8", httpPort: 54521 });
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);
  // Gerçek şemaya yaklaştır: seans/ödev alanları + DY-03 sürüm migration'ı (CAS) + analiz tablosu.
  await q(`create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
             client_id uuid not null references public.clients(id) on delete cascade, analysis_type text, analysis_data jsonb, note text,
             image_url text, created_at timestamptz default now(), updated_at timestamptz default now());
           create table if not exists public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid,
             client_id uuid references public.clients(id) on delete cascade, file_path text, created_at timestamptz default now());
           grant select, insert, update, delete on public.client_analyses, public.client_stone_photos to service_role;
           alter table public.client_sessions add column if not exists duration_minutes int, add column if not exists fee numeric,
             add column if not exists actions_done text, add column if not exists suggestions text, add column if not exists next_plan text,
             add column if not exists updated_at timestamptz default now();
           alter table public.client_stones add column if not exists stone_date text, add column if not exists stone_type text,
             add column if not exists usage_area text, add column if not exists combination_text text, add column if not exists warning_text text,
             add column if not exists other_notes text, add column if not exists note text, add column if not exists updated_at timestamptz default now();
           alter table public.client_homeworks add column if not exists homework_type text, add column if not exists description text,
             add column if not exists start_date text, add column if not exists expert_note text, add column if not exists client_feedback text,
             add column if not exists updated_at timestamptz default now();`);
  await q(readMig("20271120000000_dy_subrecord_row_version.sql"));
  // Alerjen tam-set RPC + sürüm fonksiyonu (gerçek PUT rotası bunları kullanır).
  await q(readMig(MIG_ALLERGEN_RPC));
  await q(readMig(MIG_ALLERGEN_RPC_V2));
  await q(`update public.users set module_permissions = '{"clients":true,"appointments":true,"beslenme":true}'::jsonb where id=$1`, [seed.users.A.id]);
  const TA = seed.TA;
  const a1 = seed.clients.a1;
  const LONG = "ZZ uzun seans notu ".repeat(30).trim();
  await q(`insert into public.client_sessions(tenant_id, client_id, session_date, session_type, duration_minutes, session_note, actions_done, suggestions, next_plan)
           values ($1,$2,'2026-10-20','ZZ Refleksoloji',45,$3,'ZZ yapılan işlem','ZZ öneri metni','ZZ sonraki plan'),
                  ($1,$2,'2026-10-25','ZZ Online',30,'ZZ kısa not',null,null,null)`, [TA, a1, LONG]);
  await q(`insert into public.client_homeworks(tenant_id, client_id, title, homework_type, status, start_date, end_date, description, expert_note)
           values ($1,$2,'ZZ Nefes Ödevi','Nefes','devam','2026-10-20','2099-12-31','ZZ ödev açıklaması uzun metin','ZZ uzman notu'),
                  ($1,$2,'ZZ Yürüyüş','Hareket','bekliyor','2026-10-22','2099-12-31','ZZ yürüyüş açıklaması',null)`, [TA, a1]);
  await q(`delete from public.client_stones where client_id=$1`, [a1]);

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "pipe"],
    });
    app.stderr?.on("data", (b: Buffer) => { const t = b.toString(); if (/api-error|Error/.test(t)) process.stderr.write(`[app] ${t.slice(0, 400)}
`); });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    for (const d of [DESKTOP, MOBILE]) {
      section(`${d.name} — DY-01 Seanslar / Ödevler`);
      const ctx = await newContext(browser, seed, d);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${String(e)}`));
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=seanslar`, { waitUntil: "domcontentloaded" });
      const sp = panel(page, "seanslar");
      ok(await waitFor(async () => (await sp.getByText("ZZ Refleksoloji").count()) > 0, 30000), `${d.name}: Seanslar yüklendi`);
      const openBtns = sp.getByRole("button", { name: "Aç", exact: true });
      ok((await openBtns.count()) === 2, `${d.name}: kayıt başına TEK 'Aç' (2 kart)`, await openBtns.count());
      const sText = await sp.innerText();
      ok(/ZZ Refleksoloji/.test(sText) && /ZZ Online/.test(sText) && /2026|Ekim/.test(sText), `${d.name}: kartta kısa başlık + tarih`);
      ok(!sText.includes("ZZ yapılan işlem") && !sText.includes("ZZ uzun seans notu ZZ uzun"), `${d.name}: kartta alan kutuları (iç kart) yok — ayrıntı Aç ile`);
      const cardSel = "[data-tabpanel] dummy";
      void cardSel;
      const nested = await sp.evaluate((el) => {
        // Kayıt kartı (rounded-2xl gölgeli) içinde başka kart (rounded-xl/2xl border shadow) var mı?
        const cards = [...el.querySelectorAll("div.overflow-hidden.rounded-2xl")];
        return cards.some((c) => c.querySelector("div.rounded-xl.border.shadow-sm, div.rounded-2xl.border.shadow-sm"));
      });
      ok(!nested, `${d.name}: iç içe kart yok`);
      await openBtns.nth(1).click(); // tarih sırası: 25 Ekim önce, 20 Ekim (uzun not) ikinci
      const dlgText = (await page.locator("div.fixed.inset-0").last().innerText()).replace(/\s+/g, " ");
      ok(/ZZ Refleksoloji/.test(dlgText) && dlgText.includes("ZZ uzun seans notu") && /ZZ yapılan işlem/.test(dlgText) && /ZZ öneri metni/.test(dlgText) && /ZZ sonraki plan/.test(dlgText), `${d.name}: Aç → kaydın tamamı (4 alan) tek pencerede`, dlgText.slice(0, 160));
      await page.screenshot({ path: path.join(OUT, `seans-detay-${d.viewport.width}.png`) });
      await page.locator("div.fixed.inset-0").last().getByRole("button", { name: "Kapat", exact: true }).click();
      if (!d.mobile) {
        await sp.getByRole("button", { name: "Düzenle", exact: true }).first().click();
        const typeInput = sp.getByPlaceholder("Refleksoloji, online, bioenerji...");
        await typeInput.fill("ZZ Online Güncel");
        const patch = page.waitForResponse((r) => r.url().includes("/sessions") && r.request().method() === "PATCH", { timeout: 15000 });
        await sp.getByRole("button", { name: /Güncelle|Kaydet/ }).last().click();
        const pr = await patch.catch(() => null);
        ok(pr?.status() === 200 && await waitFor(async () => (await sp.getByText("ZZ Online Güncel").count()) > 0), "Düzenle → PATCH 200, kart güncellendi", pr?.status());
        const rv = (await q(`select row_version from public.client_sessions where client_id=$1 and session_type='ZZ Online Güncel'`, [a1])).rows[0]?.row_version;
        ok(Number(rv) === 2, "Düzenleme sürüm kontrolüyle kaydedildi (row_version 2)", rv);
        await sp.getByRole("button", { name: "Sil", exact: true }).first().click();
        ok(await page.getByRole("alertdialog").isVisible().catch(() => false), "Sil → onay penceresi açılır (mevcut silme korunur)");
        await page.getByRole("alertdialog").getByRole("button", { name: /Vazgeç|İptal/ }).first().click();
      }

      await tab(page, /Ödev/).click();
      const hp = panel(page, "odevler");
      ok(await waitFor(async () => (await hp.getByText("ZZ Nefes Ödevi").count()) > 0, 20000), `${d.name}: Ödevler yüklendi`);
      ok((await hp.getByRole("button", { name: "Aç", exact: true }).count()) === 2, `${d.name}: ödev başına TEK 'Aç'`);
      const hText = await hp.innerText();
      ok(!hText.includes("ZZ ödev açıklaması uzun metin") && !hText.includes("ZZ uzman notu"), `${d.name}: ödev kartında alan kutuları yok`);
      ok((await hp.getByRole("button", { name: /Tamamlandı/ }).count()) >= 2 && (await hp.getByRole("button", { name: "Düzenle", exact: true }).count()) === 2, `${d.name}: hızlı durum + Düzenle düğmeleri yerinde`);
      await hp.getByRole("button", { name: "Aç", exact: true }).first().click();
      const hd = (await page.locator("div.fixed.inset-0").last().innerText()).replace(/\s+/g, " ");
      ok(/ZZ Nefes Ödevi/.test(hd) && /ZZ ödev açıklaması uzun metin/.test(hd) && /ZZ uzman notu/.test(hd), `${d.name}: ödev Aç → kaydın tamamı`, hd.slice(0, 160));
      await page.locator("div.fixed.inset-0").last().getByRole("button", { name: "Kapat", exact: true }).click();
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${d.name}: yatay taşma yok`);

      section(`${d.name} — DY-03 sekme kaydırma`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      await tab(page, /Seans/).click();
      await page.waitForTimeout(1200);
      const pos = await page.evaluate(() => ({ y: window.scrollY, top: document.getElementById("tabpanel-seanslar")!.getBoundingClientRect().top }));
      if (d.mobile) ok(pos.y > 50 && pos.top > -10 && pos.top < 120, "mobil: sekmeye basınca bölüm başına yumuşak kaydırma", pos);
      else ok(pos.y === 0, "masaüstü: sekme tıklaması sayfayı kaydırmaz (mevcut davranış)", pos);

      if (!d.mobile) {
        section("masaüstü — DY-04 Word");
        await tab(page, /Doğaltaş/).click();
        const tp = panel(page, "taslar");
        await page.waitForTimeout(1500);
        const wordBtn = tp.getByRole("button", { name: /Word/ }).first();
        let downloaded = false;
        page.once("download", () => { downloaded = true; });
        const resp = page.waitForResponse((r) => r.url().includes("/word-report") && r.request().method() === "POST", { timeout: 15000 });
        await wordBtn.click();
        const r1 = await resp.catch(() => null);
        await page.waitForTimeout(1500);
        ok(r1?.status() === 422 && !downloaded, "kayıtsız sekme Word → 422, dosya inmedi", r1?.status());
        ok(/kayıt bulunmuyor/.test(await page.locator("body").innerText()), "kullanıcıya anlaşılır uyarı gösterildi");
        await page.screenshot({ path: path.join(OUT, "word-bos-uyari-1366.png") });
        await tab(page, /Seans/).click();
        const sw = panel(page, "seanslar").getByRole("button", { name: /Word/ }).first();
        const dl = page.waitForEvent("download", { timeout: 20000 }).catch(() => null);
        await sw.click();
        const file = (await dl)?.suggestedFilename() ?? "";
        ok(/\.docx$/.test(file), "kayıtlı sekme Word → dosya iner (mevcut dolu rapor korunur)", file);
      }
      await ctx.close();
    }

    section("masaüstü — DY-02 Beslenme");
    {
      const ctx = await newContext(browser, seed, DESKTOP);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`beslenme: ${String(e)}`));
      // Test shim'i gömülü ilişkiyi desteklemez → alerjen GET gerçek satırlardan; PUT gerçek rota + RPC.
      await page.route("**/api/beslenme/clients/*/allergens", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        const rows = (await q(`select a.id, a.allergen_id, a.custom_label, a.note, a.created_at,
            case when v.id is null then null else json_build_object('code', v.code, 'name_tr', v.name_tr, 'name_en', v.name_en, 'is_major', v.is_major) end as nutrition_allergens
          from public.nutrition_client_allergens a left join public.nutrition_allergens v on v.id = a.allergen_id where a.client_id=$1 order by a.created_at`, [a1])).rows;
        const version = (await q(`select public.nutrition_client_allergens_version($1,$2) v`, [TA, a1])).rows[0].v;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, allergens: rows, version }) });
      });
      let puts = 0;
      page.on("request", (r) => { if (r.url().includes("/allergens") && r.method() === "PUT") puts++; });
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=beslenme`, { waitUntil: "domcontentloaded" });
      const bp = panel(page, "beslenme");
      const allergenHeader = bp.getByRole("button", { name: /Beyan Edilen Alerjiler/ });
      ok(await waitFor(async () => (await allergenHeader.count()) === 1, 30000), "Beslenme bölümleri yüklendi");
      const expanded = await bp.locator("section h3 button[aria-expanded]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")));
      ok(expanded.length >= 4 && expanded.every((v) => v === "false"), "bölümler başlangıçta KAPALI", expanded);
      await allergenHeader.click();
      const sec = bp.locator("section").filter({ has: page.getByRole("button", { name: /Beyan Edilen Alerjiler/ }) });
      const chip = sec.getByRole("button", { name: /^Lateks/ });
      await chip.waitFor({ timeout: 10000 }).catch(async (e) => {
        await page.screenshot({ path: path.join(OUT, "beslenme-debug.png") });
        console.error("DEBUG sections:", await sec.count(), "expanded:", await allergenHeader.getAttribute("aria-expanded"), "metin:", (await bp.innerText()).slice(0, 900));
        throw e;
      });
      ok(await chip.isDisabled(), "alerjen seçimi Düzenle olmadan kapalı (kaydedilmemiş seçim kaydedilmiş gibi görünmez)");
      await sec.getByRole("button", { name: "Düzenle", exact: true }).click();
      ok(await chip.isEnabled(), "Düzenle → seçim açık");
      const pressedBefore = await chip.getAttribute("class");
      await chip.click();
      await sec.getByRole("button", { name: "Vazgeç", exact: true }).click();
      ok((await chip.getAttribute("class")) === pressedBefore && puts === 0 && await chip.isDisabled(), "Vazgeç → seçim geri alındı, istek yok, düzenleme kapandı");
      await sec.getByRole("button", { name: "Düzenle", exact: true }).click();
      await chip.click();
      const putResp = page.waitForResponse((r) => r.url().includes("/allergens") && r.request().method() === "PUT", { timeout: 15000 });
      await sec.getByRole("button", { name: /^Kaydet$/ }).click();
      const pr = await putResp.catch(() => null);
      ok(pr?.status() === 200 && await waitFor(async () => (await sec.getByRole("button", { name: "Düzenle", exact: true }).count()) === 1), "Kaydet → PUT 200, düzenleme kapandı", pr?.status());
      await page.reload({ waitUntil: "domcontentloaded" });
      await bp.getByRole("button", { name: /Beyan Edilen Alerjiler/ }).click();
      const chip2 = bp.locator("section").filter({ has: page.getByRole("button", { name: /Beyan Edilen Alerjiler/ }) }).getByRole("button", { name: /^Lateks/ });
      await chip2.waitFor({ timeout: 10000 });
      ok(/bg-emerald-600/.test((await chip2.getAttribute("class")) ?? ""), "yeniden açılışta kaydedilen alerjen KORUNDU (kendiliğinden kaybolmadı)");
      const measHeader = bp.getByRole("button", { name: /Ölçüm/ }).first();
      await measHeader.click();
      const msec = bp.locator("section").filter({ has: page.getByRole("button", { name: /Ölçüm/ }) });
      ok((await msec.getByRole("button", { name: /^Ekle$/ }).count()) === 0, "ölçüm ekleme alanı Düzenle olmadan görünmez");
      await msec.getByRole("button", { name: "Düzenle", exact: true }).click();
      ok((await msec.getByRole("button", { name: /^Ekle$/ }).count()) === 1, "Düzenle → ölçüm ekleme alanı görünür");
      await page.screenshot({ path: path.join(OUT, "beslenme-1366.png") });

      // Yeni Plan yeniden açılmaz
      await page.goto(`${APP}/beslenme/planlar?newForClient=${a1}&clientName=ZZ%20Dan%C4%B1%C5%9Fan`, { waitUntil: "domcontentloaded" });
      const dlg = page.getByRole("dialog");
      ok(await waitFor(async () => (await dlg.count()) > 0 && await dlg.first().isVisible(), 20000), "Yeni Plan penceresi bir kez açıldı (ön-seçili danışan)");
      ok(!/newForClient/.test(page.url()), "adres parametresi temizlendi", page.url());
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      ok((await dlg.count()) === 0 || !(await dlg.first().isVisible()), "yenilemede Yeni Plan tekrar AÇILMADI");
      await ctx.close();
    }
    ok(pageErrors.length === 0, "sayfa hatası yok", pageErrors);
  } catch (e) {
    fail++;
    console.error("HARNESS HATASI:", e);
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"]);
      else app.kill();
    }
    await env.stop().catch(() => {});
  }
  console.log(`Ekran görüntüleri: ${OUT}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
