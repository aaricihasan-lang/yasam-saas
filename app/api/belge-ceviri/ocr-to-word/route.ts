import { Document, Packer, Paragraph, TextRun } from "docx";

export const runtime = "nodejs";
export const maxDuration = 30;

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

    const children: Paragraph[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      children.push(
        new Paragraph({
          children: line ? [new TextRun({ text: line, size: 22 })] : [],
          spacing: { after: 120 },
        }),
      );
    }

    const doc = new Document({
      sections: [
        {
          properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="ocr-metin.docx"',
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
