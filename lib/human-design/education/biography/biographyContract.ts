// Human Design — Hazır Eğitim Haritaları · FAZ 10 "HAYAT HİKÂYESİ" · SAF sözleşme + doğrulama (IO yok).
// Biyografi merkezî ünlü kaydına aittir; hesap katmanından (hd_education_charts) AYRIDIR. Biyografik olgu Human Design
// yorumu değildir: bu katman yalnız kaynaklı olgu taşır. Aynı doğrulama içe aktarma aracı ve owner düzenleme ucunda
// kullanılır; DB (20271127000000) '<' / '>' ve https kurallarını ayrıca uygular.

export const BIO_TABLES = {
  biographies: "hd_education_biographies",
  revisions: "hd_education_biography_revisions",
} as const;

export const BIO_CONTRACT = "hd-edu-bio-1" as const;
export const BIO_LANGS = ["tr", "en"] as const;
export type BioLang = (typeof BIO_LANGS)[number];
export const BIO_LANG_LABEL: Readonly<Record<BioLang, string>> = Object.freeze({ tr: "Türkçe", en: "English" });

export const BIO_SECTION_KEYS = ["childhood", "education", "career", "events", "later", "impact"] as const;
export type BioSectionKey = (typeof BIO_SECTION_KEYS)[number];
export const BIO_SECTION_LABEL: Readonly<Record<BioSectionKey, string>> = Object.freeze({
  childhood: "Çocukluk ve Aile",
  education: "Eğitim ve Gençlik",
  career: "Mesleki Hayat",
  events: "Önemli Yaşam Olayları",
  later: "Sonraki Yıllar",
  impact: "Tarihsel Etkisi",
});

export const BIO_SOURCE_KINDS = ["wikipedia", "encyclopedia", "official", "academic", "archive", "news", "book"] as const;
export type BioSourceKind = (typeof BIO_SOURCE_KINDS)[number];
export const BIO_SOURCE_KIND_LABEL: Readonly<Record<BioSourceKind, string>> = Object.freeze({
  wikipedia: "Vikipedi", encyclopedia: "Ansiklopedi", official: "Resmî kaynak", academic: "Akademik", archive: "Arşiv", news: "Haber", book: "Kitap",
});

export const BIO_CONTENT_STATUSES = ["draft", "source_checked", "owner_reviewed"] as const;
export type BioContentStatus = (typeof BIO_CONTENT_STATUSES)[number];
export const BIO_CONTENT_LABEL: Readonly<Record<BioContentStatus, string>> = Object.freeze({
  draft: "Taslak", source_checked: "Kaynak kontrolü tamam", owner_reviewed: "Owner incelendi",
});
export type BioPublishStatus = "hidden" | "published";

export const BIO_CATEGORIES = ["bilim", "sanat", "muzik", "sinema", "edebiyat", "siyaset", "tarih", "spor", "kesif", "medya", "kraliyet", "diger"] as const;

export type BioParagraph = { text: string; sourceIds: string[] };
export type BioSection = { key: BioSectionKey; title: string; paragraphs: BioParagraph[] };
export type BioEvent = { date: string; title: string; text: string; sourceIds: string[] };
export type BioSource = {
  id: string; title: string; publisher: string | null; kind: BioSourceKind; url: string; accessedOn: string | null;
  revisionId: string | null; license: string | null; licenseUrl: string | null;
};
export type BioLicenseInfo = {
  directQuotes: boolean; adaptedText: boolean; note: string | null;
  articles: Array<{ lang: string; title: string; oldid: string | null; url: string }>;
};

/** Doğrulanmış biyografi içeriği (owner düzenleyebilir; içe aktarma aynı biçimi üretir). */
export type BioContent = {
  displayName: string;
  lifeSpan: string | null;
  profession: string | null;
  knownFor: string | null;
  country: string | null;
  era: string | null;
  category: string | null;
  isLiving: boolean;
  birthYear: number | null;
  deathYear: number | null;
  shortIntro: string;
  sections: BioSection[];
  timeline: BioEvent[];
  sources: BioSource[];
  licenseInfo: BioLicenseInfo;
  neutralityNote: string | null;
  openQuestions: string[];
};

