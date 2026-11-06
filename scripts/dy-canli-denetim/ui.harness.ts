/**
 * DY canlı denetim — C1 / C2 GERÇEK CHROMIUM doğrulaması (PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul (gizli değer YOK — yerel test shim'ine işaret eder):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54521 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/dy-canli-denetim/ui.harness.ts [--out <klasör>]
 *
 * C1: danışan detay başlığındaki bilgi kartı değerleri 320–1920 px'te KESİLMEZ (masaüstü dahil).
 * C2: Danışan Listesi "Kayıtlı Danışanlar (N)" sayısı sıralama kutusuyla ÇAKIŞMAZ.
 * Ek: yatay kaydırma yok; 2 haneli sayıyla 375/390/1440 px'te başlık + sıralama tek satır (320 px'te alt satır);
 *     4 haneli sayıda da çakışma yok.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type Seed } from "../anamnez/testEnv";
import { startDyEnv } from "../dy-presale-closeout/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "dy-canli-denetim-ui");
const APP = "http://127.0.0.1:3979";
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

const VIEWPORTS = [
  { name: "320x640", width: 320, height: 640, mobile: true },
  { name: "375x667", width: 375, height: 667, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "768x1024", width: 768, height: 1024, mobile: false },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
  { name: "1366x768", width: 1366, height: 768, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
  { name: "1536x816", width: 1536, height: 816, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, mobile: false },
];

async function newContext(browser: Browser, seed: Seed, v: { width: number; height: number; mobile: boolean }): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  const user = {
    id: seed.users.A.id, tenant_id: seed.TA, full_name: "ZZ_DY_A", email: "zz.dy.a@example.test", role: "expert",
    active: true, approval_status: "approved", package_type: "premium", plan: "premium",
    module_permissions: { clients: true, appointments: true }, is_demo_account: false,
  };
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), seed.users.A.token]);
  return ctx;
}

const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function main() {
  const { env, seed } = await startDyEnv({ port: 54488, dirName: "dy-canli-denetim-ui-pgdata", httpPort: 54521 });
  await env.su.query(`update public.users set module_permissions = '{"clients":true,"appointments":true}'::jsonb where id=$1`, [seed.users.A.id]);
  const TA = seed.TA;
  const CID = randomUUID();
  // En kötü durum: boşluksuz 11 haneli telefon + uzun burç/kan/mizaç değerleri.
  await env.su.query(
    `insert into public.clients(id, tenant_id, ad, soyad, telefon, dogum, gorusme, burc, kan, mizac) values ($1,$2,'QA Denetim','BİR','05551112233','1990-03-15','2026-11-04','İkizler','AB Rh+','sovdavi')`,
    [CID, TA],
  );
  for (let i = 0; i < 48; i++) {
    await env.su.query(`insert into public.clients(tenant_id, ad, soyad) values ($1,$2,'ZZ LİSTE')`, [TA, `ZZ Danışan ${i + 1}`]);
  }
  const EXPECTED = ["05551112233", "15.03.1990", "04.11.2026"];

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", "3979", "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32",
      env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" },
      stdio: "ignore",
    });
    await waitHttp(`${APP}/danisan-yolculugu`, 180_000);
    browser = await chromium.launch();
    console.log(`Chromium ${browser.version()}`);

    for (const v of VIEWPORTS) {
      console.log(`\n[${v.name}]`);
      const ctx = await newContext(browser, seed, v);
      const page = await ctx.newPage();

      // ── C1: danışan detay başlığı ─────────────────────────────────────────
      await page.goto(`${APP}/dashboard/clients/${CID}`, { waitUntil: "domcontentloaded" });
      await page.getByText("05551112233").first().waitFor({ timeout: 30_000 });
      const tiles = await page.locator('[class*="infoValue"]').evaluateAll((els) => els.map((el) => {
        const e = el as HTMLElement;
        return { text: e.innerText.trim(), clipped: e.scrollWidth > e.clientWidth + 1, ellipsis: getComputedStyle(e).textOverflow, ws: getComputedStyle(e).whiteSpace };
      }));
      if (v.mobile) {
        ok(tiles.length === 6 && tiles.every((t) => !t.clipped), `C1 ${v.name}: 6 bilgi kartı değeri kesilmiyor`, tiles);
        ok(EXPECTED.every((x) => tiles.some((t) => t.text.replace(/\s+/g, "") === x)), `C1 ${v.name}: telefon/doğum/görüşme TAM görünüyor`, tiles.map((t) => t.text));
        ok(tiles.every((t) => t.ws === "normal"), `C1 ${v.name}: mobilde satır kaydırma etkin`, tiles.map((t) => t.ws));
        // Sayı ortadan bölünmesin: telefon + tarihler TEK görsel satırda (Range.getClientRects).
        const lines = await page.locator('[class*="infoValue"]').evaluateAll((els, want) => els
          .filter((el) => (want as string[]).includes((el as HTMLElement).innerText.replace(/\s+/g, "")))
          .map((el) => { const r = document.createRange(); r.selectNodeContents(el); return { t: (el as HTMLElement).innerText, n: new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size }; }), EXPECTED);
        ok(lines.length === 3 && lines.every((l) => l.n === 1), `C1 ${v.name}: telefon/doğum/görüşme tek satırda (sayı bölünmüyor)`, lines);
      } else {
        ok(tiles.every((t) => t.ws === "nowrap"), `C1 ${v.name}: masaüstü kuralı değişmedi (nowrap + ellipsis)`, tiles.map((t) => [t.ws, t.ellipsis]));
        // Masaüstü telefon kesilmesi (2026-11-05): hiçbir genişlikte değer "…" ile kesilmez.
        ok(tiles.length === 6 && tiles.every((t) => !t.clipped), `C1 ${v.name}: masaüstünde telefon/tarih değerleri kesilmiyor`, tiles.filter((t) => t.clipped).map((t) => t.text));
        const cols = await page.locator('[class*="infoGrid"]').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
        const want = v.width >= 1920 ? 6 : v.width >= 640 ? 3 : 2;
        ok(cols === want, `C1 ${v.name}: bilgi ızgarası ${want} sütun (geniş ekranda tek satır tasarımı korunur)`, cols);
      }
      ok(await noHScroll(page), `C1 ${v.name}: yatay kaydırma yok`);
      const header = page.locator('[class*="infoGrid"]').first();
      await header.scrollIntoViewIfNeeded();
      await header.screenshot({ path: path.join(OUT, `C1-detay-baslik-${v.name}.png`) });
      await page.screenshot({ path: path.join(OUT, `C1-detay-sayfa-${v.name}.png`) });

      // ── C2: liste başlığı + sıralama ──────────────────────────────────────
      await page.goto(`${APP}/danisan-yolculugu/liste`, { waitUntil: "domcontentloaded" });
      const count = page.locator("main span").filter({ hasText: /^\(\d+\)$/ }).first();
      await count.waitFor({ timeout: 30_000 });
      const sel = page.locator("main select").filter({ has: page.locator("option", { hasText: "En Yeni Kayıt" }) }).first();
      const [cr, sr] = [await count.boundingBox(), await sel.boundingBox()];
      const countText = (await count.innerText()).trim();
      const overlap = !!cr && !!sr && !(cr.x + cr.width <= sr.x || sr.x + sr.width <= cr.x || cr.y + cr.height <= sr.y || sr.y + sr.height <= cr.y);
      const countVisible = await count.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const atCenter = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return r.width > 0 && r.right <= window.innerWidth + 1 && !!atCenter && (el === atCenter || el.contains(atCenter));
      });
      ok(countText === "(49)" || countText === "(51)" || /^\(\d+\)$/.test(countText), `C2 ${v.name}: sayı metni ${countText}`);
      ok(!overlap, `C2 ${v.name}: sayı ile sıralama kutusu çakışmıyor`, { cr, sr });
      ok(countVisible, `C2 ${v.name}: sayı üstte, kırpılmadan görünüyor (elementFromPoint)`);
      // 375px ve üstü + 2 haneli sayı: sığdığı için tek satır (ilk danışan yukarıda); 320px'te alt satıra kayar.
      if (v.width >= 375) ok(!!cr && !!sr && Math.abs((cr.y + cr.height / 2) - (sr.y + sr.height / 2)) < 40, `C2 ${v.name}: başlık ve sıralama aynı satırda (sığdığında alt satıra kaymaz)`, { cr, sr });
      ok(await noHScroll(page), `C2 ${v.name}: yatay kaydırma yok`);
      if (v.width === 375) {
        // Mobil ilk danışan (2026-11-05): 375×667'de ilk danışan kartının adı ilk ekranda, altında ≥40px görünür.
        // dy-presale-closeout ile aynı ölçüm: listedeki ilk danışan adının (görünür yaprak metin) üst kenarı.
        const firstTop = await page.evaluate(() => {
          const el = [...document.querySelectorAll("main *")].find((e) => e.children.length === 0 && /^(ZZ Danışan|QA Denetim)/.test((e.textContent ?? "").trim()) && (e as HTMLElement).offsetParent);
          return el ? Math.round(el.getBoundingClientRect().top) : -1;
        });
        ok(firstTop > 0 && firstTop + 40 < v.height, `C2 ${v.name}: ilk danışan ilk ekranda (ad y=${firstTop}, vh=${v.height})`, firstTop);
      }
      // Büyük sayı (1234 danışan) — düzen sayının genişliğine göre alt satıra geçer, hiçbir genişlikte ÇAKIŞMAZ.
      const big = await count.evaluate((el, selHtml) => {
        const prev = el.textContent; el.textContent = "(1234)";
        const sel = [...document.querySelectorAll("main select")].find((s) => s.textContent?.includes(selHtml as string)) as HTMLElement;
        const c = el.getBoundingClientRect(), s = sel.getBoundingClientRect();
        const res = { overlap: !(c.right <= s.left || s.right <= c.left || c.bottom <= s.top || s.bottom <= c.top), hScroll: document.documentElement.scrollWidth > window.innerWidth + 1 };
        el.textContent = prev; return res;
      }, "En Yeni Kayıt");
      ok(!big.overlap && !big.hScroll, `C2 ${v.name}: 4 haneli sayıda da çakışma / yatay taşma yok`, big);
      if (v.width >= 375) {
        // Olası TÜM 2 haneli sayılar (10–99; "0"/"8" geniş rakam) 375px+ tek satırda kalmalı (yalnız gerçek sayıya güvenme).
        const wide = await count.evaluate((el, selHtml) => {
          const prev = el.textContent; const out: Record<string, boolean> = {};
          const sel = [...document.querySelectorAll("main select")].find((s) => s.textContent?.includes(selHtml as string)) as HTMLElement;
          for (let i = 10; i <= 99; i++) {
            const n = String(i);
            el.textContent = `(${n})`;
            const c = el.getBoundingClientRect(), s = sel.getBoundingClientRect();
            const sameRow = Math.abs((c.top + c.height / 2) - (s.top + s.height / 2)) < 40;
            const overlap = !(c.right <= s.left || s.right <= c.left || c.bottom <= s.top || s.bottom <= c.top);
            out[n] = sameRow && !overlap;
          }
          el.textContent = prev; return out;
        }, "En Yeni Kayıt");
        ok(Object.values(wide).every(Boolean), `C2 ${v.name}: 10–99 arası tüm sayılarda tek satır, çakışma yok`, Object.entries(wide).filter(([, v]) => !v).map(([k]) => k));
      }
      const head = count.locator("xpath=ancestor::section[1]");
      await head.screenshot({ path: path.join(OUT, `C2-liste-baslik-${v.name}.png`) }).catch(async () => {
        await page.screenshot({ path: path.join(OUT, `C2-liste-baslik-${v.name}.png`) });
      });
      await count.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `C2-liste-sayfa-${v.name}.png`) });
      await ctx.close();
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nDY CANLI DENETİM UI (C1/C2): ${pass}/${pass + fail} PASS — ekran görüntüleri: ${OUT}`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
