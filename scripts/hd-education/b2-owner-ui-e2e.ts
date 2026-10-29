/**
 * HD Hazır Eğitim Haritaları — FAZ 2-B2 OWNER EKRANI tarayıcı testi (Playwright + `next start`).
 * Tarayıcı → gerçek Next route'ları → PostgREST shim (anamnez testEnv; PostgREST gibi tarih = metin, text[] = dizi) →
 * geçici embedded-postgres (B1 + B2 migration). Veri SENTETİK (ZZ_*);
 * snapshot repo fixture'ından GERÇEK normalizasyon zinciriyle üretilir (scripts/hd-education/syntheticSnapshot.ts) — gerçek
 * kişi haritası DEĞİLDİR. Ücretli sağlayıcı kapısı KAPALI (sunucu dışarı istek atamaz); localhost dışı her tarayıcı isteği abort.
 *
 * Ön koşul — test önüne işaret eden build (gizli değer YOK):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-ds-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-test-service-role-not-a-secret npx next build
 * Çalıştır: npx tsx scripts/hd-education/b2-owner-ui-e2e.ts --out <repo-dışı YENİ boş klasör>
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
const PORT = 3988;
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

async function main() {
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  let testEnv: TestEnv | null = null;
  const external: string[] = [];
  const pageErrors: string[] = [];
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"].map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    testEnv = await startAnamnezTestEnv({
      port: 54449, httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-b2ui-db-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig],
    });
    const su = testEnv.su;
    const q = (sql: string, args: unknown[] = []) => su.query(sql, args);
    const mkUser = async (role: "admin" | "expert", name: string, superAdmin = false) => {
      const id = randomUUID();
      const tenant = randomUUID();
      await q(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',$5,$6,$7,'premium','premium',$8)`,
        [id, name, `zz.b2ui.${id.slice(0, 8)}@example.test`, role, superAdmin, tenant, JSON.stringify(role === "expert" ? { human_design: true } : {}), role === "admin" ? "owner" : null]);
      const token = `zz-b2ui-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, tenant, token, name };
    };
    const owner = await mkUser("admin", "ZZ Owner", true);
    const S1 = randomUUID();
    const S2 = randomUUID();
    await q(`insert into public.hd_education_subjects (id, natural_key, source_ref, display_name, category, is_living, birth_date, birth_place, latitude, longitude, documented_local_time, document_quote, time_standard, utc_offset_seconds, iana_zone, birth_utc, utc_status, legal_status, legal_note, blockers) values
      ($1,'zz-b2ui-bilimci-1869-11-22','ZZ-1','ZZ Sentetik Bilimci','bilim',false,'1869-11-22','ZZ Şehir',48.85,2.35,'03:00 (''ZZ trois heures'')','ZZ sentetik belge ifadesi','ZZ şehir ortalama saati',561,'Europe/Paris','1869-11-22T02:50:39Z','VERIFIED','LOW_UNREVIEWED','[Hukuk incelemesi eksik — avukat teyidi yok] ZZ', array['AVUKAT-GÖRMEDİ','KRALİYET']),
      ($2,'zz-b2ui-bekleyen-1901-02-02','ZZ-2','ZZ Sentetik Bekleyen','sanat',false,'1901-02-02','ZZ Kasaba',45,3,'11:30','ZZ ifade 2',null,null,'Europe/Paris',null,'PENDING_VERIFICATION','E','ZZ', array['UTC-TEYİT','HUKUK-E'])`, [S1, S2]);
    await q(`insert into public.hd_education_sources (subject_id, subject_revision, role, url, institution, document_title, archive_ref, time_explicit, primary_secondary) values ($1,1,'birth_time','https://example.test/zz-belge','ZZ Arşiv','ZZ Doğum Kaydı','ZZ-123',true,'birincil'),($1,1,'utc_standard','https://example.test/zz-tz',null,null,null,null,null)`, [S1]);
    await q(`insert into public.hd_education_publications (subject_id) values ($1),($2)`, [S1, S2]);
    const syn = syntheticEducationSnapshot("1869-11-22T02:50:39Z", 48.85, 2.35, 1);
    await q(`insert into public.hd_education_charts (subject_id, subject_revision, version, request_body, request_hash, provider, endpoint, adapter_version, engine_version, contract_version, computed_result, provider_raw, provider_raw_sha256, design_instant_utc, time_check, boundary_flags, calc_status, created_by)
             values ($1,1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'OK',$15)`,
      [S1, JSON.stringify(syn.request_body), syn.request_hash, syn.provider, syn.endpoint, syn.adapter_version, syn.engine_version, syn.contract_version,
        JSON.stringify(syn.computed_result), JSON.stringify(syn.provider_raw), syn.provider_raw_sha256, syn.design_instant_utc, JSON.stringify(syn.time_check), JSON.stringify(syn.boundary_flags), owner.id]);

    const env: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete env.HD_EDUCATION_PROVIDER_CALLS_ENABLED;
    delete env.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: env as NodeJS.ProcessEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();

    const ctxFor = async (viewport: { width: number; height: number }, mobile = false) => {
      const ctx = await browser!.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: owner.token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: owner.id, tenant_id: owner.tenant, full_name: owner.name, role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(profile), owner.token]);
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== APP) { external.push(url.href); return route.abort(); }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      return { ctx, page };
    };
    const main_ = (page: Page) => page.locator("main").innerText();
    const detailBox = (page: Page) => page.locator("section[aria-label$='ayrıntıları']");
    const modalSave = async (page: Page, fill?: string[]) => {
      const dlg = page.getByRole("dialog");
      await dlg.waitFor();
      const inputs = dlg.locator("input");
      for (let i = 0; i < (fill ?? []).length; i++) await inputs.nth(i).fill(fill![i]);
      await dlg.getByRole("button", { name: "Kaydet" }).click();
      await dlg.waitFor({ state: "detached", timeout: 15_000 });
      await page.waitForTimeout(600);
    };
    const stageText = async (page: Page) => (await detailBox(page).locator("[title='Türetilmiş süreç aşaması']").innerText()).trim();

    section("A. Owner — kişi ayrıntısı + gerçek BodyGraph önizlemesi (masaüstü)");
    {
      const { ctx, page } = await ctxFor({ width: 1440, height: 900 });
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByText("ZZ Sentetik Bilimci").click();
      await detailBox(page).waitFor({ timeout: 20_000 });
      await page.getByText("Önizleme — snapshot v1").waitFor({ timeout: 20_000 });
      const t = await detailBox(page).innerText();
      ok(await stageText(page) === "Doğrulama bekliyor", "aşama: Doğrulama bekliyor", await stageText(page));
      ok(/Yayın kaydı: Taslak/.test(t), "DB yayın kaydı ayrı gösterilir (Taslak)");
      ok(/Gerçek hesaplama çağrısı kapalı/.test(t) && await page.getByRole("button", { name: /Yeniden hesapla|BodyGraph hesapla/ }).isDisabled(), "ücretli çağrı kapalı → hesapla düğmesi pasif + açıklama");
      ok(/modern saat dilimi kuralı kullanılmaz/.test(t) && /\+00:09:21/.test(t), "UTC metodolojisi + saniyeli ofset gösterilir");
      ok(/Doğum saati belgesi/.test(t) && /ZZ Doğum Kaydı/.test(t) && /Saat standardı kanıtı/.test(t), "kaynaklar rolleriyle");
      const svgCount = await detailBox(page).locator("svg").count();
      ok(svgCount > 0 && /2\/4/.test(t), "önizlemede gerçek BodyGraph bileşeni (svg) + profil 2/4 (sentetik fixture)", svgCount);
      ok(/saniyeli UTC · saniye işleme doğrulanmadı/.test(t), "saniye işleme uyarısı");
      // FAZ 19 (P2-h): owner önizlemesinde sağlayıcı satırı / sağlayıcı adı YOK (kişisel HD ekranları değişmez — provider-note-render-check).
      ok(!/Hesaplama kaynağı/.test(t) && !/RoxyAPI|Roxy/i.test(t), "owner önizlemesinde 'Hesaplama kaynağı: …' satırı ve sağlayıcı adı yok");
      // FAZ 19 (P2-b): owner yayın kararı belgenin nasıl görüldüğünü görür (tohumda kayıt yok → açıkça "kayıt yok").
      ok(/Belge nasıl görüldü: kayıt yok/.test(t) && /Doğum saati kaynağı/.test(t), "owner: seen_how satırı + doğum saati kaynak düzeyi");
      await snap(page, "owner-ayrinti-dogrulama-bekliyor");
      await detailBox(page).getByRole("button", { name: "Sonucu doğrula" }).click();
      await page.getByText("Sürüm v1 doğrulandı.").waitFor({ timeout: 15_000 });
      ok(await stageText(page) === "Hesaplandı", "doğrulandı → aşama: Hesaplandı", await stageText(page));
      await detailBox(page).getByRole("button", { name: "Yayın onayı ver…" }).click();
      await modalSave(page, ["HK-ZZ-1"]);
      ok(/Yayın koşulları sağlanmadı/.test(await detailBox(page).innerText()), "hukuk incelemesi yokken onay → DB kilidi mesajı");
      await snap(page, "owner-onay-reddi");
      await detailBox(page).getByRole("button", { name: "Avukat incelemesini kaydet…" }).click();
      await modalSave(page, ["AV-ZZ-2026-001"]);
      const t2 = await detailBox(page).innerText();
      ok(/Düşük · avukat onaylı/.test(t2) && /AV-ZZ-2026-001/.test(t2) && !/Avukat incelemesi yok/.test(t2.split("Engeller")[1] ?? ""), "hukuk inceleme kaydı → LOW_REVIEWED, avukat engeli kalktı");
      ok(await stageText(page) === "Hesaplandı", "kraliyet engeli sürüyor → hâlâ Hesaplandı");
      await detailBox(page).getByRole("button", { name: "Kaldır…" }).click();
      await modalSave(page, ["ZZ marka/onay izlenimi yok — owner değerlendirmesi"]);
      ok(await stageText(page) === "Yayın onayı bekliyor", "engel kalktı → Yayın onayı bekliyor", await stageText(page));
      await detailBox(page).getByRole("button", { name: "Yayın onayı ver…" }).click();
      await modalSave(page, ["HK-ZZ-1", "ZZ not"]);
      ok(await stageText(page) === "Yayına hazır", "onay → Yayına hazır", await stageText(page));
      await snap(page, "owner-yayina-hazir");
      await detailBox(page).getByRole("button", { name: "Yayımla…" }).click();
      await modalSave(page);
      ok(await stageText(page) === "Yayında", "yayın → Yayında");
      await detailBox(page).getByRole("button", { name: "Yayından kaldır…" }).click();
      await modalSave(page, ["ZZ hak sahibi talebi"]);
      const t3 = await detailBox(page).innerText();
      ok(await stageText(page) === "Yayından kaldırıldı" && /Kaldırma gerekçesi: ZZ hak sahibi talebi/.test(t3), "kaldırma → Yayından kaldırıldı + gerekçe");
      ok(/Hesap sonucu doğrulandı/.test(t3) && /Hukuk kaydı güncellendi/.test(t3) && /Yayın durumu değişti/.test(t3), "onay geçmişi olayları");
      await snap(page, "owner-gecmis");
      const inv = await main_(page);
      ok(/Yayından kaldırıldı/.test(inv), "envanter tablosunda süreç sütunu güncellendi");
      await page.getByText("ZZ Sentetik Bekleyen").click();
      await page.getByText("UTC anı doğrulanmadı (teyit bekliyor)").first().waitFor({ timeout: 15_000 });
      ok(await page.getByRole("button", { name: "BodyGraph hesapla" }).isDisabled(), "UTC bekleyen kişi: hesapla pasif + neden");
      ok(/Henüz hesap yok/.test(await detailBox(page).innerText()), "hesapsız kişide 'Hesaplandı' gösterilmez");
      await ctx.close();
    }

    for (const vp of [{ name: "tablet", width: 820, height: 1180 }, { name: "mobil", width: 390, height: 844 }]) {
      section(`B. Owner ayrıntısı — ${vp.name}`);
      const { ctx, page } = await ctxFor(vp, true);
      await page.goto(PAGE, { waitUntil: "networkidle" });
      await page.getByText("ZZ Sentetik Bilimci").click();
      await page.getByText("Önizleme — snapshot v1").waitFor({ timeout: 20_000 });
      const noH = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(noH, `${vp.name}: yatay sayfa taşması yok`);
      await snap(page, `owner-ayrinti-${vp.name}`);
      await ctx.close();
    }
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 5));
    ok(pageErrors.length === 0, `tarayıcı JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 1500));
    await testEnv?.stop().catch(() => undefined);
  }
  console.log(`\nhd-education B2 owner UI e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
