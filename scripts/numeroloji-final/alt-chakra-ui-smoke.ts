/**
 * NUMEROLOJİ — "Farklı özel sayı kombinasyonları" · ÇAKRA SÜTUNU AÇILIR PANELİ — ARAYÜZ SMOKE
 * (gerçek tarayıcı; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: uygulama sahte env ile build edilmiş olmalı:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy npx next build
 * Sonra: npx tsx scripts/numeroloji-final/alt-chakra-ui-smoke.ts [--out <klasör>]
 *
 * `next start` :3989'da açılır. localhost DIŞI tüm istekler iptal edilir; /api/** mock'lanır.
 * Masaüstü 1366 + tablet 768 + mobil 390:
 *   - Yeni analiz (/numeroloji/analiz): Ana 19/9 → 22/6 · Yan 22/19 → 22/11/8 + 33/8 (owner ekranı yapısı)
 *   - Eski metodoloji kaydı (/numeroloji/liste/[id], damgasız snapshot): not + panel, kayıt yazımı YOK
 *   - Alternatifi olmayan kayıt (HASAN ARICI): kutu yok
 * Kontroller: varsayılan kapalı, tek panel açık, tekrar tıkla kapan, değerler motorla birebir,
 * yatay taşma yok, panel aç/kapa sırasında GET dışı istek SIFIR.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { hesaplaNumeroloji } from "@/lib/numeroloji/numerolojiMotor";
import { alternativeChakraColumns } from "@/lib/numeroloji/alternativeChakra";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "@/lib/numeroloji/methodology";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "numeroloji-alt-chakra-ui");
const PORT = 3989;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

// Owner ekranındaki yapı: Ana bileşenleri [19,3,3,1,2] (19/9 → 22/6), Yan [5,3,3,22,8] (22/19 → 22/11/8, 33/8).
// Sesli (Ana) ve sessiz (Yan) ham toplamlarını üreten sentetik isim parçaları.
const OWNER_FIRST = "NIIA CU CU RARD";
const OWNER_LAST = "HAA";
const BIRTH = "14.02.1987";

const ownerMotor = hesaplaNumeroloji({ firstName: OWNER_FIRST, lastName: OWNER_LAST, birthDate: BIRTH });
const hasanMotor = hesaplaNumeroloji({ firstName: "Hasan", lastName: "ARICI", birthDate: BIRTH });

const USER = {
  id: "00000000-0000-4000-8000-0000000000aa", tenant_id: "00000000-0000-4000-8000-0000000000bb",
  full_name: "ZZ_NUM_ALT", email: "zz.num.alt@example.test", role: "expert", active: true,
  approval_status: "approved", package_type: "premium", plan: "premium", membership_status: "active",
  module_permissions: { numerology: true }, is_demo_account: false,
};

function legacyRow(id: string, motor: unknown, name: string, surname: string, stamp?: string) {
  return {
    id, tenant_id: USER.tenant_id, user_id: USER.id, name, surname, birth_date: "1987-02-14",
    created_at: "2026-09-20T10:00:00.000Z", updated_at: "2026-09-20T10:00:00.000Z",
    // Damgasız snapshot → önceki metodoloji kaydı (Model C)
    analysis_data: { version: 1, motor, summary: "", ...(stamp ? { calc: { methodology: stamp } } : {}) },
  };
}

async function newPage(browser: Browser, vp: { w: number; h: number; mobile: boolean }, rows: Record<string, unknown>) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  await ctx.addInitScript(([u]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", "zz-dummy-token");
  }, [JSON.stringify(USER)]);
  const writes: string[] = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1" || url.port !== String(PORT)) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      if (req.method() !== "GET") writes.push(`${req.method()} ${url.pathname}`);
      if (url.pathname === "/api/numeroloji/analyses" && url.searchParams.get("id")) {
        const row = rows[url.searchParams.get("id")!];
        return route.fulfill({ status: row ? 200 : 404, contentType: "application/json", body: JSON.stringify(row ? { ok: true, row } : { ok: false }) });
      }
      if (url.pathname === "/api/numeroloji/entitlements") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, futureYears: false }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, items: [], records: [], data: [] }) });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { ctx, page, writes, errors };
}

async function noOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

/** Görünür ilk alternatif kutusu içinde path çipinin "Çakra Sütunu" düğmesi. */
function chipButton(page: Page, pathText: string) {
  return page.locator('[data-testid="alt-kombinasyon"]:visible', { hasText: new RegExp(`^${pathText.replace(/\//g, "\\/")}Çakra Sütunu`) }).first().getByRole("button", { name: /Çakra Sütunu/ });
}

