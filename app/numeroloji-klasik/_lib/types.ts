// Klasik Numeroloji · ekran tipleri (API sözleşmeleri; ham sağlayıcı yanıtı ASLA gelmez).
import type { ClassicKind } from "@/lib/numeroloji-klasik/input";
import type { StoneMatchResult } from "@/lib/numeroloji-klasik/stones/types";
import type { Alignment } from "@/lib/numeroloji-klasik/compare/align";

/** GET /analyses/[id] → analysis (server/service.ts ClassicAnalysisView ile aynı şekil). */
export type AnalysisView = {
  id: string;
  kind: ClassicKind | string;
  title: string;
  clientId: string | null;
  input: unknown;
  techniques: string[];
  status: "complete" | "partial";
  /** Etiket → normalize sonuç: chart, bridge, personal_day, chaldean, dual, compatibility, business_name, dual#1… */
  result: Record<string, unknown> | null;
  verification: unknown;
  meta: { referenceDate: string | null; failed: string[]; fetchedAt: string | null; methodologyVersion: string };
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type AnalysisRow = {
  id: string;
  kind: ClassicKind | string;
  title: string;
  clientId: string | null;
  techniques: string[];
  status: "complete" | "partial";
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ListResponse = { ok: true; rows: AnalysisRow[]; hasMore: boolean; nextOffset: number | null };
export type AnalysisResponse = { ok: true; analysis: AnalysisView };
export type PatchResponse = { ok: true; row: AnalysisRow };

export type Entitlements = { ok: true; enabled: boolean; isDemo: boolean; canCompute: boolean; canWrite: boolean; canLinkClients: boolean; canSeeFutureYears?: boolean };

/** GET /analyses/[id]/taslar (server/stonesService.ts ClassicStonesView). stock: yalnız stokta kayıtlı taş adları → adet (0 olabilir). */
export type StonesView = {
  mode: "library" | "text_only";
  reason?: "library_disabled" | "no_access" | "unavailable" | "empty" | string;
  reasonText?: string;
  result: StoneMatchResult;
  stock: Record<string, number>;
};
export type StonesResponse = { ok: true } & StonesView;

export type CatalogEntry = { kind: string; number: number; lang: string; payload: unknown };
export type CatalogResponse = { ok: true; entries: CatalogEntry[] };

export type LegacySource = { id: string; fullName: string; birthDate: string | null; createdAt: string | null; methodologyVersion: string | null; clientId: string | null };
export type ClassicSource = { id: string; title: string; kind: string; createdAt: string; clientId: string | null };
export type SourcesResponse = { ok: true; legacy: LegacySource[]; classic: ClassicSource[] };
export type LegacyStoneAssignment = { analysisType: string; labelTr: string; value: string; stones: string[] };
export type AlignResponse = {
  ok: true;
  alignment: Alignment;
  stones: { classic: StonesView | null; legacyAssignments: LegacyStoneAssignment[] };
  sources: {
    legacy: { id: string; fullName: string; birthDate: string | null; createdAt: string | null; methodologyVersion: string | null; clientId: string | null } | null;
    classic: { id: string; title: string; kind: string; createdAt: string; clientId: string | null; methodologyVersion: string } | null;
  };
};

/** server/compareService.ts NoteView */
export type CompareNote = {
  id: string;
  clientId: string | null;
  legacyId: string | null;
  classicId: string | null;
  body: string;
  snapshot: unknown;
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};
