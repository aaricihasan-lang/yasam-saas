"use client";

import { useCallback } from "react";
import { EntitySearchPicker, type PickerItem } from "@/app/aromaterapi/_components/write/EntitySearchPicker";
import { fetchPreparationList } from "@/lib/aromaterapi/catalogData";
import { fetchSourceList, fetchSourcePassageList } from "@/lib/aromaterapi/sourceData";
import { fetchKnowledgeRecordList } from "@/lib/aromaterapi/claimData";
import type {
  KnowledgeRecordListItem,
  PassageListItem,
  PreparationListItem,
  SourceListItem,
} from "@/lib/aromaterapi/readTypes";
import { PASSAGE_KIND_TR, PREPARATION_TYPE_TR, SOURCE_TYPE_TR, tr } from "@/lib/aromaterapi/readLabels";
import { truncate } from "@/lib/aromaterapi/readFormat";

/** Aromaterapi V2 — C3D-D özel seçiciler (mevcut C3C read API üzerinden). */

export function PreparationPicker(props: {
  selected: PickerItem | null;
  onSelect: (i: PickerItem) => void;
  onClear: () => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const toItem = useCallback((r: PreparationListItem): PickerItem => ({
    id: r.id,
    label: tr.label(PREPARATION_TYPE_TR, r.preparation_type),
    sublabel: [r.taxon_canonical_name, r.plant_part].filter(Boolean).join(" · "),
  }), []);
  return (
    <EntitySearchPicker<PreparationListItem>
      label="Preparat"
      placeholder="Preparat türü, bitki kısmı ara…"
      selected={props.selected}
      onSelect={props.onSelect}
      onClear={props.onClear}
      search={fetchPreparationList}
      toItem={toItem}
      disabled={props.disabled}
      required={props.required}
    />
  );
}

export function SourcePicker(props: {
  selected: PickerItem | null;
  onSelect: (i: PickerItem) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const toItem = useCallback((r: SourceListItem): PickerItem => ({
    id: r.id,
    label: r.title,
    sublabel: [tr.label(SOURCE_TYPE_TR, r.source_type), r.authors, r.publication_year ? String(r.publication_year) : null]
      .filter(Boolean)
      .join(" · "),
  }), []);
  return (
    <EntitySearchPicker<SourceListItem>
      label="Kaynak"
      placeholder="Kaynak başlığı, yazar ara…"
      selected={props.selected}
      onSelect={props.onSelect}
      onClear={props.onClear}
      search={fetchSourceList}
      toItem={toItem}
      disabled={props.disabled}
    />
  );
}

/** Pasaj yalnız 'excerpt'/'full_text' olabilir; item.data pasajı taşır (passage_kind için). */
export function PassagePicker(props: {
  sourceId: string;
  selected: PickerItem | null;
  onSelect: (i: PickerItem) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const { sourceId } = props;
  const search = useCallback(
    (params: URLSearchParams, signal: AbortSignal) => fetchSourcePassageList(sourceId, params, signal),
    [sourceId],
  );
  const toItem = useCallback((r: PassageListItem): PickerItem => ({
    id: r.id,
    label: r.locator_label,
    sublabel: `${tr.label(PASSAGE_KIND_TR, r.passage_kind)} · ${r.original_lang}`,
    data: r,
  }), []);
  return (
    <EntitySearchPicker<PassageListItem>
      label="Pasaj"
      placeholder="Pasaj konumu ara…"
      selected={props.selected}
      onSelect={props.onSelect}
      onClear={props.onClear}
      search={search}
      toItem={toItem}
      disabled={props.disabled}
    />
  );
}

/** İlişki hedefi = başka bir Bilgi Kaydı (other_claim_id). */
export function RelatedRecordPicker(props: {
  selected: PickerItem | null;
  onSelect: (i: PickerItem) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const toItem = useCallback((r: KnowledgeRecordListItem): PickerItem => ({
    id: r.id,
    label: truncate(r.conclusion, 90),
    sublabel: [r.taxon_canonical_name, r.preparation_type].filter(Boolean).join(" · "),
  }), []);
  return (
    <EntitySearchPicker<KnowledgeRecordListItem>
      label="İlişkili Bilgi Kaydı"
      placeholder="Sonuç metni ara…"
      selected={props.selected}
      onSelect={props.onSelect}
      onClear={props.onClear}
      search={fetchKnowledgeRecordList}
      toItem={toItem}
      disabled={props.disabled}
    />
  );
}
