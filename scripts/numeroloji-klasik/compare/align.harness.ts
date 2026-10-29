/**
 * Klasik Numeroloji · Karşılaştırma harness'i (SENTETİK; ağ / DB / sağlayıcı çağrısı YOK).
 *
 * Mevcut Numeroloji kayıt şekilleri, Mevcut motor YALNIZ BU TESTTE salt-okunur çalıştırılarak üretilir
 * (gerçekçi `analysis_data` için). Karşılaştırma kütüphanesi Mevcut motoru içe AKTARMAZ (statik kontrol aşağıda).
 *
 * Çalıştır: npx tsx scripts/numeroloji-klasik/compare/align.harness.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

import { hesaplaNumeroloji } from "../../../lib/numeroloji/numerolojiMotor";
import { NUMEROLOJI_METHODOLOGY_VERSION } from "../../../lib/numeroloji/methodology";
import { pythagorean } from "../../../lib/numeroloji-klasik/oracle";
const isOracleError = pythagorean.isOracleError;
import type { ChartResult } from "../../../lib/numeroloji-klasik/model";

import { canonicalJson, canonicalSha256, sha256Hex } from "../../../lib/numeroloji-klasik/compare/hash";
import { COMPARE_GLOSSARY, COMPARE_RULES_TR, ONLY_CLASSIC, ONLY_LEGACY } from "../../../lib/numeroloji-klasik/compare/glossary";
import {
  LEGACY_METHODOLOGY_KNOWN,
  LEGACY_MISSING_REASON_TR,
  digitRoot,
  parseLegacyDisplay,
  readLegacySnapshot,
} from "../../../lib/numeroloji-klasik/compare/legacyReader";
import { alignRecords, buildNoteSnapshot, computeRelation, type AlignRow, type Alignment } from "../../../lib/numeroloji-klasik/compare/align";

let failures = 0;
let checks = 0;
function check(ok: boolean, label: string, detail?: unknown): void {
  checks++;
  if (ok) return;
  failures++;
  console.log(`✗ ${label}${detail !== undefined ? `\n    ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
}
function section(name: string): void {
  console.log(`— ${name}`);
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ── fikstür üreticileri ─────────────────────────────────────────────────────────────────────

type Person = { first: string; last: string; date: string /* GG.AA.YYYY */ };

function legacySnapshotFor(p: Person, opts: { methodology?: string | null; tas?: Record<string, string> } = {}): Record<string, unknown> {
  const motor = hesaplaNumeroloji({ firstName: p.first, lastName: p.last, birthDate: p.date });
  const out: Record<string, unknown> = { version: 1, motor: clone(motor), summary: "özet" };
  if (opts.tas) out.tas = opts.tas;
  if (opts.methodology !== null) out.calc = { methodology: opts.methodology ?? NUMEROLOJI_METHODOLOGY_VERSION, stampedAt: "2026-10-20T10:00:00.000Z" };
  return out;
}

const V = { status: "match" as const };
function classicChartFor(p: Person, targetDate = "2026-10-29"): ChartResult {
  const [dd, mm, yyyy] = p.date.split(".").map(Number);
  const fc = pythagorean.fullChart({ fullName: `${p.first} ${p.last}`, year: yyyy, month: mm, day: dd, targetDate, currentYear: Number(targetDate.slice(0, 4)) });
  const num = (o: { value: number; type: "single" | "master"; karmicDebt: number | null; trace: string } | { error: string } | null) => {
    if (!o || isOracleError(o)) throw new Error("oracle error");
    return { value: o.value, type: o.type, karmicDebt: o.karmicDebt, calculation: o.trace, meaning: null, method: "pythagorean" as const, verification: V };
  };
  const period = (x: { position: number; number: number; startAge: number; endAge: number | null }) => ({
    ...x, title: "", description: "", opportunities: [], challenges: [], lesson: null, howToOvercome: null, verification: V,
  });
  return {
    profile: { name: `${p.first} ${p.last}`, birthdate: `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}` },
    core: {
      lifePath: num(fc.lifePath),
      expression: num(fc.expression),
      soulUrge: num(fc.soulUrge),
      personality: num(fc.personality),
      birthDay: num(fc.birthDay),
      maturity: num(fc.maturity),
    },
    karmicLessons: { missingNumbers: fc.karmicLessons.missingNumbers, lessons: [], presentNumbers: Object.fromEntries(Object.entries(fc.karmicLessons.presentNumbers).map(([k, v]) => [k, v])), verification: V },
    karmicDebt: { hasKarmicDebt: fc.karmicDebtNumbers.length > 0, debtNumbers: fc.karmicDebtNumbers, meanings: [], message: null, verification: V },
    personalYear: {
      personalYear: fc.personalYear!.value, cycle: "", theme: "", forecast: "", opportunities: [], challenges: [], advice: "", verification: V,
      personalMonth: { personalMonth: fc.personalMonth!.value, theme: "", focus: "", verification: V },
    },
    pinnacles: fc.pinnacles.map(period),
    challenges: fc.challenges.map(period),
    hiddenPassion: { ...fc.hiddenPassion, title: "", description: "", verification: V },
    subconsciousSelf: { number: 0, uniqueNumbers: [], title: "", description: "", verification: V },
    nameLetters: { cornerstone: null, capstone: null, firstVowel: null },
    birthDayProfile: null,
    maturityStatus: { isActive: false, currentAge: 0, activationRange: "", verification: V },
    luckyAssociations: { colors: [], gemstones: ["Amethyst", "Ametist"], day: "", element: "", rulingPlanet: "", compatibleNumbers: [], incompatibleNumbers: [] },
    summary: "",
  } as ChartResult;
}

