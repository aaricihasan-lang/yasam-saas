/**
 * HD PROFESYONEL HARİTA YERLEŞİMİ — GERÇEK TARAYICI ÖLÇÜMÜ (owner canlı kabul FAIL, 2026-10-17).
 *
 * Yatay taşma kontrolü dikey çakışmayı kaçırdığı için burada her ekranda DOM bounding rectangle'ları ölçülür:
 *   1 sol bilgi paneli · 2 logo · 3 harita sahnesi · 4 Merkezler kartının başlangıcı · 5 merkez etiketleri ·
 *   6 İmza açıklamasının görünür alanı. DİKEY TAŞMA, KART DIŞINA SARKMA ve ÜST ÜSTE BİNME ayrı ayrı test edilir.
 * Veri: uzun Reflektör (tüm merkezler açık, uzun strateji/tema/profil), çok tanımlı merkezli Jeneratör,
 * eski motor kaydı, kısmi Roxy kaydı (motor/awareness yok). Ekran görüntüleri: OUT klasörü.
 *
 * Ön koşul: test shim build (bkz. scripts/hd-live-accept/browser-e2e.ts). Next'e Roxy anahtarı verilmez.
 * Çalıştır: npx tsx scripts/hd-chart-layout/browser-e2e.ts [-- --out <klasör>] [-- --measure]
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, type TestEnv } from "../anamnez/testEnv";
import { TA, callRoute, installFakeRoxy, mkUser, startHdFlowEnv, type Auth, type Json } from "../hd-analysis-word-flow/env";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-chart-layout-browser");
const PORT = 3996;
const APP = `http://127.0.0.1:${PORT}`;
mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
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

type Device = { name: string; w: number; h: number; zoom?: number; mobile?: boolean };
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const DEVICES: Device[] = [
  { name: "1920x1080", w: 1920, h: 1080 },
  { name: "1920x1080@125", w: 1920, h: 1080, zoom: 1.25 },
  { name: "1680x900", w: 1680, h: 900 },
  { name: "1680x900@125", w: 1680, h: 900, zoom: 1.25 },
  { name: "1366x768", w: 1366, h: 768 },
  { name: "1366x768@125", w: 1366, h: 768, zoom: 1.25 },
  { name: "1280x720", w: 1280, h: 720 },
  { name: "1280x720@125", w: 1280, h: 720, zoom: 1.25 },
  { name: "390", w: 390, h: 844, mobile: true },
  { name: "360", w: 360, h: 760, mobile: true },
  { name: "320", w: 320, h: 640, mobile: true },
];

type R = { x: number; y: number; w: number; h: number; b: number; r: number };
type Measure = {
  vw: number; vh: number; wide: boolean;
  modalScroller: R | null; onelook: R | null; info: R | null; stage: R | null; bodygraph: R | null; brand: R | null; logo: R | null;
  centersCard: R | null; nextCard: R | null; colDesign: R | null; colPersonality: R | null;
  extra: R | null; extraVisible: boolean; extraFields: Array<{ f: string; r: R; clipped: boolean }>;
  keynotes: R | null; keynoteFields: Array<{ f: string; r: R; clipped: boolean }>; bottomCards: R[]; onelookFieldNames: string[];
  fields: Array<{ f: string; r: R; clipped: boolean }>;
  signatureHelp: { r: R | null; visible: boolean; inPanel: boolean };
  centerRows: Array<{ code: string; row: R; parts: Array<{ k: string; r: R; clipped: boolean }> }>;
  docOverflowX: boolean;
};

async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const rr = (e: Element | null) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), r: Math.round(b.right) };
    };
    const dlg = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"]')!;
    const q = (s: string) => dlg.querySelector(s);
    const info = q("[data-hd-info]");
    const onelook = q("[data-hd-onelook]");
    const centersCard = q("[data-hd-centers-card]") ?? (q('[data-hd-center]')?.closest("div.rounded-xl") ?? null);
    const help = [...dlg.querySelectorAll("[data-hd-signature-help]")].find((e) => (e as HTMLElement).offsetParent !== null) ?? null;
    const helpR = rr(help);
    const helpVisible = !!help && getComputedStyle(help).display !== "none" && getComputedStyle(help).visibility !== "hidden" && (helpR?.h ?? 0) > 0;
    const infoR = rr(info);
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      wide: window.matchMedia("(min-width: 1280px) and (min-aspect-ratio: 8/5)").matches,
      modalScroller: rr(dlg.querySelector(".overflow-y-auto")),
      onelook: rr(onelook),
      info: infoR,
      stage: rr(q("[data-hd-stage]")),
      bodygraph: rr(q("[data-hd-renderer]")),
      brand: rr(q("[data-hd-brand]")),
      logo: rr(q("[data-hd-brand] img")),
      centersCard: rr(centersCard),
      nextCard: rr(onelook?.nextElementSibling ?? null),
      colDesign: rr(q('[data-hd-stage] [data-hd-side="design"]')?.parentElement ?? null),
      colPersonality: rr(q('[data-hd-stage] [data-hd-side="personality"]')?.parentElement ?? null),
      extra: rr(q("[data-hd-info-extra]")),
      extraVisible: !!q("[data-hd-info-extra]") && getComputedStyle(q("[data-hd-info-extra]")!).display !== "none",
      extraFields: [...dlg.querySelectorAll("[data-hd-info-extra] [data-hd-info-field]")].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => ({
        f: e.getAttribute("data-hd-info-field") ?? "",
        r: rr(e)!,
        clipped: [...e.querySelectorAll("dt,dd")].some((d) => (d as HTMLElement).scrollWidth > (d as HTMLElement).clientWidth + 1 || (d as HTMLElement).scrollHeight > (d as HTMLElement).clientHeight + 1),
      })),
      keynotes: rr(q("[data-hd-keynotes]")),
      keynoteFields: [...dlg.querySelectorAll("[data-hd-keynotes] [data-hd-info-field]")].map((e) => ({
        f: e.getAttribute("data-hd-info-field") ?? "",
        r: rr(e)!,
        clipped: [...e.querySelectorAll("dt,dd")].some((d) => (d as HTMLElement).scrollWidth > (d as HTMLElement).clientWidth + 1),
      })),
      // Alt bölümdeki diğer kartlar (Merkezler, Kanallar, Kapılar) — Ek bilgiler kutusu bunlara binmemeli.
      bottomCards: [...(onelook?.nextElementSibling?.querySelectorAll(":scope > div, :scope > div > div") ?? [])].filter((e) => !e.hasAttribute("data-hd-keynotes") && e.classList.contains("rounded-xl")).map((e) => rr(e)!),
      onelookFieldNames: [...(onelook?.querySelectorAll("[data-hd-info-field]") ?? [])].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.getAttribute("data-hd-info-field") ?? ""),
      // Yalnız GÖRÜNÜR sol panel alanları.
      fields: [...dlg.querySelectorAll("[data-hd-info] [data-hd-info-field]")].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => ({
        f: e.getAttribute("data-hd-info-field") ?? "",
        r: rr(e)!,
        clipped: [...e.querySelectorAll("dt,dd")].some((d) => (d as HTMLElement).scrollWidth > (d as HTMLElement).clientWidth + 1 || (d as HTMLElement).scrollHeight > (d as HTMLElement).clientHeight + 1),
      })),
      signatureHelp: (() => {
        const host = help?.closest("[data-hd-keynotes], [data-hd-info-extra], [data-hd-info]") ?? null;
        const hr = rr(host);
        return { r: helpR, visible: helpVisible, inPanel: !!helpR && !!hr && helpR.x >= hr.x - 1 && helpR.r <= hr.r + 1 && helpR.y >= hr.y - 1 && helpR.b <= hr.b + 1 };
      })(),
      centerRows: [...dlg.querySelectorAll("[data-hd-center]")].map((li) => ({
        code: li.getAttribute("data-hd-center") ?? "",
        row: rr(li)!,
        parts: [...li.querySelectorAll("[data-hd-center-part]")].map((p) => ({
          k: p.getAttribute("data-hd-center-part") ?? "",
          r: rr(p)!,
          clipped: (p as HTMLElement).scrollWidth > (p as HTMLElement).clientWidth + 1,
        })),
      })),
      docOverflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    } satisfies Record<string, unknown>;
  }) as Promise<Measure>;
}

const inside = (a: R | null, b: R | null, tol = 1) => !!a && !!b && a.x >= b.x - tol && a.y >= b.y - tol && a.r <= b.r + tol && a.b <= b.b + tol;
const overlap = (a: R, b: R) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;

async function main() {
  const env: TestEnv = await startHdFlowEnv({ port: 54432, dirName: "hd-chart-layout-browser-pgdata", httpPort: 54523 });
  const su = env.su;
  const roxy = installFakeRoxy();
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const errors: string[] = [];
  let roxyReq = 0;
  const report: Record<string, unknown> = {};
  try {
    const PA = { human_design: true, clients: true, hd_system_reading: true };
    const UA: Auth = await mkUser(su, "HCLA", TA, PA);
    const jr = await import("../../app/api/hd/clients/journey/route");
    const rr = await import("../../app/api/hd/charts/roxy/route");
    const mk = async (ad: string, soyad: string) => {
      const c = await callRoute(jr.POST, "POST", UA, { action: "create_new", ad, soyad, dogum: "2018-07-20", birth_time: "19:00", birth_location_ref: "trd-42-selcuklu", request_id: randomUUID() });
      const hd = String(c.json.hd_client_id);
      const ch = await callRoute(rr.POST, "POST", UA, { client_id: hd, location_id: "client" });
      return { hd, chart: String(ch.json.id) };
    };
    // 1) Jeneratör: çok tanımlı merkez (gerçek fixture).
    const GEN = await mk("Jeneratör", "Çok Merkezli");
    // 2) Reflektör: tüm merkezler açık, en uzun strateji, uzun haç adı, uzun iki dilli profil (yalnız test verisi).
    const REF = await mk("Reflektör Uzunisimli", "Çokuzunsoyadlıdanışan");
    await su.query(
      `update public.human_design_charts set
         computed_result = jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(computed_result,
           '{type}', '"Reflector"'), '{strategy}', '"Wait a lunar cycle"'), '{signature}', '"Surprise"'), '{notSelf}', '"Disappointment"'),
           '{appCodes}', (computed_result->'appCodes') || '{"type_code":"reflector","authority_code":"lunar","definition_code":"none","profile_code":"3_5","active_centers":[],"open_centers":["head","ajna","throat","g_identity","heart_ego","sacral","solar_plexus","spleen","root"],"channels":[]}'::jsonb),
           '{incarnationCross,name}', '"Left Angle Cross of the Clarion 2"'), '{centers,defined}', '[]'::jsonb), '{channels}', '[]'::jsonb),
         provider_raw = jsonb_set(jsonb_set(provider_raw, '{centers}', (select jsonb_agg(c || '{"defined":false}'::jsonb) from jsonb_array_elements(provider_raw->'centers') c)), '{channels}', '[]'::jsonb),
         type_code='reflector', authority_code='lunar', definition_code='none', profile_code='3_5'
       where id=$1`,
      [REF.chart],
    );
    // 3) Kısmi Roxy kaydı: motor / awareness alanları yok (eski Roxy sürümü).
    const PART = await mk("Kısmi", "Roxy Kaydı");
    await su.query(`update public.human_design_charts set provider_raw = jsonb_set(provider_raw, '{centers}', (select jsonb_agg(c - 'motor' - 'awareness') from jsonb_array_elements(provider_raw->'centers') c)) where id=$1`, [PART.chart]);
    // 4) Eski dahili motor kaydı: provider yok (eski renderer, strateji/imza sağlayıcı değeri yok).
    const OLD = await mk("Eski", "Motor Kaydı");
    await su.query(`update public.human_design_charts set provider=null, provider_raw=null, computed_result = (computed_result - 'provider' - 'strategy' - 'signature' - 'notSelf' - 'appCodes') where id=$1`, [OLD.chart]);
    roxy.restore();
    const seeds = { GEN, REF, PART, OLD };

    const userJson: Json = {
      id: UA.id, tenant_id: TA, full_name: "ZZ_HCLA", email: "zz.hcla@example.test", role: "expert", active: true,
      approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: PA,
    };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1", HD_LOCATION_REF_SECRET: "zz-hd-flow-test-secret" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    // HD_LAYOUT_ONLY=1366x768,390 → yalnız bu ekranlar (teşhis için).
    const only = (process.env.HD_LAYOUT_ONLY ?? "").split(",").filter(Boolean);
    for (const d of DEVICES.filter((x) => !only.length || only.includes(x.name))) {
      const z = d.zoom ?? 1;
      const ctx = await browser.newContext({
        viewport: { width: Math.round(d.w / z), height: Math.round(d.h / z) }, deviceScaleFactor: z,
        isMobile: !!d.mobile, hasTouch: !!d.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.mobile ? { userAgent: IPHONE } : {}),
      });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      // tsx/esbuild keepNames: page.evaluate içindeki adlandırılmış fonksiyonlar __name çağırır → tarayıcıda tanımla.
      await ctx.addInitScript({ content: "window.__name = (f) => f;" });
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      page.on("request", (r) => { if (/\/api\/hd\/charts\/roxy|roxyapi\.com/.test(r.url())) roxyReq++; });
      page.on("pageerror", (e) => errors.push(`${d.name}: ${e.message}`));
      await page.goto(`${APP}/human-design/danisanlar`);
      for (const [key, s] of Object.entries(seeds)) {
        section(`${d.name} — ${key}`);
        await page.locator(`[data-hd-group-open="${s.hd}"]`).click();
        const m0 = page.locator('[role="dialog"][aria-labelledby="hd-computed-detay-title"]');
        await m0.locator("[data-hd-info]").waitFor({ timeout: 90_000 });
        await m0.locator("[data-hd-knowledge-tabs]").waitFor({ timeout: 90_000 });
        await page.waitForTimeout(400);
        const M = await measure(page);
        report[`${d.name}:${key}`] = M;
        const tag = `${d.name} ${key}`;
        // 1) Sol bilgi paneli: harita kompozisyonunun içinde; dikey taşma yok.
        ok(inside(M.info, M.onelook), `${tag}: bilgi paneli harita kartının içinde (dikey sarkma yok)`, { info: M.info, onelook: M.onelook });
        ok(M.fields.every((f) => inside(f.r, M.info)), `${tag}: tüm bilgi alanları panel sınırları içinde`, M.fields.filter((f) => !inside(f.r, M.info)).map((f) => f.f));
        ok(M.fields.every((f) => !f.clipped), `${tag}: hiçbir başlık/değer kesilmiyor`, M.fields.filter((f) => f.clipped).map((f) => f.f));
        const fo = M.fields.flatMap((a, i) => M.fields.slice(i + 1).filter((b) => overlap(a.r, b.r)).map((b) => `${a.f}×${b.f}`));
        ok(fo.length === 0, `${tag}: bilgi alanları üst üste binmiyor`, fo);
        // 2) Logo: panelin/kartın içinde, hiçbir alanla ve Merkezler kartıyla çakışmıyor, oran korunur.
        ok(!M.logo || (inside(M.logo, M.info) && M.fields.every((f) => !overlap(f.r, M.logo!))), `${tag}: logo bilgi paneli içinde, alanlarla çakışmıyor`, { logo: M.logo, info: M.info });
        ok(!M.logo || !M.nextCard || M.logo.b <= M.nextCard.y, `${tag}: logo Merkezler kartının üzerine binmiyor`, { logo: M.logo, next: M.nextCard });
        ok(!M.logo || (M.logo.w >= 40 && M.logo.h >= 30), `${tag}: logo görünür boyutta (küçülse de kaybolmuyor)`, M.logo);
        // 3) Harita sahnesi: kart içinde, bilgi paneliyle çakışmıyor; harita boyutu korunuyor.
        ok(inside(M.stage, M.onelook) && !!M.info && !!M.stage && !overlap(M.info, M.stage), `${tag}: harita sahnesi kart içinde, bilgi paneliyle çakışmıyor`, { stage: M.stage, info: M.info });
        if (!d.mobile) {
          const minBg = Math.min(560, Math.round(M.vh * 0.62));
          ok(!!M.bodygraph && M.bodygraph.h >= minBg, `${tag}: BodyGraph yüksekliği korunuyor (≥ ${minBg}px)`, M.bodygraph);
        } else {
          ok(!!M.bodygraph && M.bodygraph.w >= M.vw - 80, `${tag}: mobilde BodyGraph tam genişlik`, M.bodygraph);
        }
        // 3b) Design / Personality sütunları sahnenin İÇİNDE (dikey taşma yok) ve bilgi paneliyle çakışmıyor.
        ok(inside(M.colDesign, M.stage) && inside(M.colPersonality, M.stage), `${tag}: Design/Personality sütunları sahne içinde (dikey taşma yok)`, { d: M.colDesign, p: M.colPersonality, stage: M.stage });
        ok(!!M.info && !!M.colDesign && !!M.colPersonality && !overlap(M.info, M.colDesign) && !overlap(M.info, M.colPersonality), `${tag}: sütunlar bilgi paneline binmiyor`, { info: M.info, d: M.colDesign });
        ok(!M.bodygraph || inside(M.bodygraph, M.stage), `${tag}: BodyGraph sahne içinde`, { bg: M.bodygraph, stage: M.stage });
        // 3c) İlk ekran sadeleştirme (owner 2026-10-17, #419 FAIL): ilk ekranda YALNIZ çekirdek bilgiler; sağ ek kart YOK;
        //     Strateji / İmza / Kendilik Dışı Tema haritanın ALTINDAKİ "Ek Human Design Bilgileri" kutusunda.
        const CORE = "name,local,place,coords,age,type,profile,definition,cross,authority";
        ok(M.fields.map((f) => f.f).join(",") === CORE, `${tag}: sol panel = kimlik + Tip/Profil/Tanım/Enkarnasyon Teması/İç Otorite`, M.fields.map((f) => f.f));
        ok(!M.extra && !M.onelookFieldNames.some((f) => ["strategy", "signature", "notSelf"].includes(f)), `${tag}: ilk ekranda (harita kartı) Strateji/İmza/Kendilik Dışı Tema ve sağ ek kart YOK`, M.onelookFieldNames);
        ok(!!M.keynotes && !!M.onelook && M.keynotes.y >= M.onelook.b && M.keynoteFields.map((f) => f.f).join(",") === "strategy,signature,notSelf", `${tag}: "Ek Human Design Bilgileri" haritanın ALTINDA: Strateji / İmza / Kendilik Dışı Tema`, { k: M.keynotes, fields: M.keynoteFields.map((f) => f.f) });
        ok(M.keynoteFields.every((f) => inside(f.r, M.keynotes) && !f.clipped) && !!M.keynotes && M.keynotes.x >= 0 && M.keynotes.r <= M.vw + 0.5, `${tag}: ek kutu alanları kutu içinde, kesilmiyor, ekrana sığıyor`);
        ok(!!M.keynotes && M.bottomCards.every((c) => !overlap(c, M.keynotes!)), `${tag}: ek kutu Merkezler / Kanallar / Kapılar kartlarına binmiyor`, { k: M.keynotes, cards: M.bottomCards });
        if (M.wide) ok(!!M.logo && M.logo.b <= M.vh && M.logo.y >= 0, `${tag}: logo İLK EKRANDA tamamen görünür`, { logo: M.logo, vh: M.vh });
        // 4) Merkezler kartı harita kompozisyonundan SONRA başlar (çakışma yok).
        ok(!!M.onelook && !!M.nextCard && M.nextCard.y >= M.onelook.b, `${tag}: Merkezler kartı harita kartının altından başlıyor`, { onelookBottom: M.onelook?.b, centersTop: M.nextCard?.y });
        // 5) Merkez satırları: ad / nitelik / durum ayrı, binmez, kesilmez; 9 merkez eksiksiz.
        ok(M.centerRows.length === 9, `${tag}: 9 merkez listede`, M.centerRows.length);
        const rowBad = M.centerRows.filter((c) => c.parts.some((p) => p.clipped) || c.parts.some((p, i) => c.parts.slice(i + 1).some((q) => overlap(p.r, q.r))) || c.parts.some((p) => !inside(p.r, c.row)));
        ok(rowBad.length === 0, `${tag}: merkez adı / Motor-Farkındalık / durum etiketleri binmiyor, kesilmiyor, satır içinde`, rowBad.map((c) => c.code));
        const rowsOverlap = M.centerRows.flatMap((a, i) => M.centerRows.slice(i + 1).filter((b) => overlap(a.row, b.row)).map((b) => `${a.code}×${b.code}`));
        ok(rowsOverlap.length === 0, `${tag}: merkez satırları birbirine binmiyor`, rowsOverlap);
        // 6) İmza açıklaması: dar kolonda sürekli açık değil; erişilebilir kontrol var; açılınca kart içinde.
        ok(!M.signatureHelp.visible || M.signatureHelp.inPanel, `${tag}: İmza açıklaması (görünürse) panel sınırları içinde`, M.signatureHelp);
        ok(!M.docOverflowX, `${tag}: yatay taşma yok`);
        // 6b) İmza açıklaması varsayılan kapalı; "i" ile açılır, panel + kart içinde kalır, Merkezler kartına binmez.
        const tog = m0.locator("[data-hd-signature-help-toggle]:visible");
        if (await tog.count()) {
          ok(!M.signatureHelp.visible, `${tag}: İmza açıklaması dar kolonda sürekli açık DEĞİL (kapalı başlar)`);
          await tog.click();
          await m0.locator("[data-hd-signature-help]:visible").waitFor();
          await page.waitForTimeout(150);
          const M2 = await measure(page);
          ok(M2.signatureHelp.visible && M2.signatureHelp.inPanel && !!M2.keynotes && M2.bottomCards.every((c) => !overlap(c, M2.keynotes!)) && !!M2.nextCard && !!M2.onelook && M2.nextCard.y >= M2.onelook.b,
            `${tag}: İmza açıklaması ek kutuda açılır, kutu içinde kalır, diğer kartlara binmez`, { help: M2.signatureHelp, k: M2.keynotes });
          ok((await tog.getAttribute("aria-expanded")) === "true", `${tag}: bilgi düğmesi erişilebilir (aria-expanded)`);
          await tog.click();
        }
        // İLK EKRAN görüntüsü: pencere en üstte (İmza düğmesi tıklaması alt bölüme kaydırmış olabilir).
        await page.evaluate(() => {
          const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null;
          if (sc) sc.scrollTop = 0;
        });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(OUT, `${d.name}-${key}.png`), fullPage: false });
        // İkinci görüntü: harita kartının alt kenarı + Merkezler kartı (dikey çakışma bölgesi).
        await page.evaluate(() => {
          const sc = document.querySelector('[role="dialog"][aria-labelledby="hd-computed-detay-title"] .overflow-y-auto') as HTMLElement | null;
          const ol = document.querySelector("[data-hd-onelook]") as HTMLElement | null;
          if (sc && ol) sc.scrollTop = Math.max(0, ol.offsetTop + ol.offsetHeight - sc.clientHeight / 2);
        });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(OUT, `${d.name}-${key}-alt.png`), fullPage: false });
        await m0.getByRole("button", { name: "Kapat" }).click();
        await m0.waitFor({ state: "detached" });
      }
      await ctx.close();
    }
    section("Genel");
    ok(roxyReq === 0, "harita açma: Roxy isteği 0", roxyReq);
    ok(errors.length === 0, "sayfa JS hatası yok", errors.slice(0, 5));
  } finally {
    writeFileSync(path.join(OUT, "measurements.json"), JSON.stringify(report, null, 1));
    try { await browser?.close(); } catch { /* kapandı */ }
    if (app?.pid) {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
      else app.kill("SIGTERM");
    }
    await env.stop();
  }
  console.log(`\nHD HARİTA YERLEŞİMİ TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri + ölçümler: ${OUT})`);
  if (fail) { for (const f of [...new Set(fails)].slice(0, 80)) console.log(" -", f); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
