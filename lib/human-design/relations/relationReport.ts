// İlişki (Connection) ve Grup (Penta) — profesyonel Word (.docx) raporu (SAF; ağ/DB YOK).
//
//   • Kaynak YALNIZ kayıtlı rapor snapshot'ı (DONMUŞ içerik) → yeni Roxy çağrısı YOK; kayıtlı rapor
//     tekrar indirilince içerik değişmez. Görsel snapshot'taki kayıtlı veriden aynı sahneyle çizilir.
//   • Her durumda: katılımcılar (etiket A/B ya da 1–5 + ad) + teknik sonuçlar. İsteğe bağlı (yalnız
//     raporda seçildiyse): Analiz Açıklamaları · Bilgi Bankası kayıtları (özel çalışma notu YOK) · Uzman Yorumu.
//   • Sağlayıcı adı / uç / adaptör / nodeType RAPORDA YOK.
//   • Mevcut tek kişilik BodyGraph Word raporu DEĞİŞTİRİLMEDİ; ortak docx yardımcıları kullanılır.
//
// ÇIKTI DİLİ (I18N-F1-R5 HD-B, P34) — sözleşme lib/i18n/output.ts:
//   • Route `resolveOutputLocale(req)` ile dili çözer ve `output` geçirir (#855 birleşince `resolveReportLocale` — tek satır).
//   • output yok / tr → bugünkü Türkçe çıktı BAYT-EŞİT (golden: scripts/hd-i18n/golden/p34-tr.golden.json). Rapora özgü
//     metinler `reports.hdRelations` kataloğundan (TR değerleri eski sabitlerle birebir); ortak etiketler (dinamik, devre,
//     ilişki türü, kanal / merkez / tanım adı, uyarı) TR'de labels.ts / codeHelpers'tan AYNEN.
//   • Diğer dillerde etiketler `hd.relations` + `hd.terms` (ekranla aynı terminoloji). Donmuş snapshot'taki TR SİSTEM
//     metinleri (görsel notu, analiz açıklamaları, Bilgi Bankası grup başlıkları) kodlardan / kayıtlı sonuçtan yeniden
//     türetilir; sağlayıcının TR `*Localized` alanları KULLANILMAZ → İngilizce `name` / `gateName` (Roxy B5).
//   • Kullanıcı içeriği (kişi adı, doğum yeri, Bilgi Bankası kaydı, uzman yorumu, Raporu Hazırlayan) ÇEVRİLMEZ.
//   • Hesap / eşleşme / snapshot fonksiyonlarına dil GEÇİRİLMEZ.
//   • Belge dili: `w:lang` YALNIZ TR dışında (TR belgede dil işareti yok → golden aynı).

import { HD_CONNECTION_BODYGRAPH } from "../bodygraph/rendererConfig";
import { AlignmentType, Document, Footer, PageNumber, Packer, Paragraph, TextRun, type Table } from "docx";
import {
  bodyText,
  buildFooter,
  buildHeader,
  embedImageParagraph,
  h1,
  h2,
  h3,
  muted,
  repeatingHeaderTable,
  twoColTable,
  REPORT_FONT,
  C_DARK,
  C_LIGHT,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { getOutputTranslator, SOURCE_OUTPUT_LOCALE, type OutputLocale } from "@/lib/i18n/output";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "../reporting/xmlSafeText";
import { expertBrandingFields, type ExpertBranding, type ExpertBrandingVariant } from "@/lib/docx/expertBranding";
import { hdCenterLabelFromCode } from "../codeHelpers";
import { hdGateDefaultName } from "../knowledge/hdNames";
import { toAppDefinitionCode } from "../normalize/hdAppCodes";
import { channelCenterCodes, type ConnectionDynamic, type HdConnectionResult } from "./connection";
import type { HdPentaResult } from "./penta";
import type { RelationAnalysisView, RelationKind, RelationType } from "./relationService";
import { buildCompositeModel } from "./compositeModel";
import type { KnowledgeGroup, RelationReportSnapshot } from "./relationExtras";
import { ANALYSIS_EXPLANATION_DISCLAIMER, ANALYSIS_EXPLANATION_SOURCE, connectionExplanations, pentaExplanations } from "./explanations";
import {
  circuitLabel,
  combinedDefinitionLabel,
  DYNAMIC_DEFINITION,
  DYNAMIC_LABEL,
  DYNAMIC_ORDER,
  participantTag,
  PENTA_CORE_NOTE,
  PENTA_GAP_NOTE,
  PENTA_POSITION_DEFINITION,
  PENTA_POSITION_LABEL,
  RELATION_DISCLAIMER,
  RELATION_KIND_LABEL,
  RELATION_TYPE_LABEL,
  relationChannelLabel,
} from "./labels";

const PAGE = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } };
const safe = (s: string) => hdXmlSafeLine(s);