const FIRSTS = ["Hasan", "Ayşe", "Mehmet Ali", "Işıl", "Gülşen", "Çağrı", "Zeynep Su", "Ömer Faruk", "İlknur", "Yusuf", "Selin", "Mustafa Kemal"];
const LASTS = ["Arıcı", "Kaya", "Yılmaz", "Öztürk", "Şahin", "Doğan", "Çelik", "Ünal"];
const DATES = ["14.02.1987", "29.11.1975", "11.11.1990", "01.01.2000", "22.07.1966", "19.03.1984", "30.12.1999", "09.09.2009", "28.02.1958", "16.06.1971", "13.10.1993", "02.03.2000"];
const PEOPLE: Person[] = [];
for (let i = 0; i < FIRSTS.length; i++) for (let j = 0; j < LASTS.length; j++) PEOPLE.push({ first: FIRSTS[i], last: LASTS[j], date: DATES[(i * 3 + j) % DATES.length] });

const byKey = (a: Alignment, k: string, pos: number | null = null): AlignRow => {
  const r = a.rows.find((x) => x.conceptKey === k && x.position === pos);
  if (!r) throw new Error(`row ${k}/${pos} yok`);
  return r;
};

// ── 1) hash ─────────────────────────────────────────────────────────────────────────────────
section("hash");
for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "ğüşiöç İ ı — 11/11 (22)", "x".repeat(1000)]) {
  check(sha256Hex(s) === createHash("sha256").update(s, "utf8").digest("hex"), `sha256 node:crypto eşit (${s.length})`);
}
check(canonicalJson({ b: 1, a: [2, { d: 1, c: undefined }] }) === '{"a":[2,{"d":1}],"b":1}', "canonicalJson sıralı + undefined atılır");
check(canonicalSha256({ x: 1, y: { b: 2, a: 3 } }) === canonicalSha256({ y: { a: 3, b: 2 }, x: 1 }), "anahtar sırası özeti değiştirmez");
check(canonicalSha256({ x: 1 }) !== canonicalSha256({ x: 2 }), "içerik farkı özeti değiştirir");
check(canonicalJson(NaN) === "null" && canonicalJson([1, Infinity]) === "[1,null]", "sonlu olmayan sayı → null");

// ── 2) metodoloji damgası sürüklenmesi ──────────────────────────────────────────────────────
section("metodoloji");
check(LEGACY_METHODOLOGY_KNOWN === NUMEROLOJI_METHODOLOGY_VERSION, "bilinen damga = Bütüncül Numeroloji güncel damgası", { LEGACY_METHODOLOGY_KNOWN, NUMEROLOJI_METHODOLOGY_VERSION });

