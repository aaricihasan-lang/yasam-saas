/**
 * Danışan Detayı → Anamnez kaynak eşleme + değişiklik tespiti — SAF.
 *
 * İLKELER (Aşama 1 kararları K4/K7):
 *   - Yalnız yapılandırılmış, 1:1 eşlenebilen kaynaklar (types.ANAMNEZ_SOURCE_KEYS).
 *     Serbest metin ayrıştırma / anahtar kelime / AI YOK. client_notes.saglik_notu kaynak DEĞİL
 *     (yalnız salt-okunur referans). Legacy clients.saglik / clients.email kullanılmaz.
 *   - Otomatik senkron YOK: aktarım yalnız kullanıcı bölüm bazında isterse.
 *   - Değişiklik tespiti DEĞER karşılaştırmasıdır (kaynak tablolarda güvenilir updated_at yok →
 *     sahte "son güncelleme" tarihi üretilmez). Yalnız eşlenmiş alanlar karşılaştırılır; telefon/
 *     adres gibi eşlenmemiş alanlar hiç okunmaz → onlar için uyarı yapısal olarak imkânsızdır.
 *   - Tamamlanmış anamnez ASLA değiştirilmez; fark yalnız gösterilir ve yeni anamnez önerilir.
 */
import { effectiveSections, templateFieldIndex } from "./schema";
import { isEmptyAnswer } from "./validate";
import type {
  AllergenSourceItem,
  AnamnezSourceKey,
  Answers,
  AnswerValue,
  FieldSourceState,
  FormCustom,
  RowValue,
  SourceCmpValue,
  SourceLinks,
  SourceValues,
  TemplateField,
} from "./types";

/** clients.kan kanonik değerleri → B.blood_type seçenek anahtarı. Kanonik dışı → eşlenmez. */
export const BLOOD_TYPE_TO_OPTION: Readonly<Record<string, string>> = {
  "A Rh+": "a_pos",
  "A Rh-": "a_neg",
  "B Rh+": "b_pos",
  "B Rh-": "b_neg",
  "AB Rh+": "ab_pos",
  "AB Rh-": "ab_neg",
  "0 Rh+": "o_pos",
  "0 Rh-": "o_neg",
};

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;

export const EMPTY_SOURCE_VALUES: SourceValues = {
  "clients.kan": null,
  "nutrition.height_cm": null,
  "nutrition.weight_kg": null,
  "nutrition.allergens": [],
  "nutrition.daily_meal_count": null,
  "nutrition.water_note": null,
  "nutrition.dietary_pattern": null,
  "nutrition.activity_level": null,
  "nutrition.lifestyle_note": null,
};

// ─── Ham kaynak → hedef biçim ────────────────────────────────────────────────

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.normalize("NFC").trim();
  return s === "" ? null : s;
}

function cleanNum(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 10) / 10;
}

export type RawSourceInput = {
  kan: unknown;
  profile: {
    activity_level?: unknown;
    dietary_pattern?: unknown;
    daily_meal_count?: unknown;
    water_note?: unknown;
    lifestyle_note?: unknown;
  } | null;
  /** measured_at DESC sıralı son ölçümler. */
  measurements: Array<{ height_cm?: unknown; weight_kg?: unknown; measured_at?: unknown }>;
  allergens: Array<{ code: string | null; custom_label: string | null; name_tr: string | null; name_en: string | null; note: string | null }>;
};

export function buildSourceValues(raw: RawSourceInput): SourceValues {
  const kan = typeof raw.kan === "string" ? BLOOD_TYPE_TO_OPTION[raw.kan.trim()] ?? null : null;
  const p = raw.profile ?? {};
  const activity = typeof p.activity_level === "string" && (ACTIVITY_LEVELS as readonly string[]).includes(p.activity_level)
    ? p.activity_level
    : null;
  const height = raw.measurements.map((m) => cleanNum(m.height_cm, 30, 260)).find((v) => v !== null) ?? null;
  const weight = raw.measurements.map((m) => cleanNum(m.weight_kg, 1, 500)).find((v) => v !== null) ?? null;
  const meals = cleanNum(p.daily_meal_count, 0, 12);

  const allergens: AllergenSourceItem[] = [];
  const seen = new Set<string>();
  for (const a of raw.allergens) {
    const custom = cleanStr(a.custom_label);
    const ref = a.code ? `code:${a.code}` : custom ? `custom:${custom.toLocaleLowerCase("tr-TR")}` : null;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    allergens.push({
      ref,
      labelTr: cleanStr(a.name_tr) ?? custom ?? ref,
      labelEn: cleanStr(a.name_en) ?? custom ?? ref,
      note: cleanStr(a.note) ?? "",
    });
  }
  allergens.sort((x, y) => (x.ref < y.ref ? -1 : x.ref > y.ref ? 1 : 0));

  return {
    "clients.kan": kan,
    "nutrition.height_cm": height,
    "nutrition.weight_kg": weight,
    "nutrition.allergens": allergens,
    "nutrition.daily_meal_count": meals === null ? null : Math.round(meals),
    "nutrition.water_note": cleanStr(p.water_note),
    "nutrition.dietary_pattern": cleanStr(p.dietary_pattern),
    "nutrition.activity_level": activity,
    "nutrition.lifestyle_note": cleanStr(p.lifestyle_note),
  };
}

