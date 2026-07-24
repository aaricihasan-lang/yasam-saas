/**
 * HD-2B doğrulama harness — Canonical Anahtar Sözleşmesi + Birebir Uyum
 * ====================================================================
 *
 * İKİ katman:
 *  (1) GERÇEK KAYNAK: yeni canonical sözleşmeler (canonicalKeys.ts /
 *      contracts.ts) Node yerel type-stripping ile OLDUĞU GİBİ import edilir
 *      (kopya değil, asıl kaynak). Extensionless `.ts` import'ları için
 *      minimal bir resolve hook data: URL modülü olarak register edilir.
 *  (2) BİREBİR UYUM: production `buildCodesFromChart` (hdRapor.ts) kaynaktan
 *      çıkarılır, TS soyulur ve ÇALIŞTIRILIR; yeni builder çıktılarıyla
 *      tip_/otorite_/kapi_/kanal_ aileleri için birebir karşılaştırılır.
 *      profil_/tanim_/merkez_* aileleri REGRESYON olarak korunur (silinmez).
 *
 * Deterministik: ağ yok, DB yok, production verisi yok.
 * Çalıştır (repo kökünden): node scripts/hd2b-canonical-contract-check.mjs
 */
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// ── Resolve hook: extensionless relative import → `.ts` (data: URL modülü) ─────
const HOOK = `
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && extname(spec) === '') {
    try {
      const b = ctx.parentURL ? new URL(spec, ctx.parentURL) : null;
      if (b) { const p = fileURLToPath(b) + '.ts';
        if (existsSync(p)) return { url: pathToFileURL(p).href, shortCircuit: true }; }
    } catch {}
  }
  return next(spec, ctx);
}`;
register("data:text/javascript," + encodeURIComponent(HOOK));

const ROOT = process.cwd();
const read = (p) => readFileSync(`${ROOT}/${p}`, "utf8");

let pass = 0, fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) { pass++; console.log(`  PASS  ${desc}`); }
  else { fail++; fails.push(desc); console.log(`  FAIL  ${desc}`); }
}
function throws(fn) { try { fn(); return false; } catch { return true; } }
const eqSet = (a, b) => a.length === b.length && new Set(a).size === new Set([...a, ...b]).size;

// ── Gerçek kaynakları import et ──────────────────────────────────────────────
const KS = pathToFileURL(`${ROOT}/lib/human-design/knowledge-system/`).href;
const K = await import(`${KS}canonicalKeys.ts`);
const C = await import(`${KS}contracts.ts`);
const CONST = await import(pathToFileURL(`${ROOT}/lib/human-design/constants.ts`).href);

// ── Gerçek buildCodesFromChart'ı kaynaktan çıkar, TS soy, çalıştır ────────────
function loadRealBuildCodes() {
  const src = read("app/human-design/rapor-olustur/helpers/hdRapor.ts");
  const m = src.match(
    /export function buildCodesFromChart\(chart: HumanDesignChart\): string\[\] \{[\s\S]*?\n\}/,
  );
  if (!m) throw new Error("buildCodesFromChart kaynağı çıkarılamadı");
  // Yalnız TS anotasyonlarını soy (mantık dokunulmaz): imza + `const codes: string[]`.
  const body = m[0]
    .replace(
      "export function buildCodesFromChart(chart: HumanDesignChart): string[]",
      "function buildCodesFromChart(chart)",
    )
    .replace(/:\s*string\[\]/g, "");
  return Function(`${body}\nreturn buildCodesFromChart;`)();
}
let realBuildCodes;
try { realBuildCodes = loadRealBuildCodes(); }
catch (e) { check(`Gerçek buildCodesFromChart yüklenebiliyor (${e.message})`, false); realBuildCodes = () => []; }

const inScope = (codes) => codes.filter((c) => /^(tip_|otorite_|kapi_|kanal_)/.test(c));
function expectedInScope(chart) {
  const out = [];
  if (chart.type_code) out.push(K.buildHdTypeCanonicalKey(chart.type_code));
  if (chart.authority_code) out.push(K.buildHdAuthorityCanonicalKey(chart.authority_code));
  for (const ch of chart.channels ?? []) out.push(K.buildHdChannelCanonicalKeyFromCode(ch));
  for (const g of chart.gates ?? []) out.push(K.buildHdGateCanonicalKey(g));
  return [...new Set(out)];
}

