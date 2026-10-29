/**
 * Numeroloji Merkezi / Klasik Numeroloji — GERÇEK TARAYICI UI HARNESS (Playwright; DB / sağlayıcı / prod'a SIFIR temas).
 *
 *  - Uygulama: NUMK_UI_URL verilirse o adres; yoksa `next dev --webpack` 127.0.0.1:NUMK_UI_PORT (varsayılan 3991)
 *    NUMEROLOGY_CLASSIC_ENABLED=true + sahte Supabase env ile başlatılır (yalnız bu script'in başlattığı süreç kapatılır).
 *  - TÜM /api/** istekleri tarayıcıda yakalanır ve fikstürlerden (scripts/numeroloji-klasik/ui/fixtures.ts — gerçek
 *    normalize/eşleştirici/hizalama çıktısı) yanıtlanır. localhost dışı her istek iptal edilir.
 *  - Oturum: yasam_user localStorage kaydı (Kupa FINAL-A1 mock harness'iyle aynı düzen) + /api/auth/* sahte yanıtları.
 *
 * Kontroller (her sayfa × 390 / 768 / 1280 / 1536): yatay taşma yok, konsol/sayfa hatası yok, DOM metninde "roxy" yok,
 * ana öğeler görünür. Ek akışlar (1280): form doğrulama + POST, kayıt yeniden adlandır/sil (sayfa içi onay), sekme
 * geçişinde ek istek yok, Taşlar tek istek, Word → POST /rapor, karşılaştırma hizala + çekmece + not 409.
 * Ekran görüntüleri: C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/ui-ekran/
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/ui/ui.harness.ts
 */
import path from "node:path";
import { mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { IDS, buildFixtures, type Fixtures } from "./fixtures";

const PORT = Number(process.env.NUMK_UI_PORT ?? 3991);
const APP = process.env.NUMK_UI_URL ?? `http://127.0.0.1:${PORT}`;
const OUT = process.env.NUMK_UI_OUT ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/ui-ekran";
const VERBOSE = process.env.NUMK_UI_VERBOSE === "1";
const WIDTHS = [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1280, h: 900 },
  { w: 1536, h: 960 },
];
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail: unknown = ""): void {
  if (cond) pass++;
  else {
    fail++;
    fails.push(name);
  }
  if (!cond || VERBOSE) console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail !== "" ? `  → ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}` : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const USER = {
  id: "u-numk-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: "tenant-numk-zz", is_demo_account: false, module_permissions: { numerology: true, numeroloji: true, clients: true }, full_name: "ZZ Numeroloji Uzmanı", name: "ZZ Numeroloji Uzmanı",
};

type Req = { method: string; path: string; search: string; body: unknown };
type State = {
  log: Req[];
  unknown: string[];
  external: string[];
  emptyCatalog: boolean;
  patchConflict: boolean;
  noteConflict: boolean;
  notes: Record<string, unknown>[];
  noClients?: boolean;
  noFuture?: boolean;
};

const DOCX = Buffer.from("504b0304", "hex");
/** 1×1 geçerli PNG (görsel rapor uç taklidi; gerçek PNG doğrulaması report/png.harness.ts'te). */
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function json(route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) {
  return route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
}

async function handleApi(route: Route, f: Fixtures, s: State) {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const m = req.method();
  let body: unknown = null;
  if (m !== "GET" && m !== "HEAD") {
    try {
      body = req.postDataJSON();
    } catch {
      body = req.postData();
    }
  }
  s.log.push({ method: m, path: p, search: u.search, body });
  if (VERBOSE) console.log(`   · ${m} ${p}${u.search}`);
  const b = (body ?? {}) as Record<string, unknown>;

  if (p === "/api/auth/profile") return json(route, { profile: USER });
  if (p === "/api/auth/session") return json(route, m === "GET" ? { valid: true } : { ok: true });

  if (p === "/api/clients" && m === "GET") {
    const q = (u.searchParams.get("search") ?? "").toLocaleLowerCase("tr-TR");
    return json(route, { ok: true, clients: f.clients.filter((c) => !q || `${c.ad} ${c.soyad}`.toLocaleLowerCase("tr-TR").includes(q)) });
  }
  const cm = /^\/api\/clients\/([0-9a-f-]{36})$/.exec(p);
  if (cm && m === "GET") {
    const c = f.clients.find((x) => x.id === cm[1]);
    return c ? json(route, { ok: true, client: c }) : json(route, { ok: false, error: "Danışan bu hesaba ait değil." }, 404);
  }

  const K = "/api/numeroloji-klasik";
  if (p === `${K}/entitlements`) return json(route, { ...f.entitlements, ...(s.noClients ? { canLinkClients: false } : {}), canSeeFutureYears: !s.noFuture });
  if (p === `${K}/rapor/gorsel` && m === "POST") {
    return route.fulfill({ status: 200, headers: { "Content-Type": "image/png", "Content-Disposition": "attachment; filename=\"Klasik-Numeroloji-test.png\"" }, body: PNG_1PX });
  }
  if (p === `${K}/analyses` && m === "GET") {
    if (u.searchParams.get("offset") === "20") return json(route, { ok: true, rows: f.page2, hasMore: false, nextOffset: null });
    return json(route, { ok: true, rows: f.rows, hasMore: true, nextOffset: 20 });
  }
  if (p === `${K}/analyses` && m === "POST") {
    const kind = String(b.kind);
    const id = kind === "person" ? IDS.person : kind === "relationship" ? IDS.relationship : kind === "business" ? IDS.business : IDS.names;
    return json(route, { ok: true, analysis: f.analyses[id] }, 201);
  }
  const am = /^\/api\/numeroloji-klasik\/analyses\/([0-9a-f-]{36})(\/taslar)?$/.exec(p);
  if (am) {
    const a = f.analyses[am[1]];
    if (am[2]) {
      if (!a) return json(route, { ok: false, code: "NOT_FOUND", error: "Bulunamadı." }, 404);
      if (a.kind !== "person") return json(route, { ok: false, code: "STONES_NOT_AVAILABLE", error: "Bu analizde taş eşleştirmesi için kişi haritası bulunmuyor." }, 422);
      return json(route, { ok: true, ...f.stonesView });
    }
    if (m === "GET") return a ? json(route, { ok: true, analysis: a }) : json(route, { ok: false, code: "NOT_FOUND", error: "Bulunamadı." }, 404);
    if (m === "PATCH") {
      if (s.patchConflict) return json(route, { ok: false, code: "CONFLICT", error: "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin." }, 409);
      const row = f.rows.find((x) => x.id === am[1]) ?? f.rows[0];
      return json(route, { ok: true, row: { ...row, title: String(b.title ?? row.title), ...("clientId" in b ? { clientId: b.clientId } : {}), rowVersion: Number(row.rowVersion) + 1 } });
    }
    if (m === "DELETE") return json(route, { ok: true, id: am[1] });
  }
  if (p === `${K}/catalog`) {
    const kind = (u.searchParams.get("kind") ?? "pythagorean_meaning") as keyof Fixtures["catalog"];
    return json(route, { ok: true, entries: s.emptyCatalog ? [] : f.catalog[kind] ?? [] });
  }
  if (p === `${K}/karsilastirma/kaynaklar`) return json(route, { ok: true, ...f.compareSources });
  if (p === `${K}/karsilastirma/hizala`) {
    const hasL = typeof b.legacyId === "string";
    const hasC = typeof b.classicId === "string";
    return json(route, {
      ok: true,
      alignment: hasL ? f.alignment : f.alignmentClassicOnly,
      stones: { classic: hasC ? f.stonesView : null, legacyAssignments: hasL ? f.legacyAssignments : [] },
      sources: { legacy: hasL ? f.alignSources.legacy : null, classic: hasC ? f.alignSources.classic : null },
    });
  }
  if (p === `${K}/karsilastirma/notlar` && m === "GET") return json(route, { ok: true, notes: s.notes });
  if (p === `${K}/karsilastirma/notlar` && m === "POST") {
    const note = { ...f.note, id: `8888888${s.notes.length + 1}-8888-4888-8888-888888888888`, body: String(b.body ?? ""), rowVersion: 1 };
    s.notes = [note, ...s.notes];
    return json(route, { ok: true, note }, 201);
  }
  const nm = /^\/api\/numeroloji-klasik\/karsilastirma\/notlar\/([0-9a-f-]{36})$/.exec(p);
  if (nm) {
    if (m === "PATCH") {
      if (s.noteConflict) return json(route, { ok: false, code: "CONFLICT", error: "Kayıt başka bir oturumda değişti. Sayfayı yenileyip tekrar deneyin." }, 409);
      s.notes = s.notes.map((x) => (x.id === nm[1] ? { ...x, body: String(b.body), rowVersion: Number(x.rowVersion) + 1 } : x));
      return json(route, { ok: true, note: s.notes.find((x) => x.id === nm[1]) });
    }
    if (m === "DELETE") {
      s.notes = s.notes.filter((x) => x.id !== nm[1]);
      return json(route, { ok: true, id: nm[1] });
    }
    return json(route, { ok: true, note: s.notes.find((x) => x.id === nm[1]) ?? null, legacyChanged: false });
  }
  if (p === `${K}/rapor` && m === "POST") {
    return route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": "attachment; filename=\"klasik-numeroloji.docx\"; filename*=UTF-8''klasik-numeroloji.docx" },
      body: DOCX,
    });
  }
  s.unknown.push(`${m} ${p}`);
  return json(route, { ok: true });
}

