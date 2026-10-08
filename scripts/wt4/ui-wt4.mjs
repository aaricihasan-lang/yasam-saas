// WT4 — oturum/yetki + Şifa Rehberi UI davranış testleri (Playwright, yerel build, ağ-mock).
// Prod'a / dış ağa temas YOK: tüm /api/* istekleri burada mock'lanır; 127.0.0.1 dışı her istek abort.
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/wt4/ui-wt4.mjs   (UI_BASE ile port değiştirilebilir)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const GUIDE_ID = "11111111-2222-4333-8444-555555555555";
const ALL_PERMS = Object.fromEntries(
  ["clients", "appointments", "numerology", "stones", "stok", "sifa_rehberi", "energy_body", "reflexology",
    "aromatherapy", "personal_archive", "belge_ceviri", "human_design", "digital_content", "cosmic_calendar",
    "cupping", "beslenme", "yasam_hafizasi"].map((k) => [k, true]),
);

function makeUser(role = "admin", perms = ALL_PERMS) {
  return {
    id: role === "admin" ? "00000000-0000-4000-8000-0000000000ad" : "00000000-0000-4000-8000-0000000000e1",
    email: `zz-${role}@example.invalid`, full_name: `ZZ ${role}`, name: `ZZ ${role}`, role, active: true,
    approval_status: "approved", package_type: "premium", membership_status: "active",
    tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", is_demo_account: false, module_permissions: perms,
  };
}

function guideRow(updatedAt = "2026-10-08T09:00:00.000Z") {
  return {
    id: GUIDE_ID, tenant_id: "aaaaaaaa-0000-4000-8000-00000000000a", name: "ZZ Migren", category: "Sinir Sistemi",
    symptoms: null, created_at: "2026-10-01T09:00:00.000Z", updated_at: updatedAt, images: [],
    healing_guide_sections: [{
      id: "99999999-2222-4333-8444-555555555555", guide_id: GUIDE_ID, section_type: "reasons", mode: "medical",
      title: "ZZ Tıbbi", note: "ZZ not metni", source: null, source_kind: null, expert_note: null, attention: null,
      sort_order: 0, images: [], created_at: "2026-10-01T09:00:00.000Z",
    }],
  };
}

let browser;
let pass = 0, fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + detail : ""}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * seed: localStorage YALNIZ ilk yüklemede yazılır (sessionStorage bayrağı) → sayfa içi oturum
 * temizliği yeniden yüklemede geri gelmez (gerçek davranış). sessionGet: GET /api/auth/session yanıtı.
 */
async function newPage({ user, routes = [], viewport = { width: 1280, height: 900 }, sessionGet, seed = true }) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const calls = [];
  const pageErrors = [];
  if (seed) {
    await ctx.addInitScript((u) => {
      try {
        if (sessionStorage.getItem("zz_seeded")) return;
        sessionStorage.setItem("zz_seeded", "1");
        localStorage.setItem("yasam_user", JSON.stringify(u));
        localStorage.setItem("yasam_session_token", "zz-local-fake-token");
        localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
      } catch {}
    }, user);
  }
  let sessionGetCount = 0;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let body = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    const entry = { method: req.method(), path: url.pathname, search: url.search, body, at: Date.now() };
    calls.push(entry);
    if (url.pathname === "/api/auth/session" && req.method() === "GET") {
      const r = sessionGet ? sessionGet(sessionGetCount++) : { status: 200, json: { valid: true } };
      return route.fulfill({ status: r.status, json: r.json });
    }
    if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: user } });
    for (const [m, re, fn] of routes) {
      if ((m === "*" || m === req.method()) && re.test(url.pathname + url.search)) {
        const r = await fn(req, url, body);
        if (r.delay) await sleep(r.delay);
        entry.status = r.status;
        return route.fulfill({ status: r.status, json: r.json ?? {} });
      }
    }
    entry.status = 200;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 160)));
  return { ctx, page, calls, pageErrors };
}

