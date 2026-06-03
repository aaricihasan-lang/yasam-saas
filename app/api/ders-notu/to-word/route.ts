import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export const runtime = "nodejs";
export const maxDuration = 30;

function buildParagraphs(text: string): Paragraph[] {
  const children: Paragraph[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();

    if (line.startsWith("# ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: line.slice(2).trim(), bold: true, size: 28, color: "1e293b" })],
          spacing: { before: 400, after: 200 },
        }),
      );
    } else if (line.startsWith("## ")) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.slice(3).trim(), bold: true, size: 24, color: "334155" })],
          spacing: { before: 300, after: 160 },
        }),
      );
    } else if (line === "Soru:" || line === "Cevap:") {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, bold: true, size: 22, color: "334155" })],
          spacing: { before: 200, after: 60 },
        }),
      );
    } else if (line.trim() === "") {
      children.push(new Paragraph({ children: [], spacing: { after: 80 } }));
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 22 })],
          spacing: { after: 120 },
        }),
      );
    }
  }

  return children;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const text = formData.get("text");

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(
        JSON.stringify({ success: false, message: "Metin bulunamadı." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const doc = new Document({
      sections: [
        {
          properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children: buildParagraphs(text),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="ders-notu.docx"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ success: false, message: `İşlem hatası: ${message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
