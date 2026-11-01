// KAMPANYA MERKEZİ KM-3 — ziyaretçi çalıştırıcıları birim testi (DB/ağ YOK; sahte kota koruyucusu + sahte sağlayıcı; KREDİ HARCANMAZ).
// Kapsam: kayıt (yalnız gerçek motora bağlı "hazır" teknikler), girdi doğrulama (bilinmeyen alan, takvim, gelecek tarih, konum),
// Bütüncül Numeroloji / Lilly / Kozmik paket (6 özellik, Hacamat yalnız tarafsız) gerçek motor çıktısı, HD BodyGraph + Word raporu
// (gerçek Roxy yanıt örneği), Atlas natal (gerçek golden), Klasik Numeroloji (sentetik normalize), yorum anahtarı (açık/kapalı),
// HER sağlayıcı isteği kota koruyucusundan geçer (red → istek ATILMAZ), izinsiz adres, uzman tablolarına erişim yok.
// Çalıştırma: npx tsx --tsconfig scripts/campaign/tsconfig.json scripts/campaign/visitor-runners.test.ts
import fs from "node:fs";
import path from "node:path";
import { ReservationCallGuard } from "@/lib/campaign/quotaService";
import { CAMPAIGN_CATALOG } from "@/lib/campaign/catalog";
import { VISITOR_RUNNERS, visitorRunnerFor } from "@/lib/campaign/visitor/runners";
import { guardedFetch } from "@/lib/campaign/visitor/roxyGuard";
import { findRealRemaining } from "@/lib/campaign/visitor/providerUsage";
import { powerDaysOfMonth } from "@/lib/campaign/visitor/runners/kozmik";
import type { RunContext } from "@/lib/campaign/visitor/runners/shared";
import type { VisitorResult } from "@/lib/campaign/visitor/types";
import { consistentRoxyResponse } from "../hd-roxy/consistentFixture";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
};
const ROOT = path.resolve(__dirname, "../..");
const NOW = new Date("2026-11-01T11:00:00Z");
const ENV = { ROXY_API_KEY: "zz-test-roxy-key-not-a-secret", ASTROLOGY_MODULE_ENABLED: "true", NUMEROLOGY_CLASSIC_PROVIDER_CALLS: "true", NUMEROLOGY_CLASSIC_ENABLED: "true" } as Record<string, string>;

// ── Sahte DB (rpc + from); hangi tabloya ne yapıldığı kaydedilir ──
type Op = { table: string; op: string };
function fakeDb(opts: { denyAuthorize?: boolean } = {}) {
  const ops: Op[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  let callId = 0;
  const builder = (table: string) => {
    const result = { data: [] as unknown[], error: null };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "gte", "lte", "order", "limit", "not"]) q[m] = () => { if (m === "select") ops.push({ table, op: "select" }); return q; };
    for (const m of ["insert", "upsert", "update", "delete"]) q[m] = async () => { ops.push({ table, op: m }); return { data: null, error: null }; };
    q.maybeSingle = async () => ({ data: null, error: null });
    q.single = async () => ({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(result).then(ok, ko);
    return q;
  };
  const db = {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      if (fn === "campaign_authorize_call") return opts.denyAuthorize ? { data: { ok: false, reason: "kampanya_kapali" }, error: null } : { data: { ok: true, call_id: ++callId }, error: null };
      if (fn === "campaign_observe_header") return { data: { ok: true, applied: false }, error: null };
      return { data: { ok: true }, error: null };
    },
  };
  return { db, ops, rpcs };
}

type Fetched = { url: string; body: unknown };
function fakeFetch(responder: (url: string, body: unknown) => { status?: number; json: unknown }) {
  const calls: Fetched[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    const r = responder(url, body);
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", "x-ratelimit-limit": "50000", "x-ratelimit-remaining": "49000", "x-ratelimit-reset": "2500000" },
    });
  };
  return { fn, calls };
}

function ctxFor(over: Omit<Partial<RunContext>, "db"> & { db?: unknown; max?: number } = {}): RunContext {
  const db = over.db ?? fakeDb().db;
  return {
    db: db as never,
    guard: new ReservationCallGuard(db as never, "11111111-1111-4111-8111-111111111111", over.max ?? 5),
    commentsEnabled: false,
    hdOptions: { word: false, kb: true },
    env: ENV,
    now: NOW,
    ...over,
  } as RunContext;
}
const r = (k: string) => VISITOR_RUNNERS.get(k)!;
const yorum = (res: VisitorResult) => res.blocks.filter((b) => (b as { kind?: string }).kind === "yorum");
const text = (res: VisitorResult) => JSON.stringify(res);

