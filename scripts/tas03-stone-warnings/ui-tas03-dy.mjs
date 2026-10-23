// TAS-03 — Danışan Yolculuğu → Doğaltaş Önerileri: taş atarken sistem uyarı penceresi.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort).
// Sahte /api/dogaltas/stone-warnings, düzeltilmiş sunucunun döndürdüğü biçimde çok kayıtlı uyarı döner
// (bilgi kaydından gelen etkin uyarı). Doğrulananlar: pencere açılır, çok satırlı uyarı okunur,
// taşa bağlantı doğru, "Yine de Kaydet" öncesi yazma YOK, sistem uyarısı uzmanın "Uyarı" alanına KOPYALANMAZ.
// Çalıştırma: node scripts/tas03-stone-warnings/ui-tas03-dy.mjs  (UI_BASE ile port)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT_ID = "c0000000-0000-4000-8000-000000000031";
const STONE_ID = "f0000000-0000-4000-8000-0000000000b1";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e3", email: "zz-expert31@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { clients: true, appointments: true, stones: true },
};
const CLIENT = { id: CLIENT_ID, tenant_id: TENANT, ad: "ZZ Ayşe", soyad: "Yılmaz", created_at: "2026-09-01T09:00:00.000Z" };
const W1 = "ZZ UYARI A: hamilelikte kullanılmaz.";
const W2 = "ZZ UYARI B: kalp pili olanlar dikkat.";
const VIEWPORTS = [{ width: 360, height: 780, tag: "mobil-360" }, { width: 820, height: 1180, tag: "tablet-820" }, { width: 1440, height: 900, tag: "masaustu-1440" }];

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError/i.test(e));

async function run(vp) {
  const g = `dy-tas-uyari-${vp.tag}`;
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 768, locale: "tr-TR" });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: BASE }]);
  const errors = [];
  const writes = [];
  const warnReqs = [];
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (url.pathname === `/api/clients/${CLIENT_ID}`) return route.fulfill({ status: 200, json: { client: CLIENT } });
    if (url.pathname === "/api/dogaltas/stone-warnings") {
      warnReqs.push(body);
      return route.fulfill({ status: 200, json: { ok: true, warnings: [{ stoneId: STONE_ID, stoneName: "ZZ Kehribar", warningText: `${W1}\n\n${W2}`, warningTags: ["Hamilelik"] }] } });
    }
    if (url.pathname === `/api/clients/${CLIENT_ID}/stones`) {
      if (req.method() === "GET") return route.fulfill({ status: 200, json: { ok: true, stones: [] } });
      writes.push({ m: req.method(), body });
      return route.fulfill({ status: 200, json: { ok: true, stone: { id: "s0000000-0000-4000-8000-000000000001", ...body } } });
    }
    if (url.pathname.startsWith("/api/beslenme/")) return route.fulfill({ status: 403, json: { ok: false, error: "forbidden" } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], items: [], notes: [], appointments: [], count: 0 } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  try {
    await page.goto(`${BASE}/dashboard/clients/${CLIENT_ID}?tab=taslar`, { waitUntil: "load" });
    await page.locator("#tabpanel-taslar").waitFor({ timeout: 30000 });
    await sleep(800);
    await page.getByRole("button", { name: "+ Yeni Taş Ekle" }).first().click();
    const name = page.locator('#tabpanel-taslar input:visible').first();
    await name.fill("zz kehribar");
    await page.getByRole("button", { name: /Taşı Kaydet/ }).first().click();
    const modalText = page.getByText(W1, { exact: false }).first();
    await modalText.waitFor({ timeout: 8000 });
    ok(g, "uyarı API'si taş adıyla çağrıldı", warnReqs.length === 1 && JSON.stringify(warnReqs[0]?.stoneNames) === JSON.stringify(["zz kehribar"]), JSON.stringify(warnReqs));
    const p = await modalText.innerText();
    ok(g, "bilgi kaydından gelen çok kayıtlı uyarı pencerede, ayrı satırlarda", p.includes(W1) && p.includes(W2) && /\n/.test(p), JSON.stringify(p));
    ok(g, "uyarı etiketi görünür", await page.getByText("Hamilelik", { exact: true }).first().isVisible());
    const href = await page.locator(`a[href="/dogaltas/dogaltas-listesi/${STONE_ID}"]`).count();
    ok(g, "Doğaltaş kaydına bağlantı uyarılı taşa gider", href === 1);
    ok(g, "onaydan önce danışan kaydına YAZMA yok", writes.length === 0, JSON.stringify(writes));
    const box = await modalText.boundingBox();
    ok(g, "pencere metni ekrana sığıyor (yatay taşma yok)", box && box.x >= 0 && box.x + box.width <= vp.width + 1);
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/tas03-dy-${vp.tag}.png` }).catch(() => {});
    await page.getByRole("button", { name: "Yine de Kaydet" }).click();
    await sleep(900);
    const post = writes.find((w) => w.m === "POST");
    ok(g, "'Yine de Kaydet' → tek POST", writes.filter((w) => w.m === "POST").length === 1, JSON.stringify(writes));
    ok(g, "sistem uyarısı uzmanın 'Uyarı' alanına KOPYALANMADI (uzman değerlendirmesi ayrı)", post && !String(post.body?.warning_text ?? "").includes("ZZ UYARI"), JSON.stringify(post?.body));
    ok(g, "JS hata yok", realErrors(errors).length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of VIEWPORTS) await run(vp);
await browser?.close();
console.log(`\nTAS-03 DY UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
