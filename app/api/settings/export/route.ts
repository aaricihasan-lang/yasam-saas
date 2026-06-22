import { NextRequest, NextResponse } from "next/server";
import { verifyUserRequest } from "@/lib/auth/userGuard";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export const runtime = "nodejs";

// ── Modül Tanımları ───────────────────────────────────────────────────────────

type TableDef = { table: string; label: string };
type WordModule = { label: string; sections: TableDef[] };

const WORD_MODULES: Record<string, WordModule> = {
  clients: {
    label: "Danışan Yolculuğu",
    sections: [
      { table: "clients",          label: "Danışanlar"      },
      { table: "client_notes",     label: "Notlar"          },
      { table: "appointments",     label: "Randevular"      },
      { table: "client_sessions",  label: "Seanslar"        },
      { table: "client_homeworks", label: "Ödevler"         },
      { table: "client_analyses",  label: "Analizler"       },
      { table: "client_stones",    label: "Taş Eşleşmeleri" },
    ],
  },
  numerology: {
    label: "Numeroloji — Yaşam Analiz Merkezi",
    sections: [
      { table: "numerology_records",           label: "Analiz Kayıtları" },
      { table: "numerology_knowledge_records", label: "Bilgi Bankası"    },
      { table: "numerology_stone_assignments", label: "Taş Atamaları"   },
    ],
  },
  human_design: {
    label: "Human Design",
    sections: [
      { table: "human_design_clients",           label: "Danışanlar"  },
      { table: "human_design_charts",            label: "Haritalar"   },
      { table: "human_design_reports",           label: "Raporlar"    },
      { table: "human_design_knowledge_records", label: "Bilgi Bankası"},
    ],
  },
  dogaltas: {
    label: "Doğaltaş",
    sections: [
      { table: "stones",            label: "Taşlar"          },
      { table: "minerals",          label: "Mineraller"      },
      { table: "combinations",      label: "Kombinasyonlar"  },
      { table: "dogaltas_inventory",label: "Stok / Envanter" },
    ],
  },
  dijital_icerik: {
    label: "Dijital İçerik Merkezi",
    sections: [
      { table: "personal_archives",      label: "Arşivler"      },
      { table: "personal_archive_files", label: "Dosya Listesi" },
    ],
  },
  bioenerji: {
    label: "Biyoenerji & Enerji Bedenleri",
    sections: [
      { table: "bioenergy_sessions",            label: "Seanslar"            },
      { table: "bioenergy_symbols",             label: "Sembol Dili"         },
      { table: "bioenergy_imaginations",        label: "İmajinasyonlar"      },
      { table: "bioenergy_chakras",             label: "Çakralar"            },
      { table: "bioenergy_energy_bodies",       label: "Enerji Bedenleri"    },
      { table: "bioenergy_subconscious_causes", label: "Bilinçaltı Nedenleri"},
    ],
  },
  refleksoloji: {
    label: "Refleksoloji",
    sections: [
      { table: "reflexology_protocols", label: "Protokoller" },
    ],
  },
  aromaterapi: {
    label: "Aromaterapi",
    sections: [
      { table: "aromatherapy_oils",               label: "Yağ Kayıtları"      },
      { table: "aromatherapy_knowledge_articles", label: "Bilgi Bankası"      },
      { table: "aromatherapy_reference_sheets",   label: "Referans Sayfaları" },
    ],
  },
  sifa_rehberi: {
    label: "Şifa Rehberi",
    sections: [
      { table: "healing_guides", label: "Rehber Kayıtları" },
    ],
  },
};

// Sıralı modül listesi (all export için)
const MODULE_ORDER = [
  "clients",
  "numerology",
  "human_design",
  "dogaltas",
  "dijital_icerik",
  "bioenerji",
  "refleksoloji",
  "aromaterapi",
  "sifa_rehberi",
] as const;

// ── Sütun Etiketi Haritası ───────────────────────────────────────────────────

