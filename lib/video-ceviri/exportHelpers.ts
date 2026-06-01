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
  filename = "transkript.pdf",
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
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  });

  container.innerHTML = `
    <h1 style="font-size:18px;font-weight:bold;margin:0 0 16px;color:#1e1b4b;">Transkript</h1>
    <div>${escapeHtml(transcript)}</div>
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
