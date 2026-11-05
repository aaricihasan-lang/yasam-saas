/**
 * DY canlı denetim — GERÇEK KULLANICI AKIŞLARI (gerçek Chromium + production build; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (gizli değer YOK — yerel test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/dy-canli-denetim/flows.harness.ts [--out <klasör>]
 *
 * Zincir her kayıtta: Ekle → Kaydet → Yenile → Tekrar Aç → Doğrula (UI + DB).
 *  1  Yeni danışan (boş form uyarısı → kayıt)          7  Word: sekme / Tam Rapor / Tarih aralığı (DOCX içeriği)
 *  2  Genel bilgiler düzenle (sağlık notu + öneri)     8  C3 dosya adı (Türkçe büyük İ)
 *  3  Seans / Ödev / Taş (M3 zorunlu alan uyarıları)   9  İzolasyon: ikinci uzman (başka tenant) erişemez
 *  4  Not (boş not uyarısı)                            10 C7: geçersiz kimlik → "Danışan bulunamadı"
 *  5  Randevu (M2 boş tarih) → Ajanda'da görünür       11 Mobil 320/375/390 + masaüstü: yatay taşma yok
 *  6  M5: Yolculuk kenar çubuğu "Sonraki Randevu" dolu
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { MIG_GENERAL_APPT, MIG_NOTES_RPC, MIG_NOTES_RPC_V2, readMig, startDyEnv } from "../dy-presale-closeout/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "dy-canli-denetim-flows");
const PORT = 3984;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
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

type Who = { id: string; token: string; tenant: string; label: string };
async function newContext(browser: Browser, who: Who, v: { width: number; height: number; mobile: boolean }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: who.id, tenant_id: who.tenant, full_name: `ZZ_FLOW_${who.label}`, email: `zz.flow.${who.label.toLowerCase()}@example.test`, role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true, beslenme: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", t as string);
  }, [JSON.stringify(user), who.token]);
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}
const tab = (page: Page, id: string) => page.locator(`#tab-${id}`);
const panel = (page: Page, id: string) => page.locator(`#tabpanel-${id}`);
const toastHas = (page: Page, text: string) => waitFor(async () => (await page.getByText(text, { exact: false }).count()) > 0, 8000);
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function docxText(file: string): Promise<{ text: string; tables: number; images: number }> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const text = xml.replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
  return { text, tables: (xml.match(/<w:tbl>/g) ?? []).length, images: Object.keys(zip.files).filter((f) => f.startsWith("word/media/")).length };
}

async function main() {
  const { env, seed } = await startDyEnv({ port: 54487, dirName: "dy-canli-denetim-flows-pgdata", httpPort: 54521 });
  const q = (sql: string, args: unknown[] = []) => env.su.query(sql, args);
  // Gerçek şemaya yaklaştır (dy-web-mobil-duzeltmeler/ui.harness.ts ile aynı ek DDL) + ücret tablosu + not/randevu migration'ları.
  await q(`create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
             client_id uuid not null references public.clients(id) on delete cascade, analysis_type text, analysis_data jsonb, note text,
             image_url text, created_at timestamptz default now(), updated_at timestamptz default now());
           create table if not exists public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid,
             client_id uuid references public.clients(id) on delete cascade, file_path text, created_at timestamptz default now());
           create table if not exists public.client_charges (id uuid primary key default gen_random_uuid(), tenant_id uuid not null,
             client_id uuid not null references public.clients(id) on delete cascade, charge_date date not null default current_date,
             category text not null, detail text, note text, amount numeric not null, source_session_id uuid, payment_status text,
             created_at timestamptz not null default now(), updated_at timestamptz not null default now());
           grant select, insert, update, delete on public.client_analyses, public.client_stone_photos, public.client_charges to service_role;
           alter table public.client_sessions add column if not exists duration_minutes int, add column if not exists fee numeric,
             add column if not exists actions_done text, add column if not exists suggestions text, add column if not exists next_plan text,
             add column if not exists updated_at timestamptz default now();
           alter table public.client_stones add column if not exists stone_date text, add column if not exists stone_type text,
             add column if not exists usage_area text, add column if not exists combination_text text, add column if not exists warning_text text,
             add column if not exists other_notes text, add column if not exists note text, add column if not exists updated_at timestamptz default now();
           alter table public.client_combinations add column if not exists description text, add column if not exists note text,
             add column if not exists stones_text text, add column if not exists notes_text text, add column if not exists notes_text_2 text,
             add column if not exists updated_at timestamptz default now();
           alter table public.client_homeworks add column if not exists homework_type text, add column if not exists description text,
             add column if not exists start_date text, add column if not exists expert_note text, add column if not exists client_feedback text,
             add column if not exists updated_at timestamptz default now();`);
  await q(readMig("20271120000000_dy_subrecord_row_version.sql"));
  await q(readMig(MIG_GENERAL_APPT));
  await q(readMig(MIG_NOTES_RPC));
  await q(readMig(MIG_NOTES_RPC_V2)).catch((e) => console.log(`  · not RPC v2 uygulanamadı (v1 ile devam): ${String(e).slice(0, 120)}`));
  await q(`update public.users set module_permissions = '{"clients":true,"appointments":true,"beslenme":true}'::jsonb where id = any($1)`, [[seed.users.A.id, seed.users.B.id]]);
  const A: Who = { ...seed.users.A, tenant: seed.TA, label: "A" };
  const B: Who = { ...seed.users.B, tenant: seed.TB, label: "B" };

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  let CID = "";
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", NODE_ENV: "production" }, stdio: ["ignore", "ignore", "pipe"],
    });
    app.stderr?.on("data", (b: Buffer) => { const t = b.toString(); if (/Error/.test(t)) process.stderr.write(`[app] ${t.slice(0, 300)}\n`); });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();
    console.log(`Chromium ${browser.version()}`);
    const ctx = await newContext(browser, A, { width: 1366, height: 900, mobile: false });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(APP, "")}`); });

    // ── 1. Yeni danışan ────────────────────────────────────────────────────────
    section("1 · Yeni danışan");
    await page.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
    const saveClient = page.getByRole("button", { name: "Danışanı Kaydet" });
    await saveClient.waitFor({ timeout: 30000 });
    await saveClient.click();
    ok(await toastHas(page, "Ad ve soyad gerekli"), "boş form → 'Ad ve soyad gerekli' uyarısı (kayıt yok)");
    ok(Number((await q(`select count(*) n from public.clients where ad like 'ZZ Akış%'`)).rows[0].n) === 0, "boş formda DB'ye satır yazılmadı");
    await page.getByPlaceholder("Ad", { exact: true }).fill("ZZ Akış");
    await page.getByPlaceholder("Soyad", { exact: true }).fill("İNCEİŞ");
    await page.getByPlaceholder("05xx xxx xx xx").first().fill("05321112233");
    const post = page.waitForResponse((r) => r.url().endsWith("/api/clients") && r.request().method() === "POST", { timeout: 20000 });
    await saveClient.click();
    const pr = await post.catch(() => null);
    ok(!!pr && pr.status() < 300 && await toastHas(page, "Danışan kaydedildi"), "Danışanı Kaydet → POST başarılı + 'Danışan kaydedildi.'", pr?.status());
    const row = (await q(`select id, ad, soyad, telefon, tenant_id from public.clients where ad='ZZ Akış'`)).rows;
    ok(row.length === 1 && row[0].soyad === "İNCEİŞ" && row[0].telefon === "05321112233" && row[0].tenant_id === A.tenant, "DB: tek satır, doğru tenant, ad/soyad/telefon aynen", row);
    CID = row[0]?.id ?? "";
    await page.screenshot({ path: path.join(OUT, "01-yeni-danisan-kaydedildi-1366.png") });
    await page.goto(`${APP}/danisan-yolculugu/liste`, { waitUntil: "domcontentloaded" });
    ok(await waitFor(async () => (await page.getByText("ZZ Akış").count()) > 0, 30000), "Danışan Listesi'nde yeni danışan görünüyor");

    // ── 2. Genel bilgiler düzenle → yenile → doğrula ───────────────────────────
    section("2 · Genel bilgiler düzenle");
    await page.goto(`${APP}/dashboard/clients/${CID}`, { waitUntil: "domcontentloaded" });
    const gp = panel(page, "genel");
    const editBtn = gp.getByRole("button", { name: /Bilgileri Güncelle/ });
    await editBtn.waitFor({ timeout: 30000 });
    ok(await waitFor(async () => await editBtn.isEnabled(), 15000), "Bilgileri Güncelle etkin (notlar yüklendi)");
    await editBtn.click();
    await gp.getByPlaceholder("Danışanın sağlık notları...").fill("ZZ migren ve uyku düzensizliği takibi");
    await gp.getByPlaceholder("Danışana verilen genel öneriler...").fill("ZZ akşam yürüyüşü önerildi");
    await gp.getByRole("button", { name: "Değişiklikleri Kaydet" }).click();
    ok(await toastHas(page, "Değişiklikler kaydedildi"), "Değişiklikleri Kaydet → 'Değişiklikler kaydedildi.'");
    await page.reload({ waitUntil: "domcontentloaded" });
    const healthField = panel(page, "genel").getByPlaceholder("Danışanın sağlık notları...");
    ok(await waitFor(async () => (await healthField.inputValue().catch(() => "")) === "ZZ migren ve uyku düzensizliği takibi", 20000), "yenile → sağlık notu formda KORUNDU");
    const cn = (await q(`select saglik_notu, oneriler from public.client_notes where client_id=$1`, [CID])).rows;
    ok(cn.length === 1 && cn[0].saglik_notu === "ZZ migren ve uyku düzensizliği takibi" && cn[0].oneriler === "ZZ akşam yürüyüşü önerildi", "DB: sağlık notu + öneri aynen (metin dönüştürülmedi)", cn);

    // ── 3. Seans / Ödev / Taş (M3) ─────────────────────────────────────────────
    section("3 · Seans / Ödev / Taş");
    await tab(page, "seanslar").click();
    const sp = panel(page, "seanslar");
    await sp.getByRole("button", { name: "+ Yeni Seans Ekle" }).click();
    await sp.getByRole("button", { name: /Seansı Kaydet/ }).click();
    ok(await toastHas(page, "Lütfen en az bir alan doldurun"), "M3: boş seans → 'Lütfen en az bir alan doldurun.'");
    await sp.getByPlaceholder("Refleksoloji, online, bioenerji...").fill("ZZ Akış Seansı");
    await sp.getByPlaceholder("Seans genel notu...").fill("ZZ seans notu: nefes çalışması yapıldı");
    await sp.getByRole("button", { name: /Seansı Kaydet/ }).click();
    ok(await toastHas(page, "Seans kaydı eklendi"), "seans kaydedildi");

    await tab(page, "odevler").click();
    const hp = panel(page, "odevler");
    await hp.getByRole("button", { name: "+ Yeni Ödev Ekle" }).click();
    await hp.getByPlaceholder("Danışanın yapacağı çalışma...").fill("ZZ başlıksız ödev açıklaması");
    await hp.getByRole("button", { name: /Ödevi Kaydet/ }).click();
    ok(await toastHas(page, "Ödev başlığı zorunludur"), "M3: başlıksız ödev → 'Ödev başlığı zorunludur.'");
    ok(Number((await q(`select count(*) n from public.client_homeworks where client_id=$1`, [CID])).rows[0].n) === 0, "M3: başlıksız ödev DB'ye yazılmadı");
    await hp.getByPlaceholder("21 gün nefes çalışması...").fill("ZZ Akış Ödevi");
    await hp.getByRole("button", { name: /Ödevi Kaydet/ }).click();
    ok(await waitFor(async () => Number((await q(`select count(*) n from public.client_homeworks where client_id=$1 and title='ZZ Akış Ödevi'`, [CID])).rows[0].n) === 1, 10000), "başlıklı ödev kaydedildi (DB)");

    await tab(page, "taslar").click();
    const tp = panel(page, "taslar");
    await tp.getByRole("button", { name: "+ Yeni Taş Ekle" }).click();
    await tp.getByPlaceholder("Kolye, bileklik, cep taşı...").fill("Kolye");
    await tp.getByRole("button", { name: /Taşı Kaydet/ }).click();
    ok(await toastHas(page, "Taş adı zorunludur"), "M3: adsız taş → 'Taş adı zorunludur.'");
    ok(Number((await q(`select count(*) n from public.client_stones where client_id=$1`, [CID])).rows[0].n) === 0, "M3: adsız taş DB'ye yazılmadı");
    await tp.getByPlaceholder("Örn: Ametist, Şungit, Pirit").fill("ZZ Akuamarin");
    await tp.getByPlaceholder("Nasıl kullanılacak? Süre, bölge, yöntem...").fill("ZZ sol cepte taşınacak");
    await tp.getByRole("button", { name: /Taşı Kaydet/ }).click();
    ok(await toastHas(page, "Taş kaydı eklendi"), "taş kaydedildi");

    // ── 4. Not ────────────────────────────────────────────────────────────────
    section("4 · Not");
    await tab(page, "notlar").click();
    const np = panel(page, "notlar");
    await np.getByRole("button", { name: "+ Yeni Not Ekle" }).click();
    await np.getByRole("button", { name: /Notu Kaydet/ }).click();
    ok(await toastHas(page, "Lütfen bir not metni girin"), "boş not → 'Lütfen bir not metni girin.'");
    await np.getByPlaceholder("Danışan hakkında özel notlar, seans gözlemleri, takip bilgileri...").fill("ZZ akış notu: bir sonraki görüşmede uyku günlüğü istenecek");
    await np.getByRole("button", { name: /Notu Kaydet/ }).click();
    ok(await toastHas(page, "Not eklendi"), "not kaydedildi");

    // ── 5. Randevu (M2) → Ajanda ───────────────────────────────────────────────
    section("5 · Randevu → Ajanda");
    await tab(page, "randevular").click();
    const rp = panel(page, "randevular");
    await rp.getByRole("button", { name: "+ Yeni Randevu Ekle" }).click();
    await rp.getByPlaceholder("Örn: Biyoenerji Seansı").fill("ZZ Akış Randevusu");
    await rp.getByRole("button", { name: "Randevu Oluştur" }).click();
    ok(await toastHas(page, "seçmelisiniz"), "M2: tarihsiz randevu → tarih uyarısı (kayıt yok)");
    ok(Number((await q(`select count(*) n from public.appointments where client_id=$1`, [CID])).rows[0].n) === 0, "M2: tarihsiz randevu DB'ye yazılmadı");
    const when = new Date(Date.now() + 3 * 86400_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}T14:30`;
    await rp.locator('input[type="datetime-local"]').first().fill(local);
    await rp.getByRole("button", { name: "Randevu Oluştur" }).click();
    ok(await waitFor(async () => Number((await q(`select count(*) n from public.appointments where client_id=$1 and title='ZZ Akış Randevusu'`, [CID])).rows[0].n) === 1, 10000), "randevu kaydedildi (DB, doğru danışan)");
    await page.goto(`${APP}/dashboard/ajanda`, { waitUntil: "domcontentloaded" });
    ok(await waitFor(async () => (await page.getByText("ZZ Akış Randevusu").count()) > 0 || (await page.getByText("ZZ Akış").count()) > 0, 30000), "Ajanda'da randevu görünüyor");
    await page.screenshot({ path: path.join(OUT, "05-ajanda-1366.png") });

    // ── Yenile → Tekrar Aç → Doğrula (tüm sekmeler) ────────────────────────────
    section("Yenile → Tekrar Aç → Doğrula");
    await page.goto(`${APP}/dashboard/clients/${CID}`, { waitUntil: "domcontentloaded" });
    await panel(page, "genel").getByRole("button", { name: /Bilgileri Güncelle/ }).waitFor({ timeout: 30000 });
    const checks: Array<[string, string]> = [["seanslar", "ZZ Akış Seansı"], ["odevler", "ZZ Akış Ödevi"], ["taslar", "ZZ Akuamarin"], ["notlar", "ZZ akış notu"], ["randevular", "ZZ Akış Randevusu"]];
    for (const [id, text] of checks) {
      await tab(page, id).click();
      ok(await waitFor(async () => (await panel(page, id).getByText(text).count()) > 0, 20000), `yeniden açılışta ${id}: '${text}' görünüyor`);
    }

    // ── 6. M5: Yolculuk kenar çubuğu ───────────────────────────────────────────
    section("6 · M5 Yolculuk");
    await tab(page, "yolculuk").click();
    const yp = panel(page, "yolculuk");
    const nextAppt = await waitFor(async () => {
      const v = await yp.evaluate((el) => {
        const lbl = [...el.querySelectorAll("span")].find((s) => s.textContent?.trim() === "Sonraki Randevu");
        return lbl?.nextElementSibling?.textContent?.trim() ?? null;
      });
      return !!v && v !== "—";
    }, 20000);
    ok(nextAppt, "M5: kenar çubuğu 'Sonraki Randevu' dolu (—' değil)");
    await page.screenshot({ path: path.join(OUT, "06-yolculuk-1366.png") });

    // ── 7/8. Word ─────────────────────────────────────────────────────────────
    section("7 · Word (DOCX içeriği)");
    const grab = async (click: () => Promise<void>, name: string) => {
      const dl = page.waitForEvent("download", { timeout: 45000 });
      await click();
      const d = await dl;
      const file = path.join(OUT, `${name}-${d.suggestedFilename()}`);
      await d.saveAs(file);
      return { file, suggested: d.suggestedFilename() };
    };
    await tab(page, "seanslar").click();
    const w1 = await grab(() => panel(page, "seanslar").getByRole("button", { name: /Word/ }).first().click(), "sekme-seanslar");
    const d1 = await docxText(w1.file);
    ok(d1.text.includes("ZZ Akış Seansı") && d1.text.includes("ZZ seans notu: nefes çalışması yapıldı"), "Seanslar Word: seans türü + notu DOCX içinde", d1.text.slice(0, 200));
    ok(!d1.text.includes("ZZ Akuamarin"), "Seanslar Word: başka sekmenin kaydı yok");
    ok(!/̇/.test(w1.suggested) && /\.docx$/.test(w1.suggested), `C3: dosya adı Türkçe doğru küçültülmüş (birleşik nokta yok): ${w1.suggested}`);

    await page.getByRole("button", { name: "Tam Word raporu oluştur" }).click();
    const dlg = page.getByRole("dialog").filter({ hasText: "Word Raporu Hazırla" });
    await dlg.waitFor({ timeout: 15000 });
    await dlg.getByText("Tam Rapor", { exact: true }).click().catch(() => undefined);
    await waitFor(async () => (await dlg.getByText("Bölümler yükleniyor…").count()) === 0, 15000);
    const w2 = await grab(() => dlg.getByRole("button", { name: "Word Oluştur" }).click(), "tam-rapor");
    const d2 = await docxText(w2.file);
    const fullHas = ["ZZ Akış", "ZZ Akış Seansı", "ZZ Akış Ödevi", "ZZ Akuamarin", "ZZ sol cepte taşınacak", "ZZ Akış Randevusu", "ZZ akış notu"];
    ok(fullHas.every((x) => d2.text.includes(x)), "Tam Rapor: danışan + seans + ödev + taş + randevu + not DOCX içinde", fullHas.filter((x) => !d2.text.includes(x)));
    ok(d2.tables >= 1, `Tam Rapor: tablo yapısı var (${d2.tables} tablo)`);
    ok(!d2.text.includes("ZZ Ayşe") && !d2.text.includes("ZZ Bora"), "Tam Rapor: başka danışanın verisi yok");
    await page.screenshot({ path: path.join(OUT, "07-word-dialog-1366.png") });

    // Özel rapor: yalnız Seanslar bölümü
    await page.getByRole("button", { name: "Tam Word raporu oluştur" }).click();
    await dlg.waitFor({ timeout: 15000 });
    await dlg.getByText("Özel Rapor", { exact: true }).click();
    await waitFor(async () => (await dlg.getByText("Bölümler yükleniyor…").count()) === 0, 15000);
    const boxes = dlg.locator('input[type="checkbox"]');
    const nBox = await boxes.count();
    for (let i = 0; i < nBox; i++) {
      const b = boxes.nth(i);
      const lbl = (await b.evaluate((el) => (el.closest("label")?.textContent ?? "").trim())).replace(/\s+/g, " ");
      const want = /^Seanslar/.test(lbl);
      if (await b.isEnabled() && (await b.isChecked()) !== want) await b.click();
    }
    const w3 = await grab(() => dlg.getByRole("button", { name: "Word Oluştur" }).click(), "ozel-rapor");
    const d3 = await docxText(w3.file);
    ok(d3.text.includes("ZZ Akış Seansı") && !d3.text.includes("ZZ Akuamarin") && !d3.text.includes("ZZ Akış Ödevi"), "Özel Rapor (yalnız Seanslar): seçilen bölüm var, seçilmeyenler yok", d3.text.slice(0, 200));

    // Tarih aralığı: bugün ± 1 gün (bugün eklenen kayıtlar)
    const today = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    await page.getByRole("button", { name: /Tarih Aralığı Raporu/ }).click().catch(() => undefined);
    const dr = page.locator('input[type="date"]');
    await dr.first().waitFor({ timeout: 10000 });
    await dr.nth(0).fill(iso(new Date(today.getTime() - 86400_000)));
    await dr.nth(1).fill(iso(new Date(today.getTime() + 86400_000)));
    const w4 = await grab(() => page.getByRole("button", { name: "Word Oluştur" }).first().click(), "tarih-araligi");
    const d4 = await docxText(w4.file);
    ok(d4.text.includes("ZZ Akış Seansı") && d4.text.includes("ZZ Akış Ödevi"), "Tarih aralığı Word: aralıktaki kayıtlar DOCX içinde", d4.text.slice(0, 200));
    writeFileSync(path.join(OUT, "docx-ozet.json"), JSON.stringify({ w1: w1.suggested, w2: w2.suggested, w3: w3.suggested, w4: w4.suggested, tablesFull: d2.tables, imagesFull: d2.images }, null, 2));

    // ── 10. C7 ────────────────────────────────────────────────────────────────
    section("10 · C7 geçersiz kimlik");
    await page.goto(`${APP}/dashboard/clients/abc`, { waitUntil: "domcontentloaded" });
    ok(await waitFor(async () => (await page.getByText("Danışan bulunamadı").count()) > 0, 20000), "C7: /dashboard/clients/abc → 'Danışan bulunamadı'");
    await ctx.close();

    // ── 9. İzolasyon: ikinci uzman (başka tenant) ──────────────────────────────
    section("9 · İzolasyon (ikinci uzman hesabı, başka tenant)");
    {
      const cb = await newContext(browser, B, { width: 1366, height: 900, mobile: false });
      const pb = await cb.newPage();
      await pb.goto(`${APP}/dashboard/clients/${CID}`, { waitUntil: "domcontentloaded" });
      ok(await waitFor(async () => (await pb.getByText("Danışan bulunamadı").count()) > 0, 20000), "B: A'nın danışanı açılamıyor ('Danışan bulunamadı')");
      ok((await pb.getByText("ZZ migren").count()) === 0 && (await pb.getByText("05321112233").count()) === 0, "B: A'nın sağlık notu / telefonu sayfada yok");
      const api = await pb.evaluate(async ([cid, tok, uid]) => {
        const h = { "x-session-token": tok as string, "x-user-id": uid as string };
        const out: Record<string, number> = {};
        for (const p of ["", "/sessions", "/homeworks", "/stones", "/notes", "/appointments"]) out[p || "/"] = (await fetch(`/api/clients/${cid}${p}`, { headers: h })).status;
        const wr = await fetch(`/api/clients/${cid}/word-report`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ exportMode: "full" }) });
        out["word-report"] = wr.status;
        return out;
      }, [CID, B.token, B.id]);
      ok(Object.values(api).every((s) => s === 403 || s === 404), "B: A'nın danışanı için tüm API uçları 403/404", api);
      await pb.goto(`${APP}/danisan-yolculugu/liste`, { waitUntil: "domcontentloaded" });
      await pb.waitForTimeout(4000);
      ok((await pb.getByText("ZZ Akış").count()) === 0, "B: listede A'nın danışanı yok");
      await cb.close();
    }

    // ── 11. Mobil + masaüstü ──────────────────────────────────────────────────
    section("11 · Mobil 320/375/390 + masaüstü 1440");
    for (const v of [{ w: 320, h: 640, m: true }, { w: 375, h: 667, m: true }, { w: 390, h: 844, m: true }, { w: 1440, h: 900, m: false }]) {
      const c = await newContext(browser, A, { width: v.w, height: v.h, mobile: v.m });
      const p = await c.newPage();
      p.on("pageerror", (e) => pageErrors.push(`${v.w}: ${String(e)}`));
      await p.goto(`${APP}/dashboard/clients/${CID}`, { waitUntil: "domcontentloaded" });
      await p.getByText("05321112233").first().waitFor({ timeout: 30000 });
      const bad: string[] = [];
      for (const id of ["genel", "seanslar", "odevler", "taslar", "notlar", "randevular", "yolculuk"]) {
        await tab(p, id).click();
        await p.waitForTimeout(700);
        if (!(await noHScroll(p))) bad.push(id);
      }
      ok(bad.length === 0, `${v.w}px: 7 sekmede yatay taşma yok`, bad);
      await p.screenshot({ path: path.join(OUT, `11-yolculuk-${v.w}.png`) });
      await p.goto(`${APP}/danisan-yolculugu/kayit`, { waitUntil: "domcontentloaded" });
      await p.getByRole("button", { name: "Danışanı Kaydet" }).waitFor({ timeout: 30000 });
      ok(await noHScroll(p), `${v.w}px: yeni danışan formu yatay taşma yok`);
      await p.screenshot({ path: path.join(OUT, `11-kayit-${v.w}.png`) });
      await c.close();
    }

    ok(pageErrors.length === 0, "tarayıcıda yakalanmamış sayfa hatası yok", pageErrors);
    ok(apiErrors.length === 0, "API 5xx yanıtı yok", apiErrors);
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
  console.log(`Kanıt klasörü: ${OUT}`);
  console.log(`\nDY CANLI DENETİM AKIŞLARI: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
