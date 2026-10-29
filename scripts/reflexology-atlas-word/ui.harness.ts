/**
 * W07 — Kayıtlı Atlas Word dışa aktarma — gerçek tarayıcı UI harness (PRODUCTION'A SIFIR TEMAS).
 *
 * Yerel `next start` + Playwright; `/api/**` bellek-içi SENTETİK arka uçla karşılanır (tenant oturum
 * token'ından çözülür). Masaüstü (1366) ve mobil (390) için:
 *   - "Seçilenleri Word" seçim yokken pasif; "Tümünü Word (N)" etkin; W06 düğmeleri yerinde,
 *   - Tümünü Word → istek gövdesi yalnız { exportMode: "all" } (tenant/kullanıcı gövdede YOK), oturum
 *     başlığı var, dosya indirilir (refleksoloji-atlas-tumu-*.docx), başarı bildirimi,
 *   - Seçilenleri Word → { exportMode: "selected", organs: [seçilen kayıt adları] }, "secili" dosyası,
 *   - kaydedilmemiş yerel değişiklik (tekli silme) Word isteğinden ÖNCE sunucuya gönderilir,
 *   - sunucu hatası (413) → hata bildirimi; liste/seçim/W06 düğmeleri çalışmaya devam eder,
 *   - W06 regresyonu: Seçilenleri Sil → Vazgeç → silme/PUT yok,
 *   - demo hesapta Word düğmeleri gizli; yatay taşma yok.
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-… \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-… npx next build --webpack
 * Çalıştır: npx tsx scripts/reflexology-atlas-word/ui.harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "reflexology-atlas-word-ui");
const PORT = 3994;
const APP = `http://127.0.0.1:${PORT}`;
const TOKEN_A = "zz-w07-session-a-not-a-secret";
const TOKEN_B = "zz-w07-session-b-not-a-secret";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

type R = Record<string, unknown>;
const reg = (id: string, i: number): R => ({ id, shape: "oval", cx: 0.2 + (i % 5) * 0.1, cy: 0.3, rx: 0.04, ry: 0.04, angle: 0, color: "rgba(1,2,3,0.2)" });
function entry(prefix: string, n: number) {
  const e = { taban: { sol: [] as R[], sag: [] as R[] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } };
  for (let i = 0; i < n; i += 1) e.taban[i % 2 ? "sag" : "sol"].push(reg(`${prefix}-${i}`, i));
  return e;
}
const A_ORGANS = ["ZZ Böbrek", "ZZ Kalp", "ZZ Mide", "ZZ Tiroid"];
type Row = { updated_at: string; document: R; organ_list: string[] };
type Call = { kind: "put" | "report"; token: string; body: R; at: number };
class Backend {
  rows = new Map<string, Row>();
  calls: Call[] = [];
  reportStatus = 200;
  seq = 0;
  clock = 0;
  tick() { return new Date(Date.UTC(2026, 9, 29, 9, 0, 0) + (this.clock += 1000)).toISOString(); }
  reset() {
    const docA: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} } };
    A_ORGANS.forEach((o, i) => { docA[o] = entry(`a${i}`, 2); });
    const docB: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} }, "ZZ Xorgan": entry("b", 1) };
    this.rows = new Map([
      [TOKEN_A, { updated_at: this.tick(), document: docA, organ_list: [...A_ORGANS] }],
      [TOKEN_B, { updated_at: this.tick(), document: docB, organ_list: ["ZZ Xorgan"] }],
    ]);
    this.calls = [];
    this.reportStatus = 200;
  }
}
const be = new Backend();

async function handleApi(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const headers = req.headers();
  const tok = Object.values(headers).some((v) => v.includes(TOKEN_B)) ? TOKEN_B : Object.values(headers).some((v) => v.includes(TOKEN_A)) ? TOKEN_A : null;

  if (p === "/api/refleksoloji/atlas") {
    if (!tok) return json({ ok: false }, 401);
    const row = be.rows.get(tok)!;
    if (req.method() === "GET") return json({ ok: true, document: row.document, organ_list: row.organ_list, updated_at: row.updated_at });
    const body = req.postDataJSON() as { document: R; organ_list: string[]; expected_updated_at?: string };
    if (body.expected_updated_at !== row.updated_at) return json({ ok: false, conflict: true }, 409);
    be.calls.push({ kind: "put", token: tok, body, at: be.seq++ });
    const updated_at = be.tick();
    be.rows.set(tok, { updated_at, document: body.document, organ_list: body.organ_list });
    return json({ ok: true, updated_at });
  }
  if (p === "/api/refleksoloji/atlas-report") {
    if (!tok) return json({ ok: false }, 401);
    const body = req.postDataJSON() as R;
    be.calls.push({ kind: "report", token: tok, body, at: be.seq++ });
    if (be.reportStatus !== 200) return json({ ok: false, error: "Rapor indirilebilir boyutu (4,4 MB) aşıyor. Lütfen daha az kayıt seçerek tekrar deneyin." }, be.reportStatus);
    const mode = body.exportMode === "selected" ? "secili" : "tumu";
    return route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="refleksoloji-atlas-${mode}-2026-10-29.docx"`,
      },
      body: Buffer.from("PK-zz-w07-sentetik-docx"),
    });
  }
  if (p === "/api/refleksoloji/protocols/organ") return json({ ok: true, count: 0, titles: [] });
  if (p.startsWith("/api/refleksoloji/notes")) return json({ ok: true, notes: [] });
  if (p.startsWith("/api/refleksoloji/protocols")) return json({ ok: true, protocols: [], data: [] });
  return json({ ok: true });
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const DESKTOP: Device = { name: "masaüstü 1366", viewport: { width: 1366, height: 900 }, mobile: false };
const MOBILE: Device = {
  name: "mobil 390", viewport: { width: 390, height: 844 }, mobile: true,
  ua: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

async function newContext(browser: Browser, d: Device, demo = false): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: "00000000-0000-4000-8000-0000000007b1", tenant_id: "00000000-0000-4000-8000-0000000007a1", full_name: "ZZ_W07 Uzman",
    email: "zz.w07@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { reflexology: true }, is_demo_account: demo,
  };
  await ctx.addInitScript(([u, t]) => {
    if (!sessionStorage.getItem("zz-w07-seeded")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
      sessionStorage.setItem("zz-w07-seeded", "1");
    }
  }, [JSON.stringify(user), TOKEN_A]);
  await ctx.route(`${APP}/api/**`, handleApi);
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}

const cards = (page: Page) => page.locator("article");
const dlg = (page: Page) => page.getByRole("alertdialog");
const wordSel = (page: Page) => page.getByRole("button", { name: /^Seçilenleri Word/ });
const wordAll = (page: Page) => page.getByRole("button", { name: /^Tümünü Word \(\d+\)/ });
const delSel = (page: Page) => page.getByRole("button", { name: /^Seçilenleri Sil/ });
const delAll = (page: Page) => page.getByRole("button", { name: /^Tümünü Sil \(\d+\)/ });
const box = (page: Page, organ: string) => page.getByRole("checkbox", { name: `${organ} kaydını seç` });
async function waitFor(fn: () => Promise<boolean>, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const reports = () => be.calls.filter((c) => c.kind === "report");
const toastText = async (page: Page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

async function runDevice(browser: Browser, d: Device) {
  section(d.name);
  be.reset();
  const bBefore = JSON.stringify(be.rows.get(TOKEN_B));
  const ctx = await newContext(browser, d);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${APP}/refleksoloji/kayitli-atlas`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(async () => (await cards(page).count()) === 4, 30000), `${d.name}: 4 kayıt kartı`, await cards(page).count());
  ok(await wordSel(page).isDisabled() && await wordAll(page).isEnabled() && (await wordAll(page).innerText()).includes("(4)"), `${d.name}: Seçilenleri Word pasif, Tümünü Word (4) etkin`);
  ok(await delSel(page).isDisabled() && await delAll(page).isEnabled() && await box(page, "ZZ Kalp").isVisible(), `${d.name}: W06 seçim kutusu + Seçilenleri Sil / Tümünü Sil yerinde`);
  ok(await noHScroll(page), `${d.name}: yatay taşma yok`);
  await page.screenshot({ path: path.join(OUT, `toolbar-${d.viewport.width}.png`), fullPage: false });

  // ── Tümünü Word ──
  let dl = page.waitForEvent("download", { timeout: 15000 });
  await wordAll(page).click();
  let file = await dl.then((x) => x.suggestedFilename()).catch(() => "");
  let rep = reports().at(-1);
  ok(/^refleksoloji-atlas-tumu-\d{4}-\d{2}-\d{2}\.docx$/.test(file), `${d.name}: Tümünü Word dosyası indirildi`, file);
  ok(!!rep && rep.token === TOKEN_A && JSON.stringify(rep.body) === JSON.stringify({ exportMode: "all" }), `${d.name}: istek gövdesi yalnız {exportMode:"all"} (tenant/kullanıcı gövdede yok), oturum başlığı var`, rep);
  ok(await waitFor(async () => /Atlas raporu indirildi/.test(await toastText(page))), `${d.name}: başarı bildirimi`);

  // ── Seçilenleri Word ──
  await box(page, "ZZ Kalp").check();
  await box(page, "ZZ Tiroid").check();
  ok(await wordSel(page).isEnabled() && (await wordSel(page).innerText()).includes("(2)"), `${d.name}: Seçilenleri Word (2) etkin`);
  dl = page.waitForEvent("download", { timeout: 15000 });
  await wordSel(page).click();
  file = await dl.then((x) => x.suggestedFilename()).catch(() => "");
  rep = reports().at(-1);
  ok(/^refleksoloji-atlas-secili-/.test(file), `${d.name}: Seçilenleri Word dosyası indirildi`, file);
  ok(!!rep && rep.body.exportMode === "selected" && JSON.stringify([...(rep.body.organs as string[])].sort()) === JSON.stringify(["ZZ Kalp", "ZZ Tiroid"]), `${d.name}: gövde yalnız seçilen kayıt adları`, rep?.body);
  ok(/2 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: Word sonrası seçim korunur (2 seçili)`);

  // ── Kaydedilmemiş yerel değişiklik Word'den ÖNCE sunucuya gider ──
  await cards(page).filter({ hasText: "ZZ Mide" }).getByRole("button", { name: "Sil", exact: true }).click();
  await dlg(page).waitFor({ state: "visible" }); await page.waitForTimeout(500);
  await dlg(page).getByRole("button", { name: /^Sil$/ }).click();
  ok(await waitFor(async () => (await cards(page).count()) === 3), `${d.name}: tekli silme çalıştı (3 kart)`);
  dl = page.waitForEvent("download", { timeout: 15000 });
  await wordAll(page).click();
  await dl.catch(() => null);
  const lastReport = reports().at(-1)!;
  const putBefore = be.calls.filter((c) => c.kind === "put" && c.at < lastReport.at);
  const lastPut = putBefore.at(-1);
  ok(!!lastPut && !Object.keys(lastPut.body.document as R).includes("ZZ Mide"), `${d.name}: silme Word isteğinden ÖNCE sunucuya gönderildi`, { puts: putBefore.length });

  // ── Sunucu hatası: ekran çalışmaya devam eder ──
  be.reportStatus = 413;
  const before413 = reports().length;
  await wordAll(page).click();
  ok(await waitFor(async () => /4,4 MB/.test(await toastText(page))), `${d.name}: 413 → anlaşılır hata bildirimi`);
  ok(reports().length === before413 + 1 && (await cards(page).count()) === 3 && await wordAll(page).isEnabled() && await delAll(page).isEnabled(), `${d.name}: hata sonrası liste ve düğmeler çalışıyor`);
  be.reportStatus = 200;

  // ── W06 regresyonu: Seçilenleri Sil → Vazgeç ──
  const putsBefore = be.calls.filter((c) => c.kind === "put").length;
  await delSel(page).click();
  await dlg(page).waitFor({ state: "visible" }); await page.waitForTimeout(500);
  ok(/2 atlas kaydı/.test((await dlg(page).innerText()).replace(/\s+/g, " ")), `${d.name}: W06 onayı sayı gösterir`);
  await dlg(page).getByRole("button", { name: /^Vazgeç$/ }).click();
  await page.waitForTimeout(1200);
  ok(be.calls.filter((c) => c.kind === "put").length === putsBefore && (await cards(page).count()) === 3, `${d.name}: W06 Vazgeç → silme yok`);

  ok(JSON.stringify(be.rows.get(TOKEN_B)) === bBefore && be.calls.every((c) => c.token === TOKEN_A), `${d.name}: B uzmanının verisine dokunulmadı`);
  ok(await noHScroll(page), `${d.name}: işlem sonunda yatay taşma yok`);
  ok(errors.length === 0, `${d.name}: sayfa hatası yok`, errors);
  await ctx.close();

  // ── Demo hesap: Word düğmeleri gizli ──
  const dctx = await newContext(browser, d, true);
  const dp = await dctx.newPage();
  await dp.goto(`${APP}/refleksoloji/kayitli-atlas`, { waitUntil: "domcontentloaded" });
  await waitFor(async () => (await dp.getByRole("toolbar").count()) > 0 || (await dp.getByText("Henüz kayıtlı organ yok.").count()) > 0, 20000);
  ok((await wordAll(dp).count()) === 0 && (await wordSel(dp).count()) === 0, `${d.name}: demo hesapta Word düğmeleri gizli`);
  await dctx.close();
}

async function main() {
  const server: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "production" },
  });
  server.stderr?.on("data", (d) => process.stderr.write(`[next] ${d}`));
  let browser: Browser | null = null;
  try {
    await waitHttp(`${APP}/`, 90000);
    browser = await chromium.launch();
    await runDevice(browser, DESKTOP);
    await runDevice(browser, MOBILE);
  } catch (e) {
    fail++;
    console.error("HARNESS HATASI:", e);
  } finally {
    await browser?.close().catch(() => {});
    server.kill();
    if (process.platform === "win32" && server.pid) spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"]);
  }
  console.log(`Ekran görüntüleri: ${OUT}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
