// İlişki (Connection) ve Grup (Penta) — profesyonel Word (.docx) raporu (SAF; ağ/DB YOK).
//
//   • Kaynak YALNIZ kayıtlı rapor snapshot'ı (DONMUŞ içerik) → yeni Roxy çağrısı YOK; kayıtlı rapor
//     tekrar indirilince içerik değişmez. Görsel snapshot'taki kayıtlı veriden aynı sahneyle çizilir.
//   • Her durumda: katılımcılar (etiket A/B ya da 1–5 + ad) + teknik sonuçlar. İsteğe bağlı (yalnız
//     raporda seçildiyse): Analiz Açıklamaları · Bilgi Bankası kayıtları (özel çalışma notu YOK) · Uzman Yorumu.
//   • Sağlayıcı adı / uç / adaptör / nodeType RAPORDA YOK.
//   • Mevcut tek kişilik BodyGraph Word raporu DEĞİŞTİRİLMEDİ; ortak docx yardımcıları kullanılır.

import { AlignmentType, Document, Packer, Paragraph, TextRun, type Table } from "docx";
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
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { hdXmlSafeLine, hdXmlSafeMultiline } from "../reporting/xmlSafeText";
import { hdCenterLabelFromCode } from "../codeHelpers";
import { hdGateDefaultName } from "../knowledge/hdNames";
import { channelCenterCodes, type HdConnectionResult } from "./connection";
import type { HdPentaResult } from "./penta";
import type { RelationAnalysisView } from "./relationService";
import { buildCompositeModel } from "./compositeModel";
import type { RelationReportSnapshot } from "./relationExtras";
import { ANALYSIS_EXPLANATION_DISCLAIMER, ANALYSIS_EXPLANATION_SOURCE } from "./explanations";
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

function dmy(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "—";
}

const STATUS_NOTE: Record<RelationAnalysisView["participants"][number]["status"], string | null> = {
  current: null,
  birth_data_changed: "Danışanın doğum bilgisi bu analizden sonra değişmiştir; analiz o tarihteki kayıtlı bilgilerle hazırlanmıştır.",
  source_chart_deleted: "Kaynak bireysel analiz sonradan silinmiş ya da değiştirilmiştir; bu sonuç tarihsel kayıttır.",
  client_deleted: "Danışan profili sonradan silinmiştir; ad tarihsel kayıttan gösterilir.",
};

function participantsTable(a: RelationAnalysisView): Table[] {
  return repeatingHeaderTable(
    ["Kişi", "Ad Soyad", "Doğum Tarihi", "Saat", "Doğum Yeri"],
    [10, 34, 18, 10, 28],
    a.participants.map((p) => [participantTag(a.kind, p.position), safe(p.name), dmy(p.birthDate), p.birthTime ?? "—", safe(p.birthPlace ?? "—")]),
  );
}

/** Eski raporlar: tarayıcıda yakalanıp donmuş standart (Roxy) grafik. */
const LEGEND_CONNECTION_STANDARD = [
  "Standart Human Design birleşik BodyGraph'ı. Renk kişiyi gösterir: mavi = A, turuncu = B; iki renkli (yarım yarım) kapı = iki kişide de aktif.",
  "Grafikte yalnız iki kişinin BİRLİKTE tamamladığı kanallar çizilir. İki renkli kanal = Elektromanyetik; tek renkli kanal = Baskınlık, Uzlaşma ya da Arkadaşlık (türü aşağıdaki tabloda).",
  "Renkli merkez = birleşik haritada tanımlı; beyaz merkez = açık. Yarım kanallar ve kişilerin tüm aktif kapıları 'Yarım Kanallar ve Aktif Kapılar' bölümündedir.",
];
/** Yaşam Sistemi birleşik BodyGraph'ı (ekrandaki grafikle aynı çizim). */
const LEGEND_CONNECTION = [
  "Renk kişiyi gösterir: mavi = A, turuncu = B. Aktif kapı kanalın kendi yarısını kişinin rengine boyar; mavi zemin üzerinde turuncu çizgili yarı ve iki renkli kapı = iki kişide ortak kapı.",
  "İki yarısı da boyalı ve ortasında bağlantı türü işareti olan kanal = birleşik haritada tanımlı. Yalnız bir yarısı boyalı kanal = yarım kanal (tanımlı değil).",
  "Bağlantı türü işareti: ◆ Elektromanyetik · ▲ Baskınlık · ■ Uzlaşma · ● Arkadaşlık / Eşlik.",
  "Renkli merkez = birleşik haritada tanımlı; beyaz merkez = açık.",
];
const LEGEND_PENTA = [
  "Kalın mor çizgi = grupta tanımlı Penta kanalı (güçlü yön); pembe = 2/14 çekirdek tanımlı; noktalı gri = boşluk var (kanal tamamlanmıyor).",
  "Kapının yanındaki numaralı rozetler o kapıyı taşıyan üyeleri gösterir (numara = üye sırası); kesikli kapı + 'boşluk' = hiçbir üye taşımıyor.",
];

