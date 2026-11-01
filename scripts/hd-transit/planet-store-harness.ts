/**
 * HD TRANSİT — KALICI GEZEGEN KONUMU ÖNBELLEĞİ (L2, hd_transit_planet_positions) testi.
 *   Gerçek migration + gerçek kilit RPC'si (auth_rate_limit_hit) izole gömülü Postgres'te; sahte PostgREST; SAHTE Roxy
 *   (ücretli çağrı YOK, dış ağ YOK). Çoklu sunucu örneği = worker_threads (modül durumu ayrı, DB ortak) — gerçek Vercel
 *   DEĞİLDİR. Sonuçlar: isabet / ıskalama / onarım / kota / eşzamanlılık / güvenlik (RLS) / eski yola dönüş.
 * Çalıştır: npx tsx scripts/hd-transit/planet-store-harness.ts   (HD_PS_PG_PORT, varsayılan 54486)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_KEY, startAnamnezTestEnv, type TestEnv } from "../anamnez/testEnv";
import { fakePlanetsResponse } from "./fakeRoxyTransit";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { resolveGeneralTransit, __resetTransitResolverCache, TRANSIT_PLANETS_WAIT_BUDGET_MS, type ResolveDeps, type TransitResolveMetric } from "../../lib/human-design/transit/resolveTransit";
import {
  createSupabasePlanetStore, planetCacheKey, repairCacheKey, validatePlanetRow, hdTransitPlanetStoreEnabled,
  HD_TRANSIT_PLANET_ENGINE_VERSION, type PlanetStore,
} from "../../lib/human-design/transit/transitPlanetStore";
import pg from "pg";
import { rateLimitBucket } from "../../lib/security/dbRateLimit";
import { ROXY_PLANETS_ADAPTER_VERSION } from "../../lib/human-design/transit/roxyPlanetsClient";
import { ROXY_POLICY } from "../../lib/human-design/providers/roxy/config";
import type { RoxyCallResult } from "../../lib/human-design/providers/roxy/client";

let pass = 0, fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 700)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ROOT = path.resolve(__dirname, "../..");
const MIG = readFileSync(path.join(ROOT, "supabase/migrations/20271226000000_hd_transit_planet_positions.sql"), "utf8");
const RL_SRC = readFileSync(path.join(ROOT, "supabase/migrations/20270130000000_admin_member_phase2.sql"), "utf8");
// Yalnız gerçek kilit/kota bölümü (tablo + auth_rate_limit_hit) — prod ile aynı SQL metni.
const RL_SQL = RL_SRC.slice(RL_SRC.indexOf("CREATE TABLE IF NOT EXISTS public.auth_rate_limit_events"), RL_SRC.indexOf("-- ── 2)"));
process.env.RATE_LIMIT_SECRET = "zz-planet-store-harness-rl-secret";
const PG_PORT = Number(process.env.HD_PS_PG_PORT ?? 54486);
// Kilit / kota: GERÇEK auth_rate_limit_hit SQL fonksiyonu doğrudan (test PostgREST'i RPC sonucunu satır dizisi döndürür; gerçek
// PostgREST jsonb'yi doğrudan döndürür — hitDbRateLimit sözleşmesi bu yüzden pg ile birebir uygulanır).
let rlPool: pg.Pool | null = null;
async function dbRateLimit(bucket: string, limit: number, windowSeconds: number) {
  if (!rlPool) {
    rlPool = new pg.Pool({ host: "127.0.0.1", port: PG_PORT, user: "postgres", password: "testpw", database: "postgres", max: 8 });
    rlPool.on("error", () => undefined); // kapanışta boştaki bağlantı kopması test sonucunu etkilemez
  }
  const r = await rlPool.query("select public.auth_rate_limit_hit($1, $2, $3) as v", [bucket, limit, windowSeconds]);
  const v = r.rows[0].v as { allowed: boolean; retry_after: number };
  return { allowed: v.allowed === true, retryAfterSec: Math.max(0, Number(v.retry_after) || 0) };
}

/** Yerel motorun belirsiz bulduğu (Roxy gezegen konumu gereken) art arda farklı anlar. */
function uncertainMoments(fromIso: string, n: number, stepMs = 60_000): string[] {
  const out: string[] = [];
  let t = Date.parse(fromIso);
  while (out.length < n) { if (computeGeneralTransit(new Date(t)).hasUncertainty) out.push(new Date(t).toISOString().replace(".000Z", "Z")); t += stepMs; }
  return out;
}
const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN; };

