/**
 * HD AŞAMA 4B — Profesyonel Word/DOCX v2 · SAF BELGE KURUCUSU (hd-report-2)
 * =========================================================================
 *
 * Girdi: DONMUŞ HdReportSnapshotV2 (+ indirme anında uygulanmış yetki filtresi). Çıktı: docx
 * Document / Buffer. DB / auth / ağ YOK — görseller (BodyGraph, logo) hazır Buffer olarak gelir.
 * Mevcut lib/docx/reportHelpers toolkit'i ve v1'in SAF prose dönüştürücüsü REUSE edilir.
 *
 * İki düzen: snapshot.layout === "pro-1" → profesyonel düzen (aşağıda, yeni raporlar); layout YOK →
 * eski kayıtlı raporların düzeni AYNEN (eski Word'ler değişmez). Eski düzenin bölüm sırası:
 * Kapak → Danışan ve Harita Kimliği → BodyGraph → Design / Personality →
 * Merkezler → Kanallar → Kapılar → Uzman Bilgilerim (varsa) → Sistem Yorumu (varsa) →
 * Kaynak Bilgisi. Boş bölüm OLUŞTURULMAZ. Uzman içeriği ile Sistem Yorumu AYRI başlık ve
 * kaynak etiketi taşır; birbirine karışmaz.
 */

import { HD_CENTER_STATE_LABEL, type HdCenterState } from "@/lib/human-design/chart/centerStates";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeightRule,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import {
  buildFooter,
  buildHeader,
  buildWellnessNoteSection,
  bodyText as baseBodyText,
  calloutBox,
  divider,
  embedImageParagraph,
  getImgDimensions,
  h1 as baseH1,
  h2 as baseH2,
  h3 as baseH3,
  muted as baseMuted,
  twoColTable as baseTwoColTable,
  REPORT_FONT,
  C_DARK,
  C_LIGHT,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { formatDateOnly, formatDateLoose, formatInstantDate } from "@/lib/time/reportTime";
import { expertCredentialLines, expertLogoParagraph, type ExpertBranding, type ExpertBrandingVariant } from "@/lib/docx/expertBranding";
import {
  planetLabelTr,
  type FrozenActivation,
  type FrozenExpertEntry,
  type HdReportSnapshotV2,
} from "./reportSnapshotV2";
import {
  harmonizeSystemReading,
  type SystemReadingDetail,
  type SystemReadingDto,
  type SystemReadingLabels,
} from "@/lib/human-design/providers/roxy/systemReading";
import { HD_SIGNATURE_HELP, HD_TERM, HD_TERM_BI, hdTypeKeynotes } from "@/lib/human-design/normalize/hdDisplayLabels";
import { toAppTypeCode } from "@/lib/human-design/normalize/hdAppCodes";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "./xmlSafeText";
import { toPlanetName } from "@/lib/human-design/providers/roxy/normalize";
import { HUMAN_DESIGN_GATES, HUMAN_DESIGN_TYPES } from "@/lib/human-design/constants";
import { GATE_TECHNICAL_DATA } from "@/lib/human-design/gateTechnicalData";
import { crossThemeNames } from "@/lib/human-design/reporting/crossThemeTr";
import type { OutputLocale } from "@/lib/i18n/output";
import {
  hdDocLanguage,
  hdEn,
  hdFooterChildren,
  hdReportText,
  hdWellnessNoteSection,
  localizeSystemReadingEn,
  type HdReportText,
} from "./reportText";
import enReading from "@/messages/en/hd.reading.json";

export const HD_REPORT_SITE = "yasamsistemi.com";

/** P31 çıktı dili desteği (golden harness bu işareti okur). */
export const HD_REPORT_OUTPUT_SUPPORTED = true;

// ── Çıktı dili (I18N-F1-R5 HD-B) ────────────────────────────────────────────────
// Kurucular SENKRON çalışır (await yok) → dil, belge kurulurken modül düzeyinde tutulur ve kurulum bitince
// geri alınır (`withText`); istekler arası karışma yok. İleride kurucuya await eklenirse parametre geçişine çevrilmeli.
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
/** Görünen gezegen adı: TR uygulama sözlüğü (bugünkü çıktı) / diğer dillerde hd.terms. */
const planetLabel = (p: Parameters<typeof planetLabelTr>[0]) => (isEn() ? hdEn.planet(p) : planetLabelTr(p));
const centerStateLabel = (st: HdCenterState) => (isEn() ? hdEn.centerState(st) : HD_CENTER_STATE_LABEL[st]);
const SIGNATURE_HELP_EN = (enReading as unknown as { hd: { reading: { signatureHelp: string } } }).hd.reading.signatureHelp;
/** Donmuş kimlik değerleri: TR → snapshot etiketi AYNEN; diğer dillerde koddan. */
function idType(s: HdReportSnapshotV2): string | null {
  return isEn() ? hdEn.type(s.identity.type) : s.identity.type;
}
function idProfile(s: HdReportSnapshotV2): string | null {
  return isEn() ? hdEn.profile(s.identity.profile) : s.identity.profile;
}
function idAuthority(s: HdReportSnapshotV2): string | null {
  return isEn() ? hdEn.authority(s.identity.authority, s.identity.type) : s.identity.authority;
}
function idDefinition(s: HdReportSnapshotV2): string | null {
  return isEn() ? hdEn.definition(s.identity.definition) : s.identity.definition;
}
/** Haç adı: "<Açı> (yalnız kapılar)" sistem metni diğer dillerde; sağlayıcı adı aynen. */
function crossName(name: string): string {
  if (!isEn()) return name;
  const m = /^(.*) \(yalnız kapılar\)$/.exec(name);
  return m ? t("crossGatesOnly", { angle: hdEn.angle(m[1]) ?? m[1] }) : name;
}
const crossAngle = (a: string) => (isEn() ? hdEn.angle(a) ?? a : a);
const centerLabel = (c: { code: string; label: string }) => (isEn() ? hdEn.center(c.code) ?? c.label : c.label);
const channelLabel = (c: { code: string; label: string }) => (isEn() ? hdEn.channelLabel(c.label, c.code) : c.label);
const gateLabel = (g: { gate: number; label: string }) => (isEn() ? t("gateN", { n: g.gate }) : g.label);
const categoryLabel = (c: string) => (isEn() ? hdEn.category(c) : c);
const SR_EN_NOT_SELF_Q = () => (enReading as unknown as { hd: { reading: Record<string, string> } }).hd.reading.notSelfQuestion ?? "Not-self question";

/** A4 (twip) + 2 cm kenar boşluğu → basılabilir genişlik ≈ 16,7 cm. */
const A4 = { width: 11906, height: 16838 } as const;
const MARGIN = 1134;
/** BodyGraph: basılabilir alan içinde, başlıkla aynı sayfaya sığan en büyük boyut (px @96dpi). */
export const HD_BODYGRAPH_DOC_MAX = { width: 600, height: 800 } as const;

const SIDE_TR = { design: "Design", personality: "Personality" } as const;

export type WordReportV2Options = {
  /** Sunucuda doğrulanmış BodyGraph görseli (PNG/JPG buffer). */
  bodygraphImage?: Buffer | null;
  /** Yaşam Sistemi logosu (şeffaf PNG). */
  logo?: Buffer | null;
  expertName?: string | null;
  /** İndirme anında Sistem Yorumu güncel yetki nedeniyle çıkarıldı mı? */
  systemReadingRedacted?: boolean;
  /**
   * F3A: uzman rapor markalaması. Owner kararı: "Hazırlayan" serbest metindir (snapshot.preparedBy);
   * profil adı OTOMATİK yazılmaz. Markalama YALNIZ pro-1 imza kartına ve YALNIZ preparedBy doluysa
   * unvan / kurum / küçük logo ekler; kapak, eski düzen ve alt bilgi değişmez. null/yok → birebir.
   * Veri kaynağı F1/F2 ile bağlanacak; route şimdilik null geçer.
   */
  branding?: ExpertBranding | null;
  /** Yalnız örnek/test üretimi için tasarım varyantı. */
  brandingVariant?: ExpertBrandingVariant;
  /** Çıktı dili (route: resolveOutputLocale). Yoksa / TR → bugünkü Türkçe çıktı birebir. */
  output?: OutputLocale | null;
};

// ── HD-09: XML 1.0 güvenli başlık/metin yardımcıları ─────────────────────────────
// Ortak reportHelpers başlıkları metni temizlemez; HD raporundaki HER metin buradan geçer
// (Bilgi Bankası başlığı, kategori, danışan adı, belge başlığı…). Eski donmuş snapshot'lar da
// render anında temizlenir → daha önce bozuk kaydedilmiş bir rapor bile açılabilir iner.
type HeadingOpts = Parameters<typeof baseH2>[1];
const h1 = (text: string, pageBreak = false) => baseH1(hdXmlSafeLine(text), pageBreak);
const h2 = (text: string, o?: HeadingOpts) => baseH2(hdXmlSafeLine(text), o);
const h3 = (text: string, o?: HeadingOpts) => baseH3(hdXmlSafeLine(text), o);
const muted = (text: string) => baseMuted(hdXmlSafeLine(text));
const bodyText = (text: string) => baseBodyText(hdXmlSafeLine(text));
const twoColTable = (rows: [string, string][]) => baseTwoColTable(rows.map(([a, b]) => [hdXmlSafeLine(a), hdXmlSafeLine(b)]));

/** HD-03: kapının ait olduğu TÜM tanımlı kanallar. Eski snapshot'ta (yalnız `channel`) donmuş kanal listesinden türetilir. */
export function gateChannelCodes(s: HdReportSnapshotV2, g: HdReportSnapshotV2["gates"][number]): string[] {
  if (Array.isArray(g.channels)) return g.channels;
  return s.channels.filter((c) => c.gates.includes(g.gate)).map((c) => c.code);
}

/**
 * Donmuş tip ETİKETİ → tip kodu. Eski raporlar İngilizce ("Projector"), yenileri Türkçe + parantez
 * ("Projektör (Projector)") etiket taşır; ikisi de aynı koda iner.
 */
function typeCodeFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const exact = HUMAN_DESIGN_TYPES.find((t) => t.label === label)?.code;
  if (exact) return exact;
  const inParens = /\(([^()]+)\)\s*$/.exec(label)?.[1];
  return toAppTypeCode(label) ?? (inParens ? toAppTypeCode(inParens) : null);
}

