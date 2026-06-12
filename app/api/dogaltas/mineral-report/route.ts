import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export const runtime = "nodejs";

const FONT = "Calibri";
const C_DARK = "1e293b";
const C_MID = "475569";
const C_LIGHT = "94a3b8";

// ─── Types ────────────────────────────────────────────────────────────────────

type ExportMode = "all" | "filtered" | "viewed" | "selected";

type MineralRow = {
  id: string;
  name: string;
  aciklama: string | null;
  kategori: string | null;
  source_id: string | null;
  fiziksel: string[] | null;
  zihinsel: string[] | null;
  fizyoloji: string[] | null;
  eksiklik_belirtileri: string[] | null;
  fazlalik_belirtileri: string[] | null;
  doz_asimi: string[] | null;
  iceren_taslar: string[] | null;
  organ_etkileri: string[] | null;
  cakralar: string[] | null;
  created_at: string | null;
};

type FileChild = Paragraph | Table;

// ─── Paragraph builders ───────────────────────────────────────────────────────

function coverLine(text: string, size: number, bold = false, color = C_MID): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: FONT, color })],
    spacing: { after: 180 },
  });
}

function h1(text: string, pageBreak = false): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 280 },
    pageBreakBefore: pageBreak,
  });
}

function h2(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 200 },
  });
}

function fieldInline(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 22, font: FONT, color: C_DARK }),
      new TextRun({ text: value, size: 22, font: FONT, color: C_MID }),
    ],
    spacing: { after: 100 },
  });
}

