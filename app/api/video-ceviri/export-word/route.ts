import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() ?? "";
  const tenantId = searchParams.get("tenantId")?.trim() ?? "";

  if (!jobId || !tenantId) {
    return NextResponse.json(
      { ok: false, error: "jobId ve tenantId gerekli." },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase yapılandırması eksik." },
      { status: 500 },
    );
  }

  const db = createClient(supabaseUrl, supabaseKey);

  const { data: jobData, error: jobErr } = await db
    .from("video_transcription_jobs")
    .select("id, tenant_id, original_filename, transcript_original")
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .single();

  if (jobErr || !jobData) {
    return NextResponse.json(
      { ok: false, error: "İş kaydı bulunamadı." },
      { status: 404 },
    );
  }

  const job = jobData as {
    id: string;
    tenant_id: string;
    original_filename: string;
    transcript_original: string | null;
  };

  if (!job.transcript_original) {
    return NextResponse.json(
      { ok: false, error: "Transkript henüz oluşturulmamış." },
      { status: 422 },
    );
  }

  const bodyParagraphs = job.transcript_original
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map(
      (line) =>
        new Paragraph({
          children: [
            new TextRun({
              text: line.trim(),
              size: 24,
              font: "Calibri",
            }),
          ],
          spacing: { after: 200 },
        }),
    );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Transkript",
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 300 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Kaynak: ${job.original_filename}`,
                size: 20,
                color: "666666",
                italics: true,
              }),
            ],
            spacing: { after: 500 },
          }),
          ...bodyParagraphs,
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const safeName = job.original_filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}_transkript.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