// ── 3) gösterim ayrıştırma ──────────────────────────────────────────────────────────────────
section("parseLegacyDisplay");
const P = (d: string) => parseLegacyDisplay(d);
check(isDeepStrictEqual(P("36/9"), { display: "36/9", main: "36/9", segments: [36, 9], parenthetical: null }), "36/9");
check(isDeepStrictEqual(P("19/3")?.segments, [19, 3]), "19/3");
check(isDeepStrictEqual(P("11/11 (22)"), { display: "11/11 (22)", main: "11/11", segments: [11, 11], parenthetical: "22" }), "11/11 (22)");
check(isDeepStrictEqual(P("22/19 (11/3)")?.segments, [22, 19]) && P("22/19 (11/3)")?.parenthetical === "11/3", "22/19 (11/3)");
check(isDeepStrictEqual(P("22-11")?.segments, [22, 11]), "22-11 tire ayırıcı");
check(P(" 8 ")?.display === " 8 ", "display kaydedildiği gibi (boşluk dahil)");
for (const bad of ["", "-", "—", "abc", "11/x", "()", "1.5"]) check(P(bad) === null, `geçersiz gösterim null: "${bad}"`);
check(parseLegacyDisplay(11 as unknown) === null, "sayı tipi gösterim null");
check(digitRoot(0) === 0 && digitRoot(9) === 9 && digitRoot(11) === 2 && digitRoot(38) === 2 && digitRoot(19) === 1, "digitRoot");

// ── 4) gerçekçi kayıtlar (Mevcut motor salt-okunur) × klasik oracle ────────────────────────
section(`gerçekçi kayıtlar (${PEOPLE.length} kişi)`);
const relCounts: Record<string, Record<string, number>> = {};
let kulvarRootFromDisplayAgree = 0;
let kulvarRootChecks = 0;
for (const p of PEOPLE) {
  const snap = legacySnapshotFor(p, { tas: { bileklik: "Ametist, Kaplan Gözü", kolye: "Kuvars" } });
  const before = clone(snap);
  deepFreeze(snap);
  const chart = deepFreeze(classicChartFor(p));
  const chartBefore = clone(chart);
  let a: Alignment;
  try {
    a = alignRecords(snap, chart);
  } catch (e) {
    check(false, `alignRecords fırlattı ${p.first} ${p.last}`, String(e));
    continue;
  }
  const tag = `${p.first} ${p.last} ${p.date}`;
  check(isDeepStrictEqual(snap, before), `Bütüncül Numeroloji kaydı değişmedi: ${tag}`);
  check(isDeepStrictEqual(chart, chartBefore), `Klasik sonuç değişmedi: ${tag}`);
  check(a.missing === null, `missing null: ${tag}`);
  check(a.legacyMeta.methodologyCurrent === true, `güncel damga tanındı: ${tag}`);
  check(a.sourceHashes.legacy === canonicalSha256(before) && /^[0-9a-f]{64}$/.test(a.sourceHashes.classic ?? ""), `kaynak özetleri: ${tag}`);
  check(isDeepStrictEqual(alignRecords(snap, chart), a), `deterministik: ${tag}`);

  for (const r of a.rows) {
    const k = r.position === null ? r.conceptKey : `${r.conceptKey}#${r.position}`;
    (relCounts[k] ??= {})[r.relation] = ((relCounts[k] ??= {})[r.relation] ?? 0) + 1;
    if (r.relation === "same_value") check(r.legacy!.value === r.classic!.value, `same_value yalnız birebir: ${tag} ${k}`);
  }

  const m = (snap as { motor: Record<string, { display: string; componentValues?: number[] }> }).motor;
  // Gösterim kaydedildiği gibi
  const hy = byKey(a, "hayat_yolu");
  check(hy.legacy?.display === m.hayatYolu.display, `HY display korunur: ${tag}`);
  check(byKey(a, "ana_kulvar").legacy?.display === m.anaKulvar.display, `Ana Kulvar display korunur: ${tag}`);
  // mod 9 değişmezliği: kökler iki ekolde aynı → en az same_root
  for (const k of ["hayat_yolu", "ifade", "ana_kulvar", "yan_kulvar"]) {
    const r = byKey(a, k);
    check(r.relation === "same_value" || r.relation === "same_root", `${k} kökü aynı: ${tag}`, { legacy: r.legacy, classic: r.classic });
  }
  // Kulvar kökü: componentValues ile gösterim sayılarının kökü aynı mı (eski kayıt geri düşüşü doğrulaması)
  for (const k of ["anaKulvar", "yanKulvar"] as const) {
    const cv = m[k].componentValues ?? [];
    const pd = parseLegacyDisplay(m[k].display);
    if (!pd || !cv.length) continue;
    kulvarRootChecks++;
    if (digitRoot(pd.segments.reduce((x, y) => x + y, 0)) === digitRoot(cv.reduce((x, y) => x + y, 0))) kulvarRootFromDisplayAgree++;
  }
  // Mücadele formül eşlemesi: dört konum birebir aynı sayı
  for (const pos of [1, 2, 3, 4]) {
    const r = byKey(a, "mucadele", pos);
    check(r.relation === "same_value", `mücadele ${pos} aynı değer: ${tag}`, { l: r.legacy, c: r.classic });
  }
  // Zirve 1 Metot 2 yaşı = Klasik 1. dönem bitişi
  const z1 = byKey(a, "zirve", 1);
  check(z1.legacy?.extra?.yasMetot2 === z1.classic?.extra?.endAge, `zirve 1 Metot 2 = Klasik bitiş: ${tag}`, { l: z1.legacy?.extra, c: z1.classic?.extra });
  // Kayıtta olmayanlar
  for (const k of ["dogum_gunu", "olgunluk", "kisisel_yil", "kisisel_ay"]) {
    const r = byKey(a, k);
    check(r.legacy === null && r.legacyMissingReason === "not_in_snapshot" && r.relation === "one_missing" && r.classic !== null, `${k} kayıtta yok → one_missing: ${tag}`);
  }
  check(byKey(a, "kisisel_gun").classicMissingReason === "not_requested", `kişisel gün istenmedi: ${tag}`);
  check(byKey(a, "karmik").relation === "not_comparable", `karmik not_comparable: ${tag}`);
  // Yalnız bir ekolde olanlar
  check(a.onlyLegacy.filter((x) => x.present).map((x) => x.key).join(",") === "pin_kodu,cakra_omurgasi,elementler,degisim_donusum,harflerin_yankilanisi", `onlyLegacy mevcut: ${tag}`);
  check(a.onlyLegacy.length === ONLY_LEGACY.length && a.onlyClassic.length === ONLY_CLASSIC.length, `only listeleri tam: ${tag}`);
  check(a.onlyClassic.find((x) => x.key === "ugurlu_iliskiler")?.present === true && a.onlyClassic.find((x) => x.key === "kopru_sayilari")?.present === false, `onlyClassic varlık: ${tag}`);
  // Taşlar (eşleştirici çıktısı yok → uğurlu taş metni)
  check(a.stones.legacyAssigned.length === 3 && a.stones.classicDirect.length === 2 && a.stones.overlap.length === 1 && a.stones.overlap[0].nameLegacy === "Ametist", `taş fallback + overlap: ${tag}`, a.stones);
  // Not anlık görüntüsü
  const ns = buildNoteSnapshot(a);
  check(Buffer.byteLength(JSON.stringify(ns), "utf8") < 262144, `not snapshot boyutu: ${tag}`);
  check(ns.sourceHashes.legacy === a.sourceHashes.legacy && ns.rows.length === a.rows.length && ns.rowsHash === canonicalSha256(ns.rows), `not snapshot bütünlük: ${tag}`);
}
check(kulvarRootChecks > 0 && kulvarRootFromDisplayAgree === kulvarRootChecks, `kulvar kökü: gösterim = bileşenler (${kulvarRootFromDisplayAgree}/${kulvarRootChecks})`);
console.log(`  kulvar kökü gösterim=bileşen: ${kulvarRootFromDisplayAgree}/${kulvarRootChecks}`);
console.log("  ilişki dağılımı:", JSON.stringify(relCounts));

