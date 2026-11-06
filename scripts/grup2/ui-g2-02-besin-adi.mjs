// G2-02 — Danışan Yolculuğu › Beslenme › Tercih Edilen / Kaçınılan › "Besin adı": Android şifre yöneticisi
// ipucu (Anamnez yöntemi) yalnız bu alanda; "Not" alanı ve klavye öznitelikleri aynen; ekleme / boş ad uyarısı /
// silme davranışı aynen. Android uygulama WebView UA + masaüstü. Ağ-mock, prod'a SIFIR temas.
// NOT: Şifre yöneticisi açılır kutusu headless tarayıcıda çizilmez → gerçek Android cihaz testi Owner'da.
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-02-besin-adi.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3975";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const CLIENT = "c0000000-0000-4000-8000-000000000002";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { clients: true, beslenme: true },
};
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
const NEW_ATTRS = { name: "beslenme_tercih_besin_adi", autocomplete: "off", "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other" };
// main'de Besin adı ve Not alanlarının öznitelik adları (önce-sonra karşılaştırması)
const MAIN_ATTR_NAMES = JSON.parse(process.env.G2_02_MAIN_ATTRS ?? "null");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function run(vp) {
  const g = `g2-02-${vp.tag}`;
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, ...(vp.ua ? { userAgent: vp.ua } : {}) });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  let prefs = [{ id: "p0000000-0000-4000-8000-000000000001", stance: "avoided", food_label: "ZZ Süt", note: null, created_at: "2026-10-01T08:00:00.000Z" }];
  const writes = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    const B = `/api/beslenme/clients/${CLIENT}`;
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (p === `/api/clients/${CLIENT}`) return route.fulfill({ status: 200, json: { ok: true, client: { id: CLIENT, tenant_id: TENANT, first_name: "ZZ", last_name: "Beslenme", full_name: "ZZ Beslenme", row_version: 1 } } });
    if (p === `${B}/profile`) return route.fulfill({ status: 200, json: { ok: true, profile: {}, client: { id: CLIENT, full_name: "ZZ Beslenme" } } });
    if (p === `${B}/preferences` && req.method() === "GET") return route.fulfill({ status: 200, json: { ok: true, preferences: prefs } });
    if (p === `${B}/preferences` && req.method() === "POST") {
      const body = req.postDataJSON(); writes.push({ m: "POST", body });
      const pref = { id: `p0000000-0000-4000-8000-00000000000${prefs.length + 1}`, created_at: "2026-11-01T08:00:00.000Z", ...body };
      prefs = [...prefs, pref];
      return route.fulfill({ status: 200, json: { ok: true, preference: pref } });
    }
    if (p.startsWith(`${B}/preferences/`) && req.method() === "DELETE") {
      const id = p.split("/").pop(); writes.push({ m: "DELETE", id });
      prefs = prefs.filter((x) => x.id !== id);
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    if (p.startsWith(B)) return route.fulfill({ status: 200, json: { ok: true, measurements: [], allergens: [], families: [], version: 1 } });
    if (p === "/api/beslenme/allergens" || p.includes("allergen")) return route.fulfill({ status: 200, json: { ok: true, allergens: [] } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, preferences: [], measurements: [], allergens: [], families: [] } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  const hit = (loc) => (touch ? loc.tap() : loc.click());
  try {
    await page.goto(`${BASE}/dashboard/clients/${CLIENT}?tab=beslenme`, { waitUntil: "load" });
    const heading = page.getByText("Tercih Edilen / Kaçınılan Besinler").first();
    await heading.waitFor({ timeout: 90000 });
    await sleep(500);
    await hit(heading); // bölüm varsayılan kapalı (akordeon)
    await sleep(500);
    const section = page.locator("section, details, div").filter({ has: page.getByText("Tercih Edilen / Kaçınılan Besinler") }).filter({ has: page.getByRole("button", { name: "Düzenle" }) }).last();
    await section.waitFor({ timeout: 10000 });
    await hit(section.getByRole("button", { name: "Düzenle" }).first());
    const food = page.getByPlaceholder("Besin adı*");
    const note = page.getByPlaceholder("Not", { exact: true });
    await food.waitFor({ timeout: 10000 });
    const sec = page.locator("section, details, div").filter({ has: page.getByText("Tercih Edilen / Kaçınılan Besinler") }).filter({ has: page.getByPlaceholder("Besin adı*") }).last();
    const attrs = (loc) => loc.evaluate((el) => Object.fromEntries([...el.attributes].filter((a) => a.name !== "value").map((a) => [a.name, a.value])));
    const fa = await attrs(food), na = await attrs(note);
    console.log(`   Besin adı öznitelikleri: ${JSON.stringify(fa)}\n   Not öznitelikleri: ${JSON.stringify(na)}`);
    ok(g, "Besin adı: benzersiz ad + otomatik doldurma kapalı + parola yöneticisi yoksay ipuçları", Object.entries(NEW_ATTRS).every(([k, v]) => fa[k] === v), JSON.stringify(fa));
    ok(g, "Besin adı: sayfada bu adla tek alan", (await page.locator('[name="beslenme_tercih_besin_adi"]').count()) === 1);
    ok(g, "Besin adı: klavye öznitelikleri eklenmedi (type/inputmode/autocapitalize/autocorrect/spellcheck yok)", ["type", "inputmode", "autocapitalize", "autocorrect", "spellcheck"].every((k) => !(k in fa)), JSON.stringify(fa));
    ok(g, "Not alanı: yeni öznitelik yok", !("name" in na) && !("autocomplete" in na) && !Object.keys(na).some((k) => k.startsWith("data-")), JSON.stringify(na));
    if (MAIN_ATTR_NAMES) {
      ok(g, "Not alanı öznitelikleri main ile birebir", JSON.stringify(Object.keys(na).sort()) === JSON.stringify(MAIN_ATTR_NAMES.note), `main=${MAIN_ATTR_NAMES.note} dal=${Object.keys(na).sort()}`);
      ok(g, "Besin adı: main'e göre YALNIZ 5 yeni öznitelik", JSON.stringify(Object.keys(fa).filter((k) => !(k in NEW_ATTRS)).sort()) === JSON.stringify(MAIN_ATTR_NAMES.food), `main=${MAIN_ATTR_NAMES.food} dal=${Object.keys(fa).sort()}`);
    }
    // Boş ad → mevcut uyarı, yazma yok
    await hit(sec.getByRole("button", { name: "Ekle", exact: true }));
    await sleep(400);
    ok(g, "boş Besin adı: mevcut 'Besin adı gerekli.' uyarısı, kayıt yok", /Besin adı gerekli\./.test(await page.locator("body").innerText()) && writes.length === 0);
    // Kaçınılan ekle (kullanıcı gibi dokun + yaz)
    await sec.locator("select").first().selectOption("avoided");
    await hit(food); await page.keyboard.type("Fıstık", { delay: 20 });
    ok(g, "yazılan metin alanda aynen", (await food.inputValue()) === "Fıstık", await food.inputValue());
    await hit(note); await page.keyboard.type("alerji", { delay: 20 });
    await hit(sec.getByRole("button", { name: "Ekle", exact: true }));
    await sleep(900);
    const post = writes.find((w) => w.m === "POST");
    ok(g, "ekleme: POST gövdesi aynen (stance avoided, food_label, note)", post && post.body.stance === "avoided" && post.body.food_label === "Fıstık" && post.body.note === "alerji", JSON.stringify(post));
    ok(g, "ekleme sonrası alanlar temizlenir + liste güncellenir", (await food.inputValue()) === "" && (await note.inputValue()) === "" && /Fıstık/.test(await sec.innerText()));
    // Sil (mevcut onay akışı)
    const row = sec.locator("li", { hasText: "ZZ Süt" });
    await hit(row.getByRole("button", { name: "sil" }));
    const dlg = page.getByRole("alertdialog").or(page.getByRole("dialog")).last();
    await dlg.waitFor({ timeout: 5000 });
    for (let i = 0; i < 3 && (await dlg.isVisible().catch(() => false)); i++) {
      const btn = dlg.getByRole("button", { name: /^(Sil|Evet|Onayla|Kalıcı Olarak Sil|Devam)/i }).last();
      if (!(await btn.count())) break;
      await hit(btn); await sleep(500);
    }
    await sleep(800);
    ok(g, "silme: onay sonrası DELETE + listeden kalkar", writes.some((w) => w.m === "DELETE" && w.id === "p0000000-0000-4000-8000-000000000001") && !/ZZ Süt/.test(await sec.innerText()), JSON.stringify(writes));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
    if (process.env.PRINT_ATTRS) console.log(`ATTRS_JSON ${JSON.stringify({ food: Object.keys(fa).sort(), note: Object.keys(na).sort() })}`);
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
}

for (const vp of [{ width: 390, height: 844, tag: "android-uygulama", ua: APP_UA }, { width: 1280, height: 900, tag: "web" }]) await run(vp);
await browser.close();
console.log(`\nG2-02 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
