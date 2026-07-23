/**
 * NKB-V2-D2 — Kaynak/bağlantı UI'sinin SAF mantığı (DB/React yok; harness ile test edilir).
 * Sunucu doğrulaması NKB-V2-C'de; bu katman kullanıcı dostu ön-kontrol + gösterim mantığıdır.
 */
import { KULVAR_SECTION_KEYS, isKulvarAnalysisType, type KulvarSectionKey } from "./knowledgeSections";
import { validateSourceInput, type SourcePayload } from "./sourcesValidation";
import type { LinkInput, NumerologySourceRow, RecordSourceRow } from "./sourcesApi";

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; error: string };
export type Result<T> = Ok<T> | Err;

// section_key seçenekleri: "" = null = Tüm kayıt.
export const SECTION_KEY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Tüm kayıt" },
  { value: "overview", label: "Genel Açıklama" },
  { value: "constructive", label: "Yapıcı Potansiyeller" },
  { value: "negative", label: "Olumsuz Potansiyeller" },
  { value: "destructive", label: "Yıkıcı Potansiyeller" },
];

const SECTION_KEY_SET = new Set<string>(KULVAR_SECTION_KEYS);

// Kullanıcıya gösterilecek güvenli çakışma/uyarı metinleri.
export const MSG_LINK_DUPLICATE = "Bu kaynak seçilen kapsam için zaten bağlı.";
export const MSG_SOURCE_IN_USE = "Bu kaynak bir veya daha fazla bilgi kaydına bağlı. Önce bağlantıları kaldırın.";
export const MSG_NEEDS_SAVED_RECORD = "Kaynak ekleyebilmek için önce bilgi kaydını kaydedin.";
// Demo hesap no-op: API {ok:true, demo:true} döner (gerçek yazma YOK).
export const MSG_DEMO_NO_WRITE = "Demo hesabında değişiklikler kaydedilmez.";

export type WriteOutcomeKind = "success" | "demo" | "conflict" | "error";
export type WriteOutcome = { kind: WriteOutcomeKind; message: string | null };

/**
 * Yazma cevabını sınıflandırır. demo === true ise ASLA success sayılmaz:
 * gerçek kayıt başarısı, sahte id kullanımı ve liste değişimi engellenir.
 * Öncelik: demo > conflict > error > success.
 */
export function classifyWriteResult(
  r: { demo?: boolean; conflict?: boolean; error: string | null },
  opts?: { conflictMsg?: string },
): WriteOutcome {
  if (r.demo === true) return { kind: "demo", message: MSG_DEMO_NO_WRITE };
  if (r.conflict === true) return { kind: "conflict", message: opts?.conflictMsg ?? "Çakışma oluştu." };
  if (r.error) return { kind: "error", message: r.error };
  return { kind: "success", message: null };
}

export function sectionKeyLabel(key: KulvarSectionKey | null): string {
  if (key === null) return "Tüm kayıt";
  const opt = SECTION_KEY_OPTIONS.find((o) => o.value === key);
  return opt ? opt.label : String(key);
}

/** select değerini (""|key) section_key'e (null|key) çevirir. */
export function sectionKeyFromSelect(v: string): KulvarSectionKey | null {
  return v === "" ? null : (v as KulvarSectionKey);
}

/** "" → null; sayı değilse veya <0 ise hata; aksi halde tamsayı. */
function parseOptionalInt(raw: string): { value: number | null; error?: string } {
  const t = (raw ?? "").trim();
  if (t === "") return { value: null };
  if (!/^\d+$/.test(t)) return { value: null, error: "Yalnız 0 veya pozitif tamsayı girin." };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 1_000_000) return { value: null, error: "Geçersiz sayı." };
  return { value: n };
}

export type SourceFormState = {
  display_label: string;
  title: string;
  authors: string;
  organization: string;
  source_type: string;
  level_or_edition: string;
  publication_year: string;
  language: string;
  notes: string;
};

