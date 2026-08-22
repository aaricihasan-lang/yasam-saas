import { Fragment, type ReactNode } from "react";

/**
 * Güvenli, bağımsız (dependency-free) canonical metin biçimleyici.
 *
 * Markdown-BENZERİ girdi (## / ### başlıklar, - / • / 1. listeler, boş-satır paragraf,
 * **kalın** / *italik*) okunabilir React node'larına çevrilir. HTML ÇALIŞTIRILMAZ:
 * dangerouslySetInnerHTML KULLANILMAZ; tüm metin React text node olarak kalır → XSS yok.
 *
 * "##" gibi işaretler ham metin olarak GÖSTERİLMEZ; gerçek H2/H3'e dönüştürülür.
 */

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const LIST_ITEM_RE = /^\s*(?:[-•·–—*]|\d+[.)])\s+(.+)$/;

/** İnline **kalın** ve *italik* — yalnız güvenli text/strong/em node'ları üretir. */
function renderInline(text: string, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  // **bold** ve *italic* (bold önce). Yakalanan gruplar text olarak render edilir.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={`${keyPrefix}-t-${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${i}`} className="font-bold text-slate-900">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${i}`} className="italic">{m[3]}</em>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyPrefix}-t-end`}>{text.slice(last)}</Fragment>);
  return nodes.length ? nodes : text;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t/g, " ").trim();
}

export type ReaderBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "list"; items: string[] }
  | { type: "paragraph"; lines: string[] };

type Block = ReaderBlock;

/** Satır-temelli blok ayrıştırma (saf; test edilebilir). Başlıklar ve liste öğeleri kendi bloklarını açar. */
export function parseReaderBlocks(text: string): ReaderBlock[] {
  const paragraphs = normalize(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    let pending: string[] = [];
    let pendingList: string[] = [];

    const flushPara = () => {
      if (pending.length) { blocks.push({ type: "paragraph", lines: pending }); pending = []; }
    };
    const flushList = () => {
      if (pendingList.length) { blocks.push({ type: "list", items: pendingList }); pendingList = []; }
    };

    for (const line of lines) {
      const h = line.match(HEADING_RE);
      if (h) {
        flushList(); flushPara();
        blocks.push({ type: "heading", level: h[1].length, text: h[2] });
        continue;
      }
      const li = line.match(LIST_ITEM_RE);
      if (li) {
        flushPara();
        pendingList.push(li[1].trim());
        continue;
      }
      flushList();
      pending.push(line);
    }
    flushList();
    flushPara();
  }
  return blocks;
}

// ── GÜVENLİ DÜZ (plain) BÖLÜM ETİKETİ TESPİTİ ────────────────────────────────
// Bazı kanonik metinlerde "Mekanik Yapı", "Aura" gibi GERÇEK bölüm etiketleri
// `##` işareti taşımadan ayrı bir satır/blok olarak bulunur. Bu presentation-katmanı
// yardımcısı bunları YALNIZ güvenli koşullarda H2'ye yükseltir. Kaynak metin/parça
// anlamı DEĞİŞMEZ: yeni `##` yazılmaz, DB/text rewrite yapılmaz — yalnız blok tipi
// sunum için yeniden sınıflanır. Normal cümleler ASLA başlığa dönüşmez.
const HEADING_MAX_LEN = 70; // etiketler kısadır; uzun satır → paragraf
const NEXT_MIN_LEN = 40; // ardından ESASLI gövde paragrafı gelmeli (enum parçalarını eler)
// Cümle/ara işaretiyle biten satır etiket değildir (nokta, ünlem, SORU, ; : , …).
const HEADING_TERMINAL_PUNCT = /[.!?;:,…]$/u;

function paragraphText(b: ReaderBlock): string {
  return b.type === "paragraph" ? b.lines.join(" ").trim() : "";
}

/** Bir bloğun düz bölüm etiketi (heading) olarak yükseltilmeye uygun olup olmadığı. */
function isPlainHeadingCandidate(b: ReaderBlock, next: ReaderBlock | undefined): boolean {
  if (b.type !== "paragraph" || b.lines.length !== 1) return false; // tek satır standalone blok
  const t = b.lines[0].trim();
  if (!t || t.length > HEADING_MAX_LEN) return false; // boş / çok uzun → değil
  if (HEADING_TERMINAL_PUNCT.test(t)) return false; // cümle sonu işareti → değil
  const first = t[0];
  if (first.toLocaleLowerCase("tr-TR") === first) return false; // küçük harf/rakam/işaret başı ("veya") → değil
  // Hemen ardından esaslı gövde paragrafı gelmeli → "Öfke ve isyan / veya" gibi
  // kısa enumerasyon parçalarını ve satır sonu fragmanlarını eler.
  if (!next || next.type !== "paragraph" || paragraphText(next).length < NEXT_MIN_LEN) return false;
  return true;
}

