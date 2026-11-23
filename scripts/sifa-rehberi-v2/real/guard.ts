/**
 * Şifa Rehberi V2 — 8. aşama GERÇEK Supabase testleri için FAIL-CLOSED hedef koruması.
 *
 * Tek izinli hedef: ayrı test projesi `sifa-rehberi-v2-test` (ref dbyfbuqsbgfsoaakmvsx, eu-west-1).
 * Sırlar YALNIZ repo dışındaki klasörden okunur; hiçbir yere yazılmaz/yazdırılmaz.
 *
 * Sıra (her betik):
 *   1) loadTestTarget()    — dosyalar + ref + URL + anahtar biçimi + bilinen production ref'leri.
 *                            Uyuşmazlıkta İSTİSNA → hiçbir ağ/SQL çağrısı yapılmaz.
 *   2) installNetworkFence — süreç içi fetch YALNIZ test projesine ve 127.0.0.1/localhost'a çıkabilir.
 *   3) connectTestDb()     — pooler kullanıcı adı `postgres.<ref>` (Supavisor bu ada göre yönlendirir);
 *                            bağlandıktan sonra test işaret tablosu (zz_sifa_v2_test_marker) doğrulanır.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

export const EXPECTED_REF = "dbyfbuqsbgfsoaakmvsx";
export const EXPECTED_REGION = "eu-west-1";
export const POOLER_HOST = `aws-0-${EXPECTED_REGION}.pooler.supabase.com`;
/** Git DIŞI gizli klasör (test projesi bağlantı dosyaları). Yol repoda tutulmaz; tanımlı değilse FAIL-CLOSED. */
const SECRET_DIR = process.env.SIFA_V2_TEST_SECRET_DIR ?? "";
const FILES = ["sifa-v2-test-dbpass.env", "sifa-v2-test-project.env", "sifa-v2-test-keys.env"] as const;
/** Bilinen production / diğer projelerin ref ÖNEKLERİ (Frankfurt prod, Tokyo). Tam ref repoda tutulmaz. */
const FORBIDDEN_REF_PREFIXES = ["wctopfoo", "ylasompux"];

export type TestTarget = {
  ref: string;
  url: string;
  host: string;
  publishableKey: string;
  secretKey: string;
  dbPassword: string;
};

function fail(msg: string): never {
  throw new Error(`[GUARD] FAIL-CLOSED: ${msg} — hiçbir ağ/SQL işlemi yapılmadı.`);
}

function parseEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

let cached: TestTarget | null = null;

export function loadTestTarget(): TestTarget {
  if (cached) return cached;
  const env: Record<string, string> = {};
  for (const f of FILES) {
    const p = testSecretFile(f);
    if (!existsSync(p)) fail(`gizli dosya yok: ${f}`);
    Object.assign(env, parseEnv(p));
  }
  cached = validateTarget(env);
  return cached;
}

/** Gizli klasördeki bir dosyanın yolu (SIFA_V2_TEST_SECRET_DIR zorunlu). */
export function testSecretFile(name: string): string {
  if (!SECRET_DIR) fail("SIFA_V2_TEST_SECRET_DIR tanımlı değil (Git dışı gizli klasör)");
  return path.join(SECRET_DIR, name);
}

