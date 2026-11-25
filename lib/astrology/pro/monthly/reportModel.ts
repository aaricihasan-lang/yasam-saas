// Gökyüzü Atlası — AYLIK EFEMERİS Word / PDF rapor MODELİ (SAF). Word ve PDF bu TEK modelden çizilir → bütün teknik değerler birebir
// aynıdır (hücre metinleri ekrandaki biçimleyiciyle — format.ts — üretilir). Natal çark ya da başka görsel YOKTUR (tablo raporu).

import { bodyVerification } from "./contract";
import { bodyHeader, bodyName, bodyGlyph, cellParts, dayLabel, kindLabel, methodLines, MONTH_NAMES_TR, periodLabel } from "./format";
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

const SIGN_LEGEND = "Burçlar: ♈ Koç · ♉ Boğa · ♊ İkizler · ♋ Yengeç · ♌ Aslan · ♍ Başak · ♎ Terazi · ♏ Akrep · ♐ Yay · ♑ Oğlak · ♒ Kova · ♓ Balık. ℞ geri (retro) hareket.";
const trDateTime = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d) + " (TSİ)";
};

export function buildMonthlyReport(e: MonthlyEphemeris, opts: { generatedAt: string; saved?: { title: string; savedAt: string; methodologyVersion: string } | null }): MonthlyReport {
  const mm = String(e.month).padStart(2, "0");
  // Doğrulanmamış cisimler (Lilith; aralık dışı Kiron) rapora GİRMEZ; ham değer kayıtta kalır. Künye satırında açıkça yazılır.
  const bodies = e.bodies.filter((b) => bodyVerification(e.kind, b, e.year).verified);
  const excluded = e.bodies.filter((b) => !bodyVerification(e.kind, b, e.year).verified);
  const cc = e.crossCheck;
  const meta: [string, string][] = [
    ["Efemeris türü", kindLabel(e.kind)],
    ["Dönem", `${periodLabel(e.year, e.month)} (${e.days.length} gün)`],
    ["Zodyak", e.zodiac === "tropical" ? "Tropikal (Batı)" : "Sideral / Nirayana (Vedik)"],
    ["Ayanamsa", e.ayanamsa === "lahiri" ? "Lahiri (bu tablonun tek ayanamsası)" : "Uygulanmaz (tropikal zodyak)"],
    ["Hesaplama saati", "Her gün 12.00 UTC (günlük örnek; kesin geçiş saati değildir)"],
    ["Ay düğümü", e.kind === "western" ? "Gerçek (oskülasyon) düğüm" : "Ortalama düğüm (Rahu); Ketu tam karşısı"],
    ["Veri kaynağı", "Yaşam Sistemi hesaplama altyapısı — aylık efemeris (ayın tamamı tek hesap)"],
    [
      "Bağımsız kontrol",
      cc.status === "pass"
        ? `NASA/JPL DE440 yerel hesabı: ${cc.compared} değer, en büyük fark ${String(cc.maxAbsArcsec).replace(".", ",")}″, retro uyuşmazlığı ${cc.retroMismatches}`
        : cc.status === "unavailable"
          ? "Bu tablo için yapılamadı"
          : "Başarısız",
    ],
    ["Yöntem sürümü", opts.saved?.methodologyVersion ?? e.source.adapterVersion],
    ["Hesaplandı", trDateTime(e.source.fetchedAt)],
  ];
  if (excluded.length) meta.push(["Raporda yer almayan", `${excluded.map((b) => bodyName(e.kind, b)).join(", ")} — bağımsız olarak doğrulanmadı (ham değer kayıtta saklıdır)`]);
  if (opts.saved) meta.push(["Kayıt", `${opts.saved.title} · ${trDateTime(opts.saved.savedAt)}`]);
  meta.push(["Rapor tarihi", trDateTime(opts.generatedAt)]);
  const legend = `Gök cisimleri: ${bodies.map((b) => `${bodyGlyph(e.kind, b)} ${bodyName(e.kind, b)}`).join(" · ")}. ${SIGN_LEGEND}`;
  return {
    fileBase: `efemeris-${e.kind === "western" ? "bati-tropikal" : "vedik-sideral"}-${e.year}-${mm}`,
    title: `Aylık Efemeris — ${kindLabel(e.kind)}`,
    subtitle: `${MONTH_NAMES_TR[e.month - 1]} ${e.year} · günlük konumlar 12.00 UTC`,
    meta,
    legend,
    columns: ["Gün", ...bodies.map((b) => bodyHeader(e.kind, b))],
    rows: e.days.map((d) => ({
      day: dayLabel(d.date),
      cells: bodies.map((b) => {
        const p = d.positions.find((x) => x.body === b)!;
        const c = cellParts(p);
        return { top: `${c.signGlyph} ${c.signName}`, bottom: `${c.degMin}${c.retro ? " ℞" : ""}` };
      }),
    })),
    notes: methodLines(e),
  };
}
