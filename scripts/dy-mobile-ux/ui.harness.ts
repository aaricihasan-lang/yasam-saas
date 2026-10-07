/**
 * DANIŞAN YOLCULUĞU — MOBİL UX + ANALİZ GÜVENLİĞİ: GERÇEK TARAYICI UI HARNESS (PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/dy-mobile-ux/ui.harness.ts [--out <klasör>]
 *
 * Cihazlar: masaüstü 1366x900 · Android Chrome 390x844 · Android uygulama WebView 390x844 (UA "; wv)").
 * Kapsam: Anamnez PDF Ekle (mobil gizli / web görünür+çalışır), Başvuru nedeni metadata + yazım + kayıt,
 * Taşlar "Bilgisayardan Foto Seç" (mobil gizli / web görünür+çalışır), KVKK kompakt (varsayılan kapalı,
 * kırmızı başlık, aç/kapat, kayıt ekle, geçmiş), sekme sırası (Randevular Beslenme'den sonra),
 * analiz Kaydet ve Kapat (başarı kapanır / hata açık kalır / çift tık tek istek), kayıtlı analiz
 * salt okunur → Düzenle, Aktif Uyarı (tıklanabilir liste, ödevlere geçiş, toplu + tekli silme sonrası
 * sayfa yenilemeden sayaç güncel).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { startDyEnv } from "../dy-presale-closeout/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "dy-mobile-ux-ui");
const PORT = 3983;
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

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const DESKTOP: Device = { name: "masaüstü", viewport: { width: 1366, height: 900 }, mobile: false };
const ANDROID_CHROME: Device = {
  name: "Android Chrome", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};
const ANDROID_APP: Device = {
  name: "Android uygulama (WebView)", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 YasamSistemiAndroid/1.0",
};

async function newContext(browser: Browser, seed: Seed, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_DYM_A", email: "zz.anamnez.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

const isVisible = (page: Page, sel: string) => page.locator(sel).first().isVisible().catch(() => false);

async function main() {
  const { env, seed } = await startDyEnv({ port: 54496, dirName: "dy-mobile-ux-pgdata", httpPort: 54521 });
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);
  await q(`create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
             client_id uuid not null references public.clients(id) on delete cascade, analysis_type text, analysis_data jsonb, note text,
             image_url text, created_at timestamptz default now(), updated_at timestamptz default now());
           create table if not exists public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid,
             client_id uuid references public.clients(id) on delete cascade, file_path text, created_at timestamptz default now());
           grant select, insert, update, delete on public.client_analyses, public.client_stone_photos to service_role;`);
  await q(`update public.users set module_permissions = '{"clients":true,"appointments":true}'::jsonb where id=$1`, [seed.users.A.id]);
  const TA = seed.TA;
  const a1 = seed.clients.a1;

  // Aktif Uyarı için 3 sentetik danışan + geciken ödevler (biri tekli silme testinde kullanılır).
  const mkAlertClient = async (ad: string, n: number) => {
    const id = randomUUID();
    await q(`insert into public.clients(id, tenant_id, ad, soyad) values ($1,$2,$3,'ZZUYARI')`, [id, TA, ad]);
    for (let i = 0; i < n; i++) {
      await q(`insert into public.client_homeworks(tenant_id, client_id, title, status, end_date) values ($1,$2,$3,'devam','2020-01-01')`, [TA, id, `ZZ ödev ${i}`]);
    }
    return id;
  };
  const alertC1 = await mkAlertClient("ZZ Uyarı Bir", 1);
  const alertC2 = await mkAlertClient("ZZ Uyarı İki", 1);
  const alertC3 = await mkAlertClient("ZZ Uyarı Üç", 2);

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // ── 0) Anamnez kaydı oluştur (masaüstü) ──────────────────────────────────
    {
      const ctx = await newContext(browser, seed, DESKTOP);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`anamnez-create: ${e.message}`));
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
      await page.getByRole("heading", { name: "Anamnez", exact: true }).waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "Yeni Anamnez Oluştur" }).click();
      await page.getByRole("dialog").waitFor();
      await page.getByRole("button", { name: "Anamnezi Oluştur" }).click();
      await page.getByText("Taslak", { exact: true }).first().waitFor({ timeout: 30_000 });
      await ctx.close();
    }

    for (const d of [DESKTOP, ANDROID_CHROME, ANDROID_APP]) {
      const ctx = await newContext(browser, seed, d);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));
      const isDesk = !d.mobile;

      // ── A) Anamnez ──────────────────────────────────────────────────────────
      section(`A. Anamnez — ${d.name}`);
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
      await page.getByRole("heading", { name: "Anamnez", exact: true }).waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: "Taslağa devam et" }).first().click({ timeout: 30_000 });
      if (d === ANDROID_APP) ok(await page.evaluate(() => document.documentElement.hasAttribute("data-android-app")), "SSR: html[data-android-app] (WebView UA)");
      await page.getByText("Belgeler (PDF)").first().waitFor({ timeout: 30_000 });
      const pdfBtn = page.getByTestId("anamnez-pdf-upload");
      ok((await pdfBtn.count()) === 1, "PDF Ekle DOM'da (web özelliği kaldırılmadı)");
      ok((await pdfBtn.isVisible()) === isDesk, `PDF Ekle ${isDesk ? "GÖRÜNÜR" : "GİZLİ"}`);
      if (isDesk) {
        const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), pdfBtn.click()]);
        ok(!!chooser && (await chooser.element().getAttribute("accept"))?.includes("pdf") === true, "web: PDF Ekle dosya seçiciyi açıyor (accept=pdf)");
        await chooser.setFiles({ name: "zz-belge.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%zz\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n") });
        ok(await page.getByText("📄 zz-belge.pdf").waitFor({ timeout: 30_000 }).then(() => true, () => false), "web: PDF gerçekten yüklendi (ek listesinde)");
      }
      const reason = page.locator("#anamnez-i-A-reason");
      if (!(await reason.isVisible())) await page.getByRole("button", { name: /Görüşme ve Başvuru/ }).click();
      await reason.waitFor({ state: "visible", timeout: 10_000 });
      const attrs = await reason.evaluate((el) => ({
        tag: el.tagName, name: el.getAttribute("name"), ac: el.getAttribute("autocomplete"),
        cap: el.getAttribute("autocapitalize"), spell: el.getAttribute("spellcheck"), lp: el.getAttribute("data-lpignore"),
      }));
      ok(attrs.tag === "TEXTAREA" && attrs.name === "anamnez_A_reason" && attrs.ac === "off" && attrs.cap === "sentences" && attrs.spell === "true" && attrs.lp === "true",
        "Başvuru nedeni: kimlik-dışı metadata (name/autocomplete=off/autocapitalize/spellcheck/pm-ignore)", attrs);
      const credFields = await page.evaluate(() => ({
        password: document.querySelectorAll('input[type="password"]').length,
        credAc: document.querySelectorAll('[autocomplete~="username"],[autocomplete~="current-password"],[autocomplete~="new-password"],[autocomplete~="email"]').length,
      }));
      ok(credFields.password === 0 && credFields.credAc === 0, "sayfada parola/kimlik alanı yok (parola yöneticisi tetikleyicisi yok)", credFields);
      const sample = `ZZ başvuru nedeni ${d.name} — baş ağrısı, uyku düzensizliği`;
      await reason.click();
      await reason.fill("");
      await page.keyboard.type(sample, { delay: 2 });
      ok((await reason.inputValue()) === sample, "textarea normal klavye ile yazılıyor");
      const other = page.locator("textarea[name^='anamnez_'], input[name^='anamnez_']");
      ok((await other.count()) >= 5, `diğer serbest metin alanları da aynı metadata'da (${await other.count()})`);
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await page.getByText("✓ Tüm değişiklikler kaydedildi").waitFor({ timeout: 20_000 });
      const saved = (await q(`select answers->>'A.reason' r from public.client_anamneses where client_id=$1 order by updated_at desc limit 1`, [a1])).rows[0]?.r;
      ok(saved === sample, "anamnez kaydı DB'de (Başvuru nedeni)", saved);

      // ── B) Taşlar ───────────────────────────────────────────────────────────
      section(`B. Taşlar — ${d.name}`);
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=taslar`);
      await page.getByRole("button", { name: "+ Yeni Taş Ekle" }).click({ timeout: 60_000 });
      const picker = page.getByTestId("stone-create-photo-picker");
      ok((await picker.count()) === 1, "Bilgisayardan Foto Seç DOM'da (web özelliği kaldırılmadı)");
      ok((await picker.isVisible()) === isDesk, `Bilgisayardan Foto Seç ${isDesk ? "GÖRÜNÜR" : "GİZLİ"}`);
      if (isDesk) {
        const label = page.getByText("Bilgisayardan Foto Seç", { exact: true });
        const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 10_000 }), label.click()]);
        ok(!!chooser && chooser.isMultiple(), "web: Bilgisayardan Foto Seç çoklu dosya seçiciyi açıyor");
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
        await chooser.setFiles([{ name: "zz1.png", mimeType: "image/png", buffer: png }, { name: "zz2.png", mimeType: "image/png", buffer: png }]);
        ok(await picker.locator("img").count() === 2, "web: 2 foto seçildi, önizlemeler görünüyor");
      }

      // ── C) KVKK ─────────────────────────────────────────────────────────────
      section(`C. KVKK — ${d.name}`);
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=genel`);
      const toggle = page.getByTestId("kvkk-toggle");
      await toggle.waitFor({ timeout: 60_000 });
      const body = page.getByTestId("kvkk-body");
      ok((await toggle.getAttribute("aria-expanded")) === "false" && !(await body.isVisible()), "varsayılan KAPALI (yalnız başlık)");
      const tone = await toggle.evaluate((el) => getComputedStyle(el).color);
      ok(/rgb\(190, 18, 60\)|rgb\(225, 29, 72\)|rgb\(159, 18, 57\)/.test(tone) && (await toggle.innerText()).includes("KVKK Aydınlatma ve Onam"), `kırmızı/uyarı tonlu başlık (${tone})`);
      ok(await page.getByText(/KVKK (eksik|kaydı yok)/).first().isVisible(), "üst KVKK durum rozeti çalışmaya devam ediyor");
      await toggle.click();
      ok((await toggle.getAttribute("aria-expanded")) === "true" && (await body.isVisible()), "dokununca AÇILDI");
      for (const txt of ["Aydınlatma metni bildirildi", "Kayıt türü", "Durum", "Alınma yöntemi", "Kaydı ekle", "Örnek aydınlatma metni", "Kayıt geçmişi"]) {
        ok(await body.getByText(txt, { exact: false }).first().isVisible(), `açık panelde: ${txt}`);
      }
      const before = (await q(`select count(*)::int n from public.client_consents where client_id=$1`, [a1])).rows[0].n as number;
      await body.getByRole("button", { name: /Kaydı ekle/ }).click();
      await page.waitForFunction(
        async () => true, undefined, { timeout: 2000 },
      ).catch(() => undefined);
      let after = before;
      for (let i = 0; i < 20 && after === before; i++) {
        await page.waitForTimeout(300);
        after = (await q(`select count(*)::int n from public.client_consents where client_id=$1`, [a1])).rows[0].n as number;
      }
      ok(after === before + 1, `Kaydı ekle → DB'ye yazıldı (${before}→${after})`);
      await body.getByText(/Kayıt geçmişi \(\d+\)/).click();
      ok(await body.getByText(new RegExp(`Kayıt geçmişi \\(${after}\\)`)).isVisible(), "kayıt geçmişi güncel sayıyı gösteriyor");
      await toggle.click();
      ok((await toggle.getAttribute("aria-expanded")) === "false" && !(await body.isVisible()), "tekrar dokununca KAPANDI");

      // ── D) Sekme sırası ─────────────────────────────────────────────────────
      section(`D. Sekme sırası — ${d.name}`);
      const tabs = await page.getByRole("tab").allInnerTexts();
      const clean = tabs.map((x) => x.trim());
      const iR = clean.findIndex((x) => /Randevu/.test(x));
      const iB = clean.findIndex((x) => /Beslenme/.test(x));
      ok(iR > iB && iB >= 0 && iR === clean.length - 1, `Randevular Beslenme'den SONRA (${clean.join(" | ")})`);
      ok(clean.slice(0, 3).join("|").includes("Genel") && clean.some((x) => /Analiz/.test(x)), "diğer sekmeler korunuyor");
      await page.getByRole("tab", { name: /Randevu/ }).click();
      ok(await page.locator("#tabpanel-randevular").waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false) && (await page.getByRole("tab", { name: /Randevu/ }).getAttribute("aria-selected")) === "true", "Randevular → doğru bölüm açıldı");
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=randevular`);
      ok((await page.getByRole("tab", { name: /Randevu/ }).getAttribute("aria-selected")) === "true", "?tab=randevular route'u çalışıyor");

      // ── E) Analiz ───────────────────────────────────────────────────────────
      section(`E. Analiz — ${d.name}`);
      await q(`delete from public.client_analyses where client_id=$1`, [a1]);
      const reqs: string[] = [];
      page.on("request", (r) => { if (/\/api\/clients\/[^/]+\/analyses$/.test(new URL(r.url()).pathname) && r.method() !== "GET") reqs.push(r.method()); });
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=analizler`);
      const chakraCard = page.locator("article,div").filter({ hasText: "Çakra Analizi" }).getByRole("button", { name: "Analizi Aç" }).first();
      await chakraCard.click({ timeout: 60_000 });
      await page.locator("#analysis-print-area").waitFor();
      const saveBtn = page.getByTestId("analysis-save-close");
      ok((await saveBtn.innerText()).includes("Kaydet ve Kapat"), "alt buton: Kaydet ve Kapat");
      ok(await page.getByRole("button", { name: "Kapat", exact: true }).isVisible(), "üstteki X duruyor");
      const firstInput = page.locator("#analysis-print-area input").first();
      await firstInput.fill("+5");
      // Hata → modal AÇIK kalır.
      await page.route(/\/api\/clients\/[^/]+\/analyses$/, (route) =>
        route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "ZZ sunucu hatası" }) }) : route.continue());
      await saveBtn.click();
      await page.getByText(/ZZ sunucu hatası/).first().waitFor({ timeout: 10_000 });
      ok(await page.locator("#analysis-print-area").isVisible(), "kayıt BAŞARISIZ → modal açık kaldı + hata gösterildi");
      await page.unroute(/\/api\/clients\/[^/]+\/analyses$/);
      // Başarı + çift tık → tek POST, modal kapanır.
      reqs.length = 0;
      await saveBtn.dblclick();
      await page.locator("#analysis-print-area").waitFor({ state: "detached", timeout: 30_000 });
      const n1 = (await q(`select count(*)::int n from public.client_analyses where client_id=$1`, [a1])).rows[0].n;
      ok(reqs.filter((m) => m === "POST").length === 1 && n1 === 1, `başarılı kayıt → modal KAPANDI · çift tık tek POST (${reqs.join(",")}) · DB ${n1}`);
      // Kayıtlı analiz "Aç" → salt okunur.
      await page.getByRole("button", { name: "Aç", exact: true }).first().click();
      await page.locator("#analysis-print-area").waitFor();
      const fs = page.getByTestId("analysis-fields");
      ok(await fs.evaluate((el) => (el as HTMLFieldSetElement).disabled), "Aç → alanlar SALT OKUNUR (fieldset disabled)");
      ok(await page.locator("#analysis-print-area input").first().isDisabled(), "giriş alanı devre dışı");
      ok((await page.getByTestId("analysis-save-close").count()) === 0 && (await page.getByTestId("analysis-edit").isVisible()), "Kaydet yok, belirgin Düzenle var");
      ok(await page.getByTestId("analysis-mode-banner").isVisible(), "salt okunur bilgilendirmesi görünür");
      await page.locator("#analysis-print-area input").first().click({ force: true }).catch(() => undefined);
      await page.keyboard.type("999");
      ok((await page.locator("#analysis-print-area input").first().inputValue()) === "+5", "Düzenle'ye basmadan değer DEĞİŞMEDİ");
      reqs.length = 0;
      await page.getByTestId("analysis-edit").click();
      ok(!(await fs.evaluate((el) => (el as HTMLFieldSetElement).disabled)), "Düzenle → alanlar düzenlenebilir");
      await page.locator("#analysis-print-area input").first().fill("-3");
      await page.getByTestId("analysis-save-close").click();
      await page.locator("#analysis-print-area").waitFor({ state: "detached", timeout: 30_000 });
      const row = (await q(`select count(*)::int n from public.client_analyses where client_id=$1`, [a1])).rows[0];
      const data = (await q(`select analysis_data from public.client_analyses where client_id=$1`, [a1])).rows[0]?.analysis_data as { values?: Record<string, { mark?: string }> };
      const marks = Object.values(data?.values ?? {}).map((v) => v?.mark).filter(Boolean);
      ok(row.n === 1 && reqs.includes("PATCH") && !reqs.includes("POST") && marks.includes("-3"), `Düzenle + Kaydet ve Kapat → aynı kayıt GÜNCELLENDİ (PATCH, kayıt sayısı ${row.n})`, { reqs, marks });
      await page.screenshot({ path: path.join(OUT, `analiz-${d.viewport.width}.png`) });
      await ctx.close();
    }

    // ── F) Aktif Uyarı ────────────────────────────────────────────────────────
    for (const d of [ANDROID_CHROME, DESKTOP]) {
      section(`F. Aktif Uyarı — ${d.name}`);
      const ctx = await newContext(browser, seed, d);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(`uyarı ${d.name}: ${e.message}`));
      await page.goto(`${APP}/danisan-yolculugu/liste`);
      const card = page.getByTestId("dy-alerts-card");
      await card.waitFor({ timeout: 60_000 });
      // Uyarılar yüklenene kadar kart 0 gösterir → beklenen değeri bekle (masaüstü turunda tekli silme öncesi 4).
      await page.waitForFunction(() => document.querySelector('[data-testid="dy-alerts-card"] strong')?.textContent?.trim() === "4", undefined, { timeout: 20_000 }).catch(() => undefined);
      const count = async () => Number((await card.locator("strong").innerText()).trim());
      if (d === ANDROID_CHROME) {
        ok((await count()) === 4, `sayaç 4 (${await count()})`);
        await card.click();
        const panel = page.getByTestId("dy-alerts-panel");
        ok(await panel.isVisible(), "kart tıklanabilir → aktif uyarı listesi açıldı");
        const ptxt = await panel.innerText();
        ok(["ZZ Uyarı Bir", "ZZ Uyarı İki", "ZZ Uyarı Üç"].every((n) => ptxt.includes(n)) && /2 geciken ödev/.test(ptxt), "listede danışan adları + geciken ödev sayıları");
        const href = await page.getByTestId("dy-alert-link").first().getAttribute("href");
        ok(!!href && /\/dashboard\/clients\/[0-9a-f-]+\?tab=odevler$/.test(href), `uyarıdan ilgili danışanın Ödevler bölümüne bağlantı (${href})`);
        await page.getByTestId("dy-alert-link").first().click();
        await page.waitForURL(/tab=odevler/, { timeout: 30_000 });
        ok((await page.getByRole("tab", { name: /Ödev/ }).getAttribute("aria-selected")) === "true", "bağlantı → danışan detayında Ödevler sekmesi açık");
        await ctx.close();
        continue;
      }
      // Masaüstü: tekli silme (detay) → liste sayacı yenilemesiz.
      await page.goto(`${APP}/dashboard/clients/${alertC3}`);
      await page.getByRole("button", { name: /Danışanı Sil/ }).click({ timeout: 60_000 });
      const req = page.getByTestId("confirm-require-text");
      await req.waitFor();
      await req.fill("ZZ Uyarı Üç ZZUYARI");
      await page.getByTestId("confirm-ok").click();
      await page.waitForURL(/danisan-yolculugu\/liste/, { timeout: 30_000 });
      await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
      await page.waitForFunction(() => document.querySelector('[data-testid="dy-alerts-card"] strong')?.textContent?.trim() === "2", undefined, { timeout: 15_000 }).catch(() => undefined);
      ok((await count()) === 2, `tekli silme sonrası sayaç 4→2 (yenilemesiz; ${await count()})`);
      // Toplu silme (2 danışan) → 0, kart tıklanamaz. Taze liste yüklemesinden sonra "yenileme yok" işareti.
      await page.goto(`${APP}/danisan-yolculugu/liste`);
      await page.waitForFunction(() => document.querySelector('[data-testid="dy-alerts-card"] strong')?.textContent?.trim() === "2", undefined, { timeout: 20_000 }).catch(() => undefined);
      await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
      for (const name of ["ZZ Uyarı Bir", "ZZ Uyarı İki"]) {
        const card = page.locator("div[title]").filter({ hasText: name }).first();
        await card.getByRole("checkbox").check();
      }
      await page.getByRole("button", { name: /Seçilenleri Sil|Seçilileri Sil/ }).first().click();
      const req2 = page.getByTestId("confirm-require-text");
      await req2.waitFor();
      await req2.fill("SİL");
      await page.getByTestId("confirm-ok").click();
      await page.waitForFunction(() => document.querySelector('[data-testid="dy-alerts-card"] strong')?.textContent?.trim() === "0", undefined, { timeout: 30_000 }).catch(() => undefined);
      ok((await count()) === 0, `toplu silme sonrası sayaç 0 (sayfa yenilemeden; ${await count()})`);
      ok(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload === true), "sayfa yeniden yüklenmedi");
      ok((await card.evaluate((el) => el.tagName)) === "DIV" && !(await isVisible(page, '[data-testid="dy-alerts-panel"]')), "0 uyarıda kart tıklanabilir değil (yanıltıcı gezinme yok)");
      const left = (await q(`select count(*)::int n from public.client_homeworks where client_id = any($1)`, [[alertC1, alertC2, alertC3]])).rows[0].n;
      ok(left === 0, `silinen danışanlara bağlı ödev (yetim uyarı) kalmadı (${left})`);
      const api = await page.evaluate(async () => {
        const u = JSON.parse(localStorage.getItem("yasam_user") || "{}");
        const r = await fetch("/api/clients/homeworks-alerts", { headers: { "x-user-id": u.id, "x-session-token": localStorage.getItem("yasam_session_token") || "" } });
        return r.json();
      });
      ok(Object.keys(api.alerts ?? {}).length === 0, "sunucu: aktif uyarı yok", api);
      await ctx.close();
    }

    ok(pageErrors.length === 0, `sayfa JS hatası yok (${pageErrors.length})`, pageErrors);
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
        spawnSync("powershell", ["-NoProfile", "-Command",
          `Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`], { stdio: "ignore" });
      } else app.kill("SIGTERM");
    }
    await env.stop?.().catch(() => undefined);
  }
  writeFileSync(path.join(OUT, "result.txt"), `${pass} PASS / ${fail} FAIL\n${fails.join("\n")}\n`);
  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı  (çıktı: ${OUT})`);
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
