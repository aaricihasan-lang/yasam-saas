import type { StoneLibraryDisplayField } from "@/lib/stone-library/contract";
import type { Readiness } from "../../_components/ownerApi";

export type LayerStone = {
  id: string;
  slug: string;
  name_tr: string;
  name_en: string | null;
  status: string;
  origin: "source" | "owner";
  owner_version_current: number | null;
  image_choice: string;
  primary_owner_image_id: string | null;
  deleted_at: string | null;
  row_version: number;
};
export type OwnerVersion = { version: number; data: Record<string, unknown>; health_fields: string[]; note: string | null; created_at: string; current: boolean };
export type Translation = {
  id: string;
  field: StoneLibraryDisplayField;
  version: number;
  display_kind: string;
  verification_status: string;
  content_tr: string;
  published: boolean;
  published_at: string | null;
  stale: boolean;
};
export type OwnerNote = {
  id: string;
  kind: "note" | "warning";
  title: string | null;
  body: string;
  visible_to_experts: boolean;
  health_sensitive: boolean;
  deleted_at: string | null;
  row_version: number;
  updated_at?: string;
  created_at?: string;
};
export type OwnerImage = {
  id: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  license_status: "documented" | "undocumented";
  license_note: string | null;
  created_at: string;
  deleted_at: string | null;
  primary: boolean;
};
export type Layers = {
  stone: LayerStone;
  versions: OwnerVersion[];
  translations: Translation[];
  notes: OwnerNote[];
  owner_images: OwnerImage[];
  readiness: Readiness;
};

export type SourceRecord = { field_key: string; lang: "tr" | "en"; content: string; is_current: boolean; deleted_at: string | null; review_state: string; origin: string };
export type SourceFacet = {
  facet: string;
  lang: string | null;
  value_key: string;
  value_text: string | null;
  value_num: number | null;
  pair_stone_id: string | null;
  deleted_at: string | null;
  review_state: string;
  visibility: string;
};
/** Kaynak (lisanslı aktarım) görseli — owner önizlemesi için; depo yolu istemcide kullanılmaz. */
export type SourceImage = {
  id: string;
  variant: "original" | "optimized" | string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  review_state: string;
  visibility: string;
  license_grant_id: string | null;
  quality_flags: string[] | null;
  deleted_at: string | null;
};
export type ImageLicense = { id: string; scope: string; evidence_status: string };
export type SourceDetail = {
  stone: { name_tr: string; name_en: string | null; origin?: string } | null;
  records: SourceRecord[];
  facets: SourceFacet[];
  images: SourceImage[];
  image_licenses: ImageLicense[];
};

export type ActFn = (body: Record<string, unknown>, opts?: { success?: string; undo?: Record<string, unknown> | Record<string, unknown>[] | null }) => Promise<boolean>;
