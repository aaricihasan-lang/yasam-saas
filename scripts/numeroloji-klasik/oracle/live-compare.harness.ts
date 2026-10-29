/**
 * Canlı karşılaştırma harness'i: QA klasöründeki HAM sağlayıcı yanıtlarını bağımsız oracle ile karşılaştırır.
 * Ağ çağrısı YAPMAZ. QA klasörü yoksa "SKIP — LIVE DATA ABSENT" yazar ve 0 ile çıkar.
 * Bulguları QA klasörüne yazar: live-compare-findings.json (repo DIŞI).
 *
 * Kullanım: npx tsx scripts/numeroloji-klasik/oracle/live-compare.harness.ts [--verbose]
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeEndpointResponse, verifyWithOracle } from "../../../lib/numeroloji-klasik/normalize";
import * as P from "../../../lib/numeroloji-klasik/oracle/pythagorean";
import * as C from "../../../lib/numeroloji-klasik/oracle/chaldean";
import { foldName } from "../../../lib/numeroloji-klasik/oracle/text";
import { liveDataPresent, loadRaw, QA_DIR, type RawRecord } from "./common";

const verbose = process.argv.includes("--verbose");

if (!liveDataPresent()) {
  console.log(`SKIP — LIVE DATA ABSENT (${QA_DIR}/raw yok). Canlı karşılaştırma yapılmadı.`);
  process.exit(0);
}

type Check = { group: string; id: string; label: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const unverified: Array<{ id: string; path: string; note?: string }> = [];
const add = (group: string, id: string, label: string, ok: boolean, detail?: string) => {
  checks.push({ group, id, label, ok, detail });
  if (verbose || !ok) console.log(`${ok ? "✓" : "✗"} [${group}] ${id} ${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const raws = loadRaw().filter((r) => r.endpoint !== null);
const byId = new Map(raws.map((r) => [r.id, r]));

// ── 1) Hata vakaları: err-* → 4xx + validation_error; diğerleri 200
for (const r of raws) {
  const isErr = /(^|-)err-/.test(r.id) || r.id === "m02-ch2-novowel";
  if (isErr) {
    const code = (r.response as Record<string, unknown>)?.code;
    add("errors", r.id, "4xx + validation_error", r.http === 400 && code === "validation_error", `http=${r.http} code=${String(code)}`);
  } else {
    add("http", r.id, "HTTP 200", r.http === 200, `http=${r.http}`);
  }
}
const ok200 = raws.filter((r) => r.http === 200);

// ── 2) Normalize + oracle doğrulaması (verification ağacı)
type Normalized = { rec: RawRecord; data: unknown; verified: unknown };
const normalized: Normalized[] = [];
function walkVerifications(x: unknown, p: string, cb: (path: string, v: Record<string, unknown>) => void): void {
  if (Array.isArray(x)) return x.forEach((v, i) => walkVerifications(v, `${p}[${i}]`, cb));
  if (!x || typeof x !== "object") return;
  for (const [k, v] of Object.entries(x)) {
    if (k === "verification" && v && typeof v === "object") cb(p, v as Record<string, unknown>);
    else walkVerifications(v, p ? `${p}.${k}` : k, cb);
  }
}
for (const r of ok200) {
  const n = normalizeEndpointResponse(r.endpoint!, r.response);
  add("normalize", r.id, "normalize ok", n.ok, n.ok ? undefined : n.reason);
  if (!n.ok) continue;
  const v = verifyWithOracle(r.endpoint!, r.input, n.data);
  normalized.push({ rec: r, data: n.data, verified: v });
  walkVerifications(v, "", (p, ver) => {
    if (ver.status === "match") add("oracle", r.id, `${p || "$"} = ${JSON.stringify(ver.oracleValue)}`, true);
    else if (ver.status === "mismatch") add("oracle", r.id, `${p || "$"}`, false, String(ver.note));
    else unverified.push({ id: r.id, path: p || "$", note: ver.note as string | undefined });
  });
}

// ── 3) Hesap izindeki harf değerleri + Türkçe katlama (sağlayıcı "X=n" dizisi ↔ oracle harf dizisi)
function lettersFromCalc(calc: string): Array<{ letter: string; value: number }> {
  return [...calc.matchAll(/(?:^|[^A-Za-z])([A-Z])=(\d+)/g)].map((m) => ({ letter: m[1], value: Number(m[2]) }));
}
function nameOf(r: RawRecord): string | null {
  const b = r.body;
  return typeof b.fullName === "string" ? b.fullName : typeof b.name === "string" ? b.name : null;
}
const supported = (n: string) => foldName(n).dropped.length === 0;
for (const r of ok200) {
  const name = nameOf(r);
  if (!name || !supported(name)) continue;
  const resp = r.response as Record<string, any>;
  const py: Array<[string, string | undefined, P.OracleNumber | P.OracleError]> = [];
  const ch: Array<[string, string | undefined, C.ChaldeanNumber | P.OracleError]> = [];
  if (r.endpoint === "expression") py.push(["expression", resp.calculation, P.expression(name)]);
  if (r.endpoint === "soul_urge") py.push(["soulUrge", resp.calculation, P.soulUrge(name)]);
  if (r.endpoint === "personality") py.push(["personality", resp.calculation, P.personality(name)]);
  if (r.endpoint === "chart") {
    py.push(["expression", resp.coreNumbers?.expression?.calculation, P.expression(name)]);
    py.push(["soulUrge", resp.coreNumbers?.soulUrge?.calculation, P.soulUrge(name)]);
    py.push(["personality", resp.coreNumbers?.personality?.calculation, P.personality(name)]);
  }
  if (r.endpoint === "dual") {
    py.push(["dual.pythagorean", resp.pythagorean?.calculation, P.expression(name)]);
    ch.push(["dual.chaldean", resp.chaldean?.calculation, C.chaldeanDestiny(name)]);
  }
  if (r.endpoint === "chaldean") {
    ch.push(["destiny", resp.destiny?.calculation, C.chaldeanDestiny(name)]);
    ch.push(["soulUrge", resp.soulUrge?.calculation, C.chaldeanSoulUrge(name)]);
    ch.push(["personality", resp.personality?.calculation, C.chaldeanPersonality(name)]);
  }
  if (r.endpoint === "business_name") ch.push(["business", resp.calculation, C.chaldeanDestiny(name)]);
  for (const [label, calc, o] of [...py, ...ch]) {
    if (typeof calc !== "string" || P.isOracleError(o)) continue;
    const got = lettersFromCalc(calc);
    const exp = (o as { letters?: Array<{ letter: string; value: number }> }).letters ?? [];
    add("letters", r.id, `${label} harf dizisi + değerleri`, eq(got, exp), eq(got, exp) ? undefined : `sağlayıcı=${got.map((x) => x.letter + x.value).join("")} oracle=${exp.map((x) => x.letter + x.value).join("")}`);
  }
}

// ── 4) Chart ↔ tekil uç tutarlılığı (m02-c1..c5)
const CORE_MAP: Array<[string, string]> = [
  ["life-path", "lifePath"],
  ["expression", "expression"],
  ["soul-urge", "soulUrge"],
  ["personality", "personality"],
  ["birth-day", "birthDay"],
  ["maturity", "maturity"],
];
for (const k of ["c1", "c2", "c3", "c4", "c5"]) {
  const chart = byId.get(`m02-${k}-chart`)?.response as Record<string, any> | undefined;
  if (!chart) continue;
  for (const [ep, key] of CORE_MAP) {
    const single = byId.get(`m02-${k}-${ep}`)?.response as Record<string, any> | undefined;
    if (!single) continue;
    const c = chart.coreNumbers[key];
    add("consistency", `${k}`, `${key}.number/type/karmic`, eq([c.number, c.type, c.karmicDebtNumber ?? null], [single.number, single.type, single.karmicDebtNumber ?? null]), `chart=${c.number}/${c.karmicDebtNumber ?? "-"} tekil=${single.number}/${single.karmicDebtNumber ?? "-"}`);
    add("consistency", `${k}`, `${key}.calculation aynı`, c.calculation === single.calculation, c.calculation === single.calculation ? undefined : `chart="${c.calculation}" tekil="${single.calculation}"`);
    add("consistency", `${k}`, `${key}.meaning aynı`, eq(c.meaning, single.meaning));
  }
  const kl = byId.get(`m02-${k}-karmic-lessons`)?.response as Record<string, any> | undefined;
  if (kl) add("consistency", k, "karmicLessons aynı", eq(kl, chart.additionalInsights.karmicLessons));
  const kd = byId.get(`m02-${k}-karmic-debt`)?.response as Record<string, any> | undefined;
  if (kd) {
    const a = chart.additionalInsights.karmicDebt;
    add("consistency", k, "karmicDebt.debtNumbers aynı", eq([...kd.debtNumbers].sort(), [...a.debtNumbers].sort()), `chart=${JSON.stringify(a.debtNumbers)} tekil=${JSON.stringify(kd.debtNumbers)}`);
    add("consistency", k, "karmicDebt.meanings aynı", eq(kd.meanings, a.meanings));
  }
  const pyr = byId.get(`m02-${k}-personal-year`)?.response as Record<string, any> | undefined;
  if (pyr) {
    const a = { ...chart.additionalInsights.personalYear };
    delete a.personalMonth;
    add("consistency", k, "personalYear (2026) aynı", eq(pyr, a), `chart=${a.personalYear} tekil=${pyr.personalYear}`);
  }
  const pmr = byId.get(`m02-${k}-personal-month`)?.response as Record<string, any> | undefined;
  if (pmr) {
    const a = chart.additionalInsights.personalYear.personalMonth;
    add("consistency", k, "personalMonth (2026-10) aynı", eq([pmr.personalMonth, pmr.theme, pmr.focus], [a.personalMonth, a.theme, a.focus]), `chart=${a.personalMonth} tekil=${pmr.personalMonth}`);
  }
  const br = byId.get(`m02-${k}-bridge`)?.response as Record<string, any> | undefined;
  if (br) {
    const cn = chart.coreNumbers;
    const exp = P.bridges({ lifePath: cn.lifePath.number, expression: cn.expression.number, soulUrge: cn.soulUrge.number, personality: cn.personality.number });
    add("consistency", k, "bridge = chart çekirdek sayılarından", eq(Object.fromEntries(Object.keys(exp).map((x) => [x, br[x].bridge])), exp));
  }
}

// ── 5) Dual fazlalığı: dual == chart/expression.expression + chaldean.destiny ?
const dualVerdict: Array<{ id: string; pythSame: boolean | null; chalSame: boolean | null; detail: string[] }> = [];
const exprByName = new Map<string, Record<string, any>>();
const chalByName = new Map<string, Record<string, any>>();
for (const r of ok200.filter((x) => x.lang === "tr")) {
  const n = nameOf(r);
  if (!n) continue;
  const resp = r.response as Record<string, any>;
  if (r.endpoint === "expression") exprByName.set(n, resp);
  if (r.endpoint === "chart" && resp.coreNumbers && !exprByName.has(n)) exprByName.set(n, resp.coreNumbers.expression);
  if (r.endpoint === "chaldean") chalByName.set(n, resp);
}
for (const r of ok200.filter((x) => x.endpoint === "dual")) {
  const n = nameOf(r)!;
  const d = r.response as Record<string, any>;
  const e = exprByName.get(n);
  const c = chalByName.get(n);
  const detail: string[] = [];
  let pythSame: boolean | null = null;
  let chalSame: boolean | null = null;
  if (e) {
    pythSame = eq([d.pythagorean.number, d.pythagorean.type, d.pythagorean.calculation, d.pythagorean.title, d.pythagorean.keywords], [e.number, e.type, e.calculation, e.meaning.title, e.meaning.keywords]);
    if (!pythSame) detail.push(`pyth: dual=${d.pythagorean.number} "${d.pythagorean.calculation}" vs expr=${e.number} "${e.calculation}"`);
    add("dual", r.id, "pythagorean == expression (sayı/tip/iz/başlık/anahtar)", pythSame, detail.at(-1));
  }
  if (c) {
    chalSame = eq(
      [d.chaldean.total, d.chaldean.compound, d.chaldean.root, d.chaldean.calculation, d.chaldean.compoundMeaning, d.chaldean.planet, d.chaldean.title, d.chaldean.caution],
      [c.destiny.total, c.destiny.compound, c.destiny.root, c.destiny.calculation, c.destiny.compoundMeaning, c.numberMeaning.planet, c.numberMeaning.title, c.caution],
    );
    if (!chalSame) detail.push("chaldean alanları farklı");
    add("dual", r.id, "chaldean == chaldean.destiny + numberMeaning", chalSame, detail.at(-1));
  }
  dualVerdict.push({ id: r.id, pythSame, chalSame, detail });
}

// ── 6) Günlük determinizm
const d1 = byId.get("m02-daily-a-1")?.response;
const d2 = byId.get("m02-daily-a-2")?.response;
if (d1 && d2) add("daily", "m02-daily-a-1/2", "aynı tohum + tarih → birebir aynı yanıt", eq(d1, d2));
const den = byId.get("m02-daily-a-en")?.response as Record<string, any> | undefined;
if (d1 && den) add("daily", "m02-daily-a-en", "dil sayıyı değiştirmez", (d1 as any).number === den.number, `tr=${(d1 as any).number} en=${den.number}`);

// ── 7) Bileşik sayı kataloğu ↔ Kalde/işletme/dual compoundMeaning; işletme favorableCompound ↔ nature
const catalog = new Map<number, Record<string, any>>();
for (const r of ok200.filter((x) => x.endpoint === "compound_number" && x.lang === "tr")) catalog.set(Number(r.input.number), r.response as Record<string, any>);
add("catalog", "compound", "10..52 katalog tam (43)", catalog.size === 43, `adet=${catalog.size}`);
for (let n = 10; n <= 52; n++) {
  const c = catalog.get(n);
  if (!c) continue;
  add("catalog", `cmp-${n}`, "root = tek hane", c.root === ((n - 1) % 9) + 1, `root=${c.root}`);
  if (c.sameAs !== undefined) {
    const t = catalog.get(c.sameAs);
    add("catalog", `cmp-${n}`, `sameAs ${c.sameAs} anlamı aynı`, !!t && t.meaning === c.meaning && t.nature === c.nature);
  }
}
function compoundUses(r: RawRecord): Array<Record<string, any>> {
  const x = r.response as Record<string, any>;
  if (r.endpoint === "chaldean") return [x.destiny, x.soulUrge, x.personality].map((p) => p?.compoundMeaning).filter(Boolean);
  if (r.endpoint === "business_name") return x.compoundMeaning ? [x.compoundMeaning] : [];
  if (r.endpoint === "dual") return x.chaldean?.compoundMeaning ? [x.chaldean.compoundMeaning] : [];
  return [];
}
for (const r of ok200.filter((x) => x.lang === "tr")) {
  for (const cm of compoundUses(r)) {
    const c = catalog.get(cm.number);
    if (!c) continue;
    add("catalog", r.id, `compoundMeaning ${cm.number} == katalog`, eq([cm.name, cm.nature, cm.meaning, cm.sameAs ?? null], [c.name, c.nature, c.meaning, c.sameAs ?? null]));
  }
  if (r.endpoint === "business_name") {
    const x = r.response as Record<string, any>;
    const c = x.compound !== null ? catalog.get(x.compound) : undefined;
    const exp = c ? c.nature === "fortunate" : false;
    add("business", r.id, `favorableCompound == (katalog doğa 'fortunate')`, x.favorableCompound === exp, `compound=${x.compound} doğa=${c?.nature ?? "-"} favorable=${x.favorableCompound}`);
  }
}

// ── 8) Sayı anlamı kataloğu ↔ chart çekirdek anlamları
const meanings = new Map<number, Record<string, any>>();
for (const r of ok200.filter((x) => x.endpoint === "meanings" && x.lang === "tr")) meanings.set(Number(r.input.number), (r.response as any).meaning);
add("catalog", "meanings", "1-9, 11, 22, 33 katalog tam (12)", meanings.size === 12, `adet=${meanings.size}`);
for (const r of ok200.filter((x) => x.endpoint === "chart" && x.lang === "tr")) {
  const cn = (r.response as any).coreNumbers;
  for (const k of ["lifePath", "expression", "soulUrge", "personality", "maturity"]) {
    const m = meanings.get(cn[k].number);
    if (m) add("catalog", r.id, `${k} anlamı == meanings/${cn[k].number}`, eq(cn[k].meaning, m));
  }
}

// ── 9) lang=tr tamlığı: İngilizce kalan metin alanları
const EN = /\b(the|and|your|you|with|this|that|for|of|is|are|number|life|path)\b/gi;
const TRCH = /[çğıöşüÇĞİÖŞÜ]/;
const SKIP_KEYS = new Set(["calculation", "name", "seed", "date", "targetDate", "birthdate", "letter"]);
const englishFields = new Map<string, { count: number; total: number; sample: string }>();
function scan(x: unknown, p: string, ep: string): void {
  if (Array.isArray(x)) return x.forEach((v) => scan(v, `${p}[]`, ep));
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) if (!SKIP_KEYS.has(k)) scan(v, p ? `${p}.${k}` : k, ep);
    return;
  }
  if (typeof x !== "string" || x.length < 3) return;
  const key = `${ep}:${p}`;
  const row = englishFields.get(key) ?? { count: 0, total: 0, sample: "" };
  row.total++;
  const hits = (x.match(EN) ?? []).length;
  const words = x.split(/\s+/).length;
  const isEn = !TRCH.test(x) && (hits >= 2 || (words <= 3 && /^[A-Za-z][A-Za-z ()'-]*$/.test(x) && /\b(The|Sun|Moon|Fire|Water|Earth|Air|Sunday|Monday)\b/.test(x)));
  if (isEn) {
    row.count++;
    if (!row.sample) row.sample = x.slice(0, 80);
  }
  englishFields.set(key, row);
}
for (const r of ok200.filter((x) => x.lang === "tr")) scan(r.response, "", r.endpoint!);
const enRows = [...englishFields.entries()].filter(([, v]) => v.count > 0);
const errLang = raws.filter((r) => r.http === 400 && r.lang === "tr").map((r) => String((r.response as any)?.error ?? ""));
const errEnglish = errLang.filter((m) => !TRCH.test(m)).length;
let totalStrings = 0;
let enStrings = 0;
for (const v of englishFields.values()) {
  totalStrings += v.total;
  enStrings += v.count;
}

// ── 9b) TR ↔ EN eş yanıt karşılaştırması: aynı girdide TR yanıtta EN ile BİREBİR aynı kalan metinler = çevrilmemiş
const PAIRS: Array<[string, string]> = [];
for (const r of ok200.filter((x) => x.lang === "tr")) {
  const enId = r.id.replace(/-tr$/, "-en");
  if (enId !== r.id && byId.has(enId)) PAIRS.push([r.id, enId]);
}
if (byId.has("m02-daily-a-1") && byId.has("m02-daily-a-en")) PAIRS.push(["m02-daily-a-1", "m02-daily-a-en"]);
const ENUM_KEYS = new Set(["type", "nature", "rating"]);
/** TR ve EN yazımı aynı olan özel adlar (çeviri eksiği sayılmaz). */
const SAME_IN_TR = new Set(["Topaz", "Mars", "Opal"]);
const untranslated = new Map<string, { same: number; total: number; sample: string }>();
function leaves(x: unknown, p: string, out: Map<string, string>): void {
  if (Array.isArray(x)) return x.forEach((v, i) => leaves(v, `${p}[${i}]`, out));
  if (x && typeof x === "object") {
    for (const [k, v] of Object.entries(x)) if (!SKIP_KEYS.has(k) && !ENUM_KEYS.has(k)) leaves(v, p ? `${p}.${k}` : k, out);
    return;
  }
  if (typeof x === "string" && /[A-Za-z]{3,}/.test(x) && !SAME_IN_TR.has(x)) out.set(p, x);
}
for (const [trId, enId] of PAIRS) {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  leaves(byId.get(trId)!.response, "", a);
  leaves(byId.get(enId)!.response, "", b);
  const ep = byId.get(trId)!.endpoint!;
  for (const [p, v] of a) {
    if (!b.has(p)) continue;
    const key = `${ep}:${p.replace(/\[\d+\]/g, "[]")}`;
    const row = untranslated.get(key) ?? { same: 0, total: 0, sample: "" };
    row.total++;
    if (b.get(p) === v) {
      row.same++;
      if (!row.sample) row.sample = v.slice(0, 80);
    }
    untranslated.set(key, row);
  }
}
let pairStrings = 0;
let pairSame = 0;
for (const v of untranslated.values()) {
  pairStrings += v.total;
  pairSame += v.same;
}
const sameRows = [...untranslated.entries()].filter(([, v]) => v.same > 0);
add("lang", "tr-vs-en", `TR yanıtta EN ile aynı kalan metin yok (${PAIRS.length} çift)`, pairSame === 0, `${pairSame}/${pairStrings} metin aynı`);

