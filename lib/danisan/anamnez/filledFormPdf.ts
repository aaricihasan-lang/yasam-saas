import { effectiveSections, fieldLabel, fieldOptions, getCatalog, getTemplate, type AnamnezLocale, type EffectiveField } from "./schema";
import { clientDisplayFromSnapshot, displayAnswer, formatInstantIstanbul, formatIsoDate } from "./format";
import { isEmptyAnswer } from "./validate";
import {
  anamnezMessages,
  BOTTOM,
  CONTENT_W,
  drawFooters,
  drawSectionHeader,
  drawTopBar,
  INK,
  LINE,
  MUTED,
  MX,
  PAGE_H,
  PAGE_W,
  TEAL,
  TOP,
  Writer,
} from "./blankFormPdf";
import type { AnamnezRecord, AnswerValue, RowColumn, RowValue, YndValue } from "./types";

/**
 * KAYITLI (DOLU) ANAMNEZ FORMU — A4 PDF (sunucu, jsPDF; boş form ile aynı görsel dil).
 *
 * - Efektif form sırası: kanonik şablon ⊕ danışana özel fark (effectiveSections).
 * - Gizli ("bu danışandan kaldırılan") alanlar ve cevapları YAZILMAZ.
 * - Koşullu bölüm (L) yalnız bu anamnezde etkinse yazılır.
 * - Seçim tipleri (yn / single / multi / scale10): seçili kutu dolu kare ile işaretlenir
 *   (özel glif kullanılmaz → eksik glif riski yok). ynd: kutular + açıklama metni.
 * - Metin cevapları sarılır ve sayfalar arasında akar (4000 karaktere kadar).
 * - Satır tabloları: değişken satır yüksekliği; sayfa kırılımında kolon başlığı tekrarlanır.
 * - Boş alan → soluk "—".
 * - Başlık: danışan adı (client_snapshot), değerlendirme tarihi, durum rozeti (+ tamamlanma zamanı).
 * - Alt bilgi: wellness notu, sayfa no, `<sürüm> · rev N`, oluşturma zamanı (Europe/Istanbul).
 * - Son sayfada imza bloğu (danışan / uzman / tarih).
 * Sağlık içeriği LOGLANMAZ; bu modül saf (DB/ağ yok).
 */

export type FilledFormRecord = Pick<
  AnamnezRecord,
  "template_version" | "form_custom" | "answers" | "status" | "assessment_date" | "completed_at" | "revision" | "client_snapshot" | "title" | "kind"
>;

export type FilledFormInput = {
  locale: AnamnezLocale;
  record: FilledFormRecord;
  fontBase64: string;
  /** Oluşturma anı (test için sabitlenebilir). */
  now?: Date;
};

const ANSWER_SIZE = 9.5;
const LABEL_SIZE = 8.5;
const AMBER_BG: [number, number, number] = [254, 243, 199];
const AMBER_INK: [number, number, number] = [146, 64, 14];
const HEAD_BG: [number, number, number] = [248, 250, 252];
/** Boş cevap "—" için soluk renk. */
const FAINT: [number, number, number] = [148, 163, 184];
/** Tek tablo hücresinde en fazla satır (300 karakter sınırıyla pratikte erişilmez; taşma koruması). */
const MAX_CELL_LINES = 40;

/** PDF metni için güvenli metin: CR/tab/kontrol karakterleri sadeleştirilir. */
function clean(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "    ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function fieldType(f: EffectiveField) {
  return f.kind === "template" ? f.field.type : f.custom.type;
}

