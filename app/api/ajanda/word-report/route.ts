import { createClient } from "@supabase/supabase-js";
import { Document, Packer } from "docx";
import {
  bodyText,
  buildFooter,
  buildPremiumCover,
  buildStatsPage,
  buildTOCPage,
  fieldInline,
  h1Colored,
  h2,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";

export const runtime = "nodejs";

const C_AJANDA = "1e3a5f"; // lacivert

type ExportMode = "all" | "selected" | "filtered" | "weekly" | "monthly" | "single";

type AppointmentRow = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status: string | null;
};

type ClientRow = { id: string; ad: string | null; soyad: string | null };

function statusLabel(s: string | null): string {
  if (s === "tamamlandi") return "Tamamlandı";
  if (s === "iptal") return "İptal Edildi";
  return "Bekliyor";
}

function formatDateTimeTR(d: string): string {
  return new Date(d).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDayHeading(d: string): string {
  return new Date(d).toLocaleDateString("tr-TR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function dayKey(d: string): string {
  return new Date(d).toISOString().slice(0, 10);
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); }
  catch { return Response.json({ ok: false, error: "Geçersiz istek gövdesi." }, { status: 400 }); }

  const { tenantId, exportMode = "all", appointmentIds, appointmentId, dateRange } = body as {
    tenantId?: string;
    exportMode?: ExportMode;
    appointmentIds?: string[];
    appointmentId?: string;   // single mode için
    dateRange?: { start: string; end: string };
  };

  if (!tenantId || typeof tenantId !== "string")
    return Response.json({ ok: false, error: "Kimlik doğrulama gerekli." }, { status: 401 });

  if (exportMode === "single" && !appointmentId)
    return Response.json({ ok: false, error: "Tek randevu için appointmentId zorunludur." }, { status: 400 });
  if ((exportMode === "selected" || exportMode === "filtered") && (!Array.isArray(appointmentIds) || appointmentIds.length === 0))
    return Response.json({ ok: false, error: "Seçili randevular için appointmentIds zorunludur." }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    return Response.json({ ok: false, error: "Supabase yapılandırması eksik." }, { status: 500 });

  const db = createClient(supabaseUrl, supabaseKey);

  let query = db.from("appointments").select("*").eq("tenant_id", tenantId);

  if (exportMode === "single" && appointmentId) {
    query = query.eq("id", appointmentId);
  } else if ((exportMode === "selected" || exportMode === "filtered") && Array.isArray(appointmentIds) && appointmentIds.length > 0) {
    query = query.in("id", appointmentIds);
  } else if ((exportMode === "weekly" || exportMode === "monthly") && dateRange?.start && dateRange?.end) {
    query = query.gte("appointment_date", dateRange.start).lte("appointment_date", dateRange.end);
  }

  const { data, error } = await query.order("appointment_date", { ascending: true });
  if (error)
    return Response.json({ ok: false, error: `Randevular okunamadı: ${error.message}` }, { status: 500 });

  const appointments = (data || []) as AppointmentRow[];
  if (!appointments.length)
    return Response.json({ ok: false, error: "Bu seçim için randevu bulunamadı." }, { status: 404 });

  // Client adları
  const clientIds = [...new Set(appointments.map((a) => a.client_id).filter(Boolean))] as string[];
  const clientMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: cData } = await db.from("clients").select("id, ad, soyad").in("id", clientIds);
    for (const c of (cData || []) as ClientRow[]) {
      clientMap.set(c.id, `${c.ad ?? ""} ${c.soyad ?? ""}`.trim());
    }
  }

  const today = new Date().toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  const dateSlug = new Date().toISOString().slice(0, 10);

  // İstatistikler
  const total = appointments.length;
  const completed = appointments.filter((a) => a.status === "tamamlandi").length;
  const cancelled = appointments.filter((a) => a.status === "iptal").length;
  const waiting = total - completed - cancelled;

  const modeLabels: Record<string, string> = {
    all: "Tüm Randevular",
    selected: "Seçili Randevular",
    filtered: "Filtrelenmiş Randevular",
    weekly: "Haftalık Randevular",
    monthly: "Aylık Randevular",
    single: appointments[0]?.title ? `Tek Randevu — ${appointments[0].title}` : "Tek Randevu",
  };
  const exportLabel = modeLabels[exportMode] ?? "Randevular";

  const rangeLine = dateRange?.start && dateRange?.end
    ? `${new Date(dateRange.start).toLocaleDateString("tr-TR")} – ${new Date(dateRange.end).toLocaleDateString("tr-TR")}`
    : undefined;

  // Günlere göre grupla
  const dayMap = new Map<string, AppointmentRow[]>();
  for (const a of appointments) {
    const k = dayKey(a.appointment_date);
    const list = dayMap.get(k);
    if (list) list.push(a); else dayMap.set(k, [a]);
  }
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const all: ReportChild[] = [];

  // Premium kapak
  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "AJANDA RAPORU",
    subtitle: rangeLine ? `${exportLabel} · ${rangeLine}` : exportLabel,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Toplam Randevu", value: String(total) },
      { label: "Tamamlandı",     value: String(completed) },
      { label: "Bekliyor",       value: String(waiting) },
      { label: "İptal",          value: String(cancelled) },
    ],
  }));

  // Sistem özeti
  all.push(...buildStatsPage([
    ["Toplam Randevu",  String(total)],
    ["Tamamlandı",      String(completed)],
    ["Bekliyor",        String(waiting)],
    ["İptal",           String(cancelled)],
    ["Gün Sayısı",      String(sortedDays.length)],
    ["Kapsam",          exportLabel],
    ...(rangeLine ? [["Tarih Aralığı", rangeLine] as [string, string]] : []),
  ]));

  all.push(...buildTOCPage());

  // Günlere göre içerik
  all.push(h1Colored("1. Randevu Listesi", C_AJANDA, true));
  all.push(muted(`${total} randevu · ${sortedDays.length} gün`));
  all.push(spacer());

  let globalN = 0;
  sortedDays.forEach(([_day, dayApts], dayIdx) => {
    if (dayIdx > 0) all.push(spacer());
    all.push(h2(formatDayHeading(dayApts[0]!.appointment_date)));

    dayApts.forEach((apt) => {
      globalN++;
      const clientName = apt.client_id ? clientMap.get(apt.client_id) || "Danışan" : null;
      all.push(profileLabel(`RANDEVU #${String(globalN).padStart(3, "0")}`, C_AJANDA));
      all.push(h3(apt.title || "Görüşme"));
      all.push(twoColTable([
        ["Tarih / Saat",  formatDateTimeTR(apt.appointment_date)],
        ["Durum",         statusLabel(apt.status)],
        ["Tür",           clientName ? "Danışan Randevusu" : "Genel Randevu"],
        ...(clientName ? [["Danışan", clientName] as [string, string]] : []),
      ]));
      if (apt.notes?.trim()) {
        all.push(fieldInline("Not", apt.notes.trim().slice(0, 300)));
      }
    });
  });

  const doc = new Document({
    sections: [{
      properties: {},
      footers: { default: buildFooter(`Ajanda Raporu · ${exportLabel}`) },
      children: all,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const modeSlug = exportMode === "single" && appointments[0]
    ? `tek-${appointments[0].appointment_date.slice(0, 10)}`
    : exportMode.replace(/[^a-z]/g, "-");
  const filename = `ajanda-${modeSlug}-${dateSlug}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