// ── 5) özel / usta / karmik durumlar ───────────────────────────────────────────────────────
section("usta / karmik / aynı kök farklı gösterim");
const base = legacySnapshotFor({ first: "Hasan", last: "Arıcı", date: "14.02.1987" });
const baseChart = classicChartFor({ first: "Hasan", last: "Arıcı", date: "14.02.1987" });
function withMotor(patch: Record<string, unknown>): Record<string, unknown> {
  const s = clone(base);
  Object.assign(s.motor as Record<string, unknown>, patch);
  return deepFreeze(s);
}
function withCore(patch: Record<string, unknown>, extra: Partial<ChartResult> = {}): ChartResult {
  const c = clone(baseChart);
  Object.assign(c.core, patch);
  Object.assign(c, extra);
  return deepFreeze(c);
}
const N = (value: number, type: "single" | "master" = value === 11 || value === 22 || value === 33 ? "master" : "single", karmicDebt: number | null = null) => ({
  value, type, karmicDebt, calculation: "", meaning: null, method: "pythagorean" as const, verification: V,
});
{
  const a = alignRecords(withMotor({ ifadeSayisi: { display: "11", key: "11", steps: [] } }), withCore({ expression: N(2) }));
  const r = byKey(a, "ifade");
  check(r.relation === "same_root" && r.relation !== ("same_value" as string), "İfade 11 ↔ 2 → same_root (asla same_value)", r);
  const b = alignRecords(withMotor({ ifadeSayisi: { display: "2", key: "2", steps: [] } }), withCore({ expression: N(11) }));
  check(byKey(b, "ifade").relation === "same_root", "İfade 2 ↔ 11 → same_root");
  const c = alignRecords(withMotor({ ifadeSayisi: { display: "11", key: "11", steps: [] } }), withCore({ expression: N(11) }));
  check(byKey(c, "ifade").relation === "same_value", "İfade 11 ↔ 11 → same_value");
}
{
  const a = alignRecords(withMotor({ hayatYolu: { display: "29/11", key: "29/11", steps: [] } }), withCore({ lifePath: N(11) }));
  check(byKey(a, "hayat_yolu").relation === "same_value" && byKey(a, "hayat_yolu").legacy?.display === "29/11", "HY 29/11 ↔ 11 → same_value, gösterim korunur");
  const b = alignRecords(withMotor({ hayatYolu: { display: "29/11", key: "29/11", steps: [] } }), withCore({ lifePath: N(2) }));
  check(byKey(b, "hayat_yolu").relation === "same_root", "HY 29/11 ↔ 2 → same_root");
  const c = alignRecords(withMotor({ hayatYolu: { display: "19/10", key: "19/10", steps: [] } }), withCore({ lifePath: N(1, "single", 19) }));
  const rc = byKey(c, "hayat_yolu");
  check(rc.relation === "same_root" && rc.legacy?.value === 10 && rc.legacy.root === 1 && rc.classic?.karmicDebt === 19, "HY 19/10 ↔ 1 (karmik 19) → same_root; karmik işaret taşınır", rc);
  const d = alignRecords(withMotor({ hayatYolu: { display: "10/1", key: "10/1", steps: [] } }), withCore({ lifePath: N(1) }));
  check(byKey(d, "hayat_yolu").relation === "same_value", "HY 10/1 ↔ 1 → same_value");
  const e = alignRecords(withMotor({ hayatYolu: { display: "33/6", key: "33/6", steps: [] } }), withCore({ lifePath: N(33) }));
  check(byKey(e, "hayat_yolu").relation === "same_root", "HY 33/6 ↔ 33 → same_root (33 Mevcut'ta korunmaz)");
  const f = alignRecords(withMotor({ hayatYolu: { display: "32/5", key: "32/5", steps: [] } }), withCore({ lifePath: N(7) }));
  check(byKey(f, "hayat_yolu").relation === "different", "HY 32/5 ↔ 7 → different");
}
{
  const a = alignRecords(withMotor({ anaKulvar: { display: "11/11 (22)", key: "11", steps: [], componentValues: [11, 11], combinedReading: "22" } }), withCore({ soulUrge: N(22) }));
  const r = byKey(a, "ana_kulvar");
  check(r.relation === "same_root" && r.legacy?.value === null && r.legacy?.root === 4 && r.legacy.display === "11/11 (22)" && r.legacy.extra?.combinedReading === "22", "Ana Kulvar 11/11 (22) ↔ 22 → same_root, birleşik okuma yalnız ek bilgi", r.legacy);
  const b = alignRecords(withMotor({ anaKulvar: { display: "19/2", key: "2", steps: [], componentValues: [2, 19] } }), withCore({ soulUrge: N(3, "single", 19) }));
  const rb = byKey(b, "ana_kulvar");
  check(rb.relation === "same_root" && rb.legacy?.root === 3, "Ana Kulvar 19/2 ↔ 3 → same_root", rb.legacy);
  const kb = byKey(b, "karmik");
  check(kb.relation === "not_comparable" && isDeepStrictEqual(kb.legacy?.extra?.markers, [{ field: "anaKulvar", number: 19 }]), "karmik: Mevcut 19 işareti, not_comparable", kb);
  const c = alignRecords(withMotor({ anaKulvar: { display: "19/2", key: "2", steps: [] } }), withCore({ soulUrge: N(2) }));
  check(byKey(c, "ana_kulvar").legacy?.root === 3 && byKey(c, "ana_kulvar").legacy?.extra?.rootFrom === "display", "componentValues yoksa kök gösterimden");
  check(byKey(c, "ana_kulvar").relation === "different", "19/2 ↔ 2 → different (kalan 2 tek sayı değildir)");
  const d = alignRecords(withMotor({ yanKulvar: { display: "8", key: "8", steps: [], componentValues: [5, 3] } }), withCore({ personality: N(8) }));
  check(byKey(d, "yan_kulvar").relation === "same_value", "Yan Kulvar 8 ↔ 8 → same_value");
}
{
  const chart = withCore({}, { karmicDebt: { hasKarmicDebt: true, debtNumbers: [19, 13], meanings: [], message: null, verification: V } });
  const a = alignRecords(withMotor({}), chart);
  const r = byKey(a, "karmik");
  check(isDeepStrictEqual(r.classic?.extra?.debtNumbers, [19, 13]) && r.relation === "not_comparable", "karmik: Klasik 13/19 listelenir", r.classic);
}
check(computeRelation("value", { display: "11", value: 11, root: 2, source: "" }, { value: 2, type: "single", karmicDebt: null, root: 2, source: "" }) === "same_root", "computeRelation 11↔2");
check(computeRelation("not_comparable", { display: "19", value: 19, root: null, source: "" }, { value: 19, type: null, karmicDebt: null, root: 1, source: "" }) === "not_comparable", "not_comparable aynı sayıda bile");

