// Manuel test Madde 20 — Danışan sekmeleri: Beslenme + Randevular GÖRSEL olarak yan yana (Playwright, yerel build,
// ağ-mock; prod'a SIFIR temas). DOM index testi YETMEZ → gerçek kutu ölçümü (aynı satır/Y bandı, sağında, taşma yok).
// Çalıştırma: scripts/wt9/ui-wt9.mjs ile aynı (fake-supabase-sink + sahte env build + `next start -p 3911`):
//   node scripts/manual-14-20/ui-m20.mjs   (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT_ID = "c0000000-0000-4000-8000-000000000020";
const ALL_PERMS = ["clients", "appointments", "stones", "yasam_hafizasi", "human_design"];
const userWith = (perms) => ({
  id: "00000000-0000-4000-8000-0000000000e2", email: "zz-expert20@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: Object.fromEntries(perms.map((k) => [k, true])),
});
const CLIENT = {
  id: CLIENT_ID, tenant_id: TENANT, ad: "ZZ Ayşe", soyad: "Yılmaz", telefon: "0500 000 00 00", dogum: "1990-05-12", gorusme: "2026-10-01",
  burc: "Boğa", kan: "A Rh+", mizac: "Sıcak", created_at: "2026-09-01T09:00:00.000Z",
};
const DESKTOP = [1920, 1536, 1440, 1366, 1280, 1024];
const MOBILE = [768, 390, 375];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function openClient(width, perms) {
  browser ??= await chromium.launch();
  const user = userWith(perms);
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 768, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  const errors = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, user);
  await ctx.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    if (url.pathname === `/api/clients/${CLIENT_ID}`) return route.fulfill({ status: 200, json: { client: CLIENT } });
    // Beslenme paneli içeriği bu testin konusu değil (yalnız sekme yerleşimi) → erişim yok yanıtı.
    if (url.pathname.startsWith("/api/beslenme/")) return route.fulfill({ status: 403, json: { ok: false, error: "forbidden" } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], notes: [], appointments: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}`, { waitUntil: "load" });
  await page.locator("#tab-randevular").waitFor({ timeout: 20000 });
  await page.locator("#tab-beslenme").waitFor({ timeout: 20000 });
  if (perms.includes("yasam_hafizasi")) await page.locator("#tab-hafiza").waitFor({ timeout: 15000 }).catch(() => undefined);
  await sleep(500);
  return { ctx, page, errors };
}

/** Sekme kutuları + taşma ölçümü. `ungroup`: eski davranışı (çift grubu yok) yeniden üretmek için grubu aç. */
async function measure(page, { ungroup = false } = {}) {
  return page.evaluate((ungroup) => {
    const list = document.querySelector('[role="tablist"]');
    if (ungroup) {
      for (const g of list.querySelectorAll("[data-tab-group]")) { while (g.firstChild) list.insertBefore(g.firstChild, g); g.remove(); }
    }
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cy: r.y + r.height / 2 }; };
    const tabs = [...list.querySelectorAll('[role="tab"]')].map((el) => ({ id: el.id.replace("tab-", ""), ...box(el) }));
    const word = [...list.querySelectorAll("button")].find((b) => !b.getAttribute("role"));
    return {
      tabs, word: word ? box(word) : null,
      rows: [...new Set(tabs.map((t) => Math.round(t.y)))].length,
      docOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      listOverflow: list.scrollWidth > list.clientWidth + 1,
      vw: window.innerWidth,
      grouped: Boolean(list.querySelector('[data-tab-group="beslenme+randevular"]')),
    };
  }, ungroup);
}
function pairCheck(m) {
  const b = m.tabs.find((t) => t.id === "beslenme"), r = m.tabs.find((t) => t.id === "randevular");
  const sameRow = Math.abs(b.cy - r.cy) <= 2 && Math.abs(b.y - r.y) <= 2;
  return { b, r, sameRow, rightOf: r.x >= b.x + b.w - 0.5, adjacent: r.x - (b.x + b.w) <= 12 };
}

// Owner kesin sırası (2026-10-17) — sekmeler + en sonda Word Raporu butonu.
const OWNER_ORDER = ["genel", "anamnez", "notlar", "seanslar", "odevler", "analizler", "humandesign", "taslar", "beslenme", "hafiza", "randevular", "yolculuk", "ucretlendirme"];
const OWNER_LABELS = ["Genel Bilgiler", "Anamnez", "Notlar", "Seanslar", "Ödevler", "Çakra Analizleri", "🧬 Human Design", "Doğaltaş Önerileri", "🥗 Beslenme", "🧠 Yaşam Hafızası", "Randevular", "✦ Danışan Yolculuğu", "Ücretlendirme"];
/** Görsel sıra: satırlara göre (Y), satır içinde soldan sağa (X) — wrap olsa da okuma sırası. */
function visualOrder(m) {
  const items = [...m.tabs.map((t) => ({ id: t.id, x: t.x, y: t.y })), ...(m.word ? [{ id: "word", x: m.word.x, y: m.word.y }] : [])];
  return items.sort((p, q) => (Math.abs(p.y - q.y) > 4 ? p.y - q.y : p.x - q.x)).map((t) => t.id);
}

async function checkOrder(g, w, perms) {
  const { ctx, page, errors } = await openClient(w, perms);
  try {
    const m = await measure(page);
    if (process.env.SHOT_DIR && perms.length === ALL_PERMS.length) await page.locator('[role="tablist"]').screenshot({ path: `${process.env.SHOT_DIR}/tabs-${w}.png` });
    const expected = OWNER_ORDER.filter((id) => m.tabs.some((t) => t.id === id));
    const dom = m.tabs.map((t) => t.id);
    ok(g, "DOM sırası = owner kesin sırası", JSON.stringify(dom) === JSON.stringify(expected), dom.join(","));
    ok(g, "GÖRSEL sıra (wrap dahil) = owner sırası + Word Raporu en sonda", JSON.stringify(visualOrder(m)) === JSON.stringify([...expected, "word"]), visualOrder(m).join(","));
    ok(g, "yatay taşma yok (sayfa + sekme çubuğu)", !m.docOverflow && !m.listOverflow);
    ok(g, "tüm sekmeler ekranda", m.tabs.every((t) => t.x >= 0 && t.x + t.w <= m.vw + 1));
    ok(g, "sekmeler aşırı küçülmedi (≥40px yükseklik)", m.tabs.every((t) => t.h >= 40));
    if (perms.length === ALL_PERMS.length) {
      const labels = await page.locator('[role="tab"]').allInnerTexts();
      ok(g, "görünen adlar owner sırasında", JSON.stringify(labels.map((l) => l.trim())) === JSON.stringify(OWNER_LABELS), labels.join(" | "));
    }
    ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    return m;
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

async function testDesktop() {
  for (const perms of [ALL_PERMS, ["clients", "appointments", "stones"]]) {
    const tag = perms.length === ALL_PERMS.length ? "13-sekme" : "11-sekme";
    for (const w of DESKTOP) await checkOrder(`Sıra-masaüstü-${w}-${tag}`, w, perms);
  }
}

async function testOwnerReproduction() {
  // Önceki Madde 20 kuralı (Beslenme+Randevular bitişik) owner'ın yeni sırasıyla kalktı: kırılmaz grup YOK.
  const g = "Sıra-gruplama-kaldırıldı";
  const { ctx, page } = await openClient(1366, ALL_PERMS);
  try {
    const m = await measure(page);
    ok(g, "kırılmaz sekme grubu yok (her sekme doğal sarılır)", !(await page.locator("[data-tab-group]").count()) && !m.grouped);
    const ids = m.tabs.map((t) => t.id);
    ok(g, "Human Design Çakra Analizleri'nden HEMEN sonra, Doğaltaş Önerileri Human Design'den HEMEN sonra", ids.indexOf("humandesign") === ids.indexOf("analizler") + 1 && ids.indexOf("taslar") === ids.indexOf("humandesign") + 1);
    ok(g, "sona yakın grup: Yaşam Hafızası → Randevular → Danışan Yolculuğu → Ücretlendirme → Word", JSON.stringify(visualOrder(m).slice(-5)) === JSON.stringify(["hafiza", "randevular", "yolculuk", "ucretlendirme", "word"]));
  } finally { await ctx.close(); }
}

async function testMobile() {
  for (const w of MOBILE) {
    const g = `Sıra-mobil-${w}`;
    const m = await checkOrder(g, w, ALL_PERMS);
    if (m) ok(g, "mobilde doğal sarma (çok satır, tek satıra sıkıştırma YOK)", m.rows >= 2, m.rows);
  }
}

async function testChakraLabelAndTabs() {
  for (const w of [1366, 390]) {
    const g = `Çakra-Analizleri-ve-sekmeler-${w}`;
    const { ctx, page, errors } = await openClient(w, ALL_PERMS);
    try {
      const tab = page.locator("#tab-analizler");
      ok(g, "'Analizler' sekmesinin görünen adı 'Çakra Analizleri'", (await tab.innerText()).trim() === "Çakra Analizleri");
      ok(g, "tek başına 'Analizler' adlı sekme kalmadı", (await page.getByRole("tab", { name: "Analizler", exact: true }).count()) === 0);
      ok(g, "tab id / panel aynı (tab-analizler → tabpanel-analizler)", (await tab.getAttribute("aria-controls")) === "tabpanel-analizler");
      ok(g, "Human Design ayrı sekme olarak duruyor", (await page.locator("#tab-humandesign").count()) === 1 && (await page.locator("#tab-humandesign").innerText()).trim() === "🧬 Human Design");
      ok(g, "'Doğaltaş Önerileri' adı aynı", (await page.locator("#tab-taslar").innerText()).trim() === "Doğaltaş Önerileri");
      // tüm sekmeler açılıyor, aktif sekme state'i doğru
      for (const id of OWNER_ORDER) {
        await page.locator(`#tab-${id}`).click();
        await sleep(350);
        const sel = await page.locator('[role="tab"][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.id));
        const panelVisible = await page.locator(`#tabpanel-${id}`).isVisible().catch(() => false);
        ok(g, `${id}: tıklanınca tek aktif sekme + kendi paneli görünür`, sel.length === 1 && sel[0] === `tab-${id}` && panelVisible, JSON.stringify({ sel, panelVisible }));
      }
      // ?tab= deep-link + yenileme
      await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}?tab=analizler`, { waitUntil: "load" });
      await page.locator("#tab-analizler").waitFor({ timeout: 20000 });
      await sleep(600);
      ok(g, "?tab=analizler deep-link Çakra Analizleri'ni açar", (await page.locator("#tab-analizler").getAttribute("aria-selected")) === "true" && (await page.locator("#tabpanel-analizler").isVisible()));
      await page.reload({ waitUntil: "load" });
      await page.locator("#tab-analizler").waitFor({ timeout: 20000 });
      await sleep(600);
      ok(g, "yenileme sonrası ?tab= sekmesi korunur", (await page.locator("#tab-analizler").getAttribute("aria-selected")) === "true");
      for (const id of ["humandesign", "taslar", "hafiza", "yolculuk", "ucretlendirme"]) {
        await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}?tab=${id}`, { waitUntil: "load" });
        await page.locator(`#tab-${id}`).waitFor({ timeout: 20000 });
        await sleep(500);
        ok(g, `?tab=${id} deep-link korunur`, (await page.locator(`#tab-${id}`).getAttribute("aria-selected")) === "true");
      }
      // Word Raporu butonu en sonda ve tıklanabilir (istek atılır)
      const word = page.locator('[role="tablist"] button:not([role])');
      const wordReq = page.waitForRequest((r) => /\/api\/clients\/[^/]+\/word-report/.test(r.url()), { timeout: 8000 }).then(() => true, () => false);
      await word.click();
      ok(g, "Word Raporu butonu çalışır (rapor isteği gönderilir)", await wordReq);
      ok(g, "yatay taşma yok", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testTabSwitch() {
  const g = "M20-sekme-geçişi";
  const { ctx, page, errors } = await openClient(1366, ALL_PERMS);
  try {
    await page.locator("#tab-randevular").click();
    await sleep(400);
    ok(g, "Randevular tıklanınca seçili + paneli görünür", (await page.locator("#tab-randevular").getAttribute("aria-selected")) === "true" && (await page.locator("#tabpanel-randevular").isVisible()));
    await page.locator("#tab-beslenme").click();
    await sleep(400);
    ok(g, "Beslenme tıklanınca seçili", (await page.locator("#tab-beslenme").getAttribute("aria-selected")) === "true");
    await page.locator("#tab-randevular").focus();
    ok(g, "klavye odağı Randevular'a gidebilir", await page.evaluate(() => document.activeElement?.id === "tab-randevular"));
    ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

async function testStoneTabLabel() {
  // Son UX: "Taşlar" → "Doğaltaş Önerileri" — YALNIZ görünen ad; id / ?tab= / panel / izin aynı.
  for (const w of [1366, 390]) {
    const g = `Taş-sekmesi-etiketi-${w}`;
    const { ctx, page, errors } = await openClient(w, ALL_PERMS);
    try {
      const tab = page.locator("#tab-taslar");
      ok(g, "sekme görünen adı 'Doğaltaş Önerileri'", (await tab.innerText()).trim() === "Doğaltaş Önerileri");
      ok(g, "'Taşlar' adlı sekme kalmadı", (await page.getByRole("tab", { name: "Taşlar", exact: true }).count()) === 0);
      ok(g, "sekme kimliği/paneli aynı (tab-taslar → tabpanel-taslar)", (await tab.getAttribute("aria-controls")) === "tabpanel-taslar");
      await tab.click();
      await sleep(500);
      ok(g, "tıklanınca seçili + panel açılır", (await tab.getAttribute("aria-selected")) === "true" && (await page.locator("#tabpanel-taslar").isVisible()));
      await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}?tab=taslar`, { waitUntil: "load" });
      await page.locator("#tab-taslar").waitFor({ timeout: 20000 });
      await sleep(600);
      ok(g, "?tab=taslar route'u aynı sekmeyi açar", (await page.locator("#tab-taslar").getAttribute("aria-selected")) === "true");
      const m = await measure(page);
      const p = pairCheck(m);
      void p;
      ok(g, "uzun etiketle taşma yok", !m.docOverflow && !m.listOverflow);
      ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
  // izin: clients izni olmayan kullanıcı için davranış değişmedi → sekme kaydında izin alanı yok (birim testte).
}

const ALL = { testDesktop, testOwnerReproduction, testMobile, testTabSwitch, testStoneTabLabel, testChakraLabelAndTabs };
const only = process.env.ONLY ? process.env.ONLY.split(",") : Object.keys(ALL);
try {
  for (const k of only) await ALL[k]();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, e);
} finally {
  await browser?.close();
}
console.log(`\nMadde 20 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
