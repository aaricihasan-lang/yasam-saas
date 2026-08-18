/**
 * Şifa Rehberi — Premium Word belge KURUCUSU (SAF; ağ/DB YOK → harness test edebilir).
 *
 * EK FAZ 3B (katalog-akışı revizyonu): İÇERİK ASLA özetlenmez/kısaltılmaz/truncate edilmez —
 * yalnız yerleşim/sayfa-akışı iyileştirilir:
 *   - "SİSTEM ÖZETİ" (stats page) TÜM export türlerinde KALDIRILDI (kapak zaten metadata taşır).
 *   - Dinamik Word TOC KALDIRILDI → multi'de statik "KAYIT LİSTESİ" (Word açılışta hazır; güncelleme gerektirmez).
 *   - Çoklu-kayıtta guide-başı ZORUNLU sayfa kırımı KALDIRILDI → kesintisiz katalog akışı (doğal pagination);
 *     yeni guide yalnız ince divider + güçlü başlık ile ayrılır.
 *   - "KAYIT #001" gibi label'lar KALDIRILDI (orphan kaynağıydı; sıra zaten deterministik).
 *   - Guide metadata hafifletildi (full-width tablo yerine tek muted satır: tarih [+ kategori yalnız doluysa]).
 *   - Sistem placeholder metinleri (isMeaningfulText) GİZLENİR (özetleme DEĞİL; gerçek-olmayan boş-durum metni).
 *   - Sınırlı keepNext ile orphan kontrolü (tüm record keepTogether/cantSplit YOK → dev boşluk üretmez).
 *
 * DEĞİŞMEYEN SÖZLEŞMELER: section-native varsa section-first, yoksa legacy fallback (asla ikisi birden →
 * duplicate 0); sort_order + created_at deterministik sıra; içerik TRUNCATE edilmez; provenance
 * (source / source_kind / Uzman Notu / Dikkat) aynen korunur; internal enum yerine display label.
 */
import {
  BorderStyle,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
} from "docx";
import {
  bodyText,
  buildPremiumCover,
  calloutBox,
  divider,
  embedImageParagraph,
  h1Colored,
  h2,
  h3,
  muted,
  sanitizeXmlText,
  spacer,
  C_DARK,
  C_LIGHT,
  C_MID,
  REPORT_FONT,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  MODE_LABEL,
  SECTION_TYPE_LABEL,
  SECTION_TYPE_ORDER,
  sectionHasAnyLayer,
} from "@/lib/sifa-rehberi/sectionModel";
import { isMeaningfulText } from "@/lib/sifa-rehberi/normalizeTr";

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
// U+FFFC (OBJECT REPLACEMENT CHARACTER) = anlamsız gömülü-nesne artifact'ı; Word'de görünür
// kare/OBJ olarak render olur. YALNIZ bu karakteri kaldırırız — çevresindeki metin (öncesi +
// sonrası) BYTE olarak korunur. Genel Unicode/U+FFFD/Türkçe temizliği YAPILMAZ.
function txt(v: string | null | undefined): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) return "";
  return sanitizeXmlText(t).replace(new RegExp(String.fromCharCode(0xFFFC), "g"), "");
}

/**
 * ANLAMLI içerik → sanitize edilmiş metin; boş VEYA sistem-placeholder ise "".
 * ÖNEMLİ: bu özetleme/kısaltma DEĞİLDİR — isMeaningfulText yalnız TAM eşleşen bilinen
 * placeholder cümlelerini (ör. "Bu bölüm için henüz bilgi eklenmemiş.") eler; gerçek
 * profesyonel içerik (uzun metin dahil) hiçbir zaman elenmez/kısalmaz.
 */
