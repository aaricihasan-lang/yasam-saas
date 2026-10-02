/**
 * DANIŞAN YOLCULUĞU — SATIŞ ÖNCESİ KAPANIŞ: GERÇEK TARAYICI UI HARNESS (PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (build, gizli değer YOK — test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/dy-presale-closeout/ui.harness.ts [--out <klasör>]
 *
 * Mobil (360x800 / 375x667 / 390x844 / 412x915 / 667x375 yatay) + masaüstü (1280/1440/1920).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { startDyEnv, readMig, MIG_GENERAL_APPT, MIG_NOTES_RPC, MIG_ALLERGEN_RPC } from "./env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "dy-closeout-ui");
const APP = "http://127.0.0.1:3978";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

const MOBILE = [
  { name: "360x800", width: 360, height: 800 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "667x375-yatay", width: 667, height: 375 },
];

async function newContext(browser: Browser, seed: Seed, viewport: { width: number; height: number }, mobile: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_DY_A", email: "zz.dy.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
/** Öğe tamamen viewport içinde mi? */
const inViewport = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -1 && r.left >= -1 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1 && r.width > 0;
  });

async function main() {
  const { env, seed } = await startDyEnv({ port: 54494, dirName: "dy-closeout-ui-pgdata", httpPort: 54521 });
  await env.su.query(readMig(MIG_GENERAL_APPT));
  await env.su.query(readMig(MIG_NOTES_RPC));
  await env.su.query(readMig(MIG_ALLERGEN_RPC));
  await env.su.query(`update public.users set module_permissions = '{"clients":true,"appointments":true}'::jsonb where id=$1`, [seed.users.A.id]);
  const TA = seed.TA;
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);

  // Silme modalı için zengin danışanlar (viewport başına bir tane) + liste için ek danışanlar.
  const rich: Record<string, string> = {};
  for (const v of MOBILE) {
    const id = randomUUID();
    rich[v.name] = id;
    await q(`insert into public.clients(id, tenant_id, ad, soyad, telefon, dogum, kan, mizac) values ($1,$2,$3,'ZZ SİLME TESTİ','05000000000','1990-01-01','A Rh+','dem')`, [id, TA, `ZZ Mobil ${v.name}`]);
    await q(`insert into public.client_notes(tenant_id, client_id, notlar, saglik_notu, adres, oneriler) values ($1,$2,$3,'s','a','o')`, [TA, id, JSON.stringify([{ id: "n", content: "ZZ not", createdAt: new Date().toISOString() }])]);
    for (let i = 0; i < 6; i++) await q(`insert into public.appointments(tenant_id, client_id, title, appointment_date, status, notes) values ($1,$2,$3, now() + ($4 || ' days')::interval, 'bekliyor', $5)`, [TA, id, `ZZ Seans ${i + 1}`, String(i + 1), "ZZ çok satırlı randevu notu\n".repeat(6)]);
    for (const t of ["client_sessions", "client_homeworks", "client_stones", "client_combinations"]) await q(`insert into public.${t}(tenant_id, client_id) values ($1,$2)`, [TA, id]);
  }
  for (let i = 0; i < 6; i++) await q(`insert into public.clients(tenant_id, ad, soyad, burc, created_at) values ($1,$2,'ZZ LİSTE',$3, now() - ($4 || ' minutes')::interval)`, [TA, ["İpek", "Işıl", "Çağrı", "Cem", "Şule", "Ömer"][i], ["Koç", "Boğa", "Koç", "Yay", "Balık", "Koç"][i], String(i)]);
  // Beslenme: a1 için 3 beyan (notlu) — DY-04 testi.
  const latex = seed.allergen.latex;
  const extraAllergen = (await q(`insert into public.nutrition_allergens(code, name_tr, name_en, sort_order) values ('gluten','Gluten','Gluten',3) returning id`)).rows[0].id as string;
  await q(`update public.nutrition_client_allergens set note='ZZ şiddetli reaksiyon' where client_id=$1`, [seed.clients.a1]);
  await q(`insert into public.nutrition_client_allergens(tenant_id, client_id, allergen_id, note) values ($1,$2,$3,'ZZ hafif')`, [TA, seed.clients.a1, latex]);
  await q(`insert into public.nutrition_client_allergens(tenant_id, client_id, custom_label, note) values ($1,$2,'ZZ Çilek','ZZ kaşıntı')`, [TA, seed.clients.a1]);
  const allergenSnapshot = async () => (await q(`select coalesce(allergen_id::text, custom_label) k, note from public.nutrition_client_allergens where client_id=$1 order by 1`, [seed.clients.a1])).rows as Array<{ k: string; note: string | null }>;
  const before = await allergenSnapshot();

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", "3978", "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/danisan-yolculugu`, 120_000);
    browser = await chromium.launch();

    // ── 1. MOBİL LİSTE + FİLTRE ─────────────────────────────────────────────
    section("1. Mobil danışan listesi — kompakt Filtrele");
    for (const v of MOBILE) {
      const ctx = await newContext(browser, seed, v, true);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${v.name} liste: ${e.message}`));
      await page.goto(`${APP}/danisan-yolculugu/liste`);
      await page.getByText(/Kayıtlı Danışanlar/).first().waitFor({ timeout: 30_000 });
      await page.waitForFunction(() => /Kayıtlı Danışanlar\s*\(\d+\)/.test(document.body.innerText));
      const toggle = page.locator('button[aria-controls="dy-liste-filtre-panel"]');
      ok(await toggle.isVisible(), `${v.name}: tek satır "Filtrele" butonu görünür`);
      ok(!(await page.locator("#dy-liste-filtre-panel").isVisible()), `${v.name}: filtre paneli varsayılan KAPALI`);
      const firstTop = await page.evaluate(() => {
        const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /^(ZZ |İpek|Işıl|Çağrı|Cem|Şule|Ömer)/.test(e.textContent?.trim() ?? "") && (e as HTMLElement).offsetParent && e.closest("a,div[class*='cursor-pointer'],div"));
        return el ? Math.round(el.getBoundingClientRect().top) : -1;
      });
      const landscape = v.width > v.height;
      ok(firstTop > 0 && (landscape ? firstTop < v.height * 2 : firstTop + 40 < v.height), `${v.name}: ilk danışan ${landscape ? "≤2 ekran kaydırmada" : "ilk ekranda görünür"} (y=${firstTop}, vh=${v.height})`, firstTop);
      ok(await noHScroll(page), `${v.name}: liste yatay taşma yok`);
      if (v.name === "375x667") await shot(page, `liste-${v.name}-kapali`);
      await toggle.click();
      ok(await page.locator("#dy-liste-filtre-panel").isVisible(), `${v.name}: Filtrele → panel açıldı`);
      await page.locator("#dy-liste-filtre-panel input").first().fill("ipek");
      await page.waitForFunction(() => /Kayıtlı Danışanlar\s*\(1\)/.test(document.body.innerText), undefined, { timeout: 10_000 }).catch(() => {});
      ok(/Kayıtlı Danışanlar\s*\(1\)/.test(await page.locator("body").innerText()), `${v.name}: arama "ipek" → İpek (TR İ/i)`);
      await page.locator("#dy-liste-filtre-panel input").first().fill("");
      const selects = page.locator("#dy-liste-filtre-panel select");
      await selects.nth(0).selectOption("İ");
      ok(/Kayıtlı Danışanlar\s*\(1\)/.test(await page.locator("body").innerText()), `${v.name}: İlk Harf İ → 1 (I ≠ İ)`);
      await selects.nth(0).selectOption("I");
      ok(/Kayıtlı Danışanlar\s*\(1\)/.test(await page.locator("body").innerText()), `${v.name}: İlk Harf I → Işıl`);
      await selects.nth(0).selectOption("");
      await selects.nth(1).selectOption("Koç");
      const kocN = Number(/Kayıtlı Danışanlar\s*\((\d+)\)/.exec(await page.locator("body").innerText())?.[1]);
      await selects.nth(0).selectOption("Ç");
      ok(kocN === 3 && /Kayıtlı Danışanlar\s*\(1\)/.test(await page.locator("body").innerText()), `${v.name}: Burç Koç=3, + İlk Harf Ç kombinasyonu=1`, kocN);
      ok(/2/.test(await toggle.innerText()), `${v.name}: Filtrele rozeti aktif filtre sayısı (2)`);
      await page.getByRole("button", { name: /Filtreleri Temizle/ }).click();
      ok(!/\(1\)/.test(/Kayıtlı Danışanlar\s*\(\d+\)/.exec(await page.locator("body").innerText())?.[0] ?? ""), `${v.name}: Filtreleri Temizle → tüm liste`);
      if (v.name === "375x667") await shot(page, `liste-${v.name}-acik`);
      await ctx.close();
    }

    // ── 2. MOBİL DANIŞAN SİLME MODALI ────────────────────────────────────────
    section("2. Mobil danışan silme onayı (DY-03)");
    for (const v of MOBILE) {
      const ctx = await newContext(browser, seed, v, true);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${v.name} silme: ${e.message}`));
      const cid = rich[v.name];
      await page.goto(`${APP}/dashboard/clients/${cid}`);
      await page.getByRole("button", { name: /Danışanı Sil/ }).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: /Danışanı Sil/ }).click();
      const dlg = page.locator('[role="alertdialog"]');
      await dlg.waitFor({ timeout: 15_000 });
      await page.waitForTimeout(400);
      ok(await inViewport(page, '[role="alertdialog"]'), `${v.name}: silme onayı viewport içinde`);
      const confirmBtn = dlg.getByRole("button", { name: /Kalıcı Olarak Sil/ });
      const cancelBtn = dlg.getByRole("button", { name: /Vazgeç/ });
      ok(await confirmBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; }), `${v.name}: "Kalıcı Olarak Sil" görünür/erişilebilir`);
      ok(await cancelBtn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0; }), `${v.name}: "Vazgeç" görünür/erişilebilir`);
      ok(await page.evaluate(() => document.body.style.overflow === "hidden"), `${v.name}: arka sayfa kaydırma kilitli`);
      const scrollable = await dlg.locator("#confirm-message").evaluate((el) => {
        const box = el.parentElement as HTMLElement; return { sh: box.scrollHeight, ch: box.clientHeight, ov: getComputedStyle(box).overflowY };
      });
      ok(scrollable.ov === "auto", `${v.name}: önizleme gövdesi iç kaydırmalı (${scrollable.sh}/${scrollable.ch})`, scrollable);
      ok(await noHScroll(page), `${v.name}: modal açıkken yatay taşma yok`);
      await shot(page, `silme-${v.name}`);
      const name = await dlg.evaluate((el) => /adını yazın:\s*“([^”]+)”/.exec((el as HTMLElement).innerText)?.[1] ?? "");
      const input = dlg.locator("input");
      await input.scrollIntoViewIfNeeded();
      await input.fill(name);
      ok(await confirmBtn.isEnabled(), `${v.name}: ad yazılınca onay butonu aktif`);
      await confirmBtn.click();
      await page.waitForURL(/danisan-yolculugu\/liste/, { timeout: 30_000 });
      const left = (await q(`select count(*)::int n from public.clients where id=$1`, [cid])).rows[0].n;
      const orphan = (await q(`select (select count(*) from public.appointments where client_id=$1) + (select count(*) from public.client_notes where client_id=$1) + (select count(*) from public.client_sessions where client_id=$1) n`, [cid])).rows[0].n;
      ok(left === 0 && Number(orphan) === 0, `${v.name}: danışan + bağlı kayıtlar silindi (yetim yok)`);
      await ctx.close();
    }
    const others = (await q(`select count(*)::int n from public.clients where tenant_id=$1 and soyad='ZZ LİSTE'`, [TA])).rows[0].n;
    ok(others === 6, "diğer danışanlar etkilenmedi (6/6)");

    // ── 3. MOBİL RANDEVU MODALI (detay + ajanda) ────────────────────────────
    section("3. Mobil randevu modalları");
    const apptClient = randomUUID();
    await q(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,'ZZ Randevu','MODAL')`, [apptClient, TA]);
    await q(`insert into public.appointments(tenant_id, client_id, title, appointment_date, status, notes) values ($1,$2,'ZZ Çok uzun başlıklı randevu kaydı mobil kontrol', now() + interval '2 days', 'bekliyor', $3)`, [TA, apptClient, "ZZ uzun not satırı\n".repeat(30)]);
    for (const v of MOBILE) {
      const ctx = await newContext(browser, seed, v, true);
      const page = await ctx.newPage();
      await page.goto(`${APP}/dashboard/clients/${apptClient}?tab=randevular`);
      await page.getByText(/ZZ Çok uzun başlıklı/).first().waitFor({ timeout: 30_000 });
      await page.getByText(/ZZ Çok uzun başlıklı/).first().click();
      const dlg = page.locator('[role="dialog"][aria-labelledby="appt-modal-title"]');
      await dlg.waitFor({ timeout: 10_000 });
      ok(await inViewport(page, '[role="dialog"][aria-labelledby="appt-modal-title"]'), `${v.name}: detay randevu modalı viewport içinde`);
      for (const b of ["Düzenle", "Tamamlandı", "İptal Et", "Sil"]) {
        const vis = await dlg.getByRole("button", { name: new RegExp(`^${b}$`) }).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0 && r.height >= 40; });
        ok(vis, `${v.name}: detay modal "${b}" erişilebilir (≥40px)`);
      }
      ok(await noHScroll(page), `${v.name}: detay modal yatay taşma yok`);
      await shot(page, `randevu-modal-${v.name}`);
      await page.keyboard.press("Escape");
      ok(!(await dlg.isVisible()), `${v.name}: Escape modalı kapatır`);
      await ctx.close();
    }

    // Ajanda: Genel randevu UI oluştur + modal + sil.
    section("4. Ajanda — Genel Randevu (DY-02) + modal");
    {
      const v = MOBILE[1];
      const ctx = await newContext(browser, seed, v, true);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`ajanda: ${e.message}`));
      await page.goto(`${APP}/danisan-yolculugu/takip`);
      await page.waitForURL(/dashboard\/ajanda/, { timeout: 30_000 });
      await page.getByRole("button", { name: /Yeni Randevu Ekle/ }).click();
      await page.getByRole("button", { name: /Genel Randevu/ }).click();
      await page.getByPlaceholder(/Örn: Seans, Toplantı/).fill("ZZ Genel UI");
      await page.locator('input[type="date"]').first().fill("2027-03-15");
      await page.locator('input[type="time"]').first().fill("11:30");
      await page.getByRole("button", { name: /Randevu Kaydet/ }).click();
      await page.waitForTimeout(2000);
      const row = (await q(`select id, client_id, appointment_date from public.appointments where title='ZZ Genel UI'`)).rows[0];
      ok(!!row && row.client_id === null, "UI: Genel randevu oluşturuldu (client_id NULL)", row);
      ok(!!row && new Date(row.appointment_date).toISOString() === "2027-03-15T08:30:00.000Z", "UI: 11:30 İstanbul → 08:30Z", row?.appointment_date);
      await page.getByText("ZZ Genel UI").first().click();
      const dlg = page.locator('[role="dialog"][aria-labelledby="ajanda-appt-modal-title"]');
      await dlg.waitFor({ timeout: 10_000 });
      ok(await inViewport(page, '[role="dialog"][aria-labelledby="ajanda-appt-modal-title"]'), "ajanda modalı viewport içinde (375x667)");
      for (const b of ["Düzenle", "Tamamlandı", "İptal Et", "Sil"]) {
        const vis = await dlg.getByRole("button", { name: new RegExp(`^${b}$`) }).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.height >= 40; });
        ok(vis, `ajanda modal "${b}" erişilebilir`);
      }
      await shot(page, "ajanda-genel-modal-375x667");
      await dlg.getByRole("button", { name: /^Sil$/ }).click();
      const conf = page.locator('[role="alertdialog"]');
      await conf.waitFor({ timeout: 10_000 });
      await conf.getByRole("button").last().click();
      await page.waitForTimeout(1500);
      ok((await q(`select count(*)::int n from public.appointments where title='ZZ Genel UI'`)).rows[0].n === 0, "UI: Genel randevu silindi");
      await ctx.close();
    }

    // ── 5. TARİH DOĞRULAMASI (UI) ────────────────────────────────────────────
    section("5. Kayıt + Genel Bilgiler — gerçek tarih (UI)");
    {
      const ctx = await newContext(browser, seed, { width: 1280, height: 900 }, false);
      const page = await ctx.newPage();
      await page.goto(`${APP}/danisan-yolculugu/kayit`);
      const inputs = page.locator("main input");
      await inputs.nth(0).waitFor({ timeout: 30_000 });
      await inputs.nth(0).fill("ZZ Tarih");
      await inputs.nth(1).fill("Testi");
      await page.getByPlaceholder("GG.AA.YYYY").first().pressSequentially("31022000");
      ok(await page.getByPlaceholder("GG.AA.YYYY").first().getAttribute("aria-invalid") === "true", "31.02.2000 alanı geçersiz işaretli");
      await page.getByRole("button", { name: /Danışanı Kaydet/ }).click();
      await page.getByText(/Doğum tarihini GG\.AA\.YYYY/).first().waitFor({ timeout: 5000 }).then(() => ok(true, "31.02.2000 → kayıt engellendi + mesaj")).catch(() => ok(false, "31.02.2000 → kayıt engellendi + mesaj"));
      ok((await q(`select count(*)::int n from public.clients where ad='ZZ Tarih'`)).rows[0].n === 0, "31.02.2000 ile DB'ye kayıt YOK");
      const dob = page.getByPlaceholder("GG.AA.YYYY").first();
      await dob.fill("");
      await dob.pressSequentially("29022024");
      await page.getByRole("button", { name: /Danışanı Kaydet/ }).click();
      await page.waitForTimeout(2500);
      const created = (await q(`select dogum, burc from public.clients where ad='ZZ Tarih'`)).rows[0];
      ok(created?.dogum === "2024-02-29" && created?.burc === "Balık", "29.02.2024 → kaydedildi, burç Balık", created);
      await ctx.close();
    }
    {
      const ctx = await newContext(browser, seed, { width: 1280, height: 900 }, false);
      const page = await ctx.newPage();
      const cid = (await q(`select id from public.clients where ad='ZZ Tarih'`)).rows[0].id as string;
      await page.goto(`${APP}/dashboard/clients/${cid}`);
      await page.getByRole("button", { name: /Bilgileri Güncelle/ }).click();
      const dob = page.locator('main input[placeholder="GG.AA.YYYY"]').first();
      await dob.click();
      await dob.press("End");
      await dob.press("Backspace");
      ok((await dob.inputValue()) === "29.02.202", "tek Backspace yalnız bir haneyi siler (alan silinmez)", await dob.inputValue());
      await page.getByRole("button", { name: /Değişiklikleri Kaydet/ }).click();
      await page.waitForTimeout(1500);
      ok((await q(`select dogum from public.clients where id=$1`, [cid])).rows[0].dogum === "2024-02-29", "yarım doğum tarihiyle kayıt engellendi; kayıtlı doğum SİLİNMEDİ");
      await ctx.close();
    }

    // ── 6. BESLENME: YÜKLEME HATASI ≠ BOŞ VERİ (DY-04) ───────────────────────
    section("6. Beslenme alerjen — yükleme hatası (DY-04)");
    {
      const ctx = await newContext(browser, seed, { width: 1280, height: 900 }, false);
      const page = await ctx.newPage();
      let failAllergens = true;
      // Test shim'i gömülü ilişki seçimini (nutrition_allergens(...)) desteklemediğinden GET yanıtı
      // DB'deki GERÇEK satırlardan üretilir; PUT gerçek rota + gerçek RPC'ye gider.
      await page.route("**/api/beslenme/clients/*/allergens", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        if (failAllergens) return route.fulfill({ status: 500, contentType: "application/json", body: '{"ok":false}' });
        const rows = (await q(`select a.id, a.allergen_id, a.custom_label, a.note, a.created_at,
            case when v.id is null then null else json_build_object('code', v.code, 'name_tr', v.name_tr, 'name_en', v.name_en, 'is_major', v.is_major) end as nutrition_allergens
          from public.nutrition_client_allergens a left join public.nutrition_allergens v on v.id = a.allergen_id
          where a.client_id=$1 order by a.created_at`, [seed.clients.a1])).rows;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, allergens: rows }) });
      });
      await page.goto(`${APP}/dashboard/clients/${seed.clients.a1}?tab=beslenme`);
      const box = page.getByText(/Bu bölüm yüklenemedi/).first();
      await box.waitFor({ timeout: 30_000 });
      ok(await box.isVisible(), "alerjen GET 500 → hata kutusu (0 kayıt GÖSTERİLMEZ)");
      const saveVisible = await page.getByRole("button", { name: /^Kaydet$|Alerjileri Kaydet|Beyanı Kaydet/ }).count();
      ok(saveVisible === 0, "hata durumunda alerjen Kaydet butonu yok");
      ok(JSON.stringify(await allergenSnapshot()) === JSON.stringify(before), "hata sırasında DB'deki 3 beyan aynen duruyor");
      await shot(page, "beslenme-yukleme-hatasi");
      failAllergens = false;
      await page.getByRole("button", { name: /Tekrar dene/ }).first().click();
      try {
        await page.getByText("ZZ Çilek").first().waitFor({ timeout: 15_000 });
      } catch (e) {
        await shot(page, "beslenme-retry-debug");
        console.error("DEBUG beslenme text:", (await page.locator("main").innerText()).slice(0, 1500));
        throw e;
      }
      ok(!(await page.getByText(/Bu bölüm yüklenemedi/).first().isVisible().catch(() => false)), "Tekrar dene → veri geri geldi");
      await page.getByRole("button", { name: /^Gluten/ }).click();
            const putResp = page.waitForResponse((r) => r.url().includes("/allergens") && r.request().method() === "PUT", { timeout: 15_000 });
      const saveBtn = page.locator("section", { has: page.getByRole("heading", { name: "Beyan Edilen Alerjiler" }) }).getByRole("button", { name: /^Kaydet$/ });
      await saveBtn.first().click(); // alerjen bölüm başlığındaki Kaydet
      const pr = await putResp.catch(() => null);
      const putBody = pr?.request().postData() ?? "";
      ok(pr?.status() === 200 && /ZZ şiddetli reaksiyon/.test(putBody) && /ZZ kaşıntı/.test(putBody), "PUT yükü mevcut notları taşıyor (200)", { status: pr?.status(), putBody: putBody.slice(0, 200) });
      await page.waitForTimeout(1500);
      const after = await allergenSnapshot();
      ok(after.length === before.length + 1 && before.every((b) => after.some((a) => a.k === b.k && a.note === b.note)) && after.some((a) => a.k === extraAllergen),
        "kayıt sonrası: 3 eski beyan + notları korundu, yalnız Gluten eklendi", after);
      await ctx.close();
    }

    // ── 7. TAMAMLANMIŞ ANAMNEZ (UI) ──────────────────────────────────────────
    section("7. Tamamlanmış anamnez — belge ekle/kaldır yok");
    {
      const aid = (await q(`insert into public.client_anamneses(tenant_id, client_id, kind, template_version, title, assessment_date, status, completed_at, completed_by_user_id, created_by_user_id, form_custom)
        values ($1,$2,'initial','std-v1','ZZ kilit','2026-10-01','completed',now(),$3,$3,'{"custom":[],"hidden":[],"labels":{},"enabledSections":[]}'::jsonb) returning id`, [TA, seed.clients.a1, seed.users.A.id]).catch((e) => { console.error(e); return { rows: [] as Array<{ id: string }> }; })).rows[0]?.id as string | undefined;
      if (aid) {
        const ctx = await newContext(browser, seed, MOBILE[1], true);
        const page = await ctx.newPage();
        page.on("pageerror", (e) => console.error("DEBUG anamnez pageerror:", e.message));
        page.on("console", (m) => { if (m.type() === "error") console.error("DEBUG anamnez console:", m.text().slice(0, 300)); });
        page.on("response", (r) => { if (r.url().includes("/anamnez") && r.status() >= 400) console.error("DEBUG anamnez resp:", r.status(), r.url()); });
        await page.goto(`${APP}/dashboard/clients/${seed.clients.a1}/anamnez/${aid}`);
        try { await page.getByText(/Belgeler \(PDF\)/).first().waitFor({ timeout: 30_000 }); }
        catch (e) { await shot(page, "anamnez-kilit-debug"); console.error("DEBUG anamnez:", (await page.locator("body").innerText()).slice(0, 800)); throw e; }
        ok((await page.getByRole("button", { name: /PDF Ekle/ }).count()) === 0, "tamamlanmışta 'PDF Ekle' yok");
        ok(await page.getByText(/yalnız görüntülenebilir veya indirilebilir/).first().isVisible(), "kilit açıklaması gösteriliyor");
        await ctx.close();
      } else {
        ok(false, "tamamlanmış anamnez tohumlanamadı (şema)");
      }
    }

    // ── 8. YATAY TAŞMA (mobil + masaüstü) ────────────────────────────────────
    section("8. Yatay taşma regresyonu");
    const pages = ["/danisan-yolculugu", "/danisan-yolculugu/kayit", "/danisan-yolculugu/liste", "/dashboard/ajanda", `/dashboard/clients/${seed.clients.a1}`];
    for (const v of [...MOBILE, { name: "1280", width: 1280, height: 800 }, { name: "1440", width: 1440, height: 900 }, { name: "1920", width: 1920, height: 1080 }]) {
      const ctx = await newContext(browser, seed, v, v.width < 700);
      const page = await ctx.newPage();
      const bad: string[] = [];
      for (const p of pages) {
        await page.goto(`${APP}${p}`);
        await page.waitForTimeout(2500);
        if (!(await noHScroll(page))) bad.push(p);
      }
      ok(bad.length === 0, `${v.name}: 5 ekranda yatay taşma yok`, bad);
      await ctx.close();
    }
    ok(pageErrors.length === 0, "sayfa JS hatası (pageerror) yok", pageErrors.slice(0, 5));
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nDY satış öncesi kapanış UI harness: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { console.log("FAIL:\n - " + fails.join("\n - ")); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