/** 2026-10-17: Türkçe + (İngilizce) terim seti yalnız bu işareti taşıyan (yeni) snapshot'larda. */
const isBilingual = (s: HdReportSnapshotV2) => s.termSet === "tr-en";
/** Kavram başlıkları: yeni rapor → "Tip (Type)"; eski rapor → eski tek dilli başlıklar (çıktı birebir). */
function termsOf(s: HdReportSnapshotV2): Record<keyof typeof HD_TERM_BI, string> {
  if (isEn()) {
    const out = {} as Record<keyof typeof HD_TERM_BI, string>;
    for (const k of Object.keys(HD_TERM_BI) as (keyof typeof HD_TERM_BI)[]) out[k] = hdEn.title(k);
    return out;
  }
  return isBilingual(s) ? { ...HD_TERM_BI } : { ...HD_TERM, cross: "Enkarnasyon Haçı" };
}

/** HD-04: Strateji / İmza / Kendilik Dışı Tema — snapshot'ta donmuşsa o, yoksa (eski rapor) tipten. */
export function identityKeynotes(s: HdReportSnapshotV2): { strategy: string | null; signature: string | null; notSelf: string | null } {
  if (isEn()) {
    return {
      strategy: hdEn.keynote("strategy", s.identity.type),
      signature: hdEn.keynote("signature", s.identity.type),
      notSelf: hdEn.keynote("notSelf", s.identity.type),
    };
  }
  const derived = hdTypeKeynotes(typeCodeFromLabel(s.identity.type), { bilingual: isBilingual(s) });
  return {
    strategy: s.identity.strategy ?? derived?.strategy ?? null,
    signature: s.identity.signature ?? derived?.signature ?? null,
    notSelf: s.identity.notSelf ?? derived?.notSelf ?? null,
  };
}

/** Sistem Yorumu Word'e basılırken rapordaki etiketlerle aynı adlar kullanılır (HD-05/06/23). */
function harmonizedReading(s: HdReportSnapshotV2, reading: SystemReadingDto | null): SystemReadingDto | null {
  if (!reading) return null;
  const k = identityKeynotes(s);
  const labels: SystemReadingLabels = {
    type: s.identity.type,
    authority: s.identity.authority,
    definition: s.identity.definition,
    strategy: k.strategy,
    signature: k.signature,
    notSelf: k.notSelf,
  };
  const harmonized = harmonizeSystemReading(reading, labels, { bilingual: isBilingual(s) });
  if (!isEn()) return harmonized;
  // Diğer dillerde: SİSTEM etiketleri koddan; sağlayıcı anlatısı kayıttaki dilde AYNEN (KISMİ).
  return localizeSystemReadingEn(harmonized, {
    type: idType(s),
    authority: idAuthority(s),
    definition: idDefinition(s),
    profile: null,
    strategy: k.strategy,
    signature: k.signature,
    notSelf: k.notSelf,
  });
}

// ── Küçük yardımcılar ────────────────────────────────────────────────────────────
function run(text: string, o: { size?: number; bold?: boolean; color?: string; italics?: boolean; allCaps?: boolean } = {}): TextRun {
  return new TextRun({
    text: hdXmlSafeLine(text),
    font: REPORT_FONT,
    size: o.size ?? 22,
    bold: o.bold,
    italics: o.italics,
    allCaps: o.allCaps,
    color: o.color ?? C_MID,
  });
}

function centered(text: string, o: Parameters<typeof run>[1] & { before?: number; after?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: o.before ?? 0, after: o.after ?? 120 },
    children: [run(text, o)],
  });
}

function labelLine(label: string): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 140, after: 60 },
    children: [run(label, { bold: true, size: 21, color: C_DARK })],
  });
}

/**
 * Düz metin → paragraflar (YORUMLANMAZ: markdown/liste dönüşümü YOK, metin aynen korunur).
 * Boş satır = yeni paragraf; tek satır sonu = aynı paragrafta satır sonu (uygulamadaki
 * whitespace-pre-wrap görünümüyle aynı).
 */
function plainParagraphs(text: string): Paragraph[] {
  return hdXmlSafeMultiline(text)
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 120, line: 300 },
          widowControl: true,
          children: p.split("\n").map(
            (line, i) =>
              new TextRun({ text: line, break: i > 0 ? 1 : undefined, font: REPORT_FONT, size: 22, color: C_MID }),
          ),
        }),
    );
}

/** Sağlayıcı gezegen etiketi Türkçe değilse (ör. "Pluto") uygulama sözlüğüyle Türkçeleştir. */
function systemPlanetLabel(raw: string | null): string {
  if (!raw) return "—";
  const p = toPlanetName(raw);
  return p ? planetLabel(p) : raw;
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: "e2e8f0" } as const;

/**
 * Okunaklı veri tablosu: başlık satırı her sayfada tekrar eder, satırlar bölünmez, hücreler
 * çok satır (string[]) taşıyabilir. Genişlikler yüzde; tablo sayfa genişliğini aşmaz.
 */
function dataTable(headers: string[], widthsPct: number[], rows: (string | string[])[][]): Table {
  const cell = (content: string | string[], i: number, header: boolean) =>
    new TableCell({
      width: { size: widthsPct[i], type: WidthType.PERCENTAGE },
      shading: header ? { fill: "f1f5f9" } : undefined,
      borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
      children: (Array.isArray(content) ? (content.length ? content : [""]) : [content]).map(
        (line) =>
          new Paragraph({
            keepNext: header,
            spacing: { before: 60, after: 60 },
            indent: { left: 100, right: 60 },
            children: [run(line, header ? { bold: true, size: 20, color: C_DARK } : { size: 20 })],
          }),
      ),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

function scaledImage(buf: Buffer, maxW: number, maxH: number): Paragraph {
  const d = getImgDimensions(buf);
  if (!d) return embedImageParagraph(buf, maxW, maxH);
  // Yüksek çözünürlüklü kaynak: doküman boyutu sınırlar içinde KÜÇÜLTÜLÜR (piksel verisi korunur
  // → baskıda net). Oran bozulmaz; kaynak küçükse büyütülmez.
  const scale = Math.min(1, maxW / d.w, maxH / d.h);
  const w = Math.round(d.w * scale);
  const h = Math.round(d.h * scale);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 120, after: 120 },
    children: [new ImageRun({ data: buf, transformation: { width: w, height: h }, type: buf[0] === 0x89 ? "png" : "jpg" })],
  });
}

