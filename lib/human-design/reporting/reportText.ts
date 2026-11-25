/**
 * I18N-F1-R5 HD-B — HD profesyonel Word (P31) ÇIKTI DİLİ katmanı.
 *
 * Sözleşme (lib/i18n/output.ts, Owner A3): route `resolveOutputLocale(req)` ile dili çözer ve üreticiye `output`
 * geçirir. Parametresiz / TR çağrı = bugünkü çıktı BAYT-BAYT (golden: scripts/hd-i18n/golden/p31-tr.golden.json).
 * TR katalog değerleri (`reports.hd`) eski sabit metinlerin birebir kopyasıdır.
 *
 * #855 GEÇİŞ NOTU: #855 (`lib/i18n/reportLocale.ts`) birleşince route'taki tek satır
 * `resolveOutputLocale(req)` → `await resolveReportLocale(req, { db, tenantId, userId })` olur (ReportLocale,
 * OutputLocale'in üst kümesi; bu modül değişmeden çalışır). EN'de HD'nin kendi ürettiği alt bilgi / bilgilendirme
 * notu (`hdFooter`, `hdWellnessNoteSection`) o zaman ortak motorların `common` parametresine devredilebilir.
 *
 * DONMUŞ SNAPSHOT: snapshot Türkçe GÖRÜNEN etiketleri dondurur (tip/otorite/merkez/kanal adı…). TR çıktı snapshot
 * etiketini AYNEN basar. Diğer dillerde etiket KODDAN türetilir (`hd.terms` EN sözlüğü); kod çözülemezse donmuş
 * etiket basılır (uydurma yok). Kullanıcı içeriği (danışan adı, hazırlayan, Bilgi Bankası başlık/metin, kişisel
 * kapı/kanal adı) ÇEVRİLMEZ. Hesap / snapshot üretimi dile bağlı DEĞİLDİR (bu modül yalnız gösterim).
 */
import { AlignmentType, PageNumber, Paragraph, TextRun } from "docx";
import { C_LIGHT, C_MID, REPORT_FONT } from "@/lib/docx/reportHelpers";
import { getOutputTranslator, SOURCE_OUTPUT_LOCALE, type OutputLocale } from "@/lib/i18n/output";
import { SR_EN } from "@/lib/human-design/providers/roxy/systemReadingLabelsEn";
import enKnowledge from "@/messages/en/hd.knowledge.json";
import {
  hdAuthorityDisplayLabel,
  hdCenterLabelFromCode,
  hdChannelLabelFromCode,
  hdDefinitionLabelFromCode,
} from "@/lib/human-design/codeHelpers";
import { toAppCenterCode, toAppTypeCode } from "@/lib/human-design/normalize/hdAppCodes";
import { HUMAN_DESIGN_CENTERS, HUMAN_DESIGN_TYPES, HD_KNOWLEDGE_CATEGORY_PREFIX } from "@/lib/human-design/constants";
import { hdCrossAngleLabel } from "@/lib/human-design/normalize/hdDisplayLabels";
import { hdGateDefaultName } from "@/lib/human-design/knowledge/hdNames";
import type { SystemReadingDto, SystemReadingDetail } from "@/lib/human-design/providers/roxy/systemReading";
import type { HdCenterState } from "@/lib/human-design/chart/centerStates";
import type { PlanetName } from "@/lib/human-design/engine/types";
import type { HdProfessionalReportSummary } from "./reportSummary";
import { isHdReportSnapshotV2, type AnyHdReportSnapshot } from "./reportSnapshotV2";

type Vals = Record<string, string | number>;

export type HdReportText = {
  output: OutputLocale;
  /** Kaynak dil (tr) — bugünkü çıktı birebir. */
  isSource: boolean;
  t: (key: string, values?: Vals) => string;
  /** reportTime biçimleri için Intl etiketi; TR'de undefined (varsayılan → bayt-eşit). */
  dateLocale: string | undefined;
};

const cache = new Map<string, HdReportText>();

export function hdReportText(output?: OutputLocale | null): HdReportText {
  const o = output ?? SOURCE_OUTPUT_LOCALE;
  const hit = cache.get(o.locale);
  if (hit) return hit;
  const tr = getOutputTranslator(o, "reports.hd") as unknown as (key: string, values?: Vals) => string;
  const isSource = o.locale === SOURCE_OUTPUT_LOCALE.locale;
  const x: HdReportText = { output: o, isSource, t: (k, v) => tr(k, v), dateLocale: isSource ? undefined : o.intlTag };
  cache.set(o.locale, x);
  return x;
}