// ── 6) eksik taraflar ──────────────────────────────────────────────────────────────────────
section("eksik taraflar");
{
  const a = alignRecords(null, baseChart);
  check(a.missing === "legacy" && a.sourceHashes.legacy === null && a.rows.every((r) => r.legacy === null && r.relation === "one_missing"), "Mevcut yok");
  check(byKey(a, "hayat_yolu").legacyMissingReason === "no_snapshot", "Mevcut yok sebebi");
  const b = alignRecords(base, null);
  check(b.missing === "classic" && b.sourceHashes.classic === null && b.rows.every((r) => r.classic === null && r.relation === "one_missing"), "Klasik yok");
  check(byKey(b, "hayat_yolu").classicMissingReason === "no_result", "Klasik yok sebebi");
  const c = alignRecords(null, null);
  check(c.missing === "both" && c.stones.overlap.length === 0, "iki taraf yok");
  const d = alignRecords(undefined, { personalDay: { personalDay: 5, targetDate: "2026-10-29" } });
  check(d.missing === "both", "personalDay tek başına → klasik kişi sonucu yok");
}

// ── 7) eski / kısmi / bozuk kayıtlar ────────────────────────────────────────────────────────
section("eski / kısmi kayıtlar");
{
  const noStamp = legacySnapshotFor({ first: "Ayşe", last: "Kaya", date: "29.11.1975" }, { methodology: null });
  check(alignRecords(noStamp, null).legacyMeta.methodologyCurrent === null, "damgasız kayıt → methodologyCurrent null");
  const oldStamp = legacySnapshotFor({ first: "Ayşe", last: "Kaya", date: "29.11.1975" }, { methodology: "num-v1-final-2026-10" });
  check(alignRecords(oldStamp, null).legacyMeta.methodologyCurrent === false, "eski damga → false");
  check(readLegacySnapshot({ version: 2, motor: {} }).reason === "unsupported_version", "version 2 desteklenmez");
  for (const bad of ["metin", 42, [1, 2], true]) check(readLegacySnapshot(bad).reason === "invalid_snapshot", `geçersiz analysis_data: ${JSON.stringify(bad)}`);
  check(readLegacySnapshot({ version: 1 }).reason === "invalid_snapshot", "motor yok");
  check(readLegacySnapshot({ motor: { hayatYolu: { display: "36/9" } } }).ok === true, "version alanı olmayan eski kayıt okunur");
  const partial = readLegacySnapshot({ version: 1, motor: { hayatYolu: { display: "-" }, ifadeSayisi: { display: "abc" }, anaKulvar: "bozuk" } });
  check(!partial.ok && partial.hayatYolu.ok === false && (partial.hayatYolu as { reason: string }).reason === "empty", "HY '-' → empty");
  check((partial.ifade as { reason: string }).reason === "unparseable", "İfade 'abc' → unparseable");
  check((partial.anaKulvar as { reason: string }).reason === "field_missing", "Ana Kulvar bozuk → field_missing");
  check(partial.zirve.reason === "field_missing" && partial.mucadele.reason === "field_missing", "zirve/mücadele yok");
  check(alignRecords({ version: 1, motor: { hayatYolu: { display: "-" } } }, baseChart).missing === "legacy", "çekirdek okunamazsa missing legacy");

  // Eski zirve (display/yasMetot yok; yalnız topic + age)
  const oldZ = withMotor({ zirveYillari: { gSade: 5, aSade: 2, ySade: 7, hayatYoluRoot: 5, peaks: [{ index: 1, topicRaw: 7, topic: 7, age: 29 }, { index: 2, topicRaw: 12, topic: 3, age: 38 }] } });
  const az = alignRecords(oldZ, baseChart);
  check(az.legacyMeta.zirveFormat === "tek_yas", "eski zirve formatı tek_yas");
  const z1 = byKey(az, "zirve", 1);
  check(z1.legacy?.display === "7" && z1.legacy.extra?.displayFromTopic === true && z1.legacy.extra?.yasMetot2 === 29, "eski zirve topic'ten okunur", z1.legacy);
  check(byKey(az, "zirve", 3).legacy === null && byKey(az, "zirve", 3).relation === "one_missing", "eksik zirve konumu one_missing");

  // Önceki metodoloji mücadele (nokta yaşlar, M3 = |M1−M2|, ana yok)
  const oldM = withMotor({ mucadeleYillari: { gSade: 5, aSade: 2, ySade: 7, method1: [{ index: 1, topic: 3, age: 33 }, { index: 2, topic: 2, age: 69 }, { index: 3, topic: 1, age: 105 }], method2: [] } });
  const am = alignRecords(oldM, baseChart);
  check(am.legacyMeta.mucadeleFormat === "onceki", "önceki mücadele formatı");
  check(byKey(am, "mucadele", 3).legacy?.value === 1 && byKey(am, "mucadele", 3).legacy?.extra?.legacyKey === "M3", "önceki M3 → Klasik 3. (ana)");
  check(byKey(am, "mucadele", 4).legacy === null && byKey(am, "mucadele", 4).classic !== null, "önceki formatta 4. konum Mevcut'ta yok");
  check(byKey(am, "mucadele", 1).legacy?.extra?.age === 33, "nokta yaş korunur");
  // kitap2 eşleme etiketleri
  const k2 = alignRecords(base, baseChart);
  check(["M1", "M2", "ana", "M3"].every((lk, i) => byKey(k2, "mucadele", i + 1).legacy?.extra?.legacyKey === lk), "kitap2: M1→1, M2→2, Ana→3, M3→4");
}