// ═════════════════════════════════════════════════════════════════════════════
// GRUP A — Canonical key üretimi (builder'lar)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP A: Canonical key üretimi ──");
check("A1. Tip anahtarı: buildHdTypeCanonicalKey('generator') = 'tip_generator'",
  K.buildHdTypeCanonicalKey("generator") === "tip_generator");
check("A2. Bileşik Tip kodu korunur: 'manifesting_generator' → 'tip_manifesting_generator'",
  K.buildHdTypeCanonicalKey("manifesting_generator") === "tip_manifesting_generator");
check("A3. Otorite anahtarı: 'sacral' → 'otorite_sacral'",
  K.buildHdAuthorityCanonicalKey("sacral") === "otorite_sacral");
check("A4. Kapı 1: buildHdGateCanonicalKey(1) = 'kapi_1'",
  K.buildHdGateCanonicalKey(1) === "kapi_1");
check("A5. Kapı 64: buildHdGateCanonicalKey(64) = 'kapi_64'",
  K.buildHdGateCanonicalKey(64) === "kapi_64");
check("A6. Geçersiz Kapı 0 → hata fırlatır", throws(() => K.buildHdGateCanonicalKey(0)));
check("A7. Geçersiz Kapı 65 → hata fırlatır", throws(() => K.buildHdGateCanonicalKey(65)));
check("A8. Geçerli Kanal: buildHdChannelCanonicalKey(34,57) = 'kanal_34_57'",
  K.buildHdChannelCanonicalKey(34, 57) === "kanal_34_57");
check("A9. Kanal canonical formatı: /^kanal_\\d+_\\d+$/",
  /^kanal_\d+_\d+$/.test(K.buildHdChannelCanonicalKey(10, 20)));
check("A10. Kanal kimliğinden: buildHdChannelCanonicalKeyFromCode('34-57') = 'kanal_34_57'",
  K.buildHdChannelCanonicalKeyFromCode("34-57") === "kanal_34_57");
check("A11. Geçersiz kanal biçimleri reddedilir ('abc' / yanlış ayraç '34_57' / boş)",
  throws(() => K.buildHdChannelCanonicalKeyFromCode("abc")) &&
  throws(() => K.buildHdChannelCanonicalKeyFromCode("34_57")) &&
  throws(() => K.buildHdChannelCanonicalKeyFromCode("")));
check("A12. Aynı Kapı iki kez kullanılan kanal REDDEDİLİR (34,34 ve '34-34')",
  throws(() => K.buildHdChannelCanonicalKey(34, 34)) &&
  throws(() => K.buildHdChannelCanonicalKeyFromCode("34-34")));
check("A13. Geçersiz Tip/Otorite kodu reddedilir",
  throws(() => K.buildHdTypeCanonicalKey("bogus")) &&
  throws(() => K.buildHdAuthorityCanonicalKey("bogus")));
check("A14. Ters Kanal sırası REDDEDİLİR (resmi sıra 34-57; buildHdChannelCanonicalKey(57,34) throw)",
  throws(() => K.buildHdChannelCanonicalKey(57, 34)));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP B — Parser / type guard
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP B: Parser / type guard ──");
check("B1. isHdTypeCanonicalKey('tip_generator')=true; bilinmeyen kod false",
  K.isHdTypeCanonicalKey("tip_generator") && !K.isHdTypeCanonicalKey("tip_bogus"));
check("B2. isHdAuthorityCanonicalKey('otorite_sacral')=true",
  K.isHdAuthorityCanonicalKey("otorite_sacral") && !K.isHdAuthorityCanonicalKey("otorite_x"));
check("B3. isHdGateCanonicalKey 'kapi_1' ve 'kapi_64' = true",
  K.isHdGateCanonicalKey("kapi_1") && K.isHdGateCanonicalKey("kapi_64"));