/** Eğitmene giden görünüm (yalnız yayımlı; owner kimlikleri / iç durum alanları YOK). */
export type BioTrainerView = BioContent & { lang: BioLang; revision: number; updatedAt: string };
export type BioTrainerResponse = { lang: BioLang; availableLangs: BioLang[]; biography: BioTrainerView | null };

/** Katalog kartına eklenen arama alanları (yalnız yayımlı biyografiden). */
export type BioCardMeta = { profession: string | null; country: string | null; era: string | null; lifeSpan: string | null };

/** Owner durum satırı (kişi başına; aday + harita + biyografi aşamaları ayrı). */
export type BioOwnerLangState = {
  id: string; lang: BioLang; contentStatus: BioContentStatus; publishStatus: BioPublishStatus; revision: number;
  sourceCount: number; eventCount: number; updatedAt: string;
};
export type BioOwnerRow = {
  personKey: string;
  displayName: string;
  subjectId: string | null;
  isLiving: boolean | null;
  birthData: "dogrulandi" | "dogrulaniyor" | "kayit-yok";
  hd: "hesaplandi" | "bekliyor" | "kayit-yok";
  mapPublication: string | null;
  biographies: BioOwnerLangState[];
};
export type BioOwnerDetail = BioContent & {
  id: string; personKey: string; lang: BioLang; subjectId: string | null; contentStatus: BioContentStatus; publishStatus: BioPublishStatus;
  revision: number; publishedAt: string | null; createdAt: string; updatedAt: string;
  history: Array<{ at: string; action: string; revision: number }>;
};

export const BIO_LIMITS = Object.freeze({
  displayName: 200, lifeSpan: 40, profession: 200, knownFor: 400, country: 200, era: 100, shortIntro: 1500, neutralityNote: 1000,
  sectionTitle: 120, paragraphs: 30, paragraph: 2000, events: 60, eventTitle: 160, eventText: 600, sources: 80, sourceTitle: 300,
  publisher: 200, url: 2000, license: 100, sourceIdsPer: 12, openQuestions: 20, openQuestion: 500, articles: 20, licenseNote: 1000,
});

const MARKUP_RE = /[<>]/;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const SOURCE_ID_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const BIO_PERSON_KEY_RE = /^[a-z0-9][a-z0-9-]{1,118}$/;

export class BioValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
  }
}

function text(v: unknown, field: string, max: number, opts: { required?: boolean; multiline?: boolean } = {}): string | null {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    if (opts.required) throw new BioValidationError(field, `${field}: zorunlu alan boş.`);
    return null;
  }
  if (typeof v !== "string") throw new BioValidationError(field, `${field}: metin bekleniyor.`);
  const s = v.replace(/\r\n?/g, "\n").trim();
  if (s.length > max) throw new BioValidationError(field, `${field}: en fazla ${max} karakter.`);
  if (MARKUP_RE.test(s)) throw new BioValidationError(field, `${field}: '<' ve '>' karakterleri kullanılamaz.`);
  if (CTRL_RE.test(s) || (!opts.multiline && s.includes("\n"))) throw new BioValidationError(field, `${field}: geçersiz karakter.`);
  return s;
}
const req = (v: unknown, field: string, max: number, multiline = false) => text(v, field, max, { required: true, multiline }) as string;

/** Yalnız https; kimlik bilgisi / boşluk / tırnak yok. Sunucu bu adresi ASLA indirmez (yalnız bağlantı olarak gösterilir). */
export function safeHttpsUrl(v: unknown, field: string, required = true): string | null {
  if (v === null || v === undefined || v === "") {
    if (required) throw new BioValidationError(field, `${field}: bağlantı zorunlu.`);
    return null;
  }
  if (typeof v !== "string" || v.length > BIO_LIMITS.url || /[\s"'<>\\`]/.test(v)) throw new BioValidationError(field, `${field}: geçersiz bağlantı.`);
  let u: URL;
  try { u = new URL(v); } catch { throw new BioValidationError(field, `${field}: geçersiz bağlantı.`); }
  if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) {
    throw new BioValidationError(field, `${field}: yalnız https bağlantısı kabul edilir.`);
  }
  return v;
}

function sourceIds(v: unknown, field: string, known: Set<string>, min: number): string[] {
  if (!Array.isArray(v)) throw new BioValidationError(field, `${field}: kaynak listesi bekleniyor.`);
  const ids = [...new Set(v.map((x) => String(x)))];
  if (ids.length < min) throw new BioValidationError(field, `${field}: en az ${min} kaynak gösterilmeli.`);
  if (ids.length > BIO_LIMITS.sourceIdsPer) throw new BioValidationError(field, `${field}: çok fazla kaynak.`);
  for (const id of ids) if (!known.has(id)) throw new BioValidationError(field, `${field}: bilinmeyen kaynak "${id.slice(0, 30)}".`);
  return ids;
}
const yearOrNull = (v: unknown, field: string): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1000 || n > 2100) throw new BioValidationError(field, `${field}: geçersiz yıl.`);
  return n;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** snake_case (içe aktarma dosyası) ya da camelCase (owner düzenleme) alanı. */
