// KAMPANYA MERKEZİ — Gece operasyonu: Gökyüzü Atlası ziyaretçi teknikleri, KATI golden eşleşme (DB/ağ YOK; KREDİ HARCANMAZ).
// Sahte sağlayıcı yalnız istek yolu + gövde + sorgu, uzman akışının kaydettiği golden istekle BİREBİR aynıysa golden yanıtı
// döndürür; aksi hâlde 404 → test düşer. Böylece ziyaretçi isteğinin uzman motoruyla aynı kurulduğu kanıtlanır.
// Ayrıca: yorum açık/kapalı, eş verisinin kaydedilmemesi, DB'ye dokunulmaması, kutup engeli, her isteğin kota koruyucusundan geçmesi.
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-atlas.test.ts
import fs from "node:fs";
import path from "node:path";
import { ReservationCallGuard } from "@/lib/campaign/quotaService";
import { ATLAS_RUNNERS, ATLAS_VISITOR_TECHNIQUES, INLINE_PARTNER_ID } from "@/lib/campaign/visitor/runners/atlas";
import { CAMPAIGN_CATALOG } from "@/lib/campaign/catalog";
import { VISITOR_RUNNERS } from "@/lib/campaign/visitor/runners";
import type { VisitorResult } from "@/lib/campaign/visitor/types";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const ROOT = path.resolve(__dirname, "../..");
const G = path.join(ROOT, "scripts/astrology/fixtures/golden");
type Fx = { f: string; endpoint: string; query: Record<string, string> | null; body: unknown; response: unknown };
const FX: Fx[] = fs.readdirSync(G).filter((f) => f.endsWith(".json")).map((f) => ({ f, ...JSON.parse(fs.readFileSync(path.join(G, f), "utf8")) }));
// Natal golden yalnız yanıttır; istek gövdesi standart doğum + varsayılan seçeneklerle alan alan denetlenir.
const NATAL = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/astrology/fixtures/roxy-natal-golden-2026-10-07.json"), "utf8"));
const NATAL_BODY = { date: "1990-07-15", time: "14:30:00", latitude: 41.0082, longitude: 28.9784, timezone: 3 };
const ENV = { ROXY_API_KEY: "zz-test-roxy-key-not-a-secret", ASTROLOGY_MODULE_ENABLED: "true" } as Record<string, string>;
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

function fakeDb() {
  const rpcs: string[] = [];
  let touched = 0;
  let id = 0;
  const db = {
    from: () => {
      touched++;
      throw new Error("kampanya atlas: tablo erişimi beklenmiyor");
    },
    rpc: async (fn: string) => {
      rpcs.push(fn);
      if (fn === "campaign_authorize_call") return { data: { ok: true, call_id: ++id }, error: null };
      return { data: { ok: true, applied: false }, error: null };
    },
  };
  return { db, rpcs, touched: () => touched };
}
function strictFetch() {
  const calls: { path: string; hit: string | null; body: unknown; query: Record<string, string> }[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    const qAll = Object.fromEntries(u.searchParams.entries());
    const q = Object.fromEntries(Object.entries(qAll).filter(([k]) => k !== "lang"));
    const p = u.pathname;
    let hit: unknown = null;
    let name: string | null = null;
    if (p.endsWith("/astrology/natal-chart") && body && Object.entries(NATAL_BODY).every(([k, v]) => (body as Record<string, unknown>)[k] === v)) {
      hit = NATAL;
      name = "roxy-natal-golden";
    }
    for (const x of FX) {
      if (hit) break;
      if (!p.endsWith(x.endpoint) || canon(x.body) !== canon(body) || canon(x.query ?? {}) !== canon(x.query && "lang" in x.query ? qAll : q)) continue;
      hit = x.response;
      name = x.f;
    }
    calls.push({ path: p, hit: name, body, query: q });
    return new Response(JSON.stringify(hit ?? { error: "golden yok" }), { status: hit ? 200 : 404, headers: { "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": "49000", "x-ratelimit-reset": "2500000" } });
  };
  return { fn, calls };
}

