#!/usr/bin/env npx tsx
/**
 * Aromaterapi Excel Import Script
 *
 * Kullanım:
 *   npx tsx scripts/import-aromatherapy.ts --dry --sheet ucucu            ← özet analiz
 *   npx tsx scripts/import-aromatherapy.ts --dry --sheet ucucu --verbose  ← kayıt detayları
 *   npx tsx scripts/import-aromatherapy.ts --dry --sheet ucucu --limit 5
 *   npx tsx scripts/import-aromatherapy.ts --write --sheet ucucu          ← ÜRETIM YAZMA
 *
 * Seçenekler:
 *   --dry           Dry-run (varsayılan güvenlik — --write olmadan hep dry)
 *   --write         Gerçek insert
 *   --sheet         ucucu | sabit | maserasyon (varsayılan: ucucu)
 *   --limit N       Sadece ilk N veri satırını işle
 *   --verbose       Her kayıt için detaylı çıktı (dry modda)
 *   --excel PATH    Excel dosya yolu (varsayılan: ~/Downloads/Aromaterapi.xlsx)
 */

import * as XLSX from "xlsx";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";

// -------------------------------------------------------
// .env.local yükle (Next.js path aliasları yokken env gerekli)
// -------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

// -------------------------------------------------------
// Arg parsing
// -------------------------------------------------------
const argv  = process.argv.slice(2);
const flag  = (n: string) => argv.includes(`--${n}`);
const opt   = (n: string) => { const i = argv.indexOf(`--${n}`); return i !== -1 && argv[i+1] ? argv[i+1] : undefined; };

const DRY     = !flag("write");
const VERBOSE = flag("verbose");
const SHEET   = opt("sheet")  ?? "ucucu";
const LIMIT   = opt("limit")  ? parseInt(opt("limit")!, 10) : Infinity;
const EXCEL   = opt("excel")  ?? path.join(os.homedir(), "Downloads", "Aromaterapi.xlsx");

// -------------------------------------------------------
// Sheet konfigürasyonu
// -------------------------------------------------------
interface SheetConfig { sheetName: string; oilType: string; mode: "full"|"stub"; nameColIndex: number; }

const SHEET_CONFIGS: Record<string, SheetConfig> = {
  ucucu:      { sheetName: "Uçucu Yağlar",      oilType: "essential",  mode: "full", nameColIndex: 1 },
  sabit:      { sheetName: "Sabit Yağlar",       oilType: "carrier",    mode: "stub", nameColIndex: 0 },
  maserasyon: { sheetName: "Maserasyon Yağları", oilType: "maceration", mode: "stub", nameColIndex: 0 },
};

const cfg = SHEET_CONFIGS[SHEET];
if (!cfg) { console.error(`❌ Bilinmeyen sheet: "${SHEET}"`); process.exit(1); }

// -------------------------------------------------------
// Yardımcılar
// -------------------------------------------------------
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function parseBlends(raw: string): string[] {
  if (!raw.trim()) return [];
  const SUFFIXES = [
    /\s+gibi yağlarla uyumludur\.?…?$/i,
    /\s+ile uyumludur\.?$/i,
    /\s+yağlarla uyumludur\.?$/i,
    /\s+yağları ile uyumludur\.?$/i,
    /\s+yağları uyumludur\.?$/i,
    /\s+uyumludur\.?$/i,
    /…+$/,
    /\.$/,
  ];
  let s = raw.trim();
  for (const re of SUFFIXES) s = s.replace(re, "").trim();
  s = s.replace(/\s+ve\s+/gi, ",");
  return s.split(",").map(x => x.trim()).filter(x => x.length > 1);
}

function removeSelfFromBlends(oilName: string, blends: string[]): string[] {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, " ")
      .replace(/\s+yağı\s*$/i, "")
      .replace(/\s+yağ\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  const oilCore = normalize(oilName);
  return blends.filter(b => {
    const lc    = b.toLowerCase();
    const cutAt = lc.indexOf(" yağı");
    const bRaw  = cutAt > 0 ? b.slice(0, cutAt) : b;
    const bCore = normalize(bRaw);
    return !(bCore === oilCore && bCore.length >= 2);
  });
}

// -------------------------------------------------------
// DB kayıt tipi
// -------------------------------------------------------
interface OilRecord {
  _rowIndex: number;
  tenant_id: null;
  oil_type: string;
  name: string;
  latin_name: string;
  english_name: string;
  origin: string;
  aroma_profile: string;
  plant_part: string;
  main_components: string;
  emotional_benefits: string;
  diffuser_usage: string;
  massage_usage: string;
  blends_well_with: string[];
  blends_raw: string;
  safety_notes: string;
  notes: string;
  extraction_method: string;
  aroma_note: string;
  color: string;
  consistency: string;
  is_photosensitive: boolean;
  therapeutic_properties: string[];
  spiritual_benefits: string;
  physical_benefits: string;
  skin_benefits: string;
  benefits: string;
  usage_methods: string;
  dilution_ratio: string;
  contraindications: string;
  target_systems: string[];
  chakra_connection: string;
  element_connection: string;
  shelf_life: string;
  images: string[];
  source: string;
}

