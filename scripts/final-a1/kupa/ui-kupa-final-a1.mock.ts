/**
 * FINAL-A1 — Kupa & Hacamat: DAVRANIŞ testleri (Playwright + API route MOCK; DB/prod'a SIFIR temas).
 *
 *  - Uygulama: KUPA_APP_URL verilirse o adres (ör. `next start` ile build), yoksa bu script
 *    `next dev`i 127.0.0.1:KUPA_APP_PORT'ta başlatır (Next 16: dev çıktısı .next/dev → build'le çakışmaz).
 *  - TÜM /api/** istekleri tarayıcıda yakalanır ve bellek içi sahte durumdan yanıtlanır; dış ağ kapalı.
 *    Her yazma isteği (POST/PATCH/PUT/DELETE) kaydedilir → "Kaydet dışında yazma YOK" ağ seviyesinde doğrulanır.
 *
 * Kapsam:
 *   (3) Bilgilendirme şablonu: görüntülemede 0 yazma (kilitli), seçim → 0 yazma, Düzenlemeyi Bitir → 0 yazma +
 *       geri dönüş, Kaydet → TEK PATCH {advice_template_id}.
 *   (6) Çıkış koruması: temizken link → onay YOK; kirliyken link → onay; gün paneli × / arka plan → kirliyse onay.
 *   (7) "Takvim Oluştur / Aç": mevcut yıl → POST YOK, mevcut takvim açılır; etiket/başlık yanıltıcı değil.
 *   (4) Atıf kaynağı (noktalar): katalog <select> YOK; öneri yalnız kendi kaynakları; yeni ad → POST source + citation.
 *   (6) CrudManager: kirli formda başka kayda geçiş → onay; temizken onay YOK.
 *   (5) Protokol listesi: etiketle arama.
 *
 * Çalıştır: npx tsx scripts/final-a1/kupa/ui-kupa-final-a1.mock.ts
 */
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Browser, type BrowserContext, type Page, type Route } from "playwright";

const PORT = Number(process.env.KUPA_APP_PORT ?? 3941);
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
  return {
    plans: [
      { id: "p1", tenant_id: T, name: "2026 Hacamat Takvimi", year: 2026, description: null, advice_template_id: "t1" as string | null, is_active: true, created_at: NOW, updated_at: NOW },
    ],
    days: [
      { id: "d1", tenant_id: T, plan_id: "p1", gregorian_date: "2026-02-10", selection_source: "manual", user_label: "Sünnet", note: null, color_key: "sky", created_at: NOW, updated_at: NOW },
    ],
    templates: [
      { id: "t1", tenant_id: T, title: "Standart Bilgilendirme", before_text: "Önce A", after_text: "Sonra A", general_note: null, is_default: true, is_active: true, created_at: NOW, updated_at: NOW },
      { id: "t2", tenant_id: T, title: "Kısa Bilgilendirme", before_text: "Önce B", after_text: "Sonra B", general_note: null, is_default: false, is_active: true, created_at: NOW, updated_at: NOW },
    ],
    points: [
      { id: "pt1", tenant_id: T, name: "ZZ Ense Bölgesi", is_active: true, sort_order: 0 },
      { id: "pt2", tenant_id: T, name: "ZZ Sırt Bölgesi", is_active: true, sort_order: 1 },
    ],
    sources: [
      { id: "s-own", tenant_id: T, source_name: "Ahmet Hoca Eğitim Notu", origin_type: null, origin_source_id: null, transferred_at: null, sort_order: 0 },
      { id: "s-sys", tenant_id: T, source_name: "Sistem Sahibi Kataloğu", origin_type: "admin_transfer", origin_source_id: "orig-1", transferred_at: NOW, sort_order: 1 },
    ] as Record<string, unknown>[],
    citations: [] as Record<string, unknown>[],
    protocols: [
      { id: "pr1", tenant_id: T, title: "Migren Protokolü", category: "Baş", tags: ["baş ağrısı"], is_active: true, sort_order: 0, created_at: NOW, updated_at: NOW },
      { id: "pr2", tenant_id: T, title: "Bel Fıtığı", category: "Sırt", tags: ["IŞIK TEDAVİSİ", "ense"], is_active: true, sort_order: 1, created_at: NOW, updated_at: NOW },
    ],
  };
}

