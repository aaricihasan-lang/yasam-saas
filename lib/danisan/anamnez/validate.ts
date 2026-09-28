/**
 * Anamnez sunucu doğrulaması — SAF (route + harness). İstemciden gelen HER JSON burada
 * şablon sürümüne göre allowlist + tip + uzunluk doğrulamasından geçer; bilinmeyen anahtar
 * veya tip → hata (sessiz kabul YOK). tenant_id / client_id / status gövdeden OKUNMAZ.
 */
import { allFieldKeys, getTemplate, isKnownTemplateVersion, templateFieldIndex } from "./schema";
import {
  ANAMNEZ_SECTION_KEYS,
  ANAMNEZ_SOURCE_KEYS,
  CUSTOM_FIELD_TYPES,
  type AnamnezSectionKey,
  type AnamnezSourceKey,
  type Answers,
  type AnswerValue,
  type CustomField,
  type CustomFieldType,
  type FormCustom,
  type RowColumn,
  type SourceCmpValue,
  type SourceLink,
  type SourceLinks,
} from "./types";

export const ANAMNEZ_LIMITS = {
  textMax: 300,
  textareaMax: 4000,
  labelMax: 200,
  titleMax: 120,
  rowsMax: 30,
  rowCellMax: 300,
  customPerSection: 10,
  customTotal: 30,
  customOptionsMin: 2,
  customOptionsMax: 20,
  customOptionLabelMax: 100,
  /** Tüm cevaplar JSON (UTF-8) — DB CHECK ile hizalı (pg_column_size ≤ 262144). */
  answersBytesMax: 200_000,
  sourceRefMax: 120,
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string; field?: string };

const ok = <T,>(value: T): ValidationResult<T> => ({ ok: true, value });
const fail = (error: string, field?: string): ValidationResult<never> => ({ ok: false, error, field });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CUSTOM_KEY_RE = /^c_[0-9a-f]{8,32}$/;
const CUSTOM_OPTION_KEY_RE = /^o[0-9]{1,3}$/;
const ROW_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").replace(/\r\n/g, "\n");
  if (s.length > max) return null;
  return s;
}

// ─── form_custom ─────────────────────────────────────────────────────────────