// ── 1) Kapak ────────────────────────────────────────────────────────────────────
function buildCover(s: HdReportSnapshotV2, genDate: string, logo: Buffer | null): ReportChild[] {
  const out: ReportChild[] = [new Paragraph({ spacing: { before: 600 } })];
  if (logo && getImgDimensions(logo)) out.push(scaledImage(logo, 240, 180));
  out.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "cbd5e1" } },
      spacing: { before: 360, after: 480 },
    }),
    centered(t("cover.brand"), { size: 56, bold: true, color: C_DARK, after: 160 }),
    centered(t("cover.hd"), { size: 40, color: C_MID, after: 120 }),
    centered(t("cover.subtitle"), { size: 26, color: C_LIGHT, after: 720 }),
    centered(s.client.name, { size: 36, bold: true, color: C_DARK, after: 200 }),
    centered(t("cover.date", { date: genDate }), { size: 22, after: 1400 }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "cbd5e1" } },
      spacing: { before: 0, after: 200 },
    }),
    centered(HD_REPORT_SITE, { size: 22, color: C_MID, after: 0 }),
  );
  return out;
}

// ── 2) Kimlik ───────────────────────────────────────────────────────────────────
function buildIdentity(s: HdReportSnapshotV2, genDate: string): ReportChild[] {
  const rows: [string, string][] = [[t("identity.name"), s.client.name]];
  if (s.client.birthDate) {
    rows.push([t("identity.birthDate"), formatDateOnly(s.client.birthDate, { style: "long", ...dateOpts() }) || formatDateLoose(s.client.birthDate, { style: "long", ...dateOpts() })]);
  }
  if (s.client.birthTime) rows.push([t("identity.birthTimeLocal"), s.client.birthTime]);
  if (s.client.birthPlace) rows.push([t("identity.birthPlace"), s.client.birthPlace]);
  if (s.client.timezone) rows.push([t("identity.timezone"), s.client.timezone]);
  const T = termsOf(s);
  const type = idType(s);
  const profile = idProfile(s);
  const authority = idAuthority(s);
  const definition = idDefinition(s);
  if (type) rows.push([T.type, type]);
  if (profile) rows.push([T.profile, profile]);
  if (authority) rows.push([T.authority, authority]);
  if (definition) rows.push([T.definition, definition]);
  if (s.identity.cross) rows.push([T.cross, `${crossName(s.identity.cross.name)} · ${s.identity.cross.gates}`]);
  rows.push([t("identity.source"), s.chart.source === "computed" ? t("identity.sourceComputed") : t("identity.sourceManual")]);
  rows.push([t("identity.reportDate"), genDate]);
  // Gövde ayrı bölümde (yeni sayfa) başlar → burada ek sayfa sonu YOK (boş sayfa oluşmaz).
  return [h1(t("identity.title")), twoColTable(rows)];
}

// ── 3) BodyGraph ────────────────────────────────────────────────────────────────
function buildBodygraph(s: HdReportSnapshotV2, img: Buffer | null): ReportChild[] {
  const out: ReportChild[] = [h1(t("bodygraph.title"), true)];
  if (img && getImgDimensions(img)) {
    out.push(scaledImage(img, HD_BODYGRAPH_DOC_MAX.width, HD_BODYGRAPH_DOC_MAX.height));
    out.push(
      muted(
        s.bodygraph.status === "uploaded_image" ? t("bodygraph.captionUploaded") : t("bodygraph.captionRendered"),
      ),
    );
  } else {
    out.push(
      calloutBox(
        t("bodygraph.missingTitle"),
        t("bodygraph.missingBody"),
        "b45309",
        "fffbeb",
      ),
    );
  }
  return out;
}

// ── 4) Design / Personality ─────────────────────────────────────────────────────
function activationRows(list: FrozenActivation[]): string[][] {
  return list.map((a) => [planetLabel(a.planet), `${a.gate}.${a.line}`]);
}

function buildActivations(s: HdReportSnapshotV2): ReportChild[] {
  if (s.activations.status === "unavailable") return []; // manuel kayıt: bölüm yok
  const out: ReportChild[] = [h1(t("activations.title"), true)];
  if (s.activations.status === "invalid") {
    out.push(bodyText(t("activations.invalid")));
    return out;
  }
  out.push(muted(t("activations.format")));
  out.push(h2(t("activations.designHeading"), { keepNext: true }));
  out.push(dataTable([t("activations.colPlanet"), t("activations.colGateLine")], [60, 40], activationRows(s.activations.design)));
  out.push(h2(t("activations.personalityHeading"), { keepNext: true }));
  out.push(dataTable([t("activations.colPlanet"), t("activations.colGateLine")], [60, 40], activationRows(s.activations.personality)));
  return out;
}

// ── 5–7) Merkezler / Kanallar / Kapılar ──────────────────────────────────────────
type SnapshotCenter = HdReportSnapshotV2["centers"][number];
/** Snapshot HD-UZMAN-01 üçlü merkez durumunu taşıyor mu (yeni rapor)? */
function hasCenterStates(s: HdReportSnapshotV2): boolean {
  return s.centers.length > 0 && s.centers.every((c) => c.state !== undefined);
}
function frozenState(c: SnapshotCenter): HdCenterState {
  return c.state ?? (c.defined ? "defined" : "unverified");
}
function centerStateSummary(s: HdReportSnapshotV2): string {
  const n = (st: HdCenterState) => s.centers.filter((c) => frozenState(c) === st).length;
  const parts = [t("centers.summaryDefined", { n: n("defined") }), t("centers.summaryUndefined", { n: n("undefined") }), t("centers.summaryOpen", { n: n("open") })];
  if (n("unverified") > 0) parts.push(t("centers.summaryUnverified", { n: n("unverified") }));
  return parts.join(" · ");
}

function buildCenters(s: HdReportSnapshotV2): ReportChild[] {
  if (s.centers.length === 0) return [];
  const defined = s.centers.filter((c) => c.defined).length;
  // HD-UZMAN-01: yeni snapshot üçlü durumu taşır; eski snapshot (state yok) çıktısı BİREBİR korunur.
  if (hasCenterStates(s)) {
    return [
      h1(t("centers.title"), true),
      muted(centerStateSummary(s)),
      dataTable([t("centers.colCenter"), t("centers.colState")], [65, 35], s.centers.map((c) => [centerLabel(c), centerStateLabel(frozenState(c))])),
    ];
  }
  return [
    h1(t("centers.title"), true),
    muted(t("centers.legacySummary", { defined, open: s.centers.length - defined })),
    dataTable([t("centers.colCenter"), t("centers.colState")], [65, 35], s.centers.map((c) => [centerLabel(c), c.defined ? t("centers.defined") : t("centers.open")])),
  ];
}

function buildChannels(s: HdReportSnapshotV2): ReportChild[] {
  if (s.channels.length === 0 && s.gates.length === 0) return [];
  const out: ReportChild[] = [h1(t("channels.title"))];
  if (s.channels.length === 0) {
    out.push(bodyText(t("channels.none")));
  } else {
    out.push(dataTable([t("channels.colChannel"), t("channels.colGates")], [70, 30], s.channels.map((c) => [channelLabel(c), `${c.gates[0]} – ${c.gates[1]}`])));
  }
  return out;
}

function buildGates(s: HdReportSnapshotV2): ReportChild[] {
  if (s.gates.length === 0) return [];
  const rows = s.gates.map((g) => [
    gateLabel(g),
    isEn() ? gateCenterLabel(g.center) : g.center ?? "—",
    g.activations.length
      ? g.activations.map((a) => `${SIDE_TR[a.side]} · ${planetLabel(a.planet)} · ${g.gate}.${a.line}`)
      : ["—"],
    gateChannelCodes(s, g).length ? gateChannelCodes(s, g) : ["—"],
  ]);
  return [
    h1(t("gates.title")),
    muted(t("gates.count", { n: s.gates.length })),
    dataTable([t("gates.colGate"), t("gates.colCenter"), t("gates.colActivation"), t("gates.colChannel")], [34, 18, 34, 14], rows),
  ];
}

// ── 8) Uzman Bilgilerim ─────────────────────────────────────────────────────────
function buildExpert(s: HdReportSnapshotV2): ReportChild[] {
  const { expert } = s.commentary;
  if (!expert.included || expert.entries.length === 0) return [];
  const out: ReportChild[] = [
    h1(t("expert.title"), true),
    muted(t("expert.source")),
  ];
  let current = "";
  for (const e of expert.entries as FrozenExpertEntry[]) {
    if (e.category !== current) {
      current = e.category;
      out.push(h2(categoryLabel(current), { keepNext: true }));
    }
    out.push(h3(e.title, { keepNext: true }));
    // Uzman metni AYNEN (kısaltma/markdown dönüşümü yok; numaralar, satırlar korunur).
    out.push(...plainParagraphs(e.content));
  }
  return out;
}

// ── 9) Sistem Yorumu ────────────────────────────────────────────────────────────
function detailBlocks(details: SystemReadingDetail[]): Paragraph[] {
  const out: Paragraph[] = [];
  for (const d of details) {
    out.push(labelLine(d.label));
    out.push(...plainParagraphs(d.text));
  }
  return out;
}

