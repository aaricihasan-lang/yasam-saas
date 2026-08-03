/**
 * HD Danışmanlık Kullanım Katmanı (F0B) · Hak Çözümleyici (§7)
 * ===========================================================
 *
 * SAF, deterministik, DEFAULT-DENY. Hak ile içerik/çeviri varlığı AYRIDIR:
 *   - translation_allowed AÇIK izindir (verified çeviri varlığından türetilmez).
 *   - quotation_allowed AÇIK boolean; serbest quotation_limit metninden türetilmez.
 *
 * Effective right: passage override NULL değilse override, aksi halde source;
 * bilgi yoksa deny. Sonuç yalnız neden kodu taşır — tam kaynak metni/hak notu
 * SIZDIRILMAZ.
 */

import {
  HD_BLOCKING_RIGHTS_STATUSES,
  type HdEffectiveRights,
  type HdPassageRightsOverride,
  type HdProduct,
  type HdSourceRights,
  type RightsDecision,
} from "./types";

const ALLOW: RightsDecision = { allowed: true };
function deny(reason: Parameters<typeof denyReason>[0]): RightsDecision {
  return denyReason(reason);
}
function denyReason(reason: Extract<RightsDecision, { allowed: false }>["reason"]): RightsDecision {
  return { allowed: false, reason };
}

/** override alanı NULL değilse override, aksi halde source. */
function pick<T>(override: T | null | undefined, source: T): T {
  return override === null || override === undefined ? source : override;
}

/**
 * Source + (opsiyonel) passage override → effective haklar. override yoksa
 * source aynen. Her boolean alan default-deny mantığıyla zaten false başlar.
 */
export function resolveEffectiveRights(
  source: HdSourceRights,
  override?: HdPassageRightsOverride | null,
): HdEffectiveRights {
  if (!override) return { ...source };
  return {
    internal_use_allowed: pick(override.internal_use_allowed, source.internal_use_allowed),
    expert_delivery_allowed: pick(override.expert_delivery_allowed, source.expert_delivery_allowed),
    private_report_use_allowed: pick(
      override.private_report_use_allowed,
      source.private_report_use_allowed,
    ),
    translation_allowed: pick(override.translation_allowed, source.translation_allowed),
    quotation_allowed: pick(override.quotation_allowed, source.quotation_allowed),
    quotation_word_limit: pick(override.quotation_word_limit, source.quotation_word_limit),
    rights_status: pick(override.rights_status, source.rights_status),
  };
}

function rightsStatusBlocked(r: HdEffectiveRights): boolean {
  return (HD_BLOCKING_RIGHTS_STATUSES as readonly string[]).includes(r.rights_status);
}

/**
 * Bir ürün için (expert_guide | client_report) effective hakların yeterliliği.
 * DEFAULT-DENY:
 *   expert_guide  → internal_use_allowed VEYA expert_delivery_allowed VE status engelli değil
 *   client_report → private_report_use_allowed zorunlu VE status engelli değil
 */
export function evaluateProductRights(
  effective: HdEffectiveRights,
  product: HdProduct,
): RightsDecision {
  if (product === "client_report") {
    if (rightsStatusBlocked(effective)) return deny("RIGHTS_STATUS_BLOCKED");
    if (effective.private_report_use_allowed !== true) return deny("PRIVATE_REPORT_USE_DENIED");
    return ALLOW;
  }
  // expert_guide
  if (rightsStatusBlocked(effective)) return deny("RIGHTS_STATUS_BLOCKED");
  if (effective.internal_use_allowed !== true && effective.expert_delivery_allowed !== true) {
    return deny("EXPERT_DELIVERY_DENIED");
  }
  return ALLOW;
}

/**
 * usage_scope="both" bölümleri iki üründe AYRI değerlendirilir; uzman rehberinde
 * izinli olup danışan raporunda reddedilebilir.
 */
export function evaluateBothProducts(
  effective: HdEffectiveRights,
): { expert_guide: RightsDecision; client_report: RightsDecision } {
  return {
    expert_guide: evaluateProductRights(effective, "expert_guide"),
    client_report: evaluateProductRights(effective, "client_report"),
  };
}

/** Çeviri izni — AÇIK boolean; verified çeviri varlığından bağımsız. */
export function evaluateTranslation(effective: HdEffectiveRights): RightsDecision {
  return effective.translation_allowed === true ? ALLOW : deny("TRANSLATION_DENIED");
}

/**
 * Alıntı izni matrisi:
 *   quotation_allowed=false                       → deny (limit olsa bile)
 *   quotation_allowed=true, limit=null, needed var → fail-closed (LIMIT_UNKNOWN)
 *   quotation_allowed=true, needed>limit           → deny (LIMIT_EXCEEDED)
 *   quotation_allowed=true, needed<=limit          → allow
 * neededWords verilmezse yalnız izin bayrağına bakılır (limit gerekmez).
 */
export function evaluateQuotation(
  effective: HdEffectiveRights,
  neededWords?: number,
): RightsDecision {
  if (effective.quotation_allowed !== true) return deny("QUOTATION_DENIED");
  if (neededWords === undefined) return ALLOW;
  if (effective.quotation_word_limit === null || effective.quotation_word_limit === undefined) {
    return deny("QUOTATION_LIMIT_UNKNOWN");
  }
  if (!Number.isInteger(neededWords) || neededWords < 0) return deny("QUOTATION_LIMIT_UNKNOWN");
  return neededWords <= effective.quotation_word_limit ? ALLOW : deny("QUOTATION_LIMIT_EXCEEDED");
}

/**
 * Bir bölümün TÜM evidence passage'ları için ürün-hak kararı (default-deny).
 * Her passage effective hak çözülür; herhangi biri reddedilirse bölüm reddedilir
 * (ilk red nedenini döner). Boş evidence = NO_RIGHTS_INFO (deny — bilgi yok).
 */
export function evaluateSectionRights(
  product: HdProduct,
  passages: readonly { source: HdSourceRights; override?: HdPassageRightsOverride | null }[],
): RightsDecision {
  if (passages.length === 0) return deny("NO_RIGHTS_INFO");
  for (const p of passages) {
    const eff = resolveEffectiveRights(p.source, p.override);
    const decision = evaluateProductRights(eff, product);
    if (!decision.allowed) return decision;
  }
  return ALLOW;
}
