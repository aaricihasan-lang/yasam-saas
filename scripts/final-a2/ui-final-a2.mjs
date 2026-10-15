// Final-A2 — UI davranış testleri (Playwright, yerel build, ağ-mock). Prod'a / dış ağa temas YOK.
// Çalıştırma (scripts/pre-sale-a2b/ui/README.md ile aynı): fake-supabase-sink + sahte env build + start,
//   node scripts/final-a2/ui-final-a2.mjs   (UI_BASE ile port; ONLY=kvkk,bell,hero)
import { newPage, makeUser, BASE, sleep, close } from "../pre-sale-a2b/ui/ui-lib.mjs";

let pass = 0;
let fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError|internetdisconnected/i.test(e));
const VP = { mobile: { width: 390, height: 844 }, web: { width: 1280, height: 900 } };

// ── #2 Kayıt sonrası KVKK paneli: varsayılan kapalı, açılınca içerik tam ─────────────────────
async function testKvkk() {
  const CID = "c0000000-0000-4000-8000-000000000a01";
  for (const [tag, viewport] of Object.entries(VP)) {
    const g = `#2-kvkk-kayit-${tag}`;
    const { page, ctx, calls, pageErrors } = await newPage({
      user: makeUser("expert"), viewport,
      routes: [
        ["GET", /^\/api\/clients\?/, () => ({ status: 200, json: { clients: [] } })],
        ["POST", /^\/api\/clients$/, () => ({ status: 200, json: { ok: true, client: { id: CID } } })],
        ["GET", new RegExp(`^/api/clients/${CID}/consents`), () => ({ status: 200, json: { ok: true, history: [], current: {},
          summary: { informed: false, explicitConsent: false, empty: true, badge: "KVKK kaydı yok", tone: "none" } } })],
      ],
    });
    try {
      await page.goto(`${BASE}/danisan-yolculugu/kayit`, { waitUntil: "load" });
      const ad = page.getByPlaceholder(/ad/i).first();
      await ad.waitFor({ timeout: 15000 });
      await ad.fill("ZZ Kvkk");
      await page.locator("input").nth(1).fill("TEST");
      await page.getByRole("button", { name: "Danışanı Kaydet" }).click();
      const toggle = page.getByTestId("kvkk-toggle");
      await toggle.waitFor({ timeout: 10000 });
      await sleep(600);
      ok(g, "kayıt sonrası KVKK paneli görünür, varsayılan KAPALI", (await toggle.getAttribute("aria-expanded")) === "false" && !(await page.getByTestId("kvkk-body").isVisible()));
      const panelH = await page.locator('section[aria-label="KVKK aydınlatma ve onam kayıtları"]').evaluate((el) => el.getBoundingClientRect().height);
      ok(g, "kapalıyken kompakt (≤ 90px)", panelH <= 90, `h=${panelH}`);
      await toggle.click();
      await sleep(400);
      ok(g, "açınca içerik görünür (kayıp yok)", (await toggle.getAttribute("aria-expanded")) === "true" && (await page.getByTestId("kvkk-body").isVisible()));
      const body = await page.getByTestId("kvkk-body").innerText();
      ok(g, "onam formu ve 'Sonra tamamla' içerikte", /Sonra/i.test(body) && (await page.getByTestId("kvkk-body").locator("select, button").count()) >= 2, body.slice(0, 200));
      await toggle.click();
      await sleep(300);
      ok(g, "tekrar kapanır", (await toggle.getAttribute("aria-expanded")) === "false");
      ok(g, "yatay taşma yok", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      ok(g, "onam POST'u yapılmadı (yalnız açıp kapatma)", !calls.some((c) => c.method === "POST" && /consents/.test(c.path)));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #4 Bildirim zili erişilebilirlik ────────────────────────────────────────────────────────
const uid = (p, i) => `${p}0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
/** WT8 ile aynı bildirim beslemesi: bugünün 3 randevusu (okunmamış). */
function apptItems(n) {
  const base = Date.now() + 20 * 60_000;
  return Array.from({ length: n }, (_, i) => ({
    id: uid("9", i + 1), title: `ZZ Randevu ${i + 1}`, appointment_date: new Date(base + i * 60_000).toISOString(),
    status: "bekliyor", client_id: uid("c", i + 1), clientName: `ZZ Danışan ${i + 1}`, canOpenClient: true,
  }));
}
async function testBell() {
  for (const [tag, viewport] of Object.entries(VP)) {
    const g = `#4-zil-a11y-${tag}`;
    const { page, ctx, calls, pageErrors } = await newPage({ user: makeUser("expert"), viewport, routes: [
      ["GET", /^\/api\/appointments\/notifications$/, () => ({ status: 200, json: { ok: true, items: apptItems(3) } })],
    ] });
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const bell = page.getByRole("button", { name: /^Bildirimler/ }).first();
      await bell.waitFor({ timeout: 20000 });
      await sleep(1500);
      ok(g, "zil: aria-haspopup (menü anlamı) YOK, aria-expanded=false", (await bell.getAttribute("aria-haspopup")) === null && (await bell.getAttribute("aria-expanded")) === "false");
      ok(g, "okunmamış duyurusu için aria-live bölgesi var", (await page.getByTestId("notification-live").getAttribute("aria-live")) === "polite");
      const label = await bell.getAttribute("aria-label");
      const live = (await page.getByTestId("notification-live").innerText()).trim();
      const badge = (await page.getByTestId("notification-badge").count()) ? (await page.getByTestId("notification-badge").innerText()).trim() : "";
      ok(g, "3 okunmamış: etiket + rozet + canlı bölge tutarlı", badge === "3" && label === "Bildirimler, 3 okunmamış" && live === "3 okunmamış bildirim", `label=${label} badge=${badge} live=${live}`);
      const writesBefore = calls.filter((c) => c.method !== "GET").length;
      await bell.focus();
      await page.keyboard.press("Enter");
      const panel = page.getByTestId("notification-panel");
      await panel.waitFor({ timeout: 5000 });
      await sleep(400);
      ok(g, "panel dialog + başlıkla etiketli", (await panel.getAttribute("role")) === "dialog" && (await panel.getAttribute("aria-labelledby")) !== null);
      ok(g, "açılınca odak panelde", await page.evaluate(() => document.activeElement?.getAttribute("data-testid") === "notification-panel"));
      await page.keyboard.press("Tab");
      ok(g, "Tab → panel İÇİNDEKİ ilk öğe", await page.evaluate(() => !!document.activeElement?.closest('[data-testid="notification-panel"]') && document.activeElement?.getAttribute("data-testid") !== "notification-panel"));
      // Son öğeye kadar Tab; sonraki Tab zile döner ve paneli kapatır
      for (let i = 0; i < 20; i++) {
        const atLast = await page.evaluate(() => {
          const p = document.querySelector('[data-testid="notification-panel"]');
          if (!p) return true;
          const f = [...p.querySelectorAll('a[href], button:not([disabled])')];
          return document.activeElement === f[f.length - 1];
        });
        if (atLast) break;
        await page.keyboard.press("Tab");
      }
      await page.keyboard.press("Tab");
      await sleep(300);
      ok(g, "son öğeden Tab → panel kapanır, odak zile döner", (await panel.count()) === 0 && (await page.evaluate(() => /^Bildirimler/.test(document.activeElement?.getAttribute("aria-label") ?? ""))));
      await page.keyboard.press("Enter");
      await panel.waitFor({ timeout: 5000 });
      await page.keyboard.press("Shift+Tab");
      await sleep(200);
      ok(g, "panelden Shift+Tab → zile döner", await page.evaluate(() => /^Bildirimler/.test(document.activeElement?.getAttribute("aria-label") ?? "")));
      await page.keyboard.press("Escape");
      await sleep(300);
      ok(g, "Esc kapatır, odak zilde", (await panel.count()) === 0 && (await page.evaluate(() => /^Bildirimler/.test(document.activeElement?.getAttribute("aria-label") ?? ""))));
      ok(g, "açıp kapatmak yazma YAPMAZ / okunmamışı değiştirmez", calls.filter((c) => c.method !== "GET").length === writesBefore && (await bell.getAttribute("aria-label")) === label);
      ok(g, "ana sayfa hero kaymadı (odak sonrası)", await page.evaluate(() => [...document.querySelectorAll("section")].every((s) => s.scrollLeft === 0)));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #6 Ana sayfa hero: gizli yatay/dikey taşma yok ──────────────────────────────────────────
async function testHero() {
  for (const width of [360, 390, 768, 1024, 1440, 1920]) {
    const g = `#6-hero-${width}`;
    const { page, ctx, pageErrors } = await newPage({ user: makeUser("expert"), viewport: { width, height: 900 } });
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.getByTestId("home-hero-glow").waitFor({ timeout: 20000 });
      await sleep(1200);
      const m = await page.evaluate(() => {
        const glow = document.querySelector('[data-testid="home-hero-glow"]');
        const sec = glow.closest("section");
        return { sw: sec.scrollWidth, cw: sec.clientWidth, sh: sec.scrollHeight, ch: sec.clientHeight, docW: document.documentElement.scrollWidth, vw: innerWidth };
      });
      ok(g, "hero bölümü yatay taşmıyor (scrollWidth = clientWidth)", m.sw <= m.cw, JSON.stringify(m));
      ok(g, "hero bölümü dikey taşmıyor", m.sh <= m.ch, JSON.stringify(m));
      ok(g, "sayfa yatay kaymıyor", m.docW <= m.vw, JSON.stringify(m));
      // Programatik kaydırma/odak denemesi: hero kaymaz, başlık kesilmez
      const after = await page.evaluate(() => {
        const sec = document.querySelector('[data-testid="home-hero-glow"]').closest("section");
        sec.scrollLeft = 200;
        sec.querySelector("button, a")?.scrollIntoView({ inline: "end" });
        const h = sec.querySelector("h1")?.getBoundingClientRect();
        return { sl: sec.scrollLeft, hLeft: h ? h.left : null, secLeft: sec.getBoundingClientRect().left };
      });
      ok(g, "programatik kaydırma sonrası scrollLeft=0, başlık kesilmez", after.sl === 0 && after.hLeft !== null && after.hLeft >= after.secLeft, JSON.stringify(after));
      ok(g, "dekoratif katman tıklanamaz/okunmaz", await page.evaluate(() => { const g = document.querySelector('[data-testid="home-hero-glow"]'); return g.getAttribute("aria-hidden") === "true" && getComputedStyle(g).pointerEvents === "none"; }));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { kvkk: testKvkk, bell: testBell, hero: testHero };
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
for (const [k, fn] of Object.entries(ALL)) {
  if (only.length && !only.includes(k)) continue;
  await fn();
}
await close();
console.log(`\nFinal-A2 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
