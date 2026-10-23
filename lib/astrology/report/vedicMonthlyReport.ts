// 2026-10-22 — Vedik aylık zamanlama Word/PDF bölümü (SAF; yalnız KAYITLI teknik veri; yeni hesap / sağlayıcı çağrısı YOK).
// report/model.ts bu modülü çağırır (paylaşılan dosyada yalnız birer satırlık ekleme). Ekrandaki yöntem / kapsam metinleriyle
// AYNI dizgeler kullanılır. Saatler hem UTC hem kayıtta seçilen gösterim saat diliminde (olay başına ofset) basılır.

import {
  ASPECT_VS_DRISHTI_TEXT,
  ASPECT_ZODIAC_TEXT,
  DECLINATION_TEXT,
  DECLINATION_TYPE_LABELS,
  MONTHLY_GRAHA_TR,
  NATAL_DECLINATION_TEXT,
  PARALLELS_SAMPLING_TEXT,
  STATION_TEXT,
  VEDIC_MONTHLY_METHOD_TEXT,
  VEDIC_MONTHLY_SECTION_LABELS,
  VEDIC_MONTHLY_SECTIONS,
  VEDIC_MONTHLY_WINDOW_TEXT,
  fmtDeclination,
  monthlyAspectLabel,
  monthlySignTr,
  monthlySummary,
  type VedicMonthlySection,
  type VedicMonthlyTechnical,
} from "../model/vedicMonthly";
import type { VedicGrahaId } from "../model/vedic";
import { formatInZone } from "../transitDetail";

