/**
 * D2 (05.11.2026) — Bütüncül Numeroloji mükerrer kayıt uyarısı: GERÇEK TARAYICI akış testi
 * (Playwright; DB / sağlayıcı / prod'a SIFIR temas). Tüm /api/** istekleri tarayıcıda yakalanır ve
 * bellek içi sahte kayıt listesinden yanıtlanır; localhost dışı her istek iptal edilir.
 *
 *  - Uygulama: D2_UI_URL verilirse o adres; yoksa `next dev --webpack` 127.0.0.1:D2_UI_PORT (varsayılan 3993).
 *  - Senaryolar: ilk kayıt uyarısız · aynı bilgiler uyarı · büyük/küçük harf + boşluk · Türkçe harf ayrımı ·
 *    birden fazla eşleşme seçimi · Mevcut Kaydı Aç (yeni sekme, çalışma korunur) · Yine de Yeni Kaydet ·
 *    Vazgeç / Escape · liste ucu hatası (kayıt engellenmez) · çift tık (tek POST) · 320 / 390 px diyalog.
 *
 * Çalıştır: npx tsx scripts/numeroloji-presale/duplicate-record.ui.ts
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";

const PORT = Number(process.env.D2_UI_PORT ?? 3993);
const APP = process.env.D2_UI_URL ?? `http://127.0.0.1:${PORT}`;
const VERBOSE = process.env.D2_UI_VERBOSE === "1";
/** Yalnız hata teşhisi ekran görüntüsü (QA/kalıcı klasöre değil; işletim sistemi geçici klasörü). */
const SHOT_DIR = process.env.D2_UI_SHOTS ?? (process.env.TEMP ?? process.env.TMPDIR ?? ".");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail: unknown = ""): void {
  if (cond) pass++;
  else {
    fail++;
    fails.push(`${name}${detail !== "" ? `  → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)}` : ""}`);
  }
  if (!cond || VERBOSE) console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastPage: Page | null = null;

const USER = {
  id: "u-d2-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "tenant-d2-zz", is_demo_account: false, module_permissions: { numerology: true, numeroloji: true, clients: true },
  full_name: "ZZ D2 Uzmanı", name: "ZZ D2 Uzmanı",
};

type Row = { id: string; name: string; surname: string; birth_date: string; created_at: string };
type State = { rows: Row[]; posts: unknown[]; listFails: boolean; unknown: Set<string>; external: string[] };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function handleApi(route: Route, s: State) {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const m = req.method();
  if (p === "/api/auth/profile") return json(route, { profile: USER });
  if (p === "/api/auth/session") return json(route, m === "GET" ? { valid: true } : { ok: true });
  if (p === "/api/numeroloji/analyses") {
    if (m === "GET") {
      if (s.listFails) return json(route, { ok: false, error: "Kayıtlar eksiksiz okunamadı." }, 500);
      return json(route, { ok: true, rows: s.rows });
    }
    if (m === "POST") {
      const b = req.postDataJSON() as { name: string; surname: string; birth_date: string };
      s.posts.push(b);
      const id = `new-${s.posts.length}`;
      s.rows.unshift({ id, name: b.name, surname: b.surname, birth_date: b.birth_date, created_at: new Date().toISOString() });
      await sleep(150);
      return json(route, { ok: true, id });
    }
  }
  s.unknown.add(`${m} ${p}`);
  return json(route, { ok: true, rows: [], data: [], items: [], records: [] });
}

const EXISTING: Row[] = [
  { id: "a1", name: "Çağrı Gülşen", surname: "ŞÜKRÜOĞLU", birth_date: "01.01.1950", created_at: "2026-11-04T17:21:00.000Z" },
  { id: "h1", name: "Hasan", surname: "ARICI", birth_date: "14.02.1987", created_at: "2026-10-01T10:00:00.000Z" },
  { id: "h2", name: "Hasan", surname: "ARICI", birth_date: "14/02/1987", created_at: "2026-10-30T10:00:00.000Z" },
];

async function newPage(browser: Browser, viewport: { width: number; height: number }, rows: Row[], opts: Partial<State> = {}) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", u);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {
      /* yok */
    }
  }, JSON.stringify(USER));
  const s: State = { rows: rows.map((r) => ({ ...r })), posts: [], listFails: false, unknown: new Set(), external: [], ...opts };
  await ctx.route((u) => !u.href.startsWith(APP) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"), (r) => {
    s.external.push(r.request().url());
    return r.abort();
  });
  await ctx.route((u) => u.href.startsWith(APP) && new URL(u.href).pathname.startsWith("/api/"), (r) => handleApi(r, s));
  const page = await ctx.newPage();
  lastPage = page;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, s, errors };
}

