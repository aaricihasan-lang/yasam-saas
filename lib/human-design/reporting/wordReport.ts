/**
 * HD FAZ 2 — Profesyonel Word/DOCX · SAF BELGE KURUCUSU
 * =====================================================
 *
 * Girdi: DONMUŞ HdReportSnapshot (DB'den okunmuş). Çıktı: docx Document / Buffer.
 * DB / auth / ağ YOK (fixture ile test edilebilir; §49). Görsel getirme AYRI adapter'ın
 * işidir — bu kurucu yalnız hazır bir Buffer alır (opsiyonel).
 *
 * Mevcut lib/docx/reportHelpers toolkit'i REUSE edilir (ikinci Word toolkit YOK; §7).
 * Canonical prose → semantic bloklar için Premium Reader'ın SAF parser'ı
 * (parseReaderBlocks + promotePlainHeadings) REUSE edilir; React renderer DEĞİL (§8/§29).
 *
 * Bölüm sırası: Kapak → Danışan/Harita → Temel Kimlik → Tanımlı Kanallar →
 * Aktif/Bağımsız Kapılar → Asılı Kapı Bağlamları → Kapanış. (İçindekiler kullanıcı
 * kararıyla kaldırıldı; Word HeadingLevel yapısı korunur.)
 */

import { Document, Footer, Packer, Paragraph, TextRun } from "docx";
import {
  buildFooter,
  buildHeader,
  buildPremiumCover,
  buildWellnessNoteSection,
  bodyText,
  divider,
  embedImageParagraph,
  getImgDimensions,
  h1,
  h2,
  h3,
  muted,
  sanitizeXmlText,
  spacer,
  twoColTable,
  REPORT_FONT,
  C_DARK,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import {
  parseReaderBlocks,
  promotePlainHeadings,
  type ReaderBlock,
} from "@/components/common/reader/formatReaderText";
import {
  AUTHORITY_FIELD_ORDER,
  CHANNEL_FIELD_ORDER,
  composeFields,
  GATE_FIELD_ORDER,
  type ContentFieldKey,
} from "./reportCompose";
import type {
  FrozenCanonicalContent,
  FrozenIdentitySection,
  FrozenOmittedSection,
  HdReportSnapshot,
} from "./reportSnapshot";
import { formatDateLoose, formatDateOnly, formatInstantDate } from "@/lib/time/reportTime";
import type { OutputLocale } from "@/lib/i18n/output";
import { hdDocLanguage, hdEn, hdFooterChildren, hdReportText, hdWellnessNoteSection, type HdReportText } from "./reportText";

// ── Çıktı dili (I18N-F1-R5 HD-B; bkz. reportText.ts) ─────────────────────────────
// Kurucu SENKRON → dil modül düzeyinde tutulur, kurulum bitince geri alınır (istekler arası karışma yok).
let X: HdReportText = hdReportText(null);
const t = (key: string, values?: Record<string, string | number>) => X.t(key, values);
const isEn = () => !X.isSource;
function withText<T>(output: OutputLocale | null | undefined, fn: () => T): T {
  const prev = X;
  X = hdReportText(output ?? null);
  try {
    return fn();
  } finally {
    X = prev;
  }
}
const dateOpts = () => (X.dateLocale ? { locale: X.dateLocale } : {});

// Donmuş görünen adlar: TR → snapshot AYNEN; diğer dillerde kanonik anahtardan (tip_/otorite_/kanal kodu/kapı no).
function typeName(sec: FrozenIdentitySection): string {
  if (!isEn()) return sec.displayName;
  return hdEn.term("type", sec.key.replace(/^tip_/, "")) ?? hdEn.type(sec.displayName) ?? sec.displayName;
}
function authorityName(sec: FrozenIdentitySection): string {
  if (!isEn()) return sec.displayName;
  return hdEn.term("authority", sec.key.replace(/^otorite_/, "")) ?? sec.displayName;
}
const channelName = (code: string, displayName: string) => (isEn() ? hdEn.term("channel", code) ?? displayName : displayName);
/** Yayımlanmamış bölüm adı (anahtar taşımaz) — görünen addan çözülür; çözülemezse aynen. */
function omittedName(o: FrozenOmittedSection): string {
  if (!isEn()) return o.displayName;
  if (o.kind === "tip") return hdEn.type(o.displayName) ?? o.displayName;
  if (o.kind === "otorite") return hdEn.authority(o.displayName, null) ?? o.displayName;
  const ch = /(\d{1,2}-\d{1,2})/.exec(o.displayName);
  if (o.kind === "kanal" && ch) return t("v1.channelHeading", { name: hdEn.term("channel", ch[1]!) ?? ch[1]! });
  const g = /(\d{1,2})/.exec(o.displayName);
  if (o.kind === "kapi" && g) return t("v1.gate", { n: g[1]! });
  return o.displayName;
}

// ── Prose (inline canonical metin) → docx paragrafları ──────────────────────────
// Field ETİKETİ zaten H3'tür; prose İÇİNDEKİ ##/### başlıklar H3'ün ALTINDA kalmalı →
// Word heading STİLİ DEĞİL, koyu (bold) paragraf olarak render edilir (TOC/nav kirlenmez,
// hiyerarşi ters dönmez, RAW ## GÖRÜNMEZ). Listeler gerçek madde-imi; paragraflar bodyText.
function inProseHeading(text: string, level: number): Paragraph {
  const size = level <= 2 ? 24 : 22;
  return new Paragraph({
    children: [new TextRun({ text: sanitizeXmlText(text), bold: true, size, font: REPORT_FONT, color: C_DARK })],
    spacing: { before: 200, after: 100 },
    keepNext: true,
    widowControl: true,
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text: sanitizeXmlText(text), size: 22, font: REPORT_FONT, color: C_MID })],
    spacing: { after: 60 },
    widowControl: true,
  });
}

