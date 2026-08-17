/**
 * Şifa Rehberi — Premium Word belge KURUCUSU (SAF; ağ/DB YOK → harness test edebilir).
 *
 * EK FAZ 3: mevcut section-native render mantığı buraya taşındı ve premium'a yükseltildi:
 *   - export-türüne göre kapak alt-başlığı
 *   - TOC/stats YALNIZ çok-kayıtta (tek kayıtta gürültü yok)
 *   - çok-kayıtta her guide yeni sayfadan (pageBreakBefore) + başlık keepNext (orphan azalt)
 *   - kaynak / kaynak türü ayrık; Uzman Notu (soft-purple) ve Dikkat (soft-amber) callout kutuları
 *   - opsiyonel meta gizleme (kategori boşsa satır yok)
 *   - guide/section görselleri (route güvenli getirir; burada yalnız embed)
 *   - tüm kullanıcı metni sanitizeXmlText'ten geçer (XML-güvenli; içerik/anlam değişmez)
 *
 * DEĞİŞMEYEN SÖZLEŞMELER: section-native varsa section-first, yoksa legacy fallback
 * (asla ikisi birden → duplicate 0); sort_order + created_at deterministik sıra; içerik
 * TRUNCATE edilmez; internal enum yerine display label (sectionModel).
 */
import {
  bodyText,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  calloutBox,
  embedImageParagraph,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  sanitizeXmlText,
  spacer,
  twoColTable,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  MODE_LABEL,
  SECTION_TYPE_LABEL,
  SECTION_TYPE_ORDER,
  sectionHasAnyLayer,
} from "@/lib/sifa-rehberi/sectionModel";

const C_SIFA = "059669";
// Callout renkleri (print-friendly, pastel dolgu + accent kenar).
const EXPERT_ACCENT = "6d28d9"; // soft purple
const EXPERT_FILL = "f3e8ff";
const ATTN_ACCENT = "b45309"; // soft amber
const ATTN_FILL = "fef3c7";

export type WordSectionRow = {
  id: string;
  guide_id: string;
  section_type: string;
  mode: string | null;
  title: string | null;
  note: string | null;
  source: string | null;
  source_kind: string | null;
  expert_note: string | null;
  attention: string | null;
  sort_order: number | null;
  created_at: string;
  images?: unknown;
};

export type WordGuideRaw = {
  id: string;
  name: string;
  category: string | null;
  symptoms: string | null;
  created_at: string;
  updated_at: string | null;
  general_summary: string | null;
  medical_causes: string | null;
  subconscious_causes: string | null;
  temperament_causes: string | null;
  other_causes: string | null;
  iridology_match: string | null;
  hand_analysis_match: string | null;
  cupping_leech: string | null;
  reflexology: string | null;
  diet_recommendations: string | null;
  herbal_methods: string | null;
  stone_recommendations: string | null;
  aromatherapy: string | null;
  meditation: string | null;
  breathwork: string | null;
  bioenergy: string | null;
  massage: string | null;
  daily_routine: string | null;
  sleep_routine: string | null;
  supportive_alternative_methods: string | null;
  islamic_recommendations: string | null;
  images?: unknown;
  healing_guide_sections: WordSectionRow[] | null;
};

export type SifaExportMode = "all" | "selected" | "single" | "filtered";

/** Önceden güvenli getirilmiş görsel buffer'ları (route doldurur; saf builder yalnız embed eder). */
export type ImagesByKey = Map<string, Buffer[]>;

// ── metin yardımcıları (hepsi XML-güvenli) ──────────────────────────────────────
function txt(v: string | null | undefined): string {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? sanitizeXmlText(t) : "";
}

function normKey(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

function sectionDisplayLabel(section: WordSectionRow): string {
  const mk = normKey(section.mode);
  if (mk && MODE_LABEL[mk]) return MODE_LABEL[mk];
  const tk = normKey(section.title);
  if (tk && MODE_LABEL[tk]) return MODE_LABEL[tk];
  if (section.title?.trim()) return sanitizeXmlText(section.title.trim());
  if (mk && SECTION_TYPE_LABEL[mk]) return SECTION_TYPE_LABEL[mk];
  return SECTION_TYPE_LABEL[section.section_type] ?? "İçerik";
}

function formatDateTR(d: string): string {
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return d;
  }
}

