/**
 * Şifa Rehberi V2 — TAMAMLAMA kabulü (23.11): yeni ana ekran + Araştırma Kütüphanem araması + sarı vurgulama +
 * geçici "İncelendi" + Storage görsel hattı + güvenlik (2 tenant) — GERÇEK `next dev` + Playwright + GERÇEK test projesi.
 *
 * Yalnız ayrı test projesi (guard.ts FAIL-CLOSED). Sentetik ZZ_ tenant/kullanıcı/oturum; production'a hiçbir istek yok
 * (süreç içi fetch çiti + tarayıcıda localhost/test projesi dışı istekler engellenir). Ücretli servis çağrısı yok.
 * Çalıştır: SIFA_V2_TEST_SECRET_DIR=… [SIFA_V2_SHOTS_DIR=…] npx tsx scripts/sifa-rehberi-v2/real/library-ui.real.mts
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";
import JSZip from "jszip";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";
import { addBlock, addNode, type Ctx } from "../../../lib/sifa-rehberi-v2/tree";
import { buildChangeset } from "../../../lib/sifa-rehberi-v2/changeset";
import type { Block, Workspace } from "../../../lib/sifa-rehberi-v2/types";

const T = loadTestTarget();
installNetworkFence(T);
const PORT = 3293;
const BASE = `http://localhost:${PORT}`;
const SHOTS = path.join(process.env.SIFA_V2_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-v2-ekran"), "tamamlama");
mkdirSync(SHOTS, { recursive: true });
const LOG = path.join(SHOTS, "next-dev.log");
let pass = 0;
let fail = 0;
const results: string[] = [];
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  const line = `  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra)}` : ""}`;
  results.push(line);
  console.log(line);
};
const section = (s: string) => console.log(`\n${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Sentetik kimlikler (yalnız test projesi) ────────────────────────────────────
const su = await connectTestDb();
type U = { id: string; tenant: string; token: string; name: string; email: string };
async function mkTenant(label: string) {
  const id = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1, $2)", [id, `ZZ_SIFA_TAMAM_${label}`]);
  return id;
}
async function mkUser(tenant: string, label: string): Promise<U> {
  const id = randomUUID();
  const token = `zz-sifa-tamam-${randomUUID()}`;
  const email = `zz.sifa.tamam.${label.toLowerCase()}.${id.slice(0, 6)}@example.test`;
  const name = `ZZ_SIFA_TAMAM_${label}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
     values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active')`,
    [id, name, email, tenant],
  );
  await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [id, token]);
  return { id, tenant, token, name, email };
}
const TEN_A = await mkTenant("A");
const TEN_B = await mkTenant("B");
const A1 = await mkUser(TEN_A, "A1");
const A2 = await mkUser(TEN_A, "A2");
const B1 = await mkUser(TEN_B, "B1");
const ALL_TOKENS = [A1.token, A2.token, B1.token];

// ── HTTP yardımcıları ───────────────────────────────────────────────────────────
type Res = { status: number; json: Record<string, unknown> | null; buf: Buffer; headers: Headers };
async function api(u: U | null, method: string, p: string, body?: unknown, extra: Record<string, string> = {}): Promise<Res> {
  const headers: Record<string, string> = { ...extra };
  if (u) Object.assign(headers, { "x-user-id": u.id, "x-session-token": u.token });
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = typeof body === "string" ? body : JSON.stringify(body);
  }
  const r = await fetch(`${BASE}/api/sifa-rehberi-v2/${p}`, { method, headers, body: payload });
  const buf = Buffer.from(await r.arrayBuffer());
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(buf.toString("utf8"));
  } catch {
    json = null;
  }
  return { status: r.status, json, buf, headers: r.headers };
}
const loadWs = async (u: U) => (await api(u, "GET", "workspace")).json?.workspace as Workspace;

let tick = 0;
const ctx: Ctx = {
  get now() {
    return new Date(Date.UTC(2026, 10, 23, 10, 0, tick++)).toISOString();
  },
  newId: () => randomUUID(),
};
const must = <V,>(r: { ok: true; value: V } | { ok: false; error: string }): V => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const para = (text: string) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] });
const doc = (...nodes: unknown[]) => ({ type: "doc", content: nodes }) as Block["contentJson"];
function setContent(ws: Workspace, blockId: string, contentJson: Block["contentJson"], contentText: string): Workspace {
  return { ...ws, blocks: ws.blocks.map((b) => (b.id === blockId ? { ...b, contentJson, contentText } : b)) };
}
async function saveDiff(u: U, base: Workspace, next: Workspace) {
  return api(u, "POST", "workspace", buildChangeset(base, next));
}

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const FILLER = "Bu paragraf uzun bir araştırma notunun parçasıdır; konu ile ilgili gözlemler ve okuma notları içerir.";

// ── Sunucu ──────────────────────────────────────────────────────────────────────
function childEnv(): NodeJS.ProcessEnv {
  const e = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!/SUPABASE|DATABASE_URL|POSTGRES|PGPASSWORD|SIFA_/i.test(k)) e[k] = v;
  e.NEXT_PUBLIC_SUPABASE_URL = T.url;
  e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = T.publishableKey;
  e.NEXT_PUBLIC_SUPABASE_ANON_KEY = T.publishableKey;
  e.SUPABASE_SERVICE_ROLE_KEY = T.secretKey;
  e.SIFA_REHBERI_V2_ENABLED = "1";
  e.NEXT_TELEMETRY_DISABLED = "1";
  return e;
}
async function startServer(): Promise<ChildProcess> {
  const out = createWriteStream(LOG);
  const p = spawn("npx", ["next", "dev", "--webpack", "-p", String(PORT)], { cwd: process.cwd(), env: childEnv(), shell: true, stdio: ["ignore", "pipe", "pipe"] });
  p.stdout?.pipe(out);
  p.stderr?.pipe(out);
  const until = Date.now() + 300_000;
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { headers: { "x-user-id": A1.id, "x-session-token": A1.token } });
      if (r.status === 200) return p;
    } catch {
      /* henüz hazır değil */
    }
    await sleep(2000);
  }
  throw new Error("next dev başlamadı");
}
function stopServer(p: ChildProcess) {
  try {
    execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* zaten kapalı */
  }
}

