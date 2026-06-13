import { createClient } from "@supabase/supabase-js";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  arraySection,
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
  odevler:    "713f12",   // sarı/amber
  analizler:  "4a1d96",   // koyu mor
  yolculuk:   "1e1b4b",   // indigo
  kapak:      "0f172a",   // siyah-lacivert
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function v(value: string | null | undefined): string {
  return value?.trim() || "Bilgi girilmemiş";
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

function homeworkStatusLabel(s: string | null | undefined): string {
  if (s === "tamamlandi") return "Tamamlandi";
  if (s === "gecikti") return "Gecikti";
  if (s === "iptal") return "Iptal";
  return "Devam Ediyor";
}

function appointmentStatusLabel(s: string | null | undefined, date: string): string {
  if (s === "tamamlandi") return "Tamamlandi";
  if (s === "iptal") return "Iptal";
  return new Date(date).getTime() < Date.now() ? "Gecmis" : "Yaklasan";
}

function analysisTypeLabel(t: string | null | undefined): string {
  if (t === "chakra") return "Cakra Analizi";
  if (t === "planet") return "Gezegen Analizi";
  return t || "Analiz";
}

function toTs(dateStr: string | null | undefined, fallback: string): number {
  const d = dateStr || fallback;
  const t = new Date(d).getTime();
  return isNaN(t) ? new Date(fallback).getTime() : t;
}

// ─── Özel paragraf yardımcıları ───────────────────────────────────────────────

function centeredBig(text: string, size: number, color: string, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold, size, font: REPORT_FONT, color, allCaps: bold })],
    spacing: { after: 160 },
  });
}

function centeredMuted(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, size: 20, font: REPORT_FONT, color: C_LIGHT, italics: true })],
    spacing: { after: 120 },
  });
}

function accentRule(color: string): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.THICK, size: 10, color } },
    spacing: { before: 0, after: 0 },
  });
}

function thinRule(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
    spacing: { before: 240, after: 240 },
  });
}

function statRow(label: string, value: string, labelColor: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({ text: label + ":  ", size: 22, font: REPORT_FONT, color: C_MID }),
      new TextRun({ text: value, bold: true, size: 24, font: REPORT_FONT, color: labelColor }),
    ],
    spacing: { after: 100 },
  });
}

// ─── buildClientProfilePage ───────────────────────────────────────────────────

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
    children: [new TextRun({ text: "DANISAN PROFILİ", bold: true, size: 48, font: REPORT_FONT, color: C.danisan, allCaps: true })],
    pageBreakBefore: true,
    spacing: { before: 600, after: 100 },
  }));
  out.push(accentRule(C.danisan));
  out.push(new Paragraph({ spacing: { after: 400 } }));

  // Fotoğraf (varsa)
  if (profileImgBuf) {
    out.push(embedImageParagraph(profileImgBuf, 160));
    out.push(new Paragraph({ spacing: { after: 280 } }));
  }

  // Danışan adı büyük
  out.push(centeredBig(fullName, 52, C.danisan, true));
  out.push(centeredMuted("Bireysel Danisan Dosyasi"));
  out.push(new Paragraph({ spacing: { after: 480 } }));

  // Profil bilgi tablosu
  out.push(new Paragraph({
    children: [new TextRun({ text: "KIMLIK BILGILERI", bold: true, size: 22, font: REPORT_FONT, color: C.danisan, allCaps: true })],
    spacing: { before: 0, after: 240 },
  }));
  out.push(twoColTable([
    ["Ad Soyad",       fullName],
    ["Telefon",        v(client.telefon)],
    ["Dogum Tarihi",   formatDateTR(client.dogum)],
    ["Gorusme Tarihi", formatDateTR(client.gorusme)],
    ["Burc",           v(client.burc)],
    ["Kan Grubu",      v(client.kan)],
    ["Mizac",          v(client.mizac)],
  ]));

  out.push(new Paragraph({ spacing: { after: 480 } }));
  out.push(thinRule());

  // İstatistik kutuları
  out.push(new Paragraph({
    children: [new TextRun({ text: "SISTEM OZETI", bold: true, size: 22, font: REPORT_FONT, color: C_DARK, allCaps: true })],
    spacing: { before: 400, after: 280 },
  }));

  out.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          makeStatCell("Randevular",   String(counts.randevular),  C.randevular),
          makeStatCell("Tas Kayitlari", String(counts.taslar),     C.taslar),
          makeStatCell("Seanslar",     String(counts.seanslar),    C.seanslar),
          makeStatCell("Odevler",      String(counts.odevler),     C.odevler),
          makeStatCell("Analizler",    String(counts.analizler),   C.analizler),
        ],
      }),
    ],
  }));

  return out;
}

