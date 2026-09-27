/**
 * lib/backup/wordExport.ts — Ayarlar > Dışa Aktarım: registry tabanlı okunabilir Word arşivi (SUNUCU).
 *
 * İlkeler (FA-32):
 *  - Tablo listesi registry'den (yedekle aynı kapsam); veri keyset sayfalama ile TAM okunur.
 *  - Kısaltma YOK: metinler tam; geniş tablo yerine kayıt başına "alan: değer" blokları.
 *  - UUID'ler ham gösterilmez ("bağlantılı kayıt" etiketi); tenant_id/user_id gizli.
 *  - Okuma hataları / eksik tablolar belgede ve yanıtta görünür.
 *  - Açık boyut bütçesi: aşılırsa belge üretilmez, dürüst mesaj döner ("modül bazlı indirin").
 *  - Tarihler lib/time/reportTime (Europe/Istanbul): timestamptz → yerel saat, DATE → kaydırmasız.
 */
import { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import {
  formatDateLoose,
  formatDateOnly,
  formatInstantDateTime,
  isDateOnlyString,
  reportGeneratedLabel,
} from "@/lib/time/reportTime";
import type { RegistryEntry } from "./types";

type Row = Record<string, unknown>;

export type WordTableData = {
  entry: RegistryEntry;
  rows: Row[];
  expected_count: number | null;
  complete: boolean;
  error: string | null;
};

export type WordModuleData = { key: string; label: string; tables: WordTableData[] };

/** Toplam metin bütçesi (karakter) — Vercel 4.5 MB yanıt sınırı için güvenli pay. */
export const WORD_TEXT_BUDGET = 6_000_000;
export const WORD_BYTES_BUDGET = 4_000_000;
/** Bu sayıdan fazla kaydı tek Word'e koymayız (okunabilirlik + süre). */
export const WORD_RECORD_BUDGET = 12_000;

export class WordBudgetError extends Error {
  constructor(
    message: string,
    public readonly records: number,
  ) {
    super(message);
  }
}

const HIDDEN = new Set(["tenant_id", "user_id", "search_tsv", "search_norm", "identity_norm"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const COL_LABELS: Record<string, string> = {
  id: "Kayıt kimliği", name: "Ad", title: "Başlık", category: "Kategori", sub_category: "Alt kategori",
  status: "Durum", notes: "Notlar", note: "Not", description: "Açıklama", content: "İçerik", summary: "Özet",
  is_active: "Aktif", created_at: "Oluşturma", updated_at: "Güncelleme", sort_order: "Sıra",
  source: "Kaynak", priority: "Öncelik", type: "Tür", full_name: "Ad Soyad", ad: "Ad", soyad: "Soyad",
  email: "E-posta", telefon: "Telefon", phone: "Telefon", birth_date: "Doğum tarihi", dogum: "Doğum",
  client_id: "Danışan", stone_id: "Taş", sheet_id: "Referans sayfası", date: "Tarih",
  appointment_date: "Randevu tarihi", session_date: "Seans tarihi", due_date: "Son tarih",
  completed_at: "Tamamlanma", latin_name: "Latince adı", subject: "Konu", message: "Mesaj",
  admin_note: "Yönetici notu", headers: "Başlıklar", display_title: "Görünen başlık", sheet_name: "Sayfa adı",
  code: "Kod", keywords: "Anahtar kelimeler", row_index: "Satır no", is_header: "Başlık satırı", cells: "Hücreler",
  images: "Görseller", photos: "Fotoğraflar", file_path: "Dosya yolu", file_name: "Dosya adı",
  amount: "Tutar", fee: "Ücret", tags: "Etiketler", stone_name: "Taş adı", expert_note: "Uzman notu",
};

function colLabel(key: string): string {
  return COL_LABELS[key] ?? key.replace(/_/g, " ").replace(/^\w/, (c) => c.toLocaleUpperCase("tr-TR"));
}

/** Kayıt başlığı için ilk anlamlı alan. */
function recordTitle(row: Row, index: number): string {
  const pick = (k: string) => (typeof row[k] === "string" && (row[k] as string).trim() ? (row[k] as string).trim() : null);
  const person = [pick("ad"), pick("soyad")].filter(Boolean).join(" ");
  const t =
    pick("title") ??
    pick("name") ??
    pick("full_name") ??
    (person || null) ??
    pick("stone_name") ??
    pick("canonical_term_tr") ??
    pick("name_tr") ??
    pick("display_title") ??
    pick("subject") ??
    pick("label") ??
    pick("sheet_name");
  return t ? `${index}. ${t}` : `Kayıt ${index}`;
}

/** Değeri okunabilir tam metne çevirir (kısaltma yok). null → boş (alan atlanır). */
export function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return "";
    if (UUID_RE.test(v)) return key === "id" ? "" : `bağlantılı kayıt (ref. ${v.slice(0, 8)})`;
    if (/_at$/.test(key) && /^\d{4}-\d{2}-\d{2}[T ]/.test(v)) return formatInstantDateTime(v) || v;
    if (isDateOnlyString(v)) return formatDateOnly(v) || v;
    if (/(^|_)(date|tarih)$/.test(key)) return formatDateLoose(v) || v;
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.every((x) => typeof x === "string" || typeof x === "number")) {
      return value.map((x) => (typeof x === "string" && x.startsWith("data:") ? "[gömülü görsel]" : String(x))).join(", ");
    }
    return JSON.stringify(value, dataUriReplacer, 2);
  }
  if (typeof value === "object") {
    const s = JSON.stringify(value, dataUriReplacer, 2);
    return s === "{}" ? "" : s;
  }
  return String(value);
}

