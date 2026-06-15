#!/usr/bin/env npx tsx
/**
 * Aromaterapi Excel — Birebir Referans Import
 *
 * Kaynak: ~/Downloads/Aromaterapi.xlsx
 * Hedef:  aromatherapy_reference_sheets  +  aromatherapy_reference_rows
 *
 * Aktarılan sheet'ler:
 *   - Genel Bilgi
 *   - Uçucu Yağ Elde Etme Yöntemleri
 *   - Uçucu Yağların Etki Mekanizması
 *
 * Kural: Hiçbir metin değiştirilemez, özetlenemez, eklenemez.
 *        Hücrede ne yazıyorsa cells JSONB içine aynen gider.
 *
 * Kullanım:
 *   npx tsx scripts/import-aromatherapy-reference.ts --dry
 *   npx tsx scripts/import-aromatherapy-reference.ts --dry --verbose
 *   npx tsx scripts/import-aromatherapy-reference.ts --write          ← ONAY BEKLENIYOR
 */

import * as XLSX from "xlsx";
import * as path from "path";
import * as os   from "os";
import * as fs   from "fs";
import { createClient } from "@supabase/supabase-js";

// -------------------------------------------------------
// .env.local yükle
// -------------------------------------------------------
function loadEnvLocal(): void {
  const p = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

// -------------------------------------------------------
// Argümanlar
// -------------------------------------------------------
const argv    = process.argv.slice(2);
const DRY     = !argv.includes("--write");
const VERBOSE = argv.includes("--verbose");
const EXCEL   = path.join(os.homedir(), "Downloads", "Aromaterapi.xlsx");

// -------------------------------------------------------
// Import edilecek sheet'ler
// -------------------------------------------------------
type SheetImportConfig = {
  sheetName:    string;
  displayTitle: string;
  sortOrder:    number;
};

const SHEET_CONFIGS: SheetImportConfig[] = [
  {
    sheetName:    "Genel Bilgi",
    displayTitle: "Genel Bilgi",
    sortOrder:    1,
  },
  {
    sheetName:    "Uçucu Yağ Elde Etme Yöntemleri",
    displayTitle: "Uçucu Yağ Elde Etme Yöntemleri",
    sortOrder:    2,
  },
  {
    sheetName:    "Uçucu Yağların Etki Mekanizması",
    displayTitle: "Uçucu Yağların Etki Mekanizması",
    sortOrder:    3,
  },
];

// -------------------------------------------------------
// Yardımcı — ham değer → string (boş hücre = "")
// -------------------------------------------------------
const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

// -------------------------------------------------------
// Tip tanımları
// -------------------------------------------------------
type ParsedRow = {
  rowIndex:  number;
  cells:     Record<string, string>;   // {"0": "...", "1": "..."}
  isHeader:  boolean;
  filledCount: number;
};

type ParsedSheet = {
  config:   SheetImportConfig;
  headers:  string[];                 // 0-tabanlı sütun değerleri (başlık satırı)
  rows:     ParsedRow[];              // başlık satırı dahil
  colCount: number;
  filledCells: number;
  totalCells:  number;
};

// -------------------------------------------------------
// Excel sheet'ini parse et
// -------------------------------------------------------
function parseSheet(wb: XLSX.WorkBook, cfg: SheetImportConfig): ParsedSheet | null {
  const ws = wb.Sheets[cfg.sheetName];
  if (!ws) {
    console.warn(`  ⚠️  Sheet bulunamadı: "${cfg.sheetName}"`);
    return null;
  }

  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, defval: "", blankrows: true, raw: false,
  });

  const ref      = ws["!ref"];
  const range    = ref ? XLSX.utils.decode_range(ref) : null;
  const colCount = range ? range.e.c - range.s.c + 1 : 0;

  // Başlık satırı = satır 0
  const headerRow = aoa[0] ?? [];
  const headers: string[] = [];
  for (let c = 0; c < colCount; c++) {
    headers.push(str(headerRow[c]));
  }

  let filledCells = 0;
  let totalCells  = 0;

  const rows: ParsedRow[] = [];

  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    const cells: Record<string, string> = {};
    let rowFilled = 0;

    for (let c = 0; c < colCount; c++) {
      const val = str(row[c]);
      cells[String(c)] = val;
      totalCells++;
      if (val.length > 0) {
        filledCells++;
        rowFilled++;
      }
    }

    // Tamamen boş satırları tut ama say
    rows.push({
      rowIndex:   r,
      cells,
      isHeader:   r === 0,
      filledCount: rowFilled,
    });
  }

  return { config: cfg, headers, rows, colCount, filledCells, totalCells };
}

