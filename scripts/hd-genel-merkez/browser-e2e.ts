/**
 * HD Bilgi Bankası — 9 "Genel — {merkez}" başlığı GERÇEK TARAYICI testi (yerel `next start` + yerel
 * gömülü PostgreSQL; PRODUCTION'A SIFIR TEMAS; gerçek Roxy anahtarı YOK — sahte Roxy, ücretli çağrı 0).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54627 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build --webpack
 * Çalıştır: npx tsx scripts/hd-genel-merkez/browser-e2e.ts [--out <klasör>]
 *
 * Kapsam (375 px · 390 px · masaüstü):
 *   • Yeni Kayıt Ekle → Merkezler: 36 başlık, 9 Genel (merkez başına ilk), 27 mevcut aynen.
 *   • 9/9 genel kayıt ARAYÜZDEN oluşturulur → tam sayfa editörde içerik + aktif/taslak kaydedilir →
 *     yeniden açılır → düzenlenir → yeniden açılır.
 *   • Aktif genel kayıtlar: harita eşleşmesi (/api/hd/knowledge?codes=, açıkça istense bile),
 *     Word "eşleşen açıklama" sayısı ve indirilen DOCX'te YOK; kesin merkez kayıtları VAR.
 *   • Kullanıcılar arası izolasyon; mevcut kayıtlar değişmez; yatay kaydırma yok; harici istek yok.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, TB, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-genel-merkez-browser");
const PORT = 3993;
const APP = `http://127.0.0.1:${PORT}`;
const SHIM_PORT = Number(process.env.HD_E2E_SHIM_PORT ?? 54627);
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}

type Device = { name: string; viewport: { width: number; height: number }; mobile: boolean; ua?: string };
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DEVICES: Device[] = [
  { name: "375px", viewport: { width: 375, height: 812 }, mobile: true, ua: IPHONE_UA },
  { name: "390px", viewport: { width: 390, height: 844 }, mobile: true, ua: IPHONE_UA },
  { name: "masaüstü", viewport: { width: 1366, height: 900 }, mobile: false },
];

const CENTERS: Array<[string, string]> = [
  ["head", "Baş Merkezi (Head)"],
  ["ajna", "Ajna Merkezi (Ajna)"],
  ["throat", "Boğaz Merkezi (Throat)"],
  ["g_identity", "G / Kimlik Merkezi (G Center)"],
  ["heart_ego", "Kalp / Ego Merkezi (Heart)"],
  ["solar_plexus", "Solar Pleksus Merkezi (Solar Plexus)"],
  ["sacral", "Sakral Merkez (Sacral)"],
  ["spleen", "Dalak Merkezi (Spleen)"],
  ["root", "Kök Merkezi (Root)"],
];
const GENERAL_NOTE = "Bu kayıt genel bilgi ve eğitim notları içindir. Danışan haritasıyla otomatik eşleşmez ve otomatik raporlara dahil edilmez.";
const GENERAL_CONTENT_HELP = "Bu merkez hakkında eğitimlerinizden, kitaplarınızdan ve kendi çalışmalarınızdan edindiğiniz bilgileri yazabilirsiniz.";
const CENTER_CONTENT_HELP = "Bu merkez hakkında eğitimlerinizden, kitaplarınızdan ve kendi çalışmalarınızdan edindiğiniz bilgileri yazabilirsiniz. Bu bilgiler yalnızca siz Word raporuna eklemeyi seçerseniz raporda yer alır.";
const HEADER_TEXT = "Tip, otorite, profil, tanım, merkez, kanal, kapı ve strateji yorumlarınızı yönetin. Kaydettiğiniz kayıtlar Rapor Oluştur ekranında danışan haritasıyla otomatik eşleşir; Genel merkez kayıtları bu eşleşmeye ve otomatik raporlara dahil edilmez.";
const EXPECTED_LABELS = CENTERS.flatMap(([, l]) => [`Genel — ${l}`, `Tanımlı — ${l}`, `Tanımsız — ${l}`, `Açık — ${l}`]);

async function newPage(browser: Browser, user: Json, token: string, d: Device): Promise<{ ctx: BrowserContext; page: Page; errors: string[]; external: string[] }> {
  const ctx = await browser.newContext({
    viewport: d.viewport, isMobile: d.mobile, hasTouch: d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true,
    ...(d.ua ? { userAgent: d.ua } : {}),
  });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
  await ctx.addInitScript(([u, tok]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", tok as string);
  }, [JSON.stringify(user), token]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  const external: string[] = [];
  page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
  page.on("request", (r) => { const u = r.url(); if (!/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|about:)/.test(u)) external.push(u); });
  return { ctx, page, errors, external };
}
const noHScroll = (page: Page, width: number) => page.evaluate((wd) => document.documentElement.scrollWidth <= wd + 1, width);
const docxText = async (p: string) => (await (await JSZip.loadAsync(readFileSync(p))).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");

const userJson = (U: Auth, tenant: string, label: string): Json => ({
  id: U.id, tenant_id: tenant, full_name: `ZZ_HDFLOW_${label}`, email: `zz.hdflow.${label.toLowerCase()}@example.test`, role: "expert", active: true,
  approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
  module_permissions: { human_design: true, clients: true, hd_system_reading: true },
});

async function openCreateForm(page: Page) {
  await page.goto(`${APP}/human-design/bilgi-bankasi`);
  const tab = page.getByRole("tab", { name: "Yeni Kayıt Ekle" });
  await tab.waitFor({ timeout: 90_000 });
  await tab.click();
  const cat = page.locator('label:text-is("Kategori *") + select');
  await cat.waitFor({ timeout: 30_000 });
  await cat.selectOption("Merkezler");
  const title = page.locator('label:text-is("Başlık *") + select');
  await title.waitFor({ timeout: 10_000 });
  return title;
}

/** Kaydı yeniden açar (tam sayfa yeniden yükleme); başarısızlıkta tanı ekran görüntüsü. */
async function reopen(page: Page, tag: string) {
  const content = page.locator("[data-hd-kb-content-help] + textarea");
  try {
    await page.goto(page.url(), { waitUntil: "load", timeout: 60_000 });
    await content.waitFor({ timeout: 60_000 });
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `HATA-yeniden-ac-${tag}.png`), fullPage: true }).catch(() => {});
    throw e;
  }
}

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54637, dirName: "hd-genel-merkez-browser-pgdata", httpPort: SHIM_PORT });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const allErrors: string[] = [];
  const allExternal: string[] = [];
  try {
    // Gerçek şemadaki tekillik kısıtı (supabase/migrations/20260606120000_human_design.sql) — test DB'sinde de.
    await su.query(`create unique index hd_knowledge_tenant_code_uidx on public.human_design_knowledge_records (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'), code)`);
    const UA: Auth = await mkUser(su, "GMA", TA, { human_design: true, clients: true, hd_system_reading: true });
    const UB: Auth = await mkUser(su, "GMB", TB, { human_design: true, clients: true, hd_system_reading: true });
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
    };
    const created = await callRoute(routes.journey.POST, "POST", UA, {
      action: "create_new", ad: "Sentetik", soyad: "Genel", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    const hd = String(created.json.hd_client_id);
    const chart = await callRoute(routes.roxy.POST, "POST", UA, { client_id: hd, location_id: "client" });
    const chartId = String(chart.json.id);
    roxy.restore();
    const row = (await su.query(`select * from public.human_design_charts where id=$1`, [chartId])).rows[0];
    const { buildExpertKnowledgeCodes, toAppChartCodes } = await import("../../lib/human-design/normalize/hdAppCodes");
    const { centerStateMap, classifyChartRowCenters } = await import("../../lib/human-design/chart/centerStates");
    const codes = buildExpertKnowledgeCodes(toAppChartCodes(row), centerStateMap(classifyChartRowCenters(row)));
    const ins = async (tenant: string, category: string, code: string, title: string, content: string, active: boolean) =>
      String((await su.query(`insert into public.human_design_knowledge_records(tenant_id, category, title, code, content, expert_notes, is_active) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [tenant, category, title, code, content, `OZEL-NOT-${code}`, active])).rows[0].id);
    // Haritayla eşleşen KESİN kayıtlar (regresyon kontrolü) — Tanımlı / Tanımsız / Açık + tip.
    const preciseCodes = [
      codes.find((c) => c.startsWith("tip_")),
      codes.find((c) => c.startsWith("merkez_tanimli_")),
      codes.find((c) => c.startsWith("merkez_tanimsiz_")),
      codes.find((c) => c.startsWith("merkez_tam_acik_")),
    ].filter((c): c is string => !!c);
    for (const c of preciseCodes) await ins(TA, c.startsWith("tip_") ? "Tipler" : "Merkezler", c, `ZZ ${c}`, `KESIN-METIN-${c}`, true);
    await ins(TB, "Merkezler", "merkez_genel_head", "Genel — Baş Merkezi (Head)", "B-TENANT-GENEL-METNI", true);
    // Aktif/pasif kaldırma (Owner 28.11.2026): ESKİ kayıt durumları — içerikli pasif (taslak) kayıt
    // artık kullanılır; içeriği boş (aktif / pasif) kayıt otomatik rapora boş açıklama olarak GİRMEZ.
    const gateCodes = codes.filter((c) => c.startsWith("kapi_"));
    const legacyPassive = gateCodes[0];
    await ins(TA, "Kapılar", legacyPassive, `${legacyPassive.slice(5)} — ZZ Eski Pasif`, "ESKI-PASIF-ICERIKLI-METIN", false);
    await ins(TA, "Kapılar", gateCodes[1], `${gateCodes[1].slice(5)} — ZZ Bos Aktif`, "", true);
    await ins(TA, "Kapılar", gateCodes[2], `${gateCodes[2].slice(5)} — ZZ Bos Pasif`, "   ", false);
    const uiCenterCode = codes.filter((c) => c.startsWith("merkez_tanimli_"))[1];
    const uiCenter = CENTERS.find(([c]) => `merkez_tanimli_${c}` === uiCenterCode)!;
    const existingBefore = JSON.stringify((await su.query(`select id, tenant_id, code, title, content, expert_notes, is_active from public.human_design_knowledge_records order by id`)).rows);
    ok(created.status === 200 && chart.json.ok === true && preciseCodes.length >= 3 && preciseCodes.some((c) => c.startsWith("merkez_tanimsiz_") || c.startsWith("merkez_tam_acik_")) && gateCodes.length >= 3 && !!uiCenter,
      `tohum: danışan + kayıtlı analiz + ${preciseCodes.length} kesin kayıt (${preciseCodes.join(", ")}) + B kullanıcısının genel kaydı`);

    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();
    const userA = userJson(UA, TA, "GMA");

    // 9 merkez 3 cihaza paylaştırılır; aktif/pasif seçimi YOK — kaydedilen her kayıt otomatik aktif.
    const plan: Record<string, Array<[string, string]>> = { "375px": CENTERS.slice(0, 3), "390px": CENTERS.slice(3, 6), "masaüstü": CENTERS.slice(6, 9) };
    const recIds: Record<string, string> = {};
    for (const d of DEVICES) {
      const { ctx, page, errors, external } = await newPage(browser, userA, UA.token!, d);

      section(`Yeni Kayıt Ekle → Merkezler — ${d.name}`);
      const titleSel = await openCreateForm(page);
      const labels = (await titleSel.locator("option").allTextContents()).map((s) => s.trim()).filter((s) => s !== "— Seçin —");
      ok(labels.length === 36, `${d.name}: 36 merkez başlığı listelenir`, labels.length);
      ok(labels.filter((l) => l.startsWith("Genel — ")).length === 9, `${d.name}: 9/9 Genel başlık`);
      ok(JSON.stringify(labels) === JSON.stringify(EXPECTED_LABELS), `${d.name}: sıra birebir — her merkezde Genel → Tanımlı → Tanımsız → Açık; 27 mevcut başlık aynen`, labels.slice(0, 5));
      ok(await noHScroll(page, d.viewport.width), `${d.name}: Yeni Kayıt formunda yatay kaydırma yok`);
      const header = ((await page.locator("h1:text-is('Human Design — Bilgi Bankası') + p").textContent()) ?? "").trim();
      ok(header === HEADER_TEXT, `${d.name}: üst açıklama genel merkez istisnasını belirtir`, header);

      section(`Bilgilendirme metni (Yeni Kayıt) — ${d.name}`);
      const note = page.locator("[data-hd-kb-general-center-note]");
      ok((await note.count()) === 0, `${d.name}: başlık seçilmeden bilgilendirme YOK`);
      let preciseNoNote = 0;
      for (const l of EXPECTED_LABELS.filter((x) => !x.startsWith("Genel — "))) {
        await titleSel.selectOption({ label: l });
        if ((await note.count()) === 0 && (await page.getByText(GENERAL_NOTE).count()) === 0) preciseNoNote++;
      }
      ok(preciseNoNote === 27, `${d.name}: 27/27 mevcut başlıkta bilgilendirme GÖSTERİLMEZ`, preciseNoNote);
      let generalNote = 0;
      for (const l of EXPECTED_LABELS.filter((x) => x.startsWith("Genel — "))) {
        await titleSel.selectOption({ label: l });
        if ((await note.count()) === 1 && ((await note.textContent()) ?? "").trim() === GENERAL_NOTE && (await note.isVisible())) generalNote++;
      }
      ok(generalNote === 9, `${d.name}: 9/9 genel başlıkta bilgilendirme birebir görünür`, generalNote);
      const nb = await note.boundingBox();
      ok(!!nb && nb.x >= 0 && nb.x + nb.width <= d.viewport.width + 0.5, `${d.name}: bilgilendirme kutusu ekran genişliğine sığar`, nb);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: bilgilendirme ile yatay kaydırma yok`);
      await note.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(OUT, `yeni-kayit-genel-bilgilendirme-${d.name}.png`), fullPage: true });
      for (const cat of ["Tipler", "Kapılar"]) {
        await page.locator('label:text-is("Kategori *") + select').selectOption(cat);
        ok((await note.count()) === 0, `${d.name}: ${cat} kategorisinde bilgilendirme YOK`);
      }
      await page.locator('label:text-is("Kategori *") + select').selectOption("Merkezler");
      await page.screenshot({ path: path.join(OUT, `yeni-kayit-merkezler-${d.name}.png`), fullPage: true });

      section(`9/9 oluştur / kaydet / yeniden aç / düzenle — ${d.name}`);
      for (const [i, [c, label]] of plan[d.name].entries()) {
        const sel = i === 0 ? titleSel : await openCreateForm(page);
        await sel.selectOption({ label: `Genel — ${label}` });
        const codeVal = await page.locator('label:text-is("Kod (otomatik)") + input').inputValue();
        ok(codeVal === `merkez_genel_${c}`, `${d.name}: "Genel — ${label}" → otomatik kod ${codeVal}`);
        await page.getByRole("button", { name: "Oluştur ve Düzenle" }).click();
        await page.waitForURL(/\/human-design\/bilgi-bankasi\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const id = page.url().split("/").pop()!;
        recIds[c] = id;
        const content = page.locator("[data-hd-kb-content-help] + textarea");
        await content.waitFor({ timeout: 60_000 });
        await content.fill(`GENEL-ICERIK-${c} ilk metin`);
        await page.locator("[data-hd-kb-notes-help] + textarea").fill(`GENEL-OZEL-NOT-${c}`);
        ok((await page.locator("#hd-editor-active").count()) === 0 && (await page.getByText("Aktif kayıt", { exact: true }).count()) === 0
          && (await page.getByText("Pasif", { exact: true }).count()) === 0 && (await page.getByText("Aktif", { exact: true }).count()) === 0,
          `${d.name}: ${c} editörde "Aktif kayıt" kutusu ve Aktif/Pasif rozeti YOK`);
        const save1 = page.waitForResponse((r) => r.url().includes("/api/hd/knowledge") && r.request().method() === "PATCH", { timeout: 30_000 });
        await page.getByRole("button", { name: "Kaydet", exact: true }).click();
        ok((await save1).status() === 200, `${d.name}: ${c} tam sayfa editörde kaydedildi (ek aktifleştirme yok)`);
        await page.getByText("Kayıt güncellendi.").first().waitFor({ timeout: 20_000 });
        // Yeniden aç
        await reopen(page, `${c}-1-${d.name}`);
        const reTitle = await page.locator('label:text-is("Başlık *") + select').inputValue();
        ok(reTitle === `genel_${c}` && (await content.inputValue()) === `GENEL-ICERIK-${c} ilk metin`, `${d.name}: ${c} yeniden açıldı — başlık seçili, içerik aynen`);
        // Düzenle → kaydet → yeniden aç
        await content.fill(`GENEL-ICERIK-${c} düzenlendi`);
        const save2 = page.waitForResponse((r) => r.url().includes("/api/hd/knowledge") && r.request().method() === "PATCH", { timeout: 30_000 });
        await page.getByRole("button", { name: "Kaydet", exact: true }).click();
        ok((await save2).status() === 200, `${d.name}: ${c} düzenlendi ve kaydedildi`);
        await page.getByText("Kayıt güncellendi.").first().waitFor({ timeout: 20_000 });
        await reopen(page, `${c}-2-${d.name}`);
        ok((await content.inputValue()) === `GENEL-ICERIK-${c} düzenlendi`, `${d.name}: ${c} düzenleme kalıcı`);
        const en = page.locator("[data-hd-kb-general-center-note]");
        ok((await en.count()) === 1 && ((await en.textContent()) ?? "").trim() === GENERAL_NOTE && (await en.isVisible()) && (await page.getByText("Yapısal kategori:").count()) === 0,
          `${d.name}: ${c} düzenlemede bilgilendirme birebir görünür ("rapor kod eşleşmesinde kullanılır" notu yok)`);
        ok(((await page.locator("[data-hd-kb-content-help]").textContent()) ?? "").trim() === GENERAL_CONTENT_HELP, `${d.name}: ${c} içerik yardımında "Word raporuna eklemeyi seçerseniz" ifadesi YOK`);
        if (i === 0) {
          ok(await noHScroll(page, d.viewport.width), `${d.name}: tam sayfa editörde yatay kaydırma yok`);
          await page.screenshot({ path: path.join(OUT, `editor-genel-${c}-${d.name}.png`), fullPage: true });
        }
      }
      allErrors.push(...errors);
      allExternal.push(...external);
      await ctx.close();
    }

    section("Veritabanı: 9 genel kayıt");
    const gen = (await su.query(`select code, title, category, is_active, content, user_id from public.human_design_knowledge_records where tenant_id=$1 and code like 'merkez_genel_%' order by code`, [TA])).rows;
    ok(gen.length === 9 && CENTERS.every(([c, l]) => gen.some((g) => g.code === `merkez_genel_${c}` && g.title === `Genel — ${l}` && g.category === "Merkezler" && g.content === `GENEL-ICERIK-${c} düzenlendi` && g.user_id === UA.id)), "9/9 genel kayıt doğru kod / başlık / kategori / içerik / sahiple DB'de", gen.map((g) => g.code));
    ok(gen.every((g) => g.is_active === true), "9/9 kaydedilen genel kayıt OTOMATİK aktif (kullanıcı işlemi olmadan)");
    const existingAfter = JSON.stringify((await su.query(`select id, tenant_id, code, title, content, expert_notes, is_active from public.human_design_knowledge_records where code not like 'merkez_genel_%' or tenant_id=$1 order by id`, [TB])).rows);
    ok(existingAfter === existingBefore, "mevcut kayıtlar (kesin + eski pasif + boş kayıtlar + B genel kaydı) DEĞİŞMEDİ / SİLİNMEDİ (veri güncellemesi yok)");

    section("Mevcut (kesin) kayıtların editör bilgilendirmeleri korunur — 375px + masaüstü");
    for (const d of [DEVICES[0], DEVICES[2]]) {
      const p = await newPage(browser, userA, UA.token!, d);
      for (const c of preciseCodes) {
        const pid = (await su.query(`select id from public.human_design_knowledge_records where tenant_id=$1 and code=$2`, [TA, c])).rows[0].id;
        await p.page.goto(`${APP}/human-design/bilgi-bankasi/${pid}`);
        await p.page.locator("[data-hd-kb-content-help]").waitFor({ timeout: 60_000 });
        ok((await p.page.locator("[data-hd-kb-general-center-note]").count()) === 0 && (await p.page.getByText(GENERAL_NOTE).count()) === 0
          && (await p.page.getByText("Kod dropdown seçiminden otomatik üretilir ve rapor kod eşleşmesinde kullanılır.").count()) === 1,
          `${d.name}: ${c} — genel bilgilendirme YOK, mevcut "Yapısal kategori" notu AYNEN`);
        if (c.startsWith("merkez_")) ok(((await p.page.locator("[data-hd-kb-content-help]").textContent()) ?? "").trim() === CENTER_CONTENT_HELP, `${d.name}: ${c} — mevcut içerik yardımı AYNEN`);
      }
      allErrors.push(...p.errors);
      allExternal.push(...p.external);
      await p.ctx.close();
    }

    section("Normal not: arayüzden oluştur → kaydet → otomatik aktif → raporda kullanılır (masaüstü)");
    {
      const p = await newPage(browser, userA, UA.token!, DEVICES[2]);
      const sel = await openCreateForm(p.page);
      ok((await p.page.getByText("aktif edebilirsiniz").count()) === 0 && (await p.page.getByText("taslak", { exact: true }).count()) === 0, "Yeni Kayıt formunda 'taslak oluşturulur / aktif edebilirsiniz' açıklaması YOK");
      await sel.selectOption({ label: `Tanımlı — ${uiCenter[1]}` });
      await p.page.getByRole("button", { name: "Oluştur ve Düzenle" }).click();
      await p.page.waitForURL(/\/human-design\/bilgi-bankasi\/[0-9a-f-]{36}$/, { timeout: 60_000 });
      const content = p.page.locator("[data-hd-kb-content-help] + textarea");
      await content.waitFor({ timeout: 60_000 });
      await content.fill("YENI-NORMAL-NOT-METNI");
      await p.page.locator("[data-hd-kb-notes-help] + textarea").fill("YENI-NORMAL-OZEL-NOT");
      const sv = p.page.waitForResponse((r) => r.url().includes("/api/hd/knowledge") && r.request().method() === "PATCH", { timeout: 30_000 });
      await p.page.getByRole("button", { name: "Kaydet", exact: true }).click();
      ok((await sv).status() === 200, "normal not kaydedildi (aktifleştirme adımı yok)");
      await p.page.getByText("Kayıt güncellendi.").first().waitFor({ timeout: 20_000 });
      await reopen(p.page, "normal-not");
      ok((await content.inputValue()) === "YENI-NORMAL-NOT-METNI", "normal not yeniden açıldı — içerik aynen");
      const nr = (await su.query(`select is_active, content, expert_notes from public.human_design_knowledge_records where tenant_id=$1 and code=$2`, [TA, uiCenterCode])).rows[0];
      ok(nr?.is_active === true && nr.content === "YENI-NORMAL-NOT-METNI" && nr.expert_notes === "YENI-NORMAL-OZEL-NOT", "normal not DB'de otomatik aktif, içerik + özel not aynen", nr);
      allErrors.push(...p.errors);
      allExternal.push(...p.external);
      await p.ctx.close();
    }

    const { ctx, page, errors, external } = await newPage(browser, userA, UA.token!, DEVICES[2]);
    section("Bilgi Bankası listesi (masaüstü)");
    await page.goto(`${APP}/human-design/bilgi-bankasi`);
    await page.getByLabel("Kategori filtresi").waitFor({ timeout: 90_000 });
    await page.getByLabel("Kategori filtresi").selectOption("Merkezler");
    await page.getByText("Genel — Baş Merkezi (Head)", { exact: true }).first().waitFor({ timeout: 30_000 });
    const listTitles = (await page.locator('input[aria-label$=" kaydını seç"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")!.replace(/ kaydını seç$/, ""))));
    ok(listTitles.filter((t) => t.startsWith("Genel — ")).length === 9, "listede 9 genel kayıt görünür");
    ok((await page.getByLabel("Durum filtresi").count()) === 0 && (await page.locator("th", { hasText: /^\s*Aktif\s*$/ }).count()) === 0 && (await page.locator("option", { hasText: /^Pasif$/ }).count()) === 0,
      "listede Aktif/Pasif durum filtresi ve Aktif sütunu YOK");
    ok(!(await page.content()).includes("B-TENANT-GENEL-METNI"), "listede başka kullanıcının genel kaydı YOK");
    const idxGenelHead = listTitles.indexOf("Genel — Baş Merkezi (Head)");
    ok(idxGenelHead === 0, "liste sıralaması: Genel — Baş Merkezi ilk sırada", listTitles.slice(0, 4));
    await page.screenshot({ path: path.join(OUT, "liste-merkezler-masaustu.png"), fullPage: true });

    section("Otomatik eşleştirme (gerçek sunucu)");
    const api = async (q: string) => page.evaluate(async (qq) => {
      const r = await fetch(`/api/hd/knowledge${qq}`, { headers: { "x-user-id": JSON.parse(localStorage.getItem("yasam_user")!).id, "x-session-token": localStorage.getItem("yasam_session_token")! } });
      return { status: r.status, json: await r.json() };
    }, q);
    const allGeneral = CENTERS.map(([c]) => `merkez_genel_${c}`);
    const m = await api(`?codes=${encodeURIComponent([...codes, ...allGeneral].join(","))}`);
    const mRows = ((m.json as Json).rows ?? (m.json as Json).data ?? []) as Array<{ code: string }>;
    ok(m.status === 200 && Array.isArray(mRows), "harita eşleşme ucu yanıt verdi", m.json);
    ok(!mRows.some((r) => r.code.startsWith("merkez_genel_")), "genel kodlar AÇIKÇA istense bile harita eşleşmesine GİRMEZ", mRows.map((r) => r.code));
    ok(preciseCodes.every((c) => mRows.some((r) => r.code === c)), "kesin Tanımlı / Tanımsız / Açık + tip kayıtları eşleşir (regresyon)", mRows.map((r) => r.code));
    ok(mRows.some((r) => r.code === legacyPassive) && !mRows.some((r) => r.code === gateCodes[1] || r.code === gateCodes[2]) && mRows.some((r) => r.code === uiCenterCode),
      "eşleşme: içerikli ESKİ PASİF kayıt + yeni normal not VAR; içeriği boş (aktif/pasif) kayıtlar YOK", mRows.map((r) => r.code));
    const bId = (await su.query(`select id from public.human_design_knowledge_records where tenant_id=$1`, [TB])).rows[0].id;
    const cross = await api(`?id=${bId}`);
    ok(cross.status !== 200 || !JSON.stringify(cross.json).includes("B-TENANT-GENEL-METNI"), "A, B'nin genel kaydını açamaz", cross.status);

    section("Word danışan raporu (masaüstü)");
    await su.query(`delete from public.human_design_reports where chart_id=$1`, [chartId]);
    await page.goto(`${APP}/human-design/danisanlar/${hd}`);
    const item = page.locator(`[data-hd-history-item$=":${chartId}"]`);
    await item.waitFor({ timeout: 90_000 });
    await item.locator(`[data-hd-history-word="${chartId}"]`).click();
    const dlg = page.getByRole("dialog", { name: "Human Design Danışan Raporu'na neler eklensin?" });
    await dlg.waitFor({ timeout: 60_000 });
    await dlg.getByRole("checkbox", { name: /Bilgi Bankamdaki Açıklamaları Ekle/ }).check();
    await dlg.locator("[data-hd-kb-match]").waitFor({ timeout: 20_000 });
    const matchText = ((await dlg.locator("[data-hd-kb-match]").textContent()) ?? "").trim();
    const expectedCount = preciseCodes.length + 2;
    ok(matchText.includes(`Bu analizle eşleşen ${expectedCount} aktif açıklama eklenecek.`), `eşleşen açıklama sayısı = ${expectedCount} (kesin + eski pasif içerikli + yeni not; genel ve boş kayıtlar SAYILMAZ)`, matchText);
    await page.screenshot({ path: path.join(OUT, "word-secim-masaustu.png") });
    const dlP = page.waitForEvent("download", { timeout: 90_000 });
    await dlg.getByRole("button", { name: "Raporu Hazırla" }).click();
    const text = await docxText((await (await dlP).path())!);
    ok(text.includes("Sentetik Genel"), "Word indirildi (danışan bilgisi var)");
    ok(!/GENEL-ICERIK-/.test(text) && !text.includes("Genel — "), "Word'de genel merkez içeriği / başlığı YOK", text.match(/GENEL-ICERIK-[a-z_]+/g));
    ok(preciseCodes.every((c) => text.includes(`KESIN-METIN-${c}`)), "Word'de kesin merkez + tip açıklamaları VAR (regresyon)");
    ok(text.includes("ESKI-PASIF-ICERIKLI-METIN") && text.includes("YENI-NORMAL-NOT-METNI"), "Word'de içerikli ESKİ PASİF kayıt ve yeni normal not VAR");
    // Kapı görünen adı (başlık) teknik tabloda kullanılabilir; burada AÇIKLAMA girdileri denetlenir (donmuş snapshot).
    const snapRow = (await su.query(`select snapshot from public.human_design_reports where chart_id=$1 order by created_at desc limit 1`, [chartId])).rows[0];
    const entryCodes = ((snapRow?.snapshot?.commentary?.expert?.entries ?? []) as Array<{ code: string; content: string }>);
    ok(entryCodes.length === expectedCount && entryCodes.every((e) => (e.content ?? "").trim() !== "") && !entryCodes.some((e) => e.code === gateCodes[1] || e.code === gateCodes[2] || e.code.startsWith("merkez_genel_")),
      "Word açıklama girdileri: içeriği boş (aktif/pasif) kayıt ve genel merkez kaydı YOK; boş açıklama girdisi YOK", entryCodes.map((e) => e.code));
    ok(!text.includes("YENI-NORMAL-OZEL-NOT"), "Word'de yeni notun Özel Çalışma Notu YOK");
    ok(!/OZEL-NOT-|GENEL-OZEL-NOT-/.test(text) && !text.includes("B-TENANT-GENEL-METNI"), "Word'de özel notlar ve başka kullanıcı kaydı YOK");
    allErrors.push(...errors);
    allExternal.push(...external);
    await ctx.close();

    section("B kullanıcısı (izolasyon)");
    const b = await newPage(browser, userJson(UB, TB, "GMB"), UB.token!, DEVICES[2]);
    await b.page.goto(`${APP}/human-design/bilgi-bankasi`);
    await b.page.getByText("Genel — Baş Merkezi (Head)", { exact: true }).first().waitFor({ timeout: 90_000 });
    const bHtml = await b.page.content();
    ok(!/GENEL-ICERIK-|KESIN-METIN-/.test(bHtml) && bHtml.includes("B-TENANT-GENEL-METNI"), "B yalnız kendi kaydını görür; A'nın 9 genel + kesin kaydı görünmez");
    allErrors.push(...b.errors);
    allExternal.push(...b.external);
    await b.ctx.close();

    section("Kaynak yükleme uyarısı — kök neden (yalnız TEST DB'si)");
    {
      const p = await newPage(browser, userA, UA.token!, DEVICES[2]);
      const srcResp = async () => {
        const rp = p.page.waitForResponse((r) => r.url().includes("/api/hd/knowledge-sources") && r.request().method() === "GET", { timeout: 60_000 });
        await p.page.goto(`${APP}/human-design/bilgi-bankasi/${recIds.head}`);
        const r = await rp;
        await p.page.locator("[data-hd-kb-content-help]").waitFor({ timeout: 60_000 });
        await p.page.waitForTimeout(1500);
        return { status: r.status(), toast: await p.page.getByText(/Kaynaklar yüklenemedi/).count() };
      };
      const tableBefore = (await su.query(`select to_regclass('public.human_design_knowledge_sources') as t`)).rows[0].t;
      const before = await srcResp();
      ok(tableBefore === null && before.status >= 500 && before.toast >= 1, "test ortamında kaynak tablosu YOK → uç 5xx + 'Kaynaklar yüklenemedi' uyarısı (önceki koşudaki uyarının nedeni)", { tableBefore, ...before });
      // Canlıda bu tabloyu kuran GERÇEK migration dosyası — yalnız bu yerel test veritabanına uygulanır.
      // Bağımlılığı set_updated_at() test şemasında yok → repo'daki asıl tanımı (20260601000000) birebir alınır.
      const fnSql = /create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/.exec(readFileSync(path.join(process.cwd(), "supabase/migrations/20260601000000_video_transcription.sql"), "utf8"))![0];
      await su.query(fnSql);
      await su.query(readFileSync(path.join(process.cwd(), "supabase/migrations/20260824000000_hd_editorial_sources_and_expert_notes.sql"), "utf8"));
      const after = await srcResp();
      ok(after.status === 200 && after.toast === 0, "gerçek migration (20260824000000) uygulanınca uç 200, uyarı YOK → uyarı yalnız test şemasından; ürün kodu değişmedi", after);
      await p.page.screenshot({ path: path.join(OUT, "kaynak-uyarisi-yok-masaustu.png"), fullPage: true });
      allErrors.push(...p.errors);
      allExternal.push(...p.external);
      await p.ctx.close();
    }

    section("Genel");
    ok(roxy.state.calls <= 1 && roxy.state.external.length === 0, "Roxy: yalnız tohum hesabı için 1 SAHTE çağrı (gerçek/ücretli çağrı 0)", roxy.state);
    ok(allExternal.length === 0, "harici ağ isteği yok", allExternal.slice(0, 5));
    ok(allErrors.length === 0, "sayfa JS hatası yok", allErrors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD GENEL MERKEZ TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