// ── 8) kişisel gün + taş eşleştirici çıktısı ───────────────────────────────────────────────
section("kişisel gün + taşlar");
{
  const stones = deepFreeze({
    libraryAvailable: true,
    providerDirect: [
      { input: "Amethyst", status: "matched", stoneKey: "ametist", nameTr: "Ametist", via: "alt_lang" },
      { input: "Moonstone", status: "unmatched" },
    ],
    groups: [],
    suggestions: [
      { stoneKey: "ametist", nameTr: "Ametist", nameEn: "Amethyst", primary: "provider_direct", reasons: [{ method: "provider_direct", explanation: "" }], symbolic: true },
      { stoneKey: "kaplan-gozu", nameTr: "Kaplangözü", nameEn: "Tigers Eye", primary: "vibration_exact", reasons: [{ method: "vibration_exact", explanation: "" }, { method: "planet", explanation: "" }], symbolic: true },
      { stoneKey: "yosun-akik", nameTr: "Yosun Akik", nameEn: "Moss Agate", primary: "planet", reasons: [{ method: "planet", explanation: "" }], symbolic: true },
    ],
    notes: [],
    disclaimer: { symbolic: true, text: "" },
  });
  const snap = deepFreeze(legacySnapshotFor({ first: "Hasan", last: "Arıcı", date: "14.02.1987" }, { tas: { bileklik: "Ametist, Kaplan Gözü ,  ", kolye: "Akik, ametist", kutle: "" } }));
  const before = clone(snap);
  const src = deepFreeze({ chart: baseChart, personalDay: { personalDay: 1, targetDate: "2024-02-20", theme: "" }, stones, bridge: {} });
  const srcBefore = clone(src);
  const a = alignRecords(snap, src);
  check(isDeepStrictEqual(snap, before) && isDeepStrictEqual(src, srcBefore), "girdiler değişmedi (taş/kişisel gün)");
  const pd = byKey(a, "kisisel_gun");
  check(pd.classic?.value === 1 && pd.classic.extra?.targetDate === "2024-02-20" && pd.relation === "one_missing", "kişisel gün klasik değer, Bütüncül Numeroloji kaydında yok", pd);
  check(a.stones.legacyAssigned.length === 4 && a.stones.legacyAssigned.every((s) => s.name.trim() === s.name && s.name.length > 0), "Mevcut taşları kırpılır, boşlar atılır", a.stones.legacyAssigned);
  check(a.stones.classicDirect.length === 2 && a.stones.classicDerived.map((d) => d.name).join(",") === "Kaplangözü,Yosun Akik", "klasik doğrudan / türetilmiş ayrımı", a.stones);
  const ov = a.stones.overlap.map((o) => o.nameLegacy).sort();
  check(isDeepStrictEqual(ov, ["Ametist", "Kaplan Gözü"]), "overlap: Ametist + Kaplan Gözü (boşluksuz eşitlik); Akik ⊄ Yosun Akik", a.stones.overlap);
  const am = a.stones.overlap.find((o) => o.nameLegacy === "Ametist")!;
  check(isDeepStrictEqual(am.slots.sort(), ["bileklik", "kolye"]) && am.classic.some((c) => c.source === "classic_direct"), "overlap köken korunur (slot + kaynak)", am);
  const kg = a.stones.overlap.find((o) => o.nameLegacy === "Kaplan Gözü")!;
  check(kg.classic[0].source === "classic_derived" && isDeepStrictEqual(kg.classic[0].methods, ["vibration_exact", "planet"]), "türetilmiş taş yöntemleri", kg);
  check(a.onlyClassic.find((x) => x.key === "kopru_sayilari")?.present === true, "köprü sonucu varlığı");
  const ns = buildNoteSnapshot(a);
  check(ns.stones.overlap.length === 2 && ns.stones.legacy.includes("kolye:ametist"), "not snapshot taş özeti");
}

