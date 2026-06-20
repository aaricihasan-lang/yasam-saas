import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { calcHayatYolu } from "@/lib/numeroloji/hayatYolu";
import { calcIfadeSayisi } from "@/lib/numeroloji/ifadeSayisi";
import { calcAnaKulvar } from "@/lib/numeroloji/anaKulvar";
import { calcYanKulvar } from "@/lib/numeroloji/yanKulvar";
import { calcKisiselYil } from "@/lib/numeroloji/kisiselYil";
import { calcElementleri, ELEMENT_ORDER } from "@/lib/numeroloji/elementler";
import { calcZirveYillari } from "@/lib/numeroloji/zirveYillari";
import { odevDurumLabel } from "@/lib/odevStatus";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildSectionDivider,
  buildStatsPage,
  buildTOCPage,
  C_DARK,
  C_LIGHT,
  C_MID,
  divider,
  embedImageParagraph,
  fetchImageBuffer,
  fetchImagesBatch,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  REPORT_FONT,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

// ─── Bölüm renkleri ──────────────────────────────────────────────────────────

const C = {
  danisan:    "1e3a5f",   // lacivert
  notlar:     "4c1d95",   // derin mor
  randevular: "9a3412",   // turuncu
  taslar:     "0e7490",   // turkuaz
  seanslar:   "14532d",   // yeşil
  odevler:    "713f12",   // amber
  analizler:  "4a1d96",   // koyu mor
  yolculuk:   "1e1b4b",   // indigo
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientRow = {
  id: string;
  ad?: string | null;
  soyad?: string | null;
  telefon?: string | null;
  dogum?: string | null;
  gorusme?: string | null;
  burc?: string | null;
  kan?: string | null;
  mizac?: string | null;
  profile_image_url?: string | null;
};

type ClientNoteRow = {
  saglik_notu?: string | null;
  adres?: string | null;
  oneriler?: string | null;
  notlar?: string | null;
};

type AppointmentRow = {
  id: string;
  title?: string | null;
  notes?: string | null;
  appointment_date: string;
  status?: string | null;
};

type ClientStoneRow = {
  id: string;
  stone_name?: string | null;
  stone_type?: string | null;
  note?: string | null;
  usage_area?: string | null;
  combination_text?: string | null;
  warning_text?: string | null;
  other_notes?: string | null;
  stone_date?: string | null;
  created_at: string;
};

type ClientSessionRow = {
  id: string;
  session_date?: string | null;
  session_type?: string | null;
  duration_minutes?: number | null;
  fee?: number | null;
  session_note?: string | null;
  actions_done?: string | null;
  suggestions?: string | null;
  next_plan?: string | null;
  created_at: string;
};

type ClientHomeworkRow = {
  id: string;
  title?: string | null;
  homework_type?: string | null;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  expert_note?: string | null;
  client_feedback?: string | null;
  created_at: string;
};

type ChakraValueEntry = { mark?: string; male?: string; female?: string };

type ClientAnalysisRow = {
  id: string;
  analysis_type?: string | null;
  analysis_data?: { title?: string; values?: Record<string, ChakraValueEntry>; saved_at?: string } | null;
  note?: string | null;
  created_at: string;
  image_url?: string | null;
};

type TimelineEvent = {
  ts: number;
  dateLabel: string;
  category: string;
  color: string;
  title: string;
  note?: string;
};

// ─── Metin yardımcıları ───────────────────────────────────────────────────────

function v(value: string | null | undefined): string {
  return value?.trim() || "Bilgi girilmemiş";
}

/** Türkçe farkında title-case: "hasan arıcı" → "Hasan Arıcı" */
function titleCaseTR(text: string): string {
  if (!text.trim()) return text;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word
        .replace(/İ/g, "i")
        .replace(/I/g, "ı")
        .toLowerCase();
      const f = lower[0]!;
      const upper = f === "i" ? "İ" : f === "ı" ? "I" : f.toUpperCase();
      return upper + lower.slice(1);
    })
    .join(" ");
}

function formatDateTR(date: string | null | undefined): string {
  if (!date) return "Bilgi girilmemiş";
  const parts = date.split("-");
  if (parts.length !== 3) return date;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatDateTimeTR(value: string | null): string {
  if (!value) return "Bilgi girilmemiş";
  return new Date(value).toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ğ/g, "g").replace(/Ğ/g, "g")
    .replace(/ü/g, "u").replace(/Ü/g, "u")
    .replace(/ş/g, "s").replace(/Ş/g, "s")
    .replace(/ö/g, "o").replace(/Ö/g, "o")
    .replace(/ç/g, "c").replace(/Ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const hwStatus = odevDurumLabel;

function aptStatus(s: string | null | undefined, date: string): string {
  if (s === "tamamlandi") return "Tamamlandı";
  if (s === "iptal") return "İptal";
  return new Date(date).getTime() < Date.now() ? "Geçmiş" : "Yaklaşan";
}

function analysisLabel(t: string | null | undefined): string {
  if (t === "chakra") return "Çakra Analizi";
  if (t === "planet") return "Gezegen Analizi";
  return t || "Analiz";
}

function toTs(dateStr: string | null | undefined, fallback: string): number {
  const t = new Date(dateStr || fallback).getTime();
  return isNaN(t) ? new Date(fallback).getTime() : t;
}

// ─── Belge yapı yardımcıları ─────────────────────────────────────────────────

function centered(text: string, size: number, color: string, bold = false, caps = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: REPORT_FONT, color, allCaps: caps })],
    spacing: { after: 160 },
  });
}

function centeredItalic(text: string, size: number, color: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, size, font: REPORT_FONT, color, italics: true })],
    spacing: { after: 120 },
  });
}

function thickRule(color: string): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.THICK, size: 14, color } },
    spacing: { before: 0, after: 0 },
  });
}

function thinRule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 200, after: 200 },
  });
}

function gap(twips = 240): Paragraph {
  return new Paragraph({ spacing: { after: twips } });
}

// ─── Premium Kapak (V3) ───────────────────────────────────────────────────────

function buildCoverV3(fullName: string, today: string): ReportChild[] {
  return [
    // Üst dekoratif blok
    gap(800),
    thickRule(C.danisan),
    gap(80),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "93c5fd" } },
      spacing: { before: 0, after: 0 },
    }),
    gap(480),

    // Marka başlığı
    centered("YAŞAM SİSTEMİ", 76, C.danisan, true, true),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "◆  ", size: 20, font: REPORT_FONT, color: "93c5fd" }),
        new TextRun({ text: "Bütüncül Yaşam Analizi Platformu", size: 22, font: REPORT_FONT, color: C_MID, italics: true }),
        new TextRun({ text: "  ◆", size: 20, font: REPORT_FONT, color: "93c5fd" }),
      ],
      spacing: { after: 640 },
    }),

    // Orta dekoratif çizgi
    new Paragraph({
      border: { bottom: { style: BorderStyle.DOUBLE, size: 6, color: C.danisan } },
      spacing: { before: 0, after: 640 },
    }),

    // Rapor türü etiketi
    centered("DANIŞAN DOSYASI", 52, C.danisan, false, true),
    centered("Bireysel Takip ve Analiz Raporu", 28, C_LIGHT, false, false),
    gap(640),

    // Danışan adı (focal point)
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "dbeafe" } },
      spacing: { before: 0, after: 0 },
    }),
    gap(200),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: titleCaseTR(fullName), bold: true, size: 64, font: REPORT_FONT, color: C.danisan })],
      spacing: { after: 120 },
    }),
    centeredItalic("Oluşturulma Tarihi: " + today, 22, C_LIGHT),
    gap(200),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "dbeafe" } },
      spacing: { before: 0, after: 0 },
    }),

    // Alt dekoratif blok
    gap(600),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "93c5fd" } },
      spacing: { before: 0, after: 0 },
    }),
    gap(80),
    thickRule(C.danisan),
  ];
}

// ─── Danışan Profil Sayfası ───────────────────────────────────────────────────