function connectionBody(a: RelationAnalysisView, r: HdConnectionResult): ReportChild[] {
  const nameOf = (tag: "A" | "B") => safe(a.participants[tag === "A" ? 0 : 1]?.name ?? tag);
  const out: ReportChild[] = [];
  out.push(h1("Bağlantı Özeti", true));
  out.push(
    twoColTable([
      ["Bağlı kanal sayısı", String(r.totalChannels)],
      ...DYNAMIC_ORDER.map((d) => [DYNAMIC_LABEL[d], String(r.summary[d.toLowerCase() as keyof HdConnectionResult["summary"]])] as [string, string]),
      ["Birleşik Tanım (Combined Definition)", combinedDefinitionLabel(r.combinedDefinition)],
    ]),
  );
  out.push(h2("Bağlantı Türleri"));
  for (const d of DYNAMIC_ORDER) out.push(bodyText(`${DYNAMIC_LABEL[d]}: ${DYNAMIC_DEFINITION[d]}`, 20));
  out.push(h1("Kanal Bağlantıları", true));
  if (r.channels.length === 0) out.push(muted("İki kişi birlikte hiçbir kanalı tamamlamıyor."));
  for (const d of DYNAMIC_ORDER) {
    const list = r.channels.filter((c) => c.dynamic === d);
    if (list.length === 0) continue;
    out.push(h2(`${DYNAMIC_LABEL[d]} — ${list.length}`, { keepNext: true }));
    out.push(
      ...repeatingHeaderTable(
        ["Kanal", "Devre", "Merkezler", `A: ${nameOf("A")}`, `B: ${nameOf("B")}`],
        [30, 16, 22, 16, 16],
        list.map((c) => [
          safe(relationChannelLabel(c.id, c.name)),
          circuitLabel(c.circuit),
          (channelCenterCodes(c.id) ?? []).map((x) => hdCenterLabelFromCode(x).replace(/\s*\(.*\)$/, "")).join(" ↔ "),
          c.personAGates.length ? c.personAGates.join(", ") : "—",
          c.personBGates.length ? c.personBGates.join(", ") : "—",
        ]),
      ),
    );
  }
  out.push(...activeGatesBody(a, r));
  out.push(h1("Birleşik Merkezler", true));
  out.push(muted("Birleşik haritada bir kanal, iki kişi birlikte iki kapısını da taşıdığında tanımlı sayılır. Son sütun merkezi KENDİ haritasında kimin tanımladığını gösterir."));
  out.push(
    ...repeatingHeaderTable(
      ["Merkez", "Birleşik Haritada", "Kendi Haritasında Tanımlayan"],
      [40, 22, 38],
      r.centers.map((c) => [
        hdCenterLabelFromCode(c.code),
        c.defined ? "Tanımlı" : "Tanımlı değil",
        c.definedBy.length === 2 ? `Her ikisi (${nameOf("A")}, ${nameOf("B")})` : c.definedBy.length === 1 ? `${c.definedBy[0]}: ${nameOf(c.definedBy[0])}` : "Hiçbiri",
      ]),
    ),
  );
  return out;
}