const ME = { birthDate: "1990-07-15", birthTime: "14:30", birthPlace: "tr-34-istanbul" };
const P2 = { birthDate2: "1988-03-21", birthTime2: "06:45", birthPlace2: "tr-06-ankara" };
const D1007 = new Date("2026-10-07T09:00:00Z");
const D1101 = new Date("2026-11-01T11:00:00Z");
/** Teknik → (girdi, an, beklenen golden dosya(lar)ı). */
const CASES: Record<string, { input?: Record<string, unknown>; now?: Date; expect: string[] }> = {
  "western.natal": { expect: ["roxy-natal-golden"] },
  "western.transit": { now: D1007, expect: ["transit.json"] },
  "western.forecast": { input: { startDate: "2026-10-01", days: "90" }, expect: ["forecast.json"] },
  "western.progression": { input: { targetDate: "2026-10-07" }, expect: ["progression.json"] },
  "western.solar_arc": { input: { targetDate: "2026-10-07" }, expect: ["solar-arc.json"] },
  "western.solar_return": { expect: ["solar-return.json"] },
  "western.lunar_return": { input: { month: "2026-10" }, expect: ["lunar-return.json"] },
  "western.planetary_return": { input: { planet: "saturn", approxDate: "2049-02-08" }, expect: ["pr-saturn-next.json"] },
  "western.profections": { expect: ["profections-ali-36.json"] },
  "western.synastry": { input: P2, expect: ["synastry.json"] },
  "western.composite": { input: P2, expect: ["composite.json"] },
  "western.astrocartography": { expect: ["astrocartography.json"] },
  "western.relocation": { input: { targetPlace: "us-ny-new-york" }, expect: ["relocation.json", "roxy-natal-golden"] },
  "western.local_space": { expect: ["local-space.json"] },
  "western.fixed_stars": { expect: ["fixed-stars.json|fixed-stars-repeat.json"] },
  "western.extra_points": { expect: ["extra-asteroids.json", "extra-lots.json", "extra-lilith.json"] },
  "vedic.d1": { expect: ["vedic-d1.json"] },
  "vedic.varga": { expect: ["vedic-d9.json"] },
  "vedic.dasha": { expect: ["vedic-dasha-major.json"] },
  "vedic.drishti": { expect: ["vedic-aspects.json"] },
  "vedic.ashtakavarga": { expect: ["vedic-ashtakavarga.json"] },
  "vedic.shadbala": { expect: ["vedic-shadbala.json"] },
  "vedic.panchanga": { expect: ["vedic-panchang.json"] },
  "vedic.transit": { input: { atDate: "2026-10-07" }, expect: ["vedic-transit.json"] },
  "vedic.bhav_chalit": { expect: ["vedic-bhav-chalit.json"] },
  "vedic.chara_karaka": { expect: ["vedic-chara-karakas-eight.json"] },
  "vedic.arudha": { expect: ["vedic-arudha.json"] },
  "vedic.bhava_bala": { expect: ["vedic-bhava-bala.json"] },
  "vedic.upagraha": { expect: ["vedic-upagraha.json"] },
  "vedic.sade_sati": { expect: ["vedic-sadhesati.json"] },
  "vedic.gun_milan": { input: P2, expect: ["vedic-gun-milan.json", "vedic-manglik-a.json", "vedic-manglik-b.json"] },
  "vedic.dashakoot": { input: P2, expect: ["vedic-dashakoot.json"] },
  "vedic.papasamyam": { input: P2, expect: ["vedic-papasamyam.json"] },
  "kp.chart": { expect: ["kp-chart.json"] },
  "kp.dasha": { expect: ["kp-dasha-major.json"] },
  "kp.ruling": { input: { atDate: "2026-10-07" }, expect: ["kp-ruling-planets.json"] },
};
type Out = { ok: true; result: VisitorResult } | { ok: false; code: string; message: string };
type Runner = { parse: (i: Record<string, unknown>, n: Date) => { ok: true; value: never } | { ok: false; errors: Record<string, string> }; run: (c: unknown, v: never) => Promise<Out> };
const R = (id: string) => ATLAS_RUNNERS.find((r) => r.key === `atlas:${id}`) as unknown as Runner;
const yorum = (res: VisitorResult) => res.blocks.filter((b) => (b as { kind?: string }).kind === "yorum");
const ctx = (db: unknown, fetchImpl: unknown, now: Date, commentsEnabled = false, env = ENV) => ({
  db,
  guard: new ReservationCallGuard(db as never, "11111111-1111-4111-8111-111111111111", 5),
  commentsEnabled,
  hdOptions: { word: false, kb: true },
  env,
  now,
  fetchImpl,
});

