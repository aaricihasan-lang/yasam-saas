// G2-01 — Doğaltaş Yönetimi ana araması: Taş Makaleleri + Mineral bölüm metinleri eklendi; mevcut taş /
// mineral (çekirdek) / kombinasyon sonuçları, sırası ve tıklaması aynen. Makale sonucu → Taş Makaleleri'nde
// o makale açık. Mineral Listesi araması değişmez. Hata durumunda diğer sonuçlar + mevcut hata mesajı.
// Playwright, yerel sunucu, ağ-mock (prod'a SIFIR temas; 127.0.0.1 dışı her istek abort; yazma YOK).
// Çalıştırma: UI_BASE=http://127.0.0.1:PORT node scripts/grup2/ui-g2-01-ana-arama.mjs
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3974";
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const USER = {
  id: "00000000-0000-4000-8000-0000000000e1", email: "zz-expert@example.invalid", full_name: "ZZ Uzman", name: "ZZ Uzman",
  role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
  tenant_id: TENANT, is_demo_account: false, module_permissions: { stones: true },
};
const norm = (s) => String(s ?? "").toLocaleLowerCase("tr-TR").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c");
const STONES = [{ id: "f0000000-0000-4000-8000-000000000001", tenant_id: TENANT, stone_name: "ZZ Ametist", short_description: "Uyku için.", general_info: "Uyku kalitesi", chakras: [], images: [], assignments: {}, updated_at: "2026-10-01T08:00:00.000Z" }];
const MINERALS = [
  { id: "e0000000-0000-4000-8000-000000000001", tenant_id: TENANT, source_id: "", name: "ZZ Magnezyum", aciklama: "Kas gevşetici", kategori: "Makro", fiziksel: ["Kas krampı", "Saç dökülmesi"], zihinsel: "", created_at: "2026-10-01T08:00:00.000Z" },
  { id: "e0000000-0000-4000-8000-000000000002", tenant_id: TENANT, source_id: "", name: "ZZ Çinko", aciklama: "İz element", kategori: "İz", eksiklik_belirtileri: ["Saç dökülmesi", "Tırnak kırılması"], doz_asimi: "Bulantı", created_at: "2026-10-02T08:00:00.000Z" },
  { id: "e0000000-0000-4000-8000-000000000003", tenant_id: TENANT, source_id: "", name: "ZZ Demir", aciklama: "Kan yapımı", kategori: "İz", fiziksel: "Yorgunluk", created_at: "2026-10-03T08:00:00.000Z" },
];
const COMBOS = [{ id: "d0000000-0000-4000-8000-000000000001", tenant_id: TENANT, issue: "Uyku sorunu", description: "Uyku için kombinasyon", stones_text: "Ametist", variant_index: 1 }];
const ARTICLES = [
  { id: "b0000000-0000-4000-8000-000000000001", tenant_id: TENANT, title: "ZZ Ametist ve Uyku", content: "Ametist uyku kalitesini destekler.", category: "Genel", sub_category: "", tags: [], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true, updated_at: "2026-10-01T08:00:00.000Z" },
  { id: "b0000000-0000-4000-8000-000000000002", tenant_id: TENANT, title: "ZZ Kuvars Rehberi", content: "Enerji ve odak.", category: "Genel", sub_category: "", tags: ["saç dökülmesi"], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true, updated_at: "2026-10-01T08:00:00.000Z" },
  { id: "b0000000-0000-4000-8000-000000000003", tenant_id: TENANT, title: "ZZ Obsidyen", content: "Koruma.", category: "Genel", sub_category: "", tags: [], related_stones: [], related_minerals: [], source: "", source_section: "", keyword: "", notes: "", is_active: true, updated_at: "2026-10-01T08:00:00.000Z" },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const browser = await chromium.launch();

async function open(vp, opts = {}) {
  const touch = vp.width < 768;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript((u) => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify(u));
      localStorage.setItem("yasam_session_token", "zz-local-fake-token");
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch {}
  }, USER);
  const reqs = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname;
    reqs.push(`${req.method()} ${p}${url.search}`);
    if (req.method() !== "GET" && p !== "/api/dogaltas/stones/condition-search") return route.fulfill({ status: 405, json: { ok: false } });
    if (p === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
    if (p === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
    if (p === "/api/dogaltas/stones/condition-search") {
      const q = norm(req.postDataJSON()?.q ?? "");
      const rows = STONES.filter((s) => norm(`${s.stone_name} ${s.short_description} ${s.general_info}`).includes(q));
      return route.fulfill({ status: 200, json: { ok: true, rows, total: rows.length, capped: false } });
    }
    if (p === "/api/dogaltas/minerals") {
      const mode = url.searchParams.get("mode") ?? "list";
      if (mode === "all") {
        if (opts.failAll) return route.fulfill({ status: 500, json: { ok: false, error: "x" } });
        return route.fulfill({ status: 200, json: { ok: true, rows: MINERALS } });
      }
      const q = norm(url.searchParams.get("q") ?? "");
      const rows = MINERALS.filter((m) => !q || norm(`${m.name} ${m.aciklama} ${m.kategori} ${m.source_id}`).includes(q))
        .map(({ id, tenant_id, source_id, name, aciklama, kategori, created_at }) => ({ id, tenant_id, source_id, name, aciklama, kategori, created_at }));
      if (mode === "count") return route.fulfill({ status: 200, json: { ok: true, count: rows.length } });
      return route.fulfill({ status: 200, json: { ok: true, rows } });
    }
    if (p === "/api/dogaltas/combinations") return route.fulfill({ status: 200, json: { ok: true, rows: COMBOS, count: COMBOS.length } });
    if (p === "/api/dogaltas/knowledge") {
      if (opts.failKnowledge) return route.fulfill({ status: 500, json: { ok: false, error: "x" } });
      return route.fulfill({ status: 200, json: { ok: true, articles: ARTICLES } });
    }
    if (p === "/api/dogaltas/knowledge/categories") return route.fulfill({ status: 200, json: { ok: true, categories: [] } });
    return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0 } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  return { ctx, page, reqs, errors, touch };
}

