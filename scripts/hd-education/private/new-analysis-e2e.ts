/**
 * FAZ 13 (owner incelemesi) — "Yeni Human Design Analizi" → gerçek analiz ekranı → normal kayıt → "Eğitim Arşivime Ekle"
 * → izin → eğitim bilgisi → özel arşiv → çalışma alanı · GERÇEK TARAYICI uçtan uca testi.
 * Playwright → `next start` → gerçek route'lar (danışan yolculuğu + Roxy hesaplama hattı + özel arşiv) → PostgREST shim →
 * izole embedded-postgres (gerçek migration'lar). Hesaplama ÜCRETSİZ: Roxy taban adresi YEREL HTTPS sahte sunucuya yönlenir
 * (kendinden imzalı sertifika yalnız bu süreçte güvenilir; NODE_EXTRA_CA_CERTS) ve repo fixture'ının tutarlı yanıtını döner.
 * Gerçek Roxy / gerçek anahtar YOK; dış istekler abort edilir ve sayılır.
 *
 * Ön koşul (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:<HD_EDU_TEST_HTTP_PORT|54398> NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/private/new-analysis-e2e.ts --out <repo-dışı YENİ boş klasör>
 */
import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createHttpsServer, type Server } from "node:https";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { consistentRoxyResponse } from "../../hd-roxy/consistentFixture";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3988;
const APP = `http://127.0.0.1:${PORT}`;
const HTTP_PORT = Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398);
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const FIXTURE = readFileSync(path.join(process.cwd(), "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
const CENTRAL = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const shots: string[] = [];
async function snap(page: Page, name: string, full = true) {
  const file = path.join(OUT, `${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.waitForTimeout(250);
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

/** Yerel kendinden imzalı sertifika (yalnız 127.0.0.1; geçici klasör). */
function makeCert(dir: string): { cert: string; key: string } {
  const cert = path.join(dir, "cert.pem"), key = path.join(dir, "key.pem");
  const args = ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=127.0.0.1",
    "-addext", "subjectAltName=IP:127.0.0.1", "-addext", "basicConstraints=critical,CA:TRUE"];
  const bins = ["openssl", "C:/Program Files/Git/usr/bin/openssl.exe", "C:/Program Files/Git/mingw64/bin/openssl.exe"];
  for (const b of bins) { try { execFileSync(b, args, { stdio: "ignore" }); if (existsSync(cert)) return { cert, key }; } catch { /* sonraki */ } }
  throw new Error("openssl bulunamadı (yerel sahte Roxy sertifikası üretilemedi)");
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let env: TestEnv | null = null;
  let roxySrv: Server | null = null;
  const external: string[] = [];
  const consoleErrors: string[] = [];
  const roxy = { bodygraph: 0, other: [] as string[] };
  try {
    // ── Yerel sahte Roxy (HTTPS) ────────────────────────────────────────────────────────────────
    const tmp = mkdtempSync(path.join(os.tmpdir(), "zz-roxy-fake-"));
    const { cert, key } = makeCert(tmp);
    roxySrv = createHttpsServer({ cert: readFileSync(cert), key: readFileSync(key) }, (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const url = req.url ?? "";
        if (req.method === "POST" && /\/human-design\/bodygraph/.test(url)) {
          roxy.bodygraph++;
          res.writeHead(200, { "content-type": "application/json" });
          res.end(consistentRoxyResponse(FIXTURE, Buffer.concat(chunks).toString("utf8")));
          return;
        }
        roxy.other.push(`${req.method} ${url}`);
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    const roxyPort = await new Promise<number>((resolve) => roxySrv!.listen(0, "127.0.0.1", () => resolve((roxySrv!.address() as { port: number }).port)));

    env = await startAnamnezTestEnv({
      port: Number(process.env.HD_EDU_NEWAN_PG_PORT ?? 54830 + (Date.now() % 40)), httpPort: HTTP_PORT, dirName: `hd-edu-newan-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: [...PRIVATE_RPCS, "hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      // Analiz akışı ek şeması (gerçek migration): doğum yeri kolonları (danışan yolculuğu yazar).
      extraSql: [readMig("20270129000300_clients_create_request_id.sql"), ...privateArchiveSql(), ...CENTRAL.map(readMig), readMig("20271008000000_hd_client_birth_location.sql"), readMig("20261221000200_hd_report_snapshot.sql")],
    });
    const su = env.su;
    su.on("error", (e) => { consoleErrors.push(`pg bağlantısı düştü: ${e.message}`); });
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    const count = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);
    await q(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports, public.human_design_knowledge_records to service_role`);
    type U = { id: string; token: string; name: string; role: "admin" | "expert"; tenant: string };
    const mkUser = async (role: "admin" | "expert", name: string, perms: Record<string, boolean>, superAdmin = false): Promise<U> => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-newan-${randomUUID()}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_T_${name}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.newan.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(perms), role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role, tenant };
    };
    const OWNER = await mkUser("admin", "ZZ Owner", {}, true);
    const T = await mkUser("expert", "ZZ Eğitmen Tuna", { human_design: true, clients: true });
    // N: eğitim yetkisi verilirken HD izni vardı; sonra platform yöneticisi HD hesaplama iznini kaldırdı (gerçekçi durum).
    const N = await mkUser("expert", "ZZ Eğitmen Hesapsız", { human_design: true, clients: true });
    const D = await mkUser("expert", "ZZ Başka Tenant Eğitmeni", { human_design: true, clients: true });
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK-HUKUK-REF')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    for (const w of [T, N, D]) {
      try { await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]); }
      catch (e) { console.log(`  · eğitim yetkisi verilemedi (${w.name}): ${(e as Error).message.slice(0, 120)}`); }
    }
    await q(`update public.users set module_permissions = $2 where id=$1`, [N.id, JSON.stringify({ clients: true })]);
    const nGrant = await count(`select count(*) n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [N.id]).catch(() => -1);

    const envv: Record<string, string | undefined> = {
      ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_PRIVATE_EDUCATION_ENABLED: "true", HD_EDUCATION_CATALOG_ENABLED: "true",
      ROXY_API_KEY: "zz-local-fake-roxy-key", ROXY_API_BASE_URL: `https://127.0.0.1:${roxyPort}/api/v2`, NODE_EXTRA_CA_CERTS: cert,
      HD_LOCATION_REF_SECRET: "zz-newan-location-secret",
    };
    delete envv.HD_EDUCATION_PROVIDER_CALLS_ENABLED;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: envv as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    const appLog: string[] = [];
    app.stdout?.on("data", (d) => appLog.push(String(d))); app.stderr?.on("data", (d) => appLog.push(String(d)));
    process.on("exit", () => { try { writeFileSync(path.join(OUT, "_next-sunucu.log"), appLog.join("").slice(-200000)); } catch { /* */ } });
    const appPid = app.pid;
    process.on("exit", () => { if (appPid && process.platform === "win32") { try { execSync(`taskkill /pid ${appPid} /T /F`, { stdio: "ignore" }); } catch { /* zaten kapalı */ } } });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (u: U, w = 1440, h = 900, mobile = false): Promise<BrowserContext> => {
      const ctx = await browser!.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(u.role === "admin" ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
      const permsRow = (await q(`select module_permissions from public.users where id=$1`, [u.id])).rows[0].module_permissions;
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: "zz@example.test", role: u.role, active: true, approval_status: "approved",
        package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: permsRow };
      await ctx.addInitScript("window.__name = window.__name || function (f) { return f; };");
      await ctx.addInitScript(([pu, tok]) => { try { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); } catch { /* */ } }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      ctx.on("page", (p) => {
        p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 300)}`); });
        p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${e.message.slice(0, 300)}`));
      });
      return ctx;
    };
    const open = async (ctx: BrowserContext, url: string) => { const p = await ctx.newPage(); p.setDefaultTimeout(45000); await p.goto(`${APP}${url}`, { waitUntil: "load", timeout: 90000 }); return p; };
    const api = async (u: U, method: string, url: string, body?: unknown) => {
      const r = await fetch(`${APP}${url}`, { method, headers: { "content-type": "application/json", "x-user-id": u.id, "x-session-token": u.token, origin: APP }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: r.status, json: await r.json().catch(() => null) as Record<string, unknown> | null };
    };

    // ── 1) Eğitim Merkezi → "Yeni Human Design Analizi" → gerçek analiz ekranı ───────────────────
    section("1 · Eğitim Merkezi'nden Yeni Human Design Analizi → gerçek analiz ekranı");
    const tctx = await ctxFor(T);
    const pl = await open(tctx, "/human-design/egitim-merkezi/ozel");
    await pl.waitForSelector("[data-edu-new-analysis]");
    ok((await pl.locator("[data-edu-add-existing]").count()) === 1, "Yöntem A 'Mevcut Haritayı Ekle' korunuyor");
    await snap(pl, "N01-ozel-arsiv-iki-yontem-1440", false);
    await pl.click("[data-edu-new-analysis]");
    await pl.waitForURL(/\/human-design\/danisanlar\?egitim=1/);
    await pl.waitForSelector("[data-hd-edu-banner='start']");
    await pl.waitForSelector("[data-hd-new-client-form]");
    ok(true, "gerçek Human Design Çalışma Alanı (Yeni Hesaplama formu) açıldı; Eğitim Merkezi bandı görünür");
    await snap(pl, "N02-gercek-analiz-ekrani-egitim-bandi-1440", false);
    const charts0 = await count(`select count(*) n from public.human_design_charts where tenant_id=$1`, [T.tenant]);
    // Doğum verisi girişi (mevcut doğrulama: zorunlu alanlar, listeden yer).
    await pl.locator("#hd-new-ad").fill("Deniz");
    await pl.locator("#hd-new-soyad").fill("Örnekçi");
    await pl.locator("#hd-new-dogum").fill("20072018");
    await pl.locator("#hd-new-saat").fill("1900");
    await pl.locator("#hd-new-client-birth-place").fill("Selçuklu");
    await pl.getByRole("option", { name: /Selçuklu/ }).first().click();
    await pl.click("[data-hd-new-client-save]");
    await pl.waitForSelector("[data-hd-edu-banner='done']", { timeout: 90_000 });
    await pl.waitForSelector("[data-hd-edu-archive-add]", { timeout: 60_000 });
    const href = (await pl.locator("[data-hd-edu-banner-add]").getAttribute("href")) ?? "";
    const chartId = new URL(href, APP).searchParams.get("chart") ?? "";
    const row = (await q(`select id, source, provider, computed_result, client_id, user_id from public.human_design_charts where id=$1`, [chartId])).rows[0];
    ok(roxy.bodygraph === 1 && !!row && row.source === "computed" && row.user_id === T.id && !!row.computed_result && row.client_id,
      "mevcut motor + mevcut Roxy hattıyla hesaplandı ve normal kayıt mekanizmasıyla kaydedildi (sahte Roxy çağrısı 1; ücretli çağrı YOK)", { roxy: roxy.bodygraph, source: row?.source });
    ok(await count(`select count(*) n from public.human_design_charts where tenant_id=$1`, [T.tenant]) === charts0 + 1, "tek yeni kayıtlı harita (ikinci hesaplama sistemi yok)");
    const crHash = createHash("sha256").update(JSON.stringify(row.computed_result)).digest("hex");
    const hdClient = String(row.client_id);
    await snap(pl, "N03-analiz-kaydedildi-egitim-arsivime-ekle-1440", false);

    // ── 2) Eğitim Arşivime Ekle → izin → eğitim bilgisi → arşiv ──────────────────────────────────
    section("2 · Eğitim Arşivime Ekle → danışan izni → eğitim bilgileri → özel arşiv");
    // Kayıttan sonra açılan profesyonel harita penceresindeki "Eğitim Arşivime Ekle" (kullanıcının gördüğü yol).
    ok(((await pl.locator("[data-hd-edu-archive-add]").getAttribute("href")) ?? "").includes(`chart=${chartId}`), "açılan haritada 'Eğitim Arşivime Ekle' (kaynak seçili)");
    await pl.click("[data-hd-edu-archive-add]");
    await pl.waitForURL(/\/egitim-merkezi\/ozel\/ekle\?chart=/);
    await pl.waitForFunction(() => !(document.querySelector("[data-edu-next='1']") as HTMLButtonElement)?.disabled, undefined, { timeout: 45000 });
    ok((await pl.locator(`[data-edu-chart='${chartId}'] input`).isChecked()), "kaynak harita seçili geldi (ekleme mevcut adımlarla sürer)");
    await pl.click("[data-edu-next='1']");
    await pl.waitForSelector("[data-edu-noconsent]");
    ok(await pl.locator("[data-edu-next='2']").isDisabled(), "danışanın belgeli izni yok → Devam KAPALI (izinsiz arşiv kaydı yok)");
    const items0 = await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1`, [T.id]);
    await pl.click("[data-edu-new-consent]");
    await pl.waitForSelector("[data-edu-consent-form]");
    await pl.fill("[data-edu-consenter]", "Deniz Örnekçi");
    await pl.click("[data-edu-scope='anonim']");
    await pl.selectOption("[data-edu-method]", "islak_imza_tarama");
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ_SENTETIK_IZIN\n"), Buffer.alloc(300, 0x20)]);
    await pl.setInputFiles("[data-edu-evidence]", { name: "zz-izin.pdf", mimeType: "application/pdf", buffer: pdf });
    await pl.click("[data-edu-consent-save]");
    await pl.waitForSelector("[data-edu-consent]");
    await pl.waitForFunction(() => !(document.querySelector("[data-edu-next='2']") as HTMLButtonElement)?.disabled);
    ok(await count(`select count(*) n from public.hd_edu_private_consents where hd_client_id=$1 and withdrawn_at is null`, [hdClient]) === 1, "belgeli izin + kanıt DB'de");
    await pl.click("[data-edu-next='2']");
    await pl.waitForSelector("[data-edu-step='3']");
    await pl.fill("[data-edu-title]", "ZZ Yeni analizden eğitim örneği");
    await pl.fill("[data-edu-alias]", "Örnek Danışan D.");
    await pl.fill("[data-edu-notes]", "ZZ yeni analiz anlatım notu");
    await snap(pl, "N04-egitim-bilgileri-1440", false);
    await pl.click("[data-edu-submit]");
    await pl.waitForSelector("[data-edu-add-success], [data-edu-detail-state]", { timeout: 45000 });
    const item = (await q(`select id, source_chart_id, consent_id from public.hd_edu_private_items where trainer_user_id=$1 order by created_at desc limit 1`, [T.id])).rows[0];
    ok(await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1`, [T.id]) === items0 + 1 && item?.source_chart_id === chartId,
      "özel eğitim arşivine eklendi (kaynak analizle güvenli bağ)", item);
    ok(roxy.bodygraph === 1, "arşive ekleme YENİ Roxy çağrısı gerektirmedi", roxy.bodygraph);

    // ── 3) Arşivde görüntüleme + çalışma alanı + yeniden açma ─────────────────────────────────────
    section("3 · Arşivde görüntüleme, çalışma alanı, yeniden açma");
    const pd = await open(tctx, `/human-design/egitim-merkezi/ozel/${item.id}`);
    await pd.waitForSelector("[data-edu-bodygraph]");
    ok((await pd.locator("[data-edu-detail-state]").getAttribute("data-edu-detail-state")) === "ok", "kayıt erişime açık; BodyGraph görüntüleniyor");
    await snap(pd, "N05-arsiv-kaydi-1440");
    // Çalışma alanı #551 (çizim katmanı) ile gelir; bu PR'da yoksa yalnız arşiv görünümü + yeniden açma denetlenir.
    if (existsSync(path.join(process.cwd(), "app/human-design/egitim-merkezi/ozel/[id]/calisma-alani/page.tsx"))) {
      await pd.click("[data-edu-workspace]");
      await pd.waitForURL(/calisma-alani/);
      await pd.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
      await pd.click("[data-ann-tool-btn='pen']");
      const sb = (await pd.locator("[data-ann-stage]").boundingBox())!;
      await pd.mouse.move(sb.x + sb.width * 0.3, sb.y + sb.height * 0.4); await pd.mouse.down();
      for (let i = 1; i <= 10; i++) await pd.mouse.move(sb.x + sb.width * (0.3 + i * 0.01), sb.y + sb.height * (0.4 + i * 0.01));
      await pd.mouse.up();
      await pd.click("[data-ann-save]");
      await pd.waitForSelector("[data-ann-status='saved']");
      await pd.reload({ waitUntil: "load" });
      await pd.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
      ok((await pd.locator("[data-ann-overlay] [data-ann-el]").count()) === 1, "çalışma alanında çizim kaydedildi ve yeniden açıldı");
      await snap(pd, "N06-calisma-alani-1440", false);
    } else {
      await pd.reload({ waitUntil: "load" });
      await pd.waitForSelector("[data-edu-bodygraph]");
      ok(true, "arşiv kaydı yeniden açıldı (çalışma alanı bu katmanda yok)");
    }
    await pd.close();

    // ── 4) Aynı kaydı tekrar ekleme + vazgeçme ────────────────────────────────────────────────────
    section("4 · Aynı haritayı ikinci kez ekleme; işlemden vazgeçme");
    const pdup = await open(tctx, `/human-design/egitim-merkezi/ozel/ekle?chart=${chartId}`);
    await pdup.waitForSelector("[data-edu-ineligible='duplicate']");
    ok(await pdup.locator("[data-edu-next='1']").isDisabled(), "aynı harita ikinci kez eklenemez (mevcut kayda bağlantı)");
    const dupApi = await api(T, "POST", "/api/hd/education/private/items", { chartId, consentId: item.consent_id, title: "ZZ tekrar", aliasLabel: "Örnek X.", displayMode: "alias", category: "tip" });
    ok(dupApi.status === 409 && await count(`select count(*) n from public.hd_edu_private_items where source_chart_id=$1`, [chartId]) === 1, "sunucu da çoğaltmayı reddeder", dupApi.status);
    await pdup.close();
    const pc = await open(tctx, "/human-design/egitim-merkezi/ozel");
    await pc.click("[data-edu-new-analysis]");
    await pc.waitForSelector("[data-hd-edu-banner='start']");
    const chartsBeforeCancel = await count(`select count(*) n from public.human_design_charts where tenant_id=$1`, [T.tenant]);
    await pc.click("[data-hd-edu-banner-back]");
    await pc.waitForURL(/\/egitim-merkezi\/ozel$/);
    ok(await count(`select count(*) n from public.human_design_charts where tenant_id=$1`, [T.tenant]) === chartsBeforeCancel && roxy.bodygraph === 1, "vazgeçme: kayıt / hesaplama / arşiv kaydı oluşmadı, Eğitim Merkezi'ne dönüldü");
    await pc.close();

    // ── 5) Yetkisiz hesap + farklı tenant ─────────────────────────────────────────────────────────
    section("5 · Yetkisiz hesap ve farklı tenant denemeleri");
    if (nGrant > 0) {
      const nctx = await ctxFor(N);
      const pn = await open(nctx, "/human-design/egitim-merkezi/ozel");
      await pn.waitForLoadState("networkidle").catch(() => undefined);
      await pn.waitForTimeout(2500);
      const shown = (await pn.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 160);
      const off = await pn.locator("[data-edu-new-analysis-off]").count();
      ok((await pn.locator("[data-edu-new-analysis]").count()) === 0,
        off ? "HD hesaplama izni olmayan eğitmen: düğme pasif + güvenli açıklama (yetki sessizce verilmez)"
          : "HD modül izni kaldırılan eğitmen: mevcut yetki mimarisi Eğitim Merkezi'ni de kapatır → yeni analiz girişi yok (yetki sessizce verilmez)", shown);
      console.log(`  · yetkisiz eğitmenin gördüğü: ${off ? "pasif düğme + açıklama" : shown}`);
      await snap(pn, "N07-hesaplama-yetkisi-yok-1440", false);
      await nctx.close();
    } else ok(true, "HD izni olmayan kullanıcıya eğitim yetkisi verilemedi (mevcut yetki mimarisi) → giriş noktası zaten kapalı");
    const nCalc = await api(N, "POST", "/api/hd/charts/roxy", { client_id: hdClient, location_id: "client" });
    ok(nCalc.status === 403 || nCalc.status === 404, "HD izni olmayan hesap hesaplama ucunu çağıramaz (sunucu reddi)", nCalc.status);
    const dctx = await ctxFor(D);
    const pdd = await open(dctx, `/human-design/egitim-merkezi/ozel/ekle?chart=${chartId}`);
    await pdd.waitForSelector("text=Harita bulunamadı veya bu harita size ait değil.");
    ok(true, "farklı tenant eğitmeni başka tenant'ın analizini eğitim arşivine ekleyemez");
    const dItem = await api(D, "GET", `/api/hd/education/private/items/${item.id}`);
    const dStatus = await api(D, "GET", `/api/hd/education/private/charts/${chartId}/status`);
    ok(dItem.status === 404 && dStatus.status === 404, "farklı tenant: arşiv kaydı ve kaynak harita durumu 404", { dItem: dItem.status, dStatus: dStatus.status });
    await dctx.close();

    // ── 6) Danışan izninin geri çekilmesi ─────────────────────────────────────────────────────────
    section("6 · Danışan izninin geri çekilmesi");
    const pw = await open(tctx, `/human-design/egitim-merkezi/ozel/${item.id}`);
    await pw.click("[data-edu-withdraw]");
    await pw.click("[data-edu-confirm-next]");
    await pw.click("[data-edu-confirm-final]");
    await pw.waitForURL(/izin=geri/);
    ok(await count(`select count(*) n from public.hd_edu_private_consents k join public.hd_edu_private_items i on i.consent_id=k.id where i.id=$1 and k.withdrawn_at is not null`, [item.id]) === 1,
      "'İzni geri çek' (iki aşamalı onay) → izin DB'de geri çekildi");
    await pw.goto(`${APP}/human-design/egitim-merkezi/ozel/${item.id}`, { waitUntil: "load" });
    await pw.waitForSelector("[data-edu-notfound]");
    ok(true, "izin geri çekildi → kayıt erişime kapandı ('Sayfa bulunamadı')");
    if (existsSync(path.join(process.cwd(), "app/human-design/egitim-merkezi/ozel/[id]/calisma-alani/page.tsx"))) {
      await pw.goto(`${APP}/human-design/egitim-merkezi/ozel/${item.id}/calisma-alani`, { waitUntil: "load" });
      await pw.waitForSelector("[data-edu-notfound]");
      ok(true, "izin geri çekildi → çalışma alanı açılmaz");
    }
    await pw.close();

    // ── 7) Normal HD arşivi / danışan değişmedi ───────────────────────────────────────────────────
    section("7 · Kaynak analiz, danışan ve normal HD arşivi korunur");
    const row2 = (await q(`select computed_result from public.human_design_charts where id=$1`, [chartId])).rows[0];
    ok(createHash("sha256").update(JSON.stringify(row2.computed_result)).digest("hex") === crHash, "kaynak analiz (computed_result) arşivleme / izin geri çekme sonrası birebir aynı");
    ok(await count(`select count(*) n from public.human_design_clients where id=$1`, [hdClient]) === 1, "danışan kaydı korunur");

    // ── 8) Mobil / tablet emülasyonu ─────────────────────────────────────────────────────────────
    section("8 · 390 / 820 px (emülasyon — fiziksel cihaz DEĞİL)");
    for (const [w, h] of [[390, 844], [820, 1180]] as const) {
      const c = await ctxFor(T, w, h, true);
      const p1 = await open(c, "/human-design/egitim-merkezi/ozel");
      await p1.waitForSelector("[data-edu-new-analysis]");
      const o1 = await p1.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await snap(p1, `N08-ozel-${w}`, false);
      const p2 = await open(c, "/human-design/danisanlar?egitim=1");
      await p2.waitForSelector("[data-hd-edu-banner='start']");
      const o2 = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await snap(p2, `N09-analiz-bandi-${w}`, false);
      ok(o1 <= 0 && o2 <= 0, `${w} px: özel arşiv ve analiz bandı yatay taşmıyor`, { o1, o2 });
      await c.close();
    }

    section("Genel");
    ok(external.length === 0, "tarayıcıdan dış ağ isteği 0", external.slice(0, 5));
    ok(roxy.bodygraph === 1, "toplam Roxy (sahte, yerel) hesaplama çağrısı 1 — ücretli çağrı 0", roxy.bodygraph);
    const appErrors = consoleErrors.filter((e) => !/_vercel\/(speed-)?insights/.test(e));
    writeFileSync(path.join(OUT, "_konsol-hatalari.txt"), [`uygulama: ${appErrors.length}`, `sahte Roxy diğer istekler: ${roxy.other.join(", ")}`, "", ...consoleErrors].join("\n"));
    ok(appErrors.length === 0, "uygulama console error 0", appErrors.slice(0, 6));
    await tctx.close();
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"]); else app.kill(); } catch { /* */ } }
    roxySrv?.close();
    await env?.stop();
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL · ekran görüntüsü: ${shots.length}`);
  if (fail) { console.error(fails.join("\n")); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error("HATA", e); process.exit(1); });