/** Canonical prose değeri → docx blokları (SAF parser reuse; RAW markdown YOK). */
function renderProse(value: string): Paragraph[] {
  const blocks: ReaderBlock[] = promotePlainHeadings(parseReaderBlocks(sanitizeXmlText(value)));
  const out: Paragraph[] = [];
  for (const b of blocks) {
    if (b.type === "heading") {
      out.push(inProseHeading(b.text, b.level));
    } else if (b.type === "list") {
      for (const item of b.items) out.push(bulletParagraph(item));
    } else {
      for (const line of b.lines) out.push(bodyText(sanitizeXmlText(line)));
    }
  }
  return out;
}

/** Bir canonical içerik → (per-kind sıra) H3 alan başlığı + prose. */
function renderContentFields(
  content: FrozenCanonicalContent,
  order: readonly (keyof FrozenCanonicalContent)[],
): ReportChild[] {
  const out: ReportChild[] = [];
  for (const f of composeFields(content, order)) {
    out.push(h3(isEn() ? t(`field.${f.key}`) : f.label, { keepNext: true }));
    out.push(...renderProse(f.value));
  }
  return out;
}

// ── Kimlik (Tip / Otorite) ──────────────────────────────────────────────────────
function renderIdentity(
  section: FrozenIdentitySection | null,
  kindLabel: string,
  order: readonly (keyof FrozenCanonicalContent)[],
  emptyText: string,
  omitted?: FrozenOmittedSection | null,
): ReportChild[] {
  if (!section && omitted) {
    // Chart'ta değer VAR ama içerik henüz yayımlanmadı (uzman omit modu).
    return [h2(`${kindLabel} — ${omittedName(omitted)}`, { keepNext: true }), bodyText(t("v1.unpublished"))];
  }
  if (!section) {
    // Chart'ta değer yok → sade empty-state (canonical-unpublished mesajı DEĞİL; §24/§57).
    return [h2(kindLabel, { keepNext: true }), bodyText(emptyText)];
  }
  return [
    h2(`${kindLabel} — ${authorityName(section)}`, { keepNext: true }),
    ...renderContentFields(section.content, order),
  ];
}