check("B4. isHdGateCanonicalKey 'kapi_0'/'kapi_65'/'kapi_34_1'(çizgi) = false",
  !K.isHdGateCanonicalKey("kapi_0") && !K.isHdGateCanonicalKey("kapi_65") &&
  !K.isHdGateCanonicalKey("kapi_34_1"));
check("B5. isHdChannelCanonicalKey 'kanal_34_57'=true; 'kanal_34_34'/'kanal_34' = false",
  K.isHdChannelCanonicalKey("kanal_34_57") && !K.isHdChannelCanonicalKey("kanal_34_34") &&
  !K.isHdChannelCanonicalKey("kanal_34"));
check("B6. profil_* İLK profesyonel canonical entity DEĞİL (guard false + parse null)",
  !K.isHdCanonicalKey("profil_3_5") && K.parseHdCanonicalKey("profil_3_5") === null);
check("B7. tanim_* canonical entity DEĞİL",
  !K.isHdCanonicalKey("tanim_single") && K.parseHdCanonicalKey("tanim_single") === null);
check("B8. merkez_* (tanimli/acik) canonical entity DEĞİL",
  !K.isHdCanonicalKey("merkez_tanimli_sacral") && !K.isHdCanonicalKey("merkez_acik_root"));
check("B9. strateji_* REDDEDİLİR ve entity türü DEĞİL (kind null + kinds listesinde yok)",
  !K.isHdCanonicalKey("strateji_generator") &&
  K.hdCanonicalEntityKindOf("strateji_generator") === null &&
  !K.HD_CANONICAL_ENTITY_KINDS.includes("strateji"));
check("B10. parseHdCanonicalKey doğru kind + alanları döner (4 aile)",
  K.parseHdCanonicalKey("tip_projector")?.kind === "tip" &&
  K.parseHdCanonicalKey("tip_projector")?.typeCode === "projector" &&
  K.parseHdCanonicalKey("otorite_emotional")?.authorityCode === "emotional" &&
  K.parseHdCanonicalKey("kapi_25")?.gateNumber === 25 &&
  K.parseHdCanonicalKey("kanal_10_20")?.gateA === 10 &&
  K.parseHdCanonicalKey("kanal_10_20")?.gateB === 20);
check("B11. hdCanonicalEntityKindOf 4 aile için doğru; bilinmeyen null",
  K.hdCanonicalEntityKindOf("tip_generator") === "tip" &&
  K.hdCanonicalEntityKindOf("otorite_sacral") === "otorite" &&
  K.hdCanonicalEntityKindOf("kapi_7") === "kapi" &&
  K.hdCanonicalEntityKindOf("kanal_7_31") === "kanal" &&
  K.hdCanonicalEntityKindOf("bilinmeyen") === null);
check("B12. isHdCanonicalKey 4 ailenin hepsini kabul eder",
  K.isHdCanonicalKey("tip_reflector") && K.isHdCanonicalKey("otorite_lunar") &&
  K.isHdCanonicalKey("kapi_1") && K.isHdCanonicalKey("kanal_47_64"));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP C — buildCodesFromChart BİREBİR uyum
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP C: buildCodesFromChart birebir uyum ──");
const full = {
  type_code: "manifesting_generator", authority_code: "emotional",
  profile_code: "3_5", definition_code: "split",
  active_centers: ["sacral", "throat"], open_centers: ["head"],
  gates: [34, 57, 10, 20], channels: ["34-57", "10-20"],
};
const realFull = realBuildCodes(full);
check("C1. Tip kodu birebir mevcut", realFull.includes(K.buildHdTypeCanonicalKey(full.type_code)));
check("C2. Otorite kodu birebir mevcut", realFull.includes(K.buildHdAuthorityCanonicalKey(full.authority_code)));
check("C3. Her Kapı için kapi_* birebir mevcut",
  full.gates.every((g) => realFull.includes(K.buildHdGateCanonicalKey(g))));
check("C4. Her Kanal için kanal_* birebir mevcut",
  full.channels.every((ch) => realFull.includes(K.buildHdChannelCanonicalKeyFromCode(ch))));
