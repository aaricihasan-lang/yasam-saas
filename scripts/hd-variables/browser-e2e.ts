/**
 * HD VARIABLES (Dört Ok ve PHS) — GERÇEK TARAYICI testi (Playwright; yerel `next start` + izole Postgres). Ücretli çağrı YOK.
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Kayıtlı analizler gerçek route'larla (sahte BodyGraph sağlayıcısı) tohumlanır. /api/hd/charts/variables tarayıcıda yakalanır
 * ve test sürecinde GERÇEK servisle (computeChartVariables; sahte Variables sağlayıcısı, değerler yerel motordan) yanıtlanır.
 * Ekranlar (13): 1920×1080 … 320×568. Çalıştır: npx tsx scripts/hd-variables/browser-e2e.ts [--out <klasör>]
 * Ortam: HD_VAR_E2E_PG_PORT (varsayılan 54522), HD_VAR_E2E_PG_DIR, HD_VAR_E2E_ONLY=1366x768,390x844.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Route } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { resolveBirthLocalTime } from "../../lib/human-design/api/birthTimeResolution";
import { localVariableBands } from "../../lib/human-design/variables/localVariablesCheck";
import { ARROW_SPECS, COGNITION_BY_TONE, substructureOf, toneDirection, type VariableKey } from "../../lib/human-design/variables/variablesMath";
import { __resetVariablesCache, computeChartVariables } from "../../lib/human-design/variables/variablesService";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-variables-browser");
mkdirSync(OUT, { recursive: true });
const PORT = 3993;
const APP = `http://127.0.0.1:${PORT}`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DEVICES = [
  { name: "1920x1080", w: 1920, h: 1080 }, { name: "1536x639", w: 1536, h: 639 }, { name: "1440x900", w: 1440, h: 900 },
  { name: "1366x768", w: 1366, h: 768 }, { name: "1280x720", w: 1280, h: 720 }, { name: "1024x768", w: 1024, h: 768, ua: IPAD },
  { name: "820x1180", w: 820, h: 1180, ua: IPAD }, { name: "768x1024", w: 768, h: 1024, ua: IPAD }, { name: "430x932", w: 430, h: 932, ua: IPHONE },
  { name: "390x844", w: 390, h: 844, ua: IPHONE }, { name: "375x667", w: 375, h: 667, ua: IPHONE }, { name: "360x800", w: 360, h: 800, ua: ANDROID },
  { name: "320x568", w: 320, h: 568, ua: IPHONE },
];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await sleep(1000);
  }
  throw new Error(`sunucu açılmadı: ${url}`);
}

/** Sözleşmeye uygun sahte Variables yanıtı (değerler yerel motordan; `uncertain` okları sınırda işaretlenir). */
function fakeVariables(body: Json, uncertain: VariableKey[]) {
  const r = resolveBirthLocalTime(String(body.date), String(body.time), String(body.timezone));
  const bands = localVariableBands(new Date(r.kind === "ok" ? r.utcIso : "2000-01-01T00:00:00Z"));
  const arrows = ARROW_SPECS.map((spec) => {
    const s = substructureOf(bands.find((b) => b.key === spec.key)!.longitude);
    const a: Json = {
      key: spec.key, name: spec.key[0].toUpperCase() + spec.key.slice(1), nameLocalized: { determination: "Belirlenim", environment: "Ortam", motivation: "Motivasyon", perspective: "Bakış Açısı" }[spec.key],
      layer: spec.layer, layerLocalized: spec.side === "design" ? "Birincil Sağlık Sistemi" : "Rave Psikolojisi", position: spec.position, positionLocalized: "Konum",
      activation: { planet: spec.planet, side: spec.side, planetLocalized: spec.planet === "Sun" ? "Güneş" : "Kuzey Düğüm" }, color: s.color, tone: s.tone, base: s.base, direction: toneDirection(s.tone),
      colorLabel: "Color", colorLabelLocalized: `Renk teması ${s.color}`, directionLabel: "Dir", directionLabelLocalized: s.tone <= 3 ? "Aktif" : "Pasif",
      description: "Bu ok bedenin besini ve bilgiyi nasıl aldığını anlatan uzun bir açıklamadır; ekranda taşma olmadan okunmalıdır. Çok uzun kelime: Çekoslovakyalılaştıramadıklarımızdanmışsınız.",
      layerDescription: "Katman açıklaması.", colorMeaning: "Color anlamı açıklaması.", toneMeaning: "Tone anlamı açıklaması.", directionMeaning: "Yön anlamı açıklaması.",
      baseName: "Base", baseNameLocalized: "Taban", confident: !uncertain.includes(spec.key),
    };
    if (spec.key === "determination") a.cognition = { label: COGNITION_BY_TONE[s.tone - 1], labelLocalized: "Biliş", description: "Bilişsel algı açıklaması." };
    return a;
  });
  return { arrows, confident: arrows.every((a) => a.confident === true), confidenceMarginDeg: 0.002737909255830788, baseDescription: "Base katmanı bilgilendiricidir." };
}

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: Number(process.env.HD_VAR_E2E_PG_PORT ?? 54522), dirName: process.env.HD_VAR_E2E_PG_DIR ?? "hd-variables-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  try {
    const PA = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "HVAR", TA, PA);
    const NOSR: Auth = await mkUser(su, "HVAN", TA, { human_design: true, clients: true });
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const mk = async (ad: string, soyad: string, dogum: string, saat: string) => {
      const c = await callRoute(jr.POST, "POST", UA, { action: "create_new", ad, soyad, dogum, birth_time: saat, birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
      const hd = String(c.json.hd_client_id);
      const ch = await callRoute(rr.POST, "POST", UA, { client_id: hd, location_id: "client" });
      return { hd, chart: String(ch.json.id) };
    };
    const A = await mk("Ayşe", "Kesinoklu", "2018-07-20", "19:00");
    const B = await mk("Burak", "Sınırdaoklu", "2018-07-20", "19:00");
    roxy.restore();
    const svc = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
    const userJson = (u: Auth, perms: Json): Json => ({ id: u.id, tenant_id: TA, full_name: "ZZ_HVAR", email: "zz.hvar@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: perms });
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // Tarayıcıdaki /api/hd/charts/variables → GERÇEK servis (sahte sağlayıcı). B analizi: Sindirim/PHS + Motivasyon sınırda.
    let served = 0;
    let sentToProvider: Json[] = [];
    const delayFor = new Map<string, number>();
    const abortFor = new Set<string>();
    const handler = async (route: Route) => {
      served++;
      const body = route.request().postDataJSON() as Json;
      const chartId = String(body.chart_id);
      if (abortFor.has(chartId)) return route.abort("failed");
      const wait = delayFor.get(chartId) ?? 0;
      if (wait) await sleep(wait);
      const r = await computeChartVariables({ db: svc, tenantId: TA, userId: UA.id!, isDemo: false }, body, {
        config: { apiKey: "k", baseUrl: "https://example.invalid" },
        callVariables: async (_c, b) => { sentToProvider.push(b as unknown as Json); return { ok: true, raw: fakeVariables(b as unknown as Json, chartId === B.chart ? ["determination", "motivation"] : []) }; },
        rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
      });
      try { await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(r.body) }); } catch { /* iptal */ }
    };

    const only = (process.env.HD_VAR_E2E_ONLY ?? "").split(",").filter(Boolean);
    for (const d of DEVICES.filter((x) => !only.length || only.includes(x.name))) {
      section(d.name);
      __resetVariablesCache();
      const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, isMobile: !!d.ua, hasTouch: !!d.ua, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript({ content: "window.__name = (f) => f;" });
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson(UA, PA)), UA.token!]);
      const page = await ctx.newPage();
      let roxyDirect = 0;
      page.on("request", (r) => { if (/roxyapi\.com/.test(r.url())) roxyDirect++; });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      await page.route("**/api/hd/charts/variables", handler);
      const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const openChart = async (hd: string) => {
        await page.locator(`[data-hd-group-open="${hd}"]`).click();
        const m = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
        await m.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
        return m;
      };
      const closeChart = async () => {
        await page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]').getByRole("button", { name: "Kapat" }).first().click();
        await page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]').waitFor({ state: "detached", timeout: 15_000 });
      };
      await page.goto(`${APP}/human-design/danisanlar`);
      served = 0;
      sentToProvider = [];
      let m = await openChart(A.hd);

      // Mevcut harita korunur: premium BodyGraph + #459 merkez renkleri + Word düğmesi
      const bg = await m.evaluate((root) => {
        const svg = root.querySelector("svg[data-hd-cbg]");
        const fills = svg ? [...svg.querySelectorAll("polygon")].map((p) => p.getAttribute("fill") ?? "") : [];
        return { svg: !!svg, family: fills.filter((f) => /cbgCenter(Gold|Green|Red|Brown)/.test(f)).length, uniform: fills.filter((f) => f.includes("cbgCenterDef")).length };
      });
      ok(bg.svg && bg.family > 0 && bg.uniform === 0, `${d.name}: premium BodyGraph yerinde; tanımlı merkezler #459 renk aileleriyle (${bg.family}), tek tip eski dolgu yok`, bg);
      const wordBtns = await m.getByRole("button", { name: /Raporu Hazırla|Word/ }).count();
      // Mevcut kural (HdProfessionalReportButton: isAndroid → null; Android'de Word indirilemez) korunur.
      ok(d.ua === ANDROID ? wordBtns === 0 : wordBtns > 0, `${d.name}: Word rapor düğmesi ${d.ua === ANDROID ? "Android'de mevcut kural gereği gizli" : "yerinde"}`, wordBtns);
      // Sekme: açmak ücretli çağrı yapmaz
      const tab = m.locator("#hd-know-tab-variables");
      ok(await tab.isVisible(), `${d.name}: "Dört Ok ve PHS" sekmesi görünür (hd_system_reading yetkisiyle)`);
      await tab.click();
      const panel = m.locator(`[data-hd-variables="${A.chart}"]`);
      await panel.waitFor({ timeout: 15_000 });
      await sleep(300);
      ok(served === 0 && (await panel.locator("[data-hd-var-run]").isVisible()), `${d.name}: sekme açılınca hesap YAPILMAZ (0 istek); "Dört Ok Analizini Hesapla" düğmesi görünür`, served);
      ok((await panel.locator("[data-hd-var-precision]").innerText()).includes("doğum saatine çok duyarlıdır"), `${d.name}: doğum saati hassasiyet uyarısı hesaptan önce görünür`);
      // Çift tık → tek istek
      await panel.locator("[data-hd-var-run]").dblclick();
      await panel.locator('[data-hd-var-arrow="determination"]').waitFor({ timeout: 30_000 });
      ok(served === 1 && sentToProvider.length === 1, `${d.name}: çift tık → tek hesap isteği, tek sağlayıcı çağrısı`, { served, provider: sentToProvider.length });
      ok(JSON.stringify(Object.keys(sentToProvider[0]).sort()) === JSON.stringify(["date", "latitude", "longitude", "nodeType", "time", "timezone"]), `${d.name}: sağlayıcıya yalnız doğum anı alanları`, sentToProvider[0]);
      const cards = await panel.evaluate((root) => [...root.querySelectorAll("[data-hd-var-arrow]")].map((e) => {
        const r = e.getBoundingClientRect();
        return { key: e.getAttribute("data-hd-var-arrow"), x: r.left, y: r.top, w: r.width, conf: e.getAttribute("data-hd-var-confident"), vals: e.getAttribute("data-hd-var-values"), dir: e.querySelector("[data-hd-var-direction]")?.getAttribute("data-hd-var-direction"), cog: !!e.querySelector("[data-hd-var-cognition]"), sw: e.scrollWidth, cw: e.clientWidth };
      }));
      const by = Object.fromEntries(cards.map((c) => [c.key, c]));
      const twoCol = d.w >= 640;
      const layoutOk = cards.length === 4 && (twoCol
        ? by.determination.x < by.motivation.x - 20 && Math.abs(by.determination.x - by.environment.x) < 2 && Math.abs(by.motivation.x - by.perspective.x) < 2 && by.determination.y < by.environment.y && by.motivation.y < by.perspective.y
        : by.determination.y < by.environment.y && by.environment.y < by.motivation.y && by.motivation.y < by.perspective.y);
      ok(layoutOk, `${d.name}: konumlar — ${twoCol ? "sol üst Sindirim/PHS, sol alt Çevre, sağ üst Motivasyon, sağ alt Bakış Açısı" : "tek sütun: sol oklar (Sindirim/PHS, Çevre) sonra sağ oklar (Motivasyon, Bakış Açısı)"}`, cards.map((c) => [c.key, Math.round(c.x), Math.round(c.y)]));
      ok(cards.every((c) => { const [ct, dir] = String(c.vals).split(":"); const tone = Number(ct.split(".")[1]); return dir === (tone <= 3 ? "left" : "right") && c.dir === dir; }), `${d.name}: ok yönü Tone kuralıyla (1–3 sol, 4–6 sağ) ve gösterilen rozetle tutarlı`, cards.map((c) => [c.key, c.vals, c.dir]));
      ok(cards.every((c) => c.conf === "1") && (await panel.locator('[data-hd-var-overall="1"]').count()) === 1 && (await panel.locator("[data-hd-var-certainty-explainer], [data-hd-var-direction-possible], [data-hd-var-cell=\"possible\"]").count()) === 0,`${d.name}: A analizi — dört ok kesin, genel güvenilirlik kesin`);
      ok(by.determination.cog && !by.environment.cog && !by.motivation.cog && !by.perspective.cog, `${d.name}: Bilişsel Algı yalnız Sindirim/PHS (Determination) okunda`);
      ok(cards.every((c) => c.sw <= c.cw + 1) && !(await overflowX()), `${d.name}: kartlarda ve sayfada yatay taşma yok (uzun Türkçe kelime dahil)`, cards.map((c) => [c.key, c.sw, c.cw]));
      ok((await panel.locator("[data-hd-var-health]").innerText()).includes("tıbbi teşhis") && (await panel.locator("[data-hd-var-base-note]").innerText()).includes("bilgilendirme"), `${d.name}: PHS tıbbi tavsiye değildir + Base bilgilendirici notları görünür`);
      ok(!/roxy/i.test(await panel.innerText()), `${d.name}: kullanıcı metninde sağlayıcı markası yok`);
      await panel.screenshot({ path: path.join(OUT, `${d.name}-A-dort-ok.png`) });
      // Klavye: sekme düğmesine odak + Enter (Sistem Yorumu ↔ Dört Ok)
      await m.locator("#hd-know-tab-system").focus();
      await page.keyboard.press("Enter");
      await m.locator("#hd-know-tab-variables").focus();
      await page.keyboard.press("Enter");
      ok(await panel.locator('[data-hd-var-arrow="perspective"]').isVisible(), `${d.name}: klavye ile sekmeler arası geçiş; sonuç korunur (yeni istek yok: ${served})`);
      // Hızlı analiz değişimi: A için hesap sürerken modal kapanır, B açılır → A verisi B'de görünmez
      await closeChart();
      m = await openChart(B.hd);
      await m.locator("#hd-know-tab-variables").click();
      const pB = m.locator(`[data-hd-variables="${B.chart}"]`);
      await pB.waitFor({ timeout: 15_000 });
      ok((await pB.locator("[data-hd-var-arrow]").count()) === 0 && (await pB.locator("[data-hd-var-run]").isVisible()), `${d.name}: B analizi açıldığında A'nın sonucu GÖRÜNMEZ (panel analizle yeniden kurulur)`);
      delayFor.set(B.chart, 1500);
      await pB.locator("[data-hd-var-run]").click();
      await sleep(200);
      await closeChart();
      m = await openChart(A.hd);
      await m.locator("#hd-know-tab-variables").click();
      const pA2 = m.locator(`[data-hd-variables="${A.chart}"]`);
      await pA2.locator('[data-hd-var-arrow="determination"]').waitFor({ timeout: 15_000 });
      const servedBefore = served;
      await sleep(2200);
      const aVals = await pA2.locator("[data-hd-var-arrow]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-var-confident")).join());
      ok(aVals === "1,1,1,1" && (await page.locator(`[data-hd-variables="${B.chart}"]`).count()) === 0, `${d.name}: B'nin geç gelen yanıtı A ekranına yazılmaz; A oturum belleğinden (yeni istek yok: ${served - servedBefore === 0 ? "0" : served - servedBefore})`);
      delayFor.delete(B.chart);
      // B: sınırdaki oklar
      await closeChart();
      m = await openChart(B.hd);
      await m.locator("#hd-know-tab-variables").click();
      const pB2 = m.locator(`[data-hd-variables="${B.chart}"]`);
      await pB2.locator("[data-hd-var-run]").click();
      await pB2.locator('[data-hd-var-arrow="determination"]').waitFor({ timeout: 30_000 });
      const bCards = await pB2.evaluate((root) => Object.fromEntries([...root.querySelectorAll("[data-hd-var-arrow]")].map((e) => [e.getAttribute("data-hd-var-arrow"), {
        conf: e.getAttribute("data-hd-var-confident"), badge: e.querySelector("[data-hd-var-badge]")?.textContent, note: !!e.querySelector("[data-hd-var-uncertain-note]"),
        meanings: [...e.querySelectorAll("summary")].some((s) => (s.textContent ?? "").startsWith("Color, Tone")), cogShown: !!e.querySelector("[data-hd-var-cognition]"), cogHidden: !!e.querySelector("[data-hd-var-cognition-hidden]"),
        dirPossible: !!e.querySelector("[data-hd-var-direction-possible]"), dirText: e.querySelector("[data-hd-var-direction]")?.textContent ?? "",
        cells: [...e.querySelectorAll("[data-hd-var-cell]")].map((c) => c.getAttribute("data-hd-var-cell")).join(), base: e.querySelector("[data-hd-var-base-certain]")?.getAttribute("data-hd-var-base-certain"),
        aria: e.getAttribute("aria-label") ?? "",
      }])));
      ok(bCards.determination.conf === "0" && bCards.motivation.conf === "0" && bCards.environment.conf === "1" && bCards.perspective.conf === "1", `${d.name}: B analizi — sınırdaki oklar (Sindirim/PHS, Motivasyon) kesin DEĞİL, diğer ikisi kesin`, bCards);
      ok(bCards.determination.badge === "Kesinleştirilemedi" && bCards.determination.note && !bCards.determination.meanings && !bCards.motivation.meanings && bCards.environment.meanings, `${d.name}: belirsiz okta "Kesinleştirilemedi" + uyarı; Color/Tone/yön anlamı KESİN YORUM olarak gösterilmez (kesin oklarda gösterilir)`);
      ok(!bCards.determination.cogShown && bCards.determination.cogHidden, `${d.name}: Sindirim/PHS belirsizken Bilişsel Algı gösterilmez (açıkça belirtilir)`);
      ok(["determination", "motivation"].every((k) => bCards[k].dirPossible && bCards[k].dirText.startsWith("Olası yön:") && bCards[k].cells === "possible,possible" && bCards[k].base === "0" && bCards[k].aria.includes("olası Color"))
        && ["environment", "perspective"].every((k) => !bCards[k].dirPossible && !bCards[k].dirText.includes("Olası") && bCards[k].cells === "certain,certain" && bCards[k].base === "1" && !bCards[k].aria.includes("olası")),
        `${d.name}: belirsiz okta yön / Color / Tone / Base "olası" olarak işaretli; kesin oklarda görünüm değişmedi`, bCards);
      const overallB = await pB2.locator('[data-hd-var-overall="0"]').innerText();
      ok(overallB.includes("2/4") && (await pB2.locator("[data-hd-var-certainty-explainer]").count()) === 1 && overallB.includes("Kesin:") && overallB.includes("Olası:"), `${d.name}: genel uyarı "Dört okun tamamı kesin değil (2/4 ok)" + kesin ↔ olası farkı açıklaması`);
      ok(!(await overflowX()), `${d.name}: B analizinde yatay taşma yok`);
      await pB2.screenshot({ path: path.join(OUT, `${d.name}-B-sinirda.png`) });
      // Sayfa yenileme: istemci belleği boşalır (otomatik hesap yok); yeniden hesap sunucu önbelleğinden, yeni ücretli çağrı YOK
      await closeChart();
      const providerBeforeReload = sentToProvider.length;
      await page.reload();
      m = await openChart(A.hd);
      await m.locator("#hd-know-tab-variables").click();
      const pR = m.locator(`[data-hd-variables="${A.chart}"]`);
      await pR.waitFor({ timeout: 15_000 });
      const servedAfterReload = served;
      await sleep(300);
      ok((await pR.locator("[data-hd-var-arrow]").count()) === 0 && served === servedAfterReload && (await pR.locator("[data-hd-var-run]").isVisible()), `${d.name}: sayfa yenilenince sonuç kendiliğinden hesaplanmaz / gösterilmez (düğme bekler)`);
      await pR.locator("[data-hd-var-run]").click();
      await pR.locator('[data-hd-var-arrow="determination"]').waitFor({ timeout: 30_000 });
      const rVals = await pR.locator("[data-hd-var-arrow]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-var-confident")).join());
      ok(rVals === "1,1,1,1" && served === servedAfterReload + 1 && sentToProvider.length === providerBeforeReload, `${d.name}: yenileme sonrası yeniden hesap sunucu önbelleğinden (aynı A sonucu; yeni ücretli çağrı YOK)`, { served, provider: sentToProvider.length, providerBeforeReload });
      ok((await pR.locator('[data-hd-var-base-certain="1"]').count()) === 4 && (await pR.locator("[data-hd-var-historical-offset]").count()) === 0, `${d.name}: modern doğum — Base değerleri "?" olmadan, tarihsel ofset notu YOK`);
      // Tarihsel saniyeli ofset GÖRÜNÜMÜ (yalnız gösterim testi: gerçek servis yanıtı, sunucunun tarihsel-ofset kesinlik düşürmesinin
      // çıktı biçimine çevrilir — hesaplama mantığı service-harness 1f/1g + gerçek 1 000 çağrı analizinde doğrulandı)
      await closeChart();
      const page3 = await ctx.newPage();
      page3.on("pageerror", (e) => errors.push(`${d.name} p3: ${e.message}`));
      await page3.route("**/api/hd/charts/variables", async (route) => {
        const body = route.request().postDataJSON() as Json;
        const r = await computeChartVariables({ db: svc, tenantId: TA, userId: UA.id!, isDemo: false }, body, {
          config: { apiKey: "k", baseUrl: "https://example.invalid" },
          callVariables: async (_c, b) => ({ ok: true, raw: fakeVariables(b as unknown as Json, []) }),
          rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
        });
        const j = r.body as Json & { data?: Json & { arrows: Json[] } };
        if (j.data) { j.data.historicalOffset = true; j.data.arrows = j.data.arrows.map((a) => ({ ...a, baseCertain: false, confident: a.key === "motivation" ? false : a.confident })); j.data.confident = false; }
        try { await route.fulfill({ status: r.status, contentType: "application/json", body: JSON.stringify(j) }); } catch { /* iptal */ }
      });
      await page3.goto(`${APP}/human-design/danisanlar`);
      await page3.locator(`[data-hd-group-open="${A.hd}"]`).click();
      const m3 = page3.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await m3.locator("#hd-know-tab-variables").click();
      await m3.locator("[data-hd-var-run]").click();
      await m3.locator('[data-hd-var-arrow="determination"]').waitFor({ timeout: 30_000 });
      const hist = await m3.evaluate((root) => ({
        note: root.querySelector("[data-hd-var-historical-offset]")?.textContent ?? "",
        baseQ: [...root.querySelectorAll('[data-hd-var-base-certain="0"]')].map((e) => e.textContent ?? ""),
        motConf: root.querySelector('[data-hd-var-arrow="motivation"]')?.getAttribute("data-hd-var-confident"),
        overall: root.querySelector("[data-hd-var-overall]")?.getAttribute("data-hd-var-overall"),
      }));
      ok(hist.note.includes("yerel ortalama saat") && !/roxy/i.test(hist.note) && hist.baseQ.length === 4 && hist.baseQ.every((t) => t.endsWith("?")) && hist.motConf === "0" && hist.overall === "0",
        `${d.name}: tarihsel saniyeli ofset görünümü — not görünür, dört Base "?" ile, düşürülen ok kesin değil, genel uyarı`, hist);
      ok(!(await m3.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${d.name}: tarihsel ofset notuyla yatay taşma yok`);
      await m3.screenshot({ path: path.join(OUT, `${d.name}-C-tarihsel-ofset.png`) });
      await page3.close();
      m = await openChart(A.hd);
      // Ağ hatası → açık hata, sonuç yok
      await closeChart();
      const C = A; // aynı analizi oturum belleği olmadan yeni sekmede dene
      const page2 = await ctx.newPage();
      await page2.route("**/api/hd/charts/variables", (r) => r.abort("failed"));
      page2.on("pageerror", (e) => errors.push(`${d.name} p2: ${e.message}`));
      await page2.goto(`${APP}/human-design/danisanlar`);
      await page2.locator(`[data-hd-group-open="${C.hd}"]`).click();
      const m2 = page2.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
      await m2.locator("#hd-know-tab-variables").click();
      await m2.locator("[data-hd-var-run]").click();
      await m2.locator("[data-hd-var-error]").waitFor({ timeout: 15_000 });
      ok((await m2.locator("[data-hd-var-error]").innerText()).includes("Ağ hatası") && (await m2.locator("[data-hd-var-arrow]").count()) === 0, `${d.name}: ağ kesintisi → açık hata, sonuç yok`);
      await page2.close();
      ok(roxyDirect === 0, `${d.name}: tarayıcıdan sağlayıcıya doğrudan istek YOK`);
      await ctx.close();
    }

    section("hd_system_reading yetkisi olmayan kullanıcı");
    {
      const PN = { human_design: true, clients: true };
      const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript({ content: "window.__name = (f) => f;" });
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson(NOSR, PN)), NOSR.token!]);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`nosr: ${e.message}`));
      await page.goto(`${APP}/human-design/danisanlar`);
      const grp = page.locator(`[data-hd-group-open="${A.hd}"]`);
      if (await grp.count()) {
        await grp.click();
        const mn = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
        await mn.locator("[data-hd-info]").waitFor({ timeout: 90_000 });
        ok((await mn.locator("#hd-know-tab-variables").count()) === 0 && (await mn.locator("#hd-know-tab-system").count()) === 0, "hd_system_reading yoksa \"Dört Ok ve PHS\" sekmesi YOK (eski görünüm birebir)");
      } else ok(true, "yetkisiz kullanıcı bu analizi listede görmüyor (sekme denetimi uygulanamaz; uç denetimi aşağıda)");
      const res = await page.evaluate(async ([uid, tok, chart]) => {
        const r = await fetch("/api/hd/charts/variables", { method: "POST", headers: { "Content-Type": "application/json", "x-user-id": uid as string, "x-session-token": tok as string }, body: JSON.stringify({ chart_id: chart }) });
        return { status: r.status, body: await r.text() };
      }, [NOSR.id!, NOSR.token!, A.chart]);
      ok(res.status === 403 || res.status === 404, `yetkisiz kullanıcı uç noktayı doğrudan çağırırsa reddedilir (${res.status}; başka tenant'ın danışanı zaten görünmez)`, res);
      await ctx.close();
    }
    ok(errors.length === 0, "sayfa hatası (JS) yok", errors);
  } finally {
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      try {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true });
        else app.kill("SIGTERM");
      } catch { /* yok */ }
    }
    await env.stop();
  }
  console.log(`\nHD VARIABLES TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
