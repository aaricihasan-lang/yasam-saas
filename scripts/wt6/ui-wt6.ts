/**
 * WT6 — Kupa & Hacamat Takvim + Protokol UX: GERÇEK DB uçtan uca UI testi (prod'a SIFIR temas; ZZ_*).
 *
 *  - Gerçek Kupa migration'lı embedded Postgres + PostgREST shim (kupaTestEnv) → sabit port proxy
 *    (127.0.0.1:54321; build NEXT_PUBLIC_SUPABASE_URL bu adrese derlenir) → `next start` (GERÇEK route'lar).
 *  - Oturum: DB'de gerçek user + session token; localStorage'a yazılır (giriş formu atlanır).
 *  - Her yazma isteği (POST/PATCH/PUT/DELETE /api/kupa/**) kaydedilir: "Kaydet dışında yazma yok"
 *    iddiaları ağ seviyesinde, kalıcılık DB seviyesinde doğrulanır.
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 ile `next build`.
 * Çalıştır: npx tsx scripts/wt6/ui-wt6.ts
 */
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page, type Request } from "playwright";
import { SERVICE_KEY, ANON_KEY, startKupaTestEnv, seedKupa, type KupaUser } from "./kupaTestEnv";

const APP_PORT = Number(process.env.WT6_APP_PORT ?? 3922);
const APP = `http://127.0.0.1:${APP_PORT}`;
const PROXY_PORT = 54321;
const VIEWPORTS = [
  { width: 390, height: 844, tag: "mobil" },
  { width: 1280, height: 900, tag: "web" },
] as const;

let pass = 0;
let fail = 0;
function ok(group: string, name: string, cond: unknown, detail = ""): void {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Write = { method: string; path: string; body: unknown };

function startProxy(target: string): Promise<http.Server> {
  const t = new URL(target);
  const server = http.createServer((req, res) => {
    const up = http.request(
      { host: t.hostname, port: Number(t.port), path: req.url, method: req.method, headers: req.headers },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  return new Promise((resolve) => server.listen(PROXY_PORT, "127.0.0.1", () => resolve(server)));
}

async function waitHttp(url: string, ms = 60000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch { /* bekle */ }
    await sleep(500);
  }
  throw new Error("app başlamadı");
}

async function newCtx(browser: Browser, user: KupaUser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(({ u, token }) => {
    try {
      if (sessionStorage.getItem("zz_seeded")) return;
      sessionStorage.setItem("zz_seeded", "1");
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", token);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  }, {
    u: {
      id: user.id, role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
      tenant_id: user.tenant, is_demo_account: false, module_permissions: { cupping: true }, full_name: "ZZ WT6", name: "ZZ WT6",
    },
    token: user.token,
  });
  // dış ağ kapalı
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  const writes: Write[] = [];
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  page.on("request", (r: Request) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/kupa/") && ["POST", "PATCH", "PUT", "DELETE"].includes(r.method())) {
      let body: unknown = null;
      try { body = r.postDataJSON(); } catch { body = r.postData(); }
      writes.push({ method: r.method(), path: u.pathname, body });
    }
  });
  return { ctx, page, writes, errors };
}

const visibleDay = (page: Page, ymd: string) => page.locator(`[data-kupa-day="${ymd}"]:visible`).first();
const toastText = (page: Page) => page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert]")].map((e) => (e as HTMLElement).innerText).join(" | "));

async function addDayInEditor(page: Page, ymd: string, color: string, label: string, note: string) {
  await visibleDay(page, ymd).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: color }).click();
  if (label) await dlg.locator("#cupping-day-label").fill(label);
  if (note) await dlg.locator("#cupping-day-note").fill(note);
  await dlg.getByRole("button", { name: "Taslağa Uygula" }).click();
}

async function clickSave(page: Page) {
  await page.locator('[data-kupa-savebar] button:visible', { hasText: "Değişiklikleri Kaydet" }).first().click();
}