/** docx `Document.styles.default.document.run` ek alanı: belge dili YALNIZ kaynak dil dışında (TR golden aynı). */
export function hdDocLanguage(x: HdReportText): { language?: { value: string } } {
  return x.isSource ? {} : { language: { value: x.output.documentLang } };
}

// ── EN alt bilgi / bilgilendirme notu (TR yolu ortak motoru kullanmaya DEVAM eder) ─────────────────
// Ortak lib/docx/reportHelpers.buildFooter / buildWellnessNoteSection bu dalda dil parametresi almıyor (#855);
// aynı yapı ve biçim burada yalnız TR DIŞI diller için kurulur.
export function hdFooterChildren(x: HdReportText, reportName: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: x.t("common.page"), size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: x.t("common.of"), size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: REPORT_FONT, color: C_LIGHT }),
        new TextRun({ text: `  ·  ${reportName}`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
      ],
    }),
  ];
}

export function hdWellnessNoteSection(x: HdReportText, expertName?: string | null): Paragraph[] {
  const out: Paragraph[] = [
    new Paragraph({ spacing: { before: 360, after: 60 }, children: [new TextRun({ text: x.t("common.noteTitle"), bold: true, size: 18, font: REPORT_FONT, color: C_MID })] }),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: x.t("common.noteFull"), italics: true, size: 16, font: REPORT_FONT, color: C_LIGHT })] }),
  ];
  const name = expertName?.trim();
  if (name) out.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: x.t("common.preparedByLine", { name }), size: 16, font: REPORT_FONT, color: C_MID })] }));
  return out;
}

// ── Donmuş TR etiketi → kod → EN (yalnız TR dışı) ─────────────────────────────────────────────────
const AUTHORITY_CODES = ["sacral", "emotional", "splenic", "ego_heart", "self_projected", "mental_environmental", "lunar", "none"] as const;
const DEFINITION_CODES = ["single", "split", "triple_split", "quadruple_split", "none"] as const;
const ANGLE_KEYS: Record<string, string> = { rightangle: "right_angle", leftangle: "left_angle", juxtaposition: "juxtaposition" };

/** Donmuş tip etiketi ("Projektör (Projector)" ya da eski "Projector") → tip kodu. */
export function hdTypeCodeFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const exact = HUMAN_DESIGN_TYPES.find((t) => t.label === label)?.code;
  if (exact) return exact;
  const inParens = /\(([^()]+)\)\s*$/.exec(label)?.[1];
  return toAppTypeCode(label) ?? (inParens ? toAppTypeCode(inParens) : null);
}

