// FINAL-A3 — auth/üyelik guard GERÇEK TARAYICI davranış testleri (Playwright, yerel build, ağ-mock).
// Prod'a / dış ağa temas YOK: 127.0.0.1 dışı her istek abort; tüm /api/** test içinde yanıtlanır.
// Çalıştırma:
//   node scripts/final-a3/fake-supabase-sink-a3.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 ... npx next build && npx next start -p 3911 -H 127.0.0.1 &
//   UI_BASE=http://127.0.0.1:3911 node scripts/final-a3/ui-final-a3.mjs   (ONLY=guard,session,beslenme,admin)
import { chromium } from "playwright";

const BASE = process.env.UI_BASE ?? "http://127.0.0.1:3911";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function ok(group, name, cond, detail = "") {
  if (cond) pass++; else fail++;
  console.log(`${cond ? "✅" : "❌"} [${group}] ${name}${!cond && detail ? "  → " + String(detail).slice(0, 300) : ""}`);
}

const TENANT = "aaaaaaaa-0000-4000-8000-00000000000a";
const A = "00000000-0000-4000-8000-0000000000e1";
const B = "00000000-0000-4000-8000-0000000000e2";
const ADMIN = "00000000-0000-4000-8000-0000000000ad";
function expert(id, over = {}) {
  return {
    id, email: `zz-${id.slice(-2)}@example.invalid`, full_name: `ZZ ${id.slice(-2)}`, name: `ZZ ${id.slice(-2)}`,
    role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
    tenant_id: TENANT, is_demo_account: false, module_permissions: { numerology: true, beslenme: true, clients: true },
    ...over,
  };
}
const INACTIVE = (id) => expert(id, { package_type: "basic" });
const NO_NUMEROLOGY = (id) => expert(id, { module_permissions: { beslenme: true } });

const DENY_MEMBERSHIP = "Üyeliğiniz Aktif Değil";
const DENY_PERMISSION = "Yetkiniz Bulunmuyor";

let browser;
/**
 * opts.user: localStorage'daki önbellek kaydı · opts.profile(userId, n) → {status, json} | "abort"
 * opts.session(n) → {status, json} | "abort" · opts.api(path, method) → {status,json} | undefined
 */
async function open({ user, profile, session, api, viewport = { width: 1280, height: 900 }, cookies = [] }) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  if (cookies.length) await ctx.addCookies(cookies);
  if (user) {
    await ctx.addInitScript((u) => {
      try {
        if (!sessionStorage.getItem("__a3_seeded")) {
          localStorage.setItem("yasam_user", JSON.stringify(u));
          localStorage.setItem("yasam_session_token", "zz-local-fake-token");
          localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
          sessionStorage.setItem("__a3_seeded", "1");
        }
      } catch {}
    }, user);
  }
  const calls = [];
  let profileN = 0;
  let sessionN = 0;
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname !== "127.0.0.1") return route.abort();
    if (url.port === "54399") return route.continue();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const entry = { method: req.method(), path: url.pathname, uid: req.headers()["x-user-id"] ?? null };
    calls.push(entry);
    const reply = (r) => (r === "abort" ? route.abort("internetdisconnected") : route.fulfill({ status: r.status, json: r.json ?? {} }));
    if (url.pathname === "/api/auth/profile") {
      profileN++;
      return reply(profile ? profile(entry.uid, profileN) : { status: 200, json: { ok: true, profile: user } });
    }
    if (url.pathname === "/api/auth/session" && req.method() === "GET") {
      sessionN++;
      return reply(session ? session(sessionN) : { status: 200, json: { valid: true } });
    }
    const custom = api?.(url.pathname, req.method());
    if (custom) return reply(custom);
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  return { ctx, page, calls, pageErrors };
}
const text = (page) => page.evaluate(() => document.body?.innerText ?? "");
async function settle(page, ms = 2500) {
  await page.waitForLoadState("load").catch(() => {});
  await sleep(ms);
}
const stored = (page) => page.evaluate(() => localStorage.getItem("yasam_user"));

