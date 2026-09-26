/**
 * HD Bilgi Bankası (modül entegrasyonu) — KAYNAK HAKLARI ÇÖZÜMÜ (saf, default-deny)
 * ================================================================================
 *
 * Bu dosya BİLEREK bağımsızdır (yalnız yerel tipler; `@/` import YOK) → hem server
 * read service'i hem de harness relative-import ile sorunsuz kullanabilir.
 *
 * Kural (migration 20260811000000 semantiği ile birebir):
 *   - hd_sources üzerindeki izin bayrakları default-deny'dır (DB DEFAULT false).
 *   - hd_source_passages üzerindeki *_override kolonları NULL ise KAYNAKTAN miras
 *     alınır; boolean ise pasaj override'ı KAZANIR (açık true VEYA açık false).
 *   - "effective" hak, kaynak + pasaj birleştirilerek server-side çözülür.
 *
 * Normal uzmana TAM METİN (özgün metin / sadık çeviri / tam pasaj) yalnız
 * `expert_delivery` effective=true ise verilir. Aksi halde yalnız bibliyografik
 * / provenance metadata gösterilir (fail-closed).
 *
 * Girdiler bilerek gevşek (`Record<string, unknown>`) kabul edilir: service katmanı
 * DB'den `select("*")` ile ham satır (Record) geçirir; harness tipli literaller geçirir.
 * Alan okuma güvenli (bilinmeyen/boolean-olmayan → false).
 */

export type RightsRecord = Record<string, unknown> | null | undefined;

export type EffectiveRights = {
  internalUse: boolean;
  expertDelivery: boolean;
  privateReportUse: boolean;
  publicDisplay: boolean;
  commercialUse: boolean;
  /** Çözülmüş hak durumu (fail-closed varsayılan: "unknown"). */
  rightsStatus: string;
};

/**
 * TAM METİN dağıtımını BLOKLAYAN hak durumları (danışmanlık rightsResolver ile
 * birebir: HD_BLOCKING_RIGHTS_STATUSES = permission_pending / restricted / unknown).
 * Bu küme dışındaki durumlar: public_domain / licensed / permission_granted.
 * Yerel tutulur — bu dosyanın `@/` bağımsızlığı KORUNUR.
 */
export const HD_BLOCKING_RIGHTS_STATUSES: ReadonlySet<string> = new Set([
  "permission_pending",
  "restricted",
  "unknown",
]);

/**
 * Effective hak durumu: pasaj override'ı (rights_status_override / rights_status)
 * varsa KAZANIR, yoksa kaynağın rights_status'ı; hiçbiri yoksa fail-closed "unknown".
 */
function resolveRightsStatus(source: Record<string, unknown>, passage: Record<string, unknown>): string {
  const candidates = [
    passage["rights_status_override"],
    passage["rights_status"],
    source["rights_status"],
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c;
  }
  return "unknown";
}

/** override boolean ise onu (true/false), değilse (NULL/eksik) taban değeri kullan. */
function resolveFlag(base: unknown, override: unknown): boolean {
  if (override === true) return true;
  if (override === false) return false; // açık reddi de KAZANIR
  return base === true; // NULL/eksik override → kaynaktan miras (katı default-deny)
}

/**
 * Kaynak + pasaj → effective izinler. Pasaj yoksa yalnız kaynak bayrakları
 * (yine default-deny) uygulanır.
 */
export function resolveEffectiveRights(source: RightsRecord, passage?: RightsRecord): EffectiveRights {
  const s = source ?? {};
  const p = passage ?? {};
  return {
    internalUse: resolveFlag(s["internal_use_allowed"], p["internal_use_allowed_override"]),
    expertDelivery: resolveFlag(s["expert_delivery_allowed"], p["expert_delivery_allowed_override"]),
    privateReportUse: resolveFlag(s["private_report_use_allowed"], p["private_report_use_allowed_override"]),
    publicDisplay: resolveFlag(s["public_display_allowed"], p["public_display_allowed_override"]),
    commercialUse: resolveFlag(s["commercial_use_allowed"], p["commercial_use_allowed_override"]),
    rightsStatus: resolveRightsStatus(s, p),
  };
}

/**
 * Effective hak durumu TAM METİN dağıtımını blokluyor mu?
 * (permission_pending / restricted / unknown → true = blokla.)
 */
export function rightsStatusBlocksFullText(rightsStatus: string): boolean {
  return HD_BLOCKING_RIGHTS_STATUSES.has(rightsStatus);
}

/**
 * Normal uzman TAM METİN görebilir mi?
 *
 * İKİ koşul birden gerekir (danışmanlık rightsResolver semantiği ile tutarlı,
 * defense-in-depth — yalnız SIKILAŞTIRIR, asla gevşetmez):
 *   1) effective expert_delivery === true, VE
 *   2) effective rights_status BLOKLAYICI DEĞİL (permission_pending/restricted/unknown değil).
 *
 * Fail-closed: source yoksa expert_delivery=false; rights_status çözülemezse "unknown"
 * → bloklanır. Böylece rights_status yanlışlıkla ham/tam kaynak metnini dağıtamaz.
 */
export function expertMaySeeFullText(source: RightsRecord, passage?: RightsRecord): boolean {
  const eff = resolveEffectiveRights(source, passage);
  return eff.expertDelivery === true && !rightsStatusBlocksFullText(eff.rightsStatus);
}
