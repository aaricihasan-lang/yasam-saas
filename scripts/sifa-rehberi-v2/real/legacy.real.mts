/**
 * Eski Rehber Kayıtları (salt-okunur V1 görünümü) — GERÇEK `next dev` + Playwright + GERÇEK test projesi.
 * Sentetik ZZ_ kapsam: A (uzman, V1 rehberi + bölüm + görsel), B (başka tenant, V1 rehberi), D (demo hesap, V1 rehberi).
 * Doğrular: tenant izolasyonu (ekran + doğrudan API), salt-okunurluk (yalnız GET + imzalı okuma isteği; yazma
 * düğmesi/alanı yok), demo görünürlüğü (V1 ile aynı koruma), V1 / V2 satırları önce = sonra (yazma/kopya yok),
 * bayrak KAPALI → V1 ekranı aynen ve bölüm yok.
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/legacy.real.mts
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
const PORT = 3294;
const BASE = `http://localhost:${PORT}`;
/** Ekran görüntüleri: SIFA_V2_SHOTS_DIR (verilmezse işletim sistemi geçici klasörü). */
const SHOTS = path.join(process.env.SIFA_V2_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-v2-ekran"), "eski-rehber");
mkdirSync(SHOTS, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const su = await connectTestDb();
const tag = randomUUID().slice(0, 6);
type U = { id: string; tenant: string; token: string; demo: boolean; name: string };
const mkTenant = async (label: string) => {
  const id = randomUUID();
  await su.query("insert into public.tenants(id, name) values ($1, $2)", [id, `ZZ_SIFA_ESKI_${label}`]);
  return id;
};
const mkUser = async (label: string, tenant: string, demo: boolean): Promise<U> => {
  const id = randomUUID();
  const token = `zz-sifa-eski-${label.toLowerCase()}-${randomUUID()}`;
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status, is_demo_account)
     values ($1, $2, $3, 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $4, 'active', 'active', $5)`,
    [id, `ZZ_SIFA_ESKI_${label}`, `zz.sifa.eski.${label.toLowerCase()}.${tag}@example.test`, tenant, demo],
  );
  await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [id, token]);
  return { id, tenant, token, demo, name: `ZZ_SIFA_ESKI_${label}` };
};
const TA = await mkTenant("A");
const TB = await mkTenant("B");
const TD = await mkTenant("DEMO");
const UA = await mkUser("A", TA, false);
const UB = await mkUser("B", TB, false);
const UD = await mkUser("DEMO", TD, true);

const NAME_A = `ZZ ESKI A ${tag}`;
const NAME_B = `ZZ ESKI B ${tag}`;
const NAME_D = `ZZ ESKI DEMO ${tag}`;
const GA = (await su.query("select (public.create_healing_guide_with_sections($1::uuid, $2::jsonb, $3::jsonb, null)) r", [
  TA,
  JSON.stringify({ name: NAME_A, category: "ZZ Kategori", general_summary: `A ozet metni ${tag}` }),
  JSON.stringify([{ section_type: "reasons", mode: "tibbi", note: `A bolum notu ${tag}` }]),
])).rows[0].r;
const guideIdOf = (r: unknown) => (typeof r === "string" ? r : ((r as { id?: string; guide_id?: string }).id ?? (r as { guide_id?: string }).guide_id)) as string;
const GA_ID = guideIdOf(GA);
const GB_ID = (await su.query("insert into public.healing_guides(tenant_id, name, general_summary) values ($1, $2, 'B gizli') returning id", [TB, NAME_B])).rows[0].id as string;
const GD_ID = (await su.query("insert into public.healing_guides(tenant_id, name, general_summary) values ($1, $2, $3) returning id", [TD, NAME_D, `DEMO ozet ${tag}`])).rows[0].id as string;

// A'nın rehberine gerçek görsel (stone-photos, tenant öneki altında; yalnız test projesi)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const imgPath = `healing-guides/${TA}/${GA_ID}/zz-${tag}.png`;
const up = await fetch(`${T.url}/storage/v1/object/stone-photos/${imgPath}`, { method: "POST", headers: { apikey: T.secretKey, Authorization: `Bearer ${T.secretKey}`, "content-type": "image/png" }, body: PNG });
const IMG_ID = randomUUID();
await su.query("update public.healing_guides set images = $2::jsonb where id = $1", [GA_ID, JSON.stringify([{ id: IMG_ID, file_path: imgPath, file_name: "zz.png", section: null }])]);

const snapshot = async () =>
  (await su.query(
    `select md5(coalesce(string_agg(g::text, '|' order by g.id), '')) g,
            (select md5(coalesce(string_agg(s::text, '|' order by s.id), '')) from public.healing_guide_sections s where s.guide_id = any($1::uuid[])) s,
            (select count(*)::int from public.sifa_topics where tenant_id = any($2::uuid[])) v2t,
            (select count(*)::int from public.sifa_topic_blocks where tenant_id = any($2::uuid[])) v2b
       from public.healing_guides g where g.id = any($1::uuid[])`,
    [[GA_ID, GB_ID, GD_ID], [TA, TB, TD]],
  )).rows[0];
const before = await snapshot();

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
const hdr = (u: U) => ({ "x-user-id": u.id, "x-session-token": u.token });
async function startServer(flag: boolean): Promise<ChildProcess> {
  const p = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: process.cwd(), env: childEnv(flag), shell: true, stdio: "ignore" });
  const until = Date.now() + 240_000;
  while (Date.now() < until) {
    try {
      if ((await fetch(`${BASE}/api/sifa-rehberi/guides`, { headers: hdr(UA) })).status > 0) return p;
    } catch {
      /* hazır değil */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("next dev başlamadı");
}
const stopServer = (p: ChildProcess) => {
  try {
    execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* kapalı */
  }
};
const userRec = (u: U) => ({ id: u.id, tenant_id: u.tenant, full_name: u.name, email: "zz@example.test", role: "expert", status: "active", plan: "premium", package_type: "premium", subscription_status: "active", membership_status: "active", module_permissions: { sifa_rehberi: true }, is_demo_account: u.demo });

async function visit(browser: Browser, u: U, shot: string, openCard: string | null) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
  await ctx.addInitScript(([rec, t]) => {
    localStorage.setItem("yasam_user", rec as string);
    localStorage.setItem("yasam_session_token", t as string);
  }, [JSON.stringify(userRec(u)), u.token]);
  const page = await ctx.newPage();
  const writes: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (!url.pathname.startsWith("/api/")) return;
    const readOnly = r.method() === "GET" || (r.method() === "POST" && url.pathname === "/api/sifa-rehberi/photos/signed-urls");
    if (!readOnly && url.pathname.startsWith("/api/sifa-rehberi/")) writes.push(`${r.method()} ${url.pathname}`);
  });
  await page.goto(`${BASE}/sifa-rehberi`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(3500);
  const out: Record<string, unknown> = {
    v2: await page.locator("[data-testid=sifa-v2-root]").count(),
    section: await page.locator("[data-testid=legacy-guides]").count(),
    cards: (await page.locator("[data-testid=legacy-card]").allInnerTexts()).map((c) => c.toLocaleUpperCase("tr-TR")),
  };
  if (openCard) {
    await page.locator(`[data-testid=legacy-card][data-guide-id="${openCard}"]`).click();
    await page.locator("[data-testid=legacy-reader]").waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    const modal = page.locator("[data-testid=legacy-modal]");
    out.reader = await modal.innerText();
    out.inputs = await modal.locator("input, textarea, [contenteditable=true], select").count();
    out.writeButtons = await modal.getByRole("button", { name: /kaydet|sil|düzenle|ekle|yükle|kopyala/i }).count();
    out.blurred = await modal.locator("[aria-hidden=true], .blur-sm, [style*='blur']").count();
    out.images = await modal.locator("[data-testid=legacy-images] img").evaluateAll((els) => els.filter((e) => (e as HTMLImageElement).naturalWidth > 0).length);
  }
  await page.screenshot({ path: path.join(SHOTS, `${shot}.png`), fullPage: true });
  out.writes = writes;
  await ctx.close();
  return out as { v2: number; section: number; cards: string[]; reader?: string; inputs?: number; writeButtons?: number; blurred?: number; images?: number; writes: string[] };
}

const browser = await chromium.launch();
let srv: ChildProcess | null = null;
try {
  ok(up.ok, "test görseli test projesine yüklendi (stone-photos, A tenant öneki)", up.status);

  console.log("\n1) Bayrak AÇIK (V2) — doğrudan API: izolasyon + salt-okunurluk");
  srv = await startServer(true);
  const listA = (await (await fetch(`${BASE}/api/sifa-rehberi/guides`, { headers: hdr(UA) })).json()) as { rows?: { id: string }[] };
  const idsA = (listA.rows ?? []).map((r) => r.id);
  ok(idsA.includes(GA_ID) && !idsA.includes(GB_ID) && !idsA.includes(GD_ID), "A listesi yalnız A'nın rehberi (B ve demo yok)", idsA.length);
  ok((await fetch(`${BASE}/api/sifa-rehberi/guides/${GB_ID}`, { headers: hdr(UA) })).status === 404, "A → B'nin rehberi doğrudan istek → 404");
  const sB = (await (await fetch(`${BASE}/api/sifa-rehberi/photos/signed-urls`, { method: "POST", headers: { ...hdr(UB), "content-type": "application/json" }, body: JSON.stringify({ guideId: GA_ID }) })).json()) as { byId?: Record<string, string> };
  ok(Object.keys(sB.byId ?? {}).length === 0, "B → A'nın görseli için imzalı URL ALAMAZ");
  ok((await fetch(`${BASE}/api/sifa-rehberi/guides`)).status === 401, "oturumsuz istek → 401");
  ok((await fetch(`${BASE}/api/sifa-rehberi/guides/${GD_ID}`, { method: "PATCH", headers: { ...hdr(UD), "content-type": "application/json" }, body: JSON.stringify({ name: "x" }) })).status === 403, "demo hesabı V1 rehberine YAZAMAZ (403)");

  console.log("\n2) Bayrak AÇIK (V2) — ekran");
  const a = await visit(browser, UA, "901-uzman-a-eski-rehber", GA_ID);
  ok(a.v2 === 1 && a.section === 1, "A: V2 ekranında 'Eski Rehber Kayıtları' bölümü var", a);
  ok(a.cards.some((c) => c.includes(NAME_A.toLocaleUpperCase("tr-TR"))) && !a.cards.some((c) => c.includes(NAME_B.toLocaleUpperCase("tr-TR")) || c.includes(NAME_D.toLocaleUpperCase("tr-TR"))), "A: yalnız kendi rehberinin kartı", a.cards);
  ok((a.reader ?? "").includes(`A ozet metni ${tag}`) && (a.reader ?? "").includes(`A bolum notu ${tag}`) && (a.reader ?? "").includes("salt-okunur"), "A: rehber içeriği (özet + bölüm) salt-okunur okunuyor");
  ok(a.inputs === 0 && a.writeButtons === 0, "okuyucuda düzenleme alanı / yazma düğmesi YOK", { inputs: a.inputs, writeButtons: a.writeButtons });
  ok(a.images === 1, "görsel imzalı okuma URL'siyle gösteriliyor", a.images);
  ok(a.writes.length === 0, "tarayıcı V1'e hiçbir yazma isteği göndermedi", a.writes);
  const d = await visit(browser, UD, "902-demo-eski-rehber", GD_ID);
  ok(d.section === 1 && d.cards.some((c) => c.includes(NAME_D.toLocaleUpperCase("tr-TR"))) && d.cards.length === 1, "DEMO: kendi V1 rehberi V2'de görünüyor (yalnız kendi)", d.cards);
  ok((d.reader ?? "").includes(NAME_D) && (d.blurred ?? 0) >= 1, "DEMO: rehber açılıyor; içerik V1 detayındaki gibi DemoBlur korumalı", { blurred: d.blurred });
  ok(d.writes.length === 0, "DEMO: yazma isteği yok", d.writes);
  const b = await visit(browser, UB, "903-uzman-b", null);
  ok(b.cards.length === 1 && b.cards[0].includes(NAME_B.toLocaleUpperCase("tr-TR")), "B: yalnız kendi rehberi", b.cards);
  stopServer(srv);
  srv = null;
  await new Promise((r) => setTimeout(r, 3000));

  console.log("\n3) Bayrak KAPALI → V1 aynen");
  srv = await startServer(false);
  const v1 = await visit(browser, UA, "904-bayrak-kapali-v1", null);
  ok(v1.v2 === 0 && v1.section === 0, "V1 ekranı; V2 / Eski Rehber bölümü YOK", v1);
  ok(v1.writes.length === 0, "V1 açılışında yazma isteği yok (davranış aynı)", v1.writes);
  stopServer(srv);
  srv = null;

  const after = await snapshot();
  ok(JSON.stringify(after) === JSON.stringify(before), "V1 rehber + bölüm içeriği önce = sonra; V2'ye kopya YOK", { before, after });
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
