// Final-A1 — UI davranış testleri (Playwright, yerel build, ağ-mock). Prod'a / dış ağa temas YOK:
// /api/* istekleri sentetik ZZ verisiyle karşılanır; 127.0.0.1 dışı her istek abort edilir.
// Çalıştırma (scripts/pre-sale-a2b/ui/README.md ile aynı): fake-supabase-sink + sahte env build + start,
//   node scripts/final-a1/ui-final-a1.mjs   (UI_BASE ile port; ONLY=dogaltas,reader,yh,admin,refleks)
import { newPage, makeUser, BASE, sleep, close } from "../pre-sale-a2b/ui/ui-lib.mjs";

let pass = 0;
let fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}
const MOBILE = { width: 390, height: 844, tag: "mobil" };
const WEB = { width: 1280, height: 900, tag: "web" };
const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const uid = (p, i) => `${p}0000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const realErrors = (errs) => errs.filter((e) => !/Failed to fetch|aborted|NetworkError|internetdisconnected/i.test(e));
const withViewport = async (opts, vp) => {
  const r = await newPage({ ...opts, viewport: { width: vp.width, height: vp.height } });
  return r;
};

// ── #9 Doğaltaş İçerik araması: detay → geri → mod + sorgu + sonuçlar + Kontrol edildi + scroll ──
function stone(i, extra = {}) {
  return {
    id: uid("f", i), tenant_id: TENANT, stone_name: `ZZ Taş ${String(i).padStart(2, "0")}`, short_description: "ZZ sentetik kısa açıklama",
    general_info: null, chakras: [], images: [], updated_at: "2026-10-01T09:00:00.000Z", ...extra,
  };
}
async function testDogaltasBack() {
  // İçerik araması "enerji": adında geçmeyen, içeriğinde geçen 24 taş (scroll için uzun liste).
  const STONES = Array.from({ length: 24 }, (_, i) => stone(i + 1, { general_info: "ZZ enerji dengeler." }));
  for (const vp of [MOBILE, WEB]) {
    const g = `#9-dogaltas-icerik-geri-${vp.tag}`;
    const listCalls = [];
    const { page, ctx, pageErrors } = await withViewport({
      user: makeUser("expert"),
      routes: [
        ["GET", /^\/api\/dogaltas\/stones\?/, (_r, url) => {
          const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr-TR");
          const mode = url.searchParams.get("searchMode") ?? "name";
          listCalls.push(`${q}|${mode}`);
          const rows = STONES.filter((s) => !q || (mode === "content"
            ? `${s.stone_name} ${s.general_info}`.toLocaleLowerCase("tr-TR").includes(q)
            : s.stone_name.toLocaleLowerCase("tr-TR").includes(q)));
          if ((url.searchParams.get("mode") ?? "list") === "count") return { status: 200, json: { ok: true, count: rows.length } };
          return { status: 200, json: { ok: true, rows, count: rows.length } };
        }],
        ["GET", /^\/api\/dogaltas\/stones\/f/, (_r, url) => {
          const id = url.pathname.split("/").pop();
          return { status: 200, json: { ok: true, row: STONES.find((s) => s.id === id) ?? null } };
        }],
        ["GET", /^\/api\/dogaltas\/stone-exclusions/, () => ({ status: 200, json: { ok: true, stoneIds: [] } })],
      ],
    }, vp);
    const card = (name) => page.locator("a", { hasText: name }).first();
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi`, { waitUntil: "load" });
      await page.getByRole("button", { name: "İçerik", exact: true }).click();
      const search = page.locator('input[type="search"], input[type="text"]').first();
      await search.fill("enerji");
      await card("ZZ Taş 01").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "İçerik modunda 24 sonuç", (await page.locator("a", { hasText: /ZZ Taş \d\d/ }).count()) >= 24);
      ok(g, "URL'de q + mode=content", /q=enerji/.test(page.url()) && /mode=content/.test(page.url()), page.url());
      // Listenin aşağısındaki bir taşa git (scroll konumu oluşsun)
      const target = card("ZZ Taş 18");
      await target.scrollIntoViewIfNeeded();
      await sleep(400);
      const yBefore = await page.evaluate(() => window.scrollY);
      const topBefore = (await target.boundingBox())?.y ?? -1;
      await target.click();
      await page.waitForURL(/dogaltas-listesi\/f/, { timeout: 10000 });
      ok(g, "detay linki modu taşır", /mode=content/.test(page.url()), page.url());
      await sleep(700);
      await page.goBack();
      await card("ZZ Taş 01").waitFor({ timeout: 10000 });
      await sleep(1500);
      const contentBtn = page.getByRole("button", { name: "İçerik", exact: true });
      const pressedClass = await contentBtn.getAttribute("class");
      const nameClass = await page.getByRole("button", { name: "Taş İsmi", exact: true }).getAttribute("class");
      ok(g, "geri dönünce mod hâlâ İçerik (Taş İsmi'ne düşmedi)", pressedClass !== nameClass && /mode=content/.test(page.url()), page.url());
      ok(g, "arama metni korundu", (await search.inputValue()) === "enerji");
      ok(g, "sonuç listesi korundu (24; 'Sonuç bulunamadı' yok)", (await page.locator("a", { hasText: /ZZ Taş \d\d/ }).count()) >= 24 && !(await page.getByText("Sonuç bulunamadı").count()));
      ok(g, "geri dönüşte istek İçerik modunda", listCalls.slice(-1)[0] === "enerji|content", listCalls.slice(-3).join(","));
      const badge = target.locator("xpath=ancestor::div[contains(@class,'rounded-[18px]')][1]").getByTestId("search-checked-badge");
      ok(g, "açılan taş 'Kontrol edildi'", (await badge.count()) === 1);
      const yAfter = await page.evaluate(() => window.scrollY);
      const topAfter = (await target.boundingBox())?.y ?? -1;
      ok(g, "scroll geri yüklendi: açılan taş yine ekranda, aynı yerde (±40px)", yAfter > 200 && Math.abs(topAfter - topBefore) <= 40, `önce y=${yBefore} top=${topBefore} sonra y=${yAfter} top=${topAfter}`);
      // İsim modu da çalışmaya devam eder (regresyon)
      await page.getByRole("button", { name: "Taş İsmi", exact: true }).click();
      await search.fill("ZZ Taş 03");
      await card("ZZ Taş 03").waitFor({ timeout: 10000 });
      await sleep(800);
      ok(g, "isim modu: URL'de mode yok", !/mode=content/.test(page.url()), page.url());
      await card("ZZ Taş 03").click();
      await page.waitForURL(/dogaltas-listesi\/f/, { timeout: 10000 });
      await sleep(500);
      await page.goBack();
      await card("ZZ Taş 03").waitFor({ timeout: 10000 });
      await sleep(900);
      ok(g, "isim modu geri dönüş: aynı sorgu + sonuç", (await search.inputValue()) === "ZZ Taş 03" && (await page.locator("a", { hasText: /ZZ Taş \d\d/ }).count()) >= 1);
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #10 Doğaltaş ReaderModal: arka plana dokunma kapatır, içerik/kaydırma kapatmaz ─────────────
async function testReaderBackdrop() {
  const LONG = "ZZ okuyucu paragrafı uzun metin. ".repeat(400);
  const S = stone(40, { stone_name: "ZZ Okuyucu Taşı", general_info: LONG });
  for (const vp of [MOBILE, WEB]) {
    const g = `#10-okuyucu-arkaplan-${vp.tag}`;
    const { page, ctx, pageErrors } = await withViewport({
      user: makeUser("expert"),
      routes: [["GET", new RegExp(`^/api/dogaltas/stones/${S.id}$`), () => ({ status: 200, json: { ok: true, row: S } })]],
    }, vp);
    const openReader = async () => {
      await page.getByText("Tam okumak için tıklayın").nth(1).click();
      await page.getByTestId("reader-modal-panel").waitFor({ timeout: 5000 });
      await sleep(300);
    };
    const isOpen = async () => (await page.getByTestId("reader-modal-panel").count()) === 1;
    const tap = async (x, y) => page.mouse.click(x, y);
    try {
      await page.goto(`${BASE}/dogaltas/dogaltas-listesi/${S.id}`, { waitUntil: "load" });
      await page.getByText("ZZ Okuyucu Taşı").first().waitFor({ timeout: 15000 });
      await sleep(800);
      await openReader();
      const pb = await page.getByTestId("reader-modal-panel").boundingBox();
      if (vp.width < 768) {
        ok(g, "mobil: panelin ÜSTÜNDE karartılmış alan var", pb.y >= 40, JSON.stringify(pb));
        ok(g, "mobil: panelin ALTINDA karartılmış alan var", vp.height - (pb.y + pb.height) >= 40, JSON.stringify(pb));
      }
      // içerik alanına dokunma kapatmaz
      await tap(pb.x + pb.width / 2, pb.y + pb.height * 0.6);
      await sleep(300);
      ok(g, "içerik alanına dokunma KAPATMAZ", await isOpen());
      // içerikte kaydırma kapatmaz
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height * 0.7);
      await page.mouse.wheel(0, 600);
      await sleep(300);
      ok(g, "içerikte kaydırma KAPATMAZ", await isOpen());
      // içerikte başlayıp arka planda biten sürükleme kapatmaz
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height - 20);
      await page.mouse.down();
      await page.mouse.move(pb.x + pb.width / 2, Math.min(vp.height - 5, pb.y + pb.height + 30), { steps: 4 });
      await page.mouse.up();
      await sleep(300);
      ok(g, "içerikten dışarı sürükleme KAPATMAZ", await isOpen());
      // üst arka plan
      await tap(vp.width / 2, Math.max(5, pb.y / 2));
      await sleep(400);
      ok(g, "üst arka plana dokunma KAPATIR", !(await isOpen()));
      if (vp.width < 768) {
        await openReader();
        const pb2 = await page.getByTestId("reader-modal-panel").boundingBox();
        await tap(vp.width / 2, pb2.y + pb2.height + (vp.height - pb2.y - pb2.height) / 2);
        await sleep(400);
        ok(g, "ALT arka plana dokunma KAPATIR", !(await isOpen()));
      }
      await openReader();
      await page.getByRole("button", { name: /Kapat/ }).first().click();
      await sleep(300);
      ok(g, "Kapat düğmesi çalışır", !(await isOpen()));
      await openReader();
      await page.keyboard.press("Escape");
      await sleep(300);
      ok(g, "Esc kapatır", !(await isOpen()));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #12 Ana panel Yaşam Hafızası kartı ─────────────────────────────────────────────────────────
