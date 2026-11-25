/**
 * I18N-F1-R5 / A7 (DA-1) — Atlas sağlayıcı dili önkoşulları: Türkçe anlatıya bağlı teknik kararların dil-bağımsız hâle
 * getirilmesi ve "dil değişince teknik haritaların yeniden ücretlenmesi" (I18N-0017) için kimlik ayrımı. Ağ / DB / ücretli
 * sağlayıcı çağrısı YOK; yalnız depodaki kayıtlı gerçek (TR) yanıtlar + açıkça SENTETİK İngilizce cümleler.
 *
 *   [K] Hesap kimliği: tüm tekniklerin birimleri (TECHNIQUES × örnek seçenekler) — inputHash değerleri, değişiklik ÖNCESİ
 *       kaydedilen vektörlerle BAYT-BAYT aynı; kimlik dili ASTRO_CHART_IDENTITY_LANG ("tr") ve sağlayıcı dili bayrağından
 *       bağımsız. Bayrak (ASTRO_PROVIDER_LANG_EN) varsayılan KAPALI → her ekran dilinde sağlayıcı dili "tr".
 *   [N] Açı niteliği: tüm golden açılarında sağlayıcı niteliği = ASPECT_NATURE_BY_TYPE[tür]; bilinmeyen (ör. başka dilde
 *       yerelleştirilmiş) nitelik sessizce düşmez → yapısal karşılık; değer yoksa null (eski davranış). Golden
 *       projeksiyonları değişiklikten önceki mapNature ile birebir.
 *   [H] Ev atfı süzgeci: TR'de eski birleşik ifade + tr-TR küçük harf ile birebir; EN sentetik cümlelerde tespit; doğrulanmamış
 *       dilde (de) açı/desen/özet anlatısı tümden çıkarılır (güvenli taraf).
 *   [L] Local Space yer atfı: TR golden metninde eski çıktı ile birebir; EN sentetik kalıp bağlanır; doğrulanmamış dilde AYNEN.
 *
 * Çalıştırma: npx tsx --tsconfig scripts/astrology/tsconfig.json scripts/astrology/atlas-provider-lang-a7.harness.ts
 * Kimlik vektörlerini yeniden yazmak (YALNIZ kimlik kodu değişmeden önce, gerekçeyle): ... --write-vectors
 */
import "./css-module-stub.cjs";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TECHNIQUES, type CalcUnit, type TechniqueDefinition, type UnitContext } from "@/lib/astrology/engine/techniques";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import * as Config from "@/lib/astrology/config";
import { ASPECT_NATURE_BY_TYPE, mapNature, mapNatureFor } from "@/lib/astrology/providers/roxy/shared";
import * as T from "@/lib/astrology/providers/roxy/timing";
import * as V from "@/lib/astrology/providers/roxy/vedic";
import { projectRoxyNatal } from "@/lib/astrology/providers/roxy/natal";
import {
  HOUSE_REFERENCE_RE,
  houseReferenceDetector,
  sanitizeNatalInterpretationForLocalHouses,
  textHasHouseReference,
} from "@/lib/astrology/houses/natalLocal";
import { localSpaceText, type LocalSpaceCenter } from "@/lib/astrology/localSpaceCenter";
import { ASPECT_TYPES, type AspectType, type NatalInterpretation } from "@/lib/astrology/model/western";

type J = Record<string, unknown>;
const FIX = join(__dirname, "fixtures");
const VECTORS = join(FIX, "i18n", "atlas-identity-vectors.json");
const readJson = (...p: string[]): J => JSON.parse(readFileSync(join(FIX, ...p), "utf8")) as J;

let pass = 0;
let fail = 0;
function t(name: string, fn: () => void): void {
  try {
    fn();
    pass += 1;
    console.log(`  PASS ${name}`);
  } catch (e) {
    fail += 1;
    console.error(`  FAIL ${name}\n       ${(e as Error).message.split("\n").slice(0, 6).join("\n       ")}`);
  }
}

// ─── [K] Hesap kimliği ──────────────────────────────────────────────────────────────────────────────────────────────
const NOW = new Date("2026-11-25T09:00:00Z");
const birth = { birthDate: "1990-07-15", birthTime: "14:30:00", utcOffsetSeconds: 10800, latitude: 41.0082, longitude: 28.9784 };
const partner = { birthDate: "1988-03-02", birthTime: "06:15:00", utcOffsetSeconds: 7200, latitude: 39.9334, longitude: 32.8597 };
const ctx: UnitContext = {
  birth,
  birthUtc: "1990-07-15T11:30:00Z",
  partner,
  places: { target: { latitude: 51.5072, longitude: -0.1276 } as never, reference: { latitude: 52.52, longitude: 13.405 } as never },
};
/** Her teknik için denenen ham seçenekler (parseOptions geçersiz sayarsa atlanır; kapsam ayrıca raporlanır). */
const OPTION_CANDIDATES: J[] = [
  {},
  { houseSystem: "placidus", nodeType: "true" },
  { houseSystem: "regiomontanus", nodeType: "mean" },
  { now: true },
  { date: "2026-11-25", time: "12:00", timezone: "Europe/Istanbul" },
  { targetDate: "2026-11-25" },
  { returnYear: 2026 },
  { returnDate: "2026-11-25" },
  { startDate: "2026-11-01", days: 30 },
  { start: "2026-11-01", days: 30 },
  { year: 2026, month: 11 },
  { ayanamsa: "lahiri" },
  { ayanamsa: "lahiri", division: 9 },
  { ayanamsa: "kp-newcomb", nodeType: "mean" },
  { horaryNumber: 101, now: true, ayanamsa: "kp-newcomb", nodeType: "mean" },
  { sections: ["asteroids", "lots", "lilith"], houseSystem: "placidus" },
  { orb: 3 },
  { age: 36 },
  { planet: "jupiter", count: 1 },
  { partnerProfileId: "11111111-1111-4111-8111-111111111111", houseSystem: "placidus", nodeType: "true" },
  { partnerProfileId: "11111111-1111-4111-8111-111111111111", ayanamsa: "lahiri" },
  { month: "2026-11", houseSystem: "placidus" },
  { month: "2026-11" },
  { planet: "jupiter", approxDate: "2026-11-25", houseSystem: "placidus" },
  { targetLocationId: "tr-34-istanbul", houseSystem: "placidus" },
  { date: "2026-11-25" },
  { horaryNumber: 101, now: true, ayanamsa: "kp-newcomb", nodeType: "mean", placeLocationId: "" },
  { year: 2026, month: 11, sections: ["ingress", "aspects", "lunar", "declination"] },
];