function makeStatCell(label: string, value: string, color: string): TableCell {
  return new TableCell({
    width: { size: 2000, type: WidthType.DXA },
    margins: { top: 160, bottom: 160, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: value, bold: true, size: 36, font: REPORT_FONT, color })],
        spacing: { after: 60 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: label, size: 16, font: REPORT_FONT, color: C_MID, allCaps: true })],
      }),
    ],
  });
}

// ─── buildJourneySection ──────────────────────────────────────────────────────

function buildJourneySection(events: TimelineEvent[], n: number): ReportChild[] {
  const color = C.yolculuk;
  const out: ReportChild[] = [
    ...buildSectionDivider("DANISAN YOLCULUGU", "Kronolojik Takip ve Ilerleme", color),
    h1Colored(`${n}. Danisan Yolculugu`, color, true),
    muted(`${events.length} kayit · kronolojik siralama (eskiden yeniye)`),
  ];

  if (events.length === 0) {
    out.push(muted("Henuz zaman cizelgesi kaydi yok."));
    return out;
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    out.push(new Paragraph({
      children: [
        new TextRun({ text: ev.dateLabel + "  ", bold: true, size: 22, font: REPORT_FONT, color: ev.color }),
        new TextRun({ text: `[${ev.category}]`, size: 18, font: REPORT_FONT, color: C_LIGHT }),
      ],
      spacing: { before: 200, after: 40 },
      indent: { left: 240 },
    }));
    out.push(new Paragraph({
      children: [new TextRun({ text: ev.title, bold: true, size: 24, font: REPORT_FONT, color: C_DARK })],
      spacing: { after: ev.note ? 40 : 120 },
      indent: { left: 480 },
    }));
    if (ev.note) {
      out.push(new Paragraph({
        children: [new TextRun({ text: ev.note, size: 20, font: REPORT_FONT, color: C_MID, italics: true })],
        spacing: { after: 120 },
        indent: { left: 720 },
      }));
    }
    if (i < events.length - 1) {
      out.push(new Paragraph({
        children: [new TextRun({ text: "·", size: 18, font: REPORT_FONT, color: C_LIGHT })],
        spacing: { after: 60 },
        indent: { left: 360 },
      }));
    }
  }

  return out;
}

// ─── buildClosingPage ─────────────────────────────────────────────────────────

