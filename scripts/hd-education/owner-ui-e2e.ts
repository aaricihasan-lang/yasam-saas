/**
 * HD Hazır Eğitim Haritaları — GERÇEK owner ekranı tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next route'ları → PostgREST shim → geçici embedded-postgres (migration 20271110000000 uygulanmış).
 * Veri tamamen SENTETİK (ZZ_*); production/Preview'a ve dış ağa SIFIR temas (localhost dışı her istek abort).
 *
 * Ön koşul — yerel test önüne işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/owner-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 *
 * A) Kapı AÇIK: owner envanter (istatistik, filtre, arama, ayrıntı, "Pilot adayı"), erişim (arama, HD filtresi, yetki ver /
 *    kaldır onay penceresi, yeşil Kaydet, yetkili listesi, geçmiş); masaüstü / tablet / mobil; yatay taşma yok.
 *    Normal admin: bağlantı yok, sayfa bilinmeyen rotanın 404'üyle birebir aynı.
 * B) Kapı KAPALI (varsayılan): owner için de bağlantı yok + 404; admin paneli çalışır.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { startPgrestShim } from "../uye-yonetimi-faz1/pgrestShim";
import { startTestDb } from "../uye-yonetimi-faz2/testDb";
import { startProxy } from "../delete-safety/storageProxy";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil (üzerine yazılmaz): ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3987;
const APP = `http://127.0.0.1:${PORT}`;
const PAGE = `${APP}/admin/hd-egitim-haritalari`;

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 400)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string) => {
  const file = path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`);
  if (existsSync(file)) throw new Error(`üzerine yazılmaz: ${file}`);
  await page.screenshot({ path: file, fullPage: true });
};

async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}
function startApp(flag: boolean): ChildProcess {
  const env: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: "zz-test-service-role-not-a-secret" };
  if (flag) env.HD_EDUCATION_CATALOG_ENABLED = "true";
  else delete env.HD_EDUCATION_CATALOG_ENABLED;
  return spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore",
  });
}
async function stopApp(app: ChildProcess | null) {
  if (!app?.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else app.kill("SIGTERM");
  const until = Date.now() + 30_000;
  while (Date.now() < until) {
    try { await fetch(APP); } catch { return; }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let dbEnv: Awaited<ReturnType<typeof startTestDb>> | null = null;
  let shim: Awaited<ReturnType<typeof startPgrestShim>> | null = null;
  let proxy: Awaited<ReturnType<typeof startProxy>> | null = null;
  const external: string[] = [];
  const pageErrors: string[] = [];
  try {
    dbEnv = await startTestDb(54447, `hd-edu-ui-db-${Date.now()}-${randomUUID().slice(0, 8)}`); // her koşu YENİ klasör
    const su = dbEnv.su;
    // B1 + B2 birlikte (production'a ikisi birlikte uygulanacak; owner ekranı son şemayı okur).
    for (const f of ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"]) {
      await su.query(readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    }
    shim = await startPgrestShim(dbEnv.pool);
    proxy = await startProxy(shim.url, su, 54398);

    // ── Sentetik tohum ────────────────────────────────────────────────────
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const mkUser = async (role: "admin" | "expert", name: string, o: { superAdmin?: boolean; hd?: boolean; active?: boolean; demo?: boolean } = {}) => {
      const id = randomUUID();
      const tenant = randomUUID();
      await q(`insert into public.tenants(id, name, slug, status) values ($1,'ZZ',$2,'active')`, [tenant, `zz-${tenant.slice(0, 13)}`]);
      const email = `zz.eduui.${id.slice(0, 8)}@example.test`;
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, approved_at, module_permissions, package_type, plan, is_demo_account, admin_level)
               values ($1,$2,$3,$4,$5,'approved',$6,$7,now(),$8,'premium','premium',$9,$10)`,
        [id, name, email, role, o.active ?? true, o.superAdmin ?? false, tenant, JSON.stringify(role === "expert" ? { human_design: o.hd ?? true, clients: true } : {}), o.demo === true, role === "admin" ? "owner" : null]);
      const token = `zz-eduui-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, email, token, name };
    };
    const owner = await mkUser("admin", "ZZ Owner", { superAdmin: true });
    const admin2 = await mkUser("admin", "ZZ Normal Admin");
    const ea = await mkUser("expert", "ZZ Eğitmen Ayşe");
    const eb = await mkUser("expert", "ZZ Eğitmen Burak");
    await mkUser("expert", "ZZ Uzman HD'siz", { hd: false });
    await mkUser("expert", "ZZ Uzman Demo", { demo: true });
    const S = [randomUUID(), randomUUID(), randomUUID()];
    await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, documented_local_time, document_quote, utc_status, birth_utc, legal_status, legal_note, blockers) values
      ($1,'zz-sentetik-bilim-1900-01-01','ZZ-1','ZZ Sentetik Bilimci','bilim',false,'1900-01-01','ZZ Şehir','10:00','ZZ sentetik belge ifadesi','VERIFIED','1900-01-01T09:00:00Z','LOW_UNREVIEWED','[Araştırma raporu (L1): düşük risk — AVUKAT ONAYI DEĞİL] ZZ not', array['AVUKAT-GÖRMEDİ']),
      ($2,'zz-sentetik-muzik-1901-02-02','ZZ-2','ZZ Sentetik Müzisyen','muzik',false,'1901-02-02','ZZ Kasaba','11:30','ZZ sentetik ifade 2','PENDING_VERIFICATION',null,'LOW_UNREVIEWED','[Hukuk incelemesi eksik — avukat teyidi yok] ZZ', array['UTC-TEYİT','AVUKAT-GÖRMEDİ']),
      ($3,'zz-sentetik-kraliyet-1902-03-03','ZZ-3','ZZ Sentetik Kraliyet','kraliyet',true,'1902-03-03','ZZ Saray','09:15','ZZ sentetik ifade 3','VERIFIED','1902-03-03T08:15:00Z','E','[FAZ 2-A hukuk uzlaştırması: araştırma CSV''si DÜŞÜK RİSK, L1 ORTA → E] ZZ', array['HUKUK-E','KRALİYET','YAŞAYAN KİŞİ'])`, S);
    await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution) values ($1,1,'birth_time','https://example.test/zz-belge','ZZ Arşiv')`, [S[0]]);
    await q(`insert into public.hd_education_publications (subject_id) values ($1),($2),($3)`, S);
    await q(`update public.hd_education_publications set status='pilot_candidate', updated_by=$2 where subject_id=$1`, [S[0], owner.id]);

    const ctxFor = async (u: typeof owner, viewport: { width: number; height: number }, mobile = false) => {
      const ctx = await browser!.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: u.token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: u.email, role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => {
        localStorage.setItem("yasam_user", pu as string);
        localStorage.setItem("yasam_session_token", tok as string);
      }, [JSON.stringify(profile), u.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      return { ctx, page };
    };
    const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

    // ════════ A) KAPI AÇIK ════════
    app = startApp(true);
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    section("A1. Owner — envanter (masaüstü 1440×900)");
    {
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      const resp = await page.goto(PAGE, { waitUntil: "networkidle" });
      ok(resp?.status() === 200, "owner sayfası 200", resp?.status());
      await page.getByText("ZZ Sentetik Bilimci").waitFor({ timeout: 20_000 });
      const nav = await page.locator("nav").first().innerText();
      ok(nav.includes("Hazır Eğitim Haritaları"), "admin menüsünde owner bağlantısı var");
      const body = await page.locator("main").innerText();
      ok(/Hazır Eğitim Haritaları/.test(body) && /Toplam kişi/.test(body), "başlık + istatistik kartları");
      ok(body.includes("Pilot adayı") && !body.includes("Pilot (örnek)"), "etiket 'Pilot adayı' (eski 'Pilot (örnek)' yok)");
      ok(body.includes("Düşük · avukat incelemesi yok") && body.includes("E · bekliyor"), "hukuk etiketleri: avukat incelemesi yok / E");
      ok((await page.locator("tbody tr").count()) === 3, "3 sentetik satır");
      await snap(page, "owner-envanter-masaustu");
      await page.getByLabel("Hukuk durumu").selectOption("E");
      ok((await page.locator("tbody tr").count()) === 1, "hukuk filtresi (E) → 1 satır");
      await page.getByLabel("Hukuk durumu").selectOption("all");
      await page.getByLabel("UTC durumu").selectOption("pending");
      ok((await page.locator("tbody tr").count()) === 1, "UTC filtresi (teyit bekliyor) → 1 satır");
      await page.getByLabel("UTC durumu").selectOption("all");
      await page.getByLabel("Kişi adı ara").fill("müzisyen");
      ok((await page.locator("tbody tr").count()) === 1, "arama (TR küçük harf) → 1 satır");
      await page.getByLabel("Kişi adı ara").fill("");
      await page.getByText("ZZ Sentetik Bilimci").click();
      // B2: ayrıntı paneli owner kişi ayrıntısı bileşeniyle (OwnerSubjectDetail) yüklenir — içerik gelene kadar bekle.
      const box = page.locator("section[aria-label$='ayrıntıları']");
      await box.getByText("Doğum verisi ve UTC").waitFor({ timeout: 20_000 });
      const detail = await box.innerText();
      ok(/Doğum verisi ve UTC/.test(detail) && /ZZ Arşiv/.test(detail) && /AVUKAT ONAYI DEĞİL/.test(detail), "ayrıntı: kaynak + hukuk notu (avukat onayı DEĞİL)");
      ok(await box.getByRole("button", { name: /BodyGraph hesapla/ }).isDisabled() && /Yayın kaydı: (Taslak|Pilot adayı)/.test(detail), "B2: hesaplama başlatılamaz (UTC/koordinat eksik → düğme pasif), yayın kaydı yayımlı değil");
      await snap(page, "owner-envanter-ayrinti");
      ok(await noHScroll(page), "masaüstü: yatay sayfa taşması yok");
      await ctx.close();
    }

    section("A2. Owner — erişim yönetimi (masaüstü)");
    {
      const { ctx, page } = await ctxFor(owner, { width: 1440, height: 900 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Eğitmen Erişim Yetkileri" }).click();
      await page.getByText("ZZ Eğitmen Ayşe").waitFor({ timeout: 20_000 }).catch(async (e) => {
        console.error("  ! erişim sekmesi metni:", (await page.locator("main").innerText()).slice(0, 600));
        throw e;
      });
      let txt = await page.locator("main").innerText();
      ok(!txt.includes("ZZ Uzman HD'siz"), "varsayılan filtre: yalnız Human Design erişimi olanlar");
      await page.getByLabel(/Yalnız Human Design/).uncheck();
      txt = await page.locator("main").innerText();
      ok(txt.includes("ZZ Uzman HD'siz") && txt.includes("Önce Human Design erişimi gerekir"), "filtre kaldırılınca HD'siz uzman + uygunsuzluk gerekçesi");
      await page.getByLabel("Uzman ara").fill("Ayşe");
      await page.waitForTimeout(700);
      // FAZ 8 TEK YETKİ: bu liste SALT-OKUNUR; açma/kapama yalnız Admin → Üye → Modül İzinleri'ndeki tek anahtardan.
      const row = page.locator("li", { hasText: "ZZ Eğitmen Ayşe" });
      ok((await page.getByRole("button", { name: /^(Yetki ver|Yetkiyi kaldır)$/ }).count()) === 0, "FAZ 8: erişim listesinde 'Yetki ver / Yetkiyi kaldır' düğmesi YOK (tek kontrol noktası)");
      const link = row.getByRole("link", { name: /Modül İzinleri/ });
      ok((await link.getAttribute("href")) === `/admin/users/${ea.id}#uye-erisim`, "satırda 'Modül İzinleri'nde değiştir' bağlantısı (üye ayrıntısı → Modül İzinleri)", await link.getAttribute("href"));
      ok(/ERİŞİM KAPALI/.test(await row.innerText()), "satır: ERİŞİM KAPALI (varsayılan)");
      await q(`select public.hd_education_grant_access($1,$2,'ZZ eğitim programı')`, [owner.id, ea.id]);
      await page.getByLabel("Uzman ara").fill("Ayş");
      await page.waitForTimeout(900);
      txt = await page.locator("main").innerText();
      ok(/ERİŞİM AÇIK/.test(await page.locator("li", { hasText: "ZZ Eğitmen Ayşe" }).first().innerText()), "tek anahtarla verilen yetki listede ERİŞİM AÇIK görünür (aynı kaynak)");
      ok(/Yetkili eğitmenler[\s\S]*ZZ Eğitmen Ayşe/.test(txt) && /Değişiklik geçmişi[\s\S]*Erişim verildi/.test(txt), "yetkili eğitmenler + değişiklik geçmişi (salt-okunur)");
      await snap(page, "owner-erisim-salt-okunur");
      ok(await noHScroll(page), "masaüstü erişim: yatay taşma yok");
      await ctx.close();
      void eb;
    }

    for (const vp of [{ name: "tablet", width: 820, height: 1180, mobile: true }, { name: "mobil", width: 390, height: 844, mobile: true }]) {
      section(`A3. Owner — ${vp.name} ${vp.width}×${vp.height}`);
      const { ctx, page } = await ctxFor(owner, vp, vp.mobile);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByText("ZZ Sentetik Bilimci").waitFor({ timeout: 20_000 });
      ok(await noHScroll(page), `${vp.name}: envanterde yatay sayfa taşması yok (tablo kendi içinde kayar)`);
      await snap(page, `owner-envanter-${vp.name}`);
      await page.getByRole("button", { name: "Eğitmen Erişim Yetkileri" }).click();
      await page.getByText("ZZ Eğitmen Burak").waitFor({ timeout: 20_000 });
      ok(await noHScroll(page), `${vp.name}: erişim ekranında yatay taşma yok`);
      const lbox = await page.locator("li", { hasText: "ZZ Eğitmen Burak" }).getByRole("link", { name: /Modül İzinleri/ }).boundingBox();
      ok(!!lbox && lbox.x >= 0 && lbox.x + lbox.width <= vp.width + 1, `${vp.name}: 'Modül İzinleri'nde değiştir' bağlantısı görünür alanda`, lbox);
      await snap(page, `owner-erisim-${vp.name}`);
      await ctx.close();
    }

    section("A4. Normal admin — bağlantı yok, bilinmeyen rota ile aynı 404");
    {
      const { ctx, page } = await ctxFor(admin2, { width: 1366, height: 860 });
      const r = await page.goto(PAGE, { waitUntil: "networkidle" });
      const body = await page.locator("body").innerText();
      const r2 = await page.goto(`${APP}/admin/zz-boyle-bir-sayfa-yok`, { waitUntil: "networkidle" });
      const body2 = await page.locator("body").innerText();
      ok(r?.status() === 404 && r2?.status() === 404, "HTTP 404 (her ikisi)", [r?.status(), r2?.status()]);
      ok(body.trim() === body2.trim(), "sayfa metni bilinmeyen rotanın 404'üyle birebir aynı (varlık sızmıyor)", [body.slice(0, 120), body2.slice(0, 120)]);
      ok(!/eğitim|katalog|yetki|erişim|owner/i.test(body), "404 metninde katalog/erişim/yetki ifadesi yok", body.slice(0, 200));
      await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
      ok(!(await page.locator("nav").first().innerText()).includes("Hazır Eğitim Haritaları"), "normal adminin menüsünde bağlantı yok");
      const html = await page.content();
      ok(!html.includes("hd-egitim-haritalari"), "normal adminin HTML'inde rota adı yok");
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await snap(page, "normal-admin-404");
      await ctx.close();
    }
    await stopApp(app);
    app = null;

    // ════════ B) KAPI KAPALI (varsayılan) ════════
    section("B. Hazırlık kapısı KAPALI — owner dahil özellik yok, admin paneli çalışır");
    app = startApp(false);
    await waitHttp(`${APP}/`, 180_000);
    {
      const { ctx, page } = await ctxFor(owner, { width: 1366, height: 860 });
      const adminResp = await page.goto(`${APP}/admin`, { waitUntil: "networkidle" });
      const nav = await page.locator("nav").first().innerText();
      ok(adminResp?.status() === 200 && nav.includes("Human Design İçerik Yönetimi"), "admin paneli açılıyor (mevcut menü yerinde)");
      ok(!nav.includes("Hazır Eğitim Haritaları"), "owner'ın menüsünde de bağlantı YOK");
      const r = await page.goto(PAGE, { waitUntil: "networkidle" });
      ok(r?.status() === 404, "owner için de sayfa 404", r?.status());
      const api = await page.evaluate(async () => {
        const u = JSON.parse(localStorage.getItem("yasam_user") ?? "{}") as { id?: string };
        const res = await fetch("/api/admin/hd/education/subjects", { headers: { "x-admin-id": u.id ?? "", "x-session-token": localStorage.getItem("yasam_session_token") ?? "" } });
        return { status: res.status, cache: res.headers.get("cache-control"), body: await res.text() };
      });
      ok(api.status === 404 && api.cache === "no-store" && api.body === '{"ok":false,"error":"Bulunamadı."}', "owner API'si 404 + no-store + genel gövde", api);
      await snap(page, "kapi-kapali-owner-404");
      await ctx.close();
    }
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 5));
    ok(pageErrors.length === 0, `tarayıcı JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    await stopApp(app);
    await proxy?.close?.().catch?.(() => undefined);
    await shim?.close().catch(() => undefined);
    await dbEnv?.stop?.().catch?.(() => undefined);
  }
  console.log(`\nhd-education owner UI e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
