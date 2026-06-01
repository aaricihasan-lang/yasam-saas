"use client";

import jsPDF from "jspdf";

export type ExportMode = "original" | "turkish" | "comparison";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const SECTION_HEADING_STYLE =
  "font-size:14px;font-weight:bold;margin:28px 0 10px;color:#1e3a8a;" +
  "border-top:2px solid #1e3a8a;padding-top:10px;";

const CONTENT_STYLE = "white-space:pre-wrap;word-break:break-word;";

function buildHtml(
  transcript: string | null,
  transcriptTr: string | null | undefined,
  mode: ExportMode,
  sourceFilename?: string,
): string {
  const titleMap: Record<ExportMode, string> = {
    original: "Orijinal Transkript",
    turkish: "Türkçe Çeviri",
    comparison: "Video Çeviri Raporu",
  };

  const header = `
    <h1 style="font-size:20px;font-weight:bold;margin:0 0 8px;color:#1e1b4b;">
      ${titleMap[mode]}
    </h1>
    ${
      sourceFilename
        ? `<p style="font-size:11px;color:#888;margin:0 0 20px;font-style:italic;">
             Kaynak: ${escapeHtml(sourceFilename)}
           </p>`
        : ""
    }`;

  if (mode === "original") {
    return `${header}
      <div style="${CONTENT_STYLE}">${escapeHtml(transcript ?? "")}</div>`;
  }

  if (mode === "turkish") {
    return `${header}
      <div style="${CONTENT_STYLE}">${escapeHtml(transcriptTr ?? "")}</div>`;
  }

  // comparison
  return `${header}
    <h2 style="${SECTION_HEADING_STYLE}">ORİJİNAL TRANSKRİPT</h2>
    <div style="${CONTENT_STYLE}">${escapeHtml(transcript ?? "")}</div>
    <h2 style="${SECTION_HEADING_STYLE}">TÜRKÇE ÇEVİRİ</h2>
    <div style="${CONTENT_STYLE}">${escapeHtml(transcriptTr ?? "")}</div>`;
}

export async function downloadTranscriptAsPdf(
  transcript: string | null,
  transcriptTr: string | null | undefined,
  mode: ExportMode,
  filename = "rapor.pdf",
): Promise<void> {
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-9999px",
    top: "0",
    width: "794px",
    padding: "60px",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: "13px",
    lineHeight: "1.7",
    color: "#111111",
    background: "#ffffff",
    boxSizing: "border-box",
  });

  container.innerHTML = buildHtml(transcript, transcriptTr, mode);
  document.body.appendChild(container);

  try {
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(container, {
      scale: 1.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;

    let yOffset = 0;
    let remaining = imgH;

    pdf.addImage(imgData, "JPEG", 0, yOffset, imgW, imgH);
    remaining -= pageH;

    while (remaining > 0) {
      yOffset -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, yOffset, imgW, imgH);
      remaining -= pageH;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
