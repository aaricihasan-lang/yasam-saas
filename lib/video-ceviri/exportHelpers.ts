"use client";

import jsPDF from "jspdf";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function downloadTranscriptAsPdf(
  transcript: string,
  filename = "rapor.pdf",
  transcriptTr?: string | null,
): Promise<void> {
  const trSection =
    transcriptTr?.trim()
      ? `<h2 style="font-size:15px;font-weight:bold;margin:32px 0 10px;color:#1e3a8a;
                   border-top:2px solid #1e3a8a;padding-top:12px;">
           TÜRKÇE ÇEVİRİ
         </h2>
         <div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(transcriptTr)}</div>`
      : "";

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

  container.innerHTML = `
    <h1 style="font-size:20px;font-weight:bold;margin:0 0 8px;color:#1e1b4b;">
      Video Çeviri Raporu
    </h1>
    <h2 style="font-size:15px;font-weight:bold;margin:24px 0 10px;color:#1e3a8a;
               border-top:2px solid #1e3a8a;padding-top:12px;">
      ORİJİNAL TRANSKRİPT
    </h2>
    <div style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(transcript)}</div>
    ${trSection}
  `;
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
