/**
 * HD Bilgi Bankası + Word raporu GİZLİLİK düzenlemesi — GERÇEK TARAYICI testi (yerel `next start`;
 * PRODUCTION'A SIFIR TEMAS; gerçek Roxy anahtarı YOK).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Çalıştır: npm run hd:kb-privacy:browser [-- --out <klasör>]
 *
 * Kapsam (375 px · 390 px · masaüstü):
 *   • Bilgi Bankası editörü: "Bilgi ve Açıklamalar" / "Özel Çalışma Notları" + birebir açıklamalar;
 *     kategoriye göre "Bu kapı" / "Bu kanal" (yanlış bağlam yok); eski içerik ve not korunur.
 *   • Word: içerik seçimi her açılışta KAPALI; seçim → DOCX içeriği (gerçek sunucu + DB):
 *     özel not / pasif / başka tenant / ilgisiz kayıt HİÇBİR seçimde yok; açıklama metni AYNEN;
 *     kayıtlı Word "Kayıtlı Word'ü İndir" ile değişmeden iner.
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

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-kb-word-privacy-browser");
const PORT = 3989;
const APP = `http://127.0.0.1:${PORT}`;
const SHIM_PORT = 54523;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
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

const CONTENT_HELP_GATE = "Bu kapı hakkında eğitimlerinizden, kitaplarınızdan ve kendi çalışmalarınızdan edindiğiniz bilgileri yazabilirsiniz. Bu bilgiler yalnızca siz Word raporuna eklemeyi seçerseniz raporda yer alır.";
const NOTES_HELP = "Kendiniz için hatırlatmalar ve özel çalışma notları yazabilirsiniz. Bu notlar danışan raporuna aktarılmaz.";

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54433, dirName: "hd-kb-word-privacy-browser-pgdata", httpPort: SHIM_PORT });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const allErrors: string[] = [];
  const allExternal: string[] = [];
  try {
    const U: Auth = await mkUser(su, "KBP", TA, { human_design: true, clients: true, hd_system_reading: true });
    const routes = {
      journey: await import("../../app/api/hd/clients/journey/route"),
      roxy: await import("../../app/api/hd/charts/roxy/route"),
    };
    const created = await callRoute(routes.journey.POST, "POST", U, {
      action: "create_new", ad: "Gizli", soyad: "Rapor", dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID(),
    });
    const hd = String(created.json.hd_client_id);
    const chart = await callRoute(routes.roxy.POST, "POST", U, { client_id: hd, location_id: "client" });
    const chartId = String(chart.json.id);
    roxy.restore();
    const row = (await su.query(`select * from public.human_design_charts where id=$1`, [chartId])).rows[0];
    const { buildExpertKnowledgeCodes, toAppChartCodes } = await import("../../lib/human-design/normalize/hdAppCodes");
    const codes = buildExpertKnowledgeCodes(toAppChartCodes(row));
    const gateCode = codes.find((c) => c.startsWith("kapi_"))!;
    const chCode = codes.find((c) => c.startsWith("kanal_"));
    const ins = async (tenant: string, category: string, code: string, title: string, content: string, notes: string | null, active: boolean) =>
      String((await su.query(`insert into public.human_design_knowledge_records(tenant_id, category, title, code, content, expert_notes, is_active) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [tenant, category, title, code, content, notes, active])).rows[0].id);
    const gateRec = await ins(TA, "Kapılar", gateCode, "ZZ Kapı Başlığı", "KAPI-ACIKLAMA-METNI satır 1\nsatır 2 — aynen korunmalı", "OZEL-NOT-KAPI", true);
    const chRec = chCode ? await ins(TA, "Kanallar", chCode, "ZZ Kanal Başlığı", "KANAL-ACIKLAMA-METNI", "OZEL-NOT-KANAL", true) : null;
    await ins(TA, "Kapılar", gateCode, "ZZ Pasif", "PASIF-KAYIT-METNI", "OZEL-NOT-PASIF", false);
    await ins(TA, "Kapılar", "kapi_64_zz_yok", "ZZ İlgisiz", "ILGISIZ-KAYIT-METNI", null, true);
    await ins(TA, "Genel Notlar", "not_zz_serbest", "ZZ Serbest", "SERBEST-NOT-METNI", null, true);
    await ins(TB, "Kapılar", gateCode, "ZZ B Tenant", "BASKA-TENANT-METNI", "OZEL-NOT-B", true);
    const contentBefore = (await su.query(`select content, expert_notes from public.human_design_knowledge_records where id=$1`, [gateRec])).rows[0];
    ok(created.status === 200 && chart.json.ok === true && !!gateCode, "tohum: danışan + kayıtlı analiz + Bilgi Bankası (aktif / pasif / ilgisiz / serbest / başka tenant; özel notlu)");

    const user: Json = {
      id: U.id, tenant_id: TA, full_name: "ZZ_HDFLOW_KBP", email: "zz.hdflow.kbp@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false,
      module_permissions: { human_design: true, clients: true, hd_system_reading: true },
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
      cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    const combos: Record<string, { k: boolean; s: boolean }> = { "375px": { k: false, s: false }, "390px": { k: true, s: false }, "masaüstü": { k: true, s: true } };
    let firstReportText: string | null = null;
    for (const d of DEVICES) {
      const { ctx, page, errors, external } = await newPage(browser, user, U.token!, d);
      const consoleErrors: string[] = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
      page.on("response", (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url().slice(0, 120)}`); });

      section(`Bilgi Bankası alanları — ${d.name}`);
      await page.goto(`${APP}/human-design/bilgi-bankasi/${gateRec}`);
      await page.getByText("Bilgi ve Açıklamalar", { exact: true }).first().waitFor({ timeout: 90_000 });
      ok(await page.getByText("Özel Çalışma Notları", { exact: true }).first().isVisible(), `${d.name}: yeni alan adları görünür`);
      ok((await page.getByText("Kaynaklandırılmış Ana Metin").count()) === 0 && (await page.getByText("Uzman Notu", { exact: true }).count()) === 0, `${d.name}: eski alan adları yok`);
      ok((await page.locator("[data-hd-kb-content-help]").textContent())?.trim() === CONTENT_HELP_GATE, `${d.name}: Kapı kaydında açıklama BİREBİR`);
      ok((await page.locator("[data-hd-kb-notes-help]").textContent())?.trim() === NOTES_HELP, `${d.name}: Özel Çalışma Notları açıklaması BİREBİR`);
      const vals = await page.locator("textarea").evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
      ok(vals.includes(contentBefore.content) && vals.includes(contentBefore.expert_notes), `${d.name}: eski içerik ve özel not alanlarda aynen`);
      ok(await noHScroll(page, d.viewport.width), `${d.name}: editörde yatay kaydırma yok`);
      await page.screenshot({ path: path.join(OUT, `kb-editor-${d.name}.png`), fullPage: true });
      if (chRec) {
        await page.goto(`${APP}/human-design/bilgi-bankasi/${chRec}`);
        await page.locator("[data-hd-kb-content-help]").waitFor({ timeout: 60_000 });
        const t = (await page.locator("[data-hd-kb-content-help]").textContent()) ?? "";
        ok(t.startsWith("Bu kanal hakkında") && !t.includes("Bu kapı"), `${d.name}: Kanal kaydında bağlam "Bu kanal" (yanlış "Bu kapı" yok)`, t.slice(0, 40));
      }

      section(`Word içerik seçimi — ${d.name}`);
      await su.query(`delete from public.human_design_reports where chart_id=$1`, [chartId]);
      await page.goto(`${APP}/human-design/danisanlar/${hd}`);
      const item = page.locator(`[data-hd-history-item$=":${chartId}"]`);
      try {
        await item.waitFor({ timeout: 90_000 });
      } catch (e) {
        await page.screenshot({ path: path.join(OUT, `history-missing-${d.name}.png`), fullPage: true });
        console.log("    (tanı) url:", page.url(), "pageerrors:", JSON.stringify(errors).slice(0, 1500), "console:", JSON.stringify(consoleErrors).slice(0, 1500));
        throw e;
      }
      const btn = item.locator(`[data-hd-history-word="${chartId}"]`);
      ok((await btn.textContent())?.trim() === "Word Oluştur", `${d.name}: kayıtlı Word yokken düğme "Word Oluştur"`);
      await btn.click();
      const dlg = page.getByRole("dialog", { name: "Word raporuna neler eklensin?" });
      await dlg.waitFor({ timeout: 60_000 });
      const kb = dlg.getByRole("checkbox", { name: /Bilgi Bankamdaki Açıklamaları Ekle/ });
      const sys = dlg.getByRole("checkbox", { name: /Sistem Yorumunu Ekle/ });
      ok(!(await kb.isChecked()) && !(await sys.isChecked()), `${d.name}: iki seçenek de VARSAYILAN KAPALI`);
      const box = await dlg.boundingBox();
      ok(!!box && box.x >= 0 && box.x + box.width <= d.viewport.width + 0.5 && box.y + box.height <= d.viewport.height + 0.5, `${d.name}: seçim penceresi ekrana sığıyor`, box);
      await page.screenshot({ path: path.join(OUT, `word-options-${d.name}.png`) });
      const c = combos[d.name];
      if (c.k) {
        await kb.check();
        await dlg.locator("[data-hd-kb-match]").waitFor({ timeout: 20_000 });
        ok(/Bu analizle eşleşen \d+ aktif açıklama eklenecek\./.test((await dlg.locator("[data-hd-kb-match]").textContent()) ?? ""), `${d.name}: eşleşen aktif açıklama sayısı gösterildi (gerçek sunucu)`);
      }
      if (c.s) await sys.check();
      const preparer = d.name === "masaüstü" ? "Human Design Uzmanı Test Kişi" : "";
      if (preparer) await dlg.getByLabel(/Raporu Hazırlayan/).fill(preparer);
      const dlP = page.waitForEvent("download", { timeout: 90_000 });
      await dlg.getByRole("button", { name: "Word'ü oluştur" }).click();
      const dl = await dlP;
      const text = await docxText((await dl.path())!);
      const label = `${d.name} [bilgi=${c.k} sistem=${c.s}]`;
      ok(text.includes("Kapılar") && text.includes("Gizli Rapor"), `${label}: teknik içerik + danışan bilgisi her zaman var`);
      ok(c.k ? text.includes("KAPI-ACIKLAMA-METNI satır 1") && text.includes("satır 2 — aynen korunmalı") : !text.includes("KAPI-ACIKLAMA-METNI"), `${label}: Bilgi Bankası açıklaması ${c.k ? "AYNEN var" : "YOK"}`);
      ok(c.s ? /Sistem Yorumu/.test(text) : !/Kaynak: Harita hesaplanırken/.test(text), `${label}: Sistem Yorumu ${c.s ? "var" : "yok"}`);
      ok(!/OZEL-NOT-/.test(text), `${label}: Özel Çalışma Notları YOK`);
      ok(!text.includes("PASIF-KAYIT-METNI") && !text.includes("ILGISIZ-KAYIT-METNI") && !text.includes("BASKA-TENANT-METNI") && !text.includes("SERBEST-NOT-METNI"), `${label}: pasif / ilgisiz / başka tenant / serbest kayıt YOK`);
      if (!c.k && !c.s) ok(!text.includes("Uzman Açıklamaları") && !text.includes("eşleşen kayıt bulunmadığından"), `${label}: gereksiz boş başlık yok`);
      // 2026-10-10 owner: ad doluysa son sayfada "RAPORU HAZIRLAYAN" imza kartı; boşsa kart tamamen gizli.
      ok(preparer ? text.includes("RAPORU HAZIRLAYAN") && text.includes(preparer) && !text.includes("Hazırlayan: ") : !text.includes("RAPORU HAZIRLAYAN") && !text.includes("Hazırlayan:") && !text.includes("Ad Soyad / Unvan"), `${label}: Hazırlayan ${preparer ? "imza kartında yazılan ad/unvan" : "imza kartı YOK (boş)"}; profil adı otomatik yazılmaz`);
      ok(!text.includes("ZZ_HDFLOW_KBP"), `${label}: kullanıcı profil adı raporda yok`);
      ok(text.includes("BodyGraph ve Aktivasyonlar") && (text.match(/13 aktivasyon/g) ?? []).length === 2 && text.includes("ENKARNASYON TEMASI (YAŞAM AMACI)") && !/haç/i.test(text), `${label}: profesyonel düzen (BodyGraph + 13/13, kimlik kartı)`);
      await page.getByText(/Yeni Word raporu oluşturuldu/).waitFor({ timeout: 20_000 });

      // Kayıtlı Word: AYNI dosya değişmeden iner + açık bildirim; yeni Word seçimleri tekrar kapalı.
      await page.screenshot({ path: path.join(OUT, `after-create-${d.name}.png`) });
      const modalBtn = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]').getByRole("button", { name: "Kayıtlı Word'ü İndir", exact: true });
      await modalBtn.waitFor({ timeout: 20_000 });
      const notCovered = await modalBtn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!top && (top === el || el.contains(top));
      });
      ok(notCovered, `${d.name}: analiz penceresi araç çubuğu (Word düğmesi) üst başlığın ALTINDA KALMIYOR — tıklanabilir`);
      const dl2P = page.waitForEvent("download");
      await modalBtn.click();
      const text2 = await docxText((await (await dl2P).path())!);
      await page.getByText(/Önceden oluşturulmuş kayıtlı Word raporu indirildi; içeriği değiştirilmedi/).waitFor({ timeout: 20_000 });
      ok(text2 === text, `${d.name}: "Kayıtlı Word'ü İndir" aynı içeriği indirdi + önceden oluşturulduğu söylendi`);
      await page.getByRole("button", { name: "Yeni Word oluştur (içerik seçerek)" }).click();
      const dlg2 = page.getByRole("dialog", { name: "Word raporuna neler eklensin?" });
      await dlg2.waitFor();
      ok(!(await dlg2.getByRole("checkbox", { name: /Bilgi Bankamdaki/ }).isChecked()) && !(await dlg2.getByRole("checkbox", { name: /Sistem Yorumunu/ }).isChecked()), `${d.name}: yeni Word'de seçimler yeniden KAPALI (önceki seçim hatırlanmaz)`);
      await dlg2.getByRole("button", { name: "Vazgeç" }).click();
      ok(await noHScroll(page, d.viewport.width), `${d.name}: analiz sayfasında yatay kaydırma yok`);
      if (d.name === "390px") firstReportText = text;
      allErrors.push(...errors);
      allExternal.push(...external);
      await ctx.close();
    }

    section("Eski kayıtlar ve genel");
    const after = (await su.query(`select content, expert_notes from public.human_design_knowledge_records where id=$1`, [gateRec])).rows[0];
    ok(after.content === contentBefore.content && after.expert_notes === contentBefore.expert_notes, "Bilgi Bankası kaydı ve özel notu DEĞİŞMEDİ (yalnız etiketler değişti)");
    ok(!!firstReportText, "390px raporu yakalandı");
    ok(allExternal.length === 0, "harici ağ isteği yok", allExternal.slice(0, 5));
    ok(allErrors.length === 0, "sayfa JS hatası yok", allErrors.slice(0, 5));
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      // SENKRON: süreç çıkmadan sunucu kapanmalı (kalan sunucu bir sonraki build'in chunk'larını bulamaz).
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD Bilgi Bankası + Word GİZLİLİK TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) {
    for (const f of fails) console.log(" -", f);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
