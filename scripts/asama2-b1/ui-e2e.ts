/**
 * AŞAMA 2 / B1 — BESLENME gerçek tarayıcı E2E (Playwright chromium; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: uygulama NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 ile build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy-anon \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy-service npx next build
 * Çalıştır: npx tsx scripts/asama2-b1/ui-e2e.ts [--out <ekran-görüntüsü-klasörü>]
 *
 * Yığın: gerçek nutrition migration zinciri (embedded-postgres :54651) + embed shim; :54331'de küçük
 * vekil (/storage → anamnez ortamı, diğer her şey → embed shim). `next start` :3988.
 * Kapsam: BUG-002 (virgüllü kilo), BUG-004 (anlaşılır hata, ham kod yok), BS-005 (tarihler),
 * BES-03 (silinmiş ölçüm UI), BES-01 (iki sekme → 409 + "Güncel veriyi yükle"), BUG-017 (320–1024 px +
 * masaüstü yatay taşma yok; Besin Ekle aç/kapat sonrası main kaydırılamaz).
 */
import Module from "node:module";
import http from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

pg.types.setTypeParser(1184, (v: string) => v);
pg.types.setTypeParser(1114, (v: string) => v);
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "asama2-b1-ui");
mkdirSync(OUT, { recursive: true });
const APP = "http://127.0.0.1:3988";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: unknown, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

function proxy(restUrl: string, storageUrl: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const base = (req.url ?? "").startsWith("/storage/") ? storageUrl : restUrl;
    const target = new URL(req.url ?? "/", base);
    const up = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  return new Promise((r) => server.listen(54331, "127.0.0.1", () => r(server)));
}

