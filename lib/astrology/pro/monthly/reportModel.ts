// Gökyüzü Atlası — AYLIK EFEMERİS Word / PDF rapor MODELİ (SAF). Word ve PDF bu TEK modelden çizilir → bütün teknik değerler birebir
// aynıdır (hücre metinleri ekrandaki biçimleyiciyle — format.ts — üretilir). Natal çark ya da başka görsel YOKTUR (tablo raporu).
// I18N-F1-R5 (ATLAS-E): rapor dili = ekran dili (Owner kararı A3; rota `opts.text` verir). Verilmezse kaynak dil (tr) — Türkçe rapor
// çeviri öncesiyle bayt-bayt aynı. Kullanıcı içeriği (kayıt başlığı) çevrilmez. Değerler (burç/derece/boylam) dilden bağımsızdır.

import { bodyVerification } from "./contract";
import { bodyHeader, bodyName, bodyGlyph, cellParts, dayLabel, decimalText, kindLabel, methodLines, periodLabel } from "./format";
import { SOURCE_TEXT, type MonthlyText } from "./text";
import type { MonthlyEphemeris } from "./types";

export type MonthlyReportCell = { top: string; bottom: string };
export type MonthlyReport = {
  fileBase: string;
  title: string;
  subtitle: string;
  meta: [string, string][];
  legend: string;
  columns: string[];
  rows: { day: string; cells: MonthlyReportCell[] }[];
  notes: string[];
};

/**
 * Rapor zaman damgası: Europe/Istanbul duvar saati + bölge etiketi. tr "25.11.2026 12:41 (TSİ)" · en "25/11/2026, 12:41 (UTC+3)".
 * EN etiketi: IANA Europe/Istanbul 2016-09-07'den beri sabit UTC+3 (tzdb kısaltması "+03"; "TRT" tzdb kısaltması değildir) ve damgalar
 * (hesap / kayıt / rapor anı) her zaman bu tarihten sonradır; ekranın "12:00 UTC" diliyle tutarlı olsun diye "UTC+3".
 */
const reportDateTime = (iso: string, L: MonthlyText) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const date = new Intl.DateTimeFormat(L.locale === "en" ? "en-GB" : "tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
  return L.t("report.dateTime", { date, tz: L.t("report.tz") });
};

export function buildMonthlyReport(e: MonthlyEphemeris, opts: { generatedAt: string; saved?: { title: string; savedAt: string; methodologyVersion: string } | null; text?: MonthlyText }): MonthlyReport {
  const L = opts.text ?? SOURCE_TEXT;
  const mm = String(e.month).padStart(2, "0");
  // Doğrulanmamış cisimler (Lilith; aralık dışı Kiron) rapora GİRMEZ; ham değer kayıtta kalır. Künye satırında açıkça yazılır.
  const bodies = e.bodies.filter((b) => bodyVerification(e.kind, b, e.year).verified);
  const excluded = e.bodies.filter((b) => !bodyVerification(e.kind, b, e.year).verified);
  const cc = e.crossCheck;
  const meta: [string, string][] = [
    [L.t("report.metaKind"), kindLabel(e.kind, L)],
    [L.t("report.metaPeriod"), L.t("report.metaPeriodValue", { period: periodLabel(e.year, e.month, L), n: String(e.days.length) })],
    [L.t("report.metaZodiac"), L.t(e.zodiac === "tropical" ? "report.zodiacTropical" : "report.zodiacSidereal")],
    [L.t("report.metaAyanamsa"), L.t(e.ayanamsa === "lahiri" ? "report.ayanamsaLahiri" : "report.ayanamsaNone")],
    [L.t("report.metaTime"), L.t("report.timeValue")],
    [L.t("report.metaNode"), L.t(e.kind === "western" ? "report.nodeTrue" : "report.nodeMean")],
    [L.t("report.metaSource"), L.t("report.sourceValue")],
    [
      L.t("report.metaCheck"),
      cc.status === "pass"
        ? L.t("report.checkPass", { compared: String(cc.compared), max: decimalText(cc.maxAbsArcsec, L), retro: String(cc.retroMismatches) })
        : cc.status === "unavailable"
          ? L.t("report.checkUnavailable")
          : L.t("report.checkFailed"),
    ],
    [L.t("report.metaVersion"), opts.saved?.methodologyVersion ?? e.source.adapterVersion],
    [L.t("report.metaComputed"), reportDateTime(e.source.fetchedAt, L)],
  ];
  if (excluded.length) meta.push([L.t("report.metaExcluded"), L.t("report.excludedValue", { bodies: excluded.map((b) => bodyName(e.kind, b, L)).join(", ") })]);
  if (opts.saved) meta.push([L.t("report.metaRecord"), `${opts.saved.title} · ${reportDateTime(opts.saved.savedAt, L)}`]);
  meta.push([L.t("report.metaReportDate"), reportDateTime(opts.generatedAt, L)]);
  const legend = `${L.t("report.bodiesLegend", { list: bodies.map((b) => `${bodyGlyph(e.kind, b)} ${bodyName(e.kind, b, L)}`).join(" · ") })} ${L.t("report.signLegend")}`;
  return {
    fileBase: `${L.t(e.kind === "western" ? "report.fileWestern" : "report.fileVedic")}-${e.year}-${mm}`,
    title: L.t("report.title", { kind: kindLabel(e.kind, L) }),
    subtitle: L.t("report.subtitle", { period: periodLabel(e.year, e.month, L) }),
    meta,
    legend,
    columns: [L.t("report.dayCol"), ...bodies.map((b) => bodyHeader(e.kind, b, L))],
    rows: e.days.map((d) => ({
      day: dayLabel(d.date, L),
      cells: bodies.map((b) => {
        const p = d.positions.find((x) => x.body === b)!;
        const c = cellParts(p, L);
        return { top: `${c.signGlyph} ${c.signName}`, bottom: `${c.degMin}${c.retro ? " ℞" : ""}` };
      }),
    })),
    notes: methodLines(e, L),
  };
}