function dataUriReplacer(_k: string, v: unknown): unknown {
  return typeof v === "string" && v.startsWith("data:") ? "[gömülü görsel]" : v;
}

function textRuns(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}): TextRun[] {
  const lines = text.split(/\r?\n/);
  return lines.map(
    (line, i) =>
      new TextRun({
        text: line,
        break: i > 0 ? 1 : undefined,
        bold: opts.bold,
        italics: opts.italics,
        size: opts.size ?? 20,
        font: "Calibri",
        color: opts.color ?? "1E293B",
      }),
  );
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], size: number, color: string): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size, font: "Calibri", color })],
  });
}

function note(text: string, color = "64748B", italics = true): Paragraph {
  return new Paragraph({ spacing: { after: 120 }, children: textRuns(text, { size: 18, color, italics }) });
}

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, font: "Calibri", color: "334155" }),
      ...textRuns(value),
    ],
  });
}

/** Referans satırları: hücreleri sayfa başlıklarıyla eşleştirir. */
function referenceCells(row: Row, headersBySheet: Map<string, string[]>): Row {
  const headers = headersBySheet.get(String(row.sheet_id)) ?? [];
  const cells = (row.cells && typeof row.cells === "object" ? row.cells : {}) as Record<string, unknown>;
  const out: Row = { row_index: row.row_index, is_header: row.is_header };
  if (headers.length > 0) headers.forEach((h, i) => (out[h || `Sütun ${i + 1}`] = cells[String(i)] ?? null));
  else for (const [k, v] of Object.entries(cells)) out[`Sütun ${Number(k) + 1}`] = v;
  return out;
}

export function estimateTextSize(modules: WordModuleData[]): { chars: number; records: number } {
  let chars = 0;
  let records = 0;
  for (const m of modules) {
    for (const t of m.tables) {
      records += t.rows.length;
      for (const r of t.rows) chars += JSON.stringify(r, dataUriReplacer).length;
    }
  }
  return { chars, records };
}

export type WordBuildInput = {
  title: string;
  modules: WordModuleData[];
  now?: Date;
};

