/**
 * REFLEKSOLOJİ FINAL — Danışan Haritası GERÇEK TARAYICI E2E (PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: uygulama yerel shim'e karşı build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy-anon \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy-service npx next build
 * Çalıştır: npx tsx scripts/refleksoloji-final/marks.ui.e2e.ts [--out <klasör>]
 *
 * embedded-postgres (GERÇEK migration'lar: refleksoloji notes/atlas + protocols + 20271013000000)
 * + PostgREST shim :54321 ; `next start` :3978 ; Playwright chromium (mobil dokunmatik + masaüstü).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, seedAnamnez, startAnamnezTestEnv, type Seed } from "../anamnez/testEnv";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "rf-marks-ui");
const APP = "http://127.0.0.1:3978";
mkdirSync(OUT, { recursive: true });
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`zaman aşımı: ${url}`);
}

async function newContext(browser: Browser, seed: Seed, viewport: { width: number; height: number }, mobile: boolean): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2.625 : 1, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_RF_A", email: "zz.anamnez.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, reflexology: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Normalize (x,y) → o anki SVG'nin ekran pikseli (getScreenCTM; meet ölçeği dahil). */
async function screenPoint(page: Page, x: number, y: number) {
  return page.evaluate(([nx, ny]) => {
    const svg = document.querySelector('svg[role="group"]') as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    const m = svg.getScreenCTM()!;
    const p = new DOMPoint(nx * vb.width, ny * vb.height).matrixTransform(m);
    return { x: p.x, y: p.y };
  }, [x, y] as const);
}
/** DOM'daki n. noktanın normalize konumu (çizim → normalize). */
async function renderedMarks(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('svg[role="group"]') as SVGSVGElement;
    const vb = svg.viewBox.baseVal;
    return [...svg.querySelectorAll('g[role="button"]')].map((g) => {
      const c = g.querySelectorAll("circle")[1] as SVGCircleElement; // [0]=dokunma alanı (seçili değilken [1] görünen)
      const vis = [...g.querySelectorAll("circle")].find((k) => k.getAttribute("fill") !== "transparent" && k.getAttribute("fill") !== "none") as SVGCircleElement;
      const el = vis ?? c;
      return { x: Number(el.getAttribute("cx")) / vb.width, y: Number(el.getAttribute("cy")) / vb.height, r: Number(el.getAttribute("r")), label: g.getAttribute("aria-label") };
    });
  });
}