// -------------------------------------------------------
// Dry-run raporu
// -------------------------------------------------------
function dryRunReport(sheets: ParsedSheet[]): void {
  const HR = "═".repeat(80);
  const hr = "─".repeat(80);

  console.log(`\n${HR}`);
  console.log(`📋 AROMATERAPİ REFERANS IMPORT — DRY-RUN`);
  console.log(`   Dosya: ${EXCEL}`);
  console.log(HR);

  let totalRows = 0;
  let totalFilled = 0;
  let totalCells = 0;

  for (const sheet of sheets) {
    const nonEmptyRows = sheet.rows.filter(r => r.filledCount > 0);
    totalRows   += nonEmptyRows.length;
    totalFilled += sheet.filledCells;
    totalCells  += sheet.totalCells;

    console.log(`\n${hr}`);
    console.log(`📄 SHEET: "${sheet.config.sheetName}"`);
    console.log(`   display_title : "${sheet.config.displayTitle}"`);
    console.log(`   sort_order    : ${sheet.config.sortOrder}`);
    console.log(`   Sütun sayısı  : ${sheet.colCount}`);
    console.log(`   Toplam satır  : ${sheet.rows.length}`);
    console.log(`   Dolu satır    : ${nonEmptyRows.length}`);
    console.log(`   Dolu hücre    : ${sheet.filledCells} / ${sheet.totalCells}`);

    console.log(`\n   Başlıklar (headers):`);
    for (let c = 0; c < sheet.headers.length; c++) {
      const h = sheet.headers[c];
      if (h) console.log(`     [${c}] "${h}"`);
    }

    // Dolu satırları göster
    const doluRows = sheet.rows.filter(r => r.filledCount > 0);

    console.log(`\n   İlk 3 dolu satır:`);
    for (const row of doluRows.slice(0, 3)) {
      console.log(`\n   R${row.rowIndex}${row.isHeader ? " [HEADER]" : ""}:`);
      for (const [c, val] of Object.entries(row.cells)) {
        if (val.length > 0) {
          console.log(`     [${c}] "${val.slice(0, 100)}${val.length > 100 ? "…" : ""}"`);
        }
      }
    }

    if (doluRows.length > 3) {
      console.log(`\n   Son dolu satır (R${doluRows[doluRows.length - 1]!.rowIndex}):`);
      const last = doluRows[doluRows.length - 1]!;
      for (const [c, val] of Object.entries(last.cells)) {
        if (val.length > 0) {
          console.log(`     [${c}] "${val.slice(0, 100)}${val.length > 100 ? "…" : ""}"`);
        }
      }
    }

    // Verbose: tüm dolu satırlar
    if (VERBOSE) {
      console.log(`\n   ── VERBOSE: Tüm dolu satırlar ──`);
      for (const row of doluRows) {
        if (row.isHeader) continue;
        console.log(`\n   R${row.rowIndex}:`);
        for (const [c, val] of Object.entries(row.cells)) {
          if (val.length > 0) {
            console.log(`     [${c}] "${val.slice(0, 120)}${val.length > 120 ? "…" : ""}"`);
          }
        }
      }
    }

    // Birebir kontrol: uzun metinler var mı?
    const longCells = sheet.rows.flatMap(r =>
      Object.entries(r.cells)
        .filter(([, v]) => v.length > 100)
        .map(([c, v]) => ({ row: r.rowIndex, col: c, len: v.length }))
    );
    if (longCells.length > 0) {
      console.log(`\n   Uzun hücre (>100kr): ${longCells.length} adet`);
      for (const lc of longCells.slice(0, 5)) {
        console.log(`     R${lc.row}C${lc.col}: ${lc.len} karakter`);
      }
    }
  }

  console.log(`\n${HR}`);
  console.log(`📊 GENEL ÖZET`);
  console.log(`   Sheet sayısı     : ${sheets.length}`);
  console.log(`   Toplam dolu satır: ${totalRows}`);
  console.log(`   Toplam dolu hücre: ${totalFilled}`);
  console.log(`   Toplam hücre     : ${totalCells}`);
  console.log(`\n   ⚠️  DRY-RUN — DB'ye yazılmadı.`);
  console.log(`   Gerçek import için: npx tsx scripts/import-aromatherapy-reference.ts --write`);
  console.log(HR);
}

