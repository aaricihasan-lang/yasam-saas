/**
 * Bilgi Bankalarında aktif/pasif kaldırma — KUPA arayüz testi (Playwright + API route MOCK; DB/prod'a SIFIR temas).
 * Desen: scripts/final-a1/kupa/ui-kupa-final-a1.mock.ts. Uygulama: KUPA_APP_URL (ör. `next start` ile build).
 *
 * Kapsam (375 px + masaüstü):
 *   • Bilgi & Eğitim Kütüphanesi / Noktalar / Güvenlik (CrudManager): "Aktif" kutusu YOK; eski PASİF kaydın
 *     içeriği açılır ve görünür; kaydetme isteği is_active=false GÖNDERMEZ.
 *   • Teknikler: liste + okuma görünümünde "Pasif" rozeti YOK; düzenleyicide "Aktif" kutusu YOK;
 *     Kaydet → PATCH is_active=true (kaydedilen kayıt otomatik aktif), içerik alanları korunur.
 *   • Protokoller: "Durum" (Aktif/Pasif) filtresi ve "Pasif" rozeti YOK; eski pasif protokol listede.
 *   • Takvim: ARŞİVLENMİŞ tavsiye şablonu (is_active=false, API arşivi) şablon seçiminde GÖRÜNMEZ (geri getirilmez).
 *
 * Çalıştır: KUPA_APP_URL=http://127.0.0.1:<port> npx tsx scripts/kb-aktif-pasif/ui-kupa.mock.ts
 */
import { chromium, type Browser, type Page, type Route } from "playwright";

const APP = process.env.KUPA_APP_URL ?? "http://127.0.0.1:3993";
let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}${detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 400)}` : ""}`); }
}
const NOW = "2026-11-28T00:00:00.000Z";
const T = "tenant-zz";
type Write = { method: string; path: string; body: Record<string, unknown> };

