/**
 * #804 GEÇİCİ KABUL TESTİ (repoya girmez; runner'da scripts/profile/ altına kopyalanıp koşar) — Kişisel Dijital Ofis görsel
 * SİLME ONAY PENCERESİ: gerçek kullanıcı etkileşimi, Chromium + Firefox + WebKit.
 * Prod'a / dış ağa temas YOK: /api/settings/workspace/* scripts/workspace/ui-personal-backend.ts ile; 127.0.0.1 dışı abort.
 * Her tarayıcıda (TR):
 *   P  "Sil" → onay penceresi (alertdialog "Görsel silinsin mi?"), güvenli seçenek ("Düzenlemeye devam") ilk odakta
 *   C1 İPTAL düğmesi → pencere kapanır, DELETE GÖNDERİLMEZ, görsel listede, görsel sayısı aynı
 *   C2 Escape ile iptal → aynı koşullar
 *   R  ONAY, rapor logosunda kullanılan görsel (sunucu 409) → "Önce rapor logosundan kaldırın." uyarısı, görsel listede
 *   O  ONAY, serbest görsel (200) → "Görsel silindi.", listeden çıkar, sayı 1 azalır
 *   DELETE sırası tam [409, 200]; sayfa hatası yok
 *   UI_BASE=http://127.0.0.1:3984 UI_OUT=<klasör> npx tsx scripts/profile/.silme-onay.harness.ts
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, firefox, webkit, type BrowserType } from "playwright";
import { createWorkspaceMock, type WorkspaceMock } from "../workspace/ui-personal-backend";
import { parseDesign, type WorkspaceDesign } from "../../lib/workspace/schema";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3984";
const SINK_PORT = process.env.UI_SINK_PORT ?? "54399";
const OUT = process.env.UI_OUT ?? "silme-onay-ui";
mkdirSync(OUT, { recursive: true });
const FREEZE_CSS = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}nextjs-portal{display:none!important}";
const REPORT = "rapor logosu (Ayarlar › Profilim)";
const USER = {
  id: "00000000-0000-4000-8000-0000000000f2", email: "ayse.yilmaz@example.invalid", full_name: "Ayşe Yılmaz", name: "Ayşe", role: "expert",
  active: true, approval_status: "approved", package_type: "premium", membership_status: "active", tenant_id: "aaaaaaaa-0000-4000-8000-0000000000f2",
  is_demo_account: false, module_permissions: { clients: true, numerology: true, human_design: true },
};

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(group: string, name: string, cond: boolean, detail: unknown = "") {
  if (cond) pass++; else { fail++; fails.push(`[${group}] ${name}`); }
  console.log(`${cond ? "PASS" : "FAIL"} [${group}] ${name}${!cond && detail !== "" ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}
const design = (v: unknown): WorkspaceDesign => { const r = parseDesign(v, { allowAssets: true }); if (!r.ok) throw new Error(`${r.error} ${r.path}`); return r.value; };
const png = (w: number, h: number, r: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r, g: 90, b: 60, alpha: 1 } } }).png().toBuffer();
async function waitFor(cond: () => boolean | Promise<boolean>, ms = 15000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return false;
}

async function runBrowser(name: string, bt: BrowserType) {
  const G = name;
  const browser = await bt.launch();
  try {
    const mock: WorkspaceMock = createWorkspaceMock({ enabled: true });
    const inReport = await mock.seedAsset("logo", await png(600, 200, 40), "rapor.png", "image/png");
    const free = await mock.seedAsset("logo", await png(400, 400, 120), "serbest.png", "image/png");
    mock.seed({ applied: design({ layout: "B" }) });
    const deletes: { id: string; status: number }[] = [];
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
        const m = url.pathname.match(/^\/api\/settings\/workspace\/assets\/([0-9a-f-]{36})$/);
        if (m && req.method() === "DELETE" && m[1] === inReport) {
          deletes.push({ id: m[1], status: 409 });
          return route.fulfill({ status: 409, json: { ok: false, code: "asset_in_use", error: `Bu görsel kullanılıyor (${REPORT}); önce rapor logosundan kaldırın.`, where: [REPORT] } });
        }
        const r = await mock.handle(req.method(), url.pathname, url.searchParams, req.postDataBuffer());
        if (m && req.method() === "DELETE") deletes.push({ id: m[1], status: r.status });
        return r.body ? route.fulfill({ status: r.status, body: r.body, contentType: r.contentType }) : route.fulfill({ status: r.status, json: r.json });
      }
      if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
      if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
      if (url.pathname.endsWith("/astroloji/access")) return route.fulfill({ status: 404, json: { error: "not_found" } });
      if (url.pathname.startsWith("/api/beslenme")) return route.fulfill({ status: 403, json: { ok: true, access: false } });
      return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], count: 0 } });
    });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.goto(BASE + "/?calisma-alanim=1", { waitUntil: "load" });
    const studio = page.locator('[role="dialog"][aria-labelledby="studio-title"]');
    await studio.waitFor({ timeout: 90000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    await studio.getByRole("tab", { name: /Logo ve Fotoğraf|Logo · Foto/ }).click();
    await studio.getByRole("button", { name: /Görsellerimi göster/ }).first().click();
    await studio.locator("li", { hasText: "400×400" }).first().waitFor({ timeout: 20000 });

    const dlg = page.locator('[role="alertdialog"]');
    const item = (dim: string) => studio.locator("li", { hasText: dim });
    const notice = async () => ((await studio.locator('[role="status"], [role="alert"]').allInnerTexts()).join(" | "));
    const openDelete = async (dim: string) => { await item(dim).first().getByRole("button", { name: /^Sil/ }).click(); await dlg.waitFor({ timeout: 10000 }); };

    // P — pencere + güvenli varsayılan odak
    await openDelete("400×400");
    ok(G, "P onay penceresi açıldı: başlık + açıklama", ((await dlg.locator("h2").textContent()) ?? "").includes("Görsel silinsin mi?")
      && ((await dlg.locator("p").first().textContent()) ?? "").includes("kalıcı olarak silinir"));
    const focusText = await page.evaluate(`new Promise((resolve) => {
      const cur = () => (document.activeElement && document.activeElement.textContent || '').trim();
      let done = false, raf = 0;
      const finish = (v) => { if (done) return; done = true; clearTimeout(stop); cancelAnimationFrame(raf); resolve(v); };
      const stop = setTimeout(() => finish(cur()), 2000);
      const tick = () => { if (done) return; if (cur() === 'Düzenlemeye devam') finish(cur()); else raf = requestAnimationFrame(tick); };
      tick();
    })`);
    ok(G, "P güvenli seçenek (Düzenlemeye devam) ilk odakta", focusText === "Düzenlemeye devam", focusText);
    await page.screenshot({ path: join(OUT, `${name}-1-onay-penceresi.png`) });

    // C1 — İptal düğmesi
    await dlg.getByRole("button", { name: "Düzenlemeye devam" }).click();
    ok(G, "C1 iptal: pencere kapandı", await waitFor(async () => (await dlg.count()) === 0, 5000));
    await page.waitForTimeout(400); // gecikmeli bir DELETE olmadığını görmek için ağ sessizliği
    ok(G, "C1 iptal: DELETE gönderilmedi, görsel listede, sayı aynı", deletes.length === 0 && (await item("400×400").count()) === 1 && mock.assetCount === 2, { deletes, n: mock.assetCount });
    await page.screenshot({ path: join(OUT, `${name}-2-iptal-sonrasi.png`) });

    // C2 — Escape ile iptal
    await openDelete("400×400");
    await page.keyboard.press("Escape");
    ok(G, "C2 Escape: pencere kapandı", await waitFor(async () => (await dlg.count()) === 0, 5000));
    await page.waitForTimeout(400);
    ok(G, "C2 Escape: DELETE gönderilmedi, görsel listede", deletes.length === 0 && (await item("400×400").count()) === 1 && mock.assetCount === 2, deletes);

    // R — onay, rapor logosunda kullanılan görsel → 409 uyarısı, silinmez
    await openDelete("600×200");
    await dlg.getByRole("button", { name: "Evet, sil" }).click();
    const expR = `Bu görsel kullanılıyor: ${REPORT}. Önce rapor logosundan kaldırın.`;
    ok(G, `R onay + rapor logosu → "${expR}"`, await waitFor(async () => (await notice()).includes(expR)), await notice());
    ok(G, "R görsel listede kaldı (silinmedi)", (await item("600×200").count()) === 1 && mock.assetCount === 2);
    await page.screenshot({ path: join(OUT, `${name}-3-rapor-logosu-uyarisi.png`) });

    // O — onay, serbest görsel → silinir
    await openDelete("400×400");
    await dlg.getByRole("button", { name: "Evet, sil" }).click();
    ok(G, 'O onay → "Görsel silindi."', await waitFor(async () => (await notice()).includes("Görsel silindi.")), await notice());
    ok(G, "O görsel listeden çıktı, sayı 1 azaldı", (await waitFor(async () => (await item("400×400").count()) === 0)) && mock.assetCount === 1);
    await page.screenshot({ path: join(OUT, `${name}-4-silindi.png`) });

    ok(G, "DELETE sırası tam [409, 200] (iptallerde istek yok)", JSON.stringify(deletes.map((d) => d.status)) === "[409,200]", deletes);
    ok(G, "sayfa hatası yok", errors.length === 0, errors);
    await ctx.close();
  } finally {
    await browser.close();
  }
}

(async () => {
  for (const [n, bt] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]] as [string, BrowserType][]) {
    try { await runBrowser(n, bt); } catch (e) { ok(n, "senaryo tamamlandı (istisna yok)", false, String(e).slice(0, 300)); }
  }
  console.log(`\nsilme onayı (3 tarayıcı): ${pass} PASS / ${fail} FAIL`);
  if (fails.length) console.log(fails.join("\n"));
  process.exit(fail ? 1 : 0);
})();
