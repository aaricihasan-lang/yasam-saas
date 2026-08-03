/**
 * HD Danışmanlık F0B · Koşul Değerlendirme Harness
 * ================================================
 * GERÇEK conditionalEval + normalizeChart + canonicalKeys import edilir.
 * Bileşen-scoped; Kanal/Otorite bilgisinin Tip'e genellenmediğini regresyonla
 * doğrular. Herhangi bir FAIL → exit 1.
 *
 * Çalıştır:  npx tsx scripts/hd-consultation/conditional-eval-harness.mjs
 */
import {
  evaluateCondition,
  evaluateConditionsAnd,
} from "@/lib/human-design/consultation/conditionalEval";
import { ConditionEvalError } from "@/lib/human-design/consultation/errors";
import { normalizeChartToKeySet } from "@/lib/human-design/consultation/normalizeChart";

let pass = 0;
let fail = 0;
const fails = [];
function check(desc, cond) {
  if (cond) pass++;
  else {
    fail++;
    fails.push(desc);
    console.log(`  FAIL  ${desc}`);
  }
}
function expectThrow(desc, fn, code) {
  try {
    fn();
    check(`${desc} (ConditionEvalError beklendi)`, false);
  } catch (e) {
    check(desc, e instanceof ConditionEvalError && (code ? e.code === code : true));
  }
}

// Fixture: Manifesting Generator + Emotional + 34-57,10-20 + kapılar
const chart = {
  type_code: "Manifesting Generator",
  authority_code: "Emotional",
  gates: [34, 57, 10, 20],
  channels: ["34-57", "10-20"],
};
const keys = normalizeChartToKeySet(chart);

// ── 4 kind pozitif ──────────────────────────────────────────────────────────
check("type_is pozitif", evaluateCondition({ condition_kind: "type_is", condition_value: "tip_manifesting_generator" }, keys) === true);
check("authority_is pozitif", evaluateCondition({ condition_kind: "authority_is", condition_value: "otorite_emotional" }, keys) === true);
check("has_channel pozitif", evaluateCondition({ condition_kind: "has_channel", condition_value: "kanal_34_57" }, keys) === true);
check("has_gate pozitif", evaluateCondition({ condition_kind: "has_gate", condition_value: "kapi_34" }, keys) === true);

// ── 4 kind negatif (bileşen-scoped: üye değil → false) ──────────────────────
check("type_is negatif", evaluateCondition({ condition_kind: "type_is", condition_value: "tip_projector" }, keys) === false);
check("authority_is negatif", evaluateCondition({ condition_kind: "authority_is", condition_value: "otorite_sacral" }, keys) === false);
check("has_channel negatif", evaluateCondition({ condition_kind: "has_channel", condition_value: "kanal_1_8" }, keys) === false);
check("has_gate negatif", evaluateCondition({ condition_kind: "has_gate", condition_value: "kapi_5" }, keys) === false);

// ── Çoklu koşul AND ─────────────────────────────────────────────────────────
check(
  "AND hepsi doğru → true",
  evaluateConditionsAnd(
    [
      { condition_kind: "type_is", condition_value: "tip_manifesting_generator" },
      { condition_kind: "has_channel", condition_value: "kanal_34_57" },
    ],
    keys,
  ) === true,
);
check(
  "AND biri yanlış → false",
  evaluateConditionsAnd(
    [
      { condition_kind: "type_is", condition_value: "tip_manifesting_generator" },
      { condition_kind: "has_gate", condition_value: "kapi_5" },
    ],
    keys,
  ) === false,
);
check("AND boş liste → true (koşulsuz)", evaluateConditionsAnd([], keys) === true);

// ── Fail-loud: bilinmeyen kind / geçersiz value SESSİZCE false OLMAZ ─────────
expectThrow("Bilinmeyen kind reddi", () => evaluateCondition({ condition_kind: "region_is", condition_value: "tip_generator" }, keys), "UNKNOWN_CONDITION_KIND");
expectThrow("kind-uyumsuz value reddi (type_is + kanal)", () => evaluateCondition({ condition_kind: "type_is", condition_value: "kanal_34_57" }, keys), "INVALID_CONDITION_VALUE");
expectThrow("kanonik olmayan value reddi", () => evaluateCondition({ condition_kind: "has_gate", condition_value: "kapi_00" }, keys), "INVALID_CONDITION_VALUE");
expectThrow("ters yön kanal value reddi", () => evaluateCondition({ condition_kind: "has_channel", condition_value: "kanal_57_34" }, keys), "INVALID_CONDITION_VALUE");
expectThrow("AND içinde geçersiz koşul gizlenmez", () =>
  evaluateConditionsAnd(
    [
      { condition_kind: "has_gate", condition_value: "kapi_5" }, // false ama
      { condition_kind: "bad_kind", condition_value: "kapi_5" }, // bu yine de patlamalı
    ],
    keys,
  ),
);

// ── REGRESYON: Kanal/Otorite Tip'e GENELLENMEZ ──────────────────────────────
// Aynı kanala/otoriteye sahip ama farklı Tip'te bir chart: type_is diğer tip → false
const projectorLikeButSameChannel = {
  type_code: "Projector",
  authority_code: "Emotional",
  gates: [34, 57],
  channels: ["34-57"],
};
const keys2 = normalizeChartToKeySet(projectorLikeButSameChannel);
check("Regresyon: aynı kanal farklı Tip → has_channel true", evaluateCondition({ condition_kind: "has_channel", condition_value: "kanal_34_57" }, keys2) === true);
check("Regresyon: kanal varlığı Tip'i genellemez → type_is(MG) false", evaluateCondition({ condition_kind: "type_is", condition_value: "tip_manifesting_generator" }, keys2) === false);
check("Regresyon: type_is(Projector) true", evaluateCondition({ condition_kind: "type_is", condition_value: "tip_projector" }, keys2) === true);

console.log(`\nconditional-eval-harness: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) {
  console.log("FAILURES:\n - " + fails.join("\n - "));
  process.exit(1);
}
