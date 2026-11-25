/**
 * I18N mod-g / ATLAS-E — Aylık efemeris gösterim katmanı vaka seti (yalnız test; ağ / DB / sağlayıcı / DE440 YOK).
 *
 * Sentetik (deterministik) MonthlyEphemeris nesneleri üretir ve gösterim katmanının (format.ts, contract.bodyVerification,
 * reportModel, Word belge metni, hata metinleri, ekran ilk çizimi) BÜTÜN kullanıcıya görünen çıktısını tek bir JSON'a toplar.
 * Taban (fixtures/i18n/monthly-ephemeris-tr-taban.json) ÇEVİRİ ÖNCESİ kodla (26f217b9b) üretildi; atlas-monthly-i18n harness'ı
 * aynı vakaları TR ile yeniden üretip bayt-bayt karşılaştırır, EN ile üretip Türkçe harf / ham anahtar / sayısal fark arar.
 * Değerler hesap DEĞİLDİR (sentetik boylamlar); amaç yalnız gösterimdir.
 */
import type { MonthlyBody, MonthlyCrossCheck, MonthlyEphemeris, MonthlyKind } from "@/lib/astrology/pro/monthly/types";
import { VEDIC_MONTHLY_BODIES, WESTERN_MONTHLY_BODIES } from "@/lib/astrology/pro/monthly/types";

export const FIXED_NOW_ISO = "2026-11-25T09:41:00.000Z";

const SPEED: Record<string, number> = {
  sun: 0.9856, moon: 13.1764, mercury: -1.2311, venus: 1.2075, mars: 0.5240, jupiter: -0.0831, saturn: 0.0334, uranus: -0.0412,
  neptune: 0.0061, pluto: 0.0039, north_node: -0.0529, south_node: -0.0529, chiron: 0.0198, lilith: 0.1114, rahu: -0.0529, ketu: -0.0529,
};
const BASE: Record<string, number> = {
  sun: 218.3333, moon: 359.9, mercury: 29.995, venus: 59.9999, mars: 89.4567, jupiter: 120.0001, saturn: 149.99, uranus: 180.5,
  neptune: 209.75, pluto: 239.25, north_node: 270.0, south_node: 90.0, chiron: 300.1234, lilith: 330.75, rahu: 270.0, ketu: 90.0,
};
const r4 = (x: number) => Math.round((((x % 360) + 360) % 360) * 10_000) / 10_000;

function days(year: number, month: number): string[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => `${String(year).padStart(4, "0")}-${mm}-${String(i + 1).padStart(2, "0")}`);
}

export function synthMonthly(kind: MonthlyKind, year: number, month: number, o: { missing?: MonthlyBody[]; cc?: Partial<MonthlyCrossCheck> } = {}): MonthlyEphemeris {
  const all = (kind === "western" ? WESTERN_MONTHLY_BODIES : VEDIC_MONTHLY_BODIES) as readonly MonthlyBody[];
  const missing = o.missing ?? [];
  const bodies = all.filter((b) => !missing.includes(b));
  const off = kind === "vedic" ? -24.1 : 0;
  const dd = days(year, month).map((date, i) => ({
    date,
    positions: bodies.map((b) => ({ body: b, lon: r4(BASE[b] + off + SPEED[b] * i), retro: SPEED[b] < 0 })),
  }));
  const cc: MonthlyCrossCheck = {
    status: "pass",
    compared: dd.length * (kind === "western" ? 11 : 8),
    maxAbsArcsec: 0.17,
    maxAt: { date: dd[0].date, body: "moon" },
    retroMismatches: 0,
    retroStationSkipped: 2,
    checkedBodies: [],
    uncheckedBodies: kind === "western" ? (["chiron", "lilith"] as MonthlyBody[]).filter((b) => !missing.includes(b)) : [],
    method: "",
    ...o.cc,
  };
  return {
    kind,
    year,
    month,
    zodiac: kind === "western" ? "tropical" : "sidereal",
    ayanamsa: kind === "western" ? null : "lahiri",
    nodeMethod: kind === "western" ? "true" : "mean",
    timeOfDay: "12:00",
    timeReference: "UTC",
    bodies,
    missingBodies: missing,
    days: dd,
    source: { id: "provider", endpoint: `/synthetic/${kind}`, adapterVersion: "monthly-ephemeris-1", providerApiVersion: "v-test", fetchedAt: "2026-11-24T21:07:33.000Z" },
    crossCheck: cc,
  };
}