function freshState() {
  return {
    knowledge: [{ id: "k1", tenant_id: T, title: "ZZ Eski Pasif Bilgi", content: "ESKI-PASIF-BILGI-ICERIGI", category: "Genel", tags: [], source: null, source_section: null, keyword: null, notes: null, sort_order: 0, is_active: false, created_at: NOW, updated_at: NOW }],
    points: [{ id: "pt1", tenant_id: T, name: "ZZ Pasif Nokta", alt_name: null, code: null, anatomical_region: "Sırt", description: "ESKI-PASIF-NOKTA-ACIKLAMASI", sort_order: 0, is_active: false, created_at: NOW, updated_at: NOW }],
    safety: [{ id: "sf1", tenant_id: T, title: "ZZ Pasif Güvenlik Notu", content: "ESKI-PASIF-GUVENLIK-ICERIGI", severity: "info", scope_tags: [], source_note: null, sort_order: 0, is_active: false, created_at: NOW, updated_at: NOW }],
    techniques: [{ id: "tk1", tenant_id: T, name: "ZZ Pasif Teknik", kind: null, technique_type: null, movement_style: null, description: "ESKI-PASIF-TEKNIK-ACIKLAMASI", application_info: null, safety_note: null, source_note: null, practitioner_note: "ESKI-UZMAN-NOTU", sort_order: 0, is_active: false, created_at: NOW, updated_at: NOW }],
    plans: [{ id: "p1", tenant_id: T, name: "2026 Hacamat Takvimi", year: 2026, description: null, advice_template_id: "t1", is_active: true, created_at: NOW, updated_at: NOW }],
    templates: [
      { id: "t1", tenant_id: T, title: "ZZ Aktif Sablon", before_text: "Önce A", after_text: "Sonra A", general_note: null, is_default: true, is_active: true, created_at: NOW, updated_at: NOW },
      { id: "t3", tenant_id: T, title: "ZZ Arsivlenmis Sablon", before_text: "ARSIV-ONCE", after_text: "ARSIV-SONRA", general_note: null, is_default: false, is_active: false, created_at: NOW, updated_at: NOW },
    ],
    protocols: [
      { id: "pr1", tenant_id: T, title: "ZZ Pasif Protokol", category: "Baş", summary: null, tags: [], is_active: false, sort_order: 0, created_at: NOW, updated_at: NOW },
      { id: "pr2", tenant_id: T, title: "ZZ Aktif Protokol", category: "Sırt", summary: null, tags: [], is_active: true, sort_order: 1, created_at: NOW, updated_at: NOW },
    ],
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function handleApi(route: Route, s: ReturnType<typeof freshState>, writes: Write[]) {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  const m = req.method();
  let body: Record<string, unknown> = {};
  if (m !== "GET" && m !== "HEAD") {
    try { body = (req.postDataJSON() ?? {}) as Record<string, unknown>; } catch { body = {}; }
    writes.push({ method: m, path: p, body });
  }
  const coll: Array<[RegExp, keyof ReturnType<typeof freshState>, string, string]> = [
    [/^\/api\/kupa\/knowledge(?:\/([^/]+))?$/, "knowledge", "records", "record"],
    [/^\/api\/kupa\/points(?:\/([^/]+))?$/, "points", "points", "point"],
    [/^\/api\/kupa\/safety(?:\/([^/]+))?$/, "safety", "notes", "note"],
    [/^\/api\/kupa\/techniques(?:\/([^/]+))?$/, "techniques", "techniques", "technique"],
    [/^\/api\/kupa\/protocols$/, "protocols", "protocols", "protocol"],
  ];
  for (const [re, key, listKey, oneKey] of coll) {
    const mm = re.exec(p);
    if (!mm) continue;
    const rows = s[key] as Array<Record<string, unknown>>;
    if (!mm[1] && m === "GET") return json(route, { ok: true, [listKey]: rows });
    if (mm[1]) {
      const row = rows.find((r) => r.id === mm[1]);
      if (!row) return json(route, { ok: false, error: "yok" }, 404);
      if (m === "GET") return json(route, { ok: true, [oneKey]: row });
      if (m === "PATCH") { Object.assign(row, body, { updated_at: NOW }); return json(route, { ok: true, [oneKey]: row }); }
    }
  }
  if (p === "/api/kupa/calendar/plans" && m === "GET") return json(route, { ok: true, plans: s.plans });
  const planM = /^\/api\/kupa\/calendar\/plans\/([^/]+)$/.exec(p);
  if (planM && m === "GET") return json(route, { ok: true, plan: s.plans.find((x) => x.id === planM[1]), days: [] });
  if (p === "/api/kupa/advice-templates" && m === "GET") return json(route, { ok: true, templates: s.templates });
  if (/\/protocols$/.test(p) && m === "GET") return json(route, { ok: true, protocols: [] });
  if (/^\/api\/kupa\/citations\//.test(p) && m === "GET") return json(route, { ok: true, citations: [] });
  if (p === "/api/kupa/sources" && m === "GET") return json(route, { ok: true, sources: [] });
  if (/^\/api\/kupa\/placements/.test(p) && m === "GET") return json(route, { ok: true, placements: [] });
  return json(route, { ok: true });
}

async function setup(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("yasam_user", JSON.stringify({
        id: "u-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
        tenant_id: "tenant-zz", is_demo_account: false, module_permissions: { cupping: true }, full_name: "ZZ Aktif Pasif", name: "ZZ Aktif Pasif",
      }));
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  });
  const state = freshState();
  const writes: Write[] = [];
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  await ctx.route((u) => u.href.startsWith(APP) && new URL(u.href).pathname.startsWith("/api/"), (route) => handleApi(route, state, writes));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  return { ctx, page, state, writes, errors };
}

const noHScroll = (page: Page, w: number) => page.evaluate((wd) => document.documentElement.scrollWidth <= wd + 1, w);
const activeCheckboxCount = (page: Page) => page.evaluate(() => [...document.querySelectorAll('input[type="checkbox"]')].filter((el) => {
  const lab = (el.closest("label")?.textContent ?? "") + " " + (el.getAttribute("aria-label") ?? "");
  return /\bAktif\b/.test(lab);
}).length);
const pasifBadgeCount = (page: Page) => page.getByText("Pasif", { exact: true }).count();

async function main() {
  const browser = await chromium.launch();
  const allErrors: string[] = [];
  try {
    for (const vp of [{ name: "375px", width: 375, height: 812 }, { name: "masaüstü", width: 1280, height: 900 }]) {
      const crud: Array<[string, string, string, string]> = [
        ["/kupa/bilgi-kutuphanesi", "ZZ Eski Pasif Bilgi", "ESKI-PASIF-BILGI-ICERIGI", "/api/kupa/knowledge/k1"],
        ["/kupa/noktalar", "ZZ Pasif Nokta", "ESKI-PASIF-NOKTA-ACIKLAMASI", "/api/kupa/points/pt1"],
        ["/kupa/guvenlik", "ZZ Pasif Güvenlik Notu", "ESKI-PASIF-GUVENLIK-ICERIGI", "/api/kupa/safety/sf1"],
      ];
      for (const [url, title, content, patchPath] of crud) {
        console.log(`\n[${url} — ${vp.name}]`);
        const env = await setup(browser, vp);
        await env.page.goto(`${APP}${url}`, { waitUntil: "load", timeout: 240_000 });
        const item = env.page.getByRole("button", { name: new RegExp(title) }).first();
        await item.waitFor({ timeout: 240_000 });
        await item.click();
        await env.page.getByRole("button", { name: "Kaydet", exact: true }).waitFor({ timeout: 30_000 });
        const vals = await env.page.locator("textarea, input[type=text]").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        ok(`${vp.name} ${url}: eski PASİF kaydın içeriği açılır (kayıp yok)`, vals.some((v) => v.includes(content)), vals.slice(0, 6));
        ok(`${vp.name} ${url}: formda "Aktif" kutusu YOK`, (await activeCheckboxCount(env.page)) === 0);
        ok(`${vp.name} ${url}: "Pasif" rozeti YOK`, (await pasifBadgeCount(env.page)) === 0);
        ok(`${vp.name} ${url}: yatay kaydırma yok`, await noHScroll(env.page, vp.width));
        const first = env.page.locator("input[type=text]").first();
        await first.fill(`${title} düzenlendi`);
        await env.page.getByRole("button", { name: "Kaydet", exact: true }).click();
        await env.page.waitForTimeout(1500);
        const w = env.writes.find((x) => x.method === "PATCH" && x.path === patchPath);
        ok(`${vp.name} ${url}: kaydetme PATCH gönderir; is_active=false GÖNDERİLMEZ`, !!w && w.body.is_active !== false, w?.body);
        allErrors.push(...env.errors);
        await env.ctx.close();
      }

      console.log(`\n[/kupa/teknikler — ${vp.name}]`);
      {
        const env = await setup(browser, vp);
        await env.page.goto(`${APP}/kupa/teknikler`, { waitUntil: "load", timeout: 240_000 });
        await env.page.getByText("ZZ Pasif Teknik").first().waitFor({ timeout: 240_000 });
        ok(`${vp.name} teknik listesi: eski pasif teknik listede, "Pasif" rozeti YOK`, (await pasifBadgeCount(env.page)) === 0);
        await env.page.goto(`${APP}/kupa/teknikler/tk1`, { waitUntil: "load", timeout: 240_000 });
        await env.page.getByText("ESKI-PASIF-TEKNIK-ACIKLAMASI").first().waitFor({ timeout: 240_000 });
        ok(`${vp.name} teknik okuma: içerik görünür, "Pasif" rozeti YOK`, (await pasifBadgeCount(env.page)) === 0);
        await env.page.getByRole("button", { name: "Düzenle", exact: true }).first().click();
        await env.page.getByText("Tekniği Düzenle").first().waitFor({ timeout: 30_000 });
        ok(`${vp.name} teknik düzenleyici: "Aktif" kutusu YOK`, (await activeCheckboxCount(env.page)) === 0);
        ok(`${vp.name} teknik düzenleyici: yatay kaydırma yok`, await noHScroll(env.page, vp.width));
        await env.page.screenshot({ path: `${process.env.KB_OUT ?? "."}/kupa-teknik-duzenle-${vp.name}.png`, fullPage: true }).catch(() => {});
        const nameInput = env.page.getByLabel("Teknik adı", { exact: true });
        await nameInput.fill("ZZ Pasif Teknik düzenlendi");
        await env.page.getByRole("button", { name: "Kaydet", exact: true }).click();
        await env.page.waitForTimeout(1500);
        const w = env.writes.find((x) => x.method === "PATCH" && x.path === "/api/kupa/techniques/tk1");
        ok(`${vp.name} teknik Kaydet → PATCH is_active=true (otomatik aktif), uzman notu / açıklama korunur`,
          !!w && w.body.is_active === true && w.body.practitioner_note === "ESKI-UZMAN-NOTU" && w.body.description === "ESKI-PASIF-TEKNIK-ACIKLAMASI", w?.body);
        allErrors.push(...env.errors);
        await env.ctx.close();
      }

      console.log(`\n[/kupa/protokoller — ${vp.name}]`);
      {
        const env = await setup(browser, vp);
        await env.page.goto(`${APP}/kupa/protokoller`, { waitUntil: "load", timeout: 240_000 });
        await env.page.getByText("ZZ Pasif Protokol").first().waitFor({ timeout: 240_000 });
        ok(`${vp.name} protokol listesi: eski pasif + aktif protokol birlikte listede`, (await env.page.getByText("ZZ Aktif Protokol").count()) > 0);
        ok(`${vp.name} protokol listesi: "Durum" (Aktif/Pasif) filtresi YOK`, (await env.page.getByLabel("Durum", { exact: true }).count()) === 0 && (await env.page.locator("option", { hasText: /^Pasif$/ }).count()) === 0);
        ok(`${vp.name} protokol listesi: "Pasif" rozeti YOK`, (await pasifBadgeCount(env.page)) === 0);
        ok(`${vp.name} protokol listesi: yatay kaydırma yok`, await noHScroll(env.page, vp.width));
        allErrors.push(...env.errors);
        await env.ctx.close();
      }
    }
    console.log("\n[/kupa/takvim — arşivlenmiş tavsiye şablonu]");
    {
      const env = await setup(browser, { width: 1280, height: 900 });
      await env.page.goto(`${APP}/kupa/takvim`, { waitUntil: "load", timeout: 240_000 });
      await env.page.getByText("Bu Takvimin Bilgilendirme Şablonu").first().waitFor({ timeout: 240_000 });
      const sel = env.page.getByTestId("kupa-advice-attach");
      await sel.waitFor({ timeout: 60_000 });
      const opts = await sel.locator("option").evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
      ok("takvim: aktif şablon seçimde VAR (t1)", opts.includes("t1"), opts);
      ok("takvim: ARŞİVLENMİŞ şablon seçimde YOK (t3 geri getirilmez)", !opts.includes("t3") && !(await env.page.content()).includes("ZZ Arsivlenmis Sablon"), opts);
      ok("takvim: hiçbir yazma isteği yok (görüntüleme)", env.writes.filter((w) => w.path.startsWith("/api/kupa/")).length === 0, env.writes);
      allErrors.push(...env.errors);
      await env.ctx.close();
    }
    console.log("\n[Genel]");
    ok("sayfa JS hatası yok", allErrors.length === 0, allErrors.slice(0, 5));
  } finally {
    await browser.close();
  }
  console.log(`\nKUPA AKTİF/PASİF KALDIRMA UI: ${pass} PASS / ${fail} FAIL`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
