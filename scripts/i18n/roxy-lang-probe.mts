/**
 * I18N-F1-R1 — Roxy İNGİLİZCE İÇERİK DOĞRULAMASI (ÜCRETLİ, KONTROLLÜ; Owner kararı madde 7).
 *
 * Planlanan çağrı: 3 sağlayıcı (Astroloji Natal, Human Design Bodygraph, Klasik Numeroloji Chart) × 2 dil (tr, en) = 6.
 * Owner üst sınırı 100; bu betik VARSAYILAN olarak 6'yı aşmaz (--max ile en fazla 100). Yeniden deneme 0 (ücretli tekrar yok).
 * Sentetik kişi; gerçek danışan verisi GÖNDERİLMEZ. Ürünün ölçümlü fetch'i (trialMeteredFetch) KULLANILMAZ → DB'ye yazım yok;
 * her istek bu betiğin sayaçlı fetch'inden geçer. Çağrı sayısı sonuçta raporlanır.
 *
 * Değerlendirme (her sağlayıcı için):
 *   - Sayısal / mantıksal alanlar (derece, kapı, sayı…) TR ve EN yanıtında BİREBİR aynı mı? (dil matematiği değiştirmemeli)
 *   - EN yanıtındaki metin alanları gerçekten İngilizce mi? Türkçe karakter / bilinen Türkçe sözcük içeren EN metni
 *     "Türkçe kalan" sayılır. EN istenip TR ile birebir aynı dönen anlatı metni "çevrilmemiş" sayılır.
 *   - Sessiz Türkçe dönüş İngilizce PASS SAYILMAZ.
 * Önbellek ayrımı ağsız denetlenir: klasik numeroloji anahtarı + astroloji kimliği dil içeriyor mu.
 *
 * Kullanım (anahtar yalnız bu sürecin ortamında; dosyaya yazılmaz):
 *   ROXY_API_KEY=… npx tsx scripts/i18n/roxy-lang-probe.mts --confirm-paid [--max 6] [--out <json>]
 */
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

// "server-only" yalnız Next derleyicisinin bildiği bir takma ad → test sürecinde boş modüle yönlendirilir
// (scripts/numeroloji-klasik/api2/routes.harness.ts ile aynı desen). Modüller bu yüzden dinamik yüklenir.
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const stub = path.join(process.cwd(), "scripts", "final-hardening", "hday-stubs", "empty.cjs");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return stub;
    return orig.call(this, req, ...rest);
  };
}
const { classicCacheKey } = await import("../../lib/numeroloji-klasik/server/cache");
const { callClassicEndpoint, readClassicProviderConfig } = await import("../../lib/numeroloji-klasik/server/providerClient");
const { callRoxy } = await import("../../lib/astrology/providers/roxy/client");
const { readAstroRoxyConfig } = await import("../../lib/astrology/config");
const { buildNatalRequestBody, DEFAULT_NATAL_OPTIONS, ROXY_NATAL_ENDPOINT } = await import("../../lib/astrology/providers/roxy/natal");
const { callRoxyBodygraph } = await import("../../lib/human-design/providers/roxy/client");
const { readRoxyServerConfig } = await import("../../lib/human-design/providers/roxy/config");

const args = process.argv.slice(2);
const MAX = Math.min(100, Math.max(1, Number(args.includes("--max") ? args[args.indexOf("--max") + 1] : 6) || 6));
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

let calls = 0;
const meteredFetch = async (input: string, init: RequestInit): Promise<Response> => {
  if (calls >= MAX) throw new Error(`çağrı bütçesi aşıldı (${MAX})`);
  calls++;
  return fetch(input, init);
};

// Sentetik doğum (gerçek kişi değil).
const SYN = { date: "1990-04-01", time: "14:30:00", tz: "Europe/Istanbul", offset: 10800, lat: 41.0082, lon: 28.9784, name: "Test Persona" };

