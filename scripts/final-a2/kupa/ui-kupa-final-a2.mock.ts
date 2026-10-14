/**
 * FINAL-A2 — Kupa & Hacamat: DAVRANIŞ testleri (Playwright + API route MOCK; DB/prod'a SIFIR temas).
 *
 * Desen: scripts/final-a1/kupa/ui-kupa-final-a1.mock.ts ile aynı.
 *  - KUPA_APP_URL verilirse o adres; yoksa `next dev` 127.0.0.1:KUPA_APP_PORT (varsayılan 3942) üzerinde başlatılır.
 *  - TÜM /api/** istekleri bellek içi sahte durumdan yanıtlanır; dış ağ kapalı.
 *  - Her yazma isteği (POST/PATCH/PUT/DELETE) kaydedilir.
 *  - Her açılan onay penceresi (ConfirmProvider alertdialog + KupaConfirmDialog aria-modal dialog) sayfa içi
 *    MutationObserver ile başlığıyla kaydedilir → onay KATMANI sayısı ağdan bağımsız ölçülür.
 *
 * Kapsam (Görev 9 + 10):
 *   9a Şablon "Düzenle": form alanı değişiklikleri → 0 yazma; Vazgeç (onaylı) → 0 yazma; Kaydet → TEK PATCH.
 *   9b "Varsayılan yap" (komut butonu): tek tık → TEK PATCH {is_default:true}.
 *   9c "+ Yeni Şablon": yazarken 0 yazma; Kaydet → TEK POST.
 *   9d "Danışana Özel Hazırla": şablon seçimi 0 yazma; "Şablondan Oluştur" → TEK POST; kopya Düzenle → 0 yazma
 *      → Kaydet → TEK PATCH.
 *   10 Silme katmanları: şablon / danışan kopyası / takvim (ConfirmProvider, 1 onay); nokta (KupaConfirmDialog,
 *      1 onay); 3 kayıtlı gün kaldırma → bulkDeleteGuard 3 AŞAMA; her katmanda Vazgeç → 0 yazma.
 *
 * Çalıştır: npx tsx scripts/final-a2/kupa/ui-kupa-final-a2.mock.ts
 */
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const PORT = Number(process.env.KUPA_APP_PORT ?? 3942);
const APP = process.env.KUPA_APP_URL ?? `http://127.0.0.1:${PORT}`;
const VERBOSE = process.env.KUPA_VERBOSE === "1";