export const hdEn = {
  /** Kavram başlığı (Tip, Strateji, …, Enkarnasyon Haçı) — hd.terms.title. */
  title: (key: string): string => SR_EN.title(key) ?? key,
  /** Kanonik kod → EN terim (hd.terms grubundan); yoksa null. */
  term: (group: string, code: string | null | undefined): string | null => SR_EN.term(group, code),
  type: (label: string | null | undefined): string | null => {
    const code = hdTypeCodeFromLabel(label);
    return (code && SR_EN.term("type", code)) || label || null;
  },
  profile: (label: string | null | undefined): string | null => {
    const m = /^\s*([1-6])\s*\/\s*([1-6])/.exec(label ?? "");
    return (m && SR_EN.term("profile", `${m[1]}_${m[2]}`)) || label || null;
  },
  authority: (label: string | null | undefined, typeLabel: string | null | undefined): string | null => {
    if (!label) return null;
    const typeCode = hdTypeCodeFromLabel(typeLabel);
    for (const code of AUTHORITY_CODES) {
      if (hdAuthorityDisplayLabel(code, typeCode) !== label && hdAuthorityDisplayLabel(code, null) !== label) continue;
      const key = code === "ego_heart" && typeCode === "manifestor" ? "ego_manifested" : code === "ego_heart" && typeCode === "projector" ? "ego_projected" : code;
      return SR_EN.term("authority", key) ?? label;
    }
    return label;
  },
  definition: (label: string | null | undefined): string | null => {
    if (!label) return null;
    const code = DEFINITION_CODES.find((c) => hdDefinitionLabelFromCode(c) === label);
    return (code && SR_EN.term("definition", code)) || label;
  },
  keynote: (kind: "strategy" | "signature" | "notSelf", typeLabel: string | null | undefined): string | null => {
    const code = hdTypeCodeFromLabel(typeLabel);
    return code ? SR_EN.term(kind, code) : null;
  },
  /** "Sağ Açı (Right Angle)" (uygulama etiketi) → "Right Angle"; bilinmeyen → aynen. */
  angle: (label: string | null | undefined): string | null => {
    if (!label) return null;
    for (const [k, code] of Object.entries(ANGLE_KEYS)) {
      if (hdCrossAngleLabel(k) === label || label.toLowerCase().replace(/[\s_\-]+/g, "") === k) return SR_EN.term("angle", code) ?? label;
    }
    return label;
  },
  center: (code: string | null | undefined): string | null => (code ? SR_EN.term("center", code) : null),
  /** Sağlayıcı merkez kimliği ya da uygulamanın Türkçe merkez adı → merkez kodu. */
  centerCode: (raw: string | null | undefined): string | null =>
    toAppCenterCode(raw) ?? HUMAN_DESIGN_CENTERS.find((c) => hdCenterLabelFromCode(c.code) === raw)?.code ?? null,
  centerState: (st: HdCenterState): string => SR_EN.term("centerState", st) ?? st,
  planet: (p: PlanetName | string): string => SR_EN.term("planet", p) ?? String(p),
  /** Donmuş kanal etiketi: hazır (sözlük) ad ise EN; kişisel ad (kullanıcı içeriği) ise AYNEN. */
  channelLabel: (label: string, code: string): string => (label === hdChannelLabelFromCode(code) ? SR_EN.term("channel", code) ?? label : label),
  /** Donmuş kapı adı: hazır Türkçe sözlük adı ise EN'de yok (64 kapı EN sözlüğü yok → ad basılmaz); kişisel ad AYNEN. */
  gateName: (gate: number, name: string | null | undefined): string | null => (!name || name === hdGateDefaultName(gate) ? null : name),
  /** Bilgi Bankası kategori (DB kanonik TR değeri) → görünen EN ad. */
  category: (cat: string): string => {
    const code = (HD_KNOWLEDGE_CATEGORY_PREFIX as Record<string, string>)[cat];
    return (code && KB_CATEGORY_EN[code]) || cat;
  },
};

const KB_CATEGORY_EN = (enKnowledge as unknown as { hd: { knowledge: { category: Record<string, string> } } }).hd.knowledge.category;

/** Sistem Yorumu ayrıntı etiketi (donmuş Türkçe sistem etiketi) → EN; tanınmayan → aynen. */
function detailLabelEn(label: string): string {
  const fixed: Record<string, string> = {
    "Açıklama": SR_EN.detail("description"),
    Aura: SR_EN.detail("aura"),
    "Açı": SR_EN.detail("angle"),
    "Kapılar": SR_EN.detail("gates"),
    "Personality (bilinçli)": SR_EN.detail("personality"),
    "Design (bilinçdışı)": SR_EN.detail("design"),
  };
  if (fixed[label]) return fixed[label];
  const p = /^Personality \(bilinçli\) — ([1-6])\. çizgi$/.exec(label);
  if (p) return SR_EN.detail("personalityLine", { line: Number(p[1]) });
  const d = /^Design \(bilinçdışı\) — ([1-6])\. çizgi$/.exec(label);
  if (d) return SR_EN.detail("designLine", { line: Number(d[1]) });
  return label;
}

function detailTextEn(label: string, text: string): string {
  const g = /^Personality Güneş (\d+) · Personality Dünya (\d+) · Design Güneş (\d+) · Design Dünya (\d+)$/.exec(text);
  if (g) return SR_EN.detail("crossGates", { ps: g[1]!, pe: g[2]!, ds: g[3]!, de: g[4]! });
  if (label === "Açı") { // i18n-ignore: donmuş TR sistem etiketi (eşleme anahtarı, görünen metin değil)
    const m = /^(.*?)( \([A-Z]{2,5}\))?$/.exec(text);
    if (m) return `${hdEn.angle(m[1]) ?? m[1]}${m[2] ?? ""}`;
  }
  return text;
}

/**
 * Uyumlanmış (harmonize) Sistem Yorumu DTO'sunun SİSTEM etiketlerini EN'e taşır: başlıklar, ayrıntı etiketleri,
 * genel değer etiketleri (tip/otorite/…), merkez ve kanal adları, çapraz kapı satırı, dil notu.
 * SAĞLAYICI ANLATISI (ayrıntı metni, tema, biyoloji, kanal/kapı açıklaması, sağlayıcı kapı adı) AYNEN kalır —
 * kayıtlı anlatı haritanın hesaplandığı dildedir (KISMİ; A6 dil başına anlatı deposu bağlanana kadar).
 */
