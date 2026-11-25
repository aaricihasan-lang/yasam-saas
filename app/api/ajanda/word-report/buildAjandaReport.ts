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
  fieldInline,
  h3,
  muted,
  profileLabel,
  ReportChild,
  spacer,
  twoColTable,
} from "@/lib/docx/reportHelpers";
import { buildStaticTocPage, StaticTocCollector } from "@/lib/docx/premiumToc";
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
import { sourceReportLocale, type ReportLocale } from "@/lib/i18n/reportLocale";

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

/** Kanonik randevu durumu (DB değeri + türetilmiş "sonuç girilmedi"); etiketi dile göre `ajandaStatusLabel`. */
export type AjandaStatusKey = "completed" | "cancelled" | "noResult" | "waiting";

/** Durum anahtarı — HESAP dilden bağımsız: geçmiş + bekliyor → noResult (türetilmiş; DB değişmez). */
export function ajandaStatusKey(status: string | null, appointmentDate: string, now: Date): AjandaStatusKey {
  if (status === "tamamlandi") return "completed";
  if (status === "iptal") return "cancelled";
  const at = toInstant(appointmentDate);
  if (at && at.getTime() < now.getTime()) return "noResult";
  return "waiting";
}

/** Randevu durum etiketi. Geçmiş + bekliyor → "Sonuç girilmedi" (türetilmiş; DB değişmez). `output` yoksa TR. */
export function ajandaStatusLabel(status: string | null, appointmentDate: string, now: Date, output?: ReportLocale | null): string {
  return (output ?? sourceReportLocale()).t("reports.agenda")(`status.${ajandaStatusKey(status, appointmentDate, now)}`);
}

export type AjandaReportInput = {
  appointments: AjandaAppointmentRow[];
  clientMap: Map<string, string>;
  exportMode: AjandaExportMode;
  dateRange?: { start: string; end: string };
  expertName?: string | null;
  now?: Date;
  timeZone?: string;
  /** I18N çıktı dili (route `resolveReportLocale`); verilmezse TR = bugünkü çıktı (golden). */
  output?: ReportLocale | null;
};

export function buildAjandaReportDoc(input: AjandaReportInput): { doc: Document; filename: string } {
  const { appointments, clientMap, exportMode, dateRange } = input;
  const now = input.now ?? new Date();
  const rl = input.output ?? sourceReportLocale();
  const t = rl.t("reports.agenda");
  // TR'de `locale` verilmez → reportTime varsayılanı (tr-TR) → bayt-bayt aynı.
  const tzOpts = rl.isSource ? { timeZone: input.timeZone } : { timeZone: input.timeZone, locale: rl.intlTag };

  const today = reportGeneratedLabel(tzOpts, now);
  const dateSlug = reportFileDate(tzOpts, now);

  // İstatistikler
  const total = appointments.length;
  const completed = appointments.filter((a) => a.status === "tamamlandi").length;
  const cancelled = appointments.filter((a) => a.status === "iptal").length;
  const noResult = appointments.filter(
    (a) => ajandaStatusKey(a.status, a.appointment_date, now) === "noResult",
  ).length;
  const waiting = total - completed - cancelled - noResult;

  const modeLabels: Record<string, string> = {
    all: t("mode.all"),
    selected: t("mode.selected"),
    filtered: t("mode.filtered"),
    weekly: t("mode.weekly"),
    monthly: t("mode.monthly"),
    single: appointments[0]?.title ? t("mode.singleWithTitle", { title: appointments[0].title }) : t("mode.single"),
  };
  const exportLabel = modeLabels[exportMode] ?? t("mode.fallback");

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
    title1:   t("brand"),
    title2:   t("coverTitle"),
    subtitle: rangeLine ? `${exportLabel} · ${rangeLine}` : exportLabel,
    date:     t("generatedOn", { date: today }),
    stats: [
      { label: t("stats.total"),     value: String(total) },
      { label: t("stats.completed"), value: String(completed) },
      { label: t("stats.waiting"),   value: String(waiting) },
      ...(noResult > 0 ? [{ label: t("stats.noResult"), value: String(noResult) }] : []),
      { label: t("stats.cancelled"), value: String(cancelled) },
    ],
  }));

  all.push(...buildStatsPage([
    [t("stats.total"),     String(total)],
    [t("stats.completed"), String(completed)],
    [t("stats.waiting"),   String(waiting)],
    ...(noResult > 0 ? [[t("stats.noResult"), String(noResult)] as [string, string]] : []),
    [t("stats.cancelled"), String(cancelled)],
    [t("stats.days"),      String(sortedDays.length)],
    [t("stats.scope"),     exportLabel],
    ...(rangeLine ? [[t("stats.dateRange"), rangeLine] as [string, string]] : []),
    ...(expertName ? [[rl.common.preparedBy, expertName] as [string, string]] : []),
  ], undefined, rl.common));

  // İçindekiler: eski boş Word TOC alanı yerine STATİK + tıklanabilir girişler (gövde
  // başlıklarından toplanır, gövde bittikten sonra bu konuma yerleştirilir).
  const toc = new StaticTocCollector("ajd");
  const tocAt = all.length;

  all.push(toc.h1Colored(t("listHeading"), C_AJANDA, true));
  all.push(muted(t("listSummary", { total: String(total), count: total, days: String(sortedDays.length), dayCount: sortedDays.length })));
  all.push(spacer());

  let globalN = 0;
  sortedDays.forEach(([, dayApts], dayIdx) => {
    if (dayIdx > 0) all.push(spacer());
    all.push(toc.h2(formatInstantDate(dayApts[0]!.appointment_date, { ...tzOpts, style: "weekdayLong" })
      || formatDateLoose(dayApts[0]!.appointment_date, tzOpts)));

    dayApts.forEach((apt) => {
      globalN++;
      const clientName = apt.client_id ? clientMap.get(apt.client_id) || t("unknownClient") : null;
      all.push(profileLabel(t("itemLabel", { n: String(globalN).padStart(3, "0") }), C_AJANDA));
      all.push(h3(apt.title || t("defaultTitle")));
      all.push(twoColTable([
        [t("fields.dateTime"), formatInstantDateTime(apt.appointment_date, { ...tzOpts, fallback: "—" })],
        [t("fields.status"),   ajandaStatusLabel(apt.status, apt.appointment_date, now, rl)],
        [t("fields.type"),     clientName ? t("type.client") : t("type.general")],
        ...(clientName ? [[t("fields.client"), clientName] as [string, string]] : []),
      ]));
      if (apt.notes?.trim()) {
        all.push(fieldInline(t("fields.note"), apt.notes.trim().slice(0, 300)));
      }
    });
  });

  all.splice(tocAt, 0, ...buildStaticTocPage(toc.entries, rl.common));

  const styles = rl.docxStyles();
  const doc = new Document({
    ...toc.documentOptions(),
    ...(styles ? { styles } : {}),
    sections: [{
      properties: {},
      footers: { default: buildFooter(t("footer", { scope: exportLabel }), { common: rl.common }) },
      children: all,
    }],
  });

  // Dosya adı: yalnız sistem kısmı dilde (TR birebir: ajanda-<kip>-<tarih>, tek → tek-<gün>).
  const modeSlug = exportMode === "single" && appointments[0]
    ? `${t("file.single")}-${zonedDayKey(appointments[0].appointment_date, tzOpts) || t("file.singleFallback")}`
    : exportMode.replace(/[^a-z]/g, "-");
  const filename = `${t("file.base")}-${modeSlug}-${dateSlug}.docx`;

  return { doc, filename };
}
