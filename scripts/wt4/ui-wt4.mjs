// WT4 — oturum/yetki + Şifa Rehberi UI davranış testleri (Playwright, yerel build, ağ-mock). Taşıyıcı ekran: Şifa Rehberi F3.
// Prod'a / dış ağa temas YOK: tüm /api/* istekleri burada mock'lanır; 127.0.0.1 dışı her istek abort.
// Çalıştırma: scripts/pre-sale-a2b/ui/README.md ile aynı (fake-supabase-sink + sahte env build + start);
//   node scripts/wt4/ui-wt4.mjs   (UI_BASE ile port değiştirilebilir)
import { chromium } from "playwright";
import { f3LibraryUrl, f3TopicUrl, f3Workspace, NOTE_ID, ROOT_ID } from "../sifa-rehberi-f3/ui-mock/f3Mock.mjs";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
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
        if (r.abort) { entry.status = 0; return route.abort("failed"); } // ağ hatası benzetimi
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

// ── F3 taşıyıcısı (Owner kararı 26.11.2026: V1 ekranı kaldırıldı; kişisel kütüphane) ──────────────────────────
// Oturum/yetki kuralları (A–F, K, L) AYNEN; ekran F3. Kayıt/hata/silme (G–I) F3'ün Kaydet modeline uyarlandı.
// J (kategori seçimi) V1'e özgüydü — F3'te kategori YOK → kaldırıldı (işlev ürünle birlikte kaldırıldı).
const F3_WS = /^\/api\/sifa-rehberi-v2\/workspace$/;
const f3Routes = (user, over = {}) => [
  ["GET", F3_WS, over.load ?? (() => ({ status: 200, json: { ok: true, workspace: f3Workspace(user.id) } }))],
  ["POST", F3_WS, over.save ?? (() => ({ status: 200, json: { ok: true }, delay: 300 }))],
];
const saves = (calls) => calls.filter((c) => c.method === "POST" && F3_WS.test(c.path));
const onF3 = (page) => new URL(page.url()).pathname === "/sifa-rehberi";
const toastText = (page) => page.locator("[data-testid=toast]").allInnerTexts().then((x) => x.join(" | "));

const ls = (page) => page.evaluate(() => ({ user: localStorage.getItem("yasam_user"), token: localStorage.getItem("yasam_session_token") }));
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));

/** Konu ekranında düzenleme modu; düzenlenecek alan = seçili notun başlığı. */
async function openEdit(page) {
  await page.goto(f3TopicUrl(BASE), { waitUntil: "load" });
  await page.getByTestId("edit").waitFor({ timeout: 20000 });
  await page.getByTestId("edit").click();
  const title = page.getByTestId("note-title-input").first();
  await title.waitFor({ timeout: 8000 });
  return title;
}