const COL_LABELS: Record<string, string> = {
  id: "ID", name: "İsim", title: "Başlık", category: "Kategori",
  status: "Durum", notes: "Notlar", note: "Not",
  description: "Açıklama", content: "İçerik", summary: "Özet",
  is_active: "Aktif", created_at: "Oluşturma", updated_at: "Güncelleme",
  sort_order: "Sıra", source: "Kaynak", priority: "Öncelik", type: "Tür",
  // Danışan
  full_name: "Ad Soyad", ad: "Ad", soyad: "Soyad",
  email: "E-posta", telefon: "Telefon", phone: "Telefon",
  birth_date: "Doğum Tarihi", dogum: "Doğum",
  client_id: "Danışan ID", stone_id: "Taş ID", sheet_id: "Sayfa ID",
  // Tarihler
  date: "Tarih", appointment_date: "Randevu Tarihi",
  session_date: "Seans Tarihi", due_date: "Son Tarih",
  completed_at: "Tamamlanma",
  // İçerik
  content_type: "İçerik Türü", oil_type: "Yağ Türü",
  latin_name: "Latince Adı", aroma_profile: "Koku Profili",
  therapeutic_properties: "Terapötik Özellikler",
  benefits: "Faydalar", safety_notes: "Güvenlik Notları",
  contraindications: "Kontrendikasyon",
  emotional_benefits: "Duygusal Faydalar", physical_benefits: "Fiziksel Faydalar",
  spiritual_benefits: "Manevi Faydalar", skin_benefits: "Cilt Faydaları",
  usage_methods: "Kullanım Yöntemleri", dilution_ratio: "Seyreltme Oranı",
  aroma_note: "Koku Notu", color: "Renk", consistency: "Kıvam",
  extraction_method: "Elde Etme Yöntemi", plant_part: "Bitki Kısımı", origin: "Köken",
  main_components: "Ana Bileşenler", blends_well_with: "İyi Uyum",
  chakra_connection: "Çakra Bağlantısı", element_connection: "Element Bağlantısı",
  is_photosensitive: "Fotosensitif", shelf_life: "Raf Ömrü",
  target_systems: "Hedef Sistemler",
  // Human Design
  type_code: "Tip Kodu", authority: "Otorite", profile: "Profil",
  // Stok
  quantity: "Miktar", price: "Fiyat", unit: "Birim",
  // Protokol
  protocol_name: "Protokol Adı", body_part: "Bölge",
  // Dosya
  file_name: "Dosya Adı", file_url: "Dosya URL",
  file_size: "Boyut", mime_type: "MIME Türü",
  // Numeroloji
  surname: "Soyisim",
  // Diğer
  subject: "Konu", message: "Mesaj", admin_note: "Admin Notu",
  headers: "Başlıklar", display_title: "Görünen Başlık", sheet_name: "Sayfa Adı",
  code: "Kod", keywords: "Anahtar Kelimeler",
};

// tenant_id ve user_id her zaman gizlenir (UUID, kullanıcıya anlamsız)
const SKIP_COLS = new Set(["tenant_id", "user_id"]);

function colLabel(key: string): string {
  return (
    COL_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function fmtCell(val: unknown): string {
  if (val == null) return "—";
  if (typeof val === "boolean") return val ? "Evet" : "Hayır";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    const v = val.trim();
    if (!v) return "—";
    // UUID'yi kısalt (okuma kolaylığı için)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      return v.slice(0, 8) + "…";
    }
    return v.length > 300 ? v.slice(0, 297) + "…" : v;
  }
  if (Array.isArray(val)) {
    const j = val
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .join(", ");
    return j || "—";
  }
  if (typeof val === "object") {
    const s = JSON.stringify(val);
    return s.length > 150 ? s.slice(0, 147) + "…" : s;
  }
  return String(val);
}

function visibleCols(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) return [];
  return Object.keys(rows[0]).filter((k) => !SKIP_COLS.has(k));
}

// ── DB Yardımcıları ───────────────────────────────────────────────────────────

async function fetchTable(
  db: SupabaseClient,
  table: string,
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await db
    .from(table)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(2000);
  return (data ?? []) as Record<string, unknown>[];
}

// ── Word Oluşturma ────────────────────────────────────────────────────────────

function makeTitlePara(text: string, size: number, color = "1E293B"): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size, font: "Calibri", color })],
  });
}

function makeH1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, font: "Calibri", color: "1E293B" })],
  });
}

function makeH2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: "Calibri", color: "3730A3" })],
  });
}

function makeEmptyNote(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 160 },
    children: [
      new TextRun({ text, italics: true, size: 18, font: "Calibri", color: "94A3B8" }),
    ],
  });
}

function makeSpacing(): Paragraph {
  return new Paragraph({ children: [], spacing: { after: 120 } });
}

