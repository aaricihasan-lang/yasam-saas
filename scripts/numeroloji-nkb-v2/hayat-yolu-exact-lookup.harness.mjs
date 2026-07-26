/**
 * NKB-V2-K1 — Hayat Yolu EXACT-only lookup harness'ı.
 *
 * GERÇEK production export'larını çalıştırır (knowledgeLookup.ts + stoneLookup.ts):
 *   exactValueFromResult · valueCandidatesFromResult · buildKnowledgeLookupPlan ·
 *   pickNotesForType · buildChakraLookupValues · buildElementLookupValues ·
 *   buildStoneLookupPlan · buildElementStoneLookupValues
 * Exact-helper mantığı harness içinde KOPYALANMAZ; ikinci implementasyon yoktur.
 *
 * Çalıştır (tsx ile — `@/` tsconfig path alias'larını ve .ts uzantısını çözer;
 * knowledgeLookup/stoneLookup transitif olarak @/lib import ettiğinden register-ts-hook
 * yetmez, repo'nun tsx runner'ı gerekir):
 *   npx tsx scripts/numeroloji-nkb-v2/hayat-yolu-exact-lookup.harness.mjs
 * FAIL > 0 → exit 1, FAIL = 0 → exit 0.
 */
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KL = pathToFileURL(join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers", "knowledgeLookup.ts")).href;
const SL = pathToFileURL(join(HERE, "..", "..", "app", "numeroloji", "bilgi-bankasi", "helpers", "stoneLookup.ts")).href;

const kl = await import(KL);
const sl = await import(SL);
const {
  exactValueFromResult,
  valueCandidatesFromResult,
  buildKnowledgeLookupPlan,
  pickNotesForType,
  buildChakraLookupValues,
  buildElementLookupValues,
} = kl;
const { buildStoneLookupPlan, buildElementStoneLookupValues } = sl;

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  const ok = Boolean(cond);
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${ok || !detail ? "" : " :: " + detail}`);
  if (ok) pass++;
  else fail++;
}
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const res = (v) => ({ display: v, key: v, steps: [] });
const kRow = (analysis_type, value) => ({ id: `${analysis_type}:${value}`, tenant_id: "T", analysis_type, value, source: "", description: `desc-${value}`, content_sections: null, updated_at: "2020-01-01" });

// motor çıktısı fixture (yalnız lookup'ın okuduğu alanlar)
const makeOut = (hy) => ({
  anaKulvar: res("1"),
  yanKulvar: res("19/1"),
  ifadeSayisi: res("7"),
  hayatYolu: res(hy),
  cakraOmurgasi: { harfler: { 1: 4, 2: 0 } },   // cNo1 FAZLA, kalan AZ
  elementler: { counts: { "Ateş": 4 } },        // Ateş FAZLA, kalan AZ
});

// 1) EXACT candidate
check("1 exactValueFromResult(32/5) → [32/5]", eqArr(exactValueFromResult(res("32/5")), ["32/5"]), JSON.stringify(exactValueFromResult(res("32/5"))));
// 2) PARÇALANMA YOK
{
  const c = exactValueFromResult(res("32/5"));
  check("2 32/5 adaylarında '32' ve '5' YOK", !c.includes("32") && !c.includes("5") && c.length === 1, JSON.stringify(c));
}
// 3) DİĞER BİLEŞİKLER
check("3a 12/3 → [12/3]", eqArr(exactValueFromResult(res("12/3")), ["12/3"]));
check("3b 19/1 → [19/1]", eqArr(exactValueFromResult(res("19/1")), ["19/1"]));
check("3c 41/7 → [41/7]", eqArr(exactValueFromResult(res("41/7")), ["41/7"]));
check("3d 29/11 → [29/11] (29 ve 11 YOK)", eqArr(exactValueFromResult(res("29/11")), ["29/11"]));
// 4) YALIN DEĞERLER
check("4a 5 → [5]", eqArr(exactValueFromResult(res("5")), ["5"]));
check("4b 7 → [7]", eqArr(exactValueFromResult(res("7")), ["7"]));
check("4c 22 → [22]", eqArr(exactValueFromResult(res("22")), ["22"]));
// 5) BOŞ GÜVENLİĞİ
check("5a boş key/display → []", eqArr(exactValueFromResult({ display: "", key: "", steps: [] }), []));
check("5b '-' → []", eqArr(exactValueFromResult(res("-")), []));
check("5c key boş, display=29/11 → [29/11]", eqArr(exactValueFromResult({ display: "29/11", key: "", steps: [] }), ["29/11"]));

// buildKnowledgeLookupPlan: Hayat Yolu tek aday
const kplan = buildKnowledgeLookupPlan(makeOut("32/5"));
const kHayat = kplan.find((p) => p.analysisType === "hayat-yolu");
check("5d buildKnowledgeLookupPlan hayat-yolu tek exact aday [32/5]", eqArr(kHayat.values, ["32/5"]), JSON.stringify(kHayat.values));

// 6) AÇIKLAMA EXACT EŞLEŞME (32/5 ve 5 varsa yalnız 32/5)
{
  const rows = [kRow("hayat-yolu", "32/5"), kRow("hayat-yolu", "5")];
  const notes = pickNotesForType(rows, "hayat-yolu", kHayat.values, new Set());
  check("6 fixture'da 32/5+5 → yalnız 32/5 notu", notes.length === 1 && notes[0].value === "32/5", notes.map((n) => n.value).join(","));
}
// 7) AÇIKLAMA FALLBACK YOK (yalnız 5 var, sonuç 32/5 → 0 kayıt)
{
  const rows = [kRow("hayat-yolu", "5")];
  const notes = pickNotesForType(rows, "hayat-yolu", kHayat.values, new Set());
  check("7 yalnız 5 kaydı var, sonuç 32/5 → 0 not (fallback yok)", notes.length === 0, notes.map((n) => n.value).join(","));
}
// 8) AÇIKLAMA EXACT VAR (yalnız 32/5 → 1 kayıt)
{
  const rows = [kRow("hayat-yolu", "32/5")];
  const notes = pickNotesForType(rows, "hayat-yolu", kHayat.values, new Set());
  check("8 yalnız 32/5 kaydı var → 1 not", notes.length === 1 && notes[0].value === "32/5");
}
// 9) İKİ YORUM KARTI OLUŞMAZ
{
  const rows = [kRow("hayat-yolu", "32/5"), kRow("hayat-yolu", "5"), kRow("hayat-yolu", "32")];
  const notes = pickNotesForType(rows, "hayat-yolu", kHayat.values, new Set());
  check("9 aynı Hayat Yolu için ≤1 yorum kartı", notes.length <= 1 && notes[0]?.value === "32/5", notes.map((n) => n.value).join(","));
}

// 10-12) ANA/YAN/İFADE REGRESYONU — valueCandidatesFromResult çoklu-aday KORUNUR
check("10 valueCandidatesFromResult(32/5) hâlâ çoklu [32/5,32,5]", eqArr(valueCandidatesFromResult(res("32/5")), ["32/5", "32", "5"]), JSON.stringify(valueCandidatesFromResult(res("32/5"))));
check("11 buildKnowledgeLookupPlan ana-kulvar çoklu-aday davranışı korunur",
  eqArr(buildKnowledgeLookupPlan(makeOut("32/5")).find((p) => p.analysisType === "ana-kulvar").values, valueCandidatesFromResult(res("1"))));
{
  const plan = buildKnowledgeLookupPlan(makeOut("32/5"));
  const yan = plan.find((p) => p.analysisType === "yan-kulvar").values;
  const ifade = plan.find((p) => p.analysisType === "ifade-sayisi").values;
  check("12 yan-kulvar(19/1) & ifade çoklu-aday korunur", eqArr(yan, valueCandidatesFromResult(res("19/1"))) && eqArr(ifade, valueCandidatesFromResult(res("7"))), JSON.stringify(yan));
}
// 13) ÇAKRA BUILDER DEĞİŞMEDİ
{
  const c = buildChakraLookupValues(makeOut("32/5"));
  check("13 çakra builder davranışı korunur (1 FAZLA, 2 AZ, 10 giriş)",
    c.length === 10 && c[0] === "1. Çakra | FAZLA Destek" && c[1] === "2. Çakra | AZ Destek", JSON.stringify(c.slice(0, 2)));
}
// 14) ELEMENT BUILDER DEĞİŞMEDİ
check("14a buildElementLookupValues (knowledge) hâlâ [] döner", eqArr(buildElementLookupValues(makeOut("32/5")), []));
{
  // Sıra-bağımsız: lib ELEMENT_ORDER'a bağlı; yalnız içerik doğruluğu (Ateş count=4→FAZLA, kalan AZ) test edilir.
  const e = buildElementStoneLookupValues(makeOut("32/5"));
  const azCount = e.filter((x) => x.endsWith("| AZ Destek")).length;
  check("14b element taş builder davranışı korunur (Ateş FAZLA, kalan 3 AZ, 4 giriş)",
    e.length === 4 && e.includes("Ateş | FAZLA Destek") && azCount === 3, JSON.stringify(e));
}

// 15) HAYAT YOLU DOĞALTAŞ — yalnız 32/5 aday
{
  const splan = buildStoneLookupPlan(makeOut("32/5"));
  const sHayat = splan.find((p) => p.analysisType === "hayat-yolu");
  check("15 stone plan hayat-yolu tek exact aday [32/5]", eqArr(sHayat.values, ["32/5"]), JSON.stringify(sHayat.values));
  // 16) DOĞALTAŞ FALLBACK YOK: aday listesinde '5' yok → 5 taşı asla aranmaz
  check("16 stone hayat-yolu adaylarında '5' YOK (fallback yok)", !sHayat.values.includes("5") && !sHayat.values.includes("32"));
  // stone ana-kulvar çoklu-aday korunur (regresyon)
  check("15b stone ana-kulvar çoklu-aday korunur", eqArr(splan.find((p) => p.analysisType === "ana-kulvar").values, valueCandidatesFromResult(res("1"))));
}
// 17) YALIN HAYAT YOLU DOĞALTAŞ (5 → [5])
{
  const sHayat = buildStoneLookupPlan(makeOut("5")).find((p) => p.analysisType === "hayat-yolu");
  check("17 yalın 5 sonucu stone aday [5]", eqArr(sHayat.values, ["5"]), JSON.stringify(sHayat.values));
}

// 18) MUTATE ETMEZ (sonuç nesnesi)
{
  const input = Object.freeze({ display: "32/5", key: "32/5", steps: [] });
  let threw = false;
  let out = [];
  try { out = exactValueFromResult(input); } catch { threw = true; }
  check("18 exactValueFromResult donmuş input'u mutate etmez / crash etmez", !threw && eqArr(out, ["32/5"]) && input.key === "32/5");
}
// 19) DETERMİNİSTİK / SIDE-EFFECT YOK
{
  const r = res("41/7");
  const a = exactValueFromResult(r);
  const b = exactValueFromResult(r);
  check("19 deterministik ve side-effect yok (aynı input → aynı çıktı)", eqArr(a, b) && eqArr(a, ["41/7"]) && r.key === "41/7");
}

console.log("\n============================================================");
const total = pass + fail;
console.log(`TOTAL ${total}`);
console.log(`PASS  ${pass}`);
console.log(`FAIL  ${fail}`);
console.log("============================================================");
process.exit(fail > 0 ? 1 : 0);