/** Yarım kanallar + kişilerin tüm aktif kapıları (snapshot'taki kayıtlı bireysel veriden; yoksa açık not). */
function activeGatesBody(a: RelationAnalysisView, r: HdConnectionResult): ReportChild[] {
  const nameOf = (tag: "A" | "B") => safe(a.participants[tag === "A" ? 0 : 1]?.name ?? tag);
  const out: ReportChild[] = [h1("Yarım Kanallar ve Aktif Kapılar", true)];
  const m = buildCompositeModel(a.participants[0]?.gates ?? null, a.participants[1]?.gates ?? null, r);
  if (!m.ok) {
    out.push(muted("Kaynak bireysel analiz verisi bu raporda bulunmadığı için yarım kanallar ve kişilerin tüm aktif kapıları gösterilemiyor."));
    return out;
  }
  const holder = (h: "A" | "B" | "both" | null) => (h === "both" ? `${nameOf("A")} ve ${nameOf("B")}` : h ? `${h}: ${nameOf(h)}` : "—");
  const halves = Object.values(m.model.channels).filter((c): c is Extract<typeof c, { state: "half" }> => c.state === "half").sort((x, y) => Number(x.id.split("-")[0]) - Number(y.id.split("-")[0]));
  out.push(muted("Yarım kanal: birlikte kanalın yalnız bir kapısı aktif; birleşik haritada tanımlı değildir."));
  if (halves.length) {
    out.push(
      ...repeatingHeaderTable(
        ["Yarım kanal", "Alt kapı — taşıyan", "Üst kapı — taşıyan"],
        [40, 30, 30],
        halves.map((c) => {
          const [lo, hi] = c.id.split("-");
          return [safe(relationChannelLabel(c.id, c.id)), `${lo}: ${holder(c.holderA)}`, `${hi}: ${holder(c.holderB)}`];
        }),
      ),
    );
  } else out.push(muted("Yarım kanal yok."));
  const connected = new Set(r.channels.flatMap((c) => [c.gateA, c.gateB]));
  out.push(h2("Kişilerin tüm aktif kapıları", { keepNext: true }));
  for (const p of ["A", "B"] as const) {
    const gates = Object.entries(m.model.gates).filter(([, h]) => h === p || h === "both").map(([g]) => Number(g)).sort((x, y) => x - y);
    out.push(bodyText(`${p} — ${nameOf(p)}: ${gates.map((g) => (connected.has(g) ? `${g}*` : String(g))).join(", ") || "—"}`, 20));
  }
  out.push(muted("* Birlikte tamamlanan bir kanala ait kapı."));
  return out;
}

