/**
 * Klasik Numeroloji — sunucu/saf katman BİRİM harness'i (tamamen çevrimdışı; ağ YOK, DB YOK).
 *
 *   • bayraklar (tam "true")
 *   • girdi doğrulama (Türkçe adlar, artık gün, geçersiz tarih, fazla alan, script etiketi, boyut)
 *   • sağlayıcı istemcisi — SAHTE fetch: URL beyaz listesi, anahtar yalnız başlıkta, hata gövdesi okunmaz,
 *     zaman aşımı yeniden DENENMEZ, 429/503 en fazla 1 kez (Retry-After ≤ 5 sn), malformed JSON, oran başlıkları,
 *     ROXY_API_BASE_URL resmî host dışı → yok sayılır
 *   • önbellek anahtarı determinizmi / tenant + tarih ayrımı; kota durumu; single-flight
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/server/unit.harness.ts
 */
import Module from "node:module";
import path from "node:path";

{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}

// Güvenlik ağı: bu süreçte GERÇEK ağ çağrısı imkânsız (yalnız enjekte sahte fetch kullanılır).
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(`ağ kilidi: ${String(input instanceof Request ? input.url : input).replace(/[?#].*$/, "")}`);
}) as typeof fetch;

let pass = 0;
let fail = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string, extra?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ✗ ${label}${extra !== undefined ? ` → ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}
const section = (s: string) => console.log(`\n[${s}]`);

type FakeCall = { url: string; init: RequestInit };

async function main(): Promise<void> {
  const flags = await import("../../../lib/numeroloji-klasik/flags");
  const input = await import("../../../lib/numeroloji-klasik/input");
  const pc = await import("../../../lib/numeroloji-klasik/server/providerClient");
  const cache = await import("../../../lib/numeroloji-klasik/server/cache");
  const quota = await import("../../../lib/numeroloji-klasik/server/quota");
  const svc = await import("../../../lib/numeroloji-klasik/server/service");

  section("bayraklar");
  ok(flags.isClassicEnabled({ NUMEROLOGY_CLASSIC_ENABLED: "true" }) === true, "ENABLED=true → açık");
  for (const v of [undefined, "", "1", "TRUE", " true", "true ", "yes"]) {
    ok(flags.isClassicEnabled({ NUMEROLOGY_CLASSIC_ENABLED: v }) === false, `ENABLED=${JSON.stringify(v)} → kapalı`);
  }
  ok(flags.isClassicProviderCallsEnabled({ NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "true" }) === true, "PROVIDER_CALLS=true → açık");
  ok(flags.isClassicProviderCallsEnabled({ NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "1" }) === false, "PROVIDER_CALLS=1 → kapalı");
  ok(flags.isClassicProviderCallsEnabled({}) === false, "PROVIDER_CALLS tanımsız → kapalı");

  section("girdi doğrulama");
  const person = (fullName: unknown, birth: unknown, extra: Record<string, unknown> = {}) =>
    input.validateAnalysisRequest({ kind: "person", input: { fullName, birth, ...extra } });
  const tr = person("  Işıl   Çağrı Şengül Öztürk ", { year: 1990, month: 5, day: 17 });
  ok(tr.ok && tr.value.kind === "person" && tr.value.input.fullName === "Işıl Çağrı Şengül Öztürk", "Türkçe ad kabul + boşluk kanonik", tr);
  ok(tr.ok && JSON.stringify(tr.value.techniques) === JSON.stringify(["core"]), "varsayılan teknik: core");
  const nfd = person("İpek Gül", { year: 1990, month: 1, day: 1 });
  ok(nfd.ok && nfd.value.kind === "person" && nfd.value.input.fullName === "İpek Gül", "NFD ad NFC'ye çevrilir", nfd);
  ok(person("Jean-Luc O'Neil Jr.", { year: 1980, month: 2, day: 3 }).ok, "tire / kesme / nokta kabul");
  ok(person("Ayşe’nin Adı", { year: 1980, month: 2, day: 3 }).ok, "’ → ' kanonik");
  ok(!person("<script>alert(1)</script>", { year: 1990, month: 1, day: 1 }).ok, "script etiketi → RED");
  ok(!person("Ali2", { year: 1990, month: 1, day: 1 }).ok, "rakam içeren ad → RED");
  ok(!person("   ", { year: 1990, month: 1, day: 1 }).ok, "boş ad → RED");
  ok(!person("- . '", { year: 1990, month: 1, day: 1 }).ok, "harfsiz ad → RED");
  ok(!person("A".repeat(121), { year: 1990, month: 1, day: 1 }).ok, "121 karakter ad → RED");
  ok(person("Ayşe ".repeat(23) + "Ayşen", { year: 1990, month: 1, day: 1 }).ok, "120 karakter Türkçe ad → kabul");
  ok(!person("Şşş Ğğ", { year: 1990, month: 1, day: 1 }).ok, "sesli harfsiz ad → RED (sağlayıcıya gitmez)");
  ok(!person("Aaa Ee", { year: 1990, month: 1, day: 1 }).ok, "sessiz harfsiz ad → RED");
  ok(person("Öz Üç", { year: 1990, month: 1, day: 1 }).ok && person("Işık", { year: 1990, month: 1, day: 1 }).ok, "ö/ü/ı katlanınca sesli sayılır (Öz Üç, Işık kabul)");
  ok(!person("Ωμέγα", { year: 1990, month: 1, day: 1 }).ok, "Latin'e katlanmayan yazı (Yunan) → RED");
  ok(input.hasVowelAndConsonant("İpek") && !input.hasVowelAndConsonant("Ğ") && !input.hasVowelAndConsonant("Iıİi"), "sesli/sessiz kuralı (Türkçe katlama)");
  ok(!input.validateAnalysisRequest({ kind: "business", input: { name: "BRT 2026" } }).ok, "işletme adı sesli harfsiz → RED");
  ok(!input.validateAnalysisRequest({ kind: "names", input: { candidates: ["Ada", "Crr"] } }).ok, "aday ad sesli harfsiz → RED");
  const tb = person("Ali", { year: 1990, month: 5, day: 17 }, { targetDate: "1990-05-16" });
  ok(!tb.ok && tb.code === "TARGET_BEFORE_BIRTH", "targetDate doğumdan önce → RED", tb);
  ok(person("Ali", { year: 1990, month: 5, day: 17 }, { targetDate: "1990-05-17" }).ok, "targetDate = doğum günü → kabul");
  ok(!person("Ali​Veli", { year: 1990, month: 1, day: 1 }).ok, "sıfır genişlikli boşluk → RED");
  ok(person("Ali", { year: 2000, month: 2, day: 29 }).ok, "2000-02-29 (artık) kabul");
  ok(person("Ali", { year: 2024, month: 2, day: 29 }).ok, "2024-02-29 kabul");
  ok(!person("Ali", { year: 1900, month: 2, day: 29 }).ok, "1900-02-29 (artık değil) → RED");
  ok(!person("Ali", { year: 2023, month: 2, day: 29 }).ok, "2023-02-29 → RED");
  ok(!person("Ali", { year: 2023, month: 4, day: 31 }).ok, "31 Nisan → RED");
  ok(!person("Ali", { year: 1899, month: 1, day: 1 }).ok, "1899 → RED");
  ok(!person("Ali", { year: 2101, month: 1, day: 1 }).ok, "2101 → RED");
  ok(!person("Ali", { year: 1990, month: 13, day: 1 }).ok, "ay 13 → RED");
  ok(!person("Ali", { year: "1990", month: 1, day: 1 }).ok, "metin yıl → RED");
  ok(!person("Ali", { year: 1990.5, month: 1, day: 1 }).ok, "kesirli yıl → RED");
  ok(!person("Ali", { year: 1990, month: 1, day: 1, hour: 3 }).ok, "birth içinde fazla alan → RED");
  ok(!person("Ali", { year: 1990, month: 1, day: 1 }, { gender: "f" }).ok, "input içinde fazla alan → RED");
  ok(person("Ali", { year: 1990, month: 1, day: 1 }, { targetDate: "2026-10-29" }).ok, "targetDate geçerli");
  ok(!person("Ali", { year: 1990, month: 1, day: 1 }, { targetDate: "2026-02-30" }).ok, "targetDate 30 Şubat → RED");
  ok(!person("Ali", { year: 1990, month: 1, day: 1 }, { targetDate: "29.10.2026" }).ok, "targetDate biçim dışı → RED");
  ok(!input.validateAnalysisRequest({ kind: "person", input: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } }, tenantId: "x" }).ok, "üst düzey fazla alan (tenantId) → RED");
  ok(!input.validateAnalysisRequest({ kind: "horoscope", input: {} }).ok, "bilinmeyen kind → RED");
  ok(!input.validateAnalysisRequest({ kind: "person", techniques: ["core", "astro"], input: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } } }).ok, "bilinmeyen teknik → RED");
  const techs = input.validateAnalysisRequest({ kind: "person", techniques: ["dual", "core", "dual", "bridge"], input: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } } });
  ok(techs.ok && JSON.stringify(techs.value.techniques) === JSON.stringify(["core", "bridge", "dual"]), "teknik listesi tekilleşir + kanonik sıra", techs);
  ok(!input.validateAnalysisRequest({ kind: "person", clientId: "not-a-uuid", input: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } } }).ok, "geçersiz clientId → RED");
  ok(!input.validateAnalysisRequest({ kind: "person", title: "<b>x</b>", input: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } } }).ok, "başlıkta < > → RED");
  const rel = input.validateAnalysisRequest({ kind: "relationship", input: { person1: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 } }, person2: { fullName: "Ayşe", birth: { year: 1992, month: 3, day: 4 } } } });
  ok(rel.ok, "ilişki (2 kişi) kabul", rel);
  ok(!input.validateAnalysisRequest({ kind: "relationship", input: { person1: { fullName: "Ali", birth: { year: 1990, month: 1, day: 1 }, targetDate: "2026-01-01" }, person2: { fullName: "Ayşe", birth: { year: 1992, month: 3, day: 4 } } } }).ok, "ilişkide kişi targetDate → RED");
  ok(input.validateAnalysisRequest({ kind: "business", input: { name: "Yaşam & Şifa 2026 Ltd." } }).ok, "işletme adı (rakam, &) kabul");
  ok(!input.validateAnalysisRequest({ kind: "business", input: { name: "<img src=x>" } }).ok, "işletme adı HTML → RED");
  ok(input.validateAnalysisRequest({ kind: "names", input: { candidates: ["Ada", "Defne", "Elif"] } }).ok, "3 aday ad kabul");
  ok(!input.validateAnalysisRequest({ kind: "names", input: { candidates: [] } }).ok, "0 aday → RED");
  ok(!input.validateAnalysisRequest({ kind: "names", input: { candidates: ["A", "B", "C", "D", "E", "F", "G"] } }).ok, "7 aday → RED");
  ok(!input.validateAnalysisRequest({ kind: "names", input: { candidates: ["Işık", "IŞIK"] } }).ok, "Türkçe büyük/küçük farkıyla yinelenen aday → RED");
  ok(input.parseClassicJsonBody("x".repeat(16 * 1024 + 1)).ok === false, "16 KB üstü gövde → RED");
  const big = input.parseClassicJsonBody(JSON.stringify({ s: "ş".repeat(8200) }));
  ok(!big.ok && big.code === "PAYLOAD_TOO_LARGE", "UTF-8 bayt sayımı (8200 × ş > 16 KB) → RED", big);
  ok(!input.parseClassicJsonBody("{bozuk").ok, "bozuk JSON → RED");
  ok(input.canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }) === '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}', "kanonik JSON anahtar sıralı");
  const pt = input.validatePatchRequest({ title: "Yeni", rowVersion: 2 });
  ok(pt.ok && pt.value.title === "Yeni", "PATCH başlık + rowVersion kabul");
  ok(!input.validatePatchRequest({ title: "Yeni" }).ok, "PATCH rowVersion yok → RED");
  ok(!input.validatePatchRequest({ rowVersion: 1 }).ok, "PATCH alan yok → RED");
  ok(!input.validatePatchRequest({ rowVersion: 1, result: {} }).ok, "PATCH fazla alan (result) → RED");
  const unlink = input.validatePatchRequest({ clientId: null, rowVersion: 3 });
  ok(unlink.ok && unlink.value.clientId === null, "PATCH clientId null (bağ kaldırma) kabul");

  section("sağlayıcı istemcisi (sahte fetch)");
  const cfg = { apiKey: "zz-fake-key-NOT-REAL", baseUrl: pc.CLASSIC_PROVIDER_BASE_URL };
  ok(pc.readClassicProviderConfig({}) === null, "anahtar yok → yapılandırma null");
  ok(pc.readClassicProviderConfig({ ROXY_API_KEY: "k", ROXY_API_BASE_URL: "https://evil.example/api/v2" })?.baseUrl === pc.CLASSIC_PROVIDER_BASE_URL, "resmî olmayan ROXY_API_BASE_URL yok sayılır");
  ok(pc.readClassicProviderConfig({ ROXY_API_KEY: "k", ROXY_API_BASE_URL: "http://roxyapi.com/api/v2" })?.baseUrl === pc.CLASSIC_PROVIDER_BASE_URL, "http:// taban yok sayılır");
  ok(pc.readClassicProviderConfig({ ROXY_API_KEY: "k", ROXY_API_BASE_URL: "https://roxyapi.com/api/v2/" })?.baseUrl === pc.CLASSIC_PROVIDER_BASE_URL, "resmî taban (sondaki /) kabul");

  const mk = (responder: (n: number, c: FakeCall) => Response | Promise<Response>) => {
    const calls: FakeCall[] = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return responder(calls.length, { url, init });
    };
    return { calls, fetchImpl };
  };
  const json200 = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...headers } });
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };

  {
    const f = mk(() => json200({ ok: 1 }, { "x-ratelimit-remaining": "49967", "x-ratelimit-limit": "50000", "x-ratelimit-reset": "1793491200" }));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali", year: 1990, month: 1, day: 1 }, { fetchImpl: f.fetchImpl, sleep });
    ok(r.ok && r.attempts === 1 && f.calls.length === 1, "200 → tek çağrı");
    ok(f.calls[0]?.url === "https://roxyapi.com/api/v2/numerology/chart?lang=tr", "URL: resmî taban + /numerology/chart + lang=tr", f.calls[0]?.url);
    const h = f.calls[0]?.init.headers as Record<string, string>;
    ok(h["X-API-Key"] === cfg.apiKey && f.calls[0]?.init.method === "POST", "anahtar yalnız X-API-Key başlığında; POST");
    ok(!f.calls[0]?.url.includes(cfg.apiKey) && !String(f.calls[0]?.init.body).includes(cfg.apiKey), "anahtar URL/gövdede yok");
    ok(!JSON.stringify(r).includes(cfg.apiKey), "dönüş değerinde anahtar yok");
    ok(r.rate.remaining === 49967 && r.rate.limit === 50000 && r.rate.resetAt === 1793491200 * 1000, "oran başlıkları okunur", r.rate);
  }
  {
    const f = mk(() => json200({}));
    const r = await pc.callClassicEndpoint(cfg, "meanings", null, { fetchImpl: f.fetchImpl, pathParam: "11" });
    ok(r.ok && f.calls[0]?.url === "https://roxyapi.com/api/v2/numerology/meanings/11?lang=tr" && f.calls[0]?.init.method === "GET", "GET meanings/11");
    const bad1 = await pc.callClassicEndpoint(cfg, "meanings", null, { fetchImpl: f.fetchImpl, pathParam: "10" });
    const bad2 = await pc.callClassicEndpoint(cfg, "compound_number", null, { fetchImpl: f.fetchImpl, pathParam: "../usage" });
    const bad3 = await pc.callClassicEndpoint(cfg, "usage" as never, {}, { fetchImpl: f.fetchImpl });
    const bad4 = await pc.callClassicEndpoint(cfg, "chart", null, { fetchImpl: f.fetchImpl });
    const bad5 = await pc.callClassicEndpoint(cfg, "chart", { fullName: "x".repeat(9000) }, { fetchImpl: f.fetchImpl });
    const bad6 = await pc.callClassicEndpoint(cfg, "chart", {}, { fetchImpl: f.fetchImpl, lang: "tr&x=1" });
    ok([bad1, bad2, bad3, bad4, bad5, bad6].every((b) => !b.ok && b.kind === "not_allowed" && b.attempts === 0) && f.calls.length === 1,
      "beyaz liste dışı (meanings 10, yol enjeksiyonu, /usage, gövdesiz POST, 8 KB+ gövde, lang enjeksiyonu) → 0 çağrı");
  }
  {
    const f = mk(() => new Promise<Response>((_r, rej) => setTimeout(() => rej(Object.assign(new Error("aborted"), { name: "AbortError" })), 5)));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep, timeoutMs: 1 });
    ok(!r.ok && r.kind === "timeout" && f.calls.length === 1, "zaman aşımı → YENİDEN DENEME YOK (1 çağrı)", { r, n: f.calls.length });
  }
  {
    const f = mk(() => { throw new TypeError("fetch failed"); });
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "network" && f.calls.length === 1, "ağ hatası → yeniden deneme yok");
  }
  {
    sleeps.length = 0;
    const f = mk((n) => (n === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "2" } }) : json200({ ok: 1 })));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(r.ok && r.attempts === 2 && f.calls.length === 2 && sleeps[0] === 2000, "429 + Retry-After 2 → tek yeniden deneme, başarı", { r, sleeps });
  }
  {
    const f = mk(() => new Response("{}", { status: 429, headers: { "retry-after": "1" } }));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "rate_limited" && f.calls.length === 2, "429 sürekli → en fazla 2 deneme (1 yeniden)");
  }
  {
    const f = mk(() => new Response("{}", { status: 503, headers: { "retry-after": "30" } }));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "saturated" && f.calls.length === 1, "503 + Retry-After 30 sn (> 5) → yeniden deneme yok");
  }
  {
    let bodyRead = false;
    const f = mk(() => {
      const res = new Response(JSON.stringify({ error: "invalid key zz-fake-key-NOT-REAL" }), { status: 401 });
      const origText = res.text.bind(res);
      const origJson = res.json.bind(res);
      (res as unknown as { text: () => Promise<string> }).text = () => { bodyRead = true; return origText(); };
      (res as unknown as { json: () => Promise<unknown> }).json = () => { bodyRead = true; return origJson(); };
      return res;
    });
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "unauthorized" && !bodyRead && !JSON.stringify(r).includes("invalid key"), "401 → hata gövdesi OKUNMAZ, dönüşe girmez");
  }
  {
    const f = mk(() => new Response("{not json", { status: 200, headers: { "content-type": "application/json" } }));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "malformed_json" && f.calls.length === 1, "bozuk JSON → malformed_json, yeniden deneme yok");
  }
  {
    const f = mk(() => new Response("{}", { status: 422 }));
    const r = await pc.callClassicEndpoint(cfg, "chart", { fullName: "Ali" }, { fetchImpl: f.fetchImpl, sleep });
    ok(!r.ok && r.kind === "bad_request" && f.calls.length === 1, "422 → bad_request, yeniden deneme yok");
  }

  section("önbellek anahtarı");
  const base = { tenantId: "11111111-1111-1111-1111-111111111111", endpointId: "chart" as const, input: { fullName: "Ali", year: 1990, month: 1, day: 1, currentYear: 2026 }, lang: "tr", specVersion: "s1", adapterVersion: "a1" };
  const k1 = cache.classicCacheKey(base, "secret");
  ok(/^[0-9a-f]{64}$/.test(k1), "anahtar 64 hex");
  ok(k1 === cache.classicCacheKey({ ...base, input: { day: 1, month: 1, year: 1990, currentYear: 2026, fullName: "Ali" } }, "secret"), "alan sırası anahtarı değiştirmez (kanonik)");
  ok(k1 !== cache.classicCacheKey({ ...base, tenantId: "22222222-2222-2222-2222-222222222222" }, "secret"), "farklı tenant → farklı anahtar");
  ok(k1 !== cache.classicCacheKey({ ...base, input: { ...base.input, currentYear: 2027 } }, "secret"), "farklı currentYear (tarih bağımlı) → farklı anahtar");
  ok(k1 !== cache.classicCacheKey({ ...base, lang: "en" }, "secret"), "farklı dil → farklı anahtar");
  ok(k1 !== cache.classicCacheKey({ ...base, specVersion: "s2" }, "secret") && k1 !== cache.classicCacheKey({ ...base, adapterVersion: "a2" }, "secret"), "spec/adapter sürümü → farklı anahtar");
  ok(k1 !== cache.classicCacheKey(base, "other-secret") && k1 !== cache.classicCacheKey(base, null), "anahtar sırla bağlı (HMAC; sızan anahtar ad/doğum tahminine izin vermez)");
  const pd = (d: string) => cache.classicCacheKey({ ...base, endpointId: "personal_day", input: { month: 1, day: 1, targetDate: d } }, "s");
  ok(pd("2026-10-29") !== pd("2026-10-30"), "personal_day: hedef tarih anahtarda");

  section("çağrı planı (MİMARİ §4)");
  const all = input.validateAnalysisRequest({ kind: "person", techniques: ["core", "bridge", "personal_day", "chaldean", "dual"], input: { fullName: "Ali Veli", birth: { year: 1990, month: 2, day: 3 } } });
  if (all.ok) {
    const plan = svc.planClassicCalls(all.value, "2026-10-29");
    ok(plan.map((p) => p.endpointId).join(",") === "chart,bridge,personal_day,chaldean", "kişi tüm teknikler → 4 çağrı; /dual ÇAĞRILMAZ (chart+chaldean'dan türetilir)", plan);
    ok(!("currentYear" in plan[0].payload) && (plan[0].payload as { targetDate?: string }).targetDate === "2026-10-29", "chart: currentYear YOK, targetDate = Europe/Istanbul referans günü", plan[0].payload);
    ok((plan[2].payload as { targetDate?: string }).targetDate === "2026-10-29", "personal_day targetDate = referans günü");
  }
  const dualOnly = input.validateAnalysisRequest({ kind: "person", techniques: ["dual"], input: { fullName: "Ali Veli", birth: { year: 1990, month: 2, day: 3 } } });
  if (dualOnly.ok) {
    ok(svc.planClassicCalls(dualOnly.value, "2026-10-29").map((p) => p.endpointId).join(",") === "chart,chaldean", "yalnız İki Sistem → chart + chaldean (dual uç çağrısı yok)");
  }
  const tgt = input.validateAnalysisRequest({ kind: "person", techniques: ["core", "personal_day"], input: { fullName: "Ali", birth: { year: 1990, month: 2, day: 3 }, targetDate: "2030-01-15" } });
  if (tgt.ok) {
    const plan = svc.planClassicCalls(tgt.value, "2026-10-29");
    ok((plan[0].payload as { targetDate?: string }).targetDate === "2030-01-15" && (plan[1].payload as { targetDate?: string }).targetDate === "2030-01-15", "targetDate verilince plan onu kullanır");
  }
  // Günün Sayısı (/daily): Kişisel Gün'den AYRI teknik; sağlayıcıya ad/doğum GİTMEZ (opak HMAC tohumu).
  const withDaily = input.validateAnalysisRequest({ kind: "person", techniques: ["core", "personal_day", "daily"], input: { fullName: "Ayşe Işık", birth: { year: 1985, month: 7, day: 9 } } });
  ok(withDaily.ok, "daily kişi tekniği olarak kabul edilir");
  if (withDaily.ok) {
    const seed = svc.classicDailySeed("test-secret", "Ayşe Işık", { year: 1985, month: 7, day: 9 });
    const plan = svc.planClassicCalls(withDaily.value, "2026-10-29", { dailySeed: seed });
    ok(plan.map((p) => p.endpointId).join(",") === "chart,personal_day,daily", "daily seçilince ayrı /daily çağrısı (personal_day ile birleşmez)", plan.map((p) => p.endpointId));
    const dp = plan.find((p) => p.endpointId === "daily")!.payload as Record<string, unknown>;
    ok(Object.keys(dp).sort().join(",") === "date,seed" && dp.date === "2026-10-29", "daily gövdesi yalnız {seed, date}", dp);
    const sj = JSON.stringify(dp).toLowerCase();
    ok(/^nk[0-9a-f]{20}$/.test(String(dp.seed)) && !sj.includes("ay") && !sj.includes("1985") && !sj.includes("işık"), "tohum opak (ad / doğum yılı sızmaz)", dp);
    ok(svc.classicDailySeed("test-secret", "ayşe ışık", { year: 1985, month: 7, day: 9 }) === seed, "tohum kararlı (aynı kişi → aynı tohum; Türkçe büyük/küçük harf duyarsız)");
    ok(svc.classicDailySeed("başka-sır", "Ayşe Işık", { year: 1985, month: 7, day: 9 }) !== seed, "tohum sıra bağlı (başka sır → başka tohum)");
    ok(svc.classicDailySeed("test-secret", "Ayşe Işık", { year: 1985, month: 7, day: 10 }) !== seed, "farklı doğum → farklı tohum");
    ok(svc.classicDailySeed(null, "Ayşe Işık", { year: 1985, month: 7, day: 9 }) === null, "sır yoksa tohum yok");
    const common = svc.planClassicCalls(withDaily.value, "2026-10-29", { dailySeed: null }).find((p) => p.endpointId === "daily")!.payload;
    ok(JSON.stringify(common) === JSON.stringify({ date: "2026-10-29" }), "tohumsuz → yalnız tarih (günün ortak sayısı)", common);
    const t2 = input.validateAnalysisRequest({ kind: "person", techniques: ["daily"], input: { fullName: "Ayşe Işık", birth: { year: 1985, month: 7, day: 9 }, targetDate: "2027-01-05" } });
    if (t2.ok) ok((svc.planClassicCalls(t2.value, "2026-10-29", { dailySeed: seed })[0].payload as { date?: string }).date === "2027-01-05", "daily tarih = hedef tarih (verildiyse)");
  }
  const names = input.validateAnalysisRequest({ kind: "names", input: { candidates: ["Ada", "Defne"] } });
  if (names.ok) ok(svc.planClassicCalls(names.value, "2026-10-29").map((p) => p.label).join(",") === "dual#1,dual#2", "isim adayları → aday başına dual");
  const derive = await import("../../../lib/numeroloji-klasik/server/derive");
  const dd = derive.deriveDualFromChartChaldean(
    { profile: { name: "Ali" }, core: { expression: { value: 11, type: "master", meaning: { title: "T", keywords: ["a"] } } } },
    { name: "Ali", destiny: { value: 2, root: 2, total: 20, compound: 20 }, numberMeaning: { number: 2, planet: "Moon", title: "K" }, caution: false },
  );
  ok(!!dd && dd.agreement === true && dd.pythagorean.value === 11 && dd.pythagorean.title === "T" && dd.chaldean.planet === "Moon", "dual türetme: expression 11 ↔ kalde kök 2 → uyum (tek hane eşit)", dd);
  ok(derive.deriveDualFromChartChaldean({ core: {} }, { destiny: { root: 2 } }) === null, "eksik yapı → türetme null (dual 'failed')");
  ok(svc.istanbulToday(new Date("2026-10-29T22:30:00Z")) === "2026-10-30", "referans gün Europe/Istanbul (UTC 22:30 → ertesi gün)");
  ok(svc.defaultLifePathOf({ core: { lifePath: { value: 11 } } }) === 11 && svc.defaultLifePathOf({ core: { lifePath: { value: 12 } } }) === null, "Life Path okuyucu (model.ts core.lifePath.value)");

  section("NK-R3: Gelecek Yılları Göster (saf karar)");
  {
    const fy = await import("../../../lib/numeroloji-klasik/futureYears");
    const O = { futureYears: false, currentYear: 2026 };
    ok(fy.targetAllowed(undefined, O) && fy.targetAllowed("2026-12-31", O) && !fy.targetAllowed("2027-01-01", O), "hedef: bu yıl içi izinli, gelecek yıl izinsiz (yetkisiz)");
    ok(fy.targetAllowed("2035-01-01", { ...O, futureYears: true }), "hedef: yetkili her yıl");
    const per = (startAge: number) => ({ position: startAge, number: 1, startAge, endAge: null });
    const res = { chart: { pinnacles: [per(0), per(38), per(39)], challenges: [per(0), per(40)], personalYear: { personalYear: 5 } }, personal_day: { personalDay: 3 }, daily: { number: { value: 7 } } };
    const inp = { fullName: "A", birth: { year: 1988, month: 1, day: 1 } };
    const r1 = fy.redactClassicResultForFutureYears(res, { input: inp, referenceDate: "2026-10-29" }, O) as { chart: { pinnacles: { startAge: number }[]; challenges: unknown[]; personalYear?: unknown }; personal_day?: unknown; futureYearsView?: { hidden: { pinnacles: number } } };
    ok(r1.chart.pinnacles.map((p) => p.startAge).join(",") === "0,38" && r1.chart.challenges.length === 1, "sınır: 1988+38=2026 görünür, 2027 başlayan gizli (Mevcut modülle aynı ≤ kuralı)");
    ok(!!r1.chart.personalYear && !!r1.personal_day && r1.futureYearsView?.hidden.pinnacles === 1, "bu yılın hedef tarihi → zamanlama görünür, gizlenen sayısı işaretli");
    const r2 = fy.redactClassicResultForFutureYears(res, { input: inp, referenceDate: "2027-02-01" }, O) as Record<string, unknown>;
    ok(!("personal_day" in r2) && !("daily" in r2) && !("personalYear" in (r2.chart as object)), "gelecek yıl hedef tarihi → kişisel yıl/gün + günün sayısı gizli");
    const r3 = fy.redactClassicResultForFutureYears(res, { input: { fullName: "A" }, referenceDate: "2026-10-29" }, O) as { chart: { pinnacles: unknown[]; challenges: unknown[] } };
    ok(r3.chart.pinnacles.length === 0 && r3.chart.challenges.length === 0, "doğum yılı yok → kronolojik yapılar boş (fail-closed)");
    ok(fy.redactClassicResultForFutureYears(res, { input: inp, referenceDate: "2030-01-01" }, { ...O, futureYears: true }) === res, "yetkili → girdi AYNEN (kopya bile değil)");
    ok(JSON.stringify(res.chart.pinnacles.length) === "3" && "personal_day" in res, "kaynak nesne değişmedi (yalnız kopya daraltılır)");
  }

  section("kota durumu + single-flight");
  const qs = new quota.ProviderQuotaState();
  const now = Date.UTC(2026, 9, 29);
  ok(qs.known(now) === null, "başlangıçta kalan kota bilinmiyor");
  qs.observe({ limit: 50000, remaining: 2999, resetAt: now + 1000 }, now);
  ok(qs.known(now) === 2999, "gözlem kaydedilir");
  qs.observe({ limit: 50000, remaining: 3100, resetAt: now + 1000 }, now);
  ok(qs.known(now) === 2999, "aynı dönemde daha yüksek (eski) değer düşük değeri ezmez");
  ok(qs.known(now + 2000) === null, "dönem sıfırlandıktan sonra eski gözlem geçersiz");
  ok(quota.readQuotaFloor({}) === 3000 && quota.readQuotaFloor({ NUMEROLOGY_CLASSIC_QUOTA_FLOOR: "5000" }) === 5000 && quota.readQuotaFloor({ NUMEROLOGY_CLASSIC_QUOTA_FLOOR: "-1" }) === 3000, "kota tabanı varsayılan 3000; geçersiz değer → varsayılan");
  ok(quota.CLASSIC_RATE_LIMITS.perUser.limit === 60 && quota.CLASSIC_RATE_LIMITS.perUser.windowSeconds === 3600 && quota.CLASSIC_RATE_LIMITS.perTenant.limit === 400 && quota.CLASSIC_RATE_LIMITS.perTenant.windowSeconds === 86400, "limitler: kullanıcı 60/saat, tenant 400/gün");
  ok(quota.CLASSIC_RATE_LIMITS.inFlight.windowSeconds * 1000 >= 2 * pc.CLASSIC_WORST_CALL_MS, "eşzamanlılık kilidi ≥ 2 × en kötü çağrı");
  // NK-006: başlık sayacı ≠ hesap sayacı → pay + 429 soğuması (fail-closed)
  ok(quota.readQuotaHeaderGap({}) === 0 && quota.readQuotaHeaderGap({ NUMEROLOGY_CLASSIC_QUOTA_HEADER_GAP: "22000" }) === 22000 && quota.readQuotaHeaderGap({ NUMEROLOGY_CLASSIC_QUOTA_HEADER_GAP: "x" }) === 0, "NK-006: başlık payı env (varsayılan 0, geçersiz → 0)");
  const qx = new quota.ProviderQuotaState();
  qx.observe({ limit: 50000, remaining: 49000, resetAt: now + 30 * 86400_000 }, now);
  qx.markExhausted(now);
  ok(qx.known(now + 1000) === 0, "NK-006: 429 sonrası kalan kota 0 sayılır (taban engeller)");
  ok(qx.known(now + quota.CLASSIC_QUOTA_COOLDOWN_MS + 1) === null, "NK-006: soğuma 10 dk; sonra keşif modu (ay kilitlenmez)");
  qx.observe({ limit: 50000, remaining: 48000, resetAt: now + 30 * 86400_000 }, now + quota.CLASSIC_QUOTA_COOLDOWN_MS + 2);
  ok(qx.known(now + quota.CLASSIC_QUOTA_COOLDOWN_MS + 3) === 48000, "NK-006: soğuma sonrası yeni gözlem kabul edilir");
  const sf = new quota.SingleFlight<number>();
  let runs = 0;
  const slow = () => new Promise<number>((r) => setTimeout(() => { runs++; r(42); }, 20));
  const [x, y, z] = await Promise.all([sf.run("k", slow), sf.run("k", slow), sf.run("k", slow)]);
  ok(runs === 1 && x === 42 && y === 42 && z === 42 && sf.size === 0, "single-flight: 3 eşzamanlı → 1 çalıştırma, sonra temizlenir");

  section("SEC-02: görünmez / yön karakterleri (başlık + adlar)");
  const birth = { year: 1990, month: 1, day: 1 };
  const INVIS = ["\u200B", "\u200C", "\u200D", "\u200E", "\u200F", "\u202A", "\u202E", "\u2066", "\u2069", "\u0085", "\u009F", "\uFEFF"];
  const tt = input.validateTitle("A\u200Bl\u202Ei\u2066 \u0085Ve\uFEFFli\u2069");
  ok(tt.ok && tt.value === "Ali Veli", "başlık: görünmez/bidi/C1/BOM karakterleri atılır + kırpılır", tt);
  ok(INVIS.every((c) => { const r = input.validateTitle(`Baş${c}lık`); return r.ok && r.value === "Başlık"; }), "başlık: kümedeki her karakter tek tek atılır");
  const onlyInvis = input.validateTitle("\u200B\u202E\u2066");
  ok(!onlyInvis.ok && onlyInvis.code === "INVALID_TITLE", "başlık yalnız görünmez karakter → RED", onlyInvis);
  ok(input.validateTitle("").ok && input.validateTitle(undefined).ok && (input.validateTitle("   ") as { value?: string }).value === "", "boş başlık hâlâ serbest (davranış korunur)");
  ok(!input.validateTitle("a\u007fb").ok && !input.validateTitle("a\u0001b").ok, "başlık: C0 + DEL hâlâ RED (davranış korunur)");
  const pv = input.validatePatchRequest({ title: "Yeni\u202E Ad", rowVersion: 1 });
  ok(pv.ok && pv.value.title === "Yeni Ad", "PATCH başlığı da temizlenir", pv);
  const bidiNames = INVIS.filter((c) => c !== "\uFEFF");
  ok(bidiNames.every((c) => !person(`Al${c}i`, birth).ok), "kişi adı: ZWJ/ZWSP/bidi/C1 → RED", bidiNames.filter((c) => person(`Al${c}i`, birth).ok).map((c) => c.codePointAt(0)?.toString(16)));
  const feff = person("Ali\uFEFFVeli", birth);
  ok(feff.ok && feff.value.kind === "person" && !feff.value.input.fullName.includes("\uFEFF"), "kişi adı: BOM boşluğa iner (adda kalmaz)", feff);
  const biz = (name: string) => input.validateAnalysisRequest({ kind: "business", input: { name } });
  ok(bidiNames.every((c) => !biz(`Yaşam${c} Şifa`).ok), "işletme adı: ZWJ/ZWSP/bidi/C1 → RED");
  const cand = (n: string) => input.validateAnalysisRequest({ kind: "names", input: { candidates: ["Ada", n] } });
  ok(bidiNames.every((c) => !cand(`De${c}fne`).ok), "aday adlar: ZWJ/ZWSP/bidi/C1 → RED");
  const relZ = input.validateAnalysisRequest({ kind: "relationship", input: { person1: { fullName: "A\u200Dli", birth }, person2: { fullName: "Ayşe", birth } } });
  ok(!relZ.ok, "ilişki kişi adı: ZWJ → RED");

  section("SEC-07: önbellek anahtarlama ortamı");
  ok(cache.resolveCacheKeying({ NUMEROLOGY_CLASSIC_CACHE_SECRET: "s1", SUPABASE_SERVICE_ROLE_KEY: "sr" }).mode === "secret", "kendi sırrı öncelikli");
  const srk = cache.resolveCacheKeying({ SUPABASE_SERVICE_ROLE_KEY: "sr", NODE_ENV: "production" });
  ok(srk.mode === "service_role" && srk.secret === "sr" && srk.enabled, "yalnız service-role → HMAC (etiketli) türetme");
  ok(cache.classicCacheKey(base, "sr") !== cache.classicCacheKey(base, null), "service-role türetmesi düz SHA-256 değildir");
  const off = cache.resolveCacheKeying({ NODE_ENV: "production" });
  ok(off.mode === "disabled" && !off.enabled && off.secret === null, "iki sır da yok + production → önbellek KAPALI");
  ok(cache.resolveCacheKeying({}).mode === "disabled", "iki sır da yok + NODE_ENV tanımsız → KAPALI");
  ok(cache.resolveCacheKeying({ NODE_ENV: "test" }).mode === "test_plain", "iki sır da yok + NODE_ENV=test → düz SHA-256");
  ok(cache.resolveCacheKeying({ NUMEROLOGY_CLASSIC_CACHE_SECRET: "  ", NODE_ENV: "production" }).mode === "disabled", "boşluk sır = yok");
  ok(!cache.cacheUsable(null, { NODE_ENV: "production" }) && cache.cacheUsable(null, { NODE_ENV: "test" }) && cache.cacheUsable("s", { NODE_ENV: "production" }), "servis kapısı: sırsız önbellek yalnız test'te");

  section("SEC-01: önbellek TTL ortamı");
  ok(cache.readCacheTtlDays({}) === 90, "TTL varsayılan 90 gün");
  ok(cache.readCacheTtlDays({ NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS: "30" }) === 30, "TTL 30");
  ok(cache.readCacheTtlDays({ NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS: "0" }) === 1 && cache.readCacheTtlDays({ NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS: "9999" }) === 365, "TTL 1–365 aralığına sıkıştırılır");
  ok(cache.readCacheTtlDays({ NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS: "-5" }) === 90 && cache.readCacheTtlDays({ NUMEROLOGY_CLASSIC_CACHE_TTL_DAYS: "abc" }) === 90, "geçersiz TTL → varsayılan");
  const nowT = Date.UTC(2026, 9, 29);
  ok(cache.cacheRowExpiresAt({ created_at: null, expires_at: new Date(nowT - 1).toISOString() }, 90) < nowT, "expires_at geçmişte → süresi geçmiş");
  ok(cache.cacheRowExpiresAt({ created_at: "bozuk", expires_at: null }, 90) === 0, "okunamayan tarih → süresi geçmiş sayılır (kapalı-hata)");

  section("SEC-03: keşif kapısı (kalan kota bilinmiyor)");
  {
    const g = new quota.ProviderQuotaState();
    let t = Date.UTC(2026, 9, 29);
    const clock = () => t;
    const r1 = await g.acquireDiscovery(clock, 1000);
    ok(typeof r1 === "function" && g.discoveryState().busy, "bilinmiyor → ilk çağıran kapıyı alır");
    const p2 = g.acquireDiscovery(clock, 1000);
    const p3 = g.acquireDiscovery(clock, 1000);
    ok(g.discoveryState().waiting === 2, "diğerleri sırada bekler");
    r1!();
    const r2 = await p2;
    ok(typeof r2 === "function" && g.discoveryState().busy && g.discoveryState().waiting === 1, "başlık gelmedi → sahiplik SIRADAKİNE geçer (tek tek)");
    g.observe({ limit: 50000, remaining: 40000, resetAt: t + 86_400_000 }, t);
    r2!();
    const r3 = await p3;
    ok(typeof r3 === "function" && !g.discoveryState().busy && g.discoveryState().waiting === 0, "taze kalan kota gözlenince keşif biter, bekleyenler serbest");
    const r4 = await g.acquireDiscovery(clock, 1000);
    ok(typeof r4 === "function" && !g.discoveryState().busy, "kota tazeyken kapı yok (no-op)");
    t += 11 * 60_000;
    ok(!g.isFresh(t) && g.known(t) === 40000, "11 dk sonra gözlem bayat (değer korunur, taze değil)");
    const r5 = await g.acquireDiscovery(clock, 1000);
    ok(typeof r5 === "function" && g.discoveryState().busy, "bayat → yeniden keşif modu");
    const timed = await g.acquireDiscovery(clock, 20);
    ok(timed === null && g.discoveryState().waiting === 0, "sıra 20 ms'de gelmezse null (CLASSIC_BUSY) + bekleyen temizlenir");
    r5!();
    r5!();
    ok(!g.discoveryState().busy, "release iki kez çağrılsa da güvenli");
    const logs: string[] = [];
    g.noteMissingHeader((m) => logs.push(m));
    g.noteMissingHeader((m) => logs.push(m));
    ok(logs.length === 1, "başlık yok logu bir kez");
    ok(quota.CLASSIC_DISCOVERY_WAIT_MS === 5000 && quota.CLASSIC_QUOTA_STALE_MS === 600_000, "bekleme ≤ 5 sn, bayatlık 10 dk");
    const errs = await import("../../../lib/numeroloji-klasik/server/errors");
    ok(errs.CLASSIC_ERRORS.CLASSIC_BUSY.status === 429 && errs.CLASSIC_ERRORS.CLIENTS_PERMISSION_REQUIRED.status === 403 && !("CLIENTS_PERMISSION" in errs.CLASSIC_ERRORS), "hata kodları: CLASSIC_BUSY 429; CLIENTS_PERMISSION_REQUIRED (tek kod)");
  }

  section("SEC-04: akış gövde okuyucu");
  {
    const cmp = await import("../../../lib/numeroloji-klasik/server/compareService");
    const http = await import("../../../lib/numeroloji-klasik/server/http");
    const { NextRequest } = await import("next/server");
    const streamReq = (chunks: number, size: number, counter: { pulls: number }) =>
      new Request("http://localhost/x", {
        method: "POST",
        body: new ReadableStream<Uint8Array>({
          pull(c) {
            counter.pulls++;
            if (counter.pulls > chunks) c.close();
            else c.enqueue(new Uint8Array(size).fill(0x61));
          },
        }),
        duplex: "half",
      } as RequestInit & { duplex: "half" });
    const c1 = { pulls: 0 };
    const big = await cmp.readLimitedJsonBody(streamReq(100_000, 8192, c1), cmp.COMPARE_MAX_BODY_BYTES);
    ok(!big.ok && big.code === "PAYLOAD_TOO_LARGE" && c1.pulls < 20, "not gövdesi: 96 KB aşılınca okuma kesilir (Content-Length yok)", { big, pulls: c1.pulls });
    const c2 = { pulls: 0 };
    const nreq = new NextRequest(streamReq(100_000, 4096, c2));
    const big2 = await http.readClassicBody(nreq);
    ok(!big2.ok && big2.code === "PAYLOAD_TOO_LARGE" && c2.pulls < 10, "analiz gövdesi: 16 KB aşılınca okuma kesilir", { big2, pulls: c2.pulls });
    const lying = new Request("http://localhost/x", { method: "POST", headers: { "content-length": "10" }, body: "x".repeat(20_000) });
    const ly = await http.readClassicBody(new NextRequest(lying));
    ok(!ly.ok && ly.code === "PAYLOAD_TOO_LARGE", "yanlış (küçük) Content-Length beyanı sınırı aşamaz", ly);
    const okBody = await cmp.readLimitedJsonBody(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ body: "ş".repeat(1000) }) }), cmp.COMPARE_MAX_BODY_BYTES);
    ok(okBody.ok && (okBody.value as { body: string }).body.length === 1000, "normal gövde (UTF-8) değişmeden okunur");
    const empty = await http.readClassicBody(new NextRequest(new Request("http://localhost/x", { method: "POST" })));
    ok(!empty.ok && empty.code === "MALFORMED_JSON", "boş gövde → MALFORMED_JSON (davranış korunur)");
  }

  console.log(`\n${pass} ✓ / ${fail} ✗`);
  if (fail) console.log(`BAŞARISIZ:\n  - ${failures.join("\n  - ")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("harness hatası:", e instanceof Error ? e.stack : String(e));
  process.exit(1);
});
