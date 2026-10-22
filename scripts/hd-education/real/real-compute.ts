/**
 * HD Hazır Eğitim Haritaları — KONTROLLÜ GERÇEK SAĞLAYICI HESABI (yalnız YEREL, izole embedded-postgres).
 *
 * Production'a SIFIR temas. Ağ kilidi: yalnız 127.0.0.1 + TEK sağlayıcı ucu (POST …/human-design/bodygraph?lang=tr).
 * Hesap ÜRÜN KODUYLA yapılır (computeEducationChart: UTC katmanı, kaynak kontrolü, snapshot yeniden kullanımı,
 * #519 DB kirası + fail-closed, günlük tavan, şema/normalize, Design anı denetimi) — kısayol YOK.
 *
 * ÜCRETLİ ÇAĞRI ÖNCESİ ENGELLER (herhangi biri → o kişi için ÇAĞRI YOK):
 *   1) Paket bütünlüğü: manifest ↔ snapshot dosyası ↔ SHA; manifestte olmayan snapshot dosyası; gövdesi var ama
 *      manifesti olmayan "yetim" ham yanıt; defterde sonucu yazılmamış "açık" deneme → kişi KİLİTLİ (kurtarma gerekir).
 *   2) Kişi pakette zaten var (manifest) → asla yeniden ücretli çağrı (geri yükleme reddedilse bile).
 *   3) Gün / toplam çağrı tavanı (defter, UTC günü); ürünün DB günlük tavanı ayrıca geçerli.
 *   4) Aynı paket klasöründe ikinci çalıştırıcı: `.runner.lock` (wx) → DUR.
 *   5) natural_key biçimi (dosya adı güvenliği / yol aşımı yok).
 * KAYIP OLMAMASI: gövde, parse EDİLMEDEN bayt olarak, sağlayıcı fetch'i İÇİNDE hemen `raw/` altına yazılır (tek yazım).
 * Kesinti sonrası `--recover-from-raw`: yetim gövde, ağ OLMADAN aynı ürün yolundan yeniden oynatılır → snapshot +
 * manifest; defterde "recovered" (ücret YOK).
 *
 * Modlar: --dry-run (sağlayıcı yok) · --mock-provider (repo fixture'ı; defter YAZILMAZ; HD_EDU_REAL_FAULT yalnız bu modda:
 *   crash-after-raw | crash-after-snapshot-file | no-db-lock).
 * Kullanım: npx tsx scripts/hd-education/real/real-compute.ts --import <sql> --local-key <sql> --owner <uuid> --pkg <repo-dışı>
 *   --keys k1,k2 [--max-day 10] [--max-total 25] [--recover-from-raw] [--dry-run|--mock-provider]
 */