/** SAF doğrulama (ağ yok) — guard.selftest sahte değerlerle sınar. */
export function validateTarget(env: Record<string, string>): TestTarget {
  const ref = env.SIFA_TEST_PROJECT_REF ?? "";
  const url = env.SIFA_TEST_SUPABASE_URL ?? "";
  if (ref !== EXPECTED_REF) fail("SIFA_TEST_PROJECT_REF beklenen test ref'i değil");
  if (env.SIFA_TEST_REGION !== EXPECTED_REGION) fail("SIFA_TEST_REGION beklenen bölge değil");
  let host = "";
  try {
    const u = new URL(url);
    host = u.host;
    if (u.protocol !== "https:" || u.pathname.replace(/\/$/, "") !== "") fail("URL biçimi beklenmedik");
  } catch {
    fail("SIFA_TEST_SUPABASE_URL ayrıştırılamadı");
  }
  if (host !== `${EXPECTED_REF}.supabase.co`) fail("URL host test projesine ait değil");
  for (const p of FORBIDDEN_REF_PREFIXES) if (ref.startsWith(p) || host.startsWith(p)) fail("bilinen production/Tokyo ref'i");
  const pk = env.SIFA_TEST_PUBLISHABLE_KEY ?? "";
  const sk = env.SIFA_TEST_SECRET_KEY ?? "";
  const pw = env.SIFA_TEST_DB_PASSWORD ?? "";
  if (!/^sb_publishable_\S{20,}$/.test(pk)) fail("publishable key biçimi");
  if (!/^sb_secret_\S{20,}$/.test(sk)) fail("secret key biçimi");
  if (pw.length < 16) fail("DB parolası boş/kısa");
  // Bu çalışma kopyasının ve (verilirse) ana deponun Supabase CLI bağı — test ref'iyle AYNI olmamalı.
  const mainRepo = process.env.SIFA_V2_MAIN_REPO_DIR;
  for (const linked of [path.resolve("supabase/.temp/project-ref"), ...(mainRepo ? [path.join(mainRepo, "supabase/.temp/project-ref")] : [])]) {
    if (existsSync(linked) && readFileSync(linked, "utf8").trim() === ref) fail("test ref'i bağlı Supabase projesiyle aynı");
  }
  return { ref, url: `https://${host}`, host, publishableKey: pk, secretKey: sk, dbPassword: pw };
}

/** Süreç içi fetch çitini kurar: yalnız test projesi + yerel adresler. */
export function installNetworkFence(t: TestTarget = loadTestTarget()): void {
  const g = globalThis as unknown as { fetch: typeof fetch; __sifaFence?: boolean };
  if (g.__sifaFence) return;
  const orig = g.fetch.bind(globalThis);
  g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const u = new URL(raw);
    const okHost = u.host === t.host || u.hostname === "127.0.0.1" || u.hostname === "localhost";
    if (!okHost) throw new Error(`[GUARD] ağ çiti: izinsiz hedef ${u.hostname}`);
    return orig(input as RequestInfo, init);
  }) as typeof fetch;
  g.__sifaFence = true;
}

/** Sırrı içerebilecek metni temizler (hata mesajları için). */
export function redact(s: string, t: TestTarget = loadTestTarget()): string {
  let o = String(s);
  for (const v of [t.secretKey, t.publishableKey, t.dbPassword]) if (v) o = o.split(v).join("***");
  return o;
}

export function pgConfig(t: TestTarget = loadTestTarget()): pg.ClientConfig {
  return {
    host: POOLER_HOST,
    port: 5432, // session pooler (DDL + uzun işlem güvenli)
    user: `postgres.${t.ref}`,
    password: t.dbPassword,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  };
}

/**
 * Test DB bağlantısı. requireMarker=true (varsayılan): işaret tablosu yoksa / ref farklıysa bağlantı kapatılır
 * ve istisna atılır. Yalnız ilk kurulum (setup-deps) requireMarker=false kullanır ve boş DB şartı arar.
 */
export async function connectTestDb(opts: { requireMarker?: boolean } = {}): Promise<pg.Client> {
  const t = loadTestTarget();
  const c = new pg.Client(pgConfig(t));
  try {
    await c.connect();
  } catch (e) {
    throw new Error(`[GUARD] DB bağlantısı kurulamadı: ${redact((e as Error).message, t)}`);
  }
  if (opts.requireMarker !== false) {
    const r = await c.query("select to_regclass('public.zz_sifa_v2_test_marker') is not null as has").catch(() => ({ rows: [{ has: false }] }));
    const ok = r.rows[0]?.has ? (await c.query("select ref from public.zz_sifa_v2_test_marker")).rows.every((x) => x.ref === t.ref) : false;
    if (!ok) {
      await c.end().catch(() => {});
      fail("bağlanılan veritabanında test işaret tablosu yok/uyuşmuyor");
    }
  }
  return c;
}

/** Next sunucu kodunun (getServerDb) kullanacağı süreç-içi ortam — dosyaya YAZILMAZ. */
export function applyProcessEnv(t: TestTarget = loadTestTarget()): void {
  process.env.NEXT_PUBLIC_SUPABASE_URL = t.url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = t.publishableKey;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = t.publishableKey;
  process.env.SUPABASE_SERVICE_ROLE_KEY = t.secretKey;
}
