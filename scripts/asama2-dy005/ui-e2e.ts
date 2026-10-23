/**
 * AŞAMA 2 / DY-005·006 + BUG-005 — gerçek tarayıcı E2E (Playwright chromium; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 ile `next build`.
 * Çalıştır: npx tsx scripts/asama2-dy005/ui-e2e.ts [--out <klasör>]
 *
 * Gerçek anamnez / rıza / beslenme migration'larıyla (scripts/anamnez/testEnv) + numerology bağ migration'ı:
 *  1) Numeroloji kayıt detayında "Danışana Bağla" → danışan arama (ön-doldurma YOK) → bağla.
 *  2) Danışan Word penceresi: hassas bölümler VARSAYILAN KAPALI; bağlı analiz seçimi; açık seçimle
 *     indirilen DOCX'te Numeroloji (kayıtlı) + Anamnez + Beslenme; seçimsiz indirmede yoklar.
 *  3) Bağlantıyı kaldır (iki adımlı onay) → kayıt silinmez.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { chromium, type Browser, type Page } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "asama2-dy005-ui");
mkdirSync(OUT, { recursive: true });
const APP = "http://127.0.0.1:3988";
const mig = (f: string) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8");

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(c: unknown, label: string, extra?: unknown) {
  if (c) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`); }
}
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`zaman aşımı: ${url}`);
}
async function docText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.split("</w:p>").map((p) => Array.from(p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)).map((m) => m[1]).join("")).join("\n");
}

const DDL = `
do $$ begin
  if not exists (select 1 from pg_constraint where conname='clients_tenant_id_id_key') then
    alter table public.clients add constraint clients_tenant_id_id_key unique (tenant_id, id);
  end if;
end $$;
create table if not exists public.appointments (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, title text, notes text, appointment_date timestamptz, status text, created_at timestamptz default now());
create table if not exists public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, session_date text, session_type text, duration_minutes int, session_note text, created_at timestamptz default now());
create table if not exists public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, stone_name text, stone_type text, stone_date text, created_at timestamptz default now());
create table if not exists public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, title text, status text, start_date text, end_date text, alert_dismissed_at timestamptz, created_at timestamptz default now());
create table if not exists public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
create table if not exists public.client_charges (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, charge_date text, category text, detail text, amount numeric, payment_status text, created_at timestamptz default now());
create table if not exists public.human_design_clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, name text, birth_date text, journey_client_id uuid, created_at timestamptz default now());
create table if not exists public.human_design_reports (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, user_id uuid, client_id uuid, chart_id uuid, title text, report_kind text, schema_version text, snapshot jsonb, created_at timestamptz default now());
create table if not exists public.numerology_records (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text, surname text, birth_date text, analysis_data jsonb, is_demo_seed boolean default false, created_at timestamptz default now());
grant select, insert, update, delete on all tables in schema public to service_role;
`;

/**
 * Pencerenin GÖNDERDİĞİ istek gövdesi yakalanır (UI'nin hangi bayrakları yolladığı doğrulanır) ve aynı
 * gövde aynı oturumla sunucuya tekrar gönderilerek üretilen DOCX okunur (indirme diyaloğundan bağımsız).
 */