// ─── Karşılaştırılabilir değerler ────────────────────────────────────────────

/** Kaynak değerinin normalize karşılaştırma biçimi (liste → sıralı ref dizisi). */
export function sourceCmp(key: AnamnezSourceKey, values: SourceValues): SourceCmpValue {
  if (key === "nutrition.allergens") {
    const refs = values[key].map((a) => a.ref);
    return refs.length ? refs : null;
  }
  const v = values[key];
  return v === undefined ? null : (v as SourceCmpValue);
}

function normStr(s: string): string {
  return s.normalize("NFC").trim();
}

/** Anamnez cevabının aynı kaynağa göre karşılaştırma biçimi. */
export function answerCmp(field: TemplateField, answer: AnswerValue | undefined): SourceCmpValue {
  if (isEmptyAnswer(answer ?? null)) return null;
  if (field.type === "rows") {
    const refs = (answer as RowValue[])
      .map((r) => (typeof r.ref === "string" ? r.ref : null))
      .filter((r): r is string => !!r);
    return refs.length ? Array.from(new Set(refs)).sort() : null;
  }
  if (typeof answer === "string") return normStr(answer);
  if (typeof answer === "number") return answer;
  return null;
}

function cmpEqual(a: SourceCmpValue, b: SourceCmpValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  if (typeof a === "string" && typeof b === "string") return normStr(a) === normStr(b);
  return a === b;
}

/** Liste kaynakları için: kaynaktaki tüm ref'ler cevapta var mı? */
function listCovers(answer: SourceCmpValue, src: SourceCmpValue): boolean {
  if (!Array.isArray(src)) return false;
  const have = new Set(Array.isArray(answer) ? answer : []);
  return src.every((r) => have.has(r));
}

// ─── Alan / bölüm durumu ─────────────────────────────────────────────────────

/**
 *   none      → kaynakta değer yok ve bağlantı yok (rozet yok)
 *   current   → ✓ Güncel (bağlantı kaynağa eşit veya cevap zaten kaynakla aynı)
 *   available → 🔔 Bilgi mevcut (kaynakta değer var, henüz aktarılmamış/korunmamış)
 *   changed   → ⚠ Güncellendi (aktarılmış/korunmuş kaynak sonradan değişti)
 */
export function fieldSourceState(
  field: TemplateField,
  answer: AnswerValue | undefined,
  links: SourceLinks,
  values: SourceValues,
): FieldSourceState {
  if (!field.source) return "none";
  const src = sourceCmp(field.source, values);
  const link = links[field.key];
  const ans = answerCmp(field, answer);
  if (link) {
    if (cmpEqual(link.v, src)) return "current";
    // Kaynak değişti ama uzman cevabı zaten yeni değerle aynı → güncel.
    if (src !== null && (field.type === "rows" ? listCovers(ans, src) : cmpEqual(ans, src))) return "current";
    return "changed";
  }
  if (src === null) return "none";
  if (field.type === "rows" ? listCovers(ans, src) : cmpEqual(ans, src)) return "current";
  return "available";
}

const SEVERITY: Record<FieldSourceState, number> = { none: 0, current: 1, available: 2, changed: 3 };

export function worstState(states: FieldSourceState[]): FieldSourceState {
  return states.reduce<FieldSourceState>((acc, s) => (SEVERITY[s] > SEVERITY[acc] ? s : acc), "none");
}

export type SectionSourceSummary = {
  section: string;
  state: FieldSourceState;
  fields: Array<{ key: string; state: FieldSourceState }>;
};

