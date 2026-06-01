import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ExportMode } from "@/lib/video-ceviri/exportHelpers";

export const runtime = "nodejs";

const TITLE_MAP: Record<ExportMode, string> = {
  original: "Orijinal Transkript",
  turkish: "Türkçe Çeviri",
  comparison: "Video Çeviri Raporu",
};

function textToParagraphs(text: string): Paragraph[] {
  return text
    .split(/\n+/)
    .filter((l) => l.trim().length > 0)
    .map(
      (l) =>
        new Paragraph({
          children: [new TextRun({ text: l.trim(), size: 24, font: "Calibri" })],
          spacing: { after: 200 },
        }),
    );
}

function sectionHeading(text: string, spaceBefore = 0): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: spaceBefore, after: 300 },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId")?.trim() ?? "";
  const tenantId = searchParams.get("tenantId")?.trim() ?? "";
  const rawMode = searchParams.get("mode")?.trim() ?? "original";
  const mode: ExportMode =
    rawMode === "turkish" || rawMode === "comparison" ? rawMode : "original";

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
    .select(
      "id, tenant_id, original_filename, transcript_original, transcript_tr",
    )
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
    transcript_tr: string | null;
  };

  if (!job.transcript_original) {
    return NextResponse.json(
      { ok: false, error: "Transkript henüz oluşturulmamış." },
      { status: 422 },
    );
  }

  if ((mode === "turkish" || mode === "comparison") && !job.transcript_tr) {
    return NextResponse.json(
      { ok: false, error: "Bu dışa aktarım için Türkçe çeviri gerekli." },
      { status: 422 },
    );
  }

  // Doküman içeriğini moda göre oluştur
  const children: Paragraph[] = [
    new Paragraph({
      text: TITLE_MAP[mode],
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
      spacing: { after: 600 },
    }),
  ];

  if (mode === "original") {
    children.push(...textToParagraphs(job.transcript_original));
  } else if (mode === "turkish") {
    children.push(...textToParagraphs(job.transcript_tr!));
  } else {
    // comparison
    children.push(
      sectionHeading("ORİJİNAL TRANSKRİPT"),
      ...textToParagraphs(job.transcript_original),
      sectionHeading("TÜRKÇE ÇEVİRİ", 600),
      ...textToParagraphs(job.transcript_tr!),
    );
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);

  const safeName = job.original_filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const suffix =
    mode === "original" ? "orijinal" : mode === "turkish" ? "turkce" : "karsilastirmali";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}_${suffix}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
