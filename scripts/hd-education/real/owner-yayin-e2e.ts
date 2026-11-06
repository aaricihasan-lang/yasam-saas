/**
 * HD Eğitim Merkezi — OWNER KONTROLLÜ YAYIN (31.10.2026) uçtan uca kanıt, GERÇEK 50 kişilik paket + 50 biyografi.
 * Gerçek Next uygulaması (`next start`) + İZOLE embedded-postgres + migration 20271220000000 (owner kontrol katmanı).
 * Ortam değişkeni YOK (production eşdeğeri): kapılar owner'ın DB anahtarlarıdır. Production'a HİÇBİR istek yok.
 *
 * PASS kriteri (owner talimatı §7): hukuki görüş tamamlanmış kabul edilen bu İZOLE kopyada owner YALNIZ PANELİ kullanarak
 * 5 yaşayan kişiyi kapsam dışı bırakır (silme yok) → kişi yayını (hukuk kaydı, teknik kanıt, engel, snapshot, onay, yayın)
 * → biyografi incelemesi + yayını → uzman yetkisi → global katalog açılışı → uzman görür → katalog kapatma / yetki geri alma
 * / yayından kaldırma ile erişimi yeniden kapatır. Ayrıca DB düzeyi: RLS, yetkiler, owner RPC kontrolü, append-only geçmiş,
 * kapsam dışı yayın kilidi; veri bütünlüğü (50 kayıt korunur, yalnız 45 aktif).
 * Çalıştır: npx tsx scripts/hd-education/real/owner-yayin-e2e.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket> --out <yeni klasör>
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { restoreSnapshotFile } from "./snapshot-io";
import { bioImportSql, loadBioDir } from "../biography/bioImport";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = Number(process.env.HD_EDU_YAYIN_PORT ?? 3994), APP = `http://127.0.0.1:${PORT}`;
const LIST = `${APP}/admin/hd-egitim-haritalari`, CAT = `${APP}/human-design/egitim-haritalari`;
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string, full = true) => { await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`), fullPage: full }); };
async function waitHttp(url: string, ms: number) { const u = Date.now() + ms; while (Date.now() < u) { try { if ((await fetch(url)).status < 500) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error("zaman aşımı"); }
const LIVING = ["tarkan-1972-10-17", "aras-oren-1939-11-01", "angelina-jolie-1975-06-04", "barack-obama-1961-08-04", "donald-j-trump-1946-06-14"];
const LIVING_NAMES = /Tarkan|Aras Ören|Angelina Jolie|Barack Obama|Donald J\. Trump/;
const OWNER_FIELDS = /legalStatus|legal_status|legalNote|legalReview|blockers|checklist|approvedAt|legalClearance|naturalKey|natural_key|publicationStatus|archived|TEST-YEREL/;
type U = { id: string; token: string; name: string; role: "admin" | "expert" };

async function main() {
  let app: ChildProcess | null = null; let browser: Browser | null = null; let env: TestEnv | null = null;
  const external: string[] = []; const pageErrors: string[] = []; let providerReq = 0;
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql",
      "20271206000200_hd_education_biographies.sql", "20271220000000_hd_education_owner_controls.sql"].map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    env = await startAnamnezTestEnv({ port: 54477, httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-yayin-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible", "hd_education_set_catalog_open", "hd_education_set_subject_scope"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig] });
    const su = env.su;
    const q = (sql: string, a: unknown[] = []) => su.query(sql, a);
    // Yalnız TEST şeması: Admin → Üye ayrıntısı kolonları (private/ui-e2e.ts ile aynı; ürün şeması DEĞİŞMEZ).
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
    const ownerTok = `zz-yayin-${randomUUID()}`;
    await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, ownerTok]);
    const owner: U = { id: OWNER, token: ownerTok, name: "Yerel Owner", role: "admin" };
    const mkUser = async (role: "admin" | "expert", name: string): Promise<U> => {
      const id = randomUUID();
      await q(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, module_permissions, package_type, plan, admin_level)
               values ($1,$2,$3,$4,true,'approved',false,$5,$6,'premium','premium',$7)`,
        [id, name, `zz.yayin.${id.slice(0, 8)}@example.test`, role, tenant, JSON.stringify(role === "expert" ? { human_design: true, clients: true } : {}), role === "admin" ? "admin" : null]);
      const token = `zz-yayin-${randomUUID()}`;
      await q(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [id, token]);
      return { id, token, name, role };
    };
    const admin = await mkUser("admin", "ZZ Normal Admin");
    const e1 = await mkUser("expert", "ZZ Uzman Bir");
    const e2 = await mkUser("expert", "ZZ Uzman İki (yetkisiz)");
    await q(readFileSync(LOCALKEY, "utf8"));
    await q(readFileSync(IMPORT, "utf8"));
    for (const m of readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string })) {
      const r = await restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256);
      if (r !== "RESTORED") ok(false, `snapshot geri yükleme: ${m.natural_key}`, r);
    }
    const bios = loadBioDir(path.join(PKG, "biyografiler"));
    await q(bioImportSql(bios.files));
    const idOf = new Map((await q(`select id, natural_key from public.hd_education_subjects`)).rows.map((r: { id: string; natural_key: string }) => [r.natural_key, r.id]));
    const K = { marie: "marie-curie-1867-11-07", irene: "irene-joliot-curie-1897-09-12", hugo: "victor-hugo-1802-02-26", anne: "anne-frank-1929-06-12" };
    // Bütünlük özeti: doğum kanıtı + UTC + revizyon + hesap sonucu + kaynaklar + biyografi İÇERİĞİ (yayın / inceleme durumları HARİÇ).
    const digest = async () => (await q(`select
        (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c,
        (select count(*) from public.hd_education_sources)::int src, (select count(*) from public.hd_education_biographies)::int b,
        (select md5(string_agg(concat_ws('|', natural_key, birth_date, documented_local_time, document_quote, coalesce(calendar_note,''), coalesce(time_standard,''),
           coalesce(utc_offset_seconds::text,''), coalesce(birth_utc::text,''), utc_status, revision, is_living), ',' order by natural_key)) from public.hd_education_subjects) ev,
        (select md5(string_agg(concat_ws('|', subject_id, version, md5(computed_result::text), provider_raw_sha256), ',' order by subject_id, version)) from public.hd_education_charts) ch,
        (select md5(string_agg(concat_ws('|', subject_id, role, url), ',' order by subject_id, role, url)) from public.hd_education_sources) sr,
        (select md5(string_agg(concat_ws('|', person_key, lang, md5(sections::text), md5(sources::text), md5(timeline::text)), ',' order by person_key, lang)) from public.hd_education_biographies) bio`)).rows[0] as Record<string, unknown>;
    const d0 = await digest();
    ok(d0.s === 50 && d0.c === 50 && d0.b === 50, "başlangıç: 50 kişi + 50 snapshot + 50 biyografi", d0);

    section("0. DB düzeyi — yeni yönetim katmanı");
    const rls = (await q(`select relname, relrowsecurity from pg_class where relname in ('hd_education_catalog_control','hd_education_subject_scope','hd_education_control_events') order by 1`)).rows as Array<{ relname: string; relrowsecurity: boolean }>;
    ok(rls.length === 3 && rls.every((r) => r.relrowsecurity), "3 yeni tabloda RLS açık", rls);
    const pubGrants = Number((await q(`select count(*)::int n from information_schema.role_table_grants where table_name in ('hd_education_catalog_control','hd_education_subject_scope','hd_education_control_events') and grantee in ('anon','authenticated','PUBLIC')`)).rows[0].n);
    ok(pubGrants === 0, "anon / authenticated / PUBLIC tablo yetkisi 0", pubGrants);
    for (const t of ["hd_education_catalog_control", "hd_education_subject_scope", "hd_education_control_events"]) {
      let msg = ""; try { await q(`BEGIN; SET LOCAL ROLE service_role; UPDATE public.${t} SET reason = reason WHERE false; COMMIT;`); } catch (e) { msg = String((e as Error).message); await q("ROLLBACK").catch(() => undefined); }
      ok(/permission denied/i.test(msg), `service_role ${t} doğrudan yazamaz (yalnız RPC)`, msg);
    }
    let rpcMsg = ""; try { await q(`select public.hd_education_set_catalog_open($1, true, 'normal admin denemesi')`, [admin.id]); } catch (e) { rpcMsg = String((e as Error).message); }
    ok(/yetkisiz aktör/.test(rpcMsg), "RPC: owner olmayan aktör kataloğu açamaz", rpcMsg);
    ok((await q(`select catalog_open from public.hd_education_catalog_control where id=1`)).rows[0].catalog_open === false, "katalog anahtarı varsayılan KAPALI");

    const startApp = async () => {
      const appEnv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
      delete appEnv.HD_EDUCATION_CATALOG_ENABLED; delete appEnv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete appEnv.HD_PRIVATE_EDUCATION_ENABLED; delete appEnv.ROXY_API_KEY;
      app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv as NodeJS.ProcessEnv, stdio: "ignore" });
      await waitHttp(`${APP}/`, 180_000);
    };
    await startApp();
    browser = await chromium.launch();
    const ctxFor = async (u: U, vp: { w: number; h: number; m: boolean } = { w: 1440, h: 900, m: false }) => {
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
      return { ctx, page };
    };
    const api = async (u: U, p: string, body?: unknown, as: "admin" | "user" = u.role === "admin" ? "admin" : "user") => {
      const h: Record<string, string> = { "x-session-token": u.token, cookie: `yasam_admin_session=${u.token}` };
      h[as === "admin" ? "x-admin-id" : "x-user-id"] = u.id;
      if (body !== undefined) h["Content-Type"] = "application/json";
      const r = await fetch(`${APP}${p}`, { method: body === undefined ? "GET" : "POST", headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await r.text();
      let json: Record<string, unknown> | null = null; try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* */ }
      return { status: r.status, text, json };
    };
    const noH = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const count = (key: string) => (page: Page) => page.locator(`[data-edu-count='${key}'] b`).innerText();
    const modalSave = async (page: Page, fill: string[] = [], button = /Kaydet|Kapsam dışına al|Kapsama geri al/) => {
      const dlg = page.getByRole("dialog"); await dlg.waitFor();
      const inputs = dlg.locator("input"); for (let i = 0; i < fill.length; i++) await inputs.nth(i).fill(fill[i]);
      await dlg.getByRole("button", { name: button }).last().click();
      await dlg.waitFor({ state: "detached", timeout: 20_000 });
    };
    const { ctx: oc, page: op } = await ctxFor(owner);

    section("1. Owner açılış paneli — başlangıç");
    await op.goto(LIST, { waitUntil: "load" });
    await op.locator("[data-edu-control-stats]").waitFor({ timeout: 30_000 });
    ok(await op.locator("[data-edu-catalog-state='closed']").count() === 1 && await count("active")(op) === "50" && await count("grants")(op) === "0" && await count("published")(op) === "0",
      "panel: katalog KAPALI · 50 aktif · 0 yetkili uzman · 0 yayın");
    const notes0 = await op.locator("[data-edu-control-notes]").innerText();
    ok(/Yayımlanmış ve uzmanlara açık kişi yok/.test(notes0) && /Yetkili uzman yok/.test(notes0), "panel neden boş kalacağını açıkça yazar", notes0);
    await snap(op, "01-owner-acilis-paneli-baslangic", false);

    section("2. 5 yaşayan kişi panelden kapsam dışı (silme yok)");
    for (const key of LIVING) {
      await op.goto(`${LIST}/kisi/${idOf.get(key)}`, { waitUntil: "load" });
      await op.locator("[data-edu-scope-toggle]").waitFor({ timeout: 30_000 });
      await op.locator("[data-edu-scope-toggle]").click();
      await modalSave(op, ["Yaşayan kişi — owner kararı 31.10.2026"], /Kaydet/);
      await op.locator("[data-edu-scope-banner]").waitFor({ timeout: 20_000 });
    }
    ok(Number((await q(`select count(*)::int n from public.hd_education_subject_scope`)).rows[0].n) === 5, "DB: 5 kapsam dışı kaydı");
    ok(Number((await q(`select count(*)::int n from public.hd_education_control_events where action='subject_archived'`)).rows[0].n) === 5, "DB: 5 değiştirilemez 'subject_archived' olayı");
    ok(Number((await q(`select count(*)::int n from public.hd_education_subjects`)).rows[0].n) === 50, "DB: 50 kişi kaydı yerinde (fiziksel silme YOK)");
    ok(await op.getByRole("button", { name: "Yayın onayı ver…" }).isDisabled() && /aktif envantere geri alınmalı/.test(await op.locator("[data-edu-approve-missing]").innerText()),
      "kapsam dışı kişide 'Yayın onayı ver' pasif + neden yazılı");
    await snap(op, "02-kisi-kapsam-disi", false);
    await op.goto(LIST, { waitUntil: "load" });
    await op.locator("tbody tr[data-edu-row]").first().waitFor({ timeout: 30_000 });
    await op.locator("[data-edu-archived]").waitFor({ timeout: 20_000 });
    const listText = await op.locator("table").innerText();
    ok((await op.locator("tbody tr").count()) === 45 && !LIVING_NAMES.test(listText), "aktif liste 45 kişi; kapsam dışı 5 kişi listede yok");
    ok(await count("active")(op) === "45" && await count("archived")(op) === "5", "panel: 45 aktif · 5 kapsam dışı");
    ok(await op.locator("[data-edu-archived-row]").count() === 5, "Kapsam Dışı Kişiler bölümünde 5 kişi");
    const fams = await op.locator("[data-edu-family]").evaluateAll((els) => els.map((e) => e.getAttribute("data-edu-family")));
    ok(JSON.stringify(fams) === JSON.stringify(["curie", "frank", "kraliyet-kardesler"]), "aile kartları kalan kişilerle aynen", fams);
    // Geri alma: Tarkan aktif envantere döner, sonra yeniden kapsam dışı.
    await op.locator(`[data-edu-restore='${idOf.get("tarkan-1972-10-17")}']`).click();
    await modalSave(op, ["Geri alma denemesi (izole test)"], /Kapsama geri al/);
    await op.waitForFunction(() => document.querySelector("[data-edu-count='active'] b")?.textContent === "46", null, { timeout: 20_000 });
    ok(Number((await q(`select count(*)::int n from public.hd_education_subject_scope`)).rows[0].n) === 4, "geri alma: kişi aktif envantere döndü (46)");
    await op.goto(`${LIST}/kisi/${idOf.get("tarkan-1972-10-17")}`, { waitUntil: "load" });
    await op.locator("[data-edu-scope-toggle]").click();
    await modalSave(op, ["Yaşayan kişi — owner kararı 31.10.2026"], /Kaydet/);
    await op.locator("[data-edu-scope-banner]").waitFor({ timeout: 20_000 });
    await op.goto(LIST, { waitUntil: "load" });
    await op.locator("[data-edu-archived]").scrollIntoViewIfNeeded();
    ok(await count("active")(op) === "45", "yeniden kapsam dışı: 45 aktif");
    await snap(op, "03-owner-liste-45-kapsam-disi-5", true);

    section("3. Uzman yetkisi (Modül İzinleri) — katalog kapalıyken içerik yok");
    await op.goto(`${APP}/admin/users/${e1.id}#uye-erisim`, { waitUntil: "load" });
    await op.locator("[data-hd-edu-access-switch]").waitFor({ timeout: 60_000 });
    ok(await op.locator("[data-hd-edu-access-gate='closed']").count() === 1, "anahtar: 'Uzman erişimi kapalı' notu (katalog kapalı)");
    await op.locator("[data-hd-edu-access-switch]").click();
    await op.waitForSelector("[data-hd-edu-access-switch][aria-checked='true']", { timeout: 20_000 });
    ok(Number((await q(`select count(*)::int n from public.hd_education_access_grants where user_id=$1 and revoked_at is null`, [e1.id])).rows[0].n) === 1, "uzman 1'e yetki verildi (DB)");
    for (const p of ["/api/hd/education/access", "/api/hd/education/charts"]) ok((await api(e1, p)).status === 404, `katalog kapalı: yetkili uzman ${p} → 404`);

    section("4. Hukuk sonrası kişi yayını — YALNIZ panel (izole kopya)");
    const birthOf = async (id: string) => (await q(`select to_char(birth_date,'DD.MM.YYYY') bd, to_char(birth_utc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI') bu from public.hd_education_subjects where id=$1`, [id])).rows[0] as { bd: string; bu: string };
    const publishViaUi = async (key: string) => {
      const id = idOf.get(key)!;
      await op.goto(`${LIST}/kisi/${id}`, { waitUntil: "load" });
      const box = op.locator("section[aria-label$='ayrıntıları']");
      await box.waitFor({ timeout: 30_000 });
      if (await box.getByRole("button", { name: "Avukat incelemesini kaydet…" }).count()) {
        await box.getByRole("button", { name: "Avukat incelemesini kaydet…" }).click();
        await modalSave(op, ["TEST-YEREL-KOPYA hukuki görüş no 1"]);
      }
      for (let i = 0; i < 6; i++) {
        const v = box.locator("[data-edu-verify-blocker]").first();
        if (await v.count()) {
          const b = await v.getAttribute("data-edu-verify-blocker"); const bb = await birthOf(id);
          await v.click(); await modalSave(op, [b === "TAKVİM" ? bb.bd : bb.bu, "TEST-YEREL-KOPYA kanıt teyidi"]);
          continue;
        }
        const c = box.getByRole("button", { name: "Kaldır…" }).first();
        if (await c.count()) { await c.click(); await modalSave(op, ["TEST-YEREL-KOPYA engel değerlendirmesi"]); continue; }
        break;
      }
      if (await box.getByRole("button", { name: "Sonucu doğrula" }).count()) {
        await box.getByRole("button", { name: "Sonucu doğrula" }).click();
        await op.getByText(/Sürüm v\d+ doğrulandı\./).first().waitFor({ timeout: 15_000 });
      }
      await box.getByRole("button", { name: "Yayın onayı ver…" }).click();
      await modalSave(op, ["TEST-YEREL-KOPYA hukuki izin", "izole test"]);
      await box.getByRole("button", { name: "Yayımla…" }).click();
      await modalSave(op);
      return (await q(`select status from public.hd_education_publications where subject_id=$1`, [id])).rows[0].status as string;
    };
    for (const k of [K.marie, K.irene, K.hugo]) ok(await publishViaUi(k) === "published", `${k}: avukat kaydı → teknik kanıt → engel → snapshot → onay → yayın (yalnız panel)`);
    await snap(op, "04-kisi-yayinda", false);
    // Kapsam dışı yayın kilidi (DB) + yayımlı kişi kapsam dışına alınamaz.
    const sc = await api(owner, "/api/admin/hd/education/control", { action: "scope", subjectId: idOf.get(K.marie), archived: true, reason: "yayımlı kişi denemesi" });
    ok(sc.status === 409, "yayımlı kişi önce yayından kaldırılmadan kapsam dışına alınamaz (409)", sc.status);
    let gm = ""; try { await q(`BEGIN; INSERT INTO public.hd_education_subject_scope(subject_id, archived_by, reason) VALUES ($1,$2,'kilit denemesi'); UPDATE public.hd_education_publications SET updated_by=$2 WHERE subject_id=$1; COMMIT;`.replace(/\$1/g, `'${idOf.get(K.marie)}'`).replace(/\$2/g, `'${OWNER}'`)); } catch (e) { gm = String((e as Error).message); await q("ROLLBACK").catch(() => undefined); }
    ok(/kapsam dışı kişi onaylanamaz/.test(gm), "DB kilidi: kapsam dışı kişi 'published' kalamaz", gm);
    const ap = await api(owner, `/api/admin/hd/education/subjects/${idOf.get(K.anne)}`, { action: "approve", legalClearanceRef: "TEST-YEREL-KOPYA" });
    ok(ap.status === 409, "hukuki inceleme kaydı olmayan kişi onaylanamaz (ön koşul atlanamaz)", ap.status);

    section("5. Biyografi incelemesi + yayını — YALNIZ panel");
    const bioKey = (await q(`select person_key from public.hd_education_biographies where subject_id=$1 and lang='tr'`, [idOf.get(K.marie)])).rows[0].person_key as string;
    await op.goto(`${LIST}?sekme=hayat`, { waitUntil: "load" });
    await op.locator(`[data-bio-owner-edit='${bioKey}:tr']`).click();
    await op.locator("[data-bio-editor-review]").click(); await op.locator("[data-bio-editor-confirm]").click();
    await op.locator("[data-bio-editor-publish-btn]:not([disabled])").waitFor({ timeout: 20_000 });
    await op.locator("[data-bio-editor-publish-btn]").click(); await op.locator("[data-bio-editor-confirm]").click();
    await op.locator("[data-bio-editor-unpublish]").waitFor({ timeout: 20_000 });
    ok((await q(`select publish_status from public.hd_education_biographies where person_key=$1 and lang='tr'`, [bioKey])).rows[0].publish_status === "published", "Marie Curie Hayat Hikâyesi: inceleme + yayın (yalnız panel)");

    section("6. Global katalog — panelden AÇ");
    await op.goto(LIST, { waitUntil: "load" });
    await op.locator("[data-edu-catalog-open]").waitFor({ timeout: 30_000 });
    ok(await count("published")(op) === "3" && await count("publishedBios")(op) === "1" && await count("grants")(op) === "1" && await count("legalReviewed")(op) === "3", "panel: 3 yayın · 1 biyografi · 1 yetkili uzman · 3 hukuk incelemesi");
    ok(/Irène Joliot-Curie/.test(await op.locator("[data-edu-open-list]").innerText()), "panel: uzmanlara açık kişi listesi");
    await op.locator("[data-edu-catalog-open]").click();
    await op.locator("[data-edu-catalog-reason]").fill("TEST-YEREL-KOPYA hukuki görüş tamam");
    await op.locator("[data-edu-catalog-confirm]").click();
    await op.locator("[data-edu-catalog-state='open']").waitFor({ timeout: 20_000 });
    ok((await q(`select catalog_open from public.hd_education_catalog_control`)).rows[0].catalog_open === true && Number((await q(`select count(*)::int n from public.hd_education_control_events where action='catalog_opened'`)).rows[0].n) === 1,
      "DB: katalog açık + 'catalog_opened' olayı (yeniden deploy YOK)");
    await snap(op, "05-owner-katalog-acik", false);

    section("7. Uzman — katalog açık");
    const catR = await api(e1, "/api/hd/education/charts");
    const names = ((catR.json?.items ?? []) as Array<{ displayName: string }>).map((i) => i.displayName).sort();
    ok(catR.status === 200 && names.length === 3 && !LIVING_NAMES.test(catR.text) && !OWNER_FIELDS.test(catR.text), "yetkili uzman: yalnız 3 yayımlı kişi; 5 kapsam dışı + owner alanları yanıtta YOK", names);
    ok(JSON.stringify(((catR.json?.families ?? []) as Array<{ key: string }>).map((f) => f.key)) === JSON.stringify(["curie"]), "aile: yalnız tüm üyeleri yayımlı Curie ailesi");
    for (const k of LIVING) ok((await api(e1, `/api/hd/education/charts/${idOf.get(k)}`)).status === 404, `kapsam dışı ${k} ayrıntısı → 404`);
    ok((await api(e1, `/api/hd/education/charts/${idOf.get(K.anne)}`)).status === 404, "yayımlanmamış kişi → 404");
    const bioR = await api(e1, `/api/hd/education/charts/${idOf.get(K.marie)}/biography?lang=tr`);
    ok(bioR.status === 200 && (bioR.json?.biography as unknown) !== null, "yayımlı Hayat Hikâyesi uzmana açık");
    for (const [l, u] of [["yetkisiz uzman", e2], ["normal admin", admin]] as const) ok((await api(u, "/api/hd/education/charts", undefined, "user")).status === 404, `${l} katalog → 404`);
    for (const vp of [{ n: "masaustu", w: 1440, h: 900, m: false }, { n: "mobil", w: 390, h: 844, m: true }]) {
      const { ctx, page } = await ctxFor(e1, vp);
      await page.goto(`${APP}/human-design`, { waitUntil: "load" });
      await page.locator("[data-hd-hub] a[href='/human-design/egitim-haritalari']").waitFor({ timeout: 30_000 });
      await page.goto(CAT, { waitUntil: "load" });
      await page.locator("a[href^='/human-design/egitim-haritalari/']").first().waitFor({ timeout: 30_000 });
      ok(!LIVING_NAMES.test(await page.locator("body").innerText()) && await noH(page), `${vp.n}: uzman katalog — kapsam dışı kişi yok, yatay taşma yok`);
      await snap(page, `06-uzman-katalog-${vp.n}`, true);
      await page.goto(`${CAT}/${idOf.get(K.marie)}?sekme=hayat`, { waitUntil: "load" });
      await page.locator("#edu-detail-title").waitFor({ timeout: 30_000 });
      await page.getByRole("tab", { name: "Human Design Haritası" }).click();
      await page.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-edu-bg-full]").count() >= 1 && await page.locator("[data-edu-bg-col]").count() === 2, `${vp.n}: büyük BodyGraph + tam ekran + gezegen listeleri`);
      await snap(page, `07-uzman-ayrinti-${vp.n}`, vp.n === "masaustu");
      await ctx.close();
    }

    section("8. Erişimi panelden yeniden KAPAT");
    const { ctx: ec, page: ep } = await ctxFor(e1);
    await ep.goto(`${CAT}/${idOf.get(K.marie)}`, { waitUntil: "load" });
    await ep.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 30_000 });
    await op.goto(LIST, { waitUntil: "load" });
    await op.locator("[data-edu-catalog-close]").click();
    await op.locator("[data-edu-catalog-reason]").fill("TEST-YEREL-KOPYA geçici kapatma");
    await op.locator("[data-edu-catalog-confirm]").click();
    await op.locator("[data-edu-catalog-state='closed']").waitFor({ timeout: 20_000 });
    await ep.reload({ waitUntil: "load" });
    await ep.getByText(/Sayfa bulunamadı|404|bulunamadı/i).first().waitFor({ timeout: 20_000 });
    ok(!/Marie Curie/.test(await ep.locator("body").innerText()), "katalog kapatıldı → açık uzman oturumu yenilemede içerik yok");
    ok((await api(e1, "/api/hd/education/charts")).status === 404, "katalog kapalı → uzman API 404");
    // Yeniden aç → yetkiyi geri al → yayından kaldır.
    await op.locator("[data-edu-catalog-open]").click(); await op.locator("[data-edu-catalog-reason]").fill("TEST-YEREL-KOPYA yeniden açma"); await op.locator("[data-edu-catalog-confirm]").click();
    await op.locator("[data-edu-catalog-state='open']").waitFor({ timeout: 20_000 });
    ok((await api(e1, "/api/hd/education/charts")).status === 200, "katalog yeniden açıldı → yetkili uzman 200");
    await op.goto(`${APP}/admin/users/${e1.id}#uye-erisim`, { waitUntil: "load" });
    await op.locator("[data-hd-edu-access-switch][aria-checked='true']").waitFor({ timeout: 60_000 });
    ok(await op.locator("[data-hd-edu-access-gate='closed']").count() === 0, "katalog açıkken anahtarda 'erişim kapalı' notu yok");
    await op.locator("[data-hd-edu-access-switch]").click();
    await op.waitForSelector("[data-hd-edu-access-switch][aria-checked='false']", { timeout: 20_000 });
    ok((await api(e1, "/api/hd/education/charts")).status === 404, "yetki geri alındı → uzman 404");
    await op.goto(`${LIST}/kisi/${idOf.get(K.hugo)}`, { waitUntil: "load" });
    await op.getByRole("button", { name: "Yayından kaldır…" }).click();
    await modalSave(op, ["TEST-YEREL-KOPYA yayından kaldırma"]);
    ok((await q(`select status from public.hd_education_publications where subject_id=$1`, [idOf.get(K.hugo)])).rows[0].status === "withdrawn", "kişi panelden yayından kaldırıldı");
    await ec.close();

    section("9. Mobil owner paneli + bütünlük");
    {
      const { ctx, page } = await ctxFor(owner, { w: 390, h: 844, m: true });
      await page.goto(LIST, { waitUntil: "load" });
      await page.locator("[data-edu-control-stats]").waitFor({ timeout: 30_000 });
      ok(await noH(page), "mobil: owner açılış paneli yatay taşma yok");
      await snap(page, "08-owner-acilis-paneli-mobil", false);
      await ctx.close();
    }
    const dZ = await digest();
    ok(JSON.stringify(dZ) === JSON.stringify(d0), "SON: 50 kişi / 50 snapshot / kaynaklar / 50 biyografi İÇERİĞİ ve doğum kanıtı baştan sona AYNI (silme yok)", { d0, dZ });
    let evDel = ""; try { await q(`delete from public.hd_education_control_events`); } catch (e) { evDel = String((e as Error).message); }
    ok(/append-only/.test(evDel), "yönetim geçmişi silinemez (append-only)", evDel);
    ok(providerReq === 0, `sağlayıcı / hesaplama isteği 0 (${providerReq})`);
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 5));
    ok(pageErrors.length === 0, `tarayıcı JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 3));
    await oc.close();
  } finally {
    await browser?.close().catch(() => undefined);
    if (app && (app as ChildProcess).pid) { const pid = (app as ChildProcess).pid!; if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }); else (app as ChildProcess).kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 2500));
    await env?.stop().catch(() => undefined);
  }
  console.log(`\nhd-education OWNER YAYIN e2e: ${pass} PASS / ${fail} FAIL · ekran görüntüleri: ${OUT}`);
  if (fail) { console.error("BAŞARISIZ:\n - " + fails.join("\n - ")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error("e2e çöktü:", e); process.exit(1); });