function buildClientProfilePage(
  fullName: string,
  client: ClientRow,
  counts: { randevular: number; taslar: number; seanslar: number; odevler: number; analizler: number },
  profileImgBuf: Buffer | null,
): ReportChild[] {
  const out: ReportChild[] = [];

  // Sayfa başlığı
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "DANIŞAN PROFİLİ", bold: true, size: 48, font: REPORT_FONT, color: C.danisan, allCaps: true })],
    pageBreakBefore: true,
    spacing: { before: 600, after: 80 },
  }));
  out.push(thickRule(C.danisan));
  out.push(gap(480));

  // Fotoğraf + kimlik — fotoğraf varsa yan yana, yoksa sadece tablo
  if (profileImgBuf) {
    out.push(embedImageParagraph(profileImgBuf, 160));
    out.push(gap(280));
  }

  // Danışan adı
  out.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: titleCaseTR(fullName), bold: true, size: 52, font: REPORT_FONT, color: C.danisan })],
    spacing: { after: 80 },
  }));
  out.push(centeredItalic("Bireysel Danışan Dosyası", 22, C_LIGHT));
  out.push(gap(480));

  // Kimlik bilgileri tablosu
  out.push(new Paragraph({
    children: [new TextRun({ text: "KİMLİK BİLGİLERİ", bold: true, size: 22, font: REPORT_FONT, color: C.danisan, allCaps: true })],
    spacing: { before: 0, after: 240 },
  }));
  out.push(twoColTable([
    ["Ad Soyad",       titleCaseTR(fullName)],
    ["Telefon",        v(client.telefon)],
    ["Doğum Tarihi",   formatDateTR(client.dogum)],
    ["Görüşme Tarihi", formatDateTR(client.gorusme)],
    ["Burç",           v(client.burc)],
    ["Kan Grubu",      v(client.kan)],
    ["Mizaç",          v(client.mizac)],
  ]));

  out.push(gap(480));
  out.push(thinRule());

  // İstatistik kartları
  out.push(new Paragraph({
    children: [new TextRun({ text: "SİSTEM ÖZETİ", bold: true, size: 22, font: REPORT_FONT, color: C_DARK, allCaps: true })],
    spacing: { before: 400, after: 280 },
  }));
  out.push(buildStatCardsTable(counts));

  return out;
}

// ─── İstatistik Kartları Tablosu ─────────────────────────────────────────────

function buildStatCardsTable(counts: {
  randevular: number;
  taslar: number;
  seanslar: number;
  odevler: number;
  analizler: number;
}): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          makeStatCard("RANDEVULAR",    String(counts.randevular),  C.randevular),
          makeStatCard("TAŞ KAYITLARI", String(counts.taslar),      C.taslar),
          makeStatCard("SEANSLAR",      String(counts.seanslar),    C.seanslar),
          makeStatCard("ÖDEVLER",       String(counts.odevler),     C.odevler),
          makeStatCard("ANALİZLER",     String(counts.analizler),   C.analizler),
        ],
      }),
    ],
  });
}

function makeStatCard(label: string, value: string, color: string): TableCell {
  return new TableCell({
    width: { size: 20, type: WidthType.PERCENTAGE },
    shading: { fill: "f8fafc", type: ShadingType.CLEAR, color: "auto" },
    margins: { top: 240, bottom: 240, left: 160, right: 160 },
    borders: {
      top:    { style: BorderStyle.THICK, size: 12, color },
      bottom: { style: BorderStyle.NONE,  size: 0,  color: "ffffff" },
      left:   { style: BorderStyle.NONE,  size: 0,  color: "ffffff" },
      right:  { style: BorderStyle.NONE,  size: 0,  color: "ffffff" },
    },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: value, bold: true, size: 48, font: REPORT_FONT, color })],
        spacing: { after: 80 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: label, size: 16, font: REPORT_FONT, color: C_MID })],
      }),
    ],
  });
}

// ─── Numeroloji yardımcıları ──────────────────────────────────────────────────

/** ISO "YYYY-MM-DD" → "DD.MM.YYYY" — parseBirthDate kullanan motor fonksiyonları için */
function isoToDDMMYYYY(iso: string): string {
  const p = iso.split("-");
  if (p.length !== 3 || p[0].length !== 4) return "";
  return `${p[2]}.${p[1]}.${p[0]}`;
}

/** Yolculuk İstatistikleri bölümü — sayısal özet tablosu */
function buildYolculukIstatistikleri(
  counts: { randevular: number; taslar: number; seanslar: number; odevler: number; analizler: number },
  notes: ClientNoteRow | null,
  journeyTotal: number,
): ReportChild[] {
  const hasNot = Boolean(
    notes?.notlar?.trim() || notes?.saglik_notu?.trim() ||
    notes?.oneriler?.trim() || notes?.adres?.trim()
  );
  return [
    h2("Yolculuk İstatistikleri"),
    twoColTable([
      ["Toplam Aktivite", String(journeyTotal)],
      ["Seans",           String(counts.seanslar)],
      ["Randevu",         String(counts.randevular)],
      ["Taş Kaydı",       String(counts.taslar)],
      ["Ödev",            String(counts.odevler)],
      ["Analiz",          String(counts.analizler)],
      ["Not",             hasNot ? "Var" : "Yok"],
    ]),
    spacer(),
  ];
}

/**
 * Numeroloji Özeti bölümü.
 * Sadece client.dogum dolu ise çağrılır.
 * Ad/soyad eksikse isim gerektiren değerler "—" olarak kalır.
 * Her hesaplama ayrı try/catch — biri hata verse diğerleri etkilenmez.
 */
function buildNumerolojiBolumu(client: ClientRow): ReportChild[] {
  const dogum     = client.dogum?.trim() ?? "";
  if (!dogum) return [];

  const firstName = client.ad?.trim()    ?? "";
  const lastName  = client.soyad?.trim() ?? "";
  const dogumTR   = isoToDDMMYYYY(dogum);

  let hayatYolu     = "—";
  let kaderSayisi   = "—";
  let ruhSayisi     = "—";
  let kisilikSayisi = "—";
  let kisiselYil    = "—";

  try { hayatYolu   = calcHayatYolu(dogum).display; }  catch { /* sessiz */ }
  try { kisiselYil  = calcKisiselYil(dogum).display; } catch { /* sessiz */ }

  if (firstName || lastName) {
    try { kaderSayisi   = calcIfadeSayisi(firstName, lastName).display; } catch { /* sessiz */ }
    try { ruhSayisi     = calcAnaKulvar(firstName, lastName).display; }   catch { /* sessiz */ }
    try { kisilikSayisi = calcYanKulvar(firstName, lastName).display; }   catch { /* sessiz */ }
  }

  const out: ReportChild[] = [
    h2("Numeroloji Özeti"),
    twoColTable([
      ["Hayat Yolu / DM", hayatYolu],
      ["İfade Sayısı",    kaderSayisi],
      ["Ana Kulvar",      ruhSayisi],
      ["Yan Kulvar",      kisilikSayisi],
      ["Kişisel Yıl",    kisiselYil],
    ]),
  ];

  if (dogumTR) {
    // Element dağılımı
    try {
      const el = calcElementleri(dogumTR);
      const elRows: [string, string][] = ELEMENT_ORDER.map(
        (e) => [e, String(el.counts[e] ?? 0)] as [string, string]
      );
      if (el.key) elRows.push(["Baskın Element", el.key]);
      out.push(h3("Element Dağılımı"));
      out.push(twoColTable(elRows));
    } catch { /* sessiz */ }

    // Zirve yılları
    try {
      const zirve = calcZirveYillari(dogumTR);
      if (zirve?.peaks?.length) {
        out.push(h3("Zirve Yılları"));
        out.push(twoColTable(
          zirve.peaks.slice(0, 4).map((p) => [
            `${p.index}. Zirve`,
            `${p.age} yaş · ${p.topic}. çakra`,
          ] as [string, string])
        ));
      }
    } catch { /* sessiz */ }
  }

  out.push(spacer());
  return out;
}

// ─── Danışan Yolculuğu ────────────────────────────────────────────────────────

function buildJourneySection(events: TimelineEvent[], n: number): ReportChild[] {
  const color = C.yolculuk;
  const out: ReportChild[] = [
    ...buildSectionDivider("✦  DANIŞAN YOLCULUĞU", "Kronolojik Takip ve İlerleme", color),
    h1Colored(`${n}. Danışan Yolculuğu`, color, true),
    muted(`${events.length} kayıt · kronolojik sıralama (eskiden yeniye)`),
  ];

  if (events.length === 0) {
    out.push(muted("Henüz zaman çizelgesi kaydı yok."));
    return out;
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;

    // Tarih satırı
    out.push(new Paragraph({
      children: [
        new TextRun({ text: ev.dateLabel, bold: true, size: 22, font: REPORT_FONT, color: ev.color }),
        new TextRun({ text: "  ·  " + ev.category, size: 18, font: REPORT_FONT, color: C_LIGHT }),
      ],
      spacing: { before: 240, after: 60 },
      indent: { left: 280 },
    }));

    // Başlık
    out.push(new Paragraph({
      children: [new TextRun({ text: ev.title, bold: true, size: 26, font: REPORT_FONT, color: C_DARK })],
      spacing: { after: ev.note ? 60 : 160 },
      indent: { left: 560 },
    }));

    // Not (varsa)
    if (ev.note) {
      out.push(new Paragraph({
        children: [new TextRun({ text: ev.note, size: 20, font: REPORT_FONT, color: C_MID, italics: true })],
        spacing: { after: 160 },
        indent: { left: 840 },
      }));
    }

    // Ayırıcı (son eleman hariç)
    if (i < events.length - 1) {
      out.push(new Paragraph({
        border: { bottom: { style: BorderStyle.DOTTED, size: 2, color: "e2e8f0" } },
        spacing: { before: 0, after: 0 },
      }));
    }
  }

  return out;
}

