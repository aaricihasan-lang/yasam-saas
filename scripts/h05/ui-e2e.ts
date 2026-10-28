/**
 * H-05 — Danışan Yolculuğu düzenleme taslağı koruması: gerçek tarayıcı E2E (Playwright chromium;
 * PRODUCTION'A SIFIR TEMAS — yalnız 127.0.0.1, geçici embedded Postgres, sentetik ZZ_ veri).
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 ile build:
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy-anon \
 *   SUPABASE_SERVICE_ROLE_KEY=dummy-service npx next build
 * Çalıştır: npx tsx scripts/h05/ui-e2e.ts [--only grup1,grup2] [--out <klasör>]
 *
 * Gruplar her adımla birlikte eklenir (T = alt düzeltmeler, P = çakışma paneli, L = çıkış koruması).
 * Her grup masaüstü (1280) ve mobil (390) görünümde koşar.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const argv = process.argv;
const OUT = argv.includes("--out") ? argv[argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "h05-ui");
const ONLY = argv.includes("--only") ? new Set(argv[argv.indexOf("--only") + 1]!.split(",")) : null;
mkdirSync(OUT, { recursive: true });
const APP = "http://127.0.0.1:3989";
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(c: unknown, label: string, extra?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`zaman aşımı: ${url}`);
}

const SUB_DDL = `
create table public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  session_date text, session_type text, duration_minutes int, fee numeric, session_note text, actions_done text, suggestions text, next_plan text,
  created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  stone_name text, stone_type text, note text, usage_area text, combination_text text, warning_text text, other_notes text, stone_date text, created_at timestamptz default now());
create table public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date text, end_date text, status text, expert_note text, client_feedback text,
  alert_dismissed_at timestamptz, created_at timestamptz default now());
create table public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  stone_id uuid, file_path text, created_at timestamptz default now());
`;

type Env = Awaited<ReturnType<typeof import("../anamnez/testEnv")["startAnamnezTestEnv"]>>;
type Seed = Awaited<ReturnType<typeof import("../anamnez/testEnv")["seedAnamnez"]>>;
type Viewport = { name: string; width: number; height: number };
const VIEWPORTS: Viewport[] = [
  { name: "masaüstü", width: 1280, height: 900 },
  { name: "mobil", width: 390, height: 844 },
];

type H = {
  env: Env;
  S: Seed;
  q1: (sql: string, a?: unknown[]) => Promise<Record<string, unknown>>;
  api: (method: string, p: string, body?: unknown) => Promise<{ status: number; json: Record<string, unknown> }>;
  open: (vp: Viewport) => Promise<{ ctx: BrowserContext; page: Page; pageErrors: string[] }>;
  shot: (page: Page, name: string) => Promise<void>;
};

const toastText = async (page: Page) =>
  (await page.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [] as string[])).join(" | ");

// ─── Gruplar ──────────────────────────────────────────────────────────────────

/** T1 — Taşlar: ağ kesintisinde taslak korunur, hata görünür, Güncelle yeniden kullanılır. */
async function groupT1(h: H) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[T1 Taşlar ağ kesintisi — ${vp.name}]`);
    const a1 = h.S.clients.a1;
    const stoneId = (await h.q1(
      `insert into client_stones(tenant_id, client_id, stone_name, note) values ($1,$2,$3,'İlk taş notu') returning id`,
      [h.S.TA, a1, `ZZ Ametist ${vp.name}`],
    )).id as string;
    const { ctx, page, pageErrors } = await h.open(vp);
    try {
      await page.route("**/api/dogaltas/stone-warnings", (r) => r.fulfill({ status: 200, json: { ok: true, warnings: [] } }));
      await page.goto(`${APP}/dashboard/clients/${a1}?tab=taslar`);
      const card = page.locator("div.grid.gap-2 > div", { hasText: `ZZ Ametist ${vp.name}` }).first();
      await card.waitFor({ timeout: 90_000 });
      await card.getByRole("button", { name: "Düzenle" }).click();
      const note = page.getByPlaceholder(/Taşla ilgili genel öneri/).last();
      await note.fill("Taslak — bağlantı koparken yazıldı");

      // Ağ kesintisi: yalnız bu taşın PATCH'i düşürülür.
      let aborted = 0;
      await page.route("**/api/clients/*/stones", (r) => {
        if (r.request().method() === "PATCH") { aborted++; return r.abort("internetdisconnected"); }
        return r.continue();
      });
      await page.getByRole("button", { name: "Güncelle", exact: true }).click();
      await page.getByText(/Taş kaydı güncellenemedi/).first().waitFor({ timeout: 10_000 });
      ok(aborted === 1, `${vp.name}: PATCH ağda düştü (1 kez)`, aborted);
      ok((await note.inputValue()) === "Taslak — bağlantı koparken yazıldı", `${vp.name}: taslak KORUNDU`);
      const btn = page.getByRole("button", { name: "Güncelle", exact: true });
      ok(await btn.isEnabled(), `${vp.name}: Güncelle düğmesi takılı kalmadı (yeniden kullanılabilir)`);
      ok((await h.q1(`select note from client_stones where id=$1`, [stoneId])).note === "İlk taş notu", `${vp.name}: veritabanına hiçbir şey yazılmadı`);
      await h.shot(page, `T1-ag-kesintisi-${vp.name}`);

      // Bağlantı geri geldi → yeniden dene → başarı.
      await page.unroute("**/api/clients/*/stones");
      await btn.click();
      await page.getByText("Taş kaydı güncellendi.").first().waitFor({ timeout: 10_000 });
      ok((await h.q1(`select note from client_stones where id=$1`, [stoneId])).note === "Taslak — bağlantı koparken yazıldı", `${vp.name}: yeniden deneme kaydetti`);
      ok(!(await page.getByPlaceholder(/Taşla ilgili genel öneri/).last().isVisible().catch(() => false)) ||
        (await page.getByRole("button", { name: "Güncelle", exact: true }).count()) === 0, `${vp.name}: başarılı kayıtta form kapandı (eski davranış)`);

      // Başarılı PATCH sonrası liste yenilemesi ağda düşerse düğme takılı kalmaz (try/finally).
      await card.getByRole("button", { name: "Düzenle" }).click();
      await page.getByPlaceholder(/Taşla ilgili genel öneri/).last().fill("Kayıt sonrası yenileme düşecek");
      await page.route("**/api/clients/*/stones", (r) => (r.request().method() === "GET" ? r.abort("internetdisconnected") : r.continue()));
      const patched = page.waitForResponse((r) => /\/api\/clients\/[^/]+\/stones$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH", { timeout: 10_000 });
      await page.getByRole("button", { name: "Güncelle", exact: true }).click();
      ok((await patched).status() === 200, `${vp.name}: PATCH 200`);
      await page.getByRole("button", { name: "Güncelle", exact: true }).waitFor({ state: "detached", timeout: 10_000 });
      ok((await h.q1(`select note from client_stones where id=$1`, [stoneId])).note === "Kayıt sonrası yenileme düşecek", `${vp.name}: kayıt yapıldı (yenileme düşse de)`);
      await page.unroute("**/api/clients/*/stones");
      ok((await page.getByRole("button", { name: "Güncelleniyor..." }).count()) === 0, `${vp.name}: kayıt sonrası "Güncelleniyor" kilidi kalmadı`);
      // KAPSAM DIŞI GÖZLEM (PASS sayılmaz): loadStones ağ hatasında `loading` kapanmaz → liste "Yükleniyor"da kalır.
      const listStuck = (await page.getByRole("button", { name: "Düzenle" }).count()) === 0;
      console.log(`  ℹ BULGU (kapsam dışı, düzeltilmedi): yenileme ağda düşünce taş listesi ${listStuck ? "\"Yükleniyor\" durumunda kaldı" : "görünür"}`);
      ok(pageErrors.length === 0, `${vp.name}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

// ─── Analizler yardımcıları ───────────────────────────────────────────────────
async function seedAnalysis(h: H, note: string, type: "chakra" | "planet" = "chakra", values?: Record<string, unknown>) {
  const data = { title: type === "planet" ? "Çakra-Gezegen Analizi" : "Çakra Analizi", ...(values ? { values } : {}) };
  return (await h.q1(
    `insert into client_analyses(tenant_id, client_id, analysis_type, analysis_data, note) values ($1,$2,$3,$4,$5) returning id`,
    [h.S.TA, h.S.clients.a1, type, JSON.stringify(data), note],
  )).id as string;
}
/** Kayıtlı analiz satırı (not metniyle). İç içe eşleşmede en içteki satır = `.last()`. */
const analysisRow = (page: Page, note: string) => page.locator("div.grid > div", { hasText: note }).last();
async function openAnalysis(page: Page, note: string) {
  await analysisRow(page, note).getByRole("button", { name: "Aç", exact: true }).click();
  await page.getByTestId("analysis-edit").waitFor({ timeout: 10_000 });
}
const isAnalysisPatch = (r: { url(): string; request(): { method(): string } }) =>
  /\/api\/clients\/[^/]+\/analyses$/.test(new URL(r.url()).pathname) && r.request().method() === "PATCH";