export function validateFormCustom(version: string, raw: unknown): ValidationResult<FormCustom> {
  if (!isKnownTemplateVersion(version)) return fail("Bilinmeyen şablon sürümü.");
  if (!isPlainObject(raw)) return fail("form_custom geçersiz.", "formCustom");
  const allowed = new Set(["hidden", "labels", "enabledSections", "custom"]);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) return fail(`form_custom: bilinmeyen alan ${k}`, "formCustom");

  const template = getTemplate(version);
  const index = templateFieldIndex(version);

  // custom
  const customRaw = raw.custom ?? [];
  if (!Array.isArray(customRaw)) return fail("custom dizi olmalı.", "formCustom.custom");
  if (customRaw.length > ANAMNEZ_LIMITS.customTotal) return fail("Çok fazla özel soru.", "formCustom.custom");
  const custom: CustomField[] = [];
  const seen = new Set<string>();
  const perSection = new Map<string, number>();
  for (const c of customRaw) {
    if (!isPlainObject(c)) return fail("Özel soru geçersiz.", "formCustom.custom");
    for (const k of Object.keys(c)) {
      if (!["key", "section", "type", "label", "options"].includes(k)) return fail(`Özel soru: bilinmeyen alan ${k}`, "formCustom.custom");
    }
    const key = c.key;
    if (typeof key !== "string" || !CUSTOM_KEY_RE.test(key) || seen.has(key) || index.has(key)) {
      return fail("Özel soru anahtarı geçersiz.", "formCustom.custom");
    }
    seen.add(key);
    const section = c.section;
    if (typeof section !== "string" || !(ANAMNEZ_SECTION_KEYS as readonly string[]).includes(section)) {
      return fail("Özel soru bölümü geçersiz.", "formCustom.custom");
    }
    const n = (perSection.get(section) ?? 0) + 1;
    if (n > ANAMNEZ_LIMITS.customPerSection) return fail("Bu bölüme çok fazla özel soru eklendi.", "formCustom.custom");
    perSection.set(section, n);
    const type = c.type;
    if (typeof type !== "string" || !(CUSTOM_FIELD_TYPES as readonly string[]).includes(type)) {
      return fail("Özel soru tipi geçersiz.", "formCustom.custom");
    }
    const label = cleanText(c.label, ANAMNEZ_LIMITS.labelMax);
    if (label === null || label.trim() === "") return fail("Özel soru başlığı geçersiz.", "formCustom.custom");
    const field: CustomField = { key, section: section as AnamnezSectionKey, type: type as CustomFieldType, label: label.trim() };
    if (type === "single" || type === "multi") {
      const opts = c.options;
      if (!Array.isArray(opts) || opts.length < ANAMNEZ_LIMITS.customOptionsMin || opts.length > ANAMNEZ_LIMITS.customOptionsMax) {
        return fail("Seçenek sayısı geçersiz.", "formCustom.custom");
      }
      const okeys = new Set<string>();
      field.options = [];
      for (const o of opts) {
        if (!isPlainObject(o) || typeof o.key !== "string" || !CUSTOM_OPTION_KEY_RE.test(o.key) || okeys.has(o.key)) {
          return fail("Seçenek geçersiz.", "formCustom.custom");
        }
        const ol = cleanText(o.label, ANAMNEZ_LIMITS.customOptionLabelMax);
        if (ol === null || ol.trim() === "") return fail("Seçenek etiketi geçersiz.", "formCustom.custom");
        okeys.add(o.key);
        field.options.push({ key: o.key, label: ol.trim() });
      }
    } else if (c.options !== undefined) {
      return fail("Bu soru tipi seçenek almaz.", "formCustom.custom");
    }
    custom.push(field);
  }

  const validKeys = new Set<string>([...index.keys(), ...seen]);

  // hidden
  const hiddenRaw = raw.hidden ?? [];
  if (!Array.isArray(hiddenRaw)) return fail("hidden dizi olmalı.", "formCustom.hidden");
  const hidden: string[] = [];
  for (const h of hiddenRaw) {
    if (typeof h !== "string" || !validKeys.has(h)) return fail("Gizlenen alan geçersiz.", "formCustom.hidden");
    if (!hidden.includes(h)) hidden.push(h);
  }

  // labels (yalnız kanonik alanlar için override)
  const labelsRaw = raw.labels ?? {};
  if (!isPlainObject(labelsRaw)) return fail("labels geçersiz.", "formCustom.labels");
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(labelsRaw)) {
    if (!index.has(k)) return fail("Başlık düzenlemesi geçersiz alan.", "formCustom.labels");
    const s = cleanText(v, ANAMNEZ_LIMITS.labelMax);
    if (s === null || s.trim() === "") return fail("Başlık geçersiz.", "formCustom.labels");
    labels[k] = s.trim();
  }

  // enabledSections (yalnız optional bölümler)
  const enRaw = raw.enabledSections ?? [];
  if (!Array.isArray(enRaw)) return fail("enabledSections dizi olmalı.", "formCustom.enabledSections");
  const optional = new Set(template.sections.filter((s) => s.optional).map((s) => s.key as string));
  const enabledSections: AnamnezSectionKey[] = [];
  for (const s of enRaw) {
    if (typeof s !== "string" || !optional.has(s)) return fail("Etkinleştirilen bölüm geçersiz.", "formCustom.enabledSections");
    if (!enabledSections.includes(s as AnamnezSectionKey)) enabledSections.push(s as AnamnezSectionKey);
  }

  return ok({ hidden, labels, enabledSections, custom });
}

// ─── answers ─────────────────────────────────────────────────────────────────

type FieldSpec =
  | { type: "yn" | "ynd" | "text" | "textarea" | "date" | "time" | "scale10" }
  | { type: "number"; min?: number; max?: number }
  | { type: "single" | "multi"; optionKeys: Set<string> }
  | { type: "rows"; columns: readonly RowColumn[]; optionSets: Readonly<Record<string, readonly string[]>> };

