/**
 * ANAMNEZ V1 — ARAYÜZ SMOKE (gerçek tarayıcı; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: uygulama NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 ile build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy-anon \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy-service npx next build
 * Sonra: npx tsx scripts/anamnez/ui-smoke.ts [--out <ekran-görüntüsü-klasörü>]
 *
 * Akış: yerel test ortamı (embedded-postgres + shim + Storage emülatörü) :54321'de başlar, sentetik
 * veri tohumlanır, `next start` :3977'de açılır, Playwright (chromium) masaüstü / tablet / mobil
 * görünümlerde anamnez akışlarını sürer ve ekran görüntüsü alır.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, seedAnamnez, startAnamnezTestEnv, type Seed } from "./testEnv";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "anamnez-ui-smoke");
const APP = "http://127.0.0.1:3977";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${String(extra).slice(0, 300)}` : ""}`); }
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

async function newContext(browser: Browser, seed: Seed, viewport: { width: number; height: number }, mobile = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", acceptDownloads: true });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_ANAMNEZ_A", email: "zz.anamnez.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true },
    is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

async function noHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function main() {
  const env = await startAnamnezTestEnv({ port: 54392, dirName: "anamnez-ui-pgdata", httpPort: 54321 });
  const seed = await seedAnamnez(env.su);
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", "3977", "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();
    const a1 = seed.clients.a1;

    // ── MASAÜSTÜ ──────────────────────────────────────────────────────────
    console.log("\n[Masaüstü 1366×900]");
    const ctx = await newContext(browser, seed, { width: 1366, height: 900 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("response", async (r) => {
      if (r.url().includes("/api/clients/") && r.url().includes("/anamnez") && r.status() >= 400) {
        console.log(`    [api ${r.status()}] ${r.request().method()} ${r.url().replace(APP, "")} ${(await r.text().catch(() => "")).slice(0, 300)}`);
      }
    });
    await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
    await page.getByRole("heading", { name: "Anamnez", exact: true }).waitFor({ timeout: 60_000 });
    ok(await page.getByRole("tab", { name: "Anamnez" }).getAttribute("aria-selected") === "true", "Danışan Detayı'nda 'Anamnez' sekmesi (?tab=anamnez)");
    ok(await page.getByText("Bu danışan için henüz anamnez yok.").isVisible(), "boş durum");
    ok(await page.getByText(/açık rıza kaydı bulunmuyor/).isVisible(), "açık rıza uyarısı (engellemez)");
    await shot(page, "01-desktop-tab-empty");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Boş Formu İndir (PDF)" }).click()]);
    const dlPath = path.join(OUT, dl.suggestedFilename());
    await dl.saveAs(dlPath);
    ok(/anamnez-formu.*\.pdf$/.test(dl.suggestedFilename()), `boş form PDF indirildi (${dl.suggestedFilename()})`);

    await page.getByRole("button", { name: "Yeni Anamnez Oluştur" }).click();
    await page.getByRole("dialog").waitFor();
    await shot(page, "02-desktop-new-dialog");
    await page.getByRole("button", { name: "Anamnezi Oluştur" }).click();
    await page.waitForURL(/\/anamnez\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    await page.getByText("İlk Anamnez").first().waitFor();
    ok(await page.getByText("Taslak", { exact: true }).first().isVisible(), "taslak editörü açıldı");
    ok((await page.locator("section h3 button").count()) === 17, "17 bölüm akordeonu");
    await shot(page, "03-desktop-editor-top");

    // Bölüm A: cevap + alan kaldırma + soru ekleme.
    await page.getByRole("radio", { name: "1–6 ay" }).click();
    await page.getByLabel("Başvuru nedeni").fill("Uyku düzensizliği ve iş stresi");
    const durationRow = page.locator("div.border-b", { has: page.locator("label", { hasText: "Ne zamandır devam ediyor?" }) });
    await durationRow.getByLabel("Soru seçenekleri").click();
    await durationRow.getByRole("button", { name: "Bu danışandan kaldır" }).click();
    await page.getByRole("alertdialog").getByText(/cevap SİLİNMEZ/).waitFor();
    await shot(page, "04-desktop-remove-field-confirm");
    await page.getByRole("alertdialog").getByRole("button", { name: "Bu danışandan kaldır" }).click();
    ok(await page.getByText("Bu danışandan kaldırılan alanlar (1)").isVisible(), "kaldırılan alanlar paneli (1) — cevap korunuyor");
    await page.getByRole("button", { name: "+ Bu danışana soru ekle" }).first().click();
    await page.getByRole("dialog").getByLabel("Soru").fill("Özel: sabah uyanış hissi");
    await page.getByRole("dialog").getByRole("button", { name: "Soruyu Ekle" }).click();
    ok(await page.getByText("Özel: sabah uyanış hissi").isVisible(), "danışana özel soru eklendi");

    // Bölüm G: Mevcut Bilgileri Getir.
    await page.getByRole("button", { name: /Beslenme ve Sıvı/ }).click();
    await page.getByText("Danışan detayında bu bölüm için mevcut bilgiler var.").first().waitFor();
    await shot(page, "05-desktop-import-banner");
    await page.getByRole("button", { name: "Mevcut Bilgileri Getir" }).first().click();
    ok(await page.getByLabel("Günlük öğün sayısı").inputValue() === "3", "G bölümü içe aktarıldı (öğün sayısı 3)");
    ok((await page.getByLabel("Su tüketimi").inputValue()) === "Günde 2 litre", "su tüketimi aktarıldı");

    // Bölüm I: çakışma.
    await page.getByRole("button", { name: /Hareket ve Fiziksel Aktivite/ }).click();
    await page.getByRole("radio", { name: "Aktif", exact: true }).click();
    await page.getByRole("button", { name: "Mevcut Bilgileri Getir" }).first().click();
    await page.getByRole("dialog").getByText("Farklı bilgiler bulundu").waitFor();
    ok(await page.getByRole("dialog").getByText("Anamnezde", { exact: true }).isVisible() && await page.getByRole("dialog").getByText("Danışan detayında", { exact: true }).isVisible(), "çakışma modalı iki değeri gösteriyor");
    await shot(page, "06-desktop-conflict-modal");
    await page.getByRole("dialog").getByRole("radio", { name: "Danışan Bilgisini Kullan" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Seçimleri Uygula" }).click();
    ok(await page.getByRole("radio", { name: "Orta aktif" }).getAttribute("aria-checked") === "true", "Danışan Bilgisini Kullan → Orta aktif");

    // Uzun içerik.
    await page.getByRole("button", { name: /Uzman Değerlendirmesi/ }).click();
    await page.getByLabel("Gözlemler").fill("Uzun gözlem metni ".repeat(120));
    ok(await noHorizontalScroll(page), "uzun içerik: yatay kaydırma yok");

    // Kaydet.
    ok(await page.getByText("● Kaydedilmemiş değişiklikler var").isVisible(), "kaydedilmemiş değişiklik göstergesi");
    await page.getByRole("button", { name: "Kaydet", exact: true }).click();
    await page.getByText("✓ Tüm değişiklikler kaydedildi").waitFor();
    ok(true, "Kaydet (yeşil CTA) → kaydedildi");
    await page.reload();
    await page.getByText("İlk Anamnez").first().waitFor();
    ok(await page.getByLabel("Başvuru nedeni").inputValue() === "Uyku düzensizliği ve iş stresi", "tekrar aç → cevap korunuyor");

    // PDF ekle / görüntüle / indir.
    const pdfPath = path.join(OUT, "form.pdf");
    writeFileSync(pdfPath, Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1"));
    await page.locator('input[type="file"]').setInputFiles(pdfPath);
    await page.getByText("📄 form.pdf").waitFor({ timeout: 30_000 });
    ok(true, "PDF yüklendi (imzalı yükleme + sunucu doğrulaması)");
    const fakePath = path.join(OUT, "fake.pdf");
    writeFileSync(fakePath, "MZ this is not a pdf");
    await page.locator('input[type="file"]').setInputFiles(fakePath);
    await page.getByText("Dosya geçerli bir PDF değil; yüklenmedi.").waitFor({ timeout: 30_000 });
    ok((await page.getByText("📄 fake.pdf").count()) === 0, "sahte PDF reddedildi (UI mesajı)");
    const signedReq = ctx.waitForEvent("request", { predicate: (r) => /\/storage\/v1\/object\/sign\//.test(r.url()), timeout: 30_000 });
    const [popup] = await Promise.all([ctx.waitForEvent("page"), page.getByRole("button", { name: "Görüntüle" }).first().click()]);
    const req = await signedReq.catch(() => null);
    ok(!!req && req.frame().page() === popup, "Görüntüle → yeni sekme kısa ömürlü signed URL'yi açtı");
    await popup.close();
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "İndir" }).first().click()]);
    ok(dl2.suggestedFilename().endsWith(".pdf"), "İndir → PDF indirildi");
    await shot(page, "07-desktop-attachments");

    // Tamamla.
    await page.getByRole("button", { name: "Tamamla ve Kilitle" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Tamamla ve Kilitle" }).click();
    await page.getByText("Bu anamnez tamamlandı ve kilitlidir.").waitFor({ timeout: 30_000 });
    ok((await page.getByRole("button", { name: "Kaydet", exact: true }).count()) === 0, "tamamlandı: kaydet çubuğu yok, form kilitli");
    ok(await page.getByLabel("Başvuru nedeni").isDisabled(), "tamamlandı: alanlar salt-okunur");
    await shot(page, "08-desktop-completed-locked");
    const completedUrl = page.url();

    // Kaynak değişikliği → uyarı + Değişiklikleri Gör.
    await env.su.query(`update public.nutrition_client_profiles set activity_level='light' where client_id=$1`, [a1]);
    await env.su.query(`update public.clients set telefon='05559990000' where id=$1`, [a1]);
    await page.reload();
    await page.getByText("Danışanın güncel bilgilerinde bu anamnezden farklı bilgiler bulunuyor.").first().waitFor();
    await page.getByRole("button", { name: "Değişiklikleri Gör" }).first().click();
    await page.getByRole("dialog").getByText("Günlük aktivite düzeyi").waitFor();
    ok((await page.getByRole("dialog").locator("li").count()) === 1, "değişiklik listesi yalnız eşlenmiş alan (telefon değişikliği yok)");
    await shot(page, "09-desktop-changes-dialog");
    await page.getByRole("dialog").getByRole("button", { name: "Güncel Bilgilerle Yeni Anamnez Başlat" }).click();
    await page.waitForURL((u) => u.toString() !== completedUrl && /\/anamnez\//.test(u.toString()), { timeout: 30_000 });
    await page.getByText("Anamnez Güncellemesi").first().waitFor();
    await page.getByRole("button", { name: /Hareket ve Fiziksel Aktivite/ }).click();
    ok(await page.getByRole("radio", { name: "Hafif aktif" }).getAttribute("aria-checked") === "true", "yeni anamnezde güncel değer (Hafif aktif)");
    ok(await page.getByLabel("Başvuru nedeni").inputValue() === "Uyku düzensizliği ve iş stresi", "önceki cevaplar yeni kayda kopyalandı");

    // Tarihçe.
    await page.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
    await page.getByText("Anamnez tarihçesi").waitFor();
    ok(await page.getByText("Açık taslak").isVisible() && (await page.getByText("🔒 Tamamlandı").count()) >= 1, "tarihçe: taslak ayrı + tamamlanan 🔒");
    await shot(page, "10-desktop-history");

    // Tamamlanmış anamnez silme (güçlü onay).
    await page.goto(completedUrl);
    await page.getByText("Bu anamnez tamamlandı ve kilitlidir.").waitFor();
    await page.getByRole("button", { name: "Anamnezi sil" }).click();
    const dlg = page.getByRole("alertdialog");
    await dlg.getByText(/Durum: Tamamlanmış \(kilitli\) kayıt/).waitFor();
    ok(await dlg.getByText(/Danışan: ZZ Ayşe YILMAZ/).isVisible() && await dlg.getByText(/Bağlı PDF belgesi: 1/).isVisible(), "silme onayı: danışan adı, tarih, durum, PDF sayısı");
    await dlg.getByRole("textbox").fill("evet");
    ok(await dlg.getByRole("button", { name: "Kalıcı Olarak Sil" }).isDisabled(), "yanlış yazılı onay → buton pasif");
    await shot(page, "11-desktop-delete-confirm");
    await dlg.getByRole("textbox").fill("SİL");
    await dlg.getByRole("button", { name: "Kalıcı Olarak Sil" }).click();
    await page.waitForURL(/tab=anamnez/, { timeout: 30_000 });
    ok((await env.su.query(`select count(*)::int n from public.client_anamneses where client_id=$1 and status='completed'`, [a1])).rows[0].n === 0, "tamamlanmış anamnez silindi");
    ok([...(env.storage.objects.get("client-anamnesis-files")?.keys() ?? [])].every((k) => !k.includes(completedUrl.split("/").pop()!)), "bağlı PDF Storage'dan silindi");

    // Hata durumu.
    await page.goto(`${APP}/dashboard/clients/${a1}/anamnez/00000000-0000-4000-8000-000000000000`);
    await page.getByText("Anamnez bulunamadı veya erişim yetkiniz yok.").waitFor();
    ok(true, "yok/erişimsiz anamnez → hata durumu");
    await shot(page, "12-desktop-error");
    await ctx.close();

    // ── TABLET / MOBİL ─────────────────────────────────────────────────────
    for (const [label, vp, mobile] of [["tablet", { width: 820, height: 1180 }, true], ["mobile", { width: 375, height: 812 }, true], ["mobile-320", { width: 320, height: 640 }, true]] as const) {
      console.log(`\n[${label} ${vp.width}×${vp.height}]`);
      const c = await newContext(browser, seed, vp, mobile);
      const p = await c.newPage();
      p.on("pageerror", (e) => pageErrors.push(e.message));
      await p.goto(`${APP}/dashboard/clients/${a1}?tab=anamnez`);
      await p.getByText("Anamnez tarihçesi").waitFor({ timeout: 60_000 });
      ok(await noHorizontalScroll(p), `${label}: sekme görünümünde yatay kaydırma yok`);
      await shot(p, `20-${label}-tab`);
      await p.getByRole("button", { name: "Taslağa devam et" }).first().click();
      await p.waitForURL(/\/anamnez\/[0-9a-f-]{36}$/);
      await p.getByText("Anamnez Güncellemesi").first().waitFor();
      ok(await noHorizontalScroll(p), `${label}: editörde yatay kaydırma yok`);
      const bar = p.getByRole("button", { name: "Kaydet", exact: true });
      const box = await bar.boundingBox();
      ok(!!box && box.y + box.height <= vp.height + 1 && box.height >= 40, `${label}: yapışkan Kaydet çubuğu görünür (≥40px)`);
      await shot(p, `21-${label}-editor`);
      await p.getByRole("button", { name: /Uyku ve Dinlenme/ }).click();
      ok(await noHorizontalScroll(p), `${label}: 0–10 ölçek + seçimler taşmıyor`);
      await shot(p, `22-${label}-section-open`);
      await p.getByRole("button", { name: /Görüşme ve Başvuru/ }).click().catch(() => undefined);
      await p.getByRole("button", { name: "+ Bu danışana soru ekle" }).first().click();
      await p.getByRole("dialog").waitFor();
      await shot(p, `23-${label}-dialog`);
      await p.getByRole("dialog").getByRole("button", { name: "Vazgeç" }).click();
      await c.close();
    }

    ok(pageErrors.length === 0, "tarayıcıda yakalanmamış JS hatası yok", pageErrors.join(" | "));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nanamnez UI smoke: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    console.error("FAIL:\n - " + fails.join("\n - "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
