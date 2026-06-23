import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Packer,
  BorderStyle,
} from "docx";

function toSafeFilename(name: string): string {
  return name
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ı/g, "i").replace(/İ/g, "I")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// Satır içi **kalın** ve *italik* markdown'ı TextRun dizisine çevirir.
function parseInlineMarkdown(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Önce **bold** sonra *italic* — sıra önemli
  const regex = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    if (match[1] !== undefined) {
      runs.push(new TextRun({ text: match[1], bold: true }));
    } else if (match[2] !== undefined) {
      runs.push(new TextRun({ text: match[2], italics: true }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

function parseMarkdownLine(line: string): Paragraph | null {
  // --- ayraç
  if (/^-{3,}$/.test(line.trim())) {
    return new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
      },
      spacing: { before: 200, after: 200 },
      children: [],
    });
  }

  // ### Başlık (heading 3)
  const h3 = line.match(/^###\s+(.+)$/);
  if (h3) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: h3[1].trim(), bold: true })],
      spacing: { before: 320, after: 100 },
    });
  }

  // ## Başlık (heading 2)
  const h2 = line.match(/^##\s+(.+)$/);
  if (h2) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: h2[1].trim(), bold: true })],
      spacing: { before: 400, after: 120 },
    });
  }

  // # Başlık (heading 1)
  const h1 = line.match(/^#\s+(.+)$/);
  if (h1) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: h1[1].trim(), bold: true })],
      spacing: { before: 480, after: 160 },
    });
  }

  // - veya * ile başlayan liste öğesi → madde imi
  const bullet = line.match(/^[-*]\s+(.+)$/);
  if (bullet) {
    return new Paragraph({
      children: [
        new TextRun({ text: "• " }),
        ...parseInlineMarkdown(bullet[1].trim()),
      ],
      indent: { left: 240 },
      spacing: { after: 60 },
    });
  }

  // Boş satır → boşluk paragrafı
  if (line.trim() === "") {
    return new Paragraph({ children: [], spacing: { after: 80 } });
  }

  // Normal satır — inline markdown işle
  return new Paragraph({
    children: parseInlineMarkdown(line),
    spacing: { after: 80 },
  });
}

export async function exportHdReportDocx(params: {
  reportTitle: string;
  clientName: string;
  reportText: string;
}): Promise<void> {
  const { reportTitle, clientName, reportText } = params;

  const now = new Date();
  const today = now.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const dateStr = now.toISOString().slice(0, 10); // "2026-06-23"

  const headerParagraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Human Design Raporu", bold: true })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Danışan: ${clientName}`, size: 26 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Oluşturma Tarihi: ${today}`, size: 22, color: "555555" })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: reportTitle, size: 24, italics: true, color: "444488" })],
      spacing: { after: 400 },
    }),
    // ayraç
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "AAAACC" },
      },
      children: [],
      spacing: { after: 400 },
    }),
  ];

  const bodyParagraphs: Paragraph[] = reportText
    .split("\n")
    .map(parseMarkdownLine)
    .filter((p): p is Paragraph => p !== null);

  const doc = new Document({
    sections: [
      {
        children: [...headerParagraphs, ...bodyParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);

  const safeName = toSafeFilename(clientName) || "Danisan";
  const filename = `Human-Design-Raporu-${safeName}-${dateStr}.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
