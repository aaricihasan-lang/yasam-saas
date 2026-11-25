/**
 * I18N-F1-R5 / A6 — HD dil başına anlatı deposu: bayrak, önbellek anahtarı, ücretli çağrı sayısı, harita değişmezliği.
 *
 * GERÇEK Roxy'ye ÇAĞRI YAPMAZ (sayaçlı sahte sağlayıcı), gerçek DB'ye BAĞLANMAZ (scripts/hd-roxy/fakeDb). Ağ yok, sır yok.
 * Çalıştırma: npx tsx scripts/hd-i18n/narrative.harness.ts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFakeDb } from "../hd-roxy/fakeDb";
import { validateRoxyBodygraph } from "../../lib/human-design/providers/roxy/schema";
import { normalizeRoxyBodygraph, type RoxyNormalizeInput } from "../../lib/human-design/providers/roxy/normalize";
import { extractSystemReading } from "../../lib/human-design/providers/roxy/systemReading";
import { getChartSystemReading, type SystemReadingNarrativeReader } from "../../lib/human-design/api/systemReadingService";
import { HD_NARRATIVE_TABLE, HD_NARRATIVE_VERSION, isHdNarrativeI18nEnabled } from "../../lib/human-design/narrative/narrativeConfig";
import { compareCanonical, hdCanonicalSha, hdNarrativeCacheKey } from "../../lib/human-design/narrative/narrativeConsistency";
import { generateChartNarrative, readChartNarrative, type HdNarrativeDeps } from "../../lib/human-design/narrative/narrativeService";
import type { RoxyBodygraphRequest } from "../../lib/human-design/providers/roxy/client";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const FIXTURE_TXT = readFileSync(join(ROOT, "scripts", "hd-roxy", "fixtures", "roxy-bodygraph-2018-07-20.json"), "utf8");
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const FIXTURE = JSON.parse(FIXTURE_TXT) as Record<string, unknown>;

let pass = 0;
let failN = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, detail?: unknown): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failN++;
    fails.push(name);
    console.log(`  ✗ ${name}${detail === undefined ? "" : ` — ${JSON.stringify(detail).slice(0, 300)}`}`);
  }
}

const NORM: RoxyNormalizeInput = {
  date: "2018-07-20",
  time: "19:00:00",
  timezone: "Europe/Istanbul",
  latitude: 37.871399,
  longitude: 32.484699,
  nodeType: "true",
  lang: "tr",
  birthUtcIso: "2018-07-20T16:00:00.000Z",
};
const v0 = validateRoxyBodygraph(FIXTURE);
if (!v0.ok) throw new Error("fixture invalid");
const n0 = normalizeRoxyBodygraph(v0.value, NORM);
if (!n0.ok) throw new Error("fixture normalize failed");
const STORED_CHART = n0.chart;

/** Sentetik "EN" yanıt: kanonik alanlar aynı, yalnız açıklama metinleri İngilizce işaretli. */
/** ROXY ajanının gerçek EN yanıtıyla tekrar: HD_NARRATIVE_EN_RAW=<aynı sentetik girdinin ?lang=en ham yanıtı (JSON)>. */
// ROXY ajanı ham kaydı {endpoint, lang, body, response} biçimindeyse yanıt gövdesi alınır (R5 B2).
const REAL_EN_FILE = process.env.HD_NARRATIVE_EN_RAW ? (JSON.parse(readFileSync(process.env.HD_NARRATIVE_EN_RAW, "utf8")) as Record<string, unknown>) : null;
const REAL_EN = REAL_EN_FILE && "response" in REAL_EN_FILE && typeof REAL_EN_FILE.response === "object" ? (REAL_EN_FILE.response as Record<string, unknown>) : REAL_EN_FILE;
function enRaw(): Record<string, unknown> {
  if (REAL_EN) return clone(REAL_EN);
  const r = clone(FIXTURE);
  for (const k of ["typeDescription", "strategyDescription", "authorityDescription", "profileDescription", "definitionDescription"]) {
    if (typeof r[k] === "string") r[k] = `EN-TEXT ${k}`;
  }
  return r;
}
/** Kanonik olarak FARKLI yanıt: bir aktivasyonun çizgisi değişir. */
function mismatchRaw(): Record<string, unknown> {
  const r = enRaw();
  const gates = r.gates as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(gates) && gates.length > 0) {
    const g = gates[0];
    g.line = (Number(g.line) % 6) + 1;
  }
  return r;
}