function buildClosingPage(fullName: string, today: string): ReportChild[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "", size: 4 })],
      pageBreakBefore: true,
      spacing: { before: 2800 },
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.THICK, size: 12, color: C.danisan } },
      spacing: { before: 0, after: 0 },
    }),
    new Paragraph({ spacing: { after: 480 } }),
    centeredBig("YASAM SİSTEMİ", 64, C.danisan, true),
    centeredMuted("Butuncul Yasam Analizi Platformu"),
    new Paragraph({ spacing: { after: 480 } }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e2e8f0" } },
      spacing: { before: 0, after: 480 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Danisan: ${fullName}`, size: 22, font: REPORT_FONT, color: C_MID, bold: true })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Rapor Olusturma Tarihi: ${today}`, size: 20, font: REPORT_FONT, color: C_LIGHT })],
      spacing: { after: 160 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Bu rapor Yasam Sistemi platformu tarafindan otomatik olusturulmustur.", size: 18, font: REPORT_FONT, color: C_LIGHT, italics: true })],
      spacing: { after: 0 },
    }),
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

  const client = clientRes.data as ClientRow;
  const notes  = notesRes.data as ClientNoteRow | null;
  const appointments = (appointmentsRes.data || []) as AppointmentRow[];
  const stones       = (stonesRes.data       || []) as ClientStoneRow[];
  const sessions     = (sessionsRes.data     || []) as ClientSessionRow[];
  const homeworks    = (homeworksRes.data    || []) as ClientHomeworkRow[];
  const analyses     = (analysesRes.data     || []) as ClientAnalysisRow[];

  const fullName  = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim() || "İsimsiz Danisan";
  const today     = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug  = new Date().toISOString().slice(0, 10);
  const nameSlug  = slugify(fullName);

  // Profil fotoğrafı (isteğe bağlı, hata varsa atla)
  let profileImgBuf: Buffer | null = null;
  if (client.profile_image_url?.trim()) {
    profileImgBuf = await fetchImageBuffer(client.profile_image_url.trim()).catch(() => null);
  }

  // ─── Yolculuk olaylarını topla ve tarih sırasına koy ────────────────────────
  const journeyEvents: TimelineEvent[] = [];

  for (const apt of appointments) {
    const ts = new Date(apt.appointment_date).getTime();
    if (!isNaN(ts)) {
      journeyEvents.push({
        ts,
        dateLabel: formatDateTimeTR(apt.appointment_date),
        category: "Randevu",
        color: C.randevular,
        title: apt.title || "Gorusme",
        note: apt.notes?.trim() || undefined,
      });
    }
  }

  for (const s of stones) {
    const ts = toTs(s.stone_date, s.created_at);
    journeyEvents.push({
      ts,
      dateLabel: formatDateTR(s.stone_date || s.created_at),
      category: "Tas Onerisi",
      color: C.taslar,
      title: s.stone_name || "Tas",
      note: s.stone_type?.trim() || undefined,
    });
  }

  for (const s of sessions) {
    const ts = toTs(s.session_date, s.created_at);
    journeyEvents.push({
      ts,
      dateLabel: formatDateTR(s.session_date || s.created_at),
      category: "Seans",
      color: C.seanslar,
      title: s.session_type || "Seans",
      note: s.session_note?.trim()?.slice(0, 120) || undefined,
    });
  }

  for (const hw of homeworks) {
    const ts = toTs(hw.start_date, hw.created_at);
    journeyEvents.push({
      ts,
      dateLabel: formatDateTR(hw.start_date || hw.created_at),
      category: "Odev",
      color: C.odevler,
      title: hw.title || "Odev",
      note: hw.homework_type?.trim() || undefined,
    });
  }

  for (const an of analyses) {
    const ts = new Date(an.created_at).getTime();
    journeyEvents.push({
      ts,
      dateLabel: formatDateTimeTR(an.created_at),
      category: "Analiz",
      color: C.analizler,
      title: analysisTypeLabel(an.analysis_type),
      note: an.note?.trim()?.slice(0, 120) || undefined,
    });
  }

  journeyEvents.sort((a, b) => a.ts - b.ts);

  // ─── Sayılar ────────────────────────────────────────────────────────────────
  const counts = {
    randevular: appointments.length,
    taslar:     stones.length,
    seanslar:   sessions.length,
    odevler:    homeworks.length,
    analizler:  analyses.length,
  };

  // ─── Belge oluştur ───────────────────────────────────────────────────────────
  const allChildren: ReportChild[] = [];

  // 1. Kapak
  allChildren.push(
    ...buildPremiumCover({
      title1:   "YAŞAM SİSTEMİ",
      title2:   "DANIŞAN DOSYASI",
      subtitle: "Butuncul Yasam Analizi ve Takip Raporu",
      date:     `Olusturulma Tarihi: ${today}`,
      stats: [
        { label: "Danisan",        value: fullName },
        { label: "Randevular",     value: `${counts.randevular} kayit` },
        { label: "Tas Kayitlari",  value: `${counts.taslar} kayit` },
        { label: "Seanslar",       value: `${counts.seanslar} kayit` },
        { label: "Odevler",        value: `${counts.odevler} kayit` },
        { label: "Analizler",      value: `${counts.analizler} kayit` },
      ],
    })
  );

  // 2. Danışan profil sayfası (özet kart + istatistik kutuları)
  allChildren.push(
    ...buildClientProfilePage(fullName, client, counts, profileImgBuf)
  );

  // 3. Sistem özeti sayfası
  allChildren.push(
    ...buildStatsPage(
      [
        ["Danisan",       fullName],
        ["Randevular",    `${counts.randevular} kayit`],
        ["Tas Kayitlari", `${counts.taslar} kayit`],
        ["Seanslar",      `${counts.seanslar} kayit`],
        ["Odevler",       `${counts.odevler} kayit`],
        ["Analizler",     `${counts.analizler} kayit`],
        ["Yolculuk",      `${journeyEvents.length} toplam kayit`],
        ["Rapor Tarihi",  today],
      ],
      []
    )
  );

  // 4. İçindekiler
  allChildren.push(...buildTOCPage());

  // ─── 1. Danışan Temel Bilgileri ─────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("DANISAN BİLGİLERİ", "Temel Kimlik ve Profil Bilgileri", C.danisan)
  );
  allChildren.push(h1Colored("1. Danisan Temel Bilgileri", C.danisan, true));
  allChildren.push(profileLabel("DANISAN PROFIL KARTI", C.danisan));
  allChildren.push(
    twoColTable([
      ["Ad",           v(client.ad)],
      ["Soyad",        v(client.soyad)],
      ["Telefon",      v(client.telefon)],
      ["Dogum Tarihi", formatDateTR(client.dogum)],
      ["Gorusme",      formatDateTR(client.gorusme)],
      ["Burc",         v(client.burc)],
      ["Kan Grubu",    v(client.kan)],
      ["Mizac",        v(client.mizac)],
    ])
  );

  // ─── 2. Genel Bilgiler ───────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("GENEL BİLGİLER", "Saglik Notu, Adres ve Oneriler", C.notlar)
  );
  allChildren.push(h1Colored("2. Genel Bilgiler", C.notlar, true));

  allChildren.push(h2("Saglik Notu"));
  allChildren.push(notes?.saglik_notu?.trim() ? bodyText(notes.saglik_notu.trim()) : muted("Bilgi girilmemis."));

  allChildren.push(h2("Adres"));
  allChildren.push(notes?.adres?.trim() ? bodyText(notes.adres.trim()) : muted("Bilgi girilmemis."));

  allChildren.push(h2("Oneriler"));
  allChildren.push(notes?.oneriler?.trim() ? bodyText(notes.oneriler.trim()) : muted("Bilgi girilmemis."));

  allChildren.push(h2("Notlar"));
  allChildren.push(notes?.notlar?.trim() ? bodyText(notes.notlar.trim()) : muted("Bilgi girilmemis."));

  // ─── 3. Randevular ───────────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("RANDEVULAR", `${counts.randevular} Randevu Kaydi`, C.randevular)
  );
  allChildren.push(h1Colored("3. Randevular", C.randevular, true));
  allChildren.push(muted(`Toplam ${counts.randevular} randevu kaydi`));

  if (appointments.length === 0) {
    allChildren.push(muted("Henuz randevu kaydi yok."));
  } else {
    appointments.forEach((apt, i) => {
      allChildren.push(profileLabel(`RANDEVU #${String(i + 1).padStart(3, "0")}`, C.randevular));
      allChildren.push(h2(`${i + 1}. ${apt.title || "Gorusme"}`));
      allChildren.push(twoColTable([
        ["Tarih",  formatDateTimeTR(apt.appointment_date)],
        ["Durum",  appointmentStatusLabel(apt.status, apt.appointment_date)],
      ]));
      if (apt.notes?.trim()) { allChildren.push(h3("Not")); allChildren.push(bodyText(apt.notes.trim())); }
      if (i < appointments.length - 1) allChildren.push(divider());
    });
  }

  // ─── 4. Taş Önerileri ────────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("TAŞ ÖNERİLERİ", `${counts.taslar} Tas Kaydi`, C.taslar)
  );
  allChildren.push(h1Colored("4. Tas Onerileri / Atanmis Taslar", C.taslar, true));
  allChildren.push(muted(`Toplam ${counts.taslar} tas kaydi`));

  if (stones.length === 0) {
    allChildren.push(muted("Henuz tas kaydi yok."));
  } else {
    stones.forEach((stone, i) => {
      allChildren.push(profileLabel(`TAS #${String(i + 1).padStart(3, "0")}`, C.taslar));
      allChildren.push(h2(`${i + 1}. ${stone.stone_name || "Isimsiz Tas"}`));
      allChildren.push(twoColTable([
        ["Tas Adi",      v(stone.stone_name)],
        ["Kullanim Turu", v(stone.stone_type)],
        ["Tarih",        formatDateTR(stone.stone_date)],
      ]));
      if (stone.usage_area?.trim())       { allChildren.push(h3("Kullanim Detayi"));    allChildren.push(bodyText(stone.usage_area.trim())); }
      if (stone.combination_text?.trim()) { allChildren.push(h3("Kombin"));             allChildren.push(bodyText(stone.combination_text.trim())); }
      if (stone.warning_text?.trim())     { allChildren.push(h3("Uyari"));              allChildren.push(bodyText(stone.warning_text.trim())); }
      if (stone.note?.trim())             { allChildren.push(h3("Genel Not"));          allChildren.push(bodyText(stone.note.trim())); }
      if (stone.other_notes?.trim())      { allChildren.push(h3("Diger Notlar"));       allChildren.push(bodyText(stone.other_notes.trim())); }
      if (i < stones.length - 1) allChildren.push(divider());
    });
  }

  // ─── 5. Seanslar ─────────────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("SEANSLAR", `${counts.seanslar} Seans Kaydi`, C.seanslar)
  );
  allChildren.push(h1Colored("5. Seanslar", C.seanslar, true));
  allChildren.push(muted(`Toplam ${counts.seanslar} seans kaydi`));

  const totalFee     = sessions.reduce((s, r) => s + (r.fee ?? 0), 0);
  const totalMinutes = sessions.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);
  if (sessions.length > 0) {
    allChildren.push(twoColTable([
      ["Toplam Seans",  `${sessions.length} seans`],
      ["Toplam Sure",   `${totalMinutes} dk`],
      ["Toplam Ucret",  `${totalFee} TL`],
    ]));
  }
  allChildren.push(spacer());

  if (sessions.length === 0) {
    allChildren.push(muted("Henuz seans kaydi yok."));
  } else {
    sessions.forEach((session, i) => {
      allChildren.push(profileLabel(`SEANS #${String(i + 1).padStart(3, "0")}`, C.seanslar));
      allChildren.push(h2(`${i + 1}. ${session.session_type || `Seans ${i + 1}`} — ${formatDateTR(session.session_date)}`));
      allChildren.push(twoColTable([
        ["Tur",   v(session.session_type)],
        ["Sure",  session.duration_minutes ? `${session.duration_minutes} dk` : "Belirtilmedi"],
        ["Ucret", session.fee != null ? `${session.fee} TL` : "Belirtilmedi"],
      ]));
      if (session.session_note?.trim())  { allChildren.push(h3("Seans Notu"));         allChildren.push(bodyText(session.session_note.trim())); }
      if (session.actions_done?.trim())  { allChildren.push(h3("Yapilan Islemler"));   allChildren.push(bodyText(session.actions_done.trim())); }
      if (session.suggestions?.trim())   { allChildren.push(h3("Oneriler"));           allChildren.push(bodyText(session.suggestions.trim())); }
      if (session.next_plan?.trim())     { allChildren.push(h3("Sonraki Seans Plani")); allChildren.push(bodyText(session.next_plan.trim())); }
      if (i < sessions.length - 1) allChildren.push(divider());
    });
  }

  // ─── 6. Ödevler ──────────────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("ÖDEVLER", `${counts.odevler} Odev Kaydi`, C.odevler)
  );
  allChildren.push(h1Colored("6. Odevler", C.odevler, true));
  allChildren.push(muted(`Toplam ${counts.odevler} odev kaydi`));

  if (homeworks.length === 0) {
    allChildren.push(muted("Henuz odev kaydi yok."));
  } else {
    homeworks.forEach((hw, i) => {
      allChildren.push(profileLabel(`ODEV #${String(i + 1).padStart(3, "0")}`, C.odevler));
      allChildren.push(h2(`${i + 1}. ${hw.title || "Isimsiz Odev"}`));
      allChildren.push(twoColTable([
        ["Tur",       v(hw.homework_type)],
        ["Baslangic", formatDateTR(hw.start_date)],
        ["Bitis",     formatDateTR(hw.end_date)],
        ["Durum",     homeworkStatusLabel(hw.status)],
      ]));
      if (hw.description?.trim())     { allChildren.push(h3("Aciklama"));                allChildren.push(bodyText(hw.description.trim())); }
      if (hw.expert_note?.trim())     { allChildren.push(h3("Uzman Notu"));              allChildren.push(bodyText(hw.expert_note.trim())); }
      if (hw.client_feedback?.trim()) { allChildren.push(h3("Danisan Geri Bildirimi")); allChildren.push(bodyText(hw.client_feedback.trim())); }
      if (i < homeworks.length - 1) allChildren.push(divider());
    });
  }

  // ─── 7. Analizler ────────────────────────────────────────────────────────────
  allChildren.push(
    ...buildSectionDivider("ANALİZLER", `${counts.analizler} Analiz Kaydi`, C.analizler)
  );
  allChildren.push(h1Colored("7. Analizler", C.analizler, true));
  allChildren.push(muted(`Toplam ${counts.analizler} analiz kaydi`));

  if (analyses.length === 0) {
    allChildren.push(muted("Henuz analiz kaydi yok."));
  } else {
    analyses.forEach((an, i) => {
      allChildren.push(profileLabel(`ANALIZ #${String(i + 1).padStart(3, "0")}`, C.analizler));
      allChildren.push(h2(`${i + 1}. ${analysisTypeLabel(an.analysis_type)}`));
      allChildren.push(fieldInline("Tarih", formatDateTimeTR(an.created_at)));
      if (an.note?.trim()) { allChildren.push(h3("Analiz Notu")); allChildren.push(bodyText(an.note.trim())); }
      else                 allChildren.push(muted("Analiz notu girilmemis."));
      if (i < analyses.length - 1) allChildren.push(spacer());
    });
  }

  // ─── 8. Danışan Yolculuğu ────────────────────────────────────────────────────
  allChildren.push(...buildJourneySection(journeyEvents, 8));

  // ─── Kapanış sayfası ─────────────────────────────────────────────────────────
  allChildren.push(...buildClosingPage(fullName, today));

  // ─── Word belgesi ─────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Danisan Raporu — ${fullName}`) },
      children: allChildren,
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