/** T2 + T3 — görsel yüklenirken yalnız o analizin Düzenle'si kilitli; başarı/hata sonrası kilit kalkar, yanlış 409 yok. */
async function groupT2T3(h: H) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[T2/T3 Analiz görsel kilidi — ${vp.name}]`);
    const xNote = `ZZ-X ${vp.name}`;
    const yNote = `ZZ-Y ${vp.name}`;
    const xId = await seedAnalysis(h, xNote);
    await seedAnalysis(h, yNote);
    const { ctx, page, pageErrors } = await h.open(vp);
    try {
      // Görsel yükleme: kapı açılana dek bekletilir; açılınca sunucunun gerçek etkisi (image_url yazımı →
      // row_version +1) DB'de üretilir ve 200 döner. `mode` = "ok" | "fail".
      let release: () => void = () => undefined;
      let gate = new Promise<void>((r) => { release = r; });
      let mode: "ok" | "fail" = "ok";
      let uploads = 0;
      await page.route("**/api/clients/*/analyses/upload-image", async (r) => {
        uploads++;
        const body = r.request().postDataBuffer()?.toString("latin1") ?? "";
        const id = /name="analysisId"\r\n\r\n([0-9a-f-]{36})/.exec(body)?.[1];
        await gate;
        if (mode === "fail") return r.fulfill({ status: 500, json: { ok: false, error: "ZZ görsel hatası" } });
        if (id) await h.q1(`update client_analyses set image_url=$2 where id=$1 returning id`, [id, `zz/${id}.png`]);
        return r.fulfill({ status: 200, json: { ok: true } });
      });
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=analizler`);
      await analysisRow(page, xNote).waitFor({ timeout: 90_000 });

      // X'i düzenle → kaydet → görsel yüklemesi başlar (kapı kapalı).
      await openAnalysis(page, xNote);
      await page.getByTestId("analysis-edit").click();
      await page.getByPlaceholder(/Analiz yorumu, seans gözlemi/).fill(`${xNote} — ilk düzenleme`);
      const p1 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("analysis-save-close").click();
      ok((await p1).status() === 200, `${vp.name}: ilk kayıt 200`);
      for (let i = 0; i < 50 && uploads === 0; i++) await sleep(200);
      ok(uploads === 1, `${vp.name}: görsel yüklemesi başladı`, uploads);

      // Yükleme sürerken X yeniden açılır → Düzenle kilitli + "Görsel kaydediliyor…".
      await analysisRow(page, `${xNote} — ilk düzenleme`).waitFor({ timeout: 10_000 });
      await openAnalysis(page, `${xNote} — ilk düzenleme`);
      const edit = page.getByTestId("analysis-edit");
      ok(await edit.isDisabled(), `${vp.name}: yükleme sürerken X'in Düzenle'si KİLİTLİ`);
      ok((await edit.innerText()).includes("Görsel kaydediliyor"), `${vp.name}: "Görsel kaydediliyor…" gösteriliyor`);
      await h.shot(page, `T2-kilit-${vp.name}`);
      await page.locator("button.no-pdf[aria-label=\"Kapat\"]").click();

      // İlgisiz analiz (Y) kilitlenmez.
      await openAnalysis(page, yNote);
      ok(await page.getByTestId("analysis-edit").isEnabled(), `${vp.name}: ilgisiz Y'nin Düzenle'si AÇIK`);
      await page.locator("button.no-pdf[aria-label=\"Kapat\"]").click();

      // X yeniden açık bekler; kapı açılır → yükleme biter → kilit kalkar.
      await openAnalysis(page, `${xNote} — ilk düzenleme`);
      const vBefore = Number((await h.q1(`select row_version from client_analyses where id=$1`, [xId])).row_version);
      release();
      await page.waitForFunction(() => !(document.querySelector('[data-testid="analysis-edit"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 15_000 });
      ok(true, `${vp.name}: yükleme bitince Düzenle yeniden kullanılabilir`);
      const vAfter = Number((await h.q1(`select row_version from client_analyses where id=$1`, [xId])).row_version);
      ok(vAfter === vBefore + 1, `${vp.name}: görsel yazımı sürümü artırdı (sunucu etkisi gerçek)`, { vBefore, vAfter });

      // Hemen düzenle → yanlış 409 YOK (ekran güncel sürümle yeniden yüklendi).
      await page.getByTestId("analysis-edit").click();
      await page.getByPlaceholder(/Analiz yorumu, seans gözlemi/).fill(`${xNote} — ikinci düzenleme`);
      const p2 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("analysis-save-close").click();
      ok((await p2).status() === 200, `${vp.name}: yükleme sonrası düzenleme 200 (yanlış 409 YOK)`);
      ok((await h.q1(`select note, image_url from client_analyses where id=$1`, [xId])).note === `${xNote} — ikinci düzenleme`, `${vp.name}: ikinci düzenleme kaydedildi`);
      ok(String((await h.q1(`select image_url from client_analyses where id=$1`, [xId])).image_url ?? "").startsWith("zz/"), `${vp.name}: önceki görsel yolu KORUNDU`);

      // T3 — yükleme başarısız: kilit yine kalkar.
      for (let i = 0; i < 50 && uploads < 2; i++) await sleep(200);
      gate = new Promise<void>((r) => { release = r; });
      mode = "fail";
      await analysisRow(page, `${xNote} — ikinci düzenleme`).waitFor({ timeout: 10_000 });
      await openAnalysis(page, `${xNote} — ikinci düzenleme`);
      await page.getByTestId("analysis-edit").click();
      await page.getByPlaceholder(/Analiz yorumu, seans gözlemi/).fill(`${xNote} — üçüncü düzenleme`);
      const p3 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("analysis-save-close").click();
      ok((await p3).status() === 200, `${vp.name}: üçüncü kayıt 200`);
      await analysisRow(page, `${xNote} — üçüncü düzenleme`).waitFor({ timeout: 10_000 });
      await openAnalysis(page, `${xNote} — üçüncü düzenleme`);
      ok(await page.getByTestId("analysis-edit").isDisabled(), `${vp.name}: T3 yükleme sürerken kilitli`);
      release();
      await page.getByText(/görsel eklenemedi/).first().waitFor({ timeout: 15_000 });
      await page.waitForFunction(() => !(document.querySelector('[data-testid="analysis-edit"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 15_000 });
      ok(true, `${vp.name}: T3 yükleme HATASINDA da kilit kalktı`);
      await page.getByTestId("analysis-edit").click();
      await page.getByPlaceholder(/Analiz yorumu, seans gözlemi/).fill(`${xNote} — dördüncü düzenleme`);
      mode = "ok";
      const p4 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("analysis-save-close").click();
      ok((await p4).status() === 200, `${vp.name}: T3 sonrası düzenleme 200`);
      ok(pageErrors.length === 0, `${vp.name}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

/** T4 — sırasız liste yanıtları: geç dönen ESKİ yanıt yeni listeyi ezmez. */
async function groupT4(h: H) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[T4 Analiz listesi sırasız yanıt — ${vp.name}]`);
    const note = `ZZ-T4 ${vp.name}`;
    const id = await seedAnalysis(h, note);
    const { ctx, page, pageErrors } = await h.open(vp);
    try {
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=analizler`);
      await analysisRow(page, note).waitFor({ timeout: 90_000 });
      let n = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      await page.route(/\/api\/clients\/[^/]+\/analyses$/, async (r) => {
        if (r.request().method() !== "GET") return r.fallback();
        n++;
        if (n === 1) {
          const stale = await r.fetch(); // 1. istek: o anki (ESKİ) veri alınır, geç teslim edilir
          const body = await stale.text();
          await gate;
          return r.fulfill({ response: stale, body });
        }
        return r.fallback();
      });
      const refresh = page.getByRole("button", { name: /^(Yenile|Yükleniyor\.\.\.)$/ });
      await refresh.click(); // 1. istek (bekletilir)
      for (let i = 0; i < 50 && n < 1; i++) await sleep(100);
      await sleep(500);
      await h.q1(`update client_analyses set note=$2 where id=$1 returning id`, [id, `${note} TAZE`]);
      await refresh.click(); // 2. istek (taze, hemen)
      await analysisRow(page, `${note} TAZE`).waitFor({ timeout: 10_000 });
      release(); // ESKİ yanıt şimdi döner
      await sleep(1500);
      ok(await analysisRow(page, `${note} TAZE`).isVisible(), `${vp.name}: geç dönen eski yanıt yeni listeyi EZMEDİ`);
      ok((await page.getByText(note, { exact: true }).count()) === 0, `${vp.name}: eski not geri gelmedi`);
      ok(n === 2, `${vp.name}: iki liste isteği yapıldı`, n);
      ok(pageErrors.length === 0, `${vp.name}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

/** T5 — Analiz penceresini kapatma onayı (yalnız kayıtlı analizin düzenlemesinde gerçek değişiklik varsa). */
async function groupT5(h: H) {
  for (const vp of VIEWPORTS) {
    console.log(`\n[T5 Analiz kapatma onayı — ${vp.name}]`);
    const zNote = `ZZ-Z ${vp.name}`;
    const zId = await seedAnalysis(h, zNote);
    const { ctx, page, pageErrors } = await h.open(vp);
    const closeBtn = page.locator("button.no-pdf[aria-label=\"Kapat\"]");
    const noteBox = page.getByPlaceholder(/Analiz yorumu, seans gözlemi/);
    const confirmShown = () => page.getByText("Bu analizde kaydedilmemiş değişiklikler var.").isVisible().catch(() => false);
    const modalOpen = () => closeBtn.isVisible().catch(() => false);
    try {
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=analizler`);
      await analysisRow(page, zNote).waitFor({ timeout: 90_000 });

      await openAnalysis(page, zNote);
      await closeBtn.click(); await sleep(400);
      ok(!(await confirmShown()) && !(await modalOpen()), `${vp.name}: salt okunur → onaysız kapandı (eski davranış)`);

      await openAnalysis(page, zNote);
      await page.getByTestId("analysis-edit").click();
      await closeBtn.click(); await sleep(400);
      ok(!(await confirmShown()) && !(await modalOpen()), `${vp.name}: düzenleme + değişiklik yok → onaysız kapandı`);

      await openAnalysis(page, zNote);
      await page.getByTestId("analysis-edit").click();
      await noteBox.fill(`${zNote} geçici`);
      await noteBox.fill(zNote);
      await closeBtn.click(); await sleep(400);
      ok(!(await confirmShown()) && !(await modalOpen()), `${vp.name}: değişip geri alınan değer → onaysız kapandı`);

      await openAnalysis(page, zNote);
      await page.getByTestId("analysis-edit").click();
      await noteBox.fill(`${zNote} — uzun analiz metni taslağı`);
      await page.getByPlaceholder("+10 / -20").first().fill("+40");
      await closeBtn.click();
      await page.getByText("Bu analizde kaydedilmemiş değişiklikler var.").waitFor({ timeout: 5_000 });
      ok(true, `${vp.name}: değişiklik varken kapatma ONAY istedi`);
      await h.shot(page, `T5-onay-${vp.name}`);
      await page.getByRole("button", { name: "Düzenlemeye devam et" }).click(); await sleep(400);
      ok(await modalOpen(), `${vp.name}: "Düzenlemeye devam et" → pencere açık`);
      ok((await noteBox.inputValue()) === `${zNote} — uzun analiz metni taslağı`, `${vp.name}: not taslağı aynen duruyor`);
      ok((await page.getByPlaceholder("+10 / -20").first().inputValue()) === "+40", `${vp.name}: çakra değeri aynen duruyor`);

      await closeBtn.click();
      await page.getByRole("button", { name: "Kaydetmeden kapat" }).click(); await sleep(400);
      ok(!(await modalOpen()), `${vp.name}: "Kaydetmeden kapat" → pencere kapandı`);
      ok((await h.q1(`select note from client_analyses where id=$1`, [zId])).note === zNote, `${vp.name}: veritabanı DEĞİŞMEDİ`);
      await openAnalysis(page, zNote);
      ok((await noteBox.inputValue()) === zNote, `${vp.name}: yeniden açınca kayıtlı değer görünür`);
      await closeBtn.click(); await sleep(300);

      // Yeni analiz (K-D): davranış değişmez → onaysız kapanır.
      await page.getByRole("button", { name: "Analizi Aç" }).first().click();
      await noteBox.waitFor({ timeout: 10_000 });
      await noteBox.fill("ZZ yeni analiz notu");
      await closeBtn.click(); await sleep(400);
      ok(!(await confirmShown()) && !(await modalOpen()), `${vp.name}: YENİ analiz → onaysız kapandı (eski davranış)`);
      ok(pageErrors.length === 0, `${vp.name}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

// ─── Seanslar yardımcıları ────────────────────────────────────────────────────
async function seedSession(h: H, note: string, extra: Record<string, string> = {}) {
  const cols = ["tenant_id", "client_id", "session_date", "session_type", "session_note", ...Object.keys(extra)];
  const vals = [h.S.TA, h.S.clients.a1, "2026-10-20", "Enerji Seansı", note, ...Object.values(extra)];
  return (await h.q1(
    `insert into client_sessions(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals,
  )).id as string;
}
const sessionCard = (page: Page, text: string) => page.locator("div.relative.md\\:pl-10", { hasText: text }).first();
const sessionRow = async (h: H, id: string) => h.q1(`select * from client_sessions where id=$1`, [id]);
/** Cihaz 2 (gerçek API, aynı tenant'ın başka uzmanı) — DB'deki güncel sürümle yazar. */
async function device2Patch(h: H, table: string, route: string, id: string, fields: Record<string, unknown>, idKey = "id", wrap = false) {
  const v = Number((await h.q1(`select row_version from ${table} where id=$1`, [id])).row_version);
  const body = wrap ? { [idKey]: id, row_version: v, patch: fields } : { [idKey]: id, row_version: v, ...fields };
  return h.api("PATCH", `/api/clients/${h.S.clients.a1}/${route}`, body);
}
function countRequests(page: Page, re: RegExp, method: string) {
  const list: string[] = [];
  page.on("request", (r) => { if (r.method() === method && re.test(new URL(r.url()).pathname)) list.push(r.postData() ?? ""); });
  return list;
}
const SESS_RE = /\/api\/clients\/[^/]+\/sessions$/;
const isSessionPatch = (r: { url(): string; request(): { method(): string } }) => SESS_RE.test(new URL(r.url()).pathname) && r.request().method() === "PATCH";

/** P1–P3, P9–P11 + eski davranışlar — Seanslar. */
async function groupSessionsP(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    console.log(`\n[Seanslar P — ${tag}]`);
    const { ctx, page, pageErrors } = await h.open(vp);
    const note = () => page.getByPlaceholder("Seans genel notu...").last();
    const plan = () => page.getByPlaceholder("Bir sonraki seans için plan...").last();
    const upd = () => page.getByRole("button", { name: "Güncelle", exact: true });
    const panel = page.getByTestId("record-conflict-panel");
    try {
      // ── P1: farklı alanlarda çakışma → yalnız farklı alanlar, varsayılan güncel, alan bazında güvenli birleştirme
      const s1 = await seedSession(h, `P1 ilk not ${tag}`, { next_plan: "P1 ilk plan" });
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=seanslar`);
      await sessionCard(page, `P1 ilk not ${tag}`).waitFor({ timeout: 90_000 });
      await sessionCard(page, `P1 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P1 cihaz1 notu ${tag}`);
      ok((await device2Patch(h, "client_sessions", "sessions", s1, { session_note: `P1 ilk not ${tag}`, next_plan: "P1 cihaz2 planı" })).status === 200, `${tag}: P1 cihaz 2 kaydetti`);
      const v2 = Number((await sessionRow(h, s1)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      ok(true, `${tag}: P1 409 → karşılaştırma paneli açıldı`);
      ok(await note().isVisible() && (await note().inputValue()) === `P1 cihaz1 notu ${tag}`, `${tag}: P1 form açık, taslak KORUNDU`);
      ok(await page.getByTestId("conflict-field-sessionNote").isVisible() && await page.getByTestId("conflict-field-nextPlan").isVisible(), `${tag}: P1 farklı iki alan listelendi`);
      ok((await page.getByTestId("conflict-field-sessionType").count()) === 0 && (await page.getByTestId("conflict-field-sessionDate").count()) === 0, `${tag}: P1 aynı alanlar listelenmedi`);
      ok((await page.getByTestId("conflict-choice-sessionNote-current").getAttribute("aria-pressed")) === "true"
        && (await page.getByTestId("conflict-choice-nextPlan-current").getAttribute("aria-pressed")) === "true", `${tag}: P1 varsayılan seçim GÜNCEL kayıt`);
      ok(await upd().isDisabled(), `${tag}: P1 eski "Güncelle" (eski sürüm) pasif`);
      const r1 = await sessionRow(h, s1);
      ok(r1.session_note === `P1 ilk not ${tag}` && r1.next_plan === "P1 cihaz2 planı" && Number(r1.row_version) === v2, `${tag}: P1 hiçbir şey yazılmadı (cihaz 2 verisi duruyor)`);
      await h.shot(page, `P1-panel-${tag}`);
      await page.getByTestId("conflict-choice-sessionNote-mine").click();
      const p1 = page.waitForResponse(isSessionPatch, { timeout: 10_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p1).status() === 200, `${tag}: P1 seçimlerle kayıt 200`);
      await page.getByText("Seans güncellendi.").first().waitFor({ timeout: 10_000 });
      const r1b = await sessionRow(h, s1);
      ok(r1b.session_note === `P1 cihaz1 notu ${tag}` && r1b.next_plan === "P1 cihaz2 planı", `${tag}: P1 birleştirme doğru (benim notum + cihaz 2 planı)`, r1b);
      ok(Number(r1b.row_version) === v2 + 1, `${tag}: P1 sürüm tam +1 (tek UPDATE)`);
      ok((await page.getByTestId("record-conflict-panel").count()) === 0, `${tag}: P1 başarıda form kapandı (eski davranış)`);

      // ── P2 (ŞART 3): hepsi güncel seçilirse UPDATE GÖNDERİLMEZ
      const s2 = await seedSession(h, `P2 ilk not ${tag}`);
      await page.reload();
      await sessionCard(page, `P2 ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P2 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P2 cihaz1 ${tag}`);
      await device2Patch(h, "client_sessions", "sessions", s2, { session_note: `P2 ilk not ${tag}`, suggestions: "P2 cihaz2 önerisi" });
      const v2b = Number((await sessionRow(h, s2)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      const patches = countRequests(page, SESS_RE, "PATCH");
      await page.getByTestId("conflict-save").click();
      await page.getByText("Seçimlerinizle güncel kayıt arasında fark kalmadı").first().waitFor({ timeout: 10_000 });
      await sleep(800);
      ok(patches.length === 0, `${tag}: P2 fark yok → PATCH GÖNDERİLMEDİ`, patches.length);
      const r2 = await sessionRow(h, s2);
      ok(Number(r2.row_version) === v2b && r2.suggestions === "P2 cihaz2 önerisi" && r2.session_note === `P2 ilk not ${tag}`, `${tag}: P2 sürüm/veri DEĞİŞMEDİ`);

      // ── P3: kaydetmeden önce üçüncü değişiklik → yeniden 409, panel yenilenir, hiçbir şey yazılmaz
      const s3 = await seedSession(h, `P3 ilk not ${tag}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await sessionCard(page, `P3 ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P3 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P3 cihaz1 ${tag}`);
      await device2Patch(h, "client_sessions", "sessions", s3, { session_note: `P3 ilk not ${tag}`, next_plan: "P3 cihaz2" });
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      await page.getByTestId("conflict-choice-sessionNote-mine").click();
      await device2Patch(h, "client_sessions", "sessions", s3, { session_note: `P3 ilk not ${tag}`, next_plan: "P3 cihaz2", actions_done: "P3 cihaz3 işlemi" });
      const v3 = Number((await sessionRow(h, s3)).row_version);
      const p3 = page.waitForResponse(isSessionPatch, { timeout: 10_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p3).status() === 409, `${tag}: P3 araya giren değişiklik → yeniden 409`);
      await page.getByTestId("conflict-field-actionsDone").waitFor({ timeout: 10_000 });
      ok(true, `${tag}: P3 panel yeni güncel kayıtla yenilendi`);
      const r3 = await sessionRow(h, s3);
      ok(Number(r3.row_version) === v3 && r3.actions_done === "P3 cihaz3 işlemi" && r3.session_note === `P3 ilk not ${tag}`, `${tag}: P3 hiçbir şey ezilmedi`);
      ok((await note().inputValue()) === `P3 cihaz1 ${tag}`, `${tag}: P3 taslak hâlâ korunuyor`);
      await page.getByTestId("conflict-choice-sessionNote-mine").click();
      const p3b = page.waitForResponse(isSessionPatch, { timeout: 10_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p3b).status() === 200, `${tag}: P3 ikinci deneme 200`);
      const r3b = await sessionRow(h, s3);
      ok(r3b.session_note === `P3 cihaz1 ${tag}` && r3b.actions_done === "P3 cihaz3 işlemi" && r3b.next_plan === "P3 cihaz2", `${tag}: P3 sonuç doğru birleşti`, r3b);

      // ── P9 (428): sürüm gönderilmezse taslak korunur, panel güncel kayıtla açılır, kayıt yapılmaz
      const s9 = await seedSession(h, `P9 ilk not ${tag}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await sessionCard(page, `P9 ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P9 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P9 cihaz1 ${tag}`);
      await page.route(SESS_RE, async (r) => {
        if (r.request().method() !== "PATCH") return r.fallback();
        const b = JSON.parse(r.request().postData() ?? "{}") as Record<string, unknown>;
        delete b.row_version;
        return r.fallback({ postData: JSON.stringify(b) });
      });
      const p9 = page.waitForResponse(isSessionPatch, { timeout: 10_000 });
      await upd().click();
      ok((await p9).status() === 428, `${tag}: P9 sunucu 428 verdi`);
      await page.unroute(SESS_RE);
      await panel.waitFor({ timeout: 10_000 });
      ok((await note().inputValue()) === `P9 cihaz1 ${tag}`, `${tag}: P9 taslak KORUNDU, panel açıldı`);
      ok((await sessionRow(h, s9)).session_note === `P9 ilk not ${tag}`, `${tag}: P9 hiçbir şey yazılmadı`);
      await page.getByTestId("conflict-discard").click();
      await sessionCard(page, `P9 ilk not ${tag}`).waitFor({ timeout: 10_000 });
      ok(true, `${tag}: P9 "Taslağı bırak" → güncel kayıt gösterildi (eski kapanış davranışı)`);

      // ── P10 (404): başka cihaz sildi → bildirim, taslak korunur + kopyalanır, kayıt GERİ OLUŞMAZ
      const s10 = await seedSession(h, `P10 ilk not ${tag}`);
      await page.reload();
      await sessionCard(page, `P10 ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P10 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P10 cihaz1 taslağı ${tag}`);
      const countBefore = Number((await h.q1(`select count(*)::int c from client_sessions where client_id=$1`, [h.S.clients.a1])).c);
      ok((await h.api("DELETE", `/api/clients/${h.S.clients.a1}/sessions?id=${s10}`)).status === 200, `${tag}: P10 cihaz 2 sildi`);
      await upd().click();
      await page.getByTestId("record-deleted-notice").waitFor({ timeout: 10_000 });
      ok((await note().inputValue()) === `P10 cihaz1 taslağı ${tag}`, `${tag}: P10 silinmiş kayıtta taslak KORUNDU (liste yenilense de)`);
      ok(await upd().isDisabled(), `${tag}: P10 silinmiş kayda "Güncelle" pasif`);
      await page.getByTestId("deleted-copy-draft").click();
      await page.getByText("Kopyalandı ✓").first().waitFor({ timeout: 5_000 });
      const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      ok(clip.includes(`P10 cihaz1 taslağı ${tag}`), `${tag}: P10 taslak panoya kopyalandı`);
      await sleep(500);
      const countAfter = Number((await h.q1(`select count(*)::int c from client_sessions where client_id=$1`, [h.S.clients.a1])).c);
      ok(countAfter === countBefore - 1 && !(await h.q1(`select id from client_sessions where id=$1`, [s10])), `${tag}: P10 silinen kayıt GERİ OLUŞTURULMADI, yeni kayıt yok`);
      await h.shot(page, `P10-silinmis-${tag}`);
      await page.getByTestId("deleted-close").click();
      ok((await page.getByTestId("record-deleted-notice").count()) === 0, `${tag}: P10 "Taslağı kapat" → kart kapandı`);

      // ── P10b: liste yenilemesinde kayıt kaybolursa kart sessizce kaybolmaz
      const s10b = await seedSession(h, `P10b ilk not ${tag}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await sessionCard(page, `P10b ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P10b ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P10b taslak ${tag}`);
      await h.api("DELETE", `/api/clients/${h.S.clients.a1}/sessions?id=${s10b}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await page.getByTestId("record-deleted-notice").waitFor({ timeout: 10_000 });
      ok((await note().inputValue()) === `P10b taslak ${tag}`, `${tag}: P10b liste yenilemesinde taslak kartı KALDI`);
      await page.getByTestId("deleted-close").click();

      // ── P11: 500 / 503 → taslak korunur, hata görünür, Güncelle yeniden kullanılabilir
      const s11 = await seedSession(h, `P11 ilk not ${tag}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await sessionCard(page, `P11 ilk not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `P11 ilk not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`P11 taslak ${tag}`);
      for (const st of [500, 503]) {
        await page.route(SESS_RE, (r) => (r.request().method() === "PATCH" ? r.fulfill({ status: st, json: { ok: false, error: `ZZ ${st} hatası` } }) : r.fallback()));
        await upd().click();
        await page.getByText(`ZZ ${st} hatası`).first().waitFor({ timeout: 10_000 });
        await page.unroute(SESS_RE);
        ok((await note().inputValue()) === `P11 taslak ${tag}` && await upd().isEnabled(), `${tag}: P11 ${st} → taslak korundu, Güncelle kullanılabilir`);
      }
      await upd().click();
      await page.getByText("Seans güncellendi.").first().waitFor({ timeout: 10_000 });
      ok((await sessionRow(h, s11)).session_note === `P11 taslak ${tag}`, `${tag}: P11 tekrar deneme kaydetti`);

      // ── Eski davranışlar: Vazgeç / silme / başarılı düzenleme
      const sOld = await seedSession(h, `ESKI not ${tag}`);
      await page.getByRole("button", { name: "Listeyi Yenile" }).click();
      await sessionCard(page, `ESKI not ${tag}`).waitFor({ timeout: 30_000 });
      await sessionCard(page, `ESKI not ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill("vazgeçilecek metin");
      await page.getByRole("button", { name: "Vazgeç", exact: true }).click();
      ok((await upd().count()) === 0 && (await sessionRow(h, sOld)).session_note === `ESKI not ${tag}`, `${tag}: Vazgeç → form kapandı, kayıt değişmedi (eski davranış)`);
      await sessionCard(page, `ESKI not ${tag}`).getByRole("button", { name: "Sil" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Evet", exact: true }).click();
      // Mevcut davranış: bazı görünümlerde ikinci "Son onay" adımı var → o da onaylanır.
      const second = page.getByRole("alertdialog").getByRole("button", { name: "Kalıcı Olarak Sil" });
      if (await second.waitFor({ timeout: 2_000 }).then(() => true).catch(() => false)) await second.click();
      await page.getByText("Seans silindi.").first().waitFor({ timeout: 10_000 });
      ok(!(await h.q1(`select id from client_sessions where id=$1`, [sOld])), `${tag}: silme onayla çalıştı (eski davranış)`);
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
      void plan;
    } finally {
      await ctx.close();
    }
  }
}

// ─── Çıkış koruması (L) ───────────────────────────────────────────────────────
const NUM_SUMMARY = { ok: true, summary: { hayatYolu: "7", ifadeSayisi: "3", anaKulvar: "1", yanKulvar: "2", kisiselYil: "5", elementler: null, zirve: null, gucluSayilar: [], eksikSayilar: [], eksikElement: [], hiddenFuturePeaks: 0 } };
const NOTIF_ID = "11111111-2222-4333-8444-555555555555";
const notifFeed = () => ({ ok: true, items: [{ id: NOTIF_ID, title: "ZZ randevu", appointment_date: new Date(Date.now() + 60_000).toISOString(), status: "bekliyor", client_id: null, clientName: null, canOpenClient: false }] });
const LEAVE_MSG = "Danışan Yolculuğu'nda kaydedilmemiş düzenlemeniz var.";

async function openGuardedPage(h: H, vp: Viewport, tab: string) {
  const o = await h.open(vp);
  // Test-yalnız yanıtlar (kod DEĞİŞMEZ): bildirim akışı + Numerolojik Özet (kart görünsün diye).
  await o.page.route("**/api/appointments/notifications", (r) => r.fulfill({ status: 200, json: notifFeed() }));
  await o.page.route("**/api/clients/*/numerology-summary", (r) => r.fulfill({ status: 200, json: NUM_SUMMARY }));
  await o.page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=${tab}`);
  return o;
}
const leaveShown = (page: Page) => page.getByText(LEAVE_MSG).isVisible().catch(() => false);
const seenKeys = (page: Page) => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem("yasam.apptNotif.v1") || "{}").seen || []) as string[]; } catch { return [] as string[]; } });

/** L1–L10 (Seanslar ile). */
async function groupSessionsL(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    const mobile = vp.width < 700;
    console.log(`\n[Seanslar L — ${tag}]`);
    const sid = await seedSession(h, `L ilk not ${tag}`);
    const { ctx, page, pageErrors } = await openGuardedPage(h, vp, "seanslar");
    const note = () => page.getByPlaceholder("Seans genel notu...").last();
    const clientPath = `/dashboard/clients/${h.S.clients.a1}`;
    const dialogs: string[] = [];
    let step = "başlangıç";
    let acceptDialogs = false;
    page.on("dialog", (d) => { dialogs.push(d.type()); console.log(`  · tarayıcı uyarısı: ${d.type()} @ ${step} (${new URL(page.url()).pathname})`); void (acceptDialogs ? d.accept() : d.dismiss()).catch(() => undefined); });
    const openMenu = async () => { if (mobile) { await page.getByTestId("quick-nav-open").click(); await sleep(400); } };
    const logo = () => page.locator("[data-testid=side-menu] a[href]").first();
    const startEdit = async (text: string) => {
      await sessionCard(page, text).waitFor({ timeout: 90_000 });
      await sessionCard(page, text).getByRole("button", { name: "Düzenle" }).click();
    };
    try {
      await startEdit(`L ilk not ${tag}`);
      // L1: düzenleme açık ama DEĞİŞİKLİK YOK → menü bağlantısı onaysız çalışır
      await openMenu();
      const logoHref = await logo().getAttribute("href");
      await logo().click();
      await page.waitForURL((u) => u.pathname !== clientPath, { timeout: 15_000 });
      ok(!(await leaveShown(page)), `${tag}: L1 değişiklik yokken menü bağlantısı ONAYSIZ çalıştı (${logoHref})`);
      await page.goBack();
      await startEdit(`L ilk not ${tag}`);
      await note().fill(`L taslak ${tag}`);

      // L9: yenileme uyarısı (beforeunload) yalnız değişiklik varken
      dialogs.length = 0;
      await page.reload({ timeout: 4000 }).catch(() => undefined);
      await sleep(500);
      ok(dialogs.includes("beforeunload"), `${tag}: L9 değişiklik varken yenileme uyarısı çıktı`, dialogs);
      ok((await note().inputValue().catch(() => "")) === `L taslak ${tag}`, `${tag}: L9 uyarıda kalındı, taslak duruyor`);

      // L2: menü bağlantısı → onay; "Sayfada kal" → adres aynı, taslak duruyor
      await openMenu();
      await logo().click();
      await page.getByText(LEAVE_MSG).waitFor({ timeout: 5_000 });
      ok(true, `${tag}: L2 değişiklik varken menü bağlantısı ONAY istedi`);
      await h.shot(page, `L2-onay-${tag}`);
      await page.getByRole("button", { name: "Sayfada kal" }).click();
      await sleep(400);
      ok(new URL(page.url()).pathname === clientPath, `${tag}: L2 "Sayfada kal" → adres aynı`);
      ok((await note().inputValue()) === `L taslak ${tag}`, `${tag}: L2 taslak aynen duruyor`);
      if (mobile) ok(await page.locator("[data-testid=side-menu] a[href]").first().isVisible(), `${tag}: L2 "Kal" → mobil menü açık kaldı`);

      // L6: Ctrl+tık / orta tuş → yakalanmaz (yeni sekme davranışı korunur)
      const popups: string[] = [];
      ctx.on("page", (p) => popups.push(p.url()));
      await logo().click({ modifiers: ["Control"] });
      await sleep(800);
      ok(!(await leaveShown(page)), `${tag}: L6 Ctrl+tık onay istemedi (yakalanmadı)`);
      ok(new URL(page.url()).pathname === clientPath && (await note().inputValue()) === `L taslak ${tag}`, `${tag}: L6 sayfa/taslak yerinde`);
      for (const p of ctx.pages()) if (p !== page) await p.close();

      // L7: aynı danışan sayfasına (?tab=) giden bağlantı yakalanmaz (veri kaybı yok)
      await page.evaluate((href) => { const a = document.createElement("a"); a.href = href; a.id = "zz-same"; a.textContent = "zz"; document.body.appendChild(a); }, `${clientPath}?tab=seanslar&zz=1`);
      await page.locator("#zz-same").click();
      await sleep(800);
      ok(!(await leaveShown(page)), `${tag}: L7 aynı danışan sayfası bağlantısı onay istemedi`);
      ok((await note().inputValue()) === `L taslak ${tag}`, `${tag}: L7 taslak yerinde`);

      // L3 (ŞART 1): bildirim zili — "Kal" → görüldü YOK; "Ayrıl" → görüldü TEK kez, panel kapanır, tek yönlendirme
      if (!mobile || true) {
        await openMenu();
        const bell = page.getByRole("button", { name: /^Bildirimler/ }).first();
        if (await bell.isVisible().catch(() => false)) {
          await bell.click();
          const item = page.getByTestId("notification-item").first();
          await item.waitFor({ timeout: 10_000 });
          await item.locator("a[href*='/dashboard/ajanda']").first().click();
          await page.getByText(LEAVE_MSG).waitFor({ timeout: 5_000 });
          ok(await page.getByTestId("notification-panel").isVisible(), `${tag}: L3 onay sırasında bildirim paneli AÇIK kaldı`);
          await page.getByRole("button", { name: "Sayfada kal" }).click();
          await sleep(400);
          ok(!(await seenKeys(page)).some((k) => k.startsWith(NOTIF_ID)), `${tag}: L3 "Kal" → bildirim görüldü SAYILMADI`);
          ok(new URL(page.url()).pathname === clientPath && (await note().inputValue()) === `L taslak ${tag}`, `${tag}: L3 "Kal" → sayfa/taslak yerinde`);
          const navs: string[] = [];
          page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname); });
          await item.locator("a[href*='/dashboard/ajanda']").first().click();
          await page.getByText(LEAVE_MSG).waitFor({ timeout: 5_000 });
          step = "L3-ayrıl"; const dBefore = dialogs.length;
          await page.getByRole("button", { name: "Kaydetmeden ayrıl" }).click();
          await page.waitForURL((u) => u.pathname === "/dashboard/ajanda", { timeout: 15_000 });
          await sleep(1200);
          ok(true, `${tag}: L3 "Ayrıl" → bildirim hedefine gidildi`);
          const seen = await seenKeys(page);
          ok(seen.filter((k) => k.startsWith(NOTIF_ID)).length === 1, `${tag}: L3 bildirim TEK kez görüldü`, seen);
          ok(navs.filter((p) => p === "/dashboard/ajanda").length <= 1 && !(await leaveShown(page)), `${tag}: L5 tek yönlendirme, döngü/ikinci onay yok`, navs);
          ok(!(await page.getByTestId("notification-panel").isVisible().catch(() => false)), `${tag}: L3 bildirim paneli kapandı`);
          ok(dialogs.length === dBefore, `${tag}: L5 istemci geçişinde ek tarayıcı uyarısı yok`, dialogs.slice(dBefore));
          step = "ajandadan-dönüş"; acceptDialogs = true;
          await page.goto(`${APP}${clientPath}?tab=seanslar`, { waitUntil: "load" }).catch(async () => { await sleep(1500); await page.goto(`${APP}${clientPath}?tab=seanslar`); });
          acceptDialogs = false; step = "L4";
          await startEdit(`L ilk not ${tag}`);
          await note().fill(`L taslak ${tag}`);
        } else {
          console.log(`  ℹ ${tag}: bildirim zili bu görünümde bulunamadı — L3 DOĞRULANMADI`);
        }
      }

      // L4: Numeroloji "Tam analiz" — onay; "Ayrıl" → aynı hedef (Numeroloji kodu değişmedi)
      await page.locator("#tab-genel").click();
      const numLink = page.getByRole("link", { name: /Tam Numeroloji Analizi/ });
      await numLink.waitFor({ timeout: 15_000 });
      const numHref = await numLink.getAttribute("href");
      await numLink.click();
      await page.getByText(LEAVE_MSG).waitFor({ timeout: 5_000 });
      ok(true, `${tag}: L4 taslak varken Numeroloji bağlantısı ONAY istedi`);
      await page.getByRole("button", { name: "Sayfada kal" }).click();
      await page.locator("#tab-seanslar").click();
      ok((await note().inputValue()) === `L taslak ${tag}`, `${tag}: L4 "Kal" → Seanslar taslağı yerinde (sekme geçişi eski davranış)`);
      await page.locator("#tab-genel").click();
      await numLink.click();
      await page.getByRole("button", { name: "Kaydetmeden ayrıl" }).click();
      await page.waitForURL((u) => u.pathname === "/numeroloji/analiz", { timeout: 15_000 });
      ok(page.url().endsWith(numHref ?? "§"), `${tag}: L4 "Ayrıl" → Numeroloji bağlantısının KENDİ hedefi açıldı`, { url: page.url(), numHref });
      // Sızıntı kontrolü: Numeroloji sayfasına yerleştikten sonra DY koruması kalmamalı (tam sayfa geçişte uyarı YOK).
      await sleep(2500);
      step = "numerolojiden-dönüş"; const dNum = dialogs.length;

      // L10 + L1(değişiklik yok): kaydedilince koruma kalkar; Numeroloji bağlantısı onaysız
      await page.goto(`${APP}${clientPath}?tab=seanslar`);
      ok(dialogs.length === dNum, `${tag}: L4 Numeroloji sayfasından ayrılırken DY uyarısı SIZMADI`, dialogs.slice(dNum));
      step = "L10";
      await startEdit(`L ilk not ${tag}`);
      await note().fill(`L kaydedilecek ${tag}`);
      await page.getByRole("button", { name: "Güncelle", exact: true }).click();
      await page.getByText("Seans güncellendi.").first().waitFor({ timeout: 10_000 });
      dialogs.length = 0;
      await page.locator("#tab-genel").click();
      await numLink.click();
      await page.waitForURL((u) => u.pathname === "/numeroloji/analiz", { timeout: 15_000 });
      ok(!(await leaveShown(page)) && dialogs.length === 0, `${tag}: L1 kayıttan sonra Numeroloji bağlantısı ONAYSIZ (bugünkü davranış)`);
      ok((await sessionRow(h, sid)).session_note === `L kaydedilecek ${tag}`, `${tag}: L kayıt doğru`);
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

// ─── Ödevler ──────────────────────────────────────────────────────────────────
async function seedHomework(h: H, title: string, extra: Record<string, string> = {}) {
  const base: Record<string, string> = { status: "devam", start_date: "2026-10-01", end_date: "2026-10-21", expert_note: "ilk uzman notu", ...extra };
  const cols = ["tenant_id", "client_id", "title", ...Object.keys(base)];
  const vals = [h.S.TA, h.S.clients.a1, title, ...Object.values(base)];
  return (await h.q1(`insert into client_homeworks(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals)).id as string;
}
const hwCard = (page: Page, text: string) => page.locator("div.overflow-hidden.rounded-2xl", { hasText: text }).last();
const hwRow = async (h: H, id: string) => h.q1(`select * from client_homeworks where id=$1`, [id]);
const HW_RE = /\/api\/clients\/[^/]+\/homeworks$/;
const isHwPatch = (r: { url(): string; request(): { method(): string } }) => HW_RE.test(new URL(r.url()).pathname) && r.request().method() === "PATCH";

/** Ödevler: çakışma (P1/P4), ŞART 3, 404, durum düğmeleri (eski handleConflict) — masaüstü + mobil. */
async function groupHomeworkP(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    console.log(`\n[Ödevler P — ${tag}]`);
    const { ctx, page, pageErrors } = await h.open(vp);
    const expert = () => page.getByPlaceholder("Senin iç notun...").last();
    const upd = () => page.getByRole("button", { name: "Güncelle", exact: true });
    const panel = page.getByTestId("record-conflict-panel");
    const refresh = () => page.getByRole("button", { name: "Listeyi Yenile" }).click();
    try {
      // HP1 + P4: farklı alanlar; tarih yardımcıları (gün sayısı/anchor) panelde YOK; bitiş tarihi doğru birleşir
      const h1 = await seedHomework(h, `HP1 ödev ${tag}`);
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=odevler`);
      await hwCard(page, `HP1 ödev ${tag}`).waitFor({ timeout: 90_000 });
      await hwCard(page, `HP1 ödev ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await expert().fill(`HP1 cihaz1 uzman notu ${tag}`);
      ok((await device2Patch(h, "client_homeworks", "homeworks", h1, { description: "HP1 cihaz2 açıklaması", end_date: "2026-10-25" }, "homeworkId", true)).status === 200, `${tag}: HP1 cihaz 2 kaydetti`);
      const v = Number((await hwRow(h, h1)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      ok((await expert().inputValue()) === `HP1 cihaz1 uzman notu ${tag}`, `${tag}: HP1 409 → taslak KORUNDU, form açık`);
      const fieldsShown = await page.locator("[data-testid^=conflict-field-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      ok(JSON.stringify(fieldsShown.sort()) === JSON.stringify(["conflict-field-description", "conflict-field-endDate", "conflict-field-expertNote"]), `${tag}: P4 yalnız farklı alanlar (gün sayısı/anchor YOK)`, fieldsShown);
      ok((await page.getByTestId("conflict-choice-endDate-current").getAttribute("aria-pressed")) === "true", `${tag}: HP1 varsayılan güncel`);
      ok(Number((await hwRow(h, h1)).row_version) === v, `${tag}: HP1 hiçbir şey yazılmadı`);
      await h.shot(page, `HP1-panel-${tag}`);
      await page.getByTestId("conflict-choice-expertNote-mine").click();
      const p = page.waitForResponse(isHwPatch, { timeout: 10_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p).status() === 200, `${tag}: HP1 seçimlerle kayıt 200`);
      await page.getByText("Ödev güncellendi.").first().waitFor({ timeout: 10_000 });
      const r1 = await hwRow(h, h1);
      ok(r1.expert_note === `HP1 cihaz1 uzman notu ${tag}` && r1.description === "HP1 cihaz2 açıklaması" && r1.end_date === "2026-10-25" && r1.start_date === "2026-10-01" && r1.status === "devam",
        `${tag}: HP1/P4 birleştirme doğru (benim notum + cihaz 2 açıklama + cihaz 2 bitiş tarihi)`, r1);
      ok(Number(r1.row_version) === v + 1, `${tag}: HP1 sürüm tam +1`);

      // ŞART 3 (Ödevler): hepsi güncel → PATCH YOK
      const h2 = await seedHomework(h, `HP2 ödev ${tag}`);
      await refresh();
      await hwCard(page, `HP2 ödev ${tag}`).waitFor({ timeout: 30_000 });
      await hwCard(page, `HP2 ödev ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await expert().fill(`HP2 cihaz1 ${tag}`);
      await device2Patch(h, "client_homeworks", "homeworks", h2, { client_feedback: "HP2 cihaz2 geri bildirim" }, "homeworkId", true);
      const v2 = Number((await hwRow(h, h2)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      const patches = countRequests(page, HW_RE, "PATCH");
      await page.getByTestId("conflict-save").click();
      await page.getByText("Seçimlerinizle güncel kayıt arasında fark kalmadı").first().waitFor({ timeout: 10_000 });
      await sleep(800);
      ok(patches.length === 0 && Number((await hwRow(h, h2)).row_version) === v2, `${tag}: HP2 fark yok → PATCH YOK, sürüm değişmedi`, patches.length);

      // HP3 (404): silinmiş → bildirim, taslak korunur, geri oluşmaz
      const h3 = await seedHomework(h, `HP3 ödev ${tag}`);
      await refresh();
      await hwCard(page, `HP3 ödev ${tag}`).waitFor({ timeout: 30_000 });
      await hwCard(page, `HP3 ödev ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await expert().fill(`HP3 taslak ${tag}`);
      ok((await h.api("DELETE", `/api/clients/${h.S.clients.a1}/homeworks`, { homeworkId: h3 })).status === 200, `${tag}: HP3 cihaz 2 sildi`);
      await upd().click();
      await page.getByTestId("record-deleted-notice").waitFor({ timeout: 10_000 });
      ok((await expert().inputValue()) === `HP3 taslak ${tag}` && await upd().isDisabled(), `${tag}: HP3 taslak korundu, Güncelle pasif`);
      ok(!(await h.q1(`select id from client_homeworks where id=$1`, [h3])), `${tag}: HP3 silinen ödev GERİ OLUŞTURULMADI`);
      await page.getByTestId("deleted-close").click();

      // Eski davranış: durum düğmeleri + onların eski çakışma davranışı (handleConflict DEĞİŞMEDİ)
      const h4 = await seedHomework(h, `HP4 ödev ${tag}`);
      await refresh();
      await hwCard(page, `HP4 ödev ${tag}`).waitFor({ timeout: 30_000 });
      await hwCard(page, `HP4 ödev ${tag}`).getByRole("button", { name: "Tamamlandı" }).click();
      await page.getByText("Durum güncellendi.").first().waitFor({ timeout: 10_000 });
      ok((await hwRow(h, h4)).status === "tamamlandi", `${tag}: durum düğmesi çalıştı (eski davranış)`);
      const h5 = await seedHomework(h, `HP5 ödev ${tag}`);
      await refresh();
      await hwCard(page, `HP5 ödev ${tag}`).waitFor({ timeout: 30_000 });
      await device2Patch(h, "client_homeworks", "homeworks", h5, { expert_note: "HP5 cihaz2" }, "homeworkId", true);
      await hwCard(page, `HP5 ödev ${tag}`).getByRole("button", { name: "Tamamlandı" }).click();
      await page.getByText(/başka bir sekmede veya cihazda değiştirildi/).first().waitFor({ timeout: 10_000 });
      const r5 = await hwRow(h, h5);
      ok(r5.status === "devam" && r5.expert_note === "HP5 cihaz2", `${tag}: bayat durum düğmesi → eski çakışma uyarısı, cihaz 2 ezilmedi (handleConflict aynı)`);
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

/** ŞART 4 — Seanslar + Ödevler aynı anda düzenlenirken tek uyarı; Kal iki taslağı korur; biri kaydedilince koruma sürer. */
async function groupMultiTab(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    const mobile = vp.width < 700;
    console.log(`\n[ŞART 4 çoklu sekme — ${tag}]`);
    const sid = await seedSession(h, `MT seans ${tag}`);
    const hid = await seedHomework(h, `MT ödev ${tag}`);
    const { ctx, page, pageErrors } = await openGuardedPage(h, vp, "seanslar");
    const note = () => page.getByPlaceholder("Seans genel notu...").last();
    const expert = () => page.getByPlaceholder("Senin iç notun...").last();
    const openMenu = async () => { if (mobile) { await page.getByTestId("quick-nav-open").click(); await sleep(400); } };
    const logo = () => page.locator("[data-testid=side-menu] a[href]").first();
    const closeMenu = async () => { if (mobile) { await page.keyboard.press("Escape"); await sleep(400); } };
    const clientPath = `/dashboard/clients/${h.S.clients.a1}`;
    try {
      await sessionCard(page, `MT seans ${tag}`).waitFor({ timeout: 90_000 });
      await sessionCard(page, `MT seans ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await note().fill(`MT seans taslağı ${tag}`);
      await page.locator("#tab-odevler").click();
      await hwCard(page, `MT ödev ${tag}`).waitFor({ timeout: 30_000 });
      await hwCard(page, `MT ödev ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await expert().fill(`MT ödev taslağı ${tag}`);
      await page.locator("#tab-seanslar").click();
      ok((await note().inputValue()) === `MT seans taslağı ${tag}`, `${tag}: sekme geçişinde Seanslar taslağı korundu (eski davranış)`);

      await openMenu();
      await logo().click();
      await page.getByText(LEAVE_MSG).first().waitFor({ timeout: 5_000 });
      await sleep(300);
      ok((await page.getByText(LEAVE_MSG).count()) === 1, `${tag}: iki sekmede değişiklik varken TEK onay penceresi`);
      await page.getByRole("button", { name: "Sayfada kal" }).click();
      await closeMenu();
      await sleep(300);
      ok((await note().inputValue()) === `MT seans taslağı ${tag}`, `${tag}: "Kal" → Seanslar taslağı korundu`);
      await page.locator("#tab-odevler").click();
      ok((await expert().inputValue()) === `MT ödev taslağı ${tag}`, `${tag}: "Kal" → Ödevler taslağı korundu`);

      // Seans kaydedilir → Ödevler hâlâ korumalı
      await page.locator("#tab-seanslar").click();
      await page.getByRole("button", { name: "Güncelle", exact: true }).click();
      await page.getByText("Seans güncellendi.").first().waitFor({ timeout: 10_000 });
      await openMenu();
      await logo().click();
      await page.getByText(LEAVE_MSG).first().waitFor({ timeout: 5_000 });
      ok(true, `${tag}: Seans kaydedildi → Ödevler koruması SÜRÜYOR`);
      await page.getByRole("button", { name: "Sayfada kal" }).click();
      await closeMenu();

      // Ödev de kaydedilir → koruma kalkar
      await page.locator("#tab-odevler").click();
      await page.getByRole("button", { name: "Güncelle", exact: true }).click();
      await page.getByText("Ödev güncellendi.").first().waitFor({ timeout: 10_000 });
      await openMenu();
      await logo().click();
      await page.waitForURL((u) => u.pathname !== clientPath, { timeout: 15_000 });
      ok(!(await page.getByText(LEAVE_MSG).isVisible().catch(() => false)), `${tag}: ikisi de kaydedilince uyarı KALKTI`);
      ok((await sessionRow(h, sid)).session_note === `MT seans taslağı ${tag}` && (await hwRow(h, hid)).expert_note === `MT ödev taslağı ${tag}`, `${tag}: iki kayıt da doğru kaydedildi`);
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

// ─── Taşlar ───────────────────────────────────────────────────────────────────
const stRow = async (h: H, id: string) => h.q1(`select * from client_stones where id=$1`, [id]);
const ST_RE = /\/api\/clients\/[^/]+\/stones$/;
const isStPatch = (r: { url(): string; request(): { method(): string } }) => ST_RE.test(new URL(r.url()).pathname) && r.request().method() === "PATCH";
async function seedStone(h: H, name: string, extra: Record<string, string> = {}) {
  const base: Record<string, string> = { stone_type: "Kolye", note: "ilk taş notu", usage_area: "ilk kullanım", stone_date: "2026-10-10", ...extra };
  const cols = ["tenant_id", "client_id", "stone_name", ...Object.keys(base)];
  const vals = [h.S.TA, h.S.clients.a1, name, ...Object.values(base)];
  return (await h.q1(`insert into client_stones(${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`, vals)).id as string;
}
const stCard = (page: Page, text: string) => page.locator("div.grid.gap-2 > div", { hasText: text }).first();

/** Taşlar: P5 (8 alan), fotoğraf korunur, ŞART 3, 404, Doğaltaş uyarı penceresi (normal + birleşik kayıt), çıkış onayı. */
async function groupStonesP(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    const mobile = vp.width < 700;
    console.log(`\n[Taşlar P — ${tag}]`);
    let warn = false;
    const o = await h.open(vp);
    const { ctx, page, pageErrors } = o;
    await page.route("**/api/dogaltas/stone-warnings", (r) => r.fulfill({ status: 200, json: { ok: true, warnings: warn ? [{ stoneId: "zz", stoneName: "ZZ Uyarılı", warningText: "ZZ test uyarısı", warningTags: ["zz"] }] : [] } }));
    await page.route("**/api/appointments/notifications", (r) => r.fulfill({ status: 200, json: { ok: true, items: [] } }));
    const noteBox = () => page.getByPlaceholder(/Taşla ilgili genel öneri/).last();
    const usageBox = () => page.getByPlaceholder(/Nasıl kullanılacak\?/).last();
    const upd = () => page.getByRole("button", { name: "Güncelle", exact: true });
    const panel = page.getByTestId("record-conflict-panel");
    const refresh = () => page.getByRole("button", { name: /^(Listeyi Yenile|Yenile)$/ }).first().click();
    try {
      // P5: 8 alan doğru eşleşir; yalnız farklılar; fotoğraf satırı etkilenmez
      const s1 = await seedStone(h, `TP1 Ametist ${tag}`);
      await h.q1(`insert into client_stone_photos(tenant_id, client_id, stone_id, file_path) values ($1,$2,$3,$4) returning id`, [h.S.TA, h.S.clients.a1, s1, `zz/${s1}/foto.jpg`]);
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=taslar`);
      await stCard(page, `TP1 Ametist ${tag}`).waitFor({ timeout: 90_000 });
      await stCard(page, `TP1 Ametist ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await noteBox().fill(`TP1 cihaz1 notu ${tag}`);
      ok((await device2Patch(h, "client_stones", "stones", s1, { stone_name: `TP1 Ametist ${tag}`, usage_area: "TP1 cihaz2 kullanım", warning_text: "TP1 cihaz2 uyarı" })).status === 200, `${tag}: TP1 cihaz 2 kaydetti`);
      const v = Number((await stRow(h, s1)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      const shown = await page.locator("[data-testid^=conflict-field-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      ok(JSON.stringify(shown.sort()) === JSON.stringify(["conflict-field-note", "conflict-field-usageArea", "conflict-field-warningText"]), `${tag}: P5 yalnız 3 farklı alan (8 alandan)`, shown);
      ok((await noteBox().inputValue()) === `TP1 cihaz1 notu ${tag}` && Number((await stRow(h, s1)).row_version) === v, `${tag}: P5 taslak korundu, hiçbir şey yazılmadı`);
      await h.shot(page, `TP1-panel-${tag}`);
      await page.getByTestId("conflict-choice-note-mine").click();
      const p = page.waitForResponse(isStPatch, { timeout: 10_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p).status() === 200, `${tag}: P5 seçimlerle kayıt 200`);
      await page.getByText("Taş kaydı güncellendi.").first().waitFor({ timeout: 10_000 });
      const r1 = await stRow(h, s1);
      ok(r1.note === `TP1 cihaz1 notu ${tag}` && r1.usage_area === "TP1 cihaz2 kullanım" && r1.warning_text === "TP1 cihaz2 uyarı"
        && r1.stone_type === "Kolye" && r1.stone_date === "2026-10-10" && r1.stone_name === `TP1 Ametist ${tag}`, `${tag}: P5 8 alan doğru birleşti`, r1);
      ok(Number(r1.row_version) === v + 1, `${tag}: P5 sürüm tam +1`);
      ok(Number((await h.q1(`select count(*)::int c from client_stone_photos where stone_id=$1`, [s1])).c) === 1, `${tag}: P5 taş fotoğraf kaydı KORUNDU`);

      // ŞART 3 (Taşlar)
      const s2 = await seedStone(h, `TP2 Pirit ${tag}`);
      await refresh();
      await stCard(page, `TP2 Pirit ${tag}`).waitFor({ timeout: 30_000 });
      await stCard(page, `TP2 Pirit ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await noteBox().fill(`TP2 cihaz1 ${tag}`);
      await device2Patch(h, "client_stones", "stones", s2, { stone_name: `TP2 Pirit ${tag}`, other_notes: "TP2 cihaz2 diğer" });
      const v2 = Number((await stRow(h, s2)).row_version);
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      const patches = countRequests(page, ST_RE, "PATCH");
      await page.getByTestId("conflict-save").click();
      await page.getByText("Seçimlerinizle güncel kayıt arasında fark kalmadı").first().waitFor({ timeout: 10_000 });
      await sleep(800);
      ok(patches.length === 0 && Number((await stRow(h, s2)).row_version) === v2, `${tag}: ŞART 3 Taşlar → PATCH YOK, sürüm değişmedi`, patches.length);

      // Birleşik kayıtta Doğaltaş uyarı penceresi (mevcut akış) çıkar; "Yine de Kaydet" → kaydedilir
      const s3 = await seedStone(h, `TP3 Kuvars ${tag}`);
      await refresh();
      await stCard(page, `TP3 Kuvars ${tag}`).waitFor({ timeout: 30_000 });
      await stCard(page, `TP3 Kuvars ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await usageBox().fill(`TP3 cihaz1 kullanım ${tag}`);
      await device2Patch(h, "client_stones", "stones", s3, { stone_name: `TP3 Kuvars ${tag}`, note: "TP3 cihaz2 not" });
      await upd().click();
      await panel.waitFor({ timeout: 10_000 });
      await page.getByTestId("conflict-choice-usageArea-mine").click();
      warn = true;
      await page.getByTestId("conflict-save").click();
      await page.getByText("Önerilen taşlarda kayıtlı uyarılar var").waitFor({ timeout: 10_000 });
      ok(true, `${tag}: birleşik kayıtta Doğaltaş uyarı penceresi çıktı (mevcut akış)`);
      const p3 = page.waitForResponse(isStPatch, { timeout: 10_000 });
      await page.getByRole("button", { name: "Yine de Kaydet" }).click();
      ok((await p3).status() === 200, `${tag}: "Yine de Kaydet" → 200`);
      warn = false;
      const r3 = await stRow(h, s3);
      ok(r3.usage_area === `TP3 cihaz1 kullanım ${tag}` && r3.note === "TP3 cihaz2 not", `${tag}: uyarı sonrası birleşik kayıt doğru`, r3);

      // Eski davranış: normal güncellemede uyarı penceresi + İptal → hiçbir şey yazılmaz, form açık
      const s4 = await seedStone(h, `TP4 Opal ${tag}`);
      await refresh();
      await stCard(page, `TP4 Opal ${tag}`).waitFor({ timeout: 30_000 });
      await stCard(page, `TP4 Opal ${tag}`).getByRole("button", { name: "Düzenle" }).click();
      await noteBox().fill(`TP4 not ${tag}`);
      warn = true;
      await upd().click();
      await page.getByText("Önerilen taşlarda kayıtlı uyarılar var").waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: "İptal", exact: true }).last().click();
      warn = false;
      await sleep(500);
      ok((await stRow(h, s4)).note === "ilk taş notu" && (await noteBox().inputValue()) === `TP4 not ${tag}`, `${tag}: uyarı → İptal: kayıt yok, taslak duruyor (eski davranış)`);

      // Çıkış koruması Taşlar sekmesinde de çalışır
      if (mobile) { await page.getByTestId("quick-nav-open").click(); await sleep(400); }
      await page.locator("[data-testid=side-menu] a[href]").first().click();
      await page.getByText(LEAVE_MSG).waitFor({ timeout: 5_000 });
      ok(true, `${tag}: Taşlar taslağıyla menüden ayrılma ONAY istedi`);
      await page.getByRole("button", { name: "Sayfada kal" }).click();
      if (mobile) { await page.keyboard.press("Escape"); await sleep(400); }

      // 404
      ok((await h.api("DELETE", `/api/clients/${h.S.clients.a1}/stones?id=${s4}`)).status === 200, `${tag}: TP4 cihaz 2 sildi`);
      await upd().click();
      await page.getByTestId("record-deleted-notice").waitFor({ timeout: 10_000 });
      ok((await noteBox().inputValue()) === `TP4 not ${tag}` && await upd().isDisabled(), `${tag}: 404 → taslak korundu, Güncelle pasif`);
      ok(!(await h.q1(`select id from client_stones where id=$1`, [s4])), `${tag}: silinen taş GERİ OLUŞTURULMADI`);
      await page.getByTestId("deleted-close").click();
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

// ─── Analizler çakışma (P6–P8) ───────────────────────────────────────────────
const anRow = async (h: H, id: string) => h.q1(`select * from client_analyses where id=$1`, [id]);
async function device2Analysis(h: H, id: string, mutate: (cur: { analysis_type: string; analysis_data: { title?: string; values?: Record<string, unknown> }; note: string }) => Record<string, unknown>) {
  const cur = await anRow(h, id);
  const body = { id, row_version: Number(cur.row_version), ...mutate(cur as never) };
  return h.api("PATCH", `/api/clients/${h.S.clients.a1}/analyses`, body);
}
const CH = (mark = "", male = "", female = "") => ({ mark, male, female });

/** Analizler: P6 çakra (anahtar eşleşmesi, jsonb sırası, eksik satır), P7 gezegen, P8 tür uyuşmazlığı, ŞART 3, 404, Word. */
async function groupAnalysesP(h: H) {
  for (const vp of VIEWPORTS) {
    const tag = vp.name;
    console.log(`\n[Analizler P — ${tag}]`);
    const { ctx, page, pageErrors } = await h.open(vp);
    // Görsel yükleme bu grupta ilgisiz → test-yalnız 200 (sunucu görsel yazımı T2/T3'te ayrıca doğrulandı).
    await page.route("**/api/clients/*/analyses/upload-image", (r) => r.fulfill({ status: 200, json: { ok: true } }));
    const noteBox = () => page.getByPlaceholder(/Analiz yorumu, seans gözlemi/);
    const panel = page.getByTestId("record-conflict-panel");
    const reload = async (rowNote: string) => { await page.getByRole("button", { name: /^(Yenile|Yükleniyor\.\.\.)$/ }).click(); await analysisRow(page, rowNote).waitFor({ timeout: 30_000 }); };
    try {
      // P6: çakra — jsonb'den gelen kayıtta yalnız GERÇEK farklar; satırlar anahtarla eşleşir; image_url korunur
      const full = { before_energy_ruhsal: CH("+10", "a", "b"), before_chakra_tac: CH("+5"), before_chakra_kalp: CH("-20", "x", "y"), after_chakra_kok: CH("+30") };
      const a1 = await seedAnalysis(h, `AP1 ${tag}`, "chakra", full);
      await h.q1(`update client_analyses set image_url='zz/ap1.png' where id=$1 returning id`, [a1]);
      await page.goto(`${APP}/dashboard/clients/${h.S.clients.a1}?tab=analizler`);
      await analysisRow(page, `AP1 ${tag}`).waitFor({ timeout: 90_000 });
      await openAnalysis(page, `AP1 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await noteBox().fill(`AP1 cihaz1 notu ${tag}`);
      await page.getByPlaceholder("+10 / -20").first().fill("+99");
      ok((await device2Analysis(h, a1, (c) => ({ analysis_type: "chakra", note: c.note, analysis_data: { ...c.analysis_data, values: { ...c.analysis_data.values, before_chakra_tac: CH("+77", "d2", "") } } }))).status === 200, `${tag}: P6 cihaz 2 kaydetti`);
      const v = Number((await anRow(h, a1)).row_version);
      await page.getByTestId("analysis-save-close").click();
      await panel.waitFor({ timeout: 15_000 });
      ok(await page.locator("button.no-pdf[aria-label=\"Kapat\"]").isVisible() && (await noteBox().inputValue()) === `AP1 cihaz1 notu ${tag}`, `${tag}: P6 409 → pencere AÇIK, taslak korundu`);
      const shown = await page.locator("[data-testid^=conflict-field-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      ok(JSON.stringify(shown.sort()) === JSON.stringify(["conflict-field-note", "conflict-field-v:before_chakra_tac", "conflict-field-v:before_energy_ruhsal"]),
        `${tag}: P6 yalnız 3 gerçek fark (jsonb sırası yanlış fark üretmedi)`, shown);
      ok(Number((await anRow(h, a1)).row_version) === v, `${tag}: P6 hiçbir şey yazılmadı`);
      await h.shot(page, `AP1-panel-${tag}`);
      await page.getByTestId("conflict-choice-note-mine").click();
      await page.getByTestId("conflict-choice-v:before_energy_ruhsal-mine").click();
      const p1 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("conflict-save").click();
      ok((await p1).status() === 200, `${tag}: P6 seçimlerle kayıt 200`);
      const r1 = await anRow(h, a1);
      const vals = (r1.analysis_data as { values: Record<string, { mark: string; male: string; female: string }> }).values;
      ok(r1.note === `AP1 cihaz1 notu ${tag}` && vals.before_energy_ruhsal?.mark === "+99" && vals.before_energy_ruhsal?.male === "a"
        && vals.before_chakra_tac?.mark === "+77" && vals.before_chakra_tac?.male === "d2"
        && vals.before_chakra_kalp?.mark === "-20" && vals.before_chakra_kalp?.female === "y" && vals.after_chakra_kok?.mark === "+30",
        `${tag}: P6 satırlar ANAHTARLA doğru birleşti, diğer satırlar aynen`, vals);
      ok(r1.image_url === "zz/ap1.png", `${tag}: P6 önceki görsel yolu PATCH ile DEĞİŞMEDİ`);
      ok(Number(r1.row_version) === v + 1, `${tag}: P6 sürüm tam +1`);

      // P6b: eksik satırlı eski kayıt → silme yok
      const a2 = await seedAnalysis(h, `AP2 ${tag}`, "chakra", { before_chakra_tac: CH("+1"), before_chakra_goz: CH("+2") });
      await reload(`AP2 ${tag}`);
      await openAnalysis(page, `AP2 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await noteBox().fill(`AP2 cihaz1 ${tag}`);
      await device2Analysis(h, a2, (c) => ({ analysis_type: "chakra", note: c.note, analysis_data: { ...c.analysis_data, values: { ...c.analysis_data.values, after_chakra_kok: CH("+9") } } }));
      await page.getByTestId("analysis-save-close").click();
      await panel.waitFor({ timeout: 15_000 });
      await page.getByTestId("conflict-choice-note-mine").click();
      const pSave = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("conflict-save").click();
      ok((await pSave).status() === 200, `${tag}: birleşik kayıt 200`);
      await sleep(300);
      const v2 = ((await anRow(h, a2)).analysis_data as { values: Record<string, { mark: string }> }).values;
      ok(v2.before_chakra_tac?.mark === "+1" && v2.before_chakra_goz?.mark === "+2" && v2.after_chakra_kok?.mark === "+9" && (await anRow(h, a2)).note === `AP2 cihaz1 ${tag}`,
        `${tag}: P6b eksik satırlı kayıtta hiçbir satır SİLİNMEDİ, yeni satır korundu`, v2);

      // P7: gezegen — alan bazında
      const a3 = await seedAnalysis(h, `AP3 ${tag}`, "planet", { "before_tac_GÜNEŞ": "+10", "before_kalp_AY": "-5" });
      await reload(`AP3 ${tag}`);
      await openAnalysis(page, `AP3 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await page.getByPlaceholder("+30 / -20").first().fill("+55");
      await device2Analysis(h, a3, (c) => ({ analysis_type: "planet", note: c.note, analysis_data: { ...c.analysis_data, values: { ...c.analysis_data.values, "before_kalp_AY": "-50" } } }));
      await page.getByTestId("analysis-save-close").click();
      await panel.waitFor({ timeout: 15_000 });
      const shown3 = await page.locator("[data-testid^=conflict-field-]").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
      ok(shown3.length === 2 && shown3.includes("conflict-field-v:before_kalp_AY"), `${tag}: P7 gezegen alanları ayrı ayrı (2 fark)`, shown3);
      const mineKey = shown3.find((s) => s !== "conflict-field-v:before_kalp_AY")!.replace("conflict-field-", "");
      await page.getByTestId(`conflict-choice-${mineKey}-mine`).click();
      const pSave2 = page.waitForResponse(isAnalysisPatch, { timeout: 15_000 });
      await page.getByTestId("conflict-save").click();
      ok((await pSave2).status() === 200, `${tag}: birleşik kayıt 200`);
      await sleep(300);
      const v3 = ((await anRow(h, a3)).analysis_data as { values: Record<string, string> }).values;
      ok(v3[mineKey.slice(2)] === "+55" && v3["before_kalp_AY"] === "-50" && v3["before_tac_GÜNEŞ"] !== undefined, `${tag}: P7 gezegen alanları doğru eşleşti`, { mineKey, v3: Object.fromEntries(Object.entries(v3).filter(([, x]) => x)) });

      // P8: analiz türü uyuşmazlığı → birleştirme YOK
      const a4 = await seedAnalysis(h, `AP4 ${tag}`, "chakra", { before_chakra_tac: CH("+1") });
      await reload(`AP4 ${tag}`);
      await openAnalysis(page, `AP4 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await noteBox().fill(`AP4 cihaz1 ${tag}`);
      await device2Analysis(h, a4, (c) => ({ analysis_type: "planet", note: c.note, analysis_data: { title: "Çakra-Gezegen Analizi", values: { "before_tac_GÜNEŞ": "+1" } } }));
      await page.getByTestId("analysis-save-close").click();
      await page.getByText(/farklı türde bir analiz/).waitFor({ timeout: 15_000 });
      ok((await page.getByTestId("conflict-save").count()) === 0 && await page.getByTestId("analysis-save-close").isDisabled(), `${tag}: P8 tür uyuşmazlığında birleştirme/kaydet YOK`);
      ok((await anRow(h, a4)).analysis_type === "planet", `${tag}: P8 cihaz 2 kaydı ezilmedi`);
      await page.getByTestId("deleted-close").click();
      await sleep(400);

      // ŞART 3 (Analizler)
      const a5 = await seedAnalysis(h, `AP5 ${tag}`, "chakra", { before_chakra_tac: CH("+1") });
      await reload(`AP5 ${tag}`);
      await openAnalysis(page, `AP5 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await noteBox().fill(`AP5 cihaz1 ${tag}`);
      await device2Analysis(h, a5, (c) => ({ analysis_type: "chakra", note: c.note, analysis_data: { ...c.analysis_data, values: { ...c.analysis_data.values, before_chakra_kok: CH("+3") } } }));
      const v5 = () => anRow(h, a5).then((r) => Number(r.row_version));
      await page.getByTestId("analysis-save-close").click();
      await panel.waitFor({ timeout: 15_000 });
      const before5 = await v5();
      const patches = countRequests(page, /\/api\/clients\/[^/]+\/analyses$/, "PATCH");
      await page.getByTestId("conflict-save").click();
      await page.getByText("Seçimlerinizle güncel kayıt arasında fark kalmadı").first().waitFor({ timeout: 10_000 });
      await sleep(800);
      ok(patches.length === 0 && (await v5()) === before5, `${tag}: ŞART 3 Analizler → PATCH YOK, sürüm değişmedi`, patches.length);

      // 404 + yenileme uyarısı (pencere açıkken)
      const a6 = await seedAnalysis(h, `AP6 ${tag}`, "chakra");
      await reload(`AP6 ${tag}`);
      await openAnalysis(page, `AP6 ${tag}`);
      await page.getByTestId("analysis-edit").click();
      await noteBox().fill(`AP6 taslak ${tag}`);
      const dialogs: string[] = [];
      const onDialog = (d: { type(): string; dismiss(): Promise<void> }) => { dialogs.push(d.type()); void d.dismiss().catch(() => undefined); };
      page.on("dialog", onDialog);
      await page.reload({ timeout: 4000 }).catch(() => undefined);
      await sleep(400);
      page.off("dialog", onDialog);
      ok(dialogs.includes("beforeunload") && (await noteBox().inputValue()) === `AP6 taslak ${tag}`, `${tag}: Analiz taslağında yenileme uyarısı çıktı, taslak duruyor`, dialogs);
      ok((await h.api("DELETE", `/api/clients/${h.S.clients.a1}/analyses`, { analysisId: a6 })).status === 200, `${tag}: AP6 cihaz 2 sildi`);
      await page.getByTestId("analysis-save-close").click();
      await page.getByTestId("record-deleted-notice").waitFor({ timeout: 15_000 });
      ok((await noteBox().inputValue()) === `AP6 taslak ${tag}` && await page.getByTestId("analysis-save-close").isDisabled(), `${tag}: 404 → taslak korundu, Kaydet pasif`);
      ok(!(await h.q1(`select id from client_analyses where id=$1`, [a6])), `${tag}: silinen analiz GERİ OLUŞTURULMADI`);
      await page.getByTestId("deleted-close").click();
      await sleep(400);

      // Eski davranış: kayıtlı analiz salt okunur açılır + Word çıktısı
      await reload(`AP1 cihaz1 notu ${tag}`);
      await openAnalysis(page, `AP1 cihaz1 notu ${tag}`);
      ok(await page.getByTestId("analysis-fields").locator("input").first().isDisabled(), `${tag}: kayıtlı analiz SALT OKUNUR açıldı (eski davranış)`);
      const dl = page.waitForEvent("download", { timeout: 30_000 }).catch(() => null);
      await page.getByRole("button", { name: "Word Al" }).click();
      const d = await dl;
      if (d) ok(/\.docx$/i.test(d.suggestedFilename()), `${tag}: Word çıktısı indirildi (${d.suggestedFilename()})`);
      else console.log(`  ℹ ${tag}: Word indirmesi bu yerel ortamda tetiklenmedi — DOĞRULANMADI (bildirim: ${(await toastText(page)).slice(0, 160)})`);
      await page.locator("button.no-pdf[aria-label=\"Kapat\"]").click();
      ok(pageErrors.length === 0, `${tag}: sayfa JS hatası yok`, pageErrors.slice(0, 3));
    } finally {
      await ctx.close();
    }
  }
}

const GROUPS: Record<string, (h: H) => Promise<void>> = {
  AP: groupAnalysesP,
  TP: groupStonesP,
  HP: groupHomeworkP,
  MT: groupMultiTab,
  T1: groupT1,
  T2T3: groupT2T3,
  T4: groupT4,
  T5: groupT5,
  SP: groupSessionsP,
  SL: groupSessionsL,
};

// ─── Çalıştırıcı ─────────────────────────────────────────────────────────────

async function main() {
  const { startAnamnezTestEnv, seedAnamnez, SERVICE_KEY } = await import("../anamnez/testEnv");
  const env = await startAnamnezTestEnv({
    port: 54681, dirName: "h05-ui-pgdata", httpPort: 54331,
    rpcAllow: ["client_notes_cas_update_v2"],
    extraSql: [SUB_DDL, mig("20271120000000_dy_subrecord_row_version.sql"), mig("20271120000100_client_notes_cas_update_v2.sql"),
      `grant select, insert, update, delete on public.client_sessions, public.client_stones, public.client_homeworks, public.client_analyses, public.client_stone_photos to service_role;`],
  });
  const S = await seedAnamnez(env.su);
  const q1 = async (sql: string, a: unknown[] = []) => (await env.su.query(sql, a)).rows[0] as Record<string, unknown>;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3989", "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const b = browser;
    const user = { id: S.users.A.id, tenant_id: S.TA, full_name: "ZZ_A", email: "zz.a@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true }, is_demo_account: false };
    const h: H = {
      env, S, q1,
      api: async (method, p, body) => {
        const r = await fetch(`${APP}${p}`, {
          method, headers: { "content-type": "application/json", "x-user-id": S.users.A2.id, "x-session-token": S.users.A2.token },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
      },
      open: async (vp) => {
        const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "tr-TR" });
        await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
        await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP });
        await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), S.users.A.token]);
        // 127.0.0.1 dışı her istek kesilir (dış ağ / production'a sızma yok).
        await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "127.0.0.1" ? r.fallback() : r.abort()));
        const page = await ctx.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", (e) => pageErrors.push(e.message));
        return { ctx, page, pageErrors };
      },
      shot: async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).catch(() => undefined); },
    };
    for (const [name, fn] of Object.entries(GROUPS)) {
      if (ONLY && !ONLY.has(name)) continue;
      try { await fn(h); } catch (e) { ok(false, `${name} grubu çöktü: ${String(e).slice(0, 200)}`); }
    }
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { process.kill(app.pid); } catch { /* kapalı */ } }
    await env.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nH-05 UI E2E: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