// ─── Kapanış Sayfası (V3) ─────────────────────────────────────────────────────

function buildClosingPage(fullName: string, today: string, reportId: string): ReportChild[] {
  return [
    gap(0),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "", size: 4 })],
      pageBreakBefore: true,
      spacing: { before: 1600 },
    }),
    thickRule(C.danisan),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "93c5fd" } },
      spacing: { before: 0, after: 0 },
    }),
    gap(480),

    centered("YAŞAM SİSTEMİ", 64, C.danisan, true, true),
    centeredItalic("Bütüncül Yaşam Analizi Platformu", 24, C_MID),
    gap(480),

    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
      spacing: { before: 0, after: 480 },
    }),

    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Bu rapor Yaşam Sistemi platformu tarafından otomatik oluşturulmuştur.", size: 20, font: REPORT_FONT, color: C_MID })],
      spacing: { after: 400 },
    }),

    twoColTable([
      ["Danışan",         titleCaseTR(fullName)],
      ["Rapor No",        reportId],
      ["Oluşturma Tarihi", today],
      ["Sistem Sürümü",   "v3.0"],
    ]),

    gap(480),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "93c5fd" } },
      spacing: { before: 0, after: 0 },
    }),
    gap(80),
    thickRule(C.danisan),
  ];
}

// ─── Landscape section yardımcıları ──────────────────────────────────────────

// A4 twip değerleri (1 inch = 1440 twips)
const A4_LANDSCAPE_W = 16838; // 297mm
const A4_LANDSCAPE_H = 11906; // 210mm
const LANDSCAPE_MARGIN = 720; // 0.5 inch = 1.27cm
// Landscape kullanılabilir genişlik: (16838 − 2×720) twips ≈ 770pt — 740 güvenli sığar
const LANDSCAPE_IMG_MAXW = 740;

type LandscapeInsert = { afterIndex: number; children: ReportChild[] };

/** Landscape sayfada gösterilecek analiz görsel bloğu */
function buildAnalysisLandscapePage(
  an: { analysis_type?: string | null; created_at: string },
  imgBuf: Buffer,
  num: number,
): ReportChild[] {
  return [
    new Paragraph({
      children: [
        new TextRun({ text: `ANALİZ #${String(num).padStart(3, "0")}`, bold: true, size: 24, font: REPORT_FONT, color: C.analizler, allCaps: true }),
        new TextRun({ text: `  ·  ${analysisLabel(an.analysis_type)}`, size: 22, font: REPORT_FONT, color: C_MID }),
        new TextRun({ text: `  ·  ${formatDateTimeTR(an.created_at)}`, size: 20, font: REPORT_FONT, color: C_LIGHT }),
      ],
      spacing: { before: 0, after: 160 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
      spacing: { before: 0, after: 280 },
    }),
    embedImageParagraph(imgBuf, LANDSCAPE_IMG_MAXW),
  ];
}

/**
 * Portrait içeriği (all[]) ile landscape insert'leri birleştirerek
 * docx sections dizisi üretir. Insert yoksa tek portrait section döner.
 */
function buildDocSections(
  portrait: ReportChild[],
  inserts: LandscapeInsert[],
  footerText: string,
) {
  const footer = buildFooter(footerText);
  // Element type extracted so we can build a mutable array (source type is readonly)
  type S = (ConstructorParameters<typeof Document>[0]["sections"])[number];
  const sects: S[] = [];
  let cursor = 0;

  for (const ins of inserts) {
    if (ins.afterIndex > cursor) {
      sects.push({ properties: {}, footers: { default: footer }, children: portrait.slice(cursor, ins.afterIndex) });
    }
    sects.push({
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE, width: A4_LANDSCAPE_W, height: A4_LANDSCAPE_H },
          margin: { top: LANDSCAPE_MARGIN, bottom: LANDSCAPE_MARGIN, left: LANDSCAPE_MARGIN, right: LANDSCAPE_MARGIN },
        },
      },
      footers: { default: footer },
      children: ins.children,
    });
    cursor = ins.afterIndex;
  }

  if (cursor < portrait.length) {
    sects.push({ properties: {}, footers: { default: footer }, children: portrait.slice(cursor) });
  }

  if (sects.length === 0) {
    sects.push({ properties: {}, footers: { default: footer }, children: portrait });
  }

  return sects;
}

// ─── Çakra Analizi Word Tablo Yardımcıları ───────────────────────────────────

const CHAKRA_ENERGY_BODIES = [
  { key: "ruhsal",   label: "Ruhsal Enerji Bedeni",   color: "6d5bd0" },
  { key: "zihinsel", label: "Zihinsel Enerji Bedeni", color: "43a047" },
  { key: "duygusal", label: "Duygusal Enerji Bedeni", color: "f2b824" },
  { key: "eterik",   label: "Eterik Enerji Bedeni",   color: "2196c9" },
  { key: "fiziksel", label: "Fiziksel Enerji Bedeni", color: "4b5563" },
] as const;

const CHAKRA_CHAKRA_ROWS = [
  { key: "tac",    label: "Tepe / Taç Çakrası",    color: "a78bfa" },
  { key: "goz",    label: "3. Göz Çakrası",         color: "6366f1" },
  { key: "bogaz",  label: "Boğaz Çakrası",           color: "38bdf8" },
  { key: "kalp",   label: "Kalp Çakrası",            color: "22c55e" },
  { key: "mide",   label: "Mide Çakrası",            color: "facc15" },
  { key: "sakral", label: "Sakral (Karın) Çakrası",  color: "f97316" },
  { key: "kok",    label: "Kök Çakrası",             color: "ef4444" },
] as const;

function chakraTextColor(val: string): string {
  const t = val.trim();
  if (t.startsWith("+")) return "166534"; // yeşil
  if (t.startsWith("-")) return "991b1b"; // kırmızı
  return C_DARK;
}

function buildChakraSectionTable(
  sectionTitle: string,
  scope: string,
  rows: ReadonlyArray<{ key: string; label: string; color: string }>,
  values: Record<string, ChakraValueEntry>,
): ReportChild[] {
  const mkHeader = (text: string, pct: number) =>
    new TableCell({
      shading: { fill: "1e3a5f", type: ShadingType.CLEAR, color: "auto" },
      width: { size: pct, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, size: 16, font: REPORT_FONT, color: "ffffff" })],
      })],
    });

  const mkLabel = (text: string, color: string) =>
    new TableCell({
      shading: { fill: color, type: ShadingType.CLEAR, color: "auto" },
      width: { size: 40, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, size: 17, font: REPORT_FONT, color: "ffffff" })],
      })],
    });

  const mkVal = (val: string) => {
    const display = val.trim() || "—";
    return new TableCell({
      width: { size: 20, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: display, bold: !!val.trim(), size: 18, font: REPORT_FONT, color: chakraTextColor(val) })],
      })],
    });
  };

  const tableRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [mkHeader("Alan", 40), mkHeader("İşaret / Sayı %", 20), mkHeader("Eril Enerji", 20), mkHeader("Dişil Enerji", 20)],
    }),
    ...rows.map((row) => {
      const key = `${scope}_${row.key}`;
      const val = values[key] ?? {};
      return new TableRow({
        cantSplit: true,
        children: [
          mkLabel(row.label, row.color),
          mkVal(val.mark ?? ""),
          mkVal(val.male ?? ""),
          mkVal(val.female ?? ""),
        ],
      });
    }),
  ];

  return [
    // keepNext: true başlık paragrafını tablosundan ayırmaz
    new Paragraph({
      children: [new TextRun({ text: sectionTitle, bold: true, size: 22, font: REPORT_FONT, color: C.analizler })],
      spacing: { before: 200, after: 80 },
      keepNext: true,
    }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }),
  ];
}

