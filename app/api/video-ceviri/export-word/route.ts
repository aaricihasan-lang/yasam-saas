import { NextRequest, NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/userGuard";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ExportMode } from "@/lib/video-ceviri/exportHelpers";
import { resolveReportLocale } from "@/lib/i18n/reportLocale";
import { documentLangOptions, videoExportText } from "@/lib/video-ceviri/reportText";

export const runtime = "nodejs";


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

export async function GET(request: NextRequest) {
  // Kimlik yalnız oturumdan (x-user-id + x-session-token); tenant/user
  // query'den ALINMAZ. jobId + mode query'den okunur.
  const guard = await requireModuleAccess(request, "video_ceviri");
  if (!guard.ok) return guard.response;
  const { db, tenantId, userId, is_demo_account } = guard;

  // Demo hesap: Word dışa aktarımı engellenir.
  if (is_demo_account) {
    return NextResponse.json(
      { ok: false, code: "DEMO_READONLY", error: "Demo hesabında bu işlem kullanılamaz." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const jobId   = searchParams.get("jobId")?.trim() ?? "";
  const rawMode = searchParams.get("mode")?.trim()  ?? "original";
  const mode: ExportMode =
    rawMode === "turkish" || rawMode === "comparison" ? rawMode : "original";

  if (!jobId) {
    return NextResponse.json(
      { ok: false, code: "JOB_ID_REQUIRED", error: "jobId gerekli." },
      { status: 400 },
    );
  }

  const { data: jobData, error: jobErr } = await db
    .from("video_transcription_jobs")
    .select(
      "id, tenant_id, original_filename, transcript_original, transcript_tr",
    )
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .single();

  if (jobErr || !jobData) {
    return NextResponse.json(
      { ok: false, code: "JOB_NOT_FOUND", error: "İş kaydı bulunamadı." },
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
      { ok: false, code: "TRANSCRIPT_MISSING", error: "Transkript henüz oluşturulmamış." },
      { status: 422 },
    );
  }

  if ((mode === "turkish" || mode === "comparison") && !job.transcript_tr) {
    return NextResponse.json(
      { ok: false, code: "TRANSLATION_REQUIRED", error: "Bu dışa aktarım için Türkçe çeviri gerekli." },
      { status: 422 },
    );
  }

  // Doküman içeriğini moda göre oluştur (sistem metinleri çıktı dilinde; transkript/çeviri metni aynen).
  const output = await resolveReportLocale(request, { db, tenantId, userId });
  const x = videoExportText(output);
  const children: Paragraph[] = [
    new Paragraph({
      text: x.title(mode),
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: x.source(job.original_filename),
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
      sectionHeading(x.originalHeading),
      ...textToParagraphs(job.transcript_original),
      sectionHeading(x.translationHeading, 600),
      ...textToParagraphs(job.transcript_tr!),
    );
  }

  const doc = new Document({ ...documentLangOptions(output), sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);

  const safeName = job.original_filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 60);
  const suffix = x.fileSuffix(mode);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}_${suffix}.docx"`,
      "Content-Length": String(buffer.length),
    },
  });
}