function buildSystem(reading: SystemReadingDto | null, o: { proCross?: boolean; flowAfterGates?: boolean } = {}): ReportChild[] {
  if (!reading) return [];
  const out: ReportChild[] = [
    // flowAfterGates (yalnız pro-1): zorunlu sayfa sonu yok; başlık zinciri (keepNext) ilk paragrafla birlikte kalır.
    h1(t("system.title"), !o.flowAfterGates),
    muted(t("system.source")),
  ];
  // Diğer dillerde: kayıtlı sağlayıcı anlatısı haritanın hesaplandığı dildedir (çevrilmez) — açık not.
  if (isEn()) out.push(muted(t("system.providerNote")));
  // BodyGraph 1. API tamamlama: yeni alanlar OPSİYONEL — eski snapshot'larda yoktur, eski çıktı aynen kalır.
  if (reading.languageNote) out.push(muted(reading.languageNote));

  const general = reading.general.filter((g) => g.value || g.details.length);
  if (general.length) {
    out.push(h2(t("system.general"), { keepNext: true }));
    for (const g of general) {
      if (o.proCross && g.key === "cross") {
        const v = g.value ? crossThemeNames(g.value, null) : null;
        // Diğer dillerde açıklayıcı Türkçe ad yok → yalnız özgün İngilizce ad.
        const head = v ? (isEn() ? `${t("system.crossHeading")}: ${v.en}` : t("system.crossHeadingNamed", { tr: v.tr, en: v.en })) : t("system.crossHeading");
        out.push(h3(head, { keepNext: g.details.length > 0 }));
      } else {
        out.push(h3(g.value ? `${g.title}: ${g.value}` : g.title, { keepNext: g.details.length > 0 }));
      }
      out.push(...detailBlocks(g.details));
    }
  }

  if (reading.sides && (reading.sides.personality || reading.sides.design || reading.sides.designUtc)) {
    out.push(h2(t("system.sides"), { keepNext: true }));
    out.push(
      ...detailBlocks(
        [
          reading.sides.personality ? { label: t("system.sidePersonality"), text: reading.sides.personality } : null,
          reading.sides.design ? { label: t("system.sideDesign"), text: reading.sides.design } : null,
          // Rapor kuralı (Q6): görünür raporda UTC anı yazılmaz → yalnız Design GÜNÜ (evrensel saate göre).
          reading.sides.designUtc ? { label: t("system.designDate"), text: t("system.designDateText", { day: reading.sides.designUtc.slice(0, 10).replace(/^(\d{2})\.(\d{2})\.(\d{4})$/, isEn() ? "$1/$2/$3" : "$1.$2.$3") }) } : null,
        ].filter((d): d is SystemReadingDetail => d !== null),
      ),
    );
  }

  const centers = reading.centers.filter((c) => c.theme || c.notSelfQuestion || c.biology);
  if (centers.length) {
    out.push(h2(t("system.centersHeading"), { keepNext: true }));
    // Yalnız tamamlanmış (yeni) içerik modelinde — eski snapshot çıktısı birebir kalır.
    if (centers.some((c) => c.motor !== undefined)) {
      out.push(muted(t("system.centersNote")));
    }
    for (const c of centers) {
      // Yeni DTO üçlü durumu taşır (state); eski snapshot'ta yok → eski çıktı birebir.
      const state = c.state ? ` — ${centerStateLabel(c.state)}` : c.defined === null ? "" : c.defined ? t("system.stateDefined") : t("system.stateOpen");
      const kind = [c.motor ? t("system.motor") : null, c.awareness ? t("system.awareness") : null].filter(Boolean).join(", ");
      out.push(h3(`${c.name}${state}${kind ? ` (${kind})` : ""}`, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            c.theme ? { label: t("system.theme"), text: c.theme } : null,
            c.notSelfQuestion ? { label: isEn() ? SR_EN_NOT_SELF_Q() : HD_TERM.notSelfQuestion, text: c.notSelfQuestion } : null,
            c.biology ? { label: t("system.biology"), text: c.biology } : null,
            c.gates ? { label: t("system.centerGates"), text: c.gates.length ? c.gates.join(", ") : t("system.centerNoGates") } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }

  const channels = reading.channels.filter((c) => c.description || c.circuitDescription);
  if (channels.length) {
    out.push(h2(t("system.channelsHeading"), { keepNext: true }));
    for (const c of channels) {
      const head = [c.id ? t("system.channelN", { id: c.id }) : t("system.channel"), c.name].filter(Boolean).join(" — ");
      out.push(h3(head, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            c.circuit ? { label: t("system.circuit"), text: c.circuit } : null,
            c.centers && c.centers.length === 2 ? { label: t("system.connects"), text: `${c.centers[0]} ↔ ${c.centers[1]}` } : null,
            c.description ? { label: t("system.description"), text: c.description } : null,
            c.circuitDescription ? { label: t("system.circuitDescription"), text: c.circuitDescription } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }

  const acts = reading.activations.filter((a) => a.gateDescription || a.lineMeaning || a.planetDescription);
  if (acts.length) {
    out.push(h2(t("system.actsHeading"), { keepNext: true }));
    for (const a of acts) {
      const head = `${SIDE_TR[a.side]} · ${systemPlanetLabel(a.planet)} · ${a.gate}.${a.line}${a.gateName ? ` — ${a.gateName}` : ""}`;
      out.push(h3(head, { keepNext: true }));
      out.push(
        ...detailBlocks(
          [
            a.gateDescription ? { label: t("system.gate"), text: a.gateDescription } : null,
            a.lineMeaning ? { label: t("system.line"), text: a.lineMeaning } : null,
            a.planetDescription ? { label: t("system.planet"), text: a.planetDescription } : null,
            a.iching ? { label: "I Ching", text: t("system.ichingText", { n: a.iching.number, name: a.iching.name }) } : null,
          ].filter((d): d is SystemReadingDetail => d !== null),
        ),
      );
    }
  }
  return out;
}

// ── 10) Kaynak bilgisi / kapanış ─────────────────────────────────────────────────
function buildClosing(s: HdReportSnapshotV2, genDate: string, opts: WordReportV2Options): ReportChild[] {
  const { expert, system } = s.commentary;
  const lines: string[] = [t("closing.technical")];
  if (expert.included) {
    lines.push(expert.entries.length ? t("closing.expertCount", { n: expert.entries.length }) : t("closing.expertNone"));
  }
  if (opts.systemReadingRedacted) {
    lines.push(t("closing.systemRedacted"));
  } else if (system.status === "included") {
    lines.push(t("closing.systemIncluded"));
  } else if (system.status === "unavailable") {
    lines.push(t("closing.systemUnavailable"));
  }
  if (s.bodygraph.status === "missing") lines.push(t("closing.bodygraphMissing"));
  lines.push(t("closing.frozen", { date: genDate }));
  lines.push(t("closing.noDiagnosis"));

  return [
    divider(),
    h2(t("closing.title"), { keepNext: true }),
    ...lines.map((l) => muted(l)),
    ...wellnessSection(opts.expertName ?? null),
  ];
}

// ── Belge ───────────────────────────────────────────────────────────────────────
/** Bilgilendirme notu: TR → ortak motor (bugünkü çıktı); diğer dillerde HD katalogundan aynı yapı (#855 öncesi). */
function wellnessSection(expertName: string | null): Paragraph[] {
  return isEn() ? hdWellnessNoteSection(X, expertName) : buildWellnessNoteSection("human_design", expertName);
}

export function buildHdReportV2Children(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): { cover: ReportChild[]; body: ReportChild[] } {
  return withText(opts.output, () => buildChildrenInner(s, opts));
}

function buildChildrenInner(s: HdReportSnapshotV2, opts: WordReportV2Options): { cover: ReportChild[]; body: ReportChild[] } {
  if (s.layout === "pro-1") return buildHdReportV2ProChildren(s, opts);
  const genDate = formatInstantDate(s.generatedAt, { style: "long", fallback: "—", ...dateOpts() });
  const reading = harmonizedReading(s, opts.systemReadingRedacted ? null : s.commentary.system.status === "included" ? s.commentary.system.reading : null);
  return {
    cover: buildCover(s, genDate, opts.logo ?? null),
    body: [
      ...buildIdentity(s, genDate),
      ...buildBodygraph(s, opts.bodygraphImage ?? null),
      ...buildActivations(s),
      ...buildCenters(s),
      ...buildChannels(s),
      ...buildGates(s),
      ...buildExpert(s),
      ...buildSystem(reading),
      ...buildClosing(s, genDate, opts),
    ],
  };
}

// ═════════════════════════════════════════════════════════════════════════════════
// PROFESYONEL DÜZEN "pro-1" (2026-10-09) — yalnız `layout: "pro-1"` taşıyan YENİ snapshot'lar.
// Eski kayıtlı raporlar (layout yok) yukarıdaki düzenle AYNEN üretilir.
//   • Sayfa 2: kimlik kartı (ad · doğum · HD özeti) + HEMEN ALTINDA BodyGraph:
//     Design (kırmızı) | BodyGraph | Personality (siyah) — 13 + 13 aktivasyon
//   • Sayfa 3: "ENKARNASYON TEMASI (YAŞAM AMACI)" (Türkçe ad "Haç"sız + özgün İngilizce ad)
//     + Merkezler 3×3 ızgara (Tanımlı ● / Açık ○) + Kanal satırları
//   • Kapı tablosu (çoklu aktivasyon korunur; başlık her sayfada tekrar eder)
//   • "Uzman Açıklamaları" / Sistem Yorumu AYRI bölümler · sade kapanış (teknik eşleşme notu YOK)
//   • "Hazırlayan" yalnız snapshot.preparedBy doluysa (profil adı otomatik yazılmaz)
// Tüm metin ve tablolar Word'de düzenlenebilir (yalnız BodyGraph görseldir).
// ═════════════════════════════════════════════════════════════════════════════════

const W = A4.width - 2 * MARGIN; // basılabilir genişlik (twip)
const PAL = {
  ink: "1e293b",
  mid: "475569",
  soft: "64748b",
  faint: "94a3b8",
  line: "e2e8f0",
  card: "f8fafc",
  accent: "3730a3",
  design: "b91c1c",
  personality: "111827",
  definedFill: "e0e7ff",
} as const;
const NO_LINE = { style: BorderStyle.NONE, size: 0, color: "ffffff" } as const;
const NO_BORDERS = { top: NO_LINE, bottom: NO_LINE, left: NO_LINE, right: NO_LINE } as const;
const THIN = (color: string = PAL.line) => ({ style: BorderStyle.SINGLE, size: 4, color });

type PRun = { text: string; size?: number; bold?: boolean; color?: string; italics?: boolean; allCaps?: boolean };
function pr(o: PRun): TextRun {
  return new TextRun({
    text: hdXmlSafeLine(o.text),
    font: REPORT_FONT,
    size: o.size ?? 20,
    bold: o.bold,
    italics: o.italics,
    allCaps: o.allCaps,
    color: o.color ?? PAL.mid,
  });
}
function pp(runs: PRun[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; keepNext?: boolean } = {}): Paragraph {
  return new Paragraph({
    alignment: o.align,
    keepNext: o.keepNext,
    spacing: { before: o.before ?? 0, after: o.after ?? 60 },
    children: runs.map(pr),
  });
}
function cardCell(children: (Paragraph | Table)[], width: number, o: { fill?: string; borders?: Record<string, unknown>; vAlign?: "top" | "center" | "bottom"; pad?: number } = {}): TableCell {
  const pad = o.pad ?? 140;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: o.fill ? { fill: o.fill, type: ShadingType.CLEAR, color: "auto" } : undefined,
    borders: (o.borders ?? NO_BORDERS) as never,
    verticalAlign: o.vAlign === "center" ? VerticalAlign.CENTER : o.vAlign === "bottom" ? VerticalAlign.BOTTOM : o.vAlign === "top" ? VerticalAlign.TOP : undefined,
    margins: { top: pad, bottom: pad, left: pad + 40, right: pad },
    children: children.length ? children : [new Paragraph({})],
  });
}
function fixedTable(widths: number[], rows: TableRow[]): Table {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: { ...NO_BORDERS, insideHorizontal: NO_LINE, insideVertical: NO_LINE } as never,
    rows,
  });
}
/** Küçük, büyük harfli bölüm etiketi (kart başlıkları). */
function capsLabel(text: string, color: string = PAL.accent): Paragraph {
  return pp([{ text, size: 16, bold: true, color, allCaps: true }], { after: 100, keepNext: true });
}
function kv(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { before: 0, after: 70 },
    keepLines: true,
    children: [pr({ text: `${label}  `, size: 17, color: PAL.soft }), pr({ text: value, size: 21, color: PAL.ink, bold: true })],
  });
}

