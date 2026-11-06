/**
 * HD Eğitim Merkezi — OWNER CANLI TEST DÜZELTMELERİ (29.10.2026) tarayıcı testi, GERÇEK 50 kişilik paketle.
 * Gerçek Next uygulaması (`next start`) + izole embedded-postgres; içe aktarım + snapshot'lar paketten SHA doğrulamalı.
 * YAYIN YOK, sağlayıcı çağrısı YOK (localhost dışı her istek abort). Ekran görüntüleri yalnız repo DIŞI klasöre.
 *  1) Hukuk etiketleri: "Özel Hukuki İnceleme Gerekli" / "Hukuki İnceleme Yapılmadı" (istatistik, liste, filtre, ayrıntı) — eski metin yok.
 *  2) Kişi ayrıntısı AYRI sayfada; listede ayrıntı yok; geri → arama / filtre / kaydırma korunur (masaüstü + mobil).
 *  3) Büyük BodyGraph: geniş alan, yakınlaştır / uzaklaştır / sıfırla, Tam Ekran İncele; kapı rakamları okunur boyutta;
 *     50 kişide ekrandaki kapı/kanal = snapshot (regresyon).
 *  5) Aile kartları: yalnız kaynaklı aileler (Curie, Frank), roller, tek tek / tamamını seç, tamamını incele (tek sayfada
 *     yan yana / alt alta), tek kişi ayrıntı, aile dışı kişiler listede.
 * Çalıştır: npx tsx scripts/hd-education/real/owner-duzeltmeler-e2e.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <paket> --out <yeni klasör>
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../../anamnez/testEnv";
import { restoreSnapshotFile } from "./snapshot-io";

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : ""; };
const IMPORT = arg("--import"), LOCALKEY = arg("--local-key"), OWNER = arg("--owner"), PKG = arg("--pkg"), OUT = arg("--out");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG || !OUT) throw new Error("--import --local-key --owner --pkg --out zorunlu");
if (existsSync(OUT) && readdirSync(OUT).length) throw new Error(`çıktı klasörü boş değil: ${OUT}`);
mkdirSync(OUT, { recursive: true });
const PORT = 3991, APP = `http://127.0.0.1:${PORT}`, LIST = `${APP}/admin/hd-egitim-haritalari`;
let pass = 0, fail = 0; const fails: string[] = [];
const ok = (c: boolean, l: string, x?: unknown) => { if (c) { pass++; console.log(`  ✓ ${l}`); } else { fail++; fails.push(l); console.error(`  ✗ ${l}${x !== undefined ? ` → ${JSON.stringify(x).slice(0, 300)}` : ""}`); } };
const section = (s: string) => console.log(`\n[${s}]`);
let shot = 0;
const snap = async (page: Page, name: string, full = true) => { await page.screenshot({ path: path.join(OUT, `${String(++shot).padStart(2, "0")}-${name}.png`), fullPage: full }); };
async function waitHttp(url: string, ms: number) { const u = Date.now() + ms; while (Date.now() < u) { try { if ((await fetch(url)).status < 500) return; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); } throw new Error("zaman aşımı"); }
const OLD_LABELS = /E · bekliyor|Avukat incelemesi yok|avukat incelemesi yok|Hukuk \(E\)|Hukuk E\b|Düşük · avukat/;

async function main() {
  let app: ChildProcess | null = null; let browser: Browser | null = null; let env: TestEnv | null = null;
  const external: string[] = []; const pageErrors: string[] = [];
  try {
    const mig = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"]
      .map((f) => readFileSync(path.join(process.cwd(), "supabase/migrations", f), "utf8"));
    env = await startAnamnezTestEnv({ port: 54457, httpPort: Number(process.env.HD_EDU_TEST_HTTP_PORT ?? 54398), dirName: `hd-edu-duzeltme-${Date.now()}-${randomUUID().slice(0, 8)}`,
      rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible"],
      extraSql: [`create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid, target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`, ...mig] });
    const su = env.su;
    const tenant = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ')`, [tenant]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level) values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    const token = `zz-duzeltme-${randomUUID()}`;
    await su.query(`insert into public.user_sessions(user_id, session_token) values ($1,$2)`, [OWNER, token]);
    await su.query(readFileSync(LOCALKEY, "utf8"));
    await su.query(readFileSync(IMPORT, "utf8"));
    const manifest = readFileSync(path.join(PKG, "manifest.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string; natural_key: string });
    const people: Array<{ key: string; name: string; gates: number[] }> = [];
    for (const m of manifest) {
      const r = await restoreSnapshotFile(su, path.join(PKG, "snapshots", m.file), m.sha256);
      if (r !== "RESTORED") ok(false, `snapshot geri yükleme: ${m.natural_key}`, r);
      const pkg = JSON.parse(readFileSync(path.join(PKG, "snapshots", m.file), "utf8")) as { subject: { display_name: string }; chart: { provider_raw: { gates: Array<{ gate: number }> } } };
      people.push({ key: m.natural_key, name: pkg.subject.display_name, gates: [...new Set(pkg.chart.provider_raw.gates.map((g) => g.gate))].sort((a, b) => a - b) });
    }
    const dbBefore = (await su.query(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c,
      (select count(*) from public.hd_education_publications where status <> 'draft')::int p, (select count(*) from public.hd_education_subjects where legal_status='E')::int e,
      (select count(*) from public.hd_education_subjects where legal_status='LOW_UNREVIEWED')::int u`)).rows[0];
    ok(dbBefore.s === 50 && dbBefore.c === 50 && dbBefore.p === 0, "50 kişi + 50 snapshot, tümü taslak", dbBefore);
    const idOf = new Map((await su.query(`select id, natural_key from public.hd_education_subjects`)).rows.map((r: { id: string; natural_key: string }) => [r.natural_key, r.id]));

    const appEnv: Record<string, string | undefined> = { ...process.env, NEXT_TELEMETRY_DISABLED: "1", SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY };
    delete appEnv.HD_EDUCATION_CATALOG_ENABLED; delete appEnv.HD_EDUCATION_PROVIDER_CALLS_ENABLED; delete appEnv.HD_PRIVATE_EDUCATION_ENABLED; delete appEnv.ROXY_API_KEY;
    app = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { cwd: process.cwd(), shell: process.platform === "win32", env: appEnv as NodeJS.ProcessEnv, stdio: "ignore" });
    await waitHttp(`${APP}/`, 180_000);
    browser = await chromium.launch();
    const ctxFor = async (vp: { w: number; h: number; m: boolean }) => {
      const ctx = await browser!.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.m, hasTouch: vp.m, locale: "tr-TR", timezoneId: "Europe/Istanbul" });
      await ctx.addCookies([{ name: "yasam_admin_session", value: token, url: APP }, { name: "NEXT_LOCALE", value: "tr", url: APP }]);
      const profile = { id: OWNER, tenant_id: tenant, full_name: "Yerel Owner", role: "admin", active: true, approval_status: "approved", is_demo_account: false };
      await ctx.addInitScript(([pu, tok]) => { localStorage.setItem("yasam_user", pu as string); localStorage.setItem("yasam_session_token", tok as string); }, [JSON.stringify(profile), token]);
      await ctx.route("**/*", async (route) => { const u = new URL(route.request().url()); if (u.origin !== APP) { external.push(u.href); return route.abort(); } return route.continue(); });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(String(e)));
      return { ctx, page };
    };
    const noH = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const openList = async (page: Page, qs = "") => { await page.goto(`${LIST}${qs}`, { waitUntil: "load" }); await page.locator("tbody tr[data-edu-row]").first().waitFor({ timeout: 30_000 }); };
    const detail = (page: Page) => page.locator("section[aria-label$='ayrıntıları']");
    const waitDetail = async (page: Page) => { await detail(page).getByText(/Önizleme — snapshot v1/).waitFor({ timeout: 30_000 }); await page.locator("[data-edu-bg-graph]").first().waitFor({ timeout: 20_000 }); };

    for (const vp of [{ n: "masaustu", w: 1440, h: 900, m: false }, { n: "mobil", w: 390, h: 844, m: true }]) {
      const { ctx, page } = await ctxFor(vp);
      // ── 1) Hukuk etiketleri ─────────────────────────────────────────────────
      section(`1. Hukuk etiketleri — ${vp.n}`);
      await openList(page);
      const statE = (await page.locator("[data-edu-stat='legalE']").innerText()).replace(/\s+/g, " ").trim();
      const statU = (await page.locator("[data-edu-stat='legalUnreviewed']").innerText()).replace(/\s+/g, " ").trim();
      ok(statE === `${dbBefore.e} Özel Hukuki İnceleme Gerekli`, `istatistik: "${statE}"`, statE);
      ok(statU === `${dbBefore.u} Hukuki İnceleme Yapılmadı`, `istatistik: "${statU}"`, statU);
      const body = await page.locator("main").innerText();
      ok(!OLD_LABELS.test(body), "listede eski hukuk metni yok (E · bekliyor / Avukat incelemesi yok / Hukuk (E))", body.match(OLD_LABELS)?.[0]);
      const opts = await page.getByLabel("Hukuki durum").locator("option").allInnerTexts();
      ok(opts.includes("Özel Hukuki İnceleme Gerekli") && opts.includes("Hukuki İnceleme Yapılmadı"), "filtre seçenekleri yeni etiketlerle", opts);
      ok(/Özel hukuki inceleme gerekli/.test(body) && /Hukuki inceleme yapılmadı/.test(body), "satır engel etiketleri yeni metinle");
      if (vp.n === "masaustu") await snap(page, "1-hukuk-etiketleri-liste", false);

      // ── 2) Ayrı kişi sayfası + geri dönüş ────────────────────────────────────
      section(`2. Ayrı kişi sayfası — ${vp.n}`);
      await page.getByLabel("Hukuki durum").selectOption("LOW_UNREVIEWED");
      await page.getByLabel("Kişi adı ara").fill("curie");
      await page.waitForFunction(() => /ara=curie/.test(location.search) && /hukuk=LOW_UNREVIEWED/.test(location.search), null, { timeout: 10_000 });
      ok((await page.locator("tbody tr").count()) === 2, "filtre + arama → 2 satır (Marie + Irène)");
      await page.locator("tbody tr").filter({ hasText: "Marie Curie" }).click();
      await page.waitForURL(/\/admin\/hd-egitim-haritalari\/kisi\/[0-9a-f-]{36}$/, { timeout: 20_000 });
      await waitDetail(page);
      ok(page.url().endsWith(`/kisi/${idOf.get("marie-curie-1867-11-07")}`), "ayrı sayfa URL'si kişi kimliğiyle");
      ok((await page.locator("tbody tr[data-edu-row]").count()) === 0, "ayrıntı sayfasında 50 kişilik liste YOK");
      const dt = await detail(page).innerText();
      ok(/Doğum verisi ve UTC/.test(dt) && /Kaynaklar/.test(dt) && /Hukuki durum ve yayın engelleri/.test(dt) && /Yayın kontrol listesi/.test(dt) && /Onay geçmişi/.test(dt), "ayrıntı: doğum + kaynak + hukuk + yayın kontrol listesi + onay geçmişi");
      ok(/Hukuki İnceleme Yapılmadı/.test(dt) && !OLD_LABELS.test(dt), "ayrıntı etiketleri yeni metinle");
      ok(await noH(page), `${vp.n}: kişi sayfasında yatay taşma yok`);
      await snap(page, `2-kisi-sayfasi-${vp.n}`);
      await page.locator("[data-edu-back]").first().click();
      await page.locator("tbody tr[data-edu-row]").first().waitFor({ timeout: 20_000 });
      ok(/ara=curie/.test(page.url()) && /hukuk=LOW_UNREVIEWED/.test(page.url()), "geri → URL'de arama + filtre korunur", page.url());
      ok(await page.getByLabel("Kişi adı ara").inputValue() === "curie" && await page.getByLabel("Hukuki durum").inputValue() === "LOW_UNREVIEWED", "geri → arama kutusu + filtre seçimi korunur");
      ok((await page.locator("tbody tr").count()) === 2, "geri → aynı 2 satır");
      // Liste konumu: alt sıradaki kişiye in, aç, geri dön.
      await openList(page);
      const last = page.locator("tbody tr").filter({ hasText: "Wolfgang Amadeus Mozart" });
      await last.scrollIntoViewIfNeeded();
      const yBefore = await page.evaluate(() => window.scrollY);
      await last.click();
      await page.waitForURL(/\/kisi\//, { timeout: 20_000 });
      await waitDetail(page);
      await page.locator("[data-edu-back]").first().click();
      await page.locator("tbody tr[data-edu-row]").first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      const yAfter = await page.evaluate(() => window.scrollY);
      ok(yBefore > 300 && Math.abs(yAfter - yBefore) < 120, `geri → liste konumu korunur (${Math.round(yBefore)} → ${Math.round(yAfter)})`, { yBefore, yAfter });

      // ── 3) Büyük BodyGraph ───────────────────────────────────────────────────
      section(`3. Büyük BodyGraph — ${vp.n}`);
      await page.goto(`${APP}/admin/hd-egitim-haritalari/kisi/${idOf.get("albert-einstein-1879-03-14") ?? [...idOf.values()][0]}`, { waitUntil: "load" });
      await waitDetail(page);
      const g = page.locator("[data-edu-bg-graph]").first();
      await g.scrollIntoViewIfNeeded();
      const gb = (await g.boundingBox())!;
      const vpH = vp.h, vpW = vp.w;
      if (vp.n === "masaustu") ok(gb.height >= 0.68 * vpH, `masaüstü: BodyGraph yüksekliği ${Math.round(gb.height)}px (≥ %68 ekran)`, gb);
      else ok(gb.width >= 0.82 * vpW, `mobil: BodyGraph genişliği ${Math.round(gb.width)}px (≥ %82 ekran)`, gb);
      const cols = await page.locator("[data-edu-bg-col]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: r.top + scrollY, left: r.left, w: r.width }; }));
      const gTop = gb.y + (await page.evaluate(() => scrollY));
      ok(cols.length === 2, "sol ve sağ gezegen listeleri korunur");
      if (vp.n === "masaustu") ok(cols.every((c) => Math.abs(c.top - gTop) < 80) && cols[0].left < gb.x && cols[1].left > gb.x + gb.width - 5, "masaüstü: gezegen listeleri haritanın iki yanında", { cols, gb });
      else ok(cols.every((c) => c.top > gTop + gb.height - 5), "mobil: gezegen listeleri haritanın ALTINDA (haritayı daraltmaz)", { cols, gTop, h: gb.height });
      // Kapı rakamlarının okunur boyutu (SVG içindeki 1–64 sayı metinleri).
      const gateFont = await g.evaluate((el) => {
        const hs = [...el.querySelectorAll("svg text")].filter((t) => /^\d{1,2}$/.test((t.textContent ?? "").trim())).map((t) => t.getBoundingClientRect().height).filter((h) => h > 0).sort((a, b) => a - b);
        return { n: hs.length, median: hs.length ? hs[Math.floor(hs.length / 2)] : 0 };
      });
      ok(gateFont.n >= 60, `kapı rakamları: ${gateFont.n} etiket çizili, sığdırılmış görünümde ortanca ${gateFont.median.toFixed(1)}px`, gateFont);
      await snap(page, `3-bodygraph-buyuk-${vp.n}`, false);
      // Okuma düzeyi: masaüstü %200, mobil %400 (en büyük) — rakamlar ≥ 9,5 px (çizim yeniden yapılır, oran değişmez).
      const clicks = vp.n === "masaustu" ? 4 : 12;
      const pct = 100 + clicks * 25;
      for (let i = 0; i < clicks; i++) await page.locator("[data-edu-bg-in]").first().click();
      await page.waitForTimeout(500);
      const gz = (await g.boundingBox())!;
      ok(Math.abs(gz.height / gb.height - pct / 100) < 0.06 && Math.abs(gz.width / gz.height - gb.width / gb.height) < 0.01, `yakınlaştır → %${pct} (${Math.round(gb.height)} → ${Math.round(gz.height)}px, oran korunur)`, { gb, gz });
      ok((await page.locator("[data-edu-bg-pct]").first().innerText()).trim() === `%${pct}`, `yakınlaştırma göstergesi %${pct}`);
      const gateFontZ = await g.evaluate((el) => { const hs = [...el.querySelectorAll("svg text")].filter((t) => /^\d{1,2}$/.test((t.textContent ?? "").trim())).map((t) => t.getBoundingClientRect().height).sort((a, b) => a - b); return hs[Math.floor(hs.length / 2)] ?? 0; });
      ok(gateFontZ >= 9.5, `%${pct}'de kapı rakamları okunur: ortanca ${gateFontZ.toFixed(1)}px (≥ 9,5)`);
      await snap(page, `3-bodygraph-yakinlastirma-${vp.n}`, false);
      await page.locator("[data-edu-bg-out]").first().click();
      await page.waitForTimeout(300);
      ok((await page.locator("[data-edu-bg-pct]").first().innerText()).trim() === `%${pct - 25}`, `uzaklaştır → %${pct - 25}`);
      await page.locator("[data-edu-bg-reset]").first().click();
      await page.waitForTimeout(300);
      const gr = (await g.boundingBox())!;
      ok(Math.abs(gr.height - gb.height) < 3 && (await page.locator("[data-edu-bg-pct]").first().innerText()).trim() === "%100", "görünümü sıfırla → %100, ilk boyut");
      await page.locator("[data-edu-bg-full]").first().click();
      const fs = page.locator("[data-edu-bg-fullscreen]");
      await fs.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(500);
      const fg = (await fs.locator("[data-edu-bg-graph]").boundingBox())!;
      ok(fg.height >= 0.62 * vpH || fg.width >= 0.85 * vpW, `Tam Ekran İncele: harita ${Math.round(fg.width)}×${Math.round(fg.height)}px`, fg);
      await fs.locator("[data-edu-bg-in]").click();
      await page.waitForTimeout(300);
      ok((await fs.locator("[data-edu-bg-pct]").innerText()).trim() === "%125", "tam ekranda yakınlaştırma çalışır");
      await snap(page, `3-bodygraph-tam-ekran-${vp.n}`, false);
      await page.keyboard.press("Escape");
      await fs.waitFor({ state: "detached", timeout: 5_000 });
      ok(true, "Esc → tam ekran kapanır");
      // Snapshot regresyonu: ekrandaki aktif kapılar = paket (masaüstünde 50 kişi, mobilde 5).
      let same = 0; const diff: string[] = [];
      for (const p of (vp.n === "masaustu" ? people : people.slice(0, 5))) {
        await page.goto(`${APP}/admin/hd-egitim-haritalari/kisi/${idOf.get(p.key)}`, { waitUntil: "load" });
        await waitDetail(page);
        const shown = [...new Set(await page.locator("[data-edu-chart-facts] [data-hd-gate]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-hd-gate")))))].sort((a, b) => a - b);
        const svgGates = await page.locator("[data-edu-bg-graph] svg").count();
        if (JSON.stringify(shown) === JSON.stringify(p.gates) && svgGates > 0) same++; else diff.push(p.key);
      }
      const total = vp.n === "masaustu" ? people.length : 5;
      ok(same === total, `BodyGraph regresyonu: ${same}/${total} kişide ekrandaki kapılar = kayıtlı snapshot`, diff.slice(0, 5));

      // ── 5) Aile kartları ─────────────────────────────────────────────────────
      section(`5. Aile kartları — ${vp.n}`);
      await openList(page);
      const fams = await page.locator("[data-edu-family]").evaluateAll((els) => els.map((e) => e.getAttribute("data-edu-family")));
      // 30.10.2026: aynı ölçütle (iki kaynaklı biyografi) doğrulanan II. Elizabeth – Margaret kardeşliği eklendi; tek taraflı
      // Victoria bağı EKLENMEDİ.
      ok(JSON.stringify(fams) === JSON.stringify(["curie", "frank", "kraliyet-kardesler"]), "yalnız kaynaklı aileler: Curie + Frank + Kraliyet kız kardeşler (Victoria bağı eklenmedi)", fams);
      const curie = page.locator("[data-edu-family='curie']");
      const ct = await curie.innerText();
      ok(/Curie Ailesi/.test(ct) && /Marie Curie[\s\S]*Anne/.test(ct) && /Irène Joliot-Curie[\s\S]*Kız/.test(ct) && /anne – kız/.test(ct), "Curie: roller (Anne / Kız) + akrabalık bağlantısı");
      const ft = await page.locator("[data-edu-family='frank']").innerText();
      ok(/Frank Ailesi/.test(ft) && /Otto Frank[\s\S]*Baba/.test(ft) && /Anne Frank[\s\S]*Kız/.test(ft) && /baba – kız/.test(ft), "Frank: roller (Baba / Kız) + akrabalık bağlantısı");
      ok((await page.locator("tbody tr").count()) === 50, "aile üyeleri dahil 50 kişi normal listede kalır");
      ok(await noH(page), `${vp.n}: aile kartları ile yatay taşma yok`);
      await curie.scrollIntoViewIfNeeded();
      await snap(page, `5-aile-kartlari-${vp.n}`, false);
      await curie.locator("[data-edu-family-pick='irene-joliot-curie-1897-09-12']").check();
      ok((await curie.locator("[data-edu-family-selected]").innerText()).includes("Seçili kişiyi incele"), "tek kişi seçimi → 'Seçili kişiyi incele'");
      await curie.locator("[data-edu-family-all]").click();
      ok(await curie.locator("input[type=checkbox]:checked").count() === 2, "Ailenin Tamamını Seç → 2/2 seçili");
      await curie.locator("[data-edu-family-all]").click();
      await curie.locator("[data-edu-family-pick='irene-joliot-curie-1897-09-12']").check();
      await curie.locator("[data-edu-family-selected]").click();
      await page.waitForURL(new RegExp(`/kisi/${idOf.get("irene-joliot-curie-1897-09-12")}$`), { timeout: 20_000 });
      await waitDetail(page);
      ok(/Irène Joliot-Curie/.test(await detail(page).innerText()), "seçili tek kişi → yalnız o kişinin ayrıntı sayfası");
      await openList(page);
      await page.locator("[data-edu-family='curie'] [data-edu-family-review]").click();
      await page.waitForURL(/\/aile\/curie$/, { timeout: 20_000 });
      await page.locator("[data-edu-family-member] [data-edu-bg-graph]").nth(1).waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-edu-family-grid='2'] [data-edu-bg-viewer]").count() === 2, "Ailenin Tamamını İncele → 2 BodyGraph tek sayfada");
      const boxes = await page.locator("[data-edu-family-member]").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top + scrollY), left: Math.round(r.left) }; }));
      if (vp.n === "masaustu") ok(boxes[0].top === boxes[1].top && boxes[1].left > boxes[0].left, "masaüstü: haritalar YAN YANA", boxes);
      else ok(boxes[1].top > boxes[0].top, "mobil: haritalar ALT ALTA", boxes);
      ok(/Marie Curie[\s\S]*⟷[\s\S]*Irène Joliot-Curie/.test(await page.locator("main").innerText()), "aile sayfasında akrabalık bağlantısı");
      ok(await noH(page), `${vp.n}: aile sayfasında yatay taşma yok`);
      await snap(page, `5-aile-tamami-curie-${vp.n}`);
      await page.locator("[data-edu-family-member] [data-edu-bg-full]").nth(1).click();
      await page.locator("[data-edu-bg-fullscreen]").waitFor({ timeout: 10_000 });
      ok(/Irène Joliot-Curie/.test(await page.locator("[data-edu-bg-fullscreen]").innerText()), "aile sayfasında her harita tek tek büyütülür (Tam Ekran)");
      await page.keyboard.press("Escape");
      await page.goto(`${APP}/admin/hd-egitim-haritalari/aile/frank`, { waitUntil: "load" });
      await page.locator("[data-edu-family-member] [data-edu-bg-graph]").nth(1).waitFor({ timeout: 30_000 });
      ok(await page.locator("[data-edu-bg-viewer]").count() === 2, "Frank ailesi: 2 BodyGraph tek sayfada");
      if (vp.n === "masaustu") await snap(page, "5-aile-tamami-frank-masaustu");
      await ctx.close();
    }
    section("Veri bütünlüğü");
    const dbAfter = (await su.query(`select (select count(*) from public.hd_education_subjects)::int s, (select count(*) from public.hd_education_charts)::int c,
      (select count(*) from public.hd_education_publications where status <> 'draft')::int p, (select count(*) from public.hd_education_access_grants)::int g`)).rows[0];
    ok(dbAfter.s === 50 && dbAfter.c === 50 && dbAfter.p === 0 && dbAfter.g === 0, "50 kişi / 50 snapshot değişmedi, tümü taslak, eğitmen yetkisi 0", dbAfter);
    ok(external.length === 0, `dış ağ isteği 0 (${external.length})`, external.slice(0, 3));
    ok(pageErrors.length === 0, `JS hatası 0 (${pageErrors.length})`, pageErrors.slice(0, 2));
  } finally {
    await browser?.close().catch(() => undefined);
    if (app?.pid) { if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" }); else app.kill("SIGTERM"); }
    await new Promise((r) => setTimeout(r, 1500));
    await env?.stop().catch(() => undefined);
  }
  console.log(`\nOWNER DÜZELTMELERİ E2E: ${pass} PASS / ${fail} FAIL · ${OUT}`);
  if (fail) { console.error(" - " + fails.join("\n - ")); process.exit(1); }
}
main().catch((e) => { console.error("çöktü:", e); process.exit(1); });