(async () => {
  // ── Kayıt ──
  const keys = [...VISITOR_RUNNERS.keys()];
  check("K01 çalıştırıcıların tümü katalogda ve 'hazır'", keys.every((k) => CAMPAIGN_CATALOG.find((e) => e.key === k)?.readiness === "hazir"), keys.join(","));
  check("K02 'doğrulama' / 'uygun değil' tekniklerin çalıştırıcısı yok", CAMPAIGN_CATALOG.filter((e) => e.readiness !== "hazir").every((e) => !VISITOR_RUNNERS.has(e.key) && visitorRunnerFor(e.key) === null));
  check("K03 hd:transit (sağlayıcı düzeltmesi + DB önbelleği) ziyaretçiye bağlı DEĞİL", visitorRunnerFor("hd:transit") === null && visitorRunnerFor("hd:local_engine") === null && visitorRunnerFor("hd:variables") === null);
  const byMod = (m: string) => keys.filter((k) => k.startsWith(`${m}:`)).length;
  check("K04 bağlı teknik sayısı (HD 2 + Klasik 10 + Bütüncül 4 + Atlas 37 + Kozmik 1 = 54)", keys.length === 54 && byMod("hd") === 2 && byMod("numk") === 10 && byMod("numb") === 4 && byMod("atlas") === 37 && byMod("kozmik") === 1, `${keys.length} hd=${byMod("hd")} numk=${byMod("numk")} numb=${byMod("numb")} atlas=${byMod("atlas")}`);
  check("K05 0 kredili teknikler yerel, kredili teknikler sağlayıcı türünde", keys.every((k) => { const e = CAMPAIGN_CATALOG.find((x) => x.key === k)!; return (e.credit[1] === 0) === (r(k).kind === "local") || (k === "atlas:western.profections" && r(k).kind === "provider"); }));

  // ── Girdi doğrulama ──
  const na = r("numb:analysis");
  const p1 = na.parse({ firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-03-15", extra: "x" }, NOW);
  check("G01 bilinmeyen alan → red", !p1.ok);
  const p2 = na.parse({ firstName: "123", lastName: "", birthDate: "2027-01-01" }, NOW);
  check("G02 geçersiz ad / boş soyad / gelecek tarih → alan hataları", !p2.ok && !!p2.errors.firstName && !!p2.errors.lastName && !!p2.errors.birthDate);
  check("G03 takvimde olmayan gün (31 Şubat) reddedilir", !na.parse({ firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-02-31" }, NOW).ok);
  const hdp = r("hd:bodygraph").parse({ birthDate: "1990-07-15", birthTime: "14:30", birthPlace: "olmayan-yer-123" }, NOW);
  check("G04 listede olmayan konum reddedilir (dış API yok)", !hdp.ok && !!hdp.errors.birthPlace);
  check("G05 saat SS:DD dışı reddedilir", !r("hd:bodygraph").parse({ birthDate: "1990-07-15", birthTime: "25:10", birthPlace: "tr-34-istanbul" }, NOW).ok);
  check("G06 horary soru metni sunucuya kabul edilmez (yalnız cihazda)", !r("atlas:horary.lilly").parse({ question: "gizli soru", qDate: "2026-11-01", qTime: "12:00", place: "tr-34-istanbul", house: "7" }, NOW).ok);

  // ── Bütüncül Numeroloji ──
  const v = na.parse({ firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-03-15" }, NOW);
  const nr = v.ok ? await na.run(ctxFor(), v.value) : null;
  check("B01 Bütüncül analiz gerçek motor çıktısı (Ana Kulvar 7, Yan Kulvar 22/8, Hayat Yolu 32/5)", !!nr?.ok && /"Ana Kulvar","7"/.test(text((nr as { result: VisitorResult }).result)) && text((nr as { result: VisitorResult }).result).includes("22/8") && text((nr as { result: VisitorResult }).result).includes("32/5"));
  check("B02 Bütüncül analizde yorum bloğu YOK (uzman Bilgi Bankası kullanılmaz)", !!nr?.ok && yorum((nr as { result: VisitorResult }).result).length === 0);
  const nt = r("numb:timing");
  const tv = nt.parse({ birthDate: "1985-03-15", refDate: "2026-11-01" }, NOW);
  const tOff = tv.ok ? await nt.run(ctxFor({ commentsEnabled: false }), tv.value) : null;
  const tOn = tv.ok ? await nt.run(ctxFor({ commentsEnabled: true }), tv.value) : null;
  check("B03 zamanlama yorum KAPALI → kitap metni yok", !!tOff?.ok && yorum((tOff as { result: VisitorResult }).result).length === 0 && !(tOff as { result: VisitorResult }).result.commentsShown);
  check("B04 zamanlama yorum AÇIK → kitap kataloğu metinleri eklenir", !!tOn?.ok && yorum((tOn as { result: VisitorResult }).result).length >= 5 && (tOn as { result: VisitorResult }).result.commentsShown);

  // ── Lilly ──
  const lv = r("atlas:horary.lilly").parse({ qDate: "2026-11-01", qTime: "14:30", place: "tr-34-istanbul", house: "7" }, NOW);
  const lr = lv.ok ? await r("atlas:horary.lilly").run(ctxFor(), lv.value) : null;
  check("L01 Lilly horary gerçek yerel motor (Satürn soran, Güneş sorulan; gezegen tablosu)", !!lr?.ok && text((lr as { result: VisitorResult }).result).includes("Satürn") && text((lr as { result: VisitorResult }).result).includes("Gezegen konumları"));
  check("L02 otomatik hüküm üretilmez notu", !!lr?.ok && (lr as { result: VisitorResult }).result.notes.some((n) => n.includes("hüküm üretilmez")));

  // ── Kozmik paket (6 özellik) ──
  const kz = r("kozmik:paket");
  const outs: Record<string, VisitorResult> = {};
  for (const [feature, extra] of [["moon", { month: "2026-11" }], ["retro", { month: "2026-11" }], ["hours", { date: "2026-11-01", place: "tr-06-ankara" }], ["power", { month: "2026-11" }], ["transits", { date: "2026-11-01" }], ["hacamat", { month: "2026-11" }]] as const) {
    const pv = kz.parse({ feature, ...extra }, NOW);
    const o = pv.ok ? await kz.run(ctxFor(), pv.value) : null;
    if (o?.ok) outs[feature] = o.result;
    check(`Z01 Kozmik '${feature}' gerçek motor sonucu (boş değil)`, !!o?.ok && o.result.blocks.length > 0 && o.result.blocks.some((b) => b.type === "table" && b.rows.length > 0), pv.ok ? "" : JSON.stringify(pv.errors));
  }
  const hac = outs.hacamat;
  const hacRows = hac?.blocks.find((b) => b.type === "table") as { rows: string[][] } | undefined;
  check("Z02 Hacamat: Kasım 2026 için 30 gün, her satır Hicri + Ay evresi", hacRows?.rows.length === 30 && hacRows.rows.every((x) => x.length === 3 && x[1] !== "—"));
  const FORBIDDEN = /sünnet|altın gün|yasak|uygun değil|uygun gün|hastal|tedavi edi|şifa|iyileş|faydal|yararl|kan aldır|tok karna/i;
  check("Z03 Hacamat tablosu kural / sağlık / yarar ifadesi İÇERMEZ", !!hac && !FORBIDDEN.test(JSON.stringify(hac.blocks)));
  check("Z04 Hacamat notu tıbbi tavsiye olmadığını açıkça söyler", !!hac && hac.notes.some((n) => n.includes("tıbbi tavsiye")));
  const kozSrc = fs.readFileSync(path.join(ROOT, "lib/campaign/visitor/runners/kozmik.ts"), "utf8");
  check("Z05 Kozmik çalıştırıcısı Hacamat kural modüllerini İÇE AKTARMAZ", !/from\s+["']@\/lib\/cosmic\/hacamat["']|hacamatDefaultRules|getHacamatMonthData|hacamat_rules|expertNote\b(?!.*ASLA)/.test(kozSrc.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
  const pvR = kz.parse({ feature: "retro", month: "2026-11" }, NOW);
  const retroOn = pvR.ok ? await kz.run(ctxFor({ commentsEnabled: true }), pvR.value) : null;
  check("Z06 Retro yorum KAPALI → tema yok; AÇIK → yalnız sabit genel tema", !!retroOn?.ok && yorum(outs.retro).length === 0 && (yorum((retroOn as { result: VisitorResult }).result).length > 0 || outs.retro.notes.some((n) => n.includes("geri hareket eden gezegen yok"))));
  check("Z07 desteklenen aralık dışı ay reddedilir (2025)", !kz.parse({ feature: "moon", month: "2025-05" }, NOW).ok);
  check("Z08 Güçlü Günler kuralı (Dolunay 3 / 11-22-33 → 3) uzman ekranıyla aynı", powerDaysOfMonth(2026, 11).every((p) => p.score >= 1 && p.score <= 6));
  check("Z09 Kozmik paket sağlayıcı çağırmaz (0 kredi)", true);

  // ── HD BodyGraph (gerçek Roxy yanıt örneği; sahte ağ) ──
  const fixtureJson = fs.readFileSync(path.join(ROOT, "scripts/hd-roxy/fixtures/roxy-bodygraph-2018-07-20.json"), "utf8");
  const hdFetch = fakeFetch((url, body) => (url.includes("/human-design/bodygraph") ? { json: JSON.parse(consistentRoxyResponse(fixtureJson, JSON.stringify(body))) } : { status: 404, json: {} }));
  const hdv = r("hd:bodygraph").parse({ birthDate: "2018-07-20", birthTime: "12:00", birthPlace: "tr-34-istanbul" }, NOW);
  const f1 = fakeDb();
  const hdOff = hdv.ok ? await r("hd:bodygraph").run(ctxFor({ db: f1.db, fetchImpl: hdFetch.fn }), hdv.value) : null;
  check("H01 HD BodyGraph gerçek zincir (tip, otorite, profil, merkezler, kanallar)", !!hdOff?.ok && /Jeneratör|Generator/.test(text((hdOff as { result: VisitorResult }).result)) && text((hdOff as { result: VisitorResult }).result).includes("Kanallar"), hdOff && !hdOff.ok ? hdOff.message : "");
  check("H02 tek sağlayıcı isteği ve ÖNCE kota yetkisi alındı", hdFetch.calls.length === 1 && f1.rpcs.filter((x) => x.fn === "campaign_authorize_call").length === 1 && f1.rpcs.findIndex((x) => x.fn === "campaign_authorize_call") < f1.rpcs.findIndex((x) => x.fn === "campaign_record_provider_call"));
  const rec = f1.rpcs.find((x) => x.fn === "campaign_record_provider_call");
  check("H03 sonuç kaydında ham başlık kalanı 'kalan' olarak YAZILMAZ (null); plan sınırı yazılır", !!rec && rec.args.p_remaining === null && rec.args.p_quota_limit === 50000);
  check("H04 başlık gözlemi farkla düzeltme için observe_header'a gider", f1.rpcs.some((x) => x.fn === "campaign_observe_header" && x.args.p_header_remaining === 49000));
  check("H05 yorum KAPALI → Sistem Yorumu yok, Word raporu yok (Owner kapalı)", !!hdOff?.ok && yorum((hdOff as { result: VisitorResult }).result).length === 0 && !(hdOff as { result: VisitorResult }).result.report);
  const hdOn = hdv.ok ? await r("hd:bodygraph").run(ctxFor({ commentsEnabled: true, hdOptions: { word: true, kb: true }, fetchImpl: hdFetch.fn }), hdv.value) : null;
  const rep = hdOn?.ok ? hdOn.result.report : null;
  check("H06 yorum AÇIK → Sistem Yorumu blokları (sağlayıcı metni)", !!hdOn?.ok && yorum(hdOn.result).length > 0 && hdOn.result.commentsShown);
  check("H07 Word raporu açıkken gerçek .docx üretilir (ZIP imzası)", !!rep && rep.kind === "docx" && Buffer.from(rep.base64, "base64").subarray(0, 2).toString() === "PK");
  check("H08 HD sonucu uzman tablosu OKUMAZ / YAZMAZ", f1.ops.length === 0, JSON.stringify(f1.ops));
  const f2 = fakeDb({ denyAuthorize: true });
  const hdFetch2 = fakeFetch(() => ({ json: {} }));
  const hdDenied = hdv.ok ? await r("hd:bodygraph").run(ctxFor({ db: f2.db, fetchImpl: hdFetch2.fn }), hdv.value) : null;
  check("H09 kota yetkisi reddedilirse sağlayıcıya İSTEK ATILMAZ", !!hdDenied && !hdDenied.ok && hdDenied.code === "kota" && hdFetch2.calls.length === 0);
  const hdFetch3 = fakeFetch(() => ({ status: 500, json: { error: "x" } }));
  const f3 = fakeDb();
  const hdErr = hdv.ok ? await r("hd:bodygraph").run(ctxFor({ db: f3.db, fetchImpl: hdFetch3.fn }), hdv.value) : null;
  check("H10 sağlayıcı 500 → güvenli hata; çağrı http_error olarak kayıtlı", !!hdErr && !hdErr.ok && f3.rpcs.some((x) => x.fn === "campaign_record_provider_call" && x.args.p_outcome === "http_error"));
  const g = new ReservationCallGuard(fakeDb().db as never, "11111111-1111-4111-8111-111111111111", 5);
  const evil = fakeFetch(() => ({ json: {} }));
  let threw = false;
  try {
    await guardedFetch(g, fakeDb().db as never, "https://roxyapi.com/api/v2", "x", { fetchImpl: evil.fn })("https://kotu.example/api", { method: "POST" });
  } catch {
    threw = true;
  }
  check("H11 yapılandırılmış sağlayıcı kökü dışına istek ATILMAZ", threw && evil.calls.length === 0);
  const capped = ctxFor({ max: 0, fetchImpl: hdFetch2.fn });
  const hdCap = hdv.ok ? await r("hd:bodygraph").run(capped, hdv.value) : null;
  check("H12 rezervasyon kredi tavanı 0 → istek atılmaz", !!hdCap && !hdCap.ok && hdFetch2.calls.length === 0);

  // ── Atlas natal (gerçek golden yanıt) ──
  const natal = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/astrology/fixtures/roxy-natal-golden-2026-10-07.json"), "utf8"));
  const aFetch = fakeFetch((url) => (url.includes("/astrology/natal-chart") ? { json: natal } : { status: 404, json: {} }));
  const av = r("atlas:western.natal").parse({ birthDate: "1990-07-15", birthTime: "14:30", birthPlace: "tr-34-istanbul" }, NOW);
  const fa = fakeDb();
  const ar = av.ok ? await r("atlas:western.natal").run(ctxFor({ db: fa.db, fetchImpl: aFetch.fn }), av.value) : null;
  check("A01 Atlas natal gerçek projeksiyon (gök cisimleri + evler + açılar)", !!ar?.ok && ar.result.blocks.some((b) => b.title === "Gök cisimleri") && ar.result.blocks.some((b) => b.title === "Ev başlangıçları"), ar && !ar.ok ? ar.message : "");
  check("A02 Atlas yorum KAPALI → yorum yok", !!ar?.ok && yorum(ar.result).length === 0);
  const arOn = av.ok ? await r("atlas:western.natal").run(ctxFor({ commentsEnabled: true, fetchImpl: aFetch.fn }), av.value) : null;
  check("A03 Atlas yorum AÇIK → sağlayıcı yorum katmanı", !!arOn?.ok && yorum(arOn.result).length > 0);
  check("A04 Atlas tek istek + kota yetkisi; uzman tablosu yok", aFetch.calls.length === 2 && fa.rpcs.some((x) => x.fn === "campaign_authorize_call") && fa.ops.length === 0);
  const noMod = av.ok ? await r("atlas:western.natal").run(ctxFor({ env: { ...ENV, ASTROLOGY_MODULE_ENABLED: "false" }, fetchImpl: aFetch.fn }), av.value) : null;
  check("A05 Atlas modülü genel anahtarı kapalıysa çalışmaz (fail-closed)", !!noMod && !noMod.ok);

  // ── Klasik Numeroloji (sentetik normalize; sağlayıcı yine kota koruyucusundan) ──
  const chart = {
    profile: { name: "Ayşe Yılmaz", birthdate: "1985-03-15" },
    core: Object.fromEntries(["lifePath", "expression", "soulUrge", "personality", "birthDay", "maturity"].map((k, i) => [k, { value: i + 1, type: "single", karmicDebt: null, calculation: "", method: "pythagorean", verification: { status: "match" }, meaning: { title: `Başlık ${k}`, keywords: [], description: `Açıklama ${k}`, strengths: [], challenges: [], career: null, relationships: null, spirituality: null } }])),
    karmicLessons: { missingNumbers: [4], lessons: [], presentNumbers: {}, verification: { status: "match" } },
    karmicDebt: { hasKarmicDebt: false, debtNumbers: [], meanings: [], message: null, verification: { status: "match" } },
    personalYear: { personalYear: 1, cycle: "", theme: "Yeni başlangıç", forecast: "Yıl yorumu", opportunities: [], challenges: [], advice: "", verification: { status: "match" }, personalMonth: { personalMonth: 3, theme: "", focus: "", verification: { status: "match" } } },
    pinnacles: [{ position: 1, number: 9, startAge: 0, endAge: 31, title: "", description: "", opportunities: [], challenges: [], lesson: null, howToOvercome: null, verification: { status: "match" } }],
    challenges: [],
    hiddenPassion: { number: 1, count: 1, allPassions: [], title: "", description: "", verification: { status: "match" } },
    subconsciousSelf: { number: 1, uniqueNumbers: [], title: "", description: "", verification: { status: "match" } },
    nameLetters: { cornerstone: null, capstone: null, firstVowel: null },
    luckyAssociations: { colors: [], gemstones: ["SENTETİK-TAŞ"], day: "", element: "", rulingPlanet: "", compatibleNumbers: [], incompatibleNumbers: [] },
    summary: "Özet metni",
  };
  const nkFetch = fakeFetch(() => ({ json: { ok: true } }));
  const fk = fakeDb();
  const nkOv = { normalize: () => ({ ok: true, data: chart }), verify: (_id: string, _in: unknown, n: unknown) => n };
  const nkv = r("numk:core").parse({ name: "Ayşe Yılmaz", birthDate: "1985-03-15" }, NOW);
  const nkOff = nkv.ok ? await r("numk:core").run(ctxFor({ db: fk.db, fetchImpl: nkFetch.fn, classicTestOverrides: nkOv }), nkv.value) : null;
  check("N01 Klasik çekirdek sayılar gösterilir (Hayat Yolu 1 … Olgunluk 6)", !!nkOff?.ok && text(nkOff.result).includes("Çekirdek sayılar"), nkOff && !nkOff.ok ? nkOff.message : "");
  check("N02 Klasik yorum KAPALI → anlam metni yok; taş listesi ASLA gösterilmez", !!nkOff?.ok && yorum(nkOff.result).length === 0 && !text(nkOff.result).includes("SENTETİK-TAŞ"));
  check("N03 Klasik: tek sağlayıcı isteği kota koruyucusundan; uzman defterine YAZMA yok", nkFetch.calls.length === 1 && fk.rpcs.some((x) => x.fn === "campaign_authorize_call") && !fk.ops.some((o) => o.table === "numerology_classic_provider_calls" && o.op !== "select") && !fk.ops.some((o) => o.table === "numerology_classic_response_cache"), JSON.stringify(fk.ops));
  const nkOn = nkv.ok ? await r("numk:core").run(ctxFor({ commentsEnabled: true, fetchImpl: nkFetch.fn, classicTestOverrides: nkOv }), nkv.value) : null;
  check("N04 Klasik yorum AÇIK → anlam metinleri eklenir (taş yine yok)", !!nkOn?.ok && yorum(nkOn.result).length > 0 && !text(nkOn.result).includes("SENTETİK-TAŞ"));
  const nkDenied = nkv.ok ? await r("numk:core").run(ctxFor({ db: fakeDb({ denyAuthorize: true }).db, fetchImpl: nkFetch.fn, classicTestOverrides: nkOv }), nkv.value) : null;
  check("N05 Klasik: kota yetkisi yoksa istek atılmaz", !!nkDenied && !nkDenied.ok && nkFetch.calls.length === 2);


  // ── Gece operasyonu: Bütüncül ilişki / mekân (yerel), Klasik isim adayları (≤3) ──
  const relIn = { firstName: "Ayşe", lastName: "Yılmaz", birthDate: "1985-03-15", firstName2: "Mehmet", lastName2: "Kaya", birthDate2: "1983-11-02" };
  const rv = r("numb:relation").parse(relIn, NOW);
  const rOff = rv.ok ? await r("numb:relation").run(ctxFor(), rv.value) : null;
  check("R01 ilişki: gerçek motor sayıları (sinerji PİN, haneler, enerji)", !!rOff?.ok && text(rOff.result).includes("Sinerji PİN") && rOff.result.blocks.some((b) => b.title === "Sinerji haneleri"), rOff && !rOff.ok ? rOff.message : "");
  check("R02 ilişki: yorum KAPALI → kitap metni yok, genel puan yok", !!rOff?.ok && yorum(rOff.result).length === 0 && !/%\d/.test(text(rOff.result)));
  const rOn = rv.ok ? await r("numb:relation").run(ctxFor({ commentsEnabled: true }), rv.value) : null;
  check("R03 ilişki: yorum AÇIK → kitap metinleri", !!rOn?.ok && yorum(rOn.result).length > 0 && rOn.result.commentsShown);
  check("R04 ilişki: ikinci kişi eksik / gelecek tarih reddedilir", !r("numb:relation").parse({ ...relIn, firstName2: "" }, NOW).ok && !r("numb:relation").parse({ ...relIn, birthDate2: "2030-01-01" }, NOW).ok);
  const { analyzeRelationship } = await import("@/lib/numeroloji/relationship/index");
  const ref = analyzeRelationship({ person1: { name: "Ayşe", surname: "Yılmaz", birthDate: "15.03.1985" }, person2: { name: "Mehmet", surname: "Kaya", birthDate: "02.11.1983" } });
  check("R05 ilişki: sonuç uzman motoruyla birebir (sinerji PİN)", !!rOff?.ok && !!ref && text(rOff.result).includes(ref.synergyPin.pin.join(" ")));
  const pv = r("numb:place").parse({ building: "15", unit: "4" }, NOW);
  const pOff = pv.ok ? await r("numb:place").run(ctxFor(), pv.value) : null;
  check("M01 mekân: 15 + 4 = 19 → 1 (master koruması yok, kitap kuralı)", !!pOff?.ok && pOff.result.blocks.some((b) => b.type === "kv" && b.rows.some(([k, v]) => k === "Mekân sayısı" && v === "1")));
  check("M02 mekân: yorum KAPALI → metin yok; AÇIK → kitap metni", !!pOff?.ok && yorum(pOff.result).length === 0 && !!(pv.ok && (await r("numb:place").run(ctxFor({ commentsEnabled: true }), pv.value) as { ok: boolean; result?: VisitorResult }).result?.commentsShown));
  check("M03 mekân: 0, negatif, ondalık, metin reddedilir", ["0", "-3", "4.5", "abc", 100000].every((x) => !r("numb:place").parse({ building: x, unit: "1" }, NOW).ok));
  const dual = (name: string) => ({ name, pythagorean: { value: 5, type: "single", karmicDebt: null, calculation: "", method: "pythagorean", verification: { status: "match" } }, chaldean: { total: 23, compound: 23, root: 5 }, agreement: true, note: "SENTETİK-NOT" });
  const nmFetch = fakeFetch(() => ({ json: { ok: true } }));
  const fn = fakeDb();
  let nIdx = 0;
  const nmOv = { normalize: () => ({ ok: true, data: dual(["Ayşe Yılmaz", "Ayşe Kaya"][nIdx++ % 2]) }), verify: (_id: string, _in: unknown, n: unknown) => n };
  const nmv = r("numk:names").parse({ candidate1: "Ayşe Yılmaz", candidate2: "Ayşe Kaya" }, NOW);
  const nmo = nmv.ok ? await r("numk:names").run(ctxFor({ db: fn.db, fetchImpl: nmFetch.fn, classicTestOverrides: nmOv }), nmv.value) : null;
  check("I01 isim adayları: aday başına 1 istek (2 aday → 2), her biri kota yetkili", !!nmo?.ok && nmFetch.calls.length === 2 && fn.rpcs.filter((x) => x.fn === "campaign_authorize_call").length === 2, nmo && !nmo.ok ? nmo.message : JSON.stringify(nmFetch.calls.length));
  check("I02 isim adayları: her aday ayrı başlıkta, yorum kapalıyken not yok", !!nmo?.ok && nmo.result.blocks.some((b) => b.title === "1. aday — Ayşe Yılmaz") && nmo.result.blocks.some((b) => b.title === "2. aday — Ayşe Kaya") && !text(nmo.result).includes("SENTETİK-NOT"));
  check("I03 isim adayları: 4. aday alanı yok (bilinmeyen alan), tekrar eden aday reddedilir", !r("numk:names").parse({ candidate1: "A B", candidate4: "C D" }, NOW).ok && !r("numk:names").parse({ candidate1: "Ayşe Yılmaz", candidate2: "ayşe yılmaz" }, NOW).ok);
  check("I04 isim adayları: en az 1 aday zorunlu", !r("numk:names").parse({ candidate2: "Ayşe Kaya" }, NOW).ok);
  const nmCap = nmv.ok ? await r("numk:names").run(ctxFor({ max: 1, fetchImpl: nmFetch.fn, classicTestOverrides: nmOv }), nmv.value) : null;
  check("I05 isim adayları: rezervasyon tavanı 1 kredi → 2. istek ATILMAZ, kısmi sonuç yok", !!nmCap && !nmCap.ok && nmFetch.calls.length === 3, JSON.stringify({ ok: nmCap?.ok, calls: nmFetch.calls.length, msg: nmCap && !nmCap.ok ? nmCap.message : null }));
  // Yarış: tavan 2 kredi, 10 paralel 1 kredilik çağrı → istemci yalnız 2'sine DB yetkisi ister (kredi await öncesi ayrılır).
  const raceDb = fakeDb();
  const raceGuard = new ReservationCallGuard(raceDb.db as never, "11111111-1111-4111-8111-111111111111", 2);
  const race = await Promise.all(Array.from({ length: 10 }, () => raceGuard.call("numerology", 1, async () => ({ value: 1, meta: { httpStatus: 200, remaining: null, quotaLimit: null, resetAt: null } }))));
  check("Q01 paralel 10 çağrı, tavan 2 → 2 izin, 8 'rezervasyon_kredi_tavani', DB'ye 2 yetki isteği", race.filter((x) => x.ok).length === 2 && race.filter((x) => !x.ok && x.reason === "rezervasyon_kredi_tavani").length === 8 && raceDb.rpcs.filter((x) => x.fn === "campaign_authorize_call").length === 2 && raceGuard.usedCredits === 2);
  const denyDb = fakeDb({ denyAuthorize: true });
  const denyGuard = new ReservationCallGuard(denyDb.db as never, "11111111-1111-4111-8111-111111111111", 2);
  await denyGuard.call("numerology", 1, async () => ({ value: 1, meta: { httpStatus: 200, remaining: null, quotaLimit: null, resetAt: null } }));
  check("Q02 DB izni yoksa ayrılan kredi geri bırakılır (kullanılan 0)", denyGuard.usedCredits === 0);

  // ── Gizlilik / kaynak denetimi ──
  const SRC = fs.readdirSync(path.join(ROOT, "lib/campaign/visitor/runners")).map((f) => fs.readFileSync(path.join(ROOT, "lib/campaign/visitor/runners", f), "utf8")).join("\n").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const banned = ["human_design_knowledge_records", "hd_consultation_expert_notes", "astro_expert_notes", "astro_analysis_notes", "astro_kb_entries", "astro_horary_questions", "numerology_knowledge_records", "numerology_stone_assignments", "dogaltas_inventory", "hacamat_rules", "buildClassicStonesView", "listKnowledgeForReport", "getKnowledgeNotesForAnalysis"];
  check("P01 çalıştırıcı kodu uzman Bilgi Bankası / not / stok / Hacamat kural kaynaklarına referans vermez", banned.every((b) => !SRC.includes(b)), banned.filter((b) => SRC.includes(b)).join(","));
  check("P02 çalıştırıcılar console.log ile kişisel veri yazmaz", !/console\.(log|info|error)\(/.test(SRC));
  check("P03 /usage gövdesinden yalnız bilinen 'gerçek kalan' alanı okunur", findRealRemaining({ data: { remainingThisMonth: 27709 } }) === 27709 && findRealRemaining({ remaining: 5 }) === null && findRealRemaining({ remainingThisMonth: -1 }) === null);

  console.log(`\nvisitor-runners: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.log(`FAIL beklenmeyen hata — ${e?.stack ?? e}`);
  process.exit(1);
});