function fieldSpecs(version: string, custom: FormCustom): Map<string, FieldSpec> {
  const template = getTemplate(version);
  const m = new Map<string, FieldSpec>();
  for (const section of template.sections) {
    for (const f of section.fields) {
      if (f.type === "single" || f.type === "multi") {
        m.set(f.key, { type: f.type, optionKeys: new Set(template.optionSets[f.options ?? ""] ?? []) });
      } else if (f.type === "number") {
        m.set(f.key, { type: "number", min: f.min, max: f.max });
      } else if (f.type === "rows") {
        m.set(f.key, { type: "rows", columns: f.columns ?? [], optionSets: template.optionSets });
      } else {
        m.set(f.key, { type: f.type });
      }
    }
  }
  for (const c of custom.custom) {
    if (c.type === "single" || c.type === "multi") {
      m.set(c.key, { type: c.type, optionKeys: new Set((c.options ?? []).map((o) => o.key)) });
    } else if (c.type === "number") {
      m.set(c.key, { type: "number", min: -1_000_000, max: 1_000_000 });
    } else {
      m.set(c.key, { type: c.type });
    }
  }
  return m;
}

function validateValue(spec: FieldSpec, v: unknown): ValidationResult<AnswerValue> {
  if (v === null) return ok(null);
  switch (spec.type) {
    case "yn":
      return typeof v === "boolean" ? ok(v) : fail("evet/hayır bekleniyor");
    case "ynd": {
      if (!isPlainObject(v)) return fail("evet/hayır + açıklama bekleniyor");
      for (const k of Object.keys(v)) if (k !== "v" && k !== "d") return fail("ynd: bilinmeyen alan");
      const vv = v.v === undefined ? null : v.v;
      if (vv !== null && typeof vv !== "boolean") return fail("ynd.v geçersiz");
      const d = v.d === undefined ? "" : cleanText(v.d, ANAMNEZ_LIMITS.textareaMax);
      if (d === null) return fail("ynd.d geçersiz");
      return ok({ v: vv, d });
    }
    case "text": {
      const s = cleanText(v, ANAMNEZ_LIMITS.textMax);
      return s === null ? fail("metin çok uzun veya geçersiz") : ok(s);
    }
    case "textarea": {
      const s = cleanText(v, ANAMNEZ_LIMITS.textareaMax);
      return s === null ? fail("metin çok uzun veya geçersiz") : ok(s);
    }
    case "date":
      return isIsoDate(v) ? ok(v) : fail("tarih geçersiz");
    case "time":
      return typeof v === "string" && TIME_RE.test(v) ? ok(v) : fail("saat geçersiz");
    case "scale10":
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10 ? ok(v) : fail("0–10 arası tam sayı bekleniyor");
    case "number": {
      if (typeof v !== "number" || !Number.isFinite(v)) return fail("sayı bekleniyor");
      if (spec.min !== undefined && v < spec.min) return fail("sayı çok küçük");
      if (spec.max !== undefined && v > spec.max) return fail("sayı çok büyük");
      return ok(v);
    }
    case "single":
      return typeof v === "string" && spec.optionKeys.has(v) ? ok(v) : fail("seçenek geçersiz");
    case "multi": {
      if (!Array.isArray(v)) return fail("seçenek listesi bekleniyor");
      const out: string[] = [];
      for (const x of v) {
        if (typeof x !== "string" || !spec.optionKeys.has(x)) return fail("seçenek geçersiz");
        if (!out.includes(x)) out.push(x);
      }
      return ok(out);
    }
    case "rows": {
      if (!Array.isArray(v)) return fail("satır listesi bekleniyor");
      if (v.length > ANAMNEZ_LIMITS.rowsMax) return fail("çok fazla satır");
      const colKeys = new Set(spec.columns.map((c) => c.key));
      const ids = new Set<string>();
      const rows: Array<Record<string, string | number | null>> = [];
      for (const r of v) {
        if (!isPlainObject(r)) return fail("satır geçersiz");
        const id = r.id;
        if (typeof id !== "string" || !ROW_ID_RE.test(id) || ids.has(id)) return fail("satır kimliği geçersiz");
        ids.add(id);
        const row: Record<string, string | number | null> = { id };
        for (const [k, cell] of Object.entries(r)) {
          if (k === "id") continue;
          if (k === "ref") {
            if (cell === null || cell === undefined) continue;
            if (typeof cell !== "string" || cell.length > ANAMNEZ_LIMITS.sourceRefMax) return fail("satır kaynağı geçersiz");
            row.ref = cell;
            continue;
          }
          if (!colKeys.has(k)) return fail(`bilinmeyen kolon: ${k}`);
          const col = spec.columns.find((c) => c.key === k)!;
          if (cell === null || cell === undefined || cell === "") { row[k] = null; continue; }
          if (col.type === "number") {
            if (typeof cell !== "number" || !Number.isFinite(cell)) return fail("kolon sayı bekliyor");
            if (col.min !== undefined && cell < col.min) return fail("kolon değeri çok küçük");
            if (col.max !== undefined && cell > col.max) return fail("kolon değeri çok büyük");
            row[k] = cell;
          } else if (col.type === "single") {
            const keys = spec.optionSets[col.options ?? ""] ?? [];
            if (typeof cell !== "string" || !keys.includes(cell)) return fail("kolon seçeneği geçersiz");
            row[k] = cell;
          } else {
            const s = cleanText(cell, ANAMNEZ_LIMITS.rowCellMax);
            if (s === null) return fail("kolon metni çok uzun");
            row[k] = s;
          }
        }
        rows.push(row);
      }
      return ok(rows as AnswerValue);
    }
  }
}

