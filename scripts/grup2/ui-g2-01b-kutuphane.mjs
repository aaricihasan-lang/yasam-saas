// G2-01B — Doğaltaş Yönetimi ana araması: 5. bölüm Doğaltaş Kütüphanesi. Web çerez oturumu (ilk çizim kararı; yetkisize
// istek YOK) ve Android uygulama başlık oturumu (x-session-token; ilk aramada uca sorulur, 404 → sessiz + tekrar sorulmaz).
// Sunucu ucu ağ-mock'tur (yayın/yetki kapısı sunucuda; burada istemci davranışı doğrulanır). Prod'a SIFIR temas; yazma YOK.
// Sunucu: SESSION_COOKIE_MODE=primary STONE_LIBRARY_ENABLED=true ile (web = data-session-transport="cookie").
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-01b-kutuphane.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3976";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const APP_UA = "Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36 YasamSistemiAndroid/1.0";
const norm = (s) => String(s ?? "").toLocaleLowerCase("tr-TR").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
const STONES = [{ id: "f0000000-0000-4000-8000-000000000001", tenant_id: TENANT, stone_name: "ZZ Ametist", short_description: "Uyku için.", general_info: "Uyku kalitesi", chakras: [], images: [], assignments: {}, updated_at: "2026-10-01T08:00:00.000Z" }];
const COMBOS = [{ id: "d0000000-0000-4000-8000-000000000001", tenant_id: TENANT, issue: "Uyku sorunu", description: "Uyku için kombinasyon", stones_text: "Ametist", variant_index: 1 }];
const ARTICLES = [{ id: "b0000000-0000-4000-8000-000000000001", tenant_id: TENANT, title: "ZZ Ametist ve Uyku", content: "Ametist uyku kalitesini destekler.", category: "Genel", sub_category: "", tags: [], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true }];
// Sunucunun beyaz liste DTO'su + istemcinin GÖSTERMEMESİ gereken bir ek alan (savunma testi)
const LIB_ITEMS = [
  { slug: "ametist", name_tr: "Ametist", name_en: "Amethyst", has_image: false, facets: {}, excerpt: "Mor kuvars türü; uyku ve sakinlik.", excerpt_attribution: "Kaynak: ZZ Kristal Kitabı (CC BY 4.0)", source_name: "ZZ-GIZLI-KAYNAK" },
  { slug: "lavanta-kuvars", name_tr: "Lavanta Kuvars", name_en: null, has_image: false, facets: {}, excerpt: "Uyku öncesi meditasyon.", excerpt_attribution: null },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function open({ android, library }) {
  const ctx = await browser.newContext({ viewport: android ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: android, isMobile: android, ...(android ? { userAgent: APP_UA } : {}) });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  const lib = []; // kütüphane istekleri
  const hits = { stones: 0, minerals: 0, combinations: 0, knowledge: 0 }; // mevcut dört bölümün uç çağrıları
  let libCall = 0;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    if (req.method() !== "GET" && p !== "/api/dogaltas/stones/condition-search") return route.fulfill({ status: 405, json: { ok: false } });
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (p === "/api/dogaltas/stones/condition-search") {
      hits.stones++;
      const q = norm(req.postDataJSON()?.q ?? "");
      const rows = STONES.filter((s) => norm(`${s.stone_name} ${s.short_description} ${s.general_info}`).includes(q));
      return route.fulfill({ status: 200, json: { ok: true, rows, total: rows.length, capped: false } });
    }
    if (p === "/api/dogaltas/minerals") hits.minerals++;
    if (p === "/api/dogaltas/combinations") hits.combinations++;
    if (p === "/api/dogaltas/knowledge") hits.knowledge++;
    if (p === "/api/dogaltas/minerals") return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
    if (p === "/api/dogaltas/combinations") return route.fulfill({ status: 200, json: { ok: true, rows: COMBOS, count: 1 } });
    if (p === "/api/dogaltas/knowledge") return route.fulfill({ status: 200, json: { ok: true, articles: ARTICLES } });
    // A1: Android kart yoklaması (?yoklama=1) ayrı bir istektir — arama istekleri arasında SAYILMAZ (bu test aramayı ölçer).
    if (p === "/api/dogaltas/kutuphane" && url.searchParams.get("yoklama") === "1") return route.fulfill({ status: 404, json: { ok: false } });
    if (p === "/api/dogaltas/kutuphane") {
      const h = req.headers();
      lib.push({ q: url.searchParams.get("q"), limit: url.searchParams.get("limit"), sess: h["x-session-token"] ?? null, uid: h["x-user-id"] ?? null, other: [...url.searchParams.keys()].filter((k) => !["q", "limit"].includes(k)) });
      const mode = library[Math.min(libCall++, library.length - 1)];
      if (mode === "abort") return route.abort();
      if (mode === "500") return route.fulfill({ status: 500, json: { ok: false, error: "x" } });
      if (mode === "404") return route.fulfill({ status: 404, json: { ok: false, error: "Bulunamadı." } });
      const q = norm(url.searchParams.get("q") ?? "");
      const items = LIB_ITEMS.filter((it) => norm(`${it.name_tr} ${it.name_en ?? ""} ${it.excerpt}`).includes(q));
      return route.fulfill({ status: 200, json: { ok: true, total: items.length, limit: 50, offset: 0, items } });
    }
    if (p.startsWith("/api/dogaltas/kutuphane/")) return route.fulfill({ status: 404, json: { ok: false } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, lib, errors, hits };
}

async function search(page, q) {
  await page.goto(`${BASE}/dogaltas?q=${encodeURIComponent(q)}`, { waitUntil: "load" });
  await page.locator("article h3, p.py-6").first().waitFor({ timeout: 60000 });
  await sleep(900);
  const results = await page.locator("article").evaluateAll((els) => els.filter((a) => a.querySelector('[data-testid="hub-result-kind"]')).map((a) => {
    const ps = a.querySelectorAll("p");
    return { name: a.querySelector("h3")?.textContent?.trim(), kind: a.querySelector('[data-testid="hub-result-kind"]')?.textContent?.trim(),
      href: a.querySelector("a")?.getAttribute("href"), desc: ps[0]?.textContent?.trim(), snippet: ps[ps.length - 1]?.textContent?.trim() };
  }));
  const body = await page.locator("body").innerText();
  return { results, body, dataError: /Arama verisi okunamadı/.test(body) };
}
const LIB = "Doğaltaş Kütüphanesi";

// A) Android uygulama — yetkili
{
  const g = "android-yetkili";
  const { ctx, page, lib, errors, hits } = await open({ android: true, library: ["ok"] });
  try {
    const transport = await page.goto(`${BASE}/dogaltas`, { waitUntil: "load" }).then(() => page.evaluate(() => document.documentElement.getAttribute("data-session-transport")));
    ok(g, "Android isteği başlık taşımasında (sunucu işareti header)", transport === "header", String(transport));
    let r = await search(page, "uyku");
    console.log(`   ilk yükleme (?q=) uç çağrıları: ${JSON.stringify(hits)} kütüphane=${lib.length}`);
    const kinds = r.results.map((x) => x.kind);
    ok(g, "istek Android başlık oturumuyla (x-session-token + x-user-id), yalnız q + limit=50", lib.length >= 1 && lib.every((x) => x.sess === "zz-local-fake-token" && x.uid === USER.id && x.limit === "50" && x.q === "uyku" && x.other.length === 0) && lib[0].sess === "zz-local-fake-token" && lib[0].uid === USER.id && lib[0].limit === "50" && lib[0].q === "uyku" && lib[0].other.length === 0, JSON.stringify(lib));
    ok(g, "kütüphane sonuçları 5. bölüm (diğer dört grubun ardından)", kinds.includes(LIB) && kinds.lastIndexOf("Taş Makaleleri") < kinds.indexOf(LIB) && kinds.indexOf("Kombinasyonlar") < kinds.indexOf(LIB), kinds.join(","));
    ok(g, "mevcut dört bölüm aynen (taş, kombinasyon, makale)", r.results.some((x) => x.name === "ZZ Ametist" && x.kind === "Doğaltaşlar") && r.results.some((x) => x.name === "Uyku sorunu") && r.results.some((x) => x.name === "ZZ Ametist ve Uyku"), JSON.stringify(r.results));
    const am = r.results.find((x) => x.kind === LIB && x.name === "Ametist");
    const lv = r.results.find((x) => x.kind === LIB && x.name === "Lavanta Kuvars");
    ok(g, "detay bağlantısı doğrudan /dogaltas/kutuphane/<slug>", am?.href === "/dogaltas/kutuphane/ametist" && lv?.href === "/dogaltas/kutuphane/lavanta-kuvars", JSON.stringify([am, lv]));
    ok(g, "atıflı önizleme atıfla birlikte; atıfsızda ikinci satır boş", am?.desc?.startsWith("Mor kuvars") && am?.snippet === "Kaynak: ZZ Kristal Kitabı (CC BY 4.0)" && lv?.snippet === "", JSON.stringify([am, lv]));
    ok(g, "beyaz liste dışı alan ekrana çıkmaz", !r.body.includes("ZZ-GIZLI-KAYNAK"));
    ok(g, "hata mesajı yok", !r.dataError);
    const n1 = lib.length;
    const h0 = { ...hits };
    await page.getByLabel("Taş adı veya içerikte ara").fill("lavanta");
    await page.getByLabel("Taş adı veya içerikte ara").press("Enter");
    await sleep(1800);
    const d = Object.fromEntries(Object.keys(hits).map((k) => [k, hits[k] - h0[k]]));
    // Mevcut hub her kullanıcı aramasını 2 kez çalıştırır (ayrı bulgu). Kütüphane aynı çoklukta; dört bölümün sayıları main ile aynı.
    console.log(`   kullanıcı araması başına uç çağrıları: ${JSON.stringify(d)} kütüphane=${lib.length - n1}`);
    const EXPECT = JSON.parse(process.env.G2_01B_MAIN_PER_SEARCH ?? '{"stones":2,"minerals":4,"combinations":2,"knowledge":2}'); // main a519f2a5 ölçümü
    ok(g, "kütüphane çağrısı mevcut arama çokluğunda (ek tekrar yok)", lib.length - n1 === d.stones, JSON.stringify({ d, lib: lib.length - n1 }));
    if (EXPECT) ok(g, "dört bölümün uç çağrı sayıları main ile aynı", ["stones", "minerals", "combinations", "knowledge"].every((k) => d[k] === EXPECT[k]), `main=${JSON.stringify(EXPECT)} dal=${JSON.stringify(d)}`);
    r = await search(page, "uyku");
    ok(g, "sonraki aramada da sorulur", lib.length > n1, `${n1} → ${lib.length}`);
    await page.locator("article", { has: page.locator("h3", { hasText: /^Ametist$/ }) }).locator("a").first().tap();
    await page.waitForURL(/\/dogaltas\/kutuphane\/ametist$/, { timeout: 30000 }).catch(() => {});
    ok(g, "sonuca dokununca taş detayına gider", new URL(page.url()).pathname === "/dogaltas/kutuphane/ametist", page.url());
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// B) Android uygulama — yetkisiz / kütüphane kapalı (sunucu tek tip 404)
{
  const g = "android-yetkisiz";
  const { ctx, page, lib } = await open({ android: true, library: ["404"] });
  try {
    let r = await search(page, "uyku");
    const n1 = lib.length;
    ok(g, "kütüphane sonucu yok, kayıt/sayı yok", !r.results.some((x) => x.kind === LIB), JSON.stringify(r.results));
    ok(g, "yetkisizlik hata gibi gösterilmez", !r.dataError);
    ok(g, "mevcut dört bölüm aynen", r.results.some((x) => x.name === "ZZ Ametist") && r.results.some((x) => x.name === "Uyku sorunu") && r.results.some((x) => x.name === "ZZ Ametist ve Uyku"));
    await page.getByLabel("Taş adı veya içerikte ara").fill("ametist");
    await page.getByLabel("Taş adı veya içerikte ara").press("Enter");
    await sleep(1500);
    ok(g, "aynı sayfada sonraki aramada kütüphane bir daha SORULMAZ (istek artmaz)", lib.length === n1 && n1 >= 1, `ilk yükleme ${n1} → sonra ${lib.length}`);
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// C) Android — ağ hatası ve sunucu 500: yetkisizlikle KARIŞTIRILMAZ → mevcut mesaj + sonraki aramada yeniden sorulur
for (const [g, mode] of [["android-ag-hatasi", "abort"], ["android-sunucu-500", "500"]]) {
  const { ctx, page, lib } = await open({ android: true, library: [mode, mode, "ok"] }); // ilk yükleme 2 çağrı (mevcut çift arama)
  try {
    const r = await search(page, "uyku");
    ok(g, "hata mevcut 'Arama verisi okunamadı.' ile bildirilir; diğer sonuçlar korunur", r.dataError && r.results.some((x) => x.name === "ZZ Ametist"), JSON.stringify(r.results));
    ok(g, "kütüphane sonucu / kayıt sayısı yok", !r.results.some((x) => x.kind === LIB));
    const n1 = lib.length;
    await page.getByLabel("Taş adı veya içerikte ara").fill("ametist");
    await page.getByLabel("Taş adı veya içerikte ara").press("Enter");
    await sleep(1800);
    ok(g, "yetkisiz sayılmaz: sonraki aramada yeniden sorulur ve sonuç gelir", lib.length > n1 && /Doğaltaş Kütüphanesi/.test(await page.locator("body").innerText()), `${n1} → ${lib.length}`);
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// D) Android — yetkili doğrulandıktan sonra ağ hatası → mevcut mesaj, diğer sonuçlar korunur
{
  const g = "android-yetkili-ag";
  const { ctx, page } = await open({ android: true, library: ["ok", "ok", "abort"] }); // ilk yükleme hub aramasını 2 kez çalıştırır (mevcut davranış)
  try {
    await search(page, "uyku");
    await page.getByLabel("Taş adı veya içerikte ara").fill("ametist");
    await page.getByLabel("Taş adı veya içerikte ara").press("Enter");
    await sleep(1800);
    const body = await page.locator("body").innerText();
    ok(g, "yetkili kullanıcıda ağ hatası mevcut 'Arama verisi okunamadı.' ile bildirilir", /Arama verisi okunamadı/.test(body));
    ok(g, "diğer sonuçlar korunur", /ZZ Ametist/.test(body));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
// E) Web çerez oturumu — ilk çizim kararı kapalı → kütüphaneye HİÇ istek yok
{
  const g = "web-cerez";
  const { ctx, page, lib, errors } = await open({ android: false, library: ["ok"] });
  try {
    await page.goto(`${BASE}/dogaltas`, { waitUntil: "load" });
    const transport = await page.evaluate(() => document.documentElement.getAttribute("data-session-transport"));
    ok(g, "web çerez taşıması (data-session-transport=cookie)", transport === "cookie", String(transport));
    let r = await search(page, "uyku");
    r = await search(page, "ametist");
    ok(g, "erişim kararı kapalıyken kütüphaneye istek gitmez (0)", lib.length === 0, JSON.stringify(lib));
    ok(g, "kütüphane sonucu / hata yok; diğer bölümler aynen", !r.results.some((x) => x.kind === LIB) && !r.dataError && r.results.some((x) => x.name === "ZZ Ametist"), JSON.stringify(r.results));
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo", false, e); } finally { await ctx.close(); }
}
await browser.close();
console.log(`\nG2-01B UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
