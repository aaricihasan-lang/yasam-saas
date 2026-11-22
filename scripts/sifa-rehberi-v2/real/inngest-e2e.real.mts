/**
 * Son tamamlama — GERÇEK INNGEST olay zinciri uçtan uca (YALNIZ test projesi; production YOK).
 *   gerçek V2 API (next dev) → gerçek CDC tetikleyicisi → gerçek outbox satırı → webhook rotası
 *   (/api/internal/yh/outbox-webhook, Vault sırrı) → inngest.send → GERÇEK Inngest dev sunucusu →
 *   /api/inngest → yh-outbox-worker → gerçek indeks; çöp → indeksten kalkar; geri al → geri gelir.
 * Supabase pg_net'in yerel makineye ulaşamaması nedeniyle webhook çağrısını harness, panel/pg_net ile AYNI
 * gövde biçimiyle yapar (pg_net bacağı = production yapılandırması, burada NOT VERIFIED).
 * AŞAMA 2/2: ÇALIŞTIRMA. Önce HAZIRLIK (inngest-prep.real.mts) çalıştırılmış olmalı. Bu betik şema / fonksiyon /
 * Vault sırrı DEĞİŞTİRMEZ; sırrı yalnız Git dışı test dosyasından OKUR ve Vault'la eşleştiğini doğrular.
 * Test projesine yazılanlar: yalnız yeni rastgele ZZ_ tenant/uzman/oturum + V2 API ile not (sentetik).
 * Inngest CLI SÜRÜMÜ SABİT: inngest-cli@1.53.0 (npm, 2026-11-12). Sır çıktıya YAZILMAZ.
 * Çalıştır: npx tsx --tsconfig tsconfig.json scripts/sifa-rehberi-v2/real/inngest-e2e.real.mts
 */
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream, existsSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { connectTestDb, loadTestTarget, testSecretFile } from "./guard";

type Json = Record<string, unknown>;
const T = loadTestTarget();
const NEXT_PORT = 3293;
const ING_PORT = 8288;
const BASE = `http://127.0.0.1:${NEXT_PORT}`;
const ING = `http://127.0.0.1:${ING_PORT}`;
const LOGDIR = path.join(os.tmpdir(), "sifa-v2-inngest-e2e");
mkdirSync(LOGDIR, { recursive: true });
const INNGEST_CLI = "inngest-cli@1.53.0";
const SECRET_FILE = testSecretFile("sifa-v2-test-inngest.env");
if (!existsSync(SECRET_FILE)) {
  console.log("✗ Hazırlık yapılmamış: önce scripts/sifa-rehberi-v2/real/inngest-prep.real.mts");
  process.exit(1);
}
const SECRET = (readFileSync(SECRET_FILE, "utf8").match(/^SIFA_TEST_YH_WEBHOOK_SECRET=([0-9a-f]{64})\s*$/m) ?? [])[1] ?? "";

