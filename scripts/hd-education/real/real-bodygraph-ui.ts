/**
 * GERÇEK sağlayıcı snapshot'larının mevcut onaylı BodyGraph bileşeninde (owner ön izlemesi → HdComputedChartView) gösterimi.
 * Gerçek Next uygulaması (`next start`) + izole embedded-postgres; snapshot'lar paketten SHA doğrulamalı geri yüklenir.
 * YAYIN YOK (kayıtlar taslak kalır); sağlayıcı çağrısı YOK (localhost dışı her istek abort; hesapla düğmesi kapalı).
 * Her kişi için ekrandaki "AKTİF KAPILAR" ve "TANIMLI KANALLAR" listesi snapshot'taki değerlerle karşılaştırılır.
 * Ekran görüntüleri yalnız repo DIŞI korumalı klasöre yazılır (gerçek kişi verisi).
 * Ön koşul: NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54398 ... npx next build (b2-owner-ui-e2e ile aynı test build'i)
 * Çalıştır: npx tsx scripts/hd-education/real/real-bodygraph-ui.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket> --out <yeni klasör>
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { restoreSnapshotFile } from "./snapshot-io";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3990, APP = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 300)}` : ""}`); } };
async function waitHttp(url: string, ms: number) { const u = Date.now() + ms; while (Date.now() < u) { try { if ((await fetch(url)).status < 500) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error("zaman aşımı"); }

async function main() {
  let app: ChildProcess | null = null; let browser: Browser | null = null; let env: TestEnv | null = null;
  const external: string[] = []; const pageErrors: string[] = []; let computeReq = 0;
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"].map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    env = await startAnamnezTestEnv({ port: 54453, httpPort: 54398, dirName: `hd-edu-realui-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig] });
    const su = env.su;
    const tenant = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level) values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    const token = `zz-realui-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, token]);
    await su.query(readFileSync(LOCALKEY, "utf8"));
    await su.query(readFileSync(IMPORT, "utf8"));
    const manifest = readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
    const people: Array<{ key: string; name: string; gates: number[]; channels: string[]; type: string }> = [];
    for (const m of manifest) {
      const r = await restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256);
      ok(r === "RESTORED", `paketten geri yükleme: ${m.natural_key}`, r);
      const pkg = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as { subject: { display_name: string }; chart: { provider_raw: { type: string; gates: Array<{ gate: number }>; channels: Array<{ gateA: number; gateB: number }> } } };
      const raw = pkg.chart.provider_raw;
      people.push({ key: m.natural_key, name: pkg.subject.display_name, type: raw.type, gates: [...new Set(raw.gates.map((g) => g.gate))].sort((a, b) => a - b), channels: raw.channels.map((c) => `${Math.min(c.gateA, c.gateB)}-${Math.max(c.gateA, c.gateB)}`).sort() });
    }
    const pubs = Number((await su.query(`select count(*)::int n from public.hd_education_publications where status <> 'draft'`)).rows[0].n);
    ok(pubs === 0, "hiçbir kişi yayımlanmadı / pilot yapılmadı (tümü draft)", pubs);
    const appEnv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, HD_EDUCATION_CATALOG_ENABLED: "true" };
    delete appEnv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete appEnv.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv as NodeJS.ProcessEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    for (const vp of [{ n: "masaustu", w: 1440, h: 900, m: false }, { n: "tablet", w: 820, h: 1180, m: true }, { n: "mobil", w: 390, h: 844, m: true }]) {
      console.log(`\n[${vp.n}]`);
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: OWNER, tenant_id: tenant, full_name: "Yerel Owner", role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(profile), token]);
      await ctx.route("**/*", async (route) => { const u = new URL(route.request().url()); if (u.origin !== APP) { external.push(u.href); return route.abort(); } if (/\/compute$/.test(u.pathname)) computeReq++; return route.continue(); });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      await page.goto(`${APP}/admin/hd-egitim-haritalari`, { waitUntil: "load" });
      await page.locator("tbody tr").first().waitFor({ timeout: 30_000 });
      for (const p of (vp.n === "masaustu" ? people : people.slice(0, 3))) {
        await page.getByText(p.name, { exact: true }).first().click();
        const box = page.locator("section[aria-label$='ayrıntıları']");
        await box.getByText(/Önizleme — snapshot v1/).waitFor({ timeout: 20_000 });
        const t = await box.innerText();
        const svgs = await box.locator("svg").count();
        // Aktif kapı yongaları bileşenin kendi işaretinden (data-hd-gate) okunur — metin ayrıştırma (tarih/saat) karışmaz.
        const shownGates = [...new Set(await box.locator("[data-hd-gate]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-hd-gate")))))].sort((a, b) => a - b);
        const shownChannels = [...t.matchAll(/(\d{1,2})-(\d{1,2}) [^\n]*Kanal/g)].map((m) => `${Math.min(+m[1], +m[2])}-${Math.max(+m[1], +m[2])}`).sort();
        ok(svgs > 0, `${vp.n} · ${p.key}: gerçek BodyGraph bileşeni (svg)`);
        ok(JSON.stringify(shownGates) === JSON.stringify(p.gates), `${vp.n} · ${p.key}: ekrandaki aktif kapılar = snapshot (${p.gates.length})`, { shownGates, gates: p.gates });
        ok(JSON.stringify([...new Set(shownChannels)]) === JSON.stringify(p.channels), `${vp.n} · ${p.key}: ekrandaki tanımlı kanallar = snapshot (${p.channels.length})`, { shownChannels, ch: p.channels });
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${vp.n} · ${p.key}: yatay sayfa taşması yok`);
        ok(/Gerçek hesaplama çağrısı kapalı/.test(t), `${vp.n} · ${p.key}: ücretli çağrı kapısı kapalı (hesapla pasif)`);
        await page.screenshot({ path: path.join(OUT, `${vp.n}-${p.key}.png`), fullPage: true });
      }
      await ctx.close();
    }
    ok(computeReq === 0, `tarayıcıdan hesaplama isteği 0 (${computeReq})`);
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 3));
    ok(pageErrors.length === 0, `JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 2));
    const charts = Number((await su.query(`select count(*)::int n from public.hd_education_charts`)).rows[0].n);
    ok(charts === people.length, `yeni snapshot üretilmedi (${charts} = ${people.length} geri yüklenen)`);
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 1500));
    await env?.stop().catch(() => undefined);
  }
  console.log(`\nGERÇEK BodyGraph UI: ${pass} PASS / ${fail} FAIL · ${OUT}`);
  if (fail) { console.error(" - " + fails.join("\n - ")); process.exit(1); }
}
main().catch((e) => { console.error("çöktü:", e); process.exit(1); });
