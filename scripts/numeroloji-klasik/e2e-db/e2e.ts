/**
 * Klasik Numeroloji — GERÇEK VERİTABANI + GERÇEK TARAYICI uçtan uca testi (Playwright chromium).
 *
 * PRODUCTION / UZAK SUPABASE'E SIFIR TEMAS. Yığın (yalnız 127.0.0.1):
 *   • embedded-postgres + PostgREST shim (scripts/anamnez/testEnv) — gerçek migration'lar (env.ts)
 *   • Doğaltaş Kütüphanesi: GERÇEK kayıtlı kristal verisi çevrimdışı yeniden oynatmayla aktarılır + gerçek owner
 *     fonksiyonlarıyla yayımlanır (env.ts → populateStoneLibrary)
 *   • `next dev --webpack` (port NUMK_E2E_PORT, varsayılan 3993) NODE_OPTIONS="--require provider-preload.cjs":
 *     sağlayıcı istekleri KAYITLI ham yanıtlardan (varsayılan, ücretsiz) — gerçek mod yalnız NUMK_E2E_PROVIDER=real.
 *   • Sentetik kullanıcı / danışan (ZZ … / @example.test). Danışan A'nın adı + doğumu kayıtlı sentetik vaka (m02-c1)
 *     ile aynıdır ki ürünün planladığı istek gövdeleri kayıtla birebir eşleşsin.
 *
 * Çalıştır (mock / yeniden oynatma):  npx tsx scripts/numeroloji-klasik/e2e-db/e2e.ts
 * Gerçek mod (ÜCRETLİ; owner onayı gerekir, bu oturumda ÇALIŞTIRILMADI):
 *   NUMK_E2E_PROVIDER=real ROXY_API_KEY=<gerçek anahtar> npx tsx scripts/numeroloji-klasik/e2e-db/e2e.ts
 * Ekran görüntüleri / indirilen dosyalar / loglar: C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/e2e-db/
 */
import Module from "node:module";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import JSZip from "jszip";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const ROOT = path.resolve(__dirname, "../../..");
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const PORT = Number(process.env.NUMK_E2E_PORT ?? 3993);
const PG_PORT = Number(process.env.NUMK_E2E_PG_PORT ?? 54661);
const SHIM_PORT = Number(process.env.NUMK_E2E_SHIM_PORT ?? 54662);
const APP = `http://127.0.0.1:${PORT}`;
const MODE = (process.env.NUMK_E2E_PROVIDER ?? "replay").trim();
const OUT = process.env.NUMK_E2E_OUT ?? "C:/YasamSistemi-QA/NUMEROLOJI-KLASIK-2026-10-29/e2e-db";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const RUN_DIR = path.join(OUT, `run-${STAMP}`);
const SHOTS = path.join(RUN_DIR, "ekran");
const EVENT_LOG = path.join(RUN_DIR, "provider-events.jsonl");
const NEXT_LOG = path.join(RUN_DIR, "next-dev.log");
const PRELOAD = path.join(__dirname, "provider-preload.cjs").split(path.sep).join("/");
const TARGET_TR = "29.10.2026";
const TARGET_ISO = "2026-10-29";
const WIDTHS = [
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 1280, h: 900 },
  { w: 1536, h: 960 },
];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: unknown, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    fails.push(label);
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`);
  }
}
const noise = new Set<string>();
const section = (s: string) => console.log(`\n— ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sağlayıcı olay günlüğü (preload yazar) ──────────────────────────────────────────────────────
type Ev = { event: string; endpoint?: string; file?: string; host?: string };
function events(): Ev[] {
  if (!existsSync(EVENT_LOG)) return [];
  return readFileSync(EVENT_LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Ev);
}
const PROVIDER_EVENTS = new Set(["replay_hit", "replay_miss", "synthetic_daily", "real_attempt"]);
const providerEvents = (from: number) => events().slice(from).filter((e) => PROVIDER_EVENTS.has(e.event));
const mark = () => events().length;

// ── Süreç yönetimi ──────────────────────────────────────────────────────────────────────────────
function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore" });
  else try { process.kill(-pid, "SIGKILL"); } catch { /* yok */ }
}
async function waitHttp(url: string, ms: number, alive: () => boolean = () => true): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive()) throw new Error(`uygulama süreci kapandı (bkz. next-dev.log): ${url}`);
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

// ── Tarayıcı yardımcıları ──────────────────────────────────────────────────────────────────────
type Who = { id: string; token: string; tenantId: string; perms: Record<string, boolean>; fullName: string; email: string };
type Ctx = { ctx: BrowserContext; page: Page; errors: string[]; label: string };

async function newCtx(browser: Browser, who: Who, vp: { width: number; height: number }, label: string): Promise<Ctx> {
  const mobile = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: who.id, tenant_id: who.tenantId, full_name: who.fullName, name: who.fullName, email: who.email, role: "expert", active: true,
    approval_status: "approved", package_type: "premium", plan: "premium", membership_status: "active", module_permissions: who.perms, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    try {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", tok as string);
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {
      /* yok */
    }
  }, [JSON.stringify(user), who.token]);
  // Tarayıcı ağ kilidi: uygulama + yerel shim dışı her istek iptal.
  const external: string[] = [];
  await ctx.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u.href) && !u.href.startsWith("data:") && !u.href.startsWith("blob:"), (r) => {
    external.push(r.request().url());
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // Kaynak yükleme hataları aşağıda URL'leriyle ayrıca kaydedilir (response / requestfailed).
    if (/^Failed to load resource/.test(msg.text())) return;
    errors.push(`console: ${msg.text().slice(0, 300)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()} ${r.request().method()} ${r.url().replace(APP, "")}`);
  });
  page.on("requestfailed", (r) => {
    errors.push(`failed ${r.method()} ${r.url().replace(APP, "")} ${r.failure()?.errorText ?? ""}`);
  });
  return { ctx, page, errors, label };
}

const noHScroll = (page: Page) =>
  page.evaluate(() => ({ ok: document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
const brandLeak = (page: Page) =>
  page.evaluate(() => {
    const attrs = [...document.querySelectorAll("[aria-label],[title],[placeholder],[alt]")]
      .map((el) => ["aria-label", "title", "placeholder", "alt"].map((a) => el.getAttribute(a) ?? "").join(" "))
      .join(" ");
    const t = `${document.title} ${document.body.innerText} ${attrs}`;
    const m = /roxy|roxyapi|kristal sağlayıcısı|kristal-kaynak/i.exec(t);
    return m ? t.slice(Math.max(0, m.index - 60), m.index + 60) : null;
  });
async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);
}
async function goto(page: Page, url: string, ready: string, timeout = 300_000): Promise<void> {
  await page.goto(`${APP}${url}`, { waitUntil: "load", timeout });
  await page.locator(ready).first().waitFor({ state: "visible", timeout });
}
const texts = (page: Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => (e.textContent ?? "").trim()));

