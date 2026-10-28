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
import { syntheticEducationSnapshotGDefined } from "../private/gCenterFixture";
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
      port: Number(process.env.HD_EDU_ANN_UI_PG_PORT ?? 54870 + (Date.now() % 40)), httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-ann-ui-${Date.now()}-${randomUUID().slice(0, 8)}`,
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
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts where version='hd-egitim-izin-v1'`)).rows[0].body_sha256 as string;
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ_SENTETIK_IZIN\n"), Buffer.alloc(300, 0x20)]).toString("base64");
    let n = 0;
    const privItem = async (w: U, title: string, snapIn: { computed_result: unknown; provider_raw: unknown } = SNAP) => {
      const client = (await q(`insert into public.human_design_clients(tenant_id, user_id, name) values ($1,$2,$3) returning id`, [w.tenant, w.id, `ZZ Danışan ${++n}`])).rows[0].id as string;
      const chart = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, source, birth_date, birth_time, timezone, computed_result, provider, provider_raw)
          values ($1,$2,$3,'computed','2018-07-20',$4,'UTC',$5,'roxyapi',$6) returning id`,
        [w.tenant, w.id, client, `16:${String(n).padStart(2, "0")}`, JSON.stringify({ ...(snapIn.computed_result as object), zz: n }), JSON.stringify(snapIn.provider_raw)])).rows[0].id as string;
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
      // tsx/esbuild, evaluate içindeki adlı ok fonksiyonlarını __name(...) ile sarar → tarayıcıda yer tutucu (yalnız test).
      await ctx.addInitScript("window.__name = window.__name || function (f) { return f; };");
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
    // Tuval birimi → ekran pikseli (tuval 922 birim genişlik; ANN_CANVAS). Kapı/merkez "yanına" tıklama ofsetleri FAZ 8'de
    // ~920 px sahnede (≈1 px/birim) yazılmıştı; sahne ölçeği değişince sabit piksel komşu kapıya düşer → ofset BİRİM cinsinden.
    const u = async (p: Page, n: number) => n * (await stageBox(p)).width / 922;
    const els = (p: Page, t?: string) => p.locator(t ? `[data-ann-overlay] [data-ann-type='${t}']` : "[data-ann-overlay] [data-ann-el]").count();
    const layerRow = async (u: U, kind = "central") => (await q(`select revision, el_count, doc from public.hd_edu_annotation_layers where trainer_user_id=$1 and source_kind=$2`, [u.id, kind])).rows[0] as { revision: number; el_count: number; doc: { els: Array<Record<string, unknown>>; notes: string } } | undefined;
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
    // P2 (owner kararı B): sahne kartının tüm iç genişliğini YA DA ekran yüksekliği sınırının tamamını kullanır (küçültülmedi).
    const cardIn = await p.locator("[data-ann-stage]").first().evaluate((e) => { const c = e.closest("section") as HTMLElement; const cs = getComputedStyle(c); return c.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); });
    const capW = (900 - 200) * 922 / 752;
    ok(sb.width >= Math.min(cardIn, capW) - 2 && sb.width >= 700, "masaüstü: BodyGraph küçültülmedi (sahne mevcut alanın tamamını kullanır, ≥ 700 px genişlik)", { w: sb.width, h: sb.height, cardIn, capW });
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
    await drag(p, gc, { x: gc.x + await u(p, 48), y: gc.y });
    ok((await els(p, "circle")) === 1, "C · Daire / vurgu çizildi (turuncu)");
    ok((await p.locator("[data-ann-overlay] [data-ann-type='circle']").getAttribute("data-ann-target")) === "c:G", "C · daire ANLAMLI HEDEF olarak G merkezini saklar", await p.locator("[data-ann-overlay] [data-ann-type='circle']").getAttribute("data-ann-target"));
    // D Baloncuk → kapı 34'e çapalı + not
    await p.click("[data-ann-color='violet']");
    await p.click("[data-ann-tool-btn='bubble']");
    const g34 = await gateCenter(p, 34);
    await p.mouse.click(g34.x + await u(p, 6), g34.y - await u(p, 8));
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
    await p.click("[data-ann-tool-btn='select']");
    const txtBox = (await p.locator("[data-ann-overlay] [data-ann-type='text'] text").boundingBox()) as Box;
    await p.mouse.click(txtBox.x + txtBox.width / 2, txtBox.y + txtBox.height / 2);
    await p.waitForSelector("[data-ann-text-edit]");
    await p.fill("[data-ann-text-edit]", "Yanıt veren güç (sakral)");
    await p.locator("[data-ann-text-edit]").blur();
    ok((await p.locator("[data-ann-overlay] [data-ann-type='text'] text").textContent()) === "Yanıt veren güç (sakral)", "E · Metin düzenleme: haritadaki metin güncellendi");
    await p.click("[data-ann-notes-edit]");
    await p.fill("[data-ann-general-notes]", "Ders: Sakral otorite — yanıt bekleme örneği.\nİkinci satır.");
    ok(true, "sağ panel: haritaya ait serbest eğitim notları yazıldı");
    // F Seç / taşı (daire)
    await p.click("[data-ann-tool-btn='select']");
    const circ = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().boundingBox()) as Box;
    const before = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().getAttribute("cx"));
    await drag(p, { x: circ.x + 4, y: circ.y + circ.height / 2 }, { x: circ.x + 4 + 30, y: circ.y + circ.height / 2 + 20 });
    const after = (await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").first().getAttribute("cx"));
    ok(before !== after, "F · Seç / taşı: daire taşındı", { before, after });
    await snap(p, "W2-merkezi-araclar-secili-desktop");
    // FAZ 9 · Seçili öğenin rengi: yalnız seçili öğe değişir; geri al çalışır; seçim yokken mevcut öğeler değişmez.
    const colorsOf = async () => p.locator("[data-ann-overlay] [data-ann-el]").evaluateAll((gs) => gs.map((g) => `${g.getAttribute("data-ann-el")}=${[...g.querySelectorAll("polyline,line,circle,text")].map((e) => e.getAttribute("stroke") === "#fff" || e.getAttribute("stroke") === "transparent" ? e.getAttribute("fill") : e.getAttribute("stroke") ?? e.getAttribute("fill")).join("|")}`).sort().join(";"));
    const circleId = String(await p.locator("[data-ann-overlay] [data-ann-type='circle']").getAttribute("data-ann-el"));
    ok((await p.locator("[data-ann-selected-label]").getAttribute("data-ann-selected-label")) === circleId && /Seçili: Daire/.test(await p.locator("#ann-fmt").innerText()), "seçili öğe panelde açıkça adıyla gösterilir (Seçili: Daire) + haritada çerçeve");
    const before9 = await colorsOf();
    await p.click("[data-ann-color='green']");
    ok((await p.locator("[data-ann-overlay] [data-ann-type='circle'] circle").getAttribute("stroke")) === "#059669", "seçiliyken renk seçimi YALNIZ seçili daireyi yeşil yaptı");
    const others = (x: string) => x.split(";").filter((e) => !e.startsWith(circleId)).join(";");
    ok(others(await colorsOf()) === others(before9), "diğer öğelerin rengi DEĞİŞMEDİ");
    await p.click("[data-ann-undo]");
    ok((await colorsOf()) === before9, "Geri Al: renk değişikliği geri alındı");
    await p.click("[data-ann-redo]");
    await p.click("[data-ann-undo]");
    if ((await p.locator("[data-ann-deselect]").count()) > 0) await p.locator("[data-ann-deselect]").click();
    ok((await p.locator("[data-ann-selected-label]").getAttribute("data-ann-selected-label")) === "" && /Biçim/.test(await p.locator("#ann-fmt").innerText()), "geri al sonrası seçim yok: panel 'Biçim'");
    const before9b = await colorsOf();
    await p.click("[data-ann-color='blue']");
    ok((await colorsOf()) === before9b && /sonraki çizimlere/.test(await p.locator("#ann-fmt + p").innerText()), "seçim yokken renk değişikliği mevcut öğelere UYGULANMADI (yalnız sonraki çizimler)");
    await p.click("[data-ann-tool-btn='select']");
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
    ok(/Sakral otorite/.test(String((L1?.doc as unknown as { notes?: string })?.notes)), "J · eğitim notları da kaydedildi");
    ok(!JSON.stringify(L1?.doc).includes("<"), "kaydedilen belgede '<' yok");
    await p.reload({ waitUntil: "load" });
    await ready(p);
    ok((await els(p)) === 5 && (await p.locator("[data-ann-overlay] [data-ann-type='bubble']").first().getAttribute("data-ann-anchor")) === "g:34", "yenileme sonrası: 5 öğe + çapa korunur");
    ok(/Sakral otorite/.test(await p.locator("[data-ann-notes-view]").innerText()) && (await p.locator("[data-ann-general-notes]").count()) === 0, "yenileme sonrası: eğitim notları korunur (salt okunur görünüm)");
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

    // Kaydetmeden çık: DB değişmez.
    const pd = await open(actx, wsUrl); await ready(pd);
    await pd.click("[data-ann-tool-btn='pen']");
    const bd = await stageBox(pd);
    await drag(pd, { x: bd.x + bd.width * 0.6, y: bd.y + bd.height * 0.3 }, { x: bd.x + bd.width * 0.7, y: bd.y + bd.height * 0.35 });
    await pd.click("[data-ann-back]");
    await pd.waitForSelector("[data-ann-modal='leave']");
    await pd.click("[data-ann-leave-discard]");
    await pd.waitForURL(new RegExp(`/egitim-haritalari/${S1.id}$`));
    ok((await layerRow(A))?.revision === 2 && (await layerRow(A))?.el_count === 6, "'Kaydetmeden çık': kaydedilmeyen çizim DB'ye YAZILMADI (revizyon 2, 6 öğe)");
    await pd.close();
    // Not silme: baloncuğu "Öğeyi sil" ile sil → kaydet → yenile → geri gelmez; ardından geri al ile geri getir.
    const pn = await open(actx, wsUrl); await ready(pn);
    await pn.click("[data-ann-tool-btn='select']");
    const bubId = await pn.locator("[data-ann-overlay] [data-ann-type='bubble']").first().getAttribute("data-ann-el");
    await pn.click(`[data-ann-note-row='${bubId}']`);
    await pn.click("[data-ann-delete-selected]");
    ok((await els(pn, "bubble")) === 0, "G · Not silme: baloncuk silindi");
    await pn.click("[data-ann-save]"); await pn.waitForSelector("[data-ann-status='saved']");
    await pn.reload({ waitUntil: "load" }); await ready(pn);
    ok((await els(pn, "bubble")) === 0 && !JSON.stringify((await layerRow(A))?.doc).includes(String(bubId)), "silinen not yeniden açılışta görünmez (DB'de yok)");
    // Geri getir: yeni baloncuk kapı 34'e (sonraki ölçümler için).
    await pn.click("[data-ann-tool-btn='bubble']");
    const g34b = await gateCenter(pn, 34);
    await pn.mouse.click(g34b.x + await u(pn, 6), g34b.y - await u(pn, 8));
    await pn.fill("[data-ann-note-input]", "Kapı 34: sakral güç — ZZ ders notu");
    await pn.click("[data-ann-save]"); await pn.waitForSelector("[data-ann-status='saved']");
    ok((await layerRow(A))?.el_count === 6, "baloncuk yeniden eklendi ve kaydedildi (6 öğe)");
    await pn.close();

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
    ok((await layerRow(A))?.revision === 5, "2. cihazın kaydı REDDEDİLDİ (DB revizyon 5 = 1. cihaz)", (await layerRow(A))?.revision);
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
    const mcdp = await mctx.newCDPSession(pm);
    await pm.click("[data-ann-tool-btn='pen']");
    const mb = await stageBox(pm);
    const mpBefore = await els(pm, "pen");
    const mp = (i: number) => ({ x: mb.x + mb.width * (0.2 + i * 0.02), y: mb.y + mb.height * (0.85 - i * 0.01) });
    await mcdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [mp(0)] });
    for (let i = 1; i <= 8; i++) await mcdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [mp(i)] });
    await mcdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    ok((await els(pm, "pen")) === mpBefore + 1, "mobil 390: parmakla çizim (touch emülasyonu)");
    const mScroll = await pm.evaluate(() => window.scrollY);
    ok(mScroll === 0, "mobil: çizim sırasında sayfa kaymadı (touch-action yalnız çizimde kapalı)", mScroll);
    await snap(pm, "W11-mobil-390-calisma", true);
    // FAZ 9 · Mobil araç şeridi: "diğer araçlar" ipucu görünür; dokununca kayar; Sil görünür olur; sonda ipucu kaybolur.
    ok((await pm.locator("[data-ann-rail-more='1']").count()) === 1, "mobil 390: sağda 'diğer araçlar' ipucu (›) görünür");
    const vis = async (sel: string) => { const b = await pm.locator(sel).boundingBox(); return !!b && b.x >= 0 && b.x + b.width <= 390; };
    ok(await vis("[data-ann-tool-btn='bubble']") && await vis("[data-ann-tool-btn='select']"), "Baloncuk ve Seç/taşı ilk bakışta görünür");
    ok(await vis("[data-ann-save]") && await vis("[data-ann-save-close]"), "Kaydet ve Kaydet ve Kapat görünür (başlıkta)");
    await pm.locator("[data-ann-railwrap]").scrollIntoViewIfNeeded();
    await snap(pm, "W17-mobil-390-diger-araclar-ipucu");
    const sl0 = await pm.locator("[data-ann-toolbar]").evaluate((e) => e.scrollLeft);
    await pm.click("[data-ann-rail-more='1']");
    await pm.waitForTimeout(600);
    ok((await pm.locator("[data-ann-toolbar]").evaluate((e) => e.scrollLeft)) > sl0 && await vis("[data-ann-tool-btn='erase']"), "ipucuna dokununca şerit kaydı; Sil aracı göründü");
    for (let i = 0; i < 3; i++) { if ((await pm.locator("[data-ann-rail-more='1']").count()) === 0) break; await pm.click("[data-ann-rail-more='1']"); await pm.waitForTimeout(500); }
    ok((await pm.locator("[data-ann-rail-more='1']").count()) === 0 && await vis("[data-ann-clean]"), "şeridin sonunda ipucu kaybolur; Temiz görünüm erişilebilir");
    ok((await pm.evaluate(() => window.scrollX)) === 0, "şerit kaydırması sayfayı yatay kaydırmadı");
    await pm.locator("[data-ann-toolbar]").evaluate((e) => { e.scrollLeft = 0; });
    await pm.click("[data-ann-present-open]");
    await pm.waitForSelector("[data-ann-present]");
    await pm.locator("[data-ann-overlay] [data-ann-anchor='g:34']").first().tap();
    await pm.waitForSelector("[data-ann-popover]", { timeout: 8000 }).catch(async (e) => {
      const bb = (await pm.locator("[data-ann-overlay] [data-ann-anchor='g:34'] circle").nth(1).boundingBox()) as Box;
      const hit = await pm.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName} ${el.getAttribute("class") ?? ""} ${el.closest("[data-ann-el]")?.getAttribute("data-ann-el") ?? "-"}` : "yok"; }, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
      console.error("DEBUG tap", JSON.stringify(bb), hit, await pm.evaluate(() => window.scrollY));
      await snap(pm, "DEBUG-mobil-sunum");
      throw e;
    });
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
    // FAZ 9 · Merkezî harita: GERÇEK renkli BodyGraph (kayıtlı snapshot) — boş şema değil.
    ok((await po.locator(`[data-ann-owner-viewer='${aRow}']`).getAttribute("data-ann-owner-real-chart")) === "1", "owner merkezî katmanı GERÇEK BodyGraph üzerinde görür");
    const activeGates = await po.locator(`[data-ann-owner-viewer='${aRow}'] [data-hd-cbg-gate]:not([data-hd-cbg-gate$=':off'])`).count();
    const definedC = await po.locator(`[data-ann-owner-viewer='${aRow}'] [data-hd-cbg-center$=':defined']`).count();
    ok(activeGates > 10 && definedC > 0, "owner görünümünde aktif (renkli) kapılar ve tanımlı merkezler var", { activeGates, definedC });
    await po.locator(`[data-ann-owner-viewer='${aRow}']`).scrollIntoViewIfNeeded();
    await snap(po, "W15-owner-inceleme-gercek-bodygraph-desktop", true);
    // İzni geri çekilmiş özel kayıt: içerik kapalı.
    const wRow = (await q(`select id from public.hd_edu_annotation_layers where private_item_id=$1`, [PA.item])).rows[0].id as string;
    await po.click(`[data-ann-owner-view='${wRow}']`);
    await po.waitForSelector(`[data-ann-owner-viewer='${wRow}'] [data-ann-owner-closed]`);
    ok((await po.locator(`[data-ann-owner-viewer='${wRow}'] [data-ann-overlay]`).count()) === 0 && !(await po.locator(`[data-ann-owner-viewer='${wRow}']`).innerText()).includes("Özel kayıt notu"),
      "izni geri çekilmiş özel kayıt: owner'a BodyGraph / not içeriği gösterilmez (yalnız idari durum)");
    await snap(po, "W18-owner-izin-geri-cekilmis-icerik-kapali", true);
    // Eğitmen veri durumu tablosu.
    ok((await po.locator(`[data-ann-owner-trainer='${A.id}'] [data-ann-owner-grant='on']`).count()) === 1, "eğitmen tablosu: A eğitim yetkisi AÇIK");
    ok((await po.locator(`[data-ann-owner-purge='${A.id}']`).isDisabled()), "yetki açıkken 'Eğitim verilerini kalıcı sil' PASİF");
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
    // FAZ 9 · Yetki kapat → veri korunur → AYRI 3 aşamalı kalıcı silme.
    await po.evaluate(async ([oid, tok, uid]) => { await fetch("/api/admin/hd/education/training-access", { method: "POST", headers: { "x-admin-id": oid as string, "x-session-token": tok as string, "Content-Type": "application/json" }, body: JSON.stringify({ userId: uid, enabled: false }) }); }, [OWNER.id, OWNER.token, A.id]);
    await po.reload({ waitUntil: "load" });
    await po.waitForSelector(`[data-ann-owner-trainer='${A.id}'] [data-ann-owner-grant='off']`);
    const aLayersKept = Number((await q(`select count(*)::int n from public.hd_edu_annotation_layers where trainer_user_id=$1`, [A.id])).rows[0].n);
    ok(aLayersKept === 2, "yetki KAPALI: A'nın 2 katmanı korunuyor (tablo: yetki KAPALI, sayılar görünür)", aLayersKept);
    await po.locator("[data-ann-owner-trainers]").scrollIntoViewIfNeeded();
    await snap(po, "W19-owner-egitmen-veri-durumu-yetki-kapali");
    await po.click(`[data-ann-owner-purge='${A.id}']`);
    await po.waitForSelector("[data-ann-purge-stage='1']");
    ok(/2<\/b>\s*çizim/.test(await po.locator("[data-ann-purge-stage='1']").innerHTML()) || /2 çizim/.test(await po.locator("[data-ann-purge-stage='1']").innerText()), "1/3: silinecek sayılar gösterildi");
    await snap(po, "W20-kalici-silme-1-uyari");
    await po.click("[data-ann-purge-next]");
    await po.waitForSelector("[data-ann-purge-stage='2']");
    ok(await po.locator("[data-ann-purge-next]").isDisabled(), "2/3: ifade yazılmadan ilerlenemez");
    await po.fill("[data-ann-purge-phrase]", "3 KAYDI SİL");
    await snap(po, "W21-kalici-silme-2-ifade");
    await po.click("[data-ann-purge-next]");
    await po.waitForSelector("[data-ann-purge-stage='3']");
    await snap(po, "W22-kalici-silme-3-son-onay");
    const consentsKept = Number((await q(`select count(*)::int n from public.hd_edu_private_consents where recorded_by=$1`, [A.id])).rows[0].n);
    await po.click("[data-ann-purge-final]");
    await po.waitForSelector("[data-ann-owner-msg]");
    ok(Number((await q(`select (select count(*) from public.hd_edu_annotation_layers where trainer_user_id=$1) + (select count(*) from public.hd_edu_private_items where trainer_user_id=$1) n`, [A.id])).rows[0].n) === 0,
      "3/3 sonrası: A'nın eğitim katmanları + özel kayıtları kalıcı silindi");
    ok(Number((await q(`select count(*)::int n from public.hd_edu_private_consents where recorded_by=$1`, [A.id])).rows[0].n) === consentsKept && consentsKept > 0, "izin kayıtları korundu");
    ok((await q(`select count(*)::int n from public.hd_education_subjects where id=$1`, [S1.id])).rows[0].n === 1, "merkezî kayıt korundu");
    await snap(po, "W23-kalici-silme-sonrasi", true);
    await adctx.close(); await octx.close(); await actx.close();

    // ── Sonuç denetimleri ─────────────────────────────────────────────────────────────────────────
    // ── 11) GECE: merkez / kanal / kapı hedefleri · 9 genişlik · eğitmen ↔ owner · bilinçli üzerine yazma · oturum · 320 px ──
    section("11 · Gece: hedefli işaretler, 9 genişlik, eğitmen ↔ owner, CAS üzerine yazma, oturum, 320 px");
    const G = await mkUser("expert", "ZZ Eğitmen Gece");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, G.id]);
    const gctx = await ctxFor(G, 1440, 900, false);
    const pg1 = await open(gctx, wsUrl); await ready(pg1);
    // Daire → Sakral merkezi; Ok → bir kanalın orta noktası; Baloncuk → kapı 34.
    await pg1.click("[data-ann-color='amber']"); await pg1.click("[data-ann-tool-btn='circle']");
    const sacC = await centerOf(pg1, "Sacral");
    await drag(pg1, sacC, { x: sacC.x + await u(pg1, 40), y: sacC.y });
    const chMid = await pg1.evaluate(() => {
      const cands = [...document.querySelectorAll("[data-hd-cbg] [data-hd-cbg-fill]")] as SVGGeometryElement[];
      for (const el of cands) {
        const target = (el.tagName === "polyline" || el.tagName === "path") ? el : (el.querySelector("polyline,path") as SVGGeometryElement | null);
        if (!target || typeof target.getTotalLength !== "function") continue;
        const L = target.getTotalLength(); if (L < 60) continue;
        const pt = target.getPointAtLength(L / 2); const m = target.getScreenCTM(); if (!m) continue;
        const sp = new DOMPoint(pt.x, pt.y).matrixTransform(m);
        return { x: sp.x, y: sp.y, ch: el.getAttribute("data-hd-cbg-fill") };
      }
      return null;
    });
    ok(!!chMid, "tanımlı bir kanalın orta noktası bulundu", chMid);
    await pg1.click("[data-ann-color='red']"); await pg1.click("[data-ann-tool-btn='arrow']");
    await drag(pg1, { x: chMid!.x - 90, y: chMid!.y - 70 }, { x: chMid!.x, y: chMid!.y });
    await pg1.click("[data-ann-color='violet']"); await pg1.click("[data-ann-tool-btn='bubble']");
    const g34g = await gateCenter(pg1, 34);
    await pg1.mouse.click(g34g.x + await u(pg1, 6), g34g.y - await u(pg1, 8));
    await pg1.fill("[data-ann-note-input]", "Kapı 34 — gece testi");
    const cT = await pg1.locator("[data-ann-overlay] [data-ann-type='circle']").getAttribute("data-ann-target");
    const aT = await pg1.locator("[data-ann-overlay] [data-ann-type='arrow']").getAttribute("data-ann-target");
    const bT = await pg1.locator("[data-ann-overlay] [data-ann-type='bubble']").getAttribute("data-ann-anchor");
    ok(cT === "c:Sacral", "daire Sakral MERKEZİNE semantik hedefle bağlandı", cT);
    ok(!!aT && /^[^>]*>h:/.test(aT), "ok ucu bir KANALA semantik hedefle bağlandı", aT);
    ok(bT === "g:34", "baloncuk KAPI 34'e çapalandı", bT);
    await pg1.click("[data-ann-save]"); await pg1.waitForSelector("[data-ann-status='saved']");
    await snap(pg1, "G01-gece-merkez-kanal-kapi-isaretleri-1440");
    await pg1.close();
    // Ölçüm: işaret ↔ hedef göreli konumu (sahne oranı) — 9 genişlik.
    const measure = async (pg: Page, scope: string) => pg.evaluate(([sc]) => {
      const root = document.querySelector(sc as string)!;
      const st = (root.querySelector("[data-ann-stage]") as HTMLElement).getBoundingClientRect();
      const ctr = (el: Element | null) => { const r = (el as Element).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
      const n = (p: { x: number; y: number }) => ({ x: (p.x - st.x) / st.width, y: (p.y - st.y) / st.height });
      const bub = n(ctr(root.querySelectorAll("[data-ann-overlay] [data-ann-anchor='g:34'] circle")[1]));
      const gate = n(ctr(root.querySelector("[data-hd-cbg] [data-hd-cbg-gate^='34:']")));
      const cir = n(ctr(root.querySelector("[data-ann-overlay] [data-ann-type='circle'] circle")));
      const sac = n(ctr(root.querySelector("[data-hd-cbg] [data-hd-cbg-center^='Sacral:']")));
      const ln = root.querySelectorAll("[data-ann-overlay] [data-ann-type='arrow'] line")[1] as SVGLineElement;
      const m = ln.getScreenCTM()!; const e = new DOMPoint(ln.x2.baseVal.value, ln.y2.baseVal.value).matrixTransform(m);
      const arr = n({ x: e.x, y: e.y });
      return { bub, gate, cir, sac, arr, stageW: Math.round(st.width) };
    }, [scope]);
    const W9 = [1440, 1280, 1024, 820, 768, 430, 390, 360, 320];
    const gm: Array<{ w: number; m: Awaited<ReturnType<typeof measure>> }> = [];
    for (const w of W9) {
      const mob = w < 1024;
      const c = await ctxFor(G, w, mob ? (w < 500 ? 844 : 1180) : 900, mob);
      const pg = await open(c, wsUrl); await ready(pg);
      gm.push({ w, m: await measure(pg, "[data-ann-workspace]") });
      if (w === 1280) await snap(pg, "G02-gece-1280");
      await c.close();
    }
    writeFileSync(path.join(OUT, "_gece-koordinat-9-genislik.json"), JSON.stringify(gm, null, 2));
    const spread9 = (f: (m: Awaited<ReturnType<typeof measure>>) => number) => { const v = gm.map((g) => f(g.m)); return Math.max(...v) - Math.min(...v); };
    ok(spread9((m) => m.bub.x - m.gate.x) < 0.004 && spread9((m) => m.bub.y - m.gate.y) < 0.004, "9 genişlik: baloncuk ↔ kapı 34 göreli konum sabit");
    ok(spread9((m) => m.cir.x - m.sac.x) < 0.004 && spread9((m) => m.cir.y - m.sac.y) < 0.004, "9 genişlik: daire ↔ Sakral merkezi göreli konum sabit");
    ok(spread9((m) => m.arr.x) < 0.004 && spread9((m) => m.arr.y) < 0.004, "9 genişlik: ok ucu (kanal orta noktası) sahnede sabit");
    // Owner aynı katmanı gerçek BodyGraph üzerinde — eğitmenle aynı noktalar (1440 ve 1280).
    const gLayer = (await q(`select id from public.hd_edu_annotation_layers where trainer_user_id=$1`, [G.id])).rows[0].id as string;
    for (const w of [1440, 1280]) {
      const oc = await ctxFor(OWNER, w, 900, false);
      const po2 = await open(oc, "/admin/hd-egitim-cizimleri");
      await po2.waitForSelector(`[data-ann-owner-view='${gLayer}']`);
      await po2.click(`[data-ann-owner-view='${gLayer}']`);
      await po2.waitForSelector(`[data-ann-owner-viewer='${gLayer}'][data-ann-owner-real-chart='1'] [data-ann-overlay]`);
      const om = await measure(po2, `[data-ann-owner-viewer='${gLayer}']`);
      const tm = gm.find((g) => g.w === w)!.m;
      const d = Math.max(Math.abs(om.bub.x - tm.bub.x), Math.abs(om.bub.y - tm.bub.y), Math.abs(om.cir.x - tm.cir.x), Math.abs(om.cir.y - tm.cir.y), Math.abs(om.arr.x - tm.arr.x), Math.abs(om.arr.y - tm.arr.y),
        Math.abs(om.gate.x - tm.gate.x), Math.abs(om.sac.y - tm.sac.y));
      ok(d < 0.004, `${w} px: owner gerçek BodyGraph'ındaki ok / daire / baloncuk ve kapı / merkez konumları eğitmenle AYNI (sahne oranı farkı < %0,4)`, d);
      if (w === 1440) { await po2.locator(`[data-ann-owner-viewer='${gLayer}']`).scrollIntoViewIfNeeded(); await snap(po2, "G03-gece-owner-ayni-isaretler-gercek-bodygraph", true); }
      await oc.close();
    }
    // Bilinçli üzerine yazma (CAS) arayüzden.
    const g2a = await ctxFor(G, 1440, 900, false), g2b = await ctxFor(G, 1440, 900, false);
    const qa = await open(g2a, wsUrl); await ready(qa);
    const qb = await open(g2b, wsUrl); await ready(qb);
    for (const [pg, dy] of [[qa, 0.1], [qb, 0.2]] as const) {
      await pg.click("[data-ann-tool-btn='pen']");
      const b2 = await stageBox(pg);
      await drag(pg, { x: b2.x + b2.width * 0.7, y: b2.y + b2.height * (0.7 + dy) }, { x: b2.x + b2.width * 0.8, y: b2.y + b2.height * (0.72 + dy) });
    }
    await qb.click("[data-ann-notes-edit]");
    await qb.fill("[data-ann-general-notes]", "B cihazı notu — bilinçli üzerine yazma");
    await qa.click("[data-ann-save]"); await qa.waitForSelector("[data-ann-status='saved']");
    await qb.click("[data-ann-save]"); await qb.waitForSelector("[data-ann-modal='conflict']");
    await snap(qb, "G04-gece-cakisma-secenekleri");
    await qb.click("[data-ann-conflict-overwrite]");
    await qb.waitForSelector("[data-ann-status='saved']");
    const gRow = (await q(`select revision, doc from public.hd_edu_annotation_layers where trainer_user_id=$1`, [G.id])).rows[0] as { revision: number; doc: { notes: string } };
    ok(gRow.doc.notes.includes("bilinçli üzerine yazma"), "çakışma penceresinde 'Benimkini kaydet' → kullanıcının açık tercihiyle güncel revizyon üzerine yazıldı", gRow.revision);
    await qa.reload({ waitUntil: "load" }); await ready(qa);
    ok((await qa.locator("[data-ann-notes-view]").innerText()).includes("bilinçli üzerine yazma"), "diğer cihaz yeniden yükleyince güncel içeriği görür");
    await g2a.close(); await g2b.close();
    // Oturumu kapat → yeni oturumla (başka tarayıcı) yeniden aç → aynı çizimler.
    const newTok = `zz-annui-yeni-${randomUUID()}`;
    await q(`delete from public.user_sessions where user_id=$1`, [G.id]);
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [G.id, newTok]);
    const gn = await ctxFor({ ...G, token: newTok }, 1440, 900, false);
    const pn2 = await open(gn, wsUrl); await ready(pn2);
    // Bilinçli üzerine yazmada B cihazının sürümü (3 hedefli işaret + B kalemi = 4 öğe) geçerli oldu.
    ok((await els(pn2)) === 4 && (await pn2.locator("[data-ann-notes-view]").innerText()).includes("bilinçli üzerine yazma"), "oturum kapatıldı → yeni oturumla açıldı: aynı 4 öğe + not", await els(pn2));
    await snap(pn2, "G05-gece-yeni-oturum-ayni-calisma");
    // Yetki kapalı ekranı → yeniden açılmış kayıt.
    await q(`select public.hd_education_revoke_access($1,$2)`, [OWNER.id, G.id]);
    await pn2.reload({ waitUntil: "load" });
    await pn2.waitForFunction(() => !document.querySelector("[data-ann-workspace]") && /bulunamadı|404/i.test(document.body.innerText), undefined, { timeout: 45000 });
    await snap(pn2, "G06-gece-yetki-kapali-ekrani");
    ok((await els(pn2)) === 0, "yetki kapalı: çalışma alanı açılmıyor");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, G.id]);
    await pn2.reload({ waitUntil: "load" }); await ready(pn2);
    ok((await els(pn2)) === 4, "yetki yeniden açıldı: aynı 4 öğe geri");
    await snap(pn2, "G07-gece-yeniden-acilmis-kayit");
    await gn.close();
    // 320 px: uzun not paneli, pencereler, klavye açıkken alan.
    const m320 = await ctxFor({ ...G, token: newTok }, 320, 568, true);
    const pm3 = await open(m320, wsUrl); await ready(pm3);
    await pm3.locator("[data-ann-notes-edit]").scrollIntoViewIfNeeded();
    await pm3.click("[data-ann-notes-edit]");
    await pm3.fill("[data-ann-general-notes]", "Uzun ders notu. ".repeat(300).slice(0, 4900));
    const ov320 = await pm3.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const ta = (await pm3.locator("[data-ann-general-notes]").boundingBox()) as Box;
    ok(ov320 <= 0 && ta.x >= 0 && ta.x + ta.width <= 320, "320 px: 4900 karakterlik not paneli taşmıyor", { ov320, ta });
    await pm3.setViewportSize({ width: 320, height: 300 });
    await pm3.locator("[data-ann-general-notes]").focus();
    await pm3.locator("[data-ann-general-notes]").evaluate((e) => e.scrollIntoView({ block: "center" }));
    const ta2 = (await pm3.locator("[data-ann-general-notes]").boundingBox()) as Box;
    ok(ta2.y >= 0 && ta2.y < 300 && ta2.x + ta2.width <= 320, "klavye açık (görünür alan 300 px): not alanı görünür alanda, kesilmiyor", ta2);
    await pm3.setViewportSize({ width: 320, height: 568 });
    await pm3.locator("[data-ann-clear]").scrollIntoViewIfNeeded();
    await pm3.click("[data-ann-clear]");
    await pm3.waitForSelector("[data-ann-modal='clear']");
    const md = (await pm3.locator("[data-ann-modal='clear'] > div").boundingBox()) as Box;
    ok(md.x >= 0 && md.x + md.width <= 320 && md.y >= 0 && md.y + md.height <= 568, "320 px: 'tüm katmanı sil' penceresi ekrandan taşmıyor", md);
    await snap(pm3, "G08-gece-320-pencere");
    await pm3.locator("[data-ann-modal='clear'] button", { hasText: "Vazgeç" }).click();
    await pm3.click("[data-ann-back]");
    await pm3.waitForSelector("[data-ann-modal='leave']");
    const md2 = (await pm3.locator("[data-ann-modal='leave'] > div").boundingBox()) as Box;
    ok(md2.x >= 0 && md2.x + md2.width <= 320, "320 px: 'kaydedilmemiş değişiklik' penceresi ekrandan taşmıyor", md2);
    await m320.close();

    // ── 12) G merkezi TANIMLI harita (FAZ 12 bulgusu: tek harfli "G" kişisel alansız görünümde düşüyordu) ─────────
    section("12 · G merkezi TANIMLI harita: eğitmen + özel kayıt çalışma alanı + owner gerçek BodyGraph");
    const Z = await mkUser("expert", "ZZ Eğitmen Gül");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, Z.id]);
    const SG = await seedCentralSubject(q, OWNER.id, { name: "ZZ Sentetik G Tanımlı", publish: true, date: "1870-01-10", gDefined: true });
    const PZ = await privItem(Z, "G merkezi tanımlı örnek", syntheticEducationSnapshotGDefined("2018-07-20T16:00:00Z", 37.87, 32.48, 1));
    const gDef = (p: Page, scope: string) => p.locator(`${scope} [data-hd-cbg-center='G:defined']`).count();
    const zctx = await ctxFor(Z, 1440, 900, false);
    const zDraw = async (p: Page, note: string) => {
      await p.click("[data-ann-tool-btn='bubble']");
      const pt = await gateCenter(p, 8);
      await p.mouse.click(pt.x, pt.y);
      await p.fill("[data-ann-note-input]", note);
      await p.click("[data-ann-save]");
      await p.waitForSelector("[data-ann-status='saved']");
    };
    // Merkezî G tanımlı harita (eğitmen yolu süzülmemiş kayıtlı sonucu kullanır — kontrol amaçlı).
    const zw = await open(zctx, `/human-design/egitim-haritalari/${SG.id}/calisma-alani`); await ready(zw);
    ok((await gDef(zw, "[data-ann-workspace]")) === 1, "merkezî çalışma alanı: G merkezi TANIMLI çizilir");
    await zDraw(zw, "G merkezi notu (merkezî)");
    ok((await layerRow(Z))?.el_count === 1, "merkezî G haritası: işaret kaydedildi");
    await zw.reload({ waitUntil: "load" }); await ready(zw);
    ok((await els(zw)) === 1, "merkezî G haritası yeniden açıldı: işaret aynen geldi");
    await zw.close();
    // Özel kayıt (kişisel alansız görünüm — hatanın etkilediği yol).
    const zd = await open(zctx, `/human-design/egitim-merkezi/ozel/${PZ.item}`);
    await zd.waitForSelector("[data-edu-bodygraph]");
    const zdG = await zd.locator("[data-edu-bodygraph] [data-hd-center^='g_identity:']").getAttribute("data-hd-center");
    ok(zdG === "g_identity:defined", "özel kayıt ayrıntısı: G / Kimlik Merkezi 'Tanımlı' görünür", zdG);
    await snap(zd, "Z01-g-tanimli-ozel-kayit-ayrinti", true);
    await zd.click("[data-edu-workspace]");
    await zd.waitForURL(/calisma-alani/);
    await ready(zd);
    ok((await gDef(zd, "[data-ann-workspace]")) === 1, "özel kayıt çalışma alanı AÇILIR ve G merkezi TANIMLI (önceden 'kullanılamıyor')");
    await zDraw(zd, "G merkezi notu (özel)");
    ok((await layerRow(Z, "private"))?.el_count === 1, "özel G kaydı: işaret kaydedildi");
    await zd.reload({ waitUntil: "load" }); await ready(zd);
    ok((await els(zd)) === 1 && (await gDef(zd, "[data-ann-workspace]")) === 1, "özel G kaydı yeniden açıldı: işaret aynen geldi, G hâlâ tanımlı");
    await snap(zd, "Z02-g-tanimli-ozel-calisma-alani");
    await zd.close(); await zctx.close();
    // Owner denetimi: iki katman da GERÇEK renkli BodyGraph üzerinde (boş şema DEĞİL).
    const ozc = await ctxFor(OWNER, 1440, 900, false);
    const poz = await open(ozc, "/admin/hd-egitim-cizimleri");
    for (const kind of ["central", "private"] as const) {
      const lid = (await q(`select id from public.hd_edu_annotation_layers where trainer_user_id=$1 and source_kind=$2`, [Z.id, kind])).rows[0].id as string;
      await poz.waitForSelector(`[data-ann-owner-view='${lid}']`);
      await poz.click(`[data-ann-owner-view='${lid}']`);
      await poz.waitForSelector(`[data-ann-owner-viewer='${lid}'] [data-ann-overlay]`);
      const sc = `[data-ann-owner-viewer='${lid}']`;
      const real = await poz.locator(sc).getAttribute("data-ann-owner-real-chart");
      const act = await poz.locator(`${sc} [data-hd-cbg-gate]:not([data-hd-cbg-gate$=':off'])`).count();
      ok(real === "1" && (await gDef(poz, sc)) === 1 && act > 10 && (await poz.locator(`${sc} [data-ann-overlay] [data-ann-el]`).count()) === 1,
        `owner (${kind === "central" ? "merkezî" : "özel"}): G tanımlı harita GERÇEK renkli BodyGraph, G TANIMLI, eğitmenin işareti görünür`, { real, act });
      await poz.locator(sc).scrollIntoViewIfNeeded();
      await snap(poz, `Z0${kind === "central" ? 3 : 4}-owner-g-tanimli-${kind === "central" ? "merkezi" : "ozel"}-gercek-bodygraph`, true);
    }
    await ozc.close();

    // ── 13) FAZ 13 owner incelemesi: tuvalin tamamı, baloncuk boyutu / kutu, tutamaçlar, korumalı notlar ──────────────
    section("13 · Çizim alanı sınırları, baloncuk, yeniden boyutlandırma, korumalı eğitim notları");
    {
    const T = await mkUser("expert", "ZZ Eğitmen Tuval");
    await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, T.id]);
    const tctx = await ctxFor(T, 1440, 900, false);
    const pt = await open(tctx, wsUrl); await ready(pt);
    const sb = await stageBox(pt);
    const bgb = (await pt.locator("[data-ann-bg]").boundingBox()) as Box;
    const cardB = (await pt.locator("[data-ann-stage]").locator("xpath=ancestor::section[1]").boundingBox()) as Box;
    ok(bgb.x - sb.x > sb.width * 0.15 && sb.x + sb.width - (bgb.x + bgb.width) > sb.width * 0.15 && sb.x >= cardB.x - 1 && sb.x + sb.width <= cardB.x + cardB.width + 1,
      "1440 px: çizim alanı BodyGraph'ın iki yanındaki boş çalışma alanını kapsar; sağ panel / araç şeridi alana dahil değil", { sb, bgb, cardB });
    // Sol boşlukta kalem, sağ boşluktan kapı 34'e ok, sağ boşlukta daire.
    await pt.click("[data-ann-tool-btn='pen']");
    await drag(pt, { x: sb.x + sb.width * 0.03, y: sb.y + sb.height * 0.3 }, { x: sb.x + sb.width * 0.12, y: sb.y + sb.height * 0.4 });
    await pt.click("[data-ann-tool-btn='arrow']");
    const g34 = await gateCenter(pt, 34);
    await drag(pt, { x: sb.x + sb.width * 0.95, y: sb.y + sb.height * 0.2 }, g34);
    await pt.click("[data-ann-tool-btn='circle']");
    await drag(pt, { x: sb.x + sb.width * 0.9, y: sb.y + sb.height * 0.7 }, { x: sb.x + sb.width * 0.94, y: sb.y + sb.height * 0.7 });
    ok((await els(pt)) === 3, "yan boşluklarda kalem + ok + daire çizildi", await els(pt));
    // Baloncuk: sol boşluğa; uzun not; büyüt / küçült; tutamaç; kutu gösterimi.
    await pt.click("[data-ann-tool-btn='bubble']");
    await pt.mouse.click(sb.x + sb.width * 0.07, sb.y + sb.height * 0.62);
    await pt.waitForSelector("[data-ann-note-input]");
    const longNote = "Uzun açıklama: tanımlı Sakral merkez ve yanıt verme stratejisi örneği. ".repeat(50).slice(0, 3500);
    await pt.fill("[data-ann-note-input]", longNote);
    await pt.locator("[data-ann-note-input]").blur();
    const bub = pt.locator("[data-ann-overlay] [data-ann-type='bubble']").first();
    const r0 = Number(await bub.getAttribute("data-ann-r"));
    await pt.click("[data-ann-bubble-bigger]"); await pt.click("[data-ann-bubble-bigger]");
    const r1v = Number(await bub.getAttribute("data-ann-r"));
    await pt.click("[data-ann-bubble-smaller]");
    const r2v = Number(await bub.getAttribute("data-ann-r"));
    ok(r0 === 13 && r1v === 19 && r2v === 16, "baloncuk Büyüt / Küçült (numara dairesi 13 → 19 → 16)", { r0, r1v, r2v });
    const hR = center((await pt.locator("[data-ann-handle='r']").boundingBox()) as Box);
    await drag(pt, hR, { x: hR.x + 25, y: hR.y });
    const r3v = Number(await bub.getAttribute("data-ann-r"));
    ok(r3v > r2v, "baloncuk dairesi tutamaçla sürüklenerek büyütüldü (fare)", { r2v, r3v });
    await pt.click("[data-ann-bubble-mode='in']");
    await pt.waitForSelector("[data-ann-box-input]");
    ok((await bub.getAttribute("data-ann-mode")) === "in", "gösterim 'Metin baloncuk içinde' seçildi");
    const bw0 = Number(await bub.getAttribute("data-ann-bw")), bh0 = Number(await bub.getAttribute("data-ann-bh"));
    const hB = center((await pt.locator("[data-ann-handle='box']").boundingBox()) as Box);
    await drag(pt, hB, { x: hB.x + 60, y: hB.y + 40 });
    const bw1 = Number(await bub.getAttribute("data-ann-bw")), bh1 = Number(await bub.getAttribute("data-ann-bh"));
    ok(bw1 > bw0 && bh1 > bh0, "baloncuk kutusu köşe tutamacıyla büyütüldü", { bw0, bh0, bw1, bh1 });
    await pt.locator("[data-ann-box-input]").click();
    await pt.keyboard.press("Control+End");
    await pt.keyboard.type(" Kutuda yazıldı.");
    await pt.locator("[data-ann-box-input]").blur();
    ok((await pt.inputValue("[data-ann-note-input]")).endsWith("Kutuda yazıldı."), "baloncuk içinde doğrudan yazma → aynı not (yan panelle eşleşir)");
    // Seçimi Kaldır: yalnız seçimi kaldırır (öğe sayısı aynı, silme / kayıt yok).
    const nBefore = await els(pt);
    await pt.click("[data-ann-deselect]");
    ok((await pt.locator("[data-ann-selection]").count()) === 0 && (await els(pt)) === nBefore && (await pt.getAttribute("[data-ann-status]", "data-ann-status")) === "dirty",
      "'Seçimi Kaldır' yalnız seçimi kaldırır (öğe silinmez, kayıt yapılmaz)");
    const boxTxt = pt.locator("[data-ann-box-text]").first();
    const sc = await boxTxt.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, oy: getComputedStyle(e).overflowY }));
    ok(sc.sh > sc.ch && sc.oy === "auto", "uzun metin kutu içinde kayar (kesilmez / taşmaz)", sc);
    // Taşıma: seç aracıyla baloncuğu sürükle.
    await pt.click("[data-ann-tool-btn='select']");
    const bx0 = Number(await bub.getAttribute("data-ann-x"));
    const bubDot = center((await bub.locator("circle").nth(1).boundingBox()) as Box);
    await drag(pt, bubDot, { x: bubDot.x + 30, y: bubDot.y - 20 });
    const bx1 = Number(await bub.getAttribute("data-ann-x"));
    ok(Math.abs(bx1 - bx0) > 10, "baloncuk taşındı", { bx0, bx1 });
    // Ok ucu ve daire yarıçapı tutamaçları + geri al / yinele.
    const arrowG = pt.locator("[data-ann-overlay] [data-ann-type='arrow']").first();
    const al = (await arrowG.locator("line").first().boundingBox()) as Box;
    await pt.mouse.click(al.x + al.width / 2, al.y + al.height / 2);
    await pt.waitForSelector("[data-ann-handle='p1']");
    const x1a = await arrowG.locator("line").nth(1).getAttribute("x1");
    const hp1 = center((await pt.locator("[data-ann-handle='p1']").boundingBox()) as Box);
    await drag(pt, hp1, { x: hp1.x - 30, y: hp1.y + 30 });
    const x1b = await arrowG.locator("line").nth(1).getAttribute("x1");
    ok(x1a !== x1b, "ok başlangıç ucu tutamaçla taşındı (yeniden boyutlandırma)", { x1a, x1b });
    await pt.click("[data-ann-undo]");
    ok((await arrowG.locator("line").nth(1).getAttribute("x1")) === x1a, "geri al: ok ucu eski yerine döndü");
    await pt.click("[data-ann-redo]");
    ok((await arrowG.locator("line").nth(1).getAttribute("x1")) === x1b, "yinele: ok ucu yeni yerinde");
    const circG = pt.locator("[data-ann-overlay] [data-ann-type='circle']").first();
    const cb = (await circG.locator("circle").boundingBox()) as Box;
    await pt.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await pt.waitForSelector("[data-ann-handle='r']");
    const cr0 = Number(await circG.locator("circle").getAttribute("r"));
    const hc = center((await pt.locator("[data-ann-handle='r']").boundingBox()) as Box);
    await drag(pt, hc, { x: hc.x + 20, y: hc.y });
    const cr1 = Number(await circG.locator("circle").getAttribute("r"));
    ok(cr1 > cr0, "daire yarıçapı tutamaçla büyütüldü", { cr0, cr1 });
    await pt.click("[data-ann-color='green']"); await pt.click("[data-ann-width='7']");
    ok((await circG.locator("circle").getAttribute("stroke")) === "#059669" && (await circG.locator("circle").getAttribute("stroke-width")) === "7", "renk + kalınlık seçili öğeye uygulandı");
    await pt.click("[data-ann-deselect]");
    await snap(pt, "Z10-tuval-yan-alanlar-baloncuk-kutu-1440");
    await pt.click("[data-ann-save]"); await pt.waitForSelector("[data-ann-status='saved']");
    const tRow = await layerRow(T);
    const tb = tRow?.doc.els.find((e) => e.t === "bubble") as Record<string, unknown> | undefined;
    const tp = tRow?.doc.els.find((e) => e.t === "pen") as { p: number[] } | undefined;
    const tc = tRow?.doc.els.find((e) => e.t === "circle") as { x: number } | undefined;
    ok(!!tb && tb.m === "in" && Number(tb.bw) === bw1 && String(tb.n).length > 3400 && !!tp && tp.p[0] < -80 && !!tc && tc.x > 522,
      "kayıt: kutu gösterimi + boyutu + uzun not + BodyGraph dışındaki (sol / sağ boşluk) koordinatlar saklandı", { m: tb?.m, bw: tb?.bw, pen0: tp?.p[0], cx: tc?.x });
    await pt.reload({ waitUntil: "load" }); await ready(pt);
    const bubR = pt.locator("[data-ann-overlay] [data-ann-type='bubble']").first();
    ok((await els(pt)) === 4 && (await bubR.getAttribute("data-ann-mode")) === "in" && Number(await bubR.getAttribute("data-ann-bw")) === bw1, "yeniden açıldı: 4 öğe, baloncuk kutusu ve boyutu aynen");
    // Korumalı eğitim notları.
    ok((await pt.locator("[data-ann-notes-view]").count()) === 1 && (await pt.locator("[data-ann-general-notes]").count()) === 0, "eğitim notları varsayılan SALT OKUNUR (yazma alanı yok)");
    await pt.click("[data-ann-notes-edit]");
    await pt.fill("[data-ann-general-notes]", "Vazgeçilecek taslak");
    await pt.click("[data-ann-notes-cancel]");
    ok((await pt.locator("[data-ann-general-notes]").count()) === 0 && !(await pt.locator("[data-ann-notes-view]").innerText()).includes("Vazgeçilecek"), "Vazgeç: taslak atıldı, kayıtlı not değişmedi");
    // Kaydedilmemiş bir çizim varken yalnız not kaydı: çizim KAYDEDİLMEZ.
    await pt.click("[data-ann-tool-btn='pen']");
    await drag(pt, { x: sb.x + sb.width * 0.05, y: sb.y + sb.height * 0.85 }, { x: sb.x + sb.width * 0.1, y: sb.y + sb.height * 0.9 });
    const lesson = "Ders notu satırı — tanımlı merkezler ve stratejiler üzerine uzun anlatım.\n".repeat(220).slice(0, 15000);
    await pt.click("[data-ann-notes-edit]");
    await pt.fill("[data-ann-general-notes]", lesson);
    await pt.click("[data-ann-notes-save]");
    await pt.waitForSelector("[data-ann-notes-card='view']");
    const tRow2 = await layerRow(T);
    ok(tRow2?.doc.notes.length === 15000 && tRow2?.el_count === 4 && (await els(pt)) === 5 && (await pt.getAttribute("[data-ann-status]", "data-ann-status")) === "dirty",
      "not Kaydet: 15 000 karakterlik ders notu kaydedildi; kaydedilmemiş çizim KAYDEDİLMEDİ (hâlâ bekliyor)", { notes: tRow2?.doc.notes.length, el: tRow2?.el_count });
    // Büyüt: harita üzerinde büyük pencere; ayrı sayfa yok; içinde düzenle / kaydet.
    const urlBefore = pt.url();
    await pt.click("[data-ann-notes-expand]");
    await pt.waitForSelector("[data-ann-modal='notes'] [data-ann-notes-big-body]");
    const big = await pt.locator("[data-ann-notes-big-body]").evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, w: e.getBoundingClientRect().width }));
    ok(pt.url() === urlBefore && (await pt.locator("[data-ann-stage]").count()) === 1 && big.sh > big.ch && big.w > 600, "Büyüt: aynı sayfada büyük okuma penceresi (harita arka planda), uzun not pencere içinde kayar", big);
    await snap(pt, "Z11-buyuk-not-penceresi-1440");
    await pt.click("[data-ann-notes-big-edit]");
    await pt.fill("[data-ann-notes-big-input]", "Büyük pencerede düzenlenen not.");
    await pt.click("[data-ann-notes-big-save]");
    await pt.waitForSelector("[data-ann-notes-big-body]");
    await pt.click("[data-ann-notes-big-close]");
    ok((await layerRow(T))?.doc.notes === "Büyük pencerede düzenlenen not." && (await els(pt)) === 5, "büyük pencerede Düzenle → Kaydet; kapatınca harita ve çizimler yerinde");
    // Sil: açık onay.
    await pt.click("[data-ann-notes-delete]");
    await pt.waitForSelector("[data-ann-modal='notesDelete']");
    await pt.locator("[data-ann-modal='notesDelete'] button", { hasText: "Vazgeç" }).click();
    ok((await layerRow(T))?.doc.notes === "Büyük pencerede düzenlenen not.", "Sil → Vazgeç: not korunur");
    await pt.click("[data-ann-notes-delete]");
    await pt.click("[data-ann-notes-delete-confirm]");
    await pt.waitForSelector("[data-ann-msg='ok']");
    ok((await layerRow(T))?.doc.notes === "" && (await layerRow(T))?.el_count === 4, "Sil → açık onay: yalnız eğitim notu silindi; çizimler etkilenmedi");
    // Not taslağı açıkken çıkış uyarısı.
    await pt.click("[data-ann-notes-edit]");
    await pt.fill("[data-ann-general-notes]", "kaydedilmemiş not");
    await pt.click("[data-ann-back]");
    await pt.waitForSelector("[data-ann-modal='leave']");
    ok(true, "kaydedilmemiş not taslağında çıkış uyarısı gösterildi");
    await pt.locator("[data-ann-modal='leave'] button", { hasText: "Vazgeç" }).click();
    await pt.click("[data-ann-notes-cancel]");
    await pt.click("[data-ann-save]"); await pt.waitForSelector("[data-ann-status='saved']");
    // Sunum modu: kutu içi metin görünür; açılır not + Genişlet.
    await pt.click("[data-ann-tool-btn='bubble']");
    await pt.mouse.click(sb.x + sb.width * 0.88, sb.y + sb.height * 0.1);
    await pt.fill("[data-ann-note-input]", "Açılır not — " + "uzun metin ".repeat(120));
    await pt.click("[data-ann-save]"); await pt.waitForSelector("[data-ann-status='saved']");
    await pt.click("[data-ann-present-open]");
    await pt.waitForSelector("[data-ann-present] [data-ann-box-text]");
    const popB = pt.locator("[data-ann-present] [data-ann-mode='pop']").first();
    await popB.click();
    await pt.waitForSelector("[data-ann-popover-body]");
    const pb = await pt.locator("[data-ann-popover-body]").evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    await pt.click("[data-ann-popover-expand]");
    await pt.waitForSelector("[data-ann-modal='bubble'] [data-ann-bigbubble-body]");
    ok(pb.sh > pb.ch, "sunum modu: kutu içi metin görünür; açılır not kayar ve 'Genişlet' büyük okuma penceresini açar", pb);
    await snap(pt, "Z12-sunum-genislet-1440");
    await pt.click("[data-ann-bigbubble-close]");
    await pt.click("[data-ann-present-exit]");
    // Temiz görünüm / çizimleri göster.
    await pt.click("[data-ann-clean]");
    ok((await pt.getAttribute("[data-ann-overlay]", "data-ann-hidden")) === "1" && (await els(pt)) === 0, "Temiz görünüm: çizimler gizlendi");
    await pt.click("[data-ann-clean]");
    ok((await els(pt)) === 6, "Çizimleri göster: aynı 6 öğe");
    await pt.close();
    // Aynı katman 1024 / 768 / 390 px: kutu baloncuk ve yan çizimler BodyGraph'a göre AYNI yerde (oran farkı < %0,4).
    const rel = async (pg: Page) => pg.evaluate(() => {
      const bg = document.querySelector("[data-ann-workspace] [data-ann-bg]")!.getBoundingClientRect();
      const r = (sel: string) => { const b = document.querySelector(sel)!.getBoundingClientRect(); return { x: (b.x - bg.x) / bg.width, y: (b.y - bg.y) / bg.height, w: b.width / bg.width }; };
      return { box: r("[data-ann-workspace] [data-ann-mode='in'] rect"), pen: r("[data-ann-workspace] [data-ann-type='pen'] polyline") };
    });
    const relW: Array<{ w: number; m: Awaited<ReturnType<typeof rel>> }> = [];
    for (const w of [1440, 1024, 768, 390]) {
      const mob = w < 1024;
      const c = await ctxFor(T, w, mob ? (w < 500 ? 844 : 1024) : 900, mob);
      const pg = await open(c, wsUrl); await ready(pg);
      relW.push({ w, m: await rel(pg) });
      const ovf = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(ovf <= 0, `${w} px: sayfa yatay taşmıyor (yan alanlar yalnız tuval kabında kayar)`, ovf);
      if (w === 390) {
        const sw = await pg.locator("[data-ann-stagewrap]").evaluate((e) => ({ sl: e.scrollLeft, sw: e.scrollWidth, cw: e.clientWidth }));
        ok(sw.sw > sw.cw && Math.abs(sw.sl - (sw.sw - sw.cw) / 2) < 3, "390 px: tuval yatay kayar, başlangıçta BodyGraph ortada", sw);
      }
      await snap(pg, `Z13-tuval-${w}`);
      await c.close();
    }
    const spread = (f: (m: Awaited<ReturnType<typeof rel>>) => number) => { const v = relW.map((x) => f(x.m)); return Math.max(...v) - Math.min(...v); };
    ok(spread((m) => m.box.x) < 0.004 && spread((m) => m.box.y) < 0.004 && spread((m) => m.box.w) < 0.004 && spread((m) => m.pen.x) < 0.004 && spread((m) => m.pen.y) < 0.004,
      "1440 / 1024 / 768 / 390 px: kutu baloncuk ve sol boşluktaki kalem BodyGraph'a göre AYNI yerde (kayma yok)", relW);
    // Owner gerçek BodyGraph denetimi: aynı yan alan çizimleri ve kutu.
    const otc = await ctxFor(OWNER, 1440, 900, false);
    const pot = await open(otc, "/admin/hd-egitim-cizimleri");
    const tLayer = (await q(`select id from public.hd_edu_annotation_layers where trainer_user_id=$1`, [T.id])).rows[0].id as string;
    await pot.waitForSelector(`[data-ann-owner-view='${tLayer}']`);
    await pot.click(`[data-ann-owner-view='${tLayer}']`);
    await pot.waitForSelector(`[data-ann-owner-viewer='${tLayer}'][data-ann-owner-real-chart='1'] [data-ann-overlay]`);
    const ovv = `[data-ann-owner-viewer='${tLayer}']`;
    ok((await pot.locator(`${ovv} [data-ann-overlay] [data-ann-el]`).count()) === 6 && (await pot.locator(`${ovv} [data-ann-box-text]`).count()) === 1,
      "owner: gerçek renkli BodyGraph üzerinde 6 öğe + kutu içi baloncuk metni (salt okunur)");
    await pot.locator(ovv).scrollIntoViewIfNeeded();
    await snap(pot, "Z14-owner-tuval-yan-alanlar", true);
    await otc.close();
    await tctx.close();
    }

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