function meaningful(v: string | null | undefined): string {
  const t = txt(v);
  return t && isMeaningfulText(t) ? t : "";
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

// Hafif tarih/kategori meta satırı (muted stiliyle aynı). `keepNext` → ardından içerik geliyorsa
// başlık→meta→ilk-içerik zincirinin sayfa sonunda kopmaması için (guide-header orphan control).
// keepNext YALNIZ takip eden içerik varken verilir → tüm-record keepTogether/cantSplit DEĞİL.
function metaLine(text: string, keepNext: boolean): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 220 },
    ...(keepNext ? { keepNext: true } : {}),
  });
}

// Nested alt-başlık (▸ Mizaç Sebepleri): bodyText stiliyle aynı + keepNext → ilk içerik
// paragrafıyla birlikte kalsın (subsection-heading orphan). Alt-bölümün TAMAMI kilitlenmez.
function subLabelLine(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: REPORT_FONT, color: C_MID })],
    indent: { left: 360 },
    spacing: { after: 140 },
    keepNext: true,
  });
}

/**
 * Bir section'da GÖSTERİLEBİLİR (placeholder-olmayan) içerik var mı? Sistem placeholder'ı
 * tek başına içerik SAYILMAZ (Word'e basılmaz). Provenance (source/source_kind) de içerik sayılır.
 */
function sectionRenderable(s: WordSectionRow): boolean {
  // Önce paylaşılan boş-bölüm sözleşmesi (sectionHasAnyLayer): hiç katman yoksa render edilmez.
  if (!sectionHasAnyLayer(s)) return false;
  // Ardından refine: en az bir ANLAMLI (sistem-placeholder OLMAYAN) katman bulunmalı.
  return Boolean(
    meaningful(s.note) || txt(s.source) || txt(s.source_kind) ||
    meaningful(s.expert_note) || meaningful(s.attention),
  );
}

// ── legacy fallback (section yoksa) ─────────────────────────────────────────────
function addLegacySection(out: ReportChild[], label: string, value: string | null | undefined) {
  const t = meaningful(value); // placeholder ise başlık da basılmaz
  if (!t) return;
  out.push(h3(label, { keepNext: true }));
  out.push(bodyText(t));
}

function anyMeaningful(...vals: (string | null | undefined)[]): boolean {
  return vals.some((v) => meaningful(v));
}