async function run() {
  // ── A) Geçici doğrulama hatası (503) → çıkış YOK ─────────────────────────────────────────
  {
    const g = "A-503";
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user), sessionGet: () => ({ status: 503, json: { valid: null, unavailable: true } }) });
    try {
      await page.goto(f3TopicUrl(BASE), { waitUntil: "load" });
      await sleep(7500); // ilk doğrulama 5 sn
      const s = await ls(page);
      ok(g, "oturum doğrulaması gerçekten çağrıldı", calls.some((c) => c.path === "/api/auth/session" && c.method === "GET"));
      ok(g, "localStorage oturumu KORUNDU", !!s.user && !!s.token);
      ok(g, "sunucuya logout (DELETE) GÖNDERİLMEDİ", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
      ok(g, "sayfada kalındı (ana sayfaya atılmadı)", onF3(page) && page.url().includes(ROOT_ID), page.url());
    } finally { await ctx.close(); }
  }

  // ── B) Tek "geçersiz" sonra "geçerli" (anlık) → çıkış YOK ─────────────────────────────────
  {
    const g = "B-flap";
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user), sessionGet: (i) => (i === 0 ? { status: 200, json: { valid: false, reason: "revoked" } } : { status: 200, json: { valid: true } }) });
    try {
      await page.goto(f3TopicUrl(BASE), { waitUntil: "load" });
      await sleep(8000);
      const s = await ls(page);
      const gets = calls.filter((c) => c.path === "/api/auth/session" && c.method === "GET").length;
      ok(g, "ikinci doğrulama yapıldı (iki aşamalı karar)", gets >= 2, `GET=${gets}`);
      ok(g, "oturum korundu, DELETE yok", !!s.user && !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
      ok(g, "sayfada kalındı", onF3(page) && page.url().includes(ROOT_ID));
    } finally { await ctx.close(); }
  }

  // ── C) Gerçek oturum sonu, KAYDEDİLMEMİŞ düzenleme varken → yönlendirme DURDURULAMAZ ──────
  {
    const g = "C-real-end-dirty";
    let invalid = false;
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user), sessionGet: () => (invalid ? { status: 200, json: { valid: false, reason: "expired" } } : { status: 200, json: { valid: true } }) });
    let dialogs = 0;
    page.on("dialog", (d) => { dialogs++; void d.dismiss(); }); // "Sayfada kal" seçilse bile
    try {
      const title = await openEdit(page);
      await title.fill("ZZ Not DEĞİŞTİ");
      ok(g, "taslak gerçekten kirli (Kaydet etkin)", await page.getByTestId("save").first().isEnabled());
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
      ok(g, "oturum sonunda kayıt isteği GİTMEDİ", saves(calls).length === 0);
    } finally { await ctx.close(); }
  }

  // ── D) Başka sekmede çıkış → bu sekme bayat oturumla KALMAZ ───────────────────────────────
  {
    const g = "D-other-tab";
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user) });
    try {
      const title = await openEdit(page);
      await title.fill("ZZ değişiklik");
      const other = await ctx.newPage();
      await other.goto(`${BASE}/gizlilik-politikasi`, { waitUntil: "load" });
      await other.evaluate(() => { localStorage.removeItem("yasam_user"); localStorage.removeItem("yasam_session_token"); });
      await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 8000 }).catch(() => {});
      ok(g, "diğer sekmede çıkış → bu sekme giriş akışına döndü", new URL(page.url()).pathname === "/", page.url());
      ok(g, "oturumsuz Kaydet denemesi yapılmadı (kayıt isteği yok)", saves(calls).length === 0);
    } finally { await ctx.close(); }
  }

  // ── E) Oturumsuz modül rotası → "Oturumunuz Sona Erdi" + Giriş Yap ───────────────────────
  {
    const g = "E-no-session-route";
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user), seed: false });
    try {
      await page.goto(f3TopicUrl(BASE), { waitUntil: "load" });
      await page.getByText(/Oturumunuz Sona Erdi/).waitFor({ timeout: 10000 }).catch(() => {});
      const txt = await bodyText(page);
      ok(g, "'Oturumunuz Sona Erdi' gösterilir", /Oturumunuz Sona Erdi/.test(txt), txt.slice(0, 160));
      ok(g, "'Yetkiniz Bulunmuyor' GÖSTERİLMEZ", !/Yetkiniz Bulunmuyor/.test(txt));
      ok(g, "Şifa ekranı açılmadı, kütüphane isteği gitmedi", (await page.getByTestId("sifa-f3").count()) === 0 && !calls.some((c) => F3_WS.test(c.path)));
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
    const user = makeUser("expert", perms);
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user) });
    try {
      await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "load" });
      await page.getByText(/Yetkiniz Bulunmuyor/).waitFor({ timeout: 10000 }).catch(() => {});
      ok(g, "izinsiz uzman: 'Yetkiniz Bulunmuyor'", /Yetkiniz Bulunmuyor/.test(await bodyText(page)));
      ok(g, "izinsiz uzmanda Şifa ekranı çizilmedi, kütüphane isteği gitmedi", (await page.getByTestId("sifa-f3").count()) === 0 && !calls.some((c) => F3_WS.test(c.path)));
      await page.getByRole("link", { name: /Ana Panele Dön/ }).click();
      await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 8000 }).catch(() => {});
      await sleep(2500);
      const s = await ls(page);
      ok(g, "Ana Panele Dön → panel (oturum KORUNDU)", !!s.user && !!s.token);
      ok(g, "giriş modalı AÇILMADI", (await page.locator("input[type=password]:visible").count()) === 0);
      ok(g, "logout isteği yok", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE"));
    } finally { await ctx.close(); }
  }

  // ── G) Kaydet (çift tık → TEK kayıt isteği) — masaüstü + mobil ───────────────────────────
  for (const vp of [{ width: 1280, height: 900, tag: "web" }, { width: 390, height: 844, tag: "mobil" }]) {
    const g = `G-save-${vp.tag}`;
    const user = makeUser("admin");
    const { page, ctx, calls, pageErrors } = await newPage({ user, routes: f3Routes(user), viewport: vp });
    try {
      const title = await openEdit(page);
      await title.fill("ZZ Not çift tık");
      const save = page.getByTestId("save").first();
      ok(g, "Kaydet düzenleme modunda görünür ve etkin", (await save.isVisible()) && (await save.isEnabled()));
      await save.dblclick();
      await page.getByTestId("toast").filter({ hasText: "Kaydedildi." }).waitFor({ timeout: 8000 }).catch(() => {});
      const s1 = saves(calls);
      ok(g, "çift tık → TEK kayıt isteği", s1.length === 1, `POST=${s1.length}`);
      ok(g, "istek yeni not başlığını taşır", (s1[0]?.body?.blocks ?? []).some((b) => b.id === NOTE_ID && b.title === "ZZ Not çift tık"), JSON.stringify(s1[0]?.body?.blocks?.map((b) => b.title)));
      ok(g, "başarı mesajı + düzenleme kapandı", /Kaydedildi\./.test(await toastText(page)) && (await page.getByTestId("edit").count()) === 1);
      // İkinci düzenleme → bir istek daha
      await page.getByTestId("edit").click();
      await page.getByTestId("note-title-input").first().fill("ZZ ikinci kayıt");
      await page.getByTestId("save").first().click();
      await page.getByTestId("toast").filter({ hasText: "Kaydedildi." }).waitFor({ timeout: 8000 }).catch(() => {});
      await sleep(800);
      const s2 = saves(calls);
      ok(g, "ikinci Kaydet → 1 istek daha (toplam 2)", s2.length === 2 && (s2[1]?.body?.blocks ?? []).some((b) => b.title === "ZZ ikinci kayıt"), `POST=${s2.length}`);
      ok(g, "JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    } finally { await ctx.close(); }
  }

  // ── H) Kaydet hatası (500 / 401 / ağ) → mesaj, taslak korunur ────────────────────────────
  for (const [tag, resp, re] of [["500", { status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } }, /Kaydedilemedi: İşlem tamamlanamadı/],
    ["401", { status: 401, json: { error: "Yetki gerekli." } }, /Kaydedilemedi: Oturumunuz sona ermiş görünüyor/],
    ["ag", "abort", /Kaydedilemedi: Sunucuya ulaşılamadı/]]) {
    const g = `H-save-fail-${tag}`;
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user, { save: () => (resp === "abort" ? { abort: true } : resp) }), viewport: { width: 390, height: 844 } });
    try {
      const title = await openEdit(page);
      await title.fill("ZZ korunacak taslak");
      await page.getByTestId("save").first().click();
      await page.getByTestId("toast").waitFor({ timeout: 8000 }).catch(() => {});
      const t = await toastText(page);
      ok(g, "hata mesajı görünür", re.test(t), t);
      ok(g, "ham 'Yetki gerekli' / İngilizce ağ iletisi gösterilmez", !/Yetki gerekli|Failed to fetch|NetworkError/i.test(t));
      ok(g, "mesaj taslağın durduğunu söyler", /Değişiklikleriniz ekranda duruyor/.test(t));
      ok(g, "taslak korunur + düzenleme modunda kalınır", (await page.getByTestId("note-title-input").first().inputValue()) === "ZZ korunacak taslak" && (await page.getByTestId("save").first().isEnabled()));
      ok(g, "tek kayıt denemesi (otomatik tekrar yok)", saves(calls).length === 1);
    } finally { await ctx.close(); }
  }

  // ── I) Silme (konu → Silinenler; Kaydet ile kesinleşir): hata → tek mesaj, taslak korunur; çift tık → tek istek; başarı
  for (const [tag, respond] of [["401", () => ({ status: 401, json: { error: "Yetki gerekli." } })],
    ["500", () => ({ status: 500, json: { ok: false, error: "İşlem tamamlanamadı." } })],
    ["ok", () => ({ status: 200, json: { ok: true }, delay: 400 })]]) {
    const g = `I-delete-${tag}`;
    const user = makeUser("admin");
    let deleted = false;
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user, {
      save: (_req, _url, body) => {
        const r = respond();
        if (r.status === 200 && (body?.topics ?? []).some((t) => t.id === ROOT_ID && t.deleted_at)) deleted = true;
        return r;
      },
      load: () => {
        const ws = f3Workspace(user.id);
        if (deleted) for (const n of ws.nodes) if (n.id === ROOT_ID || n.parentId === ROOT_ID) n.deletedAt = "2026-10-08T09:05:00.000Z";
        return { status: 200, json: { ok: true, workspace: ws } };
      },
    }) });
    try {
      await page.goto(f3TopicUrl(BASE, ROOT_ID, ROOT_ID), { waitUntil: "load" });
      await page.getByTestId("edit").waitFor({ timeout: 20000 });
      await page.getByTestId("edit").click();
      await page.getByTestId("menu").click();
      await page.getByTestId("mi-delete").click();
      const yes = page.getByTestId("delete-yes");
      await yes.waitFor({ timeout: 5000 });
      ok(g, "silme onay paneli: Silinenler'e taşınacağını ve Kaydet'le kesinleşeceğini söyler", /Silinenler'e taşınacak[\s\S]*Kaydet/.test(await page.getByTestId("delete-confirm").innerText()));
      await yes.click();
      ok(g, "onay → henüz istek YOK (Kaydet bekleniyor)", saves(calls).length === 0);
      await page.getByTestId("save").first().dblclick();
      await sleep(2000);
      const n = saves(calls).length;
      ok(g, "çift tık → TEK kayıt isteği", n === 1, `POST=${n}`);
      const body = saves(calls)[0]?.body;
      ok(g, "istek konuyu çöpe taşır (kalıcı silme değil)", (body?.topics ?? []).some((t) => t.id === ROOT_ID && t.deleted_at) && !(body?.blocks_delete ?? []).length);
      const t = await toastText(page);
      if (tag === "ok") {
        await sleep(500);
        ok(g, "başarı → kütüphanede konu yok", (await page.getByTestId("lib-item").filter({ hasText: "ZZ Migren" }).count()) === 0);
        ok(g, "başarı mesajı", /Kaydedildi\./.test(t), t);
      } else {
        ok(g, "hata bir kez görünür", /Kaydedilemedi:/.test(t) && (t.match(/Kaydedilemedi:/g) ?? []).length === 1, t);
        if (tag === "401") ok(g, "401 → oturum mesajı (ham 'Yetki gerekli' değil)", /Oturumunuz sona ermiş/.test(t) && !/Yetki gerekli/.test(t));
        ok(g, "taslak korunur: Kaydet hâlâ etkin (silme kaybolmadı, tekrar denenebilir)", await page.getByTestId("save").first().isEnabled());
        ok(g, "Şifa ekranında kalındı", onF3(page));
      }
    } finally { await ctx.close(); }
  }

  // ── K) Kaydedilmemiş değişiklik guard'ı KORUNDU + geri tuşu oturumu bozmaz ───────────────
  {
    const g = "K-unsaved-back";
    const user = makeUser("admin");
    const { page, ctx, calls } = await newPage({ user, routes: f3Routes(user), viewport: { width: 390, height: 844 } });
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
    try {
      await page.goto(f3LibraryUrl(BASE), { waitUntil: "load" });
      await sleep(1000);
      const title = await openEdit(page);
      await title.fill("ZZ kaydedilmemiş");
      // Uygulama-içi Vazgeç → üç seçenekli onay (onaylı F2 tasarımı)
      await page.getByTestId("discard").first().click();
      const dlg = page.getByTestId("leave-dialog");
      const shown = await dlg.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
      ok(g, "Vazgeç → 'Kaydetmeden Çık' onayı (üç seçenek)", shown && (await page.getByTestId("leave-drop").count()) === 1 && (await page.getByTestId("leave-save").count()) === 1 && (await page.getByTestId("leave-continue").count()) === 1);
      await page.getByTestId("leave-continue").click();
      ok(g, "devam → taslak korunur", (await page.getByTestId("note-title-input").first().inputValue()) === "ZZ kaydedilmemiş");
      // Fiziksel geri (dirty) → uygulama içi onay; "devam" → sayfada kalınır
      await page.goBack();
      await sleep(800);
      ok(g, "geri tuşu (dirty) → onay sorulur", (await page.getByTestId("leave-dialog").count()) === 1 || dialogs.length >= 1, `dialogs=${dialogs.length}`);
      if (await page.getByTestId("leave-continue").count()) await page.getByTestId("leave-continue").click();
      ok(g, "kal → aynı konu + taslak", page.url().includes(ROOT_ID) && (await page.getByTestId("note-title-input").first().inputValue()) === "ZZ kaydedilmemiş");
      // Kaydetmeden Çık → geri → geri: oturum KORUNUR, "Yetkiniz Bulunmuyor" YOK
      await page.getByTestId("discard").first().click();
      await page.getByTestId("leave-drop").click();
      await sleep(500);
      for (let i = 0; i < 3 && !/#\/kutuphane/.test(page.url()); i++) {
        await page.goBack();
        await sleep(900);
        if (await page.getByTestId("leave-drop").count()) await page.getByTestId("leave-drop").click();
      }
      await sleep(1200);
      const s = await ls(page);
      const txt = await bodyText(page);
      ok(g, "geri tuşu sonrası oturum KORUNDU", !!s.user && !!s.token);
      ok(g, "'Yetkiniz Bulunmuyor' YOK", !/Yetkiniz Bulunmuyor/.test(txt));
      ok(g, "önceki güvenli ekrana dönüldü (kütüphane)", onF3(page) && /#\/kutuphane/.test(page.url()), page.url());
      ok(g, "logout isteği YOK; kayıt isteği YOK", !calls.some((c) => c.path === "/api/auth/session" && c.method === "DELETE") && saves(calls).length === 0);
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
