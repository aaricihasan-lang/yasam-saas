/**
 * GÖKYÜZÜ ATLASI — DİL DEĞİŞMEZLİĞİ (I18N mod-g, 25.11.2026). Ağ / DB / sağlayıcı çağrısı / sır YOK.
 *
 * scripts/i18n/calc-invariance.harness.ts ile AYNI yöntem (iki AYRI süreç, scripts/i18n/locale-shim.mjs ile işletim
 * sisteminden bağımsız zorlanan varsayılan yerel ayar: A = en-GB + NEXT_LOCALE=en + dil kapısı açık, B = tr-TR + kapı
 * kapalı; sondalarla farklılık KANITLANIR) — ama kapsam Atlas'ın tüm hesap / normalize katmanına genişletildi:
 *
 *   1. Saat / saat dilimi / DST: resolveAstroBirthTime (İstanbul kalıcı yaz saati öncesi/sonrası, Berlin ve New York DST
 *      geçişi — var olmayan ve iki kez yaşanan yerel saatler, earlier/later seçimi, Londra, Kalküta, Sidney, Tromsø).
 *   2. Roxy normalizer'ları (kayıtlı gerçek yanıtlar → kanonik teknik nesne): Natal (gezegen derece/burç/ev/retro, ASC/MC,
 *      açı/orb/nitelik, ay düğümü), Transit (nitelik eşlemesi NATURE_TR dahil), Progresyon, Solar Arc, Solar/Lunar Return,
 *      Sinastri, Composite, Vedik D1 / D9 / Dasha, KP Chart / KP Horary.
 *   3. Yerel motorlar: klasik ev sistemleri (200 kayıtlı Natal × Regiomontanus/Campanus/Porphyry/Alcabitius), element/nitelik
 *      dağılımı (2 yöntem), Batı Horary (Lilly; Regiomontanus + saygınlık), efemeris konumu / düğüm / ayanamsa, burç girişleri ve
 *      duraklar, Ay/Güneş tutulmaları.
 *   4. Görünüm (TechniqueView): saat bilinmiyor maskesi + uyarı kodları (istemcide türetilen deriveViewWarningCodes; sunucu yanıtında alan yok).
 *
 * Karşılaştırma yerelleştirilmiş metin üzerinden DEĞİL, kanonik sonuç nesnesinin JSON'u üzerinden yapılır; bölüm başına SHA-256
 * birebir eşit olmalı. Ayrıca hesap dizinleri dil katmanını içe aktarmaz (statik kapı; calc-invariance kapsamı + Atlas'ın
 * houses / horary / dignities / time / birth / transits / view / providers dizinleri).
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-locale-invariance.harness.ts
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const FIX = path.join(here, "fixtures");
type J = Record<string, unknown>;

const readJson = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), "utf8"));

async function worker() {
  const { resolveAstroBirthTime } = await import("@/lib/astrology/birth/timeResolution");
  const { projectRoxyNatal } = await import("@/lib/astrology/providers/roxy/natal");
  const T = await import("@/lib/astrology/providers/roxy/timing");
  const V = await import("@/lib/astrology/providers/roxy/vedic");
  const K = await import("@/lib/astrology/providers/roxy/kp");
  const { deriveLocalNatalHouses } = await import("@/lib/astrology/houses/natalLocal");
  const { PRO_HOUSE_SYSTEMS } = await import("@/lib/astrology/houses/engine");
  const { natalDistribution } = await import("@/lib/astrology/view/natalDistribution");
  const { buildWesternHoraryChart } = await import("@/lib/astrology/horary/western/chart");
  const { PROFILE_LILLY_1647 } = await import("@/lib/astrology/horary/western/calc");
  const L = await import("@/lib/astrology/pro/ephemeris/local");
  const E = await import("@/lib/astrology/pro/ephemeris/events");
  const X = await import("@/lib/astrology/pro/lunations/eclipses");
  const { buildTechniqueView } = await import("@/lib/astrology/view/techniqueView");
  const { deriveViewWarningCodes } = await import("@/lib/astrology/viewWarnings");

  const safe = (f: () => unknown) => {
    try {
      return f();
    } catch (e) {
      return { threw: String(e instanceof Error ? e.message : e) };
    }
  };
  const g = (name: string) => readJson("golden", `${name}.json`) as { endpoint: string; body: J; response: unknown };

  // 1) Saat / dilim / DST
  const tz = [
    ["1990-07-15", "14:30", "Europe/Istanbul"],
    ["2016-03-27", "03:30", "Europe/Istanbul"],
    ["2016-11-06", "12:00", "Europe/Istanbul"],
    ["1978-10-15", "00:30", "Europe/Istanbul"],
    ["2021-03-28", "02:30", "Europe/Berlin"],
    ["2021-10-31", "02:30", "Europe/Berlin"],
    ["2021-03-14", "02:30", "America/New_York"],
    ["2021-11-07", "01:30", "America/New_York"],
    ["1987-06-01", "23:59", "Europe/London"],
    ["1975-01-01", "00:00", "Asia/Kolkata"],
    ["2000-02-29", "12:00", "Australia/Sydney"],
    ["1969-07-20", "20:17", "Europe/Oslo"],
  ].flatMap(([d, t, z]) => (["auto", "earlier", "later"] as const).map((c) => ({ in: [d, t, z, c], out: resolveAstroBirthTime(d, t, z, c) })));

  // 2) Roxy normalizer'ları (kayıtlı gerçek yanıtlar)
  const natalRaw = readJson("roxy-natal-golden-2026-10-07.json");
  const tr = g("transit");
  const pr = g("progression");
  const sa = g("solar-arc");
  const kc = g("kp-chart");
  const kh = g("kp-horary");
  const kb = kc.body as { date: string; time: string; latitude: number; longitude: number; timezone: number };
  const khb = kh.body as { horaryNumber: number; latitude: number; longitude: number };
  const providers = {
    natal: safe(() => projectRoxyNatal(structuredClone(natalRaw.response ?? natalRaw), { houseSystem: "placidus", nodeType: "true" })),
    transit: safe(() => T.projectRoxyTransit(structuredClone(tr.response), { nodeType: "true", atUtc: "2026-10-07T09:00:00Z" })),
    progression: safe(() => T.projectRoxyProgression(structuredClone(pr.response), { nodeType: "true", targetDate: String(pr.body.targetDate), request: pr.body })),
    solarArc: safe(() => T.projectRoxySolarArc(structuredClone(sa.response), { nodeType: "true", targetDate: String(sa.body.targetDate) })),
    synastry: safe(() => T.projectRoxySynastry(structuredClone(g("synastry").response), { houseSystem: "placidus", nodeType: "true" })),
    composite: safe(() => T.projectRoxyComposite(structuredClone(g("composite").response), { houseSystem: "placidus", nodeType: "true" })),
    solarReturn: safe(() => T.projectRoxyReturn(structuredClone(g("solar-return").response), "solar", { houseSystem: "placidus", returnYear: 2026, returnDate: null } as never)),
    lunarReturn: safe(() => {
      const lr = g("lunar-return");
      return T.projectRoxyReturn(structuredClone(lr.response), "lunar", { houseSystem: "placidus", returnYear: null, returnDate: lr.body.returnDate } as never);
    }),
    forecast: safe(() => T.projectRoxyForecast(structuredClone(g("forecast").response))),
    vedicD1: safe(() => V.projectRoxyVedicD1(structuredClone(g("vedic-d1").response), { ayanamsa: "lahiri" })),
    vedicD9: safe(() => V.projectRoxyVedicVarga(structuredClone(g("vedic-d9").response), { ayanamsa: "lahiri", division: 9 } as never)),
    vedicDasha: safe(() => V.projectRoxyVedicDasha(structuredClone(g("vedic-dasha-major").response), { ayanamsa: "lahiri", mahadasha: null, antardasha: null, birthLocal: "1990-07-15T14:30:00", utcOffsetHours: 3 } as never)),
    kpChart: safe(() => K.projectRoxyKpChart(structuredClone(kc.response), { ayanamsa: "kp-newcomb", nodeType: "mean", birth: { date: kb.date, time: kb.time, latitude: kb.latitude, longitude: kb.longitude, timezone: kb.timezone } })),
    kpHorary: safe(() => K.projectRoxyKpHorary(structuredClone(kh.response), { horaryNumber: khb.horaryNumber, atUtc: "2026-10-07T09:00", ayanamsa: "kp-newcomb", nodeType: "mean", place: { latitude: khb.latitude, longitude: khb.longitude } })),
  };

  // 3) Yerel motorlar
  const cases = readJson("pro-natal-houses", "roxy-natal-technical-2026-10-31.json").cases as { id: string; technical: J }[];
  const localHouses = cases.map((c) => PRO_HOUSE_SYSTEMS.map((s) => deriveLocalNatalHouses(c.technical as never, s)));
  // QA-ATLAS-R5 P2-4: A7 ev atfı tespiti (TR: tr-TR küçük harf) + yerel ev süzgeci + Local Space yer atfı süreç yerel ayarından
  // bağımsız olmalı. Büyük harfli TR örnekler (İ/I) en-GB süreçte varsayılan küçük harfle "i̇" olur → tespit kaçar; bu bölüm yakalar.
  // Bölüm `sections` DIŞINDA tutulur (mevcut tüm-bölüm sha'sı değişmesin); A ve B ayrıca karşılaştırılır.
  const houseRefs = await (async () => {
    const NL = await import("@/lib/astrology/houses/natalLocal");
    const LS = await import("@/lib/astrology/localSpaceCenter");
    const up = (x: string) => x.toLocaleUpperCase("tr-TR");
    const samples = ["İkinci evde", "Dokuzuncu Ev evindeki", "on ikinci evde bulunan", "evin yöneticisi", "Güneş ikinci evinizde", "9. ev", "sayılı ev", "kariyer evinizi yöneten Güneş dördüncü evinizde", "ev konumuna", "FIRST HOUSE", "lives in the seventh"];
    const detect = samples.flatMap((x) => [x, up(x)]).map((x) => [x, NL.textHasHouseReference(x, "tr"), NL.textHasHouseReference(x, "en")]);
    const rawNatal = (n: string) => readJson("i18n", "roxy-tr-en-2026-11-25", n) as { response?: unknown };
    const natal = (n: string, lang: string) => {
      const p = projectRoxyNatal(structuredClone((rawNatal(n).response ?? rawNatal(n)) as never), { houseSystem: "placidus", nodeType: "true" } as never) as { ok: boolean; value?: { interpretation: J } };
      if (!p.ok || !p.value) return null;
      const it = p.value.interpretation as { aspects?: { summary?: string }[]; patterns?: { text?: string }[]; overall?: { aspectSummary?: string } };
      // Aynı metnin büyük harfli kopyası da süzgeçten geçer (sağlayıcı büyük harf / başlık biçimi).
      const loud = { ...it, aspects: (it.aspects ?? []).map((a) => ({ ...a, summary: typeof a.summary === "string" ? up(a.summary) : a.summary })), patterns: (it.patterns ?? []).map((q) => ({ ...q, text: typeof q.text === "string" ? up(q.text) : q.text })) };
      return [NL.sanitizeNatalInterpretationForLocalHouses(it as never, lang), NL.sanitizeNatalInterpretationForLocalHouses(loud as never, lang)];
    };
    const sanitized = [natal("natal-p1-tr.json", "tr"), natal("natal-p2-tr.json", "tr"), natal("natal-p3-tr.json", "tr"), natal("natal-p1-en.json", "en")];
    const center = { label: "Berlin", latitude: 52.52, longitude: 13.405, isBirthPlace: false };
    const lsTexts: string[] = [];
    (function walk(x: unknown) {
      if (typeof x === "string") lsTexts.push(x);
      else if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") Object.values(x as J).forEach(walk);
    })((rawNatal("local-space-p1-tr.json") as { response?: unknown }).response);
    const localSpace = lsTexts.flatMap((x) => [LS.localSpaceText(x, center as never, "tr"), LS.localSpaceText(up(x), center as never, "tr")]);
    return { detect, sanitized, localSpace };
  })();
  const distribution = cases.map((c) => [safe(() => natalDistribution(c.technical as never, "planets10")), safe(() => natalDistribution(c.technical as never, "weighted15"))]);
  const horary = [
    { questionUtc: "2026-03-14T09:30:00Z", latitude: 41.0082, longitude: 28.9784 },
    { questionUtc: "2025-10-02T21:15:00Z", latitude: 51.5072, longitude: -0.1276 },
    { questionUtc: "2021-10-31T01:30:00Z", latitude: 52.52, longitude: 13.405 },
    { questionUtc: "2024-12-21T15:00:00Z", latitude: -33.8688, longitude: 151.2093 },
    { questionUtc: "2026-06-21T11:00:00Z", latitude: 66.0, longitude: 25.0 },
  ].map((q) => safe(() => buildWesternHoraryChart({ ...q, profile: PROFILE_LILLY_1647 })));
  const bodies = ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;
  const instants = ["1900-01-01T00:00:00Z", "1990-07-15T11:30:00Z", "2026-11-25T12:00:00Z", "2050-06-30T18:00:00Z"].map((s) => Date.parse(s));
  const ephemeris = instants.map((ms) => ({
    ms,
    trop: bodies.map((b) => safe(() => L.localPosition(b as never, ms, "tropical"))),
    sid: bodies.map((b) => safe(() => L.localPosition(b as never, ms, "sidereal_lahiri"))),
    nodes: [safe(() => L.meanNodeLon(ms)), safe(() => L.trueNodeLon(ms))],
    ayanamsa: [safe(() => L.lahiriMeanAyanamsa(ms)), safe(() => L.lahiriTrueAyanamsa(ms))],
    obliquity: safe(() => L.obliquityAt(ms)),
  }));
  const y0 = Date.parse("2026-01-01T00:00:00Z");
  const y1 = Date.parse("2027-01-01T00:00:00Z");
  const events = safe(() => E.findEvents(["sun", "mercury", "venus", "mars"] as never, y0, y1, "tropical" as never, "local" as never));
  const eclipses = { lunar: safe(() => X.findLunarEclipses(y0, y1)), solar: safe(() => X.findSolarEclipses(y0, y1)) };

  // 4) Görünüm: saat bilinmiyor maskesi + uyarı kodları (Natal golden projeksiyonu üzerinde)
  const np = providers.natal as { ok?: boolean; value?: { technical: unknown } };
  const view = np.ok
    ? [true, false].map((primary) =>
        safe(() =>
          buildTechniqueView({
            technique: "western.natal",
            rows: [{ id: "r", technique: "western.natal", provider: "roxy", provider_api_version: "v2", adapter_version: "a", projection_version: "p", technical: np.value!.technical as J, created_at: "2026-11-25T00:00:00Z" } as never],
            combined: np.value!.technical,
            options: { houseSystem: "placidus" },
            timeKnowledge: { primary, partner: null },
            visibility: { visible: false, reason: "not_entitled" },
            interpretations: null,
          }),
        ),
      )
    : null;

  const intl = new Intl.DateTimeFormat().resolvedOptions().locale;
  const probes = { upper: "i".toLocaleUpperCase(), date: new Date(Date.UTC(2026, 0, 2, 12)).toLocaleDateString(), number: (1234.5).toLocaleString() };
  const threw = (v: unknown): number => (v && typeof v === "object" ? ("threw" in (v as J) ? 1 : Object.values(v as J).reduce<number>((n, x) => n + threw(x), 0)) : 0);
  const unavailable = { ephemeris: threw(ephemeris), events: threw(events), eclipses: threw(eclipses), horary: threw(horary), distribution: threw(distribution) };
  const okCount = Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, (v as { ok?: unknown })?.ok === true]));
  process.stdout.write(JSON.stringify({ houseRefs, sections: { tz, providers, localHouses, distribution, horary, ephemeris, events, eclipses, view, viewSansCodes: JSON.parse(JSON.stringify(view, (k, v) => (k === "warningCodes" ? undefined : v))), viewCodes: Array.isArray(view) ? view.map((x) => (x && typeof x === "object" && "technique" in x ? deriveViewWarningCodes(x as Parameters<typeof deriveViewWarningCodes>[0]) : null)) : null }, okCount, unavailable, intl, probes }));
}

const sha = (v: unknown) => crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");

function staticGuard(): { files: number; hits: string[] } {
  const dirs = ["lib/astrology/engine", "lib/astrology/pro", "lib/astrology/model", "lib/astrology/houses", "lib/astrology/horary", "lib/astrology/dignities", "lib/astrology/time", "lib/astrology/birth", "lib/astrology/transits", "lib/astrology/view", "lib/astrology/providers", "lib/time"];
  const banned = [/from\s+["']next-intl/, /["']@\/lib\/i18n\/(gate|setLocale|localePreference\w*|output|catalog|localeCookie)["']/, /NEXT_LOCALE/, /\buseLocale\(|\bgetLocale\(/];
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
  const all = dirs.flatMap((d) => walk(d));
  const hits: string[] = [];
  for (const f of all) {
    const src = fs.readFileSync(path.join(root, f), "utf8");
    for (const re of banned) if (re.test(src)) hits.push(`${f} ~ ${re}`);
  }
  return { files: all.length, hits };
}

async function main() {
  if (process.argv.includes("--worker")) return worker();
  let pass = 0;
  let fail = 0;
  const ok = (c: unknown, n: string, d?: unknown) => {
    if (c) {
      pass++;
      console.log(`  PASS ${n}`);
    } else {
      fail++;
      console.error(`  FAIL ${n}${d ? " — " + JSON.stringify(d).slice(0, 600) : ""}`);
    }
  };

  console.log("\n[S] statik: Atlas hesap / normalize dizinleri dil katmanını bilmez");
  const s = staticGuard();
  console.log(`  ${s.files} dosya tarandı`);
  ok(s.hits.length === 0, "dil/çeviri bağımlılığı yok", s.hits);

  console.log("\n[R] çalışma anı: TR ↔ EN süreçlerinde aynı kanonik sonuç");
  const tsx = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
  const shim = pathToFileURL(path.join(root, "scripts", "i18n", "locale-shim.mjs")).href;
  const run = (env: Record<string, string>) => {
    const r = spawnSync(process.execPath, [tsx, "--tsconfig", path.join(here, "tsconfig.json"), fileURLToPath(import.meta.url), "--worker"], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, TZ: "UTC", ...env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${shim}`.trim() },
    });
    if (r.status !== 0) throw new Error(`worker çıkışı ${r.status}: ${r.stderr.slice(0, 1500)}`);
    return JSON.parse(r.stdout) as { houseRefs: { detect: [string, boolean, boolean][]; sanitized: unknown; localSpace: string[] }; sections: Record<string, unknown>; okCount: Record<string, boolean>; unavailable: Record<string, number>; intl: string; probes: { upper: string; number: string } };
  };
  const A = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "on", NEXT_LOCALE: "en", LANG: "en_GB.UTF-8", LC_ALL: "en_GB.UTF-8", I18N_TEST_DEFAULT_LOCALE: "en-GB" });
  const B = run({ NEXT_PUBLIC_I18N_LOCALE_SWITCHING: "off", NEXT_LOCALE: "tr", LANG: "tr_TR.UTF-8", LC_ALL: "tr_TR.UTF-8", I18N_TEST_DEFAULT_LOCALE: "tr-TR" });
  console.log(`  bilgi: Intl varsayılanı A=${A.intl} B=${B.intl}; sondalar A=${JSON.stringify(A.probes)} B=${JSON.stringify(B.probes)}`);
  ok(A.intl.startsWith("en") && B.intl.startsWith("tr"), "iki süreç GERÇEKTEN farklı yerel ayarda (en-GB / tr-TR)");
  ok(A.probes.upper === "I" && B.probes.upper === "İ" && A.probes.number !== B.probes.number, "dile duyarlı sondalar farklı (i→I / i→İ; 1,234.5 / 1.234,5)");

  const okA = Object.entries(A.okCount).filter(([, v]) => v).map(([k]) => k);
  console.log(`  bilgi: başarılı normalizer projeksiyonu ${okA.length}/${Object.keys(A.okCount).length}: ${okA.join(", ")}`);
  console.log(`  bilgi: yerelde hesaplanamayan (ör. DE440 veri dosyası yok) çağrı sayısı ${JSON.stringify(B.unavailable)} — iki dilde aynı hata da eşitlik kapsamında`);
  if (process.env.ATLAS_REQUIRE_DE440 === "1") {
    const missing = Object.values(A.unavailable).reduce((t, n) => t + n, 0) + Object.values(B.unavailable).reduce((t, n) => t + n, 0);
    ok(missing === 0, "ATLAS_REQUIRE_DE440=1: tüm efemeris/olay/tutulma/horary çağrıları iki dilde GERÇEKTEN hesaplandı (hata eşitliği kabul edilmez)", { A: A.unavailable, B: B.unavailable });
  }
  ok(okA.length >= 12, "normalizer kapsamı (≥12 teknik gerçek yanıtla projekte edildi)", A.okCount);
  ok(JSON.stringify(A.okCount) === JSON.stringify(B.okCount), "projeksiyon başarı durumu iki dilde aynı");

  const out: Record<string, string> = {};
  for (const k of Object.keys(B.sections)) {
    const a = sha(A.sections[k]);
    const b = sha(B.sections[k]);
    out[k] = b;
    ok(a === b, `${k}: TR = EN (sha ${b.slice(0, 16)})`);
  }
  const all = sha(B.sections);
  // QA-ATLAS-R5 P2-4 (sections dışı): ev atfı tespiti / yerel ev süzgeci / Local Space — TR = EN süreç ve beklenen isabetler.
  ok(sha(A.houseRefs) === sha(B.houseRefs), `houseRefs: TR = EN (sha ${sha(B.houseRefs).slice(0, 16)}; ${B.houseRefs.detect.length} örnek, ${B.houseRefs.localSpace.length} Local Space metni)`);
  ok(B.houseRefs.detect.filter(([x]) => !/seventh|first house/i.test(x)).every(([, tr]) => tr === true), "houseRefs: büyük/küçük harfli TR ev atfı örneklerinin hepsi TR ifadesinde isabet", B.houseRefs.detect);
  console.log(`  bilgi: tüm bölümler sha256 ${all}`);
  const outFile = process.argv.indexOf("--json") > 0 ? process.argv[process.argv.indexOf("--json") + 1] : null;
  if (outFile) fs.writeFileSync(outFile, JSON.stringify({ all, sections: out, okCount: B.okCount, unavailable: B.unavailable, intl: [A.intl, B.intl], probes: [A.probes, B.probes], staticFiles: s.files }, null, 2));

  console.log(`\natlas-locale-invariance: ${pass} PASS / ${fail} FAIL`);
  if (fail) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