let pass = 0;
let fail = 0;
const ok = (c: boolean, l: string, x?: unknown) => {
  if (c) pass++;
  else fail++;
  console.log(`  ${c ? "✓" : "✗"} ${l}${x !== undefined ? ` — ${JSON.stringify(x).replaceAll(SECRET, "<sır>").slice(0, 260)}` : ""}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const su = await connectTestDb();
const procs: ChildProcess[] = [];
const kill = (p: ChildProcess) => {
  try {
    execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: "ignore" });
  } catch {
    /* kapalı */
  }
};

try {
  console.log("0) Hazırlık doğrulaması (salt-okunur; sır DEĞİŞTİRİLMEZ)");
  ok(SECRET.length === 64 && (await su.query("select public.yh_outbox_webhook_secret_matches($1) m", [SECRET])).rows[0].m === true, "test sırrı Vault'la eşleşiyor (hazırlıktan)");
  const urlSecret = Number((await su.query("select count(*)::int n from vault.secrets where name = 'yh_outbox_webhook_url'")).rows[0].n);
  ok(urlSecret === 0, "pg_net URL sırrı YOK → DB tetikleyicisi dışarı istek atmaz (webhook'u harness yapar)");

  const TEN = randomUUID();
  const UID = randomUUID();
  const TOKEN = `zz-sifa-ing-${randomUUID()}`;
  const KW = `zzing${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8)}`;
  await su.query("insert into public.tenants(id, name) values ($1, 'ZZ_SIFA_INNGEST')", [TEN]);
  await su.query("insert into public.yasam_hafizasi_flags (tenant_id, yh_enabled, yh_hizli) values ($1, true, true)", [TEN]);
  await su.query(
    `insert into public.users(id, full_name, email, role, active, approval_status, module_permissions, package_type, plan, tenant_id, membership_status, subscription_status)
     values ($1, 'ZZ_SIFA_INNGEST_UZMAN', 'zz.sifa.inngest@example.test', 'expert', true, 'approved', $2, 'premium', 'premium', $3, 'active', 'active')`,
    [UID, JSON.stringify({ sifa_rehberi: true, yasam_hafizasi: true }), TEN],
  );
  await su.query("insert into public.user_sessions(user_id, session_token) values ($1, $2)", [UID, TOKEN]);

  console.log("1) Gerçek Inngest dev sunucusu + next dev");
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) if (!/SUPABASE|DATABASE_URL|POSTGRES|PGPASSWORD|SIFA_|INNGEST|YH_|VERCEL/i.test(k)) env[k] = v;
  Object.assign(env, {
    NEXT_PUBLIC_SUPABASE_URL: T.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: T.publishableKey,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: T.publishableKey,
    SUPABASE_SERVICE_ROLE_KEY: T.secretKey,
    SIFA_REHBERI_V2_ENABLED: "1",
    YH_OUTBOX_WORKER_ENABLED: "true",
    INNGEST_DEV: "1",
    INNGEST_BASE_URL: ING,
    NEXT_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
  });
  const nextLog = createWriteStream(path.join(LOGDIR, "next.log"));
  const ingLog = createWriteStream(path.join(LOGDIR, "inngest.log"));
  const ingP = spawn("npx", ["--yes", INNGEST_CLI, "dev", "-p", String(ING_PORT), "-u", `${BASE}/api/inngest`, "--no-discovery"], { env: { ...env, DO_NOT_TRACK: "1" }, shell: true });
  ingP.stdout?.pipe(ingLog);
  ingP.stderr?.pipe(ingLog);
  procs.push(ingP);
  const nextP = spawn("npx", ["next", "dev", "-p", String(NEXT_PORT)], { cwd: process.cwd(), env, shell: true });
  let nextOut = "";
  nextP.stdout?.on("data", (d) => { nextOut += String(d); nextLog.write(d); });
  nextP.stderr?.on("data", (d) => { nextOut += String(d); nextLog.write(d); });
  procs.push(nextP);
  const waitFor = async (fn: () => Promise<boolean>, ms: number, what: string) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      try {
        if (await fn()) return true;
      } catch {
        /* henüz değil */
      }
      await sleep(2000);
    }
    throw new Error(`${what} hazır olmadı`);
  };
  await waitFor(async () => (await fetch(`${ING}/`)).status < 500, 300_000, "Inngest dev");
  await waitFor(async () => (await fetch(`${BASE}/api/inngest`)).status === 200, 300_000, "next dev /api/inngest");
  const intro = (await (await fetch(`${BASE}/api/inngest`)).json()) as Json;
  ok(Number(intro.function_count) >= 1 && intro.mode === "dev", "SDK uç noktası dev modunda, fonksiyonlar kayıtlı", { mode: intro.mode, function_count: intro.function_count });
  const sync = await fetch(`${BASE}/api/inngest`, { method: "PUT" });
  ok(sync.status === 200, "uygulama Inngest dev sunucusuna senkronlandı (PUT /api/inngest)", sync.status);
  await sleep(3000);

  const call = async (body: Json) => {
    const r = await fetch(`${BASE}/api/sifa-rehberi-v2/workspace`, { method: "POST", headers: { "content-type": "application/json", "x-user-id": UID, "x-session-token": TOKEN }, body: JSON.stringify(body) });
    return r.status;
  };
  const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
  const P = randomUUID();
  const B = randomUUID();
  const topic = (extra: Json = {}) => ({ id: P, parent_id: null, title: "ZZ Inngest konusu", sort_key: "a1", template_key: null, deleted_at: null, delete_batch_id: null, base_version: null, ...extra });
  const pending = async () => (await su.query("select to_jsonb(o) r from public.yasam_hafizasi_outbox o where tenant_id = $1 and status = 'pending' order by created_at", [TEN])).rows.map((x) => x.r as Json);
  const webhook = async (record: Json, secret = SECRET) =>
    (await fetch(`${BASE}/api/internal/yh/outbox-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-yh-webhook-secret": secret }, body: JSON.stringify({ type: "INSERT", table: "yasam_hafizasi_outbox", schema: "public", record, old_record: null }) })).status;
  const idx = async () => (await su.query("select owner_user_id, tenant_id from public.yasam_hafizasi_index where source_id = $1", [B])).rows;
  const statusOf = async () => (await su.query("select status, count(*)::int n from public.yasam_hafizasi_outbox where tenant_id = $1 group by 1 order by 1", [TEN])).rows;
  // Worker özeti çok satırlı nesne olarak loglanır: event tetiklemeli VE 1 olayı tamamlamış çalıştırmalar sayılır.
  const runsSeen = () => (nextOut.match(/\[yh-outbox-worker\]\s*\{[^}]*?triggerSource: '?"?event[^}]*?completed: 1\b/g) ?? []).length;

  console.log("2) Kayıt → CDC → webhook → Inngest → worker → indeks");
  const s1 = await call({ topics: [topic()], blocks: [{ id: B, topic_id: P, title: `ZZ not ${KW}`, content_json: doc(`ZZ icerik ${KW}`), content_text: `ZZ icerik ${KW}`, classification: null, sort_key: "a1", deleted_at: null, delete_batch_id: null, base_version: null, sources: [] }] });
  ok(s1 === 200, "V2 kişisel not gerçek API ile kaydedildi", s1);
  const p1 = await pending();
  ok(p1.length >= 1 && p1.every((r) => r.source_key === "sifa_rehberi_v2:notes"), "CDC tetikleyicisi outbox'a 'pending' olay yazdı", p1.map((r) => [r.source_key, r.operation]));
  ok((await webhook(p1[0], "yanlis-sir-0000000000000000")) === 401, "yanlış webhook sırrı → 401 (olay gönderilmez)");
  const w1 = await webhook(p1[0]);
  ok(w1 >= 200 && w1 < 300, "doğru sır → webhook kabul etti ve inngest.send yaptı", w1);
  const before1 = runsSeen();
  await waitFor(async () => (await idx()).length === 1, 120_000, "indeks satırı").catch(() => false);
  const i1 = await idx();
  ok(i1.length === 1 && i1[0].owner_user_id === UID && i1[0].tenant_id === TEN, "Inngest worker notu indeksledi (owner = uzman, tenant doğru)", i1);
  ok((await statusOf()).every((r) => r.status === "succeeded"), "outbox olayları 'succeeded'", await statusOf());
  await sleep(1500);
  ok(runsSeen() >= 1, "worker Inngest tarafından OLAY ile çalıştırıldı (triggerSource: event)", { runs: runsSeen(), before: before1 });

  console.log("3) Çöp Kutusu → indeksten kalkar; geri al → geri gelir (Inngest üzerinden)");
  const v = async () => Number((await su.query("select version from public.sifa_topics where id = $1", [P])).rows[0].version);
  ok((await call({ topics: [topic({ deleted_at: new Date().toISOString(), delete_batch_id: randomUUID(), base_version: await v() })] })) === 200, "konu çöpe atıldı");
  const p2 = await pending();
  ok(p2.length >= 1, "çöp işlemi outbox olayı üretti", p2.map((r) => [r.source_key, r.operation]));
  ok((await webhook(p2[0])) < 300, "webhook → Inngest");
  await waitFor(async () => (await idx()).length === 0, 120_000, "indeksten kalkma").catch(() => false);
  ok((await idx()).length === 0, "çöpteki not indeksten KALKTI");
  ok((await call({ topics: [topic({ base_version: await v() })] })) === 200, "konu geri alındı");
  const p3 = await pending();
  ok((await webhook(p3[0])) < 300, "webhook → Inngest");
  await waitFor(async () => (await idx()).length === 1, 120_000, "yeniden indeks").catch(() => false);
  const i3 = await idx();
  ok(i3.length === 1 && i3[0].owner_user_id === UID, "geri alınan not yeniden indekslendi (aynı sahip)", i3);
  ok((await statusOf()).every((r) => r.status === "succeeded"), "tüm olaylar 'succeeded', 'dead' YOK", await statusOf());
  ok(!/secret|x-yh-webhook-secret/i.test(nextOut.replaceAll("secret_matches", "")) && !nextOut.includes(SECRET), "sunucu günlüğünde sır YOK");
  ok(runsSeen() >= 3, "üç olayın üçü de Inngest worker çalıştırması üretti", runsSeen());
} catch (e) {
  fail++;
  console.log("  ✗ HATA:", String((e as Error).message ?? e).replaceAll(SECRET, "<sır>").slice(0, 400));
} finally {
  for (const p of procs) kill(p);
  await su.end();
}
console.log(`\nSONUÇ: ${pass} PASS, ${fail} FAIL (günlükler: ${LOGDIR})`);
process.exit(fail ? 1 : 0);
