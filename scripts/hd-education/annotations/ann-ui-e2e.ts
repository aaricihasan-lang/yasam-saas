/**
 * FAZ 8 — Eğitim Çalışma Alanı · ÇİZİM KATMANI · GERÇEK TARAYICI uçtan uca testi (bölüm 23).
 * Playwright → `next start` (gerçek Next uygulaması) → gerçek route'lar → PostgREST shim → izole embedded-postgres (gerçek migration'lar).
 * Kapsam: tüm araçlar (A–J), kaydet / yeniden aç, kaydedilmemiş değişiklik uyarısı, CAS (iki cihaz), sunum modu, dokunma + kalem
 * (CDP gerçek touch / pen işaretçisi), 8 genişlikte OTOMATİK koordinat kayması ölçümü, araç çubuğu ↔ BodyGraph çakışması, yatay taşma,
 * özel kayıt + izin geri çekme, eğitmen izolasyonu, owner listeleme / inceleme / kaldırma, normal admin. Veri SENTETİK (ZZ_*).
 * FİZİKSEL CİHAZ TESTİ DEĞİLDİR (masaüstü Chromium emülasyonu).
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/annotations/ann-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { PRIVATE_RPCS } from "../private/pgSchema";
import { ANN_RPCS, annotationSql, seedCentralSubject } from "./annSeed";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3986;
const APP = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const WIDTHS = [1440, 1024, 820, 768, 430, 390, 360, 320];
const shots: string[] = [];
async function snap(page: Page, name: string, full = false) {
  const file = path.join(OUT, `${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: full });
  shots.push(name);
}
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}
type Box = { x: number; y: number; width: number; height: number };
const center = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const intersects = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let env: TestEnv | null = null;
  const external: string[] = [];
  const consoleErrors: string[] = [];
  const badResponses = new Map<string, number>();
  let providerReq = 0;
  try {
    env = await startAnamnezTestEnv({
      port: Number(process.env.HD_EDU_ANN_UI_PG_PORT ?? 54870 + (Date.now() % 40)), httpPort: 54398, dirName: `hd-edu-ann-ui-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: [...PRIVATE_RPCS, ...ANN_RPCS], extraSql: annotationSql(),
    });
    const su = env.su;
    su.on("error", (e) => { consoleErrors.push(`pg bağlantısı düştü: ${e.message}`); });
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    await q(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
    type U = { id: string; token: string; name: string; role: "admin" | "expert"; tenant: string };
    const mkUser = async (role: "admin" | "expert", name: string, superAdmin = false): Promise<U> => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-annui-${randomUUID()}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_T_${name}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.annui.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role, tenant };
    };
    const OWNER = await mkUser("admin", "ZZ Owner", true);
    const ADMIN = await mkUser("admin", "ZZ Normal Admin");
    const A = await mkUser("expert", "ZZ Eğitmen Ayşe");
    const B = await mkUser("expert", "ZZ Eğitmen Bora");
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [A, B]) await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const S1 = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik Bilimci", publish: true });
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts`)).rows[0].body_sha256 as string;
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ_SENTETIK_IZIN\n"), Buffer.alloc(300, 0x20)]).toString("base64");
    let n = 0;
    const privItem = async (w: U, title: string) => {
      const client = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [w.tenant, w.id, `ZZ Danışan ${++n}`])).rows[0].id as string;
      const chart = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw)
          values ($1,$2,$3,'computed','2018-07-20',$4,'UTC',$5,'roxyapi',$6) returning id`,
        [w.tenant, w.id, client, `16:${String(n).padStart(2, "0")}`, JSON.stringify({ ...(SNAP.computed_result as object), zz: n }), JSON.stringify(SNAP.provider_raw)])).rows[0].id as string;
      const consent = (await q(`select public.hd_edu_priv_consent_record($1,$2,'ZZ İzin Veren','danisan','anonim',false,false,'hd-egitim-izin-v1',$3,current_date,'islak_imza_tarama',$4,'application/pdf') v`,
        [w.id, client, sha, pdf])).rows[0].v as string;
      const item = (await q(`select public.hd_edu_priv_item_add($1,$2,$3,$4,'Örnek Danışan','alias','tip',null,null) v`, [w.id, chart, consent, title])).rows[0].v as string;
      return { client, chart, consent, item };
    };
    const PA = await privItem(A, "Sakral otorite örneği");

    const envv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_PRIVATE_EDUCATION_ENABLED: "true", HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete envv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete envv.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: envv as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    const appLog: string[] = [];
    app.stdout?.on("data", (d) => appLog.push(String(d))); app.stderr?.on("data", (d) => appLog.push(String(d)));
    process.on("exit", () => { try { writeFileSync(path.join(OUT, "_next-sunucu.log"), appLog.join("").slice(-200000)); } catch { /* */ } });
    const appPid = app.pid;
    process.on("exit", () => { if (appPid && process.platform === "win32") { try { execSync(`taskkill /pid ${appPid} /T /F`, { stdio: "ignore" }); } catch { /* zaten kapalı */ } } });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const wire = (p: Page) => {
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 300)}`); });
      p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${e.message.slice(0, 300)}`));
      p.on("response", (r) => { if (r.status() >= 400) { const k = `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`; badResponses.set(k, (badResponses.get(k) ?? 0) + 1); } });
    };
    const ctxFor = async (u: U, w: number, h: number, mobile: boolean): Promise<BrowserContext> => {
      const ctx = await browser!.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(u.role === "admin" ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: "zz@example.test", role: u.role, active: true, approval_status: "approved",
        package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: u.role === "expert" ? { human_design: true, clients: true } : {} };
      await ctx.addInitScript(([pu, tok]) => { try { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); } catch { /* */ } }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        if (/\/compute|roxyapi|\/api\/hd\/charts\/roxy/.test(url.pathname)) providerReq++;
        return route.continue();
      });
      ctx.on("page", (p) => wire(p));
      return ctx;
    };
    const open = async (ctx: BrowserContext, url: string) => { const p = await ctx.newPage(); p.setDefaultTimeout(45000); await p.goto(`${APP}${url}`, { waitUntil: "load", timeout: 90000 }); return p; };
    const wsUrl = `/human-design/egitim-haritalari/${S1.id}/calisma-alani`;
    const ready = async (p: Page) => { await p.waitForSelector("[data-ann-workspace] [data-hd-cbg]"); await p.waitForSelector("[data-ann-status]"); };
    const stageBox = async (p: Page) => (await p.locator("[data-ann-stage]").first().boundingBox()) as Box;
    const els = (p: Page, t?: string) => p.locator(t ? `[data-ann-overlay] [data-ann-type='${t}']` : "[data-ann-overlay] [data-ann-el]").count();
    const layerRow = async (u: U, kind = "central") => (await q(`select revision, el_count, doc from public.hd_edu_annotation_layers where trainer_user_id=$1 and source_kind=$2`, [u.id, kind])).rows[0] as { revision: number; el_count: number; doc: { els: Array<Record<string, unknown>> } } | undefined;
    /** Tuval (viewBox) noktası → ekran (CTM ile; ölçüm için). */
    const drag = async (p: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) => {
      await p.mouse.move(from.x, from.y); await p.mouse.down();
      for (let i = 1; i <= steps; i++) await p.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await p.mouse.up();
    };
    const gateCenter = async (p: Page, g: number) => center((await p.locator(`[data-hd-cbg] [data-hd-cbg-gate^='${g}:']`).first().boundingBox()) as Box);
    const centerOf = async (p: Page, c: string) => center((await p.locator(`[data-hd-cbg] [data-hd-cbg-center^='${c}:']`).first().boundingBox()) as Box);

    // ── 1) Eğitmen A · merkezî harita · tüm araçlar (masaüstü 1440) ────────────────────────────────
    section("1 · Merkezî harita: araçlar A–J (masaüstü, fare)");
    const actx = await ctxFor(A, 1440, 900, false);
    const det = await open(actx, `/human-design/egitim-haritalari/${S1.id}`);
    await det.waitForSelector("[data-edu-workspace]");
    await det.click("[data-edu-workspace]");
    await det.waitForURL(/calisma-alani/);
    const p = det;
    await ready(p);
    ok((await els(p)) === 0, "ilk açılış: boş katman");
    ok(/1869/.test(await p.locator("[data-ann-workspace] header").innerText()), "merkezî arşivde belgeli doğum bilgisi başlıkta görünür");
    await snap(p, "W1-merkezi-bos-desktop");
    let sb = await stageBox(p);
    const rail = (await p.locator("[data-ann-toolbar]").boundingBox()) as Box;
    const side = (await p.locator("aside").first().boundingBox()) as Box;
    ok(!intersects(rail, sb) && !intersects(side, sb), "masaüstü: araç rayı ve yan panel BodyGraph sahnesine BİNMEZ", { rail, sb, side });
    ok(sb.height >= 700, "masaüstü: BodyGraph küçültülmedi (sahne yüksekliği ≥ 700 px)", sb.height);
    // A Kalem
    await p.click("[data-ann-tool-btn='pen']");
    await drag(p, { x: sb.x + sb.width * 0.25, y: sb.y + sb.height * 0.3 }, { x: sb.x + sb.width * 0.4, y: sb.y + sb.height * 0.45 }, 20);
    ok((await els(p, "pen")) === 1, "A · Kalem: serbest çizim eklendi");
    ok((await p.locator("[data-ann-status='dirty']").count()) === 1, "kaydedilmemiş değişiklik durumu gösterildi");
    // B Ok
    await p.click("[data-ann-tool-btn='arrow']");
    await drag(p, { x: sb.x + sb.width * 0.15, y: sb.y + sb.height * 0.2 }, { x: sb.x + sb.width * 0.4, y: sb.y + sb.height * 0.35 });
    ok((await els(p, "arrow")) === 1, "B · Ok çizildi");
    // C Daire
    await p.click("[data-ann-color='amber']");
    await p.click("[data-ann-tool-btn='circle']");
    const gc = await centerOf(p, "G");
    await drag(p, gc, { x: gc.x + 48, y: gc.y });
    ok((await els(p, "circle")) === 1, "C · Daire / vurgu çizildi (turuncu)");
    // D Baloncuk → kapı 34'e çapalı + not
    await p.click("[data-ann-color='violet']");
    await p.click("[data-ann-tool-btn='bubble']");
    const g34 = await gateCenter(p, 34);
    await p.mouse.click(g34.x + 6, g34.y - 8);
    await p.waitForSelector("[data-ann-note-input]");
    await p.fill("[data-ann-note-input]", "Kapı 34: sakral güç — ZZ ders notu <script>x</script>");
    ok((await p.inputValue("[data-ann-note-input]")).includes("<") === false, "D · not alanı < ve > karakterlerini kabul etmez (HTML/script)");
    const bub = p.locator("[data-ann-overlay] [data-ann-type='bubble']").first();
    ok((await bub.getAttribute("data-ann-anchor")) === "g:34", "D · Baloncuk kapı 34'e SEMANTİK olarak çapalandı", await bub.getAttribute("data-ann-anchor"));
    // E Metin → Sakral merkezi
    await p.click("[data-ann-color='ink']");
    await p.click("[data-ann-tool-btn='text']");
    const sac = await centerOf(p, "Sacral");
    await p.mouse.click(sac.x, sac.y + 4);
    await p.fill("[data-ann-text-input]", "Yanıt veren güç");
    await p.click("[data-ann-text-add]");
    ok((await els(p, "text")) === 1, "E · Metin notu eklendi");
    // F Seç / taşı (daire)
    await p.click("[data-ann-tool-btn='select']");
    const circ = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().boundingBox()) as Box;
    const before = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().getAttribute("cx"));
    await drag(p, { x: circ.x + 4, y: circ.y + circ.height / 2 }, { x: circ.x + 4 + 30, y: circ.y + circ.height / 2 + 20 });
    const after = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().getAttribute("cx"));
    ok(before !== after, "F · Seç / taşı: daire taşındı", { before, after });
    await snap(p, "W2-merkezi-araclar-secili-desktop");
    // G Sil (ok)
    await p.click("[data-ann-tool-btn='erase']");
    const arr = (await p.locator("[data-ann-overlay] [data-ann-type='arrow'] line").first().boundingBox()) as Box;
    await p.mouse.click(arr.x + arr.width / 2, arr.y + arr.height / 2);
    ok((await els(p, "arrow")) === 0, "G · Sil: ok silindi");
    // H Geri al / yinele
    await p.click("[data-ann-undo]");
    ok((await els(p, "arrow")) === 1, "H · Geri al: ok geri geldi");
    await p.click("[data-ann-redo]");
    ok((await els(p, "arrow")) === 0, "H · Yinele: ok yeniden silindi");
    await p.click("[data-ann-undo]");
    ok((await els(p, "arrow")) === 1, "H · Geri al (klavye öncesi): ok geri");
    await p.keyboard.press("Control+z");
    await p.keyboard.press("Control+y");
    ok((await els(p, "arrow")) === 1, "H · Ctrl+Z / Ctrl+Y kısayolları");
    // I Temiz görünüm
    await p.click("[data-ann-clean]");
    ok((await els(p)) === 0 && (await p.locator("[data-ann-overlay][data-ann-hidden='1']").count()) === 1, "I · Temiz görünüm: çizimler geçici gizlendi (silinmedi)");
    await snap(p, "W3-temiz-gorunum-desktop");
    await p.click("[data-ann-clean]");
    ok((await els(p)) === 5, "I · Temiz görünüm kapatıldı: 5 öğe geri", await els(p));
    // J Kaydet
    await p.click("[data-ann-save]");
    await p.waitForSelector("[data-ann-status='saved']");
    const L1 = await layerRow(A);
    ok(!!L1 && L1.revision === 1 && L1.el_count === 5, "J · Kaydet: DB'de revizyon 1, 5 öğe", L1 && { r: L1.revision, n: L1.el_count });
    ok(!JSON.stringify(L1?.doc).includes("<"), "kaydedilen belgede '<' yok");
    await p.reload({ waitUntil: "load" });
    await ready(p);
    ok((await els(p)) === 5 && (await p.locator("[data-ann-overlay] [data-ann-type='bubble']").first().getAttribute("data-ann-anchor")) === "g:34", "yenileme sonrası: 5 öğe + çapa korunur");
    await snap(p, "W4-merkezi-kayitli-desktop");

    // ── 2) Kaydedilmemiş değişiklik uyarısı ────────────────────────────────────────────────────────
    section("2 · Kaydedilmemiş değişiklik uyarısı");
    await p.click("[data-ann-tool-btn='pen']");
    sb = await stageBox(p);
    await drag(p, { x: sb.x + sb.width * 0.7, y: sb.y + sb.height * 0.6 }, { x: sb.x + sb.width * 0.8, y: sb.y + sb.height * 0.7 });
    let dialogType = "";
    p.once("dialog", (d) => { dialogType = d.type(); void d.dismiss(); });
    await p.reload({ waitUntil: "load", timeout: 5000 }).catch(() => undefined);
    ok(dialogType === "beforeunload", "yenileme / sekme kapatma: tarayıcı 'kaydedilmemiş değişiklik' uyarısı (beforeunload)", dialogType);
    await p.click("[data-ann-back]");
    await p.waitForSelector("[data-ann-modal='leave']");
    ok(true, "geri bağlantısı: 'Kaydedilmemiş değişiklikler var' penceresi");
    await snap(p, "W5-kaydedilmemis-uyari-desktop");
    await p.click("[data-ann-leave-save]");
    await p.waitForURL(new RegExp(`/egitim-haritalari/${S1.id}$`));
    ok((await layerRow(A))?.revision === 2 && (await layerRow(A))?.el_count === 6, "'Kaydet ve çık': revizyon 2 (6 öğe), ayrıntıya dönüldü");

    // ── 3) CAS: iki cihaz ─────────────────────────────────────────────────────────────────────────
    section("3 · İki cihaz / sekme: sessiz üzerine yazma YOK");
    const p1 = await open(actx, wsUrl); await ready(p1);
    const actx2 = await ctxFor(A, 1440, 900, false);
    const p2 = await open(actx2, wsUrl); await ready(p2);
    for (const pg of [p1, p2]) {
      await pg.click("[data-ann-tool-btn='pen']");
      const b = await stageBox(pg);
      await drag(pg, { x: b.x + b.width * 0.2, y: b.y + b.height * 0.8 }, { x: b.x + b.width * 0.3, y: b.y + b.height * (pg === p1 ? 0.85 : 0.9) });
    }
    await p1.click("[data-ann-save]");
    await p1.waitForSelector("[data-ann-status='saved']");
    await p2.click("[data-ann-save]");
    await p2.waitForSelector("[data-ann-modal='conflict']");
    ok((await layerRow(A))?.revision === 3, "2. cihazın kaydı REDDEDİLDİ (DB revizyon 3 = 1. cihaz)");
    await snap(p2, "W6-cas-cakisma-desktop");
    await p2.click("[data-ann-conflict-load]");
    await ready(p2);
    ok((await els(p2)) === 7, "'Sunucudakini yükle': 1. cihazın 7 öğesi geldi", await els(p2));
    await p2.close(); await actx2.close(); await p1.close();

    // ── 4) Sunum modu ─────────────────────────────────────────────────────────────────────────────
    section("4 · Sunum modu");
    const ps = await open(actx, wsUrl); await ready(ps);
    const editW = (await stageBox(ps)).width;
    await ps.click("[data-ann-present-open]");
    await ps.waitForSelector("[data-ann-present]");
    ok((await ps.locator("[data-ann-toolbar]").count()) === 0 && (await ps.locator("[data-ann-save-close]").count()) === 0, "sunum: araçlar ve kaydet düğmeleri gizli");
    const presW = (await stageBox(ps)).width;
    ok(presW > editW, "sunum: BodyGraph daha geniş", { editW, presW });
    await snap(ps, "W7-sunum-desktop");
    await ps.locator("[data-ann-overlay] [data-ann-type='bubble']").first().click();
    await ps.waitForSelector("[data-ann-popover]");
    ok(/Kapı 34/.test(await ps.locator("[data-ann-popover]").innerText()), "sunum: baloncuğa tıklayınca not açılır (Kapı 34)");
    await snap(ps, "W8-sunum-baloncuk-notu-desktop");
    await ps.click("[data-ann-present-notes]");
    ok((await els(ps)) === 0, "sunum: not katmanı gizlenebilir");
    await ps.click("[data-ann-present-notes]");
    await ps.keyboard.press("Escape");
    await ps.keyboard.press("Escape");
    await ps.waitForSelector("[data-ann-toolbar]");
    ok(true, "Esc: sunumdan çıkış");
    await ps.close();

    // ── 5) Dokunma + kalem (CDP gerçek işaretçi; tablet 820) ──────────────────────────────────────
    section("5 · Dokunma ve kalem (emülasyon — fiziksel cihaz DEĞİL)");
    const tctx = await ctxFor(A, 820, 1180, true);
    const pt = await open(tctx, wsUrl); await ready(pt);
    await snap(pt, "W9-tablet-820");
    const cdp = await tctx.newCDPSession(pt);
    const tb = await stageBox(pt);
    await pt.click("[data-ann-tool-btn='pen']");
    const before5 = await els(pt, "pen");
    const tp = (i: number) => ({ x: tb.x + tb.width * (0.55 + i * 0.02), y: tb.y + tb.height * (0.15 + i * 0.015) });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [tp(0)] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [tp(i)] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    ok((await els(pt, "pen")) === before5 + 1, "parmakla (touch) serbest çizim", { before5, after: await els(pt, "pen") });
    const sp = (i: number) => ({ x: tb.x + tb.width * (0.6 + i * 0.015), y: tb.y + tb.height * (0.65 - i * 0.01) });
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...sp(0), button: "left", clickCount: 1, pointerType: "pen" });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...sp(i), button: "left", buttons: 1, pointerType: "pen" });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...sp(10), button: "left", clickCount: 1, pointerType: "pen" });
    ok((await els(pt, "pen")) === before5 + 2, "kalemle (stylus pointerType=pen) çizim");
    await pt.click("[data-ann-tool-btn='bubble']");
    const g10 = await gateCenter(pt, 10);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g10.x, y: g10.y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await pt.waitForSelector("[data-ann-note-input]");
    await pt.fill("[data-ann-note-input]", "Dokunmayla eklenen not — Kapı 10");
    const tbb = (await pt.locator("[data-ann-toolbar]").boundingBox()) as Box;
    ok(!intersects(tbb, await stageBox(pt)), "tablet: araç şeridi BodyGraph'a binmez", tbb);
    const toolSizes = await pt.locator("[data-ann-tool-btn]").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    ok(Math.min(...toolSizes) >= 44, "tablet: dokunma hedefleri ≥ 44 px", Math.min(...toolSizes));
    await pt.click("[data-ann-save-close]");
    await pt.waitForURL(new RegExp(`/egitim-haritalari/${S1.id}$`));
    ok((await layerRow(A))?.el_count === 10, "tablet: dokunma + kalem + baloncuk kaydedildi (10 öğe)", (await layerRow(A))?.el_count);
    await tctx.close();

    // ── 6) Koordinat kayması: 8 genişlik (otomatik ölçüm) ─────────────────────────────────────────
    section("6 · Otomatik koordinat kayması ölçümü (1440/1024/820/768/430/390/360/320)");
    const meas: Array<{ w: number; bubDx: number; bubDy: number; penX: number; penY: number; overflow: number; railOverlap: boolean; stageW: number }> = [];
    for (const w of WIDTHS) {
      const mob = w < 1024;
      const c = await ctxFor(A, w, mob ? (w < 500 ? 844 : 1180) : 900, mob);
      const pg = await open(c, wsUrl); await ready(pg);
      const st = await stageBox(pg);
      const bubC = center((await pg.locator("[data-ann-overlay] [data-ann-anchor='g:34'] circle").nth(1).boundingBox()) as Box);
      const g = await gateCenter(pg, 34);
      const pen = (await pg.locator("[data-ann-overlay] [data-ann-type='pen'] polyline").nth(1).boundingBox()) as Box;
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const rb = (await pg.locator("[data-ann-toolbar]").boundingBox()) as Box;
      meas.push({ w, bubDx: (bubC.x - g.x) / st.width, bubDy: (bubC.y - g.y) / st.height, penX: (pen.x - st.x) / st.width, penY: (pen.y - st.y) / st.height, overflow: ov, railOverlap: intersects(rb, st), stageW: Math.round(st.width) });
      if (w === 390 || w === 1024 || w === 320) await snap(pg, `W10-genislik-${w}`);
      await c.close();
    }
    writeFileSync(path.join(OUT, "_koordinat-olcumu.json"), JSON.stringify(meas, null, 2));
    const spread = (k: "bubDx" | "bubDy" | "penX" | "penY") => Math.max(...meas.map((m) => m[k])) - Math.min(...meas.map((m) => m[k]));
    ok(spread("bubDx") < 0.004 && spread("bubDy") < 0.004, "baloncuk ↔ kapı 34 göreli konumu 8 genişlikte SABİT (sapma < %0,4 sahne)", { dx: spread("bubDx"), dy: spread("bubDy") });
    ok(spread("penX") < 0.004 && spread("penY") < 0.004, "kalem çizimi sahne koordinatında 8 genişlikte SABİT (sapma < %0,4)", { x: spread("penX"), y: spread("penY") });
    ok(meas.every((m) => m.overflow <= 0), "8 genişlikte yatay taşma 0", meas.map((m) => [m.w, m.overflow]));
    ok(meas.every((m) => !m.railOverlap), "8 genişlikte araç çubuğu BodyGraph'a binmez (ilk görünüm)", meas.filter((m) => m.railOverlap).map((m) => m.w));
    // Mobilde sahne = sayfa iç boşluğu (2×12) + kart iç boşluğu (2×6) + kenarlık düşüldükten sonra KALAN genişliğin tamamı.
    ok(meas.filter((m) => m.w <= 430).every((m) => m.stageW >= m.w - 40), "mobil (320–430): BodyGraph kullanılabilir genişliğin tamamını kullanır (küçültülmedi)", meas.map((m) => [m.w, m.stageW]));

    // ── 7) Mobil: sunum + araçlar ─────────────────────────────────────────────────────────────────
    section("7 · Mobil 390");
    const mctx = await ctxFor(A, 390, 844, true);
    const pm = await open(mctx, wsUrl); await ready(pm);
    await snap(pm, "W11-mobil-390-calisma", true);
    await pm.click("[data-ann-present-open]");
    await pm.waitForSelector("[data-ann-present]");
    await pm.locator("[data-ann-overlay] [data-ann-anchor='g:34']").first().tap();
    await pm.waitForSelector("[data-ann-popover]");
    await snap(pm, "W12-mobil-390-sunum-not");
    await mctx.close();

    // ── 8) Özel kayıt + izin geri çekme ───────────────────────────────────────────────────────────
    section("8 · Özel kayıt çalışma alanı + izin geri çekme");
    const pp = await open(actx, `/human-design/egitim-merkezi/ozel/${PA.item}`);
    await pp.waitForSelector("[data-edu-workspace]");
    await pp.click("[data-edu-workspace]");
    await pp.waitForURL(/calisma-alani/);
    await ready(pp);
    ok(/takma ad/.test(await pp.locator("[data-ann-workspace] header").innerText()) && /izin kapsamında gösterilmez/.test(await pp.locator("[data-ann-workspace] header").innerText()),
      "özel kayıt: takma ad + doğum bilgisi izin olmadığından gösterilmez");
    await pp.click("[data-ann-tool-btn='bubble']");
    const pg2 = await gateCenter(pp, 5);
    await pp.mouse.click(pg2.x, pg2.y);
    await pp.fill("[data-ann-note-input]", "Özel kayıt notu");
    await pp.click("[data-ann-save]");
    await pp.waitForSelector("[data-ann-status='saved']");
    ok((await layerRow(A, "private"))?.el_count === 1, "özel kayıt katmanı kaydedildi");
    await snap(pp, "W13-ozel-kayit-calisma-desktop");
    await q(`select public.hd_edu_priv_consent_withdraw($1,$2,'danisan_talebi')`, [A.id, PA.consent]);
    await pp.reload({ waitUntil: "load" });
    await pp.waitForSelector("[data-edu-notfound]");
    ok(true, "izin geri çekildi → özel çalışma alanı 'Sayfa bulunamadı' (harita + katman kapalı)");
    ok((await q(`select count(*)::int n from public.hd_edu_annotation_layers where private_item_id=$1`, [PA.item])).rows[0].n === 1, "katman silinmedi (owner inceleyebilir)");
    await pp.close();

    // ── 9) İzolasyon ──────────────────────────────────────────────────────────────────────────────
    section("9 · Eğitmen izolasyonu");
    const bctx = await ctxFor(B, 1440, 900, false);
    const pb = await open(bctx, wsUrl); await ready(pb);
    ok((await els(pb)) === 0, "B aynı merkezî haritada A'nın çizimlerini GÖRMEZ");
    await pb.click("[data-ann-tool-btn='pen']");
    const bb = await stageBox(pb);
    await drag(pb, { x: bb.x + bb.width * 0.3, y: bb.y + bb.height * 0.5 }, { x: bb.x + bb.width * 0.5, y: bb.y + bb.height * 0.55 });
    await pb.click("[data-ann-save]");
    await pb.waitForSelector("[data-ann-status='saved']");
    ok((await layerRow(B))?.el_count === 1 && (await layerRow(A))?.el_count === 10, "B'nin ayrı katmanı; A'nınki değişmedi");
    const pbx = await open(bctx, `/human-design/egitim-merkezi/ozel/${PA.item}/calisma-alani`);
    await pbx.waitForSelector("[data-edu-notfound]");
    ok(true, "B, A'nın özel kayıt çalışma alanı URL'si → 'Sayfa bulunamadı'");
    await bctx.close();

    // ── 10) Owner yönetimi + normal admin ─────────────────────────────────────────────────────────
    section("10 · Owner: listele / incele / kaldır; normal admin");
    const octx = await ctxFor(OWNER, 1440, 900, false);
    const po = await open(octx, "/admin/hd-egitim-cizimleri");
    await po.waitForSelector("[data-ann-owner-table] [data-ann-owner-row]");
    ok((await po.locator("[data-ann-owner-row]").count()) === 3, "owner 3 katmanı listeler (A merkezî, A özel, B merkezî)");
    await snap(po, "W14-owner-liste-desktop");
    const aRow = (await q(`select id from public.hd_edu_annotation_layers where trainer_user_id=$1 and source_kind='central'`, [A.id])).rows[0].id as string;
    await po.click(`[data-ann-owner-view='${aRow}']`);
    await po.waitForSelector(`[data-ann-owner-viewer='${aRow}'] [data-ann-overlay]`);
    ok((await po.locator(`[data-ann-owner-viewer='${aRow}'] [data-ann-overlay] [data-ann-el]`).count()) === 10, "owner A'nın katmanını 10 öğesiyle inceler");
    await snap(po, "W15-owner-inceleme-desktop", true);
    const bRow = (await q(`select id from public.hd_edu_annotation_layers where trainer_user_id=$1`, [B.id])).rows[0].id as string;
    await po.click(`[data-ann-owner-del='${bRow}']`);
    await po.waitForSelector("[data-ann-owner-confirm]");
    await snap(po, "W16-owner-kaldir-onay-desktop");
    await po.click("[data-ann-owner-del-confirm]");
    await po.waitForSelector("[data-ann-owner-msg]");
    ok((await layerRow(B)) === undefined && (await layerRow(A))?.el_count === 10, "owner B'nin katmanını kaldırdı; A'nınki ve merkezî kayıt korunuyor");
    ok((await q(`select count(*)::int n from public.hd_education_subjects where id=$1`, [S1.id])).rows[0].n === 1, "merkezî kayıt silinmedi");
    const adctx = await ctxFor(ADMIN, 1440, 900, false);
    const pad = await open(adctx, "/admin/hd-egitim-cizimleri");
    ok(!(await pad.content()).includes("Eğitim Çizim Katmanları") || (await pad.locator("[data-ann-owner]").count()) === 0, "normal admin owner ekranını göremez (404)");
    ok((await pad.locator("[data-ann-owner-table]").count()) === 0, "normal admin: katman tablosu yok");
    await adctx.close(); await octx.close(); await actx.close();

    // ── Sonuç denetimleri ─────────────────────────────────────────────────────────────────────────
    section("Genel");
    ok(external.length === 0, "dış ağ isteği 0", external.slice(0, 5));
    ok(providerReq === 0, "ücretli sağlayıcı ucu çağrısı 0", providerReq);
    const envArtifact = (e: string) => /_vercel\/(speed-)?insights|Failed to load resource/.test(e);
    const appErrors = consoleErrors.filter((e) => !envArtifact(e));
    const newBad = [...badResponses.keys()].filter((k) => /\/(api\/(admin\/)?hd\/education\/annotations|calisma-alani|admin\/hd-egitim-cizimleri)/.test(k) && !k.startsWith("404 ") && !k.startsWith("409 "));
    ok(newBad.length === 0, "çizim uçlarında / sayfalarında 5xx / 403 yok (beklenen 404 / 409 hariç)", newBad);
    writeFileSync(path.join(OUT, "_hatali-yanitlar.txt"), [...badResponses.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} :: ${k}`).join("\n"));
    writeFileSync(path.join(OUT, "_konsol-hatalari.txt"), [`uygulama: ${appErrors.length}`, "", ...consoleErrors].join("\n"));
    ok(appErrors.length === 0, "uygulama console error 0", appErrors.slice(0, 8));
    writeFileSync(path.join(OUT, "_ekran-listesi.txt"), shots.join("\n"));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"]); else app.kill(); } catch { /* */ } }
    await env?.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL · ekran görüntüsü: ${shots.length}`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