// ── Merkez adları: tutarlı Türkçe + parantez içinde özgün terim ──
const CENTER_NAME: Record<string, { tr: string; en: string | null }> = {
  head: { tr: "Baş Merkezi", en: "Head" },
  ajna: { tr: "Ajna Merkezi", en: null },
  throat: { tr: "Boğaz Merkezi", en: "Throat" },
  g_identity: { tr: "G / Kimlik Merkezi", en: "G Center" },
  heart_ego: { tr: "Kalp / Ego Merkezi", en: "Heart" },
  spleen: { tr: "Dalak Merkezi", en: "Spleen" },
  solar_plexus: { tr: "Solar Pleksus Merkezi", en: "Solar Plexus" },
  sacral: { tr: "Sakral Merkez", en: "Sacral" },
  root: { tr: "Kök Merkezi", en: "Root" },
};
const CENTER_GRID: string[][] = [
  ["head", "ajna", "throat"],
  ["g_identity", "heart_ego", "spleen"],
  ["solar_plexus", "sacral", "root"],
];
/** gateTechnicalData merkez adı → merkez kodu (kapı tablosu da aynı adları kullansın). */
const GATE_CENTER_CODE: Record<string, string> = {
  Taç: "head", Zihin: "ajna", Boğaz: "throat", "Benlik G": "g_identity", "Kalp-İrade": "heart_ego",
  Dalak: "spleen", "Solar Pleksus": "solar_plexus", Sakral: "sacral", Kök: "root",
};
function centerShort(code: string | null | undefined): string {
  if (!code) return "—";
  if (isEn()) return code in CENTER_NAME ? t(`centerShort.${code}`) : code;
  const n = CENTER_NAME[code];
  return n ? n.tr.replace(/ Merkezi?$/, "") : code;
}
function gateCenterLabel(raw: string | null): string {
  if (!raw) return "—";
  const code = GATE_CENTER_CODE[raw];
  return code ? centerShort(code) : raw;
}
function gateName(gate: number): string | null {
  if (isEn()) return null; // 64 kapı EN ad sözlüğü yok → hazır Türkçe ad diğer dillerde basılmaz
  const l = HUMAN_DESIGN_GATES.find((g) => g.code === gate)?.label ?? null;
  return l ? l.replace(/^\s*\d+\s*[—-]\s*/, "").trim() || null : null;
}
function channelName(label: string, code: string): string {
  return label.replace(new RegExp(`^\\s*${code.replace("-", "[-–]")}\\s*`), "").trim() || label;
}

// ── P2) Danışan ve Harita Kimliği ──
function proIdentity(s: HdReportSnapshotV2, genDate: string): ReportChild[] {
  const out: ReportChild[] = [
    pp([{ text: t("pro.identityCaps"), size: 18, bold: true, color: PAL.accent, allCaps: true }], { after: 80 }),
    pp([{ text: s.client.name, size: 44, bold: true, color: PAL.ink }], { after: 40 }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.line } },
      spacing: { before: 0, after: 240 },
      children: [pr({ text: t("pro.reportName"), size: 20, color: PAL.soft })],
    }),
  ];
  const birth: Paragraph[] = [capsLabel(t("pro.birthCaps"))];
  if (s.client.birthDate) {
    birth.push(kv(t("identity.birthDate"), formatDateOnly(s.client.birthDate, { style: "long", ...dateOpts() }) || formatDateLoose(s.client.birthDate, { style: "long", ...dateOpts() })));
  }
  if (s.client.birthTime) birth.push(kv(t("identity.birthTimeLocal"), s.client.birthTime));
  if (s.client.birthPlace) birth.push(kv(t("identity.birthPlace"), s.client.birthPlace));
  if (s.client.timezone) birth.push(kv(t("identity.timezone"), s.client.timezone));
  const hd: Paragraph[] = [capsLabel(t("pro.hdSummaryCaps"))];
  const keynotes = identityKeynotes(s);
  const T = termsOf(s);
  const type = idType(s);
  const profile = idProfile(s);
  const authority = idAuthority(s);
  const definition = idDefinition(s);
  if (type) hd.push(kv(T.type, type));
  if (keynotes.strategy) hd.push(kv(T.strategy, keynotes.strategy));
  if (profile) hd.push(kv(T.profile, profile));
  if (authority) hd.push(kv(T.authority, authority));
  if (definition) hd.push(kv(T.definition, definition));
  if (keynotes.signature) hd.push(kv(T.signature, keynotes.signature));
  // Yeni raporda "İmza (Signature)" kısa açıklaması (ıslak imza / belge imzası ile karışmasın).
  if (keynotes.signature && isBilingual(s)) hd.push(muted(t("pro.signatureHelp", { label: T.signature, help: isEn() ? SIGNATURE_HELP_EN : HD_SIGNATURE_HELP })));
  if (keynotes.notSelf) hd.push(kv(T.notSelf, keynotes.notSelf));
  const gap = 240;
  const half = Math.floor((W - gap) / 2);
  out.push(
    fixedTable([half, gap, W - gap - half], [
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(birth, half, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } }),
          cardCell([], gap),
          cardCell(hd, W - gap - half, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } }),
        ],
      }),
    ]),
  );
  out.push(
    pp(
      [
        { text: t("pro.sourceLine", { source: s.chart.source === "computed" ? t("pro.sourceComputed") : t("pro.sourceManual") }), size: 16, color: PAL.faint },
        { text: t("pro.dateLine", { date: genDate }), size: 16, color: PAL.faint },
      ],
      { before: 200, after: 0 },
    ),
  );
  return out;
}