export function buildFilledAnamnesisPdf(input: FilledFormInput): Uint8Array {
  const { locale, record } = input;
  const version = record.template_version;
  const template = getTemplate(version);
  const catalog = getCatalog(version, locale);
  const m = anamnezMessages(locale);
  const t = m.pdf;
  const yesNo = { yes: m.field.yes, no: m.field.no };
  const custom = record.form_custom ?? { hidden: [], labels: {}, enabledSections: [], custom: [] };
  const answers = (record.answers ?? {}) as Record<string, AnswerValue>;
  const w = new Writer(input.fontBase64);
  const doc = w.doc;
  const completed = record.status === "completed";

  // ── Başlık ──
  drawTopBar(doc);
  w.y = 12;
  // Durum rozeti (sağ üst) — başlık metninden önce çizilir, başlık sol sütunda kalır.
  const badge = completed ? t.statusCompleted : t.statusDraft;
  doc.setFontSize(9);
  const bw = doc.getTextWidth(badge) + 7;
  const bx = PAGE_W - MX - bw;
  doc.setFillColor(...(completed ? TEAL : AMBER_BG));
  doc.roundedRect(bx, 12.2, bw, 6.4, 1.6, 1.6, "F");
  doc.setTextColor(...(completed ? ([255, 255, 255] as [number, number, number]) : AMBER_INK));
  doc.text(badge, bx + 3.5, 16.6);
  w.text(t.title, 18, TEAL, MX, CONTENT_W - bw - 6);
  w.y += 2;

  const name = clientDisplayFromSnapshot(record.client_snapshot);
  const half = CONTENT_W / 2 - 4;
  const meta = (label: string, value: string, x: number, width: number) => {
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(`${label}:`, x, w.y + 5);
    doc.setTextColor(...INK);
    const v = (doc.splitTextToSize(clean(value) || t.empty, width - 24) as string[])[0] ?? "";
    doc.text(v, x + 24, w.y + 5);
  };
  meta(t.clientLabel, name, MX, half);
  meta(t.dateLabel, formatIsoDate(record.assessment_date, locale), MX + half + 8, half);
  w.y += 7;
  meta(t.titleLabel, record.title || (m.kind as Record<string, string>)[record.kind] || "", MX, half);
  if (completed && record.completed_at) {
    meta(t.completedAtLabel, formatInstantIstanbul(record.completed_at, locale), MX + half + 8, half);
  }
  w.y += 8;
  w.line(MX, MX + CONTENT_W);
  w.y += 3;

  // ── Bölümler ──
  for (const s of effectiveSections(version, custom)) {
    // Koşullu bölüm (L) yalnız bu anamnezde etkinse.
    if (s.optional && !s.enabled) continue;
    const visible = s.fields.filter((f) => !f.hidden);
    if (visible.length === 0) continue;

    drawSectionHeader(w, `${s.key}. ${catalog.sections[s.key]?.title ?? s.key}`);

    for (const f of visible) {
      const type = fieldType(f);
      const value = answers[f.key];
      w.ensure(12);
      w.text(clean(fieldLabel(f, catalog)), LABEL_SIZE, MUTED);
      w.y += 0.6;
      if (isEmptyAnswer(value)) {
        w.text(t.empty, ANSWER_SIZE, FAINT);
        w.y += 2.2;
        continue;
      }
      switch (type) {
        case "yn":
          w.choices([yesNo.yes, yesNo.no], new Set(value === true ? [0] : value === false ? [1] : []));
          break;
        case "ynd": {
          const v = (typeof value === "object" && value !== null && !Array.isArray(value) ? value : { v: null, d: "" }) as YndValue;
          w.choices([yesNo.yes, yesNo.no], new Set(v.v === true ? [0] : v.v === false ? [1] : []));
          if (typeof v.d === "string" && v.d.trim()) {
            w.y -= 2;
            w.flow(`${m.field.detail}: ${clean(v.d.trim())}`, ANSWER_SIZE, INK);
            w.y += 1.5;
          }
          break;
        }
        case "single":
        case "multi": {
          const opts = fieldOptions(f, template, catalog);
          const scalar = (x: unknown): x is string | number => typeof x === "string" || (typeof x === "number" && Number.isFinite(x));
          const raw: unknown[] = type === "multi" ? (Array.isArray(value) ? value : []) : [value];
          const picked = new Set(raw.filter(scalar).map(String));
          const idx = new Set(opts.map((o, i) => (picked.has(o.key) ? i : -1)).filter((i) => i >= 0));
          w.choices(opts.map((o) => clean(o.label)), idx);
          // Seçenek kümesi dışındaki (eski) değer kaybolmaz: metin olarak yazılır.
          const unknown = [...picked].filter((k) => !opts.some((o) => o.key === k));
          if (unknown.length) {
            w.y -= 2;
            w.flow(clean(unknown.join(", ")), ANSWER_SIZE, INK);
            w.y += 1.5;
          }
          break;
        }
        case "scale10": {
          const n = typeof value === "number" ? value : Number.NaN;
          w.choices(Array.from({ length: 11 }, (_, i) => String(i)), new Set(Number.isInteger(n) ? [n] : []));
          break;
        }
        case "rows":
          if (f.kind === "template" && f.field.columns && Array.isArray(value)) {
            drawFilledRows(w, f.field.columns, value as RowValue[], (k) => catalog.columns[k] ?? k, (c, cell) => {
              if (cell === null || cell === undefined || cell === "") return "";
              if (c.type === "single") return catalog.options[c.options ?? ""]?.[String(cell)] ?? String(cell);
              return typeof cell === "number" ? (Number.isFinite(cell) ? String(cell) : "") : String(cell);
            }, t.empty);
          } else {
            w.text(t.empty, ANSWER_SIZE, FAINT);
            w.y += 2.2;
          }
          break;
        default: {
          // text / textarea / date / time / number → okunur metin (tarih biçimi + birim).
          const out = displayAnswer(value, f, version, locale, yesNo);
          w.flow(clean(out) || t.empty, ANSWER_SIZE, out ? INK : FAINT);
          w.y += 2;
        }
      }
      w.y += 1.2;
    }
  }

  // ── İmza bloğu (son sayfa) ──
  w.ensure(30);
  w.y += 14;
  const colW = (CONTENT_W - 16) / 3;
  [t.signatureClient, t.signatureExpert, t.signatureDate].forEach((label, i) => {
    const x = MX + i * (colW + 8);
    w.line(x, x + colW, w.y);
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(label, x, w.y + 4.5);
  });
  w.y += 8;

  // ── Alt bilgi (her sayfa) ──
  const generated = t.generatedAt.replace("{date}", formatInstantIstanbul(input.now ?? new Date(), locale));
  drawFooters(doc, {
    note: m.wellnessNote,
    pageLabel: t.page,
    right: [`${version} · rev ${record.revision}`, generated],
    noteWidth: CONTENT_W - 64,
  });

  return new Uint8Array(doc.output("arraybuffer"));
}