check("C5. Kapsam-içi alt küme (tip/otorite/kapi/kanal) builder çıktısıyla BİREBİR (eksik/fazla yok)",
  eqSet(inScope(realFull), expectedInScope(full)));
check("C6. null/boş → hiç tip_/otorite_/kapi_/kanal_ kodu yok",
  inScope(realBuildCodes({ type_code: null, authority_code: null, profile_code: null,
    definition_code: null, active_centers: [], open_centers: [], gates: [], channels: [] })).length === 0);
check("C7. Tekrarlar ayıklanır (Set) — kapi_34 ve kanal_34_57 birer kez",
  (() => { const r = realBuildCodes({ ...full, gates: [34, 34, 57], channels: ["34-57", "34-57"] });
    return r.filter((c) => c === "kapi_34").length === 1 &&
           r.filter((c) => c === "kanal_34_57").length === 1; })());
check("C8. Kanal tire biçimi: '34-57' → 'kanal_34_57' (dash→underscore, sıra korunur)",
  realBuildCodes({ ...full, channels: ["34-57"], gates: [] }).includes("kanal_34_57"));
// Tüm sabit yüzeyi: her Tip/Otorite/Kapı(1-64)/Kanal(36) için gerçek kod = builder
check("C9a. TÜM Tipler birebir (gerçek buildCodes === builder)",
  CONST.HUMAN_DESIGN_TYPES.every((t) =>
    realBuildCodes({ type_code: t.code, gates: [], channels: [] })[0] === K.buildHdTypeCanonicalKey(t.code)));
check("C9b. TÜM Otoriteler birebir",
  CONST.HUMAN_DESIGN_AUTHORITIES.every((a) =>
    realBuildCodes({ authority_code: a.code, gates: [], channels: [] })[0] === K.buildHdAuthorityCanonicalKey(a.code)));
check("C9c. TÜM Kapılar 1–64 birebir",
  Array.from({ length: 64 }, (_, i) => i + 1).every((g) =>
    realBuildCodes({ gates: [g], channels: [] })[0] === K.buildHdGateCanonicalKey(g)));
check("C9d. TÜM 36 Kanal birebir (kanal kimliği normalizasyonu)",
  CONST.HUMAN_DESIGN_CHANNELS.every((ch) =>
    realBuildCodes({ channels: [ch.code], gates: [] })[0] === K.buildHdChannelCanonicalKeyFromCode(ch.code)));
check("C10. REGRESYON: profil_/tanim_/merkez_tanimli_/merkez_acik_ aileleri KORUNUR (silinmemiş)",
  realFull.includes("profil_3_5") && realFull.includes("tanim_split") &&
  realFull.includes("merkez_tanimli_sacral") && realFull.includes("merkez_acik_head"));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP D — Sözleşme invariants
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP D: Sözleşme invariants ──");
const baseType = {
  canonicalKey: "tip_generator", typeCode: "generator",
  nameTr: "Generator", nameOriginal: "Generator",
  strategyText: "Yanıt vermeyi bekle.", signatureText: "Tatmin", notSelfText: "Hüsran",
  generalDescription: "Yaşam gücü tipi.", reportText: "Rapor metni.",
  status: "published", version: 1, sourceRefs: [],
};
check("D1. Geçerli published Tip sözleşmesi doğrulamayı geçer (problem yok)",
  C.validateHdTypeContract(baseType).length === 0);
check("D2. Tip içinde strategyText VARDIR; eksikse doğrulama sorun bildirir",
  "strategyText" in baseType &&
  C.validateHdTypeContract({ ...baseType, strategyText: undefined })
    .some((p) => /strategyText/.test(p)));
check("D3. AYRI Strategy entity YOK (buildHdStrategyCanonicalKey export'u yok, 'strateji' kind yok, HdStrategyContract yok)",
  !("buildHdStrategyCanonicalKey" in K) &&
  !K.HD_CANONICAL_ENTITY_KINDS.includes("strateji") &&
  !/HdStrategyContract|strategyCanonicalKey|buildHdStrategyCanonicalKey/.test(read("lib/human-design/knowledge-system/contracts.ts")) &&
  /strategyText/.test(read("lib/human-design/knowledge-system/contracts.ts")));