let pass = 0;
let fail = 0;
function ok(name: string, cond: unknown, detail = ""): void {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${!cond && detail ? "  → " + String(detail).slice(0, 400) : ""}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Write = { method: string; path: string; body: unknown };
const NOW = "2026-10-01T00:00:00.000Z";
const T = "tenant-zz";

// ── Bellek içi sahte veri ─────────────────────────────────────────────────────
function freshState() {
  const day = (id: string, ymd: string) => ({
    id, tenant_id: T, plan_id: "p1", gregorian_date: ymd, selection_source: "manual", user_label: null, note: null, color_key: null, created_at: NOW, updated_at: NOW,
  });
  return {
    plans: [
      // Bağlı şablon t2 (varsayılan DEĞİL) → "Varsayılan yap" butonu görünür.
      { id: "p1", tenant_id: T, name: "2026 Hacamat Takvimi", year: 2026, description: null, advice_template_id: "t2" as string | null, is_active: true, created_at: NOW, updated_at: NOW },
    ],
    days: [day("d1", "2026-02-10"), day("d2", "2026-02-11"), day("d3", "2026-02-12")],
    templates: [
      { id: "t1", tenant_id: T, title: "Standart Bilgilendirme", before_text: "Önce A", after_text: "Sonra A", general_note: null, is_default: true, is_active: true, created_at: NOW, updated_at: NOW },
      { id: "t2", tenant_id: T, title: "Kısa Bilgilendirme", before_text: "Önce B", after_text: "Sonra B", general_note: null, is_default: false, is_active: true, created_at: NOW, updated_at: NOW },
    ] as Record<string, unknown>[],
    clientAdvice: [] as Record<string, unknown>[],
    points: [
      { id: "pt1", tenant_id: T, name: "ZZ Ense Bölgesi", is_active: true, sort_order: 0 },
      { id: "pt2", tenant_id: T, name: "ZZ Sırt Bölgesi", is_active: true, sort_order: 1 },
    ],
    sources: [] as Record<string, unknown>[],
  };
}
type State = ReturnType<typeof freshState>;

async function setupContext(browser: Browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "yasam_user",
        JSON.stringify({
          id: "u-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
          tenant_id: "tenant-zz", is_demo_account: false, module_permissions: { cupping: true }, full_name: "ZZ Final A2", name: "ZZ Final A2",
        }),
      );
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  });
  // Onay penceresi kaydı: her YENİ modal (alertdialog / aria-modal dialog) başlığıyla bir kez yazılır.
  //   (DİZE olarak enjekte edilir: tsx/esbuild'in __name yardımcısı tarayıcıda tanımsızdır.)
  await ctx.addInitScript(`
    window.__dlg = [];
    (function () {
      var seen = new WeakSet();
      function scan() {
        document.querySelectorAll('[role="alertdialog"], [role="dialog"][aria-modal="true"]').forEach(function (el) {
          if (seen.has(el)) return;
          seen.add(el);
          var lb = el.getAttribute("aria-labelledby");
          var lbl = lb && document.getElementById(lb);
          var h = el.querySelector("h2,h3");
          var t = (lbl && lbl.textContent) || (h && h.textContent) || "?";
          window.__dlg.push(t.trim());
        });
      }
      new MutationObserver(scan).observe(document, { childList: true, subtree: true });
    })();
  `);
  const state = freshState();
  const writes: Write[] = [];
  const unknown: string[] = [];
  await ctx.route((u) => !u.href.startsWith(APP), (r) => r.abort());
  await ctx.route((u) => u.href.startsWith(APP) && new URL(u.href).pathname.startsWith("/api/"), (route) => handleApi(route, state, writes, unknown));
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  return { ctx, page, state, writes, unknown, errors };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function handleApi(route: Route, s: State, writes: Write[], unknown: string[]) {
  const req = route.request();
  const u = new URL(req.url());
  const p = u.pathname;
  const m = req.method();
  let body: Record<string, unknown> = {};
  if (m !== "GET" && m !== "HEAD") {
    try { body = (req.postDataJSON() ?? {}) as Record<string, unknown>; } catch { body = {}; }
    writes.push({ method: m, path: p, body });
  }
  if (VERBOSE) console.log(`   · ${m} ${p}${u.search}`);
  // Takvim
  if (p === "/api/kupa/calendar/plans" && m === "GET") return json(route, { ok: true, plans: s.plans });
  const planM = /^\/api\/kupa\/calendar\/plans\/([^/]+)$/.exec(p);
  if (planM) {
    const plan = s.plans.find((x) => x.id === planM[1]);
    if (!plan) return json(route, { ok: false, error: "yok" }, 404);
    if (m === "GET") return json(route, { ok: true, plan, days: s.days.filter((d) => d.plan_id === plan.id) });
    if (m === "PATCH") {
      Object.assign(plan, body);
      return json(route, { ok: true, plan });
    }
    if (m === "DELETE") {
      s.plans = s.plans.filter((x) => x.id !== plan.id);
      s.days = s.days.filter((d) => d.plan_id !== plan.id);
      return json(route, { ok: true, deleted: 1 });
    }
  }
  const dayM = /^\/api\/kupa\/calendar\/days\/([^/]+)$/.exec(p);
  if (dayM && m === "DELETE") {
    const before = s.days.length;
    s.days = s.days.filter((d) => d.id !== dayM[1]);
    return json(route, { ok: true, deleted: before - s.days.length });
  }
  // Bilgilendirme şablonları
  if (p === "/api/kupa/advice-templates" && m === "GET") return json(route, { ok: true, templates: s.templates });
  if (p === "/api/kupa/advice-templates" && m === "POST") {
    const t = { id: `t-new-${s.templates.length + 1}`, tenant_id: T, is_active: true, created_at: NOW, updated_at: NOW, general_note: null, ...body, is_default: body.is_default === true };
    if (t.is_default) s.templates.forEach((x) => (x.is_default = false));
    s.templates.push(t);
    return json(route, { ok: true, template: t });
  }
  const tplM = /^\/api\/kupa\/advice-templates\/([^/]+)$/.exec(p);
  if (tplM) {
    const t = s.templates.find((x) => x.id === tplM[1]);
    if (!t) return json(route, { ok: false, error: "yok" }, 404);
    if (m === "PATCH") {
      if (body.is_default === true) s.templates.forEach((x) => (x.is_default = false));
      Object.assign(t, body);
      return json(route, { ok: true, template: t });
    }
    if (m === "DELETE") {
      s.templates = s.templates.filter((x) => x !== t);
      s.plans.forEach((pl) => { if (pl.advice_template_id === t.id) pl.advice_template_id = null; });
      return json(route, { ok: true, deleted: 1 });
    }
  }
  // Danışan seçici + danışana özel kopya
  if (p === "/api/clients" && m === "GET") return json(route, { ok: true, clients: [{ id: "c1", ad: "ZZ", soyad: "Danışan" }] });
  if (p === "/api/kupa/client-advice" && m === "GET") return json(route, { ok: true, advice: s.clientAdvice.filter((a) => a.client_id === u.searchParams.get("clientId")) });
  if (p === "/api/kupa/client-advice" && m === "POST") {
    const src = s.templates.find((x) => x.id === body.source_template_id);
    const a = {
      id: `ca${s.clientAdvice.length + 1}`, tenant_id: T, client_id: body.client_id, source_template_id: src?.id ?? null,
      title: src?.title ?? body.title ?? "Danışan Bilgilendirmesi", before_text: src?.before_text ?? "", after_text: src?.after_text ?? "",
      general_note: src?.general_note ?? null, is_active: true, created_at: NOW, updated_at: NOW,
    };
    s.clientAdvice.push(a);
    return json(route, { ok: true, advice: a });
  }
  const caM = /^\/api\/kupa\/client-advice\/([^/]+)$/.exec(p);
  if (caM) {
    const a = s.clientAdvice.find((x) => x.id === caM[1]);
    if (!a) return json(route, { ok: false, error: "yok" }, 404);
    if (m === "PATCH") {
      Object.assign(a, body);
      return json(route, { ok: true, advice: a });
    }
    if (m === "DELETE") {
      s.clientAdvice = s.clientAdvice.filter((x) => x !== a);
      return json(route, { ok: true, deleted: 1 });
    }
  }
  // Noktalar (CrudManager)
  if (p === "/api/kupa/points" && m === "GET") return json(route, { ok: true, points: s.points });
  const ptM = /^\/api\/kupa\/points\/([^/]+)$/.exec(p);
  if (ptM && m === "DELETE") {
    const before = s.points.length;
    s.points = s.points.filter((x) => x.id !== ptM[1]);
    return json(route, { ok: true, deleted: before - s.points.length });
  }
  if (p === "/api/kupa/sources" && m === "GET") return json(route, { ok: true, sources: s.sources });
  if (/^\/api\/kupa\/citations\/[^/]+$/.test(p) && m === "GET") return json(route, { ok: true, citations: [] });
  if (/^\/api\/kupa\/(points|techniques|safety)\/[^/]+\/protocols$/.test(p) && m === "GET") return json(route, { ok: true, protocols: [] });
  // Bilinmeyen (oturum/analitik vb.) — nötr yanıt.
  unknown.push(`${m} ${p}`);
  return json(route, { ok: true });
}