// ── P3) BodyGraph + Design / Personality (tek sayfa) ──
/** Orta sütun genişliği (twip) ve görselin azami boyutu (px @96dpi). */
const BG_COL = 5500;
const SIDE_COL = Math.floor((W - BG_COL) / 2);
export const HD_PRO_BODYGRAPH_PX = { width: Math.round((BG_COL - 100) / 15), height: 760 } as const; // 1 px = 15 twip

function activationColumn(side: "design" | "personality", list: FrozenActivation[]): Paragraph[] {
  const color = side === "design" ? PAL.design : PAL.personality;
  const head = side === "design" ? "DESIGN" : "PERSONALITY";
  const sub = side === "design" ? t("pro.designSub") : t("pro.personalitySub");
  const out: Paragraph[] = [
    pp([{ text: head, size: 22, bold: true, color }], { align: AlignmentType.CENTER, after: 0, keepNext: true }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color } },
      spacing: { before: 0, after: 120 },
      keepNext: true,
      children: [pr({ text: sub, size: 16, color: PAL.soft })],
    }),
  ];
  for (const a of list) {
    out.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: SIDE_COL - 200 }],
        spacing: { before: 0, after: 0, line: 330 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: PAL.line } },
        keepLines: true,
        children: [pr({ text: planetLabel(a.planet), size: 17, color: PAL.mid }), pr({ text: `\t${a.gate}.${a.line}`, size: 21, bold: true, color })],
      }),
    );
  }
  out.push(pp([{ text: t("pro.activationCount", { n: list.length }), size: 15, color: PAL.faint }], { align: AlignmentType.CENTER, before: 80, after: 0 }));
  return out;
}

function bodygraphCell(s: HdReportSnapshotV2, img: Buffer | null): (Paragraph | Table)[] {
  const d = img ? getImgDimensions(img) : null;
  if (img && d) {
    const scale = Math.min(HD_PRO_BODYGRAPH_PX.width / d.w, HD_PRO_BODYGRAPH_PX.height / d.h);
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new ImageRun({ data: img, transformation: { width: Math.round(d.w * scale), height: Math.round(d.h * scale) }, type: img[0] === 0x89 ? "png" : "jpg" })],
      }),
      // Yalnız yüklenmiş harita görselinde kaynak notu (kayıtlı haritadan üretilen BodyGraph'ta açıklama YOK).
      ...(s.bodygraph.status === "uploaded_image"
        ? [pp([{ text: t("pro.uploadedCaption"), size: 15, color: PAL.faint }], { align: AlignmentType.CENTER, before: 60, after: 0 })]
        : []),
    ];
  }
  return [
    pp([{ text: t("pro.bgMissing"), size: 18, bold: true, color: "b45309" }], { align: AlignmentType.CENTER, before: 1200 }),
    pp([{ text: t("pro.bgMissingHint"), size: 17, color: PAL.soft }], { align: AlignmentType.CENTER }),
  ];
}

function proBodygraph(s: HdReportSnapshotV2, img: Buffer | null): ReportChild[] {
  // 2026-10-10 owner: BodyGraph 2. sayfada kimlik/doğum/HD özetinin HEMEN ALTINDA (sayfa sonu yok).
  const out: ReportChild[] = [h2(t("pro.bgTitle"), { keepNext: true })];
  if (s.activations.status !== "ok") {
    // Manuel / doğrulanamayan kayıt: aktivasyon sütunu yok; BodyGraph tek başına ortalanır.
    out.push(...bodygraphCell(s, img));
    if (s.activations.status === "invalid") out.push(bodyText(t("pro.actsInvalid")));
    return out;
  }
  // 2026-10-10 owner: "Kapı.Çizgi biçiminde…" açıklaması pro-1'de YOK (eski düzende aynen durur).
  out.push(
    fixedTable([SIDE_COL, BG_COL, W - SIDE_COL - BG_COL], [
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(activationColumn("design", s.activations.design), SIDE_COL, { vAlign: "center", pad: 60 }),
          cardCell(bodygraphCell(s, img), BG_COL, { vAlign: "center", pad: 40 }),
          cardCell(activationColumn("personality", s.activations.personality), W - SIDE_COL - BG_COL, { vAlign: "center", pad: 60 }),
        ],
      }),
    ]),
  );
  return out;
}

// ── P3b) Enkarnasyon Teması (Yaşam Amacı) — BodyGraph'tan SONRA, yeni sayfa başı ──
// Türkçe görünen adda "Haç" yok; özgün İngilizce terim aynen yanında (crossThemeNames).
function proIncarnation(s: HdReportSnapshotV2): ReportChild[] {
  const x = s.identity.cross;
  if (!x) return [];
  const names = crossThemeNames(x.name, x.angle);
  const en = isEn();
  const card: Paragraph[] = [
    // Diğer dillerde açıklayıcı Türkçe ad basılmaz; özgün İngilizce terim tek başlıktır.
    pp([{ text: en ? names.en : names.tr, size: 30, bold: true, color: PAL.ink }], { after: en ? 160 : 40 }),
    ...(en ? [] : [pp([{ text: names.en, size: 21, italics: true, color: PAL.soft }], { after: 160 })]),
    new Paragraph({
      spacing: { after: 0 },
      children: [
        pr({ text: t("pro.crossGates"), size: 17, color: PAL.soft }),
        pr({ text: x.gates, size: 21, bold: true, color: PAL.ink }),
        ...(x.angle ? [pr({ text: t("pro.crossAngle"), size: 17, color: PAL.soft }), pr({ text: crossAngle(x.angle), size: 21, color: PAL.ink })] : []),
      ],
    }),
    pp([{ text: t("pro.crossGatesLegend"), size: 16, color: PAL.faint }], { before: 40, after: 0 }),
    // Türkçe ad resmî/standart karşılık olarak SUNULMAZ; bağlayıcı ad özgün İngilizce terimdir.
    ...(en ? [] : [pp([{ text: t("pro.crossTrNote"), size: 15, italics: true, color: PAL.faint }], { before: 100, after: 0 })]),
  ];
  return [
    h1(t("pro.crossTitle"), true),
    fixedTable([W], [new TableRow({ cantSplit: true, children: [cardCell(card, W, { fill: PAL.card, borders: { ...NO_BORDERS, top: THIN(PAL.accent) } })] })]),
    new Paragraph({ spacing: { before: 0, after: 120 } }),
  ];
}

// ── P4) Merkezler (3×3) — premium kartlar: durum + o merkezdeki aktif kapılar ──
/** Küçük özet "pill" kartı (ör. "6 Tanımlı merkez"). */
function statPill(value: string, label: string, width: number, fill: string, color: string): TableCell {
  return cardCell(
    [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [pr({ text: value, size: 30, bold: true, color }), pr({ text: `  ${label}`, size: 18, color: PAL.mid })] })],
    width,
    { fill, vAlign: "center", pad: 90 },
  );
}

const PRO_STATE_TAG_KEY: Readonly<Record<HdCenterState, string>> = {
  defined: "pro.tagDefined",
  undefined: "pro.tagUndefined",
  open: "pro.tagOpen",
  unverified: "pro.tagUnverified",
};