/** Vaka seti: Batı/Vedik · PASS / yapılamadı (nedenli / nedensiz) / başarısız · ΔT notu · Kiron doğrulama sınırı · eksik cisim · 2016 TSİ sınırı. */
export function monthlyCases(): { name: string; e: MonthlyEphemeris; saved: { title: string; savedAt: string; methodologyVersion: string } | null }[] {
  return [
    { name: "bati-2026-11-pass", e: synthMonthly("western", 2026, 11), saved: { title: "Efemeris · Batı (Tropikal) · Kasım 2026", savedAt: "2026-11-25T08:00:00.000Z", methodologyVersion: "monthly-ephemeris-1@test" } },
    { name: "vedik-2024-02-pass", e: synthMonthly("vedic", 2024, 2), saved: null },
    { name: "bati-2150-03-kiron-dogrulanmamis-yapilamadi", e: synthMonthly("western", 2150, 3, { cc: { status: "unavailable", compared: 0, maxAbsArcsec: 0, maxAt: null, reason: "Yerel bağımsız motor DE440 değil; kontrol yapılamaz." } }), saved: null },
    { name: "vedik-2600-12-basarisiz-deltat", e: synthMonthly("vedic", 2600, 12, { cc: { status: "fail", maxAbsArcsec: 12.5, retroMismatches: 1 } }), saved: { title: "Uzak gelecek", savedAt: "2026-11-25T08:30:00.000Z", methodologyVersion: "m" } },
    { name: "bati-2600-12-eksik-kiron-nedensiz", e: synthMonthly("western", 2600, 12, { missing: ["chiron"], cc: { status: "unavailable", compared: 0, maxAbsArcsec: 0, maxAt: null } }), saved: null },
    { name: "bati-1900-02-tsi-oncesi", e: synthMonthly("western", 1900, 2, { cc: { uncheckedBodies: [] } }), saved: null },
    { name: "bati-2016-10-tsi-siniri", e: synthMonthly("western", 2016, 10, { cc: { maxAbsArcsec: 0.05 } }), saved: null },
    { name: "vedik-2016-09-tsi-oncesi", e: synthMonthly("vedic", 2016, 9), saved: null },
  ];
}

/** Bağımsız kontrol nedenleri (crossCheck.ts'nin kayda / önbelleğe yazdığı TR metinler). */
export const CROSSCHECK_REASON_SAMPLES = [
  "Yerel bağımsız motor DE440 değil; kontrol yapılamaz.",
  "Yerel bağımsız efemeris verisi bu sunucuda kullanılamıyor; kontrol yapılamadı.",
  "Yerel bağımsız hesap bu tarih için geçerli sonuç vermedi; kontrol yapılamadı.",
  "Yerel bağımsız hesap bu tarih için yapılamadı; kontrol yapılamadı.",
  "Karşılaştırılacak değerler eksik; kontrol yapılamadı.",
] as const;

export const LON_SAMPLES = [0, 0.0166, 0.0167, 23.4, 29.99995, 59.9999, 60, 123.4567, 189.0001, 270.5, 359.9999] as const;
export const YM_SAMPLES = [[1600, 1], [1900, 2], [2016, 9], [2016, 10], [2026, 11], [2060, 1], [2100, 2], [2150, 3], [2600, 12]] as const;