async function setup(browser: Browser, f: Fixtures, viewport: { width: number; height: number }, opts: Partial<State> = {}) {
  const ctx = await browser.newContext({ viewport, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", u);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {
      /* yok */
    }
  }, JSON.stringify(USER));
  const s: State = { log: [], unknown: [], external: [], emptyCatalog: false, patchConflict: false, noteConflict: false, notes: [f.note], ...opts };
  await ctx.route((u) => !u.href.startsWith(APP) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"), (r) => {
    s.external.push(r.request().url());
    return r.abort();
  });
  await ctx.route((u) => u.href.startsWith(APP) && new URL(u.href).pathname.startsWith("/api/"), (r) => handleApi(r, f, s));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    // Harness BİLEREK iptal ettiği localhost-dışı istekler (ör. sahte Supabase adresi) tarayıcıda ERR_FAILED üretir.
    if (/Failed to load resource: net::ERR_FAILED/.test(t) && s.external.length > 0) return;
    errors.push(`console: ${t.slice(0, 300)}`);
  });
  return { ctx, page, s, errors };
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
/** Uzmana görünen metin + erişilebilirlik öznitelikleri + başlıkta sağlayıcı adı var mı? */
const hasBrand = (page: Page) =>
  page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")]
      .map((el) => ["aria-label", "title", "placeholder", "alt"].map((a) => el.getAttribute(a) ?? "").join(" "))
      .join(" ");
    return /roxy/i.test(`${document.title} ${document.body.innerText} ${attrs}`);
  });

