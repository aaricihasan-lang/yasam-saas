/**
 * Yaşam Hafızası™ — İndeks Yazma Planı (Sprint 2 / S2.10, SAF katman).
 *
 * SAF (pure). `BuiltIndexUnit`'leri DB satırına eşler, deterministik `search_text`
 * üretir ve mevcut indeks hash'leriyle karşılaştırıp hash-aware yazma planı çıkarır:
 *   planIndexWrites(units, existingHashes) → { toUpsert, plannedInsert, plannedUpdate, unchanged }
 *
 * SAFLIK SINIRI — bu dosyada BULUNMAZ:
 *   Supabase / DB / fetch / process.env / IO / zaman / rastgele / filesystem /
 *   network / global state / log. `search_tsv` ÜRETİLMEZ (retrieval'a ait).
 *
 * KANONİK KURALLAR (S2.10):
 *   - `search_text` YALNIZ burada (writer'da değil) üretilir; builder/runSource
 *     search biçimlendirme sorumluluğu almaz (K-S). `BuiltIndexUnit` ve builder
 *     dosyaları değişmez (AD-004).
 *   - `search_text` normalize EDİLMEZ (lowercase/unaccent yok; Türkçe korunur);
 *     yalnız whitespace sadeleştirilir. Gerçek normalize/tsquery retrieval'a aittir.
 *   - DB satırı yalnız builder'ın ürettiği içeriği + `search_text` taşır; DB'nin
 *     üreteceği/default kolonlar (id, is_shared[generated], search_tsv, lang,
 *     is_client_pii, reviewed_at, version, indexed_at) GÖNDERİLMEZ.
 *   - Sayaç adları gerçek DB sonucu gibi sunulmaz: plannedInsert/plannedUpdate/
 *     unchanged (K-T). Prefetch yalnız PLANLANAN sınıflandırmadır.
 *   - Girdi (units / diziler) MUTATE EDİLMEZ; exception yalnız açık sözleşme
 *     ihlalinde (aynı conflict key, farklı content_hash) fırlatılır.
 *   - Kaynak dosyada literal NUL bayt yoktur (ayıraç `String.fromCharCode(0)`).
 */

import type { BuiltIndexUnit } from "./buildCandidate";
import type { EvidenceField, ExpertRelation } from "../search/types";

// ─── Conflict key (source_id + section_ref; NUL ayıraç, literal bayt yok) ─────
const KEY_SEP = String.fromCharCode(0);

/**
 * Deterministik conflict anahtarı. `section_ref` null'ı boş-string'den ayırmak
 * için null-bayrağı ("N") vs değer-bayrağı ("V") kullanılır (injektif).
 */
export function indexConflictKey(sourceId: string, sectionRef: string | null): string {
  return sectionRef === null
    ? `${sourceId}${KEY_SEP}N`
    : `${sourceId}${KEY_SEP}V${KEY_SEP}${sectionRef}`;
}

// ─── search_text üretimi (saf, deterministik, normalize YOK) ──────────────────