async function setupContext(browser: Browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "yasam_user",
        JSON.stringify({
          id: "u-zz", role: "expert", active: true, approval_status: "approved", package_type: "premium", membership_status: "active",
          tenant_id: "tenant-zz", is_demo_account: false, module_permissions: { cupping: true }, full_name: "ZZ Final A1", name: "ZZ Final A1",
        }),
      );
      localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
    } catch { /* yok */ }
  });
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

async function handleApi(route: Route, s: ReturnType<typeof freshState>, writes: Write[], unknown: string[]) {
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
  if (p === "/api/kupa/calendar/plans" && m === "POST") {
    const year = Number(body.year);
    const existing = s.plans.find((x) => x.year === year);
    if (existing && body.reuse_year === true) return json(route, { ok: true, plan: existing, reused: true });
    const np = { ...s.plans[0], id: `p-${year}`, year, name: String(body.name), advice_template_id: null };
    s.plans.unshift(np);
    return json(route, { ok: true, plan: np });
  }
  const planM = /^\/api\/kupa\/calendar\/plans\/([^/]+)$/.exec(p);
  if (planM) {
    const plan = s.plans.find((x) => x.id === planM[1]);
    if (!plan) return json(route, { ok: false, error: "yok" }, 404);
    if (m === "GET") return json(route, { ok: true, plan, days: s.days.filter((d) => d.plan_id === plan.id) });
    if (m === "PATCH") {
      Object.assign(plan, body);
      return json(route, { ok: true, plan });
    }
  }
  if (p === "/api/kupa/advice-templates" && m === "GET") return json(route, { ok: true, templates: s.templates });
  // Noktalar + kaynaklar + atıflar
  if (p === "/api/kupa/points" && m === "GET") return json(route, { ok: true, points: s.points });
  if (p === "/api/kupa/sources" && m === "GET") return json(route, { ok: true, sources: s.sources });
  if (p === "/api/kupa/sources" && m === "POST") {
    const src = { id: `s-new-${s.sources.length}`, tenant_id: T, source_name: String(body.source_name), sort_order: s.sources.length };
    s.sources.push(src);
    return json(route, { ok: true, source: src });
  }
  const citM = /^\/api\/kupa\/citations\/([^/]+)$/.exec(p);
  if (citM && m === "GET") return json(route, { ok: true, citations: s.citations });
  if (citM && m === "POST") {
    const c = { id: `c-${s.citations.length + 1}`, source_id: body.source_id, locator: body.locator ?? null, evidence_class: body.evidence_class ?? null, note: body.note ?? null };
    s.citations.push(c);
    return json(route, { ok: true, citation: c });
  }
  if (p === "/api/kupa/protocols" && m === "GET") return json(route, { ok: true, protocols: s.protocols });
  if (/^\/api\/kupa\/(points|techniques|safety)\/[^/]+\/protocols$/.test(p) && m === "GET") return json(route, { ok: true, protocols: [] });
  // Bilinmeyen (oturum/analitik vb.) — yazma değilse nötr yanıt.
  if (m === "GET" || m === "HEAD") {
    unknown.push(`${m} ${p}`);
    return json(route, { ok: true });
  }
  unknown.push(`${m} ${p}`);
  return json(route, { ok: true });
}