function proCenters(s: HdReportSnapshotV2): ReportChild[] {
  if (s.centers.length === 0) return [];
  const byCode = new Map(s.centers.map((c) => [c.code, c]));
  const defined = s.centers.filter((c) => c.defined).length;
  const tri = hasCenterStates(s);
  // Merkez → bu haritada o merkezdeki aktif kapılar (kayıtlı kapı verisinden; yeni veri ÜRETİLMEZ).
  const gatesByCenter = new Map<string, number[]>();
  for (const g of s.gates) {
    const code = g.center ? GATE_CENTER_CODE[g.center] : undefined;
    if (code) gatesByCenter.set(code, [...(gatesByCenter.get(code) ?? []), g.gate].sort((a, b) => a - b));
  }
  const gap = 200;
  const col = Math.floor((W - 2 * gap) / 3);
  const widths = [col, gap, col, gap, W - 2 * gap - 2 * col];
  const cell = (code: string, width: number): TableCell => {
    const c = byCode.get(code);
    const n0 = CENTER_NAME[code] ?? { tr: c?.label ?? code, en: null };
    // Diğer dillerde ana ad hd.terms (ör. "Head Center"); ikinci (özgün terim) satırı boş.
    const n = isEn() ? { tr: hdEn.center(code) ?? n0.tr, en: null } : n0;
    const isDef = c?.defined === true;
    const gates = gatesByCenter.get(code) ?? [];
    const edge = isDef ? PAL.accent : PAL.line;
    return cardCell(
      [
        pp([{ text: tri && c ? t(PRO_STATE_TAG_KEY[frozenState(c)]) : isDef ? t("pro.tagDefined") : c ? t("pro.tagOpen") : t("pro.tagNoData"), size: 15, bold: true, color: isDef ? PAL.accent : PAL.soft }], { after: 80 }),
        pp([{ text: n.tr, size: 22, bold: true, color: PAL.ink }], { after: 0 }),
        pp([{ text: n.en ?? " ", size: 15, color: PAL.faint }], { after: 100 }),
        pp(
          [
            { text: t("pro.activeGates"), size: 15, color: PAL.soft },
            { text: gates.length ? gates.join(" · ") : "—", size: 18, bold: gates.length > 0, color: gates.length ? PAL.ink : PAL.faint },
          ],
          { after: 0 },
        ),
      ],
      width,
      {
        fill: isDef ? PAL.definedFill : "ffffff",
        borders: { top: { style: BorderStyle.SINGLE, size: 24, color: isDef ? PAL.accent : PAL.faint }, bottom: THIN(edge), left: THIN(edge), right: THIN(edge) },
        pad: 140,
      },
    );
  };
  const rows: TableRow[] = [];
  CENTER_GRID.forEach((codes, i) => {
    if (i > 0) rows.push(new TableRow({ height: { value: gap, rule: HeightRule.EXACT }, children: widths.map((w) => cardCell([], w, { pad: 0 })) }));
    rows.push(new TableRow({ cantSplit: true, children: [cell(codes[0], widths[0]), cardCell([], gap), cell(codes[1], widths[2]), cardCell([], gap), cell(codes[2], widths[4])] }));
  });
  const pillW = Math.floor((W - gap) / 2);
  if (tri) {
    const n = (st: HdCenterState) => s.centers.filter((c) => frozenState(c) === st).length;
    const p3 = Math.floor((W - 2 * gap) / 3);
    const unverified = n("unverified");
    return [
      h2(t("centers.title"), { keepNext: true }),
      fixedTable([p3, gap, p3, gap, W - 2 * gap - 2 * p3], [
        new TableRow({
          cantSplit: true,
          children: [
            statPill(String(n("defined")), t("pro.pillDefined"), p3, PAL.definedFill, PAL.accent),
            cardCell([], gap),
            statPill(String(n("undefined")), t("pro.pillUndefined"), p3, PAL.card, PAL.soft),
            cardCell([], gap),
            statPill(String(n("open")), t("pro.pillOpen"), W - 2 * gap - 2 * p3, PAL.card, PAL.soft),
          ],
        }),
      ]),
      new Paragraph({ spacing: { before: 0, after: 160 }, keepNext: true }),
      fixedTable(widths, rows),
      pp(
        [
          {
            text: t("pro.triLegend") + (unverified > 0 ? t("pro.triUnverified", { n: unverified }) : ""),
            size: 15,
            italics: true,
            color: PAL.faint,
          },
        ],
        { before: 100, after: 0 },
      ),
    ];
  }
  return [
    h2(t("centers.title"), { keepNext: true }),
    fixedTable([pillW, gap, W - gap - pillW], [
      new TableRow({
        cantSplit: true,
        children: [
          statPill(String(defined), t("pro.pillDefinedCenter"), pillW, PAL.definedFill, PAL.accent),
          cardCell([], gap),
          statPill(String(s.centers.length - defined), t("pro.pillOpenCenter"), W - gap - pillW, PAL.card, PAL.soft),
        ],
      }),
    ]),
    new Paragraph({ spacing: { before: 0, after: 160 }, keepNext: true }),
    fixedTable(widths, rows),
    pp([{ text: t("pro.legacyLegend"), size: 15, italics: true, color: PAL.faint }], { before: 100, after: 0 }),
  ];
}

// ── P4) Kanallar — her kanal ayrı kart: renkli kod rozeti + ad + merkez yolu ──
function proChannels(s: HdReportSnapshotV2): ReportChild[] {
  if (s.channels.length === 0 && s.gates.length === 0) return [];
  const out: ReportChild[] = [h2(t("channels.title"), { keepNext: true })];
  if (s.channels.length === 0) {
    out.push(bodyText(t("channels.none")));
    return out;
  }
  out.push(muted(t("pro.channelsCount", { n: s.channels.length })));
  const gap = 120;
  const widths = [1700, W - 1700];
  const rows: TableRow[] = [];
  s.channels.forEach((c, i) => {
    const [a, b] = c.gates;
    const ca = gateCenterLabel(GATE_TECHNICAL_DATA[a]?.merkez ?? null);
    const cb = gateCenterLabel(GATE_TECHNICAL_DATA[b]?.merkez ?? null);
    if (i > 0) rows.push(new TableRow({ height: { value: gap, rule: HeightRule.EXACT }, children: widths.map((w) => cardCell([], w, { pad: 0 })) }));
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cardCell([pp([{ text: `${a}–${b}`, size: 28, bold: true, color: "ffffff" }], { align: AlignmentType.CENTER, after: 0 })], widths[0], { fill: PAL.accent, vAlign: "center", pad: 120 }),
          cardCell(
            [
              pp([{ text: channelName(channelLabel(c), c.code), size: 23, bold: true, color: PAL.ink }], { after: 30 }),
              pp([{ text: `${ca}  ↔  ${cb}`, size: 17, color: PAL.soft }, { text: t("pro.channelGates", { a, b }), size: 15, color: PAL.faint }], { after: 0 }),
            ],
            widths[1],
            { fill: PAL.card, vAlign: "center", pad: 120, borders: { ...NO_BORDERS, top: THIN(), bottom: THIN(), right: THIN() } },
          ),
        ],
      }),
    );
  });
  out.push(fixedTable(widths, rows));
  return out;
}

// ── P5) Kapılar — başlık bandı + zebra satırlar + renkli aktivasyon etiketleri ──
function proGates(s: HdReportSnapshotV2): ReportChild[] {
  if (s.gates.length === 0) return [];
  const widths = [2900, 1600, 3700, W - 8200];
  const head = (t: string, w: number) =>
    cardCell([pp([{ text: t, size: 16, bold: true, color: "ffffff", allCaps: true }], { after: 0, keepNext: true })], w, { fill: PAL.accent, pad: 100, vAlign: "center" });
  const rows: TableRow[] = [
    new TableRow({ tableHeader: true, cantSplit: true, children: [head(t("pro.colGate"), widths[0]), head(t("pro.colCenter"), widths[1]), head(t("pro.colActivations"), widths[2]), head(t("pro.colChannel"), widths[3])] }),
  ];
  s.gates.forEach((g, i) => {
    const fill = i % 2 === 0 ? "ffffff" : PAL.card;
    const border = { ...NO_BORDERS, bottom: THIN() };
    // Yeni snapshot: rapor anında donmuş görünen ad (kişisel/hazır). Eski snapshot: hazır sözlük.
    const name = g.name !== undefined ? (isEn() ? hdEn.gateName(g.gate, g.name) : g.name) : gateName(g.gate);
    const acts = g.activations.length
      ? g.activations.map((a) => {
          const color = a.side === "design" ? PAL.design : PAL.personality;
          return new Paragraph({
            spacing: { before: 0, after: 30 },
            children: [
              pr({ text: a.side === "design" ? "● Design" : "● Personality", size: 16, bold: true, color }),
              pr({ text: `   ${planetLabel(a.planet)}   `, size: 18, color: PAL.mid }),
              pr({ text: `${g.gate}.${a.line}`, size: 20, bold: true, color }),
            ],
          });
        })
      : [pp([{ text: "—", size: 18, color: PAL.faint }], { after: 0 })];
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(
            [
              new Paragraph({ spacing: { before: 0, after: 0 }, children: [pr({ text: String(g.gate), size: 30, bold: true, color: PAL.accent }), pr({ text: t("pro.gateWord"), size: 17, color: PAL.soft })] }),
              ...(name ? [pp([{ text: name, size: 17, color: PAL.mid }], { after: 0 })] : []),
            ],
            widths[0],
            { fill, borders: border, pad: 100, vAlign: "center" },
          ),
          cardCell([pp([{ text: gateCenterLabel(g.center), size: 19, color: PAL.ink }], { after: 0 })], widths[1], { fill, borders: border, pad: 100, vAlign: "center" }),
          cardCell(acts, widths[2], { fill, borders: border, pad: 100, vAlign: "center" }),
          cardCell(
            gateChannelCodes(s, g).length
              ? gateChannelCodes(s, g).map((code) => pp([{ text: code.replace("-", "–"), size: 20, bold: true, color: PAL.accent }], { after: 20 }))
              : [pp([{ text: "—", size: 20, color: PAL.faint }], { after: 0 })],
            widths[3],
            { fill, borders: border, pad: 100, vAlign: "center" },
          ),
        ],
      }),
    );
  });
  return [
    h1(t("gates.title"), true),
    muted(t("pro.gatesLegend", { n: s.gates.length })),
    fixedTable(widths, rows),
  ];
}