function embedImages(out: ReportChild[], buffers: Buffer[] | undefined, maxWidth: number) {
  if (!buffers || buffers.length === 0) return;
  for (const buf of buffers) out.push(embedImageParagraph(buf, maxWidth));
}

// ── legacy fallback (section yoksa) ─────────────────────────────────────────────
function addLegacySection(out: ReportChild[], label: string, value: string | null | undefined) {
  const t = txt(value);
  if (!t) return;
  out.push(h3(label, { keepNext: true }));
  out.push(bodyText(t));
}

function buildFromLegacy(out: ReportChild[], g: WordGuideRaw) {
  addLegacySection(out, "Genel Özet", g.general_summary);
  addLegacySection(out, "Belirtiler", g.symptoms);
  if (g.medical_causes || g.subconscious_causes || g.temperament_causes || g.other_causes) {
    out.push(h3("Nedenler / Sebepler", { keepNext: true }));
    addLegacySection(out, "Tıbbi Nedenler", g.medical_causes);
    addLegacySection(out, "Bilinçaltı Sebepleri", g.subconscious_causes);
    addLegacySection(out, "Mizaç Sebepleri", g.temperament_causes);
    addLegacySection(out, "Diğer Sebepler", g.other_causes);
  }
  if (g.iridology_match || g.hand_analysis_match) {
    out.push(h3("Analiz Eşleştirmeleri", { keepNext: true }));
    addLegacySection(out, "İridoloji'de Karşılığı", g.iridology_match);
    addLegacySection(out, "El Analizinde Karşılığı", g.hand_analysis_match);
  }
  if (g.cupping_leech || g.reflexology || g.diet_recommendations || g.herbal_methods) {
    out.push(h3("Uygulamalar ve Yöntemler", { keepNext: true }));
    addLegacySection(out, "Hacamat & Sülük", g.cupping_leech);
    addLegacySection(out, "Refleksoloji", g.reflexology);
    addLegacySection(out, "Diyet Önerileri", g.diet_recommendations);
    addLegacySection(out, "Bitkisel Yöntemler", g.herbal_methods);
  }
  addLegacySection(out, "Doğaltaş Önerileri", g.stone_recommendations);
  addLegacySection(out, "Aromaterapi", g.aromatherapy);
  if (
    g.meditation || g.breathwork || g.bioenergy || g.massage ||
    g.daily_routine || g.sleep_routine || g.supportive_alternative_methods
  ) {
    out.push(h3("Destekleyici Uygulamalar", { keepNext: true }));
    addLegacySection(out, "Meditasyon", g.meditation);
    addLegacySection(out, "Nefes Çalışması", g.breathwork);
    addLegacySection(out, "Biyoenerji", g.bioenergy);
    addLegacySection(out, "Masaj", g.massage);
    addLegacySection(out, "Günlük Rutin", g.daily_routine);
    addLegacySection(out, "Uyku Düzeni", g.sleep_routine);
    addLegacySection(out, "Destekleyici / Alternatif", g.supportive_alternative_methods);
  }
  addLegacySection(out, "İslami Öneriler", g.islamic_recommendations);
}

// ── section-native ──────────────────────────────────────────────────────────────
function pushSectionLayers(
  out: ReportChild[],
  s: WordSectionRow,
  sectionImages: ImagesByKey,
  subLabel?: string,
) {
  if (subLabel) out.push(bodyText(`▸ ${sanitizeXmlText(subLabel)}`));
  const content = txt(s.note);
  if (content) out.push(bodyText(content));

  // Kaynak bloğu — kaynak ve kaynak türü AYRI satır; boşsa satır yok; Uzman Notu'ndan ayrı.
  const src = txt(s.source);
  const kind = txt(s.source_kind);
  if (src) out.push(muted(`Kaynak: ${src}`));
  if (kind) out.push(muted(`Kaynak Türü: ${kind}`));

  // Uzman Notu — soft-purple callout (boşsa yok).
  const expert = txt(s.expert_note);
  if (expert) out.push(calloutBox("Uzman Notu", expert, EXPERT_ACCENT, EXPERT_FILL));

  // Dikkat Edilmesi Gerekenler — OPSİYONEL, soft-amber callout (boşsa yok; otomatik metin YOK).
  const attn = txt(s.attention);
  if (attn) out.push(calloutBox("Dikkat Edilmesi Gerekenler", attn, ATTN_ACCENT, ATTN_FILL));

  // Section görselleri (deterministik sıra).
  embedImages(out, sectionImages.get(s.id), 380);
}