check("D4. Kapı sözleşmesinde ÇİZGİ (line) alanı YOK; 'line' varsa doğrulama reddeder",
  !/\bline\b\s*:|lineNumber|HdLineContract|kapi_\$\{[^}]*\}_\$\{/.test(read("lib/human-design/knowledge-system/contracts.ts")) &&
  C.validateHdGateContract({ canonicalKey: "kapi_34", gateNumber: 34, oppositeGateNumber: null,
    generalTheme: "", nameTr: "", nameOriginal: "", generalDescription: "", reportText: "",
    status: "draft", version: 1, sourceRefs: [], line: 3 }).some((p) => /çizgi|line/.test(p)));
check("D5. Kanal İKİ Kapıya bağlı; gateA===gateB reddedilir, farklıysa geçer",
  C.validateHdChannelContract({ canonicalKey: "kanal_34_34", channelCode: "34-34", gateA: 34, gateB: 34,
    centerA: "sacral", centerB: "spleen", circuitKey: null, generalTheme: "", fullChannelText: "",
    hangingGateContext: "", nameTr: "", nameOriginal: "", generalDescription: "", reportText: "",
    status: "draft", version: 1, sourceRefs: [] }).some((p) => /Kapı|gateA/.test(p)) &&
  C.validateHdChannelContract({ canonicalKey: "kanal_34_57", channelCode: "34-57", gateA: 34, gateB: 57,
    centerA: "sacral", centerB: "spleen", circuitKey: null, generalTheme: "", fullChannelText: "",
    hangingGateContext: "", nameTr: "Güç", nameOriginal: "Power", generalDescription: "x", reportText: "y",
    status: "draft", version: 1, sourceRefs: [] }).length === 0);
check("D6. published için minimum alanlar zorunlu; draft gevşek",
  C.validateHdContentBase({ canonicalKey: "kapi_5", version: 1, status: "published",
    sourceRefs: [], nameTr: "", generalDescription: "", reportText: "" }, "kapi")
    .some((p) => /published/.test(p)) &&
  C.validateHdContentBase({ canonicalKey: "kapi_5", version: 1, status: "draft",
    sourceRefs: [], nameTr: "", generalDescription: "", reportText: "" }, "kapi")
    .every((p) => !/published/.test(p)));
check("D7. version POZİTİF tam sayı olmalı (0 ve 1.5 reddedilir, 2 geçer)",
  !C.isValidContentVersion(0) && !C.isValidContentVersion(1.5) &&
  !C.isValidContentVersion(-1) && C.isValidContentVersion(2));
check("D8. canonicalKey entity kind ile UYUŞMALI (Tip sözleşmesinde otorite anahtarı reddedilir)",
  C.validateHdTypeContract({ ...baseType, canonicalKey: "otorite_sacral" })
    .some((p) => /canonicalKey/.test(p)) &&
  C.canonicalKeyMatchesKind("tip_generator", "tip") &&
  !C.canonicalKeyMatchesKind("tip_generator", "kapi"));
check("D9. oppositeGateNumber null VEYA 1–64 (65 reddedilir, null ve 12 geçer)",
  C.validateHdGateContract({ canonicalKey: "kapi_34", gateNumber: 34, oppositeGateNumber: 65,
    generalTheme: "t", nameTr: "n", nameOriginal: "o", generalDescription: "d", reportText: "r",
    status: "draft", version: 1, sourceRefs: [] }).some((p) => /oppositeGateNumber/.test(p)) &&
  C.validateHdGateContract({ canonicalKey: "kapi_34", gateNumber: 34, oppositeGateNumber: null,
    generalTheme: "t", nameTr: "n", nameOriginal: "o", generalDescription: "d", reportText: "r",
    status: "draft", version: 1, sourceRefs: [] }).length === 0);