function pentaBody(a: RelationAnalysisView, r: HdPentaResult): ReportChild[] {
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${safe(a.participants[i]?.name ?? "?")}`).join(", ") : "—");
  const out: ReportChild[] = [];
  out.push(h1("Grup Özeti", true));
  out.push(
    twoColTable([
      ["Üye sayısı", String(r.memberCount)],
      ["Tanımlı Penta kanalı (Güçlü yön)", `${r.summary.definedChannels} / 6`],
      ["Dolu Penta kapısı", `${r.summary.filledGates} / 12`],
      ["2/14 çekirdek (The Beat)", r.summary.coreDefined ? "Tanımlı" : "Tanımlı değil"],
      ["Eksik işlev kapıları (boşluk)", r.summary.gapGates.length ? r.summary.gapGates.join(", ") : "Yok"],
    ]),
  );
  out.push(bodyText(PENTA_CORE_NOTE, 20));
  out.push(bodyText(PENTA_GAP_NOTE, 20));
  for (const pos of ["upper", "lower"] as const) {
    out.push(h2(PENTA_POSITION_LABEL[pos], { keepNext: true }));
    out.push(muted(PENTA_POSITION_DEFINITION[pos]));
    out.push(
      ...repeatingHeaderTable(
        ["Kanal", "Durum", "Kapı A — taşıyan", "Kapı B — taşıyan"],
        [28, 16, 28, 28],
        r.channels.filter((c) => c.position === pos).map((c) => [
          safe(relationChannelLabel(c.id, c.name)) + (c.isCore ? " · çekirdek" : ""),
          c.defined ? "Güçlü yön (tanımlı)" : "Boşluk var",
          `${c.gateA}: ${who(c.gateAHeldBy)}`,
          `${c.gateB}: ${who(c.gateBHeldBy)}`,
        ]),
      ),
    );
  }
  out.push(h1("Penta Kapıları ve Katkılar", true));
  out.push(
    ...repeatingHeaderTable(
      ["Kapı", "Rol (kapı adı)", "Durum", "Taşıyan üye(ler)"],
      [10, 34, 16, 40],
      r.gates.map((g) => [String(g.gate), safe(hdGateDefaultName(g.gate) ?? g.gateNameLocalized ?? g.gateName), g.filled ? "Dolu" : "Boşluk", who(g.heldBy)]),
    ),
  );
  return out;
}

export type RelationReportOptions = { image: Buffer | null; logo?: Buffer | null };

export function buildRelationReportDocument(s: RelationReportSnapshot, opts: RelationReportOptions): Document {
  const a = s.analysis;
  const title = a.kind === "connection" ? "Human Design İlişki Analizi (Connection)" : "Human Design Grup Analizi (Penta)";
  const names = a.participants.map((p) => safe(p.name)).join(a.kind === "connection" ? " & " : ", ");
  const cover: ReportChild[] = [
    ...(opts.logo ? [embedImageParagraph(opts.logo, 180, 135)] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: opts.logo ? 600 : 1800, after: 200 }, children: [new TextRun({ text: title, bold: true, size: 40, font: REPORT_FONT, color: C_DARK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: names, size: 28, font: REPORT_FONT, color: C_MID })] }),
    twoColTable([
      ["Analiz türü", RELATION_KIND_LABEL[a.kind]],
      ...(a.relationType ? ([["İlişki bağlamı (yalnız bilgi)", RELATION_TYPE_LABEL[a.relationType]]] as [string, string][]) : []),
      ["Analiz tarihi", dmy(a.createdAt)],
      ["Rapor tarihi", dmy(s.generatedAt)],
      ["Kişi sayısı", String(a.memberCount)],
      ...(s.preparedBy ? ([["Raporu Hazırlayan", safe(s.preparedBy)]] as [string, string][]) : []),
    ]),
    muted(RELATION_DISCLAIMER),
  ];
  const body: ReportChild[] = [h1("Katılımcılar"), ...participantsTable(a)];
  for (const p of a.participants) {
    const note = STATUS_NOTE[p.status];
    if (note) body.push(muted(`${participantTag(a.kind, p.position)} — ${safe(p.name)}: ${note}`));
  }
  // Görsel (ana grafik)
  body.push(h1(a.kind === "connection" ? "Birleşik İlişki BodyGraph'ı" : "Penta Şeması", true));
  if (opts.image) {
    body.push(embedImageParagraph(opts.image, a.kind === "connection" ? 440 : 400, 620));
    const standard = a.kind === "connection" && s.image.source === "standard";
    if (s.image.reason) body.push(muted(s.image.reason));
    for (const l of a.kind === "connection" ? (standard ? LEGEND_CONNECTION_STANDARD : LEGEND_CONNECTION) : LEGEND_PENTA) body.push(muted(l));
    if (a.kind === "penta") body.push(muted(a.participants.map((p) => `${p.position + 1}. ${safe(p.name)}`).join(" · ")));
  } else {
    body.push(muted(s.image.reason ?? "Görsel bu raporda oluşturulamadı."));
  }
  body.push(...(a.kind === "connection" ? connectionBody(a, a.result as HdConnectionResult) : pentaBody(a, a.result as HdPentaResult)));

  if (s.sections.analysis) {
    body.push(h1("Analiz Açıklamaları", true));
    body.push(muted(ANALYSIS_EXPLANATION_SOURCE));
    for (const sec of s.sections.analysis) {
      body.push(h2(safe(sec.title), { keepNext: true }));
      for (const it of sec.items) {
        body.push(h3(safe(it.title), { keepNext: true }));
        body.push(bodyText(hdXmlSafeMultiline(it.text), 21));
      }
    }
    body.push(muted(ANALYSIS_EXPLANATION_DISCLAIMER));
  }
  if (s.sections.knowledge && s.sections.knowledge.length) {
    body.push(h1("Bilgi Bankamdaki Açıklamalar", true));
    body.push(muted("Uzmanın kendi Bilgi Bankası kayıtları. Kişiye ait bireysel kayıtlar kişinin adıyla belirtilmiştir; genel kanal/kapı kayıtları ilişki/grup yorumu değildir."));
    for (const g of s.sections.knowledge) {
      body.push(h2(safe(g.title), { keepNext: true }));
      for (const e of g.entries) {
        body.push(h3(safe(e.title), { keepNext: true }));
        body.push(bodyText(e.content, 21));
      }
    }
  }
  if (s.sections.expertComment) {
    body.push(h1("Uzman Yorumu", true));
    for (const para of s.sections.expertComment.split(/\n{2,}/)) body.push(bodyText(para, 22));
  }
  body.push(muted(RELATION_DISCLAIMER));
  return new Document({
    creator: "Yaşam Sistemi",
    title: safe(`${title} — ${names}`),
    styles: { default: { document: { run: { font: REPORT_FONT } } } },
    sections: [
      { properties: { page: PAGE }, children: cover },
      { properties: { page: PAGE }, headers: { default: buildHeader(a.kind === "connection" ? "Human Design · İlişki Analizi" : "Human Design · Grup Analizi") }, footers: { default: buildFooter(title) }, children: body },
    ],
  });
}

export async function renderRelationReportBuffer(s: RelationReportSnapshot, opts: RelationReportOptions): Promise<Buffer> {
  return Packer.toBuffer(buildRelationReportDocument(s, opts));
}

export function relationReportFilename(a: RelationAnalysisView, generatedAt: string): string {
  const slug = a.participants
    .map((p) => p.name)
    .join("-")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "analiz";
  return `${a.kind === "connection" ? "HD-Iliski" : "HD-Grup-Penta"}-${slug}-${(generatedAt ?? "").slice(0, 10)}.docx`;
}