// -------------------------------------------------------
// Satır → OilRecord
// -------------------------------------------------------
function rowToFull(row: unknown[], oilType: string, idx: number): OilRecord {
  const rawBlends = str(row[11]);
  const name      = str(row[1]);
  return {
    _rowIndex: idx,
    tenant_id: null, oil_type: oilType,
    name,
    latin_name:         str(row[2]),
    english_name:       str(row[3]),
    origin:             str(row[4]),
    aroma_profile:      str(row[5]),
    plant_part:         str(row[6]),
    main_components:    str(row[7]),
    emotional_benefits: str(row[8]),
    diffuser_usage:     str(row[9]),
    massage_usage:      str(row[10]),
    blends_raw:         rawBlends,
    blends_well_with:   removeSelfFromBlends(name, parseBlends(rawBlends)),
    safety_notes:       str(row[12]),
    notes:              str(row[13]),
    extraction_method: "", aroma_note: "", color: "", consistency: "",
    is_photosensitive: false, therapeutic_properties: [],
    spiritual_benefits: "", physical_benefits: "", skin_benefits: "",
    benefits: "", usage_methods: "", dilution_ratio: "", contraindications: "",
    target_systems: [], chakra_connection: "", element_connection: "",
    shelf_life: "", images: [], source: "Aromaterapi.xlsx",
  };
}

function rowToStub(row: unknown[], oilType: string, nameCol: number, idx: number): OilRecord {
  return {
    _rowIndex: idx, tenant_id: null, oil_type: oilType,
    name: str(row[nameCol]),
    latin_name: "", english_name: "", origin: "", aroma_profile: "",
    plant_part: "", main_components: "", emotional_benefits: "",
    diffuser_usage: "", massage_usage: "", blends_raw: "", blends_well_with: [],
    safety_notes: "", notes: "", extraction_method: "", aroma_note: "",
    color: "", consistency: "", is_photosensitive: false, therapeutic_properties: [],
    spiritual_benefits: "", physical_benefits: "", skin_benefits: "", benefits: "",
    usage_methods: "", dilution_ratio: "", contraindications: "", target_systems: [],
    chakra_connection: "", element_connection: "", shelf_life: "", images: [],
    source: "Aromaterapi.xlsx",
  };
}

// -------------------------------------------------------
// Supabase insert (batch = 50 kayıt)
// -------------------------------------------------------
type DbRow = Omit<OilRecord, "_rowIndex" | "blends_raw">;

function toDbRow(r: OilRecord): DbRow {
  const { _rowIndex, blends_raw, ...rest } = r;
  void _rowIndex; void blends_raw;
  return rest;
}

const BATCH_SIZE = 50;

async function insertAll(
  records: OilRecord[],
): Promise<{ inserted: number; errors: Array<{ batch: number; msg: string }> }> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY eksik");
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  let inserted = 0;
  const errors: Array<{ batch: number; msg: string }> = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch     = records.slice(i, i + BATCH_SIZE).map(toDbRow);
    const batchNum  = Math.floor(i / BATCH_SIZE) + 1;
    const { data, error } = await sb
      .from("aromatherapy_oils")
      .insert(batch)
      .select("id");

    if (error) {
      errors.push({ batch: batchNum, msg: error.message });
      console.error(`  ❌ Batch ${batchNum} hata: ${error.message}`);
    } else {
      inserted += data?.length ?? 0;
      console.log(`  ✅ Batch ${batchNum}: ${data?.length ?? 0} kayıt eklendi`);
    }
  }

  return { inserted, errors };
}