// ─── Dil araç takımı ────────────────────────────────────────────────────────────────────────────────────
type Txt = ((key: string, values?: Record<string, string | number>) => string) & { has: (key: string) => boolean };
type RelKit = {
  isTr: boolean;
  documentLang: string;
  intlTag: string;
  t: Txt;
  kind: (k: RelationKind) => string;
  type: (x: RelationType) => string;
  dynamic: (d: ConnectionDynamic) => string;
  dynamicDef: (d: ConnectionDynamic) => string;
  circuit: (c: string) => string;
  channel: (id: string, fallbackName: string) => string;
  center: (code: string) => string;
  combinedDefinition: (kind: string) => string;
  pentaPosition: (p: "upper" | "lower") => string;
  pentaPositionDef: (p: "upper" | "lower") => string;
  coreNote: string;
  gapNote: string;
  disclaimer: string;
  explanationSource: string;
  explanationDisclaimer: string;
  gateName: (g: HdPentaResult["gates"][number]) => string;
};

const kitCache = new Map<string, RelKit>();
function relKit(output: OutputLocale | null | undefined): RelKit {
  const o = output ?? SOURCE_OUTPUT_LOCALE;
  const hit = kitCache.get(o.locale);
  if (hit) return hit;
  const t = getOutputTranslator(o, "reports.hdRelations") as unknown as Txt;
  let kit: RelKit;
  if (o.locale === SOURCE_OUTPUT_LOCALE.locale) {
    kit = {
      isTr: true, documentLang: o.documentLang, intlTag: o.intlTag, t,
      kind: (k) => RELATION_KIND_LABEL[k],
      type: (x) => RELATION_TYPE_LABEL[x],
      dynamic: (d) => DYNAMIC_LABEL[d],
      dynamicDef: (d) => DYNAMIC_DEFINITION[d],
      circuit: circuitLabel,
      channel: relationChannelLabel,
      center: (code) => hdCenterLabelFromCode(code),
      combinedDefinition: combinedDefinitionLabel,
      pentaPosition: (p) => PENTA_POSITION_LABEL[p],
      pentaPositionDef: (p) => PENTA_POSITION_DEFINITION[p],
      coreNote: PENTA_CORE_NOTE,
      gapNote: PENTA_GAP_NOTE,
      disclaimer: RELATION_DISCLAIMER,
      explanationSource: ANALYSIS_EXPLANATION_SOURCE,
      explanationDisclaimer: ANALYSIS_EXPLANATION_DISCLAIMER,
      gateName: (g) => hdGateDefaultName(g.gate) ?? g.gateNameLocalized ?? g.gateName,
    };
  } else {
    const rel = getOutputTranslator(o, "hd.relations") as unknown as Txt;
    const terms = getOutputTranslator(o, "hd.terms") as unknown as Txt;
    const term = (k: string, fallback: string) => (terms.has(k) ? terms(k) : fallback);
    kit = {
      isTr: false, documentLang: o.documentLang, intlTag: o.intlTag, t,
      kind: (k) => rel(`kind.${k}`),
      type: (x) => rel(`type.${x}`),
      dynamic: (d) => rel(`dynamic.${d}`),
      dynamicDef: (d) => rel(`dynamicDef.${d}`),
      circuit: (c) => (rel.has(`circuit.${c}`) ? rel(`circuit.${c}`) : c),
      channel: (id, fallbackName) => {
        const l = term(`channel.${id}`, id);
        return l && l !== id ? l : `${id} ${fallbackName}`;
      },
      center: (code) => term(`center.${code}`, code),
      combinedDefinition: (kind) => {
        const code = toAppDefinitionCode(kind);
        return code ? term(`definition.${code}`, kind) : kind;
      },
      pentaPosition: (p) => rel(`pentaPosition.${p}`),
      pentaPositionDef: (p) => rel(`pentaPositionDef.${p}`),
      coreNote: rel("note.pentaCore"),
      gapNote: rel("note.pentaGap"),
      disclaimer: rel("note.disclaimer"),
      explanationSource: rel("note.explanationSource"),
      explanationDisclaimer: rel("note.explanationDisclaimer"),
      // B5: sağlayıcının İngilizce kapı adı (TR kapı sözlüğü / TR `gateNameLocalized` KULLANILMAZ).
      gateName: (g) => g.gateName,
    };
  }
  kitCache.set(o.locale, kit);
  return kit;
}