const guideRoutes = (over = {}) => [
  ["GET", /^\/api\/sifa-rehberi\/guides\/[0-9a-f-]{36}$/, () => ({ status: 200, json: { ok: true, row: guideRow() } })],
  ["PATCH", /^\/api\/sifa-rehberi\/guides\/[0-9a-f-]{36}$/, over.patch ?? (() => ({ status: 200, json: { ok: true, updated_at: "2026-10-08T09:05:00.000Z" }, delay: 300 }))],
  ["PUT", /^\/api\/sifa-rehberi\/guides\/[0-9a-f-]{36}\/sections$/, over.put ?? (() => ({ status: 200, json: { ok: true, updated_at: "2026-10-08T09:05:01.000Z" } }))],
  ["DELETE", /^\/api\/sifa-rehberi\/guides\/[0-9a-f-]{36}$/, over.del ?? (() => ({ status: 200, json: { ok: true }, delay: 300 }))],
  ["GET", /^\/api\/sifa-rehberi\/guides/, () => ({ status: 200, json: { ok: true, guides: [], nextCursor: null, categories: [] } })],
];

const ls = (page) => page.evaluate(() => ({ user: localStorage.getItem("yasam_user"), token: localStorage.getItem("yasam_session_token") }));
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

async function openEdit(page) {
  await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "load" });
  await page.getByRole("button", { name: /^Düzenle$/ }).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^Düzenle$/ }).first().click();
  const name = page.getByPlaceholder("Rahatsızlık adı");
  await name.waitFor({ timeout: 8000 });
  return name;
}

