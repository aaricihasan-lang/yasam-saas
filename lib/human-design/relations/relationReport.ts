// İlişki (Connection) ve Grup (Penta) analizleri — profesyonel Word (.docx) raporu (SAF; ağ/DB YOK).
//
//   • Kaynak YALNIZ kayıtlı analiz görünümü (getRelationAnalysis) → yeni Roxy çağrısı YOK.
//   • Ham sağlayıcı yanıtı (provider_raw) rapora girmez; API anahtarı hiçbir koşulda yok.
//   • Başlık Connection / Penta ayrımını taşır; katılımcılar etiket (A/B ya da 1–5) + adla eşleşir.
//   • Mevcut tek kişilik BodyGraph Word raporu DEĞİŞTİRİLMEDİ; ortak docx yardımcıları kullanılır.

import { AlignmentType, Document, Packer, Paragraph, TextRun, type Table } from "docx";
import {
  bodyText,
  buildFooter,
  buildHeader,
  h1,
  h2,
  muted,
  repeatingHeaderTable,
  twoColTable,
  REPORT_FONT,
  C_DARK,
  C_MID,
  type ReportChild,
} from "@/lib/docx/reportHelpers";
import { hdXmlSafeLine } from "../reporting/xmlSafeText";
import { hdCenterLabelFromCode } from "../codeHelpers";
import { hdGateDefaultName } from "../knowledge/hdNames";
import { channelCenterCodes, type HdConnectionResult } from "./connection";
import type { HdPentaResult } from "./penta";
import type { RelationAnalysisView } from "./relationService";
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

function connectionBody(a: RelationAnalysisView, r: HdConnectionResult): ReportChild[] {
  const nameOf = (tag: "A" | "B") => safe(a.participants[tag === "A" ? 0 : 1]?.name ?? tag);
  const out: ReportChild[] = [];
  out.push(h1("Bağlantı Özeti"));
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

  out.push(h1("Birleşik Merkezler", true));
  out.push(muted("Birleşik haritada bir kanal, iki kişi birlikte iki kapısını da taşıdığında tanımlı sayılır. Sütun, merkezi KENDİ haritasında kimin tanımladığını gösterir."));
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

function pentaBody(a: RelationAnalysisView, r: HdPentaResult): ReportChild[] {
  const who = (idx: number[]) => (idx.length ? idx.map((i) => `${i + 1}. ${safe(a.participants[i]?.name ?? "?")}`).join(", ") : "—");
  const out: ReportChild[] = [];
  out.push(h1("Grup Özeti"));
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
    out.push(h1(PENTA_POSITION_LABEL[pos], pos === "upper"));
    out.push(muted(PENTA_POSITION_DEFINITION[pos]));
    out.push(
      ...repeatingHeaderTable(
        ["Kanal", "Durum", "Kapı A — taşıyan", "Kapı B — taşıyan"],
        [28, 16, 28, 28],
        r.channels
          .filter((c) => c.position === pos)
          .map((c) => [
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
      r.gates.map((g) => [
        String(g.gate),
        safe(hdGateDefaultName(g.gate) ?? g.gateNameLocalized ?? g.gateName),
        g.filled ? "Dolu" : "Boşluk",
        who(g.heldBy),
      ]),
    ),
  );
  out.push(h2("Üye Katkıları", { keepNext: true }));
  for (const p of a.participants) {
    const gates = r.gates.filter((g) => g.heldBy.includes(p.position)).map((g) => g.gate);
    out.push(bodyText(`${p.position + 1}. ${safe(p.name)}: ${gates.length ? `Penta kapıları ${gates.join(", ")}` : "Penta kapısı taşımıyor"}`, 20));
  }
  return out;
}

export function buildRelationReportDocument(a: RelationAnalysisView, opts: { logo?: Buffer | null } = {}): Document {
  void opts;
  const title = a.kind === "connection" ? "Human Design İlişki Analizi (Connection)" : "Human Design Grup Analizi (Penta)";
  const names = a.participants.map((p) => safe(p.name)).join(a.kind === "connection" ? " & " : ", ");
  const cover: ReportChild[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1800, after: 200 }, children: [new TextRun({ text: title, bold: true, size: 40, font: REPORT_FONT, color: C_DARK })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: names, size: 28, font: REPORT_FONT, color: C_MID })] }),
    twoColTable([
      ["Analiz türü", RELATION_KIND_LABEL[a.kind]],
      ...(a.relationType ? ([["İlişki bağlamı (yalnız bilgi)", RELATION_TYPE_LABEL[a.relationType]]] as [string, string][]) : []),
      ["Analiz tarihi", dmy(a.createdAt)],
      ["Kişi sayısı", String(a.memberCount)],
      ["Hesaplama kaynağı", `RoxyAPI ${a.provider.endpoint} · nodeType: ${a.provider.nodeType} · ${a.provider.adapterVersion}`],
    ]),
    muted(RELATION_DISCLAIMER),
  ];
  const body: ReportChild[] = [h1("Katılımcılar"), ...participantsTable(a)];
  for (const p of a.participants) {
    const note = STATUS_NOTE[p.status];
    if (note) body.push(muted(`${participantTag(a.kind, p.position)} — ${safe(p.name)}: ${note}`));
  }
  body.push(...(a.kind === "connection" ? connectionBody(a, a.result as HdConnectionResult) : pentaBody(a, a.result as HdPentaResult)));
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

export async function renderRelationReportBuffer(a: RelationAnalysisView): Promise<Buffer> {
  return Packer.toBuffer(buildRelationReportDocument(a));
}

export function relationReportFilename(a: RelationAnalysisView): string {
  const slug = a.participants
    .map((p) => p.name)
    .join("-")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "analiz";
  return `${a.kind === "connection" ? "HD-Iliski" : "HD-Grup-Penta"}-${slug}-${(a.createdAt ?? "").slice(0, 10)}.docx`;
}
