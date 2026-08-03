/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Koşul Değerlendirme (§5)
 * ===============================================================
 *
 * SAF, deterministik, yan etkisiz, FAIL-LOUD. Yalnız whitelist condition_kind
 * (type_is / authority_is / has_channel / has_gate). Serbest SQL/JS/regex/DSL
 * YOK. condition_value canonical sözleşmeyle doğrulanır (canonicalKeys.ts guard).
 *
 * Semantik: bir bölüme bağlı çoklu koşul yalnız AND. OR / iç içe expression YOK
 * (gerekince ayrı bölüm). Bilinmeyen kind veya kanonik olmayan/kind-uyumsuz değer
 * SESSİZCE false'a düşmez → ConditionEvalError.
 *
 * Bileşen-scoped: değerlendirme yalnız chart'ın gerçek canonical anahtar
 * kümesine bakar; Kanal/Otorite bilgisi Tip'e GENELLENMEZ (üyelik testi birebir).
 */

import {
  isHdAuthorityCanonicalKey,
  isHdChannelCanonicalKey,
  isHdGateCanonicalKey,
  isHdTypeCanonicalKey,
  type HdCanonicalKey,
} from "../knowledge-system/canonicalKeys";
import { ConditionEvalError } from "./errors";
import { isHdConditionKind, type HdConditionKind } from "./types";

export type HdEvaluableCondition = {
  condition_kind: HdConditionKind | string;
  condition_value: string;
};

/** kind → condition_value'nun ait olması gereken canonical aile guard'ı. */
function valueGuardFor(kind: HdConditionKind): (s: string) => boolean {
  switch (kind) {
    case "type_is":
      return isHdTypeCanonicalKey;
    case "authority_is":
      return isHdAuthorityCanonicalKey;
    case "has_channel":
      return isHdChannelCanonicalKey;
    case "has_gate":
      return isHdGateCanonicalKey;
  }
}

/**
 * Tek koşulu değerlendirir. Bilinmeyen kind / kind-uyumsuz canonical değer →
 * ConditionEvalError (fail-loud). Aksi halde chart anahtar kümesinde birebir
 * üyelik döner.
 */
export function evaluateCondition(
  cond: HdEvaluableCondition,
  chartKeys: ReadonlySet<HdCanonicalKey> | ReadonlySet<string>,
): boolean {
  if (!isHdConditionKind(cond.condition_kind)) {
    throw new ConditionEvalError("UNKNOWN_CONDITION_KIND", cond.condition_kind);
  }
  const value = cond.condition_value;
  if (typeof value !== "string" || !valueGuardFor(cond.condition_kind)(value)) {
    throw new ConditionEvalError("INVALID_CONDITION_VALUE", value);
  }
  return (chartKeys as ReadonlySet<string>).has(value);
}

/**
 * Çoklu koşulu AND semantiğiyle değerlendirir. Boş liste = koşulsuz (true).
 * Herhangi bir koşul geçersizse (fail-loud) hata fırlar — kısa devre YAPILMAZ
 * ki geçersiz koşul gizlenmesin (tüm liste önce doğrulanır).
 */
export function evaluateConditionsAnd(
  conditions: readonly HdEvaluableCondition[],
  chartKeys: ReadonlySet<HdCanonicalKey> | ReadonlySet<string>,
): boolean {
  // Önce hepsini doğrula (geçersiz koşul, erken true/false ile gizlenemez).
  const results = conditions.map((c) => evaluateCondition(c, chartKeys));
  return results.every((r) => r === true);
}