export type WordBuildResult = { buffer: Buffer; incompleteTables: string[]; records: number };

export async function buildArchiveDocx(input: WordBuildInput): Promise<WordBuildResult> {
  const now = input.now ?? new Date();
  const size = estimateTextSize(input.modules);
  if (size.records > WORD_RECORD_BUDGET || size.chars > WORD_TEXT_BUDGET) {
    throw new WordBudgetError(
      `Seçilen kapsam tek Word belgesi için çok büyük (${size.records} kayıt). ` +
        "Lütfen modül bazlı indirin; geri yüklenebilir tam kopya için JSON Sistem Yedeği'ni kullanın.",
      size.records,
    );
  }

  const incomplete: string[] = [];
  for (const m of input.modules) {
    for (const t of m.tables) {
      if (!t.complete) incomplete.push(`${m.label} › ${t.entry.label}${t.error ? ` (${t.error})` : ""}`);
    }
  }

  const children: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: input.title, bold: true, size: 40, font: "Calibri", color: "1E293B" })] }),
    note(`Oluşturma tarihi: ${reportGeneratedLabel(undefined, now)}`, "64748B", false),
    note(
      "Bu belge okunabilir bir arşivdir; geri yükleme için Ayarlar > Sistem Yedeği (JSON) dosyasını kullanın. " +
        "Fotoğraf ve dosyaların kendisi dahil değildir (yalnız kayıt bilgisi).",
    ),
  ];
  if (incomplete.length > 0) {
    children.push(heading("Eksik veya okunamayan bölümler", HeadingLevel.HEADING_2, 24, "B91C1C"));
    children.push(note("Aşağıdaki bölümler tam okunamadı; bu belge bu bölümler için EKSİKTİR:", "B91C1C", false));
    for (const s of incomplete) children.push(note(`• ${s}`, "B91C1C", false));
  }

  input.modules.forEach((m, mi) => {
    if (mi > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading(m.label, HeadingLevel.HEADING_1, 32, "1E293B"));
    const headersBySheet = new Map<string, string[]>();
    for (const t of m.tables) {
      if (t.entry.table === "aromatherapy_reference_sheets") {
        for (const s of t.rows) headersBySheet.set(String(s.id), Array.isArray(s.headers) ? (s.headers as string[]).map(String) : []);
      }
    }
    for (const t of m.tables) {
      const countLabel =
        t.rows.length === 0 ? "kayıt yok" : `${t.rows.length} kayıt${t.expected_count !== null && t.expected_count !== t.rows.length ? ` / beklenen ${t.expected_count}` : ""}`;
      children.push(heading(`${t.entry.label} — ${countLabel}`, HeadingLevel.HEADING_2, 24, "3730A3"));
      if (!t.complete) {
        children.push(note(`Bu bölüm eksik olabilir${t.error ? `: ${t.error}` : "."}`, "B91C1C", false));
      }
      if (t.rows.length === 0) {
        children.push(note("Bu bölümde kayıt bulunmuyor."));
        continue;
      }
      t.rows.forEach((raw, i) => {
        const row = t.entry.table === "aromatherapy_reference_rows" ? referenceCells(raw, headersBySheet) : raw;
        children.push(heading(recordTitle(row, i + 1), HeadingLevel.HEADING_3, 20, "0F172A"));
        for (const [k, v] of Object.entries(row)) {
          if (HIDDEN.has(k)) continue;
          const text = formatValue(k, v);
          if (!text) continue;
          children.push(field(colLabel(k), text));
        }
      });
    }
  });

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  if (buffer.length > WORD_BYTES_BUDGET) {
    throw new WordBudgetError(
      `Belge boyutu indirme sınırını aşıyor (${(buffer.length / 1_048_576).toFixed(1)} MB). Lütfen modül bazlı indirin.`,
      size.records,
    );
  }
  return { buffer, incompleteTables: incomplete, records: size.records };
}