const T_A = "11111111-1111-4111-8111-111111111111";
const T_B = "22222222-2222-4222-8222-222222222222";
const U_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHART = "d0000000-0000-4000-8000-0000000000a1";
const MANUAL = "d0000000-0000-4000-8000-0000000000a2";

function chartRow(): Record<string, unknown> {
  return {
    id: CHART,
    tenant_id: T_A,
    source: "computed",
    provider: "roxyapi",
    input: { date: NORM.date, time: NORM.time, timezone: NORM.timezone, latitude: NORM.latitude, longitude: NORM.longitude, nodeType: "true", lang: "tr" },
    input_hash: "f".repeat(64),
    computed_result: clone(STORED_CHART),
    provider_raw: clone(FIXTURE),
  };
}

function setup(opts: { missingTable?: boolean } = {}) {
  const fake = createFakeDb({
    human_design_charts: [chartRow(), { id: MANUAL, tenant_id: T_A, source: "manual", provider: null, input: null, input_hash: null, computed_result: null, provider_raw: null }],
  });
  const db = {
    from(t: string) {
      if (opts.missingTable && t === HD_NARRATIVE_TABLE) {
        const err = { data: null, error: { code: "42P01", message: `relation "public.${HD_NARRATIVE_TABLE}" does not exist` } };
        const b: Record<string, unknown> = {};
        for (const m of ["select", "insert", "eq", "limit", "maybeSingle", "single"]) b[m] = () => b;
        b.then = (res: (v: unknown) => unknown) => Promise.resolve(err).then(res);
        return b;
      }
      return (fake.db as unknown as { from(t: string): unknown }).from(t);
    },
  } as unknown as SupabaseClient;
  return { db, fake };
}