async function noHScroll(page: Page): Promise<{ ok: boolean; sw: number; iw: number }> {
  return page.evaluate(() => ({ ok: document.documentElement.scrollWidth <= window.innerWidth + 1, sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
}

async function main() {
  const { startBesDb } = await import("../dogal-destek-p2/beslenme/env");
  const { startEmbedShim } = await import("../dogal-destek-p2/beslenme/pgrestEmbedShim");
  const db = await startBesDb({ port: 54651, dirName: "asama2-b1-ui-pgdata", includeNewMigration: true });
  const shim = await startEmbedShim(db.pool);
  const px = await proxy(shim.url, db.env.url);
  const S = db.seed;
  const q = async (sql: string, args: unknown[] = []) => (await db.env.su.query(sql, args)).rows;
  const q1 = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];

  // Sentetik plan (danışan a1e bağlı) gerçek API ile aşağıda oluşturulur.
  const { SERVICE_KEY } = await import("../anamnez/testEnv");
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3988", "-H", "127.0.0.1"], {
      cwd: process.cwd(),
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);

    const api = async (method: string, p: string, body?: unknown) => {
      const r = await fetch(`${APP}${p}`, {
        method,
        headers: { "content-type": "application/json", "x-user-id": S.users.A.id, "x-session-token": S.users.A.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    };
    const created = await api("POST", `/api/beslenme/clients/${S.clients.a1}/plans`, { title: "ZZ E2E Planı", start_date: "2026-10-25", end_date: "2026-10-31" });
    const planId = (created.json.plan as { id?: string } | undefined)?.id as string;
    ok(created.status === 201 && !!planId, "fixture: danışana bağlı plan (gerçek API)", created);

    browser = await chromium.launch();
    const newCtx = async (viewport: { width: number; height: number }, mobile = false): Promise<BrowserContext> => {
      const ctx = await browser!.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const user = {
        id: S.users.A.id, tenant_id: S.TA, full_name: "ZZ_DDP2_A", email: "zz.ddp2.a@example.test", role: "expert",
        active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true, beslenme: true },
        is_demo_account: false,
      };
      await ctx.addInitScript(([u, tok]) => {
        localStorage.setItem("yasam_user", u as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(user), S.users.A.token]);
      return ctx;
    };

    // ── Masaüstü: Beslenme sekmesi ──────────────────────────────────────────
    console.log("\n[Masaüstü 1366×900 — danışan Beslenme sekmesi]");
    const ctx = await newCtx({ width: 1366, height: 900 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${APP}/dashboard/clients/${S.clients.a1}?tab=beslenme`);
    const panel = page.locator("#tabpanel-beslenme");
    await panel.getByText("Son Ölçümler").waitFor({ timeout: 90_000 });
    ok(true, "Beslenme sekmesi açıldı");
    await shot(page, "01-desktop-beslenme");

    // BS-005: plan aralığı yerel biçim
    const plansText = await panel.innerText();
    ok(plansText.includes("25.10.2026 → 31.10.2026") && !/2026-10-25/.test(plansText), "BS-005: plan aralığı 25.10.2026 → 31.10.2026 (ham ISO yok)");

    // BUG-002: virgüllü kilo
    const inp = (ph: string) => panel.getByPlaceholder(ph, { exact: true });
    // Ölçüm formu satırı (Kilo* alanının kapsayıcısı) — tercihlerdeki ikinci "Ekle" ile karışmaz.
    const measAdd = () => inp("Kilo*").locator("xpath=..").getByRole("button", { name: "Ekle", exact: true });
    await inp("Kilo*").fill("65,5");
    await inp("Boy").fill("170,2");
    await inp("Bel").fill("82,5");
    await measAdd().click();
    await page.getByText("Ölçüm eklendi.").waitFor({ timeout: 15_000 });
    const mrow = await q1(`select weight_kg::text w, height_cm::text h, waist_cm::text b, measured_at from nutrition_client_measurements where client_id=$1 order by created_at desc limit 1`, [S.clients.a1]);
    ok(mrow && Number(mrow.w) === 65.5 && Number(mrow.h) === 170.2 && Number(mrow.b) === 82.5, "BUG-002: '65,5' / '170,2' / '82,5' → DB 65.5 / 170.2 / 82.5 (yuvarlama yok)", mrow);
    await panel.locator("table").first().getByText(/65[.,]5 kg/).waitFor({ timeout: 15_000 });
    const tableTxt = await panel.locator("table").first().innerText();
    ok(/\d{2}\.\d{2}\.\d{4}/.test(tableTxt) && !/T\d{2}:\d{2}|Z\b/.test(tableTxt), "BS-005: ölçüm tarihi GG.AA.YYYY", tableTxt.slice(0, 120));

    // BUG-004: geçersiz / boş girişte anlaşılır Türkçe metin, ham kod yok
    await inp("Kilo*").fill("abc");
    await measAdd().click();
    await page.getByText(/Kilo geçerli bir sayı olmalı/).waitFor({ timeout: 5_000 });
    ok(true, "BUG-002/004: 'abc' → 'Kilo geçerli bir sayı olmalı (örn. 65,5)…'");
    await inp("Kilo*").fill("");
    await measAdd().click();
    await page.getByText("Kilo bilgisi gerekli. Lütfen geçerli bir kilo değeri girin.").waitFor({ timeout: 5_000 });
    ok(true, "BUG-004: boş kilo → 'Kilo bilgisi gerekli. Lütfen geçerli bir kilo değeri girin.'");
    await inp("Kilo*").fill("70");
    await inp("Kalça").fill("999");
    await measAdd().click();
    await page.getByText(/Kalça çevresi geçerli bir sayı olmalı/).waitFor({ timeout: 5_000 });
    ok(true, "aralık dışı kalça → alan bazlı açıklama (ölçüm eklenmedi)");
    const bodyTxt = await page.locator("body").innerText();
    ok(!/WEIGHT_REQUIRED|BAD_[A-Z_]+_CM|MEASUREMENT_[A-Z_]+/.test(bodyTxt), "ekranda ham API kodu YOK");
    await shot(page, "02-desktop-validation");

    // BES-03 UI: başka sekmede silinmiş ölçümü silmeye çalış → 404 + anlaşılır metin + liste yenilenir
    await q(`delete from nutrition_client_measurements where client_id=$1`, [S.clients.a1]);
    await panel.getByRole("button", { name: "Sil", exact: true }).first().click();
    const dlg = page.getByRole("alertdialog");
    await dlg.waitFor({ timeout: 5_000 });
    await dlg.getByRole("button", { name: "Evet", exact: true }).click();
    await page.getByText(/Ölçüm bulunamadı; daha önce silinmiş olabilir/).waitFor({ timeout: 10_000 });
    ok(!(await page.getByText("Ölçüm silindi.").isVisible().catch(() => false)), "BES-03: silinmiş ölçüm → 'silindi' DEĞİL, 'bulunamadı' bildirimi");
    await panel.getByText("Ölçüm yok.").waitFor({ timeout: 10_000 });
    ok(true, "BES-03: liste güncel duruma yenilendi");
    await shot(page, "03-desktop-measurement-404");

    // ── BES-01: iki sekme ───────────────────────────────────────────────────
    console.log("\n[BES-01 iki sekme — plan Düzenle]");
    const p1 = await ctx.newPage();
    p1.on("pageerror", (e) => pageErrors.push(e.message));
    await p1.goto(`${APP}/beslenme/planlar/${planId}`);
    await p1.getByRole("button", { name: "Düzenle" }).waitFor({ timeout: 90_000 });
    await p1.getByRole("button", { name: "Düzenle" }).click();
    const md = p1.getByRole("dialog");
    await md.waitFor();
    // "Diğer sekme" (gerçek API, aynı kullanıcı) planı önce kaydeder.
    const cur = await api("GET", `/api/beslenme/plans/${planId}`);
    const v = (cur.json.plan as { updated_at: string }).updated_at;
    const other = await api("PATCH", `/api/beslenme/plans/${planId}`, { title: "Diğer Sekme Başlığı", expectedUpdatedAt: v });
    ok(other.status === 200, "diğer sekme kaydetti (200)");
    await md.locator("input").first().fill("Eski Sekme Başlığı");
    await md.getByRole("button", { name: /Kaydet/ }).click();
    await p1.getByText(/başka bir sekmede veya cihazda güncellendi/).waitFor({ timeout: 10_000 });
    ok(true, "BES-01: eski sekme → anlaşılır 409 uyarısı (sessiz başarı yok)");
    ok((await q1(`select title from nutrition_plans where id=$1`, [planId])).title === "Diğer Sekme Başlığı", "BES-01: diğer sekmenin verisi EZİLMEDİ");
    await shot(p1, "04-bes01-stale-dialog");
    await p1.getByTestId("plan-meta-reload").click();
    await p1.waitForFunction(() => (document.querySelector('[role="dialog"] input') as HTMLInputElement | null)?.value === "Diğer Sekme Başlığı", null, { timeout: 10_000 });
    ok(true, "BES-01: 'Güncel veriyi yükle' → form güncel sürümle yeniden kuruldu");
    await md.locator("input").first().fill("Güncel Sürümden Kayıt");
    await md.getByRole("button", { name: /Kaydet/ }).click();
    await md.waitFor({ state: "detached", timeout: 10_000 });
    ok((await q1(`select title from nutrition_plans where id=$1`, [planId])).title === "Güncel Sürümden Kayıt", "BES-01: güncel veriyle tekrar kaydetme başarılı");
    await p1.close();

    // ── BUG-017: genişlikler ────────────────────────────────────────────────
    console.log("\n[BUG-017 yatay taşma — 320/375/390/430/768/1024/1366]");
    for (const w of [320, 375, 390, 430, 768, 1024, 1366]) {
      const mobile = w < 768;
      const c = await newCtx({ width: w, height: mobile ? 800 : 900 }, mobile);
      const pg2 = await c.newPage();
      pg2.on("pageerror", (e) => pageErrors.push(e.message));
      await pg2.goto(`${APP}/beslenme/planlar/${planId}`);
      await pg2.getByRole("button", { name: "Düzenle" }).waitFor({ timeout: 90_000 });
      await pg2.waitForTimeout(800);
      const h1 = await noHScroll(pg2);
      // Besin Ekle diyaloğu aç/kapat (kayma senaryosu) — öğün yoksa boş gün; dialog yoksa diyaloğu Düzenle ile sına.
      const addBtn = pg2.getByRole("button", { name: /Besin Ekle/ }).first();
      if (await addBtn.isVisible().catch(() => false)) {
        await addBtn.click();
        await pg2.getByRole("dialog").waitFor();
        await pg2.keyboard.press("Escape");
      } else {
        await pg2.getByRole("button", { name: "Düzenle" }).click();
        await pg2.getByRole("dialog").waitFor();
        await pg2.getByRole("dialog").locator("input").last().focus();
        await pg2.keyboard.press("Escape");
      }
      await pg2.waitForTimeout(300);
      const mainState = await pg2.evaluate(() => {
        const m = document.querySelector("main");
        if (!m) return null;
        m.scrollLeft = 96; // eski kusur: overflow-hidden main programatik kaydırılabiliyordu
        return { left: m.scrollLeft, ox: getComputedStyle(m).overflowX };
      });
      const h2 = await noHScroll(pg2);
      const btn = await pg2.getByRole("button", { name: "Düzenle" }).boundingBox();
      // Başlık kartındaki TÜM eylemler kartın içinde ve başlık metniyle çakışmıyor (eski kusur: kesilme/örtüşme).
      const hdr = await pg2.evaluate(() => {
        const h = document.querySelector("main header");
        const t = h?.querySelector("h1");
        if (!h || !t) return null;
        const hb = h.getBoundingClientRect();
        const tb = t.getBoundingClientRect();
        const btns = Array.from(h.querySelectorAll("button, a")).map((b) => b.getBoundingClientRect());
        const inside = btns.every((b) => b.left >= hb.left - 1 && b.right <= hb.right + 1);
        const overlap = btns.some((b) => !(b.right <= tb.left || b.left >= tb.right || b.bottom <= tb.top || b.top >= tb.bottom));
        return { n: btns.length, inside, overlap, titleW: Math.round(tb.width) };
      });
      ok(!!hdr && hdr.n >= 8 && hdr.inside && !hdr.overlap && hdr.titleW >= 120, `${w}px plan başlığı: ${hdr?.n} eylem kart içinde, başlıkla çakışma yok`, hdr);
      ok(h1.ok && h2.ok && mainState?.left === 0 && (btn ? btn.x >= 0 && btn.x + btn.width <= w + 1 : false),
        `${w}px plan sayfası: yatay taşma yok, diyalog sonrası kayma yok, butonlar görünür`, { h1, h2, mainState, btn });
      await shot(pg2, `05-plan-${w}`);

      await pg2.goto(`${APP}/dashboard/clients/${S.clients.a1}?tab=beslenme`);
      await pg2.locator("#tabpanel-beslenme").getByText("Son Ölçümler").waitFor({ timeout: 90_000 });
      await pg2.waitForTimeout(500);
      const h3 = await noHScroll(pg2);
      const add = await pg2.locator("#tabpanel-beslenme").getByPlaceholder("Kilo*", { exact: true }).locator("xpath=..").getByRole("button", { name: "Ekle", exact: true }).boundingBox();
      ok(h3.ok && !!add && add.x >= 0 && add.x + add.width <= w + 1, `${w}px danışan Beslenme sekmesi: taşma yok, 'Ekle' görünür`, { h3, add });
      await shot(pg2, `06-client-beslenme-${w}`, true);
      await c.close();
    }
    ok(pageErrors.length === 0, "sayfa JS hatası yok", pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { process.kill(app.pid); } catch { /* kapalı */ } }
    await new Promise<void>((r) => px.close(() => r()));
    await shim.close().catch(() => undefined);
    await db.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / B1 UI E2E: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
