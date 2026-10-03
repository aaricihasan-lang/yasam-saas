// HD profesyonel rapor — GÜVENLİ ÖZET projeksiyonu (SAF; DB/ağ yok).
//
// P2-3: Android'de Word indirilemediği için rapor satırı "yalnız Sil" olarak kalıyordu.
// Bu projeksiyon raporu okunabilir kılar ama canonical yorum METNİNİ (content) asla
// taşımaz — yalnız danışan/harita özeti, bölüm başlıkları ve sayılar. Böylece "canonical
// metin uzmana yalnız donmuş DOCX ile ulaşır" kararı bozulmaz.

import type { HdReportSnapshot } from "./reportSnapshot";

export type HdProfessionalReportSummary = {
  title: string;
  generatedAt: string;
  client: { name: string; birthDate: string | null; birthTime: string | null; birthPlace: string | null };
  chart: {
    profile: string | null;
    definition: string | null;
    definedCenters: string[];
  };
  type: string | null;
  authority: string | null;
  channels: string[];
  gates: string[];
  hangingGates: string[];
  omittedCount: number;
  hasChartImage: boolean;
};

export function buildProfessionalReportSummary(title: string, s: HdReportSnapshot): HdProfessionalReportSummary {
  return {
    title,
    generatedAt: s.generatedAt,
    client: {
      name: s.client?.name ?? "Danışan",
      birthDate: s.client?.birthDate ?? null,
      birthTime: s.client?.birthTime ?? null,
      birthPlace: s.client?.birthPlace ?? null,
    },
    chart: {
      profile: s.chart?.profileLabel ?? null,
      definition: s.chart?.definitionLabel ?? null,
      definedCenters: Array.isArray(s.chart?.definedCenterLabels) ? [...(s.chart.definedCenterLabels as string[])] : [],
    },
    type: s.identity?.type?.displayName ?? null,
    authority: s.identity?.authority?.displayName ?? null,
    channels: (s.channels ?? []).map((c) => c.displayName),
    gates: (s.gates ?? []).map((g) => g.displayName),
    hangingGates: (s.hangingContexts ?? []).map((h) => h.displayName),
    omittedCount: s.provenance?.omitted?.length ?? 0,
    hasChartImage: !!s.chartImage?.storagePath,
  };
}