/** Sayfa kontrolleri: taşma + marka + hata (hata listesi kontrol sonrası sıfırlanır). */
async function screenCheck(c: Ctx, name: string, opts: { shotName?: string; ignoreConsole?: RegExp } = {}): Promise<void> {
  await sleep(300);
  const hs = await noHScroll(c.page);
  ok(hs.ok, `${c.label} ${name}: yatay taşma yok`, hs);
  const leak = await brandLeak(c.page);
  ok(leak === null, `${c.label} ${name}: görünür metinde sağlayıcı / kaynak adı yok`, leak);
  // Bilinen, modül dışı gürültü (ayrıca raporlanır): gezinme / effect temizliğiyle iptal edilen istekler (ERR_ABORTED),
  // harness'ın engellediği dış betikler (Vercel analytics), uygulama kabuğunun izinsiz modül yoklamaları (403/404).
  const benign = (e: string) => / net::ERR_ABORTED$/.test(e) || /^failed GET https:\/\/va\.vercel-scripts\.com\//.test(e)
    || /^http (403|404) GET \/api\/(astroloji\/access|beslenme\/access|appointments\/notifications)$/.test(e);
  for (const e of c.errors) if (benign(e)) noise.add(e.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>").replace(/hot-update\.js/, "hot-update.js"));
  const errs = c.errors.filter((e) => !benign(e) && !(opts.ignoreConsole && opts.ignoreConsole.test(e)));
  ok(errs.length === 0, `${c.label} ${name}: konsol / sayfa hatası yok`, errs.slice(0, 3));
  c.errors.length = 0;
  if (opts.shotName) await shot(c.page, opts.shotName);
}

type ApiRes = { status: number; json: Record<string, unknown>; buf: Buffer | null; ct: string };
async function api(who: Who | null, method: string, p: string, body?: unknown): Promise<ApiRes> {
  const headers: Record<string, string> = {};
  if (who) {
    headers["x-user-id"] = who.id;
    headers["x-session-token"] = who.token;
  }
  if (body !== undefined) headers["content-type"] = "application/json";
  const r = await fetch(`${APP}${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("json")) return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown>, buf: null, ct };
  return { status: r.status, json: {}, buf: Buffer.from(await r.arrayBuffer()), ct };
}

function pngInfo(b: Buffer): { sig: boolean; width: number; height: number } {
  const sig = b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { sig, width: sig ? b.readUInt32BE(16) : 0, height: sig ? b.readUInt32BE(20) : 0 };
}
async function docxText(buf: Buffer): Promise<string> {
  const z = await JSZip.loadAsync(buf);
  const parts: string[] = [];
  for (const name of Object.keys(z.files)) if (/\.(xml|rels)$/.test(name)) parts.push(await z.file(name)!.async("string"));
  return parts.join("\n");
}

/** Kişi formu: (isteğe bağlı) danışan bilgilerini aktar, hedef tarih, teknik seçimi, gönder → sonuç kimliği. */
async function submitPerson(c: Ctx, o: { url: string; prefill?: boolean; fullName?: string; birth?: string; target: string; techs: "all-but-pd" | string[] }): Promise<{ id: string; body: Record<string, unknown> | null }> {
  const page = c.page;
  await goto(page, o.url, "[data-testid=person-form]");
  if (o.prefill) {
    await page.locator("[data-testid=client-prefill]").waitFor({ timeout: 120_000 });
    await page.locator("[data-testid=client-prefill]").click();
  }
  if (o.fullName !== undefined) await page.getByLabel("Ad soyad").fill(o.fullName);
  if (o.birth !== undefined) await page.getByLabel("Doğum tarihi").fill(o.birth);
  await page.getByRole("textbox", { name: /Hedef tarih/ }).fill(o.target);
  if (o.techs === "all-but-pd") {
    await page.locator("[data-testid=tech-all]").check({ force: true });
    await page.locator("[data-tech=personal_day]").uncheck({ force: true });
  } else {
    await page.locator("[data-testid=tech-all]").check({ force: true });
    await page.locator("[data-testid=tech-all]").uncheck({ force: true });
    for (const t of o.techs) await page.locator(`[data-tech=${t}]`).check({ force: true });
  }
  let body: Record<string, unknown> | null = null;
  const reqP = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/numeroloji-klasik/analyses", { timeout: 60_000 }).catch(() => null);
  await page.getByRole("button", { name: "Hesapla" }).click();
  const req = await reqP;
  try {
    body = req ? (req.postDataJSON() as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  await page.waitForURL(/\/numeroloji-klasik\/analiz\/[0-9a-f-]{36}/, { timeout: 180_000 });
  const id = /\/analiz\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? "";
  await page.locator("[data-testid=tab-rapor]").waitFor({ timeout: 120_000 });
  return { id, body };
}

async function main(): Promise<void> {
  mkdirSync(SHOTS, { recursive: true });
  const t0 = Date.now();
  // Bu süreçte de ağ kilidi: yalnız 127.0.0.1 / localhost.
  const realFetch = globalThis.fetch;
  const blocked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    blocked.push(u.replace(/[?#].*$/, ""));
    throw new Error(`ağ kilidi: ${u.replace(/[?#].*$/, "")}`);
  }) as typeof fetch;
  if (MODE === "real" && process.env.NUMK_E2E_REAL_CONFIRM !== "EVET") {
    console.log("Gerçek mod ücretli çağrı yapar: NUMK_E2E_REAL_CONFIRM=EVET olmadan çalışmaz. DURDU.");
    process.exitCode = 2;
    return;
  }

  const { startE2eDb, seedUsers, importCatalog, populateStoneLibrary, ANON_KEY, SERVICE_KEY } = await import("./env");
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let logFd: number | null = null;
  const env = await startE2eDb({ pgPort: PG_PORT, httpPort: SHIM_PORT });
  // Bilinen tuzak: Windows'ta postmaster kapanınca io_worker alt süreçleri yetim kalıp portu tutabiliyor → PID'i sakla.
  let postmasterPid = 0;
  try { postmasterPid = Number(readFileSync(path.join(env.dataDir, "postmaster.pid"), "utf8").split(/\r?\n/)[0].trim()) || 0; } catch { /* yok */ }
  const su = env.su;
  su.on("error", (e) => console.error("  (test PG bağlantı hatası)", e.message));
  const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await su.query(sql, p)).rows as T[];
  const n = async (sql: string, p: unknown[] = []) => Number(Object.values((await su.query(sql, p)).rows[0] ?? { x: 0 })[0]);
  const report: Record<string, unknown> = { at: new Date().toISOString(), mode: MODE, runDir: RUN_DIR };

  const cleanup = () => {
    killTree(app?.pid);
    app = null;
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    section("Kurulum: tohum + katalog + GERÇEK Doğaltaş Kütüphanesi");
    const S = await seedUsers(su);
    const cat = await importCatalog(PG_PORT).catch((e) => ({ ok: false, written: 0, problems: [String((e as Error).message)] }));
    report.catalog = cat;
    ok(cat.ok, "Klasik Numeroloji kataloğu kayıtlı ham yanıtlardan yüklendi (çevrimdışı)", cat);
    const lib = await populateStoneLibrary(env, PG_PORT, [S.A.id, S.A2.id, S.B.id]);
    report.stoneLibrary = lib;
    ok(lib.importStatus === "completed" && lib.imported > 0 && lib.failedCalls === 0, `kütüphane aktarımı: ${lib.imported} gerçek taş, ${lib.images} görsel (yeniden oynatma, 0 kredi)`, lib);
    ok(lib.published === lib.imported && Object.keys(lib.publishFailures).length === 0, `gerçek owner fonksiyonuyla yayın: ${lib.published}/${lib.imported}`, lib.publishFailures);
    ok(lib.accessGranted, "uzmanlara kütüphane erişimi stone_library_grant_access ile verildi");
    const allowedA = (await q<{ v: boolean }>(`select public.stone_library_viewer_allowed($1) v`, [S.A.id]))[0]?.v;
    ok(allowedA === true, "stone_library_viewer_allowed(uzman A) = true");
    ok(blocked.length === 0, "kurulum: dış ağa 0 istek", blocked);

    section("Next dev başlatılıyor (sağlayıcı preload: " + MODE + ")");
    logFd = openSync(NEXT_LOG, "a");
    const nextEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ${PRELOAD}`.trim(),
      NUMK_E2E_PROVIDER: MODE,
      NUMK_E2E_LOG: EVENT_LOG,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_SUPABASE_URL: env.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
      NUMEROLOGY_CLASSIC_ENABLED: "true",
      NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "true",
      NUMEROLOGY_CLASSIC_CACHE_SECRET: "zz-numk-e2e-cache-secret",
      ROXY_API_KEY: MODE === "real" ? (process.env.ROXY_API_KEY ?? "") : "zz-fake-key",
      STONE_LIBRARY_ENABLED: "true",
    };
    for (const k of ["ROXY_API_BASE_URL", "NUMEROLOGY_CLASSIC_QUOTA_FLOOR", "USAGE360_ENABLED", "SESSION_COOKIE_MODE", "VERCEL", "VERCEL_ENV"]) delete nextEnv[k];
    app = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", "--webpack", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: ROOT, env: nextEnv, stdio: ["ignore", logFd, logFd], windowsHide: true,
    });
    console.log(`  next dev pid ${app.pid}, port ${PORT}, log ${NEXT_LOG}`);
    const child = app;
    await waitHttp(`${APP}/numeroloji-merkezi`, 600_000, () => child.exitCode === null);
    for (const r of ["/numeroloji-merkezi", "/numeroloji-klasik", "/numeroloji-klasik/yeni", "/numeroloji-klasik/kayitlar", "/numeroloji-karsilastirma", `/numeroloji-klasik/analiz/${S.clientA}`, `/dashboard/clients/${S.clientA}`]) {
      await fetch(`${APP}${r}`).catch(() => null);
    }
    await api(S.A, "GET", "/api/numeroloji-klasik/entitlements");
    await api(S.A, "GET", "/api/numeroloji-klasik/analyses");
    await api(S.A, "GET", `/api/clients/${S.clientA}`);
    ok(events().some((e) => e.event === "preload"), "sağlayıcı preload Next sunucu sürecinde yüklendi");
    browser = await chromium.launch();

    // ═══ 1. Kapı → Klasik Numeroloji ═══
    section("1. Numeroloji Merkezi kapısı → Klasik Numeroloji");
    const cA = await newCtx(browser, S.A, { width: 1280, height: 900 }, "A-1280");
    await goto(cA.page, "/numeroloji-merkezi", "[data-testid=gate-b]");
    await screenCheck(cA, "kapı", { shotName: "01-kapi-1280" });
    await cA.page.locator("[data-testid=gate-b]").click();
    await cA.page.waitForURL(/\/numeroloji-klasik\/?$/, { timeout: 120_000 });
    ok(/\/numeroloji-klasik\/?$/.test(cA.page.url()), "kapıdan Klasik Numeroloji'ye geçildi", cA.page.url());
    await cA.page.locator("main, body").first().waitFor();
    await screenCheck(cA, "klasik merkez", { shotName: "02-klasik-merkez-1280" });

    // ═══ 2–3. Danışan bağlı tam hesap ═══
    section("2–3. Danışana bağlı yeni analiz (Bilgileri forma aktar) → sonuç");
    await goto(cA.page, `/numeroloji-klasik/yeni?clientId=${S.clientA}`, "[data-testid=person-form]");
    await cA.page.locator("[data-testid=client-chosen]").waitFor({ timeout: 120_000 });
    const chip = await cA.page.locator("[data-testid=client-chosen]").innerText();
    ok(chip.includes("Bağlı danışan") && chip.includes("Ayşe Can Öztürk"), "danışan çipi: 'Bağlı danışan: Ayşe Can Öztürk'", chip);
    await cA.page.locator("[data-testid=client-prefill]").click();
    const nameVal = await cA.page.getByLabel("Ad soyad").inputValue();
    const birthVal = await cA.page.getByLabel("Doğum tarihi").inputValue();
    ok(nameVal === "Ayşe Can Öztürk" && birthVal === "29.02.1988", "Bilgileri forma aktar: ad soyad + doğum dolduruldu", { nameVal, birthVal });
    await screenCheck(cA, "yeni analiz (danışanlı)", { shotName: "03-yeni-danisanli-1280" });
    const m1 = mark();
    const sub1 = await submitPerson(cA, { url: `/numeroloji-klasik/yeni?clientId=${S.clientA}`, prefill: true, target: TARGET_TR, techs: "all-but-pd" });
    const id1 = sub1.id;
    report.analysis1 = id1;
    ok(/^[0-9a-f-]{36}$/.test(id1), "hesap → sonuç sayfası (/numeroloji-klasik/analiz/<id>)", cA.page.url());
    const b1 = sub1.body ?? {};
    ok(b1.clientId === S.clientA && (b1.input as { targetDate?: string })?.targetDate === TARGET_ISO && (b1.input as { fullName?: string })?.fullName === "Ayşe Can Öztürk",
      "POST gövdesi: clientId + sabit hedef tarih + ad", b1);
    const ev1 = providerEvents(m1);
    report.submit1Events = ev1;
    ok(MODE === "real"
        ? ev1.filter((e) => e.event === "real_attempt").length === 4 && !ev1.some((e) => e.event === "real_refused_cap")
        : ev1.filter((e) => e.event === "replay_hit").length === 3 && ev1.filter((e) => e.event === "synthetic_daily").length === 1 && !ev1.some((e) => e.event === "replay_miss"),
      MODE === "real" ? "sağlayıcı (gerçek): tam 4 çağrı (chart, bridge, chaldean, daily); /dual yok" : "sağlayıcı: 3 kayıt eşleşmesi (chart, bridge, chaldean) + 1 sentetik /daily, ıska 0", ev1.map((e) => `${e.event} ${e.endpoint ?? ""} ${e.file ?? ""}`));
    const tabIds = await cA.page.locator("[role=tab]").evaluateAll((els) => els.map((e) => e.id.replace("nk-tab-", "")));
    for (const t of ["ozet", "cekirdek", "karmik", "zamanlama", "kopruler", "kalde", "iki", "taslar", "rapor"]) ok(tabIds.includes(t), `sekme var: ${t}`, tabIds);
    await screenCheck(cA, "sonuç özet", { shotName: "04-sonuc-ozet-1280" });

    // ═══ 4–8. Değerler = DB ═══
    section("4–8. Ekrandaki değerler = numerology_classic_analyses.result");
    const row = (await q<Record<string, unknown>>(`select * from public.numerology_classic_analyses where id=$1`, [id1]))[0] ?? {};
    const res = (row.result ?? {}) as Record<string, any>;
    ok(row.tenant_id === S.TA && row.client_id === S.clientA && row.created_by === S.A.id, "DB: tenant_id / client_id / created_by doğru", { t: row.tenant_id, c: row.client_id, by: row.created_by });
    ok(row.status === "complete" && row.deleted_at === null, "DB: status complete, silinmemiş", { s: row.status });
    const pm = (row.provider_meta ?? {}) as Record<string, unknown>;
    ok(Array.isArray(pm.failed) && (pm.failed as unknown[]).length === 0 && pm.reference_date === TARGET_ISO, "DB: provider_meta.failed boş, reference_date = hedef tarih", { failed: pm.failed, ref: pm.reference_date });
    const chart = res.chart ?? {};
    // Pisagor çekirdek
    await cA.page.locator("[data-testid=tab-cekirdek]").click();
    const coreUi = (await texts(cA.page, "#nk-p-cekirdek .nk-num-grid .nk-num-big")).slice(0, 6);
    const coreDb = ["lifePath", "expression", "soulUrge", "personality", "birthDay", "maturity"].map((k) => String(chart.core?.[k]?.value));
    ok(coreUi.join(",") === coreDb.join(",") && coreDb.every((x) => x !== "undefined"), `Pisagor çekirdek ekranda = DB (${coreDb.join(", ")})`, { coreUi, coreDb });
    await screenCheck(cA, "sonuç çekirdek", { shotName: "05-sonuc-cekirdek-1280" });
    // Karmik
    await cA.page.locator("[data-testid=tab-karmik]").click();
    await cA.page.locator("[data-testid=karmic-grid]").waitFor({ timeout: 20_000 });
    const karmUi = await texts(cA.page, "#nk-p-karmik .nk-num-big");
    const karmDb = [chart.hiddenPassion?.number, chart.subconsciousSelf?.number].filter((x) => x !== undefined && x !== null).map(String);
    ok(karmDb.length > 0 && karmDb.every((x) => karmUi.includes(x)), `Karmik: gizli tutku / bilinçaltı ekranda = DB (${karmDb.join(", ")})`, { karmUi, karmDb });
    const listN = await texts(cA.page, "#nk-p-karmik .nk-list .nk-n");
    const missing = ((chart.karmicLessons?.missingNumbers ?? []) as number[]).map(String);
    const debts = ((chart.karmicDebt?.debtNumbers ?? []) as number[]).map(String);
    ok([...missing, ...debts].every((x) => listN.includes(x)), `Karmik dersler (${missing.join(",") || "yok"}) + borçlar (${debts.join(",") || "yok"}) ekranda`, { listN, missing, debts });
    await screenCheck(cA, "sonuç karmik", { shotName: "06-sonuc-karmik-1280" });
    // Zamanlama
    await cA.page.locator("[data-testid=tab-zamanlama]").click();
    const pyUi = (await cA.page.locator("[data-testid=cycle-year] b").first().textContent())?.trim();
    ok(pyUi === String(chart.personalYear?.personalYear), `Kişisel yıl ekranda = DB (${chart.personalYear?.personalYear})`, { pyUi });
    const cyc = await texts(cA.page, "#nk-p-zamanlama .nk-cycle b");
    ok(cyc.includes(String(chart.personalYear?.personalMonth?.personalMonth)), `Kişisel ay ekranda = DB (${chart.personalYear?.personalMonth?.personalMonth})`, cyc);
    const daily = res.daily;
    ok(!!daily && (await cA.page.locator("[data-testid=daily-card]").count()) === 1, "Günün Sayısı kartı (data-testid=daily-card) görünüyor");
    const dUi = (await cA.page.locator("[data-testid=daily-card] .nk-cycle b").first().textContent().catch(() => ""))?.trim();
    ok(!!daily && dUi === String(daily.number?.value) && daily.seed === null && daily.seedMode === "person", `Günün sayısı ekranda = DB (${daily?.number?.value}); tohum metni saklanmadı, seedMode=person`, { dUi, seed: daily?.seed, mode: daily?.seedMode });
    await screenCheck(cA, "sonuç zamanlama", { shotName: "07-sonuc-zamanlama-1280" });
    // Köprüler
    await cA.page.locator("[data-testid=tab-kopruler]").click();
    const brUi = await texts(cA.page, "#nk-p-kopruler .nk-list .nk-n");
    const brDb = ["lifePathExpression", "expressionSoulUrge", "soulUrgePersonality", "expressionPersonality"].filter((k) => res.bridge?.[k]).map((k) => String(res.bridge[k].bridge));
    ok(brDb.length === 4 && brUi.join(",") === brDb.join(","), `Köprüler ekranda = DB (${brDb.join(", ")})`, { brUi, brDb });
    await screenCheck(cA, "sonuç köprüler", { shotName: "08-sonuc-kopruler-1280" });
    // Kalde
    await cA.page.locator("[data-testid=tab-kalde]").click();
    const kUi = await texts(cA.page, "#nk-p-kalde .nk-compound");
    const kDb = ["destiny", "soulUrge", "personality"].map((k) => res.chaldean?.[k]).map((p) => (p ? (p.compound !== null ? `${p.compound}→${p.root}` : String(p.root)) : "?"));
    const norm = (s: string) => s.replace(/bileşik.*$/i, "").replace(/\s+/g, "");
    ok(kUi.length >= 3 && kDb.every((x, i) => norm(kUi[i] ?? "").startsWith(x)), `Kalde kader / ruh / kişilik ekranda = DB (${kDb.join(" · ")})`, { kUi, kDb });
    await screenCheck(cA, "sonuç kalde", { shotName: "09-sonuc-kalde-1280" });
    // İki sistem
    await cA.page.locator("[data-testid=tab-iki]").click();
    const ikiTxt = await cA.page.locator("#nk-p-iki").innerText();
    ok(!!res.dual && ikiTxt.length > 40 && ((row.provider_meta as Record<string, any>)?.derived?.dual ?? "") !== "", "İki Sistem: yerel türetme (ek çağrı yok), panel dolu", { derived: (row.provider_meta as Record<string, any>)?.derived });
    await screenCheck(cA, "sonuç iki sistem", { shotName: "10-sonuc-iki-1280" });

    // ═══ 9. Taşlar — gerçek kütüphane ═══
    section("9. Taşlar sekmesi — GERÇEK Doğaltaş Kütüphanesi");
    const taslarResP = cA.page.waitForResponse((r) => /\/api\/numeroloji-klasik\/analyses\/[0-9a-f-]{36}\/taslar$/.test(new URL(r.url()).pathname), { timeout: 120_000 });
    await cA.page.locator("[data-testid=tab-taslar]").click();
    const taslarRes = await taslarResP;
    const tj = (await taslarRes.json().catch(() => ({}))) as Record<string, any>;
    await cA.page.locator("[data-testid=stone-src-1]").waitFor({ timeout: 60_000 });
    ok(taslarRes.status() === 200 && tj.mode === "library", "taşlar: mode = library (gerçek kütüphane)", { s: taslarRes.status(), mode: tj.mode, reason: tj.reason });
    const direct = (tj.result?.providerDirect ?? []) as Array<{ input: string; status: string; stoneKey?: string }>;
    const groups = (tj.result?.groups ?? []) as Array<{ method: string; items: unknown[] }>;
    const statusCount = direct.reduce<Record<string, number>>((m, d) => ({ ...m, [d.status]: (m[d.status] ?? 0) + 1 }), {});
    report.stones = { direct: direct.map((d) => `${d.input}→${d.status}${d.stoneKey ? `:${d.stoneKey}` : ""}`), groups: groups.map((g) => `${g.method}:${g.items.length}`) };
    ok(direct.length > 0 && (statusCount.matched ?? 0) > 0, `haritanın önerdiği taşlar kütüphaneyle eşleşti (${JSON.stringify(statusCount)})`, report.stones);
    ok((await cA.page.locator("[data-testid=stone-direct]").count()) === direct.length, "ekranda doğrudan öneri sayısı = API");
    const derivedN = groups.filter((g) => g.method !== "provider_direct").reduce((s, g) => s + g.items.length, 0);
    ok(derivedN > 0 && (await cA.page.locator("[data-testid=stone-suggestion]").count()) > 0, `türetilmiş öneriler (titreşim / gezegen …) gerçek kütüphaneden: ${groups.map((g) => `${g.method}:${g.items.length}`).join(", ")}`);
    const badges = await cA.page.locator("#nk-p-taslar").innerText();
    ok(/Haritanın önerdiği taşlar/.test(badges) && /Titreşim eşleşmesi/.test(badges) && /Gezegen ilişkisi/.test(badges), "kaynak etiketli gruplar (1 harita / 2 titreşim / 3 gezegen) görünüyor");
    ok(!/roxy|kristal sağlayıcısı|kristal-kaynak|source_key|raw_id/i.test(JSON.stringify(tj)), "taşlar API yanıtında sağlayıcı / kaynak adı veya iç alan yok");
    await screenCheck(cA, "sonuç taşlar", { shotName: "11-sonuc-taslar-1280" });

    // ═══ 10. DB defter + önbellek; yeniden gönderim önbellekten ═══
    section("10. Defter + önbellek; aynı analizi yeniden gönderim → 0 sağlayıcı çağrısı");
    const calls1 = await q<{ endpoint_id: string; cache_hit: boolean; outcome: string; quota_remaining: number | null }>(`select endpoint_id, cache_hit, outcome, quota_remaining from public.numerology_classic_provider_calls where tenant_id=$1 order by created_at`, [S.TA]);
    ok(calls1.length === 4 && calls1.every((c) => !c.cache_hit && c.outcome === "ok") && calls1.every((c) => typeof c.quota_remaining === "number"),
      "provider_calls defteri: 4 satır (chart, bridge, daily, chaldean), cache_hit=false, kalan kota başlıktan", calls1);
    const cacheRows = await q<{ endpoint_id: string; expires_at: string | null; tenant_id: string }>(`select endpoint_id, expires_at, tenant_id from public.numerology_classic_response_cache`);
    ok(cacheRows.length === 4 && cacheRows.every((c) => c.tenant_id === S.TA && c.expires_at !== null && new Date(c.expires_at).getTime() > Date.now() + 80 * 86400_000),
      "yanıt önbelleği: 4 satır, tenant A, expires_at ≈ +90 gün", cacheRows.map((c) => `${c.endpoint_id} ${c.expires_at}`));
    const m2 = mark();
    const sub2 = await submitPerson(cA, { url: `/numeroloji-klasik/yeni?clientId=${S.clientA}`, prefill: true, target: TARGET_TR, techs: "all-but-pd" });
    const id2 = sub2.id;
    ok(/^[0-9a-f-]{36}$/.test(id2) && id2 !== id1, "yeniden gönderim yeni kayıt üretti");
    ok(providerEvents(m2).length === 0, "yeniden gönderim: 0 sağlayıcı çağrısı (preload günlüğü)", providerEvents(m2));
    const hits = await n(`select count(*)::int from public.numerology_classic_provider_calls where tenant_id=$1 and cache_hit`, [S.TA]);
    ok(hits === 4, "provider_calls: 4 önbellek isabeti satırı", hits);
    const row2 = (await q<Record<string, any>>(`select result, provider_meta from public.numerology_classic_analyses where id=$1`, [id2]))[0];
    ok(row2?.provider_meta?.cache_hits === 4 && row2?.provider_meta?.provider_calls === 0 && JSON.stringify(row2?.result?.chart?.core) === JSON.stringify(res.chart?.core),
      "ikinci kayıt: cache_hits=4, provider_calls=0, aynı çekirdek sonuç", row2?.provider_meta);

    // ═══ Kişisel Gün (ayrı teknik; kayıtlı vaka m02-pd-leap) ═══
    section("Kişisel Gün tekniği (kayıtlı vaka: 29.02 doğum, hedef 29.02.2028)");
    const m3 = mark();
    const sub3 = await submitPerson(cA, { url: "/numeroloji-klasik/yeni", fullName: "Ayşe Can Öztürk", birth: "29.02.1988", target: "29.02.2028", techs: ["personal_day"] });
    const ev3 = providerEvents(m3);
    ok(MODE === "real" ? ev3.length === 1 && ev3[0].event === "real_attempt" : ev3.length === 1 && ev3[0].event === "replay_hit" && ev3[0].file === "m02-pd-leap.json",
      MODE === "real" ? "kişisel gün (gerçek): tek çağrı" : "kişisel gün: tek kayıt eşleşmesi (m02-pd-leap)", ev3);
    const row3 = (await q<Record<string, any>>(`select result, client_id from public.numerology_classic_analyses where id=$1`, [sub3.id]))[0];
    const pdUi = await texts(cA.page, "#nk-p-zamanlama .nk-cycle b");
    ok(row3?.client_id === null && pdUi.includes(String(row3?.result?.personal_day?.personalDay)), `Kişisel gün ekranda = DB (${row3?.result?.personal_day?.personalDay}); danışansız kayıt`, { pdUi, db: row3?.result?.personal_day?.personalDay });

    // ═══ NK-R3: "Gelecek Yılları Göster" alt-yetkisi olmayan uzman (A2, aynı tenant) ═══
    section("NK-R3 — alt-yetkisiz uzman: gelecek yıl hedefli kayıt + yeni hesap");
    {
      const g3 = await api(S.A2, "GET", `/api/numeroloji-klasik/analyses/${sub3.id}`);
      const r3 = ((g3.json as { analysis?: { result?: Record<string, unknown> } }).analysis?.result ?? {}) as Record<string, unknown>;
      ok(g3.status === 200 && !("personal_day" in r3) && (r3.futureYearsView as { restricted?: boolean } | undefined)?.restricted === true, "A2: 2028 hedefli kayıtta kişisel gün GÖNDERİLMEZ (gizli işareti var)", { s: g3.status, keys: Object.keys(r3) });
      const g3a = await api(S.A, "GET", `/api/numeroloji-klasik/analyses/${sub3.id}`);
      ok("personal_day" in (((g3a.json as { analysis?: { result?: object } }).analysis?.result) ?? {}), "A (alt-yetkili): aynı kayıtta kişisel gün görünür");
      const dbAfter = (await q<Record<string, any>>(`select result from public.numerology_classic_analyses where id=$1`, [sub3.id]))[0];
      ok(!!dbAfter?.result?.personal_day, "veritabanı kaydı değişmedi");
      const m403 = mark();
      const p403 = await api(S.A2, "POST", "/api/numeroloji-klasik/analyses", { kind: "person", techniques: ["personal_day"], input: { fullName: "Ayşe Can Öztürk", birth: { year: 1988, month: 2, day: 29 }, targetDate: "2028-02-29" } });
      ok(p403.status === 403 && (p403.json as { code?: string }).code === "FUTURE_YEARS_PERMISSION_REQUIRED", "A2: gelecek yıl hedefli yeni hesap → 403", p403.json);
      ok(providerEvents(m403).length === 0, "A2 403: sağlayıcı çağrısı YOK (kredi harcanmaz)", providerEvents(m403));
    }
    await screenCheck(cA, "sonuç kişisel gün", { shotName: "12-sonuc-kisisel-gun-1280" });

    // ═══ 11. Kayıtlardan aç → 0 çağrı ═══
    section("11. Kayıtlı analizi /numeroloji-klasik/kayitlar'dan aç → 0 sağlayıcı çağrısı");
    const m4 = mark();
    await goto(cA.page, "/numeroloji-klasik/kayitlar", "[data-testid=record]");
    const recIds = await cA.page.locator("[data-testid=record] a.nk-rec-main").evaluateAll((els) => els.map((e) => (e.getAttribute("href") ?? "").split("/").pop()));
    ok([id1, id2, sub3.id].every((x) => recIds.includes(x)), "kayıt listesi 3 analizi içeriyor", recIds);
    await screenCheck(cA, "kayıtlar", { shotName: "13-kayitlar-1280" });
    await cA.page.locator(`[data-testid=record] a.nk-rec-main[href$="${id1}"]`).click();
    await cA.page.waitForURL(new RegExp(id1), { timeout: 60_000 });
    await cA.page.locator("[data-testid=tab-taslar]").waitFor({ timeout: 60_000 });
    for (const t of ["cekirdek", "karmik", "zamanlama", "kopruler", "kalde", "iki", "taslar"]) await cA.page.locator(`[data-testid=tab-${t}]`).click();
    await cA.page.locator("[data-testid=stone-src-1]").waitFor({ timeout: 60_000 });
    ok(providerEvents(m4).length === 0, "kayıtlı analiz açma + sekme gezintisi: 0 sağlayıcı çağrısı", providerEvents(m4));

    // ═══ 12. Rapor: Word + PNG ═══
    section("12. Rapor: Word (.docx) + görsel (PNG 2400 px)");
    await cA.page.locator("[data-testid=tab-rapor]").click();
    const m5 = mark();
    const dlW = cA.page.waitForEvent("download", { timeout: 120_000 });
    await cA.page.locator("[data-testid=word-download]").click();
    const dw = await dlW.catch(() => null);
    const wordPath = path.join(RUN_DIR, "klasik-numeroloji.docx");
    if (dw) await dw.saveAs(wordPath);
    const wbuf = dw && existsSync(wordPath) ? readFileSync(wordPath) : Buffer.alloc(0);
    ok(wbuf.length > 1000 && wbuf.subarray(0, 2).toString() === "PK", "Word indirildi: geçerli zip (PK) başlığı", { bytes: wbuf.length, name: dw?.suggestedFilename() });
    const wtxt = wbuf.length ? await docxText(wbuf).catch(() => "") : "";
    ok(wtxt.includes("word/document.xml") || /<w:body>/.test(wtxt), "docx: word/document.xml gövdesi var");
    ok(!/roxy/i.test(wtxt) && wtxt.includes(String(chart.core?.lifePath?.value)), "docx: sağlayıcı adı yok, Yaşam Yolu değeri var");
    const dlPngBuild = cA.page.waitForResponse((r) => new URL(r.url()).pathname === "/api/numeroloji-klasik/rapor/gorsel", { timeout: 180_000 });
    await cA.page.locator("[data-testid=png-build]").click();
    const pres = await dlPngBuild.catch(() => null);
    await cA.page.locator("[data-testid=png-preview]").waitFor({ timeout: 180_000 });
    ok(pres?.status() === 200, "PNG oluşturma isteği 200", pres?.status());
    const dlP = cA.page.waitForEvent("download", { timeout: 60_000 });
    await cA.page.locator("[data-testid=png-download]").click();
    const dp = await dlP.catch(() => null);
    const pngPath = path.join(RUN_DIR, "klasik-numeroloji.png");
    if (dp) await dp.saveAs(pngPath);
    const pinfo = dp && existsSync(pngPath) ? pngInfo(readFileSync(pngPath)) : { sig: false, width: 0, height: 0 };
    ok(pinfo.sig && pinfo.width === 2400, `PNG indirildi: imza geçerli, genişlik ${pinfo.width} px`, pinfo);
    ok(providerEvents(m5).length === 0, "rapor üretimi: 0 sağlayıcı çağrısı", providerEvents(m5));
    await screenCheck(cA, "rapor", { shotName: "14-sonuc-rapor-1280" });

    // ═══ 13. Karşılaştırma ═══
    section("13. Karşılaştırma (mevcut Numeroloji kaydı ↔ klasik analiz)");
    await goto(cA.page, `/numeroloji-karsilastirma?clientId=${S.clientA}&legacyId=${S.legacyA}&classicId=${id1}`, "[data-testid=align-btn]");
    await cA.page.waitForFunction(() => !(document.querySelector("[data-testid=align-btn]") as HTMLButtonElement | null)?.disabled, undefined, { timeout: 60_000 });
    await cA.page.locator("[data-testid=align-btn]").click();
    await cA.page.locator("[data-testid=align-table]").waitFor({ timeout: 120_000 });
    const alignRows = await cA.page.locator("[data-testid=align-row]").count();
    ok(alignRows > 5, `hizalama tablosu: ${alignRows} satır`);
    const cmpTxt = await cA.page.locator("[data-testid=align-table]").innerText();
    ok(cmpTxt.includes(String(chart.core?.lifePath?.value)), "hizalamada klasik Yaşam Yolu değeri görünüyor");
    await screenCheck(cA, "karşılaştırma", { shotName: "15-karsilastirma-1280" });

    // ═══ 15. Danışan dosyası ═══
    section("15. Danışan dosyası → Numeroloji sekmesi → Klasik Numeroloji kartı");
    await goto(cA.page, `/dashboard/clients/${S.clientA}?tab=numeroloji`, "[data-testid=klasik-numeroloji-panel]");
    const panelLinks = await cA.page.locator("[data-testid=klasik-numeroloji-kayit]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    ok(panelLinks.some((h) => h.endsWith(id1)) && panelLinks.some((h) => h.endsWith(id2)) && !panelLinks.some((h) => h.endsWith(sub3.id)), "kart danışana bağlı analizleri listeliyor (danışansız kayıt yok)", panelLinks);
    const newHref = await cA.page.locator("[data-testid=klasik-numeroloji-yeni]").getAttribute("href");
    ok(newHref === `/numeroloji-klasik/yeni?clientId=${S.clientA}`, "'Yeni Klasik Numeroloji analizi' bağlantısı ?clientId= taşıyor", newHref);
    const dossierErrors = [...cA.errors];
    cA.errors.length = 0;
    report.dossierConsole = dossierErrors.slice(0, 10);
    const hsD = await noHScroll(cA.page);
    ok(hsD.ok, "A-1280 danışan dosyası: yatay taşma yok", hsD);
    await shot(cA.page, "16-danisan-dosyasi-numeroloji-1280");
    // Bayrak kapalıyken kart görünmez: (a) GERÇEK route handler bayraksız → 404; (b) tarayıcıda 404 yanıtında kart çizilmez.
    {
      const saved = process.env.NUMEROLOGY_CLASSIC_ENABLED;
      delete process.env.NUMEROLOGY_CLASSIC_ENABLED;
      const { NextRequest } = await import("next/server");
      const route = await import("../../../app/api/numeroloji-klasik/analyses/route");
      const r404 = await route.GET(new NextRequest(`http://localhost/api/numeroloji-klasik/analyses?clientId=${S.clientA}`, { headers: { "x-user-id": S.A.id, "x-session-token": S.A.token } }));
      if (saved !== undefined) process.env.NUMEROLOGY_CLASSIC_ENABLED = saved;
      ok(r404.status === 404, "bayrak tanımsız: gerçek analyses route handler → 404 (süreç içi)", r404.status);
      const cOff = await newCtx(browser, S.A, { width: 1280, height: 900 }, "A-bayrak-kapalı");
      await cOff.ctx.route((u) => new URL(u.href).pathname.startsWith("/api/numeroloji-klasik/"), (r) => r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, code: "NOT_FOUND", error: "Bulunamadı." }) }));
      await goto(cOff.page, `/dashboard/clients/${S.clientA}?tab=numeroloji`, "#tabpanel-numeroloji");
      await sleep(3000);
      ok((await cOff.page.locator("[data-testid=klasik-numeroloji-panel]").count()) === 0, "bayrak kapalı (API 404) → Klasik Numeroloji kartı çizilmez");
      await cOff.ctx.close();
    }

    // ═══ 14. Tenant izolasyonu + yetki + silme ═══
    section("14. Tenant izolasyonu (uzman B) + clients izni olmayan uzman + silme");
    const cB = await newCtx(browser, S.B, { width: 1280, height: 900 }, "B-1280");
    await cB.page.goto(`${APP}/numeroloji-klasik/analiz/${id1}`, { waitUntil: "load", timeout: 300_000 });
    await cB.page.locator(".nk-alert-error, .nk-alert").first().waitFor({ timeout: 120_000 });
    const bTxt = await cB.page.locator("body").innerText();
    ok(/Analiz bulunamadı|bulunamadı/i.test(bTxt) && !bTxt.includes("Ayşe Can Öztürk"), "B tarayıcıda A'nın analizini açamaz ('bulunamadı'; ad sızmaz)", bTxt.slice(0, 200));
    await shot(cB.page, "17-tenantB-analiz-yok-1280");
    cB.errors.length = 0;
    const g = await api(S.B, "GET", `/api/numeroloji-klasik/analyses/${id1}`);
    ok(g.status === 404, "B: GET /analyses/<A analizi> → 404", g.status);
    const pB = await api(S.B, "POST", "/api/numeroloji-klasik/analyses", { ...(sub1.body ?? {}), clientId: S.clientA });
    ok(pB.status === 404 && pB.json.code === "CLIENT_NOT_FOUND", "B: A'nın danışanıyla POST → 404 CLIENT_NOT_FOUND (sağlayıcı çağrısı yok)", pB.json);
    const lB = await api(S.B, "GET", `/api/numeroloji-klasik/analyses?clientId=${S.clientA}`);
    ok(lB.status === 200 && Array.isArray(lB.json.rows) && (lB.json.rows as unknown[]).length === 0, "B: ?clientId=<A danışanı> listesi boş", lB.json);
    const wB = await api(S.B, "POST", "/api/numeroloji-klasik/rapor", { kind: "person", analysisId: id1 });
    ok(wB.status === 404, "B: A'nın analizi için Word raporu → 404", wB.status);
    const iB = await api(S.B, "POST", "/api/numeroloji-klasik/rapor/gorsel", { analysisId: id1 });
    ok(iB.status === 404, "B: A'nın analizi için PNG raporu → 404", iB.status);
    const tB = await api(S.B, "GET", `/api/numeroloji-klasik/analyses/${id1}/taslar`);
    ok(tB.status === 404, "B: A'nın analizi için taşlar → 404", tB.status);
    await cB.ctx.close();
    const cA2 = await newCtx(browser, S.A2, { width: 1280, height: 900 }, "A2-1280");
    await goto(cA2.page, "/numeroloji-klasik/yeni", "[data-testid=person-form]");
    await sleep(1500);
    ok((await cA2.page.locator("[data-testid=client-link]").count()) === 0, "clients izni olmayan uzman: danışan seçici görünmez");
    await screenCheck(cA2, "yeni analiz (clients izni yok)", { shotName: "18-yeni-clients-izni-yok-1280" });
    const a2list = await api(S.A2, "GET", `/api/numeroloji-klasik/analyses?clientId=${S.clientA}`);
    ok(a2list.status === 403, "clients izni olmayan uzman ?clientId= → 403", a2list.status);
    await cA2.ctx.close();
    // Silme (yumuşak) — ikinci kayıt
    const rv = (await q<{ row_version: number }>(`select row_version from public.numerology_classic_analyses where id=$1`, [id2]))[0]?.row_version;
    const dB = await api(S.B, "DELETE", `/api/numeroloji-klasik/analyses/${id2}?rowVersion=${rv}`);
    ok(dB.status === 404, "B: A'nın analizini silemez → 404", dB.status);
    const del = await api(S.A, "DELETE", `/api/numeroloji-klasik/analyses/${id2}?rowVersion=${rv}`);
    ok(del.status === 200 && del.json.ok === true, "A: DELETE (yumuşak silme) → 200", del.json);
    const delRow = (await q<{ deleted_at: string | null }>(`select deleted_at from public.numerology_classic_analyses where id=$1`, [id2]))[0];
    ok(!!delRow?.deleted_at, "DB: deleted_at dolu (satır fiziksel olarak duruyor)");
    const lA = await api(S.A, "GET", "/api/numeroloji-klasik/analyses");
    ok(!(lA.json.rows as Array<{ id: string }>).some((r) => r.id === id2) && (lA.json.rows as Array<{ id: string }>).some((r) => r.id === id1), "liste silineni göstermiyor, diğerini gösteriyor");
    await goto(cA.page, "/numeroloji-klasik/kayitlar", "[data-testid=record]");
    const recIds2 = await cA.page.locator("[data-testid=record] a.nk-rec-main").evaluateAll((els) => els.map((e) => (e.getAttribute("href") ?? "").split("/").pop()));
    ok(!recIds2.includes(id2) && recIds2.includes(id1), "kayıtlar ekranı silineni göstermiyor", recIds2);
    ok((await api(S.A, "GET", `/api/numeroloji-klasik/analyses/${id2}`)).status === 404, "silinen analiz GET → 404");
    cA.errors.length = 0;
    await cA.ctx.close();

    // ═══ Genişlik matrisi: 390 / 768 / 1280 / 1536 ═══
    section("Genişlik matrisi (taşma / konsol / marka) — 390 · 768 · 1280 · 1536");
    for (const vp of WIDTHS) {
      const c = await newCtx(browser, S.A, { width: vp.w, height: vp.h }, `A-${vp.w}`);
      await goto(c.page, "/numeroloji-merkezi", "[data-testid=gate-b]");
      await screenCheck(c, "kapı", { shotName: `20-kapi-${vp.w}` });
      await goto(c.page, `/numeroloji-klasik/yeni?clientId=${S.clientA}`, "[data-testid=client-chosen]");
      await screenCheck(c, "yeni analiz", { shotName: `21-yeni-${vp.w}` });
      await goto(c.page, `/numeroloji-klasik/analiz/${id1}`, "[data-testid=tab-ozet]");
      await screenCheck(c, "sonuç özet", { shotName: `22-sonuc-ozet-${vp.w}` });
      for (const t of ["cekirdek", "zamanlama", "kalde"]) {
        await c.page.locator(`[data-testid=tab-${t}]`).click();
        await screenCheck(c, `sonuç ${t}`, vp.w === 390 ? { shotName: `23-sonuc-${t}-${vp.w}` } : {});
      }
      await c.page.locator("[data-testid=tab-taslar]").click();
      await c.page.locator("[data-testid=stone-src-1]").waitFor({ timeout: 60_000 });
      await screenCheck(c, "sonuç taşlar", { shotName: `24-sonuc-taslar-${vp.w}` });
      await c.page.locator("[data-testid=tab-rapor]").click();
      await screenCheck(c, "sonuç rapor", vp.w === 390 ? { shotName: `25-sonuc-rapor-${vp.w}` } : {});
      await goto(c.page, "/numeroloji-klasik/kayitlar", "[data-testid=record]");
      await screenCheck(c, "kayıtlar", { shotName: `26-kayitlar-${vp.w}` });
      await goto(c.page, `/numeroloji-karsilastirma?clientId=${S.clientA}&legacyId=${S.legacyA}&classicId=${id1}`, "[data-testid=align-btn]");
      await c.page.waitForFunction(() => !(document.querySelector("[data-testid=align-btn]") as HTMLButtonElement | null)?.disabled, undefined, { timeout: 60_000 });
      await c.page.locator("[data-testid=align-btn]").click();
      await c.page.locator("[data-testid=align-table]").waitFor({ timeout: 120_000 });
      await screenCheck(c, "karşılaştırma", { shotName: `27-karsilastirma-${vp.w}` });
      await c.ctx.close();
    }

    // ═══ Genel ═══
    section("Genel");
    const allEv = events();
    report.providerEventTotals = allEv.reduce<Record<string, number>>((m, e) => ({ ...m, [e.event]: (m[e.event] ?? 0) + 1 }), {});
    ok(!allEv.some((e) => e.event === "replay_miss"), "tüm koşu: kayıt ıskası 0", allEv.filter((e) => e.event === "replay_miss"));
    // next dev'in kendi sürüm denetimi (registry.npmjs.org) ürün kodu değildir: kilitte engellenir, yalnız raporlanır.
    const blockedEv = allEv.filter((e) => e.event === "blocked");
    report.blockedHosts = [...new Set(blockedEv.map((e) => e.host))];
    ok(!blockedEv.some((e) => e.host !== "registry.npmjs.org"), `Next sunucusu: ürün kodundan dış ağa 0 istek (engellenen dev-araç host'ları: ${JSON.stringify(report.blockedHosts)})`, blockedEv.slice(0, 5));
    if (MODE === "real") ok(allEv.filter((e) => e.event === "real_attempt").length === 5, "gerçek mod: toplam tam 5 ücretli çağrı (yeniden gönderim, kayıt açma, raporlar 0)", allEv.filter((e) => e.event === "real_attempt").length);
    else ok(!allEv.some((e) => e.event.startsWith("real_")), `gerçek sağlayıcı çağrısı 0 (mod: ${MODE})`);
    ok(blocked.length === 0, "test süreci: dış ağa 0 istek", blocked);
    const legacyIntact = await n(`select count(*)::int from public.numerology_records`);
    ok(legacyIntact === 1, "mevcut numerology_records tablosu değişmedi (1 satır)");
  } catch (e) {
    fail++;
    fails.push(`ÇÖKME: ${(e as Error).message}`);
    console.error("ÇÖKME:", e);
  } finally {
    await browser?.close().catch(() => undefined);
    cleanup();
    if (logFd !== null) try { closeSync(logFd); } catch { /* kapalı */ }
    await env.stop().catch(() => undefined);
    if (process.platform === "win32" && postmasterPid > 0) {
      // Yalnız BU koşunun postmaster'ının yetim çocukları (postgres.exe, ebeveyn = postmasterPid) kapatılır.
      spawnSync("powershell.exe", ["-NoProfile", "-Command",
        `Get-CimInstance Win32_Process -Filter "Name='postgres.exe'" | Where-Object { $_.ParentProcessId -eq ${postmasterPid} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore" });
    }
    const secs = Math.round((Date.now() - t0) / 1000);
    report.benignBrowserNoise = [...noise].sort();
    report.pass = pass;
    report.fail = fail;
    report.failures = fails;
    report.seconds = secs;
    try {
      writeFileSync(path.join(RUN_DIR, "sonuc.json"), JSON.stringify(report, null, 2));
    } catch {
      /* yazılamadı */
    }
    console.log(`\n${pass} ✓ / ${fail} ✗  (${secs} sn) — çıktı: ${RUN_DIR}`);
    if (fails.length) console.log("Başarısız:\n  - " + fails.join("\n  - "));
    process.exitCode = fail ? 1 : 0;
  }
}

main().catch((e) => {
  console.error("e2e hatası:", e);
  process.exit(1);
});
