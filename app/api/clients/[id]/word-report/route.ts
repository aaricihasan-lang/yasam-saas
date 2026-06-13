import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  bodyText,
  buildFooter,
  buildSectionDivider,
  buildTOCPage,
  C_DARK,
  C_LIGHT,
  C_MID,
  divider,
  embedImageParagraph,
  fetchImageBuffer,
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

type ClientAnalysisRow = {
  id: string;
  analysis_type?: string | null;
  note?: string | null;
  created_at: string;
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

function hwStatus(s: string | null | undefined): string {
  if (s === "tamamlandi") return "Tamamlandı";
  if (s === "gecikti") return "Gecikti";
  if (s === "iptal") return "İptal";
  return "Devam Ediyor";
}

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

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: clientId } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId } = body as { tenantId?: string };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

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
    db.from("client_analyses").select("id, analysis_type, note, created_at").eq("client_id", clientId).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
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
  all.push(...buildSectionDivider("◈  DANIŞAN BİLGİLERİ", "Temel Kimlik ve Profil Bilgileri", C.danisan));
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
  all.push(...buildSectionDivider("✎  GENEL BİLGİLER", "Sağlık Notu, Adres ve Öneriler", C.notlar));
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
  all.push(...buildSectionDivider(`◷  RANDEVULAR  (${counts.randevular})`, "Danışana Ait Tüm Randevular", C.randevular));
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
  all.push(...buildSectionDivider(`◆  TAŞ ÖNERİLERİ  (${counts.taslar})`, "Danışana Atanmış Doğaltaşlar", C.taslar));
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
  all.push(...buildSectionDivider(`◎  SEANSLAR  (${counts.seanslar})`, "Danışan Seans Geçmişi", C.seanslar));
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
  all.push(...buildSectionDivider(`▣  ÖDEVLER  (${counts.odevler})`, "Danışana Verilen Ödevler", C.odevler));
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
  all.push(...buildSectionDivider(`◉  ANALİZLER  (${counts.analizler})`, "Danışana Ait Analiz Kayıtları", C.analizler));
  all.push(h1Colored("7. Analizler", C.analizler, true));
  all.push(muted(`Toplam ${counts.analizler} analiz kaydı`));

  if (analyses.length === 0) {
    all.push(muted("Henüz analiz kaydı yok."));
  } else {
    analyses.forEach((an, i) => {
      all.push(profileLabel(`ANALİZ #${String(i + 1).padStart(3, "0")}`, C.analizler));
      all.push(h2(`${i + 1}. ${analysisLabel(an.analysis_type)}`));
      all.push(fieldInline("Tarih", formatDateTimeTR(an.created_at)));
      if (an.note?.trim()) { all.push(h3("Analiz Notu")); all.push(bodyText(an.note.trim())); }
      else                 all.push(muted("Analiz notu girilmemiş."));
      if (i < analyses.length - 1) all.push(spacer());
    });
  }

  // ── 8. Danışan Yolculuğu
  all.push(...buildJourneySection(journeyEvents, 8));

  // ── Kapanış (V3)
  all.push(...buildClosingPage(fullName, today, reportId));

  // ── Word belgesi
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Danışan Raporu · ${fullName}`) },
      children: all,
    }],
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