// -------------------------------------------------------
// DB doğrulama sorguları
// -------------------------------------------------------
async function verifyDb(oilType: string): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const HR = "─".repeat(68);
  console.log(`\n${HR}`);
  console.log(`🔍 DB DOĞRULAMA — oil_type = "${oilType}"`);
  console.log(HR);

  // Toplam sayı
  const { count, error: cErr } = await sb
    .from("aromatherapy_oils")
    .select("*", { count: "exact", head: true })
    .eq("oil_type", oilType)
    .is("tenant_id", null);
  if (cErr) { console.log(`  Sayım hatası: ${cErr.message}`); }
  else { console.log(`  Toplam kayıt (tenant_id=null, type=${oilType}): ${count}`); }

  // Duplicate kontrolü
  const { data: allNames, error: nErr } = await sb
    .from("aromatherapy_oils")
    .select("name")
    .eq("oil_type", oilType)
    .is("tenant_id", null);
  if (!nErr && allNames) {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const r of allNames) {
      const k = (r.name as string).toLowerCase();
      if (seen.has(k)) dups.push(r.name as string);
      else seen.add(k);
    }
    console.log(`  Duplicate kontrol: ${dups.length === 0 ? "Yok ✅" : `${dups.length} adet ❌ → ${dups.slice(0,5).join(", ")}`}`);
  }

  // İlk 5 kayıt
  const { data: first5, error: f5Err } = await sb
    .from("aromatherapy_oils")
    .select("name, latin_name, oil_type, blends_well_with")
    .eq("oil_type", oilType)
    .is("tenant_id", null)
    .order("name", { ascending: true })
    .limit(5);
  if (f5Err) { console.log(`  İlk 5 sorgu hatası: ${f5Err.message}`); }
  else {
    console.log(`\n  İlk 5 kayıt (A-Z):`);
    for (const r of first5 ?? []) {
      const blends = (r.blends_well_with as string[]) ?? [];
      console.log(`    ✅ "${r.name}" | latin: ${r.latin_name ? r.latin_name.slice(0,30) : "—"} | blends: ${blends.length}`);
    }
  }
}

