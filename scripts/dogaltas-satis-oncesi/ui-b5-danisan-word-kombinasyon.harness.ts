/**
 * B5 (05.11) — GERÇEK TARAYICI: Danışan → Doğaltaş Önerileri → "📄 Taşlar Word" düğmesi → indirilen .docx
 * açılır ve içeriği doğrulanır. Word isteği GERÇEK sunucu route'una (yerel `next start`, prod build) gider;
 * route GERÇEK tablolar üzerinde çalışır (embedded-postgres + PostgREST kabuğu, build'in sabit adresi
 * 127.0.0.1:54343 → kabuğa vekil). Sayfanın diğer API'leri ağ-mock. Prod'a SIFIR temas; veriler sentetik.
 * Önkoşul: `next build` (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54343).
 * Çalıştır: npx tsx scripts/dogaltas-satis-oncesi/ui-b5-danisan-word-kombinasyon.harness.ts
 */
import http from "node:http";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { chromium } from "playwright";
import { startBioTestEnv, SERVICE_KEY } from "../bioenergy-presale-final/bioTestEnv";

const PORT = Number(process.env.B5_UI_PORT ?? 3996);
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0; const failures: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`✅ ${l}`); } else { fail++; failures.push(l); console.log(`❌ ${l}${x !== undefined ? `  → ${JSON.stringify(x).slice(0, 400)}` : ""}`); } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DDL = `
create table public.clients (id uuid primary key default gen_random_uuid(), tenant_id uuid not null, ad text, soyad text, created_at timestamptz default now());
create table public.client_notes (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, notlar text, created_at timestamptz default now());
create table public.client_stones (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, stone_name text, stone_type text, note text,
  usage_area text, combination_text text, warning_text text, other_notes text, stone_date date, created_at timestamptz default now());
create table public.client_stone_photos (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid, stone_id uuid, file_path text, created_at timestamptz default now());
create table public.client_combinations (id uuid primary key default gen_random_uuid(), tenant_id uuid, client_id uuid references public.clients(id) on delete cascade,
  name text, description text, note text, stones_text text, notes_text text, notes_text_2 text, created_at timestamptz default now(), updated_at timestamptz);
grant select, insert, update, delete on public.clients, public.client_notes, public.client_stones, public.client_stone_photos, public.client_combinations to service_role;`;

async function docText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

