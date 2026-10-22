/**
 * HD Hazır Eğitim Haritaları — FAZ 2-B3 EĞİTMEN EKRANLARI tarayıcı testi (Playwright + `next start`, GERÇEK Next uygulaması).
 * Tarayıcı → gerçek Next route'ları → PostgREST shim → geçici embedded-postgres (B1 + B2 migration). Veri SENTETİK (ZZ_*);
 * snapshot repo fixture'ından gerçek normalizasyon zinciriyle üretilir (syntheticSnapshot.ts) — gerçek kişi haritası DEĞİLDİR.
 * Ücretli sağlayıcı kapısı KAPALI; localhost dışı her tarayıcı isteği abort edilir ve sayılır.
 *
 * Ön koşul — test önüne işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/b3-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { syntheticEducationSnapshot } from "./syntheticSnapshot";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "";
if (!OUT) throw new Error("--out <repo-dışı yeni klasör> zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length > 0) throw new Error(`çıktı klasörü boş değil (üzerine yazılmaz): ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3989;
const APP = `http://127.0.0.1:${PORT}`;
const HUB = `${APP}/human-design`;
const CAT = `${APP}/human-design/egitim-haritalari`;

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
const VPS = [
  { name: "masaustu", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1180, mobile: true },
  { name: "mobil", width: 390, height: 844, mobile: true },
] as const;

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let testEnv: TestEnv | null = null;
  const external: string[] = [];
  const pageErrors: string[] = [];
  let providerReq = 0;
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"].map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    testEnv = await startAnamnezTestEnv({
      port: 54451, httpPort: 54398, dirName: `hd-edu-b3ui-db-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig],
    });
    const su = testEnv.su;
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const tenant = randomUUID();
    await q(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
    type U = { id: string; token: string; name: string; role: "admin" | "expert" };
    const mkUser = async (role: "admin" | "expert", name: string, superAdmin = false): Promise<U> => {
      const id = randomUUID();
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.b3ui.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "owner" : null]);
      const token = `zz-b3ui-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role };
    };
    const owner = await mkUser("admin", "ZZ Owner", true);
    const admin = await mkUser("admin", "ZZ Normal Admin");
    const trainer = await mkUser("expert", "ZZ Yetkili Eğitmen");
    const expert = await mkUser("expert", "ZZ Yetkisiz Uzman");
    await q(`select public.hd_education_grant_access($1,$2,$3)`, [owner.id, trainer.id, "ZZ test"]);

    // Sentetik kişiler: iki farklı kategori + uzun ad. Yayın, DB tetikleyicilerinin istediği sırayla (doğrula → hukuk → onay → yayın).
    const subjects: Array<{ id: string; name: string; cat: string }> = [];
    const mkSubject = async (name: string, cat: string, date: string, local: string, utc: string, offset: number) => {
      const id = randomUUID();
      await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude,
                 documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, legal_note, blockers)
               values ($1,$2,'ZZ',$3,$4,false,$5,'ZZ Şehir',48.85,2.35,$6,'ZZ sentetik belge ifadesi','ZZ şehir ortalama saati',$7,'Europe/Paris',$8,'VERIFIED','LOW_UNREVIEWED','ZZ',array['AVUKAT-GÖRMEDİ'])`,
        [id, `zz-b3ui-${id.slice(0, 8)}-${date}`, name, cat, date, local, offset, utc]);
      await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, time_explicit, primary_secondary)
               values ($1,1,'birth_time','https://example.test/zz-belge','ZZ Arşiv','ZZ Doğum Kaydı','ZZ-123',true,'birincil')`, [id]);
      await q(`insert into public.hd_education_publications (subject_id) values ($1)`, [id]);
      const syn = syntheticEducationSnapshot(utc, 48.85, 2.35, 1);
      const ch = (await q(`insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version, computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, created_by)
               values ($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OK',$15) returning id`,
        [id, JSON.stringify(syn.request_body), syn.request_hash, syn.provider, syn.endpoint, syn.adapter_version, syn.engine_version, syn.contract_version,
          JSON.stringify(syn.computed_result), JSON.stringify(syn.provider_raw), syn.provider_raw_sha256, syn.design_instant_utc, JSON.stringify(syn.time_check), JSON.stringify(syn.boundary_flags), owner.id])).rows[0].id as string;
      subjects.push({ id, name, cat });
      return { id, chartId: ch };
    };
    const publishSql = async (s: { id: string; chartId: string }) => {
      await q(`update public.hd_education_publications set chart_id=$2, chart_verified_by=$3, chart_verified_at=now() where subject_id=$1`, [s.id, s.chartId, owner.id]);
      await q(`update public.hd_education_subjects set legal_status='LOW_REVIEWED', legal_reviewed_by=$2, legal_reviewed_at=now(), legal_review_ref='AV-ZZ-UI', blockers='{}' where id=$1`, [s.id, owner.id]);
      await q(`update public.hd_education_publications set status='approved', approved_by=$2, approved_at=now(), legal_clearance_ref='HK-ZZ-UI', updated_by=$2 where subject_id=$1`, [s.id, owner.id]);
      await q(`update public.hd_education_publications set status='published', updated_by=$2 where subject_id=$1`, [s.id, owner.id]);
    };
    const S1 = await mkSubject("ZZ Sentetik Bilimci", "bilim", "1869-11-22", "03:00", "1869-11-22T02:50:39Z", 561);
    const S2 = await mkSubject("ZZ Sentetik Besteci Çok Uzun Ad Soyad Taşma Denemesi von Beispielhausen", "muzik", "1901-05-05", "10:00", "1901-05-05T09:00:00Z", 3600);
    const S3 = await mkSubject("ZZ Sentetik Taslak (yayımlanmaz)", "tarih", "1902-01-01", "10:00", "1902-01-01T09:00:00Z", 3600);

    const countAll = async () => new Map(((await q(`select c.relname as t, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text::int as n
        from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`)).rows as Array<{ t: string; n: number }>).map((r) => [r.t, r.n]));
    const env: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete env.HD_EDUCATION_PROVIDER_CALLS_ENABLED;
    delete env.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (u: U, vp: { width: number; height: number; mobile: boolean }) => {
      const ctx = await browser!.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: "tr-TR", timezoneId: "America/Los_Angeles" });
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
      return { ctx, page };
    };
    const noHScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const text = (page: Page) => page.locator("body").innerText();
    /** HD girişi: kart yoklamasının yanıtını bekle (kart yalnız 200'de çizilir). */
    const gotoHub = async (page: Page) => {
      const probe = page.waitForResponse((r) => r.url().includes("/api/hd/education/access"), { timeout: 30_000 });
      await page.goto(HUB, { waitUntil: "load" });
      const r = await probe;
      await page.waitForTimeout(500);
      return r.status();
    };
    /** Bulunamadı / giriş ekranı gelene kadar bekle (sonuç ayrıca doğrulanır). */
    const settle = async (page: Page) => { await page.getByText(/Sayfa bulunamadı|Giriş|Yetkiniz/).first().waitFor({ timeout: 20_000 }).catch(() => undefined); };
    const hubCardCount = (page: Page) => page.locator("[data-hd-hub] a[href='/human-design/egitim-haritalari']").count();

    section("A. Boş katalog (yayın yok) — yetkili eğitmen");
    {
      const { ctx, page } = await ctxFor(trainer, VPS[0]);
      await page.goto(CAT, { waitUntil: "load" });
      await page.getByText(/Henüz yayımlanmış|Sayfa bulunamadı/).first().waitFor({ timeout: 20_000 });
      const t = await text(page);
      ok(/Henüz yayımlanmış eğitim haritası yok/.test(t) && !/ZZ Sentetik/.test(t), "yayın yok → boş katalog mesajı, sahte kart yok");
      await snap(page, "katalog-bos-masaustu");
      await ctx.close();
    }
    await publishSql(S1);
    await publishSql(S2);
    const before = await countAll();

    for (const vp of VPS) {
      section(`B. Yetkili eğitmen — ${vp.name}`);
      const { ctx, page } = await ctxFor(trainer, vp);
      ok(await gotoHub(page) === 200, `${vp.name}: kart yoklaması 200`);
      await page.locator("[data-hd-hub] a[href='/human-design/egitim-haritalari']").waitFor({ timeout: 20_000 });
      const hubT = await text(page);
      ok(await hubCardCount(page) === 1 && /Hazır Eğitim Haritaları/.test(hubT), `${vp.name}: HD girişinde kart görünür`);
      ok(/Human Design Hesaplama/.test(hubT) && /İlişki ve Grup Analizleri/.test(hubT) && /Günün ve Kişisel Transitleri/.test(hubT), `${vp.name}: mevcut kartlar aynen duruyor`);
      ok(await noHScroll(page), `${vp.name}: HD giriş yatay taşma yok`);
      await snap(page, `hd-giris-yetkili-${vp.name}`);

      await page.locator("[data-hd-hub] a[href='/human-design/egitim-haritalari']").click();
      await page.getByRole("heading", { name: "Hazır Eğitim Haritaları" }).waitFor({ timeout: 20_000 });
      await page.getByText("ZZ Sentetik Bilimci").waitFor({ timeout: 20_000 });
      const catT = await text(page);
      ok(/ZZ Sentetik Bilimci/.test(catT) && /von Beispielhausen/.test(catT) && !/Taslak \(yayımlanmaz\)/.test(catT), `${vp.name}: yalnız yayımlı 2 kayıt (taslak yok)`);
      ok(/22\.11\.1869/.test(catT) && !/21\.11\.1869/.test(catT), `${vp.name}: takvim tarihi kaymıyor (Los Angeles saat diliminde de 22.11.1869)`);
      ok(/2 \/ 2 yayımlı eğitim haritası/.test(catT), `${vp.name}: yayımlı kayıt sayısı`);
      ok(await noHScroll(page), `${vp.name}: katalog yatay taşma yok (uzun ad)`);
      await snap(page, `katalog-${vp.name}`);
      if (vp.name === "masaustu") {
        await page.getByLabel("İsimle ara").fill("besteci");
        ok(/von Beispielhausen/.test(await text(page)) && !/ZZ Sentetik Bilimci/.test(await text(page)), "arama süzer");
        await page.getByLabel("İsimle ara").fill("yokboyle");
        ok(/Aramanızla eşleşen harita yok/.test(await text(page)), "eşleşmeyen arama mesajı");
        await page.getByLabel("İsimle ara").fill("");
        await page.getByRole("button", { name: "Müzik" }).click();
        ok(/von Beispielhausen/.test(await text(page)) && !/ZZ Sentetik Bilimci/.test(await text(page)), "kategori filtresi");
        await page.getByRole("button", { name: "Tümü" }).click();
      }

      await page.locator(`a[href='/human-design/egitim-haritalari/${S1.id}']`).click();
      await page.waitForURL(`**/egitim-haritalari/${S1.id}`, { timeout: 20_000 });
      await page.locator("#edu-detail-title").waitFor({ timeout: 20_000 });
      await page.locator("section[aria-label='BodyGraph ve harita bilgileri'] svg").first().waitFor({ timeout: 20_000 });
      const dT = await text(page);
      const svgs = await page.locator("section[aria-label='BodyGraph ve harita bilgileri'] svg").count();
      ok(svgs > 0 && /2\/4/.test(dT) && /Jeneratör|Generator/.test(dT), `${vp.name}: gerçek BodyGraph bileşeni (svg) + Tip/Profil`, svgs);
      ok(/MERKEZLER/i.test(dT) && /TANIMLI KANALLAR/i.test(dT) && /AKTİF KAPILAR/i.test(dT), `${vp.name}: merkezler / kanallar / kapılar`);
      ok(/1869-11-22T02:50:39Z/.test(dT) && /\+00:09:21/.test(dT) && /modern saat dilimi kuralı kullanılmaz/.test(dT), `${vp.name}: UTC + ofset + metodoloji`);
      ok(/ZZ Arşiv/.test(dT) && /Eğitim amaçlıdır/.test(dT) && /yeniden hesaplama yapılmaz/.test(dT), `${vp.name}: kaynak + eğitim bilgisi + yeniden hesap yok`);
      ok(/22\.11\.1869/.test(dT), `${vp.name}: ayrıntıda takvim tarihi doğru`);
      ok(!/Hesaplama kaynağı/.test(dT) && !/RoxyAPI|Roxy/i.test(dT), `${vp.name}: eğitmen ekranında sağlayıcı notu / Roxy adı YOK (owner kararı)`);
      ok(await noHScroll(page), `${vp.name}: ayrıntı yatay sayfa taşması yok`);
      const link = page.locator("a[href='https://example.test/zz-belge']");
      ok(await link.getAttribute("target") === "_blank" && /noopener/.test((await link.getAttribute("rel")) ?? ""), `${vp.name}: kaynak bağlantısı yeni sekme + noopener`);
      await snap(page, `ayrinti-${vp.name}`);
      await ctx.close();
    }

    section("C. Hatalı kimlik / yayımlanmamış kayıt — yetkili eğitmen");
    {
      const { ctx, page } = await ctxFor(trainer, VPS[0]);
      for (const [label, id] of [["taslak", S3.id], ["rastgele", randomUUID()], ["uuid değil", "abc"]] as const) {
        await page.goto(`${CAT}/${id}`, { waitUntil: "load" });
        await settle(page);
        const t = await text(page);
        ok(/Sayfa bulunamadı/.test(t) && !/ZZ Sentetik/.test(t), `ayrıntı bulunamadı: ${label}`);
      }
      await snap(page, "ayrinti-bulunamadi");
      await ctx.close();
    }

    for (const [label, u] of [["yetkisiz uzman", expert], ["normal admin", admin], ["owner", owner]] as const) {
      section(`D. ${label} — HD giriş + doğrudan URL`);
      const { ctx, page } = await ctxFor(u, VPS[0]);
      if (u.role === "expert") {
        const st = await gotoHub(page);
        ok(st === 404 && await hubCardCount(page) === 0 && !/Hazır Eğitim Haritaları/.test(await text(page)), `${label}: HD girişinde kart YOK`);
        await snap(page, `hd-giris-${label.replace(/\s/g, "-")}`);
      }
      for (const url of [CAT, `${CAT}/${S1.id}`]) {
        await page.goto(url, { waitUntil: "load" });
        await settle(page);
        const t = await text(page);
        ok(!/ZZ Sentetik/.test(t) && !/Hazır Eğitim Haritaları/.test(t) && (/Sayfa bulunamadı|404|bulunamadı/i.test(t) || /Giriş/.test(t)), `${label}: doğrudan URL içerik/özellik adı sızdırmaz (${url.endsWith(S1.id) ? "ayrıntı" : "katalog"})`, t.slice(0, 160));
      }
      if (u.role === "expert") await snap(page, `dogrudan-url-${label.replace(/\s/g, "-")}`);
      await ctx.close();
    }

    section("E. Yetki iptali — açık oturumdaki eğitmen");
    {
      const { ctx, page } = await ctxFor(trainer, VPS[0]);
      await page.goto(`${CAT}/${S1.id}`, { waitUntil: "load" });
      await page.locator("#edu-detail-title").waitFor({ timeout: 20_000 });
      await q(`select public.hd_education_revoke_access($1,$2,'owner_revoked')`, [owner.id, trainer.id]);
      await page.reload({ waitUntil: "load" });
      await settle(page);
      ok(/Sayfa bulunamadı/.test(await text(page)) && !/ZZ Sentetik/.test(await text(page)), "iptal sonrası yenileme: ayrıntı bulunamadı");
      ok(await gotoHub(page) === 404 && await hubCardCount(page) === 0, "iptal sonrası HD girişinde kart yok");
      await page.goto(CAT, { waitUntil: "load" });
      await settle(page);
      ok(/Sayfa bulunamadı/.test(await text(page)), "iptal sonrası katalog bulunamadı");
      await snap(page, "iptal-sonrasi-katalog");
      await ctx.close();
    }

    const charts = Number((await q(`select count(*)::int n from public.hd_education_charts`)).rows[0].n);
    ok(charts === 3, "yeni snapshot üretilmedi", charts);
    // Eğitmen ekranları yalnız okur: yetki iptali (grants + audit) dışında HİÇBİR tabloda satır sayısı değişmemeli.
    const after = await countAll();
    const changed = [...after.entries()].filter(([t, n]) => before.get(t) !== n).map(([t]) => t).filter((t) => !["hd_education_access_grants", "hd_education_audit_events"].includes(t));
    ok(changed.length === 0, "eğitmen gezintisi: danışan / HD / YH / snapshot dahil hiçbir tabloda yeni satır yok", changed);
    ok(providerReq === 0, `tarayıcıdan hesaplama/sağlayıcı isteği 0 (${providerReq})`);
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 5));
    ok(pageErrors.length === 0, `tarayıcı JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 1500));
    await testEnv?.stop().catch(() => undefined);
  }
  console.log(`\nhd-education B3 UI e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