export type MonthlyReportBuilder = {
  h(level: 1 | 2 | 3, text: string): void;
  p(text: string, tone?: "muted" | "warn"): void;
  kv(rows: [string, string][]): void;
  table(columns: string[], rows: string[][], opts?: { widths?: number[]; caption?: string; compact?: boolean; empty?: string }): void;
};
type O = Record<string, unknown>;
const DASH = "—";
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v);
const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const g = (id: unknown) => (typeof id === "string" && id in MONTHLY_GRAHA_TR ? MONTHLY_GRAHA_TR[id as VedicGrahaId] : DASH);
const deg = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(d).replace(".", ",")}°` : DASH);
const utcL = (at: string) => `${at.slice(8, 10)}.${at.slice(5, 7)}.${at.slice(0, 4)} ${at.slice(11, 16)}`;
const localL = (at: string, tz: string | null) => (tz && tz !== "UTC" ? (formatInZone(at, tz)?.text ?? DASH) : DASH);
const lonL = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? `${monthlySignTr(["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"][Math.floor(v / 30) % 12])} ${deg(v % 30)}` : DASH);

export function vedicMonthlyReport(b: MonthlyReportBuilder, tech: O, opts: O): void {
  const t = tech as unknown as VedicMonthlyTechnical;
  const tz = typeof opts.displayTz === "string" ? opts.displayTz : null;
  const w = isObj(t.window) ? t.window : null;
  const sections = (Array.isArray(t.sections) ? t.sections : []).filter((s): s is VedicMonthlySection => (VEDIC_MONTHLY_SECTIONS as readonly unknown[]).includes(s));
  b.h(2, "Vedik aylık zamanlama");
  b.kv([
    ["Ay", w && w.month >= 1 && w.month <= 12 ? `${TR_MONTHS[w.month - 1]} ${w.year} (UTC takvim ayı)` : DASH],
    ["Zodyak", "Sidereal (nirayana) · Lahiri"],
    ["Gösterim saat dilimi", tz ?? "UTC"],
    ["Seçilen bölümler", sections.length ? sections.map((s) => VEDIC_MONTHLY_SECTION_LABELS[s]).join(" · ") : DASH],
  ]);
  b.p(VEDIC_MONTHLY_METHOD_TEXT, "muted");
  b.p(VEDIC_MONTHLY_WINDOW_TEXT, "muted");
  const missing = (Array.isArray(t.missing) ? t.missing : []).filter((s) => (VEDIC_MONTHLY_SECTIONS as readonly unknown[]).includes(s));
  if (missing.length) b.p(`Bu kayıtta gösterilmeyen bölüm: ${missing.map((s) => VEDIC_MONTHLY_SECTION_LABELS[s]).join(", ")} (bölüm hesaplanamadı ya da doğum saati bilinmiyor).`, "warn");

  // Aylık özet (türetilmiş sayım; yeni hesap değil)
  const sm = monthlySummary(t);
  b.h(3, "Aylık özet");
  b.kv([
    ["Burç girişi", `${sm.counts.ingress} (Ay ${sm.moonIngresses}; diğer gezegenler ${sm.keyIngresses.length}; geri hareketle ${sm.retroIngresses})`],
    ["Gezegenler arası açı", `${sm.counts.aspect} (majör ${sm.majorAspects} · minör ${sm.minorAspects})`],
    ["Ay açısı", String(sm.counts.lunar)],
    ["Deklinasyon olayı", `${sm.counts.parallel} (paralel ${sm.parallels} · kontraparalel ${sm.contraparallels})`],
  ]);
  if (sm.keyIngresses.length) b.p(`Ay dışındaki burç girişleri: ${sm.keyIngresses.map((e) => `${g(e.planet)} ${monthlySignTr(e.to)} (${utcL(e.atUtc)} UTC${e.retrograde && e.planet !== "rahu" && e.planet !== "ketu" ? ", geri" : ""})`).join(" · ")}`);

  const ztag = tz && tz !== "UTC" ? `Yerel (${tz})` : "Yerel";
  if (t.ingress) {
    b.h(3, "Ay başı konumları (1. gün 00:00 UTC)");
    b.table(["Graha", "Burç ve derece", "Boylam"], t.ingress.start.map((s) => [g(s.planet), `${monthlySignTr(s.sign)} ${deg(s.longitude % 30)}`, deg(s.longitude, 4)]), { widths: [1.4, 2, 1.4], compact: true });
    b.h(3, VEDIC_MONTHLY_SECTION_LABELS.ingress);
    b.table(
      ["UTC", ztag, "Graha", "Geçiş", "Hareket"],
      t.ingress.events.map((e) => [utcL(e.atUtc), localL(e.atUtc, tz), g(e.planet), `${monthlySignTr(e.from)} → ${monthlySignTr(e.to)}`, e.retrograde ? "geri" : "ileri"]),
      { widths: [1.5, 1.5, 1.1, 2.2, 0.8], compact: true, empty: "Bu ay burç girişi yok." },
    );
    b.p(STATION_TEXT, "muted");
  }
  if (t.aspects || t.lunar) {
    b.p(ASPECT_VS_DRISHTI_TEXT, "warn");
    b.p(ASPECT_ZODIAC_TEXT, "muted");
  }
  if (t.aspects) {
    b.h(3, VEDIC_MONTHLY_SECTION_LABELS.aspects);
    b.table(
      ["UTC", ztag, "Gezegenler", "Astronomik açı", "Orb", "Boylamlar (sidereal)"],
      t.aspects.events.map((e) => [utcL(e.atUtc), localL(e.atUtc, tz), `${g(e.a)} – ${g(e.b)}`, monthlyAspectLabel(e.aspect), deg(e.orb), `${lonL(e.lonA)} / ${lonL(e.lonB)}`]),
      { widths: [1.3, 1.3, 1.6, 2, 0.6, 2.2], compact: true, empty: "Bu ay gezegenler arası açı kesinleşmesi yok." },
    );
  }
  if (t.lunar) {
    b.h(3, VEDIC_MONTHLY_SECTION_LABELS.lunar);
    b.table(
      ["UTC", ztag, "Gezegen", "Astronomik açı", "Orb"],
      t.lunar.events.map((e) => [utcL(e.atUtc), localL(e.atUtc, tz), g(e.planet), monthlyAspectLabel(e.aspect), deg(e.orb)]),
      { widths: [1.4, 1.4, 1.2, 2.4, 0.7], compact: true, empty: "Bu ay Ay açısı yok." },
    );
  }
  if (t.parallels || t.natalParallels) b.p(DECLINATION_TEXT, "muted");
  if (t.parallels) {
    b.h(3, VEDIC_MONTHLY_SECTION_LABELS.parallels);
    b.p(PARALLELS_SAMPLING_TEXT, "muted");
    b.table(
      ["Tarih (UTC)", "Gezegenler", "Tür", "Deklinasyonlar", "Orb"],
      t.parallels.events.map((e) => [utcL(e.atUtc), `${g(e.a)} – ${g(e.b)}`, DECLINATION_TYPE_LABELS[e.type], `${fmtDeclination(e.decA)} / ${fmtDeclination(e.decB)}`, deg(e.orb)]),
      { widths: [1.4, 1.6, 1.2, 1.8, 0.7], compact: true, empty: "Bu ay deklinasyon paraleli yok." },
    );
  }
  if (t.natalParallels) {
    const n = t.natalParallels;
    b.h(3, VEDIC_MONTHLY_SECTION_LABELS.natal_parallels);
    b.p(NATAL_DECLINATION_TEXT, "muted");
    b.kv([["Doğum anı (yerel)", `${n.atLocal.slice(8, 10)}.${n.atLocal.slice(5, 7)}.${n.atLocal.slice(0, 4)} ${n.atLocal.slice(11, 16)}`], ["Orb", deg(n.orb, 1)]]);
    b.table(["Gezegen", "Deklinasyon", "Sağ açıklık"], n.planets.map((p) => [g(p.id), fmtDeclination(p.declination), deg(p.rightAscension)]), { widths: [1.4, 1.4, 1.4], compact: true });
    b.table(
      ["Gezegenler", "Tür", "Deklinasyonlar", "Orb"],
      n.parallels.map((p) => [`${g(p.a)} – ${g(p.b)}`, DECLINATION_TYPE_LABELS[p.type], `${fmtDeclination(p.decA)} / ${fmtDeclination(p.decB)}`, deg(p.orb)]),
      { widths: [1.8, 1.2, 1.8, 0.7], compact: true, empty: "Doğum anında orb içinde paralel / kontraparalel yok." },
    );
  }
}