// ── Tarayıcı ────────────────────────────────────────────────────────────────────
const ANDROID_WV = "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.135 Mobile Safari/537.36";
async function newCtx(browser: Browser, u: U, mobile = false): Promise<BrowserContext> {
  const c = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ANDROID_WV, locale: "tr-TR" }
      : { viewport: { width: 1440, height: 900 }, locale: "tr-TR" },
  );
  const userRec = { id: u.id, tenant_id: u.tenant, full_name: u.name, email: u.email, role: "expert", status: "active", plan: "premium", package_type: "premium", subscription_status: "active", membership_status: "active", module_permissions: { sifa_rehberi: true } };
  await c.addInitScript(([rec, t]) => {
    localStorage.setItem("yasam_user", rec as string);
    localStorage.setItem("yasam_session_token", t as string);
  }, [JSON.stringify(userRec), u.token]);
  const host = new URL(T.url).host;
  // Ağ çiti: yalnız yerel sunucu + test projesi (production'a / üçüncü taraflara istek yok).
  await c.route("**/*", (route) => {
    const h = new URL(route.request().url()).host;
    if (h === `localhost:${PORT}` || h === host || route.request().url().startsWith("data:") || route.request().url().startsWith("blob:")) return route.continue();
    return route.abort();
  });
  return c;
}
async function openHome(page: Page) {
  await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector("[data-testid=library]", { timeout: 120_000 });
}
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
async function search(page: Page, q: string) {
  await page.fill("[data-testid=library-search]", q);
  await page.waitForFunction((qq) => {
    const s = document.querySelector("[data-testid=library-status]")?.textContent ?? "";
    return s.includes(`“${qq.trim()}”`) || s.includes("en az");
  }, q, { timeout: 15_000 });
}
const listTitles = (page: Page) => page.$$eval("[data-testid=library-item-title]", (els) => els.map((e) => (e.textContent ?? "").trim()));
/** Sabit üst çubuk + arama şeridi altında, görünür alanda mı? */
async function firstHitVisible(page: Page) {
  return page.evaluate(() => {
    const m = Array.from(document.querySelectorAll<HTMLElement>("[data-testid=content] mark[data-sifa-hit]")).find((x) => x.getClientRects().length);
    const bar = document.querySelector("[data-testid=toolbar]")?.getBoundingClientRect();
    const save = document.querySelector("[data-testid=savebar]")?.getBoundingClientRect();
    if (!m) return { ok: false, why: "eşleşme yok" };
    const r = m.getBoundingClientRect();
    const top = bar ? bar.bottom : 0;
    const bottom = save ? save.top : window.innerHeight;
    return { ok: r.top >= top - 1 && r.bottom <= bottom + 1, top: Math.round(r.top), barBottom: Math.round(top), viewBottom: Math.round(bottom), scrollY: Math.round(window.scrollY), current: m.classList.contains("is-current") };
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// Tohum veri — GERÇEK API üzerinden (kayıt sözleşmesi aynı)
// ════════════════════════════════════════════════════════════════════════════════
section("0) Tohum veri (gerçek API)");
let srv: ChildProcess | null = null;
const browser = await chromium.launch();
const ids: Record<string, string> = {};
try {
  srv = await startServer();
  ok(true, "next dev (bayrak AÇIK, gerçek test projesi) hazır");

  // A1: alfabetik sıra + arama senaryoları
  let wsA = await loadWs(A1);
  const baseA = wsA;
  const root = (title: string) => {
    const r = must(addNode(wsA, { parentId: null, title }, ctx));
    wsA = r.ws;
    return r.node.id;
  };
  const child = (parentId: string, title: string) => {
    const r = must(addNode(wsA, { parentId, title }, ctx));
    wsA = r.ws;
    return r.node.id;
  };
  const box = (nodeId: string, title: string, contentJson: Block["contentJson"], text: string) => {
    const r = must(addBlock(wsA, { nodeId, title }, ctx));
    wsA = setContent(r.ws, r.block.id, contentJson, text);
    return r.block.id;
  };
  ids.oksuruk = root("Şiddetli Öksürük");
  ids.bitkisel = child(ids.oksuruk, "Bitkisel Destek");
  ids.cay = child(ids.bitkisel, "Zencefil Çayı");
  const longParas = Array.from({ length: 45 }, (_, i) => para(`${i + 1}. ${FILLER}`));
  ids.legacyBlock = box(ids.oksuruk, "Eski görselli not", doc({ type: "figure", attrs: { src: `data:image/png;base64,${PNG_1PX}`, alt: "eski", caption: "Eski base64 görsel" } }, para("Eski editörle kaydedilmiş not.")), "Eski editörle kaydedilmiş not.");
  ids.longBlock = box(ids.cay, "Uzun not", doc(...longParas, para("Taze ZENCEFİL rendelenir; zencefil ılık suyla demlenir."), ...longParas.slice(0, 10), para("Son paragrafta yine zencefil geçer.")), [...longParas.map(() => FILLER), "Taze ZENCEFİL rendelenir; zencefil ılık suyla demlenir.", "Son paragrafta yine zencefil geçer."].join("\n"));
  ids.zkok = root("Zencefil Kökü");
  ids.mide = root("Mide");
  ids.midebos = child(ids.mide, "Zencefil notu");
  ids.carpinti = root("Çarpıntı");
  box(ids.carpinti, "Bilimsel", doc(para("Kalp ritmi ve MAGNEZYUM ilişkisi.")), "Kalp ritmi ve MAGNEZYUM ilişkisi.");
  ids.astim = root("astım");
  ids.ishal = root("İshal");
  ids.isik = root("ışık terapisi");
  ids.odem = root("Ödem");
  ids.odemBlock = box(ids.odem, "Notlar", doc(para("Lenf drenajı notları.")), "Lenf drenajı notları.");
  ids.cilt = root("cilt kuruluğu");
  ids.uyku = root("Uyku");
  ids.on = root("10. Vitamin");
  ids.iki = root("2. Mineral");
  for (let i = 1; i <= 60; i++) root(`ZZ Dolgu Konusu ${String(i).padStart(3, "0")}`);
  ids.uzun = root("Çok uzun başlıklı araştırma konusu: kronik yorgunluk sendromu, uyku bozuklukları ve beslenme ilişkisi üzerine kapsamlı notlar");
  const sA = await saveDiff(A1, baseA, wsA);
  ok(sA.status === 200, "A1 tohum kaydı (73 ana konu, 3 seviyeli alt başlık, uzun not, eski base64 görsel) → 200", sA.status);

  // A2 (aynı tenant, başka uzman) ve B1 (başka tenant): aynı anahtar kelime
  for (const [u, title] of [[A2, "Zencefil A2 Kişisel"], [B1, "Zencefil B Gizli"]] as const) {
    const b0 = await loadWs(u);
    const w = must(addNode(b0, { parentId: null, title }, ctx));
    const bb = must(addBlock(w.ws, { nodeId: w.node.id, title: "Not" }, ctx));
    const w2 = setContent(bb.ws, bb.block.id, doc(para("zencefil gizli içerik")), "zencefil gizli içerik");
    const r = await saveDiff(u, b0, w2);
    ok(r.status === 200, `${u.name.slice(-2)} tohum kaydı → 200`, r.status);
    ids[`root_${u.name.slice(-2)}`] = w.node.id;
  }

  // ════════════════════════════════════════════════════════════════════════════
  section("1) Yeni ana ekran — yalnız iki modül");
  const cA = await newCtx(browser, A1);
  const page = await cA.newPage();
  const apiCalls: { method: string; url: string }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) apiCalls.push({ method: r.method(), url: r.url() });
  });
  await openHome(page);
  await page.waitForTimeout(800);
  const tabs = await page.getByRole("tab").allTextContents();
  ok(tabs.length === 2 && /Araştırma Kütüphanem/.test(tabs[0]) && /Yeni Konu Girişi/.test(tabs[1]), "girişte YALNIZ iki modül (tablist: Araştırma Kütüphanem · Yeni Konu Girişi)", tabs);
  const bodyText = await page.locator("body").innerText();
  ok(!/Hoş geldiniz|Yeni bir konu başlatın|\+ Yeni Konu Ekle|Boş Konu Oluştur|Şablonla Başla|PROTOTİP|Sentetik|prototip/i.test(bodyText), "eski karşılama paneli / yinelenen yeni-konu düğmeleri / prototip metni YOK");
  ok((await page.locator("[data-testid=save]").count()) === 0, "değişiklik yokken ana ekranda Kaydet kontrolü YOK");
  await shot(page, "01-ana-ekran-iki-modul");

  section("2) Araştırma Kütüphanem — Türkçe alfabetik, yalnız başlık");
  const titles = await listTitles(page);
  const expected = [...titles].sort((a, b) => new Intl.Collator("tr-TR", { sensitivity: "base", numeric: true }).compare(a, b));
  const ROOTS = wsA.nodes.filter((n) => n.parentId === null && !n.deletedAt).length;
  ok(titles.length === ROOTS && JSON.stringify(titles) === JSON.stringify(expected), `${ROOTS} konunun tamamı, Türkçe alfabetik (Intl tr-TR ile birebir)`, titles.slice(0, 12));
  ok(titles.indexOf("cilt kuruluğu") < titles.indexOf("Çarpıntı") && titles.indexOf("Çarpıntı") < titles.indexOf("İshal") && titles.indexOf("ışık terapisi") < titles.indexOf("İshal") && titles.indexOf("Ödem") < titles.indexOf("Şiddetli Öksürük") && titles.indexOf("2. Mineral") < titles.indexOf("10. Vitamin"), "C<Ç, ı<İ, Ö<Ş, 2<10");
  const itemTexts = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => (e.textContent ?? "").replace("›", "").trim()));
  ok(itemTexts.every((t, i) => t === titles[i]), "liste satırında başlık DIŞINDA metin (özet/önizleme) yok");
  ok(!titles.some((t) => /Zencefil (A2|B) /.test(t)), "başka uzmanın/tenant'ın konuları listede YOK");
  ok((await page.locator("[data-testid=letter-jump] a").count()) > 5, "çok kayıtta harf atlama dizini");
  const longRow = await page.$eval(`[data-testid=library-item][data-node-id="${ids.uzun}"] [data-testid=library-item-title]`, (e) => ({ sw: e.scrollWidth, cw: e.clientWidth, right: Math.round(e.getBoundingClientRect().right), vw: window.innerWidth, full: (e.textContent ?? "").length }));
  ok(longRow.sw <= longRow.cw && longRow.right <= longRow.vw && longRow.full > 120, "uzun başlık tam görünür, satırdan taşmıyor (kesilmiyor)", longRow);
  await shot(page, "02-kutuphane-alfabetik");
  await shot(page, "04-alfabetik-tam-liste", true);

  section("3) Yeni Konu Girişi → doğrudan düzenleme → kütüphanede görünür");
  await page.click("[data-testid=module-yeni]");
  await page.waitForSelector("[data-testid=new-topic-panel]");
  await page.fill("[data-testid=new-topic-title]", "mide");
  ok(await page.locator("[data-testid=new-topic-duplicate]").isVisible(), "aynı adlı konu uyarısı (Mide ↔ mide)");
  await page.fill("[data-testid=new-topic-title]", "Bal ve Propolis");
  await shot(page, "03-yeni-konu-girisi");
  await page.click("[data-testid=new-topic-create]");
  await page.waitForSelector("[data-testid=node-view] [data-testid=rich-editor]", { timeout: 20_000 });
  ok(true, "konu oluşturuldu → düzenleme ekranı (editör açık) doğrudan geldi");
  await page.locator("[data-testid=rich-editor]").first().click();
  await page.keyboard.type("Propolis boğaz için kullanılır.");
  ok((await page.locator("[data-testid=save]").count()) === 1, "TEK Kaydet düğmesi (masaüstü)");
  const saveResp = page.waitForResponse((r) => r.url().endsWith("/api/sifa-rehberi-v2/workspace") && r.request().method() === "POST");
  await page.click("[data-testid=save]");
  ok((await saveResp).status() === 200, "Kaydet → 200");
  await page.click("[data-testid=all-topics]");
  await page.waitForSelector("[data-testid=library]");
  const t2 = await listTitles(page);
  ok(t2.includes("Bal ve Propolis") && t2.indexOf("astım") < t2.indexOf("Bal ve Propolis") && t2.indexOf("Bal ve Propolis") < t2.indexOf("cilt kuruluğu"), "yeni konu kütüphanede alfabetik yerinde (astım < Bal < cilt)");
  const dbNew = await su.query("select count(*)::int n from public.sifa_topics where tenant_id=$1 and owner_key=$2 and title='Bal ve Propolis' and deleted_at is null", [TEN_A, A1.id]);
  ok(dbNew.rows[0].n === 1, "DB: yeni konu A1 kişisel kapsamında tek kayıt");

  section("4) Gelişmiş arama — yalnız başlık, sayaç, Türkçe harfler, sızıntı yok");
  const yhCount = async () => Number((await su.query("select count(*)::int n from public.yasam_hafizasi_outbox where tenant_id=$1", [TEN_A]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n);
  const yhBefore = await yhCount();
  const postsBefore = apiCalls.filter((c) => c.method === "POST" && c.url.includes("/workspace")).length;
  await search(page, "zencefil");
  const r1 = await listTitles(page);
  ok(JSON.stringify(r1) === JSON.stringify(["Mide", "Şiddetli Öksürük", "Zencefil Kökü"]), "“zencefil”: başlık + alt başlık (2. ve 3. seviye) + boş alt başlık → 3 konu, alfabetik, tekrarsız", r1);
  ok(/3 konu bulundu/.test((await page.textContent("[data-testid=library-status]")) ?? ""), "toplam eşleşen konu sayısı gösteriliyor");
  const rowTexts = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => (e.textContent ?? "").replace("›", "").replace(/İncelen(di|medi)$/, "").trim()));
  ok(JSON.stringify(rowTexts) === JSON.stringify(r1), "sonuçlarda YALNIZ konu başlığı (önizleme/paragraf yok)", rowTexts);
  ok(!r1.some((t) => /A2|B Gizli/.test(t)), "başka uzman (aynı tenant) ve başka tenant kayıtları sonuçlarda YOK");
  await shot(page, "05-arama-sonuclari");
  for (const [q, exp] of [["MAGNEZYUM", ["Çarpıntı"]], ["magnezyum", ["Çarpıntı"]], ["ASTIM", ["astım"]], ["astim", ["astım"]], ["İSHAL", ["İshal"]], ["ishal", ["İshal"]], ["ISIK", ["ışık terapisi"]], ["IŞIK", ["ışık terapisi"]], ["propolis", ["Bal ve Propolis"]], ["10.", ["10. Vitamin"]], ["kalp ritmi", ["Çarpıntı"]], ["yokboylebirkelime", []]] as const) {
    await search(page, q);
    const got = await listTitles(page);
    ok(JSON.stringify(got) === JSON.stringify(exp), `“${q}” → ${exp.length ? exp.join(", ") : "sonuç yok"}`, got);
  }
  ok(await page.locator("[data-testid=library-no-results]").isVisible(), "sonuç yok mesajı");
  await search(page, "a");
  ok(/en az 2 harf/.test((await page.textContent("[data-testid=library-status]")) ?? "") && (await listTitles(page)).length === ROOTS + 1, "tek harf → arama yok, tam liste + ipucu");
  await page.click("[data-testid=library-search-clear]");
  ok((await listTitles(page)).length === ROOTS + 1, "boş arama → tam liste");
  ok(apiCalls.filter((c) => c.method === "POST" && c.url.includes("/workspace")).length === postsBefore, "arama sunucuya kayıt isteği göndermiyor (yalnız yüklü, yetkili veri)");

  section("5) Sonuçtan aç → sarı vurgu + ilk eşleşmeye kaydırma");
  await search(page, "zencefil");
  await page.click(`[data-testid=library-item][data-node-id="${ids.oksuruk}"]`);
  await page.waitForSelector("[data-testid=reading-view]");
  await page.waitForFunction(() => document.querySelector("[data-testid=content] mark.is-current"), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  const v1 = await firstHitVisible(page);
  ok(v1.ok && v1.current === true, "ilk eşleşme görünür alanda, sabit üst çubuğun ALTINDA (gizlenmedi)", v1);
  const marks = await page.$$eval("[data-testid=content] mark[data-sifa-hit]", (els) => els.map((e) => ({ t: e.textContent, bg: getComputedStyle(e).backgroundColor })));
  ok(marks.length >= 4 && marks.every((m) => /rgb\(25[0-3], 2(04|24), (21|71)\)/.test(m.bg)), "TÜM eşleşmeler sarı (başlık + aynı paragrafta 2 + son paragraf)", marks);
  ok(marks.some((m) => m.t === "ZENCEFİL") && marks.some((m) => m.t === "zencefil"), "büyük/küçük ve İ'li yazım özgün hâliyle işaretli", marks.map((m) => m.t));
  ok(/\d+ eşleşme bu ekranda/.test((await page.textContent("[data-testid=hit-count]")) ?? ""), "konu ekranında eşleşme sayacı");
  await shot(page, "06-sari-vurgu");
  // Fareyle aşağı kaydır: ilk eşleşmeden SONRAKİ eşleşmeler ekrana geldiğinde sarı mı?
  let lower = { visible: 0, bg: [] as string[], scrollY: 0 };
  for (let i = 0; i < 40 && lower.visible === 0; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(120);
    lower = await page.evaluate(() => {
      const ms = Array.from(document.querySelectorAll<HTMLElement>("[data-testid=content] mark[data-sifa-hit]")).slice(1);
      const vis = ms.filter((m) => {
        const r = m.getBoundingClientRect();
        return r.top > 0 && r.bottom < window.innerHeight;
      });
      return { visible: vis.length, bg: vis.map((m) => getComputedStyle(m).backgroundColor), scrollY: Math.round(window.scrollY) };
    });
  }
  ok(lower.visible >= 1 && lower.bg.every((b) => b.startsWith("rgb(25")) && lower.scrollY > 1500, "fareyle aşağı kaydırınca uzak eşleşmeler de sarı (45 paragraf aşağıda)", lower);
  await page.click("[data-testid=hit-next]");
  await page.waitForTimeout(700);
  ok((await page.locator("[data-testid=content] mark.is-current").count()) === 1, "sonraki eşleşmeye geçiş (↓)");
  const stored = await page.evaluate(() => JSON.stringify(window.localStorage) + JSON.stringify(window.sessionStorage));
  ok(!stored.includes(ids.oksuruk) && !/zencefil|incelendi/i.test(stored), "tarayıcı deposunda arama/incelendi izi YOK (yalnız bellek)");
  const dbBlock = await su.query("select content_json::text j from public.sifa_topic_blocks where id=$1", [ids.longBlock]);
  ok(!/mark|sifa-hit/.test(dbBlock.rows[0].j), "DB içeriğine vurgu/HTML yazılmadı");
  // Alt başlığa git → orada da vurgu; ağaçta eşleşme noktası
  ok((await page.locator(`[data-testid=tree-node][data-node-id="${ids.cay}"] [data-testid=tree-match-dot]`).count()) === 1, "sol ağaç eşleşen derin alt başlığa kadar açık ve sarı noktayla işaretli");
  // Uzak eşleşme: yalnız 46. paragrafta geçen kelime → sayfa oraya kayar
  await page.click("[data-testid=all-topics]");
  await search(page, "rendelenir");
  await page.click(`[data-testid=library-item][data-node-id="${ids.oksuruk}"]`);
  await page.waitForFunction(() => document.querySelector("[data-testid=content] mark.is-current"), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  const far = await firstHitVisible(page);
  ok(far.ok && (far.scrollY ?? 0) > 1500, "uzak eşleşme: sayfa 45 paragraf aşağıdaki ilk eşleşmeye kaydı, üst çubuk altında görünür", far);
  await shot(page, "07-ilk-eslesmeye-kaydirma");
  await page.click("[data-testid=all-topics]");
  await search(page, "zencefil");

  section("6) İncelendi işaretleri — yalnız bu arama süresince");
  await page.click(`[data-testid=library-item][data-node-id="${ids.oksuruk}"]`);
  await page.waitForSelector("[data-testid=reading-view]");
  await page.click("[data-testid=all-topics]");
  await page.waitForSelector("[data-testid=library-list]");
  ok((await page.inputValue("[data-testid=library-search]")) === "zencefil", "geri dönüşte arama kelimesi korunuyor");
  const states = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => [e.getAttribute("data-node-id"), e.getAttribute("data-reviewed")]));
  ok(JSON.stringify(states.map((s) => s[1])) === JSON.stringify(["0", "1", "0"]) && states[1][0] === ids.oksuruk, "açılan sonuç ‘İncelendi’, diğerleri ‘İncelenmedi’; sıra alfabetik korunuyor", states);
  await shot(page, "08-incelendi-incelenmedi");
  await page.click(`[data-testid=library-item][data-node-id="${ids.mide}"]`);
  await page.waitForSelector("[data-testid=reading-view]");
  await page.waitForFunction(() => document.querySelector("[data-testid=content] mark.is-current"), null, { timeout: 15_000 });
  ok((await page.locator("[data-testid=reading-heading-text] mark").count()) >= 1, "boş alt başlığın adı eşleşince okumada gizlenmiyor ve işaretli");
  await page.goBack();
  await page.waitForSelector("[data-testid=library-list]");
  const s2 = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => e.getAttribute("data-reviewed")));
  ok(JSON.stringify(s2) === JSON.stringify(["1", "1", "0"]), "tarayıcı GERİ ile dönüş: 2 incelendi, 1 incelenmedi", s2);
  ok(/2 incelendi · 1 incelenmedi/.test((await page.textContent("[data-testid=library-status]")) ?? ""), "durum satırı incelendi sayacı");
  await search(page, "zencefil kökü");
  await search(page, "zencefil");
  const s3 = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => e.getAttribute("data-reviewed")));
  ok(s3.every((x) => x === "0"), "YENİ arama → incelendi işaretleri sıfırlandı", s3);
  await page.click(`[data-testid=library-item][data-node-id="${ids.zkok}"]`);
  await page.waitForSelector("[data-testid=reading-view]");
  await page.click("[data-testid=search-clear-topic]");
  await page.waitForTimeout(400);
  ok((await page.locator("mark[data-sifa-hit]").count()) === 0 && (await page.locator("[data-testid=search-strip]").count()) === 0, "aramayı temizle → tüm sarı vurgular kalktı");
  await page.click("[data-testid=all-topics]");
  ok((await page.inputValue("[data-testid=library-search]")) === "" && (await listTitles(page)).length === ROOTS + 1, "temizlenince tam liste; incelendi durumu yok");
  await search(page, "zencefil");
  const s4 = await page.$$eval("[data-testid=library-item]", (els) => els.map((e) => e.getAttribute("data-reviewed")));
  ok(s4.every((x) => x === "0"), "temizleyip aynı aramayı tekrar → işaretler sıfır", s4);
  await openHome(page);
  ok((await page.inputValue("[data-testid=library-search]")) === "", "sayfa yenilenince arama/işaret tutulmuyor (kalıcı takip yok)");
  const yhAfter = await yhCount();
  ok(yhBefore >= 0 && yhAfter === yhBefore, "arama/aç/incelendi boyunca Yaşam Hafızası outbox'a YENİ kayıt yazılmadı", { yhBefore, yhAfter });

  // ══════════════════════════════════════════════════════════════════════════
  section("7) Görsel — Storage'a yükleme, referans, yeniden açma, rapor");
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 20, g: 160, b: 120 } } }).png().toBuffer();
  const bigJpg = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: { r: 200, g: 80, b: 40 } } }).jpeg({ quality: 95 }).toBuffer();
  await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`).catch(async () => {
    await page.click("[data-testid=library-search-clear]");
    await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  });
  await page.waitForSelector("[data-testid=node-view]");
  const odemCard = page.locator(`[data-testid=block-card][data-block-id="${ids.odemBlock}"]`);
  await odemCard.locator("[data-testid=block-edit]").click();
  const netLog: { url: string; status: number; method: string }[] = [];
  page.on("response", (r) => {
    if (/assets\/(prepare|finalize|discard|signed-urls)|storage\/v1\/object/.test(r.url())) netLog.push({ url: r.url().replace(/token=[^&]+/, "token=***"), status: r.status(), method: r.request().method() });
  });
  const addImage = async (file: { name: string; mimeType: string; buffer: Buffer }, caption: string) => {
    await odemCard.locator("[data-testid=tb-image-input]").setInputFiles(file);
    const dlg = page.locator("[data-testid=image-caption-dialog]");
    if (!(await dlg.isVisible().catch(() => false))) {
      await dlg.waitFor({ timeout: 4000 }).catch(() => {});
    }
    if (await dlg.isVisible().catch(() => false)) {
      await dlg.locator("input, textarea").first().fill(caption);
      await dlg.getByRole("button", { name: "Görseli ekle" }).click();
    }
  };
  await addImage({ name: "lenf.png", mimeType: "image/png", buffer: png }, "Lenf akış şeması");
  await page.waitForSelector(`[data-testid=block-card][data-block-id="${ids.odemBlock}"] figure img[data-asset-state="ok"]`, { timeout: 30_000 });
  ok(netLog.some((n) => /assets\/prepare/.test(n.url) && n.status === 200) && netLog.some((n) => /object\/upload\/sign/.test(n.url) && n.status === 200) && netLog.some((n) => /assets\/finalize/.test(n.url) && n.status === 200), "küçük PNG: prepare 200 → imzalı yükleme 200 → finalize 200", netLog);
  await addImage({ name: "buyuk.jpg", mimeType: "image/jpeg", buffer: bigJpg }, "Büyük fotoğraf");
  await page.waitForFunction((id) => document.querySelectorAll(`[data-testid=block-card][data-block-id="${id}"] figure img[data-asset-state="ok"]`).length === 2, ids.odemBlock, { timeout: 30_000 });
  ok(true, "büyük JPEG (3200×2400) tarayıcıda küçültülüp yüklendi");
  await addImage({ name: "sahte.png", mimeType: "image/png", buffer: Buffer.from("bu bir görsel değil") }, "x");
  await page.waitForSelector("[data-testid=image-error]", { timeout: 10_000 });
  ok(/geçerli bir görsel değil/.test((await page.textContent("[data-testid=image-error]")) ?? ""), "geçersiz içerik (PNG adlı metin) → açık hata, içerik değişmedi");
  await odemCard.locator("[data-testid=tb-image-input]").setInputFiles({ name: "not.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  ok(/Yalnız görsel/.test((await page.textContent("[data-testid=image-error]")) ?? ""), "geçersiz tür (text/plain) → açık hata");
  await odemCard.locator("[data-testid=tb-image-input]").setInputFiles({ name: "dev.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(31 * 1024 * 1024, 1) });
  await page.getByRole("button", { name: "Görseli ekle" }).click();
  await page.waitForFunction(() => /30 MB/.test(document.querySelector("[data-testid=image-error]")?.textContent ?? ""), null, { timeout: 15_000 });
  ok(true, "31 MB dosya → boyut sınırı hatası (yüklenmedi)");
  ok((await odemCard.locator("figure").count()) === 2, "hatalı denemeler içeriğe görsel eklemedi");
  // Yarım kalan yükleme: finalize başarısız → istemci discard → nesne silinir
  let prepPath = "";
  page.on("response", async (r) => {
    if (r.url().includes("/assets/prepare") && r.status() === 200) prepPath = String(((await r.json().catch(() => ({}))) as { path?: string }).path ?? "");
  });
  await page.route("**/api/sifa-rehberi-v2/assets/finalize", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false, error: "Sunucu hatası (test)" }) }));
  await addImage({ name: "yarim.png", mimeType: "image/png", buffer: png }, "yarım");
  await page.waitForFunction(() => /Sunucu hatası \(test\)/.test(document.querySelector("[data-testid=image-error]")?.textContent ?? ""), null, { timeout: 20_000 });
  await page.unroute("**/api/sifa-rehberi-v2/assets/finalize");
  await sleep(2500);
  const half = prepPath ? await su.query("select count(*)::int n from storage.objects where bucket_id='sifa-arastirma' and name=$1", [prepPath]) : { rows: [{ n: -1 }] };
  const disc = netLog.filter((n) => /assets\/discard/.test(n.url)).map((n) => n.status);
  ok(prepPath !== "" && half.rows[0].n === 0 && disc.includes(200), "finalize hatası → açık hata + yarım nesne discard ile SİLİNDİ", { n: half.rows[0].n, disc });
  // Depo yükleme hatası
  await page.route("**/storage/v1/object/upload/sign/**", (route) => route.fulfill({ status: 500, body: "{}" }));
  await addImage({ name: "depo.png", mimeType: "image/png", buffer: png }, "depo");
  await page.waitForFunction(() => /depoya yüklenemedi/.test(document.querySelector("[data-testid=image-error]")?.textContent ?? ""), null, { timeout: 20_000 });
  await page.unroute("**/storage/v1/object/upload/sign/**");
  ok((await odemCard.locator("figure").count()) === 2, "Storage yükleme hatası → açık hata, içerik değişmedi");
  const saveImg = page.waitForResponse((r) => r.url().endsWith("/api/sifa-rehberi-v2/workspace") && r.request().method() === "POST");
  await odemCard.locator("[data-testid=block-edit]").click();
  await page.click("[data-testid=save]");
  ok((await saveImg).status() === 200, "görselli kutu kaydedildi → 200");
  const row = await su.query("select content_json::text j, length(content_json::text) l from public.sifa_topic_blocks where id=$1", [ids.odemBlock]);
  const assetIds = [...row.rows[0].j.matchAll(/sifa-asset:([0-9a-f-]{36})/g)].map((m: RegExpMatchArray) => m[1]);
  ok(assetIds.length === 2 && !row.rows[0].j.includes("data:image") && row.rows[0].l < 4000, "DB content_json: 2 × sifa-asset referansı, base64 YOK, küçük boyut", { refs: assetIds.length, bytes: row.rows[0].l });
  const arows = await su.query("select id, block_id, owner_key, tenant_id, scope, mime_type, byte_size, storage_path from public.sifa_block_assets where id = any($1::uuid[])", [assetIds]);
  ok(arows.rows.length === 2 && arows.rows.every((a: Record<string, unknown>) => a.block_id === ids.odemBlock && a.owner_key === A1.id && a.tenant_id === TEN_A && a.scope === "kisisel" && String(a.storage_path).startsWith(`${TEN_A}/${A1.id}/`)), "sifa_block_assets: kutuya bağlı, sahip A1, kişisel, yol tenant/uzman altında", arows.rows.map((a: Record<string, unknown>) => ({ mime: a.mime_type, size: a.byte_size })));
  ok(arows.rows.every((a: Record<string, unknown>) => a.mime_type === "image/png" || a.mime_type === "image/jpeg"), "kayıtlı türler Word uyumlu (PNG/JPEG)");
  const objs = await su.query("select count(*)::int n from storage.objects where bucket_id='sifa-arastirma' and name = any($1::text[])", [arows.rows.map((a: Record<string, unknown>) => a.storage_path)]);
  ok(objs.rows[0].n === 2, "Storage: 2 nesne özel bucket'ta");
  const bucket = await su.query("select public from storage.buckets where id='sifa-arastirma'");
  ok(bucket.rows[0].public === false, "bucket özel (public=false)");
  // Yeniden aç (yenileme) → imzalı bağlantıyla görünür
  await openHome(page);
  await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await page.waitForFunction((id) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`[data-testid=block-card][data-block-id="${id}"] img[data-sifa-asset]`));
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 1);
  }, ids.odemBlock, { timeout: 30_000 });
  const srcs = await page.$$eval(`[data-testid=block-card] img[data-sifa-asset]`, (els) => els.map((e) => (e as HTMLImageElement).src));
  ok(srcs.every((s) => s.includes("/storage/v1/object/sign/sifa-arastirma/")), "yenileme sonrası görseller kısa ömürlü imzalı bağlantıyla yüklendi");
  await odemCard.scrollIntoViewIfNeeded();
  await shot(page, "09-gorsel-yukleme-yeniden-acma");
  // Eski base64 görsel
  await page.click("[data-testid=all-topics]");
  await page.click(`[data-testid=library-item][data-node-id="${ids.oksuruk}"]`);
  await page.waitForSelector(`[data-testid=block-card][data-block-id="${ids.legacyBlock}"] img`);
  const legacyOk = await page.$eval(`[data-testid=block-card][data-block-id="${ids.legacyBlock}"] img`, (e) => (e as HTMLImageElement).src.startsWith("data:image/png;base64") && (e as HTMLImageElement).naturalWidth === 1);
  ok(legacyOk, "eski base64 görsel aynen okunuyor (geriye uyumlu)");
  const legacyDb = await su.query("select content_json::text j from public.sifa_topic_blocks where id=$1", [ids.legacyBlock]);
  ok(legacyDb.rows[0].j.includes("data:image/png;base64"), "eski base64 veri DB'de silinmedi/dönüştürülmedi");
  // İmzalı bağlantı süresi doldu → yeniden istenir
  const c2 = await newCtx(browser, A1);
  let signHits = 0;
  await c2.route("**/storage/v1/object/sign/**", (route) => {
    signHits += 1;
    return signHits === 1 ? route.fulfill({ status: 400, contentType: "application/json", body: '{"error":"InvalidJWT","message":"exp claim timestamp check failed"}' }) : route.continue();
  });
  const p2 = await c2.newPage();
  await openHome(p2);
  await p2.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await p2.waitForFunction((id) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`[data-testid=block-card][data-block-id="${id}"] img[data-sifa-asset]`));
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 1);
  }, ids.odemBlock, { timeout: 30_000 }).catch(() => {});
  const p2ok = await p2.$$eval(`[data-testid=block-card] img[data-sifa-asset]`, (els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 1));
  ok(p2ok && signHits >= 3, "süresi dolmuş imzalı bağlantı (400) → yeni bağlantı istendi, görsel yüklendi", { signHits });
  await c2.close();
  // Word
  const word = await api(A1, "POST", "word", { rootId: ids.odem });
  const zip = await JSZip.loadAsync(word.buf);
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/") && !f.endsWith("/"));
  ok(word.status === 200 && media.length === 2, "Word raporu Storage görsellerini gömüyor (word/media × 2)", { status: word.status, media });
  const wordLegacy = await api(A1, "POST", "word", { rootId: ids.oksuruk });
  const zl = await JSZip.loadAsync(wordLegacy.buf);
  ok(wordLegacy.status === 200 && Object.keys(zl.files).some((f) => f.startsWith("word/media/")), "Word raporu eski base64 görseli de gömüyor");
  // Çöp → geri yükleme
  await page.click("[data-testid=all-topics]");
  await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await page.click("[data-testid=view-gelismis]");
  await page.locator(`[data-testid=block-card][data-block-id="${ids.odemBlock}"] [data-testid=block-delete]`).click();
  await page.getByRole("button", { name: "Çöp Kutusu'na taşı" }).click();
  let sv = page.waitForResponse((r) => r.url().endsWith("/workspace") && r.request().method() === "POST");
  await page.click("[data-testid=save]");
  ok((await sv).status() === 200, "görselli kutu çöpe taşındı + kaydedildi");
  await page.click("[data-testid=open-trash]");
  await page.locator("[data-testid=trash-dialog]").waitFor();
  const trashText = (await page.textContent("[data-testid=trash-dialog]")) ?? "";
  ok(!/prototip|tasarım değeri/i.test(trashText) && /30 gün/.test(trashText), "Çöp Kutusu penceresinde prototip açıklaması YOK", trashText.slice(0, 160));
  await page.locator("[data-testid=trash-restore]").first().click();
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("[data-testid=trash-dialog]").getByRole("button", { name: "Kapat" }).click().catch(() => {});
  sv = page.waitForResponse((r) => r.url().endsWith("/workspace") && r.request().method() === "POST");
  await page.click("[data-testid=save]");
  ok((await sv).status() === 200, "geri yükleme kaydedildi");
  await openHome(page);
  await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await page.waitForFunction((id) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`[data-testid=block-card][data-block-id="${id}"] img[data-sifa-asset]`));
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 1);
  }, ids.odemBlock, { timeout: 30_000 }).catch(() => {});
  const after = await page.$$eval(`[data-testid=block-card][data-block-id="${ids.odemBlock}"] img[data-sifa-asset]`, (els) => els.filter((e) => (e as HTMLImageElement).naturalWidth > 1).length);
  ok(after === 2, "çöp → geri yükleme sonrası görseller bozulmadı", after);
  const objs2 = await su.query("select count(*)::int n from storage.objects where bucket_id='sifa-arastirma' and name = any($1::text[])", [arows.rows.map((a: Record<string, unknown>) => a.storage_path)]);
  ok(objs2.rows[0].n === 2, "çöpe taşıma Storage nesnelerini silmedi");

  // ══════════════════════════════════════════════════════════════════════════
  section("8) Güvenlik — 2 tenant, gerçek HTTP sınırları");
  const assetA = assetIds[0];
  const pathA = String(arows.rows.find((a: Record<string, unknown>) => a.id === assetA)?.storage_path);
  ok((await api(null, "GET", "workspace")).status === 401, "oturumsuz → 401");
  ok((await api({ ...A1, token: "zz-yanlis-token" }, "GET", "workspace")).status === 401, "yanlış oturum belirteci → 401");
  const spoof = (await api({ ...A1, id: B1.id }, "GET", "workspace")).status;
  ok(spoof === 401 || spoof === 403, "başkasının kimliği + kendi belirteci (kimlik sahteciliği) → reddedildi", spoof);
  const wsB = await loadWs(B1);
  const wsA2 = await loadWs(A2);
  ok(!wsB.nodes.some((n) => n.id === ids.odem) && !wsA2.nodes.some((n) => n.id === ids.odem), "B1 (başka tenant) ve A2 (aynı tenant, başka uzman) A1'in konularını yüklemiyor");
  const uB = await api(B1, "POST", "assets/signed-urls", { ids: [assetA] });
  const uA2 = await api(A2, "POST", "assets/signed-urls", { ids: [assetA] });
  const uA1 = await api(A1, "POST", "assets/signed-urls", { ids: [assetA] });
  ok(uB.status === 200 && Object.keys((uB.json?.urls as object) ?? {}).length === 0, "B1, A1'in görsel kimliğiyle imzalı bağlantı ALAMAZ (varlık sızdırılmaz)");
  ok(uA2.status === 200 && Object.keys((uA2.json?.urls as object) ?? {}).length === 0, "A2 (aynı tenant), A1'in KİŞİSEL görselini alamaz");
  ok(Object.keys((uA1.json?.urls as object) ?? {}).length === 1 && Number(uA1.json?.ttlSec) <= 300, "A1 kendi görselini alır; bağlantı ömrü ≤ 300 sn", uA1.json?.ttlSec);
  const direct = await fetch(`${T.url}/storage/v1/object/public/sifa-arastirma/${pathA}`);
  ok(direct.status >= 400, "public yol ile doğrudan erişim reddedildi (özel bucket)", direct.status);
  const anon = await fetch(`${T.url}/storage/v1/object/sifa-arastirma/${pathA}`, { headers: { apikey: T.publishableKey, Authorization: `Bearer ${T.publishableKey}` } });
  ok(anon.status >= 400, "anon anahtarla nesne okuma reddedildi (RLS/özel)", anon.status);
  const signedUrl = String(Object.values((uA1.json?.urls as Record<string, string>) ?? {})[0] ?? "");
  const tampered = signedUrl.replace(/sifa-arastirma\/[^?]+/, `sifa-arastirma/${TEN_B}/${B1.id}/${randomUUID()}.png`);
  ok((await fetch(tampered)).status >= 400, "imzalı bağlantıda yol değiştirme (başka tenant yolu) → reddedildi");
  ok((await api(B1, "POST", "assets/finalize", { assetId: assetA, path: pathA })).status === 403, "B1, A1'in yolunu finalize edemez → 403");
  ok((await api(B1, "POST", "assets/discard", { assetId: assetA, path: pathA })).status === 403, "B1, A1'in nesnesini silemez → 403");
  ok((await api(A1, "POST", "assets/discard", { assetId: assetA, path: pathA })).status === 409, "A1 kayıtlı (kullanılan) görselini discard ile silemez → 409");
  ok((await su.query("select count(*)::int n from storage.objects where name=$1", [pathA])).rows[0].n === 1, "kayıtlı nesne yerinde");
  for (const bad of [`${TEN_A}/${A1.id}/../${B1.id}/${assetA}.png`, `${TEN_B}/${B1.id}/${assetA}.png`, `/${TEN_A}/${A1.id}/${assetA}.png`, `${TEN_A}/${A1.id}/${assetA}.svg`]) {
    ok((await api(A1, "POST", "assets/finalize", { assetId: assetA, path: bad })).status === 403, `yol manipülasyonu reddedildi: ${bad.replace(/[0-9a-f-]{36}/g, "…")}`);
  }
  ok((await api(A1, "POST", "assets/prepare", { mimeType: "image/svg+xml", size: 10 })).status === 415, "SVG → 415");
  ok((await api(A1, "POST", "assets/prepare", { mimeType: "image/png", size: 11 * 1024 * 1024 })).status === 413, "10 MB üstü → 413");
  ok((await api(B1, "POST", "word", { rootId: ids.odem })).status === 404, "B1, A1'in konusunun Word'ünü alamaz → 404");
  // IDOR: B1, A1'in kutusunu değiştirmeye çalışır
  const before = (await su.query("select content_text, version, sort_key from public.sifa_topic_blocks where id=$1", [ids.odemBlock])).rows[0];
  const idor = await api(B1, "POST", "workspace", { topics: [], blocks: [{ id: ids.odemBlock, topic_id: ids.odem, title: "ele geçirildi", content_json: null, content_text: "x", classification: null, sources: [], sort_key: before.sort_key, deleted_at: null, delete_batch_id: null, base_version: Number(before.version) }], links_add: [], links_remove: [] });
  const after2 = (await su.query("select content_text, version from public.sifa_topic_blocks where id=$1", [ids.odemBlock])).rows[0];
  ok(idor.status >= 400 && after2.content_text === before.content_text && after2.version === before.version, "IDOR: B1, A1'in kutusunu yazamaz; DB değişmedi", idor.status);
  // Başka uzmanın görselini kendi içeriğine bağlama denemesi
  const wsB0 = await loadWs(B1);
  const bBlock = wsB0.blocks[0];
  const stolen = setContent(wsB0, bBlock.id, doc({ type: "figure", attrs: { src: `sifa-asset:${assetA}`, alt: "", caption: "çalıntı" } }), "çalıntı");
  const stl = await saveDiff(B1, wsB0, stolen);
  const assetAfter = (await su.query("select block_id, owner_key from public.sifa_block_assets where id=$1", [assetA])).rows[0];
  const uB2 = await api(B1, "POST", "assets/signed-urls", { ids: [assetA] });
  ok(stl.status === 200 && assetAfter.block_id === ids.odemBlock && assetAfter.owner_key === A1.id && Object.keys((uB2.json?.urls as object) ?? {}).length === 0, "B1 içeriğine A1 görsel kimliğini yazsa da: varlık A1'de kalır, B1 bağlantı alamaz");
  const wB = await api(B1, "POST", "word", { rootId: ids.root_B1 });
  const zb = await JSZip.loadAsync(wB.buf);
  ok(wB.status === 200 && !Object.keys(zb.files).some((f) => f.startsWith("word/media/")), "B1'in Word'ü A1 görselini GÖMMEZ");
  // Çakışma (eşzamanlı düzenleme)
  const base1 = await loadWs(A1);
  const e1 = setContent(base1, ids.odemBlock, base1.blocks.find((b) => b.id === ids.odemBlock)!.contentJson, "pencere 1");
  const e2 = setContent(base1, ids.odemBlock, base1.blocks.find((b) => b.id === ids.odemBlock)!.contentJson, "pencere 2");
  const r1s = await saveDiff(A1, base1, e1);
  const r2s = await saveDiff(A1, base1, e2);
  ok(r1s.status === 200 && r2s.status === 409 && Array.isArray(r2s.json?.conflicts), "eşzamanlı kayıt: ikinci pencere 409 + çakışma listesi (sessiz üzerine yazma yok)", [r1s.status, r2s.status]);
  // Bozuk / büyük istekler
  ok((await api(A1, "POST", "workspace", "{bozuk json")).status === 400, "bozuk JSON → 400");
  ok((await api(A1, "POST", "workspace", { topics: "x" })).status === 400, "şemaya uymayan istek → 400");
  const huge = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": A1.id, "x-session-token": A1.token, "content-length": String(25_000_000) }, body: "x".repeat(25_000_000) }).catch(() => null);
  ok(!!huge && huge.status === 413, "25 MB istek → 413", huge?.status);
  // XSS
  const wx0 = await loadWs(A1);
  const xb = wx0.blocks.find((b) => b.id === ids.odemBlock)!;
  const evil = doc(
    { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=window.__xss=1>", marks: [{ type: "link", attrs: { href: "javascript:window.__xss=2" } }] }] },
    { type: "figure", attrs: { src: "javascript:window.__xss=3", alt: "x", caption: "x" } },
    { type: "figure", attrs: { src: "data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3M9NDwvc2NyaXB0Pg==", alt: "x", caption: "x" } },
    { type: "script", content: [{ type: "text", text: "window.__xss=5" }] },
    ...(xb.contentJson?.content ?? []),
  );
  const xs = await saveDiff(A1, wx0, setContent(wx0, ids.odemBlock, evil, "xss denemesi"));
  const xdb = (await su.query("select content_json::text j from public.sifa_topic_blocks where id=$1", [ids.odemBlock])).rows[0].j as string;
  ok(xs.status === 200 && !xdb.includes("javascript:") && !xdb.includes("data:text/html") && !xdb.includes('"script"'), "XSS: sunucu javascript:/data:text/html/script düğümlerini kayıttan ÖNCE ayıkladı");
  await openHome(page);
  await search(page, "<img src=x onerror=window.__xss=9>");
  await page.click("[data-testid=library-search-clear]");
  await page.click(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await page.waitForSelector(`[data-testid=block-card][data-block-id="${ids.odemBlock}"]`);
  await search(page, "onerror").catch(() => {});
  const xssState = await page.evaluate(() => ({ x: (window as unknown as { __xss?: number }).__xss, scripts: document.querySelectorAll("[data-testid=content] script").length, js: Array.from(document.querySelectorAll("[data-testid=content] a")).some((a) => /^javascript:/i.test(a.getAttribute("href") ?? "")) }));
  ok(xssState.x === undefined && xssState.scripts === 0 && !xssState.js, "XSS: ekranda betik çalışmadı, javascript: bağlantısı yok (arama sorgusu dahil)", xssState);
  // CORS/CSRF: başka kökten ön-uçuş
  const pre = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { method: "OPTIONS", headers: { Origin: "https://kotu.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-session-token,x-user-id,content-type" } });
  const acao = pre.headers.get("access-control-allow-origin");
  ok(!acao || (acao !== "*" && acao !== "https://kotu.example"), "CSRF/CORS: başka köke izin yok (oturum başlığı çapraz kökten gönderilemez)", { status: pre.status, acao });
  // Yetki değişimi
  await su.query(`update public.users set module_permissions='{"sifa_rehberi": false}' where id=$1`, [A2.id]);
  const revoked = await api(A2, "GET", "workspace");
  await su.query(`update public.users set module_permissions='{"sifa_rehberi": true}' where id=$1`, [A2.id]);
  await su.query("update public.users set active=false where id=$1", [A2.id]);
  const inactive = await api(A2, "GET", "workspace");
  const inactiveUrl = await api(A2, "POST", "assets/signed-urls", { ids: [assetA] });
  ok(revoked.status === 403, "modül izni kaldırılınca → 403", revoked.status);
  ok(inactive.status === 401 || inactive.status === 403, "kullanıcı pasifleşince → erişim yok", inactive.status);
  ok(inactiveUrl.status === 401 || inactiveUrl.status === 403, "pasif kullanıcı imzalı bağlantı alamaz", inactiveUrl.status);

  // ══════════════════════════════════════════════════════════════════════════
  section("9) Mobil (Android WebView profili, 390×844) + erişilebilirlik");
  const cm = await newCtx(browser, A1, true);
  const pm = await cm.newPage();
  await openHome(pm);
  const ov = await pm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(ov <= 0, "mobil ana ekran yatay taşma yok", ov);
  await shot(pm, "10a-mobil-ana-ekran");
  await search(pm, "zencefil");
  ok(JSON.stringify(await listTitles(pm)) === JSON.stringify(["Mide", "Şiddetli Öksürük", "Zencefil Kökü"]), "mobil arama sonuçları aynı");
  await shot(pm, "10b-mobil-arama");
  await pm.tap(`[data-testid=library-item][data-node-id="${ids.oksuruk}"]`);
  await pm.waitForFunction(() => document.querySelector("[data-testid=content] mark.is-current"), null, { timeout: 15_000 });
  await pm.waitForTimeout(600);
  const mv = await firstHitVisible(pm);
  ok(mv.ok, "mobil: ilk eşleşme görünür, üst çubuk ve alt Kaydet çubuğu arasında", mv);
  ok((await pm.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "mobil konu ekranı yatay taşma yok");
  await shot(pm, "10c-mobil-vurgu");
  await pm.tap("[data-testid=all-topics]");
  await pm.waitForSelector("[data-testid=library-list]");
  ok((await pm.$$eval("[data-testid=library-item]", (els) => els.map((e) => e.getAttribute("data-reviewed")))).join() === "0,1,0", "mobil: incelendi işareti");
  await shot(pm, "10d-mobil-incelendi");
  await pm.tap("[data-testid=library-search-clear]");
  await pm.tap(`[data-testid=library-item][data-node-id="${ids.odem}"]`);
  await pm.waitForFunction((id) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(`[data-testid=block-card][data-block-id="${id}"] img[data-sifa-asset]`));
    return imgs.length === 2 && imgs.every((i) => i.complete && i.naturalWidth > 1);
  }, ids.odemBlock, { timeout: 30_000 }).catch(() => {});
  ok((await pm.$$eval(`[data-testid=block-card] img[data-sifa-asset]`, (els) => els.filter((e) => (e as HTMLImageElement).naturalWidth > 1).length)) === 2, "mobil WebView: Storage görselleri görüntüleniyor");
  const mCard = pm.locator(`[data-testid=block-card][data-block-id="${ids.odemBlock}"]`);
  await mCard.locator("[data-testid=block-edit]").tap();
  await mCard.locator("[data-testid=tb-image-input]").setInputFiles({ name: "IMG_0001", mimeType: "application/octet-stream", buffer: png });
  await pm.getByRole("button", { name: "Görseli ekle" }).tap();
  await pm.waitForFunction((id) => document.querySelectorAll(`[data-testid=block-card][data-block-id="${id}"] figure img[data-asset-state="ok"]`).length === 3, ids.odemBlock, { timeout: 30_000 }).catch(() => {});
  ok((await mCard.locator('figure img[data-asset-state="ok"]').count()) === 3, "mobil WebView: uzantısız, türü octet-stream (Android galeri) dosya yüklendi");
  await shot(pm, "10e-mobil-gorsel");
  await cm.close();
  // Klavye
  await page.click("[data-testid=all-topics]").catch(() => {});
  await openHome(page);
  await page.focus("[data-testid=module-kutuphane]");
  await page.keyboard.press("Tab");
  const f1 = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  await page.keyboard.press("Enter");
  const yeniAcik = await page.locator("[data-testid=new-topic-panel]").isVisible();
  await page.focus("[data-testid=module-kutuphane]");
  await page.keyboard.press("Enter");
  await page.focus("[data-testid=library-search]");
  await page.keyboard.type("çarpıntı");
  await page.waitForTimeout(500);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const f2 = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  await page.keyboard.press("Enter");
  const opened = await page.locator("[data-testid=reading-view]").isVisible({ timeout: 8000 }).catch(() => false);
  ok(f1 === "module-yeni" && yeniAcik && f2 === "library-item" && opened, "klavye: modül sekmeleri, arama, sonuç Tab ile odaklanır ve Enter ile açılır", { f1, yeniAcik, f2, opened });
  await page.click("[data-testid=all-topics]");
  const a11y = await page.evaluate(() => ({
    tablist: document.querySelectorAll("[role=tablist] [role=tab][aria-selected]").length,
    search: document.querySelectorAll("form[role=search] input[aria-label]").length,
    live: document.querySelector("[data-testid=library-status]")?.getAttribute("aria-live"),
    labels: Array.from(document.querySelectorAll("[data-testid=library-item]")).every((e) => (e.getAttribute("aria-label") ?? e.textContent ?? "").trim().length > 0),
  }));
  ok(a11y.tablist === 2 && a11y.search === 1 && a11y.live === "polite" && a11y.labels, "ekran okuyucu: tablist/tab, arama etiketi, canlı durum bölgesi, satır adları", a11y);
  await cA.close();
} catch (e) {
  fail++;
  const msg = `  ✗ BEKLENMEYEN HATA: ${redact(String((e as Error)?.stack ?? e)).slice(0, 900)}`;
  results.push(msg);
  console.log(msg);
} finally {
  if (srv) stopServer(srv);
  await browser.close();
  // Günlük hijyeni: oturum belirteçleri / imzalı bağlantı jetonları / servis anahtarı sunucu günlüğüne yazılmadı mı?
  try {
    await sleep(1500);
    const log = readFileSync(LOG, "utf8");
    const leaks = [
      ...ALL_TOKENS.filter((t) => log.includes(t)).map(() => "oturum belirteci"),
      ...(log.includes(T.secretKey) ? ["servis anahtarı"] : []),
      ...(/object\/(upload\/)?sign\/[^\s]*token=/.test(log) ? ["imzalı bağlantı jetonu"] : []),
      ...(/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{200}/.test(log) ? ["görsel verisi"] : []),
    ];
    ok(leaks.length === 0, "sunucu günlüğünde gizli/kişisel veri YOK (oturum belirteci, servis anahtarı, imzalı jeton, görsel)", leaks);
  } catch (e) {
    ok(false, "günlük okunamadı", String(e));
  }
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL (ekranlar: ${SHOTS})`);
process.exit(fail ? 1 : 0);
