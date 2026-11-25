"use client";

/**
 * I18N: karışım güvenlik uyarılarının ekran metni. Uyarı üretimi (collectSafetyWarnings) DEĞİŞMEZ; `kind` dil-bağımsız
 * anahtardır. Sabit sistem metinleri (etiket, fotosensitivite açıklaması, özet) katalogdan; kontrendikasyon / güvenlik
 * notu ayrıntısı uzman/yağ kaydı içeriğidir → ÇEVRİLMEZ, aynen gösterilir. "Güvenli değildir" vurgusu korunur.
 */
import { useTranslations } from "next-intl";
import type { BlendSafetyResult, BlendSafetyWarning } from "./blendData";

export function useBlendSafetyText() {
  const t = useTranslations("aromatherapy.blend.safety");
  return {
    summary: (r: Pick<BlendSafetyResult, "hasWarnings">) => (r.hasWarnings ? t("summaryWarnings") : t("summaryNone")),
    name: (w: BlendSafetyWarning) => (w.carrier && w.source_name ? t("carrierName", { name: w.source_name }) : w.oil_name),
    label: (w: BlendSafetyWarning) => (t.has(`kinds.${w.kind}.label`) ? t(`kinds.${w.kind}.label`) : w.label),
    detail: (w: BlendSafetyWarning) =>
      w.kind === "photosensitive" || w.kind === "photosensitive_unknown" ? t(`kinds.${w.kind}.detail`) : w.detail,
  };
}