function buildChakraAnalysisTables(values: Record<string, ChakraValueEntry>): ReportChild[] {
  // Tablolar arası küçük boşluk (spacer() 200 twips yerine 120 twips)
  const gap = new Paragraph({ spacing: { after: 120 } });
  return [
    ...buildChakraSectionTable("Seans Öncesi — Enerji Bedenleri", "before_energy", CHAKRA_ENERGY_BODIES, values),
    gap,
    ...buildChakraSectionTable("Seans Sonrası — Enerji Bedenleri", "after_energy",  CHAKRA_ENERGY_BODIES, values),
    gap,
    ...buildChakraSectionTable("Çakralar — Seans Öncesi",          "before_chakra", CHAKRA_CHAKRA_ROWS,   values),
    gap,
    ...buildChakraSectionTable("Çakralar — Seans Sonrası",         "after_chakra",  CHAKRA_CHAKRA_ROWS,   values),
  ];
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: clientId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, userId, exportMode = "full", tabName, dateRange } = body as {
    tenantId?: string;
    userId?: string;
    exportMode?: string;
    tabName?: string;
    dateRange?: { start: string; end: string };
  };

  if (!tenantId || typeof tenantId !== "string" || !userId || typeof userId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  // Kullanıcının bu tenant'a gerçekten ait olduğunu doğrula (IDOR koruması)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? supabaseKey;
  const anonDb = createClient(supabaseUrl, anonKey);
  const { data: userRow } = await anonDb
    .from("users")
    .select("id")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!userRow)
    return Response.json({ ok: false, error: "Yetkisiz erişim." }, { status: 403 });

  // ─── Tab mode early-return ────────────────────────────────────────────────
  const TAB_VALID = ["genel","notlar","randevular","taslar","seanslar","odevler","analizler"] as const;
  type TN = (typeof TAB_VALID)[number];

  if (exportMode === "tab" && tabName && (TAB_VALID as readonly string[]).includes(tabName)) {
    const tab = tabName as TN;

    const [cliRes, noteRes] = await Promise.all([
      db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
      db.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
    ]);

    if (cliRes.error || !cliRes.data)
      return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

    const cli       = cliRes.data as ClientRow;
    const tabNotes  = noteRes.data as ClientNoteRow | null;
    const rawName   = `${cli.ad ?? ""} ${cli.soyad ?? ""}`.trim();
    const fullName  = titleCaseTR(rawName) || "İsimsiz Danışan";
    const today     = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    const dateSlug  = new Date().toISOString().slice(0, 10);
    const nameSlug  = slugify(rawName || "danisan");

    type AnyRow = Record<string, unknown>;
    let extraRows: AnyRow[] = [];
    if (tab === "randevular") {
      const { data } = await db.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("appointment_date", { ascending: true });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "taslar") {
      const { data } = await db.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "seanslar") {
      const { data } = await db.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "odevler") {
      const { data } = await db.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    } else if (tab === "analizler") {
      const { data } = await db.from("client_analyses").select("id, analysis_type, analysis_data, note, created_at, image_url").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false });
      extraRows = (data || []) as AnyRow[];
    }

    const count = extraRows.length;

    const TAB_CFG = {
      genel:      { title: "GENEL BİLGİLER",   color: C.danisan,    subtitle: "Danışan Kimlik ve Genel Bilgiler" },
      notlar:     { title: "DANIŞAN NOTLARI",   color: C.notlar,     subtitle: "Kişisel Notlar ve Gözlemler" },
      randevular: { title: "RANDEVU GEÇMİŞİ",   color: C.randevular, subtitle: "Tüm Randevu Kayıtları" },
      taslar:     { title: "TAŞ ÖNERİLERİ",     color: C.taslar,     subtitle: "Atanmış Doğaltaş Kayıtları" },
      seanslar:   { title: "SEANS GEÇMİŞİ",     color: C.seanslar,   subtitle: "Seans Geçmişi ve Notlar" },
      odevler:    { title: "ÖDEV TAKİP",        color: C.odevler,    subtitle: "Verilen Ödevler ve Takip" },
      analizler:  { title: "ANALİZ SONUÇLARI",  color: C.analizler,  subtitle: "Enerji ve Analiz Kayıtları" },
    } as const;

    const cfg = TAB_CFG[tab];

    const coverStats: { label: string; value: string }[] = [{ label: "Danışan", value: fullName }];
    if (tab !== "genel" && tab !== "notlar") coverStats.push({ label: "Kayıt Sayısı", value: String(count) });
    if (tab === "seanslar") {
      const sess = extraRows as ClientSessionRow[];
      coverStats.push({ label: "Toplam Süre",  value: `${sess.reduce((s, r) => s + (r.duration_minutes ?? 0), 0)} dk` });
      coverStats.push({ label: "Toplam Ücret", value: `${sess.reduce((s, r) => s + (r.fee ?? 0), 0)} ₺` });
    }

    const statRows: [string, string][] = [["Danışan", fullName]];
    if (tab !== "genel" && tab !== "notlar") statRows.push(["Toplam Kayıt", String(count)]);

    const all: ReportChild[] = [];
    const tabLsInserts: LandscapeInsert[] = [];
    all.push(...buildPremiumCover({ title1: "YAŞAM SİSTEMİ", title2: cfg.title, subtitle: `${fullName} · ${cfg.subtitle}`, date: `Oluşturulma Tarihi: ${today}`, stats: coverStats }));
    all.push(...buildStatsPage(statRows));
    all.push(...buildTOCPage());
    all.push(h1Colored(`1. ${cfg.title}`, cfg.color, true));

    if (tab === "genel") {
      all.push(profileLabel("DANIŞAN PROFİL KARTI", C.danisan));
      all.push(twoColTable([
        ["Ad",           cli.ad?.trim()    ? titleCaseTR(cli.ad.trim())    : "Bilgi girilmemiş"],
        ["Soyad",        cli.soyad?.trim() ? titleCaseTR(cli.soyad.trim()) : "Bilgi girilmemiş"],
        ["Telefon",      v(cli.telefon)],
        ["Doğum Tarihi", formatDateTR(cli.dogum)],
        ["Görüşme",      formatDateTR(cli.gorusme)],
        ["Burç",         v(cli.burc)],
        ["Kan Grubu",    v(cli.kan)],
        ["Mizaç",        v(cli.mizac)],
      ]));
      all.push(h2("Sağlık Notu"));
      all.push(tabNotes?.saglik_notu?.trim() ? bodyText(tabNotes.saglik_notu.trim()) : muted("Bilgi girilmemiş."));
      all.push(h2("Adres"));
      all.push(tabNotes?.adres?.trim() ? bodyText(tabNotes.adres.trim()) : muted("Bilgi girilmemiş."));
      all.push(h2("Öneriler"));
      all.push(tabNotes?.oneriler?.trim() ? bodyText(tabNotes.oneriler.trim()) : muted("Bilgi girilmemiş."));
    }

    else if (tab === "notlar") {
      all.push(tabNotes?.notlar?.trim() ? bodyText(tabNotes.notlar.trim()) : muted("Henüz not girilmemiş."));
    }

    else if (tab === "randevular") {
      all.push(muted(`Toplam ${count} randevu kaydı`));
      const apts = extraRows as AppointmentRow[];
      if (apts.length === 0) {
        all.push(muted("Henüz randevu kaydı yok."));
      } else {
        apts.forEach((apt, i) => {
          all.push(profileLabel(`RANDEVU #${String(i + 1).padStart(3, "0")}`, C.randevular));
          all.push(h2(`${i + 1}. ${titleCaseTR(apt.title || "Görüşme")}`));
          all.push(twoColTable([["Tarih", formatDateTimeTR(apt.appointment_date)], ["Durum", aptStatus(apt.status, apt.appointment_date)]]));
          if (apt.notes?.trim()) { all.push(h3("Not")); all.push(bodyText(apt.notes.trim())); }
          if (i < apts.length - 1) all.push(divider());
        });
      }
    }

    else if (tab === "taslar") {
      all.push(muted(`Toplam ${count} taş kaydı`));
      const tabStones = extraRows as ClientStoneRow[];
      if (tabStones.length === 0) {
        all.push(muted("Henüz taş kaydı yok."));
      } else {
        tabStones.forEach((stone, i) => {
          all.push(profileLabel(`TAŞ #${String(i + 1).padStart(3, "0")}`, C.taslar));
          all.push(h2(`${i + 1}. ${titleCaseTR(stone.stone_name || "İsimsiz Taş")}`));
          all.push(twoColTable([["Taş Adı", v(stone.stone_name)], ["Kullanım Türü", v(stone.stone_type)], ["Tarih", formatDateTR(stone.stone_date)]]));
          if (stone.usage_area?.trim())       { all.push(h3("Kullanım Detayı"));   all.push(bodyText(stone.usage_area.trim())); }
          if (stone.combination_text?.trim()) { all.push(h3("Kombin"));             all.push(bodyText(stone.combination_text.trim())); }
          if (stone.warning_text?.trim())     { all.push(h3("Uyarı"));              all.push(bodyText(stone.warning_text.trim())); }
          if (stone.note?.trim())             { all.push(h3("Genel Not"));          all.push(bodyText(stone.note.trim())); }
          if (stone.other_notes?.trim())      { all.push(h3("Diğer Notlar"));       all.push(bodyText(stone.other_notes.trim())); }
          if (i < tabStones.length - 1) all.push(divider());
        });
      }
    }

    else if (tab === "seanslar") {
      const sessions = extraRows as ClientSessionRow[];
      const totalFee     = sessions.reduce((s, r) => s + (r.fee ?? 0), 0);
      const totalMinutes = sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
      all.push(muted(`Toplam ${count} seans kaydı`));
      if (sessions.length > 0) {
        all.push(twoColTable([["Toplam Seans", `${sessions.length} seans`], ["Toplam Süre", `${totalMinutes} dk`], ["Toplam Ücret", `${totalFee} ₺`]]));
        all.push(spacer());
      } else {
        all.push(muted("Henüz seans kaydı yok."));
      }
      sessions.forEach((session, i) => {
        all.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C.seanslar));
        all.push(h2(`${i + 1}. ${titleCaseTR(session.session_type || `Seans ${i + 1}`)} — ${formatDateTR(session.session_date)}`));
        all.push(twoColTable([["Tür", v(session.session_type)], ["Süre", session.duration_minutes ? `${session.duration_minutes} dk` : "Belirtilmedi"], ["Ücret", session.fee != null ? `${session.fee} ₺` : "Belirtilmedi"]]));
        if (session.session_note?.trim())  { all.push(h3("Seans Notu"));          all.push(bodyText(session.session_note.trim())); }
        if (session.actions_done?.trim())  { all.push(h3("Yapılan İşlemler"));    all.push(bodyText(session.actions_done.trim())); }
        if (session.suggestions?.trim())   { all.push(h3("Öneriler"));            all.push(bodyText(session.suggestions.trim())); }
        if (session.next_plan?.trim())     { all.push(h3("Sonraki Seans Planı")); all.push(bodyText(session.next_plan.trim())); }
        if (i < sessions.length - 1) all.push(divider());
      });
    }

    else if (tab === "odevler") {
      const homeworks = extraRows as ClientHomeworkRow[];
      all.push(muted(`Toplam ${count} ödev kaydı`));
      if (homeworks.length === 0) {
        all.push(muted("Henüz ödev kaydı yok."));
      } else {
        homeworks.forEach((hw, i) => {
          all.push(profileLabel(`ÖDEV #${String(i + 1).padStart(3, "0")}`, C.odevler));
          all.push(h2(`${i + 1}. ${titleCaseTR(hw.title || "İsimsiz Ödev")}`));
          all.push(twoColTable([["Tür", v(hw.homework_type)], ["Başlangıç", formatDateTR(hw.start_date)], ["Bitiş", formatDateTR(hw.end_date)], ["Durum", hwStatus(hw.status)]]));
          if (hw.description?.trim())     { all.push(h3("Açıklama"));              all.push(bodyText(hw.description.trim())); }
          if (hw.expert_note?.trim())     { all.push(h3("Uzman Notu"));             all.push(bodyText(hw.expert_note.trim())); }
          if (hw.client_feedback?.trim()) { all.push(h3("Danışan Geri Bildirimi")); all.push(bodyText(hw.client_feedback.trim())); }
          if (i < homeworks.length - 1) all.push(divider());
        });
      }
    }

    else if (tab === "analizler") {
      const analyses = extraRows as ClientAnalysisRow[];
      all.push(muted(`Toplam ${count} analiz kaydı`));
      const tabAnalysisImages = await fetchImagesBatch(
        analyses.map((a) => a.image_url?.trim() || null),
      );
      if (analyses.length === 0) {
        all.push(muted("Henüz analiz kaydı yok."));
      } else {
        analyses.forEach((an, i) => {
          const imgBuf = tabAnalysisImages[i] ?? null;
          const chakraVals = an.analysis_type === "chakra" ? (an.analysis_data?.values ?? null) : null;
          const hasChakraTable = chakraVals && Object.keys(chakraVals).length > 0;
          all.push(profileLabel(`ANALİZ #${String(i + 1).padStart(3, "0")}`, C.analizler));
          all.push(h2(`${i + 1}. ${analysisLabel(an.analysis_type)}`));
          all.push(fieldInline("Tarih", formatDateTimeTR(an.created_at)));
          if (hasChakraTable) {
            all.push(...buildChakraAnalysisTables(chakraVals!));
          } else if (imgBuf) {
            tabLsInserts.push({ afterIndex: all.length, children: buildAnalysisLandscapePage(an, imgBuf, i + 1) });
          }
          if (an.note?.trim()) { all.push(h3("Analiz Notu")); all.push(bodyText(an.note.trim())); }
          else if (!hasChakraTable && !imgBuf) all.push(muted("Analiz notu girilmemiş."));
          if (i < analyses.length - 1) all.push(spacer());
        });
      }
    }

    const tabSlugMap: Record<TN, string> = {
      genel: "genel-bilgiler", notlar: "notlar", randevular: "randevular",
      taslar: "taslar", seanslar: "seanslar", odevler: "odevler", analizler: "analizler",
    };

    const tabDoc = new Document({
      sections: buildDocSections(all, tabLsInserts, `${cfg.title} · ${fullName}`),
    });

    const tabBuffer = await Packer.toBuffer(tabDoc);
    const tabFilename = `danisan-${tabSlugMap[tab]}-${nameSlug}-${dateSlug}.docx`;

    return new Response(new Uint8Array(tabBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${tabFilename}"`,
        "Content-Length": String(tabBuffer.length),
      },
    });
  }

  // ─── Date-range mode ─────────────────────────────────────────────────────────

  if (exportMode === "date-range" && dateRange?.start && dateRange?.end) {
    const drStart = dateRange.start.slice(0, 10);
    const drEnd   = dateRange.end.slice(0, 10);

    if (drStart > drEnd)
      return Response.json({ ok: false, error: "Başlangıç tarihi bitiş tarihinden sonra olamaz." }, { status: 400 });

    // Tüm danışan verisini çek — filtreleme JS'de yapılacak
    const [drCliRes, drNoteRes, drAptRes, drStoneRes, drSessRes, drHwRes, drAnRes] = await Promise.all([
      db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
      db.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
      db.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("appointment_date", { ascending: true }),
      db.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      db.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
      db.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      db.from("client_analyses").select("id, analysis_type, analysis_data, note, created_at, image_url").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    ]);

    if (drCliRes.error || !drCliRes.data)
      return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

    const drClient    = drCliRes.data as ClientRow;
    const drNotes     = drNoteRes.data as ClientNoteRow | null;
    const drRawName   = `${drClient.ad ?? ""} ${drClient.soyad ?? ""}`.trim();
    const drFullName  = titleCaseTR(drRawName) || "İsimsiz Danışan";
    const today       = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    const dateSlug    = new Date().toISOString().slice(0, 10);
    const drNameSlug  = slugify(drRawName || "danisan");

    // Tarih normalize: herhangi bir ISO / date string'in ilk 10 karakteri "YYYY-MM-DD"
    function normDate(d: string | null | undefined, fallback: string): string {
      return (d?.trim() || fallback || "").slice(0, 10);
    }
    function inRange(d: string): boolean {
      const n = d.slice(0, 10);
      return n >= drStart && n <= drEnd;
    }

    // JS filtreleme — doğrulanmış tarih alanlarıyla
    const drApts  = ((drAptRes.data   || []) as AppointmentRow[])
                      .filter((a) => inRange(normDate(a.appointment_date, a.appointment_date)));
    const drStones = ((drStoneRes.data || []) as ClientStoneRow[])
                      .filter((s) => inRange(normDate(s.stone_date, s.created_at)));
    const drSess  = ((drSessRes.data  || []) as ClientSessionRow[])
                      .filter((s) => inRange(normDate(s.session_date, s.created_at)));
    const drHw    = ((drHwRes.data    || []) as ClientHomeworkRow[])
                      .filter((h) => inRange(normDate(h.start_date, h.created_at)));
    const drAn    = ((drAnRes.data    || []) as ClientAnalysisRow[])
                      .filter((a) => inRange(normDate(a.created_at, a.created_at)));

    const drCounts = {
      randevular: drApts.length,
      taslar:     drStones.length,
      seanslar:   drSess.length,
      odevler:    drHw.length,
      analizler:  drAn.length,
    };
    const drTotal = Object.values(drCounts).reduce((s, n) => s + n, 0);

    const drStart_fmt = new Date(drStart).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
    const drEnd_fmt   = new Date(drEnd).toLocaleDateString("tr-TR",   { day: "numeric", month: "long", year: "numeric" });

    // Fotoğraf
    let drProfileImg: Buffer | null = null;
    if (drClient.profile_image_url?.trim()) {
      drProfileImg = await fetchImageBuffer(drClient.profile_image_url.trim()).catch(() => null);
    }

    // Analiz görselleri
    const drAnalysisImages = await fetchImagesBatch(
      drAn.map((a) => a.image_url?.trim() || null),
    );

    const all: ReportChild[] = [];

    // ── Kapak
    all.push(...buildPremiumCover({
      title1:   "YAŞAM SİSTEMİ",
      title2:   "DANIŞAN TARİH ARALIĞI RAPORU",
      subtitle: `${drStart_fmt} — ${drEnd_fmt} Arası Danışan Takip Özeti`,
      date:     `Oluşturulma Tarihi: ${today}`,
      stats: [
        { label: "Danışan",     value: drFullName },
        { label: "Başlangıç",   value: drStart_fmt },
        { label: "Bitiş",       value: drEnd_fmt },
        { label: "Toplam Kayıt", value: String(drTotal) },
      ],
    }));

    // ── Sistem özeti
    all.push(...buildStatsPage([
      ["Danışan",              drFullName],
      ["Rapor Tipi",           "Tarih Aralıklı Danışan Raporu"],
      ["Başlangıç Tarihi",     drStart_fmt],
      ["Bitiş Tarihi",         drEnd_fmt],
      ["Filtrelenen Randevu",  String(drCounts.randevular)],
      ["Filtrelenen Seans",    String(drCounts.seanslar)],
      ["Filtrelenen Taş Kaydı", String(drCounts.taslar)],
      ["Filtrelenen Ödev",     String(drCounts.odevler)],
      ["Filtrelenen Analiz",   String(drCounts.analizler)],
    ]));

    // ── TOC
    all.push(...buildTOCPage());

    // ── 1. Danışan Profili (tarih filtresi yok — sabit alanlar)
    all.push(h1Colored("1. Danışan Profil Bilgileri", C.danisan, true));
    if (drProfileImg) all.push(embedImageParagraph(drProfileImg, 120));
    all.push(profileLabel("DANIŞAN PROFİL KARTI", C.danisan));
    all.push(twoColTable([
      ["Ad",            drClient.ad?.trim()    ? titleCaseTR(drClient.ad.trim())    : "Bilgi girilmemiş"],
      ["Soyad",         drClient.soyad?.trim() ? titleCaseTR(drClient.soyad.trim()) : "Bilgi girilmemiş"],
      ["Telefon",       v(drClient.telefon)],
      ["Doğum Tarihi",  formatDateTR(drClient.dogum)],
      ["Görüşme",       formatDateTR(drClient.gorusme)],
      ["Burç",          v(drClient.burc)],
      ["Kan Grubu",     v(drClient.kan)],
      ["Mizaç",         v(drClient.mizac)],
    ]));

    // ── 2. Genel Bilgiler (tarih filtresi yok — sabit notlar)
    all.push(h1Colored("2. Genel Bilgiler", C.notlar));
    all.push(h2("Sağlık Notu"));
    all.push(drNotes?.saglik_notu?.trim() ? bodyText(drNotes.saglik_notu.trim()) : muted("Bilgi girilmemiş."));
    all.push(h2("Adres"));
    all.push(drNotes?.adres?.trim() ? bodyText(drNotes.adres.trim()) : muted("Bilgi girilmemiş."));
    all.push(h2("Öneriler"));
    all.push(drNotes?.oneriler?.trim() ? bodyText(drNotes.oneriler.trim()) : muted("Bilgi girilmemiş."));
    all.push(muted("Not: Genel bilgiler tarih bağımsız sabit alanlardır."));

    // ── 3. Randevular
    all.push(h1Colored(`3. Randevular (${drCounts.randevular})`, C.randevular));
    all.push(muted(`${drStart_fmt} — ${drEnd_fmt} arasındaki randevular`));
    if (drApts.length === 0) {
      all.push(muted("Bu tarih aralığında randevu kaydı bulunamadı."));
    } else {
      drApts.forEach((apt, i) => {
        all.push(profileLabel(`RANDEVU #${String(i + 1).padStart(3, "0")}`, C.randevular));
        all.push(h2(`${i + 1}. ${titleCaseTR(apt.title || "Görüşme")}`));
        all.push(twoColTable([["Tarih", formatDateTimeTR(apt.appointment_date)], ["Durum", aptStatus(apt.status, apt.appointment_date)]]));
        if (apt.notes?.trim()) { all.push(h3("Not")); all.push(bodyText(apt.notes.trim())); }
        if (i < drApts.length - 1) all.push(divider());
      });
    }

    // ── 4. Taş Önerileri
    all.push(h1Colored(`4. Taş Önerileri (${drCounts.taslar})`, C.taslar));
    all.push(muted(`Filtre tarihi: ${drStart_fmt} — ${drEnd_fmt} · Taş tarihi (stone_date) kullanılır, yoksa kayıt tarihi (created_at)`));
    if (drStones.length === 0) {
      all.push(muted("Bu tarih aralığında taş kaydı bulunamadı."));
    } else {
      drStones.forEach((stone, i) => {
        all.push(profileLabel(`TAŞ #${String(i + 1).padStart(3, "0")}`, C.taslar));
        all.push(h2(`${i + 1}. ${titleCaseTR(stone.stone_name || "İsimsiz Taş")}`));
        all.push(twoColTable([["Taş Adı", v(stone.stone_name)], ["Kullanım Türü", v(stone.stone_type)], ["Tarih", formatDateTR(stone.stone_date)]]));
        if (stone.usage_area?.trim()) { all.push(h3("Kullanım")); all.push(bodyText(stone.usage_area.trim())); }
        if (stone.note?.trim())       { all.push(h3("Not")); all.push(bodyText(stone.note.trim())); }
        if (i < drStones.length - 1) all.push(divider());
      });
    }

    // ── 5. Seanslar
    all.push(h1Colored(`5. Seanslar (${drCounts.seanslar})`, C.seanslar));
    all.push(muted(`Filtre tarihi: ${drStart_fmt} — ${drEnd_fmt} · Seans tarihi (session_date) kullanılır, yoksa kayıt tarihi`));
    if (drSess.length === 0) {
      all.push(muted("Bu tarih aralığında seans kaydı bulunamadı."));
    } else {
      const totalFee     = drSess.reduce((s, r) => s + (r.fee ?? 0), 0);
      const totalMinutes = drSess.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
      all.push(twoColTable([["Toplam Seans", `${drSess.length}`], ["Toplam Süre", `${totalMinutes} dk`], ["Toplam Ücret", `${totalFee} ₺`]]));
      all.push(spacer());
      drSess.forEach((session, i) => {
        all.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C.seanslar));
        all.push(h2(`${i + 1}. ${titleCaseTR(session.session_type || `Seans ${i + 1}`)} — ${formatDateTR(session.session_date)}`));
        if (session.session_note?.trim()) { all.push(h3("Seans Notu")); all.push(bodyText(session.session_note.trim())); }
        if (session.suggestions?.trim())  { all.push(h3("Öneriler")); all.push(bodyText(session.suggestions.trim())); }
        if (i < drSess.length - 1) all.push(divider());
      });
    }

    // ── 6. Ödevler
    all.push(h1Colored(`6. Ödevler (${drCounts.odevler})`, C.odevler));
    all.push(muted(`Filtre tarihi: ${drStart_fmt} — ${drEnd_fmt} · Başlangıç tarihi (start_date) kullanılır, yoksa kayıt tarihi`));
    if (drHw.length === 0) {
      all.push(muted("Bu tarih aralığında ödev kaydı bulunamadı."));
    } else {
      drHw.forEach((hw, i) => {
        all.push(profileLabel(`ÖDEV #${String(i + 1).padStart(3, "0")}`, C.odevler));
        all.push(h2(`${i + 1}. ${titleCaseTR(hw.title || "İsimsiz Ödev")}`));
        all.push(twoColTable([["Tür", v(hw.homework_type)], ["Başlangıç", formatDateTR(hw.start_date)], ["Bitiş", formatDateTR(hw.end_date)], ["Durum", hwStatus(hw.status)]]));
        if (hw.description?.trim()) { all.push(h3("Açıklama")); all.push(bodyText(hw.description.trim())); }
        if (i < drHw.length - 1) all.push(divider());
      });
    }

    // ── 7. Analizler
    all.push(h1Colored(`7. Analizler (${drCounts.analizler})`, C.analizler));
    all.push(muted(`Filtre tarihi: ${drStart_fmt} — ${drEnd_fmt} · Kayıt tarihi (created_at) kullanılır`));
    const drLsInserts: LandscapeInsert[] = [];
    if (drAn.length === 0) {
      all.push(muted("Bu tarih aralığında analiz kaydı bulunamadı."));
    } else {
      drAn.forEach((an, i) => {
        const imgBuf = drAnalysisImages[i] ?? null;
        const chakraVals = an.analysis_type === "chakra" ? (an.analysis_data?.values ?? null) : null;
        const hasChakraTable = chakraVals && Object.keys(chakraVals).length > 0;
        all.push(profileLabel(`ANALİZ #${String(i + 1).padStart(3, "0")}`, C.analizler));
        all.push(h2(`${i + 1}. ${analysisLabel(an.analysis_type)}`));
        all.push(fieldInline("Tarih", formatDateTimeTR(an.created_at)));
        if (hasChakraTable) {
          all.push(...buildChakraAnalysisTables(chakraVals!));
        } else if (imgBuf) {
          drLsInserts.push({ afterIndex: all.length, children: buildAnalysisLandscapePage(an, imgBuf, i + 1) });
        }
        if (an.note?.trim()) { all.push(h3("Analiz Notu")); all.push(bodyText(an.note.trim())); }
        else if (!hasChakraTable && !imgBuf) all.push(muted("Analiz notu girilmemiş."));
        if (i < drAn.length - 1) all.push(spacer());
      });
    }

    // ── Belge
    const drDoc = new Document({
      sections: buildDocSections(all, drLsInserts, `Tarih Aralığı Raporu · ${drFullName}`),
    });

    const drBuffer = await Packer.toBuffer(drDoc);
    const drFilename = `danisan-tarih-araligi-${drNameSlug}-${drStart}-${drEnd}.docx`;

    return new Response(new Uint8Array(drBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${drFilename}"`,
        "Content-Length": String(drBuffer.length),
      },
    });
  }

  // ─── Full mode ────────────────────────────────────────────────────────────────

  const [
    clientRes,
    notesRes,
    appointmentsRes,
    stonesRes,
    sessionsRes,
    homeworksRes,
    analysesRes,
  ] = await Promise.all([
    db.from("clients").select("*").eq("id", clientId).eq("tenant_id", tenantId).single(),
    db.from("client_notes").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("appointments").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("appointment_date", { ascending: true }),
    db.from("client_stones").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("stone_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    db.from("client_sessions").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("session_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    db.from("client_homeworks").select("*").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    db.from("client_analyses").select("id, analysis_type, analysis_data, note, created_at, image_url").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
  ]);

  if (clientRes.error || !clientRes.data)
    return Response.json({ ok: false, error: "Danışan bulunamadı." }, { status: 404 });

  const client       = clientRes.data as ClientRow;
  const notes        = notesRes.data  as ClientNoteRow | null;
  const appointments = (appointmentsRes.data || []) as AppointmentRow[];
  const stones       = (stonesRes.data       || []) as ClientStoneRow[];
  const sessions     = (sessionsRes.data     || []) as ClientSessionRow[];
  const homeworks    = (homeworksRes.data    || []) as ClientHomeworkRow[];
  const analyses     = (analysesRes.data     || []) as ClientAnalysisRow[];

  const rawName  = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim();
  const fullName = titleCaseTR(rawName) || "İsimsiz Danışan";
  const today    = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const nameSlug = slugify(rawName || "danisan");
  const reportId = `RPT-${Date.now().toString(36).toUpperCase()}`;

  // Fotoğraf (isteğe bağlı)
  let profileImgBuf: Buffer | null = null;
  if (client.profile_image_url?.trim()) {
    profileImgBuf = await fetchImageBuffer(client.profile_image_url.trim()).catch(() => null);
  }

  // Analiz görselleri (paralel fetch)
  const analysisImages = await fetchImagesBatch(
    analyses.map((a) => a.image_url?.trim() || null),
  );

  // ─── Yolculuk olayları ────────────────────────────────────────────────────
  const journeyEvents: TimelineEvent[] = [];

  for (const apt of appointments) {
    const ts = new Date(apt.appointment_date).getTime();
    if (!isNaN(ts)) {
      journeyEvents.push({
        ts,
        dateLabel: formatDateTimeTR(apt.appointment_date),
        category: "Randevu",
        color: C.randevular,
        title: titleCaseTR(apt.title || "Görüşme"),
        note: apt.notes?.trim() || undefined,
      });
    }
  }
  for (const s of stones) {
    journeyEvents.push({
      ts: toTs(s.stone_date, s.created_at),
      dateLabel: formatDateTR(s.stone_date || s.created_at),
      category: "Taş Önerisi",
      color: C.taslar,
      title: titleCaseTR(s.stone_name || "Taş"),
      note: s.stone_type?.trim() || undefined,
    });
  }
  for (const s of sessions) {
    journeyEvents.push({
      ts: toTs(s.session_date, s.created_at),
      dateLabel: formatDateTR(s.session_date || s.created_at),
      category: "Seans",
      color: C.seanslar,
      title: titleCaseTR(s.session_type || "Seans"),
      note: s.session_note?.trim()?.slice(0, 120) || undefined,
    });
  }
  for (const hw of homeworks) {
    journeyEvents.push({
      ts: toTs(hw.start_date, hw.created_at),
      dateLabel: formatDateTR(hw.start_date || hw.created_at),
      category: "Ödev",
      color: C.odevler,
      title: titleCaseTR(hw.title || "Ödev"),
      note: hw.homework_type?.trim() || undefined,
    });
  }
  for (const an of analyses) {
    journeyEvents.push({
      ts: new Date(an.created_at).getTime(),
      dateLabel: formatDateTimeTR(an.created_at),
      category: "Analiz",
      color: C.analizler,
      title: analysisLabel(an.analysis_type),
      note: an.note?.trim()?.slice(0, 120) || undefined,
    });
  }
  journeyEvents.sort((a, b) => a.ts - b.ts);

  const counts = {
    randevular: appointments.length,
    taslar:     stones.length,
    seanslar:   sessions.length,
    odevler:    homeworks.length,
    analizler:  analyses.length,
  };

  // ─── Belge ────────────────────────────────────────────────────────────────
  const all: ReportChild[] = [];

  // ── Kapak (V3)
  all.push(...buildCoverV3(fullName, today));

  // ── Danışan profil sayfası
  all.push(...buildClientProfilePage(fullName, client, counts, profileImgBuf));

  // ── TOC
  all.push(...buildTOCPage());

  // ── 1. Danışan Temel Bilgileri
  all.push(h1Colored("1. Danışan Temel Bilgileri", C.danisan, true));
  all.push(profileLabel("DANIŞAN PROFİL KARTI", C.danisan));
  all.push(twoColTable([
    ["Ad",            client.ad?.trim()    ? titleCaseTR(client.ad.trim())    : "Bilgi girilmemiş"],
    ["Soyad",         client.soyad?.trim() ? titleCaseTR(client.soyad.trim()) : "Bilgi girilmemiş"],
    ["Telefon",       v(client.telefon)],
    ["Doğum Tarihi",  formatDateTR(client.dogum)],
    ["Görüşme",       formatDateTR(client.gorusme)],
    ["Burç",          v(client.burc)],
    ["Kan Grubu",     v(client.kan)],
    ["Mizaç",         v(client.mizac)],
  ]));

  // ── 2. Genel Bilgiler
  all.push(h1Colored("2. Genel Bilgiler", C.notlar, true));

  all.push(h2("Sağlık Notu"));
  all.push(notes?.saglik_notu?.trim() ? bodyText(notes.saglik_notu.trim()) : muted("Bilgi girilmemiş."));

  all.push(h2("Adres"));
  all.push(notes?.adres?.trim() ? bodyText(notes.adres.trim()) : muted("Bilgi girilmemiş."));

  all.push(h2("Öneriler"));
  all.push(notes?.oneriler?.trim() ? bodyText(notes.oneriler.trim()) : muted("Bilgi girilmemiş."));

  all.push(h2("Notlar"));
  all.push(notes?.notlar?.trim() ? bodyText(notes.notlar.trim()) : muted("Bilgi girilmemiş."));

  // ── 3. Randevular
  all.push(h1Colored("3. Randevular", C.randevular, true));
  all.push(muted(`Toplam ${counts.randevular} randevu kaydı`));

  if (appointments.length === 0) {
    all.push(muted("Henüz randevu kaydı yok."));
  } else {
    appointments.forEach((apt, i) => {
      all.push(profileLabel(`RANDEVU #${String(i + 1).padStart(3, "0")}`, C.randevular));
      all.push(h2(`${i + 1}. ${titleCaseTR(apt.title || "Görüşme")}`));
      all.push(twoColTable([
        ["Tarih", formatDateTimeTR(apt.appointment_date)],
        ["Durum", aptStatus(apt.status, apt.appointment_date)],
      ]));
      if (apt.notes?.trim()) { all.push(h3("Not")); all.push(bodyText(apt.notes.trim())); }
      if (i < appointments.length - 1) all.push(divider());
    });
  }

  // ── 4. Taş Önerileri
  all.push(h1Colored("4. Taş Önerileri / Atanmış Taşlar", C.taslar, true));
  all.push(muted(`Toplam ${counts.taslar} taş kaydı`));

  if (stones.length === 0) {
    all.push(muted("Henüz taş kaydı yok."));
  } else {
    stones.forEach((stone, i) => {
      all.push(profileLabel(`TAŞ #${String(i + 1).padStart(3, "0")}`, C.taslar));
      all.push(h2(`${i + 1}. ${titleCaseTR(stone.stone_name || "İsimsiz Taş")}`));
      all.push(twoColTable([
        ["Taş Adı",       v(stone.stone_name)],
        ["Kullanım Türü", v(stone.stone_type)],
        ["Tarih",         formatDateTR(stone.stone_date)],
      ]));
      if (stone.usage_area?.trim())       { all.push(h3("Kullanım Detayı"));   all.push(bodyText(stone.usage_area.trim())); }
      if (stone.combination_text?.trim()) { all.push(h3("Kombin"));             all.push(bodyText(stone.combination_text.trim())); }
      if (stone.warning_text?.trim())     { all.push(h3("Uyarı"));              all.push(bodyText(stone.warning_text.trim())); }
      if (stone.note?.trim())             { all.push(h3("Genel Not"));          all.push(bodyText(stone.note.trim())); }
      if (stone.other_notes?.trim())      { all.push(h3("Diğer Notlar"));       all.push(bodyText(stone.other_notes.trim())); }
      if (i < stones.length - 1) all.push(divider());
    });
  }

  // ── 5. Seanslar
  all.push(h1Colored("5. Seanslar", C.seanslar, true));
  all.push(muted(`Toplam ${counts.seanslar} seans kaydı`));

  const totalFee     = sessions.reduce((s, r) => s + (r.fee ?? 0), 0);
  const totalMinutes = sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  if (sessions.length > 0) {
    all.push(twoColTable([
      ["Toplam Seans", `${sessions.length} seans`],
      ["Toplam Süre",  `${totalMinutes} dk`],
      ["Toplam Ücret", `${totalFee} ₺`],
    ]));
    all.push(spacer());
  }

  if (sessions.length === 0) {
    all.push(muted("Henüz seans kaydı yok."));
  } else {
    sessions.forEach((session, i) => {
      all.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C.seanslar));
      all.push(h2(`${i + 1}. ${titleCaseTR(session.session_type || `Seans ${i + 1}`)} — ${formatDateTR(session.session_date)}`));
      all.push(twoColTable([
        ["Tür",   v(session.session_type)],
        ["Süre",  session.duration_minutes ? `${session.duration_minutes} dk` : "Belirtilmedi"],
        ["Ücret", session.fee != null ? `${session.fee} ₺` : "Belirtilmedi"],
      ]));
      if (session.session_note?.trim())  { all.push(h3("Seans Notu"));          all.push(bodyText(session.session_note.trim())); }
      if (session.actions_done?.trim())  { all.push(h3("Yapılan İşlemler"));    all.push(bodyText(session.actions_done.trim())); }
      if (session.suggestions?.trim())   { all.push(h3("Öneriler"));            all.push(bodyText(session.suggestions.trim())); }
      if (session.next_plan?.trim())     { all.push(h3("Sonraki Seans Planı")); all.push(bodyText(session.next_plan.trim())); }
      if (i < sessions.length - 1) all.push(divider());
    });
  }

  // ── 6. Ödevler
  all.push(h1Colored("6. Ödevler", C.odevler, true));
  all.push(muted(`Toplam ${counts.odevler} ödev kaydı`));

  if (homeworks.length === 0) {
    all.push(muted("Henüz ödev kaydı yok."));
  } else {
    homeworks.forEach((hw, i) => {
      all.push(profileLabel(`ÖDEV #${String(i + 1).padStart(3, "0")}`, C.odevler));
      all.push(h2(`${i + 1}. ${titleCaseTR(hw.title || "İsimsiz Ödev")}`));
      all.push(twoColTable([
        ["Tür",       v(hw.homework_type)],
        ["Başlangıç", formatDateTR(hw.start_date)],
        ["Bitiş",     formatDateTR(hw.end_date)],
        ["Durum",     hwStatus(hw.status)],
      ]));
      if (hw.description?.trim())     { all.push(h3("Açıklama"));               all.push(bodyText(hw.description.trim())); }
      if (hw.expert_note?.trim())     { all.push(h3("Uzman Notu"));              all.push(bodyText(hw.expert_note.trim())); }
      if (hw.client_feedback?.trim()) { all.push(h3("Danışan Geri Bildirimi")); all.push(bodyText(hw.client_feedback.trim())); }
      if (i < homeworks.length - 1) all.push(divider());
    });
  }

  // ── 7. Analizler
  all.push(h1Colored("7. Analizler", C.analizler, true));
  all.push(muted(`Toplam ${counts.analizler} analiz kaydı`));

  const fullLsInserts: LandscapeInsert[] = [];
  if (analyses.length === 0) {
    all.push(muted("Henüz analiz kaydı yok."));
  } else {
    analyses.forEach((an, i) => {
      const imgBuf = analysisImages[i] ?? null;
      const chakraVals = an.analysis_type === "chakra" ? (an.analysis_data?.values ?? null) : null;
      const hasChakraTable = chakraVals && Object.keys(chakraVals).length > 0;
      all.push(profileLabel(`ANALİZ #${String(i + 1).padStart(3, "0")}`, C.analizler));
      all.push(h2(`${i + 1}. ${analysisLabel(an.analysis_type)}`));
      all.push(fieldInline("Tarih", formatDateTimeTR(an.created_at)));
      if (hasChakraTable) {
        all.push(...buildChakraAnalysisTables(chakraVals!));
      } else if (imgBuf) {
        fullLsInserts.push({ afterIndex: all.length, children: buildAnalysisLandscapePage(an, imgBuf, i + 1) });
      }
      if (an.note?.trim()) { all.push(h3("Analiz Notu")); all.push(bodyText(an.note.trim())); }
      else if (!hasChakraTable && !imgBuf) all.push(muted("Analiz notu girilmemiş."));
      if (i < analyses.length - 1) all.push(spacer());
    });
  }

  // ── 8. Danışan Yolculuğu
  all.push(h1Colored("8. Danışan Yolculuğu", C.yolculuk, true));

  // 8.1 Yolculuk İstatistikleri
  all.push(...buildYolculukIstatistikleri(counts, notes, journeyEvents.length));

  // 8.2 Numeroloji Özeti — sadece doğum tarihi olan danışanlar için
  if (client.dogum?.trim()) {
    all.push(...buildNumerolojiBolumu(client));
  }

  // 8.3 Kronolojik Zaman Çizelgesi
  all.push(h2("Kronolojik Zaman Çizelgesi"));
  all.push(muted(`${journeyEvents.length} kayıt · kronolojik sıralama (eskiden yeniye)`));
  if (journeyEvents.length === 0) {
    all.push(muted("Henüz zaman çizelgesi kaydı yok."));
  } else {
    for (let i = 0; i < journeyEvents.length; i++) {
      const ev = journeyEvents[i]!;
      all.push(new Paragraph({
        children: [
          new TextRun({ text: ev.dateLabel, bold: true, size: 22, font: REPORT_FONT, color: ev.color }),
          new TextRun({ text: "  ·  " + ev.category, size: 18, font: REPORT_FONT, color: C_LIGHT }),
        ],
        spacing: { before: 240, after: 60 },
        indent: { left: 280 },
      }));
      all.push(new Paragraph({
        children: [new TextRun({ text: ev.title, bold: true, size: 26, font: REPORT_FONT, color: C_DARK })],
        spacing: { after: ev.note ? 60 : 160 },
        indent: { left: 560 },
      }));
      if (ev.note) {
        all.push(new Paragraph({
          children: [new TextRun({ text: ev.note, size: 20, font: REPORT_FONT, color: C_MID, italics: true })],
          spacing: { after: 160 },
          indent: { left: 840 },
        }));
      }
      if (i < journeyEvents.length - 1) {
        all.push(new Paragraph({
          border: { bottom: { style: BorderStyle.DOTTED, size: 2, color: "e2e8f0" } },
          spacing: { before: 0, after: 0 },
        }));
      }
    }
  }

  // ── Kapanış (V3)
  all.push(...buildClosingPage(fullName, today, reportId));

  // ── Word belgesi
  const doc = new Document({
    sections: buildDocSections(all, fullLsInserts, `Danışan Raporu · ${fullName}`),
  });

  const buffer   = await Packer.toBuffer(doc);
  const filename = `danisan-raporu-${nameSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