const pick = (o: Record<string, unknown>, camel: string, snake: string) => (camel in o ? o[camel] : o[snake]);

/**
 * Ham girdi (içe aktarma JSON'u veya owner düzenleme gövdesi) → doğrulanmış BioContent. Hata → BioValidationError.
 * Kurallar: bilinmeyen bölüm anahtarı yok, her paragraf ve olay en az bir mevcut kaynağa bağlı, yalnız https bağlantı,
 * '<' '>' yok, yaşayan kişide ölüm yılı yok.
 */
export function parseBioContent(input: unknown): BioContent {
  const o = obj(input);
  const srcRaw = pick(o, "sources", "sources");
  if (!Array.isArray(srcRaw) || srcRaw.length === 0) throw new BioValidationError("sources", "sources: en az bir kaynak zorunlu.");
  if (srcRaw.length > BIO_LIMITS.sources) throw new BioValidationError("sources", "sources: çok fazla kaynak.");
  const sources: BioSource[] = srcRaw.map((r, i) => {
    const s = obj(r);
    const f = `sources[${i}]`;
    const id = String(s.id ?? "");
    if (!SOURCE_ID_RE.test(id)) throw new BioValidationError(`${f}.id`, `${f}.id: geçersiz kaynak kimliği.`);
    const kind = String(s.kind ?? "");
    if (!(BIO_SOURCE_KINDS as readonly string[]).includes(kind)) throw new BioValidationError(`${f}.kind`, `${f}.kind: geçersiz tür.`);
    const accessed = text(pick(s, "accessedOn", "accessed_on"), `${f}.accessedOn`, 10);
    if (accessed !== null && !DAY_RE.test(accessed)) throw new BioValidationError(`${f}.accessedOn`, `${f}.accessedOn: YYYY-AA-GG bekleniyor.`);
    const rev = text(pick(s, "revisionId", "revision_id"), `${f}.revisionId`, 20);
    if (rev !== null && !/^\d{1,20}$/.test(rev)) throw new BioValidationError(`${f}.revisionId`, `${f}.revisionId: yalnız rakam.`);
    if (kind === "wikipedia" && rev === null) throw new BioValidationError(`${f}.revisionId`, `${f}: Vikipedi kaynağında sayfa sürümü (oldid) zorunlu.`);
    return {
      id, kind: kind as BioSourceKind,
      title: req(s.title, `${f}.title`, BIO_LIMITS.sourceTitle),
      publisher: text(s.publisher, `${f}.publisher`, BIO_LIMITS.publisher),
      url: safeHttpsUrl(s.url, `${f}.url`) as string,
      accessedOn: accessed,
      revisionId: rev,
      license: text(s.license, `${f}.license`, BIO_LIMITS.license),
      licenseUrl: safeHttpsUrl(pick(s, "licenseUrl", "license_url"), `${f}.licenseUrl`, false),
    };
  });
  const known = new Set(sources.map((s) => s.id));
  if (known.size !== sources.length) throw new BioValidationError("sources", "sources: yinelenen kaynak kimliği.");

  const secRaw = o.sections ?? [];
  if (!Array.isArray(secRaw)) throw new BioValidationError("sections", "sections: liste bekleniyor.");
  const seen = new Set<string>();
  const sections: BioSection[] = secRaw.map((r, i) => {
    const s = obj(r);
    const f = `sections[${i}]`;
    const key = String(s.key ?? "");
    if (!(BIO_SECTION_KEYS as readonly string[]).includes(key) || seen.has(key)) throw new BioValidationError(`${f}.key`, `${f}.key: geçersiz veya yinelenen bölüm.`);
    seen.add(key);
    const pr = s.paragraphs;
    if (!Array.isArray(pr) || pr.length === 0 || pr.length > BIO_LIMITS.paragraphs) throw new BioValidationError(`${f}.paragraphs`, `${f}: 1–${BIO_LIMITS.paragraphs} paragraf.`);
    return {
      key: key as BioSectionKey,
      title: text(s.title, `${f}.title`, BIO_LIMITS.sectionTitle) ?? BIO_SECTION_LABEL[key as BioSectionKey],
      paragraphs: pr.map((p, j) => {
        const q = obj(p);
        return { text: req(q.text, `${f}.paragraphs[${j}].text`, BIO_LIMITS.paragraph, true), sourceIds: sourceIds(pick(q, "sourceIds", "source_ids"), `${f}.paragraphs[${j}].sourceIds`, known, 1) };
      }),
    };
  });
  sections.sort((a, b) => BIO_SECTION_KEYS.indexOf(a.key) - BIO_SECTION_KEYS.indexOf(b.key));

  const tlRaw = o.timeline ?? [];
  if (!Array.isArray(tlRaw) || tlRaw.length > BIO_LIMITS.events) throw new BioValidationError("timeline", `timeline: en fazla ${BIO_LIMITS.events} olay.`);
  const timeline: BioEvent[] = tlRaw.map((r, i) => {
    const e = obj(r);
    const f = `timeline[${i}]`;
    const date = String(e.date ?? "").trim();
    if (!DATE_RE.test(date)) throw new BioValidationError(`${f}.date`, `${f}.date: YYYY, YYYY-AA veya YYYY-AA-GG bekleniyor.`);
    return {
      date,
      title: req(e.title, `${f}.title`, BIO_LIMITS.eventTitle),
      text: text(e.text, `${f}.text`, BIO_LIMITS.eventText, { multiline: true }) ?? "",
      sourceIds: sourceIds(pick(e, "sourceIds", "source_ids"), `${f}.sourceIds`, known, 1),
    };
  });
  // Kronolojik (kararlı): yalnız tarih metniyle karşılaştırılır (YYYY < YYYY-AA < YYYY-AA-GG aynı yıl içinde doğal sırada).
  timeline.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const li = obj(pick(o, "licenseInfo", "wikipedia_usage"));
  const artRaw = Array.isArray(li.articles) ? li.articles : [];
  if (artRaw.length > BIO_LIMITS.articles) throw new BioValidationError("licenseInfo.articles", "licenseInfo.articles: çok fazla makale.");
  const licenseInfo: BioLicenseInfo = {
    directQuotes: pick(li, "directQuotes", "direct_quotes") === true,
    adaptedText: pick(li, "adaptedText", "adapted_text") === true,
    note: text(li.note, "licenseInfo.note", BIO_LIMITS.licenseNote, { multiline: true }),
    articles: artRaw.map((a, i) => {
      const x = obj(a);
      const oldid = text(x.oldid, `licenseInfo.articles[${i}].oldid`, 20);
      if (oldid !== null && !/^\d{1,20}$/.test(oldid)) throw new BioValidationError(`licenseInfo.articles[${i}].oldid`, "oldid: yalnız rakam.");
      return {
        lang: req(x.lang, `licenseInfo.articles[${i}].lang`, 10),
        title: req(x.title, `licenseInfo.articles[${i}].title`, BIO_LIMITS.sourceTitle),
        oldid,
        url: safeHttpsUrl(x.url, `licenseInfo.articles[${i}].url`) as string,
      };
    }),
  };

  const oq = pick(o, "openQuestions", "open_questions") ?? [];
  if (!Array.isArray(oq) || oq.length > BIO_LIMITS.openQuestions) throw new BioValidationError("openQuestions", "openQuestions: liste (en fazla 20).");
  const isLiving = pick(o, "isLiving", "is_living") === true;
  const birthYear = yearOrNull(pick(o, "birthYear", "birth_year"), "birthYear");
  const deathYear = yearOrNull(pick(o, "deathYear", "death_year"), "deathYear");
  if (isLiving && deathYear !== null) throw new BioValidationError("deathYear", "Yaşayan kişide ölüm yılı olamaz.");
  if (birthYear !== null && deathYear !== null && deathYear < birthYear) throw new BioValidationError("deathYear", "Ölüm yılı doğum yılından önce olamaz.");
  const category = text(o.category, "category", 20);
  if (category !== null && !(BIO_CATEGORIES as readonly string[]).includes(category)) throw new BioValidationError("category", "category: geçersiz kategori.");

  return {
    displayName: req(pick(o, "displayName", "display_name"), "displayName", BIO_LIMITS.displayName),
    lifeSpan: text(pick(o, "lifeSpan", "life_span"), "lifeSpan", BIO_LIMITS.lifeSpan),
    profession: text(o.profession, "profession", BIO_LIMITS.profession),
    knownFor: text(pick(o, "knownFor", "known_for"), "knownFor", BIO_LIMITS.knownFor),
    country: text(o.country, "country", BIO_LIMITS.country),
    era: text(o.era, "era", BIO_LIMITS.era),
    category,
    isLiving, birthYear, deathYear,
    shortIntro: req(pick(o, "shortIntro", "short_intro"), "shortIntro", BIO_LIMITS.shortIntro, true),
    sections, timeline, sources, licenseInfo,
    neutralityNote: text(pick(o, "neutralityNote", "neutrality_note"), "neutralityNote", BIO_LIMITS.neutralityNote, { multiline: true }),
    openQuestions: oq.map((q, i) => req(q, `openQuestions[${i}]`, BIO_LIMITS.openQuestion, true)),
  };
}