// -------------------------------------------------------
// Ana fonksiyon
// -------------------------------------------------------
async function main(): Promise<void> {
  const HR = "═".repeat(68);
  const hr = "─".repeat(68);

  console.log(`\n${HR}`);
  console.log(`🌿 Aromaterapi Import — ${DRY ? "DRY-RUN ANALİZ" : "⚡ YAZMA MODU"}`);
  console.log(HR);
  console.log(`  Excel  : ${EXCEL}`);
  console.log(`  Sheet  : ${cfg.sheetName}  (oil_type = ${cfg.oilType})`);
  console.log(`  Mod    : ${cfg.mode}  |  Limit: ${Number.isFinite(LIMIT) ? LIMIT : "tümü"}`);
  if (!DRY) console.log(`  ⚠️  GERÇEK INSERT — production'a yazılacak`);
  console.log(`${HR}\n`);

  if (!fs.existsSync(EXCEL)) { console.error(`❌ Excel bulunamadı: ${EXCEL}`); process.exit(1); }

  const wb  = XLSX.readFile(EXCEL, { type: "file", cellText: true, cellDates: false });
  const ws  = wb.Sheets[cfg.sheetName];
  if (!ws) { console.error(`❌ Sheet bulunamadı: "${cfg.sheetName}"`); process.exit(1); }

  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1, defval: "", blankrows: false, raw: false,
  });

  const dataRows   = aoa.slice(1);
  const filledRows = dataRows.filter(r => str(r[cfg.nameColIndex]).length > 0);
  const toProcess  = Number.isFinite(LIMIT) ? filledRows.slice(0, LIMIT) : filledRows;

  console.log(`📊 Sheet istatistikleri:`);
  console.log(`   Toplam satır     : ${dataRows.length}`);
  console.log(`   Dolu satır       : ${filledRows.length}`);
  console.log(`   İşlenecek        : ${toProcess.length}`);

  // Kayıtları oluştur
  const records: OilRecord[] = [];
  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i]!;
    const rec = cfg.mode === "full"
      ? rowToFull(row, cfg.oilType, i + 2)
      : rowToStub(row, cfg.oilType, cfg.nameColIndex, i + 2);
    if (rec.name) records.push(rec);
  }

  console.log(`   Import'a uygun   : ${records.length}`);

  // ---- DRY-RUN özet ----
  if (DRY) {
    console.log(`\n⚠️  DRY-RUN: DB'ye yazılmıyor.\n`);

    // Verbose
    if (VERBOSE) {
      for (const r of records) {
        console.log(`\n${hr}`);
        console.log(`📋 #${r._rowIndex}  ${r.name}`);
        console.log(`   latin  : ${r.latin_name || "—"}`);
        console.log(`   blends : [${r.blends_well_with.join(", ")}]`);
      }
    }

    // ---- İç duplicate kontrolü ----
    const nameSeen = new Map<string, number>();
    const dups: string[] = [];
    for (const r of records) {
      const k = r.name.toLowerCase();
      nameSeen.set(k, (nameSeen.get(k) ?? 0) + 1);
    }
    for (const [k, c] of nameSeen) if (c > 1) dups.push(k);

    const nc = (s: string) =>
      s.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+yağı\s*$/i, "").replace(/\s+yağ\s*$/i, "").replace(/\s+/g, " ").trim();
    const selfLeft = records.filter(r => {
      const oc = nc(r.name);
      return r.blends_well_with.some(b => { const cut = b.toLowerCase().indexOf(" yağı"); return nc(cut>0?b.slice(0,cut):b) === oc; });
    });

    // ---- Cross-type çakışma (DB'deki diğer tipler ile) ----
    const crossConflicts: string[] = [];
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const { data: existing } = await sb
        .from("aromatherapy_oils")
        .select("name, oil_type")
        .is("tenant_id", null);
      if (existing && existing.length > 0) {
        const existingNames = new Map<string, string>();
        for (const e of existing) existingNames.set((e.name as string).toLowerCase(), e.oil_type as string);
        for (const r of records) {
          const k = r.name.toLowerCase();
          if (existingNames.has(k)) {
            crossConflicts.push(`"${r.name}" (zaten ${existingNames.get(k)} olarak mevcut)`);
          }
        }
      }
    }

    // ---- Stub alan doğrulaması ----
    const allFieldsEmpty = cfg.mode === "stub"
      ? records.every(r =>
          !r.latin_name && !r.english_name && !r.origin && !r.aroma_profile &&
          !r.main_components && !r.emotional_benefits
        )
      : null;

    console.log(`${HR}`);
    console.log(`📊 DRY-RUN ÖZET — ${cfg.sheetName}`);
    console.log(HR);
    console.log(`  Toplam okundu         : ${toProcess.length}`);
    console.log(`  Import'a uygun        : ${records.length}`);
    console.log(`  Boş name              : ${toProcess.length - records.length} ${toProcess.length - records.length === 0 ? "✅" : "❌"}`);
    console.log(`  İç duplicate          : ${dups.length === 0 ? "Yok ✅" : `${dups.length} ❌ → ${dups.join(", ")}`}`);
    console.log(`  Cross-type çakışma    : ${crossConflicts.length === 0 ? "Yok ✅" : `${crossConflicts.length} ⚠️`}`);
    if (crossConflicts.length > 0) {
      for (const c of crossConflicts.slice(0, 10)) console.log(`     ${c}`);
      if (crossConflicts.length > 10) console.log(`     … ve ${crossConflicts.length - 10} daha`);
    }
    if (cfg.mode === "stub") {
      console.log(`  Stub doğrulama        : ${allFieldsEmpty ? "Tüm detay alanları boş ✅" : "⚠️ Bazı alanlar dolu — kontrol et"}`);
      console.log(`  Sadece isim import    : ✅ (Latin, içerik, faydalar vs. doldurulmayacak)`);
    } else {
      console.log(`  Kendi adı blend'de    : ${selfLeft.length === 0 ? "Yok ✅" : selfLeft.length + " ⚠️"}`);
      console.log(`  latin_name boş        : ${records.filter(r=>!r.latin_name).length}`);
      console.log(`  main_components boş   : ${records.filter(r=>!r.main_components).length}`);
      console.log(`  emotional_benefits boş: ${records.filter(r=>!r.emotional_benefits).length}`);
      console.log(`  safety_notes boş      : ${records.filter(r=>!r.safety_notes).length}`);
    }
    console.log(`\n  İlk 3:`);
    for (const r of records.slice(0, 3))
      console.log(`    #${r._rowIndex}  ${r.name}`);
    console.log(`  Son 3:`);
    for (const r of records.slice(-3))
      console.log(`    #${r._rowIndex}  ${r.name}`);

    const ready = dups.length === 0 && crossConflicts.length === 0;
    console.log(`\n${ready ? "✅ Dry-run temiz — import'a hazır." : "⚠️  Sorunlar var — çözülmeden import yapma."}`);
    console.log(`   Gerçek import: npx tsx scripts/import-aromatherapy.ts --write --sheet ${SHEET}`);
    return;
  }

  // ---- GERÇEK INSERT ----
  console.log(`\n🚀 Insert başlıyor — ${records.length} kayıt, ${Math.ceil(records.length/BATCH_SIZE)} batch...\n`);

  const { inserted, errors } = await insertAll(records);

  console.log(`\n${HR}`);
  console.log(`📊 INSERT RAPORU`);
  console.log(HR);
  console.log(`  İstenen  : ${records.length}`);
  console.log(`  Eklenen  : ${inserted} ${inserted === records.length ? "✅" : "⚠️"}`);
  console.log(`  Hata     : ${errors.length === 0 ? "Yok ✅" : errors.length + " batch hatalı"}`);
  if (errors.length > 0) {
    for (const e of errors) console.log(`    Batch ${e.batch}: ${e.msg}`);
  }

  // DB doğrulama
  await verifyDb(cfg.oilType);

  console.log(`\n${HR}`);
  console.log(`✅ Import tamamlandı.`);
  console.log(HR);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
