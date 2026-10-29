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
// Çizim katmanı (#551) varsa: migration + RPC'ler (bu katmanda yoksa yalnız arşiv görünümü denetlenir).
const ANN_MIG = "20271206000100_hd_education_annotations.sql";
const HAS_ANN = existsSync(path.join(process.cwd(), "supabase/migrations", ANN_MIG));
const ANN_RPC_NAMES = ["hd_edu_ann_get", "hd_edu_ann_save", "hd_edu_ann_clear", "hd_edu_ann_owner_list", "hd_edu_ann_owner_get", "hd_edu_ann_owner_delete",
  "hd_edu_ann_owner_trainers", "hd_edu_ann_owner_purge_preview", "hd_edu_ann_owner_purge"];

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
      rpcAllow: [...PRIVATE_RPCS, "hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible", ...(HAS_ANN ? ANN_RPC_NAMES : [])],
      // Analiz akışı ek şeması (gerçek migration): doğum yeri kolonları (danışan yolculuğu yazar).
      extraSql: [readMig("20270129000300_clients_create_request_id.sql"), ...privateArchiveSql(), ...CENTRAL.map(readMig), readMig("20271008000000_hd_client_birth_location.sql"), readMig("20261221000200_hd_report_snapshot.sql"), ...(HAS_ANN ? [readMig(ANN_MIG)] : [])],
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
    // FAZ 19 (P3): bant gerçek danışan kaydı oluşturulacağını açıkça söyler + kurgusal yol bağlantısı.
    ok(/GERÇEK danışan kaydı oluşturur/.test(await pl.locator("[data-hd-edu-banner='start']").innerText())
      && (await pl.locator("[data-hd-edu-banner-fictional]").getAttribute("href")) === "/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal",
      "Yeni Analiz bandı: 'GERÇEK danışan kaydı' uyarısı + Kurgusal Harita Oluştur bağlantısı");
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
    ok(await pl.locator("[data-edu-next='2']").isDisabled(), "danışanın izni / beyanı yok → Devam KAPALI (izinsiz arşiv kaydı yok)");
    const items0 = await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1`, [T.id]);
    // FAZ 14: sade eğitmen beyanı — beyan metni hukuk + owner onaylı değilken yol KAPALI.
    await pl.click("[data-edu-new-declaration]");
    await pl.waitForSelector("[data-edu-decl-closed]");
    ok(true, "beyan metni hukuk onaylı değil → gerçek danışan beyan yolu KAPALI, kurgusal yol önerilir");
    await snap(pl, "N04a-beyan-hukuk-onayi-bekliyor-1440", false);
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-beyan-v1','ZZ-SENTETIK-HUKUK-REF (yalnız test)')`, [OWNER.id]);
    await pl.reload({ waitUntil: "load" });
    await pl.waitForFunction(() => !(document.querySelector("[data-edu-next='1']") as HTMLButtonElement)?.disabled, undefined, { timeout: 45000 });
    await pl.click("[data-edu-next='1']");
    await pl.waitForSelector("[data-edu-noconsent]");
    await pl.click("[data-edu-new-declaration]");
    await pl.waitForSelector("[data-edu-decl-form]");
    ok((await pl.locator("[data-edu-evidence]").count()) === 0 && (await pl.locator("[data-edu-decl-save]").isDisabled()),
      "beyan formu: dosya yükleme / imza alanı YOK; beyan onaylanmadan kaydedilemez");
    await snap(pl, "N04b-sade-beyan-formu-1440", false);
    await pl.click("[data-edu-decl-accept]");
    await pl.click("[data-edu-decl-save]");
    await pl.waitForSelector("[data-edu-consent]");
    await pl.waitForFunction(() => !(document.querySelector("[data-edu-next='2']") as HTMLButtonElement)?.disabled);
    const kRow = (await q(`select method, display_scope, include_birth_data, text_version, recorded_by from public.hd_edu_private_consents where hd_client_id=$1 and withdrawn_at is null`, [hdClient])).rows;
    ok(kRow.length === 1 && kRow[0].method === "egitmen_beyani" && kRow[0].display_scope === "anonim" && kRow[0].include_birth_data === false && kRow[0].text_version === "hd-egitim-beyan-v1"
      && kRow[0].recorded_by === T.id && await count(`select count(*) n from public.hd_edu_private_consent_evidence`) === 0,
      "eğitmen beyanı DB'de: yöntem beyan, takma ad, doğum bilgisi kapalı, beyan sürümü + eğitmen; DOSYA YOK", kRow);
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

    // ── 2b) FAZ 14 · Kurgusal eğitim haritası ─────────────────────────────────────────────────────
    section("2b · Kurgusal eğitim haritası: izin YOK, gerçek kişi kaydı YOK, çizim + not");
    const before = { cl: await count(`select count(*) n from public.clients`), hc: await count(`select count(*) n from public.human_design_clients`),
      ch: await count(`select count(*) n from public.human_design_charts`), k: await count(`select count(*) n from public.hd_edu_private_consents`) };
    const pf = await open(tctx, "/human-design/egitim-merkezi/ozel");
    await pf.click("[data-edu-add-fictional]");
    await pf.waitForSelector("[data-edu-fictional-form]");
    ok((await pf.locator("[data-edu-fictional-form] input[type='file']").count()) === 0 && (await pf.locator("[data-edu-fic-submit]").isDisabled()),
      "kurgusal form: belge / imza yok; beyan ve alanlar tamamlanmadan gönderilemez");
    await pf.fill("[data-edu-fic-title]", "ZZ Kurgusal sakral örnek");
    await pf.locator("#edu-fic-date").fill("15031990");
    await pf.locator("#edu-fic-time").fill("0830");
    await pf.locator("#edu-fic-place").fill("Selçuklu");
    await pf.getByRole("option", { name: /Selçuklu/ }).first().click();
    ok(await pf.locator("[data-edu-fic-submit]").isDisabled(), "kurgusal beyan işaretlenmeden hesaplama başlamaz");
    await pf.click("[data-edu-fic-accept]");
    await snap(pf, "N10-kurgusal-form-1440", false);
    await pf.click("[data-edu-fic-submit]");
    await pf.waitForSelector("[data-edu-add-success]", { timeout: 90_000 });
    const fic = (await q(`select id, item_kind, consent_id, hd_client_id, source_chart_id, fic_declaration from public.hd_edu_private_items where trainer_user_id=$1 and item_kind='kurgusal'`, [T.id])).rows[0];
    const after = { cl: await count(`select count(*) n from public.clients`), hc: await count(`select count(*) n from public.human_design_clients`),
      ch: await count(`select count(*) n from public.human_design_charts`), k: await count(`select count(*) n from public.hd_edu_private_consents`) };
    ok(!!fic && fic.consent_id === null && fic.hd_client_id === null && fic.source_chart_id === null && JSON.stringify(after) === JSON.stringify(before) && roxy.bodygraph === 2,
      "kurgusal kayıt oluştu: izin / danışan / normal HD harita / Danışan Yolculuğu kaydı OLUŞMADI; mevcut motorla 1 hesap", { fic, before, after, roxy: roxy.bodygraph });
    await pf.click("[data-edu-open-new]");
    await pf.waitForSelector("[data-edu-bodygraph]");
    ok((await pf.locator("[data-edu-kind]").getAttribute("data-edu-kind")) === "kurgusal" && (await pf.locator("[data-edu-fictional-info]").count()) === 1
      && (await pf.locator("[data-edu-withdraw]").count()) === 0, "ayrıntı: 'Kurgusal Eğitim Haritası' etiketi + beyan bilgisi; izin / geri çekme yok");
    await snap(pf, "N11-kurgusal-ayrinti-1440");
    if (HAS_ANN) {
      await pf.click("[data-edu-workspace]");
      await pf.waitForURL(/calisma-alani/);
      await pf.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
      await pf.click("[data-ann-tool-btn='pen']");
      const fb = (await pf.locator("[data-ann-stage]").boundingBox())!;
      await pf.mouse.move(fb.x + fb.width * 0.3, fb.y + fb.height * 0.4); await pf.mouse.down();
      for (let i = 1; i <= 8; i++) await pf.mouse.move(fb.x + fb.width * (0.3 + i * 0.01), fb.y + fb.height * (0.4 + i * 0.01));
      await pf.mouse.up();
      await pf.click("[data-ann-notes-edit]");
      await pf.fill("[data-ann-general-notes]", "ZZ kurgusal ders notu");
      await pf.click("[data-ann-save]");
      await pf.waitForSelector("[data-ann-status='saved']");
      await pf.reload({ waitUntil: "load" });
      await pf.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
      ok((await pf.locator("[data-ann-overlay] [data-ann-el]").count()) === 1 && /kurgusal ders notu/.test(await pf.locator("[data-ann-notes-view]").innerText()),
        "kurgusal kayıtta çizim + eğitim notu kaydedildi ve yeniden açıldı");
      // FAZ 19 (P3): Sunum Modu kurgusal rozeti başlığın serif yazı tipini DEVRALMAZ (rozet kendi etiket yazı tipiyle).
      await pf.click("[data-ann-present-open]");
      await pf.waitForSelector("[data-ann-present] [data-ann-present-badge] [data-edu-kind='kurgusal']");
      const fonts = await pf.evaluate(() => {
        const b = document.querySelector("[data-ann-present-badge] [data-edu-kind]") as HTMLElement | null;
        const t = b?.closest("[data-ann-present-badge]")?.parentElement as HTMLElement | null;
        return { badge: b ? getComputedStyle(b).fontFamily : "", title: t ? getComputedStyle(t).fontFamily : "" };
      });
      ok(!!fonts.badge && fonts.badge !== fonts.title && !/serif$/i.test(fonts.badge.replace(/sans-serif/gi, "")), "Sunum Modu: kurgusal rozeti kendi (sans) yazı tipinde", fonts);
      await pf.click("[data-ann-present-exit]");
      await pf.waitForSelector("[data-ann-workspace] [data-hd-cbg]");
    }
    const pf2 = await open(tctx, "/human-design/egitim-merkezi/ozel/ekle?tur=kurgusal");
    await pf2.waitForSelector("[data-edu-fictional-form]");
    await pf2.fill("[data-edu-fic-title]", "ZZ Aynı kurgusal");
    await pf2.locator("#edu-fic-date").fill("15031990");
    await pf2.locator("#edu-fic-time").fill("0830");
    await pf2.locator("#edu-fic-place").fill("Selçuklu");
    await pf2.getByRole("option", { name: /Selçuklu/ }).first().click();
    await pf2.click("[data-edu-fic-accept]");
    await pf2.click("[data-edu-fic-submit]");
    await pf2.waitForSelector("[data-edu-fic-error]");
    ok((await pf2.locator("[data-edu-fic-error] a").count()) === 1 && roxy.bodygraph === 2
      && await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1 and item_kind='kurgusal'`, [T.id]) === 1,
      "aynı kurgusal bilgilerle ikinci kez: çoğaltma YOK, ücretli çağrı YOK, mevcut kayda bağlantı");
    const dFic = await api(D, "GET", `/api/hd/education/private/items/${fic.id}`);
    ok(dFic.status === 404, "kurgusal kayıt başka tenant'taki eğitmene görünmez (404)", dFic.status);
    await pf.close(); await pf2.close();

    // ── 3) Arşivde görüntüleme + çalışma alanı + yeniden açma ─────────────────────────────────────
    section("3 · Arşivde görüntüleme, çalışma alanı, yeniden açma");
    const pd = await open(tctx, `/human-design/egitim-merkezi/ozel/${item.id}`);
    await pd.waitForSelector("[data-edu-bodygraph]");
    ok((await pd.locator("[data-edu-detail-state]").getAttribute("data-edu-detail-state")) === "ok", "kayıt erişime açık; BodyGraph görüntüleniyor");
    await snap(pd, "N05-arsiv-kaydi-1440");
    // Çalışma alanı #551 (çizim katmanı) ile gelir; bu PR'da yoksa yalnız arşiv görünümü + yeniden açma denetlenir.
    if (HAS_ANN) {
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
    const roxyBeforeCancel = roxy.bodygraph;
    await pc.click("[data-hd-edu-banner-back]");
    await pc.waitForURL(/\/egitim-merkezi\/ozel$/);
    ok(await count(`select count(*) n from public.human_design_charts where tenant_id=$1`, [T.tenant]) === chartsBeforeCancel && roxy.bodygraph === roxyBeforeCancel, "vazgeçme: kayıt / hesaplama / arşiv kaydı oluşmadı, Eğitim Merkezi'ne dönüldü");
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
    if (HAS_ANN) {
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
    ok(roxy.bodygraph === 2, "toplam Roxy (sahte, yerel) hesaplama çağrısı 2 (1 gerçek analiz + 1 kurgusal) — ücretli çağrı 0", roxy.bodygraph);
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
