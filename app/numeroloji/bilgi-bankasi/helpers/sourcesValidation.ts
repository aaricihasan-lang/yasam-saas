/**
 * NKB-V2-C — Sunucu tarafı saf girdi doğrulama (Knowledge content_sections + kaynak API'leri).
 *
 * Saf/deterministik: DB/ağ yok. Route'lar bu helper'ları çağırır; harness bunları test eder.
 * Tenant sahipliği ve DB işlemleri route katmanındadır (burada YOK).
 */

import {
  KULVAR_SECTION_KEYS,
  isKulvarAnalysisType,
  validateKulvarSections,
  type KnowledgeSection,
  type KulvarSectionKey,
} from "./knowledgeSections";

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; status: number; error: string };
export type Result<T> = Ok<T> | Err;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

/** Uçları temizler; iç yazımı (ör. kilitli display_label) DEĞİŞTİRMEZ. */
function trimEnds(v: string): string {
  return v.replace(/^\s+/, "").replace(/\s+$/, "");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isSafeInt(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

// ── Knowledge: content_sections tür-koşullu doğrulama ────────────────────────

/**
 * content_sections'ı analysis_type'a göre doğrular.
 *  - undefined → alan gönderilmemiş (değişiklik yok).
 *  - ana-kulvar/yan-kulvar → validateKulvarSections; null serbest (kaydı NULL bırakır).
 *  - diğer türler → non-null gönderim REDDEDİLİR (null no-op kabul).
 */
export function validateContentSectionsForType(
  analysisType: string,
  contentSections: unknown,
): Result<KnowledgeSection[] | null | undefined> {
  if (contentSections === undefined) return { ok: true, value: undefined };

  if (isKulvarAnalysisType(analysisType)) {
    if (contentSections === null) return { ok: true, value: null };
    const v = validateKulvarSections(contentSections);
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    return { ok: true, value: v.sections };
  }

  if (contentSections === null) return { ok: true, value: null };
  return {
    ok: false,
    status: 400,
    error: "content_sections yalnız ana-kulvar ve yan-kulvar için kullanılabilir.",
  };
}

/** Create-only kararı: overwrite açıkça true değilse mevcut kayıt ezilmez. */
export function decideCreateConflict(exists: boolean, overwrite: boolean): "create" | "overwrite" | "conflict" {
  if (!exists) return "create";
  return overwrite === true ? "overwrite" : "conflict";
}

// ── numerology_sources girdi doğrulama ───────────────────────────────────────

const SOURCE_TEXT_FIELDS = [
  "title",
  "authors",
  "organization",
  "source_type",
  "level_or_edition",
  "language",
  "notes",
] as const;

const SOURCE_ALLOWED = new Set<string>([
  "display_label",
  ...SOURCE_TEXT_FIELDS,
  "publication_year",
]);

export type SourcePayload = {
  display_label?: string;
  title?: string | null;
  authors?: string | null;
  organization?: string | null;
  source_type?: string | null;
  level_or_edition?: string | null;
  language?: string | null;
  notes?: string | null;
  publication_year?: number | null;
};

/**
 * numerology_sources create/patch payload doğrulama.
 *  - Bilinmeyen alan reddedilir.
 *  - display_label: create'te zorunlu ve boş olamaz; yazımı korunur (yalnız uç temizliği).
 *  - Opsiyonel metin: verilirse string; uç temizliği; boş → NULL.
 *  - publication_year: verilirse 0..3000 tamsayı veya null.
 */
export function validateSourceInput(
  body: unknown,
  opts: { partial: boolean },
): Result<SourcePayload> {
  if (!isPlainObject(body)) return { ok: false, status: 400, error: "Geçersiz istek gövdesi." };

  for (const key of Object.keys(body)) {
    if (!SOURCE_ALLOWED.has(key)) {
      return { ok: false, status: 400, error: `Bilinmeyen alan: "${key}".` };
    }
  }

  const out: SourcePayload = {};

  // display_label
  if (body.display_label !== undefined) {
    if (typeof body.display_label !== "string") {
      return { ok: false, status: 400, error: "display_label string olmalı." };
    }
    const dl = trimEnds(body.display_label);
    if (dl === "") return { ok: false, status: 400, error: "display_label boş olamaz." };
    out.display_label = dl;
  } else if (!opts.partial) {
    return { ok: false, status: 400, error: "display_label zorunludur." };
  }

  for (const f of SOURCE_TEXT_FIELDS) {
    const v = (body as Record<string, unknown>)[f];
    if (v === undefined) continue;
    if (v === null) {
      out[f] = null;
      continue;
    }
    if (typeof v !== "string") return { ok: false, status: 400, error: `${f} string olmalı.` };
    const t = trimEnds(v);
    out[f] = t === "" ? null : t;
  }

  if (body.publication_year !== undefined) {
    if (body.publication_year === null) {
      out.publication_year = null;
    } else if (isSafeInt(body.publication_year, 0, 3000)) {
      out.publication_year = body.publication_year;
    } else {
      return { ok: false, status: 400, error: "publication_year 0..3000 arası tamsayı olmalı." };
    }
  }

  return { ok: true, value: out };
}

// ── numerology_record_sources girdi doğrulama ────────────────────────────────

const RECORD_SOURCE_ALLOWED = new Set<string>([
  "knowledge_record_id",
  "source_id",
  "page_start",
  "page_end",
  "locator",
  "is_primary",
  "display_order",
  "internal_note",
  "section_key",
]);

const SECTION_KEY_SET = new Set<string>(KULVAR_SECTION_KEYS);

export type RecordSourcePayload = {
  knowledge_record_id?: string;
  source_id?: string;
  page_start?: number | null;
  page_end?: number | null;
  locator?: string | null;
  is_primary?: boolean;
  display_order?: number;
  internal_note?: string | null;
  section_key?: KulvarSectionKey | null;
};

/**
 * Bağlantı payload doğrulama.
 *  - Bilinmeyen alan reddedilir.
 *  - create'te knowledge_record_id + source_id zorunlu ve UUID.
 *  - page_start/page_end: >=0 tamsayı; ikisi de varsa start<=end.
 *  - display_order: güvenli tamsayı; is_primary: boolean.
 *  - section_key: null serbest; verilirse yalnız 4 Kulvar anahtarı VE hedef kayıt
 *    ana-kulvar/yan-kulvar olmalı (recordAnalysisType). Aksi halde reddedilir.
 */
export function validateRecordSourceInput(
  body: unknown,
  opts: { partial: boolean; recordAnalysisType?: string | null },
): Result<RecordSourcePayload> {
  if (!isPlainObject(body)) return { ok: false, status: 400, error: "Geçersiz istek gövdesi." };

  for (const key of Object.keys(body)) {
    if (!RECORD_SOURCE_ALLOWED.has(key)) {
      return { ok: false, status: 400, error: `Bilinmeyen alan: "${key}".` };
    }
  }

  const out: RecordSourcePayload = {};

  if (!opts.partial) {
    if (!isUuid(body.knowledge_record_id)) {
      return { ok: false, status: 400, error: "knowledge_record_id geçerli bir UUID olmalı." };
    }
    if (!isUuid(body.source_id)) {
      return { ok: false, status: 400, error: "source_id geçerli bir UUID olmalı." };
    }
    out.knowledge_record_id = trimEnds(body.knowledge_record_id as string);
    out.source_id = trimEnds(body.source_id as string);
  } else {
    // PATCH bağlantı kimliğini değiştirmez; verilirse yok say/red — burada reddet.
    if (body.knowledge_record_id !== undefined || body.source_id !== undefined) {
      return { ok: false, status: 400, error: "Bağlantı kimliği (knowledge_record_id/source_id) değiştirilemez." };
    }
  }

  const pageStartGiven = body.page_start !== undefined && body.page_start !== null;
  const pageEndGiven = body.page_end !== undefined && body.page_end !== null;

  if (body.page_start !== undefined) {
    if (body.page_start === null) out.page_start = null;
    else if (isSafeInt(body.page_start, 0, 1_000_000)) out.page_start = body.page_start;
    else return { ok: false, status: 400, error: "page_start 0..1000000 arası tamsayı olmalı." };
  }
  if (body.page_end !== undefined) {
    if (body.page_end === null) out.page_end = null;
    else if (isSafeInt(body.page_end, 0, 1_000_000)) out.page_end = body.page_end;
    else return { ok: false, status: 400, error: "page_end 0..1000000 arası tamsayı olmalı." };
  }
  if (pageStartGiven && pageEndGiven && (body.page_start as number) > (body.page_end as number)) {
    return { ok: false, status: 400, error: "page_start, page_end'den büyük olamaz." };
  }

  if (body.display_order !== undefined) {
    if (isSafeInt(body.display_order, 0, 1_000_000)) out.display_order = body.display_order;
    else return { ok: false, status: 400, error: "display_order 0..1000000 arası tamsayı olmalı." };
  }

  if (body.is_primary !== undefined) {
    if (typeof body.is_primary !== "boolean") {
      return { ok: false, status: 400, error: "is_primary boolean olmalı." };
    }
    out.is_primary = body.is_primary;
  }

  for (const f of ["locator", "internal_note"] as const) {
    const v = (body as Record<string, unknown>)[f];
    if (v === undefined) continue;
    if (v === null) {
      out[f] = null;
      continue;
    }
    if (typeof v !== "string") return { ok: false, status: 400, error: `${f} string olmalı.` };
    const t = trimEnds(v);
    out[f] = t === "" ? null : t;
  }

  if (body.section_key !== undefined) {
    if (body.section_key === null) {
      out.section_key = null;
    } else if (typeof body.section_key === "string" && SECTION_KEY_SET.has(body.section_key)) {
      if (!isKulvarAnalysisType(opts.recordAnalysisType ?? "")) {
        return {
          ok: false,
          status: 400,
          error: "section_key yalnız ana-kulvar/yan-kulvar bilgi kayıtlarında kullanılabilir.",
        };
      }
      out.section_key = body.section_key as KulvarSectionKey;
    } else {
      return {
        ok: false,
        status: 400,
        error: `Geçersiz section_key. İzinli: ${KULVAR_SECTION_KEYS.join(", ")} veya null.`,
      };
    }
  }

  return { ok: true, value: out };
}

/** DB hata kodunu güvenli HTTP yanıtına çevirir (iç ayrıntı sızdırmaz). */
export function safeDbError(error: unknown): { status: number; message: string } {
  const code =
    error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "23505") return { status: 409, message: "Bu kayıt zaten mevcut (çakışma)." };
  if (code === "23503") return { status: 409, message: "İlişkili kayıt nedeniyle işlem yapılamadı." };
  return { status: 500, message: "İşlem tamamlanamadı." };
}