type Leaf = { path: string; value: unknown };
function leaves(v: unknown, p = "", out: Leaf[] = []): Leaf[] {
  if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${p}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) leaves(x, p ? `${p}.${k}` : k, out);
  else out.push({ path: p, value: v });
  return out;
}
const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = /\b(ve|bir|ile|için|olarak|kişi|enerji|güçlü|yaşam|burç|gezegen|ev(?:i|inde)?|merkez|kanal|kapı|sayı)\b/i;

function compare(trRaw: unknown, enRaw: unknown) {
  const a = new Map(leaves(trRaw).map((l) => [l.path, l.value]));
  const b = new Map(leaves(enRaw).map((l) => [l.path, l.value]));
  let numericSame = 0, numericDiff = 0;
  const numericDiffs: string[] = [];
  let enTexts = 0, enTurkish = 0, enUntranslated = 0, enEnglish = 0;
  const turkishSamples: string[] = [], untranslatedSamples: string[] = [], englishSamples: string[] = [];
  const structuralOnlyTr = [...a.keys()].filter((k) => !b.has(k)).length;
  const structuralOnlyEn = [...b.keys()].filter((k) => !a.has(k)).length;
  for (const [path, tv] of a) {
    if (!b.has(path)) continue;
    const ev = b.get(path);
    if (typeof tv === "number" || typeof tv === "boolean" || tv === null) {
      if (Object.is(tv, ev)) numericSame++;
      else { numericDiff++; if (numericDiffs.length < 10) numericDiffs.push(`${path}: tr=${tv} en=${ev}`); }
      continue;
    }
    if (typeof ev !== "string" || typeof tv !== "string") continue;
    const looksNarrative = ev.length >= 12 && /\s/.test(ev);
    if (!looksNarrative) continue;
    enTexts++;
    if (TR_CHARS.test(ev) || TR_WORDS.test(ev)) { enTurkish++; if (turkishSamples.length < 6) turkishSamples.push(`${path}: ${ev.slice(0, 90)}`); }
    else if (ev === tv) { enUntranslated++; if (untranslatedSamples.length < 6) untranslatedSamples.push(`${path}: ${ev.slice(0, 90)}`); }
    else { enEnglish++; if (englishSamples.length < 3) englishSamples.push(`${path}: ${ev.slice(0, 90)}`); }
  }
  return { numericSame, numericDiff, numericDiffs, structuralOnlyTr, structuralOnlyEn, enTexts, enEnglish, enTurkish, enUntranslated, turkishSamples, untranslatedSamples, englishSamples };
}

function verdict(c: ReturnType<typeof compare>) {
  const mathOk = c.numericDiff === 0;
  const english = c.enTexts > 0 && c.enTurkish === 0 && c.enUntranslated === 0;
  return { mathOk, englishSupported: english ? "PASS" : c.enTexts === 0 ? "DOĞRULANMADI (anlatı metni yok)" : c.enEnglish > 0 ? "KISMİ" : "FAIL" };
}