// ── ModuleRouteGuard (/numeroloji) ───────────────────────────────────────────────
async function testGuard() {
  const G = "guard";
  const P = "/numeroloji";

  // 1) aktif üyelik + modül izni → erişim
  {
    const { ctx, page, pageErrors } = await open({ user: expert(A) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "1 aktif + izinli → içerik (red/doğrulanamadı/bekleme yok)",
      !t.includes(DENY_MEMBERSHIP) && !t.includes(DENY_PERMISSION) && !t.includes("Kontrol ediliyor") && !(await page.getByTestId("access-unverified").count()), t.slice(0, 160));
    ok(G, "1 JS hata yok", pageErrors.length === 0, pageErrors.join(" ; "));
    await ctx.close();
  }
  // 2) sunucu üyelik pasif diyor → "Üyeliğiniz Aktif Değil"
  {
    const { ctx, page } = await open({ user: expert(A), profile: () => ({ status: 200, json: { ok: true, profile: INACTIVE(A) } }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "2 sunucu üyelik pasif (önbellek aktif olsa da) → Üyeliğiniz Aktif Değil", t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    await ctx.close();
  }
  // 2b) önbellek pasif + sunucu pasif → aynı red
  {
    const { ctx, page } = await open({ user: INACTIVE(A), profile: () => ({ status: 200, json: { ok: true, profile: INACTIVE(A) } }) });
    await page.goto(BASE + P); await settle(page);
    ok(G, "2b önbellek + sunucu pasif → Üyeliğiniz Aktif Değil", (await text(page)).includes(DENY_MEMBERSHIP));
    await ctx.close();
  }
  // 3) modül izni yok (sunucu) → "Yetkiniz Bulunmuyor"
  {
    const { ctx, page } = await open({ user: NO_NUMEROLOGY(A), profile: () => ({ status: 200, json: { ok: true, profile: NO_NUMEROLOGY(A) } }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "3 modül reddi (sunucu) → Yetkiniz Bulunmuyor", t.includes(DENY_PERMISSION) && !t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    await ctx.close();
  }
  // 7) önbellek pasif + profil 200 ama profile=null (doğrulanamamış null) → yanlış "pasif" YOK
  {
    const { ctx, page } = await open({ user: INACTIVE(A), profile: () => ({ status: 200, json: { ok: true, profile: null } }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "7 senkron null → 'Üyeliğiniz Aktif Değil' YOK", !t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    ok(G, "7 senkron null → 'doğrulanamadı' durumu + Tekrar Dene", (await page.getByTestId("access-unverified").count()) === 1 && (await page.getByTestId("access-retry").count()) === 1);
    ok(G, "7 senkron null → içerik AÇILMADI (fail-open yok)", !(await page.locator("main h1").filter({ hasText: /Numeroloji/i }).count()));
    await ctx.close();
  }
  // 8) bayat red önbelleği + geçici sunucu hatası (503 / ağ) → yanlış "pasif" YOK, logout YOK
  for (const [tag, resp] of [["503", { status: 503, json: { error: "x" } }], ["500", { status: 500, json: {} }], ["ağ", "abort"]]) {
    const { ctx, page } = await open({ user: INACTIVE(A), profile: () => resp });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, `8 bayat pasif önbellek + ${tag} → 'Üyeliğiniz Aktif Değil' YOK`, !t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    ok(G, `8 bayat pasif önbellek + ${tag} → doğrulanamadı gösterildi`, (await page.getByTestId("access-unverified").count()) === 1);
    ok(G, `8 ${tag} → oturum silinmedi + sayfada kaldı`, !!(await stored(page)) && new URL(page.url()).pathname === P, page.url());
    await ctx.close();
  }
  // 8b) bayat modül-red önbelleği + 503 → yanlış "Yetkiniz Bulunmuyor" YOK
  {
    const { ctx, page } = await open({ user: NO_NUMEROLOGY(A), profile: () => ({ status: 503, json: {} }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "8b bayat modül-red + 503 → 'Yetkiniz Bulunmuyor' YOK, doğrulanamadı VAR",
      !t.includes(DENY_PERMISSION) && (await page.getByTestId("access-unverified").count()) === 1, t.slice(0, 160));
    await ctx.close();
  }
  // 9) bayat red önbelleği + sunucu aktif diyor → erişim düzelir
  {
    const { ctx, page } = await open({ user: INACTIVE(A), profile: () => ({ status: 200, json: { ok: true, profile: expert(A) } }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "9 bayat pasif önbellek + sunucu aktif → erişim (red yok)", !t.includes(DENY_MEMBERSHIP) && !(await page.getByTestId("access-unverified").count()), t.slice(0, 160));
    ok(G, "9 önbellek güncellendi (premium)", JSON.parse((await stored(page)) ?? "{}").package_type === "premium");
    await ctx.close();
  }
  // 9b) geçici hata → Tekrar Dene → sunucu artık yanıt veriyor → erişim
  {
    const { ctx, page, calls } = await open({ user: INACTIVE(A), profile: (_u, n) => (n === 1 ? { status: 503, json: {} } : { status: 200, json: { ok: true, profile: expert(A) } }) });
    await page.goto(BASE + P); await settle(page);
    ok(G, "9b ilk deneme 503 → doğrulanamadı", (await page.getByTestId("access-unverified").count()) === 1);
    await page.getByTestId("access-retry").click(); await settle(page, 2000);
    const t = await text(page);
    ok(G, "9b Tekrar Dene → yeniden profil isteği + erişim",
      calls.filter((c) => c.path === "/api/auth/profile").length >= 2 && !(await page.getByTestId("access-unverified").count()) && !t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    await ctx.close();
  }
  // 9c) geçici hata → Tekrar Dene → sunucu pasif diyor → güvenli red (güvenlik gevşemedi)
  {
    const { ctx, page } = await open({ user: INACTIVE(A), profile: (_u, n) => (n === 1 ? { status: 503, json: {} } : { status: 200, json: { ok: true, profile: INACTIVE(A) } }) });
    await page.goto(BASE + P); await settle(page);
    await page.getByTestId("access-retry").click(); await settle(page, 2000);
    ok(G, "9c Tekrar Dene → sunucu pasif → Üyeliğiniz Aktif Değil", (await text(page)).includes(DENY_MEMBERSHIP));
    await ctx.close();
  }
  // 10) kullanıcı/tenant değişimi: A (pasif) → B (aktif) — eski red B'ye taşınmaz; tersi de
  {
    const { ctx, page, calls } = await open({
      user: INACTIVE(A),
      profile: (uid) => ({ status: 200, json: { ok: true, profile: uid === B ? expert(B, { tenant_id: "bbbbbbbb-0000-4000-8000-00000000000b" }) : INACTIVE(A) } }),
    });
    await page.goto(BASE + P); await settle(page);
    ok(G, "10 A (pasif) → red", (await text(page)).includes(DENY_MEMBERSHIP));
    await page.evaluate((u) => localStorage.setItem("yasam_user", JSON.stringify(u)), expert(B, { tenant_id: "bbbbbbbb-0000-4000-8000-00000000000b" }));
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "10 hesap B'ye geçince A'nın reddi taşınmadı → erişim", !t.includes(DENY_MEMBERSHIP), t.slice(0, 160));
    ok(G, "10 B için profil B kimliğiyle soruldu", calls.some((c) => c.path === "/api/auth/profile" && c.uid === B));
    await page.evaluate((u) => localStorage.setItem("yasam_user", JSON.stringify(u)), INACTIVE(A));
    await page.goto(BASE + P); await settle(page);
    ok(G, "10 tekrar A → A'nın kendi reddi (B'nin izni A'ya taşınmadı)", (await text(page)).includes(DENY_MEMBERSHIP));
    await ctx.close();
  }
  // 13) önbellek İZİNLİ + sunucu 503 → mevcut içerik kalır (yeni izin verilmez; davranış değişmedi)
  {
    const { ctx, page } = await open({ user: expert(A), profile: () => ({ status: 503, json: {} }) });
    await page.goto(BASE + P); await settle(page);
    const t = await text(page);
    ok(G, "13 önbellek izinli + 503 → mevcut davranış (red yok, logout yok)", !t.includes(DENY_MEMBERSHIP) && !!(await stored(page)), t.slice(0, 160));
    await ctx.close();
  }
}

// ── Oturum (useStoredSessionGuard) ───────────────────────────────────────────────
async function testSession() {
  const G = "session";
  const P = "/numeroloji";
  for (const [tag, resp] of [["503", { status: 503, json: { valid: null, unavailable: true } }], ["500", { status: 500, json: {} }], ["ağ", "abort"], ["bozuk 200", { status: 200, json: { foo: 1 } }]]) {
    const { ctx, page } = await open({ user: expert(A), session: () => resp });
    await page.goto(BASE + P); await settle(page, 8000);
    ok(G, `5/6 oturum kontrolü ${tag} → logout YOK, oturum duruyor, sayfada`, !!(await stored(page)) && new URL(page.url()).pathname === P, page.url());
    await ctx.close();
  }
  // tek valid:false + sonra valid:true → logout YOK (iki kesin red şartı korunuyor)
  {
    const { ctx, page } = await open({ user: expert(A), session: (n) => (n === 1 ? { status: 200, json: { valid: false, reason: "revoked" } } : { status: 200, json: { valid: true } }) });
    await page.goto(BASE + P); await settle(page, 8000);
    ok(G, "tek valid:false → logout YOK", !!(await stored(page)) && new URL(page.url()).pathname === P, page.url());
    await ctx.close();
  }
  // 4) açık geçersiz oturum (iki kesin valid:false) → mevcut güvenli çıkış
  {
    const { ctx, page } = await open({ user: expert(A), session: () => ({ status: 200, json: { valid: false, reason: "expired" } }) });
    await page.goto(BASE + P); await settle(page, 9000);
    ok(G, "4 iki kesin valid:false → oturum temizlendi + ana sayfa", !(await stored(page)) && new URL(page.url()).pathname === "/", page.url());
    await ctx.close();
  }
}

// ── Beslenme ─────────────────────────────────────────────────────────────────────
async function testBeslenme() {
  const G = "beslenme";
  const P = "/beslenme";
  for (const [tag, resp] of [["503", { status: 503, json: { error: "x" } }], ["500", { status: 500, json: {} }], ["ağ", "abort"], ["bozuk 200", { status: 200, json: {} }]]) {
    const { ctx, page } = await open({ user: expert(A), api: (p) => (p === "/api/beslenme/access" ? resp : undefined) });
    await page.goto(BASE + P); await settle(page);
    ok(G, `12 erişim probe ${tag} → ana sayfaya atılmadı`, new URL(page.url()).pathname === P, page.url());
    ok(G, `12 ${tag} → doğrulanamadı + Tekrar Dene, içerik kapalı`,
      (await page.getByTestId("access-unverified").count()) === 1 && (await page.getByTestId("access-retry").count()) === 1);
    ok(G, `12 ${tag} → oturum silinmedi`, !!(await stored(page)));
    await ctx.close();
  }
  for (const [tag, resp] of [["403", { status: 403, json: { code: "MODULE_DENIED" } }], ["401", { status: 401, json: {} }]]) {
    const { ctx, page } = await open({ user: expert(A), api: (p) => (p === "/api/beslenme/access" ? resp : undefined) });
    await page.goto(BASE + P); await settle(page);
    ok(G, `13 açık red ${tag} → mevcut davranış: ana sayfaya yönlendirme`, new URL(page.url()).pathname === "/", page.url());
    await ctx.close();
  }
  {
    const { ctx, page } = await open({ user: expert(A), api: (p) => (p === "/api/beslenme/access" ? { status: 200, json: { ok: true, access: true, clients: true } } : undefined) });
    await page.goto(BASE + P); await settle(page);
    ok(G, "1 erişim var → içerik (doğrulanamadı yok)", new URL(page.url()).pathname === P && !(await page.getByTestId("access-unverified").count()) && !(await text(page)).includes("Erişim doğrulanıyor"));
    await ctx.close();
  }
}

// ── Admin layout (sunucu bileşeni) ───────────────────────────────────────────────
async function testAdmin() {
  const G = "admin";
  const P = "/admin/users";
  const adminUser = { ...expert(ADMIN), role: "admin" };
  const cookie = (value) => [{ name: "yasam_admin_session", value, domain: "127.0.0.1", path: "/", httpOnly: true }];
  {
    const { ctx, page } = await open({ user: adminUser, cookies: cookie("zz-local-fake-token") });
    await page.goto(BASE + P); await settle(page);
    ok(G, "geçerli admin → kabuk render (nav)", new URL(page.url()).pathname === P && (await page.getByRole("link", { name: "Yaşam Enerjisi Bilgi Sistemi" }).count()) === 1, page.url());
    await ctx.close();
  }
  for (const [tag, token] of [["RPC 503", "zz-a3-transient-token-0001"], ["users 503", "zz-a3-users-down-token-01"]]) {
    const { ctx, page } = await open({ user: adminUser, cookies: cookie(token) });
    const res = await page.goto(BASE + P); await settle(page);
    ok(G, `11 ${tag} → ana sayfaya yönlendirme YOK`, new URL(page.url()).pathname === P, `${page.url()} status=${res?.status()}`);
    ok(G, `11 ${tag} → doğrulanamadı + Tekrar Dene`, (await page.getByTestId("access-unverified").count()) === 1);
    ok(G, `11 ${tag} → admin kabuğu/nav render EDİLMEDİ (fail-closed)`, (await page.getByRole("link", { name: "Yaşam Enerjisi Bilgi Sistemi" }).count()) === 0);
    await ctx.close();
  }
  for (const [tag, token] of [["uzman token'ı", "zz-a3-expert-token-000001"], ["bilinmeyen token", "zz-a3-unknown-token-00001"]]) {
    const { ctx, page } = await open({ user: adminUser, cookies: cookie(token) });
    await page.goto(BASE + P); await settle(page);
    ok(G, `13 açık red (${tag}) → mevcut davranış: ana sayfa`, new URL(page.url()).pathname === "/", page.url());
    await ctx.close();
  }
}

const suites = { guard: testGuard, session: testSession, beslenme: testBeslenme, admin: testAdmin };
for (const [k, fn] of Object.entries(suites)) {
  if (ONLY.length && !ONLY.includes(k)) continue;
  try { await fn(); } catch (e) { ok(k, "senaryo çalıştı", false, String(e?.stack ?? e).slice(0, 400)); }
}
await browser?.close();
console.log(`\nFinal-A3 UI: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