let AUTH: Record<string, string> = {};
async function download(page: Page, click: () => Promise<void>): Promise<{ body: Record<string, unknown>; text: string }> {
  const reqP = page.waitForRequest((r) => r.url().includes("/word-report") && r.method() === "POST", { timeout: 60_000 });
  await click();
  const rq = await reqP;
  const body = (rq.postDataJSON() ?? {}) as Record<string, unknown>;
  const r = await fetch(rq.url(), { method: "POST", headers: { "content-type": "application/json", ...AUTH }, body: JSON.stringify(body) });
  if (r.status !== 200) throw new Error(`word-report POST ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return { body, text: await docText(Buffer.from(await r.arrayBuffer())) };
}

async function main() {
  const { startAnamnezTestEnv, seedAnamnez, SERVICE_KEY } = await import("../anamnez/testEnv");
  const { hesaplaNumeroloji } = await import("../../lib/numeroloji/numerolojiMotor");
  const { NUMEROLOJI_METHODOLOGY_VERSION } = await import("../../lib/numeroloji/methodology");
  const env = await startAnamnezTestEnv({ port: 54675, dirName: "asama2-dy005-ui-pgdata", httpPort: 54331, extraSql: [DDL, mig("20271120000300_numerology_records_client_link.sql")] });
  const S = await seedAnamnez(env.su);
  const q1 = async (sql: string, a: unknown[] = []) => (await env.su.query(sql, a)).rows[0];
  const a1 = S.clients.a1;
  await env.su.query(`update public.users set module_permissions='{"clients":true,"numerology":true}'::jsonb where id=$1`, [S.users.A.id]);
  const motor = hesaplaNumeroloji({ firstName: "ZZ Numeroloji", lastName: "Kişisi", birthDate: "21.03.1990" });
  const rec = (await q1(`insert into public.numerology_records(tenant_id, name, surname, birth_date, analysis_data) values ($1,'ZZ Numeroloji','Kişisi','21.03.1990',$2) returning id`,
    [S.TA, JSON.stringify({ version: 1, motor, summary: "ZZ kayıtlı özet", calc: { methodology: NUMEROLOJI_METHODOLOGY_VERSION } })])).id as string;
  await env.su.query(`insert into public.client_anamneses(tenant_id, client_id, kind, title, assessment_date, status, template_version, answers, created_by_user_id, completed_by_user_id, completed_at)
    values ($1,$2,'initial','ZZ E2E formu','2026-09-10','completed','std-v1',$3,$4,$4,'2026-09-10T10:00:00Z')`,
    [S.TA, a1, JSON.stringify({ "A.reason": "ZZ E2E başvuru nedeni" }), S.users.A.id]);
  await env.su.query(`insert into public.client_consents(tenant_id, client_id, consent_type, status, text_version, method, recorded_by_user_id)
    values ($1,$2,'acik_riza_ozel_nitelikli','granted','v1','islak_imza',$3)`, [S.TA, a1, S.users.A.id]);

  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3988", "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "ignore", "pipe"],
    });
    const errLog = createWriteStream(path.join(OUT, "next-stderr.log"));
    app.stderr?.pipe(errLog);
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "tr-TR", acceptDownloads: true });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
    const user = { id: S.users.A.id, tenant_id: S.TA, full_name: "ZZ_A", email: "zz.a@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true, numerology: true }, is_demo_account: false };
    await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), S.users.A.token]);
    AUTH = { "x-user-id": S.users.A.id, "x-session-token": S.users.A.token };
    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    console.log("\n[1) Numeroloji → Danışana Bağla]");
    await page.goto(`${APP}/numeroloji/liste/${rec}`);
    await page.getByRole("button", { name: "Danışana Bağla" }).waitFor({ timeout: 90_000 });
    ok(await page.getByText("Bu analiz bir danışana bağlı değil.").isVisible(), "başlangıçta bağsız (otomatik eşleşme yok)");
    await page.getByRole("button", { name: "Danışana Bağla" }).click();
    const search = page.getByPlaceholder("Danışan adı veya soyadı");
    ok((await search.inputValue()) === "", "arama kutusu kayıt adıyla ÖN-DOLDURULMAZ");
    await search.fill("Ayşe");
    const row = page.locator("li", { hasText: "ZZ Ayşe YILMAZ" });
    await row.waitFor({ timeout: 15_000 });
    await row.getByRole("button", { name: "Bağla" }).click();
    await page.getByText("Bağlı danışan:").waitFor({ timeout: 15_000 });
    ok((await q1(`select client_id from public.numerology_records where id=$1`, [rec])).client_id === a1, "DB: kayıt seçilen danışana bağlandı");
    await page.screenshot({ path: path.join(OUT, "dy005-numeroloji-bagli.png") });

    console.log("\n[2) Danışan Word penceresi]");
    await page.goto(`${APP}/dashboard/clients/${a1}`);
    const wordBtn = page.getByRole("button", { name: "Tam Word raporu oluştur" }).first();
    await wordBtn.waitFor({ timeout: 90_000 });
    await wordBtn.click();
    await page.getByText("Hassas bölümler (isteğe bağlı)").waitFor({ timeout: 30_000 });
    const anamnezBox = page.locator("label", { hasText: "Anamnez" }).locator("input[type=checkbox]");
    const beslenmeBox = page.locator("label", { hasText: "Beslenme özeti" }).locator("input[type=checkbox]");
    ok(!(await anamnezBox.isChecked()) && !(await beslenmeBox.isChecked()), "Anamnez ve Beslenme VARSAYILAN KAPALI");
    ok(await anamnezBox.isEnabled() && await beslenmeBox.isEnabled(), "tamamlanmış form + rıza + beslenme verisi → seçilebilir");
    const numSelect = page.locator("label", { hasText: "Eklenecek kayıtlı Numeroloji analizi" }).locator("select");
    ok((await numSelect.inputValue()) === "", "Numeroloji kaydı varsayılan SEÇİLMEMİŞ");
    await page.screenshot({ path: path.join(OUT, "dy005-word-pencere.png") });
    let res = await download(page, () => page.getByRole("button", { name: "Word Oluştur" }).click());
    let text = res.text;
    ok(res.body.includeAnamnez === undefined && res.body.includeBeslenme === undefined && res.body.numerologyRecordId === undefined, "UI isteği: hassas bayrak / kayıt id GÖNDERİLMEDİ", res.body);
    ok(!/Numeroloji — Kayıtlı Analiz|\d+\. Anamnez|Beslenme Özeti/.test(text), "seçimsiz Tam Rapor: kayıtlı Numeroloji / Anamnez / Beslenme YOK");

    await wordBtn.click();
    await page.getByText("Hassas bölümler (isteğe bağlı)").waitFor({ timeout: 30_000 });
    await numSelect.selectOption(rec);
    await page.locator("label", { hasText: "Anamnez" }).locator("input[type=checkbox]").check();
    await page.locator("label", { hasText: "Beslenme özeti" }).locator("input[type=checkbox]").check();
    res = await download(page, () => page.getByRole("button", { name: "Word Oluştur" }).click());
    text = res.text;
    ok(res.body.includeAnamnez === true && res.body.includeBeslenme === true && res.body.numerologyRecordId === rec, "UI isteği: açık seçim bayrakları + seçilen kayıt", res.body);
    ok(/Numeroloji — Kayıtlı Analiz/.test(text) && text.includes("Çakra Omurgası") && text.includes("Harflerin Yankılanışı"), "açık seçim: bağlı Numeroloji analizi tam içerikle");
    ok(/\d+\. Anamnez/.test(text) && text.includes("ZZ E2E başvuru nedeni"), "açık seçim: Anamnez (tamamlanmış + rızalı)");
    ok(text.includes("Beslenme Özeti") && text.includes("Yer fıstığı"), "açık seçim: Beslenme özeti (alerji)");

    await page.setViewportSize({ width: 390, height: 844 });
    await wordBtn.click();
    await page.getByText("Hassas bölümler (isteğe bağlı)").waitFor({ timeout: 30_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, "390 px: yatay taşma yok", overflow);
    await page.screenshot({ path: path.join(OUT, "dy005-word-pencere-390.png"), fullPage: false });
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1366, height: 900 });

    console.log("\n[3) Bağlantıyı kaldır]");
    await page.goto(`${APP}/numeroloji/liste/${rec}`);
    await page.getByRole("button", { name: "Bağlantıyı kaldır" }).waitFor({ timeout: 90_000 });
    await page.getByRole("button", { name: "Bağlantıyı kaldır" }).click();
    await page.getByRole("button", { name: "Evet, kaldır" }).click();
    await page.getByText("Bu analiz bir danışana bağlı değil.").waitFor({ timeout: 15_000 });
    const after = await q1(`select client_id, analysis_data is not null as has from public.numerology_records where id=$1`, [rec]);
    ok(after.client_id === null && after.has === true, "bağ kaldırıldı; kayıt ve snapshot duruyor", after);
    ok(pageErrors.length === 0, "sayfa JS hatası yok", pageErrors.slice(0, 3));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { try { process.kill(app.pid); } catch { /* kapalı */ } }
    await env.stop();
  }
}

main()
  .catch((e) => { fail++; fails.push(String(e)); console.error(e); })
  .finally(() => {
    console.log(`\nAŞAMA 2 / DY-005·006 + BUG-005 UI E2E: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