async function main() {
  // ── Ağsız: önbellek dil ayrımı ─────────────────────────────────────────────
  const base = { tenantId: "00000000-0000-4000-8000-000000000000", endpointId: "chart", input: { fullName: SYN.name }, specVersion: "x", adapterVersion: "y" };
  const kTr = classicCacheKey({ ...base, lang: "tr" } as never, "test-secret");
  const kEn = classicCacheKey({ ...base, lang: "en" } as never, "test-secret");
  const cacheSeparated = kTr !== kEn;
  console.log(`[önbellek] klasik numeroloji anahtarı dile göre ayrışıyor: ${cacheSeparated ? "EVET" : "HAYIR"}`);

  if (!process.env.ROXY_API_KEY) {
    console.log("ENGELLENDİ: ROXY_API_KEY bu süreçte tanımlı değil — ücretli çağrı YAPILMADI (0 çağrı).");
    console.log("=== roxy dil doğrulaması: 0 PASS / 0 FAIL (ENGELLENDİ) ===");
    process.exit(2);
  }
  if (!args.includes("--confirm-paid")) {
    console.log("ENGELLENDİ: ücretli çağrı için --confirm-paid gerekli (0 çağrı).");
    process.exit(2);
  }

  const results: Record<string, unknown> = {};
  // ── Astroloji Natal ────────────────────────────────────────────────────────
  const astroCfg = readAstroRoxyConfig();
  if (astroCfg) {
    const body = buildNatalRequestBody({ birthDate: SYN.date, birthTime: SYN.time, utcOffsetSeconds: SYN.offset, latitude: SYN.lat, longitude: SYN.lon }, DEFAULT_NATAL_OPTIONS);
    const tr = await callRoxy(astroCfg, ROXY_NATAL_ENDPOINT, body, { lang: "tr", maxRetries: 0, fetchImpl: meteredFetch });
    const en = await callRoxy(astroCfg, ROXY_NATAL_ENDPOINT, body, { lang: "en", maxRetries: 0, fetchImpl: meteredFetch });
    const c = tr.ok && en.ok ? compare((tr as { raw: unknown }).raw, (en as { raw: unknown }).raw) : null;
    results.astrologyNatal = { trOk: tr.ok, enOk: en.ok, compare: c, verdict: c ? verdict(c) : null };
  }
  // ── Human Design Bodygraph ─────────────────────────────────────────────────
  const hdCfg = readRoxyServerConfig();
  if (hdCfg) {
    const body = { date: SYN.date, time: SYN.time, timezone: SYN.tz, latitude: SYN.lat, longitude: SYN.lon, nodeType: "true" };
    const tr = await callRoxyBodygraph(hdCfg, body, { lang: "tr", fetchImpl: meteredFetch });
    const en = await callRoxyBodygraph(hdCfg, body, { lang: "en", fetchImpl: meteredFetch });
    const c = tr.ok && en.ok ? compare((tr as { raw: unknown }).raw, (en as { raw: unknown }).raw) : null;
    results.humanDesign = { trOk: tr.ok, enOk: en.ok, compare: c, verdict: c ? verdict(c) : null };
  }
  // ── Klasik Numeroloji Chart ────────────────────────────────────────────────
  const numCfg = readClassicProviderConfig();
  if (numCfg) {
    const payload = { fullName: SYN.name, year: 1990, month: 4, day: 1, targetDate: "2026-11-24" };
    const tr = await callClassicEndpoint(numCfg, "chart", payload, { lang: "tr", maxRetries: 0, fetchImpl: meteredFetch });
    const en = await callClassicEndpoint(numCfg, "chart", payload, { lang: "en", maxRetries: 0, fetchImpl: meteredFetch });
    const c = tr.ok && en.ok ? compare((tr as { raw: unknown }).raw, (en as { raw: unknown }).raw) : null;
    results.classicNumerology = { trOk: tr.ok, enOk: en.ok, compare: c, verdict: c ? verdict(c) : null };
  }

  const summary = { calls, max: MAX, cacheSeparated, results };
  console.log(JSON.stringify(summary, null, 1));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(summary, null, 1));
  const verdicts = Object.values(results).map((r) => (r as { verdict?: { mathOk: boolean; englishSupported: string } }).verdict);
  const pass = verdicts.filter((v) => v && v.mathOk && v.englishSupported === "PASS").length;
  console.log(`\nGerçek ücretli çağrı sayısı: ${calls}`);
  console.log(`=== roxy dil doğrulaması: ${pass} PASS / ${verdicts.length - pass} FAIL ===`);
  process.exit(pass === verdicts.length && verdicts.length === 3 ? 0 : 1);
}
main().catch((e) => { console.error(e); console.log(`Gerçek ücretli çağrı sayısı: ${calls}`); process.exit(1); });