const kupaWrites = (w: Write[]) => w.filter((x) => x.path.startsWith("/api/kupa/"));
const fmt = (w: Write[]) => JSON.stringify(w.map((x) => `${x.method} ${x.path} ${JSON.stringify(x.body)}`));
const dlgLog = async (page: Page) => page.evaluate(() => [...((window as unknown as { __dlg: string[] }).__dlg ?? [])]);
const alertDlg = (page: Page) => page.getByRole("alertdialog");

async function waitHttp(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`uygulama başlamadı: ${url}`);
}

async function gotoReady(page: Page, url: string, readyText: string | RegExp) {
  await page.goto(url, { waitUntil: "load", timeout: 240_000 });
  await page.getByText(readyText).first().waitFor({ timeout: 240_000 });
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let ctx: BrowserContext | null = null;
  try {
    if (!process.env.KUPA_APP_URL) {
      app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PORT), "-H", "127.0.0.1"], {
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:59998",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "zz-dummy-anon",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "zz-dummy-anon",
          SUPABASE_SERVICE_ROLE_KEY: "zz-dummy-service",
        },
        stdio: VERBOSE ? "inherit" : "ignore",
      });
    }
    await waitHttp(`${APP}/`, 240_000);
    browser = await chromium.launch();

    // ═══ TAKVİM: Görev 9 (şablon / danışan kopyası) + Görev 10 (silme katmanları) ════════════
    {
      const env = await setupContext(browser);
      ctx = env.ctx;
      const { page, writes, state } = env;
      await gotoReady(page, `${APP}/kupa/takvim`, "Bu Takvimin Bilgilendirme Şablonu");
      await page.getByTestId("kupa-advice-attach").waitFor();
      ok("ön koşul: açılışta SIFIR yazma", kupaWrites(writes).length === 0, fmt(writes));

      // ── 9a Şablon "Düzenle" → form; alan değişiklikleri YAZMAZ ──
      const card = page.locator("article", { hasText: "Kısa Bilgilendirme" }).first();
      await card.getByRole("button", { name: "Düzenle", exact: true }).click();
      const formBox = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Şablonu Düzenle" }) }).last();
      await formBox.waitFor();
      const w0 = kupaWrites(writes).length;
      const titleIn = formBox.locator('input[placeholder^="Ör."]');
      ok("9a Düzenle → form mevcut değerle açıldı", (await titleIn.inputValue()) === "Kısa Bilgilendirme");
      await titleIn.fill("Kısa Bilgilendirme v2");
      const tas = formBox.locator("textarea");
      await tas.nth(0).fill("Önce B — güncel");
      await tas.nth(1).fill("Sonra B — güncel");
      await tas.nth(2).fill("Ek not");
      await formBox.getByRole("checkbox").check();
      await formBox.getByRole("checkbox").uncheck();
      await titleIn.blur();
      await sleep(1000);
      ok("9a form alanları + checkbox değişti → SIFIR yazma", kupaWrites(writes).length === w0, fmt(kupaWrites(writes).slice(w0)));
      ok("9a sunucu değişmedi", state.templates.find((t) => t.id === "t2")?.title === "Kısa Bilgilendirme");

      // Vazgeç → kaydedilmemiş onayı (1 pencere) → Kaydetmeden Devam → 0 yazma
      const d0 = (await dlgLog(page)).length;
      await formBox.getByRole("button", { name: "Vazgeç", exact: true }).click();
      await page.getByRole("button", { name: "Kaydetmeden Devam Et" }).click();
      await sleep(500);
      const dl = (await dlgLog(page)).slice(d0);
      ok("9a kirli formda Vazgeç → tam 1 onay ('Kaydedilmemiş Değişiklikler')", dl.length === 1 && dl[0] === "Kaydedilmemiş Değişiklikler", JSON.stringify(dl));
      ok("9a Vazgeç sonrası form kapandı + SIFIR yazma", (await page.getByRole("heading", { name: "Şablonu Düzenle" }).count()) === 0 && kupaWrites(writes).length === w0);

      // Düzenle → değiştir → Kaydet → TEK PATCH
      await card.getByRole("button", { name: "Düzenle", exact: true }).click();
      await formBox.waitFor();
      await titleIn.fill("Kısa Bilgilendirme v2");
      await tas.nth(0).fill("Önce B — güncel");
      await sleep(400);
      ok("9a ikinci düzenleme: Kaydet öncesi SIFIR yazma", kupaWrites(writes).length === w0);
      await formBox.getByRole("button", { name: "Kaydet", exact: true }).click();
      await page.getByText("Şablon kaydedildi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w9a = kupaWrites(writes).slice(w0);
      ok("9a Kaydet → tam 1 yazma", w9a.length === 1, fmt(w9a));
      ok(
        "9a yazma = PATCH /advice-templates/t2 (metin alanları, is_default YOK)",
        w9a[0]?.method === "PATCH" && w9a[0]?.path === "/api/kupa/advice-templates/t2" &&
          JSON.stringify(w9a[0]?.body) === JSON.stringify({ title: "Kısa Bilgilendirme v2", before_text: "Önce B — güncel", after_text: "Sonra B", general_note: null }),
        fmt(w9a),
      );

      // ── 9b "Varsayılan yap" — komut butonu: tek tık → TEK PATCH {is_default:true} ──
      const w1 = kupaWrites(writes).length;
      const d1 = (await dlgLog(page)).length;
      await page.locator("article", { hasText: "Kısa Bilgilendirme v2" }).first().getByRole("button", { name: "Varsayılan yap" }).click();
      await page.getByText("Varsayılan bilgilendirme şablonu güncellendi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w9b = kupaWrites(writes).slice(w1);
      ok("9b Varsayılan yap → tam 1 yazma", w9b.length === 1, fmt(w9b));
      ok("9b yazma = PATCH /advice-templates/t2 {is_default:true}", w9b[0]?.method === "PATCH" && w9b[0]?.path === "/api/kupa/advice-templates/t2" && JSON.stringify(w9b[0]?.body) === JSON.stringify({ is_default: true }), fmt(w9b));
      ok("9b onay penceresi YOK (komut butonu)", (await dlgLog(page)).length === d1);
      ok("9b ekranda 'Varsayılan' rozeti; buton kalktı", (await page.locator("article").first().getByRole("button", { name: "Varsayılan yap" }).count()) === 0);
      ok("9b takvim bağlantısı değişmedi (plan PATCH yok)", state.plans[0].advice_template_id === "t2" && !w9b.some((x) => x.path.includes("/calendar/")));

      // ── 9c "+ Yeni Şablon": yazarken 0 yazma; Kaydet → TEK POST ──
      const w2 = kupaWrites(writes).length;
      await page.getByRole("button", { name: "+ Yeni Şablon" }).click();
      const newBox = page.locator("div.rounded-xl", { has: page.getByRole("heading", { name: "Yeni Şablon" }) }).last();
      await newBox.waitFor();
      await newBox.locator('input[placeholder^="Ör."]').fill("ZZ Geçici Şablon");
      await newBox.locator("textarea").nth(0).fill("Önce Z");
      await sleep(600);
      ok("9c yeni şablon yazılırken SIFIR yazma", kupaWrites(writes).length === w2);
      await newBox.getByRole("button", { name: "Kaydet", exact: true }).click();
      await page.getByText("Şablon kaydedildi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w9c = kupaWrites(writes).slice(w2);
      ok("9c Kaydet → tam 1 POST /advice-templates", w9c.length === 1 && w9c[0].method === "POST" && w9c[0].path === "/api/kupa/advice-templates", fmt(w9c));

      // ── 10 Şablon silme: ConfirmProvider 1 onay; Vazgeç → 0; onay → TEK DELETE ──
      const row = page.locator("li", { hasText: "ZZ Geçici Şablon" }).first();
      const w3 = kupaWrites(writes).length;
      let d = (await dlgLog(page)).length;
      await row.getByRole("button", { name: "Sil", exact: true }).click();
      await alertDlg(page).waitFor();
      await page.getByTestId("confirm-cancel").click();
      await sleep(400);
      let dl2 = (await dlgLog(page)).slice(d);
      ok("10 şablon Sil → tam 1 onay ('Şablonu Sil'); Vazgeç → SIFIR yazma", dl2.length === 1 && dl2[0] === "Şablonu Sil" && kupaWrites(writes).length === w3, JSON.stringify(dl2));
      d = (await dlgLog(page)).length;
      await row.getByRole("button", { name: "Sil", exact: true }).click();
      await page.getByTestId("confirm-ok").click();
      await page.getByText("Şablon silindi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      dl2 = (await dlgLog(page)).slice(d);
      const w10a = kupaWrites(writes).slice(w3);
      ok("10 şablon onay → 1 onay katmanı + TEK DELETE", dl2.length === 1 && w10a.length === 1 && w10a[0].method === "DELETE" && /^\/api\/kupa\/advice-templates\/t-new-/.test(w10a[0].path), `${JSON.stringify(dl2)} ${fmt(w10a)}`);

      // ── 9d Danışana Özel Hazırla ──
      const cs = page.locator("section:has(> button[aria-expanded])", { hasText: "Danışana Özel Hazırla" }).first();
      await cs.locator("> button[aria-expanded]").click();
      await cs.getByRole("button", { name: /ZZ Danışan/ }).first().click({ timeout: 15000 });
      await cs.getByText("Bu danışan için henüz bilgilendirme yok.").waitFor({ timeout: 10000 });
      const w4 = kupaWrites(writes).length;
      ok("9d danışan seçimi → SIFIR yazma", kupaWrites(writes).length === w4 && kupaWrites(writes).length === w3 + 1);
      await cs.locator("select").first().selectOption("t1");
      await sleep(600);
      ok("9d 'Genel Şablondan' seçimi → SIFIR yazma (yalnız buton etiketi değişir)", kupaWrites(writes).length === w4 && (await cs.getByRole("button", { name: "Şablondan Oluştur" }).count()) === 1);
      await cs.getByRole("button", { name: "Şablondan Oluştur" }).click();
      await page.getByText("Danışana özel bilgilendirme oluşturuldu.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w9d = kupaWrites(writes).slice(w4);
      ok("9d Şablondan Oluştur → tam 1 yazma", w9d.length === 1, fmt(w9d));
      ok("9d yazma = POST /client-advice {client_id:c1, source_template_id:t1}", w9d[0]?.method === "POST" && w9d[0]?.path === "/api/kupa/client-advice" && JSON.stringify(w9d[0]?.body) === JSON.stringify({ client_id: "c1", source_template_id: "t1" }), fmt(w9d));

      // Kopya Düzenle → alan değişiklikleri 0 yazma → Kaydet TEK PATCH (client_id/source YOK)
      const w5 = kupaWrites(writes).length;
      await cs.getByRole("button", { name: "Düzenle", exact: true }).click();
      const caTitle = cs.locator('input[placeholder="Başlık"]');
      await caTitle.fill("ZZ Danışan Notu");
      await cs.locator('textarea[placeholder="Hacamat Öncesi"]').fill("Danışana özel önce");
      await sleep(800);
      ok("9d kopya düzenleme alanları → SIFIR yazma", kupaWrites(writes).length === w5, fmt(kupaWrites(writes).slice(w5)));
      await cs.getByRole("button", { name: "Kaydet", exact: true }).click();
      await page.getByText("Bilgilendirme güncellendi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w9e = kupaWrites(writes).slice(w5);
      ok(
        "9d kopya Kaydet → TEK PATCH /client-advice/ca1 (yalnız metin)",
        w9e.length === 1 && w9e[0].method === "PATCH" && w9e[0].path === "/api/kupa/client-advice/ca1" &&
          JSON.stringify(w9e[0].body) === JSON.stringify({ title: "ZZ Danışan Notu", before_text: "Danışana özel önce", after_text: "Sonra A", general_note: null }),
        fmt(w9e),
      );

      // 10 danışan kopyası silme: 1 onay; Vazgeç → 0; onay → TEK DELETE
      const w6 = kupaWrites(writes).length;
      d = (await dlgLog(page)).length;
      await cs.getByRole("button", { name: "Sil", exact: true }).click();
      await alertDlg(page).waitFor();
      await page.getByTestId("confirm-cancel").click();
      await sleep(400);
      ok("10 danışan kopyası Sil → 1 onay; Vazgeç → SIFIR yazma", (await dlgLog(page)).slice(d).join("|") === "Bilgilendirmeyi Sil" && kupaWrites(writes).length === w6, JSON.stringify((await dlgLog(page)).slice(d)));
      d = (await dlgLog(page)).length;
      await cs.getByRole("button", { name: "Sil", exact: true }).click();
      await page.getByTestId("confirm-ok").click();
      await page.getByText("Bilgilendirme silindi.").first().waitFor({ timeout: 10000 }).catch(() => {});
      await sleep(300);
      const w10b = kupaWrites(writes).slice(w6);
      ok("10 danışan kopyası onay → 1 katman + TEK DELETE /client-advice/ca1", (await dlgLog(page)).slice(d).length === 1 && w10b.length === 1 && w10b[0].method === "DELETE" && w10b[0].path === "/api/kupa/client-advice/ca1", fmt(w10b));

      // ── 10 Toplu gün kaldırma (3 kayıtlı gün) → bulkDeleteGuard 3 AŞAMA ──
      await page.getByTestId("kupa-edit-month").click();
      for (let i = 0; i < 12; i++) {
        if ((await page.getByText(/Düzenleniyor: Şubat 2026/).count()) > 0) break;
        await page.getByRole("button", { name: "Önceki ay", exact: true }).first().click();
      }
      const panel = page.getByRole("dialog", { name: /Günü Düzenle|Gün Ekle/ });
      for (const ymd of ["2026-02-10", "2026-02-11", "2026-02-12"]) {
        await page.locator(`[data-kupa-day="${ymd}"]:visible`).first().click();
        await panel.waitFor();
        await panel.getByRole("button", { name: "Gün Seçimini Kaldır" }).click();
        await panel.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      }
      const w7 = kupaWrites(writes).length;
      ok("10 3 gün taslakta kaldırıldı → SIFIR yazma", w7 === w6 + 1 && /3 kaldırılacak/.test(await page.locator('[data-kupa-savebar="inline"]').innerText()));
      const saveBtn = page.locator("[data-kupa-savebar] button:visible", { hasText: "Değişiklikleri Kaydet" }).first();
      // (i) Aşama 2'de Vazgeç → 2 pencere görüldü, SIFIR yazma
      d = (await dlgLog(page)).length;
      await saveBtn.click();
      await page.getByTestId("confirm-ok").click(); // Aşama 1 → Devam Et
      await page.getByTestId("confirm-require-text").waitFor();
      await page.getByTestId("confirm-cancel").click(); // Aşama 2 → Vazgeç
      await sleep(500);
      let bl = (await dlgLog(page)).slice(d);
      ok("10 toplu: Aşama 2'de Vazgeç → 2 aşama görüldü + SIFIR yazma", bl.length === 2 && /Adım 1\/3/.test(bl[0]) && /Adım 2\/3/.test(bl[1]) && kupaWrites(writes).length === w7, `${JSON.stringify(bl)} ${fmt(kupaWrites(writes).slice(w7))}`);
      // (ii) Aşama 3'te Vazgeç → 3 pencere, SIFIR yazma
      d = (await dlgLog(page)).length;
      await saveBtn.click();
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-require-text").fill("3 KAYDI SİL");
      await page.getByTestId("confirm-ok").click();
      await alertDlg(page).getByText(/Son Onay/).first().waitFor();
      await page.getByTestId("confirm-cancel").click();
      await sleep(500);
      bl = (await dlgLog(page)).slice(d);
      ok("10 toplu: Aşama 3'te Vazgeç → 3 aşama görüldü + SIFIR yazma", bl.length === 3 && /Son Onay/.test(bl[2]) && kupaWrites(writes).length === w7, `${JSON.stringify(bl)} ${fmt(kupaWrites(writes).slice(w7))}`);
      // (iii) Yanlış ifade → Devam Et kilitli
      d = (await dlgLog(page)).length;
      await saveBtn.click();
      await page.getByTestId("confirm-ok").click();
      await page.getByTestId("confirm-require-text").fill("2 KAYDI SİL");
      ok("10 toplu: yanlış ifade → Devam Et devre dışı", await page.getByTestId("confirm-ok").isDisabled());
      await page.getByTestId("confirm-require-text").fill("3 kaydi sil");
      await page.getByTestId("confirm-ok").click();
      await page.getByRole("button", { name: /Kalıcı Olarak Sil \(3\)/ }).click();
      await page.getByText(/Takvim kaydedildi/).first().waitFor({ timeout: 15000 }).catch(() => {});
      await sleep(500);
      bl = (await dlgLog(page)).slice(d);
      const w10c = kupaWrites(writes).slice(w7);
      ok("10 toplu: 3 aşama onayı → tam 3 pencere", bl.length === 3, JSON.stringify(bl));
      ok("10 toplu: yalnız 3 DELETE /calendar/days (d1,d2,d3)", w10c.length === 3 && w10c.every((x) => x.method === "DELETE") && w10c.map((x) => x.path).sort().join(",") === "/api/kupa/calendar/days/d1,/api/kupa/calendar/days/d2,/api/kupa/calendar/days/d3", fmt(w10c));
      await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
      await sleep(300);

      // ── 10 Takvim silme: 1 onay; Vazgeç → 0; onay → TEK DELETE ──
      const w8 = kupaWrites(writes).length;
      const planDel = page.locator("button.border-rose-200", { hasText: "Sil" }).first();
      d = (await dlgLog(page)).length;
      await planDel.click();
      await alertDlg(page).waitFor();
      await page.getByTestId("confirm-cancel").click();
      await sleep(400);
      ok("10 takvim Sil → 1 onay ('Takvimi Sil'); Vazgeç → SIFIR yazma", (await dlgLog(page)).slice(d).join("|") === "Takvimi Sil" && kupaWrites(writes).length === w8, JSON.stringify((await dlgLog(page)).slice(d)));
      d = (await dlgLog(page)).length;
      await planDel.click();
      await page.getByTestId("confirm-ok").click();
      await sleep(1200);
      const w10d = kupaWrites(writes).slice(w8);
      ok("10 takvim onay → 1 katman + TEK DELETE /calendar/plans/p1", (await dlgLog(page)).slice(d).length === 1 && w10d.length === 1 && w10d[0].method === "DELETE" && w10d[0].path === "/api/kupa/calendar/plans/p1", fmt(w10d));

      ok("takvim: sayfa hatası yok", env.errors.length === 0, env.errors.join(" | "));
      if (env.unknown.length && VERBOSE) console.log("   bilinmeyen api:", [...new Set(env.unknown)].join(", "));
      await ctx.close();
      ctx = null;
    }

    // ═══ 10 NOKTALAR: CrudManager silme (KupaConfirmDialog) — tek kayıt, 1 onay ════════════
    {
      const env = await setupContext(browser);
      ctx = env.ctx;
      const { page, writes } = env;
      await gotoReady(page, `${APP}/kupa/noktalar`, "ZZ Ense Bölgesi");
      await page.getByRole("button", { name: /ZZ Ense Bölgesi/ }).first().click();
      const delBtn = page.getByRole("button", { name: "Sil", exact: true }).first();
      await delBtn.waitFor({ timeout: 15000 });
      const w0 = kupaWrites(writes).length;
      let d = (await dlgLog(page)).length;
      await delBtn.click();
      const kd = page.locator('[role="dialog"][aria-modal="true"]', { hasText: "Kaydı sil" });
      await kd.waitFor();
      ok("10 Crud: silme uyarısı bağlı kayıtları söyler", /birlikte silinir/.test(await kd.innerText()));
      await kd.getByRole("button", { name: "Vazgeç", exact: true }).click();
      await sleep(400);
      ok("10 Crud Sil → 1 onay ('Kaydı sil'); Vazgeç → SIFIR yazma", (await dlgLog(page)).slice(d).join("|") === "Kaydı sil" && kupaWrites(writes).length === w0, JSON.stringify((await dlgLog(page)).slice(d)));
      d = (await dlgLog(page)).length;
      await delBtn.click();
      await kd.waitFor();
      await page.keyboard.press("Escape");
      await sleep(300);
      ok("10 Crud: Escape → kapanır + SIFIR yazma", (await kd.count()) === 0 && kupaWrites(writes).length === w0);
      d = (await dlgLog(page)).length;
      await delBtn.click();
      await kd.getByRole("button", { name: "Sil", exact: true }).click();
      await sleep(1000);
      const w = kupaWrites(writes).slice(w0);
      ok("10 Crud onay → 1 katman + TEK DELETE /points/pt1", (await dlgLog(page)).slice(d).length === 1 && w.length === 1 && w[0].method === "DELETE" && w[0].path === "/api/kupa/points/pt1", fmt(w));
      ok("noktalar: sayfa hatası yok", env.errors.length === 0, env.errors.join(" | "));
      await ctx.close();
      ctx = null;
    }
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    if (app && app.pid) {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
  }
  console.log(`\nFINAL-A2 Kupa UI (mock): ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