// ── Özet + bulgu dosyası
const groups = [...new Set(checks.map((c) => c.group))];
console.log("\n── Özet (grup: ✓ / ✗)");
for (const g of groups) {
  const g1 = checks.filter((c) => c.group === g);
  console.log(`${g.padEnd(12)} ✓ ${g1.filter((c) => c.ok).length}  ✗ ${g1.filter((c) => !c.ok).length}`);
}
const pass = checks.filter((c) => c.ok).length;
const failed = checks.filter((c) => !c.ok);
/**
 * Kayıtlı bulgular (NK-xxx): sağlayıcı belgelenmiş algoritmadan sapıyor. Beklenti GEVŞETİLMEZ; ✗ yine sayılır,
 * yalnız çıkış kodu kayıtlı olmayan ✗ için 1 olur.
 */
const KNOWN_FINDINGS: Array<{ id: string; severity: "P1" | "P2" | "P3"; match: (c: Check) => boolean; title: string; expected: string }> = [
  {
    id: "NK-001",
    severity: "P2",
    match: (c) => c.group === "oracle" && c.label.startsWith("personalYear.personalMonth") && /cy|currentyear/.test(c.id),
    title: "chart: currentYear iç içe Kişisel Ay'ı da değiştiriyor (belge: yalnız Kişisel Yıl; personalMonth targetDate'ten okunur)",
    expected: "personalMonth = PM(PY(targetDate.yılı), targetDate.ayı)",
  },
  {
    id: "NK-002",
    severity: "P3",
    match: (c) => c.group === "oracle" && c.label.startsWith("nameLetters.firstVowel"),
    title: "chart: ilk adda A/E/I/O/U yoksa firstVowel = 'Y' (belgelenen sesli kümesi Y'yi sessiz sayar)",
    expected: "firstVowel yok (null) veya belgede Y istisnası",
  },
];
const knownOf = (c: Check) => KNOWN_FINDINGS.find((k) => k.match(c));
const unexplained = failed.filter((c) => !knownOf(c));
console.log(`TOPLAM: ✓ ${pass}  ✗ ${failed.length} (kayıtlı bulgu: ${failed.length - unexplained.length}, açıklanmamış: ${unexplained.length})  (doğrulanmadı: ${unverified.length} alan)`);
for (const k of KNOWN_FINDINGS) {
  const hits = failed.filter((c) => k.match(c));
  if (hits.length) console.log(`  ${k.id} [${k.severity}] ${k.title} — tekrar: ${hits.map((h) => h.id).join(", ")}`);
}
console.log(`lang=tr: İngilizce görünen metin alanı ${enStrings}/${totalStrings}; 400 hata mesajı İngilizce ${errEnglish}/${errLang.length}`);
for (const [k, v] of enRows) console.log(`  EN ${k} ${v.count}/${v.total} örn: "${v.sample}"`);
console.log(`TR↔EN çiftleri: ${PAIRS.length}; TR yanıtta EN ile aynı kalan metin ${pairSame}/${pairStrings}`);
for (const [k, v] of sameRows) console.log(`  AYNI ${k} ${v.same}/${v.total} örn: "${v.sample}"`);
const dualAll = dualVerdict.filter((d) => d.pythSame !== null && d.chalSame !== null);
console.log(`dual fazlalığı: ${dualAll.filter((d) => d.pythSame && d.chalSame).length}/${dualAll.length} isimde dual = expression + chaldean birebir`);