type Prov = { calls: number; mode: "ok" | "429" | "500" | "timeout" | "schema" | "offband"; delayMs: number };
function mkDeps(db: SupabaseClient, prov: Prov, metrics: Record<string, number>, extra: Partial<ResolveDeps> = {}, logs: string[] = []): ResolveDeps {
  return {
    config: { apiKey: "zz-fake-roxy-key-must-not-leak", baseUrl: "https://example.invalid" },
    callPlanets: async (_c, body): Promise<RoxyCallResult> => {
      prov.calls++;
      if (prov.delayMs) await sleep(prov.delayMs);
      const iso = `${body.date}T${body.time}Z`;
      if (prov.mode === "429") return { ok: false, kind: "rate_limited", status: 429 };
      if (prov.mode === "500") return { ok: false, kind: "server_error", status: 500 };
      if (prov.mode === "timeout") return { ok: false, kind: "timeout", status: null };
      if (prov.mode === "schema") return { ok: true, raw: { planets: [] } };
      if (prov.mode === "offband") { const r = fakePlanetsResponse(iso); r.planets[0].longitude = (r.planets[0].longitude + 0.5) % 360; return { ok: true, raw: r }; }
      return { ok: true, raw: fakePlanetsResponse(iso) };
    },
    rateLimit: (scope, value, limit, windowSeconds) => dbRateLimit(rateLimitBucket(scope, value), limit, windowSeconds),
    userId: "harness-user-A",
    tenantId: "harness-tenant-A",
    planetStore: createSupabasePlanetStore(db, { log: (m, d) => logs.push(`${m} ${JSON.stringify(d ?? "")}`) }),
    metrics: (m: TransitResolveMetric) => { metrics[m] = (metrics[m] ?? 0) + 1; },
    log: (m, d) => logs.push(`${m} ${JSON.stringify(d ?? "")}`),
    ...extra,
  };
}

async function runWorkers(env: TestEnv, utcIso: string, total: number, workers: number, opts: { providerDelayMs?: number; providerMode?: "ok" | "500"; waitBudgetMs?: number }) {
  const per = Array.from({ length: workers }, (_, i) => Math.floor(total / workers) + (i < total % workers ? 1 : 0)).filter((n) => n > 0);
  const t0 = performance.now();
  const outs = await Promise.all(per.map((n, i) => new Promise<{ providerCalls: number; metrics: Record<string, number>; lat: number[]; results: string[] }>((resolve, reject) => {
    const w = new Worker(path.join(__dirname, "planet-store-worker.ts"), {
      execArgv: ["--import", "tsx"],
      workerData: { url: env.url, serviceKey: SERVICE_KEY, pgPort: PG_PORT, utcIso, n, providerDelayMs: opts.providerDelayMs ?? 300, providerMode: opts.providerMode ?? "ok", waitBudgetMs: opts.waitBudgetMs ?? TRANSIT_PLANETS_WAIT_BUDGET_MS, userPrefix: `w${i}` },
    });
    w.once("message", (m) => { resolve(m); void w.terminate(); });
    w.once("error", reject);
  })));
  const wall = performance.now() - t0;
  const metrics: Record<string, number> = {};
  for (const o of outs) for (const [k, v] of Object.entries(o.metrics)) metrics[k] = (metrics[k] ?? 0) + v;
  const lat = outs.flatMap((o) => o.lat);
  const results = outs.flatMap((o) => o.results);
  return { providerCalls: outs.reduce((s, o) => s + o.providerCalls, 0), metrics, lat, results, wall };
}

