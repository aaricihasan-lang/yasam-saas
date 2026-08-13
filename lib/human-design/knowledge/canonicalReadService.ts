/**
 * HD Bilgi Bankası — NORMAL UZMAN salt-okuma servisi (server-only, service_role).
 * ==============================================================================
 *
 * SÖZLEŞME (fail-closed):
 *   - Yalnız YAYINLANMIŞ (status='published') canonical içerik döner. TASLAK ASLA.
 *   - Kaynak tam metni (özgün metin / sadık çeviri) yalnız effective
 *     `expert_delivery` hakkı true İSE ve ilgili kayıt status='verified' ise döner.
 *     Aksi halde yalnız bibliyografik/provenance metadata (fail-closed).
 *   - MUTATION YOK. Bu dosya yalnız okur.
 *   - Canonical veri TENANT'tan bağımsızdır (merkezî); tenant filtresi UYGULANMAZ.
 *   - db = service_role client (requireModuleAccess'ten gelir). Legacy
 *     human_design_knowledge_* tablolarına DOKUNMAZ.
 *
 * Sorgu iş mantığı mümkün olduğunca mevcut admin persistence READ yardımcılarını
 * (getContentByEntity/listEvidence/getRow/listOriginalTexts/listTranslations)
 * yeniden kullanır → tek kaynak, kopya sorgu yok.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getContentByEntity,
  getRow,
  listEvidence,
  listOriginalTexts,
  listTranslations,
} from "@/lib/human-design/admin/centralContentPersistence";
import type {
  HdCanonicalContentRow,
  HdEntityKind,
} from "@/lib/human-design/admin/centralContentTypes";
import { expertMaySeeFullText } from "./rights";
import type {
  HdKnowledgeContent,
  HdKnowledgeEntityDetail,
  HdKnowledgeEvidence,
  HdKnowledgeGroupItem,
  HdKnowledgeReadResult,
  HdKnowledgeSourceRef,
} from "./expertReadTypes";

const PUBLISHED = "published";
const VERIFIED = "verified";

type EntityRow = {
  id: string;
  entity_kind: HdEntityKind;
  canonical_key: string;
  name_tr: string;
  name_original: string | null;
};

function toGroupItem(e: EntityRow): HdKnowledgeGroupItem {
  return {
    canonical_key: e.canonical_key,
    entity_kind: e.entity_kind,
    name_tr: e.name_tr,
    name_original: e.name_original ?? null,
  };
}

function toContentDTO(row: HdCanonicalContentRow): HdKnowledgeContent {
  return {
    general_description: row.general_description ?? "",
    report_text: row.report_text ?? "",
    strategy_text: row.strategy_text ?? null,
    signature_text: row.signature_text ?? null,
    not_self_text: row.not_self_text ?? null,
    decision_mechanism: row.decision_mechanism ?? null,
    application_text: row.application_text ?? null,
    caution_notes: row.caution_notes ?? null,
    general_theme: row.general_theme ?? null,
    full_channel_text: row.full_channel_text ?? null,
    hanging_gate_context: row.hanging_gate_context ?? null,
  };
}

function toSourceRef(row: Record<string, unknown>): HdKnowledgeSourceRef {
  const authorsRaw = row.authors;
  return {
    id: String(row.id ?? ""),
    source_type: String(row.source_type ?? ""),
    title: String(row.title ?? ""),
    authors: Array.isArray(authorsRaw) ? authorsRaw.map((a) => String(a)) : [],
    organization: row.organization != null ? String(row.organization) : null,
  };
}

/**
 * Bir kimlik-türü (tip/otorite/kapi/kanal) için YALNIZ yayınlanmış içeriği olan
 * kimliklerin grup listesi. Yayınlanmamışlar (taslak) listede GÖRÜNMEZ.
 */
export async function listPublishedGroup(
  db: SupabaseClient,
  kind: HdEntityKind,
): Promise<HdKnowledgeReadResult<HdKnowledgeGroupItem[]>> {
  // 1) Bu türde yayınlanmış içeriğe sahip entity_id'ler.
  const { data: contentRows, error: cErr } = await db
    .from("hd_canonical_content")
    .select("entity_id")
    .eq("entity_kind", kind)
    .eq("status", PUBLISHED);
  if (cErr) return { ok: false, error: { code: "db_error", message: cErr.message } };

  const ids = Array.from(
    new Set((contentRows ?? []).map((r) => String((r as { entity_id: unknown }).entity_id)).filter(Boolean)),
  );
  if (ids.length === 0) return { ok: true, data: [] };

  // 2) Kimlik bilgilerini çek.
  const { data: entRows, error: eErr } = await db
    .from("hd_canonical_entities")
    .select("id, entity_kind, canonical_key, name_tr, name_original")
    .in("id", ids)
    .order("canonical_key", { ascending: true });
  if (eErr) return { ok: false, error: { code: "db_error", message: eErr.message } };

  const items = (entRows ?? []).map((r) => toGroupItem(r as unknown as EntityRow));
  return { ok: true, data: items };
}