async function testYhCard() {
  const on = { yh_enabled: true, yh_hizli: true };
  const SCEN = {
    processing: { json: { ok: true, accessible: true, tenantRows: 0, tenantPending: 5, syntheticTenant: false, flags: on }, expect: "Hazırlanıyor" },
    readyData: { json: { ok: true, accessible: true, tenantRows: 1234, syntheticTenant: false, flags: on }, expect: "1.234 kayıt hazır" },
    readyZero: { json: { ok: true, accessible: true, tenantRows: 0, tenantPending: 0, syntheticTenant: false, flags: on }, expect: "Hafıza hazır — henüz kayıt yok" },
    error: { status: 500, json: { ok: false }, expect: null },
  };
  for (const [name, sc] of Object.entries(SCEN)) {
    const g = `#12-yh-kart-${name}`;
    const { page, ctx, pageErrors } = await newPage({
      user: makeUser("expert"),
      routes: [["GET", /^\/api\/yasam-hafizasi\/health/, () => ({ status: sc.status ?? 200, json: sc.json })]],
    });
    try {
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      const yhCard = page.locator("a, article, div", { hasText: "Yaşam Hafızası" }).filter({ hasText: /Modüllerdeki|mesleki/ }).last();
      await yhCard.waitFor({ timeout: 15000 });
      await sleep(2500);
      const text = await yhCard.innerText();
      if (sc.expect) ok(g, `kart metni "${sc.expect}"`, text.includes(sc.expect), text.replace(/\s+/g, " "));
      if (name !== "processing") ok(g, "Hazırlanıyor YAZMAZ", !text.includes("Hazırlanıyor"), text.replace(/\s+/g, " "));
      if (name === "error") ok(g, "hata → hazır iddiası yok", !/kayıt hazır|Hafıza hazır/.test(text), text.replace(/\s+/g, " "));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #11 Admin "Çıkış Yap" onayı + #2/#3 Veri Aktarım uzman arama/sayfalama ──────────────────────
function expertRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: uid("e", i + 1), role: "expert", full_name: `ZZ Uzman ${String(i + 1).padStart(3, "0")}`,
    email: `zz-uzman-${String(i + 1).padStart(3, "0")}@example.invalid`, tenant_id: uid("c", i + 1), active: true,
    approval_status: "approved",
  }));
}
function usersApi(all) {
  return (_r, url) => {
    const q = (url.searchParams.get("q") ?? "").toLocaleLowerCase("tr-TR");
    const page = Number(url.searchParams.get("page") ?? 1);
    const size = Number(url.searchParams.get("pageSize") ?? 20);
    const hit = all.filter((r) => !q || r.full_name.toLocaleLowerCase("tr-TR").includes(q) || r.email.includes(q));
    return { status: 200, json: { users: hit.slice((page - 1) * size, page * size), total: hit.length, page, pageSize: size, counts: {} } };
  };
}
async function testAdminLogout() {
  const PAGES = ["/admin", "/admin/support", "/admin/tenant-kontrol", "/admin/users", `/admin/users/${uid("e", 1)}`, "/admin/veri-paylasimi"];
  for (const path of PAGES) {
    const g = `#11-admin-cikis-${path}`;
    const detailRow = { ...expertRows(1)[0], module_permissions: {}, membership_status: "active", package_type: "premium" };
    const { page, ctx, pageErrors } = await newPage({ user: makeUser("admin"), routes: [
      ["GET", /^\/api\/admin\/users\?/, usersApi(expertRows(3))],
      ["GET", /^\/api\/admin\/users\/e0000000-[^/?]+$/, () => ({ status: 200, json: { user: detailRow, viewer: { isMainAdmin: true }, paymentHistory: [] } })],
    ] });
    try {
      if (path === "/admin/support") {
        // Bu sayfada "Çıkış Yap" yalnız "Erişim reddedildi" durumunda çizilir: kabuk (sunucu) admin
        // çerezini geçer, yerel kullanıcı yönetici değildir.
        await page.addInitScript((u) => { try { localStorage.setItem("yasam_user", JSON.stringify(u)); } catch {} }, { ...makeUser("expert") });
      }
      await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      const btn = page.getByRole("button", { name: /Çıkış Yap/ }).first();
      await btn.waitFor({ timeout: 15000 });
      await sleep(800);
      await btn.click();
      const dialog = page.getByRole("alertdialog");
      await dialog.waitFor({ timeout: 5000 });
      ok(g, "tek tık → onay penceresi (çıkış YOK)", (await dialog.innerText()).includes("Çıkış yapılsın mı?"));
      ok(g, "onay sırasında oturum duruyor", (await page.evaluate(() => localStorage.getItem("yasam_user"))) !== null);
      await dialog.getByRole("button", { name: "Vazgeç" }).click();
      await sleep(600);
      ok(g, "Vazgeç → sayfada kalır, oturum duruyor",
        new URL(page.url()).pathname === path && (await page.evaluate(() => localStorage.getItem("yasam_user"))) !== null, page.url());
      if (path === "/admin/veri-paylasimi") {
        await btn.click();
        await page.getByRole("alertdialog").getByRole("button", { name: "Çıkış Yap" }).click();
        await page.waitForURL((u) => new URL(u).pathname === "/", { timeout: 10000 }).catch(() => {});
        await sleep(500);
        ok(g, "onay → çıkış + ana sayfa", new URL(page.url()).pathname === "/" && (await page.evaluate(() => localStorage.getItem("yasam_user"))) === null, page.url());
      }
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

async function testTransferExperts() {
  for (const n of [7, 50, 51, 120]) {
    const g = `#2/#3-veri-aktarim-${n}-uzman`;
    const all = expertRows(n);
    all[n - 1] = { ...all[n - 1], full_name: "Şükrü IŞIK", email: "sukru.isik@example.invalid" };
    const { page, ctx, calls, pageErrors } = await newPage({ user: makeUser("admin"), routes: [["GET", /^\/api\/admin\/users\?/, usersApi(all)]] });
    const cards = () => page.locator("section", { hasText: "1. Üye Seç" }).locator("button", { hasText: /@example\.invalid/ });
    try {
      await page.goto(`${BASE}/admin/veri-paylasimi`, { waitUntil: "load" });
      await page.getByTestId("transfer-expert-search").waitFor({ timeout: 15000 });
      await sleep(1500);
      ok(g, `ilk görünüm ${Math.min(n, 50)} kart`, (await cards().count()) === Math.min(n, 50), String(await cards().count()));
      ok(g, "sayaç toplamı doğru", (await page.getByTestId("transfer-expert-count").innerText()).includes(`/ ${n} uzman`));
      const more = page.getByTestId("transfer-expert-load-more");
      if (n > 50) {
        ok(g, `"Daha fazla" görünür (${n - 50} kaldı)`, (await more.innerText()).includes(`${n - 50} kaldı`));
        while ((await more.count()) > 0) { await more.click(); await sleep(800); }
        ok(g, `tüm ${n} uzman yüklendi (kayıp yok)`, (await cards().count()) === n, String(await cards().count()));
      } else {
        ok(g, `"Daha fazla" YOK`, (await more.count()) === 0);
      }
      // Son uzmanı seç → arama ile listeden düşse de seçim korunur
      await cards().filter({ hasText: "Şükrü IŞIK" }).click();
      const search = page.getByTestId("transfer-expert-search");
      await search.fill("şükrü ışık");
      await sleep(1200);
      ok(g, "isim araması (Türkçe) → 1 sonuç", (await cards().count()) === 1 && (await cards().first().innerText()).includes("Şükrü IŞIK"));
      ok(g, "arama sunucuya q ile gider", calls.some((c) => c.path === "/api/admin/users" && /q=/.test(c.search)));
      await search.fill("zz-uzman-002@");
      await sleep(1200);
      ok(g, "e-posta araması → 1 sonuç", (await cards().count()) === 1 && (await cards().first().innerText()).includes("zz-uzman-002@example.invalid"));
      ok(g, "seçili uzman aramada gizlense de korunur", (await page.getByTestId("transfer-expert-selected-hidden").innerText()).includes("Şükrü IŞIK"));
      await search.fill("zz-yok-boyle");
      await sleep(1200);
      ok(g, "sonuç yok mesajı", (await page.getByTestId("transfer-expert-empty").innerText()).includes("eşleşen uzman bulunamadı"));
      await search.fill("");
      await sleep(1200);
      ok(g, "arama temizlenince liste geri gelir", (await cards().count()) === Math.min(n, 50));
      const reqs = calls.filter((c) => c.path === "/api/admin/users");
      ok(g, "filtre değişmedi: role=expert & active=active", reqs.every((c) => /role=expert/.test(c.search) && /active=active/.test(c.search)));
      ok(g, "aktarım isteği gönderilmedi (salt görüntüleme)", !calls.some((c) => c.method === "POST"));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

// ── #13 Refleksoloji Kayıtlı Protokol önizleme başlığı ─────────────────────────────────────────
function atlasDoc(organViews) {
  const bucket = () => ({ sol: [], sag: [] });
  const doc = { _meta: { version: "1", updated_at: "2026-10-01T09:00:00.000Z" } };
  for (const [organ, views] of Object.entries(organViews)) {
    const e = { taban: bucket(), yan_ic: bucket(), yan_dis: bucket(), el_avuc: bucket(), el_sirt: bucket() };
    for (const v of views) e[v].sol.push({ id: `${organ}-${v}`, shape: "oval", cx: 0.3, cy: 0.5, rx: 0.05, ry: 0.05, color: "#7c3aed" });
    doc[organ] = e;
  }
  return doc;
}
async function testRefleksHeading() {
  const SCEN = [
    { name: "yalniz-el", organs: { kalp: ["el_avuc"] }, expect: "El Haritası Önizleme" },
    { name: "yalniz-ayak", organs: { kalp: ["taban"] }, expect: "Ayak Haritası Önizleme" },
    { name: "ayak+el", organs: { kalp: ["taban", "el_sirt"] }, expect: "Ayak Haritası Önizleme", toggle: { button: "El Sırtı", expect: "El Haritası Önizleme" } },
  ];
  for (const sc of SCEN) {
    const g = `#13-refleks-baslik-${sc.name}`;
    const PID = uid("d", 7);
    const protocol = { id: PID, tenant_id: TENANT, title: "ZZ Protokol", organs: Object.keys(sc.organs).join(", "), raw_json: null, created_at: "2026-10-01T09:00:00.000Z" };
    const { page, ctx, calls, pageErrors } = await newPage({
      user: makeUser("expert"),
      routes: [
        ["GET", new RegExp(`^/api/refleksoloji/protocols/${PID}`), () => ({ status: 200, json: { ok: true, protocol } })],
        ["GET", /^\/api\/refleksoloji\/atlas/, () => ({ status: 200, json: { ok: true, document: atlasDoc(sc.organs), organ_list: Object.keys(sc.organs), updated_at: "2026-10-01T09:00:00.000Z" } })],
      ],
    });
    try {
      await page.goto(`${BASE}/refleksoloji/kayitli-protokoller/${PID}`, { waitUntil: "load" });
      const heading = page.getByRole("heading", { name: /Haritası Önizleme/ });
      await heading.waitFor({ timeout: 15000 });
      await sleep(1500);
      ok(g, `başlık "${sc.expect}"`, (await heading.innerText()).trim() === sc.expect, await heading.innerText());
      const region = page.locator(`section[aria-label="${sc.expect.replace(" Önizleme", " önizleme").replace("Haritası", "haritası")}"]`);
      ok(g, "bölüm aria-label başlıkla tutarlı", (await region.count()) === 1);
      if (sc.toggle) {
        await page.getByRole("button", { name: sc.toggle.button, exact: true }).click();
        await sleep(600);
        ok(g, `görünüm "${sc.toggle.button}" → "${sc.toggle.expect}"`, (await heading.innerText()).trim() === sc.toggle.expect, await heading.innerText());
        await page.getByRole("button", { name: "Taban", exact: true }).click();
        await sleep(600);
        ok(g, "Taban'a dönünce Ayak", (await heading.innerText()).trim() === "Ayak Haritası Önizleme");
      }
      ok(g, "görüntüleme atlas'a YAZMAZ (PUT yok)", !calls.some((c) => c.method === "PUT" || c.method === "POST"), calls.filter((c) => c.method !== "GET").map((c) => c.method + " " + c.path).join(","));
      ok(g, "JS hata yok", realErrors(pageErrors).length === 0, pageErrors.join(" ; "));
    } catch (e) { ok(g, "senaryo çalıştı", false, e); } finally { await ctx.close(); }
  }
}

const ALL = { dogaltas: testDogaltasBack, reader: testReaderBackdrop, yh: testYhCard, admin: testAdminLogout, transfer: testTransferExperts, refleks: testRefleksHeading };
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
for (const [k, fn] of Object.entries(ALL)) {
  if (only.length && !only.includes(k)) continue;
  await fn();
}
await close();
console.log(`\nFinal-A1 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
