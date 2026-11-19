/**
 * TR-01A — Genel transit sağlayıcı tekrar ve önbellek güvenliği (GERÇEK Roxy / DB YOK; sahte sağlayıcı + sahte kilit/kota/L2/
 * paylaşılan önbellek, SANAL saat). resolveGeneralTransit'in ürün kodu çalışır; ayrı modül örnekleri = ayrı sunucu örnekleri.
 *
 *   npx tsx scripts/hd-transit/retry-backoff-harness.ts
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import { TRANSIT_FAILURE_BACKOFF_MS, TRANSIT_FAILURE_BACKOFF_RATE_LIMITED_MS, TRANSIT_PLANETS_LIMITS, TransitVerificationError } from "../../lib/human-design/transit/resolveTransit";

type Lon = Record<string, number>;
type Mod = typeof import("../../lib/human-design/transit/resolveTransit");
const MOD = pathToFileURL(path.join(__dirname, "..", "..", "lib", "human-design", "transit", "resolveTransit.ts")).href;
let seq = 0;
const instance = async (): Promise<Mod> => import(`${MOD}?ornek=${++seq}`);

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail !== undefined ? ` → ${JSON.stringify(detail)}` : ""}`); }
}

const base = Date.UTC(2026, 10, 19, 0, 0);
const unc: number[] = [];
for (let m = 0; m < 4000 && unc.length < 12; m++) if (computeGeneralTransit(new Date(base + m * 60000)).hasUncertainty) unc.push(base + m * 60000);

type Mode = "ok" | "500" | "429" | "timeout" | "schema" | "offband";
function world(o: { store?: "ok" | "missing" | "writeFail"; userQuota?: number } = {}) {
  const clock = { t: Date.UTC(2026, 10, 19, 3, 0) };
  const counters = new Map<string, { start: number; n: number }>();
  const store = new Map<string, Lon>(), shared = new Map<string, Lon>();
  const st = { calls: 0, mode: "ok" as Mode, userQuota: o.userQuota, trace: [] as string[] };
  const rateLimit = async (scope: string, value: string, limit: number, win: number) => {
    st.trace.push(scope);
    const lim = scope === "hd-transit-planets-user" && st.userQuota !== undefined ? st.userQuota : limit;
    const k = `${scope}|${value}`; let c = counters.get(k);
    if (!c || clock.t - c.start >= win * 1000) { c = { start: clock.t, n: 0 }; counters.set(k, c); }
    c.n++; return { allowed: c.n <= lim, retryAfterSec: c.n <= lim ? 0 : 5 };
  };
  const planetStore = o.store === "missing" ? { read: async () => ({ status: "unavailable" as const, reason: "table_missing" }), write: async () => "failed" as const } : {
    read: async (u: string, n: string, accept: (l: Lon) => boolean) => { const k = `${u}|${n}`; const v = store.get(k); return v && accept(v) ? { status: "hit" as const, cacheKey: k, lon: v, repaired: false } : { status: "miss" as const, cacheKey: k, repaired: false }; },
    write: async (key: string, _u: string, _n: string, lon: Lon) => { if (o.store === "writeFail") return "failed" as const; if (store.has(key)) return "exists" as const; store.set(key, lon); return "stored" as const; },
  };
  // Next Data Cache gibi: fn hata fırlatırsa SAKLANMAZ
  const sharedCache = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => { if (shared.has(key)) return shared.get(key) as T; const v = await fn(); shared.set(key, v as Lon); return v; };
  const callPlanets = async (_c: unknown, body: { date: string; time: string }) => {
    st.calls++;
    st.trace.push("PROVIDER");
    const t = computeGeneralTransit(new Date(`${body.date}T${body.time}Z`));
    const RN: Record<string, string> = { NorthNode: "North Node", SouthNode: "South Node" };
    const planets = t.activations.filter((a) => a.body !== "Earth").map((a) => ({ name: RN[a.body] ?? a.body, longitude: a.longitude }));
    switch (st.mode) {
      case "500": return { ok: false as const, kind: "server_error" as const, status: 500 };
      case "429": return { ok: false as const, kind: "rate_limited" as const, status: 429 };
      case "timeout": return { ok: false as const, kind: "timeout" as const, status: null };
      case "schema": return { ok: true as const, raw: { planets: [{ name: "Sun" }] } };
      case "offband": return { ok: true as const, raw: { planets: planets.map((p) => ({ ...p, longitude: (p.longitude + 0.5) % 360 })) } };
      default: return { ok: true as const, raw: { planets } };
    }
  };
  const deps = (user = "u1", tenant = "t1", useStore = true) => ({
    config: { apiKey: "x", baseUrl: "https://fake.invalid" } as never, callPlanets: callPlanets as never, rateLimit, userId: user, tenantId: tenant,
    sharedCache, planetStore: useStore ? (planetStore as never) : undefined, waitBudgetMs: 400, sleep: async () => { await new Promise((r) => setTimeout(r, 5)); }, now: () => clock.t,
  });
  return { clock, st, store, shared, deps };
}
const res = async (m: Mod, at: number, d: object) => m.resolveGeneralTransit(new Date(at), d as never).catch((e: unknown) => e);

async function main() {
  console.log(`[1] Sağlayıcı hatası sonrası geri çekilme (aynı örnek): kilit ATLANMAZ, ücretli tekrar YOK`);
  for (const [mode, reason, ms] of [["500", "provider_server_error", TRANSIT_FAILURE_BACKOFF_MS], ["timeout", "provider_timeout", TRANSIT_FAILURE_BACKOFF_MS], ["schema", "provider_schema", TRANSIT_FAILURE_BACKOFF_MS], ["429", "provider_rate_limited", TRANSIT_FAILURE_BACKOFF_RATE_LIMITED_MS]] as const) {
    const w = world(); const m = await instance(); w.st.mode = mode;
    const first = (await res(m, unc[0], w.deps())) as { resolution: string; reason?: string };
    const again: { resolution: string; reason?: string; retryAfterSec?: number }[] = [];
    for (let i = 0; i < 9; i++) { w.clock.t += 1000; again.push((await res(m, unc[0], w.deps())) as never); }
    ok(first.resolution === "unresolved" && first.reason === reason && w.st.calls === 1, `${mode}: ilk istek → unresolved (${reason}), 1 çağrı`, { first, calls: w.st.calls });
    ok(again.every((r) => r.resolution === "unresolved" && r.reason === reason && (r.retryAfterSec ?? 0) > 0) && w.st.calls === 1, `${mode}: 9 yeniden deneme (1 sn arayla) → sağlayıcı ÇAĞRILMADI, sonuç kesin değil, retryAfter verildi`, { calls: w.st.calls, last: again.at(-1) });
    ok(w.store.size === 0 && w.shared.size === 0, `${mode}: hatalı yanıt hiçbir katmana yazılmadı`);
    w.st.mode = "ok"; w.clock.t += ms - 9000 - 1000; // pencere bitmeden 1 sn önce
    const still = (await res(m, unc[0], w.deps())) as { resolution: string };
    ok(still.resolution === "unresolved" && w.st.calls === 1, `${mode}: pencere bitmeden (${ms / 1000 - 1} sn) hâlâ geri çekilme`);
    w.clock.t += 2000;
    const rec = (await res(m, unc[0], w.deps())) as { resolution: string };
    ok(rec.resolution === "roxy-resolved" && w.st.calls === 2 && w.store.size === 1, `${mode}: pencere sonrası sağlayıcı düzelmiş → TAM sonuç (2. çağrı), L2'ye yazıldı`, { rec: rec.resolution, reason: (rec as { reason?: string }).reason, calls: w.st.calls });
    const after = (await res(m, unc[0], w.deps())) as { resolution: string };
    ok(after.resolution === "roxy-resolved" && w.st.calls === 2, `${mode}: başarı geri çekilmeyi temizledi, sonraki istek önbellekten`);
  }

  console.log(`[2] Doğrulama hatası (Roxy ↔ bağımsız motor uyumsuz): tekrarında da ücretli çağrı YOK, hata aynı (502 anlamı)`);
  {
    const w = world(); const m = await instance(); w.st.mode = "offband";
    const a = await res(m, unc[1], w.deps());
    w.clock.t += 2000;
    const b = await res(m, unc[1], w.deps());
    const isVer = (e: unknown) => e instanceof Error && e.constructor.name === TransitVerificationError.name;
    ok(isVer(a) && isVer(b) && w.st.calls === 1 && w.store.size === 0 && w.shared.size === 0, "offband: ilk → doğrulama hatası (1 çağrı); hemen tekrar → aynı hata, çağrı YOK; hiçbir katmana yazılmadı", { calls: w.st.calls });
  }

  console.log(`[3] Örnekler arası: hata sonrası başka örnek kilidi ATLAMAZ (eski kod aynı örnekte atlıyordu)`);
  {
    const w = world(); const A = await instance(), B = await instance(); w.st.mode = "500";
    await res(A, unc[2], w.deps("u1"));
    w.clock.t += 5000; w.st.mode = "ok";
    const b = (await res(B, unc[2], w.deps("u2"))) as { resolution: string; reason?: string };
    ok(b.resolution === "unresolved" && b.reason === "in_progress" && w.st.calls === 1, "B (kilit penceresi içinde) → çağrı YOK, kontrollü in_progress", { b, calls: w.st.calls });
    w.clock.t += TRANSIT_PLANETS_LIMITS.inFlight.windowSeconds * 1000;
    const b2 = (await res(B, unc[2], w.deps("u2"))) as { resolution: string };
    ok(b2.resolution === "roxy-resolved" && w.st.calls === 2, "kilit penceresi sonrası B → tek yeni çağrı, TAM", { calls: w.st.calls });
    const a2 = (await res(A, unc[2], w.deps("u1"))) as { resolution: string };
    ok(a2.resolution === "roxy-resolved" && w.st.calls === 2, "A geri çekilmedeyken bile L2'deki doğrulanmış sonucu kullanır (çağrı YOK)", { a2: a2.resolution, calls: w.st.calls });
  }

  console.log(`[4] Kota / in_progress / yapılandırma geri çekilme BAŞLATMAZ`);
  {
    const w = world({ userQuota: 0 }); const m = await instance();
    const q = (await res(m, unc[3], w.deps())) as { resolution: string; reason?: string };
    ok(q.resolution === "unresolved" && q.reason === "rate_limited_user" && w.st.calls === 0, "kullanıcı kotası dolu → rate_limited_user, çağrı YOK");
    w.st.userQuota = undefined; w.clock.t += 61 * 60 * 1000;
    const q2 = (await res(m, unc[3], w.deps())) as { resolution: string };
    ok(q2.resolution === "roxy-resolved" && w.st.calls === 1, "kota açılınca hemen hesaplanır (kota reddi geri çekilme sayılmadı)", { q2: q2.resolution });
    const n = (await res(await instance(), unc[3] + 60000 * 0, { ...w.deps(), config: null })) as { resolution: string; reason?: string };
    ok(n.resolution === "roxy-resolved" || n.reason === "not_configured", "yapılandırma yok → not_configured (L2'de varsa L2 sonucu)", n);
  }

  console.log(`[5] L2 yazma hatası → doğrulanmış sonuç paylaşılan önbelleğe; diğer örnekler ÜCRETLİ çağrı yapmaz`);
  {
    const w = world({ store: "writeFail" }); const ms = await Promise.all([1, 2, 3, 4, 5].map(() => instance()));
    const rs = [];
    for (let i = 0; i < 10; i++) { rs.push((await res(ms[i % 5], unc[4], w.deps(`u${i}`))) as { resolution: string }); w.clock.t += 500; }
    ok(rs.every((r) => r.resolution === "roxy-resolved") && w.st.calls === 1 && w.shared.size === 1 && w.store.size === 0, "10 sıralı ziyaret / 5 örnek → 1 çağrı, hepsi TAM (eski kod: örnek başına çağrı + bekleyenlere eksik)", { calls: w.st.calls, res: rs.map((r) => r.resolution) });
    const c = await Promise.all([6, 7, 8, 9].map(async () => (await res(await instance(), unc[5], w.deps())) as { resolution: string }));
    ok(c.every((r) => r.resolution === "roxy-resolved") && w.st.calls === 2, "L2 yazılamazken 4 örnek eşzamanlı → 1 çağrı, bekleyenler paylaşılan önbellekten TAM", { calls: w.st.calls, res: c.map((r) => r.resolution) });
  }

  console.log(`[6] L2 tablo yok (eski Next Data Cache yolu) → eşzamanlı bekleyenler eksik sonuç yerine liderin sonucunu alır`);
  {
    const w = world({ store: "missing" });
    const rs = await Promise.all(Array.from({ length: 20 }, async (_, i) => (await res(await instance(), unc[6], w.deps(`u${i}`, `t${i % 3}`))) as { resolution: string }));
    ok(w.st.calls === 1 && rs.every((r) => r.resolution === "roxy-resolved"), "20 eşzamanlı / 20 örnek → 1 çağrı, 20/20 TAM (eski kod: 1,5 sn sonra in_progress)", { calls: w.st.calls, res: [...new Set(rs.map((r) => r.resolution))] });
    const w2 = world(); const noStore = await Promise.all(Array.from({ length: 10 }, async (_, i) => (await res(await instance(), unc[7], w2.deps(`u${i}`, "t1", false))) as { resolution: string }));
    ok(w2.st.calls === 1 && noStore.every((r) => r.resolution === "roxy-resolved"), "L2 bayrak kapalı, 10 eşzamanlı / 10 örnek → 1 çağrı, 10/10 TAM", { calls: w2.st.calls });
  }

  console.log(`[7] Başarı yolu değişmedi`);
  {
    const w = world(); const ms = await Promise.all(Array.from({ length: 20 }, () => instance()));
    const rs = await Promise.all(Array.from({ length: 100 }, async (_, i) => (await res(ms[i % 20], unc[8], w.deps(`u${i}`, `t${i % 3}`))) as { resolution: string }));
    ok(w.st.calls === 1 && rs.every((r) => r.resolution === "roxy-resolved"), "100 eşzamanlı / 20 örnek, L2 açık → 1 çağrı, 100/100 TAM", { calls: w.st.calls });
    const local = computeGeneralTransit(new Date(unc[8]));
    const tr = (rs[0] as unknown as { transit: { activations: { body: string; gate: number; line: number }[] } }).transit;
    ok(local.activations.filter((a) => a.certain).every((a) => { const r = tr.activations.find((x) => x.body === a.body)!; return r.gate === a.gate && r.line === a.line; }), "yerelin kesin bulduğu aktivasyonlar aynen korunur");
  }

  console.log(`[8] Kota ve kilit HİÇBİR ücretli çağrıda atlanmaz; başarısız yanıt hiçbir katmana yazılmaz (TR-01A son kabul)`);
  {
    // Her sağlayıcı çağrısından önce (bir önceki çağrıdan bu yana) kilit + kullanıcı kotası + tenant kotası SIRAYLA sorulmuş olmalı.
    const guarded = (trace: string[]) => {
      let since: string[] = [];
      for (const e of trace) {
        if (e !== "PROVIDER") { since.push(e); continue; }
        const i = since.lastIndexOf("hd-transit-planets-inflight"), u = since.lastIndexOf("hd-transit-planets-user"), t = since.lastIndexOf("hd-transit-planets-tenant");
        if (!(i >= 0 && u > i && t > u)) return false;
        since = [];
      }
      return true;
    };
    for (const mode of ["500", "429", "timeout", "schema", "offband"] as const) {
      for (const store of ["ok", "missing", "writeFail"] as const) {
        const w = world({ store }); const ms = await Promise.all([1, 2, 3].map(() => instance()));
        w.st.mode = mode;
        for (let i = 0; i < 12; i++) { await res(ms[i % 3], unc[9], w.deps(`u${i % 2}`, `t${i % 2}`)); w.clock.t += 7_000; } // 84 sn: geri çekilme + kilit pencereleri geçer
        const failCalls = w.st.calls;
        w.st.mode = "ok"; w.clock.t += 61_000;
        for (let i = 0; i < 6; i++) { await res(ms[i % 3], unc[9], w.deps(`u${i}`, "t1")); w.clock.t += 1_000; }
        const ok1 = guarded(w.st.trace);
        const okNoWrite = w.store.size <= 1 && w.shared.size <= 1 && [...w.store.values(), ...w.shared.values()].every((lon) => Object.keys(lon).length === 13);
        ok(ok1 && failCalls >= 1 && failCalls <= 6 && okNoWrite && w.st.calls === failCalls + 1,
          `${mode} / L2 ${store}: her ücretli çağrıdan önce kilit+kullanıcı+tenant kotası; 12 hatalı deneme / 84 sn → ${failCalls} çağrı; hata yanıtı hiçbir katmana yazılmadı; düzelince tek çağrı`,
          { failCalls, calls: w.st.calls, store: w.store.size, shared: w.shared.size, guarded: ok1 });
      }
    }
    // Kota dolu → sağlayıcı ASLA çağrılmaz (her örnekte, geri çekilmeden bağımsız)
    const wq = world({ userQuota: 0 });
    const qr: { resolution: string; reason?: string }[] = [];
    for (let i = 0; i < 6; i++) { qr.push((await res(await instance(), unc[10], wq.deps("u1"))) as never); wq.clock.t += 25_000; }
    ok(wq.st.calls === 0 && qr.every((r) => r.resolution === "unresolved" && r.reason === "rate_limited_user") && wq.st.trace.filter((e) => e === "hd-transit-planets-user").length === 6,
      "kullanıcı kotası dolu: 6 istek (6 örnek, kilit pencereleri ayrık) → 6 kota sorgusu, 6 × rate_limited_user, 0 sağlayıcı çağrısı", { calls: wq.st.calls, qr });
  }

  console.log(`\nHD TRANSİT TEKRAR + ÖNBELLEK GÜVENLİĞİ (TR-01A): ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}
main().catch((e) => { console.error(e); console.log(`HD TRANSİT TEKRAR + ÖNBELLEK GÜVENLİĞİ (TR-01A): ${pass} PASS / ${fail + 1} FAIL`); process.exit(1); });