/** canonical_key → kimlik satırı (published/draft ayrımı burada YAPILMAZ). */
async function getEntityByKey(
  db: SupabaseClient,
  canonicalKey: string,
): Promise<EntityRow | null> {
  const { data, error } = await db
    .from("hd_canonical_entities")
    .select("id, entity_kind, canonical_key, name_tr, name_original")
    .eq("canonical_key", canonicalKey)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as EntityRow;
}

/**
 * Bir kanıt satırı → hak-filtreli Kaynak Bağlantısı DTO'su. Tam metin yalnız
 * effective expert_delivery=true VE ilgili kayıt status='verified' ise doldurulur.
 */
async function buildEvidenceDTO(
  db: SupabaseClient,
  ev: { relation_type: string; is_primary: boolean; is_single_source: boolean; editorial_note: string | null; passage_id: string },
): Promise<HdKnowledgeEvidence | null> {
  const pRes = await getRow(db, "hd_source_passages", ev.passage_id);
  if (!pRes.ok) return null;
  const passage = pRes.data;
  const sourceId = String(passage.source_id ?? "");
  const sRes = sourceId ? await getRow(db, "hd_sources", sourceId) : null;
  if (!sRes || !sRes.ok) return null;
  const source = sRes.data;

  const mayFull = expertMaySeeFullText(source, passage);

  let originalText: string | null = null;
  let originalLang: string | null = null;
  let translation: string | null = null;

  if (mayFull) {
    const otRes = await listOriginalTexts(db, ev.passage_id);
    const ot = otRes.ok ? (otRes.data.find((o) => o.status === VERIFIED) ?? null) : null;
    if (ot) {
      originalText = ot.original_text ?? null;
      originalLang = ot.language_tag ?? null;
      const trRes = await listTranslations(db, ot.id);
      const tr = trRes.ok
        ? (trRes.data.find((t) => t.status === VERIFIED && t.target_language_tag === "tr") ?? null)
        : null;
      translation = tr ? (tr.translation_text ?? null) : null;
    }
  }

  return {
    relation_type: ev.relation_type,
    is_primary: ev.is_primary === true,
    is_single_source: ev.is_single_source === true,
    editorial_note: ev.editorial_note ?? null,
    source: toSourceRef(source),
    passage: {
      locator_kind: String(passage.locator_kind ?? ""),
      locator_label: String(passage.locator_label ?? ""),
      locator_value: String(passage.locator_value ?? ""),
      passage_kind: String(passage.passage_kind ?? ""),
      source_specific_note: passage.source_specific_note != null ? String(passage.source_specific_note) : null,
    },
    full_text_restricted: !mayFull,
    original_text: originalText,
    original_language_tag: originalLang,
    faithful_translation: translation,
  };
}

/**
 * canonical_key için normal-uzman detay projeksiyonu. İçerik yayınlanmamışsa
 * `content=null` (taslak ASLA sızmaz), evidence yalnız yayınlanmış içeriğe bağlanır.
 */
export async function getPublishedEntityDetail(
  db: SupabaseClient,
  canonicalKey: string,
): Promise<HdKnowledgeReadResult<HdKnowledgeEntityDetail>> {
  const entity = await getEntityByKey(db, canonicalKey);
  if (!entity) {
    return { ok: false, error: { code: "not_found", message: "Canonical kimlik bulunamadı." } };
  }

  const cRes = await getContentByEntity(db, entity.id);
  if (!cRes.ok) return { ok: false, error: { code: "db_error", message: cRes.error.message } };

  const contentRow = cRes.data;
  const isPublished = contentRow != null && contentRow.status === PUBLISHED;

  // Taslak içerik → normal uzmana kapalı: content=null, evidence/sources boş.
  if (!isPublished || !contentRow) {
    return {
      ok: true,
      data: { entity: toGroupItem(entity), content: null, sources: [], evidence: [] },
    };
  }

  const evRes = await listEvidence(db, contentRow.id);
  const evRows = evRes.ok ? evRes.data : [];

  const evidenceDTOs = (
    await Promise.all(
      evRows.map((e) =>
        buildEvidenceDTO(db, {
          relation_type: e.relation_type,
          is_primary: e.is_primary,
          is_single_source: e.is_single_source,
          editorial_note: e.editorial_note,
          passage_id: e.passage_id,
        }),
      ),
    )
  ).filter((x): x is HdKnowledgeEvidence => x !== null);

  // Kaynaklar sekmesi: kanıtlarda geçen benzersiz kaynaklar (bibliyografik).
  const sourceMap = new Map<string, HdKnowledgeSourceRef>();
  for (const ev of evidenceDTOs) {
    if (ev.source.id && !sourceMap.has(ev.source.id)) sourceMap.set(ev.source.id, ev.source);
  }

  return {
    ok: true,
    data: {
      entity: toGroupItem(entity),
      content: toContentDTO(contentRow),
      sources: Array.from(sourceMap.values()),
      evidence: evidenceDTOs,
    },
  };
}
