/**
 * AŞAMA 2 / DY-03 — gerçek tarayıcı E2E (Playwright chromium; PRODUCTION'A SIFIR TEMAS).
 *
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54331 ile build.
 * Çalıştır: npx tsx scripts/asama2-dy03/ui-e2e.ts [--out <klasör>]
 *
 * İki cihaz senaryosu: tarayıcı (cihaz 1) formu açar; "cihaz 2" GERÇEK API ile güncel sürümle kaydeder;
 * cihaz 1 eski formla kaydeder → anlaşılır Türkçe uyarı, diğer cihazın verisi KORUNUR, ekran güncel
 * veriyle yenilenir, tekrar düzenleyip kaydetmek çalışır. Seans + Genel Bilgi (kimlik + sağlık notu).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1]! : path.join(os.tmpdir(), "asama2-dy03-ui");
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

const SUB_DDL = `
create table public.client_sessions (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  session_date text, session_type text, duration_minutes int, fee numeric, session_note text, actions_done text, suggestions text, next_plan text,
  created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  stone_name text, stone_type text, note text, usage_area text, combination_text text, warning_text text, other_notes text, stone_date text, created_at timestamptz default now());
create table public.client_homeworks (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  title text, homework_type text, description text, start_date text, end_date text, status text, expert_note text, client_feedback text,
  alert_dismissed_at timestamptz, created_at timestamptz default now());
create table public.client_analyses (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  analysis_type text, analysis_data jsonb, note text, image_url text, created_at timestamptz default now());
`;

async function main() {
  const { startAnamnezTestEnv, seedAnamnez, SERVICE_KEY } = await import("../anamnez/testEnv");
  const env = await startAnamnezTestEnv({
    port: 54671, dirName: "asama2-dy03-ui-pgdata", httpPort: 54331,
    rpcAllow: ["client_notes_cas_update_v2"],
    extraSql: [SUB_DDL, mig("20271113000000_dy_subrecord_row_version.sql"), mig("20271113000100_client_notes_cas_update_v2.sql"),
      `grant select, insert, update, delete on public.client_sessions, public.client_stones, public.client_homeworks, public.client_analyses to service_role;`],
  });
  const S = await seedAnamnez(env.su);
  const q1 = async (sql: string, a: unknown[] = []) => (await env.su.query(sql, a)).rows[0];
  const a1 = S.clients.a1;
  const sessId = (await q1(`insert into client_sessions(tenant_id, client_id, session_date, session_type, session_note) values ($1,$2,'2026-10-20','Enerji Seansı','İlk not') returning id`, [S.TA, a1])).id as string;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const api = async (method: string, p: string, body?: unknown) => {
    const r = await fetch(`${APP}${p}`, {
      method, headers: { "content-type": "application/json", "x-user-id": S.users.A2.id, "x-session-token": S.users.A2.token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
  };
  try {
    app = spawn(process.execPath, [path.join("node_modules", "next", "dist", "bin", "next"), "start", "-p", "3988", "-H", "127.0.0.1"], {
      cwd: process.cwd(), env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: "ignore",
    });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "tr-TR" });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
    const user = { id: S.users.A.id, tenant_id: S.TA, full_name: "ZZ_A", email: "zz.a@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", module_permissions: { clients: true }, is_demo_account: false };
    await ctx.addInitScript(([u, tok]) => { localStorage.setItem("yasam_user", u as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(user), S.users.A.token]);
    const page = await ctx.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    // ── Seans ────────────────────────────────────────────────────────────────
    console.log("\n[Seans — iki cihaz]");
    await page.goto(`${APP}/dashboard/clients/${a1}?tab=seanslar`);
    await page.getByText("İlk not").first().waitFor({ timeout: 90_000 });
    await page.getByRole("button", { name: "Düzenle" }).first().click();
    await page.getByText("Seansı Düzenle").waitFor();
    // Cihaz 2 (gerçek API) güncel sürümle kaydeder.
    const list = await api("GET", `/api/clients/${a1}/sessions`);
    const row = ((list.json.sessions ?? list.json.data ?? []) as Array<{ id: string; row_version: number }>).find((r) => r.id === sessId);
    const other = await api("PATCH", `/api/clients/${a1}/sessions`, { id: sessId, row_version: row?.row_version, session_note: "Cihaz 2 notu" });
    ok(other.status === 200, "cihaz 2 kaydetti (200)", other);
    // Cihaz 1 eski formla kaydeder.
    const noteBox = page.getByPlaceholder("Seans genel notu...").last();
    await noteBox.fill("Cihaz 1 eski form");
    await page.getByRole("button", { name: "Güncelle" }).click();
    await page.getByText(/başka bir sekmede veya cihazda değiştirildi/).first().waitFor({ timeout: 10_000 });
    ok(true, "cihaz 1: anlaşılır Türkçe çakışma uyarısı");
    ok((await q1(`select session_note from client_sessions where id=$1`, [sessId])).session_note === "Cihaz 2 notu", "cihaz 2'nin verisi EZİLMEDİ");
    await page.getByText("Cihaz 2 notu").first().waitFor({ timeout: 10_000 });
    ok(true, "liste güncel kayıtla yenilendi");
    await page.screenshot({ path: path.join(OUT, "dy03-seans-cakisma.png") });
    await page.getByRole("button", { name: "Düzenle" }).first().click();
    await page.getByPlaceholder("Seans genel notu...").last().fill("Cihaz 1 güncel sürümden");
    await page.getByRole("button", { name: "Güncelle" }).click();
    await page.getByText("Seans güncellendi.").waitFor({ timeout: 10_000 });
    ok((await q1(`select session_note from client_sessions where id=$1`, [sessId])).session_note === "Cihaz 1 güncel sürümden", "güncel veriyle tekrar kaydetme başarılı");

    // ── Genel Bilgi ──────────────────────────────────────────────────────────
    console.log("\n[Genel Bilgi — iki cihaz]");
    await page.goto(`${APP}/dashboard/clients/${a1}?tab=genel`);
    await page.getByRole("button", { name: /Bilgileri Güncelle/ }).waitFor({ timeout: 90_000 });
    await page.getByRole("button", { name: /Bilgileri Güncelle/ }).click();
    const cur = await api("GET", `/api/clients/${a1}`);
    const otherC = await api("PATCH", `/api/clients/${a1}`, { telefon: "05321112233", base_version: cur.json.client_version });
    const nGet = await api("GET", `/api/clients/${a1}/notes`);
    const otherN = await api("PATCH", `/api/clients/${a1}/notes`, { saglik_notu: "Cihaz 2 sağlık notu", general_base_version: nGet.json.general_version });
    ok(otherC.status === 200 && otherN.status === 200, "cihaz 2 kimlik + sağlık notunu kaydetti");
    await page.getByPlaceholder("05xx xxx xx xx").fill("05000000000");
    await page.getByRole("button", { name: /Değişiklikleri Kaydet/ }).click();
    await page.getByText(/Danışan bilgileri başka bir sekmede veya cihazda değişti/).first().waitFor({ timeout: 10_000 });
    const dbC = await q1(`select telefon from clients where id=$1`, [a1]);
    ok(dbC.telefon === "05321112233", "kimlik alanı: cihaz 2'nin telefonu EZİLMEDİ", dbC);
    ok((await page.getByPlaceholder("05xx xxx xx xx").inputValue()) === "05321112233", "form güncel telefonla yenilendi");
    await page.screenshot({ path: path.join(OUT, "dy03-genel-cakisma.png") });
    // Sağlık notu: bayat form (eski genel sürüm) → kaydet: kimlik artık güncel, notlar çakışmalı.
    await page.getByPlaceholder("Danışanın sağlık notları...").fill("Cihaz 1 eski sağlık notu");
    await page.getByRole("button", { name: /Değişiklikleri Kaydet/ }).click();
    await page.getByText("Notlar başka yerde değişti, yenileniyor.").first().waitFor({ timeout: 10_000 });
    ok((await q1(`select saglik_notu from client_notes where client_id=$1`, [a1])).saglik_notu === "Cihaz 2 sağlık notu", "sağlık notu: cihaz 2'nin verisi EZİLMEDİ (eskiden sürümsüz yazılıyordu)");
    ok((await page.getByPlaceholder("Danışanın sağlık notları...").inputValue()) === "Cihaz 2 sağlık notu", "sağlık notu alanı güncel değerle yenilendi");
    await page.getByPlaceholder("Danışanın sağlık notları...").fill("Cihaz 1 güncel sürümden sağlık notu");
    await page.getByRole("button", { name: /Değişiklikleri Kaydet/ }).click();
    await page.getByText("Değişiklikler kaydedildi.").first().waitFor({ timeout: 10_000 });
    ok((await q1(`select saglik_notu from client_notes where client_id=$1`, [a1])).saglik_notu === "Cihaz 1 güncel sürümden sağlık notu", "güncel veriyle tekrar kaydetme başarılı");
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
    console.log(`\nAŞAMA 2 / DY-03 UI E2E: ${pass} PASS / ${fail} FAIL`);
    if (fails.length) console.log("FAILURES:\n - " + fails.join("\n - "));
    process.exit(fail ? 1 : 0);
  });