type Vec = { technique: string; option: number; part: number; endpoint: string; lang: string; inputHash: string };
function identityVectors(): { vectors: Vec[]; covered: string[]; notCovered: string[]; units: CalcUnit[] } {
  const vectors: Vec[] = [];
  const units: CalcUnit[] = [];
  const covered = new Set<string>();
  for (const def of Object.values(TECHNIQUES) as TechniqueDefinition[]) {
    OPTION_CANDIDATES.forEach((raw, i) => {
      let opts: Record<string, unknown> | null = null;
      try {
        opts = def.parseOptions(structuredClone(raw), NOW);
      } catch {
        opts = null;
      }
      if (!opts) return;
      let us: CalcUnit[] = [];
      try {
        us = def.units(ctx, opts);
      } catch {
        return;
      }
      for (const u of us) {
        covered.add(def.id);
        units.push(u);
        vectors.push({ technique: def.id, option: i, part: u.part, endpoint: u.endpoint, lang: u.lang, inputHash: u.inputHash });
      }
    });
  }
  const all = Object.keys(TECHNIQUES);
  return { vectors, covered: [...covered].sort(), notCovered: all.filter((x) => !covered.has(x)).sort(), units };
}

const writeMode = process.argv.includes("--write-vectors");
const iv = identityVectors();
if (writeMode) {
  writeFileSync(
    VECTORS,
    JSON.stringify(
      {
        source:
          "atlas-provider-lang-a7.harness.ts --write-vectors — kimlik kodu (ASTRO_CHART_IDENTITY_LANG) DEĞİŞMEDEN ÖNCE üretildi (work/i18n-mod-g-atlas 26f217b9b). Doğum verisi sentetik.",
        covered: iv.covered,
        notCovered: iv.notCovered,
        vectors: iv.vectors,
      },
      null,
      0,
    ) + "\n",
  );
  console.log(`kimlik vektörleri yazıldı: ${iv.vectors.length} birim, ${iv.covered.length} teknik`);
  process.exit(0);
}

