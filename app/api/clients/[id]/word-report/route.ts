import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildSectionDivider,
  buildTOCPage,
  divider,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

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
};

type ClientAnalysisRow = {
  id: string;
  analysis_type?: string | null;
  note?: string | null;
  created_at: string;
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

function homeworkStatusLabel(status: string | null | undefined): string {
  if (status === "tamamlandi") return "Tamamlandı";
  if (status === "gecikti") return "Gecikti";
  if (status === "iptal") return "İptal";
  return "Devam Ediyor";
}

function appointmentStatusLabel(status: string | null | undefined, date: string): string {
  if (status === "tamamlandi") return "Tamamlandı";
  if (status === "iptal") return "İptal";
  if (new Date(date).getTime() < Date.now()) return "Geçmiş";
  return "Yaklaşan";
}

function analysisTypeLabel(type: string | null | undefined): string {
  if (type === "chakra") return "Çakra Analizi";
  if (type === "planet") return "Gezegen Analizi";
  return type || "Analiz";
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
  const notes = notesRes.data as ClientNoteRow | null;
  const appointments = (appointmentsRes.data || []) as AppointmentRow[];
  const stones = (stonesRes.data || []) as ClientStoneRow[];
  const sessions = (sessionsRes.data || []) as ClientSessionRow[];
  const homeworks = (homeworksRes.data || []) as ClientHomeworkRow[];
  const analyses = (analysesRes.data || []) as ClientAnalysisRow[];

  const fullName = `${client.ad ?? ""} ${client.soyad ?? ""}`.trim() || "İsimsiz Danışan";
  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);
  const nameSlug = slugify(fullName);

  const C_DANISAN = "1e3a5f";

  const allChildren: ReportChild[] = [];

  // ─── Kapak ──────────────────────────────────────────────────────────────────
  allChildren.push(
    ...buildPremiumCover({
      title1: "YAŞAM SİSTEMİ",
      title2: "Danışan Bilgi Raporu",
      subtitle: `${fullName} — Bireysel Danışan Dosyası`,
      date: today,
      stats: [
        { label: "Randevu", value: `${appointments.length} kayıt` },
        { label: "Taş Kaydı", value: `${stones.length} kayıt` },
        { label: "Seans", value: `${sessions.length} kayıt` },
        { label: "Ödev", value: `${homeworks.length} kayıt` },
        { label: "Analiz", value: `${analyses.length} kayıt` },
      ],
    })
  );

  // ─── İçindekiler ─────────────────────────────────────────────────────────────
  allChildren.push(...buildTOCPage());

  // ─── 1. Danışan Temel Bilgileri ──────────────────────────────────────────────
  allChildren.push(...buildSectionDivider("DANIŞAN BİLGİLERİ", "Temel Kimlik ve Profil Bilgileri", C_DANISAN));
  allChildren.push(h1Colored("1. Danışan Temel Bilgileri", C_DANISAN, true));
  allChildren.push(
    twoColTable([
      ["Ad", v(client.ad)],
      ["Soyad", v(client.soyad)],
      ["Telefon", v(client.telefon)],
      ["Doğum Tarihi", formatDateTR(client.dogum)],
      ["Görüşme Tarihi", formatDateTR(client.gorusme)],
      ["Burç", v(client.burc)],
      ["Kan Grubu", v(client.kan)],
      ["Mizaç", v(client.mizac)],
    ])
  );

  // ─── 2. Genel Bilgiler ────────────────────────────────────────────────────────
  allChildren.push(divider());
  allChildren.push(h1Colored("2. Genel Bilgiler", C_DANISAN));

  allChildren.push(h2("Sağlık Notu"));
  allChildren.push(notes?.saglik_notu?.trim() ? bodyText(notes.saglik_notu.trim()) : muted("Bilgi girilmemiş"));

  allChildren.push(h2("Adres"));
  allChildren.push(notes?.adres?.trim() ? bodyText(notes.adres.trim()) : muted("Bilgi girilmemiş"));

  allChildren.push(h2("Öneriler"));
  allChildren.push(notes?.oneriler?.trim() ? bodyText(notes.oneriler.trim()) : muted("Bilgi girilmemiş"));

  allChildren.push(h2("Notlar"));
  allChildren.push(notes?.notlar?.trim() ? bodyText(notes.notlar.trim()) : muted("Bilgi girilmemiş"));

  // ─── 3. Randevular ────────────────────────────────────────────────────────────
  allChildren.push(...buildSectionDivider("RANDEVULAR", "Danışana Ait Tüm Randevular", "db2777"));
  allChildren.push(h1Colored("3. Randevular", "db2777", true));
  allChildren.push(muted(`Toplam ${appointments.length} randevu kaydı`));

  if (appointments.length === 0) {
    allChildren.push(muted("Henüz randevu kaydı yok."));
  } else {
    appointments.forEach((apt, i) => {
      allChildren.push(
        h2(`${i + 1}. ${apt.title || "Görüşme"} — ${formatDateTimeTR(apt.appointment_date)}`)
      );
      allChildren.push(fieldInline("Durum", appointmentStatusLabel(apt.status, apt.appointment_date)));
      if (apt.notes?.trim()) allChildren.push(fieldInline("Not", apt.notes.trim()));
      if (i < appointments.length - 1) allChildren.push(spacer());
    });
  }

  // ─── 4. Taş Önerileri / Atanmış Taşlar ───────────────────────────────────────
  allChildren.push(...buildSectionDivider("TAŞ ÖNERİLERİ", "Danışana Atanmış Doğaltaşlar", "0891b2"));
  allChildren.push(h1Colored("4. Taş Önerileri / Atanmış Taşlar", "0891b2", true));
  allChildren.push(muted(`Toplam ${stones.length} taş kaydı`));

  if (stones.length === 0) {
    allChildren.push(muted("Henüz taş kaydı yok."));
  } else {
    stones.forEach((stone, i) => {
      allChildren.push(h2(`${i + 1}. ${stone.stone_name || "İsimsiz Taş"}`));
      const stoneRows: [string, string][] = [
        ["Taş Adı", v(stone.stone_name)],
        ["Kullanım Türü", v(stone.stone_type)],
        ["Tarih", formatDateTR(stone.stone_date)],
      ];
      allChildren.push(twoColTable(stoneRows));
      if (stone.usage_area?.trim()) { allChildren.push(h3("Kullanım Detayı")); allChildren.push(bodyText(stone.usage_area.trim())); }
      if (stone.combination_text?.trim()) { allChildren.push(h3("Kombin")); allChildren.push(bodyText(stone.combination_text.trim())); }
      if (stone.warning_text?.trim()) { allChildren.push(h3("Uyarı")); allChildren.push(bodyText(stone.warning_text.trim())); }
      if (stone.note?.trim()) { allChildren.push(h3("Genel Not")); allChildren.push(bodyText(stone.note.trim())); }
      if (stone.other_notes?.trim()) { allChildren.push(h3("Diğer Notlar")); allChildren.push(bodyText(stone.other_notes.trim())); }
      if (i < stones.length - 1) allChildren.push(divider());
    });
  }

  // ─── 5. Seanslar ─────────────────────────────────────────────────────────────
  allChildren.push(...buildSectionDivider("SEANSLAR", "Danışan Seans Geçmişi", "16a34a"));
  allChildren.push(h1Colored("5. Seanslar", "16a34a", true));
  allChildren.push(muted(`Toplam ${sessions.length} seans kaydı`));

  if (sessions.length === 0) {
    allChildren.push(muted("Henüz seans kaydı yok."));
  } else {
    sessions.forEach((session, i) => {
      const label = session.session_type || `Seans ${i + 1}`;
      allChildren.push(h2(`${i + 1}. ${label} — ${formatDateTR(session.session_date)}`));
      allChildren.push(
        twoColTable([
          ["Tür", v(session.session_type)],
          ["Süre", session.duration_minutes ? `${session.duration_minutes} dk` : "Belirtilmedi"],
          ["Ücret", session.fee != null ? `${session.fee} ₺` : "Belirtilmedi"],
        ])
      );
      if (session.session_note?.trim()) { allChildren.push(h3("Seans Notu")); allChildren.push(bodyText(session.session_note.trim())); }
      if (session.actions_done?.trim()) { allChildren.push(h3("Yapılan İşlemler")); allChildren.push(bodyText(session.actions_done.trim())); }
      if (session.suggestions?.trim()) { allChildren.push(h3("Öneriler")); allChildren.push(bodyText(session.suggestions.trim())); }
      if (session.next_plan?.trim()) { allChildren.push(h3("Sonraki Seans Planı")); allChildren.push(bodyText(session.next_plan.trim())); }
      if (i < sessions.length - 1) allChildren.push(divider());
    });
  }

  // ─── 6. Ödevler ──────────────────────────────────────────────────────────────
  allChildren.push(...buildSectionDivider("ÖDEVLER", "Danışana Verilen Ödevler", "dc2626"));
  allChildren.push(h1Colored("6. Ödevler", "dc2626", true));
  allChildren.push(muted(`Toplam ${homeworks.length} ödev kaydı`));

  if (homeworks.length === 0) {
    allChildren.push(muted("Henüz ödev kaydı yok."));
  } else {
    homeworks.forEach((hw, i) => {
      allChildren.push(h2(`${i + 1}. ${hw.title || "İsimsiz Ödev"}`));
      allChildren.push(
        twoColTable([
          ["Tür", v(hw.homework_type)],
          ["Başlangıç", formatDateTR(hw.start_date)],
          ["Bitiş", formatDateTR(hw.end_date)],
          ["Durum", homeworkStatusLabel(hw.status)],
        ])
      );
      if (hw.description?.trim()) { allChildren.push(h3("Açıklama")); allChildren.push(bodyText(hw.description.trim())); }
      if (hw.expert_note?.trim()) { allChildren.push(h3("Uzman Notu")); allChildren.push(bodyText(hw.expert_note.trim())); }
      if (hw.client_feedback?.trim()) { allChildren.push(h3("Danışan Geri Bildirimi")); allChildren.push(bodyText(hw.client_feedback.trim())); }
      if (i < homeworks.length - 1) allChildren.push(divider());
    });
  }

  // ─── 7. Analizler ────────────────────────────────────────────────────────────
  allChildren.push(...buildSectionDivider("ANALİZLER", "Danışana Ait Analiz Kayıtları", "9333ea"));
  allChildren.push(h1Colored("7. Analizler", "9333ea", true));
  allChildren.push(muted(`Toplam ${analyses.length} analiz kaydı`));

  if (analyses.length === 0) {
    allChildren.push(muted("Henüz analiz kaydı yok."));
  } else {
    analyses.forEach((analysis, i) => {
      allChildren.push(h2(`${i + 1}. ${analysisTypeLabel(analysis.analysis_type)}`));
      allChildren.push(fieldInline("Tarih", formatDateTimeTR(analysis.created_at)));
      if (analysis.note?.trim()) {
        allChildren.push(h3("Analiz Notu"));
        allChildren.push(bodyText(analysis.note.trim()));
      } else {
        allChildren.push(muted("Analiz notu girilmemiş."));
      }
      if (i < analyses.length - 1) allChildren.push(spacer());
    });
  }

  // ─── Belge oluştur ────────────────────────────────────────────────────────────
  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Danışan Raporu — ${fullName}`) },
      children: allChildren,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const filename = `danisan-raporu-${nameSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