async function main() {
  const env = await startBioTestEnv({ port: Number(process.env.B5_PG_PORT ?? 54771), dirName: `zz-b5ui-${Date.now()}` });
  const target = new URL(env.url);
  // Build'in sabit Supabase adresi → test kabuğu (yalnız 127.0.0.1).
  const proxy = http.createServer((req, res) => {
    const up = http.request({ host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
    up.on("error", () => { res.writeHead(502); res.end(); });
    req.pipe(up);
  });
  await new Promise<void>((resolve, reject) => { proxy.once("error", reject); proxy.listen(54343, "127.0.0.1", () => resolve()); });
  let server: ReturnType<typeof spawn> | null = null;
  const browser = await chromium.launch();
  const su = env.su;
  try {
    await su.query(DDL);
    const T1 = randomUUID(), U1 = randomUUID(), TOKEN = `zz-b5ui-${randomUUID()}`;
    await su.query(`insert into public.tenants(id,name) values ($1,'ZZ_B5UI')`, [T1]);
    await su.query(`insert into public.users(id,email,full_name,role,active,approval_status,module_permissions,package_type,plan,tenant_id,membership_status)
      values ($1,'zz.b5ui@example.test','ZZ Uzman','expert',true,'approved','{"clients":true,"stones":true}','premium','premium',$2,'active')`, [U1, T1]);
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [U1, TOKEN]);
    const C1 = String((await su.query(`insert into public.clients(tenant_id,ad,soyad) values ($1,'ZZ','Danışan Bİr') returning id`, [T1])).rows[0].id);
    const C2 = String((await su.query(`insert into public.clients(tenant_id,ad,soyad) values ($1,'ZZ','Kombinasyonsuz') returning id`, [T1])).rows[0].id);
    await su.query(`insert into public.client_stones(tenant_id,client_id,stone_name,stone_type,usage_area,warning_text,stone_date) values ($1,$2,'ZZ AMETİST','Kolye','Günlük','ZZ taş uyarısı','2026-10-20')`, [T1, C1]);
    await su.query(`insert into public.client_stones(tenant_id,client_id,stone_name,stone_type,stone_date) values ($1,$2,'ZZ KUVARS','Bileklik','2026-10-21')`, [T1, C2]);
    await su.query(`insert into public.client_combinations(tenant_id,client_id,name,description,note,stones_text,notes_text,notes_text_2) values
      ($1,$2,'ZZ Uyku Kombinasyonu','ZZ uyku amacı','ZZ kombinasyon notu','AMETİST, LEPİDOLİT, AKİK','Arama Koşulları:\n- Mineral: Lityum ≥ %1','Stok: 2/3 stokta')`, [T1, C1]);

    const cwd = process.cwd();
    server = spawn(process.execPath, [path.join(cwd, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT), "-H", "127.0.0.1"],
      { cwd, env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let srvLog = "";
    server.stdout?.on("data", (d) => { srvLog += String(d); });
    server.stderr?.on("data", (d) => { srvLog += String(d); });
    for (let i = 0; i < 120; i++) { try { if ((await fetch(`${BASE}/`)).status) break; } catch { /* bekle */ } await sleep(1000); }

    const USER = { id: U1, email: "zz.b5ui@example.test", full_name: "ZZ Uzman", name: "ZZ Uzman", role: "expert", active: true, approval_status: "approved",
      package_type: "premium", membership_status: "active", tenant_id: T1, is_demo_account: false, module_permissions: { stones: true, clients: true } };
    for (const vp of [{ width: 390, height: 844, tag: "mobil" }, { width: 1280, height: 900, tag: "web" }]) {
      const touch = vp.width < 768;
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: touch, isMobile: touch, acceptDownloads: true });
      await ctx.addInitScript(({ u, tk }) => {
        try {
          localStorage.setItem("yasam_user", JSON.stringify(u));
          localStorage.setItem("yasam_session_token", tk);
          localStorage.setItem("yasam_analytics_consent_v1", JSON.stringify({ decision: "denied", decidedAt: new Date().toISOString() }));
        } catch { /* yok */ }
      }, { u: USER, tk: TOKEN });
      let wordCalls = 0;
      await ctx.route("**/*", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.hostname !== "127.0.0.1") return route.abort();
        if (!url.pathname.startsWith("/api/")) return route.continue();
        // GERÇEK route: yalnız Taşlar Word isteği sunucuya gider (oturum başlığı test oturumu).
        if (url.pathname.endsWith("/word-report") && req.method() === "POST") { wordCalls++; return route.continue({ headers: { ...req.headers(), "x-user-id": U1, "x-session-token": TOKEN } }); }
        if (url.pathname === "/api/auth/session") return route.fulfill({ status: 200, json: { valid: true } });
        if (url.pathname === "/api/auth/profile") return route.fulfill({ status: 200, json: { profile: USER } });
        for (const [cid, ad, soyad] of [[C1, "ZZ", "Danışan Bİr"], [C2, "ZZ", "Kombinasyonsuz"]])
          if (url.pathname === `/api/clients/${cid}`) return route.fulfill({ status: 200, json: { ok: true, client: { id: cid, tenant_id: T1, ad, soyad, created_at: "2026-10-01T08:00:00.000Z" }, client_version: "1" } });
        return route.fulfill({ status: 200, json: { ok: true, rows: [], count: 0, notes: [], items: [], stones: [], photos: [] } });
      });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
      const hit = (l: ReturnType<typeof page.locator>) => (touch ? l.tap() : l.click());
      const download = async (cid: string, label: string) => {
        await page.goto(`${BASE}/dashboard/clients/${cid}`, { waitUntil: "load" });
        const tab = page.getByRole("tab", { name: /Doğaltaş Önerileri/ }).first().or(page.getByRole("button", { name: /Doğaltaş Önerileri/ }).first()).first();
        await tab.waitFor({ timeout: 60000 });
        await hit(tab);
        const btn = page.getByRole("button", { name: /Taşlar Word/ }).first();
        await btn.waitFor({ timeout: 20000 });
        const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), hit(btn)]);
        const file = path.join(process.env.B5_UI_OUT ?? cwd, `zz-b5-${vp.tag}-${label}.docx`);
        await dl.saveAs(file);
        const buf = (await import("node:fs")).readFileSync(file);
        (await import("node:fs")).unlinkSync(file);
        return { name: dl.suggestedFilename(), text: await docText(buf), size: buf.length };
      };
      try {
        const d1 = await download(C1, "c1");
        ok(d1.size > 2000 && d1.text.length > 0, `[${vp.tag}] Taşlar Word gerçek route'tan indirildi ve açıldı (${d1.size} bayt)`);
        ok(d1.text.includes("Kayıtlı Kombinasyonlar") && d1.text.includes("ZZ Uyku Kombinasyonu") && d1.text.includes("AMETİST, LEPİDOLİT, AKİK")
          && d1.text.includes("ZZ uyku amacı") && d1.text.includes("ZZ kombinasyon notu") && d1.text.includes("Lityum ≥ %1") && d1.text.includes("Stok: 2/3 stokta"),
          `[${vp.tag}] kombinasyon adı, taşları, amaç, not, mineral ve stok özeti Word'de`, d1.text.slice(0, 400));
        ok(d1.text.includes("ZZ AMETİST") && d1.text.includes("ZZ taş uyarısı") && d1.text.indexOf("ZZ AMETİST") < d1.text.indexOf("Kayıtlı Kombinasyonlar"), `[${vp.tag}] taş kaydı aynen, kombinasyonlardan önce`);
        ok(d1.name.startsWith("danisan-taslar-zz-danisan-bir-") && !d1.name.includes("bi-r"), `[${vp.tag}] indirilen dosya adı Türkçe İ'de bozulmaz (${d1.name})`, d1.name);
        const d2 = await download(C2, "c2");
        ok(d2.text.includes("ZZ KUVARS") && !d2.text.includes("Kayıtlı Kombinasyonlar") && !d2.text.includes("ZZ Uyku"), `[${vp.tag}] kombinasyonsuz danışan: rapor eskisi gibi, başka danışanın kombinasyonu yok`);
        ok(wordCalls === 2, `[${vp.tag}] iki Word isteği gerçek sunucuya gitti`, wordCalls);
        ok(errors.length === 0, `[${vp.tag}] sayfa hatası yok`, errors.join(" | "));
      } catch (e) { ok(false, `[${vp.tag}] beklenmeyen hata`, String((e as Error)?.stack ?? e)); }
      await ctx.close();
    }
    if (fail) console.log("SUNUCU GÜNLÜĞÜ (son):\n" + srvLog.slice(-1500));
  } catch (e) {
    ok(false, "beklenmeyen hata", String((e as Error)?.stack ?? e));
  } finally {
    await browser.close().catch(() => {});
    if (server?.pid) { try { execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" }); } catch { /* kapalı */ } }
    proxy.close();
    await env.stop().catch(() => {});
  }
  console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
  if (failures.length) console.log(" - " + failures.join("\n - "));
  process.exit(fail ? 1 : 0);
}
void main();