function fieldLabel(label: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}:`, bold: true, size: 22, font: FONT, color: C_DARK })],
    spacing: { before: 160, after: 60 },
  });
}

function bodyText(text: string, size = 22): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size, font: FONT, color: C_MID })],
    indent: { left: 360 },
    spacing: { after: 120 },
  });
}

function muted(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, size: 20, font: FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 200 },
  });
}

function divider(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 280, after: 280 },
  });
}

function spacer(): Paragraph {
  return new Paragraph({ spacing: { after: 180 } });
}

function arraySection(label: string, arr: string[] | null): Paragraph[] {
  const items = arr?.filter(Boolean) ?? [];
  if (!items.length) return [];
  return [
    fieldLabel(label),
    ...items.map((item) =>
      new Paragraph({
        children: [
          new TextRun({ text: "·  ", size: 20, font: FONT, color: C_LIGHT }),
          new TextRun({ text: item.trim(), size: 20, font: FONT, color: C_MID }),
        ],
        indent: { left: 360 },
        spacing: { after: 80 },
      })
    ),
  ];
}

// ─── Summary table ────────────────────────────────────────────────────────────

function twoColTable(rows: [string, string][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 3000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: label, bold: true, size: 22, font: FONT, color: C_DARK })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
          new TableCell({
            width: { size: 6000, type: WidthType.DXA },
            children: [new Paragraph({
              children: [new TextRun({ text: value, size: 22, font: FONT, color: C_MID })],
              spacing: { before: 100, after: 100 },
              indent: { left: 120 },
            })],
          }),
        ],
      })
    ),
  });
}

// ─── Document builder ─────────────────────────────────────────────────────────

function buildDocument(minerals: MineralRow[], exportLabel: string): FileChild[] {
  const date = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const uniqueSources = new Set(minerals.map((m) => m.source_id).filter(Boolean)).size;
  const withTaslar = minerals.filter((m) => m.iceren_taslar?.length).length;

  const out: FileChild[] = [];

  // Cover
  out.push(
    new Paragraph({ spacing: { before: 1400 } }),
    coverLine("YAŞAM SİSTEMİ", 60, true, C_DARK),
    coverLine("MİNERAL BANKASI", 44, false, C_MID),
    coverLine("Profesyonel Mineral Raporu", 30, false, C_MID),
    spacer(),
    coverLine(`Oluşturulma Tarihi: ${date}`, 22, false, C_LIGHT),
    coverLine(`Toplam Mineral Sayısı: ${minerals.length}`, 22, false, C_LIGHT),
    coverLine(`Kapsam: ${exportLabel}`, 22, false, C_LIGHT),
  );

  // Genel Özet
  out.push(
    h1("Genel Özet", true),
    muted("İstatistik özeti"),
    twoColTable([
      ["Toplam Mineral", `${minerals.length}`],
      ["Kaynak Sayısı", `${uniqueSources}`],
      ["Taş İçeren Mineraller", `${withTaslar}`],
    ]),
  );

  // Minerals
  out.push(h1("Mineral Kayıtları", true));
  out.push(muted(`${minerals.length} mineral`));

  for (let i = 0; i < minerals.length; i++) {
    const m = minerals[i]!;
    if (i > 0) out.push(divider());

    out.push(h2(m.name || "İsimsiz Mineral"));

    if (m.kategori?.trim())  out.push(fieldInline("Kategori", m.kategori.trim()));
    if (m.source_id?.trim()) out.push(fieldInline("Kaynak", m.source_id.trim()));
    if (m.created_at)        out.push(fieldInline("Tarih", new Date(m.created_at).toLocaleDateString("tr-TR")));

    if (m.aciklama?.trim()) {
      out.push(fieldLabel("Açıklama"));
      out.push(bodyText(m.aciklama.trim()));
    }

    out.push(...arraySection("Fiziksel Özellikler", m.fiziksel));
    out.push(...arraySection("Zihinsel Etkiler", m.zihinsel));
    out.push(...arraySection("Fizyoloji", m.fizyoloji));
    out.push(...arraySection("Eksiklik Belirtileri", m.eksiklik_belirtileri));
    out.push(...arraySection("Fazlalık Belirtileri", m.fazlalik_belirtileri));
    out.push(...arraySection("Doz Aşımı", m.doz_asimi));
    out.push(...arraySection("İçeren Taşlar", m.iceren_taslar));
    out.push(...arraySection("Organ Etkileri", m.organ_etkileri));
    out.push(...arraySection("Çakralar", m.cakralar));
  }

  return out;
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", mineralIds } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    mineralIds?: string[];
  };

  if (!tenantId || typeof tenantId !== "string") {
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const SELECT =
    "id, name, aciklama, kategori, source_id, fiziksel, zihinsel, fizyoloji, eksiklik_belirtileri, fazlalik_belirtileri, doz_asimi, iceren_taslar, organ_etkileri, cakralar, created_at";

  let q = db.from("minerals").select(SELECT).eq("tenant_id", tenantId);

  let exportLabel = "Tüm Mineraller";

  if ((exportMode === "filtered" || exportMode === "viewed" || exportMode === "selected") &&
      Array.isArray(mineralIds) && mineralIds.length > 0) {
    q = q.in("id", mineralIds);
    exportLabel =
      exportMode === "viewed" ? "Görüntülenen Kayıtlar" :
      exportMode === "selected" ? "Seçili Mineraller" :
      "Filtrelenmiş Sonuçlar";
  }

  const { data, error } = await q.order("name");

  if (error) {
    return Response.json({ ok: false, error: `Veri okunamadı: ${error.message}` }, { status: 500 });
  }

  const minerals = (data ?? []) as MineralRow[];
  if (!minerals.length) {
    return Response.json({ ok: false, error: "Bu seçim için mineral bulunamadı." }, { status: 404 });
  }

  const allChildren = buildDocument(minerals, exportLabel);

  const doc = new Document({
    sections: [{
      properties: {},
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Sayfa ", size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ text: " / ", size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: FONT, color: C_LIGHT }),
              new TextRun({ text: "  ·  Yaşam Sistemi Mineral Bankası", size: 18, font: FONT, color: C_LIGHT }),
            ],
          })],
        }),
      },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const dateSlug = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="mineral-bankasi-raporu-${dateSlug}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