/**
 * Satır tablosu (dolu): hücre metni sarılır, satır yüksekliği en uzun hücreye göre;
 * sayfa sonuna sığmayan satır yeni sayfaya geçer ve kolon başlığı yeniden çizilir.
 */
function drawFilledRows(
  w: Writer,
  columns: readonly RowColumn[],
  rows: RowValue[],
  colLabel: (key: string) => string,
  cellText: (c: RowColumn, cell: unknown) => string,
  empty: string,
) {
  const doc = w.doc;
  const colW = CONTENT_W / columns.length;
  const size = 8.5;
  const lh = size * 0.42;
  const pad = 1.6;
  const usable = PAGE_H - BOTTOM - TOP;

  const headLines = columns.map((c) => {
    doc.setFontSize(8);
    return doc.splitTextToSize(clean(colLabel(c.key)), colW - 3) as string[];
  });
  const headH = Math.max(...headLines.map((l) => l.length)) * 8 * 0.42 + pad * 2 + 0.6;

  const drawHead = () => {
    const top = w.y;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.setFillColor(...HEAD_BG);
    doc.rect(MX, top, CONTENT_W, headH, "FD");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    headLines.forEach((lines, i) => doc.text(lines, MX + i * colW + 1.5, top + pad + 8 * 0.42 * 0.8 + 0.3));
    for (let i = 1; i < columns.length; i++) doc.line(MX + i * colW, top, MX + i * colW, top + headH);
    w.y = top + headH;
  };

  const prepared = rows
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      doc.setFontSize(size);
      const cells = columns.map((c) => {
        const txt = clean(cellText(c, (r as Record<string, unknown>)[c.key]));
        const lines = (doc.splitTextToSize(txt || empty, colW - 3) as string[]);
        return { lines: lines.length > MAX_CELL_LINES ? [...lines.slice(0, MAX_CELL_LINES - 1), "…"] : lines, muted: !txt };
      });
      const h = Math.min(Math.max(...cells.map((c) => c.lines.length)) * lh + pad * 2, usable - headH - 2);
      return { cells, h };
    });

  w.ensure(headH + (prepared[0]?.h ?? 8) + 2);
  w.y += 1;
  drawHead();
  for (const row of prepared) {
    if (w.ensure(row.h + 1)) drawHead();
    const top = w.y;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.25);
    doc.rect(MX, top, CONTENT_W, row.h);
    for (let i = 1; i < columns.length; i++) doc.line(MX + i * colW, top, MX + i * colW, top + row.h);
    row.cells.forEach((cell, i) => {
      doc.setFontSize(size);
      doc.setTextColor(...(cell.muted ? FAINT : INK));
      doc.text(cell.lines, MX + i * colW + 1.5, top + pad + lh * 0.8);
    });
    w.y = top + row.h;
  }
  w.y += 3;
}