const unverifiedByPath = new Map<string, number>();
for (const u of unverified) {
  const k = `${u.path.replace(/\[\d+\]/g, "[]")} — ${u.note ?? ""}`;
  unverifiedByPath.set(k, (unverifiedByPath.get(k) ?? 0) + 1);
}
writeFileSync(
  path.join(QA_DIR, "live-compare-findings.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      rawFiles: raws.length,
      totals: { pass, fail: failed.length, unverifiedFields: unverified.length },
      byGroup: Object.fromEntries(groups.map((g) => [g, { pass: checks.filter((c) => c.group === g && c.ok).length, fail: checks.filter((c) => c.group === g && !c.ok).length }])),
      failures: failed.map((c) => ({ ...c, finding: knownOf(c)?.id ?? null })),
      findings: KNOWN_FINDINGS.map((k) => ({ id: k.id, severity: k.severity, title: k.title, expected: k.expected, repro: failed.filter((c) => k.match(c)).map((c) => ({ case: c.id, actual: c.detail })) })),
      unverified: Object.fromEntries(unverifiedByPath),
      langTr: { trEnPairs: PAIRS.length, sameAsEnglish: `${pairSame}/${pairStrings}`, sameFields: Object.fromEntries(sameRows), englishStringFields: enStrings, totalStringFields: totalStrings, fields: Object.fromEntries(enRows), errorMessagesEnglish: `${errEnglish}/${errLang.length}` },
      dual: dualVerdict,
    },
    null,
    2,
  ),
);
console.log(`bulgular → ${path.join(QA_DIR, "live-compare-findings.json")}`);
process.exit(unexplained.length ? 1 : 0);