/** Görünen (gizlenmemiş, etkin bölümdeki) eşlenmiş alanların durumları. */
export function sectionSourceStates(
  version: string,
  custom: FormCustom,
  answers: Answers,
  links: SourceLinks,
  values: SourceValues,
): SectionSourceSummary[] {
  return effectiveSections(version, custom).map((s) => {
    const fields = s.enabled
      ? s.fields
          .filter((f) => f.kind === "template" && !f.hidden && f.field.source)
          .map((f) => {
            const tf = (f as { field: TemplateField }).field;
            return { key: f.key, state: fieldSourceState(tf, answers[f.key], links, values) };
          })
      : [];
    return { section: s.key, state: worstState(fields.map((f) => f.state)), fields };
  });
}

/** Liste görünümü için hafif uyarı: yalnız bağlantılardan (cevaplar yüklenmeden). */
export function linksChanged(version: string, links: SourceLinks, values: SourceValues): boolean {
  const index = templateFieldIndex(version);
  for (const [key, link] of Object.entries(links)) {
    const f = index.get(key)?.field;
    if (!f?.source) continue;
    if (!cmpEqual(link.v, sourceCmp(f.source, values))) return true;
  }
  return false;
}

// ─── Bölüm bazlı "Mevcut Bilgileri Getir" planı ──────────────────────────────

export type ImportConflict = {
  key: string;
  field: TemplateField;
  current: AnswerValue;
  incoming: AnswerValue;
  /** Liste alanlarında yalnız EKLENECEK satırlar (mevcut satırlar asla silinmez). */
  addRows?: RowValue[];
};

export type ImportPlan = {
  /** Boş alanlara doğrudan yazılacak değerler. */
  fills: Array<{ key: string; value: AnswerValue }>;
  /** Kullanıcı kararı gereken farklar (sessiz overwrite YASAK). */
  conflicts: ImportConflict[];
  /** Zaten eşit olan (yalnız bağlantı tazelenir). */
  equal: string[];
};

let rowSeq = 0;
function newRowId(): string {
  rowSeq = (rowSeq + 1) % 1_000_000;
  return `s${Date.now().toString(36)}${rowSeq.toString(36)}`;
}

/** Kaynak değerini anamnez alanının cevap biçimine çevirir (liste → satırlar). */
export function sourceToAnswer(field: TemplateField, values: SourceValues, locale: "tr" | "en"): AnswerValue {
  if (!field.source) return null;
  if (field.source === "nutrition.allergens") {
    const items = values["nutrition.allergens"];
    if (!items.length) return null;
    return items.map((a) => ({
      id: newRowId(),
      ref: a.ref,
      category: "food",
      trigger: locale === "en" ? a.labelEn : a.labelTr,
      reaction: null,
      note: a.note || null,
    }));
  }
  const v = values[field.source];
  return (v === undefined ? null : v) as AnswerValue;
}

export function planSectionImport(
  version: string,
  custom: FormCustom,
  sectionKey: string,
  answers: Answers,
  values: SourceValues,
  locale: "tr" | "en",
): ImportPlan {
  const plan: ImportPlan = { fills: [], conflicts: [], equal: [] };
  const section = effectiveSections(version, custom).find((s) => s.key === sectionKey);
  if (!section || !section.enabled) return plan;
  for (const f of section.fields) {
    if (f.kind !== "template" || f.hidden || !f.field.source) continue;
    const field = f.field;
    const src = sourceCmp(field.source!, values);
    if (src === null) continue;
    const incoming = sourceToAnswer(field, values, locale);
    const current = answers[f.key] ?? null;
    const ans = answerCmp(field, current);
    if (field.type === "rows") {
      const currentRows = (Array.isArray(current) ? current : []) as RowValue[];
      const have = new Set(currentRows.map((r) => r.ref).filter(Boolean));
      const addRows = ((incoming ?? []) as RowValue[]).filter((r) => !have.has(r.ref));
      if (addRows.length === 0) plan.equal.push(f.key);
      else if (currentRows.length === 0) plan.fills.push({ key: f.key, value: addRows });
      else plan.conflicts.push({ key: f.key, field, current, incoming, addRows });
      continue;
    }
    if (ans === null) plan.fills.push({ key: f.key, value: incoming });
    else if (cmpEqual(ans, src)) plan.equal.push(f.key);
    else plan.conflicts.push({ key: f.key, field, current, incoming });
  }
  return plan;
}

export type ConflictChoice = "keep" | "use";