/**
 * `##` taşımayan ama gerçek bölüm etiketi olan standalone kısa satırları güvenli
 * koşullarla H2'ye yükseltir (SAF; test edilebilir). Mevcut `##`/`###` başlıkları ve
 * listeler dokunulmadan geçer. Kaynak metnin byte/anlamı DEĞİŞMEZ.
 */
export function promotePlainHeadings(blocks: ReaderBlock[]): ReaderBlock[] {
  return blocks.map((b, i) =>
    isPlainHeadingCandidate(b, blocks[i + 1])
      ? { type: "heading", level: 2, text: (b as { lines: string[] }).lines[0].trim() }
      : b,
  );
}

/**
 * Metni güvenli okunabilir node'lara çevirir. `fontSizePx` madde işareti hizası içindir;
 * gövde yazı boyutu + satır yüksekliği üst kapsayıcıdan (ReaderModal) kalıtılır.
 *
 * SUNUM: TEK AKICI OKUMA YÜZEYİ. Normal paragraflar card/border/background OLMADAN
 * doğal tipografiyle render edilir; başlıklar (##/###) gerçek H2/H3 hiyerarşisi olur
 * (büyük renkli şerit/card YOK — H2 için yalnız ince kontrollü violet sol-şerit); gerçek
 * listeler (parser'ın güvenle tanıdığı) sade ul/li olur. Kaynak metin anlamı DEĞİŞMEZ:
 * parseReaderBlocks yalnız mevcut ##/### ve gerçek liste işaretlerini presentation'a çevirir;
 * paragraf otomatik maddeye dönüştürülmez, başlık/list üretilmez. Aralıklar em-tabanlıdır →
 * A−/A/A+ ile yazı boyutu değiştiğinde tipografik ritim korunur.
 */
export function formatReaderText(text: string, opts?: { fontSizePx?: number }): ReactNode {
  const fontSizePx = opts?.fontSizePx ?? 18;
  const bulletTop = Math.max(9, Math.round(fontSizePx * 0.5));
  const normalized = normalize(text);
  if (!normalized) return <p className="italic text-slate-400">Henüz içerik girilmedi.</p>;

  const blocks = promotePlainHeadings(parseReaderBlocks(normalized));

  // Blokları TEK <article> altında düz (flat) çocuklar olarak topla → first:/last: aralık
  // sıfırlamaları DOM'un ilk/son öğesinde doğru çalışır, blok tipinden bağımsız.
  const nodes: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const key = `blk-${bi}`;
    if (block.type === "heading") {
      if (block.level <= 2) {
        nodes.push(
          <h2
            key={key}
            className="mt-[1.6em] mb-[0.55em] border-l-2 border-violet-400 pl-3 text-[1.25em] font-bold leading-snug tracking-tight text-slate-950 first:mt-0"
          >
            {renderInline(block.text, `${key}-h`)}
          </h2>,
        );
      } else {
        nodes.push(
          <h3
            key={key}
            className="mt-[1.3em] mb-[0.4em] text-[1.08em] font-bold leading-snug tracking-tight text-slate-900 first:mt-0"
          >
            {renderInline(block.text, `${key}-h`)}
          </h3>,
        );
      }
      return;
    }
    if (block.type === "list") {
      nodes.push(
        <ul key={key} className="my-[0.9em] ml-1 list-none space-y-[0.45em] pl-0 first:mt-0 last:mb-0">
          {block.items.map((item, ii) => (
            <li key={`${key}-li-${ii}`} className="flex gap-3">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400"
                style={{ marginTop: bulletTop }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">{renderInline(item, `${key}-li-${ii}-t`)}</span>
            </li>
          ))}
        </ul>,
      );
      return;
    }
    // Normal paragraf(lar): card/border/bg YOK; her satır kendi <p>'si, em-tabanlı aralık.
    block.lines.forEach((line, li) => {
      nodes.push(
        <p key={`${key}-p-${li}`} className="my-[0.9em] first:mt-0 last:mb-0">
          {renderInline(line, `${key}-p-${li}-t`)}
        </p>,
      );
    });
  });

  return <article className="max-w-none text-slate-800">{nodes}</article>;
}