function makeDataTable(rows: Record<string, unknown>[], cols: string[]): Table {
  // Çok sütunlu tablolarda ilk 12 sütunu göster (Word sayfa sınırı)
  const visCol = cols.slice(0, 12);
  const colW = Math.max(800, Math.floor(9638 / visCol.length));

  const makeCell = (text: string, header = false): TableCell =>
    new TableCell({
      width: { size: colW, type: WidthType.DXA },
      shading: header ? { fill: "EEF2FF" } : undefined,
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text,
              bold: header,
              size: header ? 18 : 16,
              font: "Calibri",
              color: header ? "3730A3" : "1E293B",
            }),
          ],
        }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: visCol.map((k) => makeCell(colLabel(k), true)),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: visCol.map((k) => makeCell(fmtCell(row[k]))),
          }),
      ),
    ],
  });
}

type DocChild = Paragraph | Table;

function buildModule(
  moduleDef: WordModule,
  tableData: Map<string, Record<string, unknown>[]>,
  isFirst: boolean,
): DocChild[] {
  const children: DocChild[] = [];

  if (!isFirst) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  children.push(makeH1(moduleDef.label));

  for (const section of moduleDef.sections) {
    const rows = tableData.get(section.table) ?? [];
    const countLabel = rows.length === 0 ? "Kayıt yok" : `${rows.length} kayıt`;
    children.push(makeH2(`${section.label} — ${countLabel}`));

    if (rows.length === 0) {
      children.push(makeEmptyNote("Bu bölümde henüz kayıt bulunmamaktadır."));
    } else {
      const cols = visibleCols(rows);
      if (cols.length > 0) {
        children.push(makeDataTable(rows, cols));
        children.push(makeSpacing());
      } else {
        children.push(makeEmptyNote(`${rows.length} kayıt mevcut. (Sütun bilgisi okunamadı)`));
      }
    }
  }

  return children;
}

// ── Route Handler ─────────────────────────────────────────────────────────────

/**
 * POST /api/settings/export
 * Modül bazlı okunabilir Word raporu üretir.
 * Body: { module: string }  — modül adı veya "all"
 * Header: x-user-id
 * Returns: DOCX binary
 */
export async function POST(req: NextRequest) {
  const guard = await verifyUserRequest(req);
  if (!guard.ok) return guard.response;
  const { tenantId, db } = guard;

  const body = (await req.json()) as { module?: unknown };
  const moduleKey = String(body.module ?? "").trim();

  const isAll = moduleKey === "all";
  const moduleDef = isAll ? null : WORD_MODULES[moduleKey];

  if (!isAll && !moduleDef) {
    return NextResponse.json({ error: "Geçersiz modül." }, { status: 400 });
  }

  // Çekilecek modül listesi
  const targetModules = isAll
    ? MODULE_ORDER.map((k) => ({ key: k, def: WORD_MODULES[k] }))
    : [{ key: moduleKey, def: moduleDef! }];

  // Tüm tablolar için paralel veri çekimi
  const allTables = targetModules.flatMap((m) => m.def.sections.map((s) => s.table));
  const uniqueTables = [...new Set(allTables)];

  const tableData = new Map<string, Record<string, unknown>[]>();
  await Promise.allSettled(
    uniqueTables.map(async (table) => {
      const rows = await fetchTable(db, table, tenantId);
      tableData.set(table, rows);
    }),
  );

  // Belge oluştur
  const dateStr = new Date().toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const title = isAll
    ? "Tüm Veriler — Kapsamlı Arşiv Raporu"
    : moduleDef!.label + " — Arşiv Raporu";

  const coverChildren: DocChild[] = [
    makeTitlePara(title, 40),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `Oluşturma tarihi: ${dateStr}`,
          size: 20,
          font: "Calibri",
          color: "64748B",
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: "Bu rapor okunabilir arşiv içerir. Geri yüklenebilir sistem yedeği için Sistem Yedeği (JSON) kullanın. Storage dosyaları (resim, ses, belge) dahil değildir.",
          size: 18,
          font: "Calibri",
          color: "94A3B8",
          italics: true,
        }),
      ],
    }),
  ];

  const moduleChildren: DocChild[] = [];
  targetModules.forEach(({ def }, idx) => {
    moduleChildren.push(...buildModule(def, tableData, idx === 0));
  });

  const doc = new Document({
    sections: [
      {
        children: [...coverChildren, ...moduleChildren],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  const slug = isAll ? "tum-veriler" : moduleKey.replace(/_/g, "-");
  const dateFn = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${slug}-arsiv-${dateFn}.docx"`,
    },
  });
}
