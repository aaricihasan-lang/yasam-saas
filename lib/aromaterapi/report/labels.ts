/**
 * Aromaterapi Word — SUNUM katmanı enum → etiket eşlemesi.
 * KAYNAK: @/lib/aromaterapi/readLabels (uygulama UI ile aynı kanonik sözlük) → I18N: `reports.aromatherapy.enums.*`
 * (TR değerleri readLabels ile birebir; EN değerleri ekran kataloğu `aromatherapy.enums.*` ile aynı).
 * DB değeri / API contract / provenance DEĞİŞMEZ — yalnız Word'de görünen metin, çıktı dilinde (report/text).
 * Bilinmeyen enum: ham snake_case SİLİNMEZ; güvenli humanize edilir (değer korunur).
 */
import { aromaText } from "./text";

/** snake_case / kebab / boşluklu kodu "Title Case"e çevirir (dilin büyük harf kuralıyla). Değer KAYBOLMAZ. */
export function humanizeToken(code: string): string {
  return aromaText().humanize(code);
}

/** Verilen sözlük(ler)de sırayla ara; bulunmazsa humanize (ham enum kullanıcıya çıkmaz). */
function mapOr(dicts: string[], code: string | null | undefined): string {
  const t = (code ?? "").trim();
  if (!t) return "";
  const x = aromaText();
  for (const d of dicts) {
    const hit = x.enumOf(d, t);
    if (hit != null) return hit;
  }
  return x.humanize(t);
}

// Talimattaki ek popülasyon örnekleri — kanonik sözlüğe alias (`populationAlias.*`; fixture datasını değiştirmeden
// robust eşleme). Kanonik POPULATION_CODE (pregnancy/lactation/…) önce gelir.
function populationAlias(code: string | null | undefined): string | null {
  const t = (code ?? "").trim();
  const x = aromaText();
  return /^[a-z_]+$/.test(t) && x.t.has(`populationAlias.${t}`) ? x.t(`populationAlias.${t}`) : null;
}

export const formatApplicationRoute = (code: string | null | undefined): string => mapOr(["ROUTE_CODE"], code);
export const formatTargetPopulation = (code: string | null | undefined): string => {
  const t = (code ?? "").trim();
  if (!t) return "";
  return aromaText().enumOf("POPULATION_CODE", t) ?? populationAlias(t) ?? aromaText().humanize(t);
};
/** relation_type kanonik önce; "supports" gibi evidence-relation değerleri de etiketlensin. */
export const formatRelationType = (code: string | null | undefined): string => mapOr(["RELATION_TYPE", "EVIDENCE_RELATION"], code);
export const formatEvidenceRelation = (code: string | null | undefined): string => mapOr(["EVIDENCE_RELATION"], code);
export const formatRationaleStatus = (code: string | null | undefined): string => mapOr(["RATIONALE_STATUS"], code);
export const formatEvidenceLayer = (code: string | null | undefined): string => mapOr(["EVIDENCE_LAYER"], code);
export const formatConclusionProvenance = (code: string | null | undefined): string => mapOr(["CONCLUSION_PROVENANCE"], code);
export const formatOutcomeType = (code: string | null | undefined): string => mapOr(["OUTCOME_TYPE"], code);
export const formatSourceRole = (code: string | null | undefined): string => mapOr(["SOURCE_ROLE"], code);
export const formatPassageKind = (code: string | null | undefined): string => mapOr(["PASSAGE_KIND"], code);
export const formatSourceType = (code: string | null | undefined): string => mapOr(["SOURCE_TYPE"], code);
