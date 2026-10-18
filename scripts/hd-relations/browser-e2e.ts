/**
 * HD İLİŞKİ VE GRUP ANALİZLERİ — GERÇEK TARAYICI testi (Playwright; yerel `next start` + izole Postgres).
 *
 * Ön koşul (gizli değer YOK — test shim'ine işaret eden YEREL build):
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54523 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=zz-anamnez-test-anon-not-a-secret \
 *   SUPABASE_SERVICE_ROLE_KEY=zz-anamnez-test-service-role-not-a-secret npx next build
 * Next sunucusuna Roxy anahtarı VERİLMEZ (tarayıcıdan ücretli çağrı imkânsız). Kayıtlı analizler test
 * sürecinde gerçek route'larla + bağımsız sahte Roxy ile tohumlanır.
 * Ekranlar: 1920, 1366, 390, 360, 320 (+ Android UA 360). Çalıştır: npx tsx scripts/hd-relations/browser-e2e.ts [--out <klasör>]
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { chromium, type Browser } from "playwright";
import { mkUser, src, type Auth, type Json } from "../hd-analysis-word-flow/env";
import { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { engineChart, fakeConnectionResponse, fakePentaResponse, PEOPLE, type Moment } from "./fakeRelationRoxy";

const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : path.join(os.tmpdir(), "hd-relations-browser");
mkdirSync(OUT, { recursive: true });
const PORT = 3995;
const APP = `http://127.0.0.1:${PORT}`;
const TA = "0e0e0e0e-0000-4000-8000-00000000000a";
const cid = (n: number) => `eeeeeeee-0000-4000-8000-0000000c00${String(n).padStart(2, "0")}`;
const hid = (n: number) => `eeeeeeee-0000-4000-8000-0000000d00${String(n).padStart(2, "0")}`;
const NAMES = ["Ayşe Yılmaz", "Mehmet Kaya", "Zeynep Demir", "Ali Çelik", "Elif Şahin", "Can Öztürk"];
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DEVICES = [
  { name: "1920", w: 1920, h: 1080 },
  { name: "1366", w: 1366, h: 768 },
  { name: "390", w: 390, h: 844, ua: IPHONE },
  { name: "360", w: 360, h: 760, ua: IPHONE },
  { name: "320", w: 320, h: 640, ua: IPHONE },
  { name: "360-android", w: 360, h: 760, ua: ANDROID },
];

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 500)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
async function waitHttp(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`sunucu açılmadı: ${url}`);
}

const HD_DDL = `
create table public.human_design_clients (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, name text not null,
  birth_date date, birth_time text, birth_place text, chart_image_url text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.human_design_charts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid,
  client_id uuid references public.human_design_clients(id) on delete set null, client_name text,
  birth_date date, birth_time text, birth_place text, source text default 'manual', input jsonb, computed_result jsonb,
  provider text, provider_raw jsonb, input_hash text, timezone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.tenants(id, name) values ('${TA}', 'ZZ_REL_BROWSER');
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts to service_role;
`;

async function main() {
  const realFetch = globalThis.fetch;
  let seedCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u)) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as { personA?: Moment; personB?: Moment; members?: Moment[] };
    seedCalls++;
    if (u.includes("/human-design/connection")) return new Response(JSON.stringify(fakeConnectionResponse(body.personA!, body.personB!, { lang: "tr" })), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/human-design/penta")) return new Response(JSON.stringify(fakePentaResponse(body.members!)), { status: 200, headers: { "content-type": "application/json" } });
    throw new Error(`harness: dış ağ yasak ${u}`);
  }) as typeof fetch;
  process.env.ROXY_API_KEY = "zz-harness-fake-roxy-key";

  const env: TestEnv = await startAnamnezTestEnv({ port: 54433, dirName: "hd-relations-browser-pgdata", httpPort: 54523, extraSql: [HD_DDL, src("supabase/migrations/20271102000000_hd_relation_analyses.sql")] });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  let app: ChildProcess | null = null;
  let browser: Browser | null = null;
  const pageErrors: string[] = [];
  try {
    for (let i = 0; i < 6; i++) {
      const m = PEOPLE[i];
      await su.query(`insert into public.human_design_clients(id, tenant_id, name, birth_date, birth_time) values ($1,$2,$3,$4,$5)`, [cid(i), TA, NAMES[i], m.date, m.time.slice(0, 5)]);
      await su.query(
        `insert into public.human_design_charts(id, tenant_id, client_id, client_name, source, provider, input, input_hash, computed_result, birth_place) values ($1,$2,$3,$4,'computed','roxyapi',$5,$6,$7,$8)`,
        [hid(i), TA, cid(i), NAMES[i], JSON.stringify({ date: m.date, time: m.time, timezone: m.timezone, latitude: m.latitude, longitude: m.longitude, nodeType: "true", lang: "tr" }), `ih-${i}`, JSON.stringify(engineChart(m)), ["İstanbul, Türkiye", "Ankara, Türkiye", "İzmir, Türkiye", "Berlin, Almanya", "New York, ABD", "Adana, Türkiye"][i]],
      );
    }
    const PA = { human_design: true, clients: true };
    const UA: Auth = await mkUser(su, "RELBR", TA, PA);
    const rel = await import("../../app/api/hd/relations/route");
    const post = async (idx: number[]) => {
      const req = new NextRequest("http://localhost/api/hd/relations", { method: "POST", headers: { "x-user-id": UA.id!, "x-session-token": UA.token!, "content-type": "application/json" }, body: JSON.stringify({ participants: idx.map((i) => ({ client_id: cid(i), chart_id: hid(i) })), relation_type: idx.length === 2 ? "spouse" : "family" }) });
      const res = await rel.POST(req);
      return (await res.json()) as Json;
    };
    const CONN = String((await post([0, 1])).id);
    const PENTA = String((await post([0, 2, 3, 4])).id);
    const DISPOSABLE = (await post([2, 5])).id as string;
    delete process.env.ROXY_API_KEY;
    globalThis.fetch = realFetch;
    ok(!!CONN && !!PENTA && !!DISPOSABLE && seedCalls === 3, "0 tohum: Connection + Penta + silinecek analiz (yalnız tohumda 3 sahte çağrı)");

    const userJson: Json = { id: UA.id, tenant_id: TA, full_name: "ZZ_RELBR", email: "zz.relbr@example.test", role: "expert", active: true, approval_status: "approved", package_type: "premium", plan: "premium", is_demo_account: false, module_permissions: PA };
    const appEnv: NodeJS.ProcessEnv = { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, NEXT_TELEMETRY_DISABLED: "1" };
    delete appEnv.ROXY_API_KEY;
    delete appEnv.ROXY_API_BASE_URL;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 120_000);
    browser = await chromium.launch();

    let deleted = false;
    for (const d of DEVICES) {
      section(d.name);
      const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, isMobile: !!d.ua, hasTouch: !!d.ua, locale: "tr-TR", timezoneId: "Europe/Istanbul", ...(d.ua ? { userAgent: d.ua } : {}) });
      await ctx.addCookies([{ name: "NEXT_LOCALE", value: "tr", url: APP }]);
      await ctx.addInitScript(([uj, tok]) => { localStorage.setItem("yasam_user", uj as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(userJson), UA.token!]);
      const page = await ctx.newPage();
      const posts: string[] = [];
      let roxyDirect = 0;
      page.on("request", (r) => {
        if (/roxyapi\.com/.test(r.url())) roxyDirect++;
        if (r.method() === "POST" && /\/api\/hd\/relations$/.test(r.url())) posts.push(r.url());
      });
      page.on("pageerror", (e) => pageErrors.push(`${d.name}: ${e.message}`));
      const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

      // Hub kartı
      await page.goto(`${APP}/human-design`);
      await page.locator('a[href="/human-design/iliski-grup"]').waitFor({ timeout: 60_000 });
      ok(await page.locator('a[href="/human-design/iliski-grup"]').isVisible(), `${d.name}: Human Design ana sayfasında "İlişki ve Grup Analizleri" kartı`);

      // Ana ekran
      await page.goto(`${APP}/human-design/iliski-grup`);
      await page.locator("[data-hd-rel-select='0']").waitFor({ timeout: 60_000 });
      await page.locator(`[data-hd-rel-row="${CONN}"]`).waitFor({ timeout: 30_000 });
      ok(!(await overflowX()), `${d.name}: ana ekranda yatay taşma yok`);
      ok((await page.locator("[data-hd-rel-count]").count()) === 4, `${d.name}: 2/3/4/5 kişi seçenekleri`);
      ok((await page.locator("[data-hd-rel-create]").innerText()).includes("İlişki Analizini Oluştur"), `${d.name}: 2 kişide düğme "İlişki Analizini Oluştur"`);
      await page.locator("[data-hd-rel-select='0']").selectOption(cid(0));
      const disabledInB = await page.locator(`[data-hd-rel-select='1'] option[value="${cid(0)}"]`).isDisabled();
      ok(disabledInB, `${d.name}: A'da seçilen danışan B listesinde seçilemez`);
      ok((await page.locator("[data-hd-rel-birth='0']").innerText()).includes("İstanbul"), `${d.name}: seçilen kişinin doğum bilgisi doğrulama için görünür`);
      await page.locator("[data-hd-rel-select='1']").selectOption(cid(1));
      await page.screenshot({ path: path.join(OUT, `${d.name}-builder.png`), fullPage: true });
      await page.locator("[data-hd-rel-create]").dblclick();
      await page.waitForURL(/\?id=/, { timeout: 30_000 });
      ok(page.url().includes(CONN), `${d.name}: kayıtlı çift → mevcut analiz açıldı (yeni hesap YOK)`);
      ok(posts.length === 1, `${d.name}: çift tık tek istek gönderdi`, posts.length);
      await page.locator("[data-hd-rel-view='connection']").waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-hd-rel-diagram='connection']").isVisible(), `${d.name}: ilişki haritası diyagramı görünür`);
      ok((await page.locator("[data-hd-rel-summary]").count()) === 4 && (await page.locator("[data-hd-rel-center-row]").count()) === 9, `${d.name}: 4 bağlantı türü sayacı + 9 birleşik merkez`);
      ok((await page.locator("[data-hd-rel-participant='A']").innerText()).includes(NAMES[0]) && (await page.locator("[data-hd-rel-participant='B']").innerText()).includes(NAMES[1]), `${d.name}: A/B katılımcıları doğru adlarla`);
      ok(!(await overflowX()), `${d.name}: Connection detayında yatay taşma yok`);
      const wordVisible = await page.locator("[data-hd-rel-word]").isVisible();
      ok(d.name === "360-android" ? !wordVisible : wordVisible, `${d.name}: Word düğmesi ${d.name === "360-android" ? "Android'de gizli" : "görünür"}`);
      await page.screenshot({ path: path.join(OUT, `${d.name}-connection.png`), fullPage: true });
      // Geri tuşu (Android/tarayıcı) → listeye döner
      await page.goBack();
      await page.locator("[data-hd-rel-builder]").waitFor({ timeout: 30_000 });
      ok(!page.url().includes("?id="), `${d.name}: geri tuşu analiz listesine döner`);

      // Penta: 3 kişi seçimi, yeni üçlü → sunucuda Roxy yapılandırması yok → kontrollü hata, gezinme yok
      await page.locator("[data-hd-rel-count='3']").click();
      ok((await page.locator("[data-hd-rel-slot]").count()) === 3 && (await page.locator("[data-hd-rel-create]").innerText()).includes("Grup Analizini Oluştur"), `${d.name}: 3 kişide 3 seçici + "Grup Analizini Oluştur"`);
      await page.locator("[data-hd-rel-select='0']").selectOption(cid(1));
      await page.locator("[data-hd-rel-select='1']").selectOption(cid(3));
      await page.locator("[data-hd-rel-select='2']").selectOption(cid(5));
      await page.locator("[data-hd-rel-create]").click();
      await page.waitForTimeout(1500);
      ok(!page.url().includes("?id=") && posts.length === 2, `${d.name}: yeni grup (sunucuda anahtar yok) → hata mesajı, gezinme yok`);

      // Kayıtlı Penta
      await page.goto(`${APP}/human-design/iliski-grup?id=${PENTA}`);
      await page.locator("[data-hd-rel-view='penta']").waitFor({ timeout: 30_000 });
      ok((await page.locator("[data-hd-penta-channel]").count()) === 6 && (await page.locator("[data-hd-penta-gate]").count()) === 12 && (await page.locator("[data-hd-penta-member]").count()) === 4, `${d.name}: Penta 6 kanal + 12 kapı + 4 üye katkısı`);
      ok(await page.locator("[data-hd-rel-diagram='penta']").isVisible(), `${d.name}: Penta şeması görünür`);
      ok(!(await overflowX()), `${d.name}: Penta detayında yatay taşma yok`);
      await page.screenshot({ path: path.join(OUT, `${d.name}-penta.png`), fullPage: true });

      // Silme (yalnız bir kez): iki adımlı onay
      if (!deleted) {
        await page.goto(`${APP}/human-design/iliski-grup?id=${DISPOSABLE}`);
        await page.locator("[data-hd-rel-delete]").click();
        ok(await page.locator("[data-hd-rel-confirm-delete]").isVisible(), `${d.name}: silme iki adımlı onay ister`);
        await page.locator("[data-hd-rel-delete-confirm]").click();
        await page.waitForURL((u) => !u.toString().includes("?id="), { timeout: 30_000 });
        await page.locator(`[data-hd-rel-row="${CONN}"]`).waitFor({ timeout: 30_000 });
        ok((await page.locator(`[data-hd-rel-row="${DISPOSABLE}"]`).count()) === 0, `${d.name}: silinen analiz listeden kalktı`);
        const left = Number((await su.query(`select count(*) n from public.human_design_clients where tenant_id=$1`, [TA])).rows[0].n);
        const charts = Number((await su.query(`select count(*) n from public.human_design_charts where tenant_id=$1`, [TA])).rows[0].n);
        ok(left === 6 && charts === 6, `${d.name}: danışanlar ve bireysel analizler silinmedi`);
        deleted = true;
      }
      ok(roxyDirect === 0, `${d.name}: tarayıcıdan Roxy'ye doğrudan istek YOK`);
      await ctx.close();
    }
    ok(pageErrors.length === 0, "sayfa hatası (JS) yok", pageErrors);
  } finally {
    if (browser) await browser.close();
    if (app) {
      try {
        if (process.platform === "win32" && app.pid) spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { shell: true });
        else app.kill("SIGTERM");
      } catch { /* yok */ }
    }
    await env.stop();
  }
  console.log(`\nHD İLİŞKİ/GRUP TARAYICI: ${pass} PASS / ${fail} FAIL  (ekran görüntüleri: ${OUT})`);
  if (fail > 0) {
    console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
