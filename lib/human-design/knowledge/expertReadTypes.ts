/**
 * HD Bilgi Bankası — NORMAL UZMAN salt-okuma projeksiyon tipleri.
 * ==============================================================
 *
 * Bu tipler yalnız YAYINLANMIŞ (published) canonical içeriğin, hak sözleşmesine
 * göre FİLTRELENMİŞ, tarayıcıya güvenli projeksiyonudur. service_role satır tipleri
 * (centralContentTypes) DEĞİLDİR; tam metin yalnız hak izin verdiğinde doldurulur.
 */

import type { HdEntityKind } from "@/lib/human-design/admin/centralContentTypes";

export type { HdEntityKind };

/** Grup listesi öğesi (yalnız yayınlanmış içeriği olan kimlikler). */
export type HdKnowledgeGroupItem = {
  canonical_key: string;
  entity_kind: HdEntityKind;
  name_tr: string;
  name_original: string | null;
};

/** Kaynaklandırılmış Ana Metin (published) — client'a güvenli alanlar. */
export type HdKnowledgeContent = {
  general_description: string;
  report_text: string;
  // Tip
  strategy_text: string | null;
  signature_text: string | null;
  not_self_text: string | null;
  // Otorite
  decision_mechanism: string | null;
  application_text: string | null;
  caution_notes: string | null;
  // Kapı
  general_theme: string | null;
  // Kanal
  full_channel_text: string | null;
  hanging_gate_context: string | null;
};

/** Bibliyografik kaynak referansı (hak-güvenli; her zaman gösterilebilir). */
export type HdKnowledgeSourceRef = {
  id: string;
  source_type: string;
  title: string;
  authors: string[];
  organization: string | null;
};

/** Kaynak Bağlantısı (içerik ↔ pasaj kanıtı). Tam metin yalnız hak izin verirse. */
export type HdKnowledgeEvidence = {
  relation_type: string;
  is_primary: boolean;
  is_single_source: boolean;
  editorial_note: string | null;
  source: HdKnowledgeSourceRef;
  passage: {
    locator_kind: string;
    locator_label: string;
    locator_value: string;
    passage_kind: string;
    source_specific_note: string | null;
  };
  /** true → hak izin vermediği için tam metin (özgün/çeviri) gizlendi. */
  full_text_restricted: boolean;
  original_text: string | null;
  original_language_tag: string | null;
  faithful_translation: string | null;
};

export type HdKnowledgeEntityDetail = {
  entity: HdKnowledgeGroupItem;
  /** Yalnız YAYINLANMIŞ içerik; taslak ise `null`. */
  content: HdKnowledgeContent | null;
  sources: HdKnowledgeSourceRef[];
  evidence: HdKnowledgeEvidence[];
};

export type HdKnowledgeReadError = {
  code: "not_found" | "db_error";
  message: string;
};

export type HdKnowledgeReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: HdKnowledgeReadError };
