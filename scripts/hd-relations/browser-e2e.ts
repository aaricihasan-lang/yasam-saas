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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { chromium, type Browser } from "playwright";
import JSZip from "jszip";
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
create table public.human_design_knowledge_records (
  id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, category text, title text, code text, content text,
  keywords jsonb default '[]', related_gates jsonb default '[]', related_channels jsonb default '[]', related_centers jsonb default '[]', tags jsonb default '[]',
  sort_order int default 0, is_active boolean default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  expert_notes text
);
grant select, insert, update, delete on public.human_design_clients, public.human_design_charts, public.human_design_knowledge_records to service_role;
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

  const env: TestEnv = await startAnamnezTestEnv({ port: 54433, dirName: "hd-relations-browser-pgdata", httpPort: 54523, extraSql: [HD_DDL, src("supabase/migrations/20271102000000_hd_relation_analyses.sql"), src("supabase/migrations/20271103000000_hd_relation_comments_reports.sql")] });
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
    // HD_E2E_ONLY=390,1920 → yalnız seçilen ekranlar (hızlı tanı)
    const only = (process.env.HD_E2E_ONLY ?? "").split(",").filter(Boolean);
    for (const d of DEVICES.filter((x) => !only.length || only.includes(x.name))) {
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
      // Birleşik İlişki BodyGraph'ı (Yaşam Sistemi silüetli, mühürlü V9): çizilen kanallar/kapılar = kayıtlı sonuç (DB'den)
      await page.locator("[data-hd-composite='ok']").waitFor({ timeout: 30_000 });
      const storedRes = (await su.query(`select result from public.human_design_relation_analyses where id=$1`, [CONN])).rows[0].result as { channels: Array<{ id: string; gateA: number; gateB: number; personAGates: number[]; personBGates: number[] }>; centers: Array<{ defined: boolean }> };
      const stored = storedRes.channels;
      const storedIds = stored.map((c) => c.id).sort().join(",");
      const drawnAttr = (await page.locator("[data-hd-composite='ok']").getAttribute("data-hd-composite-defined")) ?? "";
      const halfAttr = (await page.locator("[data-hd-composite='ok']").getAttribute("data-hd-composite-half")) ?? "";
      const expGates: Record<string, string> = {};
      for (const c of stored) for (const g of [c.gateA, c.gateB]) expGates[g] = `${c.personAGates.includes(g) || expGates[g]?.includes("A") ? "A" : ""}${c.personBGates.includes(g) || expGates[g]?.includes("B") ? "B" : ""}`;
      const chart = await page.evaluate(() => {
        const svg = document.querySelector("svg[data-hd-cbg]")!;
        const gates: Record<string, string> = {};
        for (const n of svg.querySelectorAll("[data-hd-cbg-gate]")) {
          const [g, h] = (n.getAttribute("data-hd-cbg-gate") ?? "").split(":");
          gates[g] = h;
        }
        const markers = [...svg.querySelectorAll("[data-hd-cbg-marker]")].map((m) => m.getAttribute("data-hd-cbg-marker") ?? "").sort();
        const filled = new Set([...svg.querySelectorAll("[data-hd-cbg-fill]")].flatMap((f) => (f.getAttribute("data-hd-cbg-fill") ?? "").split(",")));
        const texts = [...svg.querySelectorAll("text")].map((t) => t.textContent ?? "");
        const r = svg.getBoundingClientRect();
        return {
          gates,
          markers,
          filled: [...filled].sort(),
          centers: svg.querySelectorAll("[data-hd-cbg-center]").length,
          definedCenters: svg.querySelectorAll("[data-hd-cbg-center$=':defined']").length,
          hits: svg.querySelectorAll("[data-hd-cbg-hit]").length,
          silhouette: !!svg.querySelector("[data-cbg-silhouette]"),
          palette: svg.getAttribute("data-hd-cbg-palette"),
          logo: !!svg.querySelector("[data-hd-cbg-logo]"),
          trCenters: ["BAŞ", "AJNA", "BOĞAZ", "G", "KALP", "SAKRAL", "KÖK", "DALAK", "SOLAR"].every((c) => texts.includes(c)),
          width: r.width,
        };
      });
      const gateOk = Object.entries(expGates).every(([g, w]) => { const h = chart.gates[g]; return w === "AB" ? h === "both" : h === w || h === "both"; });
      ok(drawnAttr.split(",").sort().join(",") === storedIds && chart.markers.length === 0 && gateOk, `${d.name}: birleşik BodyGraph — tanımlı kanallar ve kanal kapıları (A/B) = kayıtlı sonuç; grafikte işaret yok (${stored.length} kanal)`, { chart: chart.gates, expGates, markers: chart.markers });
      const pageHalf = (await page.locator("[data-hd-half-channel]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-half-channel") ?? ""))).sort().join(",");
      ok(halfAttr === pageHalf && halfAttr.length > 0 && chart.filled.every((c) => storedIds.split(",").includes(c) || halfAttr.split(",").includes(c)), `${d.name}: grafikteki yarım kanallar = liste (${halfAttr.split(",").length}); yalnız tanımlı / yarım kanallar boyalı`);
      ok(chart.centers === 9 && Object.keys(chart.gates).length === 64 && chart.hits === 36 && chart.definedCenters === storedRes.centers.filter((c) => c.defined).length, `${d.name}: 9 merkez, 64 kapı, 36 kanal hedefi; tanımlı merkezler`, chart);
      ok(chart.silhouette && chart.logo && chart.trCenters, `${d.name}: insan silüeti + logo grafikte; merkez adları Türkçe`, chart);
      ok(chart.palette === "connection", `${d.name}: Connection paleti mavi / turuncu (bireysel siyah / kırmızı uygulanmaz)`, chart.palette);
      const vw = d.w;
      ok(d.ua ? chart.width <= vw && chart.width >= vw - 90 : chart.width >= 520, `${d.name}: grafik genişliği ${Math.round(chart.width)}px (${d.ua ? "ekrana sığar" : "masaüstünde büyük"})`);
      ok(await page.locator("[data-hd-composite-legend]").isVisible(), `${d.name}: Türkçe lejant görünür`);
      // Seçimsiz grafik görüntüsü (owner referans karşılaştırması)
      await page.locator("svg[data-hd-cbg]").screenshot({ path: path.join(OUT, `${d.name}-connection-bodygraph-clean.png`) });
      // Etkileşim: kanal ortasına fare / dokunma (telefonda büyütülmüş harita); klavye (odak + Enter)
      if (d.ua) {
        await page.locator("[data-hd-composite-zoom]").click();
        await page.waitForTimeout(250);
      }
      // Hedef: kayıtlı ilk kanal; dokunma noktası = kanal boyunca ekranda görünen ve en üstte o kanalın hedefi olan nokta.
      const target = stored[0].id;
      await page.locator(`[data-hd-cbg-hit='${target}']`).scrollIntoViewIfNeeded();
      await page.evaluate("window.__name = window.__name || ((f) => f)"); // tsx yardımcısı tarayıcıda yok
      const pt2 = await page.evaluate((id) => {
        const el = document.querySelector(`[data-hd-cbg-hit='${id}']`) as SVGGeometryElement;
        const sc = document.querySelector("[data-hd-composite-scroll]") as HTMLElement;
        const L = el.getTotalLength();
        const at = (t: number) => {
          const p = el.getPointAtLength(L * t);
          const m = el.getScreenCTM()!;
          return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
        };
        const mid = at(0.5);
        sc.scrollLeft += mid.x - window.innerWidth / 2;
        window.scrollBy(0, mid.y - window.innerHeight / 2);
        for (const t of [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7]) {
          const q = at(t);
          if (q.x < 4 || q.y < 4 || q.x > window.innerWidth - 4 || q.y > window.innerHeight - 4) continue;
          const top = document.elementFromPoint(q.x, q.y)?.getAttribute("data-hd-cbg-hit") ?? null;
          if (top === id) return { x: q.x, y: q.y, top };
        }
        return { x: mid.x, y: mid.y, top: null as string | null, sw: sc.scrollWidth, cw: sc.clientWidth };
      }, target);
      if (d.ua) await page.touchscreen.tap(pt2.x, pt2.y);
      else await page.mouse.move(pt2.x, pt2.y);
      await page.waitForTimeout(150);
      const infoAfterPointer = await page.locator("[data-hd-composite-info]").getAttribute("data-hd-composite-info");
      if (process.env.HD_E2E_DEBUG) console.log("DEBUG", JSON.stringify(await page.evaluate((p) => ({ top: document.elementFromPoint(p.x, p.y)?.getAttribute("data-hd-cbg-hit"), active: document.activeElement?.getAttribute("data-hd-cbg-hit"), vv: [visualViewport?.offsetLeft, visualViewport?.offsetTop, visualViewport?.scale, visualViewport?.width], sx: [scrollX, scrollY], iw: innerWidth }), pt2)));
      ok(!!pt2.top && infoAfterPointer === pt2.top && (await page.locator("[data-hd-composite-info]").innerText()).includes("kapı"), `${d.name}: ${d.ua ? "dokunma" : "fare"} ile kanal seçimi → bilgi paneli (${pt2.top})`, { pt2, infoAfterPointer });
      const kb = stored[stored.length - 1].id;
      await page.locator(`[data-hd-cbg-hit='${kb}']`).focus();
      await page.keyboard.press("Enter");
      ok((await page.locator("[data-hd-composite-info]").getAttribute("data-hd-composite-info")) === kb && (await page.locator("svg[data-hd-cbg]").getAttribute("data-hd-cbg-selected")) === kb, `${d.name}: klavye (odak + Enter) ile kanal seçimi (${kb})`);
      if (d.ua) {
        const zw = await page.evaluate(() => document.querySelector("svg[data-hd-cbg]")!.getBoundingClientRect().width);
        ok(zw >= 800 && !(await overflowX()), `${d.name}: "Haritayı büyüt" → grafik ${Math.round(zw)}px, sayfa yatay taşmıyor (kaydırma kabı içinde)`);
        await page.locator("[data-hd-composite-zoom]").click();
      } else {
        ok(!(await page.locator("[data-hd-composite-zoom]").isVisible()), `${d.name}: masaüstünde büyütme düğmesi yok`);
      }
      await page.locator("svg[data-hd-cbg]").screenshot({ path: path.join(OUT, `${d.name}-connection-bodygraph.png`) });
      ok((await page.locator("[data-hd-rel-channel]").count()) === stored.length && (await page.locator("[data-hd-rel-dynamic]").count()) >= 1, `${d.name}: kanal listesi bağlantı türüne göre Türkçe (${stored.length})`);
      const halfIds = await page.locator("[data-hd-half-channel]").evaluateAll((els) => els.map((e) => e.getAttribute("data-hd-half-channel") ?? ""));
      ok(halfIds.length > 0 && halfIds.every((h) => !storedIds.split(",").includes(h)) && (await page.locator("[data-hd-person-gates]").count()) === 2, `${d.name}: yarım kanallar (${halfIds.length}) + iki kişinin tüm aktif kapıları listede`);
      ok((await page.locator("[data-hd-rel-summary]").count()) === 4 && (await page.locator("[data-hd-rel-center-row]").count()) === 9, `${d.name}: 4 bağlantı türü sayacı + 9 birleşik merkez`);
      ok((await page.locator("[data-hd-rel-participant='A']").innerText()).includes(NAMES[0]) && (await page.locator("[data-hd-rel-participant='B']").innerText()).includes(NAMES[1]), `${d.name}: A/B katılımcıları doğru adlarla`);
      ok(!(await overflowX()), `${d.name}: Connection detayında yatay taşma yok`);
      const bodyText = await page.locator("body").innerText();
      ok(!/roxy|nodeType|\/human-design\/connection/i.test(bodyText), `${d.name}: ekranda sağlayıcı adı / uç / nodeType YOK`);
      // Yorum kaynakları
      await page.locator("[data-hd-rel-source='analysis']").waitFor({ timeout: 30_000 });
      ok((await page.locator("[data-hd-rel-source-tab]").count()) === 2, `${d.name}: normal uzmanda 2 kaynak sekmesi (Analiz Açıklamaları + Bilgi Bankam; Sistem Yorumu / Merkezi yok)`);
      await page.locator("[data-hd-rel-source-tab='expert']").click();
      await page.locator("[data-hd-rel-source='expert']").waitFor({ timeout: 10_000 });
      // Uzman Yorumu: yaz → kaydet → yeniden aç
      await page.locator("[data-hd-rel-comment='ready']").waitFor({ timeout: 30_000 });
      const note = `Uzman yorumu (${d.name})`;
      await page.locator("[data-hd-rel-comment-input]").fill(note);
      await page.locator("[data-hd-rel-comment-save]").click();
      await page.waitForFunction(() => !document.querySelector("[data-hd-rel-comment-save]") || (document.querySelector("[data-hd-rel-comment-save]") as HTMLButtonElement).disabled, null, { timeout: 15_000 });
      await page.reload();
      await page.locator("[data-hd-rel-comment='ready']").waitFor({ timeout: 30_000 });
      ok((await page.locator("[data-hd-rel-comment-input]").inputValue()) === note, `${d.name}: Uzman Yorumu kaydedildi ve yeniden açınca aynı`);
      // Rapor: Android'de gizli; diğerlerinde seçimler varsayılan kapalı
      const repVisible = await page.locator("[data-hd-rel-reports]").isVisible();
      const wordVisible = await page.locator("[data-hd-rel-word]").isVisible();
      ok(d.name === "360-android" ? !repVisible && !wordVisible : repVisible && wordVisible, `${d.name}: rapor bölümü ${d.name === "360-android" ? "Android'de gizli" : "görünür"}`);
      if (repVisible) {
        await page.locator("[data-hd-rel-report-open]").click();
        await page.locator("[data-hd-rel-report-dialog]").waitFor();
        const checks = await page.locator("[data-hd-rel-report-opt]").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked));
        ok(checks.length === 3 && checks.every((c) => !c), `${d.name}: Raporu Hazırla — 3 seçenek, hepsi varsayılan KAPALI`);
        if (!d.ua) {
          await page.locator("[data-hd-rel-report-opt='expert_comment']").check();
          await page.locator("[data-hd-rel-report-prepared]").fill("Uzm. Tarayıcı");
          const dl = page.waitForEvent("download", { timeout: 30_000 });
          await page.locator("[data-hd-rel-report-create]").click();
          const file = await dl;
          ok(/^HD-Iliski-.*\.docx$/.test(file.suggestedFilename()), `${d.name}: rapor hazırlandı ve Word indirildi (${file.suggestedFilename()})`);
          const docPath = path.join(OUT, `${d.name}-rapor.docx`);
          await file.saveAs(docPath);
          const z = await JSZip.loadAsync(readFileSync(docPath));
          const docXml = await z.file("word/document.xml")!.async("string");
          const media = Object.keys(z.files).filter((f) => /^word\/media\/.+\.png$/.test(f));
          const pngs = await Promise.all(media.map((f) => z.file(f)!.async("nodebuffer")));
          const chartPng = pngs.find((b) => b.readUInt32BE(16) === 1100);
          ok(docXml.includes("Aktif kapı kanalın kendi yarısını") && media.length === 2 && !!chartPng && chartPng.readUInt32BE(20) === Math.round((1100 * 752) / 602) && docXml.includes("Yarım Kanallar ve Aktif Kapılar"), `${d.name}: Word'de silüetli birleşik BodyGraph (ekrandaki sahne, sunucuda) + logo + lejant + yarım kanallar`, media);
          if (chartPng) writeFileSync(path.join(OUT, `${d.name}-word-bodygraph.png`), chartPng);
          await page.locator("[data-hd-rel-report-row]").first().waitFor({ timeout: 15_000 });
        } else {
          await page.keyboard.press("Escape");
        }
      }
      await page.screenshot({ path: path.join(OUT, `${d.name}-connection.png`), fullPage: true });
      // Geri tuşu (Android/tarayıcı) → listeye döner
      await page.goBack();
      await page.locator("[data-hd-rel-builder]").waitFor({ timeout: 30_000 });
      ok(!page.url().includes("?id="), `${d.name}: geri tuşu analiz listesine döner`);

      // Penta: 3 kişi seçimi, yeni üçlü → sunucuda Roxy yapılandırması yok → kontrollü hata, gezinme yok
      await page.locator("[data-hd-rel-count='3']").click();
      await page.waitForFunction(() => document.querySelectorAll("[data-hd-rel-slot]").length === 3, null, { timeout: 5000 }).catch(() => undefined);
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
      ok(await page.locator("[data-hd-scene='penta']").isVisible(), `${d.name}: Penta şeması görünür`);
      const pHit = page.locator("[data-hd-scene-hit='2-14']");
      const pentaSelected = () => page.waitForFunction(() => document.querySelector("[data-hd-penta-info]")?.getAttribute("data-hd-penta-info") === "2-14", null, { timeout: 3000 }).then(() => true, () => false);
      await pHit.scrollIntoViewIfNeeded();
      if (d.ua) await pHit.tap({ force: true }); else await pHit.hover({ force: true });
      if (!(await pentaSelected())) {
        // Tek yeniden deneme (dokunma, kaydırma animasyonu bitmeden düşmüş olabilir).
        if (d.ua) await pHit.tap({ force: true }); else await pHit.hover({ force: true });
        await pentaSelected();
      }
      ok((await page.locator("[data-hd-penta-info]").getAttribute("data-hd-penta-info")) === "2-14" && (await page.locator("[data-hd-penta-info]").innerText()).includes("14. kapı"), `${d.name}: Penta kanalına dokunma → kapılar ve taşıyan üyeler`);
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
