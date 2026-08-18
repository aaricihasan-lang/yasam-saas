/**
 * Şifa Rehberi — Section-Native editör SAF veri modeli (FAZ 2).
 * (React'sız → hem editör component'i hem harness bunu kullanır.)
 */
import type { HealingGuideSectionRow } from "@/lib/sifa-rehberi/healingGuideLiveData";
import { MODALITIES } from "@/lib/sifa-rehberi/sectionModel";

export type EditableSection = {
  /** React key + reorder identity (mevcut section id veya üretilen). */
  key: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string;
  source: string;
  source_kind: string;
  expert_note: string;
  attention: string;
  images: unknown[];
};

let seq = 0;
export function newSectionKey(): string {
  seq += 1;
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `new-${seq}`;
}

/** DB satırından editör draft'ına (KAYIPSIZ). */
export function sectionRowToEditable(s: HealingGuideSectionRow): EditableSection {
  return {
    key: s.id || newSectionKey(),
    section_type: s.section_type,
    mode: s.mode,
    title: s.title,
    note: s.note ?? "",
    source: s.source ?? "",
    source_kind: s.source_kind ?? "",
    expert_note: s.expert_note ?? "",
    attention: s.attention ?? "",
    images: Array.isArray(s.images) ? s.images : [],
  };
}

/** Editör draft'ından replace payload'ına (route/RPC ile aynı sözleşme). */
export function editableToPayload(list: EditableSection[]): Record<string, unknown>[] {
  return list.map((s, i) => ({
    section_type: s.section_type,
    mode: s.mode,
    title: s.title,
    note: s.note,
    source: s.source,
    source_kind: s.source_kind,
    expert_note: s.expert_note,
    attention: s.attention,
    images: s.images,
    sort_order: i,
  }));
}

/**
 * Editör durumunun deterministik imzası (dirty tespiti için).
 * Referential equality DEĞİL; içerik-tabanlı stabil serileştirme (key hariç, sıra dahil).
 * name/category/sections aynıysa imza aynı → dirty=false.
 */
export function editorSignature(
  name: string,
  category: string,
  sections: EditableSection[],
): string {
  return JSON.stringify({
    n: (name ?? "").trim(),
    c: (category ?? "").trim(),
    s: editableToPayload(sections),
  });
}

/** Yeni boş bölüm (ilk modalite ile). */
export function emptyEditableSection(): EditableSection {
  const first = MODALITIES[0];
  return {
    key: newSectionKey(),
    section_type: first.section_type,
    mode: first.id,
    title: null,
    note: "",
    source: "",
    source_kind: "",
    expert_note: "",
    attention: "",
    images: [],
  };
}