function dmy(iso: string | null, k: RelKit): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return "—";
  if (k.isTr) return `${m[3]}.${m[2]}.${m[1]}`;
  return new Intl.DateTimeFormat(k.intlTag, { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
}

const STATUS_KEYS: ReadonlyArray<RelationAnalysisView["participants"][number]["status"]> = ["birth_data_changed", "source_chart_deleted", "client_deleted"];
function statusNote(status: RelationAnalysisView["participants"][number]["status"], k: RelKit): string | null {
  return STATUS_KEYS.includes(status) ? k.t(`status.${status}`) : null;
}

function participantsTable(a: RelationAnalysisView, k: RelKit): Table[] {
  return repeatingHeaderTable(
    [k.t("participants.colTag"), k.t("participants.colName"), k.t("participants.colBirthDate"), k.t("participants.colTime"), k.t("participants.colPlace")],
    [10, 34, 18, 10, 28],
    a.participants.map((p) => [participantTag(a.kind, p.position), safe(p.name), dmy(p.birthDate, k), p.birthTime ?? "—", safe(p.birthPlace ?? "—")]),
  );
}

/** Eski raporlar: tarayıcıda yakalanıp donmuş standart (Roxy) grafik. */
const LEGEND_CONNECTION_STANDARD = ["legend.standard1", "legend.standard2", "legend.standard3"];
/** Yaşam Sistemi birleşik BodyGraph'ı (ekrandaki grafikle aynı çizim). */
const LEGEND_CONNECTION = ["legend.connection1", "legend.connection2", "legend.connection3"];
/** PASİF (rendererConfig "legacy-*"): ilk Yaşam Sistemi şematik birleşik çizim lejantı (silinmedi). */
const LEGEND_CONNECTION_SCHEMATIC = ["legend.schematic1", "legend.schematic2", "legend.schematic3", "legend.schematic4"];
const LEGEND_PENTA = ["legend.penta1", "legend.penta2"];

function connectionBody(a: RelationAnalysisView, r: HdConnectionResult, k: RelKit): ReportChild[] {
  const nameOf = (tag: "A" | "B") => safe(a.participants[tag === "A" ? 0 : 1]?.name ?? tag);
  const out: ReportChild[] = [];
  out.push(h1(k.t("conn.summaryHeading"), true));
  out.push(
    twoColTable([
      [k.t("conn.channelCount"), String(r.totalChannels)],
      ...DYNAMIC_ORDER.map((d) => [k.dynamic(d), String(r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]])] as [string, string]),
      [k.t("conn.combinedDefinition"), k.combinedDefinition(r.combinedDefinition)],
    ]),
  );
  out.push(h2(k.t("conn.typesHeading")));
  for (const d of DYNAMIC_ORDER) out.push(bodyText(`${k.dynamic(d)}: ${k.dynamicDef(d)}`, 20));
  out.push(h1(k.t("conn.channelsHeading"), true));
  if (r.channels.length === 0) out.push(muted(k.t("conn.noChannels")));
  for (const d of DYNAMIC_ORDER) {
    const list = r.channels.filter((c) => c.dynamic === d);
    if (list.length === 0) continue;
    out.push(h2(`${k.dynamic(d)} — ${list.length}`, { keepNext: true }));
    out.push(
      ...repeatingHeaderTable(
        [k.t("conn.colChannel"), k.t("conn.colCircuit"), k.t("conn.colCenters"), `A: ${nameOf("A")}`, `B: ${nameOf("B")}`],
        [30, 16, 22, 16, 16],
        list.map((c) => [
          safe(k.channel(c.id, c.name)),
          k.circuit(c.circuit),
          (channelCenterCodes(c.id) ?? []).map((x) => k.center(x).replace(/\s*\(.*\)$/, "")).join(" ↔ "),
          c.personAGates.length ? c.personAGates.join(", ") : "—",
          c.personBGates.length ? c.personBGates.join(", ") : "—",
        ]),
      ),
    );
  }
  out.push(...activeGatesBody(a, r, k));
  out.push(h1(k.t("conn.centersHeading"), true));
  out.push(muted(k.t("conn.centersNote")));
  out.push(
    ...repeatingHeaderTable(
      [k.t("conn.colCenter"), k.t("conn.colCombined"), k.t("conn.colDefinedBy")],
      [40, 22, 38],
      r.centers.map((c) => [
        k.center(c.code),
        c.defined ? k.t("conn.defined") : k.t("conn.notDefined"),
        c.definedBy.length === 2 ? k.t("conn.both", { a: nameOf("A"), b: nameOf("B") }) : c.definedBy.length === 1 ? `${c.definedBy[0]}: ${nameOf(c.definedBy[0])}` : k.t("conn.none"),
      ]),
    ),
  );
  return out;
}