export function parseBioLang(v: unknown): BioLang | null {
  return typeof v === "string" && (BIO_LANGS as readonly string[]).includes(v) ? (v as BioLang) : null;
}

/** DB satırı ↔ içerik (JSON kolonları camelCase saklanır). */
export type BioRow = {
  id: string; person_key: string; lang: BioLang; subject_id: string | null; display_name: string; life_span: string | null; profession: string | null;
  known_for: string | null; country: string | null; era: string | null; category: string | null; is_living: boolean; birth_year: number | null;
  death_year: number | null; short_intro: string; sections: BioSection[]; timeline: BioEvent[]; sources: BioSource[]; license_info: BioLicenseInfo;
  neutrality_note: string | null; open_questions: string[]; content_status: BioContentStatus; publish_status: BioPublishStatus; revision: number;
  published_at: string | null; created_at: string; updated_at: string;
};
export const BIO_ROW_COLS =
  "id, person_key, lang, subject_id, display_name, life_span, profession, known_for, country, era, category, is_living, birth_year, death_year, short_intro, sections, timeline, sources, license_info, neutrality_note, open_questions, content_status, publish_status, revision, published_at, created_at, updated_at";

export function contentToRow(c: BioContent): Record<string, unknown> {
  return {
    display_name: c.displayName, life_span: c.lifeSpan, profession: c.profession, known_for: c.knownFor, country: c.country, era: c.era,
    category: c.category, is_living: c.isLiving, birth_year: c.birthYear, death_year: c.deathYear, short_intro: c.shortIntro,
    sections: c.sections, timeline: c.timeline, sources: c.sources, license_info: c.licenseInfo, neutrality_note: c.neutralityNote, open_questions: c.openQuestions,
  };
}
export function rowToContent(r: BioRow): BioContent {
  return {
    displayName: r.display_name, lifeSpan: r.life_span, profession: r.profession, knownFor: r.known_for, country: r.country, era: r.era,
    category: r.category, isLiving: r.is_living, birthYear: r.birth_year, deathYear: r.death_year, shortIntro: r.short_intro,
    sections: Array.isArray(r.sections) ? r.sections : [], timeline: Array.isArray(r.timeline) ? r.timeline : [],
    sources: Array.isArray(r.sources) ? r.sources : [],
    licenseInfo: r.license_info && typeof r.license_info === "object" ? r.license_info : { directQuotes: false, adaptedText: false, note: null, articles: [] },
    neutralityNote: r.neutrality_note, openQuestions: Array.isArray(r.open_questions) ? r.open_questions : [],
  };
}
