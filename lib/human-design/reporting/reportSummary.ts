// HD profesyonel rapor — GÜVENLİ ÖZET projeksiyonu (SAF; DB/ağ yok).
//
// P2-3: Android'de Word indirilemediği için rapor satırı "yalnız Sil" olarak kalıyordu.
// Bu projeksiyon raporu okunabilir kılar ama canonical yorum METNİNİ (content) asla
// taşımaz — yalnız danışan/harita özeti, bölüm başlıkları ve sayılar. Böylece "canonical
// metin uzmana yalnız donmuş DOCX ile ulaşır" kararı bozulmaz.

import type { HdReportSnapshot } from "./reportSnapshot";
import { isHdReportSnapshotV2, type AnyHdReportSnapshot, type HdReportSnapshotV2 } from "./reportSnapshotV2";

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

/**
 * AŞAMA 4B (hd-report-2): yalnız teknik özet (danışan + harita kimliği + başlık listeleri).
 * Uzman yorumu ve Sistem Yorumu METNİ bu projeksiyona GİRMEZ.
 */
function buildV2Summary(title: string, s: HdReportSnapshotV2): HdProfessionalReportSummary {
  return {
    title,
    generatedAt: s.generatedAt,
    client: {
      name: s.client.name,
      birthDate: s.client.birthDate,
      birthTime: s.client.birthTime,
      birthPlace: s.client.birthPlace,
    },
    chart: {
      profile: s.identity.profile,
      definition: s.identity.definition,
      definedCenters: s.centers.filter((c) => c.defined).map((c) => c.label),
    },
    type: s.identity.type,
    authority: s.identity.authority,
    channels: s.channels.map((c) => c.label),
    gates: s.gates.map((g) => g.label),
    hangingGates: [],
    omittedCount: 0,
    hasChartImage: !!s.chartImage?.storagePath,
  };
}

export function buildProfessionalReportSummary(title: string, snap: AnyHdReportSnapshot): HdProfessionalReportSummary {
  if (isHdReportSnapshotV2(snap)) return buildV2Summary(title, snap);
  const s: HdReportSnapshot = snap;
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