async function main() {
  const env = await startKupaTestEnv({ port: 54493, dirName: "wt6-kupa-ui-pgdata" });
  const proxy = await startProxy(env.url);
  const seed = await seedKupa(env.su);
  const su = env.su;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], {
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PROXY_PORT}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/`);
    browser = await chromium.launch();

    // Her viewport için AYRI uzman (A mobil, B web) → bağımsız temiz takvim/protokol verisi.
    const users: Record<string, KupaUser> = { mobil: seed.A, web: seed.B };
    // Kaynak öneri izolasyonu için: her uzmanın kendi kaynağı + tenant'ına aktarılmış (sistem) kaynak.
    for (const [tag, u] of Object.entries(users)) {
      await su.query(`insert into cupping_sources(tenant_id, source_name) values ($1,$2)`, [u.tenant, `Ahmet Hoca Eğitim Notu ${tag}`]);
      await su.query(`insert into cupping_sources(tenant_id, source_name, origin_source_id, transferred_at) values ($1,'Sistem Sahibi Kataloğu',$2, now())`, [u.tenant, randomUUID()]);
      await su.query(`insert into cupping_points(tenant_id, name) values ($1,'ZZ Ense Bölgesi')`, [u.tenant]);
    }

    for (const vp of VIEWPORTS) {
      const u = users[vp.tag];
      const other = vp.tag === "mobil" ? users.web : users.mobil;
      const { ctx, page, writes, errors } = await newCtx(browser, u, vp);
      const G = (s: string) => `${s}-${vp.tag}`;
      try {
        // ═══ TAKVİM ═══════════════════════════════════════════════════════
        await page.goto(`${APP}/kupa/takvim`, { waitUntil: "load" });
        await page.getByRole("button", { name: "Takvim Oluştur" }).waitFor({ timeout: 20000 });
        await page.getByRole("button", { name: "Takvim Oluştur" }).click();
        const dlg = page.getByTestId("kupa-new-calendar");
        await dlg.waitFor();
        ok(G("A-yeni-takvim"), "Yeni Takvim: yıl + ay seçimi (ad/açıklama formu YOK)",
          (await page.getByTestId("kupa-new-calendar-year").count()) === 1 && (await page.getByTestId("kupa-new-calendar-month").count()) === 1 && (await dlg.locator("input").count()) === 0);
        await page.getByTestId("kupa-new-calendar-year").selectOption("2026");
        await page.getByTestId("kupa-new-calendar-month").selectOption("2");
        ok(G("A-yeni-takvim"), "boş yıl: 'henüz takviminiz yok' bilgisi", /henüz takviminiz yok/.test(await page.getByTestId("kupa-new-calendar-hint").innerText()));
        const before = writes.length;
        await dlg.getByRole("button", { name: /Şubat 2026 Ayını Düzenle/ }).click();
        await page.getByTestId("kupa-edit-banner").waitFor({ timeout: 15000 });
        ok(G("A-yeni-takvim"), "doğrudan Şubat 2026 DÜZENLEME ekranı", /Düzenleniyor: Şubat 2026/.test(await page.getByTestId("kupa-edit-banner").innerText()));
        ok(G("A-yeni-takvim"), "yıl için TEK plan oluşturuldu (POST plans reuse_year)", writes.slice(before).filter((w) => w.path === "/api/kupa/calendar/plans").length === 1 && (writes.slice(before).find((w) => w.path === "/api/kupa/calendar/plans")?.body as { reuse_year?: boolean })?.reuse_year === true);
        const febCells = await page.locator('[data-kupa-day^="2026-02-"]:visible').count();
        ok(G("D-tarih"), "Şubat 2026 = 28 gün", febCells === 28, String(febCells));

        await addDayInEditor(page, "2026-02-03", "Mavi", "ZZ kısa", "ZZ detay notu");
        await addDayInEditor(page, "2026-02-28", "Yeşil", "Ay sonu", "");
        const w0 = writes.length;
        await clickSave(page);
        await page.waitForFunction(() => /Tüm değişiklikler kaydedildi/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        const dbFeb = (await su.query(`select gregorian_date::text d, color_key, user_label, note from cupping_calendar_plan_days d join cupping_calendar_plans p on p.id=d.plan_id where p.tenant_id=$1 order by 1`, [u.tenant])).rows;
        ok(G("A-yeni-takvim"), "Kaydet → DB: 2026-02-03 (mavi, not) + 2026-02-28", JSON.stringify(dbFeb.map((x) => `${x.d}:${x.color_key}:${x.user_label ?? ""}:${x.note ?? ""}`)) === JSON.stringify(["2026-02-03:blue:ZZ kısa:ZZ detay notu", "2026-02-28:green:Ay sonu:"]), JSON.stringify(dbFeb));
        ok(G("A-yeni-takvim"), "tek kayıt çağrısı (POST days ×1)", writes.slice(w0).filter((w) => /\/days$/.test(w.path)).length === 1);

        // Düzenlemeyi bitir → GÖRÜNTÜLEME (salt okunur)
        await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
        await page.getByTestId("kupa-edit-month").waitFor();
        const wView = writes.length;
        ok(G("C-salt-okunur"), "görüntüleme modunda hücreler 'view'", (await page.locator('[data-kupa-day="2026-02-03"]:visible').first().getAttribute("data-kupa-mode")) === "view");
        await visibleDay(page, "2026-02-03").click();
        const info = page.getByTestId("kupa-day-info");
        await info.waitFor();
        const infoText = await info.innerText();
        ok(G("C-salt-okunur"), "güne dokun → bilgi: işaretli + renk + kısa açıklama + not", /işaretli gün/.test(infoText) && /Mavi/.test(infoText) && /ZZ kısa/.test(infoText) && /ZZ detay notu/.test(infoText), infoText);
        ok(G("C-salt-okunur"), "bilgi panelinde düzenleme kontrolü YOK", (await info.locator("input, textarea, [aria-label=Mavi]").count()) === 0);
        await info.getByRole("button", { name: "Kapat" }).last().click();
        await visibleDay(page, "2026-02-04").click();
        ok(G("C-salt-okunur"), "düzenlenmemiş gün → 'kayıt yok'", /kayıt yok/.test(await page.getByTestId("kupa-day-info").innerText()));
        await page.keyboard.press("Escape");
        // Yıllık görünüm
        await page.getByRole("button", { name: /Yıllık/ }).first().click();
        await page.locator('[data-kupa-annual-day="2026-02-28"]').waitFor({ timeout: 8000 });
        await page.locator('[data-kupa-annual-day="2026-02-28"]').click();
        const ai = await page.getByTestId("kupa-day-info").innerText();
        ok(G("C-salt-okunur"), "yıllık: güne dokun → bilgi (Ay sonu, Yeşil)", /Ay sonu/.test(ai) && /Yeşil/.test(ai), ai);
        await page.keyboard.press("Escape");
        ok(G("C-salt-okunur"), "yıllık görünümde düzenleme bandı/kaydet barı YOK", (await page.getByTestId("kupa-edit-banner").count()) === 0 && (await page.locator("[data-kupa-savebar]:visible").count()) === 0);
        ok(G("C-salt-okunur"), "görüntüleme dokunuşlarında YAZMA isteği YOK", writes.length === wView, JSON.stringify(writes.slice(wView)));

        // Mevcut aya YENİDEN giriş (Yeni Takvim → 2026 Şubat)
        await page.getByRole("button", { name: "+ Yeni Takvim" }).click();
        await page.getByTestId("kupa-new-calendar-year").selectOption("2026");
        await page.getByTestId("kupa-new-calendar-month").selectOption("2");
        ok(G("B-yeniden-giris"), "dolu yıl: 'mevcut işaretli günleriyle açılır' bilgisi", /zaten var/.test(await page.getByTestId("kupa-new-calendar-hint").innerText()));
        const wRe = writes.length;
        await page.getByTestId("kupa-new-calendar").getByRole("button", { name: /Ayını Düzenle/ }).click();
        await page.getByTestId("kupa-edit-banner").waitFor();
        ok(G("B-yeniden-giris"), "yeni plan OLUŞTURULMADI (POST plans yok)", writes.slice(wRe).filter((w) => w.path === "/api/kupa/calendar/plans").length === 0);
        ok(G("B-yeniden-giris"), "eski işaretler geliyor (3 Şubat seçili)", (await visibleDay(page, "2026-02-03").getAttribute("aria-pressed")) === "true");
        await visibleDay(page, "2026-02-03").click();
        const dlg2 = page.getByRole("dialog");
        ok(G("B-yeniden-giris"), "eski kısa açıklama + not editöre yüklendi", (await dlg2.locator("#cupping-day-label").inputValue()) === "ZZ kısa" && (await dlg2.locator("#cupping-day-note").inputValue()) === "ZZ detay notu");
        await dlg2.locator("#cupping-day-note").fill("ZZ not güncellendi");
        await dlg2.getByRole("button", { name: "Taslağa Uygula" }).click();
        await visibleDay(page, "2026-02-28").click();
        await page.getByRole("dialog").getByRole("button", { name: "Gün Seçimini Kaldır" }).click();
        await addDayInEditor(page, "2026-02-14", "Pembe", "", "");
        await clickSave(page);
        await page.waitForFunction(() => /Tüm değişiklikler kaydedildi/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        const dbFeb2 = (await su.query(`select gregorian_date::text d, color_key, note from cupping_calendar_plan_days d join cupping_calendar_plans p on p.id=d.plan_id where p.tenant_id=$1 order by 1`, [u.tenant])).rows;
        ok(G("B-yeniden-giris"), "ekle (14) + güncelle (3 notu) + kaldır (28) kalıcı", JSON.stringify(dbFeb2.map((x) => `${x.d}:${x.color_key}:${x.note ?? ""}`)) === JSON.stringify(["2026-02-03:blue:ZZ not güncellendi", "2026-02-14:pink:"]), JSON.stringify(dbFeb2));
        ok(G("B-yeniden-giris"), "duplicate plan YOK (2026 için 1 plan)", (await su.query(`select count(*)::int n from cupping_calendar_plans where tenant_id=$1 and year=2026`, [u.tenant])).rows[0].n === 1);

        // Ay sınırları (düzenleme modunda ay gezinme)
        const monthNext = page.getByRole("button", { name: /Sonraki ay|›|Sonraki/ }).first();
        const counts: Record<string, number> = {};
        for (let i = 0; i < 2; i++) { await monthNext.click(); await sleep(250); }
        counts.nisan = await page.locator('[data-kupa-day^="2026-04-"]:visible').count();
        await monthNext.click(); await sleep(250);
        counts.mayis = await page.locator('[data-kupa-day^="2026-05-"]:visible').count();
        for (let i = 0; i < 7; i++) { await monthNext.click(); await sleep(200); }
        counts.aralik = await page.locator('[data-kupa-day^="2026-12-"]:visible').count();
        ok(G("D-tarih"), "30 günlük Nisan / 31 günlük Mayıs / 31 günlük Aralık", counts.nisan === 30 && counts.mayis === 31 && counts.aralik === 31, JSON.stringify(counts));
        await addDayInEditor(page, "2026-12-31", "Mor", "Yıl sonu", "");
        await clickSave(page);
        await page.waitForFunction(() => /Tüm değişiklikler kaydedildi/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        ok(G("D-tarih"), "31 Aralık kaymasız kaydedildi", (await su.query(`select count(*)::int n from cupping_calendar_plan_days d join cupping_calendar_plans p on p.id=d.plan_id where p.tenant_id=$1 and gregorian_date='2026-12-31'`, [u.tenant])).rows[0].n === 1);
        await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
        // Artık yıl: 2028 Şubat → yeni yıl planı + 29 gün
        await page.getByRole("button", { name: "+ Yeni Takvim" }).click();
        await page.getByTestId("kupa-new-calendar-year").selectOption("2028");
        await page.getByTestId("kupa-new-calendar-month").selectOption("2");
        await page.getByTestId("kupa-new-calendar").getByRole("button", { name: /Ayını Düzenle/ }).click();
        await page.getByTestId("kupa-edit-banner").waitFor();
        ok(G("D-tarih"), "2028 Şubat (artık yıl) = 29 gün", (await page.locator('[data-kupa-day^="2028-02-"]:visible').count()) === 29);
        await addDayInEditor(page, "2028-02-29", "Mavi", "", "");
        // Kaydedilmemiş değişiklikle bitir → onay → Vazgeç (kal) → Kaydetmeden Devam
        await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
        const cdlg = page.getByRole("alertdialog");
        await cdlg.waitFor();
        await cdlg.getByRole("button", { name: "Vazgeç" }).click();
        ok(G("C-salt-okunur"), "kaydedilmemiş değişiklikle 'Bitir' → onay; Vazgeç → düzenlemede kalır", (await page.getByTestId("kupa-edit-banner").count()) === 1);
        await clickSave(page);
        await page.waitForFunction(() => /Tüm değişiklikler kaydedildi/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
        ok(G("D-tarih"), "2028-02-29 kaydedildi", (await su.query(`select count(*)::int n from cupping_calendar_plan_days d join cupping_calendar_plans p on p.id=d.plan_id where p.tenant_id=$1 and gregorian_date='2028-02-29'`, [u.tenant])).rows[0].n === 1);
        ok(G("A-yeni-takvim"), "yıl başına tek plan (2026, 2028)", (await su.query(`select count(*)::int n from cupping_calendar_plans where tenant_id=$1`, [u.tenant])).rows[0].n === 2);
        await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();

        // ═══ PROTOKOL ═════════════════════════════════════════════════════
        await page.goto(`${APP}/kupa/protokoller/yeni`, { waitUntil: "load" });
        await page.locator("#np-title").waitFor({ timeout: 15000 });
        const body = await page.locator("body").innerText();
        ok(G("A-etiket"), "etiket başlığı 'Arama ve Sınıflandırma Etiketleri' + açıklama", /Arama ve Sınıflandırma Etiketleri/.test(body) && /virgülle ayırarak yazın/.test(body) && !/Etiketler \(virgülle\)/.test(body));
        const wp = writes.length;
        await page.locator("#np-title").fill("ZZ_WT6 Migren Protokolü");
        await page.locator("#np-cat").fill("Baş & Boyun");
        await page.locator("#np-tags").fill("baş ağrısı, migren, kupa, ense");
        await sleep(800);
        ok(G("C-manuel"), "alan değiştir → yazma isteği YOK", writes.length === wp);
        // Tarayıcı/Android geri → onay → Vazgeç
        await page.goBack();
        const back = page.getByRole("alertdialog");
        await back.waitFor({ timeout: 5000 });
        ok(G("D-cikis"), "geri → 'Kaydedilmemiş değişiklikleriniz var' onayı", /Kaydedilmemiş değişiklikleriniz var/.test(await back.innerText()) && /Kaydetmeden Çık/.test(await back.innerText()));
        await back.getByRole("button", { name: "Vazgeç" }).click();
        await sleep(400);
        ok(G("D-cikis"), "Vazgeç → formda kalınır, veri duruyor", page.url().endsWith("/kupa/protokoller/yeni") && (await page.locator("#np-title").inputValue()) === "ZZ_WT6 Migren Protokolü");
        // Uygulama içi link (breadcrumb) → onay → Vazgeç
        await page.locator('a[href="/kupa/protokoller"]').first().click();
        const lnk = page.getByRole("alertdialog");
        await lnk.waitFor({ timeout: 5000 });
        await lnk.getByRole("button", { name: "Vazgeç" }).click();
        ok(G("D-cikis"), "route değişimi (link) → onay; Vazgeç → kal", page.url().endsWith("/kupa/protokoller/yeni"));
        ok(G("C-manuel"), "çıkış denemeleri yazma yapmadı", writes.length === wp);
        await page.getByTestId("kupa-new-protocol-save").dblclick();
        await page.waitForURL(/\/kupa\/protokoller\/[0-9a-f-]{36}$/, { timeout: 15000 });
        const posts = writes.slice(wp).filter((w) => w.path === "/api/kupa/protocols" && w.method === "POST");
        ok(G("C-manuel"), "Kaydet (çift tık) → TEK POST", posts.length === 1, String(posts.length));
        ok(G("C-manuel"), "'Kaydedildi' bildirimi", /Kaydedildi/.test(await toastText(page)));
        const protId = page.url().split("/").pop()!;
        const pRow = (await su.query(`select tags, category from cupping_protocols where id=$1`, [protId])).rows[0];
        ok(G("A-etiket"), "virgüllü etiketler dizi olarak saklandı", JSON.stringify(pRow?.tags) === JSON.stringify(["baş ağrısı", "migren", "kupa", "ense"]), JSON.stringify(pRow));

        // Kaynak: katalog YOK, serbest yazı, yalnız kendi geçmişi
        await page.getByRole("button", { name: "+ Kaynak Ekle" }).click();
        const sname = page.getByTestId("kupa-source-name");
        await sname.waitFor();
        ok(G("B-kaynak"), "hazır katalog açılır listesi YOK", (await page.locator("select[aria-label='Katalogdan kaynak seç']").count()) === 0 && !/Katalogdan Kaynak Seç/.test(await page.locator("body").innerText()));
        await sname.click();
        await sname.fill("ahmet");
        const sug = page.getByTestId("kupa-source-name-suggestions");
        await sug.waitFor({ timeout: 4000 });
        const sugText = await sug.innerText();
        ok(G("B-kaynak"), "öneri: uzmanın KENDİ geçmiş kaynağı", sugText.includes(`Ahmet Hoca Eğitim Notu ${vp.tag}`), sugText);
        ok(G("B-kaynak"), "başka tenant kaynağı görünmüyor", !sugText.includes(`Ahmet Hoca Eğitim Notu ${vp.tag === "mobil" ? "web" : "mobil"}`));
        await sname.fill("");
        await sname.fill("s");
        const all = (await page.getByTestId("kupa-source-name-suggestions").count()) ? await page.getByTestId("kupa-source-name-suggestions").innerText() : "";
        ok(G("B-kaynak"), "sistem sahibi / aktarılmış katalog kaynağı önerilmiyor", !/Sistem Sahibi Kataloğu/.test(all), all);
        await sname.fill(`ZZ Yepyeni Kitap ${vp.tag}`);
        const wsrc = writes.length;
        await sleep(500);
        ok(G("B-kaynak"), "yazarken yazma YOK", writes.length === wsrc);
        await page.getByTestId("kupa-source-save").dblclick();
        await page.waitForFunction(() => /ZZ Yepyeni Kitap/.test(document.body.innerText ?? ""), null, { timeout: 10000 }).catch(() => {});
        const srcLinks = (await su.query(`select s.source_name from cupping_protocol_sources ps join cupping_sources s on s.id=ps.source_id where ps.protocol_id=$1`, [protId])).rows;
        ok(G("B-kaynak"), "yeni serbest kaynak eklendi (tek bağlantı)", srcLinks.length === 1 && srcLinks[0].source_name === `ZZ Yepyeni Kitap ${vp.tag}`, JSON.stringify(srcLinks));
        ok(G("B-kaynak"), "başka tenant'a kaynak yazılmadı", (await su.query(`select count(*)::int n from cupping_sources where tenant_id=$1 and source_name=$2`, [other.tenant, `ZZ Yepyeni Kitap ${vp.tag}`])).rows[0].n === 0);

        // Bölge seçimi: seçim yazmaz, Kaydet yazar
        const wpk = writes.length;
        await page.getByRole("button", { name: "+ Bölge Ekle" }).click();
        await page.getByRole("dialog").getByText("ZZ Ense Bölgesi").first().click();
        await page.getByTestId("kupa-pending-point").waitFor({ timeout: 5000 });
        ok(G("C-manuel"), "picker seçimi → yazma YOK, 'Eklenecek — henüz kaydedilmedi'", writes.length === wpk);
        // Kaydetmeden çık (link) → onay → Kaydetmeden Çık → yazma yok
        await page.locator('a[href="/kupa/protokoller"]').first().click();
        const lv = page.getByRole("alertdialog");
        await lv.waitFor({ timeout: 5000 });
        await lv.getByRole("button", { name: "Vazgeç" }).click();
        await page.getByTestId("kupa-pending-save-point").dblclick();
        await page.waitForFunction(() => !document.querySelector('[data-testid="kupa-pending-point"]'), null, { timeout: 10000 }).catch(() => {});
        const pp = writes.slice(wpk).filter((w) => w.path === "/api/kupa/protocol-points");
        ok(G("C-manuel"), "Kaydet → TEK protocol-points POST (çift tık)", pp.length === 1, String(pp.length));
        ok(G("C-manuel"), "bölge kalıcı", (await su.query(`select count(*)::int n from cupping_protocol_points where protocol_id=$1`, [protId])).rows[0].n === 1);

        // Temel bilgi düzenleme: Kapat → onay → Kaydetmeden Çık (yazma yok); tekrar → Kaydet → kalıcı
        await page.getByRole("button", { name: "Temel Bilgiyi Düzenle" }).click();
        await page.locator("#pf-tags").fill("ense, boyun");
        const wb = writes.length;
        await page.getByRole("dialog", { name: "Temel Bilgiyi Düzenle" }).getByRole("button", { name: "Kapat" }).click();
        const bc = page.getByRole("alertdialog");
        await bc.waitFor({ timeout: 5000 });
        await bc.getByRole("button", { name: "Kaydetmeden Çık" }).click();
        await sleep(400);
        ok(G("D-cikis"), "Kapat → onay → Kaydetmeden Çık: değişiklik atıldı, yazma YOK", writes.length === wb && JSON.stringify((await su.query(`select tags from cupping_protocols where id=$1`, [protId])).rows[0].tags) === JSON.stringify(["baş ağrısı", "migren", "kupa", "ense"]));
        await page.getByRole("button", { name: "Temel Bilgiyi Düzenle" }).click();
        await page.locator("#pf-tags").fill("ense, boyun");
        await page.getByTestId("kupa-basic-save").dblclick();
        await sleep(1500);
        const patches = writes.slice(wb).filter((w) => w.method === "PATCH" && w.path === `/api/kupa/protocols/${protId}`);
        ok(G("E-edit"), "Kaydet (çift tık) → TEK PATCH + 'Kaydedildi'", patches.length === 1 && /Kaydedildi/.test(await toastText(page)), String(patches.length));
        await page.reload({ waitUntil: "load" });
        await page.getByRole("button", { name: "Temel Bilgiyi Düzenle" }).waitFor({ timeout: 15000 });
        await page.getByRole("button", { name: "Temel Bilgiyi Düzenle" }).click();
        ok(G("E-edit"), "yeniden aç → değişiklik kalıcı", (await page.locator("#pf-tags").inputValue()) === "ense, boyun");
        await page.getByRole("dialog", { name: "Temel Bilgiyi Düzenle" }).getByRole("button", { name: "Vazgeç" }).click();
        // Kaydetme hatası → kaydedilmiş gibi görünmez
        await page.route(`**/api/kupa/protocols/${protId}`, (r) => (r.request().method() === "PATCH" ? r.fulfill({ status: 500, json: { ok: false, error: "ZZ sunucu hatası" } }) : r.continue()));
        await page.getByRole("button", { name: "Temel Bilgiyi Düzenle" }).click();
        await page.locator("#pf-title").fill("ZZ değişmeyecek başlık");
        await page.getByTestId("kupa-basic-save").click();
        await sleep(1200);
        ok(G("C-manuel"), "kayıt hatası → hata bildirimi, form AÇIK, veri kaydolmuş gibi değil",
          /ZZ sunucu hatası/.test(await toastText(page)) && (await page.getByRole("dialog", { name: "Temel Bilgiyi Düzenle" }).count()) === 1 &&
          (await su.query(`select title from cupping_protocols where id=$1`, [protId])).rows[0].title === "ZZ_WT6 Migren Protokolü");
        await page.unroute(`**/api/kupa/protocols/${protId}`);
        await page.getByRole("dialog", { name: "Temel Bilgiyi Düzenle" }).getByRole("button", { name: "Vazgeç" }).click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Kaydetmeden Çık" }).click();
        // Hazırlık bölümü kirli → tarayıcı geri → onay → Kaydetmeden Çık → listeye gider, yazma yok
        const prepSec = page.getByRole("region", { name: "Hazırlık / Sonrası / Takip" });
        await prepSec.getByRole("button", { name: "Düzenle" }).click();
        const wl = writes.length;
        if (vp.tag === "mobil") {
          // <1024: alan kartı → tam ekran editör; "Uygula" YALNIZ forma aktarır (yazma YOK)
          await prepSec.getByRole("button", { name: /Uygulama Öncesi Hazırlık/ }).click();
          await page.locator("textarea:visible").last().fill("ZZ hazırlık notu");
          await page.getByTestId("kupa-bignote-apply").click();
        } else {
          await prepSec.locator("textarea").first().fill("ZZ hazırlık notu");
        }
        await page.goBack();
        const gb = page.getByRole("alertdialog");
        const asked = await gb.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (asked) await gb.getByRole("button", { name: "Kaydetmeden Çık" }).click();
        await sleep(1200);
        ok(G("D-cikis"), "belgede kirli bölüm + geri → onay → Kaydetmeden Çık (yazma YOK)", asked && writes.length === wl);

        // yatay taşma
        await page.goto(`${APP}/kupa/takvim`, { waitUntil: "load" });
        await sleep(1500);
        ok(G("M-mobil"), "takvim: yatay taşma yok", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        ok(G("M-mobil"), "JS hata yok", errors.length === 0, errors.join(" ; "));
      } catch (e) {
        ok(G("runner"), "senaryo çalıştı", false, String(e).slice(0, 400));
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser?.close();
    app?.kill();
    proxy.close();
    await env.stop();
  }
  console.log(`\nWT6 UI: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