check("D10. İlişki anahtarları geçerli (Kapı→Merkez, Kanal→2 Merkez, Kapı↔Kanal)",
  (() => {
    const rel1 = { gate: K.buildHdGateCanonicalKey(34), center: "sacral" };
    const rel2 = { channel: K.buildHdChannelCanonicalKey(34, 57), centerA: "sacral", centerB: "spleen" };
    const rel3 = { gate: K.buildHdGateCanonicalKey(34), channel: K.buildHdChannelCanonicalKey(34, 57) };
    return K.isHdGateCanonicalKey(rel1.gate) && K.isHdChannelCanonicalKey(rel2.channel) &&
           K.isHdGateCanonicalKey(rel3.gate) && K.isHdChannelCanonicalKey(rel3.channel);
  })());

// ═════════════════════════════════════════════════════════════════════════════
// GRUP F — HD-2B-FIX1 · Strict Kapı lexical format
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP F: Strict Kapı lexical format ──");
check("F1. kapi_1 → true", K.isHdGateCanonicalKey("kapi_1"));
check("F2. kapi_64 → true", K.isHdGateCanonicalKey("kapi_64"));
check("F3. kapi_01 → false (baştaki sıfır)", !K.isHdGateCanonicalKey("kapi_01"));
check("F4. kapi_001 → false", !K.isHdGateCanonicalKey("kapi_001"));
check("F5. kapi_1.0 → false", !K.isHdGateCanonicalKey("kapi_1.0"));
check("F6. kapi_+1 → false", !K.isHdGateCanonicalKey("kapi_+1"));
check("F7. 'kapi_ 1' → false (whitespace)", !K.isHdGateCanonicalKey("kapi_ 1"));
check("F8. kapi_1_1 → false (ek segment)", !K.isHdGateCanonicalKey("kapi_1_1"));
check("F9. parseHdCanonicalKey('kapi_01') === null", K.parseHdCanonicalKey("kapi_01") === null);

// ═════════════════════════════════════════════════════════════════════════════
// GRUP G — HD-2B-FIX1 · Strict Kanal lexical format
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP G: Strict Kanal lexical format ──");
const OFFICIAL_KEY = `kanal_${CONST.HUMAN_DESIGN_CHANNELS[0].code.replace(/-/g, "_")}`; // kanal_1_8
check(`G1. Resmi kanal anahtarı → true (${OFFICIAL_KEY})`, K.isHdChannelCanonicalKey(OFFICIAL_KEY));
check("G2. Baştaki sıfırlı eşdeğer → false (kanal_01_08)", !K.isHdChannelCanonicalKey("kanal_01_08"));
check("G3. Tek gate baştaki sıfır → false (kanal_1_08 / kanal_01_8)",
  !K.isHdChannelCanonicalKey("kanal_1_08") && !K.isHdChannelCanonicalKey("kanal_01_8"));
check("G4. Tire içeren key → false (kanal_1-8)", !K.isHdChannelCanonicalKey("kanal_1-8"));
check("G5. Ek segment → false (kanal_1_8_1 / kanal_10_20_extra)",
  !K.isHdChannelCanonicalKey("kanal_1_8_1") && !K.isHdChannelCanonicalKey("kanal_10_20_extra"));
check("G6. Whitespace → false ('kanal_1_8 ' / 'kanal_ 1_8')",
  !K.isHdChannelCanonicalKey("kanal_1_8 ") && !K.isHdChannelCanonicalKey("kanal_ 1_8"));
check("G7. parse('kanal_01_08') === null", K.parseHdCanonicalKey("kanal_01_08") === null);
check("G8. fromCode('01-08') REDDEDİLİR (baştaki sıfır)", throws(() => K.buildHdChannelCanonicalKeyFromCode("01-08")));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP H — HD-2B-FIX1 · Gerçek 36 kanal üyeliği
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP H: Gerçek 36 kanal üyeliği ──");
const officialKeys = CONST.HUMAN_DESIGN_CHANNELS.map((ch) => `kanal_${ch.code.replace(/-/g, "_")}`);
check("H1. 36 resmi kanalın TAMAMI guard tarafından kabul edilir",
  officialKeys.every((k) => K.isHdChannelCanonicalKey(k)));