/** Yarım kanallar + kişilerin tüm aktif kapıları (snapshot'taki kayıtlı bireysel veriden; yoksa açık not). */
function activeGatesBody(a: RelationAnalysisView, r: HdConnectionResult, k: RelKit): ReportChild[] {
  const nameOf = (tag: "A" | "B") => safe(a.participants[tag === "A" ? 0 : 1]?.name ?? tag);
  const out: ReportChild[] = [h1(k.t("gates.heading"), true)];
  const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r);
  if (!m.ok) {
    out.push(muted(k.t("gates.noSource")));
    return out;
  }
  const holder = (h: "A" | "B" | "both" | null) => (h === "both" ? k.t("gates.holderBoth", { a: nameOf("A"), b: nameOf("B") }) : h ? `${h}: ${nameOf(h)}` : "—");
  const halves = Object.values(m.model.channels).filter((c): c is Extract<typeof c, { state: "half" }> => c.state === "half").sort((x, y) => Number(x.id.split("-")[0]) - Number(y.id.split("-")[0]));
  out.push(muted(k.t("gates.halfNote")));
  if (halves.length) {
    out.push(
      ...repeatingHeaderTable(
        [k.t("gates.colHalf"), k.t("gates.colLower"), k.t("gates.colUpper")],
        [40, 30, 30],
        halves.map((c) => {
          const [lo, hi] = c.id.split("-");
          return [safe(k.channel(c.id, c.id)), `${lo}: ${holder(c.holderA)}`, `${hi}: ${holder(c.holderB)}`];
        }),
      ),
    );
  } else out.push(muted(k.t("gates.noHalf")));
  const connected = new Set(r.channels.flatMap((c) => [c.gateA, c.gateB]));
  out.push(h2(k.t("gates.allHeading"), { keepNext: true }));
  for (const p of ["A", "B"] as const) {
    const gates = Object.entries(m.model.gates).filter(([, h]) => h === p || h === "both").map(([g]) => Number(g)).sort((x, y) => x - y);
    out.push(bodyText(`${p} — ${nameOf(p)}: ${gates.map((g) => (connected.has(g) ? `${g}*` : String(g))).join(", ") || "—"}`, 20));
  }
  out.push(muted(k.t("gates.starNote")));
  return out;
}