import Module from "node:module";
import path from "node:path";
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(ROOT, "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

const arg = (f: string) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
function die(m: string, code = 2): never { console.error(`DUR: ${m}`); process.exit(code); }
const IMPORT = arg("--import") ?? ""; const LOCALKEY = arg("--local-key") ?? ""; const OWNER = arg("--owner") ?? ""; const PKG = path.resolve(arg("--pkg") ?? "");
const KEYS = (arg("--keys") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_DAY = Number(arg("--max-day") ?? 10); const MAX_TOTAL = Number(arg("--max-total") ?? 25);
const DRY = process.argv.includes("--dry-run");
/** Çevrimdışı uçtan uca prova: sağlayıcı yerine repo fixture'ı (ağ YOK, defter YAZILMAZ). Gerçek sonuç DEĞİLDİR. */
const MOCK = process.argv.includes("--mock-provider");
const RECOVER = process.argv.includes("--recover-from-raw");
const FAULT = MOCK ? (process.env.HD_EDU_REAL_FAULT ?? "") : "";
if (!IMPORT || !LOCALKEY || !OWNER || !arg("--pkg")) die("--import, --local-key, --owner, --pkg zorunlu");
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(OWNER)) die("--owner uuid değil");
if (PKG.toLowerCase().startsWith(path.resolve(ROOT).toLowerCase())) die("paket klasörü repo İÇİNDE olamaz");
/** Owner istisnası: 10'un üstü YALNIZ yazılı owner onay notuyla (deftere ve özete yazılır); üst sınır 50. */
const OWNER_APPROVAL = (arg("--owner-approval") ?? "").trim();
if (!Number.isInteger(MAX_DAY) || MAX_DAY < 0 || MAX_DAY > 50) die("--max-day 0..50");
if (MAX_DAY > 10 && OWNER_APPROVAL.length < 10) die("--max-day > 10 yalnız --owner-approval \"<owner onay notu>\" ile");
if (!Number.isInteger(MAX_TOTAL) || MAX_TOTAL < 0) die("--max-total geçersiz");
const NATURAL_KEY_RE = /^[a-z0-9][a-z0-9-]{1,118}-[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
for (const k of KEYS) if (!NATURAL_KEY_RE.test(k)) die(`natural_key biçimi geçersiz: ${JSON.stringify(k)}`);
const SNAP = path.join(PKG, "snapshots"); const RAW = path.join(PKG, "raw");
mkdirSync(SNAP, { recursive: true }); mkdirSync(RAW, { recursive: true });
/** Mock modda AYRI defter (gerçek defter asla kirlenmez); limitler her iki modda da uygulanır. */
const LEDGER = path.join(PKG, MOCK ? "ledger.mock.jsonl" : "ledger.jsonl"); const MANIFEST = path.join(PKG, "manifest.jsonl"); const LOCK = path.join(PKG, ".runner.lock");
const realKey = (process.env.ROXY_API_KEY ?? "").trim();
if (!DRY && !MOCK && (realKey.length < 20 || /zz|fake|test|harness/i.test(realKey))) die("gerçek sağlayıcı anahtarı yok / test anahtarı");

const nowIso = () => new Date().toISOString();
const stamp = () => nowIso().replace(/[:.]/g, "");
type LedgerRow = { at: string; day: string; key: string; event: "attempt" | "result" | "recovered"; ok?: boolean; code?: string; http?: number | null; rl?: Record<string, string>; raw?: string; maxDay?: number; ownerApproval?: string };
type ManifestRow = { at: string; file: string; sha256: string; subject_id: string; natural_key: string; version: number; request_hash: string; format?: string };
const readJsonl = <T>(f: string): T[] => (existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : []);
/** Tek yazım + diske zorla (yarım dosya kalmasın). */
function writeOnce(file: string, content: string | Buffer) {
  const fd = openSync(file, "wx");
  try { writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content); fsyncSync(fd); } finally { closeSync(fd); }
}
function appendDurable(file: string, line: string) { appendFileSync(file, line + "\n"); const fd = openSync(file, "r+"); try { fsyncSync(fd); } finally { closeSync(fd); } }

/** Paket bütünlüğü (salt-okunur). Kilitli anahtarlar + kesin hatalar. */
async function integrity() {
  const { sha256 } = await import("./snapshot-io");
  const manifest = readJsonl<ManifestRow>(MANIFEST);
  const ledger = readJsonl<LedgerRow>(LEDGER);
  const errors: string[] = []; const locked = new Map<string, string>();
  const files = new Set(readdirSync(SNAP));
  for (const m of manifest) {
    if (!files.has(m.file)) { errors.push(`manifest var, dosya YOK: ${m.file}`); locked.set(m.natural_key, "MANIFEST_FILE_MISSING"); continue; }
    if (sha256(readFileSync(path.join(SNAP, m.file), "utf8")) !== m.sha256) { errors.push(`SHA uyuşmazlığı: ${m.file}`); locked.set(m.natural_key, "FILE_SHA"); }
  }
  for (const f of files) if (!manifest.some((m) => m.file === f)) { errors.push(`dosya var, manifest YOK: ${f}`); locked.set(f.replace(/\.v\d+\.json$/, ""), "FILE_WITHOUT_MANIFEST"); }
  for (const r of readdirSync(RAW)) {
    const key = r.split(".")[0];
    if (!manifest.some((m) => m.natural_key === key)) locked.set(key, locked.get(key) ?? "ORPHAN_RAW");
  }
  const byKey = new Map<string, LedgerRow[]>();
  for (const l of ledger) byKey.set(l.key, [...(byKey.get(l.key) ?? []), l]);
  for (const [key, rows] of byKey) {
    const att = rows.filter((x) => x.event === "attempt").length;
    const res = rows.filter((x) => x.event === "result").length;
    if (att > res && !manifest.some((m) => m.natural_key === key)) locked.set(key, locked.get(key) ?? "OPEN_ATTEMPT");
  }
  return { manifest, ledger, errors, locked };
}

/** Katı UTF-8 çözümleme (geçersiz bayt → null; BOM korunur). Ürünün canonicalJson.strictUtf8 ile aynı davranış. */
function strictUtf8(bytes: Uint8Array): string | null {
  try { return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); } catch { return null; }
}