check("H2. 36 resmi kanalın TAMAMI builder/fromCode/parser tarafından kabul edilir",
  CONST.HUMAN_DESIGN_CHANNELS.every((ch) => {
    const key = K.buildHdChannelCanonicalKeyFromCode(ch.code);
    const p = K.parseHdCanonicalKey(key);
    return key === `kanal_${ch.code.replace(/-/g, "_")}` &&
      p?.kind === "kanal" && K.buildHdChannelCanonicalKey(p.gateA, p.gateB) === key;
  }));
check("H3. Kabul edilen resmi Kanal sayısı TAM 36",
  officialKeys.filter((k) => K.isHdChannelCanonicalKey(k)).length === 36);
check("H4. Gerçek olmayan kanal_1_2 REDDEDİLİR (guard/parse/build/fromCode)",
  !K.isHdChannelCanonicalKey("kanal_1_2") && K.parseHdCanonicalKey("kanal_1_2") === null &&
  throws(() => K.buildHdChannelCanonicalKey(1, 2)) &&
  throws(() => K.buildHdChannelCanonicalKeyFromCode("1-2")));
check("H5. Aynı Kapıdan kanal REDDEDİLİR (build(34,34) / fromCode('34-34'))",
  throws(() => K.buildHdChannelCanonicalKey(34, 34)) &&
  throws(() => K.buildHdChannelCanonicalKeyFromCode("34-34")));
check("H6. Her resmi kanalın TERS sırası (resmi değilse) REDDEDİLİR",
  CONST.HUMAN_DESIGN_CHANNELS.every((ch) => {
    const [a, b] = ch.code.split("-").map(Number);
    const reversedKey = `kanal_${b}_${a}`;
    // ters biçim resmi kümede yoksa guard false ve builder throw olmalı
    return officialKeys.includes(reversedKey) ||
      (!K.isHdChannelCanonicalKey(reversedKey) && throws(() => K.buildHdChannelCanonicalKey(b, a)));
  }));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP I — HD-2B-FIX1 · Round-trip (builder→guard→parser→builder birebir)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP I: Round-trip ──");
function roundTripKind(items, build, kindField, backField) {
  return items.every((val) => {
    const key = build(val);
    if (!K.isHdCanonicalKey(key)) return false;
    const p = K.parseHdCanonicalKey(key);
    if (!p || p[kindField] !== val) return false;
    return build(p[backField]) === key;
  });
}
check("I1. 5 Tip round-trip",
  roundTripKind(CONST.HUMAN_DESIGN_TYPES.map((t) => t.code),
    (c) => K.buildHdTypeCanonicalKey(c), "typeCode", "typeCode"));
check("I2. 7 Otorite round-trip",
  roundTripKind(CONST.HUMAN_DESIGN_AUTHORITIES.map((a) => a.code),
    (c) => K.buildHdAuthorityCanonicalKey(c), "authorityCode", "authorityCode"));
check("I3. 64 Kapı round-trip",
  roundTripKind(Array.from({ length: 64 }, (_, i) => i + 1),
    (g) => K.buildHdGateCanonicalKey(g), "gateNumber", "gateNumber"));
check("I4. 36 Kanal round-trip (fromCode→guard→parse→build birebir)",
  CONST.HUMAN_DESIGN_CHANNELS.every((ch) => {
    const key = K.buildHdChannelCanonicalKeyFromCode(ch.code);
    if (!K.isHdChannelCanonicalKey(key)) return false;
    const p = K.parseHdCanonicalKey(key);
    return p?.kind === "kanal" && K.buildHdChannelCanonicalKey(p.gateA, p.gateB) === key;
  }));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP J — HD-2B-FIX1 · Kayıt içi canonical kimlik uyumu
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP J: Kayıt içi canonical kimlik uyumu ──");
const baseAuth = {
  canonicalKey: "otorite_sacral", authorityCode: "sacral",
  nameTr: "Sacral", nameOriginal: "Sacral", decisionMechanism: "yanıt",
  applicationText: "a", cautionNotes: "c", generalDescription: "d", reportText: "r",
  status: "draft", version: 1, sourceRefs: [],
};
const baseGate = {
  canonicalKey: "kapi_34", gateNumber: 34, centerKey: "sacral", oppositeGateNumber: null,
  circuitKey: null, generalTheme: "t", nameTr: "n", nameOriginal: "o",
  generalDescription: "d", reportText: "r", status: "draft", version: 1, sourceRefs: [],
};
const baseChannel = {
  canonicalKey: "kanal_34_57", channelCode: "34-57", gateA: 34, gateB: 57,
  centerA: "sacral", centerB: "spleen", circuitKey: null, generalTheme: "t",
  fullChannelText: "f", hangingGateContext: "h", nameTr: "n", nameOriginal: "o",
  generalDescription: "d", reportText: "r", status: "draft", version: 1, sourceRefs: [],
};
check("J1. Tip key/typeCode EŞLEŞME → problem yok",
  C.validateHdTypeContract(baseType).length === 0);