export function localizeSystemReadingEn(
  reading: SystemReadingDto,
  values: Partial<Record<"type" | "strategy" | "authority" | "profile" | "definition" | "signature" | "notSelf", string | null>>,
): SystemReadingDto {
  return {
    ...reading,
    general: reading.general.map((g) => ({
      ...g,
      title: SR_EN.title(g.key) ?? g.title,
      value: (g.key in values ? values[g.key as keyof typeof values] : null) ?? (g.key === "cross" ? hdEn.angle(g.value) : g.value),
      details: g.details.map((d: SystemReadingDetail) => ({ label: detailLabelEn(d.label), text: detailTextEn(d.label, d.text) })),
    })),
    centers: reading.centers.map((c) => {
      const code = hdEn.centerCode(c.id);
      return { ...c, name: (code && hdEn.center(code)) || c.name };
    }),
    channels: reading.channels.map((c) => {
      const en = c.id ? SR_EN.term("channel", c.id) : null;
      const centers = c.centers?.map((n) => {
        const code = hdEn.centerCode(n);
        return (code && hdEn.center(code)) || n;
      });
      return { ...c, name: en ? en.replace(/^\s*\d+-\d+\s*/, "").trim() || c.name : c.name, ...(c.centers ? { centers } : {}) };
    }),
    // Dil notu TR okura "bazı metinler İngilizce" der; EN çıktıda yerine `system.providerNote` basılır.
    ...(reading.languageNote !== undefined ? { languageNote: null } : {}),
  };
}

// ── Profesyonel Rapor Özeti (Android/özet penceresi) — donmuş TR etiketleri TR DIŞINDA koddan ──────────────

/**
 * Özet DTO'sunu çıktı diline taşır. TR (kaynak dil) → girdi AYNEN döner (bugünkü yanıt birebir). Diğer dillerde tip /
 * profil / otorite / tanım / merkez / kanal / kapı adları kanonik koddan; kişisel kanal adı ve danışan bilgileri aynen;
 * başlık yalnız sistemin ürettiği kalıpla birebir aynıysa (kullanıcı başlığı değilse) yeniden üretilir.
 */
export function localizeReportSummary(
  summary: HdProfessionalReportSummary,
  snap: AnyHdReportSnapshot,
  output?: OutputLocale | null,
): HdProfessionalReportSummary {
  const x = hdReportText(output ?? null);
  if (x.isSource) return summary;
  // Kayıtlı başlık sistem kalıbıyla (wordReport.hdReportTitle, TR) birebir aynıysa çıktı dilinde yeniden üretilir.
  const src = hdReportText(null);
  const name = summary.client.name.trim();
  const sysTitle = (t: HdReportText) => (name ? t.t("brand.docTitleV1", { name }) : t.t("brand.docTitleV1Empty"));
  const title = summary.title === sysTitle(src) ? sysTitle(x) : summary.title;
  if (isHdReportSnapshotV2(snap)) {
    return {
      ...summary,
      title,
      chart: {
        profile: hdEn.profile(snap.identity.profile),
        definition: hdEn.definition(snap.identity.definition),
        definedCenters: snap.centers.filter((c) => c.defined).map((c) => hdEn.center(c.code) ?? c.label),
      },
      type: hdEn.type(snap.identity.type),
      authority: hdEn.authority(snap.identity.authority, snap.identity.type),
      channels: snap.channels.map((c) => hdEn.channelLabel(c.label, c.code)),
      gates: snap.gates.map((g) => x.t("gateN", { n: g.gate })),
    };
  }
  const s = snap;
  return {
    ...summary,
    title,
    chart: {
      profile: hdEn.profile(summary.chart.profile),
      definition: hdEn.definition(summary.chart.definition),
      definedCenters: summary.chart.definedCenters.map((l) => hdEn.center(hdEn.centerCode(l)) ?? l),
    },
    type: s.identity?.type ? hdEn.term("type", s.identity.type.key.replace(/^tip_/, "")) ?? summary.type : summary.type,
    authority: s.identity?.authority ? hdEn.term("authority", s.identity.authority.key.replace(/^otorite_/, "")) ?? summary.authority : summary.authority,
    channels: (s.channels ?? []).map((c) => x.t("v1.channelHeading", { name: hdEn.term("channel", c.code) ?? c.displayName })),
    gates: (s.gates ?? []).map((g) => x.t("v1.gate", { n: g.gate })),
    hangingGates: (s.hangingContexts ?? []).map((h) => x.t("v1.gate", { n: h.gate })),
  };
}
