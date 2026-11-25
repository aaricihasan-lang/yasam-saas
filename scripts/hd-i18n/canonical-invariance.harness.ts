/**
 * D-HD (I18N geniş geliştirme) — HUMAN DESIGN KANONİK DEĞİŞMEZLİK + HARİTA KİMLİĞİ DİL BAĞIMSIZLIĞI.
 *
 * Kanıtlanan (ağ / gerçek Roxy / gerçek DB YOK; sentetik ve altın veri):
 *   S  STATİK: HD hesap + hesap-yanı (normalizasyon, merkez durumu, kimlik) dosyaları dil/çeviri katmanını İÇE AKTARMAZ.
 *   R  ÇALIŞMA ANI: aynı girdiler iki AYRI süreçte (en-GB + dil kapısı açık + NEXT_LOCALE=en  ↔  tr-TR + kapı kapalı)
 *      hesaplanır; aktivasyonlar, kapılar, kanallar, merkez durumları, tip, otorite, profil, tanım, enkarnasyon kapıları ve
 *      uygulama kodları KANONİK JSON olarak birebir eşit olmalı. Varsayılan yerel ayar scripts/i18n/locale-shim.mjs ile
 *      zorlanır; iki sürecin gerçekten farklı dilde çalıştığı sondalarla kanıtlanır.
 *   G  ALTIN: golden-dataset (Genetic Matrix, elle küratörlü) 26 aktivasyon/vaka — her iki süreçte aynı eşleşme sayısı.
 *   K  KİMLİK (I18N-0005): sağlayıcı dili değişince harita kimliği / satırı DEĞİŞMEZ, ek ücretli çağrı ve kota tüketimi 0;
 *      mevcut (lang:"tr" ile üretilmiş) kimlikler birebir korunur (eski formülle bayt eşitliği).
 *   T  TRANSIT (I18N-0006): kişisel transit önbellek/kilit anahtarı sağlayıcı dilini içerir.
 *   N  SAĞLAYICI METNİ (I18N-0012): Türkçe terim düzeltmesi ve "İngilizce kaldı" notu yalnız TR sağlayıcı metninde.
 *
 * Kullanım: npx tsx scripts/hd-i18n/canonical-invariance.harness.ts   (iç: --worker)
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const CASES = path.join(root, "scripts", "hd-validation", "golden-dataset", "cases");
const ROXY_FIXTURE = path.join(root, "scripts", "hd-roxy", "fixtures", "roxy-bodygraph-2018-07-20.json");
const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

type GoldenCase = {
  caseId: string;
  status?: string;
  compareEligible?: boolean;
  input: { date: string; time: string; timezone: string; location: { lat: number; lon: number } };
  reference?: { personality?: Record<string, { gate: number; line: number }>; design?: Record<string, { gate: number; line: number }> };
};

function goldenCases(): GoldenCase[] {
  return fs
    .readdirSync(CASES)
    .filter((f) => f.endsWith(".json") && !f.endsWith(".example.json") && !f.endsWith(".template.json"))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(CASES, f), "utf8")) as GoldenCase)
    .filter((c) => c.status !== "example" && c.compareEligible !== false);
}

async function worker() {
  const { computeHumanDesignChart } = await import("../../lib/human-design/engine/compute");
  const { computedChartAppCodes } = await import("../../lib/human-design/chart/computedChart");
  const { classifyComputedChartCenters, centerStateMap } = await import("../../lib/human-design/chart/centerStates");
  const { validateRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/schema");
  const { normalizeRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/normalize");

  const inputs = [
    ...goldenCases().map((c) => ({ id: c.caseId, input: c.input, reference: c.reference ?? null })),
    // scripts/i18n/calc-invariance.harness.ts ile aynı iki sentetik girdi
    { id: "SYN-1", input: { date: "1990-04-01", time: "14:30", timezone: "Europe/Istanbul", location: { lat: 41.0082, lon: 28.9784 } }, reference: null },
    { id: "SYN-2", input: { date: "1979-11-23", time: "03:05", timezone: "Europe/Berlin", location: { lat: 52.52, lon: 13.405 } }, reference: null },
  ];
  const charts = inputs.map(({ id, input, reference }) => {
    const r = computeHumanDesignChart(input);
    const computed = r as unknown as Parameters<typeof computedChartAppCodes>[0];
    const canonical = {
      id,
      activations: r.activations.map((a) => ({ body: a.body, side: a.side, gate: a.gate, line: a.line })),
      type: r.type,
      authority: r.authority,
      profile: r.profile,
      definition: r.definition,
      centers: r.centers,
      channels: r.channels.map((c) => c.id),
      crossGates: r.incarnationCross?.gates ?? null,
      appCodes: computedChartAppCodes(computed),
      centerStates: centerStateMap(classifyComputedChartCenters(r)),
    };
    let refMatch: { matched: number; total: number } | null = null;
    if (reference) {
      let matched = 0, total = 0;
      for (const side of ["personality", "design"] as const) {
        for (const [body, exp] of Object.entries(reference[side] ?? {})) {
          total++;
          const got = r.activations.find((a) => a.side === side && a.body === body);
          if (got && got.gate === exp.gate && got.line === exp.line) matched++;
        }
      }
      refMatch = { matched, total };
    }
    return { canonical, full: r, refMatch };
  });

  // Sağlayıcı (Roxy) normalizasyonu: aynı ham yanıt, sağlayıcı dili "tr" ve "en" → kodlar/kanonik alanlar aynı.
  const raw = JSON.parse(fs.readFileSync(ROXY_FIXTURE, "utf8"));
  const v = validateRoxyBodygraph(raw);
  if (!v.ok) throw new Error("fixture invalid");
  const base = { date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.871399, longitude: 32.484699, nodeType: "true", birthUtcIso: "2018-07-20T16:00:00.000Z" };
  const nTr = normalizeRoxyBodygraph(v.value, { ...base, lang: "tr" });
  const nEn = normalizeRoxyBodygraph(v.value, { ...base, lang: "en" });
  if (!nTr.ok || !nEn.ok) throw new Error("normalize failed");
  const strip = (c: typeof nTr.chart) => ({ ...c, provider: c.provider ? { ...c.provider, lang: "<provenance>" } : c.provider });
  const roxy = {
    codesTr: nTr.codes,
    codesEn: nEn.codes,
    chartTr: strip(nTr.chart),
    chartEn: strip(nEn.chart),
    centerStatesTr: centerStateMap(classifyComputedChartCenters(nTr.chart)),
    centerStatesEn: centerStateMap(classifyComputedChartCenters(nEn.chart)),
    langProvenance: [nTr.chart.provider?.lang, nEn.chart.provider?.lang],
  };

  const intl = new Intl.DateTimeFormat().resolvedOptions().locale;
  const probes = { upper: "i".toLocaleUpperCase(), number: (1234.5).toLocaleString() };
  process.stdout.write(JSON.stringify({ charts, roxy, intl, probes }));
}

function staticGuard(): { files: number; hits: string[] } {
  const dirs = ["lib/human-design/engine"];
  const files = [
    "lib/human-design/normalize/hdAppCodes.ts",
    "lib/human-design/chart/centerStates.ts",
    "lib/human-design/chart/computedChart.ts",
    "lib/human-design/providers/roxy/normalize.ts",
    "lib/human-design/providers/roxy/schema.ts",
    "lib/human-design/providers/roxy/config.ts",
    "lib/human-design/api/roxyChartService.ts",
    "lib/human-design/api/hdDuplicates.ts",
    "lib/human-design/variables/variablesMath.ts",
    "lib/human-design/transit/personalTransit.ts",
    "lib/human-design/transit/transitMoment.ts",
    "lib/human-design/transit/transitScene.ts",
  ];
  const banned = [/from\s+["']next-intl/, /["']@\/lib\/i18n\//, /NEXT_LOCALE/, /\buseLocale\(|\bgetLocale\(|\bgetTranslations\(|\buseTranslations\(/];
  const walk = (d: string, out: string[] = []) => {
    const abs = path.join(root, d);
    if (!fs.existsSync(abs)) return out;
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel, out);
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const all = [...dirs.flatMap((d) => walk(d)), ...files.filter((f) => fs.existsSync(path.join(root, f)))];
  const hits: string[] = [];
  for (const f of all) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const re of banned) if (re.test(src)) hits.push(`${f} ~ ${re}`);
  }
  return { files: all.length, hits };
}

async function identityChecks(ok: (c: unknown, n: string, d?: unknown) => void) {
  const { roxyInputHash, roxyKeyedInputHash, computeRoxyChart } = await import("../../lib/human-design/api/roxyChartService");
  const { ROXY_CHART_IDENTITY_LANG, ROXY_POLICY, ROXY_PROVIDER_ID, ROXY_BODYGRAPH_ENDPOINT, ROXY_ADAPTER_VERSION } = await import("../../lib/human-design/providers/roxy/config");
  const { createFakeDb } = await import("../hd-roxy/fakeDb");
  const { consistentRoxyResponse } = await import("../hd-roxy/consistentFixture");

  // K1 — eski formülün bayt-bayt kopyası (değişiklik ÖNCESİ, c616c371c): mevcut kayıtların kimliği korunuyor mu?
  const legacy = (i: { tenantId: string; clientId: string; date: string; time: string; timezone: string; latitude: number; longitude: number; nodeType: string; lang: string }) =>
    crypto.createHash("sha256").update(JSON.stringify([ROXY_PROVIDER_ID, ROXY_BODYGRAPH_ENDPOINT, ROXY_ADAPTER_VERSION, i.tenantId, i.clientId, i.date, i.time, i.timezone, i.latitude.toFixed(6), i.longitude.toFixed(6), i.nodeType, i.lang]), "utf8").digest("hex");
  const idn = { tenantId: "t", clientId: "c", date: "2018-07-20", time: "19:00:00", timezone: "Europe/Istanbul", latitude: 37.871399, longitude: 32.484699, nodeType: "true", lang: ROXY_CHART_IDENTITY_LANG };
  ok(ROXY_CHART_IDENTITY_LANG === "tr" && ROXY_POLICY.lang === "tr", "K0 kimlik dili sabiti 'tr' (mevcut kayıtların üretildiği değer); sağlayıcı politikası değişmedi (tr)");
  ok(roxyInputHash(idn) === legacy({ ...idn, lang: "tr" }), "K1 kimlik hash'i eski (lang:'tr') formülle BAYT-BAYT aynı → mevcut harita kimlikleri korunur, migration gerekmez");

  // K2..K8 — servis akışı: sahte DB + sayaçlı sahte Roxy / kota.
  const T = "11111111-1111-4111-8111-111111111111";
  const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const C = "c0000000-0000-4000-8000-00000000000a";
  const fixture = fs.readFileSync(ROXY_FIXTURE, "utf8");
  const mk = () =>
    createFakeDb({
      human_design_clients: [{ id: C, tenant_id: T, name: "Sentetik Danışan", birth_date: "2018-07-20", birth_time: "19:00", birth_place: "Konya" }],
      human_design_charts: [],
    });
  const counters = { roxy: 0, rate: 0, roxyLangs: [] as string[] };
  const deps = (lang: string, secret: string | null) => ({
    config: { apiKey: "sk-TEST-ONLY", baseUrl: "https://example.invalid/api/v2" },
    callRoxy: async (_c: unknown, body: unknown, opts: { lang: string }) => {
      counters.roxy++;
      counters.roxyLangs.push(opts.lang);
      return { ok: true as const, raw: JSON.parse(consistentRoxyResponse(fixture, JSON.stringify(body))) };
    },
    rateLimit: async () => {
      counters.rate++;
      return { allowed: true, retryAfterSec: 0 };
    },
    sleep: async () => undefined,
    log: () => undefined,
    policy: { ...ROXY_POLICY, lang },
    chartIdSecret: secret,
  });
  const body = { client_id: C, location_id: "tr-42-konya" };
  for (const secret of [null, "test-chart-id-secret"]) {
    const tag = secret ? "anahtarlı (HMAC) kimlik" : "eski tuzsuz kimlik";
    const f = mk();
    counters.roxy = 0; counters.rate = 0; counters.roxyLangs = [];
    const tr = await computeRoxyChart({ db: f.db, tenantId: T, userId: U, isDemo: false }, body, deps("tr", secret) as never);
    const afterTr = { roxy: counters.roxy, rate: counters.rate, rows: f.tables.human_design_charts.length };
    const en = await computeRoxyChart({ db: f.db, tenantId: T, userId: U, isDemo: false }, body, deps("en", secret) as never);
    ok(tr.body.ok && tr.body.reused === false && afterTr.roxy === 1 && afterTr.rows === 1, `K2 [${tag}] TR ilk hesap: 1 ücretli çağrı, 1 satır`, { tr: tr.body, afterTr });
    ok(en.body.ok && tr.body.ok && en.body.id === tr.body.id && en.body.reused === true, `K3 [${tag}] aynı doğum, sağlayıcı dili EN → AYNI harita kimliği, reused`, en.body);
    ok(counters.roxy === 1 && counters.rate === afterTr.rate && f.tables.human_design_charts.length === 1, `K4 [${tag}] EN isteği: ek ücretli çağrı 0, ek kota/kilit sayacı 0, ek satır 0`, { roxy: counters.roxy, rate: counters.rate, rateBefore: afterTr.rate, rows: f.tables.human_design_charts.length });

    // Ters yön: önce EN, sonra TR — yine tek satır.
    const g = mk();
    counters.roxy = 0; counters.rate = 0; counters.roxyLangs = [];
    const en2 = await computeRoxyChart({ db: g.db, tenantId: T, userId: U, isDemo: false }, body, deps("en", secret) as never);
    const tr2 = await computeRoxyChart({ db: g.db, tenantId: T, userId: U, isDemo: false }, body, deps("tr", secret) as never);
    const row = g.tables.human_design_charts[0] as { input?: { lang?: string } } | undefined;
    ok(en2.body.ok && tr2.body.ok && en2.body.id === tr2.body.id && tr2.body.reused === true && counters.roxy === 1 && g.tables.human_design_charts.length === 1, `K5 [${tag}] önce EN sonra TR → tek kimlik, tek ücretli çağrı`, { en2: en2.body, tr2: tr2.body, roxy: counters.roxy });
    ok(counters.roxyLangs.join(",") === "en" && row?.input?.lang === "en", `K6 [${tag}] sağlayıcı dili yalnız çağrıya ve provenance'a (input.lang) gider`, { langs: counters.roxyLangs, stored: row?.input?.lang });
  }

  // K7 — eski (tuzsuz kimlikli, input.lang:"tr") kayıt, sır ETKİN + EN politikasıyla "eşdeğer" bulunur (yeniden çağrı yok).
  {
    const f = mk();
    counters.roxy = 0; counters.rate = 0;
    const seed = await computeRoxyChart({ db: f.db, tenantId: T, userId: U, isDemo: false }, body, deps("tr", null) as never);
    const before = counters.roxy;
    const en = await computeRoxyChart({ db: f.db, tenantId: T, userId: U, isDemo: false }, body, deps("en", "test-chart-id-secret") as never);
    ok(seed.body.ok && en.body.ok && en.body.id === seed.body.id && en.body.reused === true && counters.roxy === before && f.tables.human_design_charts.length === 1, "K7 eski tuzsuz TR kaydı, anahtarlı kimlik + EN politikasıyla eşdeğer bulunur (0 ek çağrı)", { seed: seed.body, en: en.body });
  }
  // K8 — anahtarlı hash de dil-bağımsız (aynı girdi + sır → aynı id; dil alanı kimlikte sabit).
  ok(roxyKeyedInputHash(idn, "s") === roxyKeyedInputHash({ ...idn }, "s"), "K8 anahtarlı kimlik deterministik");
}

async function transitAndTextChecks(ok: (c: unknown, n: string, d?: unknown) => void) {
  // T1 — kişisel transit anahtarı dil içerir (statik + yardımcı davranışı).
  const src = fs.readFileSync(path.join(root, "lib/human-design/transit/personalTransitService.ts"), "utf8");
  ok(/withLanguageInCacheKey\(\[ROXY_TRANSIT_ADAPTER_VERSION, policy\.nodeType, ctx\.tenantId, chart\.id, chart\.input_hash \?\? "", moment\.utcIso\], policy\.lang\)/.test(src), "T1 kişisel transit önbellek + kilit anahtarı = withLanguageInCacheKey(..., policy.lang)");
  const { withLanguageInCacheKey } = await import("../../lib/i18n/providerLanguage");
  const parts = ["v", "true", "tenant", "chart", "hash", "2026-11-25T00:00:00.000Z"];
  ok(withLanguageInCacheKey(parts, "tr") !== withLanguageInCacheKey(parts, "en"), "T2 aynı harita + aynı an, farklı dil → farklı anahtar");

  // N — sistem yorumu.
  const { extractSystemReading, harmonizeSystemReading } = await import("../../lib/human-design/providers/roxy/systemReading");
  const raw = JSON.parse(fs.readFileSync(ROXY_FIXTURE, "utf8"));
  const a = extractSystemReading(raw);
  const b = extractSystemReading(raw, { providerLang: "tr" });
  ok(JSON.stringify(a) === JSON.stringify(b), "N1 varsayılan (mevcut kayıtlar) = providerLang 'tr' → TR davranışı birebir");
  ok(!!a && typeof a.languageNote === "string", "N2 TR metin beklenirken İngilizce kalan metin → not (eski davranış korunur)");
  const e = extractSystemReading(raw, { providerLang: "en" });
  ok(!!e && e.languageNote === null, "N3 sağlayıcı dili EN → 'İngilizce kaldı' notu YOK");
  const dto = { general: [{ key: "profile", title: "x", value: "Şehit / Sapkın", details: [{ label: "d", text: "Şehidin yolu" }] }], centers: [], channels: [], activations: [] } as unknown as Parameters<typeof harmonizeSystemReading>[0];
  const htr = harmonizeSystemReading(dto, {}, {});
  const hen = harmonizeSystemReading(dto, {}, { providerLang: "en" });
  ok(htr.general[0].details[0].text === "Deneyimleyenin yolu" && htr.general[0].value === "Deneyimleyen / Çözüm Getiren", "N4 TR sağlayıcı metninde terim düzeltmesi aynen", htr.general[0]);
  ok(hen.general[0].details[0].text === "Şehidin yolu", "N5 TR dışı sağlayıcı metnine Türkçe ek/terim düzeltmesi UYGULANMAZ", hen.general[0]);
}

async function main() {
  if (process.argv.includes("--worker")) return worker();
  let pass = 0, fail = 0;
  const ok = (c: unknown, n: string, d?: unknown) => {
    if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.error(`  FAIL ${n}${d !== undefined ? " — " + JSON.stringify(d).slice(0, 500) : ""}`); }
  };

  console.log("\n[S] statik: HD hesap / hesap-yanı / kimlik dosyaları dil katmanını bilmez");
  const s = staticGuard();
  console.log(`  bilgi: ${s.files} dosya tarandı`);
  ok(s.hits.length === 0, "HD hesap dosyalarında dil/çeviri bağımlılığı yok", s.hits);

  console.log("\n[R] çalışma anı: TR ↔ EN süreçlerinde kanonik sonuç");
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const run = (env: Record<string, string>) => {
    const shim = pathToFileURL(path.join(root, "scripts", "i18n", "locale-shim.mjs")).href;
    const r = spawnSync(process.execPath, [tsx, fileURLToPath(import.meta.url), "--worker"], {
      cwd: root, encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, TZ: "UTC", ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${shim}`.trim() },
    });
    if (r.status !== 0) throw new Error(`worker çıkışı ${r.status}: ${r.stderr.slice(0, 1200)}`);
    return JSON.parse(r.stdout) as {
      charts: { canonical: Record<string, unknown> & { id: string }; full: unknown; refMatch: { matched: number; total: number } | null }[];
      roxy: Record<string, unknown> & { codesTr: unknown; codesEn: unknown; chartTr: unknown; chartEn: unknown; centerStatesTr: unknown; centerStatesEn: unknown; langProvenance: string[] };
      intl: string;
      probes: { upper: string; number: string };
    };
  };
  const A = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "on", NEXT_LOCALE: "en", LANG: "en_GB.UTF-8", LC_ALL: "en_GB.UTF-8", I18N_TEST_DEFAULT_LOCALE: "en-GB" });
  const B = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "off", NEXT_LOCALE: "tr", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8", I18N_TEST_DEFAULT_LOCALE: "tr-TR" });
  console.log(`  bilgi: Intl A=${A.intl} B=${B.intl}; sondalar A=${JSON.stringify(A.probes)} B=${JSON.stringify(B.probes)}`);
  ok(A.intl.startsWith("en") && B.intl.startsWith("tr") && A.probes.upper === "I" && B.probes.upper === "İ" && A.probes.number !== B.probes.number, "iki süreç GERÇEKTEN farklı yerel ayarda (en-GB / tr-TR)");
  ok(A.charts.length === B.charts.length && A.charts.length >= 9, `vaka sayısı eşit (${A.charts.length})`);
  const fields = ["activations", "type", "authority", "profile", "definition", "centers", "channels", "crossGates", "appCodes", "centerStates"] as const;
  for (const f of fields) {
    const diff = A.charts.filter((c, i) => sha(c.canonical[f]) !== sha(B.charts[i].canonical[f])).map((c) => c.canonical.id);
    ok(diff.length === 0, `R/${f}: ${A.charts.length} vakada TR = EN`, diff);
  }
  ok(sha(A.charts.map((c) => c.full)) === sha(B.charts.map((c) => c.full)), "R/tam motor çıktısı (zamanlama, doğrulama, uyarılar dahil) TR = EN");
  ok(sha(A.roxy) === sha(B.roxy), "R/sağlayıcı normalizasyonu: iki süreçte aynı");
  ok(sha(A.roxy.codesTr) === sha(A.roxy.codesEn) && sha(A.roxy.chartTr) === sha(A.roxy.chartEn) && sha(A.roxy.centerStatesTr) === sha(A.roxy.centerStatesEn), "R/sağlayıcı dili tr ↔ en: uygulama kodları, harita ve merkez durumları aynı (yalnız provenance lang farklı)", A.roxy.langProvenance);

  console.log("\n[G] altın veri (Genetic Matrix, elle küratörlü) — aktivasyon eşleşmesi");
  const ref = A.charts.filter((c) => c.refMatch);
  let m = 0, t = 0;
  for (let i = 0; i < A.charts.length; i++) {
    const a = A.charts[i].refMatch, b = B.charts[i].refMatch;
    if (!a || !b) continue;
    m += a.matched; t += a.total;
    console.log(`  bilgi: ${A.charts[i].canonical.id} EN ${a.matched}/${a.total} · TR ${b.matched}/${b.total}`);
  }
  ok(ref.length >= 7 && ref.every((c, i) => JSON.stringify(c.refMatch) === JSON.stringify(B.charts.filter((x) => x.refMatch)[i].refMatch)), `altın eşleşme TR = EN (${ref.length} vaka)`);
  ok(m === t, `altın aktivasyonlar birebir: ${m}/${t}`);
  const summary = A.charts.map((c) => ({ id: c.canonical.id, type: c.canonical.type, authority: c.canonical.authority, profile: c.canonical.profile, definition: (c.canonical.definition as { kind?: string })?.kind, channels: (c.canonical.channels as string[]).length, sha: sha(c.canonical).slice(0, 12) }));
  console.log("  bilgi: kanonik özet (EN süreci; TR süreciyle aynı):");
  for (const r of summary) console.log(`    ${r.id} ${r.type} / ${r.authority} / ${r.profile} / ${r.definition} / ${r.channels} kanal / sha ${r.sha}`);

  console.log("\n[K] harita kimliği dilden bağımsız (I18N-0005)");
  await identityChecks(ok);
  console.log("\n[T/N] transit önbelleği (I18N-0006) + sağlayıcı metni (I18N-0012)");
  await transitAndTextChecks(ok);

  console.log(`\n=== HD kanonik değişmezlik: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
