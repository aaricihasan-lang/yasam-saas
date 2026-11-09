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
 *  - XML 1.0'da izinsiz karakterler (ör. Word'den yapıştırılan dikey sekme) temizlenir → belge her zaman açılır.
 *  - Sağlayıcı / teknik alanlar (provider, provider_raw, ham yanıt, sürüm/hash, sahiplik kimlikleri) Word'e ÇIKMAZ;
 *    JSON Sistem Yedeği geri yükleme uyumluluğu için bunları aynen taşır (bu dosya yalnız okunabilir arşivdir).
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
  /** Bölüm başlığı eki (Premium Arşiv parçaları: " (önceki bölümden devam)"). */
  titleSuffix?: string;
  /** İlk kaydın sıra numarası (parçalı arşivde numaralandırma kesintisiz sürer). Varsayılan 1. */
  firstIndex?: number;
};

/** Bağlı kayıt kimliği → okunabilir ad (ör. danışan "Ad Soyad"). Yoksa "bağlantılı kayıt (ref.)" yazılır. */
export type RefLabels = ReadonlyMap<string, string>;

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

const HIDDEN = new Set([
  "tenant_id", "user_id", "search_tsv", "search_norm", "identity_norm",
  // Sağlayıcı / teknik alanlar (kullanıcıya sunulan belgeye çıkmaz; JSON yedekte korunur).
  "provider", "provider_raw", "raw_response", "provider_api_version", "adapter_version", "endpoint",
  "input_hash", "source_input_hash", "technical_schema", "projection_version", "engine_version", "contract_version",
  "unmapped_fields", "versions_snapshot", "canonical_provenance", "roxy_render", "node_type", "provider_interp_included",
  // İdempotency / sahiplik kimlikleri (iç teknik bağlar).
  "save_request_id", "create_request_id", "owner_user_id", "created_by_user_id", "updated_by_user_id",
  "completed_by_user_id", "recorded_by_user_id", "uploaded_by_user_id", "expert_comment_updated_by",
  "created_by", "cancelled_by", "assigned_by", "deleted_by",
]);
/** İç içe (JSON) değerlerde de düşürülen anahtarlar: sağlayıcı adı / ham yanıt / iç sürüm izleri. */
const NESTED_HIDDEN_RE = /^(provider(_.*)?|.*_provider|raw(_.*)?|.*_raw|roxy.*|.*roxy.*|endpoint|adapter_version|input_hash|engine_version|contract_version|projection_version|technical_schema)$/i;
/** Sağlayıcı markası iç içe değerlerde görünmez (metin sağlayıcı adı içeriyorsa nötr ifade). */
const BRAND_RE = /roxy\s*api(\.com)?|roxy/gi;

/** XML 1.0'da izinsiz karakterler: C0 kontrol (TAB/LF/CR hariç), U+FFFE/U+FFFF, eşsiz vekil (surrogate). */
const XML_INVALID_RE = /[\u0000-\u0008\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/** Word XML'ine güvenli metin: dikey sekme / sayfa sonu karakteri satır sonu olur, diğer izinsiz karakterler silinir. */
export function xmlSafe(text: string): string {
  return text.replace(/[\u000B\u000C]/g, "\n").replace(XML_INVALID_RE, "");
}

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

/** Kayıt başlığı için ilk anlamlı alan (danışana bağlı kayıtta danışan adı eklenir). */
function recordTitle(row: Row, index: number, labels?: RefLabels): string {
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
  const clientLabel = typeof row.client_id === "string" ? labels?.get(row.client_id) : undefined;
  const base = t ? `${index}. ${t}` : `Kayıt ${index}`;
  return clientLabel && clientLabel !== t ? `${base} — ${clientLabel}` : base;
}

/** Değeri okunabilir tam metne çevirir (kısaltma yok). null → boş (alan atlanır). */
export function formatValue(key: string, value: unknown, labels?: RefLabels): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const v = value.trim();
    if (!v) return "";
    if (UUID_RE.test(v)) {
      if (key === "id") return "";
      return labels?.get(v.toLowerCase()) ?? labels?.get(v) ?? `bağlantılı kayıt (ref. ${v.slice(0, 8)})`;
    }
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
    return readableNested(value);
  }
  if (typeof value === "object") return readableNested(value);
  return String(value);
}

