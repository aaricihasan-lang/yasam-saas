/**
 * BF-12B — İnsan-okunur Word arşivi (docx; mevcut bağımlılık yeniden kullanılır).
 *
 * - Restore kaynağı DEĞİLDİR (index bunu açıkça yazar).
 * - Teknik/ARCHIVE_ONLY/DO_NOT_RESTORE tablolar YALNIZ aggregate özet (ham dump yok).
 * - Hassas kolonlar redakte edilir; password/hash/token/secret/session ASLA basılmaz.
 * - owner_shared_read_dependency açıkça yazılır; canonical/shared ayrı belgeye alınır.
 * - Storage dosyaları yalnız manifest referansıyla; binary gömülmez.
 *
 * `renderedText` (her belge için düz metin) döner → harness secret-sentinel taraması.
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { Row, StorageAggregate, TablePolicyDecision } from "./types";
import type { TenantClass } from "./constants";

export interface WordArchiveInput {
  source: "fixture" | "production";
  classTotals: Record<string, number>;
  decisions: TablePolicyDecision[];
  storageAggregate: StorageAggregate;
  ownerSharedRead: { table: string; ownerRows: number }[];
  /** class → (table → o sınıfa ait satır sayısı). */
  perClassTableCounts: Map<string, Map<string, number>>;
  /** class → (table → sample rows; hassas kolonlar zaten çıkarılmış). */
  samplesByClass: Map<string, Map<string, Row[]>>;
}

export interface WordArchiveOutput {
  files: Map<string, Buffer>;
  renderedText: Map<string, string>;
}

const CLASS_DOC: { klass: string; file: string; title: string }[] = [
  { klass: "owner_admin_keep", file: "owner-admin.docx", title: "Owner / Admin (KEEP)" },
  { klass: "demo_review", file: "demo.docx", title: "Demo Tenant (REVIEW)" },
  { klass: "test_expert_1", file: "test-expert-1.docx", title: "Test Uzman 1 (BACKUP→DELETE)" },
  { klass: "test_expert_2", file: "test-expert-2.docx", title: "Test Uzman 2 (BACKUP→DELETE)" },
  { klass: "test_expert_3", file: "test-expert-3.docx", title: "Test Uzman 3 (BACKUP→DELETE)" },
  { klass: "userless_legacy_review", file: "userless-legacy.docx", title: "Userless / Legacy (REVIEW)" },
  { klass: "shared_canonical", file: "shared-canonical.docx", title: "Shared / Canonical İçerik" },
];

const SENSITIVE_NAME_RE = /(password|hash|token|secret|api[_-]?key|credential|authorization|session)/i;

function cell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[obje]";
    }
  }
  return String(value);
}

/** Bir metin bloğu üretir + renderedText'e ekler. */
class DocBuilder {
  readonly paragraphs: Paragraph[] = [];
  text = "";

  heading(t: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): void {
    this.paragraphs.push(new Paragraph({ text: t, heading: level }));
    this.text += t + "\n";
  }
  line(t: string, bold = false): void {
    this.paragraphs.push(new Paragraph({ children: [new TextRun({ text: t, bold })] }));
    this.text += t + "\n";
  }
  blank(): void {
    this.paragraphs.push(new Paragraph({ text: "" }));
  }
}

function renderSampleRows(
  b: DocBuilder,
  table: string,
  rows: Row[],
  sensitiveCols: Set<string>,
): void {
  b.line(`Tablo: ${table}`, true);
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const parts: string[] = [];
    for (const [k, v] of Object.entries(row)) {
      if (sensitiveCols.has(k) || SENSITIVE_NAME_RE.test(k)) continue; // redakte
      parts.push(`${k}=${cell(v)}`);
    }
    b.line(`  • ${parts.join(" | ")}`);
  }
  b.blank();
}

async function pack(b: DocBuilder): Promise<Buffer> {
  const doc = new Document({ sections: [{ children: b.paragraphs }] });
  return Packer.toBuffer(doc);
}