function pentaBody(a: RelationAnalysisView, r: HdPentaResult, k: RelKit): ReportChild[] {
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${safe(a.participants[i]?.name ?? "?")}`).join(", ") : "—");
  const out: ReportChild[] = [];
  out.push(h1(k.t("penta.summaryHeading"), true));
  out.push(
    twoColTable([
      [k.t("penta.memberCount"), String(r.memberCount)],
      [k.t("penta.definedChannels"), `${r.summary.definedChannels} / 6`],
      [k.t("penta.filledGates"), `${r.summary.filledGates} / 12`],
      [k.t("penta.core"), r.summary.coreDefined ? k.t("conn.defined") : k.t("conn.notDefined")],
      [k.t("penta.gapGates"), r.summary.gapGates.length ? r.summary.gapGates.join(", ") : k.t("penta.none")],
    ]),
  );
  out.push(bodyText(k.coreNote, 20));
  out.push(bodyText(k.gapNote, 20));
  for (const pos of ["upper", "lower"] as const) {
    out.push(h2(k.pentaPosition(pos), { keepNext: true }));
    out.push(muted(k.pentaPositionDef(pos)));
    out.push(
      ...repeatingHeaderTable(
        [k.t("penta.colChannel"), k.t("penta.colStatus"), k.t("penta.colGateA"), k.t("penta.colGateB")],
        [28, 16, 28, 28],
        r.channels.filter((c) => c.position === pos).map((c) => [
          safe(k.channel(c.id, c.name)) + (c.isCore ? k.t("penta.coreSuffix") : ""),
          c.defined ? k.t("penta.strong") : k.t("penta.gap"),
          `${c.gateA}: ${who(c.gateAHeldBy)}`,
          `${c.gateB}: ${who(c.gateBHeldBy)}`,
        ]),
      ),
    );
  }
  out.push(h1(k.t("penta.gatesHeading"), true));
  out.push(
    ...repeatingHeaderTable(
      [k.t("penta.colGate"), k.t("penta.colRole"), k.t("penta.colGateStatus"), k.t("penta.colHolders")],
      [10, 34, 16, 40],
      r.gates.map((g) => [String(g.gate), safe(k.gateName(g)), g.filled ? k.t("penta.filled") : k.t("penta.gapShort"), who(g.heldBy)]),
    ),
  );
  return out;
}

export type RelationReportOptions = {
  image: Buffer | null;
  logo?: Buffer | null;
  /**
   * F3A: uzman rapor markalaması. Owner kararı: "Raporu Hazırlayan" serbest metindir (preparedBy); profil
   * adı OTOMATİK yazılmaz. Markalama YALNIZ preparedBy doluysa kapak künyesine Unvan / Kurum satırı ekler.
   * null/yok → birebir. Veri kaynağı F1/F2 ile bağlanacak; route şimdilik null geçer.
   */
  branding?: ExpertBranding | null;
  brandingVariant?: ExpertBrandingVariant;
  /** Çıktı dili (lib/i18n/output.ts). Yok → kaynak dil (tr) = bugünkü çıktı bayt-eşit. */
  output?: OutputLocale | null;
};

/** preparedBy doluysa markalamadan Unvan/Kurum künye satırları (C: yalnız unvan). Aksi hâlde []. */
function preparedByCredentialRows(preparedBy: string | null, opts: RelationReportOptions, k: RelKit): [string, string][] {
  if (!preparedBy?.trim()) return [];
  const f = expertBrandingFields(opts.branding);
  if (!f) return [];
  const rows: [string, string][] = [];
  if (f.title) rows.push([k.t("cover.credTitle"), f.title]);
  if (f.organization && opts.brandingVariant !== "C") rows.push([k.t("cover.credOrg"), f.organization]);
  return rows;
}

/** EN: Bilgi Bankası grup başlıkları (donmuş TR sistem metni) grup anahtarından yeniden türetilir; kişi adı aynen. */
function knowledgeGroupTitle(g: KnowledgeGroup, k: RelKit): string {
  if (k.isTr) return g.title;
  if (g.key === "channels") return k.t("knowledgeGroup.channels");
  if (g.key === "penta-channels") return k.t("knowledgeGroup.pentaChannels");
  if (g.key === "penta-gates") return k.t("knowledgeGroup.pentaGates");
  if (g.scope === "individual" && g.person) return k.t("knowledgeGroup.person", { name: g.person });
  return g.title;
}

/** Ortak buildFooter ile AYNI yapı; "Sayfa" yalnız TR dışında katalogdan (ortak motor #855'e kadar parametre almıyor). */
function localizedFooter(reportName: string, k: RelKit): Footer {
  if (k.isTr) return buildFooter(reportName);
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: k.t("footer.page"), size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: " / ", size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: REPORT_FONT, color: C_LIGHT }),
          new TextRun({ text: `  ·  ${reportName}`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
        ],
      }),
    ],
  });
}

export function buildRelationReportDocument(s: RelationReportSnapshot, opts: RelationReportOptions): Document {
  const k = relKit(opts.output);
  const a = s.analysis;
  const title = k.t(a.kind === "connection" ? "title.connection" : "title.penta");
  const names = a.participants.map((p) => safe(p.name)).join(a.kind === "connection" ? " & " : ", ");
  const cover: ReportChild[] = [
    ...(opts.logo ? [embedImageParagraph(opts.logo, 180, 135)] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: opts.logo ? 600 : 1800, after: 200 }, children: [new TextRun({ text: title, bold: true, size: 40, font: REPORT_FONT, color: C_DARK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: names, size: 28, font: REPORT_FONT, color: C_MID })] }),
    twoColTable([
      [k.t("cover.kind"), k.kind(a.kind)],
      ...(a.relationType ? ([[k.t("cover.relationType"), k.type(a.relationType)]] as [string, string][]) : []),
      [k.t("cover.analysisDate"), dmy(a.createdAt, k)],
      [k.t("cover.reportDate"), dmy(s.generatedAt, k)],
      [k.t("cover.memberCount"), String(a.memberCount)],
      ...(s.preparedBy ? ([[k.t("cover.preparedBy"), safe(s.preparedBy)]] as [string, string][]) : []),
      ...preparedByCredentialRows(s.preparedBy, opts, k),
    ]),
    muted(k.disclaimer),
  ];
  const body: ReportChild[] = [h1(k.t("participants.heading")), ...participantsTable(a, k)];
  for (const p of a.participants) {
    const note = statusNote(p.status, k);
    if (note) body.push(muted(`${participantTag(a.kind, p.position)} — ${safe(p.name)}: ${note}`));
  }
  // Görsel (ana grafik). Görsel notu (snapshot'ta donmuş TR sistem metni) TR'de aynen; diğer dillerde katalogdan.
  const imageReason = s.image.reason ? (k.isTr ? s.image.reason : k.t("image.resultOnlyNote")) : null;
  body.push(h1(k.t(a.kind === "connection" ? "image.headingConnection" : "image.headingPenta"), true));
  if (opts.image) {
    body.push(embedImageParagraph(opts.image, a.kind === "connection" ? 440 : 400, 620));
    const standard = a.kind === "connection" && s.image.source === "standard";
    if (imageReason) body.push(muted(imageReason));
    const connLegend = standard ? LEGEND_CONNECTION_STANDARD : HD_CONNECTION_BODYGRAPH === "premium" ? LEGEND_CONNECTION : LEGEND_CONNECTION_SCHEMATIC;
    for (const l of a.kind === "connection" ? connLegend : LEGEND_PENTA) body.push(muted(k.t(l)));
    if (a.kind === "penta") body.push(muted(a.participants.map((p) => `${p.position + 1}. ${safe(p.name)}`).join(" · ")));
  } else {
    body.push(muted(imageReason ?? k.t("image.missing")));
  }
  body.push(...(a.kind === "connection" ? connectionBody(a, a.result as HdConnectionResult, k) : pentaBody(a, a.result as HdPentaResult, k)));

  if (s.sections.analysis) {
    // Analiz açıklamaları seçildiyse: TR'de donmuş metin aynen; diğer dillerde AYNI kayıtlı sonuçtan aynı dilde üretilir
    // (deterministik açıklama üreticisi; hesap/sağlayıcı çağrısı yok).
    const names2 = a.participants.map((p) => p.name);
    const lang = k.isTr ? null : ("en" as const);
    const sections = lang
      ? a.kind === "connection"
        ? connectionExplanations(a.result as HdConnectionResult, names2[0] ?? "A", names2[1] ?? "B", lang)
        : pentaExplanations(a.result as HdPentaResult, names2, lang)
      : s.sections.analysis;
    body.push(h1(k.t("sections.analysisHeading"), true));
    body.push(muted(k.explanationSource));
    for (const sec of sections) {
      body.push(h2(safe(sec.title), { keepNext: true }));
      for (const it of sec.items) {
        body.push(h3(safe(it.title), { keepNext: true }));
        body.push(bodyText(hdXmlSafeMultiline(it.text), 21));
      }
    }
    body.push(muted(k.explanationDisclaimer));
  }
  if (s.sections.knowledge && s.sections.knowledge.length) {
    body.push(h1(k.t("sections.knowledgeHeading"), true));
    body.push(muted(k.t("sections.knowledgeNote")));
    for (const g of s.sections.knowledge) {
      body.push(h2(safe(knowledgeGroupTitle(g, k)), { keepNext: true }));
      for (const e of g.entries) {
        body.push(h3(safe(e.title), { keepNext: true }));
        body.push(bodyText(e.content, 21));
      }
    }
  }
  if (s.sections.expertComment) {
    body.push(h1(k.t("sections.expertHeading"), true));
    for (const para of s.sections.expertComment.split(/\n{2,}/)) body.push(bodyText(para, 22));
  }
  body.push(muted(k.disclaimer));
  return new Document({
    creator: "Yaşam Sistemi",
    title: safe(`${title} — ${names}`),
    styles: { default: { document: { run: { font: REPORT_FONT, ...(k.isTr ? {} : { language: { value: k.documentLang } }) } } } },
    sections: [
      { properties: { page: PAGE }, children: cover },
      { properties: { page: PAGE }, headers: { default: buildHeader(k.t(a.kind === "connection" ? "header.connection" : "header.penta")) }, footers: { default: localizedFooter(title, k) }, children: body },
    ],
  });
}

export async function renderRelationReportBuffer(s: RelationReportSnapshot, opts: RelationReportOptions): Promise<Buffer> {
  return Packer.toBuffer(buildRelationReportDocument(s, opts));
}

export function relationReportFilename(a: RelationAnalysisView, generatedAt: string, output?: OutputLocale | null): string {
  const k = relKit(output);
  const slug = a.participants
    .map((p) => p.name)
    .join("-")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || k.t("file.fallback");
  return `${k.t(a.kind === "connection" ? "file.connection" : "file.penta")}-${slug}-${(generatedAt ?? "").slice(0, 10)}.docx`;
}