console.log("\n[K] hesap kimliği (önbellek anahtarı) dilden bağımsız; mevcut kimlikler bayt-bayt aynı");
const saved = JSON.parse(readFileSync(VECTORS, "utf8")) as { covered: string[]; vectors: Vec[] };
console.log(`  bilgi: ${iv.vectors.length} birim / ${iv.covered.length} teknik kapsandı; kapsanmayan (Roxy birimi olmayan ya da örnek seçenekle planlanamayan): ${iv.notCovered.join(", ") || "yok"}`);
t("kimlik vektörleri değişiklik öncesiyle BAYT-BAYT aynı (inputHash + endpoint + parça)", () => {
  assert.equal(iv.vectors.length, saved.vectors.length, "birim sayısı");
  assert.deepEqual(iv.vectors, saved.vectors);
  assert.ok(iv.covered.length >= 30, `kapsam ${iv.covered.length} < 30`);
});
t("kimlik dili sabit ASTRO_CHART_IDENTITY_LANG = \"tr\" (tüm birimler)", () => {
  assert.equal(Config.ASTRO_CHART_IDENTITY_LANG, "tr");
  for (const u of iv.units) assert.equal(u.lang, Config.ASTRO_CHART_IDENTITY_LANG, `${u.technique} ${u.endpoint}`);
});
t("formül dile duyarlı kalır (calcInputHash değişmedi): kimlikte sağlayıcı dili olsaydı EN yeni anahtar = yeni ücretli çağrı olurdu", () => {
  // Birimin alanlarından yeniden kurulabilen kimlikler (bazı teknikler gövdeyi birim sonrası zenginleştirir; onlar vektör testinde).
  let n = 0;
  for (const u of iv.units) {
    const id = { provider: u.provider, providerApiVersion: u.providerApiVersion, adapterVersion: u.adapterVersion, endpoint: u.endpoint, lang: "tr", body: u.body, ...(u.query ? { query: u.query } : {}) };
    if (calcInputHash(id) !== u.inputHash) continue;
    n += 1;
    assert.notEqual(calcInputHash({ ...id, lang: "en" }), u.inputHash, `${u.technique} ${u.endpoint}`);
  }
  assert.ok(n >= 500, `yeniden kurulabilen kimlik ${n} < 500`);
});
t("kimlik üreticileri sağlayıcı dilini DEĞİL kimlik dilini kullanır (statik: ASTRO_PROVIDER_LANG kimlik alanında yok)", () => {
  const files = [
    "lib/astrology/engine/techniques.ts",
    "lib/astrology/engine/declinationParallels.ts",
    "lib/astrology/engine/vedicMatchTechniques.ts",
    "lib/astrology/engine/vedicMonthlyTechnique.ts",
    "lib/astrology/engine/vedicNoktaTechniques.ts",
    "scripts/astrology/kpHoraryLegacyUnits.ts",
  ];
  for (const f of files) {
    const src = readFileSync(join(__dirname, "..", "..", f), "utf8");
    assert.ok(!/lang:\s*ASTRO_PROVIDER_LANG\b/.test(src), `${f}: kimlikte ASTRO_PROVIDER_LANG`);
    assert.ok(/lang:\s*ASTRO_CHART_IDENTITY_LANG\b/.test(src), `${f}: kimlikte ASTRO_CHART_IDENTITY_LANG yok`);
  }
});
t("EN sağlayıcı bayrağı varsayılan KAPALI: her ekran dilinde sağlayıcı dili \"tr\"", () => {
  assert.equal(Config.isAstroProviderEnEnabled({}), false);
  assert.equal(Config.isAstroProviderEnEnabled({ ASTRO_PROVIDER_LANG_EN: "1" }), false);
  assert.equal(Config.isAstroProviderEnEnabled({ ASTRO_PROVIDER_LANG_EN: "TRUE" }), false);
  for (const loc of ["tr", "en", "de", ""]) assert.equal(Config.astroProviderLangFor(loc, {}), "tr", loc);
  assert.equal(Config.ASTRO_PROVIDER_LANG, "tr");
});
t("bayrak açıkken yalnız EN ekran → \"en\"; TR ve diğer diller → \"tr\" (kimlik yine \"tr\")", () => {
  const on = { ASTRO_PROVIDER_LANG_EN: "true" };
  assert.equal(Config.astroProviderLangFor("en", on), "en");
  assert.equal(Config.astroProviderLangFor("tr", on), "tr");
  assert.equal(Config.astroProviderLangFor("de", on), "tr");
});