async function run() {
  // ── A) Geçici doğrulama hatası (503) → çıkış YOK ─────────────────────────────────────────
  {
    const g = "A-503";
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), sessionGet: () => ({ status: 503, json: { valid: null, unavailable: true } }) });
    try {
      await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "load" });
      await sleep(7500); // ilk doğrulama 5 sn
      const s = await ls(page);
      ok(g, "oturum doğrulaması gerçekten çağrıldı", calls.some((c) => c.path === "/api/auth/session" && c.method === "GET"));
      ok(g, "localStorage oturumu KORUNDU", !!s.user && !!s.token);
      ok(g, "sunucuya logout (DELETE) GÖNDERİLMEDİ", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
      ok(g, "sayfada kalındı (ana sayfaya atılmadı)", page.url().includes(`/sifa-rehberi/${GUIDE_ID}`), page.url());
    } finally { await ctx.close(); }
  }

  // ── B) Tek "geçersiz" sonra "geçerli" (anlık) → çıkış YOK ─────────────────────────────────
  {
    const g = "B-flap";
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), sessionGet: (i) => (i === 0 ? { status: 200, json: { valid: false, reason: "revoked" } } : { status: 200, json: { valid: true } }) });
    try {
      await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "load" });
      await sleep(8000);
      const s = await ls(page);
      const gets = calls.filter((c) => c.path === "/api/auth/session" && c.method === "GET").length;
      ok(g, "ikinci doğrulama yapıldı (iki aşamalı karar)", gets >= 2, `GET=${gets}`);
      ok(g, "oturum korundu, DELETE yok", !!s.user && !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
      ok(g, "sayfada kalındı", page.url().includes(`/sifa-rehberi/${GUIDE_ID}`));
    } finally { await ctx.close(); }
  }

  // ── C) Gerçek oturum sonu, KAYDEDİLMEMİŞ düzenleme varken → yönlendirme DURDURULAMAZ ──────
  {
    const g = "C-real-end-dirty";
    let invalid = false;
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), sessionGet: () => (invalid ? { status: 200, json: { valid: false, reason: "expired" } } : { status: 200, json: { valid: true } }) });
    let dialogs = 0;
    page.on("dialog", (d) => { dialogs++; void d.dismiss(); }); // "Sayfada kal" seçilse bile
    try {
      const name = await openEdit(page);
      await name.fill("ZZ Migren DEĞİŞTİ");
      invalid = true;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 12000 }).catch(() => {});
      const s = await ls(page);
      ok(g, "beforeunload guard'ına rağmen giriş akışına dönüldü", new URL(page.url()).pathname === "/", page.url());
      ok(g, "beforeunload iletişim kutusu çıkmadı", dialogs === 0, `dialogs=${dialogs}`);
      ok(g, "yerel oturum temizlendi (bayat formda kalınmadı)", !s.user && !s.token);
      await sleep(1500);
      const txt = await bodyText(page);
      ok(g, "giriş ekranında süre dolumu mesajı", /Oturum süreniz doldu/.test(txt), txt.slice(0, 200));
      ok(g, "iki kesin geçersiz yanıt istendi", calls.filter((c) => c.path === "/api/auth/session" && c.method === "GET").length >= 2);
    } finally { await ctx.close(); }
  }

  // ── D) Başka sekmede çıkış → bu sekme bayat oturumla KALMAZ ───────────────────────────────
  {
    const g = "D-other-tab";
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes() });
    try {
      const name = await openEdit(page);
      await name.fill("ZZ değişiklik");
      const other = await ctx.newPage();
      await other.goto(`${BASE}/gizlilik-politikasi`, { waitUntil: "load" });
      await other.evaluate(() => { localStorage.removeItem("yasam_user"); localStorage.removeItem("yasam_session_token"); });
      await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 8000 }).catch(() => {});
      ok(g, "diğer sekmede çıkış → bu sekme giriş akışına döndü", new URL(page.url()).pathname === "/", page.url());
      const patches = calls.filter((c) => c.method === "PATCH").length;
      ok(g, "oturumsuz Kaydet denemesi yapılmadı (boş x-user-id ile PATCH yok)", patches === 0);
    } finally { await ctx.close(); }
  }

  // ── E) Oturumsuz modül rotası → "Oturumunuz Sona Erdi" + Giriş Yap ───────────────────────
  {
    const g = "E-no-session-route";
    const { page, ctx } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), seed: false });
    try {
      await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "load" });
      await page.getByText(/Oturumunuz Sona Erdi/).waitFor({ timeout: 10000 }).catch(() => {});
      const txt = await bodyText(page);
      ok(g, "'Oturumunuz Sona Erdi' gösterilir", /Oturumunuz Sona Erdi/.test(txt), txt.slice(0, 160));
      ok(g, "'Yetkiniz Bulunmuyor' GÖSTERİLMEZ", !/Yetkiniz Bulunmuyor/.test(txt));
      const href = await page.getByRole("link", { name: /Giriş Yap/ }).getAttribute("href");
      ok(g, "düğme doğrudan girişe (/?login=1)", href === "/?login=1", String(href));
      await page.getByRole("link", { name: /Giriş Yap/ }).click();
      await page.getByRole("button", { name: /Giriş Yap/ }).first().waitFor({ timeout: 8000 }).catch(() => {});
      ok(g, "giriş modalı açıldı", (await page.locator("input[type=password]").count()) > 0);
    } finally { await ctx.close(); }
  }

  // ── F) Giriş yapmış ama modül izni YOK → "Yetkiniz Bulunmuyor" → Ana Panele Dön = PANEL ──
  {
    const g = "F-real-deny";
    const perms = { ...ALL_PERMS, sifa_rehberi: false };
    const { page, ctx, calls } = await newPage({ user: makeUser("expert", perms), routes: guideRoutes() });
    try {
      await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "load" });
      await page.getByText(/Yetkiniz Bulunmuyor/).waitFor({ timeout: 10000 }).catch(() => {});
      ok(g, "izinsiz uzman: 'Yetkiniz Bulunmuyor'", /Yetkiniz Bulunmuyor/.test(await bodyText(page)));
      await page.getByRole("link", { name: /Ana Panele Dön/ }).click();
      await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 8000 }).catch(() => {});
      await sleep(2500);
      const s = await ls(page);
      ok(g, "Ana Panele Dön → panel (oturum KORUNDU)", !!s.user && !!s.token);
      ok(g, "giriş modalı AÇILMADI", (await page.locator("input[type=password]:visible").count()) === 0);
      ok(g, "logout isteği yok", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
    } finally { await ctx.close(); }
  }

  // ── G) Üst + alt Kaydet (çift tık → tek PATCH) — masaüstü + mobil ────────────────────────
  for (const vp of [{ width: 1280, height: 900, tag: "web" }, { width: 390, height: 844, tag: "mobil" }]) {
    const g = `G-save-${vp.tag}`;
    const { page, ctx, calls, pageErrors } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), viewport: vp });
    try {
      const name = await openEdit(page);
      await name.fill("ZZ Migren alt kaydet");
      const bottom = page.getByTestId("sifa-save-bottom");
      ok(g, "alt Kaydet düzenleme modunda görünür", await bottom.isVisible());
      await bottom.scrollIntoViewIfNeeded();
      await bottom.dblclick();
      await page.getByText("Kayıt güncellendi.").waitFor({ timeout: 8000 }).catch(() => {});
      const patches = calls.filter((c) => c.method === "PATCH");
      ok(g, "çift tık → TEK PATCH", patches.length === 1, `PATCH=${patches.length}`);
      ok(g, "PATCH yeni adı taşır", patches[0]?.body?.name === "ZZ Migren alt kaydet");
      ok(g, "bölümler PUT tek kez", calls.filter((c) => c.method === "PUT").length === 1);
      ok(g, "başarı mesajı + düzenleme kapandı", /Kayıt güncellendi/.test(await bodyText(page)) && (await page.getByTestId("sifa-save-bottom").count()) === 0);
      // Üst Kaydet aynı eylem
      await page.getByRole("button", { name: /^Düzenle$/ }).first().click();
      await page.getByPlaceholder("Rahatsızlık adı").fill("ZZ üst kaydet");
      await page.getByRole("button", { name: /^Kaydet$/ }).first().click();
      await page.getByText("Kayıt güncellendi.").waitFor({ timeout: 8000 }).catch(() => {});
      await sleep(800);
      const p2 = calls.filter((c) => c.method === "PATCH");
      ok(g, "üst Kaydet → 1 PATCH daha (toplam 2)", p2.length === 2 && p2[1]?.body?.name === "ZZ üst kaydet", `PATCH=${p2.length}`);
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } finally { await ctx.close(); }
  }

  // ── H) Kaydet hatası (500 / 401) → mesaj, taslak korunur ─────────────────────────────────
  for (const [tag, resp, re] of [["500", { status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }, /Kayıt güncellenemedi: İşlem tamamlanamadı/],
    ["401", { status: 401, json: { error: "Yetki gerekli." } }, /Oturumunuz sona ermiş görünüyor/]]) {
    const g = `H-save-fail-${tag}`;
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes({ patch: () => resp }), viewport: { width: 390, height: 844 } });
    try {
      const name = await openEdit(page);
      await name.fill("ZZ korunacak taslak");
      await page.getByTestId("sifa-save-bottom").click();
      await sleep(1500);
      const alerts = await page.locator("[role=alert]").allInnerTexts();
      ok(g, "hata alt Kaydet yanında görünür", alerts.some((t) => re.test(t)), alerts.join(" | "));
      ok(g, "ham 'Yetki gerekli' gösterilmez", !alerts.some((t) => /Yetki gerekli/.test(t)));
      ok(g, "taslak korunur + düzenleme modunda kalınır", (await page.getByPlaceholder("Rahatsızlık adı").inputValue()) === "ZZ korunacak taslak");
      ok(g, "PUT çağrılmadı", !calls.some((c) => c.method === "PUT"));
    } finally { await ctx.close(); }
  }

  // ── I) Silme: hata → TEK onay, modal kapanır, döngü yok; çift tık → tek DELETE; başarı ──
  for (const [tag, del] of [["401", () => ({ status: 401, json: { error: "Yetki gerekli." } })],
    ["500", () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } })],
    ["ok", () => ({ status: 200, json: { ok: true }, delay: 400 })]]) {
    const g = `I-delete-${tag}`;
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes({ del }) });
    try {
      await page.goto(`${BASE}/sifa-rehberi/${GUIDE_ID}`, { waitUntil: "load" });
      await page.getByRole("button", { name: /^Sil$/ }).first().waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: /^Sil$/ }).first().click();
      const yes = page.getByRole("button", { name: /Evet, Sil/ });
      await yes.waitFor({ timeout: 5000 });
      await yes.dblclick();
      await sleep(2000);
      const dels = calls.filter((c) => c.method === "DELETE" && c.path.startsWith("/api/sifa-rehberi/guides/")).length;
      ok(g, "çift tık → TEK DELETE", dels === 1, `DELETE=${dels}`);
      const dialogOpen = await page.getByRole("dialog").filter({ hasText: "Bu kaydı silmek istiyor musunuz?" }).count();
      if (tag === "ok") {
        await page.waitForURL((u) => new URL(u).pathname === "/sifa-rehberi", { timeout: 8000 }).catch(() => {});
        ok(g, "başarı → listeye dönüldü", new URL(page.url()).pathname === "/sifa-rehberi", page.url());
      } else {
        ok(g, "onay penceresi KAPANDI (döngü yok)", dialogOpen === 0);
        const txt = await bodyText(page);
        ok(g, "hata bir kez görünür", /Silinemedi:/.test(txt) && (txt.match(/Silinemedi:/g) ?? []).length === 1, txt.slice(0, 200));
        if (tag === "401") ok(g, "401 → oturum mesajı (ham 'Yetki gerekli' değil)", /Oturumunuz sona ermiş/.test(txt) && !/Yetki gerekli/.test(txt));
        ok(g, "sayfada kalındı", page.url().includes(GUIDE_ID));
      }
    } finally { await ctx.close(); }
  }

  // ── J) Kategori: seçimden sonra yeniden aç/değiştir, Diğer, datalist yok (yeni + düzenle) ─
  for (const vp of [{ width: 1280, height: 900, tag: "web" }, { width: 390, height: 844, tag: "mobil" }]) {
    const g = `J-category-${vp.tag}`;
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: [
      ["POST", /^\/api\/sifa-rehberi\/guides$/, () => ({ status: 200, json: { ok: true, guide: { id: GUIDE_ID } } })],
      ...guideRoutes(),
    ], viewport: vp });
    try {
      await page.goto(`${BASE}/sifa-rehberi?view=new`, { waitUntil: "load" });
      const sel = page.getByTestId("sifa-category-select");
      await sel.waitFor({ timeout: 15000 });
      ok(g, "datalist YOK", (await page.locator("datalist").count()) === 0 && (await page.locator("input[list]").count()) === 0);
      await sel.selectOption("Sinir Sistemi");
      ok(g, "ilk seçim", (await sel.inputValue()) === "Sinir Sistemi");
      const opts = await sel.locator("option").count();
      ok(g, "seçimden sonra TAM liste (süzme yok)", opts >= 19, `options=${opts}`);
      await sel.selectOption("Cilt");
      ok(g, "yeniden seçim → başka kategori", (await sel.inputValue()) === "Cilt");
      await sel.selectOption({ label: "Diğer (kendim yazayım)…" });
      const custom = page.getByTestId("sifa-category-custom");
      ok(g, "Diğer → özel metin kutusu", await custom.isVisible());
      await custom.fill("ZZ Özel Kategori");
      await sel.selectOption("Uyku");
      ok(g, "özelden önerilene geri dönülebilir; metin kutusu kapanır", (await sel.inputValue()) === "Uyku" && (await custom.count()) === 0);
      await page.getByPlaceholder("Örn. Migren").fill("ZZ Yeni Kayıt");
      await page.getByRole("button", { name: /^Kaydet$/ }).first().click();
      await sleep(2000);
      const post = calls.find((c) => c.method === "POST" && c.path === "/api/sifa-rehberi/guides");
      ok(g, "kayıt gövdesinde son seçilen kategori", post?.body?.category === "Uyku", JSON.stringify(post?.body?.category));
      // Düzenleme ekranı: mevcut kategori seçili gelir, değiştirilebilir
      const name = await openEdit(page);
      const esel = page.getByTestId("sifa-category-select");
      ok(g, "düzenle: mevcut kategori seçili", (await esel.inputValue()) === "Sinir Sistemi");
      await esel.selectOption("Göz");
      await name.fill("ZZ Migren");
      await page.getByTestId("sifa-save-bottom").click();
      await sleep(1500);
      const patch = calls.filter((c) => c.method === "PATCH").pop();
      ok(g, "düzenle: yeni kategori PATCH'te", patch?.body?.category === "Göz", JSON.stringify(patch?.body?.category));
    } finally { await ctx.close(); }
  }

  // ── K) Kaydedilmemiş değişiklik guard'ı KORUNDU + geri tuşu oturumu bozmaz ───────────────
  {
    const g = "K-unsaved-back";
    const { page, ctx, calls } = await newPage({ user: makeUser("admin"), routes: guideRoutes(), viewport: { width: 390, height: 844 } });
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
    try {
      await page.goto(`${BASE}/sifa-rehberi?view=list`, { waitUntil: "load" });
      await sleep(1000);
      const name = await openEdit(page);
      await name.fill("ZZ kaydedilmemiş");
      // Uygulama-içi Vazgeç → onay
      await page.getByRole("button", { name: /^Vazgeç$/ }).first().click();
      const discard = page.getByRole("button", { name: "Değişiklikleri sil ve çık" });
      ok(g, "Vazgeç → 'Değişiklikleri sil ve çık' onayı", await discard.isVisible().catch(() => false) || (await discard.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)));
      await page.getByRole("button", { name: "Düzenlemeye devam et" }).click();
      ok(g, "devam → taslak korunur", (await page.getByPlaceholder("Rahatsızlık adı").inputValue()) === "ZZ kaydedilmemiş");
      // Fiziksel geri (dirty) → native onay; "kal" → sayfada kalınır
      await page.goBack();
      await sleep(800);
      ok(g, "geri tuşu (dirty) → onay sorulur", dialogs.length >= 1, `dialogs=${dialogs.length}`);
      ok(g, "kal → aynı sayfa + taslak", page.url().includes(GUIDE_ID) && (await page.getByPlaceholder("Rahatsızlık adı").inputValue()) === "ZZ kaydedilmemiş");
      // Değişiklikleri sil ve çık → geri → geri: oturum KORUNUR, "Yetkiniz Bulunmuyor" YOK
      await page.getByRole("button", { name: /^Vazgeç$/ }).first().click();
      await page.getByRole("button", { name: "Değişiklikleri sil ve çık" }).click();
      await sleep(500);
      for (let i = 0; i < 3 && new URL(page.url()).pathname !== "/sifa-rehberi"; i++) { await page.goBack(); await sleep(900); }
      await sleep(1200);
      const s = await ls(page);
      const txt = await bodyText(page);
      ok(g, "geri tuşu sonrası oturum KORUNDU", !!s.user && !!s.token);
      ok(g, "'Yetkiniz Bulunmuyor' YOK", !/Yetkiniz Bulunmuyor/.test(txt));
      ok(g, "önceki güvenli sayfaya dönüldü (liste)", new URL(page.url()).pathname === "/sifa-rehberi", page.url());
      ok(g, "logout isteği YOK", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
    } finally { await ctx.close(); }
  }

  // ── L) Ana panel çıkış: yalnız açık onayla ───────────────────────────────────────────────
  {
    const g = "L-hub-logout";
    const { page, ctx, calls } = await newPage({ user: makeUser("expert"), routes: [], viewport: { width: 390, height: 844 } });
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const btn = page.getByRole("button", { name: "Çıkış Yap" }).first();
      await btn.waitFor({ timeout: 15000 });
      await btn.click();
      const dlg = page.getByText("Çıkış yapılsın mı?");
      ok(g, "çıkış ikonuna dokunmak → onay sorulur", await dlg.waitFor({ timeout: 4000 }).then(() => true).catch(() => false));
      await page.getByRole("alertdialog").getByRole("button", { name: "Vazgeç" }).click();
      await sleep(800);
      let s = await ls(page);
      ok(g, "Vazgeç → oturum açık, DELETE yok", !!s.user && !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
      await btn.click();
      await page.getByText("Çıkış yapılsın mı?").waitFor({ timeout: 4000 });
      await page.getByRole("alertdialog").getByRole("button", { name: "Çıkış Yap" }).click();
      await sleep(1500);
      s = await ls(page);
      ok(g, "onay → çıkış (yerel + sunucu DELETE)", !s.user && calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
    } finally { await ctx.close(); }
  }
}

try {
  await run();
} catch (e) {
  ok("runner", "beklenmeyen hata", false, String(e).slice(0, 300));
} finally {
  await browser?.close();
}
console.log(`\nWT4 UI: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