check("J2. Tip key/typeCode UYUMSUZ (tip_generator + projector) → hata",
  C.validateHdTypeContract({ ...baseType, typeCode: "projector" }).some((p) => /canonicalKey|typeCode/.test(p)));
check("J3. Otorite key/authorityCode EŞLEŞME → problem yok",
  C.validateHdAuthorityContract(baseAuth).length === 0);
check("J4. Otorite key/authorityCode UYUMSUZ → hata",
  C.validateHdAuthorityContract({ ...baseAuth, authorityCode: "lunar" }).some((p) => /canonicalKey|authorityCode/.test(p)));
check("J5. Kapı key/gateNumber EŞLEŞME → problem yok",
  C.validateHdGateContract(baseGate).length === 0);
check("J6. Kapı key/gateNumber UYUMSUZ (kapi_34 + 10) → hata",
  C.validateHdGateContract({ ...baseGate, gateNumber: 10 }).some((p) => /canonicalKey|gateNumber/.test(p)));
check("J7. Kanal key/channelCode/gateA/gateB TAM EŞLEŞME → problem yok",
  C.validateHdChannelContract(baseChannel).length === 0);
check("J8. Kanal YANLIŞ channelCode (kanal_34_57 + '10-20') → hata",
  C.validateHdChannelContract({ ...baseChannel, channelCode: "10-20" }).some((p) => /channelCode|canonicalKey/.test(p)));
check("J9. Kanal YANLIŞ gateA/gateB (kanal_34_57 + 10/20) → hata",
  C.validateHdChannelContract({ ...baseChannel, gateA: 10, gateB: 20 }).some((p) => /gateA|gateB/.test(p)));
check("J10. Kanal TERS gate sırası (kanal_34_57 + gateA57/gateB34) → hata",
  C.validateHdChannelContract({ ...baseChannel, gateA: 57, gateB: 34 }).some((p) => /gateA|gateB|ters/.test(p)));
check("J11. Kanal GERÇEK OLMAYAN çift (kanal_1_2 + '1-2') → hata",
  C.validateHdChannelContract({ ...baseChannel, canonicalKey: "kanal_1_2", channelCode: "1-2", gateA: 1, gateB: 2 })
    .some((p) => /channelCode|canonicalKey|kanal/.test(p)));

// ═════════════════════════════════════════════════════════════════════════════
// GRUP E — Kapsam / regresyon (mevcut HD harness'leri)
// ═════════════════════════════════════════════════════════════════════════════
console.log("── GRUP E: HD-1A / HD-1B regresyon ──");
try { execSync("node scripts/hd1a-workflow-safety-check.mjs", { cwd: ROOT, stdio: "pipe" });
  check("E1. HD-1A harness hâlâ PASS (exit 0)", true); }
catch { check("E1. HD-1A harness hâlâ PASS (exit 0)", false); }
try { execSync("node scripts/hd1b-missing-chart-warning-check.mjs", { cwd: ROOT, stdio: "pipe" });
  check("E2. HD-1B harness hâlâ PASS (exit 0)", true); }
catch { check("E2. HD-1B harness hâlâ PASS (exit 0)", false); }

console.log(`\nSONUÇ: ${pass} PASS / ${fail} FAIL`);
if (fail > 0) { console.log("FAILED:"); for (const f of fails) console.log("  - " + f); process.exit(1); }