async function main() {
  const env = await startAnamnezTestEnv({
    port: 54418, dirName: "rf-marks-ui-pgdata", httpPort: 54321,
    extraSql: [
      mig("20260705120000_reflexology_notes_atlas.sql"),
      mig("20260924200817_reflexology_protocols_baseline_and_uid_unique.sql"),
      mig("20271013000000_reflexology_client_marks.sql"),
      `grant select, insert, update, delete on public.reflexology_notes, public.reflexology_atlas, public.reflexology_protocols to service_role;`,
    ],
  });
  const seed = await seedAnamnez(env.su);
  const su = env.su;
  await su.query(`update public.users set module_permissions = '{"clients":true,"reflexology":true}'::jsonb`);
  // ESKİ (legacy `yan` bucket'lı) atlas belgesi — eski kayıt uyumluluğu (A/S).
  const legacyDoc = {
    _meta: { updated_at: "2026-09-01T10:00:00.000Z", version: "1" },
    "ZZ Karaciğer": {
      taban: { sol: [], sag: [{ id: "zz-legacy-r1", shape: "oval", cx: 0.31, cy: 0.42, rx: 0.05, ry: 0.04, angle: 0, color: "rgba(124,58,237,0.3)" }] },
      yan: { sol: [], sag: [] },
    },
  };
  await su.query(`insert into public.reflexology_atlas(tenant_id, document, organ_list, updated_at) values ($1,$2,$3,'2026-09-01T10:00:00Z')`,
    [seed.TA, JSON.stringify(legacyDoc), JSON.stringify(["ZZ Karaciğer"])]);
  const legacyBefore = (await su.query(`select document::text d from public.reflexology_atlas where tenant_id=$1`, [seed.TA])).rows[0].d;

  const dbMarks = async () => (await su.query(`select * from public.reflexology_marks order by created_at, id`)).rows as Array<Record<string, unknown>>;

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", "3978", "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const watch = (page: Page) => {
      page.on("pageerror", (e) => pageErrors.push(`${page.url()} :: ${e.message}`));
      page.on("response", async (r) => {
        if (r.url().includes("/api/refleksoloji/marks") && r.status() >= 400) apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(APP, "")}`);
      });
    };

    // ── MOBİL 390 (Android benzeri dokunmatik) ───────────────────────────────
    console.log("\n[Mobil 390×844 dokunmatik]");
    const mctx = await newContext(browser, seed, { width: 390, height: 844 }, true);
    const m = await mctx.newPage();
    watch(m);
    await m.goto(`${APP}/refleksoloji`);
    await m.getByRole("link", { name: /Danışan Haritası/ }).waitFor({ timeout: 90_000 });
    ok(await noHScroll(m), "hub: yatay taşma yok (390)");
    await shot(m, "m01-hub");
    await m.getByRole("link", { name: /Danışan Haritası/ }).click();
    await m.getByRole("heading", { name: "Danışan seçin" }).waitFor();
    await m.getByRole("button", { name: /ZZ Ayşe YILMAZ/ }).click();
    await m.getByRole("button", { name: "Seansı başlat" }).waitFor();
    ok(/client=/.test(m.url()), "danışan URL'de (?client=) → tarayıcı geri çalışır");
    await m.getByLabel("Başlık (isteğe bağlı)").fill("ZZ_RF mobil seans");
    await shot(m, "m02-sessions-empty");
    await m.getByRole("button", { name: "Seansı başlat" }).click();
    await m.waitForURL(/session=/);
    await m.locator('svg[role="group"]').waitFor();
    ok(await noHScroll(m), "editör: yatay taşma yok (390)");
    await shot(m, "m03-editor-empty");

    // I + B: sağ ayak tabanına dokun → nokta
    const p1 = await screenPoint(m, 0.42, 0.35);
    await m.touchscreen.tap(p1.x, p1.y);
    await m.getByText("Sağ Ayak Tabanı · 1 nokta").waitFor();
    await sleep(600);
    let rows = await dbMarks();
    ok(rows.length === 1 && rows[0].surface === "foot_sole" && rows[0].side === "right", "mobil dokunuş → DB: foot_sole/right", rows);
    ok(Math.abs(Number(rows[0].x) - 0.42) < 0.006 && Math.abs(Number(rows[0].y) - 0.35) < 0.006, `mobil koordinat doğruluğu (M): ${rows[0].x},${rows[0].y}`);

    // Kaydırma hareketi nokta EKLEMEZ (CDP touch drag).
    const cdp = await mctx.newCDPSession(m);
    const p2 = await screenPoint(m, 0.5, 0.7);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p2.x, y: p2.y }] });
    for (let i = 1; i <= 6; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p2.x, y: p2.y - i * 15 }] });
      await sleep(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(700);
    ok((await dbMarks()).length === 1, "parmakla kaydırma/sürükleme yeni nokta EKLEMEZ");
    // İki parmak (pinch) nokta eklemez.
    const p3 = await screenPoint(m, 0.5, 0.5);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p3.x - 20, y: p3.y, id: 1 }, { x: p3.x + 20, y: p3.y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: p3.x - 40, y: p3.y, id: 1 }, { x: p3.x + 40, y: p3.y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(700);
    ok((await dbMarks()).length === 1, "iki parmak (pinch) nokta EKLEMEZ");

    // K: seçili noktanın boyutu
    await m.getByRole("radiogroup", { name: "Boyut" }).last().getByRole("radio", { name: "Büyük" }).tap();
    await sleep(700);
    ok((await dbMarks())[0].size === "large", "boyut değiştir (K) → large");
    // L: yoğunluk
    await m.getByRole("radiogroup", { name: "Yoğunluk" }).last().getByRole("radio", { name: "Yoğun" }).tap();
    await sleep(700);
    ok((await dbMarks())[0].intensity === "strong", "yoğunluk değiştir (L) → strong");
    // Not
    await m.getByLabel("Nokta notu").fill("ZZ hassas bölge");
    await m.getByRole("button", { name: "Notu kaydet" }).tap();
    await sleep(700);
    ok((await dbMarks())[0].note === "ZZ hassas bölge", "nokta notu kaydedildi");

    // C: sol ayak (taraf değiştir) → sağ ayak noktası GÖRÜNMEZ
    await m.getByRole("radio", { name: /^Sol \(/ }).tap();
    ok((await renderedMarks(m)).length === 0, "sol ayakta sağ ayak noktası görünmez (5)");
    const p4 = await screenPoint(m, 0.6, 0.55);
    await m.touchscreen.tap(p4.x, p4.y);
    await m.getByText("Sol Ayak Tabanı · 1 nokta").waitFor();

    // B/C + D/E/F/G: ayak yanları + el yüzeyleri (2D yüz ürün kararıyla YOK)
    const tapOn = async (tab: string, side: "Sağ" | "Sol" | null, x: number, y: number, label: string) => {
      await m.getByRole("tab", { name: new RegExp(`^${tab}`) }).tap();
      if (side) await m.getByRole("radio", { name: new RegExp(`^${side} \\(`) }).tap();
      ok((await renderedMarks(m)).length === 0, `${label}: başka yüzeyin noktası görünmez`);
      const pt = await screenPoint(m, x, y);
      await m.touchscreen.tap(pt.x, pt.y);
      await m.getByText(`${label} · 1 nokta`).waitFor();
    };
    await tapOn("Avuç İçi", "Sağ", 0.5, 0.62, "Sağ El — Avuç İçi");
    await shot(m, "m04-palm-right");
    await tapOn("Avuç İçi", "Sol", 0.45, 0.6, "Sol El — Avuç İçi");
    await tapOn("El Sırtı", "Sağ", 0.55, 0.45, "Sağ El — El Sırtı");
    await tapOn("El Sırtı", "Sol", 0.5, 0.4, "Sol El — El Sırtı");
    await shot(m, "m05-dorsum-left");
    await tapOn("Ayak İç Yan", "Sağ", 0.35, 0.55, "Sağ Ayak İç Yan");
    await tapOn("Ayak Dış Yan", "Sol", 0.4, 0.6, "Sol Ayak Dış Yan");
    await shot(m, "m06-foot-outer-left");
    ok((await m.getByRole("tab", { name: /^Yüz/ }).count()) === 0 && (await m.getByRole("tab").count()) === 5, "2D Yüz sekmesi YOK; 5 yüzey sekmesi");
    await sleep(600);
    rows = await dbMarks();
    const kinds = rows.map((r) => `${r.surface}/${r.side}`).sort();
    ok(JSON.stringify(kinds) === JSON.stringify(["foot_inner/right", "foot_outer/left", "foot_sole/left", "foot_sole/right", "hand_dorsum/left", "hand_dorsum/right", "hand_palm/left", "hand_palm/right"]), "8 yüzey/taraf DB'de ayrı", kinds);
    ok(await noHScroll(m), "ayak/el sekmeleri: yatay taşma yok");
    const sessionUrl = m.url();
    const S = new URL(sessionUrl).searchParams.get("session");

    // Toolbar/canvas ekranı kaplamıyor mu? Canvas görünür yüksekliği ≥ %45 viewport.
    const cv = await m.locator('svg[role="group"]').boundingBox();
    ok(!!cv && cv.height >= 844 * 0.45 && cv.width >= 340, `mobil harita alanı yeterli (${Math.round(cv?.width ?? 0)}×${Math.round(cv?.height ?? 0)})`);
    await m.evaluate(() => window.scrollTo(0, 0));
    const cvTop = await m.locator('svg[role="group"]').evaluate((el) => el.getBoundingClientRect().top);
    ok(cvTop < 844 * 0.5, `mobil: harita sayfa açılışında ekranın üst yarısında başlar (top=${Math.round(cvTop)}px)`);
    // Buton hit-area (seçim çipleri) ≥ 44px
    const chipH = await m.getByRole("tab", { name: /^El Sırtı/ }).boundingBox();
    ok(!!chipH && chipH.height >= 43.5, `yüzey sekmesi dokunma yüksekliği ${chipH?.height}`);

    // Tarayıcı GERİ: seans → liste
    await m.goBack();
    await m.getByRole("heading", { name: "İşaret seansları" }).waitFor();
    ok(await m.getByText("8 nokta").waitFor({ timeout: 15_000 }).then(() => true, () => false), "tarayıcı geri → seans listesi (8 nokta)");
    await m.goForward();
    await m.locator('svg[role="group"]').waitFor();

    // 360 + 412 taşma
    for (const w of [360, 412]) {
      await m.setViewportSize({ width: w, height: 800 });
      await sleep(400);
      ok(await noHScroll(m), `editör ${w}px: yatay taşma yok`);
      const b = await m.locator('svg[role="group"]').boundingBox();
      ok(!!b && b.x >= 0 && b.x + b.width <= w + 1, `${w}px: harita ekran içinde`);
      await shot(m, `m07-editor-${w}`);
    }
    await m.setViewportSize({ width: 390, height: 844 });

    // ── WEB 1366 — mobil→web aynı kayıt (O) ───────────────────────────────────
    console.log("\n[Web 1366×900]");
    const wctx = await newContext(browser, seed, { width: 1366, height: 900 }, false);
    const w = await wctx.newPage();
    watch(w);
    await w.goto(sessionUrl);
    await w.locator('svg[role="group"]').waitFor({ timeout: 60_000 });
    await w.getByText("Sağ Ayak Tabanı · 1 nokta").waitFor();
    const wm = await renderedMarks(w);
    const dbFoot = (await dbMarks()).find((r) => r.surface === "foot_sole" && r.side === "right")!;
    ok(wm.length === 1 && Math.abs(wm[0].x - Number(dbFoot.x)) < 1e-6 && Math.abs(wm[0].y - Number(dbFoot.y)) < 1e-6, "mobil noktası webde AYNI normalize konumda (O)", wm);
    // Ekranda gerçek piksel konumu: CTM ile hesaplanan nokta, çizilen dairenin ekran merkezine eşit.
    const center = await w.evaluate(() => {
      const g = document.querySelector('svg[role="group"] g[role="button"]')!;
      const c = [...g.querySelectorAll("circle")].find((k) => k.getAttribute("fill") !== "transparent" && k.getAttribute("fill") !== "none")!;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const exp = await screenPoint(w, Number(dbFoot.x), Number(dbFoot.y));
    ok(Math.hypot(center.x - exp.x, center.y - exp.y) < 1.5, `web çizim pikseli = normalize konum (N) Δ=${Math.hypot(center.x - exp.x, center.y - exp.y).toFixed(2)}px`);
    const clipW = await w.evaluate(() => {
      const svg = document.querySelector('svg[role="group"]') as SVGSVGElement;
      const img = svg.querySelector("image")!;
      const g = img.closest("g[clip-path]");
      const rect = g ? (document.querySelector(g.getAttribute("clip-path")!.replace(/^url\((.*)\)$/, "$1") + " rect") as SVGRectElement | null) : null;
      return { clipped: !!g, rectW: rect ? Number(rect.getAttribute("width")) : null, vbW: svg.viewBox.baseVal.width };
    });
    ok(clipW.clipped && clipW.rectW === clipW.vbW, "ayak görseli viewBox'a kırpılı (diğer ayak görünmez)", clipW);
    await shot(w, "w01-editor-foot");

    // Web tıklama ile ekle (N) → mobilde görünür (P)
    const wp = await screenPoint(w, 0.3, 0.8);
    await w.mouse.click(wp.x, wp.y);
    await w.getByText("Sağ Ayak Tabanı · 2 nokta").waitFor();
    await sleep(500);
    const webMark = (await dbMarks()).find((r) => r.surface === "foot_sole" && r.side === "right" && Math.abs(Number(r.x) - 0.3) < 0.003);
    ok(!!webMark && Math.abs(Number(webMark.y) - 0.8) < 0.003, "web tıklama koordinat doğruluğu (N)", webMark);
    await m.reload();
    await m.locator('svg[role="group"]').waitFor();
    await m.getByText("Sağ Ayak Tabanı · 2 nokta").waitFor({ timeout: 30_000 });
    const mm = await renderedMarks(m);
    ok(mm.some((k) => Math.abs(k.x - Number(webMark?.x)) < 1e-6 && Math.abs(k.y - Number(webMark?.y)) < 1e-6), "web noktası mobilde aynı konumda (P)");

    // Sürükle-taşı (web)
    await w.getByRole("radio", { name: "Seç / taşı" }).click();
    const before = Number(webMark!.x);
    const startPt = await screenPoint(w, Number(webMark!.x), Number(webMark!.y));
    await w.mouse.move(startPt.x, startPt.y);
    await w.mouse.down();
    for (let i = 1; i <= 10; i++) await w.mouse.move(startPt.x + i * 4, startPt.y, { steps: 1 });
    await w.mouse.up();
    await sleep(800);
    const moved = (await dbMarks()).find((r) => r.id === webMark!.id)!;
    const unitsPerPx = await w.evaluate(() => {
      const svg = document.querySelector('svg[role="group"]') as SVGSVGElement;
      return 1 / svg.getScreenCTM()!.a;
    });
    const expectDx = (40 * unitsPerPx) / 512;
    ok(Math.abs(Number(moved.x) - before - expectDx) < 0.004, `sürükle → x ${before.toFixed(4)}→${Number(moved.x).toFixed(4)} (beklenen +${expectDx.toFixed(4)})`);

    // Klavye: Tab ile odak + ok tuşu
    const kb0 = Number((await dbMarks()).find((r) => r.id === webMark!.id)!.y);
    await w.locator('svg[role="group"] g[role="button"]').nth(1).focus();
    await w.keyboard.press("ArrowDown");
    await sleep(700);
    const kb1 = Number((await dbMarks()).find((r) => r.id === webMark!.id)!.y);
    ok(Math.abs(kb1 - kb0 - 0.005) < 1e-6, `klavye ok tuşu taşır (${kb0}→${kb1})`);
    const aria = await w.locator('svg[role="group"] g[role="button"]').first().getAttribute("aria-label");
    ok(!!aria && /1\. nokta · Büyük · Yoğun · ZZ hassas bölge/.test(aria), `aria-label metinle anlam taşır: ${aria}`);

    // Tek nokta sil (tek onay)
    await w.locator('svg[role="group"] g[role="button"]').nth(1).click();
    await w.getByRole("button", { name: "Noktayı sil" }).click();
    await w.getByRole("alertdialog").getByRole("button", { name: "Sil", exact: true }).click();
    await w.getByText("Sağ Ayak Tabanı · 1 nokta").waitFor();
    await sleep(800); // iyimser UI; DELETE isteğinin bitmesini bekle
    ok((await dbMarks()).every((r) => r.id !== webMark!.id), "tek nokta silme (J) — tek onay");

    // U: Tümünü sil → 3 aşama (sağ avuç: 3 nokta yap)
    await w.getByRole("tab", { name: /^Avuç İçi/ }).click();
    await w.getByRole("radio", { name: "Nokta ekle" }).click();
    for (const [x, y] of [[0.4, 0.7], [0.6, 0.7]] as const) {
      const pt = await screenPoint(w, x, y);
      await w.mouse.click(pt.x, pt.y);
      await sleep(400);
    }
    await w.getByText("Sağ El — Avuç İçi · 3 nokta").waitFor();
    const otherBefore = (await dbMarks()).filter((r) => !(r.surface === "hand_palm" && r.side === "right")).length;
    await w.getByRole("button", { name: "Tümünü sil" }).click();
    const dlg = w.getByRole("alertdialog");
    await dlg.getByText("Tümünü Sil — Adım 1/3").waitFor();
    await shot(w, "w02-bulk-stage1");
    await dlg.getByRole("button", { name: "Devam Et" }).click();
    await dlg.getByText("Doğrulama — Adım 2/3").waitFor();
    await sleep(500);
    await dlg.getByRole("textbox").fill("TÜMÜNÜ SİL");
    await dlg.getByRole("button", { name: "Devam Et" }).click();
    await dlg.getByText(/Son Onay/).waitFor();
    await sleep(500);
    ok((await dbMarks()).filter((r) => r.surface === "hand_palm" && r.side === "right").length === 3, "3. onaydan ÖNCE hiçbir nokta silinmedi");
    await shot(w, "w03-bulk-stage3");
    await dlg.getByRole("button", { name: /Kalıcı Olarak Sil \(3\)/ }).click();
    await w.getByText("Sağ El — Avuç İçi · 0 nokta").waitFor();
    const after = await dbMarks();
    ok(after.filter((r) => r.surface === "hand_palm" && r.side === "right").length === 0 && after.length === otherBefore, "3 aşama sonrası yalnız bu yüzey silindi (U)");

    // Vazgeç yolu: aşama 2'de iptal → silme yok
    await w.getByRole("tab", { name: /^El Sırtı/ }).click();
    await w.getByRole("button", { name: "Tümünü sil" }).click();
    await dlg.getByRole("button", { name: "Devam Et" }).click();
    await dlg.getByText("Doğrulama — Adım 2/3").waitFor();
    await sleep(500);
    await dlg.getByRole("button", { name: "Vazgeç" }).click();
    await sleep(500);
    ok((await dbMarks()).filter((r) => r.surface === "hand_dorsum").length === 2, "aşama 2'de Vazgeç → el sırtı noktaları korundu");
    ok(await noHScroll(w), "web: yatay taşma yok");
    await shot(w, "w04-dorsum");

    // Seans bilgisi / mesleki not
    await w.getByRole("button", { name: "Seans bilgisi / not" }).click();
    await w.getByLabel("Seans notu (mesleki)").fill("ZZ seans notu: sol omuz gerginliği");
    await w.getByRole("button", { name: "Kaydet", exact: true }).click();
    await sleep(700);
    ok((await su.query(`select note from public.reflexology_mark_sessions where id=$1`, [S])).rows[0].note === "ZZ seans notu: sol omuz gerginliği", "seans notu kaydedildi");

    // ── ESKİ KAYITLAR (A/S) — tenant atlası etkilenmedi ──────────────────────
    console.log("\n[Eski kayıt uyumu]");
    await w.goto(`${APP}/refleksoloji/kayitli-atlas`);
    await w.getByText("ZZ Karaciğer").first().waitFor({ timeout: 60_000 });
    ok(true, "Kayıtlı Atlas: eski (legacy `yan`) belge açılıyor (A)");
    await shot(w, "w05-legacy-atlas");
    await w.goto(`${APP}/refleksoloji/bolge-haritasi`);
    await w.getByText(/ZZ Karaciğer/).first().waitFor({ timeout: 60_000 });
    ok(true, "Bölge Haritası: eski organ listesi yüklendi");
    await sleep(1500);
    const legacyAfter = (await su.query(`select document::text d from public.reflexology_atlas where tenant_id=$1`, [seed.TA])).rows[0].d;
    const docAfter = JSON.parse(legacyAfter);
    const r1 = docAfter["ZZ Karaciğer"]?.taban?.sag?.[0];
    ok(legacyAfter === legacyBefore || (r1 && r1.id === "zz-legacy-r1" && r1.cx === 0.31 && r1.cy === 0.42), "eski bölge koordinatı KAYMADI (S)", r1);
    for (const p of ["/refleksoloji", "/refleksoloji/protokol-haritasi", "/refleksoloji/kayitli-protokoller", "/refleksoloji/notlar"]) {
      await w.goto(`${APP}${p}`);
      await w.waitForLoadState("networkidle").catch(() => {});
      ok(await noHScroll(w), `${p}: yükleniyor + yatay taşma yok`);
    }

    ok(pageErrors.length === 0, "sayfa JS hatası yok", pageErrors);
    ok(apiErrors.length === 0, "marks API 4xx/5xx yok (beklenmeyen)", apiErrors);
  } finally {
    await browser?.close().catch(() => {});
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail > 0) {
    console.error("BAŞARISIZ:\n - " + fails.join("\n - "));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