// ── Tip özel sunumu (editoryal tekrar konsolidasyonu) ────────────────────────────
// Genel Açıklama + Kaynaklandırılmış Ana Metin TAM prose; Strateji / İmza /
// Kendilik Dışı Tema ise AYRI üç uzun bölüm yerine tek "Temel Göstergeler"
// başlığı altında etiketli toplanır. Canonical metin TAM korunur (kısaltma/AI/silme
// YOK) — yalnız SUNUM konsolide edilir → aynı konunun "ikinci kez uzun bölüm" hissi
// kalkar. (5-Tip audit: strategy/signature/not_self, general_description+report_text
// içinde BİREBİR bulunmuyor → benzersiz prose; §8 gereği KORUNUR, omit EDİLMEZ.)
const TYPE_MAIN_ORDER: readonly ContentFieldKey[] = ["general_description", "report_text"];
const TYPE_INDICATOR_ORDER: readonly ContentFieldKey[] = ["strategy_text", "signature_text", "not_self_text"];

function renderTypeIdentity(section: FrozenIdentitySection | null, omitted?: FrozenOmittedSection | null): ReportChild[] {
  if (!section && omitted) {
    return [h2(`${t("v1.type")} — ${omittedName(omitted)}`, { keepNext: true }), bodyText(t("v1.unpublished"))];
  }
  if (!section) {
    // Chart'ta tip yok → sade empty-state (canonical-unpublished mesajı DEĞİL; §24/§57).
    return [h2(t("v1.type"), { keepNext: true }), bodyText(t("v1.noType"))];
  }
  const out: ReportChild[] = [
    h2(`${t("v1.type")} — ${typeName(section)}`, { keepNext: true }),
    ...renderContentFields(section.content, TYPE_MAIN_ORDER),
  ];
  const indicators = composeFields(section.content, TYPE_INDICATOR_ORDER);
  if (indicators.length > 0) {
    out.push(h3(t("v1.indicators"), { keepNext: true }));
    for (const f of indicators) {
      out.push(inProseHeading(isEn() ? t(`field.${f.key}`) : f.label, 3)); // koyu etiket (Word heading STİLİ değil → nav/TOC kirlenmez)
      out.push(...renderProse(f.value));
    }
  }
  return out;
}

// ── Ana belge çocukları ─────────────────────────────────────────────────────────
export type WordReportOptions = {
  /** Ownership-safe, önceden doğrulanmış BodyGraph görseli (JPG/PNG buffer). */
  chartImage?: Buffer | null;
  /** Raporu hazırlayan uzmanın görünen adı ("Hazırlayan: …"; yoksa satır eklenmez). */
  expertName?: string | null;
  /** Çıktı dili (route: resolveOutputLocale). Yoksa / TR → bugünkü Türkçe çıktı birebir. */
  output?: OutputLocale | null;
};

export function buildHdReportChildren(
  snapshot: HdReportSnapshot,
  opts: WordReportOptions = {},
): ReportChild[] {
  return withText(opts.output, () => buildChildrenInner(snapshot, opts));
}

