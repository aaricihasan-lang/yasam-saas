/**
 * HD Eğitim Merkezi — HUKUK HARİÇ TAMAMLAMA (30.10.2026) tarayıcı + API testi, GERÇEK 50 kişilik paketle.
 * Gerçek Next uygulaması (`next start`) + İZOLE embedded-postgres; paket SHA doğrulamalı geri yüklenir. Production'a
 * HİÇBİR istek yok (localhost dışı her istek abort + sayılır). Ekran görüntüleri yalnız repo DIŞI klasöre.
 *
 *  A) Bayraklar KAPALI (production eşdeğeri):
 *     2) Modül İzinleri anahtarı görünür + "Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı"; ver / kaldır + denetim kaydı;
 *        normal admin ve uzman göremez / değiştiremez; yetkili uzman bile hiçbir eğitim içeriğine erişemez.
 *     3) Teknik engel doğrulaması (UTC-TEYİT / TAKVİM): yanlış teyit reddedilir; doğru teyitte YALNIZ o engel kalkar,
 *        doğum kanıtı / UTC / revizyon / snapshot değişmez; YAŞAYAN KİŞİ ve hukuk engelleri kalkmaz.
 *     6) BodyGraph iç kaydırma yok (%100), yakınlaştırınca kaydırılır, tam ekran, sayfa kaydırması bozulmaz.
 *     7) Owner listesinde Aile Haritaları en altta.  9) "Yayın onayı ver" ön koşul eksikken pasif + eksikler yazılı.
 *  B) Yalnız bu İZOLE kopyada HD_EDUCATION_CATALOG_ENABLED=true + hukuk sonrası akış owner uçlarıyla (kopya veride):
 *     4) Uzman büyük BodyGraph (zoom / sıfırla / tam ekran / gezegen listeleri) + owner alanları yanıtta yok.
 *     5) Uzman aile kartları yalnız TÜM üyeleri yayımlı ailede; eksik üyeli aile + eksik üye hiçbir yanıtta yok.
 *     Yetkisiz uzman / normal admin / owner eğitmen uçlarında 404; yetki kaldırılınca açık oturum kapanır.
 *  Bütünlük: 50 kişi, 50 snapshot, kaynaklar, doğum kanıtı ve hesap sonucu özetleri baştan sona aynı (yeni snapshot yok).
 * Çalıştır: npx tsx scripts/hd-education/real/tamamlama-e2e.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket> --out <yeni klasör>
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { restoreSnapshotFile } from "./snapshot-io";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.HD_EDU_TAMAMLAMA_PORT ?? 3993), APP = `http://127.0.0.1:${PORT}`;
const LIST = `${APP}/admin/hd-egitim-haritalari`, CAT = `${APP}/human-design/egitim-haritalari`;
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string, full = true) => { await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`), fullPage: full }); };
async function waitHttp(url: string, ms: number) { const u = Date.now() + ms; while (Date.now() < u) { try { if ((await fetch(url)).status < 500) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error("zaman aşımı"); }
const VPS = [{ n: "masaustu", w: 1440, h: 900, m: false }, { n: "mobil", w: 390, h: 844, m: true }] as const;
// Uzman yanıtlarında asla bulunmaması gereken owner yönetim alanları / değerleri.
const OWNER_FIELDS = /legalStatus|legal_status|legalNote|legal_note|legalReview|legal_review|blockers|checklist|approvedAt|approved_at|legalClearance|legal_clearance|history|naturalKey|natural_key|publicationStatus|chart_verified|TEST-YEREL-KOPYA|AVUKAT|HUKUK-E|openQuestions/;

type U = { id: string; token: string; name: string; role: "admin" | "expert" };

async function main() {
  let app: ChildProcess | null = null; let browser: Browser | null = null; let env: TestEnv | null = null;
  const external: string[] = []; const pageErrors: string[] = []; let providerReq = 0; const badResponses: string[] = [];
  const stopApp = async () => {
    if (app?.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); }
    app = null; await new Promise((r) => setTimeout(r, 2500));
  };
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"]
      .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    env = await startAnamnezTestEnv({ port: 54467, httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-tamamlama-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig] });
    const su = env.su;
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    // Yalnız TEST şeması (private/ui-e2e.ts ile aynı): Admin → Üye ayrıntısı (USERS_SAFE_SELECT) kolonları izole test users
    // tablosunda eksik → eklenir. Ürün şeması DEĞİŞMEZ.
    for (const [c, t] of [["approved_at", "timestamptz"], ["membership_status", "text"], ["subscription_status", "text"], ["trial_started_at", "timestamptz"],
      ["trial_ends_at", "timestamptz"], ["membership_started_at", "timestamptz"], ["membership_ends_at", "timestamptz"], ["admin_level", "text"],
      ["created_at", "timestamptz"], ["payment_status", "text"], ["last_payment_date", "timestamptz"], ["next_payment_date", "timestamptz"],
      ["paid_amount", "numeric"], ["payment_note", "text"], ["agreed_fee", "numeric"], ["billing_period", "text"], ["license_type", "text"],
      ["allowed_active_sessions", "integer"], ["allowed_locations", "integer"], ["security_mode", "text"], ["security_exempt", "boolean"],
      ["license_note", "text"], ["allowed_desktop_sessions", "integer"], ["allowed_mobile_sessions", "integer"], ["allowed_tablet_sessions", "integer"],
      ["allowed_unknown_sessions", "integer"]] as const) await q(`alter table public.users add column if not exists ${c} ${t}`);
    const tenant = randomUUID();
    await q(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
    await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level) values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    const ownerTok = `zz-tamamlama-${randomUUID()}`;
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, ownerTok]);
    const owner: U = { id: OWNER, token: ownerTok, name: "Yerel Owner", role: "admin" };
    const mkUser = async (role: "admin" | "expert", name: string): Promise<U> => {
      const id = randomUUID();
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',false,$5,$6,'premium','premium',$7)`,
        [id, name, `zz.tamamlama.${id.slice(0, 8)}@example.test`, role, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "admin" : null]);
      const token = `zz-tamamlama-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role };
    };
    const admin = await mkUser("admin", "ZZ Normal Admin");
    const e1 = await mkUser("expert", "ZZ Uzman Bir (yetki verilecek)");
    const e2 = await mkUser("expert", "ZZ Uzman İki (yetkisiz)");
    await q(readFileSync(LOCALKEY, "utf8"));
    await q(readFileSync(IMPORT, "utf8"));
    const manifest = readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
    const gatesOf = new Map<string, number[]>();
    for (const m of manifest) {
      const r = await restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256);
      if (r !== "RESTORED") ok(false, `snapshot geri yükleme: ${m.natural_key}`, r);
      const pkg = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as { chart: { provider_raw: { gates: Array<{ gate: number }> } } };
      gatesOf.set(m.natural_key, [...new Set(pkg.chart.provider_raw.gates.map((g) => g.gate))].sort((a, b) => a - b));
    }
    const idOf = new Map((await q(`select id, natural_key from public.hd_education_subjects`)).rows.map((r: { id: string; natural_key: string }) => [r.natural_key, r.id]));
    const keyOf = new Map([...idOf.entries()].map(([k, v]) => [v, k]));
    const K = {
      einstein: "albert-einstein-1879-03-14", hugo: "victor-hugo-1802-02-26", marie: "marie-curie-1867-11-07", irene: "irene-joliot-curie-1897-09-12",
      otto: "otto-frank-1889-05-12", anne: "anne-frank-1929-06-12", eliz: "kralice-ii-elizabeth-1926-04-21", marg: "prenses-margaret-snowdon-kontesi-1930-08-21",
      obama: "barack-obama-1961-08-04",
    };
    // Bütünlük özeti: doğum kanıtı + UTC + revizyon + hesap sonucu + kaynaklar (yalnız hukuk/engel/yayın alanları HARİÇ).
    const digest = async () => (await q(`select
        (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c,
        (select count(*) from public.hd_education_sources)::int src,
        (select md5(string_agg(concat_ws('|', natural_key, birth_date, documented_local_time, document_quote, coalesce(calendar_note,''), coalesce(time_standard,''),
           coalesce(utc_offset_seconds::text,''), coalesce(birth_utc::text,''), utc_status, revision, is_living), ',' order by natural_key)) from public.hd_education_subjects) ev,
        (select md5(string_agg(concat_ws('|', subject_id, version, subject_revision, calc_status, md5(computed_result::text), provider_raw_sha256), ',' order by subject_id, version)) from public.hd_education_charts) ch,
        (select md5(string_agg(concat_ws('|', subject_id, subject_revision, role, url), ',' order by subject_id, role, url)) from public.hd_education_sources) sr`)).rows[0] as Record<string, unknown>;
    const d0 = await digest();
    ok(d0.s === 50 && d0.c === 50, "başlangıç: 50 kişi + 50 snapshot", d0);
    const pub0 = Number((await q(`select count(*)::int n from public.hd_education_publications where status <> 'draft'`)).rows[0].n);
    ok(pub0 === 0, "başlangıç: tüm kayıtlar taslak");

    const startApp = async (catalog: boolean) => {
      const appEnv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
      delete appEnv.HD_EDUCATION_CATALOG_ENABLED; delete appEnv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete appEnv.HD_PRIVATE_EDUCATION_ENABLED; delete appEnv.ROXY_API_KEY;
      if (catalog) appEnv.HD_EDUCATION_CATALOG_ENABLED = "true";
      app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv as NodeJS.ProcessEnv, stdio: "ignore" });
      await waitHttp(`${APP}/`, 180_000);
    };
    browser = await chromium.launch();
    const ctxFor = async (u: U, vp: { w: number; h: number; m: boolean }) => {
      const ctx = await browser!.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(u.role === "admin" ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
      const profile = { id: u.id, tenant_id: tenant, full_name: u.name, email: "zz@example.test", role: u.role, active: true, approval_status: "approved",
        package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: u.role === "expert" ? { human_design: true, clients: true } : {} };
      await ctx.addInitScript(([pu, tok]) => { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        if (/\/compute|roxyapi|\/api\/hd\/charts\/roxy/.test(url.pathname)) providerReq++;
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      page.on("response", (r) => { if (r.status() >= 400 && /\/api\//.test(r.url())) badResponses.push(`${r.status()} ${new URL(r.url()).pathname}`); });
      return { ctx, page };
    };
    // Sunucu uçlarına doğrudan istek (sayfa dışı): owner/admin → x-admin-id, uzman → x-user-id; oturum token'ı başlıkta + çerezde.
    const api = async (u: U, p: string, body?: unknown, as: "admin" | "user" = u.role === "admin" ? "admin" : "user") => {
      const h: Record<string, string> = { "x-session-token": u.token, cookie: `yasam_admin_session=${u.token}` };
      h[as === "admin" ? "x-admin-id" : "x-user-id"] = u.id;
      if (body !== undefined) h["Content-Type"] = "application/json";
      const r = await fetch(`${APP}${p}`, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text();
      let json: Record<string, unknown> | null = null; try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* */ }
      return { status: r.status, cc: r.headers.get("cache-control"), text, json };
    };
    const noH = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const grants = async (uid: string) => Number((await q(`select count(*)::int n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [uid])).rows[0].n);
    const auditN = async (action: string, uid: string) => Number((await q(`select count(*)::int n from public.hd_education_audit_events where action=$1 and target_user_id=$2`, [action, uid])).rows[0].n);
    const subj = async (key: string) => (await q(`select blockers, legal_status, legal_note, revision, to_char(birth_utc at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') bu, birth_date::text bd from public.hd_education_subjects where natural_key=$1`, [key])).rows[0] as { blockers: string[]; legal_status: string; legal_note: string | null; revision: number; bu: string; bd: string };
    // Görüntüleyici alanı: iç kaydırma / kırpılma ölçümü.
    const vpState = (page: Page, root = "") => page.locator(`${root} [data-edu-bg-viewport]`.trim()).first().evaluate((el) => {
      const g = el.querySelector("[data-edu-bg-graph]")!.getBoundingClientRect(); const v = el.getBoundingClientRect();
      return { sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth, oy: getComputedStyle(el).overflowY,
        gt: Math.round(g.top - v.top), gb: Math.round(v.bottom - g.bottom), gl: Math.round(g.left - v.left), gr: Math.round(v.right - g.right), gh: Math.round(g.height) };
    });
    const fits = (s: Awaited<ReturnType<typeof vpState>>) => s.sh <= s.ch + 1 && s.sw <= s.cw + 1 && s.gt >= -1 && s.gb >= -1 && s.gl >= -1 && s.gr >= -1 && s.gh > 200;

    // ═════════════════════════ A) BAYRAKLAR KAPALI (production eşdeğeri) ═════════════════════════
    await startApp(false);

    section("A2. Yetki anahtarı — bayraklar kapalı");
    for (const vp of VPS) {
      const { ctx, page } = await ctxFor(owner, vp);
      await page.goto(`${APP}/admin/users/${e1.id}#uye-erisim`, { waitUntil: "load" });
      const sw = page.locator("[data-hd-edu-access-switch]");
      await sw.waitFor({ timeout: 60_000 }).catch(async (e) => {
        await snap(page, "DEBUG-admin-users", true);
        console.error("DEBUG bad:", JSON.stringify(badResponses.slice(-30)), "pageErrors:", JSON.stringify(pageErrors.slice(-5)));
        throw e;
      });
      const box = page.locator("[data-hd-edu-access]");
      await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const bt = await box.innerText();
      ok(/HUMAN DESIGN EĞİTİM HARİTALARI/.test(bt) && await page.locator("[data-hd-edu-access-gate='closed']").count() === 1 && /Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı/.test(bt),
        `${vp.n}: bayrak kapalıyken anahtar GÖRÜNÜR + "Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı"`, bt.slice(0, 300));
      ok(await noH(page), `${vp.n}: Modül İzinleri yatay taşma yok`);
      if (vp.n === "masaustu") {
        ok((await sw.getAttribute("aria-checked")) === "false", "başlangıç: yetki KAPALI");
        await snap(page, "A2-anahtar-kapali-bayrak-kapali-masaustu", false);
        await sw.click();
        await page.waitForSelector("[data-hd-edu-access-switch][aria-checked='true']", { timeout: 20_000 });
        const msg = await page.locator("[data-hd-edu-access-msg]").innerText();
        ok(/Yetki kaydedildi\. Uzman erişimi henüz kapalı/.test(msg), "ver → 'Yetki kaydedildi. Uzman erişimi henüz kapalı…' mesajı", msg);
        ok(await grants(e1.id) === 1 && await auditN("access_granted", e1.id) === 1, "ver → DB'de tek etkin yetki + denetim kaydı (access_granted)");
        ok(await grants(e2.id) === 0, "yalnız seçilen uzman etkilendi (diğer uzman yetkisiz)");
        await snap(page, "A2-anahtar-acik-bayrak-kapali-masaustu", false);
        await sw.click();
        await page.waitForSelector("[data-hd-edu-access-switch][aria-checked='false']", { timeout: 20_000 });
        ok(await grants(e1.id) === 0 && await auditN("access_revoked", e1.id) === 1, "kaldır → etkin yetki yok + denetim kaydı (access_revoked)");
        await sw.click();
        await page.waitForSelector("[data-hd-edu-access-switch][aria-checked='true']", { timeout: 20_000 });
        ok(await grants(e1.id) === 1 && await auditN("access_granted", e1.id) === 2, "yeniden ver → yeni etkin yetki + ikinci denetim kaydı");
      } else {
        await snap(page, "A2-anahtar-bayrak-kapali-mobil", false);
      }
      await ctx.close();
    }
    {
      const { ctx, page } = await ctxFor(owner, VPS[0]);
      await page.goto(`${LIST}?sekme=erisim`, { waitUntil: "load" });
      await page.locator("[data-edu-access-gate='closed']").waitFor({ timeout: 30_000 });
      const t = await page.locator("main").innerText();
      ok(/Uzman erişimi kapalı — yayın hazırlığı tamamlanmadı/.test(t) && /ZZ Uzman Bir[\s\S]*ERİŞİM AÇIK/.test(t) && /Erişim verildi/.test(t) && /Erişim kaldırıldı/.test(t),
        "owner 'Eğitmen Erişim Yetkileri': kapı durumu + yetkili uzman + değişiklik geçmişi");
      await snap(page, "A2-owner-erisim-sekmesi-bayrak-kapali", false);
      await ctx.close();
    }
    section("A2. Normal admin / uzman yetkileri yönetemez veya göremez");
    {
      const { ctx, page } = await ctxFor(admin, VPS[0]);
      await page.goto(`${APP}/admin/users/${e1.id}#uye-erisim`, { waitUntil: "load" });
      await page.waitForTimeout(5000);
      ok(await page.locator("[data-hd-edu-access]").count() === 0, "normal admin Modül İzinleri'nde eğitim anahtarını GÖRMEZ");
      await ctx.close();
    }
    const ta = `/api/admin/hd/education/training-access`;
    for (const [l, r] of [
      ["normal admin GET", await api(admin, `${ta}?userId=${e1.id}`)], ["normal admin POST", await api(admin, ta, { userId: e2.id, enabled: true })],
      ["uzman GET (admin başlığıyla)", await api(e1, `${ta}?userId=${e2.id}`, undefined, "admin")], ["uzman POST (admin başlığıyla)", await api(e1, ta, { userId: e2.id, enabled: true }, "admin")],
      ["uzman erişim listesi", await api(e1, `/api/admin/hd/education/access?q=`, undefined, "admin")], ["oturumsuz", { status: (await fetch(`${APP}${ta}?userId=${e1.id}`)).status, cc: null, text: "", json: null }],
    ] as const) ok(r.status === 404, `${l} → 404`, r.status);
    ok(await grants(e2.id) === 0, "yetkisiz denemeler DB'ye yetki yazmadı");
    section("A2. Bayrak kapalıyken YETKİLİ uzman bile içerik göremez");
    for (const p of ["/api/hd/education/access", "/api/hd/education/charts", `/api/hd/education/charts/${idOf.get(K.marie)}`, `/api/hd/education/charts/${idOf.get(K.marie)}/biography?lang=tr`]) {
      const r = await api(e1, p);
      ok(r.status === 404 && r.cc === "no-store" && !/Curie|Einstein/.test(r.text), `yetkili uzman ${p} → 404 no-store, içerik yok`, r.status);
    }
    {
      const { ctx, page } = await ctxFor(e1, VPS[0]);
      const st = (await page.goto(CAT, { waitUntil: "load" }))?.status();
      await page.getByText(/Sayfa bulunamadı|404|bulunamadı|could not be found/i).first().waitFor({ timeout: 20_000 });
      // Not: layout notFound() akışlı yanıtta HTTP 200 ile 404 içeriğini çizer (b3-ui-e2e ile aynı kabul: içerik denetlenir).
      void st;
      ok(!/Curie|Einstein|Hazır Eğitim Haritaları/.test(await page.locator("body").innerText()), "yetkili uzman katalog URL'si → 404 sayfası (bayrak kapalı; özellik adı/içerik yok)");
      await page.goto(`${APP}/human-design`, { waitUntil: "load" });
      await page.waitForTimeout(4000);
      ok(await page.locator("[data-hd-hub] a[href*='egitim']").count() === 0, "yetkili uzman HD girişinde eğitim kartı YOK (bayrak kapalı)");
      await snap(page, "A2-yetkili-uzman-bayrak-kapali-hd-giris", false);
      await ctx.close();
    }

    section("A7/A9/A3. Owner listesi + kişi ekranı");
    for (const vp of VPS) {
      const { ctx, page } = await ctxFor(owner, vp);
      await page.goto(LIST, { waitUntil: "load" });
      await page.locator("tbody tr[data-edu-row]").first().waitFor({ timeout: 30_000 });
      const pos = await page.evaluate(() => {
        const fam = document.querySelector("[data-edu-families]")!.getBoundingClientRect();
        const table = document.querySelector("tbody tr[data-edu-row]")!.closest("section")!.getBoundingClientRect();
        const stats = document.querySelector("[data-edu-stat='legalE']")!.getBoundingClientRect();
        const after = document.querySelector("[data-edu-families]")!.nextElementSibling;
        return { famTop: fam.top, tableBottom: table.bottom, statsTop: stats.top, after: after ? after.tagName : null };
      });
      ok(pos.famTop > pos.tableBottom && pos.statsTop < pos.tableBottom && pos.after === null, `${vp.n}: sıralama istatistik → kişi listesi → Aile Haritaları (EN ALTTA)`, pos);
      const fams = await page.locator("[data-edu-family]").evaluateAll((els) => els.map((e) => e.getAttribute("data-edu-family")));
      ok(JSON.stringify(fams) === JSON.stringify(["curie", "frank", "kraliyet-kardesler"]), `${vp.n}: aile kartları Curie + Frank + Kraliyet kız kardeşler`, fams);
      const kt = await page.locator("[data-edu-family='kraliyet-kardesler']").innerText();
      ok(/Kraliçe II\. Elizabeth[\s\S]*Abla/.test(kt) && /Prenses Margaret[\s\S]*Kız kardeş/.test(kt) && /abla – kız kardeş/.test(kt), `${vp.n}: kraliyet kartı roller + bağ`);
      ok((await page.locator("tbody tr").count()) === 50 && await noH(page), `${vp.n}: 50 kişi listede, yatay taşma yok`);
      await page.locator("[data-edu-families]").scrollIntoViewIfNeeded();
      await snap(page, `A7-owner-liste-aile-en-altta-${vp.n}`, vp.n === "masaustu");
      // Kişi ekranı: Einstein — teknik doğrulama düğmesi + yayın onayı pasif + iç kaydırma yok.
      await page.goto(`${LIST}/kisi/${idOf.get(K.einstein)}`, { waitUntil: "load" });
      await page.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 30_000 });
      await page.waitForTimeout(600);
      const s1 = await vpState(page);
      ok(fits(s1) && s1.oy === "hidden", `${vp.n}: owner BodyGraph %100 — iç kaydırma YOK, harita kırpılmıyor`, s1);
      await page.locator("[data-edu-bg-in]").first().click(); await page.locator("[data-edu-bg-in]").first().click();
      await page.waitForTimeout(400);
      const s2 = await vpState(page);
      ok(s2.sh > s2.ch + 20 && s2.oy === "auto", `${vp.n}: yakınlaştırınca alan kaydırılabilir (%150)`, s2);
      await page.locator("[data-edu-bg-reset]").first().click(); await page.waitForTimeout(400);
      ok(fits(await vpState(page)), `${vp.n}: 'Görünümü sıfırla' → yine iç kaydırma yok`);
      if (vp.n === "masaustu") {
        await page.evaluate(() => window.scrollTo(0, 0));
        const vb = await page.locator("[data-edu-bg-viewport]").first().boundingBox();
        await page.mouse.move(vb!.x + vb!.width / 2, vb!.y + Math.min(200, vb!.height / 2));
        await page.mouse.wheel(0, 500); await page.waitForTimeout(500);
        ok(await page.evaluate(() => window.scrollY) > 100, "masaüstü: harita üzerinde tekerlek SAYFAYI kaydırır (iç kaydırma tuzağı yok)");
      }
      await page.locator("[data-edu-bg-full]").first().click();
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ timeout: 10_000 }); await page.waitForTimeout(500);
      ok(fits(await vpState(page, "[data-edu-bg-fullscreen]")), `${vp.n}: tam ekran %100 — iç kaydırma yok, kırpılma yok`);
      await snap(page, `A6-owner-tam-ekran-${vp.n}`, false);
      await page.keyboard.press("Escape");
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ state: "detached", timeout: 10_000 });
      ok(await page.locator("[data-edu-bg-col]").count() === 2, `${vp.n}: gezegen listeleri (Design + Personality) korunur`);
      const appr = page.getByRole("button", { name: "Yayın onayı ver…" });
      const miss = await page.locator("[data-edu-approve-missing]").innerText();
      ok(await appr.isDisabled() && /Hukuk incelemesi kayıtlı/.test(miss) && /Aktif yayın engeli yok/.test(miss) && !/UTC doğrulanmış/.test(miss),
        `${vp.n}: Einstein — 'Yayın onayı ver' PASİF + eksikler yazılı (hukuk + engel)`, miss);
      ok(await page.locator("[data-edu-verify-blocker='UTC-TEYİT']").count() === 1, `${vp.n}: UTC-TEYİT için 'Kanıtı doğrula…' düğmesi`);
      await page.locator("[data-edu-approve-missing]").scrollIntoViewIfNeeded();
      await snap(page, `A9-yayin-onayi-pasif-eksikler-${vp.n}`, false);
      ok(await noH(page), `${vp.n}: kişi sayfası yatay taşma yok`);
      await ctx.close();
    }

    section("A3. Teknik engel doğrulaması (yalnız izole kopyada)");
    {
      const { ctx, page } = await ctxFor(owner, VPS[0]);
      // Yaşayan kişi: doğrulama düğmesi yok + API reddeder.
      await page.goto(`${LIST}/kisi/${idOf.get(K.obama)}`, { waitUntil: "load" });
      await page.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-edu-verify-blocker]").count() === 0, "Obama (yaşayan): 'Kanıtı doğrula' düğmesi YOK");
      const rl = await api(owner, `/api/admin/hd/education/subjects/${idOf.get(K.obama)}`, { action: "verify_blocker", blocker: "YAŞAYAN KİŞİ", confirm: "04.08.1961", evidence: "deneme kanıt metni" });
      ok(rl.status === 400, "API: YAŞAYAN KİŞİ doğrulama ile kalkmaz (400)", rl.status);
      const rh = await api(owner, `/api/admin/hd/education/subjects/${idOf.get(K.einstein)}`, { action: "verify_blocker", blocker: "HUKUK-E", confirm: "1879-03-14T10:50", evidence: "deneme kanıt metni" });
      ok(rh.status === 400, "API: hukuk engeli (HUKUK-E) bu yoldan kalkmaz (400)", rh.status);
      const ra = await api(admin, `/api/admin/hd/education/subjects/${idOf.get(K.hugo)}`, { action: "verify_blocker", blocker: "TAKVİM", confirm: "26.02.1802", evidence: "normal admin denemesi" });
      ok(ra.status === 404, "API: normal admin doğrulayamaz (404)", ra.status);
      // Hugo — TAKVİM: önce yanlış tarih (reddedilir), sonra belgeden teyit edilen Gregoryen tarih.
      const h0 = await subj(K.hugo);
      await page.goto(`${LIST}/kisi/${idOf.get(K.hugo)}`, { waitUntil: "load" });
      await page.locator("[data-edu-verify-blocker='TAKVİM']").waitFor({ timeout: 30_000 });
      await page.locator("[data-edu-verify-blocker='TAKVİM']").click();
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();
      ok(/Ventôse/.test(await dlg.locator("[data-edu-verify-evidence]").innerText()), "TAKVİM modalı kayıtlı takvim notunu (7 Ventôse an X) gösterir");
      await dlg.locator("[data-edu-verify-confirm]").fill("27.02.1802");
      await dlg.locator("[data-edu-verify-reference]").fill("Yanlış tarih denemesi — reddedilmeli");
      await snap(page, "A3-takvim-dogrulama-modali", false);
      await dlg.getByRole("button", { name: "Kaydet" }).click();
      await page.getByText("Yazılan Gregoryen tarih kayıtlı doğum tarihiyle aynı değil.").waitFor({ timeout: 15_000 });
      ok((await subj(K.hugo)).blockers.includes("TAKVİM"), "yanlış Gregoryen tarih → reddedildi, TAKVİM engeli DURUYOR");
      await page.locator("[data-edu-verify-blocker='TAKVİM']").click();
      await dlg.waitFor();
      await dlg.locator("[data-edu-verify-confirm]").fill("26.02.1802");
      await dlg.locator("[data-edu-verify-reference]").fill("TEST-YEREL-KOPYA: 7 Ventôse an X = 26.02.1802 (Cumhuriyet takvimi dönüşümü)");
      await dlg.getByRole("button", { name: "Kaydet" }).click();
      await page.getByText("Kanıt doğrulandı; teknik engel kaldırıldı.").waitFor({ timeout: 15_000 });
      const h1 = await subj(K.hugo);
      ok(!h1.blockers.includes("TAKVİM") && h1.blockers.includes("LİSANS") && h1.blockers.includes("AVUKAT-GÖRMEDİ"), "doğru teyit → YALNIZ TAKVİM kalktı; LİSANS + AVUKAT-GÖRMEDİ duruyor", h1.blockers);
      ok(h1.legal_status === h0.legal_status && h1.revision === h0.revision && h1.bu === h0.bu && h1.bd === h0.bd, "hukuki durum, revizyon, UTC ve doğum tarihi DEĞİŞMEDİ", { h0, h1 });
      ok(/owner teknik doğrulama: TAKVİM — Gregoryen 26\.02\.1802/.test(h1.legal_note ?? ""), "hukuk notuna owner doğrulama kaydı yazıldı");
      const hist = await page.locator("section[aria-label$='ayrıntıları']").innerText();
      ok(/Hukuk kaydı güncellendi/.test(hist), "onay geçmişinde 'Hukuk kaydı güncellendi' (DB denetim kaydı)");
      await snap(page, "A3-takvim-dogrulandi", false);
      // Einstein — UTC-TEYİT: yanlış UTC reddedilir; doğru UTC → yalnız UTC-TEYİT kalkar, HUKUK-E kalır.
      const e0 = await subj(K.einstein);
      const bad = await api(owner, `/api/admin/hd/education/subjects/${idOf.get(K.einstein)}`, { action: "verify_blocker", blocker: "UTC-TEYİT", confirm: "1879-03-14T10:51", evidence: "yanlış dakika denemesi" });
      ok(bad.status === 400 && (await subj(K.einstein)).blockers.includes("UTC-TEYİT"), "yanlış UTC dakikası → 400, engel duruyor", bad.status);
      await page.goto(`${LIST}/kisi/${idOf.get(K.einstein)}`, { waitUntil: "load" });
      await page.locator("[data-edu-verify-blocker='UTC-TEYİT']").click();
      await dlg.waitFor();
      ok(/STANDART BELİRSİZ/.test(await dlg.locator("[data-edu-verify-evidence]").innerText()), "UTC modalı kayıtlı saat standardı belirsizliğini gösterir");
      await dlg.locator("[data-edu-verify-confirm]").fill(e0.bu.slice(0, 16));
      await dlg.locator("[data-edu-verify-reference]").fill("TEST-YEREL-KOPYA: beş aday saat standardında harita değişmiyor (SE+JPL duyarlılık)");
      await snap(page, "A3-utc-dogrulama-modali", false);
      await dlg.getByRole("button", { name: "Kaydet" }).click();
      await page.getByText("Kanıt doğrulandı; teknik engel kaldırıldı.").waitFor({ timeout: 15_000 }).catch(async (e) => {
        await snap(page, "DEBUG-utc-dogrulama", true);
        console.error("DEBUG utc:", JSON.stringify({ bu: e0.bu, msg: await page.locator("[role=status]").allInnerTexts() }));
        throw e;
      });
      const e1s = await subj(K.einstein);
      ok(JSON.stringify(e1s.blockers) === JSON.stringify(["HUKUK-E"]) && e1s.legal_status === "E" && e1s.revision === e0.revision && e1s.bu === e0.bu, "doğru UTC → yalnız UTC-TEYİT kalktı; HUKUK-E + hukuki durum E + revizyon + UTC aynı", e1s);
      ok(await page.getByRole("button", { name: "Yayın onayı ver…" }).isDisabled(), "Einstein: hukuk incelemesi yok → 'Yayın onayı ver' hâlâ PASİF");
      await ctx.close();
    }
    const dA = await digest();
    ok(JSON.stringify(dA) === JSON.stringify(d0), "A sonunda: doğum kanıtı, UTC, kaynaklar ve 50 hesap sonucu özetleri DEĞİŞMEDİ", { d0, dA });
    await stopApp();

    // ═════════════ B) YALNIZ İZOLE KOPYADA katalog açık + hukuk sonrası akış (owner uçlarıyla) ═════════════
    section("B0. Hukuk sonrası akış — owner uçlarıyla (yalnız izole kopya)");
    await startApp(true);
    const publishFlow = async (key: string) => {
      const id = idOf.get(key)!;
      const steps: string[] = [];
      const get = async () => (await api(owner, `/api/admin/hd/education/subjects/${id}`)).json?.data as { blockers: string[]; legalStatus: string; charts: Array<{ id: string; current: boolean; calcStatus: string }>; birthDate: string; birthUtc: string; checklist: Record<string, boolean>; publication: { status: string } };
      const post = async (b: Record<string, unknown>) => { const r = await api(owner, `/api/admin/hd/education/subjects/${id}`, b); steps.push(`${String(b.action)}${b.blocker ? `:${String(b.blocker)}` : ""}=${r.status}`); return r.status; };
      let d = await get();
      if (d.legalStatus !== "LOW_REVIEWED") await post({ action: "legal_review", reference: "TEST-YEREL-KOPYA hukuk simülasyonu" });
      d = await get();
      for (const b of d.blockers) {
        if (["KRALİYET", "TANINIRLIK", "LİSANS", "KAYNAK"].includes(b)) await post({ action: "clear_blocker", blocker: b, reason: "TEST-YEREL-KOPYA simülasyonu" });
        else if (b === "TAKVİM") await post({ action: "verify_blocker", blocker: b, confirm: d.birthDate.split("-").reverse().join("."), evidence: "TEST-YEREL-KOPYA takvim teyidi" });
        else if (b === "UTC-TEYİT") await post({ action: "verify_blocker", blocker: b, confirm: d.birthUtc.replace(" ", "T").slice(0, 16), evidence: "TEST-YEREL-KOPYA UTC teyidi" });
      }
      d = await get();
      const cur = d.charts.find((c) => c.current && c.calcStatus === "OK");
      if (cur && !d.checklist.snapshotVerified) await post({ action: "verify_chart", chartId: cur.id });
      await post({ action: "approve", legalClearanceRef: "TEST-YEREL-KOPYA", note: "izole test" });
      await post({ action: "publish" });
      d = await get();
      return { status: d.publication.status, steps };
    };
    // Curie ailesi tam; Frank ve kraliyet ailelerinden YALNIZ biri (eksik üyeli aile sızmamalı); Einstein (UTC-TEYİT A'da doğrulandı).
    const PUBLISH = [K.einstein, K.marie, K.irene, K.otto, K.eliz];
    for (const k of PUBLISH) {
      const r = await publishFlow(k);
      ok(r.status === "published" && r.steps.every((s) => s.endsWith("=200")), `${k}: hukuk sonrası akış yalnız mevcut owner işlemleriyle yayına çıktı`, r);
    }
    const living = await api(owner, `/api/admin/hd/education/subjects/${idOf.get(K.obama)}`, { action: "approve", legalClearanceRef: "TEST-YEREL-KOPYA" });
    ok(living.status === 409, "yaşayan kişi (Obama) onaylanamaz — DB kilidi korunur (409)", living.status);

    section("B4/B5. Uzman ekranları — katalog açık, yetkili uzman");
    const catR = await api(e1, "/api/hd/education/charts");
    const items = (catR.json?.items ?? []) as Array<{ id: string; displayName: string }>;
    const famsR = (catR.json?.families ?? []) as Array<{ key: string; members: Array<{ id: string }> }>;
    ok(catR.status === 200 && items.length === PUBLISH.length && items.every((i) => PUBLISH.includes(keyOf.get(i.id) ?? "")), `katalog yalnız ${PUBLISH.length} yayımlı kişi`, items.map((i) => i.displayName));
    ok(JSON.stringify(famsR.map((f) => f.key)) === JSON.stringify(["curie"]), "aile yanıtı YALNIZ tüm üyeleri yayımlı aile (Curie); Frank + kraliyet (eksik üyeli) YOK", famsR.map((f) => f.key));
    ok(!/Anne Frank|Margaret|anne-frank|prenses-margaret|frank"|kraliyet-kardesler/.test(catR.text) && !OWNER_FIELDS.test(catR.text), "katalog yanıtında eksik üye / eksik aile / owner yönetim alanı YOK");
    const detR = await api(e1, `/api/hd/education/charts/${idOf.get(K.marie)}`);
    ok(detR.status === 200 && !OWNER_FIELDS.test(detR.text), "ayrıntı yanıtında hukuk / engel / onay / kontrol listesi / geçmiş alanı YOK", detR.text.match(OWNER_FIELDS)?.[0]);
    for (const k of [K.anne, K.hugo, K.obama, K.marg]) {
      const r = await api(e1, `/api/hd/education/charts/${idOf.get(k)}`);
      ok(r.status === 404 && r.cc === "no-store", `taslak / hukuk engelli ${k} → 404 no-store`, r.status);
    }
    for (const vp of VPS) {
      const { ctx, page } = await ctxFor(e1, vp);
      await page.goto(`${APP}/human-design`, { waitUntil: "load" });
      await page.locator("[data-hd-hub] a[href='/human-design/egitim-haritalari']").waitFor({ timeout: 30_000 });
      ok(true, `${vp.n}: yetkili uzman HD girişinde 'Hazır Eğitim Haritaları' kartı`);
      await page.goto(CAT, { waitUntil: "load" });
      await page.locator("a[href^='/human-design/egitim-haritalari/']").first().waitFor({ timeout: 30_000 });
      const pos = await page.evaluate(() => {
        const fam = document.querySelector("[data-edu-families]");
        const list = document.querySelector("section[aria-label='Eğitim haritaları']");
        return { fam: !!fam, last: fam ? fam === fam.parentElement!.lastElementChild : false, below: fam && list ? fam.getBoundingClientRect().top > list.getBoundingClientRect().bottom : false };
      });
      ok(pos.fam && pos.last && pos.below, `${vp.n}: uzman katalogunda Aile Haritaları ana içeriğin EN SONUNDA`, pos);
      const ft = await page.locator("[data-edu-families]").innerText();
      ok(/Curie Ailesi/.test(ft) && !/Frank|Margaret|Kraliyet/.test(ft), `${vp.n}: uzman yalnız Curie ailesini görür (eksik üyeli aileler yok)`);
      ok(await noH(page), `${vp.n}: katalog yatay taşma yok`);
      await snap(page, `B5-uzman-katalog-aile-en-sonda-${vp.n}`, true);
      // Aile kartı: tek tek seç / tamamını seç / tamamını incele.
      const card = page.locator("[data-edu-family='curie']");
      await card.locator("[data-edu-family-pick]").nth(1).check();
      ok(/Seçili kişiyi incele/.test(await card.locator("[data-edu-family-selected]").innerText()), `${vp.n}: tek kişi seçimi → 'Seçili kişiyi incele'`);
      await card.locator("[data-edu-family-pick]").nth(1).uncheck();
      await card.locator("[data-edu-family-all]").click();
      ok(await card.locator("input[type=checkbox]:checked").count() === 2 && /Seçilenleri İncele \(2\)/.test(await card.locator("[data-edu-family-selected]").innerText()), `${vp.n}: 'Ailenin Tamamını Seç' → 2/2`);
      await card.locator("[data-edu-family-review]").click();
      await page.waitForURL(/\/egitim-haritalari\/aile\/curie$/, { timeout: 20_000 });
      await page.locator("[data-edu-family-member] [data-edu-bg-graph]").nth(1).waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-edu-family-grid='2'] [data-edu-bg-viewer]").count() === 2, `${vp.n}: 'Ailenin Tamamını İncele' → 2 BodyGraph aynı sayfada`);
      ok(/Marie Curie[\s\S]*⟷[\s\S]*Irène Joliot-Curie[\s\S]*anne – kız/.test(await page.locator("[data-edu-family-link]").first().innerText()), `${vp.n}: aile ilişkisi gösterilir`);
      const boxes = await page.locator("[data-edu-family-member]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left) }; }));
      ok(vp.n === "masaustu" ? boxes[0].top === boxes[1].top : boxes[1].top > boxes[0].top, `${vp.n}: ${vp.n === "masaustu" ? "yan yana" : "alt alta"}`, boxes);
      await page.waitForTimeout(500);
      for (let i = 0; i < 2; i++) ok(fits(await vpState(page, `[data-edu-family-member]:nth-of-type(${i + 1})`)), `${vp.n}: aile haritası ${i + 1} iç kaydırma yok`);
      ok(await noH(page), `${vp.n}: aile sayfası yatay taşma yok`);
      await snap(page, `B5-uzman-aile-tamami-${vp.n}`, true);
      await page.locator("[data-edu-family-member] [data-edu-bg-full]").nth(1).click();
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ timeout: 10_000 }); await page.waitForTimeout(400);
      ok(/Irène Joliot-Curie/.test(await page.locator("[data-edu-bg-fullscreen]").innerText()) && fits(await vpState(page, "[data-edu-bg-fullscreen]")), `${vp.n}: aile içindeki tek harita ayrıca büyütülür (tam ekran)`);
      await snap(page, `B5-uzman-aile-tek-harita-tam-ekran-${vp.n}`, false);
      await page.keyboard.press("Escape");
      // Eksik üyeli aile / bilinmeyen aile → tek tip bulunamadı.
      for (const fk of ["frank", "kraliyet-kardesler", "yok-boyle"]) {
        await page.goto(`${CAT}/aile/${fk}`, { waitUntil: "load" });
        await page.getByText(/Sayfa bulunamadı/).first().waitFor({ timeout: 20_000 });
        ok(!/Anne Frank|Otto Frank|Margaret|Elizabeth/.test(await page.locator("body").innerText()), `${vp.n}: /aile/${fk} → 'Sayfa bulunamadı', üye adı sızmaz`);
      }
      // Büyük BodyGraph (uzman ayrıntısı).
      await page.goto(`${CAT}/${idOf.get(K.marie)}`, { waitUntil: "load" });
      await page.locator("section[aria-label='BodyGraph ve harita bilgileri'] [data-edu-bg-graph]").waitFor({ timeout: 30_000 });
      await page.waitForTimeout(500);
      const s0 = await vpState(page);
      ok(fits(s0) && s0.gh >= (vp.n === "masaustu" ? 500 : 300), `${vp.n}: uzman BodyGraph büyük (${s0.gh}px) + iç kaydırma yok`, s0);
      ok(await page.locator("[data-edu-bg-col]").count() === 2, `${vp.n}: gezegen listeleri (Design + Personality)`);
      const pct = () => page.locator("[data-edu-bg-pct]").first().innerText();
      await page.locator("[data-edu-bg-in]").first().click();
      ok(await pct() === "%125", `${vp.n}: yakınlaştır → %125`);
      await page.locator("[data-edu-bg-out]").first().click();
      ok(await pct() === "%100", `${vp.n}: uzaklaştır → %100`);
      await page.locator("[data-edu-bg-in]").first().click(); await page.locator("[data-edu-bg-in]").first().click();
      await page.locator("[data-edu-bg-reset]").first().click();
      await page.waitForTimeout(400); // owner bölümündeki ölçümle aynı: yeniden ölçüm (ResizeObserver) sonrası
      const sr = await vpState(page);
      ok(await pct() === "%100" && fits(sr), `${vp.n}: görünümü sıfırla → %100, iç kaydırma yok`, sr);
      const dt = await page.locator("body").innerText();
      ok(/MERKEZLER/i.test(dt) && /TANIMLI KANALLAR/i.test(dt) && /AKTİF KAPILAR/i.test(dt) && !/Hukuk|Yayın kontrol listesi|Onay geçmişi|Avukat|TEST-YEREL/.test(dt) && !/Roxy/i.test(dt),
        `${vp.n}: uzman ayrıntısı harita bilgileri var; hukuk / yayın / onay geçmişi / sağlayıcı adı YOK`);
      await snap(page, `B4-uzman-buyuk-bodygraph-${vp.n}`, vp.n === "masaustu");
      await page.locator("[data-edu-bg-full]").first().click();
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ timeout: 10_000 }); await page.waitForTimeout(400);
      ok(fits(await vpState(page, "[data-edu-bg-fullscreen]")), `${vp.n}: uzman tam ekran — iç kaydırma yok`);
      await snap(page, `B4-uzman-tam-ekran-${vp.n}`, false);
      await page.keyboard.press("Escape");
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ state: "detached", timeout: 10_000 });
      ok(await noH(page), `${vp.n}: uzman ayrıntısı yatay taşma yok`);
      // Taslak kişi doğrudan URL.
      await page.goto(`${CAT}/${idOf.get(K.anne)}`, { waitUntil: "load" });
      await page.getByText(/Sayfa bulunamadı/).first().waitFor({ timeout: 20_000 });
      ok(!/Anne Frank/.test(await page.locator("body").innerText()), `${vp.n}: taslak kişi (Anne Frank) doğrudan URL → bulunamadı`);
      await ctx.close();
    }
    section("B4. BodyGraph regresyonu — uzman ekranı = kayıtlı snapshot");
    {
      const { ctx, page } = await ctxFor(e1, VPS[0]);
      let same = 0; const diff: unknown[] = [];
      for (const k of PUBLISH) {
        await page.goto(`${CAT}/${idOf.get(k)}`, { waitUntil: "load" });
        await page.locator("[data-hd-gate]").first().waitFor({ timeout: 30_000 });
        const shown = (await page.locator("[data-hd-gate]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-hd-gate"))))).sort((a, b) => a - b);
        if (JSON.stringify(shown) === JSON.stringify(gatesOf.get(k))) same++; else diff.push({ k, shown, exp: gatesOf.get(k) });
      }
      ok(same === PUBLISH.length, `uzman ekranındaki kapılar = kayıtlı snapshot (${same}/${PUBLISH.length})`, diff);
      await ctx.close();
    }
    section("B. Yetkisiz roller — katalog açıkken");
    for (const [l, u, as] of [["yetkisiz uzman", e2, "user"], ["normal admin", admin, "user"], ["owner (eğitmen ucu)", owner, "user"]] as const) {
      for (const p of ["/api/hd/education/access", "/api/hd/education/charts", `/api/hd/education/charts/${idOf.get(K.marie)}`]) {
        const r = await api(u, p, undefined, as);
        ok(r.status === 404 && !/Curie/.test(r.text), `${l} ${p} → 404`, r.status);
      }
    }
    {
      const { ctx, page } = await ctxFor(e2, VPS[0]);
      await page.goto(`${CAT}/aile/curie`, { waitUntil: "load" });
      await page.getByText(/Sayfa bulunamadı/).first().waitFor({ timeout: 20_000 });
      ok(!/Curie/.test(await page.locator("body").innerText()), "yetkisiz uzman aile URL'si → bulunamadı");
      await ctx.close();
    }
    section("B. Yetki kaldırma — açık oturum");
    {
      const { ctx: ec, page: ep } = await ctxFor(e1, VPS[0]);
      await ep.goto(`${CAT}/${idOf.get(K.marie)}`, { waitUntil: "load" });
      await ep.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 30_000 });
      const { ctx: oc, page: op } = await ctxFor(owner, VPS[0]);
      await op.goto(`${APP}/admin/users/${e1.id}#uye-erisim`, { waitUntil: "load" });
      await op.locator("[data-hd-edu-access-switch][aria-checked='true']").waitFor({ timeout: 60_000 });
      ok(await op.locator("[data-hd-edu-access-gate='closed']").count() === 0, "katalog açıkken 'erişim kapalı' notu gösterilmez");
      await op.locator("[data-hd-edu-access-switch]").click();
      await op.waitForSelector("[data-hd-edu-access-switch][aria-checked='false']", { timeout: 20_000 });
      ok(/Eğitim haritaları erişimi kapatıldı\. Kayıtlar silinmedi\./.test(await op.locator("[data-hd-edu-access-msg]").innerText()), "kaldır → mesaj");
      await ep.reload({ waitUntil: "load" });
      await ep.getByText(/Sayfa bulunamadı/).first().waitFor({ timeout: 20_000 });
      ok(true, "yetkisi kaldırılan uzmanın açık oturumu yenilemede 'Sayfa bulunamadı'");
      ok((await api(e1, "/api/hd/education/charts")).status === 404, "yetkisi kaldırılan uzman API → 404 (önbellek yok)");
      await ec.close(); await oc.close();
    }

    const dB = await digest();
    ok(JSON.stringify(dB) === JSON.stringify(d0), "SON: 50 kişi, 50 snapshot, kaynaklar, doğum kanıtı ve hesap sonucu özetleri baştan sona AYNI (yeni snapshot yok)", { d0, dB });
    ok(providerReq === 0, `tarayıcıdan hesaplama/sağlayıcı isteği 0 (${providerReq})`);
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 5));
    ok(pageErrors.length === 0, `tarayıcı JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    await stopApp();
    await env?.stop().catch(() => undefined);
  }
  console.log(`\nhd-education TAMAMLAMA e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