function buildFromLegacy(out: ReportChild[], g: WordGuideRaw) {
  // NOT: "Belirtiler" (symptoms) buildGuideChildren'da bir kez basılır → burada TEKRAR YOK (duplicate 0).
  addLegacySection(out, "Genel Özet", g.general_summary);
  if (anyMeaningful(g.medical_causes, g.subconscious_causes, g.temperament_causes, g.other_causes)) {
    out.push(h3("Nedenler / Sebepler", { keepNext: true }));
    addLegacySection(out, "Tıbbi Nedenler", g.medical_causes);
    addLegacySection(out, "Bilinçaltı Sebepleri", g.subconscious_causes);
    addLegacySection(out, "Mizaç Sebepleri", g.temperament_causes);
    addLegacySection(out, "Diğer Sebepler", g.other_causes);
  }
  if (anyMeaningful(g.iridology_match, g.hand_analysis_match)) {
    out.push(h3("Analiz Eşleştirmeleri", { keepNext: true }));
    addLegacySection(out, "İridoloji'de Karşılığı", g.iridology_match);
    addLegacySection(out, "El Analizinde Karşılığı", g.hand_analysis_match);
  }
  if (anyMeaningful(g.cupping_leech, g.reflexology, g.diet_recommendations, g.herbal_methods)) {
    out.push(h3("Uygulamalar ve Yöntemler", { keepNext: true }));
    addLegacySection(out, "Hacamat & Sülük", g.cupping_leech);
    addLegacySection(out, "Refleksoloji", g.reflexology);
    addLegacySection(out, "Diyet Önerileri", g.diet_recommendations);
    addLegacySection(out, "Bitkisel Yöntemler", g.herbal_methods);
  }
  addLegacySection(out, "Doğaltaş Önerileri", g.stone_recommendations);
  addLegacySection(out, "Aromaterapi", g.aromatherapy);
  if (
    anyMeaningful(
      g.meditation, g.breathwork, g.bioenergy, g.massage,
      g.daily_routine, g.sleep_routine, g.supportive_alternative_methods,
    )
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
  if (subLabel) out.push(subLabelLine(`▸ ${sanitizeXmlText(subLabel)}`)); // keepNext → ilk içerikle kalsın
  const content = meaningful(s.note); // placeholder gizlenir; gerçek içerik TAM
  if (content) out.push(bodyText(content));

  // Kaynak bloğu — kaynak ve kaynak türü AYRI satır; boşsa satır yok; Uzman Notu'ndan ayrı.
  const src = txt(s.source);
  const kind = txt(s.source_kind);
  if (src) out.push(muted(`Kaynak: ${src}`));
  if (kind) out.push(muted(`Kaynak Türü: ${kind}`));

  // Uzman Notu — soft-purple callout (boşsa yok).
  const expert = meaningful(s.expert_note);
  if (expert) out.push(calloutBox("Uzman Notu", expert, EXPERT_ACCENT, EXPERT_FILL));

  // Dikkat Edilmesi Gerekenler — OPSİYONEL, soft-amber callout (boşsa yok; otomatik metin YOK).
  const attn = meaningful(s.attention);
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
    const rows = (grouped[stype] ?? []).filter(sectionRenderable); // placeholder-only bölümler elenir
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
  // Render kararı GÖSTERİLEBİLİR (placeholder-olmayan) bölümlere göre → placeholder-only
  // section'lar legacy fallback'i engellemez ve boş başlık üretmez.
  return sections
    .filter(sectionRenderable)
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

// ── Statik "KAYIT LİSTESİ" (dinamik Word TOC yerine; açılışta hazır) ─────────────
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;

function listCell(name: string): TableCell {
  return new TableCell({
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: name
          ? [
              new TextRun({ text: "· ", size: 20, font: REPORT_FONT, color: C_SIFA }),
              new TextRun({ text: name, size: 22, font: REPORT_FONT, color: C_DARK }),
            ]
          : [new TextRun({ text: "", size: 2 })],
      }),
    ],
  });
}

/**
 * Multi export'ta gerçek guide isimlerinden STATİK 2-sütun kayıt listesi. Yalnız navigation/index —
 * özet/preview/snippet DEĞİL (içerik kaybı yok). Word açılışta hazır görünür (alan güncelleme gerektirmez).
 */
function buildRecordListChildren(names: string[]): ReportChild[] {
  const heading = new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "KAYIT LİSTESİ", bold: true, size: 36, font: REPORT_FONT, color: C_DARK })],
    pageBreakBefore: true,
    spacing: { before: 600, after: 400 },
  });
  const rows: TableRow[] = [];
  for (let i = 0; i < names.length; i += 2) {
    rows.push(new TableRow({ children: [listCell(names[i]!), listCell(names[i + 1] ?? "")] }));
  }
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
      insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
    },
    rows,
  });
  return [heading, table];
}

/**
 * Tek guide'ın içeriği. Katalog akışında guide'lar arası ZORUNLU sayfa kırımı YOK; `startOnNewPage`
 * yalnız single export'ta (kapaktan sonra kayıt yeni sayfadan) true. "KAYIT #" label YOK; hafif meta.
 */
