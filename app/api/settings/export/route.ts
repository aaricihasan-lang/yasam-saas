import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from "docx";

export const runtime = "nodejs";

type ModuleKey = "clients" | "stones" | "numerology" | "digital_content";

type ModuleDef = {
  label: string;
  table: string;
  columns: { key: string; label: string }[];
};

const MODULE_DEFS: Record<ModuleKey, ModuleDef> = {
  clients: {
    label: "Danışan Yolculuğu",
    table: "clients",
    columns: [
      { key: "full_name", label: "Ad Soyad" },
      { key: "phone", label: "Telefon" },
      { key: "email", label: "E-posta" },
      { key: "birth_date", label: "Doğum Tarihi" },
      { key: "notes", label: "Notlar" },
      { key: "created_at", label: "Kayıt Tarihi" },
    ],
  },
  stones: {
    label: "Doğaltaş",
    table: "stones",
    columns: [
      { key: "name", label: "Taş Adı" },
      { key: "category", label: "Kategori" },
      { key: "color", label: "Renk" },
      { key: "properties", label: "Özellikler" },
      { key: "notes", label: "Notlar" },
      { key: "created_at", label: "Kayıt Tarihi" },
    ],
  },
  numerology: {
    label: "Yaşam Analiz Merkezi",
    table: "numerology_analyses",
    columns: [
      { key: "name", label: "İsim" },
      { key: "surname", label: "Soyisim" },
      { key: "birth_date", label: "Doğum Tarihi" },
      { key: "created_at", label: "Analiz Tarihi" },
    ],
  },
  digital_content: {
    label: "Dijital İçerik Merkezi",
    table: "personal_archives",
    columns: [
      { key: "title", label: "Başlık" },
      { key: "content_type", label: "Tür" },
      { key: "description", label: "Açıklama" },
      { key: "created_at", label: "Eklenme Tarihi" },
    ],
  },
};

function fmtCell(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "string") return val.trim() || "—";
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return JSON.stringify(val);
}

function makeHeaderRow(columns: { key: string; label: string }[]): TableRow {
  return new TableRow({
    children: columns.map(
      (col) =>
        new TableCell({
          width: { size: Math.floor(9638 / columns.length), type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: col.label, bold: true, size: 20, font: "Calibri" }),
              ],
            }),
          ],
        }),
    ),
  });
}

function makeDataRow(
  row: Record<string, unknown>,
  columns: { key: string; label: string }[],
): TableRow {
  return new TableRow({
    children: columns.map(
      (col) =>
        new TableCell({
          width: { size: Math.floor(9638 / columns.length), type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: fmtCell(row[col.key]), size: 18, font: "Calibri" }),
              ],
            }),
          ],
        }),
    ),
  });
}

/**
 * POST /api/settings/export
 * Body: { module: ModuleKey }
 * Header: x-user-id
 * Returns: DOCX binary
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  const body = (await req.json()) as { module?: unknown };
  const moduleKey = String(body.module ?? "") as ModuleKey;

  const def = MODULE_DEFS[moduleKey];
  if (!def) {
    return NextResponse.json({ error: "Geçersiz modül." }, { status: 400 });
  }

  const { data, error } = await db
    .from(def.table)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Record<string, unknown>[];
  const dateStr = new Date().toLocaleDateString("tr-TR");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${def.label} — Dışa Aktarım`,
                bold: true,
                size: 36,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: `Oluşturma tarihi: ${dateStr}  ·  Toplam kayıt: ${rows.length}`,
                size: 20,
                font: "Calibri",
                color: "64748b",
              }),
            ],
          }),
          ...(rows.length === 0
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: "Bu modülde henüz kayıt bulunmamaktadır.",
                      size: 22,
                      font: "Calibri",
                      color: "94a3b8",
                    }),
                  ],
                }),
              ]
            : [
                new Table({
                  width: { size: 100, type: WidthType.PERCENTAGE },
                  rows: [
                    makeHeaderRow(def.columns),
                    ...rows.map((r) => makeDataRow(r, def.columns)),
                  ],
                }),
              ]),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const slug = moduleKey.replace(/_/g, "-");
  const dateFn = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}-rapor-${dateFn}.docx"`,
    },
  });
}
