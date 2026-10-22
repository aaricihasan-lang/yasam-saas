/**
 * HD Hazır Eğitim Haritaları — KONTROLLÜ GERÇEK SAĞLAYICI HESABI (yalnız YEREL, izole embedded-postgres).
 *
 * Production'a SIFIR temas: DB geçici yerel PostgreSQL; ağ kilidi yalnız 127.0.0.1 + TEK sağlayıcı ucu
 * (POST https://roxyapi.com/api/v2/human-design/bodygraph?lang=tr). Başka her istek reddedilir ve sayılır.
 * Hesap, ÜRÜN KODUNUN KENDİSİYLE yapılır: computeEducationChart (UTC katmanı + kaynak kontrolü + snapshot yeniden
 * kullanımı + #519 DB kirası + günlük tavan + şema/normalize + Design anı denetimi) — kısayol YOK.
 *
 * Kalıcılık (geçici DB'ye güvenilmez):
 *   • Başlangıçta paket klasöründeki mevcut snapshot'lar SHA doğrulanarak DB'ye geri yüklenir (kurtarma provası) →
 *     daha önce hesaplanmış kişi için sağlayıcı ÇAĞRILMAZ (ürünün yeniden kullanım yolu).
 *   • Her başarılı hesaptan hemen sonra snapshot (ham yanıt dahil) + kişi kanıtı + kaynaklar + denetim olayları
 *     `<paket>/snapshots/<natural_key>.v<sürüm>.json` olarak yazılır (üzerine yazma YOK) ve `manifest.jsonl`'a SHA eklenir.
 * Çağrı defteri (`ledger.jsonl`, UTC gününe göre): çağrıdan ÖNCE "attempt", sonra sonuç; --max-day / --max-total aşılmaz.
 * Otomatik tekrar YOK. API anahtarı hiçbir dosyaya/loga yazılmaz (yalnız uzunluk denetimi).
 *
 * Kullanım (repo kökünden):
 *   npx tsx scripts/hd-education/real/real-compute.ts --import <özel-import.sql> --local-key <set-local-key.sql>
 *     --owner <uuid> --pkg <repo-dışı paket klasörü> --keys k1,k2,... [--max-day 10] [--max-total 25] [--dry-run]
 */
import Module from "node:module";
import path from "node:path";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

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
function die(m: string): never { console.error(`DUR: ${m}`); process.exit(2); }
const IMPORT = arg("--import") ?? ""; const LOCALKEY = arg("--local-key") ?? ""; const OWNER = arg("--owner") ?? ""; const PKG = arg("--pkg") ?? "";
const KEYS = (arg("--keys") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_DAY = Number(arg("--max-day") ?? 10); const MAX_TOTAL = Number(arg("--max-total") ?? 25);
const DRY = process.argv.includes("--dry-run");
/** Çevrimdışı uçtan uca prova: sağlayıcı yerine repo fixture'ı (ağ YOK, defter YAZILMAZ). Gerçek sonuç DEĞİLDİR. */
const MOCK = process.argv.includes("--mock-provider");
if (!IMPORT || !LOCALKEY || !OWNER || !PKG) die("--import, --local-key, --owner, --pkg zorunlu");
if (!/^[0-9a-f-]{36}$/i.test(OWNER)) die("--owner uuid değil");
if (path.resolve(PKG).startsWith(path.resolve(ROOT))) die("paket klasörü repo İÇİNDE olamaz");
const SNAP = path.join(PKG, "snapshots");
mkdirSync(SNAP, { recursive: true });
mkdirSync(path.join(PKG, "raw"), { recursive: true });
const LEDGER = path.join(PKG, "ledger.jsonl");
const MANIFEST = path.join(PKG, "manifest.jsonl");
const realKey = (process.env.ROXY_API_KEY ?? "").trim();
if (!DRY && !MOCK && (realKey.length < 20 || /zz|fake|test|harness/i.test(realKey))) die("gerçek sağlayıcı anahtarı yok / test anahtarı");

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const nowIso = () => new Date().toISOString();
type LedgerRow = { at: string; day: string; key: string; event: "attempt" | "result"; ok?: boolean; code?: string; http?: number | null; rl?: Record<string, string> };
function ledger(): LedgerRow[] { return existsSync(LEDGER) ? readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as LedgerRow) : []; }
const attemptsDay = (day: string) => ledger().filter((r) => r.event === "attempt" && r.day === day).length;
const attemptsTotal = () => ledger().filter((r) => r.event === "attempt").length;
function writeOnce(file: string, content: string) {
  if (existsSync(file)) die(`üzerine yazılmaz: ${file}`);
  writeFileSync(file, content, { flag: "wx" });
}