// ── P6) Uzman Açıklamaları ──
function proExpert(s: HdReportSnapshotV2): ReportChild[] {
  const { expert } = s.commentary;
  if (!expert.included || expert.entries.length === 0) return [];
  const out: ReportChild[] = [
    // Kapılardan hemen sonra gelir → zorunlu sayfa sonu YOK (2026-10-10 owner): yer varsa aynı sayfada
    // devam eder; h1 → açıklama → kategori → başlık → ilk paragraf keepNext zinciri ile birlikte kalır,
    // yer yoksa Word zinciri bütün olarak sonraki sayfaya taşır.
    h1(t("pro.expertTitle"), false),
    muted(t("pro.expertSource")),
  ];
  let current = "";
  for (const e of expert.entries as FrozenExpertEntry[]) {
    if (e.category !== current) {
      current = e.category;
      out.push(h2(categoryLabel(current), { keepNext: true }));
    }
    out.push(h3(e.title, { keepNext: true }));
    out.push(...plainParagraphs(e.content)); // AYNEN (özet / yeniden yazım YOK)
  }
  return out;
}

// ── Son sayfa (sade) ──
function proClosing(s: HdReportSnapshotV2, genDate: string, opts: WordReportV2Options): ReportChild[] {
  const lines: string[] = [t("closing.proTechnical")];
  if (opts.systemReadingRedacted) lines.push(t("closing.proRedacted"));
  if (s.bodygraph.status === "missing") lines.push(t("closing.bodygraphMissing"));
  lines.push(t("closing.frozen", { date: genDate }));
  lines.push(t("closing.noDiagnosis"));
  return [
    divider(),
    h2(t("closing.title"), { keepNext: true }),
    ...lines.map((l) => muted(l)),
    // Bilgilendirme notu (Hazırlayan satırı burada YOK — aşağıdaki uzman imza bölümü taşır).
    ...wellnessSection(null),
    ...proSignature(s.preparedBy ?? null, genDate, opts),
  ];
}

// ── Uzman imza bölümü (son sayfa) ──
// "Raporu Hazırlayan" YALNIZ uzmanın bu rapora yazdığı ad/unvan; profil adı OTOMATİK yazılmaz.
// 2026-10-10 owner: ad boşsa imza kartı TAMAMEN gizlenir (boş satırlı kart yok).
function proSignature(preparedBy: string | null, genDate: string, opts: WordReportV2Options = {}): ReportChild[] {
  const name = preparedBy?.trim() || null;
  if (!name) return [];
  // F3A: yalnız preparedBy doluysa (yukarıda) markalama unvan/kurum/logo ekler; ad DEĞİŞMEZ (preparedBy).
  const credentials = expertCredentialLines(opts.branding, { titleSize: 20, orgSize: 20, color: PAL.mid, after: 80 });
  const logo = opts.brandingVariant === "C" ? null : expertLogoParagraph(opts.branding, { maxWidth: 120, maxHeight: 48, align: AlignmentType.LEFT, after: 120, keepNext: false });
  const left = Math.floor(W * 0.62);
  const right = W - left;
  const blankLine = (label: string): Paragraph[] => [
    new Paragraph({ spacing: { before: 420, after: 0 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: PAL.faint } }, children: [pr({ text: " ", size: 20 })] }),
    pp([{ text: label, size: 15, color: PAL.soft }], { before: 40, after: 0 }),
  ];
  const leftCell: Paragraph[] = [
    ...(logo ? [logo] : []),
    pp([{ text: t("pro.preparedByCaps"), size: 16, bold: true, color: PAL.accent }], { after: 160 }),
    pp([{ text: name, size: 34, bold: true, color: PAL.ink }], { after: 60 }),
    ...credentials,
    pp([{ text: t("pro.reportName"), size: 17, color: PAL.soft }], { after: 0 }),
  ];
  const rightCell: Paragraph[] = [
    pp([{ text: t("pro.reportDateCaps"), size: 16, bold: true, color: PAL.accent }], { after: 160 }),
    pp([{ text: genDate, size: 22, bold: true, color: PAL.ink }], { after: 0 }),
    ...blankLine(t("pro.signature")),
  ];
  const top = { style: BorderStyle.SINGLE, size: 24, color: PAL.accent };
  return [
    new Paragraph({ spacing: { before: 480, after: 0 }, keepNext: true }),
    fixedTable([left, right], [
      new TableRow({
        cantSplit: true,
        children: [
          cardCell(leftCell, left, { fill: PAL.card, pad: 260, borders: { ...NO_BORDERS, top } }),
          cardCell(rightCell, right, { fill: PAL.card, pad: 260, borders: { ...NO_BORDERS, top, left: THIN() } }),
        ],
      }),
    ]),
  ];
}

function buildHdReportV2ProChildren(s: HdReportSnapshotV2, opts: WordReportV2Options): { cover: ReportChild[]; body: ReportChild[] } {
  const genDate = formatInstantDate(s.generatedAt, { style: "long", fallback: "—", ...dateOpts() });
  const reading = harmonizedReading(s, opts.systemReadingRedacted ? null : s.commentary.system.status === "included" ? s.commentary.system.reading : null);
  const expertPart = proExpert(s);
  return {
    cover: buildCover(s, genDate, opts.logo ?? null),
    body: [
      ...proIdentity(s, genDate),
      ...proBodygraph(s, opts.bodygraphImage ?? null),
      ...proIncarnation(s),
      ...proCenters(s),
      ...proChannels(s),
      ...proGates(s),
      ...expertPart,
      // Uzman bölümü yoksa kapılardan hemen sonra Sistem Yorumu gelir → o da sayfa sonu zorlamadan akar.
      ...buildSystem(reading, { proCross: true, flowAfterGates: expertPart.length === 0 }),
      ...proClosing(s, genDate, opts),
    ],
  };
}

export function buildHdReportV2Document(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): Document {
  return withText(opts.output, () => buildDocumentInner(s, opts));
}

function buildDocumentInner(s: HdReportSnapshotV2, opts: WordReportV2Options): Document {
  const { cover, body } = buildChildrenInner(s, opts);
  const page = { size: A4, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } };
  const reportName = t("brand.reportNameV2");
  return new Document({
    creator: t("brand.creator"),
    title: hdXmlSafeLine(t("brand.docTitleV2", { name: s.client.name })),
    // Belge dili (w:lang) YALNIZ TR dışında; TR stil nesnesi bugünküyle aynı.
    styles: { default: { document: { run: { font: REPORT_FONT, ...hdDocLanguage(X) } } } },
    sections: [
      // Kapak: üst/alt bilgi YOK (sade kurumsal kapak).
      { properties: { page }, children: cover },
      {
        properties: { page },
        headers: { default: buildHeader(t("brand.header")) },
        footers: { default: isEn() ? new Footer({ children: hdFooterChildren(X, reportName) }) : buildFooter(reportName) },
        children: body,
      },
    ],
  });
}

export async function renderHdReportV2Buffer(s: HdReportSnapshotV2, opts: WordReportV2Options = {}): Promise<Buffer> {
  return Packer.toBuffer(buildHdReportV2Document(s, opts));
}
