/**
 * Danışana özel form işlemleri — SAF (UI + harness). Yalnız İLGİLİ anamnezin `form_custom`
 * farkını üretir; kanonik şablon (kod) ve başka danışanlar yapısal olarak etkilenemez.
 *
 * "Bu danışandan kaldır" = gizleme: cevap `answers` içinde KORUNUR. Cevabı kalıcı silmek
 * ayrı ve onaylı işlemdir (clearAnswer).
 */
import { effectiveSections } from "./schema";
import { isEmptyAnswer } from "./validate";
import type {
  AnamnezSectionKey,
  Answers,
  CustomField,
  CustomFieldType,
  CustomOption,
  FormCustom,
} from "./types";

export function hideField(fc: FormCustom, key: string): FormCustom {
  if (fc.hidden.includes(key)) return fc;
  return { ...fc, hidden: [...fc.hidden, key] };
}

export function restoreField(fc: FormCustom, key: string): FormCustom {
  return { ...fc, hidden: fc.hidden.filter((k) => k !== key) };
}

export function setLabelOverride(fc: FormCustom, key: string, label: string | null): FormCustom {
  const labels = { ...fc.labels };
  const v = label?.trim() ?? "";
  if (v) labels[key] = v;
  else delete labels[key];
  return { ...fc, labels };
}

export function setSectionEnabled(fc: FormCustom, section: AnamnezSectionKey, enabled: boolean): FormCustom {
  const has = fc.enabledSections.includes(section);
  if (enabled && !has) return { ...fc, enabledSections: [...fc.enabledSections, section] };
  if (!enabled && has) return { ...fc, enabledSections: fc.enabledSections.filter((s) => s !== section) };
  return fc;
}

function randomHex(bytes = 6): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(arr);
  else for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newCustomFieldKey(): string {
  return `c_${randomHex(6)}`;
}

export function addCustomField(
  fc: FormCustom,
  input: { section: AnamnezSectionKey; type: CustomFieldType; label: string; options?: string[] },
): FormCustom {
  const field: CustomField = { key: newCustomFieldKey(), section: input.section, type: input.type, label: input.label.trim() };
  if (input.type === "single" || input.type === "multi") {
    field.options = (input.options ?? [])
      .map((l) => l.trim())
      .filter(Boolean)
      .map<CustomOption>((label, i) => ({ key: `o${i + 1}`, label }));
  }
  return { ...fc, custom: [...fc.custom, field] };
}

export function renameCustomField(fc: FormCustom, key: string, label: string): FormCustom {
  return { ...fc, custom: fc.custom.map((c) => (c.key === key ? { ...c, label: label.trim() } : c)) };
}

/** Özel soruyu tamamen siler (yalnız cevapsızsa ya da onaylı temizleme ile birlikte). */
export function deleteCustomField(fc: FormCustom, answers: Answers, key: string): { formCustom: FormCustom; answers: Answers } {
  const nextAnswers = { ...answers };
  delete nextAnswers[key];
  return {
    formCustom: {
      ...fc,
      custom: fc.custom.filter((c) => c.key !== key),
      hidden: fc.hidden.filter((k) => k !== key),
    },
    answers: nextAnswers,
  };
}

/** Kayıtlı cevabı kalıcı temizler (ayrı, açık ve onaylı işlem). */
export function clearAnswer(answers: Answers, key: string): Answers {
  const next = { ...answers };
  delete next[key];
  return next;
}

/**
 * "Standart forma geri dön": gizleme/başlık/bölüm farkları kaldırılır. Özel sorular:
 * cevapsız → kaldırılır; CEVAPLI → gizlenir (cevap korunur). HİÇBİR cevap silinmez.
 */
export function resetToStandard(fc: FormCustom, answers: Answers): FormCustom {
  const keptCustom = fc.custom.filter((c) => !isEmptyAnswer(answers[c.key]));
  return {
    hidden: keptCustom.map((c) => c.key),
    labels: {},
    enabledSections: [],
    custom: keptCustom,
  };
}

/** Gizlenmiş alanlar (UI "Kaldırılan alanlar" paneli için) + cevap var mı bilgisi. */
export function hiddenFieldsWithAnswers(version: string, fc: FormCustom, answers: Answers): Array<{ key: string; section: string; hasAnswer: boolean }> {
  const out: Array<{ key: string; section: string; hasAnswer: boolean }> = [];
  for (const s of effectiveSections(version, fc)) {
    for (const f of s.fields) if (f.hidden) out.push({ key: f.key, section: s.key, hasAnswer: !isEmptyAnswer(answers[f.key]) });
  }
  return out;
}

/** Bölüm doluluğu: görünen alanlardan cevaplı olanlar. */
export function sectionProgress(version: string, fc: FormCustom, answers: Answers): Record<string, { filled: number; total: number }> {
  const out: Record<string, { filled: number; total: number }> = {};
  for (const s of effectiveSections(version, fc)) {
    const visible = s.enabled ? s.fields.filter((f) => !f.hidden) : [];
    out[s.key] = { filled: visible.filter((f) => !isEmptyAnswer(answers[f.key])).length, total: visible.length };
  }
  return out;
}

export function overallProgress(version: string, fc: FormCustom, answers: Answers): { filled: number; total: number } {
  return Object.values(sectionProgress(version, fc, answers)).reduce(
    (acc, p) => ({ filled: acc.filled + p.filled, total: acc.total + p.total }),
    { filled: 0, total: 0 },
  );
}