/** Boş sayılan değer (kayıtta tutulmaz). */
export function isEmptyAnswer(v: AnswerValue | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") {
    const y = v as { v?: unknown; d?: unknown };
    if ("v" in y || "d" in y) return (y.v === null || y.v === undefined) && (typeof y.d !== "string" || y.d.trim() === "");
  }
  return false;
}

export function validateAnswers(version: string, custom: FormCustom, raw: unknown): ValidationResult<Answers> {
  if (!isPlainObject(raw)) return fail("Cevaplar geçersiz.", "answers");
  const specs = fieldSpecs(version, custom);
  const out: Answers = {};
  for (const [key, v] of Object.entries(raw)) {
    const spec = specs.get(key);
    if (!spec) return fail(`Bilinmeyen alan: ${key}`, key);
    const r = validateValue(spec, v);
    if (!r.ok) return fail(`${key}: ${r.error}`, key);
    if (!isEmptyAnswer(r.value)) out[key] = r.value;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(out)).length;
  if (bytes > ANAMNEZ_LIMITS.answersBytesMax) return fail("Anamnez içeriği izin verilen boyutu aşıyor.", "answers");
  return ok(out);
}

// ─── source_links ────────────────────────────────────────────────────────────

function validateCmp(v: unknown): v is SourceCmpValue {
  if (v === null) return true;
  if (typeof v === "string") return v.length <= ANAMNEZ_LIMITS.textareaMax;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length <= 200 && v.every((x) => typeof x === "string" && x.length <= ANAMNEZ_LIMITS.sourceRefMax);
  return false;
}

/**
 * Kaynak bağlantıları: yalnız şablonda `source` tanımlı alanlar, doğru kaynak anahtarıyla.
 * `at` sunucuda damgalanır: değişmeyen bağlantı önceki damgasını korur, yeni/değişen → now.
 */
export function validateSourceLinks(
  version: string,
  raw: unknown,
  previous: SourceLinks,
  nowIso: string,
): ValidationResult<SourceLinks> {
  if (!isPlainObject(raw)) return fail("source_links geçersiz.", "sourceLinks");
  const index = templateFieldIndex(version);
  const out: SourceLinks = {};
  for (const [field, link] of Object.entries(raw)) {
    const def = index.get(field)?.field;
    if (!def?.source) return fail(`Kaynak bağlantısı geçersiz alan: ${field}`, "sourceLinks");
    if (!isPlainObject(link)) return fail("Kaynak bağlantısı geçersiz.", "sourceLinks");
    if (link.src !== def.source || !(ANAMNEZ_SOURCE_KEYS as readonly string[]).includes(String(link.src))) {
      return fail("Kaynak anahtarı uyuşmuyor.", "sourceLinks");
    }
    if (link.a !== "imported" && link.a !== "kept") return fail("Kaynak işlemi geçersiz.", "sourceLinks");
    if (!validateCmp(link.v)) return fail("Kaynak değeri geçersiz.", "sourceLinks");
    const prev = previous[field];
    const unchanged =
      prev && prev.a === link.a && prev.src === link.src && JSON.stringify(prev.v) === JSON.stringify(link.v);
    const at = unchanged ? prev.at : nowIso;
    out[field] = { src: def.source as AnamnezSourceKey, v: link.v as SourceCmpValue, a: link.a, at } satisfies SourceLink;
  }
  return ok(out);
}