/**
 * İç içe değer → okunabilir girintili "alan: değer" satırları (JSON parantez/tırnak yok). Gizli / sağlayıcı
 * anahtarları düşer, marka nötrlenir, gömülü görsel etiketlenir (nestedReplacer ile aynı kurallar).
 */
function readableNested(value: unknown): string {
  const clean = JSON.parse(JSON.stringify(value, nestedReplacer) ?? "null") as unknown;
  const lines: string[] = [];
  const scalar = (v: unknown): string =>
    v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "Evet" : "Hayır") : String(v);
  const walk = (v: unknown, depth: number, label: string | null): void => {
    const pad = "  ".repeat(depth);
    if (v === null || typeof v !== "object") {
      lines.push(`${pad}${label !== null ? `${label}: ` : ""}${scalar(v)}`);
      return;
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return;
      if (v.every((x) => x === null || typeof x !== "object")) {
        lines.push(`${pad}${label !== null ? `${label}: ` : ""}${v.map(scalar).join(", ")}`);
        return;
      }
      if (label !== null) lines.push(`${pad}${label}:`);
      v.forEach((x, i) => walk(x, depth + (label !== null ? 1 : 0), `${i + 1}.`));
      return;
    }
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) return;
    if (label !== null) lines.push(`${pad}${label}`);
    for (const [k, x] of entries) walk(x, depth + (label !== null ? 1 : 0), colLabel(k));
  };
  walk(clean, 0, null);
  return lines.join("\n");
}

function dataUriReplacer(_k: string, v: unknown): unknown {
  return typeof v === "string" && v.startsWith("data:") ? "[gömülü görsel]" : v;
}

/** İç içe değerler: gömülü görsel → etiket; sağlayıcı / ham yanıt anahtarları düşer; marka adı nötrlenir. */
function nestedReplacer(k: string, v: unknown): unknown {
  if (k !== "" && (HIDDEN.has(k) || NESTED_HIDDEN_RE.test(k))) return undefined;
  if (typeof v === "string") {
    if (v.startsWith("data:")) return "[gömülü görsel]";
    return v.replace(BRAND_RE, "sağlayıcı");
  }
  return v;
}

function textRuns(text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean } = {}): TextRun[] {
  const lines = xmlSafe(text).split(/\r?\n/);
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
    children: [new TextRun({ text: xmlSafe(text), bold: true, size, font: "Calibri", color })],
  });
}

function note(text: string, color = "64748B", italics = true): Paragraph {
  return new Paragraph({ spacing: { after: 120 }, children: textRuns(text, { size: 18, color, italics }) });
}

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${xmlSafe(label)}: `, bold: true, size: 20, font: "Calibri", color: "334155" }),
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
  /** Bağlı kayıt adları (Premium Arşiv: danışan / HD danışanı / doğum profili / taş). */
  refLabels?: RefLabels;
  /** Kapak altı ek açıklamalar (ör. süzgeç özeti, parça numarası). */
  notes?: string[];
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
    new Paragraph({ children: [new TextRun({ text: xmlSafe(input.title), bold: true, size: 40, font: "Calibri", color: "1E293B" })] }),
    note(`Oluşturma tarihi: ${reportGeneratedLabel(undefined, now)}`, "64748B", false),
    note(
      "Bu belge okunabilir bir arşivdir; geri yükleme için Ayarlar > Sistem Yedeği (JSON) dosyasını kullanın. " +
        "Fotoğraf ve dosyaların kendisi dahil değildir (yalnız kayıt bilgisi).",
    ),
  ];
  for (const n of input.notes ?? []) children.push(note(n, "475569", false));
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
        (t.rows.length === 0 ? "kayıt yok" : `${t.rows.length} kayıt${t.expected_count !== null && t.expected_count !== t.rows.length ? ` / beklenen ${t.expected_count}` : ""}`) +
        (t.titleSuffix ?? "");
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
        children.push(heading(recordTitle(row, (t.firstIndex ?? 1) + i, input.refLabels), HeadingLevel.HEADING_3, 20, "0F172A"));
        for (const [k, v] of Object.entries(row)) {
          if (HIDDEN.has(k)) continue;
          const text = formatValue(k, v, input.refLabels);
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
