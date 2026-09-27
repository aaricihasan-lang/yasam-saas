/**
 * Ajanda Word raporu — SAF belge kurucusu (DB/ağ YOK → harness gerçek DOCX üretip test eder).
 *
 * FA-02: appointments.appointment_date timestamptz'dir. Vercel UTC'de çalıştığı için
 * `toLocale*String` saat dilimi verilmeden çağrılınca 10:00 randevu 07:00, gece 01:30
 * randevusu önceki güne basılıyordu. Tüm tarih/saat/gün gruplama/dosya adı artık
 * `lib/time/reportTime` üzerinden hedef saat diliminde (varsayılan Europe/Istanbul).
 * FA-44: geçmiş + hâlâ "bekliyor" randevu "Sonuç girilmedi" olarak gösterilir (DB değişmez).
 */
import { Document } from "docx";
import {
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
import {
  formatDateLoose,
  formatInstantDate,
  formatInstantDateTime,
  looseDayKey,
  reportFileDate,
  reportGeneratedLabel,
  toInstant,
  zonedDayKey,
} from "@/lib/time/reportTime";

const C_AJANDA = "1e3a5f"; // lacivert

export type AjandaExportMode = "all" | "selected" | "filtered" | "weekly" | "monthly" | "single";

export type AjandaAppointmentRow = {
  id: string;
  title: string | null;
  notes: string | null;
  appointment_date: string;
  created_at: string;
  client_id: string | null;
  status: string | null;
};

/** Randevu durum etiketi. Geçmiş + bekliyor → "Sonuç girilmedi" (türetilmiş; DB değişmez). */
export function ajandaStatusLabel(status: string | null, appointmentDate: string, now: Date): string {
  if (status === "tamamlandi") return "Tamamlandı";
  if (status === "iptal") return "İptal Edildi";
  const at = toInstant(appointmentDate);
  if (at && at.getTime() < now.getTime()) return "Sonuç girilmedi";
  return "Bekliyor";
}

export type AjandaReportInput = {
  appointments: AjandaAppointmentRow[];
  clientMap: Map<string, string>;
  exportMode: AjandaExportMode;
  dateRange?: { start: string; end: string };
  expertName?: string | null;
  now?: Date;
  timeZone?: string;
};

export function buildAjandaReportDoc(input: AjandaReportInput): { doc: Document; filename: string } {
  const { appointments, clientMap, exportMode, dateRange } = input;
  const now = input.now ?? new Date();
  const tzOpts = { timeZone: input.timeZone };

  const today = reportGeneratedLabel(tzOpts, now);
  const dateSlug = reportFileDate(tzOpts, now);

  // İstatistikler
  const total = appointments.length;
  const completed = appointments.filter((a) => a.status === "tamamlandi").length;
  const cancelled = appointments.filter((a) => a.status === "iptal").length;
  const noResult = appointments.filter(
    (a) => ajandaStatusLabel(a.status, a.appointment_date, now) === "Sonuç girilmedi",
  ).length;
  const waiting = total - completed - cancelled - noResult;

  const modeLabels: Record<string, string> = {
    all: "Tüm Randevular",
    selected: "Seçili Randevular",
    filtered: "Filtrelenmiş Randevular",
    weekly: "Haftalık Randevular",
    monthly: "Aylık Randevular",
    single: appointments[0]?.title ? `Tek Randevu — ${appointments[0].title}` : "Tek Randevu",
  };
  const exportLabel = modeLabels[exportMode] ?? "Randevular";

  // dateRange takvim günü ("YYYY-MM-DD") ise kaydırılmaz; ISO an ise hedef saat diliminde gösterilir.
  const rangeLine = dateRange?.start && dateRange?.end
    ? `${formatDateLoose(dateRange.start, tzOpts)} – ${formatDateLoose(dateRange.end, tzOpts)}`
    : undefined;

  const expertName = input.expertName?.trim() || null;

  // Günlere göre grupla — YEREL takvim günü (01:30 randevu kendi gününde kalır).
  const dayMap = new Map<string, AjandaAppointmentRow[]>();
  for (const a of appointments) {
    const k = zonedDayKey(a.appointment_date, tzOpts) || looseDayKey(a.appointment_date, tzOpts);
    const list = dayMap.get(k);
    if (list) list.push(a); else dayMap.set(k, [a]);
  }
  const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const all: ReportChild[] = [];

  all.push(...buildPremiumCover({
    title1:   "YAŞAM SİSTEMİ",
    title2:   "AJANDA RAPORU",
    subtitle: rangeLine ? `${exportLabel} · ${rangeLine}` : exportLabel,
    date:     `Oluşturulma Tarihi: ${today}`,
    stats: [
      { label: "Toplam Randevu", value: String(total) },
      { label: "Tamamlandı",     value: String(completed) },
      { label: "Bekliyor",       value: String(waiting) },
      ...(noResult > 0 ? [{ label: "Sonuç girilmedi", value: String(noResult) }] : []),
      { label: "İptal",          value: String(cancelled) },
    ],
  }));

  all.push(...buildStatsPage([
    ["Toplam Randevu",  String(total)],
    ["Tamamlandı",      String(completed)],
    ["Bekliyor",        String(waiting)],
    ...(noResult > 0 ? [["Sonuç girilmedi", String(noResult)] as [string, string]] : []),
    ["İptal",           String(cancelled)],
    ["Gün Sayısı",      String(sortedDays.length)],
    ["Kapsam",          exportLabel],
    ...(rangeLine ? [["Tarih Aralığı", rangeLine] as [string, string]] : []),
    ...(expertName ? [["Hazırlayan", expertName] as [string, string]] : []),
  ]));

  all.push(...buildTOCPage());

  all.push(h1Colored("1. Randevu Listesi", C_AJANDA, true));
  all.push(muted(`${total} randevu · ${sortedDays.length} gün`));
  all.push(spacer());

  let globalN = 0;
  sortedDays.forEach(([, dayApts], dayIdx) => {
    if (dayIdx > 0) all.push(spacer());
    all.push(h2(formatInstantDate(dayApts[0]!.appointment_date, { ...tzOpts, style: "weekdayLong" })
      || formatDateLoose(dayApts[0]!.appointment_date, tzOpts)));

    dayApts.forEach((apt) => {
      globalN++;
      const clientName = apt.client_id ? clientMap.get(apt.client_id) || "Danışan" : null;
      all.push(profileLabel(`RANDEVU #${String(globalN).padStart(3, "0")}`, C_AJANDA));
      all.push(h3(apt.title || "Görüşme"));
      all.push(twoColTable([
        ["Tarih / Saat",  formatInstantDateTime(apt.appointment_date, { ...tzOpts, fallback: "—" })],
        ["Durum",         ajandaStatusLabel(apt.status, apt.appointment_date, now)],
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

  const modeSlug = exportMode === "single" && appointments[0]
    ? `tek-${zonedDayKey(appointments[0].appointment_date, tzOpts) || "randevu"}`
    : exportMode.replace(/[^a-z]/g, "-");
  const filename = `ajanda-${modeSlug}-${dateSlug}.docx`;

  return { doc, filename };
}