async function compute(page: Page, first: string, last: string, birth: string) {
  await page.goto(`${APP}/numeroloji/analiz`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Örn. Hasan Ali").waitFor({ timeout: 60_000 });
  await page.getByPlaceholder("Örn. Hasan Ali").fill(first);
  await page.getByPlaceholder("Örn. YILMAZ").fill(last);
  const d = page.getByPlaceholder("GG.AA.YYYY");
  await d.click();
  await d.pressSequentially(birth.replace(/\D/g, ""), { delay: 15 });
  await page.getByRole("button", { name: /HESAPLA/ }).first().click();
  try {
    await activeBar(page).waitFor({ timeout: 30_000 });
  } catch (e) {
    await page.screenshot({ path: path.join(SHOT_DIR, `d2-hata-${Date.now()}.png`), fullPage: true }).catch(() => {});
    throw e;
  }
}
const activeBar = (page: Page) => page.getByText(/^Doğum: \d{2}\.\d{2}\.\d{4}$/).first();
const saveBtn = (page: Page) => page.getByRole("button", { name: /^(KAYDET|Kontrol ediliyor…|Kaydediliyor…|Kaydedildi ✓)$/ }).first();
const dialog = (page: Page) => page.getByTestId("num-duplicate-dialog");

async function run(browser: Browser) {
  const D = { width: 1280, height: 900 };

  // 1 — ilk kayıt: uyarısız, tek POST
  {
    const { ctx, page, s, errors } = await newPage(browser, D, []);
    await compute(page, "Çağrı Gülşen", "Şükrüoğlu", "01.01.1950");
    await saveBtn(page).click();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 });
    ok("1 ilk kayıt → uyarı yok, tek POST", (await dialog(page).count()) === 0 && s.posts.length === 1, s.posts.length);
    ok("1 sayfa hatası yok", errors.length === 0, errors);
    await ctx.close();
  }

  // 2 + 11 + 9 + 10 — aynı bilgiler: uyarı → Vazgeç → Mevcut Kaydı Aç → Yine de Yeni Kaydet
  {
    const { ctx, page, s, errors } = await newPage(browser, D, EXISTING);
    await compute(page, "Çağrı Gülşen", "Şükrüoğlu", "01.01.1950");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    const txt = await dialog(page).innerText();
    ok("2 aynı bilgiler → uyarı penceresi", /daha önce kaydedilmiş bir analiziniz bulunuyor/.test(txt) && s.posts.length === 0, txt.slice(0, 120));
    ok("2 üç seçenek görünür", (await page.getByTestId("num-duplicate-open").isVisible()) && (await page.getByTestId("num-duplicate-save").isVisible()) && (await page.getByTestId("num-duplicate-cancel").isVisible()));
    ok("2 diyalog açıkken KAYDET pasif", await saveBtn(page).isDisabled());
    await page.getByTestId("num-duplicate-cancel").click();
    await sleep(200);
    ok("11 Vazgeç → pencere kapanır, kayıt yok", (await dialog(page).count()) === 0 && s.posts.length === 0);
    ok("11 Vazgeç → analiz ve girilen bilgiler korunur", (await activeBar(page).isVisible()) && /Çağrı Gülşen/.test(await page.locator("main").innerText()));
    ok("11 Vazgeç sonrası KAYDET yeniden etkin", await saveBtn(page).isEnabled());
    // Escape
    await saveBtn(page).click();
    await dialog(page).waitFor();
    await page.keyboard.press("Escape");
    await sleep(200);
    ok("11b Escape → pencere kapanır, kayıt yok", (await dialog(page).count()) === 0 && s.posts.length === 0);
    // Mevcut Kaydı Aç → yeni sekme
    await saveBtn(page).click();
    await dialog(page).waitFor();
    const [popup] = await Promise.all([ctx.waitForEvent("page"), page.getByTestId("num-duplicate-open").click()]);
    await popup.waitForLoadState("domcontentloaded").catch(() => {});
    ok("9 Mevcut Kaydı Aç → eski kayıt YENİ sekmede (/numeroloji/liste/a1)", new URL(popup.url()).pathname === "/numeroloji/liste/a1", popup.url());
    ok("9 asıl sekmede analiz korunur, kayıt yok", page.url().endsWith("/numeroloji/analiz") && (await activeBar(page).isVisible()) && s.posts.length === 0);
    await popup.close();
    // Yine de Yeni Kaydet (çift tık → tek POST)
    await saveBtn(page).click();
    await dialog(page).waitFor();
    await page.getByTestId("num-duplicate-save").dblclick();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 });
    ok("10 Yine de Yeni Kaydet → ayrı kayıt (çift tık → tek POST)", s.posts.length === 1 && s.rows.length === EXISTING.length + 1, s.posts.length);
    ok("10 eski kayıt aynen kalır", s.rows.some((r) => r.id === "a1" && r.surname === "ŞÜKRÜOĞLU" && r.birth_date === "01.01.1950"));
    ok("10 pencere kapanır", (await dialog(page).count()) === 0);
    ok("2/9/10 sayfa hatası yok", errors.length === 0, errors);
    await ctx.close();
  }

  // 3 + 5 — büyük/küçük harf + fazla boşluk → eşleşir
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING);
    await compute(page, "  çağrı   gülşen ", "  şükrüoğlu ", "01.01.1950");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 }).catch(() => {});
    ok("3/5 küçük harf + fazla boşluk → uyarı", (await dialog(page).count()) === 1 && s.posts.length === 0);
    await ctx.close();
  }

  // 4 — Türkçe harf farkı → ayrı kişi (uyarısız kayıt)
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING);
    await compute(page, "Cagri Gulsen", "Sukruoglu", "01.01.1950");
    await saveBtn(page).click();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    ok("4 Ç/Ğ/Ş/Ü ≠ C/G/S/U → uyarısız kayıt", (await dialog(page).count()) === 0 && s.posts.length === 1, s.posts.length);
    await ctx.close();
  }

  // 6 — aynı isim farklı tarih → uyarısız
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING);
    await compute(page, "Çağrı Gülşen", "Şükrüoğlu", "02.01.1950");
    await saveBtn(page).click();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    ok("6 farklı doğum tarihi → uyarısız kayıt", (await dialog(page).count()) === 0 && s.posts.length === 1);
    await ctx.close();
  }

  // 8 — birden fazla eşleşme → kullanıcı seçer
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING);
    await compute(page, "Hasan", "Arıcı", "14.02.1987");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    const links = page.getByTestId("num-duplicate-open");
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute("href")));
    ok("8 iki eşleşme listelenir (en yeni önce), her birine ayrı Aç", JSON.stringify(hrefs) === JSON.stringify(["/numeroloji/liste/h2", "/numeroloji/liste/h1"]), hrefs);
    ok("8 kayıt yapılmadı", s.posts.length === 0);
    await ctx.close();
  }

  // ağ hatası — liste okunamazsa OTOMATİK KAYIT YOK → "Önceki kayıtlar kontrol edilemedi" (Tekrar Dene / Yine de Kaydet / Vazgeç)
  {
    const { ctx, page, s, errors } = await newPage(browser, D, EXISTING, { listFails: true });
    await compute(page, "Mehmet Ali", "Yıldız", "11.11.1988");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    const t = await dialog(page).innerText();
    ok("ağ: liste okunamaz → otomatik kayıt YOK, 'kontrol edilemedi' penceresi", /Önceki kayıtlar kontrol edilemedi/.test(t) && s.posts.length === 0 && (await dialog(page).getAttribute("data-mode")) === "checkFailed", t.slice(0, 80));
    ok("ağ: Tekrar Dene / Yine de Kaydet / Vazgeç görünür, Mevcut Kaydı Aç yok", (await page.getByTestId("num-duplicate-retry").isVisible()) && /Yine de Kaydet/.test(await page.getByTestId("num-duplicate-save").innerText()) && (await page.getByTestId("num-duplicate-cancel").isVisible()) && (await page.getByTestId("num-duplicate-open").count()) === 0);
    // Tekrar Dene — hâlâ başarısız → pencere kalır, kayıt yok
    await page.getByTestId("num-duplicate-retry").click();
    await sleep(600);
    ok("ağ: Tekrar Dene yine başarısız → pencere kalır, kayıt yok", (await dialog(page).getAttribute("data-mode")) === "checkFailed" && s.posts.length === 0);
    // Vazgeç → kayıt yok, analiz korunur
    await page.getByTestId("num-duplicate-cancel").click();
    await sleep(200);
    ok("ağ: Vazgeç → kayıt yok, analiz korunur", (await dialog(page).count()) === 0 && s.posts.length === 0 && (await activeBar(page).isVisible()));
    // Yine de Kaydet → tek kayıt
    await saveBtn(page).click();
    await dialog(page).waitFor();
    await page.getByTestId("num-duplicate-save").dblclick();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    ok("ağ: Yine de Kaydet → kontrolsüz tek kayıt (çift tık → tek POST)", s.posts.length === 1 && (await dialog(page).count()) === 0, s.posts.length);
    ok("ağ senaryosu sayfa hatası yok", errors.length === 0, errors);
    await ctx.close();
  }
  // ağ: Tekrar Dene başarılı + eşleşme yok → kayıt; eşleşme var → mükerrer kipine geçer
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING, { listFails: true });
    await compute(page, "Ümit", "Işıl", "15.06.2026");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    s.listFails = false;
    await page.getByTestId("num-duplicate-retry").click();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    ok("ağ: Tekrar Dene başarılı, eşleşme yok → kayıt (tek POST), pencere kapanır", s.posts.length === 1 && (await dialog(page).count()) === 0, s.posts.length);
    await ctx.close();
  }
  {
    const { ctx, page, s } = await newPage(browser, D, EXISTING, { listFails: true });
    await compute(page, "Çağrı Gülşen", "Şükrüoğlu", "01.01.1950");
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    s.listFails = false;
    await page.getByTestId("num-duplicate-retry").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="num-duplicate-dialog"]')?.getAttribute("data-mode") === "duplicate", undefined, { timeout: 15_000 }).catch(() => {});
    ok("ağ: Tekrar Dene başarılı, eşleşme var → mükerrer uyarısına geçer, kayıt yok", (await dialog(page).getAttribute("data-mode")) === "duplicate" && (await page.getByTestId("num-duplicate-open").isVisible()) && s.posts.length === 0);
    await ctx.close();
  }

  // çift tık — mükerrer yokken tek POST
  {
    const { ctx, page, s } = await newPage(browser, D, []);
    await compute(page, "Zeynep", "Çelik-Uğur", "22.07.1977");
    await saveBtn(page).dblclick();
    await page.getByRole("button", { name: "Kaydedildi ✓" }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    await sleep(500);
    ok("çift tık KAYDET → tek POST", s.posts.length === 1, s.posts.length);
    await ctx.close();
  }

  // 15 — mobil 320 / 390: diyalog kullanılabilir, yatay taşma yok
  for (const w of [320, 390]) {
    const { ctx, page, s } = await newPage(browser, { width: w, height: 740 }, EXISTING);
    await compute(page, "Hasan", "Arıcı", "14.02.1987");
    await saveBtn(page).scrollIntoViewIfNeeded();
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    const box = await page.getByRole("dialog").boundingBox();
    const btns = await Promise.all(["num-duplicate-save", "num-duplicate-cancel"].map((t) => page.getByTestId(t).boundingBox()));
    const openBtns = await page.getByTestId("num-duplicate-open").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(`15 ${w}px diyalog ekranda`, !!box && box.x >= 0 && box.x + box.width <= w + 1, box);
    ok(`15 ${w}px düğmeler ekranda ve ≥40px yüksek`, btns.every((b) => b && b.x >= 0 && b.x + b.width <= w + 1 && b.height >= 40) && openBtns.every((r) => r <= w + 1), { btns, openBtns });
    ok(`15 ${w}px yatay taşma yok`, sw <= w + 1, sw);
    await page.getByTestId("num-duplicate-cancel").click();
    ok(`15 ${w}px Vazgeç çalışır`, (await dialog(page).count()) === 0 && s.posts.length === 0);
    // kontrol edilemedi penceresi de ekrana sığar
    s.listFails = true;
    await saveBtn(page).click();
    await dialog(page).waitFor({ timeout: 15_000 });
    const fb = await Promise.all(["num-duplicate-retry", "num-duplicate-save", "num-duplicate-cancel"].map((t) => page.getByTestId(t).boundingBox()));
    ok(`15 ${w}px 'kontrol edilemedi' düğmeleri ekranda`, fb.every((b) => b && b.x >= 0 && b.x + b.width <= w + 1 && b.height >= 40) && (await page.evaluate(() => document.documentElement.scrollWidth)) <= w + 1, fb);
    await page.getByTestId("num-duplicate-cancel").click();
    ok(`15 ${w}px kayıt yapılmadı`, s.posts.length === 0);
    await ctx.close();
  }
}

