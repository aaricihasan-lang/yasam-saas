/**
 * 8. aşama — EKRAN DÜZEYİNDE V1/V2 sürüm seçimi ve GERİ DÖNÜŞ (gerçek `next dev` + Playwright + GERÇEK test projesi).
 * Sıra: bayrak KAPALI (V1) → AÇIK (V2) → yeniden KAPALI (V1'e geri dönüş). Her turda sunucu yeniden başlatılır
 * (Vercel'de de bayrak değişikliği yeniden dağıtım ister). Ortam değişkenleri YALNIZ alt sürece verilir
 * (.env.local'e yazılmaz; Next, süreç ortamını .env dosyalarına tercih eder). Sentetik ZZ_ verisi.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/screen.real.mts
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
const PORT = 3291;
const BASE = `http://localhost:${PORT}`;
/** Ekran görüntüleri: SIFA_V2_SHOTS_DIR (verilmezse işletim sistemi geçici klasörü). */
const SHOTS = path.join(process.env.SIFA_V2_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-v2-ekran"), "asama8");
mkdirSync(SHOTS, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""}`);
};

// ── Sentetik veri: tenant + uzman + oturum + V1 kaydı + V2 kurum kaydı ─────────
const su = await connectTestDb();
const TEN = randomUUID();
const UID = randomUUID();
const TOKEN = `zz-sifa-v2-ekran-${randomUUID()}`;
const V1_NAME = `ZZ Ekran V1 Kaydı ${TEN.slice(0, 6)}`;
const V2_TITLE = `ZZ Ekran Kurum Kaydı ${TEN.slice(0, 6)}`;
await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_EKRAN')", [TEN]);
await su.query(
  `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
   values ($1, 'ZZ_SIFA_EKRAN_UZMAN', 'zz.sifa.ekran@example.test', 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $2, 'active', 'active')`,
  [UID, TEN],
);
await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [UID, TOKEN]);
await su.query("insert into public.healing_guides(tenant_id, name, general_summary) values ($1, $2, 'Sentetik V1 özeti')", [TEN, V1_NAME]);
const SH = randomUUID();
await su.query("select public.sifa_v2_import_legacy($1::uuid, $2::jsonb, '[]'::jsonb)", [
  TEN,
  JSON.stringify({ topics: [{ id: SH, parent_id: null, title: V2_TITLE, sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }], blocks: [], assets: [] }),
]);
const v2Rows = async () => Number((await su.query("select count(*)::int n from public.sifa_topics where tenant_id = $1", [TEN])).rows[0].n);
const rowsBefore = await v2Rows();

// ── Sunucu ────────────────────────────────────────────────────────────────────
function childEnv(flag: boolean): NodeJS.ProcessEnv {
  const e = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!/SUPABASE|DATABASE_URL|POSTGRES|PGPASSWORD|SIFA_/i.test(k)) e[k] = v;
  e.NEXT_PUBLIC_SUPABASE_URL = T.url;
  e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = T.publishableKey;
  e.NEXT_PUBLIC_SUPABASE_ANON_KEY = T.publishableKey;
  e.SUPABASE_SERVICE_ROLE_KEY = T.secretKey;
  e.SIFA_REHBERI_V2_ENABLED = flag ? "1" : "0";
  e.NEXT_TELEMETRY_DISABLED = "1";
  return e;
}
async function startServer(flag: boolean): Promise<ChildProcess> {
  const p = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: process.cwd(), env: childEnv(flag), shell: true, stdio: "ignore" });
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { headers: { "x-user-id": UID, "x-session-token": TOKEN } });
      if (r.status > 0) return p;
    } catch { /* henüz hazır değil */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("next dev başlamadı");
}
function stopServer(p: ChildProcess) {
  try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: "ignore" }); } catch { /* zaten kapalı */ }
}
async function api() {
  const r = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { headers: { "x-user-id": UID, "x-session-token": TOKEN } });
  return r.status;
}
async function direct() {
  const r = await fetch(`${BASE}/sifa-rehberi-v2`, { redirect: "manual" });
  return { s: r.status, loc: r.headers.get("location") };
}
async function screen(browser: Browser, shot: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  const userRec = { id: UID, tenant_id: TEN, full_name: "ZZ_SIFA_EKRAN_UZMAN", email: "zz.sifa.ekran@example.test", role: "expert", status: "active", plan: "premium", package_type: "premium", subscription_status: "active", membership_status: "active", module_permissions: { sifa_rehberi: true } };
  await ctx.addInitScript(([u, t]) => {
    localStorage.setItem("yasam_user", u as string);
    localStorage.setItem("yasam_session_token", t as string);
  }, [JSON.stringify(userRec), TOKEN]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const v2 = await page.locator("[data-testid=sifa-v2-root]").count();
  const kurumCard = await page.locator(`[data-testid=root-card][data-node-id="${SH}"]`).count();
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), fullPage: false });
  const url = new URL(page.url()).pathname;
  await ctx.close();
  // V1 açılış ekranı adı değil SAYACI gösterir (ad liste sayfasında) → tenant'ın tek V1 kaydı = "1 Kayıt".
  return { v2, url, v1Count1: /(^|\n)\s*1\s*\n\s*Kayıt\b/.test(body), kurumCard };
}

const browser = await chromium.launch();
let srv: ChildProcess | null = null;
try {
  for (const [label, flag, shot] of [["1) Bayrak KAPALI → V1", false, "801-bayrak-kapali-v1"], ["2) Bayrak AÇIK → V2", true, "802-bayrak-acik-v2"], ["3) Bayrak yeniden KAPALI → V1'e geri dönüş", false, "803-geri-donus-v1"]] as const) {
    console.log(`\n${label}`);
    srv = await startServer(flag);
    const a = await api();
    const d = await direct();
    const s = await screen(browser, shot);
    if (flag) {
      ok(a === 200, "V2 API (oturumlu, gerçek test projesi) → 200", a);
      ok(d.s >= 300 && d.s < 400 && (d.loc ?? "").endsWith("/sifa-rehberi"), "/sifa-rehberi-v2 → kanonik /sifa-rehberi'ye yönlendirme", d);
      ok(s.v2 === 1 && s.url === "/sifa-rehberi", "/sifa-rehberi = V2 ekranı (adres aynı)", s);
      ok(s.kurumCard === 1, "V2 ekranı kurum kaydının kartını GERÇEK test DB'sinden gösteriyor (root-card, aynı kimlik)", s.kurumCard);
    } else {
      ok(a === 404, "V2 API → 404 (V1 çalışırken V2 API yok)", a);
      ok(d.s === 404, "/sifa-rehberi-v2 → 404", d);
      ok(s.v2 === 0 && s.url === "/sifa-rehberi", "/sifa-rehberi = V1 ekranı (V2 öğesi yok)", s);
      ok(s.v1Count1, "V1 ekranı tenant'ın V1 kaydını GERÇEK test DB'sinden sayıyor (1 Kayıt)", s.v1Count1);
    }
    stopServer(srv);
    srv = null;
    await new Promise((r) => setTimeout(r, 3000));
  }
  ok((await v2Rows()) === rowsBefore, "geri dönüşte V2 verisi SİLİNMEDİ (kurum kaydı duruyor)", rowsBefore);
} catch (e) {
  fail++;
  console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 600)}`);
} finally {
  if (srv) stopServer(srv);
  await browser.close();
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL (ekranlar: ${SHOTS})`);
process.exit(fail ? 1 : 0);