/** Whitespace sadeleştirme (baş/son trim + iç boşlukları tek boşluk). */
function collapseWs(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/**
 * `BuiltIndexUnit`'in indekslenebilir metinsel alanlarından deterministik
 * `search_text` üretir. Sabit alan sırası:
 *   1) title  2) snippet  3) topicTags  4) expertRelations.targetLabel
 *   5) evidenceFields.text
 * Kurallar: yalnız string; trim + iç whitespace tek boşluk; boşları atla; dizi
 * sırasını koru; Türkçe/koruma (lowercase/unaccent YOK); açık duplicate parçaları
 * (aynı normalize metin) tekilleştir; anlamlı metin yoksa `null`.
 */
export function makeSearchText(unit: BuiltIndexUnit): string | null {
  const pieces: string[] = [];
  const seen = new Set<string>();

  const add = (v: unknown): void => {
    if (typeof v !== "string") return;
    const norm = collapseWs(v);
    if (norm.length === 0 || seen.has(norm)) return;
    seen.add(norm);
    pieces.push(norm);
  };

  add(unit.title);
  add(unit.snippet);
  for (const t of unit.topicTags) add(t);
  for (const r of unit.expertRelations) add(r.targetLabel); // ExpertRelation metinsel alanı
  for (const e of unit.evidenceFields) add(e.text); // EvidenceField metinsel alanı

  return pieces.length > 0 ? pieces.join(" ") : null;
}

// ─── DB satırı eşlemesi ───────────────────────────────────────────────────────

/**
 * yasam_hafizasi_index'e yazılacak satır (writer'ın gönderdiği kolonlar).
 * jsonb/array alanları `search/types.ts` şekliyle (camelCase) TAŞINIR — TS
 * retrieval tipleri (Candidate.evidenceFields vb.) ile round-trip tutarlı.
 * GÖNDERİLMEZ: id, is_shared(generated), search_tsv, lang, is_client_pii,
 * reviewed_at, version, indexed_at (DB üretir/default).
 */
export interface DbIndexRow {
  readonly tenant_id: string | null;
  readonly source_module: string;
  readonly source_table: string;
  readonly source_id: string;
  readonly unit_type: "record" | "section" | "row";
  readonly section_ref: string | null;
  readonly group_key: string | null;
  readonly title: string | null;
  readonly title_source: string | null;
  readonly snippet: string | null;
  readonly snippet_origin: string | null;
  readonly search_text: string | null;
  readonly evidence_fields: EvidenceField[];
  readonly topic_tags: string[];
  readonly expert_relations: ExpertRelation[];
  readonly source_updated_at: string | null;
  readonly content_hash: string;
}

/** Bir `BuiltIndexUnit`'i DB satırına eşler (search_text dahil; mutation yok). */
export function toDbIndexRow(unit: BuiltIndexUnit): DbIndexRow {
  return {
    tenant_id: unit.tenantId,
    source_module: unit.sourceModule,
    source_table: unit.sourceTable,
    source_id: unit.sourceId,
    unit_type: unit.unitType,
    section_ref: unit.sectionRef,
    group_key: unit.groupKey,
    title: unit.title,
    title_source: unit.titleSource,
    snippet: unit.snippet,
    snippet_origin: unit.snippetOrigin,
    search_text: makeSearchText(unit),
    evidence_fields: unit.evidenceFields.slice(), // mutation izolasyonu (içerik değişmez)
    topic_tags: unit.topicTags.slice(),
    expert_relations: unit.expertRelations.slice(),
    source_updated_at: unit.sourceUpdatedAt,
    content_hash: unit.contentHash,
  };
}

// ─── Hash-aware plan ──────────────────────────────────────────────────────────

/** Bir unit'in mevcut indekse göre planlanan dispozisyonu. */
export type IndexWriteDisposition = "insert" | "update" | "unchanged";

/** Conflict key → mevcut content_hash (null olabilir). */
export type ExistingHashMap = ReadonlyMap<string, string | null>;

/** Hash-aware yazma planı (sahte DB kesinliği değil; PLANLANAN sınıflandırma). */
export interface IndexWritePlan {
  readonly toUpsert: DbIndexRow[];
  readonly plannedInsert: number;
  readonly plannedUpdate: number;
  readonly unchanged: number;
}

/**
 * Unit'leri mevcut hash'lerle karşılaştırıp yazma planı üretir.
 *   yok → plannedInsert · farklı hash → plannedUpdate · aynı hash → unchanged.
 * Aynı sayfada aynı conflict key: aynı hash → sessiz tekilleştir (bir kez say);
 * farklı hash → açık sözleşme ihlali (throw). Girdi mutate edilmez.
 */
export function planIndexWrites(
  units: readonly BuiltIndexUnit[],
  existing: ExistingHashMap,
): IndexWritePlan {
  const toUpsert: DbIndexRow[] = [];
  let plannedInsert = 0;
  let plannedUpdate = 0;
  let unchanged = 0;

  const seenInPage = new Map<string, string>(); // conflict key → kabul edilen unit'in hash'i

  for (const unit of units) {
    const key = indexConflictKey(unit.sourceId, unit.sectionRef);

    const prior = seenInPage.get(key);
    if (prior !== undefined) {
      if (prior === unit.contentHash) continue; // aynı key + aynı hash → tekilleştir
      throw new Error(
        `planIndexWrites: aynı conflict key farklı content_hash (sözleşme ihlali)`,
      );
    }
    seenInPage.set(key, unit.contentHash);

    const existingHash = existing.get(key);
    if (existingHash === undefined) {
      plannedInsert += 1;
      toUpsert.push(toDbIndexRow(unit));
    } else if (existingHash === unit.contentHash) {
      unchanged += 1;
    } else {
      plannedUpdate += 1;
      toUpsert.push(toDbIndexRow(unit));
    }
  }

  return { toUpsert, plannedInsert, plannedUpdate, unchanged };
}