async function common(page: Page, label: string, errors: string[], shot?: string) {
  await sleep(250);
  ok(`${label}: yatay taşma yok`, await noHScroll(page), await page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`));
  ok(`${label}: sağlayıcı adı yok`, !(await hasBrand(page)));
  ok(`${label}: konsol/sayfa hatası yok`, errors.length === 0, errors.join(" | "));
  errors.length = 0;
  if (shot) await page.screenshot({ path: path.join(OUT, `${shot}.png`), fullPage: true });
}

async function goto(page: Page, url: string, ready: string) {
  await page.goto(`${APP}${url}`, { waitUntil: "load", timeout: 300_000 });
  await page.locator(ready).first().waitFor({ state: "visible", timeout: 300_000 });
}

async function waitHttp(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* bekle */
    }
    await sleep(1500);
  }
  throw new Error(`uygulama başlamadı: ${url}`);
}

const count = (s: State, method: string, re: RegExp) => s.log.filter((x) => x.method === method && re.test(x.path)).length;

async function main() {
  const f = buildFixtures();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let ctx: BrowserContext | null = null;
  try {
    if (!process.env.NUMK_UI_URL) {
      app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          NUMEROLOGY_CLASSIC_ENABLED: "true",
          NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "false",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59998",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "zz-dummy-anon",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "zz-dummy-anon",
          SUPABASE_SERVICE_ROLE_KEY: "zz-dummy-service",
        },
        stdio: VERBOSE ? "inherit" : "ignore",
      });
      console.log(`next dev başlatıldı (pid ${app.pid}, port ${PORT})`);
    }
    await waitHttp(`${APP}/numeroloji-merkezi`, 300_000);
    // Derlemeyi ısıt (dev: ilk istek derler).
    for (const r of ["/numeroloji-merkezi", "/numeroloji-klasik", "/numeroloji-klasik/yeni", "/numeroloji-klasik/iliski", "/numeroloji-klasik/isletme", "/numeroloji-klasik/isimler", "/numeroloji-klasik/kayitlar", "/numeroloji-klasik/kutuphane", `/numeroloji-klasik/analiz/${IDS.person}`, "/numeroloji-karsilastirma"]) {
      const res = await fetch(`${APP}${r}`).catch(() => null);
      ok(`sunucu ${r} → 200`, res?.status === 200, res?.status);
    }
    const nf = await fetch(`${APP}/numeroloji-klasik/analiz/gecersiz-kimlik`).catch(() => null);
    const nfHtml = nf ? await nf.text() : "";
    ok("geçersiz analiz kimliği → notFound (404 ya da noindex not-found gövdesi)", nf?.status === 404 || /<meta name="robots" content="noindex"|NEXT_HTTP_ERROR_FALLBACK;404/.test(nfHtml), nf?.status);
    browser = await chromium.launch();

    // ═══ SAYFA × GENİŞLİK MATRİSİ ═══════════════════════════════════════════════════════════════
    for (const vp of WIDTHS) {
      const W = vp.w;
      const env = await setup(browser, f, { width: vp.w, height: vp.h });
      ctx = env.ctx;
      const { page, s, errors } = env;

      await goto(page, "/numeroloji-merkezi", "[data-testid=gate-b]");
      ok(`${W} kapı: A kartı /numeroloji'ya düz bağlantı`, (await page.getAttribute("[data-testid=gate-a]", "href")) === "/numeroloji");
      ok(`${W} kapı: B → /numeroloji-klasik`, (await page.getAttribute("[data-testid=gate-b]", "href")) === "/numeroloji-klasik");
      ok(`${W} kapı: karşılaştırma kartı`, (await page.getAttribute("[data-testid=gate-compare]", "href")) === "/numeroloji-karsilastirma");
      await common(page, `${W} kapı`, errors, `01-kapi-${W}`);

      await goto(page, "/numeroloji-klasik", "[data-testid=hub-yeni]");
      ok(`${W} merkez: 6 bağlantı + doğaltaş kartı`, (await page.locator("[data-testid^=hub-]").count()) === 7);
      await common(page, `${W} merkez`, errors, `02-merkez-${W}`);

      await goto(page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      ok(`${W} yeni: Tümü varsayılan açık`, await page.locator("[data-testid=tech-all]").isChecked());
      await page.getByLabel("Ad soyad").fill("Işıl Çağrı Öztürk");
      ok(`${W} yeni: Latin önizleme`, (await page.locator("[data-testid=latin-preview]").innerText()).replace(/\s+/g, " ").trim() === "ISIL CAGRI OZTURK", await page.locator("[data-testid=latin-preview]").innerText());
      await common(page, `${W} yeni analiz`, errors, `03-yeni-analiz-${W}`);

      for (const [u, t, n] of [["/numeroloji-klasik/iliski", "relationship-form", "04-iliski"], ["/numeroloji-klasik/isletme", "business-form", "05-isletme"], ["/numeroloji-klasik/isimler", "names-form", "06-isimler"]] as const) {
        await goto(page, u, `[data-testid=${t}]`);
        await common(page, `${W} ${t}`, errors, `${n}-${W}`);
      }

      await goto(page, "/numeroloji-klasik/kayitlar", "[data-testid=record]");
      ok(`${W} kayıtlar: 5 satır`, (await page.locator("[data-testid=record]").count()) === 5);
      await common(page, `${W} kayıtlar`, errors, `07-kayitlar-${W}`);

      await goto(page, "/numeroloji-klasik/kutuphane", "[data-testid=lib-card]");
      ok(`${W} kütüphane: Pisagor 12 kart`, (await page.locator("[data-testid=lib-card]").count()) === 12);
      await page.getByRole("tab", { name: "Kalde bileşik sayılar" }).click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=lib-card]").length === 43, undefined, { timeout: 20_000 }).catch(() => {});
      ok(`${W} kütüphane: Kalde 43 kart (10–52)`, (await page.locator("[data-testid=lib-card]").count()) === 43);
      await common(page, `${W} kütüphane`, errors, `08-kutuphane-${W}`);

      // Sonuç (kişi) — tüm sekmeler. (dev StrictMode ilk bağlamada etkiyi iki kez çalıştırır; ölçüm hazır olduktan SONRA.)
      await goto(page, `/numeroloji-klasik/analiz/${IDS.person}`, "[data-testid=tab-ozet]");
      await sleep(400);
      const before = s.log.length;
      const tabIds = await page.locator("[role=tab]").evaluateAll((els) => els.map((e) => e.id.replace("nk-tab-", "")));
      ok(`${W} sonuç: 10 sekme`, tabIds.join(",") === "ozet,cekirdek,karmik,zamanlama,kopruler,harfler,kalde,iki,taslar,rapor", tabIds.join(","));
      await common(page, `${W} sonuç özet`, errors, `09-sonuc-ozet-${W}`);
      for (const t of tabIds.slice(1)) {
        await page.locator(`[data-testid=tab-${t}]`).click();
        if (t === "taslar") await page.locator("[data-testid=stone-src-1]").waitFor({ timeout: 20_000 });
        await sleep(150);
        ok(`${W} sonuç ${t}: panel görünür`, await page.locator(`#nk-p-${t}`).isVisible());
        await common(page, `${W} sonuç ${t}`, errors, ["cekirdek", "karmik", "zamanlama", "kalde", "iki", "taslar", "rapor"].includes(t) ? `10-sonuc-${t}-${W}` : undefined);
      }
      await page.locator("[data-testid=tab-ozet]").click();
      await page.locator("[data-testid=tab-taslar]").click();
      await sleep(200);
      const after = s.log.slice(before);
      ok(`${W} sonuç: sekme geçişinde analiz yeniden istenmez`, after.filter((x) => x.method === "GET" && /\/analyses\/[0-9a-f-]{36}$/.test(x.path)).length === 0, after.map((x) => x.path));
      ok(`${W} sonuç: taşlar TEK GET`, after.filter((x) => /\/taslar$/.test(x.path)).length === 1);
      ok(`${W} sonuç: sekme geçişinde başka numeroloji isteği yok`, after.filter((x) => x.path.startsWith("/api/numeroloji-klasik/") && !/\/analyses\/[0-9a-f-]{36}(\/taslar)?$/.test(x.path)).length === 0, after.map((x) => x.path));

      // Karşılaştırma
      await goto(page, "/numeroloji-karsilastirma", "[data-testid=pick-classic]");
      await page.locator("[data-testid=pick-legacy] input[type=radio]").nth(1).check();
      await page.locator("[data-testid=pick-classic] input[type=radio]").nth(1).check();
      await page.locator("[data-testid=align-btn]").click();
      await page.locator("[data-testid=align-table]").waitFor({ timeout: 20_000 });
      ok(`${W} karşılaştırma: ${f.alignment.rows.length} kavram satırı`, (await page.locator("[data-testid=align-row]").count()) === f.alignment.rows.length);
      await common(page, `${W} karşılaştırma`, errors, `11-karsilastirma-${W}`);
      await page.locator("[data-testid=why-btn]").first().click();
      await page.locator("[data-testid=drawer]").waitFor({ timeout: 5000 });
      await common(page, `${W} karşılaştırma çekmece`, errors, W === 390 || W === 1280 ? `12-karsilastirma-cekmece-${W}` : undefined);
      await page.keyboard.press("Escape");
      ok(`${W} çekmece Esc ile kapanır`, (await page.locator("[data-testid=drawer]").count()) === 0);

      await ctx.close();
      ctx = null;
    }

    // ═══ AKIŞLAR (1280) ════════════════════════════════════════════════════════════════════════
    {
      const env = await setup(browser, f, { width: 1280, height: 900 });
      ctx = env.ctx;
      const { page, s, errors } = env;

      // Kişi formu: istemci doğrulaması (POST yok) → geçerli → POST → sonuç
      await goto(page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      await page.getByLabel("Ad soyad").fill("12345");
      await page.getByLabel("Doğum tarihi").fill("31.02.1990");
      await page.getByRole("button", { name: "Hesapla" }).click();
      await sleep(200);
      ok("form: geçersiz ad hatası", (await page.locator(".nk-field-error").allInnerTexts()).some((t) => /harf/.test(t)));
      ok("form: geçersiz gün hatası", (await page.locator(".nk-field-error").allInnerTexts()).some((t) => /böyle bir gün yok/.test(t)));
      ok("form: hatalıyken POST yok", count(s, "POST", /\/analyses$/) === 0);
      await page.getByLabel("Ad soyad").fill("Ayşe Can Öztürk");
      await page.getByLabel("Doğum tarihi").fill("29.02.1988");
      await page.getByRole("textbox", { name: /Hedef tarih/ }).fill("29.10.2026");
      await page.locator("[data-tech=bridge]").uncheck({ force: true });
      ok("form: grup kapatınca Tümü kapanır", !(await page.locator("[data-testid=tech-all]").isChecked()));
      await page.locator("[data-testid=tech-all]").check({ force: true });
      await page.getByRole("button", { name: "Hesapla" }).click();
      await page.waitForURL(new RegExp(`/numeroloji-klasik/analiz/${IDS.person}`), { timeout: 120_000 });
      const post = s.log.find((x) => x.method === "POST" && /\/analyses$/.test(x.path));
      const pb = (post?.body ?? {}) as Record<string, unknown>;
      ok("form: POST gövdesi sözleşmeye uygun", pb.kind === "person" && JSON.stringify(pb.input) === JSON.stringify({ fullName: "Ayşe Can Öztürk", birth: { year: 1988, month: 2, day: 29 }, targetDate: "2026-10-29" }) && JSON.stringify(pb.techniques) === JSON.stringify(["core", "bridge", "personal_day", "daily", "chaldean", "dual"]) && pb.clientId === null, pb);
      await page.locator("[data-testid=tab-rapor]").waitFor({ timeout: 60_000 });

      // Rapor → Word
      await page.locator("[data-testid=tab-rapor]").click();
      const dl = page.waitForEvent("download", { timeout: 20_000 });
      await page.locator("[data-testid=word-download]").click();
      const d = await dl.catch(() => null);
      ok("rapor: indirme tetiklendi", !!d, "download yok");
      const rp = s.log.filter((x) => x.method === "POST" && x.path.endsWith("/rapor")).pop();
      const rb = (rp?.body ?? {}) as Record<string, unknown>;
      ok("rapor: POST /rapor {kind:person, analysisId, variant, include}", rb.kind === "person" && rb.analysisId === IDS.person && rb.variant === "technical" && Array.isArray(rb.include) && (rb.include as unknown[]).length > 0, rb);
      const dl2 = page.waitForEvent("download", { timeout: 20_000 });
      await page.locator("[data-testid=word-stones]").click();
      ok("rapor: taş raporu indirildi", !!(await dl2.catch(() => null)));
      ok("rapor: taş raporu kind=stones", ((s.log.filter((x) => x.path.endsWith("/rapor")).pop()?.body ?? {}) as Record<string, unknown>).kind === "stones");
      await common(page, "akış rapor", errors);

      // Görsel (PNG) rapor: oluştur → önizleme → indir (0 sağlayıcı çağrısı; yalnız /rapor/gorsel)
      await page.locator("[data-testid=png-build]").click();
      await page.locator("[data-testid=png-preview]").waitFor({ timeout: 20_000 });
      const pngPost = s.log.filter((x) => x.method === "POST" && x.path.endsWith("/rapor/gorsel")).pop();
      ok("png: POST /rapor/gorsel { analysisId } (başka alan yok)", JSON.stringify(pngPost?.body) === JSON.stringify({ analysisId: IDS.person }), pngPost?.body);
      ok("png: önizleme görseli yüklendi", await page.locator("[data-testid=png-preview]").evaluate((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0));
      const dlp = page.waitForEvent("download", { timeout: 20_000 });
      await page.locator("[data-testid=png-download]").click();
      const dp = await dlp.catch(() => null);
      ok("png: indirme .png uzantılı", !!dp && /\.png$/i.test(dp.suggestedFilename()), dp?.suggestedFilename());
      await common(page, "akış png", errors, "13-png-1280");

      // Zamanlama: Günün Sayısı kartı Kişisel Gün'den ayrı + sembolik etiketli
      await page.locator("[data-testid=tab-zamanlama]").click();
      const dc = page.locator("[data-testid=daily-card]");
      await dc.waitFor({ timeout: 10_000 });
      const dct = await dc.innerText();
      ok("günlük: ayrı kart + 'sembolik' + 'Kişisel Gün ile aynı şey değildir'", /sembolik/i.test(dct) && /Kişisel Gün ile aynı şey değildir/.test(dct), dct.slice(0, 200));
      ok("günlük: doğrulanamaz rozeti", /doğrulanamaz/.test(dct));
      await common(page, "akış günlük", errors, "14-gunluk-1280");

      // Sonuç ekranından danışana bağlama (PATCH { clientId, rowVersion })
      await page.locator("[data-testid=result-client-link]").click();
      await page.locator("[data-testid=client-open]").click();
      await page.locator("[data-testid=client-option]").first().waitFor({ timeout: 10_000 });
      await page.locator("[data-testid=client-option]").first().click();
      await page.locator("[data-testid=linked-client] a").waitFor({ timeout: 10_000 });
      const lp = s.log.filter((x) => x.method === "PATCH").pop();
      ok("bağla: PATCH { clientId, rowVersion }", JSON.stringify(lp?.body) === JSON.stringify({ clientId: f.clients[0].id, rowVersion: 3 }), lp?.body);
      ok("bağla: bağlı danışan adı + dosya bağlantısı", /ZZ Ayşe Can Öztürk/.test(await page.locator("[data-testid=linked-client]").innerText()) && ((await page.locator("[data-testid=linked-client] a").getAttribute("href")) ?? "").includes(`/dashboard/clients/${f.clients[0].id}?tab=numeroloji`));
      ok("bağla: 'Danışan bağını kaldır' görünür", await page.locator("[data-testid=result-client-unlink]").isVisible());
      await common(page, "akış bağla", errors);

      // Formda danışan seçimi + bilgileri aktar → POST clientId
      await goto(page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      await page.locator("[data-testid=client-open]").click();
      await page.locator("[data-testid=client-search]").fill("bora");
      await sleep(600);
      ok("seçici: arama süzer (1 sonuç)", (await page.locator("[data-testid=client-option]").count()) === 1);
      await page.locator("[data-testid=client-search]").fill("");
      await sleep(600);
      await page.locator("[data-testid=client-option]").first().click();
      ok("seçici: seçilen danışan rozeti", /ZZ Ayşe Can Öztürk/.test(await page.locator("[data-testid=client-chosen]").innerText()));
      await page.locator("[data-testid=client-prefill]").click();
      ok("seçici: bilgileri aktar → ad + doğum", (await page.getByLabel("Ad soyad").inputValue()) === "ZZ Ayşe Can Öztürk" && (await page.getByLabel("Doğum tarihi").inputValue()) === "29.02.1988");
      await page.getByRole("textbox", { name: /Hedef tarih/ }).fill("29.10.2026");
      const nPost = count(s, "POST", /\/analyses$/);
      await page.getByRole("button", { name: "Hesapla" }).click();
      await page.waitForURL(new RegExp(`/numeroloji-klasik/analiz/`), { timeout: 60_000 });
      const cp = s.log.filter((x) => x.method === "POST" && /\/analyses$/.test(x.path)).pop();
      ok("seçici: POST clientId = seçilen danışan", count(s, "POST", /\/analyses$/) === nPost + 1 && (cp?.body as Record<string, unknown>)?.clientId === f.clients[0].id, cp?.body);

      // ?clientId= ön seçimi (Danışan dosyasından gelen bağlantı) + başka tenant/olmayan danışan
      await goto(page, `/numeroloji-klasik/yeni?clientId=${f.clients[1].id}`, "[data-testid=person-form]");
      await page.locator("[data-testid=client-chosen]").waitFor({ timeout: 10_000 });
      ok("?clientId=: danışan ön seçili", /ZZ Bora Demir/.test(await page.locator("[data-testid=client-chosen]").innerText()));
      await goto(page, "/numeroloji-klasik/yeni?clientId=deadbeef-0000-4000-8000-000000000000", "[data-testid=person-form]");
      await page.locator("[data-testid=client-link] [role=alert]").waitFor({ timeout: 10_000 });
      ok("?clientId= yabancı/olmayan → bağ KURULMAZ + uyarı", (await page.locator("[data-testid=client-chosen]").count()) === 0);
      errors.length = 0; // beklenen 404 (yabancı danışan) konsol kaydı sonraki denetime taşınmaz
      for (const [path, sel] of [["/numeroloji-klasik/iliski", "relationship-form"], ["/numeroloji-klasik/isletme", "business-form"], ["/numeroloji-klasik/isimler", "names-form"]] as const) {
        await goto(page, path, `[data-testid=${sel}]`);
        await page.locator("[data-testid=client-link]").waitFor({ timeout: 10_000 }).catch(() => undefined);
        ok(`${sel}: danışan bağlantısı bölümü var`, (await page.locator("[data-testid=client-link]").count()) === 1);
      }
      await goto(page, `/numeroloji-klasik/analiz/${IDS.person}`, "[data-testid=tab-ozet]");

      // Taşlar içerik durumları
      await page.locator("[data-testid=tab-taslar]").click();
      await page.locator("[data-testid=stone-src-1]").waitFor();
      const stonesTxt = await page.locator("#nk-p-taslar").innerText();
      ok("taşlar: stok rozeti 'Stokta · N adet'", /Stokta · \d+ adet/.test(stonesTxt));
      ok("taşlar: belirsiz eşleşme", stonesTxt.includes("Eşleşme belirsiz"));
      ok("taşlar: kütüphanede bulunamadı", stonesTxt.includes("Kütüphanede bulunamadı"));
      ok("taşlar: kök sayı eşleşmesi ayrı başlık", (await page.locator("[data-testid=root-match-head]").count()) === 1);
      ok("taşlar: sembolik/geleneksel not", /sembolik ve geleneksel/.test(await page.locator("[data-testid=stone-disclaimer]").innerText()));
      // Klavye sekme gezinmesi
      await page.locator("[data-testid=tab-taslar]").focus();
      await page.keyboard.press("ArrowRight");
      ok("sekmeler: ok tuşu ile gezinme", (await page.locator("[data-testid=tab-rapor]").getAttribute("aria-selected")) === "true");
      await page.keyboard.press("Home");
      ok("sekmeler: Home ilk sekme", (await page.locator("[data-testid=tab-ozet]").getAttribute("aria-selected")) === "true");

      // Kısmi sonuç
      await goto(page, `/numeroloji-klasik/analiz/${IDS.partial}`, "[data-testid=partial-list]");
      const pl = await page.locator("[data-testid=partial-list]").innerText();
      ok("kısmi: eksik teknikler listelenir", pl.includes("Köprü sayıları") && pl.includes("Kalde (Cheiro)"), pl);
      const ptabs = await page.locator("[role=tab]").evaluateAll((els) => els.map((e) => e.id.replace("nk-tab-", "")));
      ok("kısmi: yalnız verisi olan sekmeler", !ptabs.includes("kopruler") && !ptabs.includes("kalde") && !ptabs.includes("iki") && ptabs.includes("cekirdek"), ptabs);
      await common(page, "kısmi sonuç", errors, "13-sonuc-kismi-1280");

      // İlişki / işletme / isimler sonuç düzenleri
      for (const [id, sel, shot] of [[IDS.relationship, "[data-testid=compat-score]", "14-sonuc-iliski"], [IDS.business, "[data-testid=biz-rating]", "15-sonuc-isletme"], [IDS.names, "[data-testid=names-table]", "16-sonuc-isimler"]] as const) {
        for (const vp of [WIDTHS[0], WIDTHS[2]]) {
          await page.setViewportSize({ width: vp.w, height: vp.h });
          await goto(page, `/numeroloji-klasik/analiz/${id}`, sel);
          await common(page, `${shot} ${vp.w}`, errors, `${shot}-${vp.w}`);
        }
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      ok("isimler: 3 aday kartı", (await page.locator("[data-testid=name-card]").count()) === 3);
      await page.locator("[data-testid=tab-rapor]").click();
      await page.locator("[data-testid=word-download]").click();
      await sleep(400);
      ok("isimler rapor: kind=names", ((s.log.filter((x) => x.path.endsWith("/rapor")).pop()?.body ?? {}) as Record<string, unknown>).kind === "names");

      // Yok olan analiz → 404 mesajı
      await goto(page, "/numeroloji-klasik/analiz/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ".nk-alert-error");
      ok("sonuç 404: Türkçe mesaj", /Analiz bulunamadı/.test(await page.locator(".nk-alert-error").innerText()));
      errors.length = 0; // 404 isteği tarayıcıda "Failed to load resource" konsol hatası üretir (beklenen)

      // İlişki / işletme / isimler formları → POST kind
      await goto(page, "/numeroloji-klasik/iliski", "[data-testid=relationship-form]");
      const labels = page.getByLabel("Ad soyad");
      await labels.nth(0).fill("Ayşe Can Kaya");
      await labels.nth(1).fill("Mert Ozan Demir");
      await page.getByLabel("Doğum tarihi").nth(0).fill("15.07.1990");
      await page.getByLabel("Doğum tarihi").nth(1).fill("22.03.1988");
      await page.getByRole("button", { name: "Hesapla" }).click();
      await page.waitForURL(new RegExp(IDS.relationship), { timeout: 120_000 });
      ok("ilişki formu: POST kind=relationship", ((s.log.filter((x) => x.method === "POST" && x.path.endsWith("/analyses")).pop()?.body ?? {}) as Record<string, unknown>).kind === "relationship");
      await goto(page, "/numeroloji-klasik/isletme", "[data-testid=business-form]");
      await page.getByLabel("İşletme / marka adı").fill("Güneş Çiçekçilik");
      await page.getByRole("button", { name: "Hesapla" }).click();
      await page.waitForURL(new RegExp(IDS.business), { timeout: 120_000 });
      ok("işletme formu: POST kind=business", ((s.log.filter((x) => x.method === "POST" && x.path.endsWith("/analyses")).pop()?.body ?? {}) as Record<string, unknown>).kind === "business");
      await goto(page, "/numeroloji-klasik/isimler", "[data-testid=names-form]");
      const postsBeforeNames = count(s, "POST", /\/analyses$/);
      await page.getByLabel("1. aday", { exact: true }).fill("Zeynep");
      await page.getByLabel("2. aday", { exact: true }).fill("zeynep");
      await page.getByRole("button", { name: "Hesapla" }).click();
      await sleep(200);
      ok("isimler formu: mükerrer aday hatası (POST yok)", (await page.locator(".nk-field-error").allInnerTexts()).some((t) => /iki kez/.test(t)) && count(s, "POST", /\/analyses$/) === postsBeforeNames);
      await page.getByLabel("2. aday", { exact: true }).fill("Işık Çağan Özdemir");
      await page.getByRole("button", { name: "Hesapla" }).click();
      await page.waitForURL(new RegExp(IDS.names), { timeout: 120_000 });
      ok("isimler formu: POST kind=names", ((s.log.filter((x) => x.method === "POST" && x.path.endsWith("/analyses")).pop()?.body ?? {}) as Record<string, unknown>).kind === "names");

      // Kayıtlar: yeniden adlandır, sil (sayfa içi onay; window.confirm YOK), tümünü göster, 409
      let nativeDialog = false;
      page.on("dialog", (dg) => {
        nativeDialog = true;
        void dg.dismiss();
      });
      await goto(page, "/numeroloji-klasik/kayitlar", "[data-testid=record]");
      await page.locator("[data-testid=record]").first().getByRole("button", { name: /yeniden adlandır/ }).click();
      await page.getByLabel("Yeni başlık").fill("Yeni Başlık ZZ");
      await page.getByRole("button", { name: "Kaydet" }).click();
      await page.getByText("Başlık güncellendi.").waitFor({ timeout: 10_000 });
      const patch = s.log.filter((x) => x.method === "PATCH").pop();
      ok("kayıtlar: PATCH {title,rowVersion}", JSON.stringify(patch?.body) === JSON.stringify({ title: "Yeni Başlık ZZ", rowVersion: 3 }), patch?.body);
      await page.locator("[data-testid=record]").nth(1).getByRole("button", { name: /— sil$/ }).click();
      const dlg = page.getByRole("alertdialog");
      await dlg.waitFor();
      await common(page, "kayıt silme onayı", errors, "17-kayit-sil-onay-1280");
      await dlg.getByRole("button", { name: "Sil" }).click();
      await page.getByText(/silindi\./).waitFor({ timeout: 10_000 });
      ok("kayıtlar: DELETE ?rowVersion", s.log.some((x) => x.method === "DELETE" && /rowVersion=\d+/.test(x.search)));
      ok("kayıtlar: 4 satır kaldı", (await page.locator("[data-testid=record]").count()) === 4);
      await page.locator("[data-testid=show-all]").click();
      await page.waitForFunction(() => document.querySelectorAll("[data-testid=record]").length === 7, undefined, { timeout: 10_000 }).catch(() => {});
      ok("kayıtlar: Tümünü göster → offset=20", (await page.locator("[data-testid=record]").count()) === 7 && s.log.some((x) => x.search.includes("offset=20")));
      ok("kayıtlar: tarayıcı confirm/alert YOK", !nativeDialog);
      s.patchConflict = true;
      await page.locator("[data-testid=record]").first().getByRole("button", { name: /yeniden adlandır/ }).click();
      await page.getByLabel("Yeni başlık").fill("Çakışma");
      await page.getByRole("button", { name: "Kaydet" }).click();
      await page.getByText(/başka bir oturumda değişti/).waitFor({ timeout: 10_000 });
      ok("kayıtlar: 409 → yeniden yükle mesajı", true);
      s.patchConflict = false;
      errors.length = 0;

      // Kütüphane boş durum
      await ctx.close();
      const env2 = await setup(browser, f, { width: 390, height: 844 }, { emptyCatalog: true });
      ctx = env2.ctx;
      await goto(env2.page, "/numeroloji-klasik/kutuphane", ".nk-alert");
      ok("kütüphane: boş durum metni", /Kütüphane içeriği henüz yüklenmedi/.test(await env2.page.locator(".nk-alert").first().innerText()));
      await common(env2.page, "kütüphane boş", env2.errors, "18-kutuphane-bos-390");
      await ctx.close();

      // Mobil 390: danışan seçici + PNG kartı + günlük kart; Danışan Yönetimi izni yoksa seçici YOK
      const envM = await setup(browser, f, { width: 390, height: 844 });
      ctx = envM.ctx;
      await goto(envM.page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      await envM.page.locator("[data-testid=client-open]").click();
      await envM.page.locator("[data-testid=client-option]").first().waitFor({ timeout: 10_000 });
      await common(envM.page, "390 danışan seçici", envM.errors, "19-danisan-secici-390");
      await goto(envM.page, `/numeroloji-klasik/analiz/${IDS.person}`, "[data-testid=tab-ozet]");
      await envM.page.locator("[data-testid=tab-zamanlama]").click();
      await envM.page.locator("[data-testid=daily-card]").waitFor({ timeout: 10_000 });
      await common(envM.page, "390 günlük kart", envM.errors, "20-gunluk-390");
      await envM.page.locator("[data-testid=tab-rapor]").click();
      await envM.page.locator("[data-testid=png-build]").click();
      await envM.page.locator("[data-testid=png-preview]").waitFor({ timeout: 20_000 });
      await common(envM.page, "390 png kartı", envM.errors, "21-png-390");
      await ctx.close();
      const envN = await setup(browser, f, { width: 1280, height: 900 }, { noClients: true });
      ctx = envN.ctx;
      await goto(envN.page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      await sleep(800);
      ok("izin yok: danışan seçici görünmez", (await envN.page.locator("[data-testid=client-link]").count()) === 0);
      ok("izin yok: /api/clients hiç çağrılmaz", envN.s.log.filter((x) => x.path.startsWith("/api/clients")).length === 0);
      await goto(envN.page, `/numeroloji-klasik/analiz/${IDS.person}`, "[data-testid=tab-ozet]");
      await sleep(500);
      ok("izin yok: sonuçta 'Danışana bağla' yok", (await envN.page.locator("[data-testid=result-client-link]").count()) === 0);
      await ctx.close();
      // NK-R3: "Gelecek Yılları Göster" izni yok → formda gelecek yıl hedefi reddedilir (POST yok); daraltılmış sonuçta not
      const envF = await setup(browser, f, { width: 1280, height: 900 }, { noFuture: true });
      ctx = envF.ctx;
      await goto(envF.page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
      await sleep(600);
      await envF.page.getByLabel("Ad soyad").fill("Ayşe Can Öztürk");
      await envF.page.getByLabel("Doğum tarihi").fill("29.02.1988");
      await envF.page.getByRole("textbox", { name: /Hedef tarih/ }).fill(`15.03.${new Date().getFullYear() + 3}`);
      await envF.page.getByRole("button", { name: "Hesapla" }).click();
      await sleep(300);
      ok("NK-R3 form: gelecek yıl hedefi → 'Gelecek Yılları Göster' uyarısı, POST yok", (await envF.page.locator(".nk-field-error").allInnerTexts()).some((t) => /Gelecek Yılları Göster/.test(t)) && count(envF.s, "POST", /\/analyses$/) === 0);
      f.analyses[IDS.person] = { ...f.analyses[IDS.person], result: { ...(f.analyses[IDS.person].result as object), futureYearsView: { restricted: true, limitYear: 2026, hidden: { pinnacles: 2, challenges: 0, timing: [] } } } };
      await goto(envF.page, `/numeroloji-klasik/analiz/${IDS.person}`, "[data-testid=tab-ozet]");
      ok("NK-R3 sonuç: 'Gelecek dönemler gizli' notu", /Gelecek dönemler gizli/.test(await envF.page.locator("body").innerText()));
      await common(envF.page, "NK-R3 gizli dönem notu", envF.errors, "22-gelecek-yillar-gizli-1280");
      await ctx.close();

      // Karşılaştırma: tek taraf, not kaydet, 409, Word
      const env3 = await setup(browser, f, { width: 1280, height: 900 });
      ctx = env3.ctx;
      const p3 = env3.page;
      const s3 = env3.s;
      await goto(p3, `/numeroloji-karsilastirma?classicId=${IDS.person}`, "[data-testid=pick-classic]");
      ok("karşılaştırma: URL classicId ön seçimi", await p3.locator("[data-testid=pick-classic] input[type=radio]").nth(1).isChecked());
      await p3.locator("[data-testid=align-btn]").click();
      await p3.locator("[data-testid=align-table]").waitFor();
      const hb = s3.log.filter((x) => x.path.endsWith("/hizala")).pop()?.body as Record<string, unknown>;
      ok("karşılaştırma tek taraf: POST {classicId} (legacyId yok)", hb && hb.classicId === IDS.person && !("legacyId" in hb), hb);
      ok("karşılaştırma tek taraf: 'Bütüncül Numeroloji tarafı boş'", /Bütüncül Numeroloji tarafı boş/.test(await p3.locator("body").innerText()));
      await common(p3, "karşılaştırma tek taraf", env3.errors, "19-karsilastirma-tek-taraf-1280");
      await p3.locator("[data-testid=pick-legacy] input[type=radio]").nth(1).check();
      await p3.locator("[data-testid=align-btn]").click();
      await p3.waitForFunction(() => /Ayşe Can Öztürk/.test(document.querySelector("[data-testid=cmp-sources]")?.textContent ?? "") && !!document.querySelector("[data-testid=legacy-assignments]"), undefined, { timeout: 10_000 }).catch(() => {});
      const body3 = await p3.locator("body").innerText();
      ok("karşılaştırma: 'Bütüncül Numeroloji kaydında saklanmıyor'", (await p3.locator("[data-testid=not-in-snapshot]").count()) > 0);
      ok("karşılaştırma: 'Aynı ad, farklı formül' çipi", (await p3.locator("[data-testid=same-name-chip]").count()) > 0);
      const rels = new Set(await p3.locator("[data-testid=relation-chip]").allInnerTexts());
      ok("karşılaştırma: ilişki çipleri", rels.has("Farklı") && rels.has("Bir tarafta yok") && rels.has("Karşılaştırılamaz"), [...rels]);
      ok("karşılaştırma: Yalnız A / Yalnız B", (await p3.locator("[data-testid=only-a] .nk-chip").count()) > 0 && (await p3.locator("[data-testid=only-b] .nk-chip").count()) > 0);
      ok("karşılaştırma: üç sütun taş + A uzman ataması", (await p3.locator("[data-testid=cmp-stones] > div").count()) === 3 && (await p3.locator("[data-testid=legacy-assignments]").count()) === 1);
      ok("karşılaştırma: 'Orijinal analizler değişmez'", body3.includes("Orijinal analizler değişmez"));
      ok("karşılaştırma: not metni kaçışlı (HTML yorumlanmaz)", (await p3.locator("[data-testid=notes] .nk-note-text").first().innerText()).includes("<b>kalın değil</b>"));
      await p3.locator("[data-testid=note-editor]").fill("Uzman değerlendirmesi ZZ");
      await p3.locator("[data-testid=note-save]").click();
      await p3.getByText(/Değerlendirme kaydedildi/).waitFor({ timeout: 10_000 });
      const np = s3.log.filter((x) => x.method === "POST" && x.path.endsWith("/notlar")).pop()?.body as Record<string, unknown>;
      ok("not: POST {legacyId, classicId, body}", np && np.legacyId === IDS.legacy && np.classicId === IDS.person && np.body === "Uzman değerlendirmesi ZZ", np);
      s3.noteConflict = true;
      await p3.locator("[data-testid=notes] li").first().getByRole("button", { name: "Düzenle" }).click();
      await p3.locator("[data-testid=note-editor]").fill("Düzenleme ZZ");
      await p3.locator("[data-testid=note-save]").click();
      await p3.getByText(/Not başka bir oturumda değişti/).waitFor({ timeout: 10_000 });
      const pp = s3.log.filter((x) => x.method === "PATCH").pop()?.body as Record<string, unknown>;
      ok("not: PATCH {body,rowVersion} + 409 → yenile mesajı", pp && pp.body === "Düzenleme ZZ" && typeof pp.rowVersion === "number", pp);
      env3.errors.length = 0;
      const dl3 = p3.waitForEvent("download", { timeout: 20_000 });
      await p3.locator("[data-testid=cmp-word]").click();
      ok("karşılaştırma Word: indirme", !!(await dl3.catch(() => null)));
      const cw = s3.log.filter((x) => x.path.endsWith("/rapor")).pop()?.body as Record<string, unknown>;
      ok("karşılaştırma Word: {kind:comparison, legacyId, analysisId}", cw && cw.kind === "comparison" && cw.legacyId === IDS.legacy && cw.analysisId === IDS.person, cw);
      ok("karşılaştırma: birleşik sayı metni yok", !/birleşik sayı:\s*\d/i.test(await p3.locator("body").innerText()));
      await common(p3, "karşılaştırma akış", env3.errors);
      ok("bilinmeyen numeroloji API çağrısı yok", [...env3.s.unknown, ...s.unknown].filter((x) => x.includes("/api/numeroloji")).length === 0, [...env3.s.unknown, ...s.unknown]);
      console.log("   bilgi: genel kabuk uçları (sahte {ok:true}):", [...new Set([...env3.s.unknown, ...s.unknown])].join(", "));
      if (s.external.length || env3.s.external.length) console.log("   bilgi: engellenen dış istekler:", [...new Set([...s.external, ...env3.s.external])].slice(0, 5).join(", "));
      await ctx.close();
      ctx = null;
    }
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app && app.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
  }
  console.log(`\nNumeroloji Merkezi UI: ${pass} PASS, ${fail} FAIL`);
  if (fails.length) console.log("Başarısız:", fails.join(" | "));
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