export function buildGuideChildren(
  guide: WordGuideRaw,
  opts: { startOnNewPage: boolean; guideImages: ImagesByKey; sectionImages: ImagesByKey },
): ReportChild[] {
  const out: ReportChild[] = [];
  const name = txt(guide.name) || "İsimsiz Kayıt";

  // Guide gövdesini ÖNCE ayrı diz → meta satırının keepNext'ini "içerik var mı?" ile karar ver.
  const rest: ReportChild[] = [];
  embedImages(rest, opts.guideImages.get(guide.id), 420);
  // Belirtiler — yalnız ANLAMLI içerik (sistem placeholder'ı gizlenir; başlık da basılmaz).
  const symptoms = meaningful(guide.symptoms);
  if (symptoms) {
    rest.push(h3("Belirtiler", { keepNext: true }));
    rest.push(bodyText(symptoms));
  }
  const sections = sortSections(
    Array.isArray(guide.healing_guide_sections) ? guide.healing_guide_sections : [],
  );
  // section-native VARSA section-first; YOKSA legacy fallback → asla ikisi birden (duplicate 0).
  if (sections.length > 0) {
    buildFromSections(rest, sections, opts.sectionImages);
  } else {
    buildFromLegacy(rest, guide);
  }
  const hasContent = rest.length > 0;

  // Güçlü guide başlığı; keepNext → başlık meta satırıyla aynı sayfada kalsın.
  out.push(h2(name, { pageBreakBefore: opts.startOnNewPage, keepNext: true }));

  // Hafif meta: tarih (+ kategori yalnız DOLUYSA). Full-width ağır tablo YOK; boşsa kategori satırı yok.
  // keepNext=hasContent → başlık→meta→ilk-içerik zinciri sayfa sonunda kopmaz (guide-header orphan fix);
  // içerik yoksa keepNext YOK (sonraki guide'ı çekmesin). Tüm-record keepTogether/cantSplit YOK.
  const dateStr = formatDateTR(guide.updated_at || guide.created_at);
  const cat = txt(guide.category);
  out.push(metaLine(cat ? `${dateStr} · Kategori: ${cat}` : dateStr, hasContent));

  out.push(...rest);
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
 * Belge gövdesi. SAF. Route bunu footer'lı Document'e sarar ve (yalnız single-delivery'de) BF-14
 * snapshot ekini ekler.
 *   single : Kapak → (yeni sayfa) TAM kayıt.  (Sistem Özeti / Kayıt Listesi / TOC YOK)
 *   multi  : Kapak → (yeni sayfa) KAYIT LİSTESİ → (yeni sayfa) kesintisiz katalog (guide-başı break YOK).
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

  // Kapak metadata (kayıt sayısı / [kategori] / kapsam) YALNIZ burada. Ayrı "Sistem Özeti" YOK.
  // Kategori sayısı 0 ise "Kategori: 0" satırı GİZLENİR (presentation polish; içeriğe dokunmaz).
  const coverStats = [{ label: "Kayıt Sayısı", value: String(guides.length) }];
  if (categories.size > 0) coverStats.push({ label: "Kategori", value: String(categories.size) });
  coverStats.push({ label: "Kapsam", value: exportLabel(exportMode, guides) });

  all.push(
    ...buildPremiumCover({
      title1: "YAŞAM SİSTEMİ",
      title2: "ŞİFA REHBERİ RAPORU",
      subtitle: coverSubtitle(exportMode, guides),
      date: `Oluşturulma Tarihi: ${sanitizeXmlText(today)}`,
      stats: coverStats,
    }),
  );

  if (isMulti) {
    // Statik Kayıt Listesi (dinamik TOC YOK) — kendi sayfasında.
    all.push(...buildRecordListChildren(guides.map((g) => txt(g.name) || "İsimsiz Kayıt")));
    // Katalog yeni sayfadan başlar (TEK break); guide'lar arası ZORUNLU break YOK.
    all.push(h1Colored("Şifa Rehberi Kayıtları", C_SIFA, true));
    all.push(muted(`${guides.length} kayıt`));
    all.push(spacer());
    guides.forEach((guide, i) => {
      if (i > 0) all.push(divider()); // yeni guide: ince, print-friendly ayraç (dev boşluk yok)
      all.push(...buildGuideChildren(guide, { startOnNewPage: false, guideImages, sectionImages }));
    });
  } else {
    // Single: kapaktan sonra doğrudan TAM kayıt (yeni sayfada). Liste/özet/TOC YOK.
    guides.forEach((guide) => {
      all.push(...buildGuideChildren(guide, { startOnNewPage: true, guideImages, sectionImages }));
    });
  }

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