async function main() {
  const { ANON_KEY, SERVICE_KEY, startAnamnezTestEnv } = await import("../../anamnez/testEnv");
  const MIG = ["20271110000000_hd_education_catalog_access.sql", "20271112000000_hd_education_compute_publish.sql"]
    .map((f) => readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"));
  const RL_SQL = (() => {
    const m = readFileSync(path.join(ROOT, "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8");
    const a = m.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events");
    const f = m.indexOf("CREATE OR REPLACE FUNCTION public.auth_rate_limit_hit(");
    return m.slice(a, m.indexOf("$$;", f) + 3);
  })();
  const PRE_DDL = `create table public.admin_audit_log (id uuid primary key default gen_random_uuid(), actor_admin_id uuid,
    target_user_id uuid references public.users(id) on delete set null, action text not null, created_at timestamptz not null default now());`;

  // ── Ağ kilidi ────────────────────────────────────────────────────────────────────────────
  type LastCall = { status: number; rl: Record<string, string> };
  const net = { provider: 0, blocked: [] as string[], last: null as LastCall | null, lastText: null as string | null };
  // Kapanış içinde güncellenir → TS daraltmasını önlemek için okuyucu.
  const lastCall = (): LastCall | null => net.last;
  const lastText = (): string | null => net.lastText;
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
  // Sağlayıcı fetch'i: YALNIZ bu uç, YALNIZ POST; durum + kota başlıkları kaydedilir (anahtar ASLA).
  const providerFetch = async (input: string, init: RequestInit): Promise<Response> => {
    if (input !== "https://roxyapi.com/api/v2/human-design/bodygraph?lang=tr" || (init.method ?? "GET") !== "POST") {
      net.blocked.push(input); throw new Error("ağ kilidi: beklenmeyen sağlayıcı ucu");
    }
    if (DRY) throw new Error("dry-run: sağlayıcı çağrılmaz");
    net.provider++;
    const res = MOCK
      ? new Response((await import("../../hd-roxy/consistentFixture")).consistentRoxyResponse(readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8"), String(init.body)), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining": "MOCK" } })
      : await realFetch(input, init);
    // Ham yanıt METNİ hemen saklanır: ürünün provider_raw_sha256'sı sağlayıcı sırasındaki JSON metninin özetidir; jsonb bu
    // sırayı korumaz → doğrulanabilir orijinal yalnız burada yakalanabilir. Metin hemen ayrı dosyaya da yazılır (kayıp yok).
    net.lastText = await res.clone().text();
    const rl: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (/^x-ratelimit-|^ratelimit|^retry-after$|^x-request-id$/i.test(k)) rl[k.toLowerCase()] = v; });
    net.last = { status: res.status, rl };
    return res;
  };

  const env = await startAnamnezTestEnv({
    port: Number(process.env.HD_EDU_REAL_PG_PORT ?? 54571), dirName: `hd-edu-real-${Date.now()}-${randomUUID().slice(0, 8)}`,
    rpcAllow: ["hd_education_grant_access", "hd_education_revoke_access", "hd_education_auto_revoke_ineligible", "auth_rate_limit_hit"],
    extraSql: [PRE_DDL, RL_SQL, ...MIG],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = ANON_KEY;
  const su = env.su;
  const summary: Array<Record<string, unknown>> = [];
  try {
    const tenant = randomUUID();
    await su.query(`insert into public.tenants(id, name) values ($1,'ZZ yerel owner')`, [tenant]);
    await su.query(`insert into public.users(id, full_name, email, role, active, approval_status, is_super_admin, tenant_id, package_type, plan, admin_level)
                    values ($1,'Yerel Owner (test)','owner.local@example.test','admin',true,'approved',true,$2,'premium','premium','owner')`, [OWNER, tenant]);
    await su.query(readFileSync(LOCALKEY!, "utf8"));
    await su.query(readFileSync(IMPORT!, "utf8"));
    const nSub = Number((await su.query(`select count(*)::int n from public.hd_education_subjects`)).rows[0].n);
    console.log(`özel taslak içe aktarıldı: ${nSub} kişi (tümü draft)`);

    // ── Kurtarma provası: mevcut paket snapshot'larını SHA doğrulayarak geri yükle ────────────────
    const { restoreSnapshotFile } = await import("./snapshot-io");
    const manifest = existsSync(MANIFEST) ? readFileSync(MANIFEST, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { file: string; sha256: string }) : [];
    for (const m of manifest) {
      const r = await restoreSnapshotFile(su, path.join(SNAP, m.file), m.sha256);
      console.log(`geri yükleme: ${m.file} → ${r}`);
      summary.push({ restored: m.file, result: r });
    }

    const svc = await import("../../../lib/human-design/education/educationCompute");
    const { callRoxyBodygraph } = await import("../../../lib/human-design/providers/roxy/client");
    const { readRoxyServerConfig } = await import("../../../lib/human-design/providers/roxy/config");
    const { hitDbRateLimit, rateLimitBucket } = await import("../../../lib/security/dbRateLimit");
    const { getServerDb } = await import("../../../lib/supabase-server");
    const { exportSnapshot } = await import("./snapshot-io");
    const db = getServerDb();
    const cfg = DRY || MOCK ? { apiKey: "dry-run-placeholder-key", baseUrl: "https://roxyapi.com/api/v2" } : readRoxyServerConfig();
    if (!cfg) die("sağlayıcı yapılandırması yok");

    for (const key of KEYS) {
      const row = (await su.query(`select id, revision, utc_status from public.hd_education_subjects where natural_key=$1`, [key])).rows[0] as { id: string; revision: number; utc_status: string } | undefined;
      if (!row) { console.log(`${key}: kayıt yok → ATLANDI`); summary.push({ key, result: "NO_SUBJECT" }); continue; }
      if (row.utc_status !== "VERIFIED") { console.log(`${key}: UTC ${row.utc_status} → sağlayıcıya GÖNDERİLMEZ`); summary.push({ key, result: "UTC_NOT_VERIFIED" }); continue; }
      const existing = Number((await su.query(`select count(*)::int n from public.hd_education_charts where subject_id=$1 and subject_revision=$2 and calc_status='OK'`, [row.id, row.revision])).rows[0].n);
      const day = nowIso().slice(0, 10);
      if (!existing) {
        if (attemptsDay(day) >= MAX_DAY) { console.log(`${key}: günlük tavan (${MAX_DAY}) → bugün ÇAĞRI YOK`); summary.push({ key, result: "DAY_LIMIT" }); continue; }
        if (attemptsTotal() >= MAX_TOTAL) { console.log(`${key}: toplam tavan (${MAX_TOTAL}) → ÇAĞRI YOK`); summary.push({ key, result: "TOTAL_LIMIT" }); continue; }
      }
      const before = net.provider;
      if (!existing && !DRY && !MOCK) appendFileSync(LEDGER, JSON.stringify({ at: nowIso(), day, key, event: "attempt" } satisfies LedgerRow) + "\n");
      net.last = null; net.lastText = null;
      const r = await svc.computeEducationChart({ db, ownerId: OWNER }, row.id, {
        config: cfg!,
        callRoxy: (c, b, o) => callRoxyBodygraph(c, b, { ...o, fetchImpl: providerFetch }),
        rateLimit: async (scope, limit, win, k) => hitDbRateLimit(db, rateLimitBucket(scope, k ?? "platform"), limit, win),
        env: { HD_EDUCATION_PROVIDER_CALLS_ENABLED: DRY ? "false" : "true" },
      });
      const calls = net.provider - before;
      const body = r.body as { ok: boolean; code?: string; chartId?: string; version?: number; reused?: boolean };
      if (!existing && !DRY && !MOCK) appendFileSync(LEDGER, JSON.stringify({ at: nowIso(), day, key, event: "result", ok: body.ok, code: body.code, http: lastCall()?.status ?? null, rl: lastCall()?.rl } satisfies LedgerRow) + "\n");
      console.log(`${key}: HTTP ${r.status} ${body.ok ? `OK v${body.version} reused=${body.reused}` : body.code} · sağlayıcı çağrısı ${calls} · kota ${JSON.stringify(lastCall()?.rl ?? {})}`);
      const item: Record<string, unknown> = { key, status: r.status, ok: body.ok, code: body.code ?? null, reused: body.reused ?? null, providerCalls: calls, quota: lastCall()?.rl ?? null };
      if (calls > 0 && lastText() !== null) {
        // ACİL KAYIT: sağlayıcı yanıtı her durumda (başarılı/başarısız) diske — geçici DB kapanmadan önce.
        writeOnce(path.join(PKG, "raw", `${key}.${nowIso().replace(/[:.]/g, "")}.provider.json`), lastText()!);
      }
      if (body.ok && body.chartId && !body.reused) {
        const ex = await exportSnapshot(su, body.chartId, lastText());
        const file = `${key}.v${ex.version}.json`;
        writeOnce(path.join(SNAP, file), ex.json);
        const s = sha256(ex.json);
        appendFileSync(MANIFEST, JSON.stringify({ at: nowIso(), file, sha256: s, subject_id: ex.subjectId, natural_key: key, version: ex.version, request_hash: ex.requestHash, provider_raw_sha256: ex.rawSha }) + "\n");
        item.file = file; item.sha256 = s;
      }
      summary.push(item);
      if (!body.ok && !DRY) { console.log("BAŞARISIZ HESAP → seri DURDURULDU (otomatik tekrar yok)"); break; }
    }
  } finally {
    globalThis.fetch = realFetch;
    await env.stop();
  }
  const out = path.join(PKG, `run-${nowIso().replace(/[:.]/g, "")}.summary.json`);
  writeOnce(out, JSON.stringify({ at: nowIso(), dryRun: DRY, mock: MOCK, providerCalls: net.provider, blocked: net.blocked, items: summary }, null, 2));
  console.log(`\nsağlayıcı çağrısı (bu çalıştırma): ${net.provider} · engellenen dış istek: ${net.blocked.length} · özet: ${out}`);
  if (net.blocked.length) process.exit(3);
}

main().catch((e) => { console.error("çöktü:", e instanceof Error ? e.message : e); process.exit(1); });
