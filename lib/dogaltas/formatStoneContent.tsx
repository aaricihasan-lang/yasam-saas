import {
  dogaltasContentTypography,
  type DogaltasContentTypography,
} from "@/lib/dogaltas/dogaltasDetailFontSize";
import { Fragment, type ReactNode } from "react";

/** "Mineral sınıfı:" gibi etiket satırları */
const LABEL_LINE_RE = /^([^:\n]{2,72}):\s*(.*)$/u;
const LIST_ITEM_RE = /^\s*(?:[-•·–—]|\d+[.)])\s+(.+)$/;
const SECTION_HEADER_RE =
  /^(?:[A-ZÇĞİÖŞÜ][A-ZÇĞİÖŞÜ0-9\s/&().,'-]{2,58}|[A-ZÇĞİÖŞÜ]{4,})$/u;

export type FormatStoneContentOptions = {
  renderSegment?: (text: string, key: string) => ReactNode;
  fontSizePx?: number;
  typography?: DogaltasContentTypography;
};

function defaultRender(text: string): ReactNode {
  return text;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
}

function splitParagraphBlocks(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function isListBlock(block: string): boolean {
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  const listLines = lines.filter((line) => LIST_ITEM_RE.test(line));
  return listLines.length >= 2 && listLines.length >= lines.length * 0.6;
}

function isSemicolonList(line: string): boolean {
  if (!line.includes(";")) return false;
  const parts = line
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length >= 3 && parts.every((p) => p.length < 120);
}

function isSectionHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 64) return false;
  if (trimmed.includes(":")) return false;
  if (/[.!?]$/.test(trimmed) && trimmed.length > 24) return false;
  return SECTION_HEADER_RE.test(trimmed);
}

function bulletOffset(fontSizePx: number): number {
  return Math.max(10, Math.round(fontSizePx * 0.45));
}

function renderInlineSegment(
  text: string,
  key: string,
  renderSegment: (text: string, key: string) => ReactNode,
  typo: DogaltasContentTypography,
): ReactNode {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const labelMatch = trimmed.match(LABEL_LINE_RE);
  if (labelMatch) {
    const [, label, rest] = labelMatch;
    return (
      <p key={key} className="text-slate-700" style={typo.bodyStyle}>
        <span className="font-bold text-slate-900">{label}:</span>
        {rest ? (
          <>
            {" "}
            <span className="font-normal">{renderSegment(rest, `${key}-v`)}</span>
          </>
        ) : null}
      </p>
    );
  }

  return (
    <p key={key} className="text-slate-700" style={typo.bodyStyle}>
      {renderSegment(trimmed, key)}
    </p>
  );
}

function renderListItems(
  items: string[],
  keyPrefix: string,
  renderSegment: (text: string, key: string) => ReactNode,
  typo: DogaltasContentTypography,
): ReactNode {
  const bulletTop = bulletOffset(typo.fontSizePx);

  return (
    <ul
      key={keyPrefix}
      className="ml-1 list-none space-y-3 pl-0 text-slate-700 sm:space-y-3.5"
      style={typo.bodyStyle}
    >
      {items.map((item, index) => (
        <li key={`${keyPrefix}-${index}`} className="flex gap-3">
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500"
            style={{ marginTop: bulletTop }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">{renderSegment(item, `${keyPrefix}-li-${index}`)}</span>
        </li>
      ))}
    </ul>
  );
}

function renderBlock(
  block: string,
  blockIndex: number,
  renderSegment: (text: string, key: string) => ReactNode,
  typo: DogaltasContentTypography,
): ReactNode {
  const key = `block-${blockIndex}`;
  const cardPad = "p-4 shadow-sm sm:p-5 md:p-6";

  if (isListBlock(block)) {
    const items = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(LIST_ITEM_RE);
        return m ? m[1].trim() : line;
      });

    return (
      <article
        key={key}
        className={`rounded-2xl border border-violet-100/90 bg-gradient-to-br from-white via-violet-50/40 to-cyan-50/30 ${cardPad}`}
      >
        {renderListItems(items, `${key}-ul`, renderSegment, typo)}
      </article>
    );
  }

  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length === 1) {
    const line = lines[0]!;

    if (isSectionHeaderLine(line)) {
      return (
        <h3
          key={key}
          className="border-l-4 border-violet-500 bg-violet-50/60 py-1.5 pl-4 text-xl font-semibold tracking-tight text-violet-950"
        >
          {renderSegment(line, `${key}-h`)}
        </h3>
      );
    }

    if (isSemicolonList(line)) {
      const items = line
        .split(";")
        .map((p) => p.trim())
        .filter(Boolean);
      return (
        <article
          key={key}
          className={`rounded-2xl border border-violet-100/90 bg-gradient-to-br from-white via-violet-50/40 to-cyan-50/30 ${cardPad}`}
        >
          {renderListItems(items, `${key}-sc`, renderSegment, typo)}
        </article>
      );
    }

    return (
      <article
        key={key}
        className={`rounded-2xl border border-slate-200/80 bg-white/90 ${cardPad}`}
      >
        {renderInlineSegment(line, `${key}-p`, renderSegment, typo)}
      </article>
    );
  }

  const nodes: ReactNode[] = [];
  const bulletTop = bulletOffset(typo.fontSizePx);

  lines.forEach((line, lineIndex) => {
    const lineKey = `${key}-ln-${lineIndex}`;

    if (isSectionHeaderLine(line)) {
      nodes.push(
        <h3
          key={lineKey}
          className="border-l-4 border-violet-500 bg-violet-50/60 py-1.5 pl-4 text-xl font-semibold tracking-tight text-violet-950"
        >
          {renderSegment(line, lineKey)}
        </h3>,
      );
      return;
    }

    const listMatch = line.match(LIST_ITEM_RE);
    if (listMatch) {
      nodes.push(
        <div key={lineKey} className="flex gap-3 pl-1 text-slate-700" style={typo.bodyStyle}>
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-br from-cyan-500 to-violet-500"
            style={{ marginTop: bulletTop }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">{renderSegment(listMatch[1], `${lineKey}-t`)}</span>
        </div>,
      );
      return;
    }

    nodes.push(
      <Fragment key={lineKey}>
        {renderInlineSegment(line, lineKey, renderSegment, typo)}
      </Fragment>,
    );
  });

  return (
    <article
      key={key}
      className={`space-y-4 rounded-2xl border border-slate-200/80 bg-white/90 sm:space-y-5 ${cardPad}`}
    >
      {nodes}
    </article>
  );
}

/**
 * Uzun taş metinlerini okunabilir bloklara, listelere ve etiket satırlarına dönüştürür.
 */
export function formatStoneContent(
  text: string,
  options?: FormatStoneContentOptions,
): ReactNode {
  const renderSegment = options?.renderSegment ?? defaultRender;
  const typo =
    options?.typography ??
    dogaltasContentTypography(options?.fontSizePx ?? 17);
  const normalized = normalizeText(text);

  if (!normalized) {
    return (
      <p className="italic text-slate-400" style={typo.bodyStyle}>
        Henüz bilgi girilmedi.
      </p>
    );
  }

  const blocks = splitParagraphBlocks(normalized);

  return (
    <div className="space-y-5 sm:space-y-6 md:space-y-7">
      {blocks.map((block, index) => renderBlock(block, index, renderSegment, typo))}
    </div>
  );
}
