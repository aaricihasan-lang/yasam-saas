/**
 * W06 — Refleksoloji / Kayıtlı Atlas TOPLU SİLME — gerçek tarayıcı UI harness (PRODUCTION'A SIFIR TEMAS).
 *
 * Yerel `next start` + Playwright; `/api/**` istekleri bellek-içi SENTETİK arka uçla karşılanır.
 * Arka uç tenant'ı oturum token'ından çözer (iki uzman: A ve B); yalnız A oturum açar.
 * Masaüstü (1366) ve mobil (390) için:
 *   - kartlarda seçim kutusu; "Seçilenleri Sil" seçim yokken pasif; "Tümünü Sil (N)",
 *   - 2 kayıt: tek onay (Vazgeç → PUT yok), onay → yalnız seçilen 2 organ silinir,
 *   - 3 kayıt: 3 aşamalı onay (aşama 3'te Vazgeç → silme yok), yanlış/doğru ifade, silme,
 *   - arama + "Görünenleri seç" yalnız görünenleri seçer,
 *   - tekli Sil mevcut metinle çalışır; Görüntüle modalı açılır,
 *   - Tümünü Sil: 3 aşama + "TÜMÜNÜ SİL" → boş durum; sunucuya allow_empty PUT,
 *   - B uzmanının sunucu verisi hiç değişmez; yatay taşma yok.
 *
 * Ön koşul (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54599 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-w06-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-w06-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/reflexology-atlas-bulk-delete-ui-harness.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "reflexology-bulk-delete-ui");
const PORT = 3993;
const APP = `http://127.0.0.1:${PORT}`;
const TENANT_A = "00000000-0000-4000-8000-0000000006a1";
const USER_A = "00000000-0000-4000-8000-0000000006b1";
const TOKEN_A = "zz-w06-session-a-not-a-secret";
const TOKEN_B = "zz-w06-session-b-not-a-secret";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

// ─── Sentetik arka uç (kurgusal veri) ────────────────────────────────────────
type R = Record<string, unknown>;
const reg = (id: string, i: number): R => ({ id, shape: "oval", cx: 0.2 + (i % 5) * 0.1, cy: 0.3, rx: 0.04, ry: 0.04, angle: 0, color: "rgba(1,2,3,0.2)" });
function entry(prefix: string, n: number) {
  const e = { taban: { sol: [] as R[], sag: [] as R[] }, yan_ic: { sol: [], sag: [] }, yan_dis: { sol: [], sag: [] } };
  for (let i = 0; i < n; i += 1) e.taban[i % 2 ? "sag" : "sol"].push(reg(`${prefix}-${i}`, i));
  return e;
}
const A_ORGANS = ["ZZ Böbrek", "ZZ Dalak", "ZZ Kalp", "ZZ Karaciğer", "ZZ Mesane", "ZZ Mide", "ZZ Pankreas", "ZZ Tiroid", "ZZ Akciğer"];
type Row = { updated_at: string; document: R; organ_list: string[] };
class Backend {
  rows = new Map<string, Row>();
  puts: { token: string; allowEmpty: boolean; organs: string[]; tombstones: string[] }[] = [];
  unknown = new Set<string>();
  clock = 0;
  tick() { return new Date(Date.UTC(2026, 9, 29, 9, 0, 0) + (this.clock += 1000)).toISOString(); }
  reset() {
    const docA: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} } };
    A_ORGANS.forEach((o, i) => { docA[o] = entry(`a${i}`, 2); });
    const docB: R = { _meta: { version: "1", updated_at: "2026-10-29T08:00:00.000Z", tombstones: {}, organUpdatedAt: {} } };
    ["ZZ Böbrek", "ZZ Kalp", "ZZ Mide"].forEach((o, i) => { docB[o] = entry(`b${i}`, 1); });
    this.rows = new Map([
      [TOKEN_A, { updated_at: this.tick(), document: docA, organ_list: [...A_ORGANS] }],
      [TOKEN_B, { updated_at: this.tick(), document: docB, organ_list: ["ZZ Böbrek", "ZZ Kalp", "ZZ Mide"] }],
    ]);
    this.puts = [];
  }
}
const be = new Backend();
const organsOf = (doc: R) => Object.keys(doc).filter((k) => k !== "_meta").sort((a, b) => a.localeCompare(b, "tr"));

async function handleApi(route: Route) {
  const req = route.request();
  const url = new URL(req.url());
  const p = url.pathname;
  const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const headers = req.headers();
  const token = Object.values(headers).find((v) => v === TOKEN_A || v === TOKEN_B || v.includes(TOKEN_A) || v.includes(TOKEN_B));
  const tok = token?.includes(TOKEN_B) ? TOKEN_B : token?.includes(TOKEN_A) ? TOKEN_A : null;

  if (p === "/api/refleksoloji/atlas") {
    if (!tok) return json({ ok: false }, 401);
    const row = be.rows.get(tok)!;
    if (req.method() === "GET") return json({ ok: true, document: row.document, organ_list: row.organ_list, updated_at: row.updated_at });
    const body = req.postDataJSON() as { document: R; organ_list: string[]; expected_updated_at?: string; allow_empty?: boolean };
    if (body.expected_updated_at !== row.updated_at) return json({ ok: false, conflict: true }, 409);
    const tomb = Object.keys(((body.document._meta as R | undefined)?.tombstones as R | undefined) ?? {});
    be.puts.push({ token: tok, allowEmpty: body.allow_empty === true, organs: organsOf(body.document), tombstones: tomb });
    const updated_at = be.tick();
    be.rows.set(tok, { updated_at, document: body.document, organ_list: body.organ_list });
    return json({ ok: true, updated_at });
  }
  if (p === "/api/refleksoloji/protocols/organ") {
    const name = url.searchParams.get("name") ?? "";
    return json({ ok: true, count: name === "ZZ Kalp" ? 2 : 0, titles: name === "ZZ Kalp" ? ["ZZ Protokol 1", "ZZ Protokol 2"] : [] });
  }
  be.unknown.add(`${req.method()} ${p}`);
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

async function newContext(browser: Browser, d: Device): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul",
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: USER_A, tenant_id: TENANT_A, full_name: "ZZ_W06 Uzman", email: "zz.w06@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { reflexology: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, t]) => {
    if (!sessionStorage.getItem("zz-w06-seeded")) {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
      sessionStorage.setItem("zz-w06-seeded", "1");
    }
  }, [JSON.stringify(user), TOKEN_A]);
  await ctx.route(`${APP}/api/**`, handleApi);
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  return ctx;
}

const cards = (page: Page) => page.locator("article");
const dlg = (page: Page) => page.getByRole("alertdialog");
const bulkBtn = (page: Page) => page.getByRole("button", { name: /^Seçilenleri Sil/ });
const allBtn = (page: Page) => page.getByRole("button", { name: /^Tümünü Sil \(\d+\)/ });
const cardBox = (page: Page, organ: string) => page.getByRole("checkbox", { name: `${organ} kaydını seç` });

async function waitFor(fn: () => Promise<boolean>, ms = 8000) {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}
async function dialogText(page: Page) {
  await dlg(page).waitFor({ state: "visible", timeout: 5000 });
  await page.waitForTimeout(500); // ConfirmProvider tık kalkanı (450ms)
  return (await dlg(page).innerText()).replace(/\s+/g, " ");
}
async function clickDialog(page: Page, name: RegExp) {
  await dlg(page).getByRole("button", { name }).click();
  await page.waitForTimeout(300);
}
async function noHScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}
const lastPutA = () => [...be.puts].reverse().find((x) => x.token === TOKEN_A);

async function runDevice(browser: Browser, d: Device) {
  section(d.name);
  be.reset();
  const bBefore = JSON.stringify(be.rows.get(TOKEN_B));
  const ctx = await newContext(browser, d);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${APP}/refleksoloji/kayitli-atlas`, { waitUntil: "domcontentloaded" });
  ok(await waitFor(async () => (await cards(page).count()) === 9, 30000), `${d.name}: 9 kayıt kartı yüklendi`, await cards(page).count());
  ok(await cardBox(page, "ZZ Kalp").isVisible(), `${d.name}: kartlarda seçim kutusu var`);
  ok(await bulkBtn(page).isDisabled(), `${d.name}: seçim yokken "Seçilenleri Sil" pasif`);
  ok((await allBtn(page).innerText()).includes("(9)"), `${d.name}: "Tümünü Sil (9)" sayısı doğru`);
  ok(await noHScroll(page), `${d.name}: yatay taşma yok`);
  await page.screenshot({ path: path.join(OUT, `liste-${d.viewport.width}.png`), fullPage: false });

  // ── 2 kayıt: tek onay ──
  await cardBox(page, "ZZ Kalp").check();
  await cardBox(page, "ZZ Mide").check();
  ok(/2 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: "2 seçili" gösterilir`);
  ok(await bulkBtn(page).isEnabled() && (await bulkBtn(page).innerText()).includes("(2)"), `${d.name}: "Seçilenleri Sil (2)" etkin`);
  await page.screenshot({ path: path.join(OUT, `secim-${d.viewport.width}.png`), fullPage: false });
  const putsBefore = be.puts.length;
  await bulkBtn(page).click();
  let t = await dialogText(page);
  ok(/2 atlas kaydı/.test(t) && /ZZ Kalp/.test(t) && /ZZ Mide/.test(t) && /protokollerde kullanılıyor/.test(t), `${d.name}: 2 kayıt onayı sayı + adlar + protokol uyarısı`, t.slice(0, 200));
  ok(!/Adım 1\/3/.test(t), `${d.name}: 2 kayıtta 3 aşama YOK (tek onay)`);
  await page.screenshot({ path: path.join(OUT, `onay-2-${d.viewport.width}.png`), fullPage: false });
  await clickDialog(page, /^Vazgeç$/);
  await page.waitForTimeout(1200);
  ok(be.puts.length === putsBefore && (await cards(page).count()) === 9, `${d.name}: Vazgeç → silme/PUT yok`);
  await bulkBtn(page).click();
  await dialogText(page);
  await clickDialog(page, /^Sil \(2\)$/);
  ok(await waitFor(async () => (await cards(page).count()) === 7), `${d.name}: 2 kayıt silindi (7 kaldı)`);
  ok(await bulkBtn(page).isDisabled() && /0 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: işlem sonrası seçim temizlendi`);
  ok(await waitFor(async () => { const p = lastPutA(); return !!p && p.organs.length === 7; }), `${d.name}: sunucuya PUT gitti`);
  const p1 = lastPutA();
  ok(!!p1 && !p1.organs.includes("ZZ Kalp") && !p1.organs.includes("ZZ Mide") && p1.organs.includes("ZZ Böbrek") && p1.tombstones.length === 2, `${d.name}: PUT yalnız seçilen 2 organı mezar taşıyla düşürdü`, p1);

  // ── 3 kayıt: 3 aşama ──
  for (const o of ["ZZ Dalak", "ZZ Karaciğer", "ZZ Tiroid"]) await cardBox(page, o).check();
  await bulkBtn(page).click();
  t = await dialogText(page);
  ok(/Adım 1\/3/.test(t) && /3 atlas kaydı kalıcı olarak silinecek/.test(t), `${d.name}: 3 kayıt → Adım 1/3 + sayı`, t.slice(0, 160));
  await page.screenshot({ path: path.join(OUT, `onay-3-asama1-${d.viewport.width}.png`), fullPage: false });
  await clickDialog(page, /^Devam Et$/);
  t = await dialogText(page);
  ok(/Adım 2\/3/.test(t), `${d.name}: Adım 2/3 (yazarak doğrulama)`);
  const input = dlg(page).locator('input[type="text"]');
  await input.fill("2 KAYDI SİL");
  ok(await dlg(page).getByRole("button", { name: /^Devam Et$/ }).isDisabled(), `${d.name}: yanlış ifadede ilerlenemez`);
  await input.fill("3 kaydi sil");
  await clickDialog(page, /^Devam Et$/);
  t = await dialogText(page);
  ok(/Son Onay/.test(t), `${d.name}: Adım 3 son onay`);
  await clickDialog(page, /^Vazgeç$/);
  await page.waitForTimeout(1000);
  ok((await cards(page).count()) === 7 && /3 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: aşama 3'te Vazgeç → silme yok, seçim korunur`);
  await bulkBtn(page).click();
  await dialogText(page); await clickDialog(page, /^Devam Et$/);
  await dialogText(page); await dlg(page).locator('input[type="text"]').fill("3 KAYDI SİL"); await clickDialog(page, /^Devam Et$/);
  await dialogText(page); await clickDialog(page, /^Kalıcı Olarak Sil \(3\)$/);
  ok(await waitFor(async () => (await cards(page).count()) === 4), `${d.name}: 3 kayıt silindi (4 kaldı)`);

  // ── arama + görünenleri seç ──
  await page.getByPlaceholder("Organ adına göre ara…").fill("pankreas");
  ok(await waitFor(async () => (await cards(page).count()) === 1), `${d.name}: arama 1 kart`);
  await page.getByRole("checkbox", { name: "Görünen kayıtların tümünü seç" }).check();
  ok(/1 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: "Görünenleri seç" yalnız görüneni seçti`);
  await page.getByPlaceholder("Organ adına göre ara…").fill("");
  ok(await waitFor(async () => (await cards(page).count()) === 4), `${d.name}: arama temizlendi`);
  ok(/1 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: seçim aramadan sonra korunur (1)`);
  await page.getByRole("button", { name: "Seçimi temizle" }).click();
  ok(/0 seçili/.test(await page.getByRole("toolbar").innerText()), `${d.name}: "Seçimi temizle" çalışır`);

  // ── Görüntüle + tekli Sil (mevcut davranış) ──
  await cards(page).filter({ hasText: "ZZ Böbrek" }).getByRole("button", { name: "Görüntüle" }).click();
  ok(await waitFor(async () => (await page.getByText("ZZ Böbrek").count()) > 1), `${d.name}: Görüntüle modalı açıldı`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await cards(page).filter({ hasText: "ZZ Akciğer" }).getByRole("button", { name: "Sil", exact: true }).click();
  t = await dialogText(page);
  ok(/Bu organ ve kayıtlı tüm atlas bölgeleri silinsin mi\?/.test(t), `${d.name}: tekli Sil mevcut onay metni`);
  await clickDialog(page, /^Sil$/);
  ok(await waitFor(async () => (await cards(page).count()) === 3), `${d.name}: tekli silme çalıştı (3 kaldı)`);

  // ── Tümünü Sil ──
  await allBtn(page).click();
  t = await dialogText(page);
  ok(/Tümünü Sil — Adım 1\/3/.test(t) && /TÜM 3 atlas kaydı/.test(t) && /arama filtresinden bağımsız/.test(t), `${d.name}: Tümünü Sil Adım 1/3 kapsam + sayı`, t.slice(0, 200));
  await page.screenshot({ path: path.join(OUT, `tumunu-sil-${d.viewport.width}.png`), fullPage: false });
  await clickDialog(page, /^Devam Et$/);
  await dialogText(page); await dlg(page).locator('input[type="text"]').fill("tümünü sil"); await clickDialog(page, /^Devam Et$/);
  await dialogText(page); await clickDialog(page, /^Kalıcı Olarak Sil \(3\)$/);
  ok(await waitFor(async () => (await page.getByText("Henüz kayıtlı organ yok.").count()) > 0), `${d.name}: Tümünü Sil → boş durum`);
  ok(await waitFor(async () => { const p = lastPutA(); return !!p && p.organs.length === 0; }), `${d.name}: sunucuya boş belge PUT`);
  const p2 = lastPutA();
  ok(!!p2 && p2.allowEmpty && p2.tombstones.length === 9, `${d.name}: allow_empty + 9 mezar taşı`, p2);
  ok(JSON.stringify(be.rows.get(TOKEN_B)) === bBefore && be.puts.every((x) => x.token === TOKEN_A), `${d.name}: B uzmanının verisine hiç yazılmadı`);
  ok(await noHScroll(page), `${d.name}: işlem sonunda yatay taşma yok`);
  ok(errors.length === 0, `${d.name}: sayfa hatası yok`, errors);
  await page.screenshot({ path: path.join(OUT, `bos-${d.viewport.width}.png`), fullPage: false });
  await ctx.close();
}

async function main() {
  const server: ChildProcess = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
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
  console.log(`\nBilinmeyen API (sentetik {ok:true}): ${[...be.unknown].join(", ") || "—"}`);
  console.log(`Ekran görüntüleri: ${OUT}`);
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