async function panelCounts(page: Page): Promise<Record<number, number>> {
  return page.locator('[data-testid="alt-cakra-panel"]:visible').first().evaluate((el) => {
    const out: Record<number, number> = {};
    el.querySelectorAll("[data-cakra]").forEach((r) => { out[Number(r.getAttribute("data-cakra"))] = Number(r.getAttribute("data-sayi")); });
    return out;
  });
}

async function exerciseBox(page: Page, tag: string, motor: ReturnType<typeof hesaplaNumeroloji>) {
  const anaCols = alternativeChakraColumns(motor, "ana");
  const yanCols = alternativeChakraColumns(motor, "yan");
  const panels = page.locator('[data-testid="alt-cakra-panel"]:visible');
  ok((await panels.count()) === 0, `${tag} varsayılan: panel kapalı`);
  const chips = await page.locator('[data-testid="alt-kombinasyon"]:visible').allTextContents();
  ok(chips.length === anaCols.length + yanCols.length, `${tag} tüm alternatifler çipli (${chips.length})`, chips);

  // Yan 22/11/8 aç
  await chipButton(page, "22/11/8").click();
  ok((await panels.count()) === 1, `${tag} 22/11/8 açıldı (tek panel)`);
  ok((await panels.first().textContent())!.includes("Alternatif Yan Kulvar Çakra Değerlendirmesi"), `${tag} Yan paneli açıkça etiketli`);
  const yan = yanCols.find((c) => c.path === "22/11/8")!;
  ok(JSON.stringify(await panelCounts(page)) === JSON.stringify(yan.sayilar), `${tag} 22/11/8 sütun motorla birebir`, await panelCounts(page));
  ok((await chipButton(page, "22/11/8").getAttribute("aria-expanded")) === "true", `${tag} aria-expanded=true`);
  await page.locator('[data-testid="alt-cakra-panel"]:visible').first().screenshot({ path: path.join(OUT, `${tag}-yan-22-11-8.png`) });

  // 33/8'e geç → hâlâ tek panel
  await chipButton(page, "33/8").click();
  ok((await panels.count()) === 1, `${tag} 33/8'e geçiş: yine tek panel`);
  ok(JSON.stringify(await panelCounts(page)) === JSON.stringify(yanCols.find((c) => c.path === "33/8")!.sayilar), `${tag} 33/8 sütun motorla birebir`);
  ok((await chipButton(page, "22/11/8").getAttribute("aria-expanded")) === "false", `${tag} önceki çip kapandı`);

  // Tekrar tıkla → kapan
  await chipButton(page, "33/8").click();
  ok((await panels.count()) === 0, `${tag} tekrar tıklayınca kapandı`);

  // Ana 22/6
  await chipButton(page, "22/6").click();
  ok((await panels.count()) === 1, `${tag} Ana 22/6 açıldı`);
  const ana = anaCols.find((c) => c.path === "22/6")!;
  ok(JSON.stringify(await panelCounts(page)) === JSON.stringify(ana.sayilar), `${tag} Ana 22/6 = HY + PİN + alternatif`, await panelCounts(page));
  const anaText = (await panels.first().textContent()) ?? "";
  ok(anaText.includes("Alternatif Ana Kulvar Çakra Sütunu") && anaText.includes("Resmî Çakra Omurgası değişmez"), `${tag} Ana paneli etiket + not`);
  ok(await noOverflow(page), `${tag} yatay taşma yok (panel açık)`);
  await page.locator('[data-testid="alt-cakra-panel"]:visible').first().screenshot({ path: path.join(OUT, `${tag}-ana-22-6.png`) });
  await page.locator('[data-testid="alt-kombinasyon"]:visible').first().locator("xpath=ancestor::section[1]").screenshot({ path: path.join(OUT, `${tag}-kutu.png`) });
  await chipButton(page, "22/6").click();
  ok((await panels.count()) === 0, `${tag} Ana paneli kapandı`);
}