// ── 9) birleşik sayı yok + metin kuralları ─────────────────────────────────────────────────
section("birleşik sayı yok / metin kuralları");
{
  const a = alignRecords(base, baseChart);
  const allowed = ["conceptKey", "position", "labelTr", "legacy", "legacyMissingReason", "classic", "classicMissingReason", "relation", "comparable", "sameNameDifferentFormula", "explanation"].sort();
  check(a.rows.every((r) => isDeepStrictEqual(Object.keys(r).sort(), allowed)), "satır anahtarları sabit (birleşik/ortak sayı alanı yok)");
  const json = JSON.stringify(a) + JSON.stringify(buildNoteSnapshot(a));
  check(!/merged|combinedNumber|unified|ortakSayi/i.test(json), "birleştirilmiş sayı alanı yok");
  check(a.rows.every((r) => r.explanation === COMPARE_GLOSSARY.find((g) => g.conceptKey === r.conceptKey)!.differenceTr), "açıklama yalnız sözlük metni");
}
{
  const texts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk([COMPARE_GLOSSARY, ONLY_LEGACY, ONLY_CLASSIC, COMPARE_RULES_TR, LEGACY_MISSING_REASON_TR]);
  check(texts.every((t) => !/roxy/i.test(t)), "uzman metinlerinde sağlayıcı adı yok");
  const keys = COMPARE_GLOSSARY.map((g) => g.conceptKey);
  check(new Set(keys).size === keys.length && keys.length === 12, "sözlük 12 tekil kavram");
  check(COMPARE_GLOSSARY.every((g) => g.differenceTr.length > 40 && g.legacyMethodTr.length > 20 && g.classicMethodTr.length > 20), "sözlük açıklamaları dolu");
  check(COMPARE_GLOSSARY.find((g) => g.conceptKey === "karmik")!.comparable === "not_comparable", "karmik karşılaştırılamaz");
}

// ── 10) statik sınır: karşılaştırma kütüphanesi Mevcut Numeroloji kodunu içe aktarmaz ───────
section("statik sınır");
{
  const dir = join(__dirname, "../../../lib/numeroloji-klasik/compare");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = readFileSync(join(dir, f), "utf8");
    const imports = [...src.matchAll(/(?:import|export)[^"']*from\s*["']([^"']+)["']/g)].map((m) => m[1]);
    check(imports.every((i) => !/lib\/numeroloji\/|app\/numeroloji|@\/lib\/numeroloji(?!-klasik)|\.\.\/\.\.\/numeroloji\//.test(i)), `${f}: Bütüncül Numeroloji içe aktarımı yok`, imports);
    check(!/server-only|node:|from\s+["']fs["']|supabase/.test(src), `${f}: saf (IO/sunucu bağımlılığı yok)`);
    check(!/roxy/i.test(src), `${f}: sağlayıcı adı yok`);
  }
}

console.log(`\n${checks - failures}/${checks} kontrol geçti${failures ? ` — ${failures} HATA` : ""}`);
process.exit(failures ? 1 : 0);