function buildFromSections(out: ReportChild[], sections: WordSectionRow[], sectionImages: ImagesByKey) {
  const grouped: Record<string, WordSectionRow[]> = {};
  for (const s of sections) {
    const key = s.section_type || "other";
    (grouped[key] ??= []).push(s);
  }
  const orderedTypes = [
    ...SECTION_TYPE_ORDER.filter((t) => grouped[t]?.length),
    ...Object.keys(grouped).filter((t) => !SECTION_TYPE_ORDER.includes(t) && grouped[t]?.length),
  ];
  for (const stype of orderedTypes) {
    const rows = (grouped[stype] ?? []).filter((s) => sectionHasAnyLayer(s));
    if (!rows.length) continue;
    const stypeLabel = SECTION_TYPE_LABEL[stype] ?? stype;
    if (rows.length === 1) {
      const s = rows[0]!;
      const label = sectionDisplayLabel(s);
      out.push(h3(label !== stypeLabel ? label : stypeLabel, { keepNext: true }));
      pushSectionLayers(out, s, sectionImages);
    } else {
      out.push(h3(stypeLabel, { keepNext: true }));
      for (const s of rows) {
        const label = sectionDisplayLabel(s);
        pushSectionLayers(out, s, sectionImages, label !== stypeLabel ? label : undefined);
      }
    }
  }
}

