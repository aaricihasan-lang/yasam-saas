/**
 * Aromaterapi Word — SUNUM katmanı enum → Türkçe etiket eşlemesi.
 * KAYNAK: @/lib/aromaterapi/readLabels (uygulama UI ile aynı kanonik sözlük).
 * DB değeri / API contract / provenance DEĞİŞMEZ — yalnız Word'de görünen metin.
 * Bilinmeyen enum: ham snake_case SİLİNMEZ; güvenli humanize edilir (değer korunur).
 */
import {
  ROUTE_CODE_TR, POPULATION_CODE_TR, EVIDENCE_RELATION_TR, RELATION_TYPE_TR,
  RATIONALE_STATUS_TR, EVIDENCE_LAYER_TR, CONCLUSION_PROVENANCE_TR, OUTCOME_TYPE_TR,
  SOURCE_ROLE_TR, PASSAGE_KIND_TR, SOURCE_TYPE_TR,
} from "@/lib/aromaterapi/readLabels";

/** snake_case / kebab / boşluklu kodu "Title Case"e çevirir (TR-aware). Değer KAYBOLMAZ. */
export function humanizeToken(code: string): string {
  const t = (code ?? "").trim();
  if (!t) return "";
  return t
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toLocaleUpperCase("tr") + w.slice(1))
    .join(" ");
}

/** Verilen sözlük(ler)de sırayla ara; bulunmazsa humanize (ham enum kullanıcıya çıkmaz). */
function mapOr(maps: Record<string, string>[], code: string | null | undefined): string {
  const t = (code ?? "").trim();
  if (!t) return "";
  for (const m of maps) if (m[t]) return m[t];
  return humanizeToken(t);
}

// Talimattaki ek popülasyon örnekleri — kanonik map'e alias (fixture datasını değiştirmeden
// robust eşleme). Kanonik POPULATION_CODE_TR (pregnancy/lactation/…) önce gelir.
const POPULATION_ALIASES: Record<string, string> = {
  pregnant: "Gebelik",
  breastfeeding: "Emzirme",
  children: "Çocuklar",
  infants: "Bebekler",
  elderly: "Yaşlılar",
  sensitive_skin: "Hassas Cilt",
};

export const formatApplicationRoute = (code: string | null | undefined): string => mapOr([ROUTE_CODE_TR], code);
export const formatTargetPopulation = (code: string | null | undefined): string => mapOr([POPULATION_CODE_TR, POPULATION_ALIASES], code);
/** relation_type kanonik önce; "supports" gibi evidence-relation değerleri de Türkçeleşsin. */
export const formatRelationType = (code: string | null | undefined): string => mapOr([RELATION_TYPE_TR, EVIDENCE_RELATION_TR], code);
export const formatEvidenceRelation = (code: string | null | undefined): string => mapOr([EVIDENCE_RELATION_TR], code);
export const formatRationaleStatus = (code: string | null | undefined): string => mapOr([RATIONALE_STATUS_TR], code);
export const formatEvidenceLayer = (code: string | null | undefined): string => mapOr([EVIDENCE_LAYER_TR], code);
export const formatConclusionProvenance = (code: string | null | undefined): string => mapOr([CONCLUSION_PROVENANCE_TR], code);
export const formatOutcomeType = (code: string | null | undefined): string => mapOr([OUTCOME_TYPE_TR], code);
export const formatSourceRole = (code: string | null | undefined): string => mapOr([SOURCE_ROLE_TR], code);
export const formatPassageKind = (code: string | null | undefined): string => mapOr([PASSAGE_KIND_TR], code);
export const formatSourceType = (code: string | null | undefined): string => mapOr([SOURCE_TYPE_TR], code);