// ─── [N] Açı niteliği ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n[N] açı niteliği: yapısal karşılık (golden kilidi) + bilinmeyen değer düşmez");
const ASPECT_ALIAS: Record<string, AspectType> = { SEMI_SEXTILE: "semi_sextile", SEMI_SQUARE: "semi_square" };
const typeOf = (v: unknown): AspectType | null => {
  if (typeof v !== "string") return null;
  const k = ASPECT_ALIAS[v] ?? v.toLowerCase();
  return (ASPECT_TYPES as readonly string[]).includes(k) ? (k as AspectType) : null;
};
const GOLDEN_WITH_ASPECTS = [
  "composite",
  "lunar-return",
  "lunar-return-london",
  "pr-jupiter-retro",
  "pr-mars-london",
  "pr-mercury-ws",
  "pr-saturn-next",
  "solar-return",
  "solar-return-london",
  "synastry",
  "transit",
  "progression",
  "solar-arc",
];
type Pair = { file: string; type: AspectType; value: string };
function collectPairs(): Pair[] {
  const out: Pair[] = [];
  const walk = (x: unknown, file: string) => {
    if (Array.isArray(x)) return x.forEach((v) => walk(v, file));
    if (!x || typeof x !== "object") return;
    const o = x as J;
    const ty = typeOf(o.type);
    for (const k of ["nature", "interpretation"]) {
      const v = o[k];
      if (ty && typeof v === "string" && v.length < 20) out.push({ file, type: ty, value: v });
    }
    for (const v of Object.values(o)) walk(v, file);
  };
  for (const f of GOLDEN_WITH_ASPECTS) walk((readJson("golden", `${f}.json`) as J).response, f);
  const natal = readJson("roxy-natal-golden-2026-10-07.json");
  walk(natal.response ?? natal, "roxy-natal-golden");
  return out;
}
const pairs = collectPairs();
t(`tüm golden açılarında sağlayıcı niteliği = ASPECT_NATURE_BY_TYPE[tür] (${pairs.length} açı, TR yerelleştirilmiş dahil)`, () => {
  assert.ok(pairs.length >= 500, `yalnız ${pairs.length} açı`);
  const trLocalized = pairs.filter((p) => !/^[a-z]+$/.test(p.value) || ["uyumlu", "notr"].includes(p.value));
  assert.ok(trLocalized.length >= 40, "TR yerelleştirilmiş nitelik örneği yok");
  for (const p of pairs) assert.equal(mapNature(p.value), ASPECT_NATURE_BY_TYPE[p.type], `${p.file}: ${p.type} ${p.value}`);
});
t("mapNatureFor: tanınan değerde eski mapNature ile birebir; tanınmayan değerde yapısal; boş/yok → null", () => {
  for (const p of pairs) assert.equal(mapNatureFor(p.value, p.type), mapNature(p.value));
  for (const ty of ASPECT_TYPES) {
    assert.equal(mapNatureFor("Harmonious", ty), "harmonious");
    assert.equal(mapNatureFor("CHALLENGING", ty), "challenging");
    assert.equal(mapNatureFor("supportive", ty), ASPECT_NATURE_BY_TYPE[ty]);
    assert.equal(mapNatureFor("harmonisch", ty), ASPECT_NATURE_BY_TYPE[ty]);
    assert.equal(mapNatureFor("", ty), null);
    assert.equal(mapNatureFor("   ", ty), null);
    assert.equal(mapNatureFor(undefined, ty), null);
    assert.equal(mapNatureFor(null, ty), null);
    assert.equal(mapNatureFor(3, ty), null);
  }
});
/** Golden yanıtındaki tüm nitelik değerlerini dönüştürür (sentetik başka-dil yanıtı). */
function rewriteNature(x: unknown, f: (v: string) => string | undefined): unknown {
  if (Array.isArray(x)) return x.map((v) => rewriteNature(v, f));
  if (!x || typeof x !== "object") return x;
  const o = { ...(x as J) };
  const ty = typeOf(o.type);
  for (const k of ["nature", "interpretation"]) if (ty && typeof o[k] === "string" && (o[k] as string).length < 20) {
    const nv = f(o[k] as string);
    if (nv === undefined) delete o[k];
    else o[k] = nv;
  }
  for (const [k, v] of Object.entries(o)) if (v && typeof v === "object") o[k] = rewriteNature(v, f);
  return o;
}
const g = (name: string) => readJson("golden", `${name}.json`) as { body: J; response: unknown };
const projections: Record<string, (raw: unknown) => unknown> = {
  transit: (raw) => T.projectRoxyTransit(raw, { nodeType: "true", atUtc: "2026-10-07T09:00:00Z" } as never),
  synastry: (raw) => T.projectRoxySynastry(raw, { houseSystem: "placidus", nodeType: "true" } as never),
  composite: (raw) => T.projectRoxyComposite(raw, { houseSystem: "placidus", nodeType: "true" } as never),
  solarReturn: (raw) => T.projectRoxyReturn(raw, "solar", { houseSystem: "placidus", returnYear: 2026, returnDate: null } as never),
  progression: (raw) => T.projectRoxyProgression(raw, { nodeType: "true", targetDate: String(g("progression").body.targetDate), request: g("progression").body } as never),
};
const goldenOf: Record<string, string> = { transit: "transit", synastry: "synastry", composite: "composite", solarReturn: "solar-return", progression: "progression" };
const natures = (p: unknown): unknown[] => {
  const out: unknown[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== "object") return;
    const o = x as J;
    if ("nature" in o && ("type" in o || "orb" in o)) out.push(o.nature);
    Object.values(o).forEach(walk);
  };
  walk(p);
  return out;
};
t("golden projeksiyonları: TR yanıtta nitelikler değişmedi; yalnız-EN-enum yanıtta aynı kanonik nitelikler (5 teknik)", () => {
  for (const [k, proj] of Object.entries(projections)) {
    const raw = g(goldenOf[k]).response;
    const base = proj(structuredClone(raw)) as { ok: boolean };
    assert.equal(base.ok, true, `${k} projeksiyonu`);
    const toEn = rewriteNature(structuredClone(raw), (v) => ({ uyumlu: "harmonious", "zorlayıcı": "challenging", "nötr": "neutral" })[v] ?? v);
    assert.deepEqual(proj(toEn), base, `${k}: EN enum`);
  }
});
t("bilinmeyen (sentetik başka-dil) nitelik: alan düşmez, yapısal karşılık = TR golden kararı; nitelik alanı yoksa null", () => {
  for (const [k, proj] of Object.entries(projections)) {
    const raw = g(goldenOf[k]).response;
    const base = natures(proj(structuredClone(raw)));
    const unk = natures(proj(rewriteNature(structuredClone(raw), () => "flowing-xyz")));
    assert.deepEqual(unk, base, `${k}: bilinmeyen değer`);
    const none = natures(proj(rewriteNature(structuredClone(raw), () => undefined)));
    assert.ok(none.every((x) => x === null), `${k}: nitelik yokken uydurulmamalı`);
  }
  const natalRaw = readJson("roxy-natal-golden-2026-10-07.json");
  const n = projectRoxyNatal(structuredClone(natalRaw.response ?? natalRaw), { houseSystem: "placidus", nodeType: "true" } as never) as { ok: boolean };
  assert.equal(n.ok, true);
});