async function main() {
  // Eşzamanlı çalıştırıcı engeli.
  try { writeOnce(LOCK, JSON.stringify({ pid: process.pid, at: nowIso() })); } catch { die(`başka bir çalıştırıcı bu paketi kullanıyor (${LOCK}) — kilit elle kaldırılmadan devam edilmez`); }
  const releaseLock = () => { try { unlinkSync(LOCK); } catch { /* */ } };
  process.on("exit", releaseLock);

  const pre = await integrity();
  for (const e of pre.errors) console.log(`BÜTÜNLÜK: ${e}`);
  for (const [k, why] of pre.locked) console.log(`KİLİTLİ: ${k} (${why}) → ücretli çağrı YOK`);

  const { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } = await import("../../anamnez/testEnv");
  // 20271113 (sağlayıcı gövdesi) repoda VARSA uygulanır: ürün kodu o kolonlara yazar; şema eksik kalırsa ücretli çağrı SONRASI kayıt düşerdi.
  const MIG = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql", "20271113000000_hd_education_chart_provider_body.sql"]
    .filter((f, i) => i < 2 || existsSync(path.join(ROOT, "supabase/migrations", f)))
    .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  const RL_SQL = (() => {
    const m = readFileSync(path.join(ROOT, "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8");
    const a = m.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
    const f = m.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
    return m.slice(a, m.indexOf("$$;", f) + 3);
  })();
  const PRE_DDL = `create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid,
    target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`;

  // ── Ağ kilidi ──
  type LastCall = { status: number; rl: Record<string, string> };
  const net = { provider: 0, blocked: [] as string[], last: null as LastCall | null, body: null as Buffer | null, rawFile: null as string | null, currentKey: "", replay: null as Buffer | null };
  const lastCall = (): LastCall | null => net.last; const lastBody = (): Buffer | null => net.body; const lastRawFile = (): string | null => net.rawFile;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    if (/\/rest\/v1\/rpc\/auth_rate_limit_hit$/.test(u)) {
      const res = await realFetch(input, init); const txt = await res.text(); let out = txt;
      try { const j = JSON.parse(txt) as unknown; if (Array.isArray(j) && j.length === 1 && j[0] && typeof j[0] === "object" && "auth_rate_limit_hit" in (j[0] as object)) out = JSON.stringify((j[0] as Record<string, unknown>).auth_rate_limit_hit); } catch { /* aynen */ }
      return new Response(out, { status: res.status, headers: { "content-type": "application/json" } });
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return realFetch(input, init);
    net.blocked.push(u.replace(/[?#].*$/, ""));
    throw new Error(`ağ kilidi: izin yok ${u.replace(/[?#].*$/, "")}`);
  }) as typeof fetch;
  const fixture = readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
  const providerFetch = async (input: string, init: RequestInit): Promise<Response> => {
    if (input !== "https://roxyapi.com/api/v2/human-design/bodygraph?lang=tr" || (init.method ?? "GET") !== "POST") { net.blocked.push(input); throw new Error("ağ kilidi: beklenmeyen sağlayıcı ucu"); }
    if (DRY) throw new Error("dry-run: sağlayıcı çağrılmaz");
    let res: Response;
    if (net.replay) {
      res = new Response(new Uint8Array(net.replay), { status: 200, headers: { "content-type": "application/json" } });   // kurtarma: ağ YOK, ücret YOK
    } else {
      net.provider++;
      res = MOCK
        ? new Response((await import("../../hd-roxy/consistentFixture")).consistentRoxyResponse(fixture, String(init.body)), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining": "MOCK" } })
        : await realFetch(input, init);
    }
    // GÖVDE: parse EDİLMEDEN bayt olarak; ücretli yanıt ise HEMEN diske (kayıp yok).
    const bytes = Buffer.from(await res.clone().arrayBuffer());
    net.body = bytes;
    const rl: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (/^x-ratelimit-|^ratelimit|^retry-after$|^x-request-id$/i.test(k)) rl[k.toLowerCase()] = v; });
    net.last = { status: res.status, rl };
    if (!net.replay) {
      const f = path.join(RAW, `${net.currentKey}.${stamp()}.http${res.status}.body`);
      writeOnce(f, bytes);
      net.rawFile = path.basename(f);
      if (FAULT === "crash-after-raw") await crash("crash-after-raw");
    }
    return res;
  };

  // Benzetilmiş kesinti: paket/defter durumu kesinti anındaki gibi kalır; yalnız geçici test DB'si kapatılır (yetim süreç bırakmaz).
  let stopDb: (() => Promise<void>) | null = null;
  const crash = async (tag: string): Promise<never> => {
    console.log(`FAULT: ${tag}`);
    try { await stopDb?.(); } catch { /* kesinti */ }
    process.exit(9);
  };
  const env = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_REAL_PG_PORT ?? 54571), dirName: `hd-edu-real-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible", "auth_rate_limit_hit"],
    extraSql: [PRE_DDL, RL_SQL, ...MIG],
  });
  stopDb = () => env.stop();
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const summary: Array<Record<string, unknown>> = [];
  let mustStop = false;
  try {
    const tenant = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ yerel owner')`, [tenant]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level)
                    values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    await su.query(readFileSync(LOCALKEY, "utf8"));
    await su.query(readFileSync(IMPORT, "utf8"));
    console.log(`özel taslak içe aktarıldı: ${Number((await su.query(`select count(*)::int n from public.hd_education_subjects`)).rows[0].n)} kişi (tümü draft)`);

    const io = await import("./snapshot-io");
    for (const m of pre.manifest) {
      if (pre.locked.has(m.natural_key)) continue;
      const r = await io.restoreSnapshotFile(su, path.join(SNAP, m.file), m.sha256);
      console.log(`geri yükleme: ${m.file} → ${r}`);
      summary.push({ restored: m.file, result: r });
      if (r.startsWith("REJECTED")) pre.locked.set(m.natural_key, r);
    }

    const svc = await import("../../../lib/human-design/education/educationCompute");
    const { callRoxyBodygraph } = await import("../../../lib/human-design/providers/roxy/client");
    const { readRoxyServerConfig } = await import("../../../lib/human-design/providers/roxy/config");
    const { hitDbRateLimit, rateLimitBucket } = await import("../../../lib/security/dbRateLimit");
    const { getServerDb } = await import("../../../lib/supabase-server");
    const db = getServerDb();
    const cfg = DRY || MOCK ? { apiKey: "offline-placeholder-key-0000000000", baseUrl: "https://roxyapi.com/api/v2" } : readRoxyServerConfig();
    if (!cfg) die("sağlayıcı yapılandırması yok");
    const deps = {
      config: cfg!,
      // Gövde ürüne de verilir (parse öncesi, katı UTF-8): gövde isteyen ürün sürümü ham yanıtsız kayıt yapmaz; eski sürüm alanı yok sayar.
      callRoxy: async (c: Parameters<typeof callRoxyBodygraph>[0], b: Parameters<typeof callRoxyBodygraph>[1], o: { lang?: string; timeoutMs?: number }) => {
        net.body = null;
        const r = await callRoxyBodygraph(c, b, { ...o, fetchImpl: providerFetch });
        if (!r.ok) return r;
        const bodyText = net.body ? strictUtf8(net.body) : null;
        const out = { ...r, bodyText, bodyError: bodyText === null ? (net.body ? "INVALID_UTF8" as const : "CAPTURE_FAILED" as const) : undefined };
        return out;
      },
      rateLimit: async (scope: string, limit: number, win: number, k?: string) => (FAULT === "no-db-lock" ? { allowed: true, retryAfterSec: 0, mode: "memory" as const } : hitDbRateLimit(db, rateLimitBucket(scope, k ?? "platform"), limit, win)),
      env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: DRY ? "false" : "true" },
    };

    const exportAndRecord = async (key: string, chartId: string, body: Buffer | null, origin: "real" | "recovered") => {
      const ex = await io.exportSnapshot(su, chartId, body ? body.toString("utf8") : null);
      const file = `${key}.v${ex.version}.json`;
      writeOnce(path.join(SNAP, file), ex.json);
      if (FAULT === "crash-after-snapshot-file") await crash("crash-after-snapshot-file");
      appendDurable(MANIFEST, JSON.stringify({ at: nowIso(), file, sha256: io.sha256(ex.json), subject_id: ex.subjectId, natural_key: key, version: ex.version, request_hash: ex.requestHash, format: io.SNAPSHOT_FORMAT_V2,
        provider_body_sha256: ex.bodySha, product_raw_sha256: ex.productSha, provider_canonical_sha256: ex.canonicalSha, product_sha_ok: ex.productShaOk, jsonb_roundtrip_ok: ex.roundtripOk, origin }));
      return { file, ...ex };
    };

    for (const key of KEYS) {
      net.currentKey = key; net.last = null; net.body = null; net.rawFile = null; net.replay = null;
      const row = (await su.query(`select id, revision, utc_status from public.hd_education_subjects where natural_key=$1`, [key])).rows[0] as { id: string; revision: number; utc_status: string } | undefined;
      if (!row) { console.log(`${key}: kayıt yok → ATLANDI`); summary.push({ key, result: "NO_SUBJECT" }); continue; }
      if (row.utc_status !== "VERIFIED") { console.log(`${key}: UTC ${row.utc_status} → sağlayıcıya GÖNDERİLMEZ`); summary.push({ key, result: "UTC_NOT_VERIFIED" }); continue; }
      const inPkg = pre.manifest.some((m) => m.natural_key === key);
      const lockWhy = pre.locked.get(key);

      // ── Kurtarma: yetim gövde → ağ OLMADAN ürün yolundan ──
      if (RECOVER) {
        if (lockWhy !== "ORPHAN_RAW" && lockWhy !== "OPEN_ATTEMPT") { console.log(`${key}: kurtarılacak yetim gövde yok`); summary.push({ key, result: "NOTHING_TO_RECOVER" }); continue; }
        const raws = readdirSync(RAW).filter((r) => r.startsWith(`${key}.`) && /\.http200\.body$/.test(r)).sort();
        if (!raws.length) { console.log(`${key}: yetim 200 gövdesi yok → kurtarılamaz (çağrı YOK)`); summary.push({ key, result: "NO_RAW_200" }); continue; }
        net.replay = readFileSync(path.join(RAW, raws[raws.length - 1]));
        const r = await svc.computeEducationChart({ db, ownerId: OWNER }, row.id, deps);
        const b = r.body as { ok: boolean; chartId?: string; reused?: boolean; code?: string };
        if (b.ok && b.chartId) {
          const ex = await exportAndRecord(key, b.chartId, net.replay, "recovered");
          if (!DRY) appendDurable(LEDGER, JSON.stringify({ at: nowIso(), day: nowIso().slice(0, 10), key, event: "recovered", ok: true, raw: raws[raws.length - 1] } satisfies LedgerRow));
          console.log(`${key}: KURTARILDI (ağ yok, ücret yok) → ${ex.file}`);
          summary.push({ key, result: "RECOVERED", file: ex.file, providerCalls: 0 });
        } else { console.log(`${key}: kurtarma başarısız ${b.code}`); summary.push({ key, result: `RECOVER_FAILED:${b.code}` }); }
        continue;
      }

      if (lockWhy) { console.log(`${key}: KİLİTLİ (${lockWhy}) → ÇAĞRI YOK`); summary.push({ key, result: `LOCKED:${lockWhy}` }); continue; }
      const existing = Number((await su.query(`select count(*)::int n from public.hd_education_charts where subject_id=$1 and subject_revision=$2 and calc_status='OK'`, [row.id, row.revision])).rows[0].n);
      if (!existing && inPkg) { console.log(`${key}: pakette var ama DB'de yok → ÇAĞRI YOK (geri yükleme incelenmeli)`); summary.push({ key, result: "IN_PACKAGE_NOT_RESTORED" }); continue; }
      const day = nowIso().slice(0, 10);
      const led = readJsonl<LedgerRow>(LEDGER);
      if (!existing && !DRY) {
        if (led.filter((r) => r.event === "attempt" && r.day === day).length >= MAX_DAY) { console.log(`${key}: günlük tavan (${MAX_DAY}) → bugün ÇAĞRI YOK`); summary.push({ key, result: "DAY_LIMIT" }); continue; }
        if (led.filter((r) => r.event === "attempt").length >= MAX_TOTAL) { console.log(`${key}: toplam tavan (${MAX_TOTAL}) → ÇAĞRI YOK`); summary.push({ key, result: "TOTAL_LIMIT" }); continue; }
        appendDurable(LEDGER, JSON.stringify({ at: nowIso(), day, key, event: "attempt", ...(MAX_DAY > 10 ? { maxDay: MAX_DAY, ownerApproval: OWNER_APPROVAL } : {}) } satisfies LedgerRow));
      }
      const before = net.provider;
      const r = await svc.computeEducationChart({ db, ownerId: OWNER }, row.id, deps);
      const calls = net.provider - before;
      const body = r.body as { ok: boolean; code?: string; chartId?: string; version?: number; reused?: boolean };
      if (!existing && !DRY) appendDurable(LEDGER, JSON.stringify({ at: nowIso(), day, key, event: "result", ok: body.ok, code: body.code, http: lastCall()?.status ?? null, rl: lastCall()?.rl, raw: lastRawFile() ?? undefined } satisfies LedgerRow));
      console.log(`${key}: HTTP ${r.status} ${body.ok ? `OK v${body.version} reused=${body.reused}` : body.code} · sağlayıcı çağrısı ${calls} · kota ${JSON.stringify(lastCall()?.rl ?? {})}`);
      const item: Record<string, unknown> = { key, status: r.status, ok: body.ok, code: body.code ?? null, reused: body.reused ?? null, providerCalls: calls, quota: lastCall()?.rl ?? null, raw: lastRawFile() };
      if (body.ok && body.chartId && !body.reused) {
        const ex = await exportAndRecord(key, body.chartId, lastBody(), "real");
        Object.assign(item, { file: ex.file, productShaOk: ex.productShaOk, roundtripOk: ex.roundtripOk, bodySha: ex.bodySha });
        if (!ex.productShaOk || !ex.roundtripOk) { console.log(`${key}: BÜTÜNLÜK UYARISI (ürün SHA ${ex.productShaOk}, jsonb ${ex.roundtripOk}) → seri DURDURULDU`); mustStop = true; }
      }
      summary.push(item);
      if ((!body.ok && !DRY) || mustStop) { console.log("seri DURDURULDU (otomatik tekrar yok)"); break; }
    }
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  const out = path.join(PKG, `run-${stamp()}.summary.json`);
  writeOnce(out, JSON.stringify({ at: nowIso(), dryRun: DRY, mock: MOCK, recover: RECOVER, fault: FAULT || null, maxDay: MAX_DAY, ownerApproval: OWNER_APPROVAL || null, providerCalls: net.provider, blocked: net.blocked, locked: [...pre.locked], integrityErrors: pre.errors, items: summary }, null, 2));
  console.log(`\nsağlayıcı çağrısı (bu çalıştırma): ${net.provider} · engellenen dış istek: ${net.blocked.length} · özet: ${out}`);
  // Açık kalan tutamaçlar (DB istemcisi / zamanlayıcı) doğal çıkışı geciktirebilir → kilit bırakılmadan süreç öldürülmesin: AÇIK çıkış.
  process.exit(net.blocked.length ? 3 : 0);
}

main().catch((e) => { console.error("çöktü:", e instanceof Error ? e.message : e); process.exit(1); });