async function waitHttp(url: string, ms: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await fetch(url).catch(() => null);
    if (r && r.status < 500) return;
    await sleep(2000);
  }
  throw new Error(`sunucu hazır değil: ${url}`);
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    if (!process.env.D2_UI_URL) {
      app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59998",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "zz-dummy-anon",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "zz-dummy-anon",
          SUPABASE_SERVICE_ROLE_KEY: "zz-dummy-service",
        },
        stdio: VERBOSE ? "inherit" : "ignore",
      });
      console.log(`next dev başlatıldı (pid ${app.pid}, port ${PORT})`);
    }
    await waitHttp(`${APP}/numeroloji/analiz`, 300_000);
    for (const r of ["/numeroloji/analiz", "/numeroloji/liste/a1"]) await fetch(`${APP}${r}`).catch(() => null);
    browser = await chromium.launch();
    await run(browser);
  } catch (e) {
    ok("akış istisnasız tamamlandı", false, String(e).slice(0, 1500));
    await lastPage?.screenshot({ path: path.join(SHOT_DIR, "d2-hata-son.png") }).catch(() => {});
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
  }
  console.log(`\nD2 tarayıcı testi: ${pass} geçti, ${fail} kaldı`);
  if (fails.length) console.log(fails.map((f) => `  ✗ ${f}`).join("\n"));
  process.exit(fail ? 1 : 0);
}
void main();
