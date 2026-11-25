import type { NextRequest } from "next/server";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { requireDigitalContentUser } from "@/lib/auth/requireUser";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
import { documentLangOptions, ocrWordFileName } from "@/lib/video-ceviri/reportText";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const auth = await requireDigitalContentUser(request, "belge_ceviri_ai");
  if (!auth.ok) return auth.response;
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

    const output = await resolveReportLocale(request, { db: auth.user.db, tenantId: auth.user.tenantId, userId: auth.user.userId });
    const doc = new Document({
      ...documentLangOptions(output),
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
        "Content-Disposition": `attachment; filename="${ocrWordFileName(output)}"`,
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
