/**
 * HD TRANSİT — GÜVENİLİRLİK testleri (ağ / DB / ücretli çağrı YOK; çevrimdışı kayıtlı GERÇEK yanıtlar).
 *   • P1-03 önbellek hata enjeksiyonu: paylaşılan önbellek (Next Data Cache) altyapısı fn tamamlandıktan SONRA / ÖNCE /
 *     fn sürerken hata verirse ücretli sağlayıcı fonksiyonu EN ÇOK BİR KEZ çalışır; başarısız sonuç başarı sayılmaz;
 *     anahtar + TTL + etiket korunur.
 *   • Çözücü düzeyi: altyapı hatasında tek ücretli gezegen çağrısı; aynı süreçte eşzamanlı aynı an tek çağrı; iki sunucu
 *     örneği BENZETİMİ (süreç belleği ayrı, DB kilidi ortak) — gerçek çoklu örnek DEĞİLDİR.
 *   • İki aşırı hassas an (S08-1b Ay, P463 Venüs): kayıtlı Roxy gezegen konumlarıyla bile kesinleştirilmez; adaylar Swiss
 *     Ephemeris gerçeğini içerir; kesin gösterilen 12 aktivasyon = Swiss Ephemeris.
 * Çalıştır: npx tsx scripts/hd-transit/reliability-harness.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { transitDataCache, TRANSIT_DATA_CACHE_SECONDS } from "../../lib/human-design/transit/transitDataCache";
import { resolveGeneralTransit, __resetTransitResolverCache, type ResolveDeps } from "../../lib/human-design/transit/resolveTransit";
import { computeGeneralTransit } from "../../lib/human-design/transit/generalTransit";
import type { RoxyCallResult } from "../../lib/human-design/providers/roxy/client";
import { fakePlanetsResponse } from "./fakeRoxyTransit";

let pass = 0;
let fail = 0;
const fails: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.error(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 600)}` : ""}`); }
}
const section = (s: string) => console.log(`\n[${s}]`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// unstable_cache benzeri sahte uygulamalar (yalnız imza: (cb, keyParts, opts) => () => Promise)
type Cb = () => Promise<unknown>;
type Seen = { keyParts?: string[]; opts?: { revalidate?: number | false; tags?: string[] } };
const impl = (behave: (cb: Cb) => Promise<unknown>, seen: Seen = {}) =>
  ((cb: Cb, keyParts?: string[], opts?: Seen["opts"]) => {
    seen.keyParts = keyParts;
    seen.opts = opts;
    return () => behave(cb);
  }) as unknown as Parameters<typeof transitDataCache>[2];

async function main() {
  section("P1-03 transitDataCache — önbellek altyapısı hata enjeksiyonu");
  {
    // a) fn TAMAMLANDI, sonra önbelleğe yazma hatası
    let calls = 0;
    const seen: Seen = {};
    const v = await transitDataCache("k-a", async () => { calls++; return { lon: 1 }; }, impl(async (cb) => { await cb(); throw new Error("cache set failed"); }, seen));
    ok(calls === 1 && JSON.stringify(v) === JSON.stringify({ lon: 1 }), "a) hesap tamamlandıktan sonra önbellek hatası → sağlayıcı fonksiyonu 1 kez; aynı (doğrulanmış) sonuç döner, İKİNCİ ÇAĞRI YOK", { calls, v });
    ok(JSON.stringify(seen.keyParts) === JSON.stringify(["hd-transit-planets", "k-a"]) && seen.opts?.revalidate === TRANSIT_DATA_CACHE_SECONDS && TRANSIT_DATA_CACHE_SECONDS === 30 * 24 * 3600 && JSON.stringify(seen.opts?.tags) === JSON.stringify(["hd-transit-planets"]), "a2) önbellek anahtarı, TTL (30 gün) ve etiket DEĞİŞMEDİ", seen);
  }
  {
    // b) önbellek altyapısı fn ÇALIŞMADAN hata (Data Cache yok / okuma hatası) → önbelleksiz TEK çağrı
    let calls = 0;
    const v = await transitDataCache("k-b", async () => { calls++; return 7; }, impl(async () => { throw new Error("Invariant: incrementalCache missing"); }));
    ok(calls === 1 && v === 7, "b) fn hiç başlamadan altyapı hatası → önbelleksiz tek çağrı (1)", { calls, v });
  }
  {
    // c) sağlayıcı hatası → aynen iletilir, tekrar denenmez, önbelleğe girmez
    let calls = 0;
    let err: unknown = null;
    try { await transitDataCache("k-c", async () => { calls++; throw new Error("provider_server_error"); }, impl(async (cb) => cb())); } catch (e) { err = e; }
    ok(calls === 1 && err instanceof Error && err.message === "provider_server_error", "c) sağlayıcı hatası aynen iletilir; ikinci çağrı YOK", { calls, err: String(err) });
  }
  {
    // d) fn BAŞLADI, sonucu beklenmeden altyapı hatası → tekrar çağrı YOK, başarı sayılmaz
    let calls = 0;
    let err: unknown = null;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    try {
      await transitDataCache("k-d", async () => { calls++; await gate; return 1; }, impl(async (cb) => { void cb(); throw new Error("cache infra crashed mid-flight"); }));
    } catch (e) { err = e; }
    release();
    await sleep(10);
    ok(calls === 1 && err instanceof Error && err.message.includes("mid-flight"), "d) fn başladı ama sonucu bilinmiyor → altyapı hatası iletilir (başarı sayılmaz), ikinci çağrı YOK", { calls, err: String(err) });
  }
  {
    // e) normal önbellek: ikinci istek önbellekten (fn çalışmaz)
    let calls = 0;
    const store = new Map<string, unknown>();
    const memo = impl(async (cb) => { if (store.has("x")) return store.get("x"); const v = await cb(); store.set("x", v); return v; });
    const v1 = await transitDataCache("k-e", async () => { calls++; return 3; }, memo);
    const v2 = await transitDataCache("k-e", async () => { calls++; return 4; }, memo);
    ok(calls === 1 && v1 === 3 && v2 === 3, "e) önbellek isabeti → fn tekrar çalışmaz", { calls, v1, v2 });
  }

  section("P1-03 çözücü düzeyi — ücretli gezegen çağrısı sayısı");
  // Yerel motorun belirsiz bulduğu bir dakika (Roxy gezegen konumu gerekir)
  let ms = Date.parse("2026-11-03T00:00:00Z");
  while (!computeGeneralTransit(new Date(ms)).hasUncertainty) ms += 60_000;
  const utc = new Date(ms);
  const iso = utc.toISOString().replace(".000Z", "Z");
  const mkDeps = (counter: { n: number }, extra: Partial<ResolveDeps> = {}, delayMs = 0): ResolveDeps => ({
    config: { apiKey: "k", baseUrl: "https://example.invalid" },
    callPlanets: async (): Promise<RoxyCallResult> => { counter.n++; if (delayMs) await sleep(delayMs); return { ok: true, raw: fakePlanetsResponse(iso) } as RoxyCallResult; },
    rateLimit: async () => ({ allowed: true, retryAfterSec: 0 }),
    userId: "u",
    tenantId: "t",
    sleep: async () => undefined,
    ...extra,
  });
  {
    __resetTransitResolverCache();
    const c = { n: 0 };
    const r = await resolveGeneralTransit(utc, mkDeps(c, { sharedCache: (k, fn) => transitDataCache(k, fn, impl(async (cb) => { await cb(); throw new Error("cache set failed"); })) }));
    ok(c.n === 1 && r.resolution === "roxy-resolved" && !r.transit.hasUncertainty, "f) çözücü: önbellek yazma hatasında tek ücretli gezegen çağrısı, sonuç TAM ve doğrulanmış", { calls: c.n, res: r.resolution });
    const r2 = await resolveGeneralTransit(utc, mkDeps(c));
    ok(c.n === 1 && r2.resolution === "roxy-resolved", "g) aynı an tekrar → süreç önbelleği (ek ücretli çağrı yok)", { calls: c.n });
  }
  {
    __resetTransitResolverCache();
    const c = { n: 0 };
    const deps = mkDeps(c, {}, 200);
    const [a, b] = await Promise.all([resolveGeneralTransit(utc, deps), resolveGeneralTransit(utc, deps)]);
    ok(c.n === 1 && a.resolution === "roxy-resolved" && b.resolution === "roxy-resolved", "h) aynı süreçte eşzamanlı aynı an → tek ücretli çağrı (istek birleştirme)", { calls: c.n });
  }
  {
    // i) İKİ SUNUCU ÖRNEĞİ BENZETİMİ: süreç belleği ayrı (sıfırlanır), DB eşzamanlılık kilidi ortak (20 sn, 1 hak)
    __resetTransitResolverCache();
    const c = { n: 0 };
    const lock = new Map<string, number>();
    const sharedRate: ResolveDeps["rateLimit"] = async (scope, value, limit) => {
      if (scope !== "hd-transit-planets-inflight") return { allowed: true, retryAfterSec: 0 };
      const k = `${scope}|${value}`;
      const used = lock.get(k) ?? 0;
      lock.set(k, used + 1);
      return { allowed: used < limit, retryAfterSec: 20 };
    };
    const pA = resolveGeneralTransit(utc, mkDeps(c, { rateLimit: sharedRate }, 300));
    await sleep(20);
    __resetTransitResolverCache(); // B örneği: kendi (boş) süreç belleği
    const rB = await resolveGeneralTransit(utc, mkDeps(c, { rateLimit: sharedRate }));
    const rA = await pA;
    ok(c.n === 1 && rA.resolution === "roxy-resolved" && rB.resolution === "unresolved" && rB.reason === "in_progress", "i) iki örnek BENZETİMİ: ortak DB kilidi ikinci ücretli çağrıyı engeller; B 'eksik' döner (kesin iddia yok) — gerçek çoklu örnek DEĞİL", { calls: c.n, a: rA.resolution, b: rB.resolution, reason: rB.reason });
  }

  section("İki aşırı hassas an — kayıtlı GERÇEK Roxy gezegen konumları + Swiss Ephemeris");
  const FIX = path.resolve(__dirname, "fixtures");
  const read = (f: string) => JSON.parse(readFileSync(path.join(FIX, f), "utf8")).results as Record<string, Record<string, unknown>>;
  const pv = read("roxy-planets-validation.json");
  const sw = read("roxy-planets-sweep.json");
  const se = { ...read("swiss-ephemeris-reference-v2.json"), ...read("swiss-ephemeris-reference-sweep.json") } as Record<string, Record<string, { gate: number; line: number; lineMarginArcsec: number; lon: number }>>;
  const cases = [
    { id: "S08-1b", body: "Moon", rec: pv["S08-1b"] },
    { id: "P463", body: "Venus", rec: sw["P463"] },
  ];
  for (const k of cases) {
    __resetTransitResolverCache();
    const c = { n: 0 };
    const at = new Date(String(k.rec.utc));
    const r = await resolveGeneralTransit(at, {
      ...mkDeps(c),
      callPlanets: async () => { c.n++; return { ok: true, raw: { planets: k.rec.planets } } as RoxyCallResult; },
    });
    const truth = se[k.id];
    const unc = r.transit.activations.filter((a) => !a.certain);
    const wrong = r.transit.activations.filter((a) => a.certain && (a.gate !== truth[a.body].gate || a.line !== truth[a.body].line));
    const u = unc[0];
    const cands = u ? [`${u.gate}.${u.line}`, `${u.alternative!.gate}.${u.alternative!.line}`] : [];
    const roxyLon = (k.rec.planets as Array<{ name: string; longitude: number }>).find((p) => p.name === k.body)!.longitude;
    const diff = Math.abs(roxyLon - truth[k.body].lon) * 3600;
    ok(r.resolution === "roxy-partial" && r.transit.hasUncertainty && unc.length === 1 && u.body === k.body && wrong.length === 0 && c.n === 1,
      `${k.id} (${String(k.rec.utc)}): roxy-partial; yalnız ${k.body} kesinleştirilmedi; 12 kesin aktivasyon = Swiss Ephemeris (yanlış kesin 0)`, { res: r.resolution, unc: unc.map((a) => a.body), wrong: wrong.map((a) => a.body) });
    ok(cands.includes(`${truth[k.body].gate}.${truth[k.body].line}`) && u.alternative!.gate === u.gate,
      `${k.id}: adaylar ${cands.join(" / ")} Swiss Ephemeris gerçeğini (${truth[k.body].gate}.${truth[k.body].line}) içerir; kapı kesin (${u.gate}), yalnız çizgi belirsiz`);
    ok(r.transit.possibleChannels.length === 0 && r.transit.uncertainCenters.length === 0,
      `${k.id}: yalnız çizgi belirsizliği → olası kanal / belirsiz merkez yok (kanal ve merkezler kapıdan kesin)`);
    console.log(`    bilgi: SE çizgi payı ${truth[k.body].lineMarginArcsec.toFixed(4)}″ · Roxy−SE ${diff.toFixed(4)}″ · Roxy belirsizlik payı ${k.body === "Moon" ? "0,7" : "0,15"}″ → pay < belirsizlik, tahminle tamamlanmadı`);
  }

  console.log(`\nHD TRANSİT GÜVENİLİRLİK: ${pass} PASS / ${fail} FAIL`);
  if (fail) { console.log("FAIL listesi:\n" + fails.map((f) => ` - ${f}`).join("\n")); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