// ─── [H] Ev atfı süzgeci (yerel ev sistemlerinde sağlayıcı yorumu) ────────────────────────────────────────────────────
console.log("\n[H] ev atfı süzgeci: sağlayıcı yanıt diline bağlı, ekran dilinden bağımsız");
/** Değişiklik ÖNCESİ (26f217b9b) textHasHouseReference — birebir kopya. */
const oldHas = (s: string | null | undefined): boolean => typeof s === "string" && HOUSE_REFERENCE_RE.test(s.toLocaleLowerCase("tr-TR"));
const oldSanitize = (i: NatalInterpretation) => {
  const aspects = i.aspects.filter((a) => !oldHas(a.summary) && !a.keywords.some((k) => oldHas(k)));
  const patterns = i.patterns.filter((p) => !oldHas(p.text));
  const overallRef = oldHas(i.overall?.aspectSummary);
  return {
    content: { ...i, bodies: [], aspects, patterns, overall: overallRef ? { ...i.overall, aspectSummary: null } : i.overall },
    removed: { bodies: i.bodies.length, aspects: i.aspects.length - aspects.length, patterns: i.patterns.length - patterns.length, overall: overallRef ? 1 : 0 },
  };
};
const natalRaw = readJson("roxy-natal-golden-2026-10-07.json");
const natalProj = projectRoxyNatal(structuredClone(natalRaw.response ?? natalRaw), { houseSystem: "placidus", nodeType: "true" } as never) as { ok: true; value: { interpretation: NatalInterpretation } };
const trInterp = natalProj.value.interpretation;
const allTrTexts = (i: NatalInterpretation): string[] =>
  [
    ...i.bodies.flatMap((b) => [b.summary, b.detailed]),
    ...i.aspects.flatMap((a) => [a.summary, ...a.keywords]),
    ...i.patterns.map((p) => p.text),
    i.overall?.aspectSummary,
  ].filter((x): x is string => typeof x === "string");
t(`TR: gerçek Natal yorumu (${allTrTexts(trInterp).length} metin) — eski fonksiyonla birebir; varsayılan dil = "tr"`, () => {
  assert.ok(allTrTexts(trInterp).length > 30);
  for (const s of allTrTexts(trInterp)) {
    assert.equal(textHasHouseReference(s), oldHas(s));
    assert.equal(textHasHouseReference(s, "tr"), oldHas(s));
  }
  assert.deepEqual(sanitizeNatalInterpretationForLocalHouses(trInterp), oldSanitize(trInterp));
  assert.deepEqual(sanitizeNatalInterpretationForLocalHouses(trInterp, "tr"), oldSanitize(trInterp));
  // Büyük harf / Türkçe İ varyantları da eski davranışla aynı.
  for (const s of allTrTexts(trInterp).slice(0, 40)) {
    const up = s.toLocaleUpperCase("tr-TR");
    assert.equal(textHasHouseReference(up, "tr"), oldHas(up));
  }
});
const EN_HOUSE = [
  "Your Sun in the Ninth House seeks meaning.",
  "With Mars in the 10th house, ambition is visible.",
  "Venus rules your seventh house of partnership.",
  "This aspect lights up your 4th-house matters.",
  "HOUSE 9 themes return.",
  "IN THE FIRST HOUSE, identity leads.",
  "Planets in cadent houses work behind the scenes.",
  "Support sits in the 2nd and the 12th from the Moon.",
];
const EN_PLAIN = [
  "Movement sets your selfhood alight, and you know who you are best when already halfway out the door.",
  "Your heart works through words, and a feeling only settles once you have found a way to express it.",
  "Tension between duty and desire asks for patience.",
  "A grand trine brings ease that can turn into complacency.",
  // R5 ROXY gerçek EN yanıtındaki eski yanlış pozitifler (çıplak "house" sözcüğü ev atfı değildir):
  "Psychology and the history of your household absorb you.",
  "A dream house sketched in a notebook, room by room, holds your hopes.",
  "Introducing it without burning the house down.",
  "An angular planet speaks loudly.",
];
t("EN (sentetik): ev atfı tespit edilir (büyük harf dahil); ev atfı olmayan cümleler korunur", () => {
  const en = houseReferenceDetector("en");
  assert.ok(en);
  for (const s of EN_HOUSE) assert.equal(en!(s), true, s);
  for (const s of EN_PLAIN) assert.equal(en!(s), false, s);
  // Eski davranış (TR küçük harf) büyük harfli İngilizce sıra sayısını KAÇIRIYORDU — kanıt:
  assert.equal(oldHas("IN THE FIRST HOUSE, identity leads."), false);
});
t("EN: sanitize yalnız ev atıflı öğeleri çıkarır; metin değişmez", () => {
  const i: NatalInterpretation = {
    ...trInterp,
    aspects: [...EN_HOUSE, ...EN_PLAIN].map((s, k) => ({ ...trInterp.aspects[k % trInterp.aspects.length], summary: s, keywords: [] })),
    patterns: [{ ...trInterp.patterns[0], text: EN_HOUSE[0] }, { ...trInterp.patterns[0], text: EN_PLAIN[0] }].filter((p) => p.kind !== undefined),
    overall: { ...trInterp.overall, aspectSummary: EN_PLAIN[1] },
  };
  const r = sanitizeNatalInterpretationForLocalHouses(i, "en");
  assert.deepEqual(r.content.aspects.map((a) => a.summary), EN_PLAIN);
  assert.equal(r.content.overall?.aspectSummary, EN_PLAIN[1]);
  assert.equal(r.content.bodies.length, 0);
});
t("doğrulanmamış dil (de): açı/desen/özet anlatısı tümden çıkarılır (güvenli taraf); gezegen yorumları her zaman çıkar", () => {
  assert.equal(houseReferenceDetector("de"), null);
  const r = sanitizeNatalInterpretationForLocalHouses(trInterp, "de");
  assert.equal(r.content.bodies.length, 0);
  assert.equal(r.content.aspects.length, 0);
  assert.equal(r.content.patterns.length, 0);
  assert.equal(r.content.overall?.aspectSummary ?? null, null);
});
t("süreç yerel ayarı kararı değiştirmez (tr-TR / en-GB küçük harf açık yerel ayarla)", () => {
  // houseReferenceDetector içinde yalnız AÇIK yerel ayarlı küçük harf kullanılır (toLocaleLowerCase("tr-TR") / toLowerCase()).
  const src = readFileSync(join(__dirname, "..", "..", "lib/astrology/houses/natalLocal.ts"), "utf8");
  assert.ok(!/toLocaleLowerCase\(\)/.test(src) && !/toLocaleUpperCase\(\)/.test(src));
});

