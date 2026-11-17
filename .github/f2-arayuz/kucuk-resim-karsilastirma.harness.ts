/**
 * #804 GEÇİCİ SALT-OKUNUR KARŞILAŞTIRMA (repoya girmez; runner'da scripts/workspace/ altına kopyalanır) — Kişisel Dijital
 * Ofis "Logo · Foto" görsel önizlemeleri, Chromium / Firefox / WebKit. AYNI betik hem main (F2 YOK) hem F2 build'inde,
 * AYNI sentetik görsellerle koşar; yalnız ana sayfadaki stüdyoyu kullanır (iki dalda da var).
 * Ölçülen: sayfadaki tüm <img src="blob:…"> öğeleri — yüklendi (complete && naturalWidth>0) / kırık; img.decode() sonucu.
 *   Aşama 1 "liste": Görsellerimi göster → küçük resimler
 *   Aşama 2 "uygula": 600×200 "Logo olarak kullan" → stüdyo önizlemesi
 * Karar vermez (her durumda RC 0); "KUCUK-RESIM" satırlarını basar ve ekran görüntüsü alır.
 *   UI_BASE=http://127.0.0.1:3984 UI_OUT=<klasör> UI_ETIKET=main|f2 npx tsx scripts/workspace/.kucuk-resim.harness.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, firefox, webkit, type BrowserType, type Page } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "./ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3984";
const SINK_PORT = process.env.UI_SINK_PORT ?? "54399";
const OUT = process.env.UI_OUT ?? "kucuk-resim";
const ETIKET = process.env.UI_ETIKET ?? "?";
mkdirSync(OUT, { recursive: true });
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const USER = {
  id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};
const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();

const OLCUM = `(async () => {
  const out = [];
  for (const i of Array.from(document.querySelectorAll('img')).filter((x) => x.src.startsWith('blob:'))) {
    let dec = 'ok';
    try { await i.decode(); } catch (e) { dec = 'hata: ' + String(e && e.message || e); }
    out.push({ alt: (i.alt || '').slice(0, 24), w: i.naturalWidth, complete: i.complete, dec });
  }
  return out;
})()`;
async function olc(page: Page, name: string, asama: string) {
  // Görsellerin istenmesi için kısa, sınırlı bekleme: blob: img sayısı sabitlenene dek (en çok 10 sn).
  let son = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate("document.querySelectorAll('img[src^=\"blob:\"]').length");
    if (n > 0 && n === son) break;
    son = n as number;
    await page.waitForTimeout(250);
  }
  const r = (await page.evaluate(OLCUM)) as { alt: string; w: number; complete: boolean; dec: string }[];
  const yuklu = r.filter((x) => x.complete && x.w > 0).length;
  console.log(`KUCUK-RESIM ${ETIKET} ${name} ${asama} toplam=${r.length} yuklu=${yuklu} kirik=${r.length - yuklu} ${JSON.stringify(r)}`);
  await page.screenshot({ path: join(OUT, `${ETIKET}-${name}-${asama}.png`) });
}

async function runBrowser(name: string, bt: BrowserType) {
  const browser = await bt.launch();
  try {
    const mock: WorkspaceMock = createWorkspaceMock({ enabled: true });
    await mock.seedAsset("logo", await png(600, 200, 40), "rapor.png", "image/png");
    await mock.seedAsset("logo", await png(400, 400, 120), "serbest.png", "image/png");
    mock.seed({ applied: design({ layout: "B" }) });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
    await ctx.addInitScript((u) => {
      try {
        localStorage.setItem("yasam_user", JSON.stringify(u));
        localStorage.setItem("yasam_session_token", "zz-local-fake-token");
        localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: "2026-11-01T00:00:00.000Z" }));
      } catch { /* */ }
    }, USER);
    await ctx.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.port === SINK_PORT || !url.pathname.startsWith("/api/")) return route.continue();
      if (url.pathname.startsWith("/api/settings/workspace")) {
        const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
        return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
      }
      if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
      if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
      if (url.pathname.endsWith("/astroloji/access")) return route.fulfill({ status: 404, json: { error: "not_found" } });
      if (url.pathname.startsWith("/api/beslenme")) return route.fulfill({ status: 403, json: { ok: true, access: false } });
      return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
    const studio = page.locator('[role="dialog"][aria-labelledby="studio-title"]');
    await studio.waitFor({ timeout: 90000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await studio.getByRole("tab", { name: /Logo ve Fotoğraf|Logo · Foto/ }).click();
    await studio.getByRole("button", { name: /Görsellerimi göster/ }).first().click();
    await studio.locator("li", { hasText: "400×400" }).first().waitFor({ timeout: 20000 });
    await olc(page, name, "liste");
    await studio.locator("li", { hasText: "600×200" }).first().getByRole("button", { name: /Logo olarak kullan/ }).click();
    await olc(page, name, "uygula");
    await ctx.close();
  } catch (e) {
    console.log(`KUCUK-RESIM ${ETIKET} ${name} HATA ${String(e).slice(0, 300)}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const [n, bt] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as [string, BrowserType][]) await runBrowser(n, bt);
})();