function buildChildrenInner(snapshot: HdReportSnapshot, opts: WordReportOptions): ReportChild[] {
  const children: ReportChild[] = [];
  const clientName = (snapshot.client.name || t("brand.clientFallback")).trim();
  // generatedAt bir AN (timestamptz) → Europe/Istanbul yerel günü (UTC sunucuda kayma yok).
  const genDate = formatInstantDate(snapshot.generatedAt, { style: "long", fallback: "—", ...dateOpts() });
  const omitted = snapshot.provenance.omitted ?? [];
  const omittedOf = (kind: FrozenOmittedSection["kind"]) => omitted.find((o) => o.kind === kind) ?? null;

  // 1) KAPAK
  children.push(
    ...buildPremiumCover({
      title1: t("v1.coverBrand"),
      title2: "Human Design",
      subtitle: t("v1.coverSubtitle"),
      date: genDate,
      stats: [{ label: t("v1.coverClient"), value: clientName }],
    }),
  );

  // 2) DANIŞAN / HARİTA BİLGİLERİ (teknik UUID YOK). İÇİNDEKİLER kullanıcı kararıyla
  //    tamamen kaldırıldı; kapaktan sonra doğrudan bu bölüm gelir (Word heading yapısı korunur).
  children.push(h1(t("v1.infoTitle"), true));
  const infoRows: [string, string][] = [[t("v1.client"), clientName]];
  // Doğum tarihi takvim günüdür (DATE) → saat dilimiyle ASLA kaydırılmaz.
  if (snapshot.client.birthDate) {
    infoRows.push([
      t("v1.birthDate"),
      formatDateOnly(snapshot.client.birthDate, { style: "long", ...dateOpts() }) || formatDateLoose(snapshot.client.birthDate, { style: "long", ...dateOpts() }),
    ]);
  }
  if (snapshot.client.birthTime) infoRows.push([t("v1.birthTime"), String(snapshot.client.birthTime)]);
  if (snapshot.client.birthPlace) infoRows.push([t("v1.birthPlace"), String(snapshot.client.birthPlace)]);
  infoRows.push([t("v1.source"), snapshot.chart.source === "computed" ? t("v1.sourceComputed") : t("v1.sourceManual")]);
  if (snapshot.chart.profileLabel) infoRows.push([t("v1.profile"), isEn() ? hdEn.profile(snapshot.chart.profileLabel) ?? snapshot.chart.profileLabel : snapshot.chart.profileLabel]);
  if (snapshot.chart.definitionLabel) infoRows.push([t("v1.definition"), isEn() ? hdEn.definition(snapshot.chart.definitionLabel) ?? snapshot.chart.definitionLabel : snapshot.chart.definitionLabel]);
  if (snapshot.chart.definedCenterLabels && snapshot.chart.definedCenterLabels.length > 0) {
    const names = isEn() ? snapshot.chart.definedCenterLabels.map((l) => hdEn.center(hdEn.centerCode(l)) ?? l) : snapshot.chart.definedCenterLabels;
    infoRows.push([t("v1.definedCenters"), names.join(", ")]);
  }
  infoRows.push([t("v1.reportDate"), genDate]);
  children.push(twoColTable(infoRows));

  // Opsiyonel, ownership-safe BodyGraph görseli (varsa; yoksa rapor görselsiz devam eder).
  // Büyütülmüş sunum: en fazla 540px genişlik (A4 basılabilir alan içi), 660px yükseklik
  // sınırı → portre görsellerde aspect-ratio korunur, sayfa taşmaz, bilgi tablosuyla aynı
  // sayfada dengeli kalır (natural boyuttan asla büyütülmez).
  if (opts.chartImage && getImgDimensions(opts.chartImage)) {
    children.push(spacer());
    children.push(embedImageParagraph(opts.chartImage, 540, 660));
    children.push(muted(t("v1.imageCaption")));
  }

  // 3) TEMEL HUMAN DESIGN KİMLİĞİ
  children.push(h1(t("v1.identityTitle"), true));
  // Diğer dillerde: bilgi bankası metinleri Türkçe yayımlanmıştır (çevrilmez) — açık not.
  if (isEn()) children.push(muted(t("v1.contentNote")));
  children.push(...renderTypeIdentity(snapshot.identity.type, omittedOf("tip")));
  children.push(...renderIdentity(snapshot.identity.authority, t("v1.authority"), AUTHORITY_FIELD_ORDER, t("v1.noAuthority"), omittedOf("otorite")));

  // 4) TANIMLI KANALLAR
  children.push(h1(t("v1.channelsTitle"), true));
  if (snapshot.channels.length === 0) {
    children.push(bodyText(t("v1.noChannels")));
  } else {
    for (const c of snapshot.channels) {
      children.push(h2(t("v1.channelHeading", { name: channelName(c.code, c.displayName) }), { keepNext: true }));
      children.push(muted(t("v1.channelGates", { a: c.gates[0], b: c.gates[1] })));
      children.push(...renderContentFields(c.content, CHANNEL_FIELD_ORDER));
    }
  }

  // 5) AKTİF / BAĞIMSIZ KAPILAR
  children.push(h1(t("v1.gatesTitle"), true));
  if (snapshot.gates.length === 0) {
    children.push(bodyText(t("v1.noGates")));
  } else {
    for (const g of snapshot.gates) {
      children.push(h2(isEn() ? t("v1.gate", { n: g.gate }) : g.displayName, { keepNext: true }));
      children.push(...renderContentFields(g.content, GATE_FIELD_ORDER));
    }
  }

  // 6) ASILI KAPI BAĞLAMLARI (kanal içeriğinden; potansiyel kanal başına ayrı)
  children.push(h1(t("v1.hangingTitle"), true));
  if (snapshot.hangingContexts.length === 0) {
    children.push(bodyText(t("v1.noHanging")));
  } else {
    for (const hg of snapshot.hangingContexts) {
      children.push(h2(isEn() ? t("v1.gate", { n: hg.gate }) : hg.displayName, { keepNext: true }));
      for (const p of hg.potentials) {
        children.push(h3(t("v1.hangingHeading", { name: channelName(p.code, p.displayName) }), { keepNext: true }));
        children.push(...renderProse(p.hangingContext));
      }
    }
  }

  // 6b) Uzman modunda yayımlanmamış olduğu için atlanan kanal/kapı bölümleri (anahtar YOK).
  const omittedBody = omitted.filter((o) => o.kind === "kanal" || o.kind === "kapi");
  if (omittedBody.length > 0) {
    children.push(spacer());
    children.push(
      muted(t("v1.omitted", { list: omittedBody.map((o) => omittedName(o)).join(", ") })),
    );
  }

  // 7) SADE KURUMSAL KAPANIŞ (AI sentezi YOK; §22)
  children.push(divider());
  children.push(
    muted(t("v1.closing", { date: genDate })),
  );
  // FA-16: sade bilgilendirme notu + "Hazırlayan: …" (varsa). TR → ortak motor; diğer dillerde HD katalogu (#855 öncesi).
  children.push(...(isEn() ? hdWellnessNoteSection(X, opts.expertName ?? null) : buildWellnessNoteSection("human_design", opts.expertName ?? null)));

  return children;
}