// ─── [L] Local Space yer atfı ───────────────────────────────────────────────────────────────────────────────────────
console.log("\n[L] Local Space: merkez kararı yapısal; yer atfı yanıt diline göre");
const OLD_BIRTHPLACE_FROM = /([Dd])oğum yeri(?:niz)?den/g;
const oldLocalSpaceText = (text: string, center: LocalSpaceCenter | null): string => {
  if (!center || center.isBirthPlace) return text;
  const name = center.label ? ` (${center.label})` : "";
  return text.replace(OLD_BIRTHPLACE_FROM, (_m, d: string) => `${d === "D" ? "S" : "s"}eçilen merkezden${name}`);
};
const lsTexts: string[] = [];
(function walk(x: unknown) {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!x || typeof x !== "object") return;
  for (const v of Object.values(x as J)) {
    if (typeof v === "string" && v.length > 20) lsTexts.push(v);
    else walk(v);
  }
})((readJson("golden", "local-space.json") as J).response);
const centers: (LocalSpaceCenter | null)[] = [
  null,
  { label: null, latitude: 41, longitude: 29, isBirthPlace: true },
  { label: null, latitude: 52.52, longitude: 13.405, isBirthPlace: false },
  { label: "Berlin, Almanya", latitude: 52.52, longitude: 13.405, isBirthPlace: false },
];
t(`TR golden (${lsTexts.length} metin × 4 merkez): eski çıktı ile birebir; varsayılan dil = "tr"`, () => {
  assert.ok(lsTexts.some((s) => /oğum yeri/.test(s)));
  for (const s of lsTexts) for (const c of centers) {
    assert.equal(localSpaceText(s, c), oldLocalSpaceText(s, c));
    assert.equal(localSpaceText(s, c, "tr"), oldLocalSpaceText(s, c));
  }
});
t("EN (sentetik kalıp): yer atfı seçilen merkeze bağlanır; doğum yerindeyse / doğrulanmamış dilde AYNEN", () => {
  const s = "Your Sun line points southwest from your birthplace. From your birthplace, travel brings vitality.";
  assert.equal(localSpaceText(s, centers[3], "en"), "Your Sun line points southwest from the selected centre (Berlin, Almanya). From the selected centre (Berlin, Almanya), travel brings vitality.");
  assert.equal(localSpaceText(s, centers[1], "en"), s);
  assert.equal(localSpaceText(s, centers[3], "de"), s);
  // TR kalıbı EN yanıtta uygulanmaz; EN kalıbı TR yanıtta uygulanmaz.
  assert.equal(localSpaceText("Güneş hattınız, doğum yerinizden güneybatı yönünü gösterir.", centers[3], "en"), "Güneş hattınız, doğum yerinizden güneybatı yönünü gösterir.");
  assert.equal(localSpaceText(s, centers[3], "tr"), s);
});