(async () => {
  check("T00 her Atlas ziyaretçi tekniğinin katı golden senaryosu var", ATLAS_VISITOR_TECHNIQUES.every((t) => CASES[t]), ATLAS_VISITOR_TECHNIQUES.filter((t) => !CASES[t]).join(","));
  for (const id of ATLAS_VISITOR_TECHNIQUES) {
    const c = CASES[id];
    if (!c) continue;
    const now = c.now ?? D1101;
    const pv = R(id).parse({ ...ME, ...(c.input ?? {}) }, now);
    if (!pv.ok) {
      check(`G ${id} girdi`, false, JSON.stringify(pv.errors));
      continue;
    }
    const f = strictFetch();
    const d = fakeDb();
    const out = await R(id).run(ctx(d.db, f.fn, now), pv.value);
    const hits = f.calls.map((x) => x.hit);
    const detail = (out.ok ? "" : `${out.message} `) + JSON.stringify(f.calls.map((x) => ({ p: x.path, hit: x.hit, q: x.query, b: x.hit ? undefined : x.body })));
    check(`G ${id} istek(ler) golden ile BİREBİR + gerçek projeksiyon`, out.ok && hits.length === c.expect.length && c.expect.every((e) => e.split("|").some((alt) => hits.includes(alt))) && out.result.blocks.length > 0, detail);
    check(`G ${id} her istek kota yetkisinden geçti, tablo erişimi yok`, d.rpcs.filter((x) => x === "campaign_authorize_call").length === f.calls.length && d.touched() === 0);
    if (out.ok) {
      check(`G ${id} yorum KAPALI → yorum bloğu yok`, yorum(out.result).length === 0 && !out.result.commentsShown);
      const f2 = strictFetch();
      const on = await R(id).run(ctx(fakeDb().db, f2.fn, now, true), pv.value);
      check(`G ${id} yorum AÇIK → yorum bayrağı ile bloklar tutarlı`, on.ok && on.result.commentsShown === yorum(on.result).length > 0);
    }
  }
  // ── İki kişilik: eş verisi kaydedilmez, belirteç kayıt değil ──
  const sv = R("western.synastry").parse({ ...ME, ...P2 }, D1101);
  const sd = fakeDb();
  const so = sv.ok ? await R("western.synastry").run(ctx(sd.db, strictFetch().fn, D1101), sv.value) : null;
  check("P01 eş bilgisi yalnız bellek: DB tablo erişimi 0, not metni", !!so?.ok && sd.touched() === 0 && so.result.notes.some((n) => n.includes("kaydedilmedi")));
  check("P02 satır içi eş belirteci sonuca sızmaz", !!so?.ok && !JSON.stringify(so.result).includes(INLINE_PARTNER_ID));
  check("P03 2. kişi eksikse reddedilir (rezervasyon öncesi)", !R("western.synastry").parse({ ...ME }, D1101).ok);
  check("P04 eş profil kimliği dışarıdan verilemez (bilinmeyen alan)", !R("vedic.gun_milan").parse({ ...ME, ...P2, partnerProfileId: INLINE_PARTNER_ID }, D1101).ok);
  // ── Kutup: Placidus evli tekniklerde sağlayıcıya gitmeden engel ──
  const POLAR = "gn-524305"; // Murmansk, enlem 68.97° (veri setinden)
  let polarRan = 0;
  for (const id of ["kp.chart", "kp.dasha", "kp.ruling"]) {
    const pt = R(id).parse({ birthDate: "1990-07-15", birthTime: "14:30", birthPlace: POLAR }, D1101);
    if (!pt.ok) continue;
    const pf = strictFetch();
    const po = await R(id).run(ctx(fakeDb().db, pf.fn, D1101), pt.value);
    polarRan++;
    check(`Z01 kutup dairesi ötesi ${id}: istek ATILMAZ, açık mesaj`, !po.ok && po.code === "girdi" && pf.calls.length === 0, po.ok ? "ok" : po.message);
  }
  for (const id of ["western.synastry", "western.composite"]) {
    const cp = R(id).parse({ ...ME, birthDate2: "1988-03-21", birthTime2: "06:45", birthPlace2: POLAR }, D1101);
    if (!cp.ok) continue;
    const cf = strictFetch();
    const co = await R(id).run(ctx(fakeDb().db, cf.fn, D1101), cp.value);
    polarRan++;
    check(`Z02 ${id}: 2. kişi kutupta + Placidus → istek ATILMAZ`, !co.ok && cf.calls.length === 0);
  }
  check("Z03 kutup senaryoları gerçekten çalıştı (5)", polarRan === 5);
  // ── Girdi ──
  check("I01 forecast en çok 90 gün (366 seçilemez)", !R("western.forecast").parse({ ...ME, days: "366" }, D1101).ok);
  check("I02 gezegen dönüşü listede olmayan gezegen reddedilir", !R("western.planetary_return").parse({ ...ME, planet: "pluto", approxDate: "2030-01-01" }, D1101).ok);
  check("I03 relocation hedef yer zorunlu ve yalnız veri setinden", !R("western.relocation").parse({ ...ME }, D1101).ok && !R("western.relocation").parse({ ...ME, targetPlace: "http://evil" }, D1101).ok);
  check("I04 varga yalnız listedeki bölümler", !R("vedic.varga").parse({ ...ME, division: "11" }, D1101).ok);
  const gap = R("western.natal").parse({ birthDate: "2016-03-27", birthTime: "01:30", birthPlace: "gb-london" }, D1101);
  if (gap.ok) {
    const gf = strictFetch();
    const go = await R("western.natal").run(ctx(fakeDb().db, gf.fn, D1101), gap.value);
    check("I05 yaz saati boşluğundaki saat: istek ATILMAZ, açık mesaj", !go.ok && gf.calls.length === 0 && go.code === "girdi", go.ok ? "ok" : go.message);
  } else check("I05 yaz saati boşluğu girdi", false, JSON.stringify(gap.errors));
  const off = R("vedic.d1").parse(ME, D1101);
  if (off.ok) {
    const of = strictFetch();
    const oo = await R("vedic.d1").run(ctx(fakeDb().db, of.fn, D1101, false, { ...ENV, ASTROLOGY_MODULE_ENABLED: "false" }), off.value);
    check("I06 Atlas modül anahtarı kapalı → çalışmaz, istek yok", !oo.ok && of.calls.length === 0);
  }
  // Sağlayıcı hatası: kısmi sonuç gösterilmez, ikinci istek atılmaz (extra_points 3 istek; ilki 503)
  const ev = R("western.extra_points").parse(ME, D1101);
  if (ev.ok) {
    let n = 0;
    const f503 = async () => { n++; return new Response("{}", { status: 503 }); };
    const eo = await R("western.extra_points").run(ctx(fakeDb().db, f503, D1101), ev.value);
    check("E01 503 → hata, yeniden deneme YOK (tek istek), kısmi sonuç yok", !eo.ok && n === 1);
  }
  // ── Katalog tutarlılığı ──
  check("C01 kayıtlı her Atlas çalıştırıcısı katalogda 'hazır'", ATLAS_VISITOR_TECHNIQUES.every((t) => CAMPAIGN_CATALOG.find((e) => e.key === `atlas:${t}`)?.readiness === "hazir"), ATLAS_VISITOR_TECHNIQUES.filter((t) => CAMPAIGN_CATALOG.find((e) => e.key === `atlas:${t}`)?.readiness !== "hazir").join(","));
  check("C02 çalıştırıcı kaydında görünür", ATLAS_VISITOR_TECHNIQUES.every((t) => VISITOR_RUNNERS.has(`atlas:${t}`)));
  console.log(`\nToplam: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