async function search(page, q) {
  await page.goto(`${BASE}/dogaltas?q=${encodeURIComponent(q)}`, { waitUntil: "load" });
  await page.locator("article h3, p.py-6").first().waitFor({ timeout: 60000 });
  await sleep(700);
  return page.locator("article").evaluateAll((els) => els.filter((a) => a.querySelector('[data-testid="hub-result-kind"]')).map((a) => ({
    name: a.querySelector("h3")?.textContent?.trim(), kind: a.querySelector('[data-testid="hub-result-kind"]')?.textContent?.trim(),
    href: a.querySelector("a")?.getAttribute("href"), snippet: a.querySelectorAll("p")[a.querySelectorAll("p").length - 1]?.textContent?.trim(),
  })));
}

for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
  const g = `g2-01-${vp.tag}`;
  const { ctx, page, reqs, errors, touch } = await open(vp);
  try {
    // 1) "uyku": taş + kombinasyon (mevcut) + makale (yeni); sıra: taş → kombinasyon → makale
    let r = await search(page, "uyku");
    const kinds = r.map((x) => x.kind);
    ok(g, "uyku: mevcut taş sonucu aynen", r.some((x) => x.name === "ZZ Ametist" && x.kind === "Doğaltaşlar" && /dogaltas-listesi\/f0000000/.test(x.href ?? "")), JSON.stringify(r));
    ok(g, "uyku: mevcut kombinasyon sonucu aynen", r.some((x) => x.name === "Uyku sorunu" && /kombinasyonlar\/Uyku%20sorunu\?q=uyku/.test(x.href ?? "")), JSON.stringify(r));
    ok(g, "uyku: Taş Makaleleri sonucu var (rozet = modül adı)", r.some((x) => x.name === "ZZ Ametist ve Uyku" && x.kind === "Taş Makaleleri"), JSON.stringify(r));
    ok(g, "grup sırası: taş → kombinasyon → makale", kinds.indexOf("Doğaltaşlar") < kinds.indexOf("Kombinasyonlar") && kinds.indexOf("Kombinasyonlar") < kinds.indexOf("Taş Makaleleri"), kinds.join(","));
    ok(g, "eşleşmeyen makale gelmez", !r.some((x) => x.name === "ZZ Obsidyen" || x.name === "ZZ Kuvars Rehberi"));
    // 2) "saç dökülmesi": yalnız bölüm metninde → ZZ Çinko + ZZ Magnezyum (fiziksel); etiketli makale
    r = await search(page, "saç dökülmesi");
    const mins = r.filter((x) => x.kind === "Mineraller").map((x) => x.name);
    ok(g, "mineral bölüm metni bulunur (Eksiklik → ZZ Çinko, Fiziksel → ZZ Magnezyum)", mins.includes("ZZ Çinko") && mins.includes("ZZ Magnezyum"), JSON.stringify(mins));
    ok(g, "bölüm eşleşmesinde ilgili metin parçası gösterilir", r.some((x) => x.name === "ZZ Çinko" && /Saç dökülmesi/.test(x.snippet ?? "")), JSON.stringify(r));
    ok(g, "mineral sonuçları ada göre sıralı (mevcut kural)", JSON.stringify(mins) === JSON.stringify([...mins].sort((a, b) => a.localeCompare(b, "tr-TR"))), JSON.stringify(mins));
    ok(g, "makale etiketlerinde de arar (Taş Makaleleri kuralı)", r.some((x) => x.name === "ZZ Kuvars Rehberi"), JSON.stringify(r));
    // 3) "kas": çekirdek (açıklama) + bölüm (fiziksel) aynı mineral → tek sonuç
    r = await search(page, "kas");
    ok(g, "çekirdek + bölüm eşleşen mineral tek kez (tekrar yok)", r.filter((x) => x.name === "ZZ Magnezyum").length === 1, JSON.stringify(r));
    const coreHref = r.find((x) => x.name === "ZZ Magnezyum")?.href;
    ok(g, "çekirdek mineral sonucunun bağlantısı aynen", coreHref === `/dogaltas/mineral-listesi/e0000000-0000-4000-8000-000000000001?q=kas`, coreHref);
    // 4) tenant parametresi istemciden gitmez
    ok(g, "yeni istekler tenant parametresi taşımaz (tenant oturumdan)", reqs.filter((x) => /mode=all|\/knowledge/.test(x)).every((x) => !/tenant/i.test(x)), reqs.filter((x) => /mode=all|knowledge/.test(x)).join(" | "));
    // 5) makale sonucuna tıkla → Taş Makaleleri'nde o makale açık + arama dolu
    r = await search(page, "uyku");
    const art = page.locator("article", { has: page.locator("h3", { hasText: "ZZ Ametist ve Uyku" }) }).locator("a").first();
    await (touch ? art.tap() : art.click());
    await page.waitForURL(/tas-bilgi-kutuphanesi\?q=uyku&makale=b0000000/, { timeout: 30000 });
    await page.getByText("Ametist uyku kalitesini destekler.").first().waitFor({ timeout: 60000 });
    await sleep(600);
    const searchVal = await page.locator("aside input[type=text]").first().inputValue().catch(() => "?");
    ok(g, "makale sayfası: arama kutusu sorguyla dolu", searchVal === "uyku", searchVal);
    const detailVisible = await page.getByText("Ametist uyku kalitesini destekler.").first().isVisible();
    ok(g, "makale sayfası: tıklanan makale açık (mobilde detay görünümü)", detailVisible);
    ok(g, "JS hata yok", errors.length === 0, errors.join(" ; "));
  } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }

  // 6) Taş Makaleleri parametresiz: arama boş, ekran mevcut davranışta
  {
    const { ctx: c2, page: p2, errors: e2 } = await open(vp);
    try {
      await p2.goto(`${BASE}/dogaltas/tas-bilgi-kutuphanesi`, { waitUntil: "load" });
      await p2.getByText("ZZ Obsidyen").first().waitFor({ timeout: 60000 });
      await sleep(500);
      ok(g, "Taş Makaleleri parametresiz: arama boş, tüm makaleler listede", (await p2.locator("aside input[type=text]").first().inputValue()) === "" && (await p2.getByText(/^ZZ (Ametist ve Uyku|Kuvars Rehberi|Obsidyen)$/).count()) >= 3);
      ok(g, "Taş Makaleleri parametresiz: JS hata yok", e2.length === 0, e2.join(" ; "));
    } catch (e) { ok(g, "parametresiz senaryo", false, e); } finally { await c2.close(); }
  }
  // 7) Hata: makale ucu ve mineral mode=all başarısız → diğer sonuçlar + mevcut hata mesajı
  for (const [label, opt] of [["makale ucu hata", { failKnowledge: true }], ["mineral bölüm ucu hata", { failAll: true }]]) {
    const { ctx: c3, page: p3 } = await open(vp, opt);
    try {
      const rr = await search(p3, "uyku");
      const body = await p3.locator("body").innerText();
      ok(g, `${label}: taş ve kombinasyon sonuçları yine gösterilir`, rr.some((x) => x.name === "ZZ Ametist") && rr.some((x) => x.name === "Uyku sorunu"), JSON.stringify(rr));
      ok(g, `${label}: mevcut "veri okunamadı" mesajı`, /okunamad|yüklenemedi|alınamadı/i.test(body), body.slice(0, 200));
    } catch (e) { ok(g, `${label} senaryo`, false, e); } finally { await c3.close(); }
  }
  // 8) Mineral Listesi araması değişmez: mode=all çağırmaz, bölüm metni eşleşmesi listede yok
  {
    const { ctx: c4, page: p4, reqs: r4 } = await open(vp);
    try {
      await p4.goto(`${BASE}/dogaltas/mineral-listesi?q=${encodeURIComponent("saç dökülmesi")}`, { waitUntil: "load" });
      await sleep(4000);
      ok(g, "Mineral Listesi: ana arama ucu (mode=all) çağrılmaz", !r4.some((x) => /mode=all/.test(x)), r4.filter((x) => /minerals/.test(x)).join(" | "));
    } catch (e) { ok(g, "mineral listesi senaryo", false, e); } finally { await c4.close(); }
  }
}
await browser.close();
console.log(`\nG2-01 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