export async function buildWordArchive(input: WordArchiveInput): Promise<WordArchiveOutput> {
  const files = new Map<string, Buffer>();
  const renderedText = new Map<string, string>();
  const sensitiveByTable = new Map<string, Set<string>>();
  for (const d of input.decisions) sensitiveByTable.set(d.table, new Set(d.sensitiveColumns));
  const archiveOnly = new Set(
    input.decisions.filter((d) => d.restorePolicy !== "RESTORE").map((d) => d.table),
  );

  // ── backup-index.docx ──
  {
    const b = new DocBuilder();
    b.heading("BF-12B Yedek Arşivi — Dizin", HeadingLevel.HEADING_1);
    b.line("UYARI: Word belgeleri RESTORE KAYNAĞI DEĞİLDİR; yalnız insan-okunur özettir.", true);
    b.line("Tam geri yükleme için encrypted database archive + private manifest kullanılır.");
    b.line(`Kaynak: ${input.source}`);
    b.blank();
    b.heading("Tenant Sınıf Toplamları (satır)", HeadingLevel.HEADING_2);
    for (const [k, v] of Object.entries(input.classTotals)) b.line(`  ${k}: ${v}`);
    b.blank();
    b.heading("Tablo Politikaları", HeadingLevel.HEADING_2);
    for (const d of input.decisions.slice().sort((x, y) => (x.table < y.table ? -1 : 1))) {
      b.line(`  ${d.table}: ${d.restorePolicy} (${d.reason})`);
    }
    b.blank();
    b.heading("Owner Shared-Read Bağımlılığı", HeadingLevel.HEADING_2);
    if (input.ownerSharedRead.length === 0) b.line("  yok");
    for (const s of input.ownerSharedRead) {
      b.line(`  ${s.table}: ${s.ownerRows} owner satırı — KEEP, cleanup'a girmez (shared-read).`, true);
    }
    b.blank();
    b.heading("Storage Özeti", HeadingLevel.HEADING_2);
    b.line(`  Toplam obje: ${input.storageAggregate.totalObjects}, byte: ${input.storageAggregate.totalBytes}`);
    for (const [bucket, agg] of Object.entries(input.storageAggregate.byBucket)) {
      b.line(`  bucket ${bucket}: ${agg.objects} obje / ${agg.bytes} byte (binary manifestte referanslı; gömülü değil)`);
    }
    files.set("backup-index.docx", await pack(b));
    renderedText.set("backup-index.docx", b.text);
  }

  // ── per-class + shared-canonical docs ──
  for (const spec of CLASS_DOC) {
    const b = new DocBuilder();
    b.heading(`BF-12B — ${spec.title}`, HeadingLevel.HEADING_1);
    b.line("RESTORE KAYNAĞI DEĞİLDİR (insan-okunur özet).", true);
    b.blank();

    const counts = input.perClassTableCounts.get(spec.klass) ?? new Map<string, number>();
    b.heading("Tablo Bazlı Kayıt Sayıları", HeadingLevel.HEADING_2);
    if (counts.size === 0) b.line("  (bu sınıfta kayıt yok)");
    for (const [table, n] of [...counts.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
      const suffix = archiveOnly.has(table) ? " [aggregate-only]" : "";
      b.line(`  ${table}: ${n}${suffix}`);
    }
    b.blank();

    b.heading("Örnek Kayıtlar (redakte)", HeadingLevel.HEADING_2);
    const samples = input.samplesByClass.get(spec.klass);
    if (!samples || samples.size === 0) {
      b.line("  (örnek yok)");
    } else {
      for (const [table, rows] of [...samples.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
        if (archiveOnly.has(table)) continue; // teknik tablo → ham örnek yok
        renderSampleRows(b, table, rows, sensitiveByTable.get(table) ?? new Set());
      }
    }
    files.set(spec.file, await pack(b));
    renderedText.set(spec.file, b.text);
  }

  return { files, renderedText };
}

/** Word için tenant sınıfı → belge anahtarı eşlemesi (test expert 1/2/3 ayrımı için). */
export function wordClassKey(klass: TenantClass, testExpertOrdinal: number | null): string {
  if (klass === "test_expert_backup_then_delete" && testExpertOrdinal) {
    return `test_expert_${testExpertOrdinal}`;
  }
  if (klass === "null_shared") return "shared_canonical";
  return klass;
}