function sortSections(sections: WordSectionRow[]): WordSectionRow[] {
  return sections
    .filter((s) => sectionHasAnyLayer(s))
    .slice()
    .sort((a, b) => {
      const ao = typeof a.sort_order === "number" ? a.sort_order : null;
      const bo = typeof b.sort_order === "number" ? b.sort_order : null;
      if (ao != null && bo != null) return ao - bo || a.created_at.localeCompare(b.created_at);
      if (ao != null) return -1;
      if (bo != null) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
}

/** Tek guide'ın içeriği. `pageBreakBefore` yalnız çok-kayıtta ve ilk-olmayan guide'da true. */
export function buildGuideChildren(
  guide: WordGuideRaw,
  opts: { index: number; isMulti: boolean; guideImages: ImagesByKey; sectionImages: ImagesByKey },
): ReportChild[] {
  const out: ReportChild[] = [];
  const name = txt(guide.name) || "İsimsiz Kayıt";

  if (opts.isMulti) {
    out.push(profileLabel(`KAYIT #${String(opts.index + 1).padStart(3, "0")}`, C_SIFA));
  }
  // Çok-kayıtta her guide (ilk hariç) yeni sayfadan; başlık içeriğiyle birlikte kalsın.
  out.push(h2(name, { pageBreakBefore: opts.isMulti && opts.index > 0, keepNext: true }));

  // Meta — OPTIONAL HIDE: kategori boşsa satır yok; tarih anlamlı → her zaman.
  const metaRows: [string, string][] = [];
  const cat = txt(guide.category);
  if (cat) metaRows.push(["Kategori", cat]);
  metaRows.push(["Tarih", formatDateTR(guide.updated_at || guide.created_at)]);
  out.push(twoColTable(metaRows));

  // Guide-seviye görseller (varsa) — meta sonrası.
  embedImages(out, opts.guideImages.get(guide.id), 420);

  // Belirtiler (symptoms) — yalnız doluysa.
  const symptoms = txt(guide.symptoms);
  if (symptoms) {
    out.push(h3("Belirtiler", { keepNext: true }));
    out.push(bodyText(symptoms));
  }

  const sections = sortSections(
    Array.isArray(guide.healing_guide_sections) ? guide.healing_guide_sections : [],
  );

  // section-native VARSA section-first; YOKSA legacy fallback → asla ikisi birden (duplicate 0).
  if (sections.length > 0) {
    buildFromSections(out, sections, opts.sectionImages);
  } else {
    buildFromLegacy(out, guide);
  }
  return out;
}

function coverSubtitle(mode: SifaExportMode, guides: WordGuideRaw[]): string {
  const n = guides.length;
  if (mode === "single" || (mode === "selected" && n === 1)) {
    return `Tek Kayıt — ${txt(guides[0]?.name) || "Şifa Rehberi"}`;
  }
  if (mode === "selected") return `Seçili Kayıtlar — ${n} Kayıt`;
  if (mode === "filtered") return `Filtrelenmiş Kayıtlar — ${n} Kayıt`;
  return `Şifa Rehberi Kataloğu — ${n} Kayıt`;
}

function exportLabel(mode: SifaExportMode, guides: WordGuideRaw[]): string {
  const n = guides.length;
  if (mode === "single" || (mode === "selected" && n === 1)) return `Tek Kayıt — ${txt(guides[0]?.name)}`;
  if (mode === "selected") return `Seçili Kayıtlar (${n})`;
  if (mode === "filtered") return `Filtrelenmiş Kayıtlar (${n})`;
  return `Tüm Şifa Rehberi (${n})`;
}

/**
 * Belge gövdesi (kapak → [çok-kayıtta stats+TOC] → guide'lar). SAF. Route bunu footer'lı
 * Document'e sarar ve (yalnız single-delivery'de) BF-14 snapshot ekini ekler.
 */
export function buildSifaReportChildren(opts: {
  guides: WordGuideRaw[];
  exportMode: SifaExportMode;
  today: string;
  guideImages?: ImagesByKey;
  sectionImages?: ImagesByKey;
}): ReportChild[] {
  const { guides, exportMode, today } = opts;
  const guideImages = opts.guideImages ?? new Map<string, Buffer[]>();
  const sectionImages = opts.sectionImages ?? new Map<string, Buffer[]>();
  const isMulti = guides.length > 1;
  const categories = new Set(guides.map((g) => txt(g.category)).filter(Boolean));

  const all: ReportChild[] = [];

  all.push(
    ...buildPremiumCover({
      title1: "YAŞAM SİSTEMİ",
      title2: "ŞİFA REHBERİ RAPORU",
      subtitle: coverSubtitle(exportMode, guides),
      date: `Oluşturulma Tarihi: ${sanitizeXmlText(today)}`,
      stats: [
        { label: "Kayıt Sayısı", value: String(guides.length) },
        { label: "Kategori", value: String(categories.size) },
        { label: "Kapsam", value: exportLabel(exportMode, guides) },
      ],
    }),
  );

  // Stats + TOC yalnız çok-kayıtta (tek kayıtta gürültü/gereksiz TOC yok).
  if (isMulti) {
    all.push(
      ...buildStatsPage([
        ["Kayıt Sayısı", String(guides.length)],
        ["Kategori", String(categories.size)],
        ["Kapsam", exportLabel(exportMode, guides)],
      ]),
    );
    all.push(...buildTOCPage());
  }

  all.push(h1Colored("Şifa Rehberi Kayıtları", C_SIFA, true));
  if (isMulti) {
    all.push(muted(`${guides.length} kayıt`));
    all.push(spacer());
  }

  guides.forEach((guide, i) => {
    all.push(...buildGuideChildren(guide, { index: i, isMulti, guideImages, sectionImages }));
  });

  return all;
}

// ── Filename (premium + safe) ─────────────────────────────────────────────────
function slugify(t: string): string {
  return t
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i").replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u").replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o").replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * ASCII-safe, injection-safe dosya adı. slash/backslash/kontrol/tırnak yok; makul uzunluk;
 * `.docx`. Content-Disposition injection engellenir (yalnız [a-z0-9-] + tarih).
 */
export function sifaWordFilename(mode: SifaExportMode, guides: WordGuideRaw[], dateSlug: string): string {
  const isSingle = mode === "single" || (mode === "selected" && guides.length === 1);
  let core: string;
  if (isSingle && guides[0]?.name) {
    core = slugify(guides[0].name).slice(0, 60) || "kayit";
  } else if (mode === "selected") {
    core = `secili-${guides.length}-kayit`;
  } else if (mode === "filtered") {
    core = `filtrelenmis-${guides.length}-kayit`;
  } else {
    core = `tumu-${guides.length}-kayit`;
  }
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateSlug) ? dateSlug : "";
  return `sifa-rehberi-${core}${safeDate ? `-${safeDate}` : ""}.docx`;
}