async function main() {
  const env: TestEnv = await startAnamnezTestEnv({ port: PG_PORT, dirName: "hd-transit-planet-store-pgdata", rpcAllow: ["auth_rate_limit_hit"], extraSql: [RL_SQL, MIG] });
  const su = env.su;
  const db = createClient(env.url, SERVICE_KEY, { auth: { persistSession: false } });
  const perf: Record<string, unknown> = {};
  try {
    const M = uncertainMoments("2026-11-05T00:00:00Z", 40);
    const rows = async (iso?: string) => (await su.query(`select * from public.hd_transit_planet_positions ${iso ? "where utc_at = $1" : ""} order by created_at`, iso ? [iso] : [])).rows;
    const fresh = () => __resetTransitResolverCache(); // "yeni sunucu örneği": süreç önbelleği boş

    section("0. Migration + RLS + yetkiler (gerçek SQL)");
    {
      const t = (await su.query(`select relrowsecurity from pg_class where oid = 'public.hd_transit_planet_positions'::regclass`)).rows[0];
      const pol = (await su.query(`select count(*)::int n from pg_policies where tablename = 'hd_transit_planet_positions'`)).rows[0].n;
      ok(t.relrowsecurity === true && pol === 0, "0a RLS etkin, policy YOK (deny-by-default)", { t, pol });
      const priv = (r: string, p: string) => su.query(`select has_table_privilege($1, 'public.hd_transit_planet_positions', $2) v`, [r, p]).then((x) => x.rows[0].v as boolean);
      ok(!(await priv("anon", "SELECT")) && !(await priv("anon", "INSERT")) && !(await priv("authenticated", "SELECT")) && !(await priv("authenticated", "INSERT")), "0b anon / authenticated: SELECT ve INSERT yetkisi YOK");
      ok((await priv("service_role", "SELECT")) && (await priv("service_role", "INSERT")) && !(await priv("service_role", "UPDATE")) && !(await priv("service_role", "DELETE")), "0c service_role: yalnız SELECT + INSERT (UPDATE / DELETE YOK → bozuk kayıt kodla silinemez/ezilemez)");
      const cols = (await su.query(`select column_name from information_schema.columns where table_name = 'hd_transit_planet_positions' order by ordinal_position`)).rows.map((r) => r.column_name);
      ok(JSON.stringify(cols) === JSON.stringify(["cache_key", "utc_at", "provider", "adapter_version", "node_type", "engine_version", "schema_version", "longitudes", "created_at"]) && !cols.some((c) => /tenant|user|client|birth|name/i.test(c)), "0d sütunlar yalnız astronomik / sürüm alanları (tenant / kullanıcı / danışan / doğum sütunu YOK)", cols);
      let anonErr = "";
      try { await su.query("SET ROLE anon"); await su.query("select * from public.hd_transit_planet_positions"); } catch (e) { anonErr = (e as { code?: string }).code ?? "x"; } finally { await su.query("RESET ROLE"); }
      let authErr = "";
      try { await su.query("SET ROLE authenticated"); await su.query(`insert into public.hd_transit_planet_positions(cache_key, utc_at, provider, adapter_version, node_type, engine_version, longitudes) values ('x'||repeat('y',30), now(), 'roxyapi','a','true','e','{}')`); } catch (e) { authErr = (e as { code?: string }).code ?? "x"; } finally { await su.query("RESET ROLE"); }
      ok(anonErr === "42501" && authErr === "42501", "0e anon SELECT ve authenticated INSERT gerçek rollerle → 42501 permission denied", { anonErr, authErr });
      const again = await su.query(MIG).then(() => "ok", (e) => String(e));
      ok(again === "ok", "0f migration idempotent (ikinci uygulama hatasız)", again);
      // Kısıtlar: eksik cisim / dizi / saniye altı / sağlayıcı
      const base = { k: "hdtp1|" + "z".repeat(30), lon: JSON.stringify(Object.fromEntries(["Sun","Moon","Mercury","Venus","Mars","Jupiter","Saturn","Uranus","Neptune","Pluto","NorthNode","SouthNode"].map((b) => [b, 10]))) };
      const ins = (over: Record<string, unknown>) => su.query(`insert into public.hd_transit_planet_positions(cache_key, utc_at, provider, adapter_version, node_type, engine_version, longitudes) values ($1,$2,$3,'a','true','e',$4)`, [over.k ?? base.k, over.utc ?? "2026-01-01T00:00:00Z", over.p ?? "roxyapi", over.lon ?? base.lon]).then(() => "ok", (e) => (e as { code?: string }).code);
      const noMoon = JSON.parse(base.lon); delete noMoon.Moon;
      ok((await ins({ lon: JSON.stringify(noMoon) })) === "23514" && (await ins({ lon: "[1,2]" })) === "23514" && (await ins({ utc: "2026-01-01T00:00:00.500Z" })) === "23514" && (await ins({ p: "other" })) === "23514",
        "0g kısıtlar: eksik cisim / dizi / saniye altı an / farklı sağlayıcı → 23514 (DB düzeyinde reddedilir)");
      await su.query(`delete from public.hd_transit_planet_positions`);
    }

    section("1–6. Isabet / ıskalama / paylaşım / saniye / anahtar sürümleri");
    {
      fresh();
      const prov: Prov = { calls: 0, mode: "ok", delayMs: 0 };
      const met: Record<string, number> = {};
      const logs: string[] = [];
      const r1 = await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met, {}, logs));
      const st = await rows(M[0]);
      ok(r1.resolution === "roxy-resolved" && prov.calls === 1 && st.length === 1 && met.l2_miss === 1 && met.store_written === 1, "1 ilk istek: MISS → 1 sağlayıcı çağrısı → kayıt yazıldı; sonuç TAM", { res: r1.resolution, calls: prov.calls, n: st.length, met });
      const row = st[0];
      ok(row.cache_key === planetCacheKey(M[0], "true") && row.engine_version === HD_TRANSIT_PLANET_ENGINE_VERSION && row.adapter_version === ROXY_PLANETS_ADAPTER_VERSION && row.node_type === "true" && Object.keys(row.longitudes).length === 12 && !JSON.stringify(row).includes("harness-user") && !JSON.stringify(row).includes("harness-tenant"),
        "1b kayıt: deterministik anahtar + sürüm alanları + 12 boylam; kullanıcı / tenant kimliği YOK", { key: row.cache_key });
      const qBefore = (await su.query(`select count(*)::int n from public.auth_rate_limit_events`)).rows[0].n;
      fresh();
      const met2: Record<string, number> = {};
      const r2 = await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met2));
      const qAfter = (await su.query(`select count(*)::int n from public.auth_rate_limit_events`)).rows[0].n;
      ok(r2.resolution === "roxy-resolved" && prov.calls === 1 && met2.l2_hit === 1 && qAfter === qBefore && JSON.stringify(r2.transit.activations) === JSON.stringify(r1.transit.activations),
        "2 ikinci istek (yeni örnek): L2 HIT → 0 sağlayıcı çağrısı, kilit/kota kaydı DEĞİŞMEDİ, sonuç birebir aynı", { calls: prov.calls, met2, qBefore, qAfter });
      fresh();
      const met3: Record<string, number> = {};
      const r3 = await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met3, { userId: "harness-user-B", tenantId: "harness-tenant-B" }));
      ok(prov.calls === 1 && met3.l2_hit === 1 && JSON.stringify(r3.transit) === JSON.stringify(r2.transit), "3–4 farklı kullanıcı + farklı tenant aynı UTC anı → ortak astronomik HIT; kayıtta kişisel alan yok (1b/0d)");
      fresh();
      const met4: Record<string, number> = {};
      await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met4));
      ok(met4.l2_hit === 1, "3b L1 sıfırken L2; aynı süreçte tekrar → L1");
      const met5: Record<string, number> = {};
      await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met5));
      ok(met5.l1_hit === 1 && !met5.l2_hit && prov.calls === 1, "3c aynı süreçte ikinci istek → L1 HIT (DB okuması da yok)", met5);
      // 5) saniye hassasiyeti: belirsiz bir anın +1 sn'si
      const s0 = M[1];
      const s1 = new Date(Date.parse(s0) + 1000).toISOString().replace(".000Z", "Z");
      fresh();
      if (computeGeneralTransit(new Date(s1)).hasUncertainty) {
        const before = prov.calls;
        await resolveGeneralTransit(new Date(s0), mkDeps(db, prov, {}));
        fresh();
        await resolveGeneralTransit(new Date(s1), mkDeps(db, prov, {}));
        const k = (await su.query(`select cache_key, utc_at from public.hd_transit_planet_positions where utc_at in ($1,$2) order by utc_at`, [s0, s1])).rows;
        ok(prov.calls === before + 2 && k.length === 2 && k[0].cache_key !== k[1].cache_key && Date.parse(k[1].utc_at) - Date.parse(k[0].utc_at) === 1000, "5 1 saniye farklı iki an → iki ayrı anahtar ve kayıt (yanlış eşleşme yok, saniye korunur)", k);
      } else ok(false, "5 test anı +1 sn yerelde kesin çıktı (test kurgusu)");
      ok(planetCacheKey(M[0], "mean") !== planetCacheKey(M[0], "true") && planetCacheKey(M[0], "true").includes(`|${HD_TRANSIT_PLANET_ENGINE_VERSION}|`) && planetCacheKey(M[0], "true").includes(`|${ROXY_PLANETS_ADAPTER_VERSION}|`), "6 nodeType / adaptör / motor sürümü anahtara girer (farklı ayarlar asla aynı kaydı okumaz)");
      let bad = "";
      try { planetCacheKey("2026-11-05T00:00:00.123Z", "true"); } catch (e) { bad = String(e); }
      ok(bad.includes("saniye"), "6b saniye altı / biçimsiz an anahtar üretmez");
      ok(!logs.join("\n").includes("zz-fake-roxy-key") && !logs.join("\n").includes("harness-user") && !logs.join("\n").includes("harness-tenant"), "6c günlüklerde API anahtarı / kullanıcı / tenant kimliği YOK");
    }

    section("7–11. Bozuk / eski kayıt → kontrollü onarım (silme YOK, tekrar eden 502 / ücretli çağrı YOK)");
    {
      const lonOk = (iso: string) => { const p = fakePlanetsResponse(iso); return Object.fromEntries(p.planets.slice(0, 12).map((x) => [x.name === "North Node" ? "NorthNode" : x.name === "South Node" ? "SouthNode" : x.name, x.longitude])); };
      const plant = async (iso: string, lon: Record<string, unknown>, engine = HD_TRANSIT_PLANET_ENGINE_VERSION) =>
        su.query(`insert into public.hd_transit_planet_positions(cache_key, utc_at, provider, adapter_version, node_type, engine_version, longitudes) values ($1,$2,'roxyapi',$3,'true',$4,$5)`, [planetCacheKey(iso, "true"), iso, ROXY_PLANETS_ADAPTER_VERSION, engine, JSON.stringify(lon)]);
      const cases: Array<[string, string, Record<string, unknown>, string?]> = [
        ["7 eksik cisim değeri (null)", M[10], { ...lonOk(M[10]), Moon: null }],
        ["8 bozuk değer (metin)", M[11], { ...lonOk(M[11]), Venus: "abc" }],
        ["9 geçersiz boylam (400°)", M[12], { ...lonOk(M[12]), Sun: 400 }],
        ["10 uyumsuz düğüm (Güney ≠ Kuzey+180)", M[13], { ...lonOk(M[13]), SouthNode: ((lonOk(M[13]).NorthNode as number) + 90) % 360 }],
        ["11 eski motor sürümü", M[14], lonOk(M[14]), "ae0-old"],
        ["11b şema geçerli ama yerel bant dışı (1° kaymış)", M[15], { ...lonOk(M[15]), Mars: ((lonOk(M[15]).Mars as number) + 1) % 360 }],
      ];
      for (const [label, iso, lon, eng] of cases) {
        await plant(iso, lon, eng);
        const prov: Prov = { calls: 0, mode: "ok", delayMs: 0 };
        fresh();
        const met: Record<string, number> = {};
        const r = await resolveGeneralTransit(new Date(iso), mkDeps(db, prov, met));
        fresh();
        const met2: Record<string, number> = {};
        const r2 = await resolveGeneralTransit(new Date(iso), mkDeps(db, prov, met2));
        fresh();
        const r3 = await resolveGeneralTransit(new Date(iso), mkDeps(db, prov, {}));
        const all = await rows(iso);
        const original = all.find((x) => x.cache_key === planetCacheKey(iso, "true"));
        const repair = all.find((x) => x.cache_key !== planetCacheKey(iso, "true"));
        ok(r.resolution === "roxy-resolved" && r2.resolution === "roxy-resolved" && r3.resolution === "roxy-resolved" && prov.calls === 1 && met2.l2_repaired_hit === 1 && !!original && !!repair && repair.cache_key === repairCacheKey(planetCacheKey(iso, "true"), original.longitudes),
          `${label} → kullanıcıya bozuk veri YOK; 1 kontrollü yeni çağrı; sonraki istekler onarım anahtarından HIT (0 çağrı); bozuk kayıt SİLİNMEDİ`, { res: [r.resolution, r2.resolution, r3.resolution], calls: prov.calls, met2, n: all.length });
      }
      ok(validatePlanetRow({ cache_key: "k", utc_at: M[0], provider: "roxyapi", adapter_version: ROXY_PLANETS_ADAPTER_VERSION, node_type: "true", engine_version: HD_TRANSIT_PLANET_ENGINE_VERSION, schema_version: 1, longitudes: "{not json" }, { cacheKey: "k", utcIso: M[0], nodeType: "true" }) === null,
        "8b bozuk JSON metni (jsonb dışı) → doğrulayıcı reddeder (DB'de zaten nesne zorunlu, 0g)");
    }

    section("12–14. Sağlayıcı hataları önbelleğe girmez");
    for (const [label, mode] of [["12 Roxy 429", "429"], ["13 Roxy 500", "500"], ["14 ağ zaman aşımı", "timeout"], ["14b şemasız yanıt", "schema"], ["14c yerel bant dışı yanıt", "offband"]] as const) {
      const iso = M[20 + ["429", "500", "timeout", "schema", "offband"].indexOf(mode)];
      fresh();
      const prov: Prov = { calls: 0, mode, delayMs: 0 };
      let res = "", threw = "";
      try { res = (await resolveGeneralTransit(new Date(iso), mkDeps(db, prov, {}))).resolution; } catch (e) { threw = (e as Error).constructor.name; }
      const n = (await rows(iso)).length;
      ok(n === 0 && prov.calls === 1 && (mode === "offband" ? threw === "TransitVerificationError" : res === "unresolved"), `${label} → sonuç başarı sayılmaz (${mode === "offband" ? "502 doğrulanamadı" : "unresolved"}), kayıt YAZILMADI, tek çağrı`, { res, threw, n, calls: prov.calls });
    }

    section("15–17. Önbellek altyapı hataları → kontrollü eski davranış");
    {
      // 15) okuma hatası (DB erişilemez) → eski sharedCache yolu (Data Cache benzetimi), tek çağrı
      fresh();
      const deadDb = createClient("http://127.0.0.1:1", SERVICE_KEY, { auth: { persistSession: false } });
      const prov: Prov = { calls: 0, mode: "ok", delayMs: 0 };
      const met: Record<string, number> = {};
      let sharedUsed = 0;
      const r = await resolveGeneralTransit(new Date(M[25]), mkDeps(db, prov, met, { planetStore: createSupabasePlanetStore(deadDb, { readTimeoutMs: 800 }), sharedCache: async (_k, fn) => { sharedUsed++; return fn(); } }));
      ok(r.resolution === "roxy-resolved" && met.l2_unavailable === 1 && sharedUsed === 1 && prov.calls === 1, "15 L2 okuma hatası → eski (Next Data Cache) yolu, tek çağrı, sonuç TAM", { met, sharedUsed, calls: prov.calls });
      // 15b) tablo yok (migration uygulanmadan önceki prod) → aynı geri dönüş
      fresh();
      await su.query(`alter table public.hd_transit_planet_positions rename to hd_tpp_hidden`);
      const met2: Record<string, number> = {};
      let shared2 = 0;
      const r2 = await resolveGeneralTransit(new Date(M[26]), mkDeps(db, prov, met2, { sharedCache: async (_k, fn) => { shared2++; return fn(); } }));
      await su.query(`alter table public.hd_tpp_hidden rename to hd_transit_planet_positions`);
      ok(r2.resolution === "roxy-resolved" && met2.l2_unavailable === 1 && shared2 === 1, "15b tablo yok (migration öncesi) → eski yol, sonuç TAM (kod migration'dan önce yayınlanabilir)", { met2 });
      // 16) yazma hatası → sonuç yine gösterilir, ikinci çağrı yok
      fresh();
      const real = createSupabasePlanetStore(db);
      const noWrite: PlanetStore = { read: real.read, write: async () => "failed" };
      const met3: Record<string, number> = {};
      const c0 = prov.calls;
      const r3 = await resolveGeneralTransit(new Date(M[27]), mkDeps(db, prov, met3, { planetStore: noWrite }));
      ok(r3.resolution === "roxy-resolved" && met3.store_write_failed === 1 && prov.calls === c0 + 1 && (await rows(M[27])).length === 0, "16 L2 yazma hatası → geçerli sonuç gösterilir, tek çağrı (yazma başarısızlığı sonucu engellemez)", met3);
      // 17) kalıcı DB kesintisi: L2 + kilit RPC'si erişilemez → kilit süreç belleğine düşer (best-effort), eski yol, tek çağrı
      fresh();
      const met4: Record<string, number> = {};
      const c1 = prov.calls;
      const r4 = await resolveGeneralTransit(new Date(M[28]), mkDeps(deadDb, prov, met4, { planetStore: createSupabasePlanetStore(deadDb, { readTimeoutMs: 800 }) }));
      ok(r4.resolution === "roxy-resolved" && met4.l2_unavailable === 1 && prov.calls === c1 + 1, "17 kalıcı DB kesintisi → kontrollü eski davranış (kilit/kota süreç belleğinde), sonuç TAM, tek çağrı", met4);
    }

    section("18–21. Eşzamanlılık — çoklu örnek (worker_threads, ortak DB)");
    {
      const levels: Array<[number, number, string]> = [[2, 2, M[30]], [10, 5, M[31]], [25, 5, M[32]], [50, 5, M[33]]];
      for (const [n, w, iso] of levels) {
        const r = await runWorkers(env, iso, n, w, { providerDelayMs: 400 });
        const okAll = r.results.every((x) => x === "roxy-resolved");
        perf[`c${n}`] = { workers: w, providerCalls: r.providerCalls, p50: Math.round(pct(r.lat, 50)), p95: Math.round(pct(r.lat, 95)), max: Math.round(Math.max(...r.lat)), wall: Math.round(r.wall), metrics: r.metrics };
        ok(r.providerCalls === 1 && okAll && (await rows(iso)).length === 1, `${n === 2 ? 18 : n === 10 ? 19 : n === 25 ? 20 : 21}) ${n} eşzamanlı istek / ${w} örnek → TEK sağlayıcı çağrısı, ${n}/${n} sonuç TAM, hata 0`, perf[`c${n}`]);
      }
      // Yavaş sağlayıcı (gerçek zaman aşımına yakın: 12 sn) — bekleyenler bütçe içinde sonucu alır
      const slow = await runWorkers(env, M[34], 10, 5, { providerDelayMs: 12_000 });
      perf.slow12s = { providerCalls: slow.providerCalls, p95: Math.round(pct(slow.lat, 95)), metrics: slow.metrics };
      ok(slow.providerCalls === 1 && slow.results.every((x) => x === "roxy-resolved"), "21b yavaş sağlayıcı (12 sn) + 10 istek / 5 örnek → tek çağrı; bekleyenler 18 sn bütçe içinde HIT", perf.slow12s);
    }

    section("22–23. Lider hatası ve kilit süresi");
    {
      const lead = await runWorkers(env, M[35], 10, 5, { providerDelayMs: 300, providerMode: "500", waitBudgetMs: 3000 });
      const inProg = lead.results.filter((x) => x === "unresolved:in_progress").length;
      perf.leaderFail = { providerCalls: lead.providerCalls, results: [...new Set(lead.results)], inProg };
      ok(lead.providerCalls === 1 && (await rows(M[35])).length === 0 && lead.results.every((x) => x === "unresolved:provider_server_error" || x === "unresolved:in_progress"), "22 lider sağlayıcı hatası → TEK çağrı (çift ücretli çağrı yok), hata önbelleğe girmez; bekleyenler bütçe sonunda kontrollü in_progress", perf.leaderFail);
      // Kilit penceresi (20 sn) dolunca yeni istek lider olur ve başarır
      await sleep(20_500);
      fresh();
      const prov: Prov = { calls: 0, mode: "ok", delayMs: 0 };
      const r = await resolveGeneralTransit(new Date(M[35]), mkDeps(db, prov, {}, { userId: "harness-user-late" }));
      ok(r.resolution === "roxy-resolved" && prov.calls === 1, "22b kilit penceresi dolduktan sonra yeni istek → tek çağrı, sonuç TAM (kalıcı kilitlenme yok)");
      // 23) Kilit süresi sağlayıcıdan ÖNCE dolarsa (benzetim: kilit kaydı lider çalışırken silinir) → ikinci lider: ÇİFT çağrı mümkün
      const iso = M[36];
      const p = runWorkers(env, iso, 1, 1, { providerDelayMs: 2500 });
      await sleep(700);
      await su.query(`delete from public.auth_rate_limit_events where bucket like 'hd-transit-planets-inflight:%'`);
      const second = await runWorkers(env, iso, 1, 1, { providerDelayMs: 100 });
      const first = await p;
      perf.lockExpiry = { calls: first.providerCalls + second.providerCalls };
      ok(first.providerCalls + second.providerCalls === 2 && (await rows(iso)).length === 1, "23 kilit süresi lider bitmeden dolarsa → 2 çağrı (garanti DIŞI durum, raporlandı); tek kayıt (ON CONFLICT 23505 → exists)", perf.lockExpiry);
    }

    section("24–25. Kota doluyken HIT / MISS");
    {
      const user = "harness-user-quota";
      for (let i = 0; i < 60; i++) await dbRateLimit(rateLimitBucket("hd-transit-planets-user", user), 60, 3600);
      fresh();
      const prov: Prov = { calls: 0, mode: "ok", delayMs: 0 };
      const met: Record<string, number> = {};
      const hit = await resolveGeneralTransit(new Date(M[0]), mkDeps(db, prov, met, { userId: user }));
      ok(hit.resolution === "roxy-resolved" && prov.calls === 0 && met.l2_hit === 1, "24 kota DOLU + L2 HIT → sonuç TAM, 0 çağrı, kota engel olmaz", met);
      fresh();
      const met2: Record<string, number> = {};
      const miss = await resolveGeneralTransit(new Date(M[38]), mkDeps(db, prov, met2, { userId: user }));
      ok(miss.resolution === "unresolved" && miss.reason === "rate_limited_user" && (miss.retryAfterSec ?? 0) > 0 && prov.calls === 0 && met2.quota_denied === 1 && (await rows(M[38])).length === 0, "25 kota DOLU + MISS → unresolved:rate_limited_user (+ retryAfter), 0 çağrı → servis TRANSIT_REFERENCE_QUOTA", { r: miss.resolution, reason: miss.reason, ra: miss.retryAfterSec });
    }

    section("Bayrak");
    ok(hdTransitPlanetStoreEnabled({}) && hdTransitPlanetStoreEnabled({ HD_TRANSIT_PLANET_STORE: "on" }) && !hdTransitPlanetStoreEnabled({ HD_TRANSIT_PLANET_STORE: "off" }) && !hdTransitPlanetStoreEnabled({ HD_TRANSIT_PLANET_STORE: " OFF " }), "F HD_TRANSIT_PLANET_STORE=off → L2 devre dışı (eski yol); varsayılan açık");
    ok(TRANSIT_PLANETS_WAIT_BUDGET_MS === ROXY_POLICY.timeoutMs + 3000 && TRANSIT_PLANETS_WAIT_BUDGET_MS < 20_000, "F2 bekleme bütçesi = sağlayıcı zaman aşımı + 3 sn (18 sn) < kilit penceresi 20 sn");
  } finally {
    console.log(`\nPERF ${JSON.stringify(perf)}`);
    await env.stop();
  }
  console.log(`\nHD TRANSİT KALICI GEZEGEN ÖNBELLEĞİ: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.error(fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