/** Snapshot → docx Document (SAF; DB/auth yok). */
export function buildHdReportDocument(snapshot: HdReportSnapshot, opts: WordReportOptions = {}): Document {
  return withText(opts.output, () => {
    const reportName = t("brand.reportNameV1");
    return new Document({
      creator: t("brand.creator"),
      title: hdReportTitle(snapshot.client.name, opts.output),
      // Belge dili (w:lang) YALNIZ TR dışında (TR belgede `styles` hiç yok → bugünkü XML aynen).
      ...(isEn() ? { styles: { default: { document: { run: hdDocLanguage(X) } } } } : {}),
      sections: [
        {
          properties: {},
          headers: { default: buildHeader(t("brand.header")) },
          footers: { default: isEn() ? new Footer({ children: hdFooterChildren(X, reportName) }) : buildFooter(reportName) },
          children: buildChildrenInner(snapshot, opts),
        },
      ],
    });
  });
}

/** Snapshot → DOCX buffer (in-memory Packer; §45). */
export async function renderHdReportBuffer(snapshot: HdReportSnapshot, opts: WordReportOptions = {}): Promise<Buffer> {
  const doc = buildHdReportDocument(snapshot, opts);
  return Packer.toBuffer(doc);
}

// ── Başlık / dosya adı (güvenli; §41) ────────────────────────────────────────────
const TR_MAP: Record<string, string> = {
  ğ: "g", Ğ: "G", ü: "u", Ü: "U", ş: "s", Ş: "S",
  ı: "i", İ: "I", ö: "o", Ö: "O", ç: "c", Ç: "C",
};

export function hdReportTitle(clientName: string | null | undefined, output?: OutputLocale | null): string {
  const name = (clientName ?? "").trim();
  const x = hdReportText(output ?? null);
  return name ? x.t("brand.docTitleV1", { name }) : x.t("brand.docTitleV1Empty");
}

/**
 * Güvenli dosya adı: TR transliterasyon → yalnız [A-Za-z0-9-], çoklu tire sadeleştirme,
 * uzunluk sınırı. Path traversal / CRLF / tırnak / kontrol karakteri KALMAZ (§41).
 */
export function hdReportFilename(clientName: string | null | undefined, dateSlug: string, output?: OutputLocale | null): string {
  const raw = (clientName ?? "").trim();
  const ascii = raw
    .split("")
    .map((ch) => TR_MAP[ch] ?? ch)
    .join("");
  let slug = ascii
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  if (!slug) slug = hdReportText(output ?? null).t("brand.fileClientFallback");
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dateSlug) ? dateSlug : "0000-00-00";
  return `Human-Design-${slug}-${safeDate}.docx`;
}