function deps(over: { raw?: () => unknown; enabled?: boolean; denyScope?: string } = {}) {
  const calls: Array<{ body: RoxyBodygraphRequest; lang: string }> = [];
  const counters = new Map<string, number>();
  const d: HdNarrativeDeps = {
    enabled: over.enabled ?? true,
    config: { apiKey: "test-key-not-real", baseUrl: "https://roxyapi.com/api/v2" },
    callRoxy: async (_c, body, o) => {
      calls.push({ body, lang: o.lang });
      return { ok: true, raw: over.raw ? over.raw() : enRaw() };
    },
    rateLimit: async (scope, value, limit) => {
      const k = `${scope}:${value}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      if (over.denyScope === scope) return { allowed: false, retryAfterSec: 30 };
      return { allowed: n <= limit || !scope.endsWith("inflight"), retryAfterSec: 0 };
    },
  };
  return { d, calls, counters };
}

const ctxFor = (db: SupabaseClient, tenantId = T_A, isDemo = false) => ({ db, tenantId, userId: U_A, isDemo });
const chartsSnapshot = (fake: ReturnType<typeof createFakeDb>) => JSON.stringify(fake.tables.human_design_charts);
const narrRows = (fake: ReturnType<typeof createFakeDb>) => fake.tables[HD_NARRATIVE_TABLE] ?? [];

async function main() {
  console.log("\n[F] Özellik bayrağı — varsayılan KAPALI = bugünkü davranış");
  ok("F0 bayrak: yok / 'true' / '1' / 'ON' kapalı; yalnız 'on' açık",
    !isHdNarrativeI18nEnabled({} as unknown as NodeJS.ProcessEnv) && !isHdNarrativeI18nEnabled({ HD_NARRATIVE_I18N: "true" } as unknown as NodeJS.ProcessEnv) &&
    !isHdNarrativeI18nEnabled({ HD_NARRATIVE_I18N: "1" } as unknown as NodeJS.ProcessEnv) && !isHdNarrativeI18nEnabled({ HD_NARRATIVE_I18N: "ON" } as unknown as NodeJS.ProcessEnv) &&
    isHdNarrativeI18nEnabled({ HD_NARRATIVE_I18N: "on" } as unknown as NodeJS.ProcessEnv));
  {
    const { db, fake } = setup();
    const { d, calls } = deps({ enabled: false });
    const r = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    ok("F1 bayrak kapalı: üretim 404 FEATURE_DISABLED, 0 çağrı, 0 DB işlemi", r.status === 404 && !r.body.ok && r.body.code === "FEATURE_DISABLED" && calls.length === 0 && fake.log.length === 0, r);
    const rr = await readChartNarrative(db, T_A, CHART, "en", { enabled: false });
    ok("F2 bayrak kapalı: okuma 'disabled', 0 DB işlemi", rr.kind === "none" && rr.reason === "disabled" && fake.log.length === 0, rr);
  }
  {
    const { db, fake } = setup();
    const base = await getChartSystemReading(db, T_A, CHART);
    const tr = extractSystemReading(FIXTURE);
    ok("F3 sistem yorumu (opts yok) = bugünkü çıktı birebir (narrative alanı yok)",
      base.status === 200 && base.body.ok && "available" in base.body && base.body.available === true &&
      JSON.stringify(base.body.data) === JSON.stringify(tr) && !("narrative" in base.body), base.body);
    let readerCalls = 0;
    const reader: SystemReadingNarrativeReader = async () => { readerCalls++; return { kind: "none" }; };
    const withTr = await getChartSystemReading(db, T_A, CHART, { lang: "tr", narrative: reader });
    ok("F4 lang=tr + okuyucu: okuyucu ÇAĞRILMAZ, çıktı birebir aynı", readerCalls === 0 && JSON.stringify(withTr) === JSON.stringify(base));
    const noReader = await getChartSystemReading(db, T_A, CHART, { lang: "en" });
    ok("F5 lang=en ama okuyucu yok (bayrak kapalı bağlama): çıktı birebir aynı", JSON.stringify(noReader) === JSON.stringify(base));
    ok("F6 sistem yorumu okuması harita satırına yazmaz (yalnız select)", fake.log.every((l) => l.op === "select"), fake.log.map((l) => l.op));
  }

  console.log("\n[K] Önbellek anahtarı: dil + sağlayıcı + sürüm");
  {
    const k = { tenantId: T_A, chartId: CHART, chartInputHash: "f".repeat(64), nodeType: "true", lang: "en", birthUtcIso: NORM.birthUtcIso };
    const kEn = hdNarrativeCacheKey(k);
    ok("K1 anahtar 64 hex", /^[0-9a-f]{64}$/.test(kEn));
    ok("K2 dil değişince anahtar değişir", kEn !== hdNarrativeCacheKey({ ...k, lang: "tr" }) && kEn !== hdNarrativeCacheKey({ ...k, lang: "de" }));
    ok("K3 tenant / harita / input_hash / UTC an / düğüm değişince anahtar değişir",
      [{ tenantId: T_B }, { chartId: MANUAL }, { chartInputHash: "e".repeat(64) }, { birthUtcIso: "2018-07-20T16:01:00.000Z" }, { nodeType: "mean" }]
        .every((o) => hdNarrativeCacheKey({ ...k, ...o }) !== kEn));
    const src = readFileSync(join(ROOT, "lib", "human-design", "narrative", "narrativeConsistency.ts"), "utf8");
    ok("K4 anahtar sürüm + sağlayıcı + uç + adaptör içerir (kaynak)", /HD_NARRATIVE_VERSION,\s*ROXY_PROVIDER_ID,\s*ROXY_BODYGRAPH_ENDPOINT,\s*ROXY_ADAPTER_VERSION/.test(src) && HD_NARRATIVE_VERSION === "hd-narrative-1");
    ok("K5 kanonik özet dil-bağımsız: EN yanıt normalize özeti = kayıtlı TR özeti", (() => {
      const v = validateRoxyBodygraph(enRaw());
      if (!v.ok) return false;
      const n = normalizeRoxyBodygraph(v.value, { ...NORM, lang: "en" });
      return n.ok && hdCanonicalSha(n.chart) === hdCanonicalSha(STORED_CHART);
    })());
  }

  console.log("\n[G] Açık üretim — ücretli çağrı sayısı ve harita değişmezliği");
  {
    const { db, fake } = setup();
    const before = chartsSnapshot(fake);
    const { d, calls, counters } = deps();
    const r1 = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    ok("G1 ilk EN üretimi: 200, reused=false, TAM 1 ücretli çağrı, ?lang=en", r1.status === 200 && r1.body.ok && r1.body.reused === false && calls.length === 1 && calls[0].lang === "en", r1);
    ok("G1b istek = kayıtlı haritanın UTC anı (2018-07-20 16:00:00 UTC) + koordinat + düğüm",
      calls[0]?.body.date === "2018-07-20" && calls[0]?.body.time === "16:00:00" && calls[0]?.body.timezone === "UTC" &&
      calls[0]?.body.latitude === NORM.latitude && calls[0]?.body.longitude === NORM.longitude && calls[0]?.body.nodeType === "true", calls[0]?.body);
    ok("G1c anlatı tablosunda 1 satır, lang=en, sürüm + sağlayıcı + kanonik özet", narrRows(fake).length === 1 && narrRows(fake)[0].lang === "en" &&
      narrRows(fake)[0].narrative_version === HD_NARRATIVE_VERSION && narrRows(fake)[0].provider === "roxyapi" && narrRows(fake)[0].canonical_sha === hdCanonicalSha(STORED_CHART));
    ok("G1d human_design_charts BAYT-BAYT aynı (kimlik / input_hash / computed_result / provider_raw[TR])", chartsSnapshot(fake) === before);
    ok("G1e harita tablosuna yazım işlemi YOK", fake.log.filter((l) => l.table === "human_design_charts").every((l) => l.op === "select"));
    const quotaBefore = (counters.get(`hd-roxy-user:${U_A}`) ?? 0) + (counters.get(`hd-roxy-tenant:${T_A}`) ?? 0);
    const r2 = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    const r3 = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    const quotaAfter = (counters.get(`hd-roxy-user:${U_A}`) ?? 0) + (counters.get(`hd-roxy-tenant:${T_A}`) ?? 0);
    ok("G2 aynı dil tekrarı (×2): reused=true, ek ücretli çağrı 0, ek kota 0, ek satır 0",
      r2.body.ok && r2.body.reused === true && r3.body.ok && r3.body.reused === true && calls.length === 1 && quotaAfter === quotaBefore && narrRows(fake).length === 1, { r2, r3, calls: calls.length });
    const rTr = await generateChartNarrative(ctxFor(db), d, CHART, "tr");
    ok("G3 TR üretimi reddedilir (kaynak provider_raw): 400 NARRATIVE_SOURCE_LANG, 0 çağrı", rTr.status === 400 && !rTr.body.ok && rTr.body.code === "NARRATIVE_SOURCE_LANG" && calls.length === 1);
    const rDe = await generateChartNarrative(ctxFor(db), d, CHART, "de");
    ok("G4 desteklenmeyen dil (de) 400, 0 çağrı", rDe.status === 400 && !rDe.body.ok && rDe.body.code === "NARRATIVE_UNSUPPORTED_LANG" && calls.length === 1);
    const rB = await generateChartNarrative(ctxFor(db, T_B), d, CHART, "en");
    ok("G5 başka tenant aynı harita kimliği: 404, 0 çağrı (varlık sızmaz)", rB.status === 404 && calls.length === 1);
    const rDemo = await generateChartNarrative(ctxFor(db, T_A, true), d, CHART, "en");
    ok("G6 demo hesap 403 DEMO_READONLY, 0 çağrı", rDemo.status === 403 && calls.length === 1);
    const rMan = await generateChartNarrative(ctxFor(db), d, MANUAL, "en");
    ok("G7 manuel harita 422 CHART_NOT_ELIGIBLE, 0 çağrı", rMan.status === 422 && !rMan.body.ok && rMan.body.code === "CHART_NOT_ELIGIBLE" && calls.length === 1);
  }
  {
    const { db, fake } = setup();
    const before = chartsSnapshot(fake);
    const { d, calls } = deps({ raw: mismatchRaw });
    const r = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    ok("G8 kanonik olarak FARKLI sağlayıcı yanıtı (aktivasyon çizgisi): 502 (sözleşme/normalize ya da kanonik eşitlik), kaydedilmez, harita aynı",
      r.status === 502 && !r.body.ok && ["NARRATIVE_CANONICAL_MISMATCH", "PROVIDER_INVALID_RESPONSE"].includes(r.body.code) && calls.length === 1 && narrRows(fake).length === 0 && chartsSnapshot(fake) === before, r);
    const other = clone(STORED_CHART);
    other.activations[0] = { ...other.activations[0], line: (other.activations[0].line % 6) + 1 };
    other.appCodes = other.appCodes ? { ...other.appCodes, type_code: "projector" } : other.appCodes;
    const cmp = compareCanonical(STORED_CHART, other);
    ok("G8b kanonik karşılaştırma: farklı aktivasyon + tip kodu yakalanır (yalnız alan adı, değer yok)",
      !cmp.ok && cmp.fields.includes("acts") && cmp.fields.includes("type") && compareCanonical(STORED_CHART, clone(STORED_CHART)).ok, cmp);
  }
  {
    const { db } = setup({ missingTable: true });
    const { d, calls } = deps();
    const r = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    ok("G9 tablo yok (migration uygulanmamış): 503 NARRATIVE_STORE_MISSING, 0 çağrı", r.status === 503 && !r.body.ok && r.body.code === "NARRATIVE_STORE_MISSING" && calls.length === 0, r);
    const rr = await readChartNarrative(db, T_A, CHART, "en", { enabled: true });
    ok("G9b tablo yok: okuma 'missing_table' (TR'ye düşer)", rr.kind === "none" && rr.reason === "missing_table");
  }
  {
    const { db } = setup();
    const a = deps({ denyScope: "hd-roxy-narrative-inflight" });
    const r = await generateChartNarrative(ctxFor(db), a.d, CHART, "en");
    ok("G10 eşzamanlılık kilidi dolu: 409 IN_PROGRESS, 0 çağrı", r.status === 409 && !r.body.ok && r.body.code === "IN_PROGRESS" && a.calls.length === 0);
    const b = deps({ denyScope: "hd-roxy-tenant" });
    const r2 = await generateChartNarrative(ctxFor(db), b.d, CHART, "en");
    ok("G11 ortak tenant kotası dolu: 429 RATE_LIMITED, 0 çağrı", r2.status === 429 && b.calls.length === 0);
    ok("G12 kilit anahtarı dil içeren anlatı anahtarıdır", [...a.counters.keys()].some((k) => k.startsWith("hd-roxy-narrative-inflight:") && /^[0-9a-f]{64}$/.test(k.split(":")[1])));
  }

  console.log("\n[R] Gösterim (okuma) — asla sağlayıcı çağırmaz");
  {
    const { db, fake } = setup();
    const reader: SystemReadingNarrativeReader = (d0, t, id, lang) => readChartNarrative(d0, t, id, lang, { enabled: true });
    const trDto = extractSystemReading(FIXTURE);
    const pre = await getChartSystemReading(db, T_A, CHART, { lang: "en", narrative: reader });
    ok("R1 EN kaydı yokken: TR anlatı aynen + narrative {lang:tr, requested:en, available:false}",
      pre.body.ok && "data" in pre.body && JSON.stringify(pre.body.data) === JSON.stringify(trDto) &&
      JSON.stringify(pre.body.narrative) === JSON.stringify({ lang: "tr", requested: "en", available: false }), pre.body);
    const { d, calls } = deps();
    await generateChartNarrative(ctxFor(db), d, CHART, "en");
    const post = await getChartSystemReading(db, T_A, CHART, { lang: "en", narrative: reader });
    const data = post.body.ok && "data" in post.body ? post.body.data : null;
    ok("R2 EN kaydı varken: EN anlatı (İngilizce metin) + available:true + Türkçe 'İngilizce kaldı' notu YOK",
      !!data && (REAL_EN ? true : JSON.stringify(data).includes("EN-TEXT")) && post.body.ok && "narrative" in post.body && post.body.narrative?.available === true &&
      post.body.narrative?.lang === "en" && (data.languageNote ?? null) === null, post.body);
    // R5 B2 (Roxy ajanı bulgusu): EN çıktıda ürünün TR sistem etiketleri ("Jeneratör (Generator)", "İç Otorite", "(bilinçli)") 0.
    const trLeak = JSON.stringify(data ?? {}).match(/[^"]*[çğıöşüÇĞİÖŞÜ][^"]*/g) ?? [];
    ok("R2b EN anlatı DTO'sunda Türkçe sistem etiketi / metni YOK", !!data && trLeak.length === 0, trLeak.slice(0, 4));
    ok("R3 okuma ek ücretli çağrı yapmaz (toplam yine 1)", calls.length === 1);
    const trAgain = await getChartSystemReading(db, T_A, CHART);
    ok("R4 TR ekranı EN üretiminden sonra da birebir aynı", JSON.stringify(trAgain.body) === JSON.stringify({ ok: true, available: true, data: trDto }));
    // Bozulmuş satır (kanonik özet değişmiş) → kullanılmaz, üretim de 0 çağrıyla durur.
    narrRows(fake)[0].canonical_sha = "0".repeat(64);
    const bad = await readChartNarrative(db, T_A, CHART, "en", { enabled: true });
    ok("R5 kanonik özeti tutmayan kayıt reddedilir (fail-closed)", bad.kind === "none" && bad.reason === "rejected");
    const regen = await generateChartNarrative(ctxFor(db), d, CHART, "en");
    ok("R6 bozuk kayıt: üretim 409 NARRATIVE_STORED_INVALID, otomatik üzerine yazma / çağrı YOK", regen.status === 409 && calls.length === 1);
    const other = await readChartNarrative(db, T_B, CHART, "en", { enabled: true });
    ok("R7 başka tenant okuyamaz", other.kind === "none");
  }
  {
    const svc = readFileSync(join(ROOT, "lib", "human-design", "narrative", "narrativeService.ts"), "utf8");
    const readFn = svc.slice(svc.indexOf("export async function readChartNarrative"), svc.indexOf("export async function generateChartNarrative"));
    ok("S1 okuma fonksiyonunda sağlayıcı / fetch erişimi yok (yapısal)", readFn.length > 100 && !/callRoxy|fetch\(|deps\./.test(readFn));
    const sr = readFileSync(join(ROOT, "lib", "human-design", "api", "systemReadingService.ts"), "utf8");
    ok("S2 systemReadingService sağlayıcı çağırmaz; harita select'i değişmedi", !/callRoxy|fetch\(/.test(sr) && sr.includes('select("id, source, provider, provider_raw")'));
    const all = ["narrativeConfig.ts", "narrativeConsistency.ts", "narrativeStore.ts", "narrativeService.ts"].map((f) => readFileSync(join(ROOT, "lib", "human-design", "narrative", f), "utf8")).join("\n");
    ok("S3 anlatı modülü harita tablosuna yazmaz (update/upsert/insert yalnız anlatı tablosuna)",
      !/from\(CHARTS\)\.(insert|update|upsert|delete)/.test(all) && !/human_design_charts"\)\.(insert|update|upsert|delete)/.test(all) && !/\.upsert\(/.test(all));
    ok("S4 anlatı modülü harita kimliği / i18n katmanını içe aktarmaz", !/roxyInputHash|roxyChartIdFor|next-intl|@\/lib\/i18n/.test(all));
  }

  console.log(`\n=== HD ANLATI (A6): ${pass} PASS / ${failN} FAIL ===`);
  if (failN) {
    for (const f of fails) console.log(` - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  console.log(`\n=== HD ANLATI (A6): ${pass} PASS / ${failN + 1} FAIL ===`);
  process.exit(1);
});