/** Kaynak formunu doğrular (sunucu validateSourceInput'u yeniden kullanır). */
export function buildSourceInputFromForm(form: SourceFormState): Result<SourcePayload> {
  const body: Record<string, unknown> = { display_label: form.display_label };
  for (const f of ["title", "authors", "organization", "source_type", "level_or_edition", "language", "notes"] as const) {
    const v = form[f].trim();
    if (v !== "") body[f] = v;
  }
  const py = form.publication_year.trim();
  if (py !== "") {
    if (!/^\d+$/.test(py)) return { ok: false, error: "Yayın yılı geçerli bir tamsayı olmalı." };
    body.publication_year = Number(py);
  }
  const res = validateSourceInput(body, { partial: false });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, value: res.value };
}

export type LinkFormState = {
  source_id: string;
  section_key: string; // "" = Tüm kayıt
  page_start: string;
  page_end: string;
  locator: string;
  is_primary: boolean;
  display_order: string;
  internal_note: string;
};

/** Bağlantı formunu doğrular; section_key yalnız Ana/Yan Kulvar kaydında serbest. */
export function buildLinkInputFromForm(
  form: LinkFormState,
  opts: { recordAnalysisType: string | null | undefined },
): Result<LinkInput> {
  if (!form.source_id) return { ok: false, error: "Bir kaynak seçin." };

  const section_key = form.section_key === "" ? null : form.section_key;
  if (section_key !== null) {
    if (!SECTION_KEY_SET.has(section_key)) return { ok: false, error: "Geçersiz bölüm seçimi." };
    if (!isKulvarAnalysisType(opts.recordAnalysisType ?? "")) {
      return { ok: false, error: "Bölüm düzeyi kaynak bağı yalnız Ana/Yan Kulvar kayıtlarında kullanılabilir." };
    }
  }

  const ps = parseOptionalInt(form.page_start);
  if (ps.error) return { ok: false, error: `Başlangıç sayfası: ${ps.error}` };
  const pe = parseOptionalInt(form.page_end);
  if (pe.error) return { ok: false, error: `Bitiş sayfası: ${pe.error}` };
  if (ps.value !== null && pe.value !== null && ps.value > pe.value) {
    return { ok: false, error: "Başlangıç sayfası, bitiş sayfasından büyük olamaz." };
  }
  const dord = parseOptionalInt(form.display_order);
  if (dord.error) return { ok: false, error: `Sıra: ${dord.error}` };

  const locator = form.locator.trim();
  const internal_note = form.internal_note.trim();

  return {
    ok: true,
    value: {
      source_id: form.source_id,
      section_key: section_key as KulvarSectionKey | null,
      page_start: ps.value,
      page_end: pe.value,
      locator: locator === "" ? null : locator,
      is_primary: form.is_primary,
      display_order: dord.value ?? 0,
      internal_note: internal_note === "" ? null : internal_note,
    },
  };
}

export type JoinedLink = {
  link: RecordSourceRow;
  source: NumerologySourceRow | null;
};

/** Bağlantıları kaynak künyeleriyle birleştirir; display_order sonra created_at'a göre sıralar. */
export function joinLinksWithSources(
  links: RecordSourceRow[],
  sources: NumerologySourceRow[],
): JoinedLink[] {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return [...links]
    .map((link) => ({ link, source: byId.get(link.source_id) ?? null }))
    .sort((a, b) => {
      if (a.link.display_order !== b.link.display_order) return a.link.display_order - b.link.display_order;
      return a.link.created_at.localeCompare(b.link.created_at);
    });
}

/** Bir bağlantı için kısa sayfa gösterimi. */
export function pageDisplay(link: Pick<RecordSourceRow, "page_start" | "page_end">): string {
  const { page_start: s, page_end: e } = link;
  if (s === null && e === null) return "";
  if (s !== null && e !== null) return s === e ? `s. ${s}` : `s. ${s}–${e}`;
  return `s. ${s ?? e}`;
}