// ─── oluşturma / güncelleme gövdeleri ────────────────────────────────────────

export type CreateMode = "standard" | "previous" | "refresh";

export type CreateInput = {
  mode: CreateMode;
  fromId: string | null;
  assessmentDate: string;
  title: string | null;
  requestId: string | null;
};

export function validateCreateInput(raw: unknown): ValidationResult<CreateInput> {
  if (!isPlainObject(raw)) return fail("Geçersiz istek gövdesi.");
  const mode = raw.mode;
  if (mode !== "standard" && mode !== "previous" && mode !== "refresh") return fail("Başlangıç seçeneği geçersiz.", "mode");
  const fromId = raw.fromId ?? null;
  if (mode !== "standard" && !isUuid(fromId)) return fail("Önceki anamnez seçilmeli.", "fromId");
  if (mode === "standard" && fromId !== null) return fail("Standart başlangıçta önceki kayıt verilmez.", "fromId");
  if (!isIsoDate(raw.assessmentDate)) return fail("Anamnez tarihi geçersiz.", "assessmentDate");
  const titleRaw = raw.title ?? null;
  let title: string | null = null;
  if (titleRaw !== null) {
    const t = cleanText(titleRaw, ANAMNEZ_LIMITS.titleMax);
    if (t === null) return fail("Başlık geçersiz.", "title");
    title = t.trim() || null;
  }
  const requestId = raw.requestId ?? null;
  if (requestId !== null && !isUuid(requestId)) return fail("İstek kimliği geçersiz.", "requestId");
  return ok({ mode, fromId: (fromId as string | null) ?? null, assessmentDate: raw.assessmentDate as string, title, requestId: requestId as string | null });
}

export type PatchInput = {
  baseRevision: number;
  formCustom?: unknown;
  answers?: unknown;
  sourceLinks?: unknown;
  title?: string | null;
  assessmentDate?: string;
};

export function validatePatchEnvelope(raw: unknown): ValidationResult<PatchInput> {
  if (!isPlainObject(raw)) return fail("Geçersiz istek gövdesi.");
  const allowed = new Set(["baseRevision", "formCustom", "answers", "sourceLinks", "title", "assessmentDate"]);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) return fail(`Bilinmeyen alan: ${k}`, k);
  const base = raw.baseRevision;
  if (typeof base !== "number" || !Number.isInteger(base) || base < 1) return fail("Sürüm bilgisi geçersiz.", "baseRevision");
  const out: PatchInput = { baseRevision: base };
  if ("formCustom" in raw) out.formCustom = raw.formCustom;
  if ("answers" in raw) out.answers = raw.answers;
  if ("sourceLinks" in raw) out.sourceLinks = raw.sourceLinks;
  if ("title" in raw) {
    if (raw.title === null) out.title = null;
    else {
      const t = cleanText(raw.title, ANAMNEZ_LIMITS.titleMax);
      if (t === null) return fail("Başlık geçersiz.", "title");
      out.title = t.trim() || null;
    }
  }
  if ("assessmentDate" in raw) {
    if (!isIsoDate(raw.assessmentDate)) return fail("Anamnez tarihi geçersiz.", "assessmentDate");
    out.assessmentDate = raw.assessmentDate as string;
  }
  return ok(out);
}

// ─── silme doğrulaması ───────────────────────────────────────────────────────

/**
 * Yazılı onay karşılaştırması — components/ui/ConfirmProvider `normalizeConfirmText` ile AYNI
 * kural (tr-TR harf katlama + boşluk). O modül "use client" olduğundan sunucuda kopyalanır.
 */
export function normalizeConfirmWord(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** Tamamlanmış anamnez silmede yazılı doğrulama ifadesi (TR "SİL" / EN "DELETE"). */
export const DELETE_CONFIRM_WORDS = ["SİL", "DELETE"] as const;

export function isValidDeleteConfirm(status: "draft" | "completed", body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  if (status === "draft") return body.confirmDraft === true;
  const typed = body.confirmText;
  if (typeof typed !== "string") return false;
  const n = normalizeConfirmWord(typed);
  return DELETE_CONFIRM_WORDS.some((w) => normalizeConfirmWord(w) === n);
}

export { allFieldKeys };
