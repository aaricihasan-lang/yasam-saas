/**
 * 9. aşama P0 — EKRAN düzeyi çakışma (gerçek `next dev` bayrak AÇIK + Playwright + GERÇEK test projesi / PostgREST).
 * Aynı uzman, iki ayrı oturum (iki cihaz/pencere). Pencere 1 kaydeder; pencere 2'nin bayat Kaydet'i:
 *   → sonlu sürede çözüm penceresi (yalnız gerçekten çakışan kutu), taslak ekranda KORUNUR, DB'de pencere 1 metni;
 *   → kullanıcı "Son kaydı yükle, benimkileri üstüne uygula" + Kaydet → kendi metni bilinçli yazılır.
 * Sentetik ZZ_ verisi; ortam değişkenleri yalnız alt sürece. Ekranlar: SIFA_V2_SHOTS_DIR (verilmezse geçici klasör)
 * Çalıştır: npx tsx scripts/sifa-rehberi-v2/real/p0-ui.real.mts
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { connectTestDb, installNetworkFence, loadTestTarget, redact } from "./guard";

const T = loadTestTarget();
installNetworkFence(T);
const PORT = 3292;
const BASE = `http://localhost:${PORT}`;
/** Ekran görüntüleri: SIFA_V2_SHOTS_DIR (verilmezse işletim sistemi geçici klasörü). */
const SHOTS = path.join(process.env.SIFA_V2_SHOTS_DIR ?? path.join(os.tmpdir(), "sifa-rehberi-v2-ekran"), "asama9");
mkdirSync(SHOTS, { recursive: true });
let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, extra?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${extra !== undefined ? ` — ${typeof extra === "string" ? extra : JSON.stringify(extra).slice(0, 300)}` : ""}`);
};

const su = await connectTestDb();
const TEN = randomUUID();
const UID = randomUUID();
const tok1 = `zz-sifa-v2-ui1-${randomUUID()}`;
const tok2 = `zz-sifa-v2-ui2-${randomUUID()}`;
await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_P0_UI')", [TEN]);
await su.query(
  `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
   values ($1, 'ZZ_SIFA_P0_UI_UZMAN', 'zz.sifa.p0ui@example.test', 'expert', true, 'approved', '{"sifa_rehberi": true}', 'premium', 'premium', $2, 'active', 'active')`,
  [UID, TEN],
);
for (const t of [tok1, tok2]) await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [UID, t]);
const ROOT = randomUUID();
const BX = randomUUID();
const BY = randomUUID();
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
await su.query("select public.sifa_v2_apply_changeset($1::uuid, $2::uuid, $3::jsonb)", [
  TEN,
  UID,
  JSON.stringify({
    topics: [{ id: ROOT, parent_id: null, title: "ZZ Ekran Çakışma Konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null }],
    blocks: [
      { id: BX, topic_id: ROOT, title: "Genel Not", content_json: doc("Başlangıç metni"), content_text: "Başlangıç metni", classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] },
      { id: BY, topic_id: ROOT, title: "İkinci Not", content_json: doc("Dokunulmayan kutu"), content_text: "Dokunulmayan kutu", classification: null, sort_key: "b1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] },
    ],
  }),
]);
const text = async (id: string) => String((await su.query("select content_text from public.sifa_topic_blocks where id = $1", [id])).rows[0].content_text);
const ver = async (id: string) => Number((await su.query("select version from public.sifa_topic_blocks where id = $1", [id])).rows[0].version);

function childEnv(): NodeJS.ProcessEnv {
  const e = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!/SUPABASE|DATABASE_URL|POSTGRES|PGPASSWORD|SIFA_/i.test(k)) e[k] = v;
  Object.assign(e, { NEXT_PUBLIC_SUPABASE_URL: T.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: T.publishableKey, NEXT_PUBLIC_SUPABASE_ANON_KEY: T.publishableKey, SUPABASE_SERVICE_ROLE_KEY: T.secretKey, SIFA_REHBERI_V2_ENABLED: "1", NEXT_TELEMETRY_DISABLED: "1" });
  return e;
}
const srv: ChildProcess = spawn("npx", ["next", "dev", "-p", String(PORT)], { cwd: process.cwd(), env: childEnv(), shell: true, stdio: "ignore" });
const browser = await chromium.launch();
try {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { headers: { "x-user-id": UID, "x-session-token": tok1 } })).status === 200) break;
    } catch { /* bekle */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  const open = async (tok: string): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "tr-TR" });
    const rec = { id: UID, tenant_id: TEN, full_name: "ZZ_SIFA_P0_UI_UZMAN", role: "expert", status: "active", plan: "premium", package_type: "premium", subscription_status: "active", membership_status: "active" };
    await ctx.addInitScript(([u, t]) => {
      localStorage.setItem("yasam_user", u as string);
      localStorage.setItem("yasam_session_token", t as string);
    }, [JSON.stringify(rec), tok]);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/sifa-rehberi?gorunum=gelismis&konu=${ROOT}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await p.waitForSelector("[data-testid=toolbar]", { timeout: 120_000 });
    await p.locator(`[data-testid=node-view][data-node-id="${ROOT}"]`).waitFor({ timeout: 60_000 });
    return p;
  };
  const typeEnd = async (p: Page, s: string) => {
    if (!(await p.locator("[data-testid=rich-editor]:visible").count())) await p.getByTestId("block-edit").first().click();
    await p.locator("[data-testid=rich-editor]").first().click();
    await p.keyboard.press("Control+End");
    await p.keyboard.type(s);
  };
  console.log("Ekran düzeyi çakışma (aynı uzman, iki oturum, gerçek PostgREST)");
  const p1 = await open(tok1);
  const p2 = await open(tok2);
  await typeEnd(p1, " PENCERE-1");
  await p1.getByTestId("save").click();
  await p1.locator("[data-testid=saved-indicator]:visible").first().waitFor({ timeout: 30_000 });
  ok((await text(BX)).includes("PENCERE-1") && (await ver(BX)) === 2 && (await ver(BY)) === 1, "pencere 1 kaydı: yalnız düzenlenen kutu yazıldı (sürüm 2), diğer kutu sürüm 1");
  await typeEnd(p2, " PENCERE-2");
  const t0 = Date.now();
  await p2.getByTestId("save").click();
  await p2.getByTestId("conflict-dialog").waitFor({ timeout: 20_000 });
  const ms = Date.now() - t0;
  ok(ms < 10_000, "çakışma penceresi sonlu sürede açıldı (< 10 sn; sonsuz döngü yok)", `${ms} ms`);
  const items = await p2.locator("[data-testid=conflict-list] li").count();
  const list = await p2.getByTestId("conflict-list").innerText();
  ok(items === 1 && list.includes("Genel Not") && !list.includes("İkinci Not"), "pencerede YALNIZ gerçekten çakışan kutu (Genel Not)", list);
  await p2.screenshot({ path: path.join(SHOTS, "901-cakisma-penceresi.png") });
  ok((await text(BX)).includes("PENCERE-1") && !(await text(BX)).includes("PENCERE-2"), "DB'de pencere 1 metni korundu; bayat metin sessizce yazılmadı");
  await p2.getByTestId("conflict-close").click();
  ok((await p2.locator("[data-testid=rich-editor]").first().innerText()).includes("PENCERE-2"), "pencereyi kapatınca taslak (PENCERE-2) ekranda KORUNDU");
  ok((await p2.locator("[data-testid=dirty-indicator]:visible").count()) > 0, "kaydedilmemiş durumu sürüyor");
  await p2.getByTestId("save").click();
  await p2.getByTestId("conflict-dialog").waitFor({ timeout: 20_000 });
  await p2.getByTestId("conflict-mine").click();
  await p2.getByText(/üstüne yeniden uygulandı/).first().waitFor({ timeout: 20_000 });
  await p2.getByTestId("save").click();
  await p2.locator("[data-testid=saved-indicator]:visible").first().waitFor({ timeout: 30_000 });
  await p2.screenshot({ path: path.join(SHOTS, "902-ustune-uygula-kaydedildi.png") });
  ok((await text(BX)).includes("PENCERE-2"), "kullanıcının AÇIK seçimiyle kendi metni yazıldı (sürüm 3)", await ver(BX));
  ok((await text(BY)) === "Dokunulmayan kutu" && (await ver(BY)) === 1, "çakışmayan kutu hiç yeniden yazılmadı");
  const stuck = Number((await su.query(`select count(*)::int n from pg_stat_activity where usename = 'authenticator' and query ilike '%sifa_v2_%' and state <> 'idle'`)).rows[0].n);
  ok(stuck === 0, "pg_stat_activity: takılı sifa_v2 sorgusu 0");
} catch (e) {
  fail++;
  console.log(`  ✗ ${redact(String((e as Error)?.stack ?? e)).slice(0, 700)}`);
} finally {
  try { execSync(`taskkill /PID ${srv.pid} /T /F`, { stdio: "ignore" }); } catch { /* kapalı */ }
  await browser.close();
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL (ekranlar: ${SHOTS})`);
process.exit(fail ? 1 : 0);