const kupaWrites = (w: Write[]) => w.filter((x) => x.path.startsWith("/api/kupa/"));
const confirmDialog = (page: Page) => page.getByRole("alertdialog").or(page.locator('[role="dialog"][aria-modal="true"]').filter({ hasText: "Kaydedilmemiş" }));

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

    // ═══ (3) + (6) + (7) TAKVİM ═══════════════════════════════════════════
    {
      const env = await setupContext(browser);
      ctx = env.ctx;
      const { page, writes, state } = env;
      await gotoReady(page, `${APP}/kupa/takvim`, "Bu Takvimin Bilgilendirme Şablonu");
      const sel = page.getByTestId("kupa-advice-attach");
      await sel.waitFor();

      // (3a) GÖRÜNTÜLEME: kilitli, programatik değişiklik bile yazmaz
      ok("3a görüntüleme: şablon seçimi kilitli (disabled)", await sel.isDisabled());
      ok("3a görüntüleme: kayıtlı şablon gösterilir (t1)", (await sel.inputValue()) === "t1");
      await sel.evaluate((el: HTMLSelectElement) => {
        el.disabled = false;
        el.value = "t2";
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await sleep(800);
      ok("3a görüntüleme: değişiklik denemesi → SIFIR yazma isteği", kupaWrites(writes).length === 0, JSON.stringify(writes));
      ok("3a görüntüleme: sunucu durumu değişmedi", state.plans[0].advice_template_id === "t1");

      // (6) Temizken link → onay YOK (doğrudan gezinme yok; burada yalnız onayın çıkmadığı ölçülür)
      // (7) Etiket: "+ Takvim Oluştur / Aç"; eski yanıltıcı "+ Yeni Takvim" YOK
      ok("7 etiket: '+ Takvim Oluştur / Aç' var", (await page.getByRole("button", { name: "+ Takvim Oluştur / Aç", exact: true }).count()) === 1);
      ok("7 etiket: '+ Yeni Takvim' yok", (await page.getByRole("button", { name: /Yeni Takvim/ }).count()) === 0);

      // (3b) DÜZENLEME: seçim YAZMAZ
      await page.reload({ waitUntil: "load" });
      await page.getByTestId("kupa-advice-attach").waitFor();
      await page.getByTestId("kupa-edit-month").click();
      ok("3b düzenleme: seçim açık", !(await sel.isDisabled()));
      const before = kupaWrites(writes).length;
      await sel.selectOption("t2");
      await sleep(1000);
      ok("3b seçim değişti → SIFIR yazma isteği", kupaWrites(writes).length === before, JSON.stringify(kupaWrites(writes)));
      ok("3b sunucu hâlâ t1", state.plans[0].advice_template_id === "t1");
      ok("3b 'Kaydedilmedi' ipucu görünür", /Kaydedilmedi/.test(await page.getByTestId("kupa-advice-attach-hint").innerText()));
      ok("3b kaydet barı kirli + şablon değişikliği sayılır", /bilgilendirme şablonu değişecek/.test(await page.locator('[data-kupa-savebar="inline"]').innerText()));
      ok("3b önizleme taslağı gösterir (Kısa Bilgilendirme)", (await page.getByText("Önce B").count()) >= 1);

      // (6) Kirliyken uygulama içi link → onay; Vazgeç → sayfada kal, yazma yok
      await page.getByRole("link", { name: "Kupa & Hacamat" }).first().click().catch(() => {});
      const dlg = confirmDialog(page);
      const guardShown = await dlg.first().waitFor({ timeout: 4000 }).then(() => true, () => false);
      ok("6 kirli (yalnız şablon) + link → kaydedilmemiş onayı", guardShown);
      if (guardShown) await page.getByRole("button", { name: "Vazgeç", exact: true }).last().click();
      await sleep(400);
      ok("6 Vazgeç → takvimde kalındı", new URL(page.url()).pathname === "/kupa/takvim");

      // (3c) Düzenlemeyi Bitir → onay → Kaydetmeden Devam → 0 yazma, seçim kayıtlıya döner
      await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
      await page.getByRole("button", { name: "Kaydetmeden Devam Et" }).click();
      await sleep(600);
      ok("3c iptal/çıkış → SIFIR yazma", kupaWrites(writes).length === before, JSON.stringify(kupaWrites(writes)));
      ok("3c seçim kayıtlı değere döndü (t1) + kilitli", (await sel.inputValue()) === "t1" && (await sel.isDisabled()));

      // (3d) Düzenle → t2 → Değişiklikleri Kaydet → TEK PATCH
      await page.getByTestId("kupa-edit-month").click();
      await sel.selectOption("t2");
      await page.locator('[data-kupa-savebar] button:visible', { hasText: "Değişiklikleri Kaydet" }).first().click();
      await page.getByText("Takvim kaydedildi.").first().waitFor({ timeout: 15000 }).catch(() => {});
      const w = kupaWrites(writes).slice(before);
      ok("3d Kaydet → tam 1 yazma", w.length === 1, JSON.stringify(w));
      ok("3d yazma = PATCH /api/kupa/calendar/plans/p1 {advice_template_id:'t2'}", w[0]?.method === "PATCH" && w[0]?.path === "/api/kupa/calendar/plans/p1" && JSON.stringify(w[0]?.body) === JSON.stringify({ advice_template_id: "t2" }), JSON.stringify(w[0]));
      ok("3d sunucu t2 + ekran t2 + kirli değil", state.plans[0].advice_template_id === "t2" && (await sel.inputValue()) === "t2" && /Tüm değişiklikler kaydedildi/.test(await page.locator('[data-kupa-savebar="inline"]').innerText()));

      // (6) Temiz durumda link → onay YOK
      const afterSave = kupaWrites(writes).length;
      await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
      await sleep(300);
      ok("6 temiz Düzenlemeyi Bitir → onay YOK", (await page.getByRole("button", { name: "Kaydetmeden Devam Et" }).count()) === 0);

      // (6) Gün paneli: değişiklik yok → × doğrudan kapanır; değişiklik var → × / arka plan onay sorar
      await page.getByTestId("kupa-edit-month").click();
      const navTo = async (mon: string) => {
        for (let i = 0; i < 12; i++) {
          if ((await page.getByText(new RegExp(`Düzenleniyor: ${mon} 2026`)).count()) > 0) return;
          await page.getByRole("button", { name: "Önceki ay", exact: true }).first().click();
        }
      };
      await navTo("Şubat");
      await page.locator('[data-kupa-day="2026-02-10"]:visible').first().click();
      const panel = page.getByRole("dialog", { name: /Günü Düzenle|Gün Ekle/ });
      await panel.waitFor();
      await panel.getByRole("button", { name: "Kapat" }).click();
      await sleep(300);
      ok("6 gün paneli: değişiklik yok → × doğrudan kapandı (onay YOK)", (await panel.count()) === 0 && (await page.getByRole("button", { name: "Uygulamadan Kapat" }).count()) === 0);
      await page.locator('[data-kupa-day="2026-02-10"]:visible').first().click();
      await panel.waitFor();
      await panel.locator("#cupping-day-label").fill("Sünnet günü değişti");
      await panel.getByRole("button", { name: "Kapat" }).click();
      const askX = await page.getByRole("button", { name: "Uygulamadan Kapat" }).waitFor({ timeout: 3000 }).then(() => true, () => false);
      ok("6 gün paneli: değişiklik var → × onay sorar", askX);
      if (askX) await page.getByRole("button", { name: "Vazgeç", exact: true }).last().click();
      await sleep(300);
      ok("6 gün paneli: onayda Vazgeç → panel açık + yazı korunur", (await panel.count()) === 1 && (await panel.locator("#cupping-day-label").inputValue()) === "Sünnet günü değişti");
      await page.mouse.click(5, 5); // arka plan
      const askBg = await page.getByRole("button", { name: "Uygulamadan Kapat" }).waitFor({ timeout: 3000 }).then(() => true, () => false);
      ok("6 gün paneli: arka plan tıklaması → onay sorar", askBg);
      if (askBg) await page.getByRole("button", { name: "Uygulamadan Kapat" }).click();
      await sleep(300);
      ok("6 gün paneli: onayla kapandı; taslak değişmedi; yazma YOK", (await panel.count()) === 0 && kupaWrites(writes).length === afterSave && /Tüm değişiklikler kaydedildi/.test(await page.locator('[data-kupa-savebar="inline"]').innerText()));
      await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();

      // (7) Takvim Oluştur / Aç → mevcut yıl: POST YOK, mevcut takvim açılır
      await page.getByRole("button", { name: "+ Takvim Oluştur / Aç", exact: true }).click();
      const nd = page.getByTestId("kupa-new-calendar");
      ok("7 pencere başlığı 'Takvim Oluştur / Aç'", (await nd.getByRole("heading", { name: "Takvim Oluştur / Aç" }).count()) === 1);
      await page.getByTestId("kupa-new-calendar-year").selectOption("2026");
      await page.getByTestId("kupa-new-calendar-month").selectOption("3");
      ok("7 mevcut yıl: 'zaten var … yeni takvim oluşturulmaz' bilgisi", /zaten var[\s\S]*oluşturulmaz/.test(await page.getByTestId("kupa-new-calendar-hint").innerText()));
      ok("7 mevcut yıl: buton 'Oluştur' DEMEZ", (await nd.getByRole("button", { name: /^Mart 2026 Ayını Düzenle$/ }).count()) === 1);
      const w7 = kupaWrites(writes).length;
      await nd.getByRole("button", { name: /Ayını Düzenle/ }).click();
      await page.getByTestId("kupa-edit-banner").waitFor();
      ok("7 mevcut yıl: hiçbir yazma (POST) yok; mevcut takvim düzenlemede açıldı", kupaWrites(writes).length === w7 && state.plans.length === 1 && /Mart 2026/.test(await page.getByTestId("kupa-edit-banner").innerText()));
      await page.getByRole("button", { name: "Düzenlemeyi Bitir" }).click();
      await page.getByRole("button", { name: "+ Takvim Oluştur / Aç", exact: true }).click();
      await page.getByTestId("kupa-new-calendar-year").selectOption("2028");
      ok("7 boş yıl: buton 'Oluştur · …' der", (await nd.getByRole("button", { name: /^Oluştur · .* 2028 Ayını Düzenle$/ }).count()) === 1);
      await nd.getByRole("button", { name: "Vazgeç" }).click();
      ok("takvim: sayfa hatası yok", env.errors.length === 0, env.errors.join(" | "));
      if (env.unknown.length && VERBOSE) console.log("   bilinmeyen api:", [...new Set(env.unknown)].join(", "));
      await ctx.close();
      ctx = null;
    }

    // ═══ (4) + (6) NOKTALAR: atıf kaynağı + CrudManager koruması ═════════════
    {
      const env = await setupContext(browser);
      ctx = env.ctx;
      const { page, writes, state } = env;
      await gotoReady(page, `${APP}/kupa/noktalar`, "ZZ Ense Bölgesi");
      await page.getByRole("button", { name: /ZZ Ense Bölgesi/ }).first().click();
      const srcInput = page.getByTestId("kupa-citation-source-name");
      await srcInput.waitFor({ timeout: 15000 }).catch(async (e) => {
        if (process.env.KUPA_SHOT) await page.screenshot({ path: process.env.KUPA_SHOT, fullPage: true });
        console.log("   sayfa hataları:", env.errors.join(" | "), "bilinmeyen api:", [...new Set(env.unknown)].join(", "));
        throw e;
      });
      ok("4 katalog <select> ('— kaynak seç —') YOK", (await page.locator('select[aria-label="Kaynak seç"]').count()) === 0 && (await page.getByText("— kaynak seç —").count()) === 0);
      await srcInput.click();
      const sug = page.getByTestId("kupa-citation-source-name-suggestions");
      await sug.waitFor({ timeout: 3000 }).catch(() => {});
      const sugText = (await sug.count()) ? await sug.innerText() : "";
      ok("4 öneri: kendi kaynağı var", /Ahmet Hoca Eğitim Notu/.test(sugText), sugText);
      ok("4 öneri: aktarılmış/sistem kaynağı YOK", !/Sistem Sahibi Kataloğu/.test(sugText), sugText);
      await srcInput.fill("Sistem");
      await sleep(200);
      ok("4 'Sistem' yazınca bile sistem kaynağı önerilmez", (await sug.count()) === 0 || !/Sistem Sahibi/.test(await sug.innerText()));

      // (6) CrudManager: kirli (atıf formu) → başka kayda geçiş onay sorar; Vazgeç → kalır
      await page.getByRole("button", { name: /ZZ Sırt Bölgesi/ }).first().click();
      const ask = await page.getByRole("button", { name: "Kaydetmeden Çık" }).waitFor({ timeout: 3000 }).then(() => true, () => false);
      ok("6 Crud: kirli atıf formu + başka kayıt → onay", ask);
      if (ask) await page.getByRole("button", { name: "Vazgeç", exact: true }).last().click();
      await sleep(300);
      ok("6 Crud: Vazgeç → yazı korunur", (await srcInput.inputValue()) === "Sistem");

      // (4) Yeni serbest ad → POST source + POST citation (source_id yeni kaynak)
      const w0 = kupaWrites(writes).length;
      await srcInput.fill("Kendi Eğitim Notlarım");
      await page.getByRole("button", { name: "Kaynak Bağla" }).click();
      await page.getByText(/Kendi Eğitim Notlarım/).first().waitFor({ timeout: 5000 }).catch(() => {});
      await sleep(300);
      const w4 = kupaWrites(writes).slice(w0);
      ok("4 yeni ad → [POST /sources, POST /citations/point]", w4.map((x) => `${x.method} ${x.path}`).join(",") === "POST /api/kupa/sources,POST /api/kupa/citations/point", JSON.stringify(w4));
      ok("4 kaynak adı serbest metin olarak kaydedildi", (w4[0]?.body as { source_name?: string })?.source_name === "Kendi Eğitim Notlarım");
      ok("4 atıf yeni kaynağa bağlandı", (w4[1]?.body as { source_id?: string })?.source_id === state.sources[state.sources.length - 1].id);
      // Aynı (kendi) ad → kaynak yeniden kullanılır, yalnız atıf
      const w1 = kupaWrites(writes).length;
      await srcInput.fill("ahmet hoca eğitim notu");
      await page.getByRole("button", { name: "Kaynak Bağla" }).click();
      await sleep(800);
      const w5 = kupaWrites(writes).slice(w1);
      ok("4 mevcut kendi adı → yalnız POST citation (source_id=s-own)", w5.length === 1 && w5[0].path === "/api/kupa/citations/point" && (w5[0].body as { source_id?: string }).source_id === "s-own", JSON.stringify(w5));

      // (6) Temiz → başka kayda geçiş onaysız
      await page.getByRole("button", { name: /ZZ Sırt Bölgesi/ }).first().click();
      await sleep(400);
      ok("6 Crud: temiz → başka kayda geçişte onay YOK", (await page.getByRole("button", { name: "Kaydetmeden Çık" }).count()) === 0);
      // (6) Crud form alanı değişti → link → onay
      const nameInput = page.locator('input[value="ZZ Sırt Bölgesi"]').first();
      await nameInput.fill("ZZ Sırt Bölgesi değişti");
      await page.getByRole("link", { name: "Kupa & Hacamat" }).first().click().catch(() => {});
      const askLink = await page.getByRole("button", { name: "Kaydetmeden Çık" }).waitFor({ timeout: 3000 }).then(() => true, () => false);
      ok("6 Crud: kirli form + link → sayfa koruması onayı", askLink);
      if (askLink) await page.getByRole("button", { name: "Vazgeç", exact: true }).last().click();
      ok("noktalar: sayfa hatası yok", env.errors.length === 0, env.errors.join(" | "));
      await ctx.close();
      ctx = null;
    }

    // ═══ (5) PROTOKOL LİSTESİ: etiket araması ══════════════════════════════
    {
      const env = await setupContext(browser);
      ctx = env.ctx;
      const { page } = env;
      await gotoReady(page, `${APP}/kupa/protokoller`, "Migren Protokolü");
      const q = page.getByLabel("Protokol ara");
      const titles = async () => (await page.getByText(/^(Migren Protokolü|Bel Fıtığı)$/).allInnerTexts()).sort().join("|");
      await q.fill("ense");
      await sleep(200);
      ok("5 UI: etiket 'ense' → yalnız Bel Fıtığı", (await titles()) === "Bel Fıtığı", await titles());
      await q.fill("ışık");
      await sleep(200);
      ok("5 UI: 'ışık' ↔ etiket 'IŞIK TEDAVİSİ'", (await titles()) === "Bel Fıtığı", await titles());
      await q.fill("migren");
      await sleep(200);
      ok("5 UI: başlık araması korunur", (await titles()) === "Migren Protokolü", await titles());
      await q.fill("zzz-yok");
      await sleep(200);
      ok("5 UI: eşleşme yok mesajı", (await page.getByText("Aramanızla eşleşen protokol bulunamadı.").count()) === 1);
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
  console.log(`\nFINAL-A1 Kupa UI (mock): ${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