// ─── [G] Gerçek TR / EN sağlayıcı yanıtları (R5 ROXY ajanı, 25.11.2026; sentetik kişiler; yeniden ücret YOK) ─────────────
console.log("\n[G] gerçek TR/EN yanıtları: kanonik teknik katman TR = EN; Natal yerel ev süzgeci kararları TR = EN");
const RG = join(FIX, "i18n", "roxy-tr-en-2026-11-25");
const rawOf = (f: string) => JSON.parse(readFileSync(join(RG, f), "utf8")) as { lang: string; body: J; response: unknown };
type NatalOk = { ok: true; value: { technical: unknown; interpretation: NatalInterpretation; unmappedFields: string[]; droppedValues: string[] } };
const natalPairs = ["p1", "p2", "p3"].map((p) => {
  const a = rawOf(`natal-${p}-tr.json`);
  const b = rawOf(`natal-${p}-en.json`);
  const o = { houseSystem: a.body.houseSystem, nodeType: a.body.nodeType } as never;
  return { p, lang: [a.lang, b.lang], tr: projectRoxyNatal(structuredClone(a.response), o) as NatalOk, en: projectRoxyNatal(structuredClone(b.response), o) as NatalOk };
});
t("Natal (3 kişi): yanıt dilleri gerçekten tr/en; kanonik teknik katman (gezegen, ev, ASC/MC, açı, orb, nitelik, düğüm) TR = EN", () => {
  for (const x of natalPairs) {
    assert.deepEqual(x.lang, ["tr", "en"], x.p);
    assert.equal(x.tr.ok && x.en.ok, true, x.p);
    assert.deepEqual(x.en.value.technical, x.tr.value.technical, `${x.p} technical`);
    assert.deepEqual(x.en.value.droppedValues, x.tr.value.droppedValues, `${x.p} dropped`);
    assert.deepEqual(x.en.value.unmappedFields, x.tr.value.unmappedFields, `${x.p} unmapped`);
  }
});
t("Natal yerel ev süzgeci (açı / desen / genel özet öğeleri): TR ve EN yanıtta öğe öğe AYNI karar; bedenler her iki dilde koşulsuz çıkar", () => {
  let items = 0;
  for (const x of natalPairs) {
    const T = x.tr.value.interpretation;
    const E = x.en.value.interpretation;
    const dt = houseReferenceDetector("tr")!;
    const de = houseReferenceDetector("en")!;
    const units = (i: NatalInterpretation, d: (s: string | null | undefined) => boolean) => [
      ...i.aspects.map((a) => d(a.summary) || a.keywords.some((k) => d(k))),
      ...i.patterns.map((p) => d(p.text)),
      d(i.overall?.aspectSummary),
    ];
    const a = units(T, dt);
    const b = units(E, de);
    assert.equal(b.length, a.length, x.p);
    assert.deepEqual(b, a, `${x.p} öğe kararları`);
    items += a.length;
    const st = sanitizeNatalInterpretationForLocalHouses(T, "tr");
    const se = sanitizeNatalInterpretationForLocalHouses(E, "en");
    assert.deepEqual(se.removed, st.removed, `${x.p} çıkarılan sayıları`);
  }
  assert.ok(items >= 120, `öğe ${items}`);
});
t("Transit (gerçek): TR yanıtın yerelleştirilmiş niteliği ('uyumlu'…) ve EN yanıtın kanonik niteliği aynı kanonik teknik katmanı verir", () => {
  const a = rawOf("transit-p1-tr.json");
  const b = rawOf("transit-p1-en.json");
  const o = { nodeType: "true", atUtc: String(a.body.transitDate ?? "") } as never;
  const x = T.projectRoxyTransit(structuredClone(a.response), o) as { ok: boolean; technical: unknown };
  const y = T.projectRoxyTransit(structuredClone(b.response), o) as { ok: boolean; technical: unknown };
  assert.equal(x.ok && y.ok, true);
  assert.deepEqual(y.technical, x.technical);
  const trNatures = JSON.stringify(a.response).match(/"nature":"(uyumlu|zorlayıcı|nötr)"/g) ?? [];
  assert.ok(trNatures.length > 10, "TR yanıtta yerelleştirilmiş nitelik bekleniyordu");
});
t("Local Space (gerçek): EN kalıbı 'from your birthplace' TR 'doğum yerinizden' ile aynı sayıda ve aynı yolda bağlanır", () => {
  const texts = (r: unknown) => {
    const out: [string, string][] = [];
    (function walk(x: unknown, p: string) {
      if (typeof x === "string") return void out.push([p, x]);
      if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${p}[${i}]`));
      if (x && typeof x === "object") for (const [k, v] of Object.entries(x as J)) walk(v, `${p}.${k}`);
    })(r, "");
    return out;
  };
  const center: LocalSpaceCenter = { label: "Berlin", latitude: 52.52, longitude: 13.405, isBirthPlace: false };
  const a = texts(rawOf("local-space-p1-tr.json").response);
  const b = new Map(texts(rawOf("local-space-p1-en.json").response));
  let changed = 0;
  for (const [p, s] of a) {
    const e = b.get(p);
    if (e === undefined) continue;
    const ct = localSpaceText(s, center, "tr") !== s;
    const ce = localSpaceText(e, center, "en") !== e;
    assert.equal(ce, ct, p);
    if (ct) {
      changed += 1;
      assert.ok(!/birthplace/i.test(localSpaceText(e, center, "en")), p);
    }
  }
  assert.equal(changed, 13);
});

t("ROXY B1: Panchanga tithi.rulingPlanet — gerçek TR 'Satürn' artık düşmüyor; TR = EN kanonik; bilinmeyen değer yine düşer", () => {
  const a = rawOf("panchang-basic-p1-tr.json");
  const b = rawOf("panchang-basic-p1-en.json");
  const x = V.projectRoxyVedicPanchanga(structuredClone(a.response)) as { ok: true; technical: { tithi: { rulingPlanet: string | null } }; droppedValues: string[] };
  const y = V.projectRoxyVedicPanchanga(structuredClone(b.response)) as typeof x;
  assert.equal(x.ok && y.ok, true);
  assert.equal(x.technical.tithi.rulingPlanet, "saturn");
  assert.ok(!x.droppedValues.includes("tithi.rulingPlanet"));
  // BULGU (R5): panchanga teknik katmanı sağlayıcının YERELLEŞTİRİLMİŞ üç gösterim metnini saklar (tithi.element,
  // nakshatra.deity, nakshatra.symbol) — hesap değil, açıklama. Bunlar dışındaki tüm alanlar TR = EN; bu üç alan kilitli.
  const strip = (t: unknown) => {
    const c = structuredClone(t) as { tithi: J; nakshatra: J };
    delete c.tithi.element;
    delete c.nakshatra.deity;
    delete c.nakshatra.symbol;
    return c;
  };
  assert.deepEqual(strip(y.technical), strip(x.technical), "panchanga teknik katman (3 yerelleştirilmiş metin hariç) TR = EN");
  const xt = x.technical as unknown as { tithi: J; nakshatra: J };
  const yt = y.technical as unknown as { tithi: J; nakshatra: J };
  assert.deepEqual([xt.tithi.element, yt.tithi.element], ["Toprak", "Earth"]);
  assert.notEqual(xt.nakshatra.deity, yt.nakshatra.deity);
  const g = (JSON.parse(readFileSync(join(FIX, "golden", "vedic-panchang.json"), "utf8")) as { response: J }).response;
  const names: [string, string | null][] = [["Güneş", "sun"], ["Ay", "moon"], ["Mars", "mars"], ["Merkür", "mercury"], ["Jüpiter", "jupiter"], ["Venüs", "venus"], ["Satürn", "saturn"], ["Rahu", "rahu"], ["Ketu", "ketu"], ["SATÜRN", "saturn"], ["saturn", "saturn"], ["Pluto", null]];
  for (const [v, want] of names) {
    const r = structuredClone(g) as J;
    (r.tithi as J).rulingPlanet = v;
    const p = V.projectRoxyVedicPanchanga(r) as { ok: true; technical: { tithi: { rulingPlanet: string | null } }; droppedValues: string[] };
    assert.equal(p.technical.tithi.rulingPlanet, want, v);
    assert.equal(p.droppedValues.includes("tithi.rulingPlanet"), want === null, v);
  }
  // Mevcut golden (EN adlı "Rahu") çıktısı değişmedi.
  const base = V.projectRoxyVedicPanchanga(structuredClone(g)) as { technical: { tithi: { rulingPlanet: string | null } } };
  assert.equal(base.technical.tithi.rulingPlanet, "rahu");
});

t("QA-ATLAS-R5 P2-1: EN ev atfı ifadesi gerçek EN kalıplarını yakalar (TR karşılıkları TR ifadesine takılıyordu); yanlış pozitif yok", () => {
  // Kaynak: ROXY ajanının gerçek EN yanıtları (roxy/ham/atlas, 25.11.2026) — natal career, lunar return purpose, Vedik yoga.
  const hits = [
    "Collaboration lifts you: the Moon, which commands your vocation, lives in the seventh, so shared projects and work done in pairs fit you well",
    "The Sun, head of your career house, rests in the fourth, so your public work stays rooted in a private base, and you build your standing from the ground up",
    "Pay attention to the Moon house position and aspects to other planets for emotional tone and priorities",
    "Chakra Yoga, the wheel, places every graha in the six odd houses from the Lagna",
    "All planets occupy six even houses.",
  ];
  for (const s of hits) assert.equal(textHasHouseReference(s, "en"), true, s);
  // Aynı yanıtlardaki ev atfı OLMAYAN cümleler süzülmez (natal açı özeti; çıplak "house" / sıra sayısı + isim).
  const clean = [
    "Like the friend who still shows up in the third hard week, you care steadily, Saturn giving the Moon emotional staying power.",
    "Solar return charts are used for annual forecasting.",
    "You keep a warm household and a dream house in mind.",
    "In the first place, you value loyalty.",
  ];
  for (const s of clean) assert.equal(textHasHouseReference(s, "en"), false, s);
  // TR davranışı birebir (ifade değişmedi): aynı cümlelerin gerçek TR karşılıkları TR ifadesinde.
  assert.equal(textHasHouseReference("Kariyer evinizi yöneten Güneş dördüncü evinizde", "tr"), true);
});

t("QA-ATLAS-R5 P1-1: ROXY B1 — ayrıntılı panchanga golden'ındaki GERÇEK 'Satürn' tithi bloğu temel projektörde 'saturn' (eski mapGraha: null + düşen alan)", () => {
  // vedic-panchang-detailed.json gerçek kayıt (lang=tr) tithi bloğu; temel golden'da bu değer "Rahu" olduğu için hata görünmüyordu.
  const det = (JSON.parse(readFileSync(join(FIX, "golden", "vedic-panchang-detailed.json"), "utf8")) as { response: J }).response;
  assert.equal((det.tithi as J).rulingPlanet, "Satürn", "fixture gerçek TR değeri");
  const basic = (JSON.parse(readFileSync(join(FIX, "golden", "vedic-panchang.json"), "utf8")) as { response: J }).response;
  const r = structuredClone(basic) as J;
  (r.tithi as J).rulingPlanet = (det.tithi as J).rulingPlanet; // yalnız gerçek değer (diğer alanlar temel yanıtla tutarlı kalsın)
  const p = V.projectRoxyVedicPanchanga(r) as { ok: boolean; technical: { tithi: { rulingPlanet: string | null } }; droppedValues: string[] };
  assert.equal(p.ok, true);
  assert.equal(p.technical.tithi.rulingPlanet, "saturn");
  assert.ok(!p.droppedValues.includes("tithi.rulingPlanet"));
  // Eski eşleyici (B1 öncesi) bu değeri tanımıyordu → mutasyonla kanıt: mapGrahaAnyLang yerine mapGraha konunca bu test FAIL verir.
  assert.equal(V.mapGrahaAnyLang("Satürn"), "saturn");
  // Sürüm kararı (QA P1-1): projeksiyon sürümü AYNI kalır — önbellek kimliği (inputHash) sürümü içermez, saklı satırlar yeniden
  // projekte edilmez; artırım eski satırları düzeltmez, yalnız etiketlerdi (korunan demo fixture + panchanga-detail kilidi).
  assert.equal(V.ROXY_VEDIC_PANCHANGA.projection, "vedic-panchanga-proj-1");
});

console.log(`\natlas-provider-lang-a7: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) process.exit(1);