async function main() {
  console.log("Owner yapısı:", ownerMotor.anaKulvar.display, "|", ownerMotor.yanKulvar.display);
  // next'i doğrudan node ile başlat (shell yok) → kill tüm süreci kapatır, port açık kalmaz.
  const server: ChildProcess = spawn(process.execPath, [path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    stdio: "ignore",
    env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59999", NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy", SUPABASE_SERVICE_ROLE_KEY: "dummy" },
  });
  const browser = await chromium.launch();
  try {
    await waitHttp(`${APP}/`, 120_000);
    const rows = {
      "legacy-owner": legacyRow("legacy-owner", JSON.parse(JSON.stringify(ownerMotor)), OWNER_FIRST, OWNER_LAST),
      "legacy-hasan": legacyRow("legacy-hasan", JSON.parse(JSON.stringify(hasanMotor)), "Hasan", "ARICI"),
      // E (2026-10-18): önceki sürüm damgası → not; yeni sürüm damgası → not yok
      "v1-owner": legacyRow("v1-owner", JSON.parse(JSON.stringify(ownerMotor)), OWNER_FIRST, OWNER_LAST, "num-v1-final-2026-10"),
      "v11-owner": legacyRow("v11-owner", JSON.parse(JSON.stringify(ownerMotor)), OWNER_FIRST, OWNER_LAST, NUMEROLOJI_METHODOLOGY_VERSION),
    };
    for (const vp of [{ w: 1366, h: 900, mobile: false, tag: "masaustu" }, { w: 768, h: 1024, mobile: true, tag: "tablet" }, { w: 390, h: 844, mobile: true, tag: "mobil" }]) {
      console.log(`\n[${vp.tag} — yeni analiz]`);
      {
        const { ctx, page, writes, errors } = await newPage(browser, vp, rows);
        await page.goto(`${APP}/numeroloji/analiz`);
        await page.getByPlaceholder("Örn. Hasan Ali").fill(OWNER_FIRST);
        await page.getByPlaceholder("Örn. YILMAZ").fill(OWNER_LAST);
        await page.getByPlaceholder("GG/AA/YYYY").fill("14/02/1987");
        await page.getByRole("button", { name: "HESAPLA" }).click();
        await page.locator('[data-testid="alt-kombinasyon"]:visible').first().waitFor({ timeout: 30_000 });
        const before = writes.length;
        await exerciseBox(page, `${vp.tag}-yeni`, ownerMotor);
        ok(writes.length === before, `${vp.tag}-yeni panel aç/kapa kayıt isteği üretmedi`, writes);
        ok(errors.length === 0, `${vp.tag}-yeni sayfa hatası yok`, errors);
        await ctx.close();
      }
      console.log(`\n[${vp.tag} — eski metodoloji kaydı]`);
      {
        const { ctx, page, writes, errors } = await newPage(browser, vp, rows);
        await page.goto(`${APP}/numeroloji/liste/legacy-owner`);
        await page.getByText("Bu analiz önceki hesaplama metodolojisiyle oluşturulmuştur.").first().waitFor({ timeout: 30_000 });
        ok(await page.getByRole("button", { name: "Güncel yöntemle yeniden hesapla" }).isVisible(), `${vp.tag}-eski "Güncel yöntemle yeniden hesapla" korunuyor`);
        await page.locator('[data-testid="alt-kombinasyon"]:visible').first().waitFor({ timeout: 30_000 });
        await exerciseBox(page, `${vp.tag}-eski`, ownerMotor);
        ok(writes.length === 0, `${vp.tag}-eski kayıt: hiçbir yazma/yeniden hesap isteği yok`, writes);
        ok(errors.length === 0, `${vp.tag}-eski sayfa hatası yok`, errors);
        await page.screenshot({ path: path.join(OUT, `${vp.tag}-eski-kayit.png`), fullPage: false });
        await ctx.close();
      }
      console.log(`\n[${vp.tag} — metodoloji damgası]`);
      {
        const { ctx, page, writes } = await newPage(browser, vp, rows);
        await page.goto(`${APP}/numeroloji/liste/v1-owner`);
        await page.getByText("Bu analiz önceki hesaplama metodolojisiyle oluşturulmuştur.").first().waitFor({ timeout: 30_000 });
        ok(await page.getByRole("button", { name: "Güncel yöntemle yeniden hesapla" }).isVisible(), `${vp.tag} önceki sürüm damgası: not + yeniden hesapla`);
        await page.goto(`${APP}/numeroloji/liste/v11-owner`);
        await page.locator('[data-testid="alt-kombinasyon"]:visible').first().waitFor({ timeout: 30_000 });
        ok((await page.getByText("Bu analiz önceki hesaplama metodolojisiyle oluşturulmuştur.").count()) === 0, `${vp.tag} yeni sürüm damgası: not yok`);
        ok(writes.length === 0, `${vp.tag} damga kontrolü yazma isteği üretmedi`, writes);
        await ctx.close();
      }
      console.log(`\n[${vp.tag} — alternatifi olmayan kayıt]`);
      {
        const { ctx, page, errors } = await newPage(browser, vp, rows);
        await page.goto(`${APP}/numeroloji/liste/legacy-hasan`);
        await page.getByText("Bu analiz önceki hesaplama metodolojisiyle oluşturulmuştur.").first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
        ok((await page.locator('[data-testid="alt-kombinasyon"]').count()) === 0, `${vp.tag} HASAN ARICI: alternatif kutusu yok`);
        ok(errors.length === 0, `${vp.tag} HASAN sayfa hatası yok`, errors);
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
    server.kill();
    if (process.platform === "win32" && server.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  }
  console.log(`\nalt-chakra UI smoke: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  process.exit(fail > 0 ? 1 : 0);
}

void main();