/**
 * Planı uygular (SAF): dolan alanlar + kullanıcı seçimleri → yeni cevaplar + bağlantılar.
 * "keep" → cevap aynen kalır, bağlantı `kept` (bu kaynak değeri görüldü) olarak yazılır.
 * "use"  → cevap kaynak değeriyle değişir (liste: yalnız eksik satırlar EKLENİR).
 */
export function applyImport(
  plan: ImportPlan,
  choices: Record<string, ConflictChoice>,
  answers: Answers,
  links: SourceLinks,
  values: SourceValues,
  version: string,
  nowIso: string,
): { answers: Answers; links: SourceLinks } {
  const index = templateFieldIndex(version);
  const nextAnswers: Answers = { ...answers };
  const nextLinks: SourceLinks = { ...links };
  const stamp = (key: string, a: "imported" | "kept") => {
    const f = index.get(key)?.field;
    if (!f?.source) return;
    nextLinks[key] = { src: f.source, v: sourceCmp(f.source, values), a, at: nowIso };
  };
  for (const fill of plan.fills) {
    nextAnswers[fill.key] = fill.value;
    stamp(fill.key, "imported");
  }
  for (const key of plan.equal) stamp(key, "imported");
  for (const c of plan.conflicts) {
    const choice = choices[c.key] ?? "keep";
    if (choice === "use") {
      if (c.addRows) nextAnswers[c.key] = [...((c.current ?? []) as RowValue[]), ...c.addRows];
      else nextAnswers[c.key] = c.incoming;
      stamp(c.key, "imported");
    } else {
      stamp(c.key, "kept");
    }
  }
  return { answers: nextAnswers, links: nextLinks };
}

// ─── Değişiklikleri Gör / Güncel Bilgilerle Yeni Anamnez ─────────────────────

export type SourceChange = {
  key: string;
  field: TemplateField;
  anamnesisValue: AnswerValue;
  sourceValue: AnswerValue;
  /** Liste: kaynakta olup anamnezde olmayan satırlar. */
  addedRows?: RowValue[];
};

export function listSourceChanges(
  version: string,
  custom: FormCustom,
  answers: Answers,
  links: SourceLinks,
  values: SourceValues,
  locale: "tr" | "en",
): SourceChange[] {
  const out: SourceChange[] = [];
  for (const s of effectiveSections(version, custom)) {
    if (!s.enabled) continue;
    for (const f of s.fields) {
      if (f.kind !== "template" || f.hidden || !f.field.source) continue;
      if (fieldSourceState(f.field, answers[f.key], links, values) !== "changed") continue;
      const sourceValue = sourceToAnswer(f.field, values, locale);
      const change: SourceChange = { key: f.key, field: f.field, anamnesisValue: answers[f.key] ?? null, sourceValue };
      if (f.field.type === "rows") {
        const have = new Set(((answers[f.key] ?? []) as RowValue[]).map((r) => r.ref).filter(Boolean));
        change.addedRows = ((sourceValue ?? []) as RowValue[]).filter((r) => !have.has(r.ref));
      }
      out.push(change);
    }
  }
  return out;
}

/**
 * "Güncel Bilgilerle Yeni Anamnez Başlat" — kopyalanan cevaplara YALNIZ değişmiş kaynakları
 * uygular (yeni kayıt; eski anamnez değişmez). Listeler: eksik satırlar eklenir, mevcutlar
 * silinmez. Henüz hiç aktarılmamış (🔔) alanlar otomatik doldurulmaz.
 */
export function applyChangedSources(
  version: string,
  custom: FormCustom,
  answers: Answers,
  links: SourceLinks,
  values: SourceValues,
  locale: "tr" | "en",
  nowIso: string,
): { answers: Answers; links: SourceLinks; applied: string[] } {
  const changes = listSourceChanges(version, custom, answers, links, values, locale);
  const nextAnswers: Answers = { ...answers };
  const nextLinks: SourceLinks = { ...links };
  for (const c of changes) {
    if (c.field.type === "rows") {
      nextAnswers[c.key] = [...((answers[c.key] ?? []) as RowValue[]), ...(c.addedRows ?? [])];
    } else if (c.sourceValue === null) {
      // Kaynak boşaldı: veri sessizce silinmez; yalnız bağlantı güncellenir.
    } else {
      nextAnswers[c.key] = c.sourceValue;
    }
    nextLinks[c.key] = { src: c.field.source!, v: sourceCmp(c.field.source!, values), a: "imported", at: nowIso };
  }
  return { answers: nextAnswers, links: nextLinks, applied: changes.map((c) => c.key) };
}
