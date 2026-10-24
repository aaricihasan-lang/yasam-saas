/**
 * FAZ 7 — Eğitim Merkezi / Bana Özel Eğitim Haritaları / Owner yönetimi · GERÇEK TARAYICI uçtan uca testi.
 * Playwright → `next start` (gerçek Next uygulaması) → gerçek route'lar → PostgREST shim → izole embedded-postgres (gerçek migration'lar).
 * Veri SENTETİK (ZZ_*; harita = repo fixture'ının gerçek normalizasyonu). Dış istek abort + sayılır; ücretli sağlayıcı ucu sayılır (0 beklenir).
 * Her önemli işlemin sunucuda/DB'de GERÇEKTEN gerçekleştiği ayrıca SQL ile doğrulanır (yalnız ekran görüntüsüyle başarı ilan edilmez).
 *
 * Ön koşul (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/private/ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 */
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { syntheticEducationSnapshot } from "../syntheticSnapshot";
import { privateArchiveSql, PRIVATE_RPCS } from "./pgSchema";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3986;
const APP = `http://127.0.0.1:${PORT}`;
const readMig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");
const CENTRAL = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const VP = {
  desktop: { width: 1440, height: 900, mobile: false }, tablet: { width: 820, height: 1180, mobile: true }, mobile: { width: 390, height: 844, mobile: true },
} as const;
type VpName = keyof typeof VP;
const WIDTHS = [320, 360, 390, 430, 768, 820, 1024, 1440];
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
/** Yatay taşma: belge + kutu öğeleri (.page overflow-x:clip taşmayı gizleyebilir). Kaydırılabilir tablo kapsayıcısı hariç. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement.scrollWidth - window.innerWidth;
    const els = Array.from(document.querySelectorAll("main *, [data-edu-private] *")).filter((e) => {
      const st = getComputedStyle(e);
      if (st.position === "fixed" || st.display === "none" || st.visibility === "hidden") return false;
      return !e.closest("[class*='tableWrap'], [data-hd-stage], .sr-only");
    });
    let worst = 0;
    for (const e of els) { const r = e.getBoundingClientRect(); if (r.width > 0) worst = Math.max(worst, Math.ceil(r.right - window.innerWidth)); }
    return Math.max(doc, worst);
  });
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let env: TestEnv | null = null;
  const external: string[] = [];
  const consoleErrors: string[] = [];
  const privateBodies: { url: string; body: string }[] = [];
  const badResponses = new Map<string, number>();
  let providerReq = 0;
  try {
    env = await startAnamnezTestEnv({
      port: Number(process.env.HD_EDU_PRIV_UI_PG_PORT ?? 54790 + (Date.now() % 40)), httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-priv-ui-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: [...PRIVATE_RPCS, "hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [...privateArchiveSql(), ...CENTRAL.map(readMig)],
    });
    const su = env.su;
    // Gömülü PG bağlantısı düşerse süreç işlenmemiş 'error' ile ölmesin (sonuç FAIL olarak raporlanır, sunucu kapatılır).
    su.on("error", (e) => { consoleErrors.push(`pg bağlantısı düştü: ${e.message}`); });
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    await q(`grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_reports to service_role`);
    // Yalnız TEST şeması: Admin → Üye ayrıntısı (USERS_SAFE_SELECT) kolonları izole test users tablosunda eksik → ekle (ürün şeması DEĞİŞMEZ).
    for (const [c, t] of [["approved_at", "timestamptz"], ["membership_status", "text"], ["subscription_status", "text"], ["trial_started_at", "timestamptz"],
      ["trial_ends_at", "timestamptz"], ["membership_started_at", "timestamptz"], ["membership_ends_at", "timestamptz"], ["admin_level", "text"],
      ["created_at", "timestamptz"], ["payment_status", "text"], ["last_payment_date", "timestamptz"], ["next_payment_date", "timestamptz"],
      ["paid_amount", "numeric"], ["payment_note", "text"], ["agreed_fee", "numeric"], ["billing_period", "text"], ["license_type", "text"],
      ["allowed_active_sessions", "integer"], ["allowed_locations", "integer"], ["security_mode", "text"], ["security_exempt", "boolean"],
      ["license_note", "text"], ["allowed_desktop_sessions", "integer"], ["allowed_mobile_sessions", "integer"], ["allowed_tablet_sessions", "integer"],
      ["allowed_unknown_sessions", "integer"]] as const) await q(`alter table public.users add column if not exists ${c} ${t}`);
    type U = { id: string; token: string; name: string; role: "admin" | "expert"; tenant: string };
    const mkUser = async (role: "admin" | "expert", name: string, superAdmin = false): Promise<U> => {
      const id = randomUUID(), tenant = randomUUID(), token = `zz-privui-${randomUUID()}`;
      await q(`insert into public.tenants(id, name) values ($1,$2)`, [tenant, `ZZ_T_${name}`]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.privui.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "owner" : null]);
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role, tenant };
    };
    const OWNER = await mkUser("admin", "ZZ Owner", true);
    const ADMIN = await mkUser("admin", "ZZ Normal Admin");
    const A = await mkUser("expert", "ZZ Eğitmen Ayşe");
    const B = await mkUser("expert", "ZZ Eğitmen Bora");
    const C = await mkUser("expert", "ZZ Aday Cem");
    const X = await mkUser("expert", "ZZ Yetkisiz Uzman");
    await q(`select public.hd_edu_priv_owner_approve_text($1,'hd-egitim-izin-v1','ZZ-SENTETIK-HUKUK-REF')`, [OWNER.id]);
    await q(`select public.hd_edu_priv_owner_set_open($1,true,null)`, [OWNER.id]);
    // FAZ 8: TEK yetki (merkezî tablo) — özel arşiv + merkezî katalog birlikte.
    for (const w of [A, B]) await q(`select public.hd_education_grant_access($1,$2,'ZZ')`, [OWNER.id, w.id]);
    const sha = (await q(`select body_sha256 from public.hd_edu_private_consent_texts`)).rows[0].body_sha256 as string;
    const SNAP = syntheticEducationSnapshot("2018-07-20T16:00:00Z", 37.87, 32.48, 1);
    // Mahremiyet işaretleri: kaynak kayıtta VAR, eğitim API yanıtında (izin yoksa) OLMAMALI.
    const MARK = { date: "1937-11-23", time: "04:51", place: "ZZYERMARK", lat: 41.01234, lon: 28.98765, design: "1937-08-25T01:00:00Z" };
    let n = 0;
    const mkClientChart = async (w: U, clientName: string) => {
      const client = (await q(`insert into public.human_design_clients(tenant_id, user_id, name, birth_date, birth_time, birth_place) values ($1,$2,$3,$4,$5,$6) returning id`,
        [w.tenant, w.id, clientName, MARK.date, MARK.time, MARK.place])).rows[0].id as string;
      const cr = JSON.parse(JSON.stringify(SNAP.computed_result)) as Record<string, unknown>;
      cr.input = { date: MARK.date, time: MARK.time, timezone: "Europe/Istanbul", latitude: MARK.lat, longitude: MARK.lon };
      cr.timing = { birthUtcIso: `${MARK.date}T02:51:00Z`, designUtcIso: MARK.design, daysBeforeBirth: 88 };
      cr.provider = { ...(cr.provider as object), designInstantUtc: MARK.design };
      const raw = { ...(SNAP.provider_raw as Record<string, unknown>), designInstantUtc: MARK.design };
      const chart = (await q(`insert into public.human_design_charts(tenant_id, user_id, client_id, client_name, source, birth_date, birth_time, birth_place, timezone, input, computed_result,
          type_code, profile_code, authority_code, definition_code, provider, provider_raw, input_hash) values ($1,$2,$3,$4,'computed',$5,$6,$7,'Europe/Istanbul',$8,$9,'generator','1_3','sacral','single','roxyapi',$10,$11) returning id`,
        [w.tenant, w.id, client, clientName, MARK.date, MARK.time, MARK.place, JSON.stringify(cr.input), JSON.stringify(cr), JSON.stringify(raw), String(++n).padStart(64, "0")])).rows[0].id as string;
      return { client, chart };
    };
    const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n% ZZ_SENTETIK_IZIN\n"), Buffer.alloc(300, 0x20)]);
    const consentSql = async (w: U, client: string) => (await q(`select public.hd_edu_priv_consent_record($1,$2,'ZZ İzin Veren','danisan','anonim',false,false,'hd-egitim-izin-v1',$3,current_date,'islak_imza_tarama',$4,'application/pdf') v`,
      [w.id, client, sha, pdf.toString("base64")])).rows[0].v as string;
    const itemSql = async (w: U, chart: string, consent: string, title: string, cat = "tip") => (await q(`select public.hd_edu_priv_item_add($1,$2,$3,$4,$5,'alias',$6,$7,$8) v`,
      [w.id, chart, consent, title, `Örnek Danışan ${title.slice(0, 1)}.`, cat, "Kısa sentetik açıklama.", "Sentetik anlatım notu: sakral tepki örnekleri."])).rows[0].v as string;
    // A: 6 kayıt (biri çok uzun başlık), eklenecek 2 serbest harita; B: 2 kayıt.
    const aItems: string[] = [];
    const titles = ["Sakral otoritenin günlük kararlarda görünümü", "Açık Kalp merkezi ve değer duygusu", "3/5 profilde deneme ve yanılma",
      "Tanımlı Boğaz: ifade akışı", "Çok uzun bir eğitim başlığı — taşma denemesi için bilerek uzatılmış, kenarlardan taşmaması gereken metin örneği", "Duygusal dalga ile bekleme"];
    const aSrc: { client: string; chart: string }[] = [];
    for (const [i, t] of titles.entries()) {
      const s = await mkClientChart(A, `ZZ Danışan A${i}`); aSrc.push(s);
      aItems.push(await itemSql(A, s.chart, await consentSql(A, s.client), t, ["tip", "otorite", "profil", "merkezler", "kanallar", "genel"][i]));
    }
    const free1 = await mkClientChart(A, "ZZ Danışan Yeni");
    const free2 = await mkClientChart(A, "ZZ Danışan İkinci");
    const bSrc = await mkClientChart(B, "ZZ Danışan B0"), bSrc2 = await mkClientChart(B, "ZZ Danışan B1");
    const bItems = [await itemSql(B, bSrc.chart, await consentSql(B, bSrc.client), "Bora'nın sakral örneği"), await itemSql(B, bSrc2.chart, await consentSql(B, bSrc2.client), "Bora'nın profil örneği", "profil")];
    // Kapalı kayıt örnekleri (owner filtresi için): A'nın 5. kaydında izin geri çekilir; 4. kaydında kaynak değişir.
    await q(`select public.hd_edu_priv_consent_withdraw($1,(select consent_id from public.hd_edu_private_items where id=$2),'danisan_talebi')`, [A.id, aItems[5]]);
    await q(`update public.human_design_charts set computed_result = jsonb_set(computed_result,'{zz_recalc}','true') where id = $1`, [aSrc[3].chart]);

    const envv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_PRIVATE_EDUCATION_ENABLED: "true", HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete envv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete envv.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: envv as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    const appLog: string[] = [];
    app.stdout?.on("data", (d) => appLog.push(String(d))); app.stderr?.on("data", (d) => appLog.push(String(d)));
    process.on("exit", () => { try { writeFileSync(path.join(OUT, "_next-sunucu.log"), appLog.join("").slice(-200000)); } catch { /* */ } });
    // Çökme / beklenmedik çıkışta da KENDİ başlattığımız sunucu ağacını kapat (yetim süreç bırakma).
    const appPid = app.pid;
    process.on("exit", () => { if (appPid && process.platform === "win32") { try { execSync(`taskkill /pid ${appPid} /T /F`, { stdio: "ignore" }); } catch { /* zaten kapalı */ } } });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (u: U, vp: VpName | { width: number; height: number; mobile: boolean }): Promise<BrowserContext> => {
      const v = typeof vp === "string" ? VP[vp] : vp;
      const ctx = await browser!.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.mobile, hasTouch: v.mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul", acceptDownloads: true });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }, ...(u.role === "admin" ? [{ name: "yasam_admin_session", value: u.token, url: APP }] : [])]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: "zz@example.test", role: u.role, active: true, approval_status: "approved",
        package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: u.role === "expert" ? { human_design: true, clients: true } : {} };
      await ctx.addInitScript(([pu, tok]) => { try { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); } catch { /* about:blank: depolama yok (test aracı) */ } }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        if (/\/compute|roxyapi|\/api\/hd\/charts\/roxy/.test(url.pathname)) providerReq++;
        return route.continue();
      });
      ctx.on("page", (p) => wire(p));
      return ctx;
    };
    const wire = (p: Page) => {
      p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of 404/.test(m.text())) consoleErrors.push(`${p.url()} :: ${m.text().slice(0, 300)}`); });
      p.on("pageerror", (e) => consoleErrors.push(`${p.url()} :: pageerror ${e.message.slice(0, 300)}`));
      p.on("response", async (r) => {
        if (r.status() >= 400) { const k = `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`; badResponses.set(k, (badResponses.get(k) ?? 0) + 1); }
        if (/\/api\/(admin\/)?hd\/education\/private\//.test(r.url())) { try { privateBodies.push({ url: r.url(), body: await r.text() }); } catch { /* gövdesiz */ } }
      });
    };
    const open = async (ctx: BrowserContext, url: string) => { const p = await ctx.newPage(); wire(p); p.setDefaultTimeout(45000); await p.goto(`${APP}${url}`, { waitUntil: "load", timeout: 90000 }); return p; };
    const count = async (sql: string, a: unknown[] = []) => Number((await q(sql, a)).rows[0].n);

    // ── 1) Eğitmen akışı (masaüstü, etkileşimli) ─────────────────────────────────────
    section("1 · Eğitmen A — gerçek işlem akışı (masaüstü)");
    const actx = await ctxFor(A, "desktop");
    const hub = await open(actx, "/human-design");
    await hub.waitForSelector("[data-hd-hub]");
    await hub.waitForTimeout(800);
    const hubText = await hub.locator("[data-hd-hub]").innerText();
    ok(/Eğitim Merkezi/.test(hubText) && !/Hazır Eğitim Haritaları/.test(hubText), "HD girişinde tek 'Eğitim Merkezi' kartı (merkezî kart ayrıca çizilmedi)");
    const pA = await open(actx, "/human-design/egitim-merkezi");
    await pA.waitForSelector("[data-edu-cats]");
    ok(await pA.locator("[data-edu-cat='merkezi']").count() === 1 && await pA.locator("[data-edu-cat='ozel']").count() === 1, "A: iki kategori (merkezî yetkisi olduğu için ikisi de)");
    ok((await pA.locator("[data-edu-private-count]").innerText()).includes("6 harita") && (await pA.locator("[data-edu-private-count]").innerText()).includes("2 erişim kapalı"), "A: sayılar sunucudan (6 harita · 2 kapalı)");
    await pA.click("text=İki arşivin farkı");
    await pA.waitForSelector("[data-edu-compare]");
    ok(pA.url().endsWith("/human-design/egitim-merkezi/arsivler"), "A → B navigasyonu çalışır");
    await pA.click("text=Özel arşivimi aç");
    await pA.waitForSelector("[data-edu-cards]");
    ok(await pA.locator("[data-edu-card]").count() === 6, "C: gerçek liste 6 kayıt");
    await pA.fill("[data-edu-search]", "kalp");
    ok(await pA.locator("[data-edu-card]").count() === 1, "C: arama gerçek filtreler (1 sonuç)");
    await pA.fill("[data-edu-search]", "zzyokboyle");
    ok(await pA.locator("[data-edu-noresult]").count() === 1, "C: eşleşmeyen arama → boş sonuç ekranı");
    await pA.fill("[data-edu-search]", "");
    await pA.click("button:has-text('Profil')");
    ok(await pA.locator("[data-edu-card]").count() === 1, "C: kategori çipi gerçek filtre");
    await pA.click("button:has-text('Tümü')");
    ok(await pA.locator(`[data-edu-card='${aItems[5]}'] >> text=Yalnız kaldırılabilir`).count() === 1, "C: izni geri çekilmiş kayıt açılamaz, yalnız kaldırılabilir");

    // D + E: yeni kayıt (izinsiz danışan) — Devam / Geri alan koruması / izin kaydı / son adım ekleme.
    await pA.click("[data-edu-add-existing]");
    await pA.waitForSelector("[data-edu-step='1']");
    await pA.click(`[data-edu-chart='${aSrc[0].chart}']`);
    await pA.waitForSelector("[data-edu-ineligible='duplicate']");
    ok(await pA.locator("[data-edu-next='1']").isDisabled(), "D1: arşivde olan harita → mükerrer uyarısı, Devam kapalı");
    await snap(pA, "D-duplicate-desktop", false);
    await pA.click(`[data-edu-chart='${free1.chart}']`);
    await pA.waitForFunction(() => !(document.querySelector("[data-edu-next='1']") as HTMLButtonElement)?.disabled);
    await snap(pA, "D-step1-desktop");
    await pA.click("[data-edu-next='1']");
    await pA.waitForSelector("[data-edu-noconsent]");
    ok(await pA.locator("[data-edu-next='2']").isDisabled(), "D2: izin yok → Devam KAPALI (izinsiz kayıt yok)");
    await snap(pA, "D-step2-izinyok-desktop");
    await pA.click("[data-edu-new-consent]");
    await pA.waitForSelector("[data-edu-consent-form]");
    ok(await pA.locator("[data-edu-text-draft]").count() === 1, "E: taslak metin 'hukuk incelemesi bekliyor' olarak işaretli (onaylı gibi sunulmuyor)");
    ok(await pA.locator("[data-edu-consent-save]").isDisabled(), "E: kanıt dosyası olmadan Kaydet kapalı");
    await pA.setInputFiles("[data-edu-evidence]", { name: "zz.txt", mimeType: "text/plain", buffer: Buffer.from("x".repeat(200)) });
    ok(await pA.locator("text=Yalnız PDF, PNG veya JPEG yüklenebilir.").count() === 1, "E: yanlış MIME istemcide reddedildi");
    await pA.setInputFiles("[data-edu-evidence]", { name: "zz-buyuk.pdf", mimeType: "application/pdf", buffer: Buffer.concat([pdf, Buffer.alloc(2 * 1024 * 1024)]) });
    ok(await pA.locator("text=Dosya 2 MB sınırını aşıyor.").count() === 1, "E: 2 MB üstü istemcide reddedildi");
    await pA.fill("[data-edu-consenter]", "ZZ Danışan Yeni");
    await pA.click("[data-edu-scope='acik_isim']");
    await pA.selectOption("[data-edu-method]", "kayitli_eposta");
    ok(await pA.locator("text=Açık isim için kayıtlı e-posta yöntemi yeterli değil.").count() === 1, "E: açık isim + e-posta yöntemi uyarısı");
    await pA.click("[data-edu-scope='anonim']");
    await pA.selectOption("[data-edu-method]", "islak_imza_tarama");
    await pA.setInputFiles("[data-edu-evidence]", { name: "zz-izin.pdf", mimeType: "application/pdf", buffer: pdf });
    await snap(pA, "E-izin-kaydi-desktop");
    const consentsBefore = await count(`select count(*) n from public.hd_edu_private_consents where hd_client_id = $1`, [free1.client]);
    await pA.click("[data-edu-consent-save]");
    await pA.waitForSelector("[data-edu-consent]");
    ok(await count(`select count(*) n from public.hd_edu_private_consents where hd_client_id = $1`, [free1.client]) === consentsBefore + 1, "E: izin + kanıt DB'de oluştu");
    ok(await count(`select count(*) n from public.hd_edu_private_consent_evidence e join public.hd_edu_private_consents k on k.id=e.consent_id where k.hd_client_id=$1 and encode(sha256(e.content),'hex')=e.sha256`, [free1.client]) === 1, "E: kanıt SHA-256 DB'de doğrulandı");
    await pA.waitForFunction(() => !(document.querySelector("[data-edu-next='2']") as HTMLButtonElement)?.disabled);
    await snap(pA, "D-step2-izinli-desktop");
    await pA.click("[data-edu-next='2']");
    await pA.waitForSelector("[data-edu-step='3']");
    await pA.fill("[data-edu-title]", "ZZ Yeni eğitim örneği — sakral");
    await pA.fill("[data-edu-alias]", "Örnek Danışan Y.");
    await pA.fill("[data-edu-notes]", "ZZ ilk anlatım notu");
    ok(await pA.locator("[data-edu-mode] option[value='named']").evaluate((o) => (o as HTMLOptionElement).disabled), "D3: anonim izinle 'açık isim' seçilemez");
    await pA.click("text=Geri");
    await pA.waitForSelector("[data-edu-step='2']");
    await pA.click("[data-edu-next='2']");
    ok(await pA.inputValue("[data-edu-title]") === "ZZ Yeni eğitim örneği — sakral" && await pA.inputValue("[data-edu-notes]") === "ZZ ilk anlatım notu", "D: geri dönüşte doldurulmuş alanlar KORUNDU");
    await snap(pA, "D-step3-desktop");
    ok((await pA.locator("[data-edu-submit]").innerText()).includes("Eğitim Arşivime Ekle"), "D: 'Eğitim Arşivime Ekle' yalnız SON adımda");
    await pA.click("[data-edu-submit]");
    await pA.waitForSelector("[data-edu-add-success]");
    const newId = (await q(`select id from public.hd_edu_private_items where source_chart_id = $1`, [free1.chart])).rows[0]?.id as string | undefined;
    ok(!!newId, "D: kayıt DB'de oluştu (yeni hesap yok)");
    await snap(pA, "D-success-desktop", false);

    // F: gerçek BodyGraph + kayıtlı harita ekranıyla birebir aynı çizim.
    await pA.click("[data-edu-open-new]");
    await pA.waitForSelector("[data-edu-bodygraph] [data-hd-premium-bodygraph='ready'] svg");
    const eduSvg = await pA.locator("[data-edu-bodygraph] [data-hd-premium-bodygraph='ready'] svg").first().evaluate((e) => e.outerHTML);
    const eduEls = await pA.locator("[data-edu-bodygraph] [data-hd-premium-bodygraph='ready'] svg").first().evaluate((e) => e.querySelectorAll("*").length);
    ok(eduSvg.length > 5000 && eduEls > 100, "F: onaylı premium BodyGraph SVG çizildi", { len: eduSvg.length, eduEls });
    await snap(pA, "F-bodygraph-yeni-kayit-desktop");
    // Aynı kişinin NORMAL kayıtlı harita ekranı (liste → Detay penceresi; mevcut onaylı bileşen).
    const saved = await open(actx, "/human-design/kayitli-haritalar");
    try {
      await saved.getByRole("button", { name: "Hesaplanmış", exact: true }).first().click({ timeout: 45000 });
      await saved.locator("tr:has-text('ZZ Danışan Yeni') >> button:has-text('Detay')").first().click({ timeout: 45000 });
      await saved.waitForSelector("[data-hd-premium-bodygraph='ready'] svg", { timeout: 45000 });
    } catch (e) {
      await saved.screenshot({ path: path.join(OUT, "_tani-kayitli-haritalar.png"), fullPage: true }).catch(() => undefined);
      writeFileSync(path.join(OUT, "_tani-kayitli-haritalar.txt"), `${String(e).slice(0, 500)}

${(await saved.locator("body").innerText().catch(() => "")).slice(0, 4000)}`);
    }
    const savedSvg = await saved.locator("[data-hd-premium-bodygraph='ready'] svg").first().evaluate((e) => e.outerHTML).catch(() => "");
    // Giriş noktası: kayıtlı harita penceresindeki "Eğitim Arşivime Ekle" (yalnız özel arşiv yetkisi olan eğitmende).
    const entry = saved.locator("[data-hd-edu-archive-add]");
    // Düğme, sunucu erişim yoklaması (/api/hd/education/private/access) döndükten SONRA asenkron çizilir → yarış olmaması için bekle.
    const t0 = Date.now();
    await entry.first().waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined);
    console.log(`  (giriş noktası bekleme: ${Date.now() - t0} ms)`);
    ok(await entry.count() === 1 && ((await entry.getAttribute("href")) ?? "").includes(`/ozel/ekle?chart=${free1.chart}`), "Kayıtlı harita penceresinde 'Eğitim Arşivime Ekle' giriş noktası (kaynak seçili)");
    await snap(saved, "F-karsilastirma-kayitli-harita-desktop", false);
    const norm = (s: string) => s.replace(/\s(id|aria-labelledby|clip-path|mask|filter|fill|stroke)="url\(#[^"]*\)"/g, "").replace(/\sid="[^"]*"/g, "").replace(/url\(#[^)]*\)/g, "url()");
    ok(!!savedSvg && norm(savedSvg) === norm(eduSvg), "F: eğitim ekranındaki BodyGraph, aynı kişinin kayıtlı harita ekranındaki çizimle BİREBİR aynı", { saved: savedSvg.length, edu: eduSvg.length });
    await saved.close();
    const fBody = privateBodies.filter((b) => b.url.includes(`/items/${newId}`)).map((b) => b.body).join("\n");
    const leaks = [MARK.date, MARK.time, MARK.place, String(MARK.lat), String(MARK.lon), MARK.design, "computed_result", "provider_raw", "designInstantUtc", "birthUtcIso", free1.chart, free1.client].filter((m) => fBody.includes(m));
    ok(fBody.length > 0 && leaks.length === 0, "F: tarayıcıya gelen API yanıtında doğum / koordinat / Design anı / ham veri / kaynak kimlik YOK", leaks);
    const fText = await pA.locator("[data-edu-bodygraph]").innerText();
    ok(!fText.includes("ZZ Danışan Yeni") && fText.includes("Örnek Danışan Y."), "F: ekranda gerçek ad yok, takma ad var");

    // G: düzenle → kaydet → sayfadan çık → yeniden aç → kalıcı.
    await pA.click("[data-edu-edit]");
    await pA.waitForSelector("[data-edu-edit-form]");
    await snap(pA, "G-duzenleme-desktop");
    await pA.fill("[data-edu-notes]", "ZZ güncellenmiş anlatım notu (G testi)");
    await pA.click("[data-edu-save]");
    await pA.waitForSelector("[data-edu-msg]");
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel`, { waitUntil: "load" });
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel/${newId}`, { waitUntil: "load" });
    await pA.waitForSelector("[data-edu-notes-view]");
    ok((await pA.locator("[data-edu-notes-view]").innerText()).includes("ZZ güncellenmiş anlatım notu"), "G: sayfadan çıkıp yeniden açınca değişiklik görünür");
    ok(await count(`select count(*) n from public.hd_edu_private_items where id=$1 and teaching_notes like 'ZZ güncellenmiş%'`, [newId]) === 1, "G: değişiklik DB'de");

    // H: iki aşamalı tekli silme + eski URL 404 + asıl harita / danışan korunur.
    await pA.click("[data-edu-delete]");
    await pA.waitForSelector("[data-edu-delete-step='1']");
    await snap(pA, "H-silme-adim1-desktop", false);
    await pA.click("[data-edu-delete-next]");
    await pA.waitForSelector("[data-edu-delete-step='2']");
    await snap(pA, "H-silme-adim2-desktop", false);
    await pA.click("[data-edu-delete-confirm]");
    await pA.waitForURL(/kaldirildi=1/);
    ok(await count(`select count(*) n from public.hd_edu_private_items where id=$1`, [newId]) === 0, "H: eğitim kaydı DB'den silindi");
    ok(await count(`select count(*) n from public.human_design_charts where id=$1`, [free1.chart]) === 1 && await count(`select count(*) n from public.human_design_clients where id=$1`, [free1.client]) === 1
      && await count(`select count(*) n from public.hd_edu_private_consents where hd_client_id=$1`, [free1.client]) === 1, "H: asıl harita, danışan ve izin KORUNDU");
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel/${newId}`, { waitUntil: "load" });
    await pA.waitForSelector("[data-edu-notfound]");
    ok(true, "H: eski URL → 'Sayfa bulunamadı'");
    // H (3+): toplu silme, üç aşama + ifade.
    const s1 = await mkClientChart(A, "ZZ Toplu 1"), s2 = await mkClientChart(A, "ZZ Toplu 2"), s3 = await mkClientChart(A, "ZZ Toplu 3");
    const bulk = [await itemSql(A, s1.chart, await consentSql(A, s1.client), "ZZ toplu 1"), await itemSql(A, s2.chart, await consentSql(A, s2.client), "ZZ toplu 2"), await itemSql(A, s3.chart, await consentSql(A, s3.client), "ZZ toplu 3")];
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel`, { waitUntil: "load" });
    await pA.click("[data-edu-select-mode]");
    for (const id of bulk) await pA.check(`[data-edu-select='${id}']`);
    await pA.click("[data-edu-bulk-delete]");
    await pA.click("[data-edu-delete-next]");
    await pA.waitForSelector("[data-edu-delete-phrase]");
    ok(await pA.locator("[data-edu-delete-next]").isDisabled(), "H(3+): ifade yazılmadan 2. aşama geçilemez");
    await pA.fill("[data-edu-delete-phrase]", "3 kaydı sil");
    await snap(pA, "H-toplu-adim2-desktop", false);
    await pA.click("[data-edu-delete-next]");
    await pA.waitForSelector("[data-edu-delete-step='3']");
    await pA.click("[data-edu-delete-confirm]");
    await pA.waitForSelector("[data-edu-msg]");
    ok(await count(`select count(*) n from public.hd_edu_private_items where id = any($1)`, [bulk]) === 0 && await count(`select count(*) n from public.human_design_charts where id = any($1)`, [[s1.chart, s2.chart, s3.chart]]) === 3,
      "H(3+): 3 eğitim kaydı silindi, 3 asıl harita korundu");

    // İzin geri çekme (F'den) → anında kapanır; eski bağlantı 404.
    const wdItem = aItems[1];
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel/${wdItem}`, { waitUntil: "load" });
    await pA.click("[data-edu-withdraw]");
    await pA.click("[data-edu-confirm-next]");
    await pA.click("[data-edu-confirm-final]");
    await pA.waitForURL(/izin=geri/);
    ok(await count(`select count(*) n from public.hd_edu_private_consents k join public.hd_edu_private_items i on i.consent_id=k.id where i.id=$1 and k.withdrawn_at is not null`, [wdItem]) === 1, "İzin geri çekme DB'de");
    await pA.goto(`${APP}/human-design/egitim-merkezi/ozel/${wdItem}`, { waitUntil: "load" });
    await pA.waitForSelector("[data-edu-notfound]");
    ok(true, "İzin geri çekilen kaydın eski bağlantısı → 'Sayfa bulunamadı'");

    // ── 2) Owner I/J (masaüstü, etkileşimli) ─────────────────────────────────────────
    section("2 · Owner — I/J yönetim (masaüstü)");
    const octx = await ctxFor(OWNER, "desktop");
    const pI = await open(octx, "/admin/hd-ozel-egitim");
    await pI.waitForSelector("[data-owner-table]");
    const total = await count(`select count(*) n from public.hd_edu_private_items`);
    ok(await pI.locator("[data-owner-row]").count() === total, `I: owner tüm kayıtları görür (${total})`);
    await pI.selectOption("[data-owner-trainer]", A.id);
    await pI.waitForFunction((id) => location.search.includes(id), A.id);
    await pI.waitForSelector("[data-owner-filter-note]");
    await pI.waitForTimeout(500);
    const aCount = await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1`, [A.id]);
    ok(await pI.locator("[data-owner-row]").count() === aCount, `J: eğitmen filtresi sunucuda çalışır (A=${aCount})`);
    await pI.selectOption("[data-owner-state]", "consent_withdrawn");
    await pI.waitForFunction(() => location.search.includes("durum=consent_withdrawn"));
    await pI.waitForTimeout(600);
    ok(await pI.locator("[data-owner-row]").count() === 2, "J: 'İzni geri çekilmiş' filtresi (A: 2)");
    await snap(pI, "J-owner-filtre-izin-geri-cekilmis-desktop");
    await pI.selectOption("[data-owner-state]", "invalid");
    await pI.waitForTimeout(700);
    ok(await pI.locator("[data-owner-row]").count() === 1, "J: 'Geçersiz kaynak' filtresi (A: 1)");
    await pI.selectOption("[data-owner-state]", "all");
    await pI.fill("[data-owner-search]", "zzhicyok");
    await pI.waitForSelector("[data-owner-empty]");
    ok(true, "J: boş sonuç ekranı");
    await pI.click("text=Filtreyi kaldır");
    await pI.waitForTimeout(700);
    ok(await pI.locator("[data-owner-row]").count() === await count(`select count(*) n from public.hd_edu_private_items`), "J: filtre kaldırılınca tüm kayıtlar");
    await snap(pI, "I-owner-filtresiz-tum-kayitlar-desktop");
    // Owner: kaydı düzenle (eğitim alanları) → DB.
    await pI.goto(`${APP}/admin/hd-ozel-egitim/${bItems[0]}/duzenle`, { waitUntil: "load" });
    await pI.waitForSelector("[data-edu-edit-form]");
    await pI.fill("[data-edu-title]", "Owner düzenledi — Bora örneği");
    await pI.click("[data-edu-save]");
    await pI.waitForURL(/kaydedildi=1/);
    ok(await count(`select count(*) n from public.hd_edu_private_items where id=$1 and title='Owner düzenledi — Bora örneği'`, [bItems[0]]) === 1, "Owner: eğitim alanı düzenleme DB'de");
    // Owner ayrıntı: BodyGraph görünür.
    await pI.waitForSelector("[data-edu-bodygraph] [data-hd-premium-bodygraph='ready'] svg");
    ok(true, "Owner: ayrıntıda gerçek BodyGraph");
    // Owner: izin durumu incele.
    await pI.goto(`${APP}/admin/hd-ozel-egitim`, { waitUntil: "load" });
    await pI.waitForSelector("[data-owner-table]");
    await pI.click(`[data-owner-menu='${bItems[1]}']`);
    await pI.click(`[data-owner-table] [data-owner-consent='${bItems[1]}']`);
    await pI.waitForSelector("[data-owner-consent-dl]");
    ok(!(await pI.locator("[data-edu-modal]").innerText()).includes("ZZ İzin Veren"), "Owner izin incelemesi: izni verenin adı gösterilmez");
    await snap(pI, "I-owner-izin-inceleme-desktop", false);
    await pI.keyboard.press("Escape");
    // FAZ 8 · Modül İzinleri ekranındaki TEK anahtar: C'ye aç → DB + C erişimi.
    ok(await pI.locator("[data-owner-expert-q], [data-owner-grant], [data-owner-journal-dl]").count() === 0, "Owner özel arşiv ekranında ayrı yetki/uzman arama/iptal günlüğü paneli YOK");
    ok(await pI.locator(`[data-owner-module-link='${B.id}']`).count() === 1, "Yetkili eğitmen satırında 'Modül İzinleri' yönlendirmesi var");
    const pU = await open(octx, `/admin/users/${C.id}#uye-erisim`);
    const swC = pU.locator("[data-hd-edu-access-switch]");
    await swC.waitFor({ timeout: 60000 }).catch(async (e) => {
      await snap(pU, "DEBUG-admin-users-ekran", true);
      console.error("DEBUG bad:", JSON.stringify([...badResponses.entries()].slice(-25)));
      throw e;
    });
    ok((await swC.getAttribute("aria-checked")) === "false", "Modül İzinleri: 'HUMAN DESIGN EĞİTİM HARİTALARI' anahtarı C için KAPALI");
    ok(/HUMAN DESIGN EĞİTİM HARİTALARI/.test(await pU.locator("[data-hd-edu-access]").innerText()), "anahtar etiketi doğru");
    await pU.locator("[data-hd-edu-access]").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await snap(pU, "K-modul-izinleri-tek-anahtar-kapali-desktop", false);
    await swC.click();
    await pU.waitForSelector("[data-hd-edu-access-switch][aria-checked='true']");
    ok(await count(`select count(*) n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [C.id]) === 1, "Tek anahtar AÇIK → DB'de tek etkin yetki (C)");
    await pU.locator("[data-hd-edu-access]").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await snap(pU, "K-modul-izinleri-tek-anahtar-acik-desktop", false);
    const cctx = await ctxFor(C, "desktop");
    const pC = await open(cctx, "/human-design/egitim-merkezi/ozel");
    await pC.waitForSelector("[data-edu-cards], [data-edu-empty]");
    ok(true, "C: özel arşiv açıldı (tek yetki)");
    await pC.close();
    // B'nin anahtarını kapat → B'nin AÇIK oturumunda özel + merkezî erişim kapanır; veri silinmez.
    const bctx = await ctxFor(B, "desktop");
    const pB = await open(bctx, "/human-design/egitim-merkezi/ozel");
    await pB.waitForSelector("[data-edu-cards]");
    ok(await pB.locator("[data-edu-card]").count() === 2, "B önce kendi 2 kaydını görür (A'nınkileri değil)");
    const centralStatus = (pg: Page, uid: string) => pg.evaluate(async (id) => (await fetch("/api/hd/education/access", { cache: "no-store",
      headers: { "x-user-id": id, "x-session-token": localStorage.getItem("yasam_session_token") ?? "" } })).status, uid);
    ok(await centralStatus(pB, B.id) === 200, "Tek anahtar AÇIK → B merkezî kataloğu da görür (200)");
    await pU.goto(`${APP}/admin/users/${B.id}#uye-erisim`, { waitUntil: "load" });
    const swB = pU.locator("[data-hd-edu-access-switch][aria-checked='true']");
    await swB.waitFor({ timeout: 60000 });
    await swB.click();
    await pU.waitForSelector("[data-hd-edu-access-switch][aria-checked='false']");
    await pB.reload({ waitUntil: "load" });
    await pB.waitForSelector("[data-edu-notfound]");
    ok(true, "Tek anahtar KAPALI → B'nin eski oturumunda özel arşiv 'bulunamadı'");
    ok(await centralStatus(pB, B.id) === 404, "Tek anahtar KAPALI → B merkezî kataloğa da erişemez (404)");
    ok(await count(`select count(*) n from public.hd_edu_private_items where trainer_user_id=$1`, [B.id]) === 2, "Kapatma B'nin kayıtlarını SİLMEDİ");
    await swB.page().locator("[data-hd-edu-access-switch]").click();
    await pU.waitForSelector("[data-hd-edu-access-switch][aria-checked='true']");
    await pB.reload({ waitUntil: "load" });
    await pB.waitForSelector("[data-edu-cards]");
    ok(await pB.locator("[data-edu-card]").count() === 2 && await centralStatus(pB, B.id) === 200, "Yeniden açınca B'nin geçerli kayıtları + merkezî katalog geri görünür");
    // Normal admin aynı ekranda anahtarı GÖRMEZ.
    const adPage = await open(await ctxFor(ADMIN, "desktop"), `/admin/users/${B.id}#uye-erisim`);
    await adPage.waitForTimeout(4000);
    ok(await adPage.locator("[data-hd-edu-access]").count() === 0, "Normal admin Modül İzinleri'nde eğitim anahtarını GÖRMEZ");
    await adPage.close();
    await pU.close();
    // Arşiv anahtarı kapat → A kapanır; aç.
    await pI.click("[data-owner-toggle]");
    await pI.click("[data-edu-confirm-next]");
    await pI.click("[data-edu-confirm-final]");
    await pI.waitForSelector("[data-owner-archive='closed']");
    const pA2 = await open(actx, "/human-design/egitim-merkezi/ozel");
    await pA2.waitForSelector("[data-edu-notfound]");
    ok(true, "Anahtar kapalı → eğitmen A 'bulunamadı'");
    await pA2.close();
    await pI.click("[data-owner-toggle]");
    await pI.click("[data-edu-confirm-next]");
    await pI.click("[data-edu-confirm-final]");
    await pI.waitForSelector("[data-owner-archive='open']");

    // ── 3) Yetkisiz erişim ─────────────────────────────────────────────────────────
    section("3 · Yetkisiz erişim");
    const xctx = await ctxFor(X, "desktop");
    const px = await open(xctx, "/human-design/egitim-merkezi/ozel");
    await px.waitForSelector("[data-edu-notfound]");
    ok(true, "Yetkisiz uzman → 'bulunamadı'");
    const pxa = await open(xctx, `/human-design/egitim-merkezi/ozel/${aItems[0]}`);
    await pxa.waitForSelector("[data-edu-notfound]");
    ok(true, "Yetkisiz uzman, A'nın kayıt URL'si → 'bulunamadı'");
    const pxh = await open(xctx, "/human-design");
    await pxh.waitForSelector("[data-hd-hub]"); await pxh.waitForTimeout(800);
    ok(!(await pxh.locator("[data-hd-hub]").innerText()).includes("Eğitim Merkezi"), "Yetkisiz uzmanın HD girişinde kart yok");
    const adctx = await ctxFor(ADMIN, "desktop");
    const pad = await adctx.newPage(); wire(pad);
    const adResp = await pad.goto(`${APP}/admin/hd-ozel-egitim`, { waitUntil: "load" });
    ok(adResp?.status() === 404, "Normal admin → owner ekranı gerçek 404 (sunucu notFound)", adResp?.status());
    const anon = await browser.newContext(); const panon = await anon.newPage(); wire(panon);
    const r404 = await panon.goto(`${APP}/admin/hd-ozel-egitim`, { waitUntil: "load" });
    ok(r404?.status() === 404 || (r404?.url() ?? "").endsWith("/"), "Oturumsuz → owner ekranı açılmaz");
    // A, B'nin kaydına doğrudan URL ile.
    const pAB = await open(actx, `/human-design/egitim-merkezi/ozel/${bItems[1]}`);
    await pAB.waitForSelector("[data-edu-notfound]");
    ok(true, "Eğitmen A, B'nin kaydını URL ile açamaz");

    // ── 4) Ekran görüntüleri: A–J × masaüstü / tablet / mobil + 8 genişlikte taşma ─────
    section("4 · Duyarlı ekranlar (3 cihaz görüntüsü + 8 genişlik taşma ölçümü)");
    const anItem = aItems[0];
    const trainerScreens: [string, string, string][] = [
      ["A", "/human-design/egitim-merkezi", "[data-edu-cats]"],
      ["B", "/human-design/egitim-merkezi/arsivler", "[data-edu-compare]"],
      ["C", "/human-design/egitim-merkezi/ozel", "[data-edu-cards]"],
      ["D", `/human-design/egitim-merkezi/ozel/ekle?chart=${free2.chart}`, "[data-edu-step='1']"],
      ["E", `/human-design/egitim-merkezi/ozel/izin?chart=${free2.chart}`, "[data-edu-consent-form]"],
      ["F-bodygraph", `/human-design/egitim-merkezi/ozel/${anItem}`, "[data-edu-bodygraph] svg"],
      ["G", `/human-design/egitim-merkezi/ozel/${anItem}/duzenle`, "[data-edu-edit-form]"],
    ];
    const ownerScreens: [string, string, string][] = [
      ["I-owner", "/admin/hd-ozel-egitim", "[data-owner-total]"],
      ["J-owner-filtre", `/admin/hd-ozel-egitim?egitmen=${A.id}&durum=consent_withdrawn`, "[data-owner-filter-note]"],
    ];
    const overflowFails: string[] = [];
    for (const [vpName, label] of [["desktop", "desktop"], ["tablet", "tablet"], ["mobile", "mobile"]] as const) {
      const tc = await ctxFor(A, vpName);
      const oc = await ctxFor(OWNER, vpName);
      for (const [name, url, sel] of trainerScreens) {
        const p = await open(tc, url);
        await p.waitForSelector(sel, { timeout: 30000 });
        if (name === "D") { await p.click(`[data-edu-chart='${free2.chart}']`); await p.waitForFunction(() => !(document.querySelector("[data-edu-next='1']") as HTMLButtonElement)?.disabled); }
        await snap(p, `${name}-${label}`);
        await p.close();
      }
      // H: modal (C üzerinde menü → Kaldır).
      const ph = await open(tc, "/human-design/egitim-merkezi/ozel");
      await ph.waitForSelector("[data-edu-cards]");
      await ph.click(`[data-edu-card='${anItem}'] [data-edu-card-menu]`);
      await ph.click(`[data-edu-card='${anItem}'] [data-edu-menu-delete]`);
      await ph.waitForSelector("[data-edu-delete-step='1']");
      await snap(ph, `H-${label}`, false);
      await ph.close();
      for (const [name, url, sel] of ownerScreens) {
        const p = await open(oc, url);
        await p.waitForSelector(sel, { timeout: 30000 });
        await p.waitForTimeout(600);
        if (vpName === "mobile" || vpName === "tablet") {
          const cardsVisible = await p.locator("[data-owner-cards]").isVisible().catch(() => false);
          const tableVisible = await p.locator("[data-owner-table]").isVisible().catch(() => false);
          ok(cardsVisible && !tableVisible, `${name} ${label}: ≤900 px'te tablo değil yönetim kartları`);
        }
        await snap(p, `${name}-${label}`);
        await p.close();
      }
      await tc.close(); await oc.close();
    }
    // Taşma: 8 genişlik × tüm ekranlar (H modalı dahil).
    for (const w of WIDTHS) {
      const v = { width: w, height: 900, mobile: w < 900 };
      const tc = await ctxFor(A, v), oc = await ctxFor(OWNER, v);
      for (const [name, url, sel] of [...trainerScreens.map((s) => [...s, "t"] as const), ...ownerScreens.map((s) => [...s, "o"] as const)]) {
        const p = await open(name.startsWith("I") || name.startsWith("J") ? oc : tc, url);
        await p.waitForSelector(sel, { timeout: 30000 });
        await p.waitForTimeout(300);
        const o = await overflow(p);
        if (o > 1) overflowFails.push(`${name}@${w}: ${o}px`);
        await p.close();
      }
      await tc.close(); await oc.close();
    }
    ok(overflowFails.length === 0, `yatay taşma: 0 (${WIDTHS.join("/")} px × ${trainerScreens.length + ownerScreens.length} ekran)`, overflowFails);

    // ── Genel ──────────────────────────────────────────────────────────────────────
    section("5 · Genel");
    const allPriv = privateBodies.map((b) => b.body).join("\n");
    const birthLeak = [MARK.date, MARK.place, String(MARK.lat), String(MARK.lon), MARK.design, "provider_raw", "computed_result", "designInstantUtc"].filter((m) => allPriv.includes(m));
    ok(birthLeak.length === 0, `tarayıcıdaki TÜM özel arşiv API yanıtlarında (${privateBodies.length}) doğum / koordinat / ham veri sızıntısı 0`, birthLeak);
    ok(external.length === 0, "beklenmeyen dış istek 0", external.slice(0, 5));
    ok(providerReq === 0, "ücretli sağlayıcı / hesap ucu isteği 0", providerReq);
    // Yerel `next start` ortam artığı: Vercel Analytics / Speed Insights betikleri YALNIZ Vercel'de sunulur (yerelde text/plain 404).
    const envArtifact = (e: string) => /\/_vercel\/(insights|speed-insights)\//.test(e);
    // "Failed to load resource" satırları ayrıca URL bazında (_hatali-yanitlar.txt) sınıflandırılır; burada yalnız JS / uygulama hataları.
    const appErrors = consoleErrors.filter((e) => !envArtifact(e) && !/Failed to load resource/.test(e));
    const newFeatureBad = [...badResponses.keys()].filter((k) => /\/(api\/(admin\/)?hd\/education\/private|human-design\/egitim-merkezi|admin\/hd-ozel-egitim)/.test(k) && !k.startsWith("404 "));
    ok(newFeatureBad.length === 0, "yeni özelliğin uç / sayfalarında 5xx / 403 yok (yalnız yetkisizlik testlerindeki beklenen 404'ler)", newFeatureBad);
    writeFileSync(path.join(OUT, "_hatali-yanitlar.txt"), [...badResponses.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} :: ${k}`).join("\n"));
    writeFileSync(path.join(OUT, "_konsol-hatalari.txt"),
      [`uygulama: ${appErrors.length}`, `ortam artığı (Vercel betikleri yerelde yok): ${consoleErrors.length - appErrors.length}`, "", ...consoleErrors].join("\n"));
    ok(appErrors.length === 0, `uygulama console error 0 (ayrıca ${consoleErrors.length - appErrors.length} yerel ortam artığı: Vercel Analytics betiği)`, appErrors.slice(0, 8));
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