// -------------------------------------------------------
// Gerçek DB yazma
// -------------------------------------------------------
async function writeToDb(sheets: ParsedSheet[]): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const HR = "═".repeat(80);

  console.log(`\n${HR}`);
  console.log(`📋 AROMATERAPİ REFERANS IMPORT — ⚡ YAZMA MODU`);
  console.log(HR);

  // Önce mevcut paylaşımlı kayıtları temizle (idempotent)
  const { error: delErr } = await sb
    .from("aromatherapy_reference_sheets")
    .delete()
    .is("tenant_id", null);
  if (delErr) {
    console.error(`  ❌ Temizleme hatası: ${delErr.message}`);
    process.exit(1);
  }
  console.log("  Önceki paylaşımlı sheet'ler temizlendi.");

  for (const sheet of sheets) {
    console.log(`\n  Sheet: "${sheet.config.sheetName}"`);

    // Sheet kaydı oluştur
    const { data: sheetData, error: sheetErr } = await sb
      .from("aromatherapy_reference_sheets")
      .insert({
        tenant_id:     null,
        sheet_name:    sheet.config.sheetName,
        display_title: sheet.config.displayTitle,
        headers:       sheet.headers,
        sort_order:    sheet.config.sortOrder,
        is_active:     true,
      })
      .select("id")
      .single();

    if (sheetErr || !sheetData) {
      console.error(`  ❌ Sheet insert hatası: ${sheetErr?.message}`);
      continue;
    }

    const sheetId = sheetData.id as string;
    console.log(`  ✅ Sheet oluşturuldu: ${sheetId}`);

    // Sadece dolu satırları kaydet (tamamen boş satırları atla)
    const rowsToInsert = sheet.rows
      .filter(r => r.filledCount > 0)
      .map(r => ({
        sheet_id:  sheetId,
        row_index: r.rowIndex,
        cells:     r.cells,
        is_header: r.isHeader,
      }));

    if (rowsToInsert.length === 0) {
      console.log(`  ℹ️  Dolu satır yok, atlandı.`);
      continue;
    }

    // Batch insert (50'şer)
    const BATCH = 50;
    let inserted = 0;
    for (let i = 0; i < rowsToInsert.length; i += BATCH) {
      const batch = rowsToInsert.slice(i, i + BATCH);
      const { data: rowData, error: rowErr } = await sb
        .from("aromatherapy_reference_rows")
        .insert(batch)
        .select("id");

      if (rowErr) {
        console.error(`    ❌ Row batch ${Math.floor(i / BATCH) + 1} hata: ${rowErr.message}`);
      } else {
        inserted += rowData?.length ?? 0;
      }
    }

    console.log(`  ✅ ${inserted} satır eklendi (${rowsToInsert.length} toplam)`);
  }

  // Doğrulama
  const { count: sc } = await sb
    .from("aromatherapy_reference_sheets")
    .select("*", { count: "exact", head: true })
    .is("tenant_id", null);

  const { count: rc } = await sb
    .from("aromatherapy_reference_rows")
    .select("*", { count: "exact", head: true });

  console.log(`\n  DB doğrulama:`);
  console.log(`    Sheet sayısı : ${sc}`);
  console.log(`    Satır sayısı : ${rc}`);
  console.log(`\n${HR}\n`);
}

// -------------------------------------------------------
// Ana akış
// -------------------------------------------------------
async function main(): Promise<void> {
  if (!fs.existsSync(EXCEL)) {
    console.error(`❌ Excel bulunamadı: ${EXCEL}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(EXCEL, {
    type: "file", cellText: true, cellDates: false, raw: false,
  });

  const parsed: ParsedSheet[] = [];
  for (const cfg of SHEET_CONFIGS) {
    const sheet = parseSheet(wb, cfg);
    if (sheet) parsed.push(sheet);
  }

  if (parsed.length === 0) {
    console.error("❌ Hiçbir sheet parse edilemedi.");
    process.exit(1);
  }

  if (DRY) {
    dryRunReport(parsed);
  } else {
    await writeToDb(parsed);
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
