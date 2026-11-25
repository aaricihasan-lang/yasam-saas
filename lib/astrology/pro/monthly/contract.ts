// Gökyüzü Atlası — AYLIK EFEMERİS: istek doğrulama + sağlayıcı gövdesi + yanıt İZDÜŞÜMÜ (SAF; ağ çağrısı YOK).
//
// Uçlar (sağlayıcı OpenAPI 2.0.0, 2026-11-24 indirilen belge):
//   • Batı:  POST /astrology/planets/monthly                    { year, month }                              → 14 cisim, tropikal
//   • Vedik: POST /vedic-astrology/planetary-positions/monthly  { year, month, coordinateSystem: "sidereal" } → 9 graha, Lahiri sideral
// Her iki uç ayın HER GÜNÜ için 12:00 UTC konumunu TEK istekte döndürür (gün gün istek YOK). Belgedeki yıl aralığı 1551–2649; ürün
// aralığı 1600–2600'dür: bu aralıkta yerel bağımsız kontrol (JPL DE440 + ΔT tablosu) çalışır. Dışı istek atılmadan reddedilir.
//
// İzdüşüm KATIDIR: yıl/ay yankısı, gün sayısı (28/29/30/31), tarih sırası, beklenen cisimlerin her gün bir kez bulunması, boylamın
// [0,360) sonlu sayı olması, sağlayıcının kendi burç + burç-içi-derece alanının boylamla tutarlılığı ve Güney düğüm / Ketu'nun
// Kuzey düğüm / Rahu'nun tam karşısında olması denetlenir. Uymayan yanıt saklanmaz ve gösterilmez (eksik/çelişkili tablo yok).
// Bilinmeyen yeni cisim adları yok sayılır (yalnız beyaz listedeki cisimler alınır); serbest metin alanı alınmaz.

import { VEDIC_MONTHLY_BODIES, WESTERN_MONTHLY_BODIES, type MonthlyBody, type MonthlyDay, type MonthlyError, type MonthlyKind, type MonthlyRequest } from "./types";

export const MONTHLY_ENDPOINT: Readonly<Record<MonthlyKind, string>> = {
  western: "/astrology/planets/monthly",
  vedic: "/vedic-astrology/planetary-positions/monthly",
};
/** İzdüşüm/adaptör sürümü — önbellek anahtarına ve kayda girer; izdüşüm değişirse artırılmalı. */
export const MONTHLY_ADAPTER_VERSION = "monthly-ephemeris-1";
export const MONTHLY_MIN_YEAR = 1600;
export const MONTHLY_MAX_YEAR = 2600;
/** Sağlayıcı belgesindeki sınırlar (yalnız bilgi; ürün daha dar aralığı kullanır). */
export const PROVIDER_DOC_YEAR_RANGE = [1551, 2649] as const;

/** Ölçülerek doğrulanan düğüm yöntemleri (docs/astrology/pro/aylik-efemeris.md §3). */
export const MONTHLY_NODE_METHOD: Readonly<Record<MonthlyKind, "true" | "mean">> = { western: "true", vedic: "mean" };

export const bodiesOf = (kind: MonthlyKind): readonly MonthlyBody[] => (kind === "western" ? WESTERN_MONTHLY_BODIES : VEDIC_MONTHLY_BODIES);

/**
 * Ay bazında "ya hep ya hiç" cisimler: sağlayıcı Kiron'u her tarihte vermiyor (2026-11-24 ölçümü: 2600-12 yanıtında 31 günün
 * HİÇBİRİNDE Kiron yok; 1600-01 … 2100-02 aylarında her gün var). Ayın her günü varsa alınır, hiçbir günü yoksa cisim tablodan
 * çıkarılır ve sonuçta "bu ay için verilmedi" diye açıkça yazılır. Bazı günlerde var bazılarında yok → yanıt REDDEDİLİR.
 */
export const OPTIONAL_MONTHLY_BODIES: Readonly<Record<MonthlyKind, readonly MonthlyBody[]>> = { western: ["chiron"], vedic: [] };

const PROVIDER_NAME: Readonly<Record<MonthlyKind, Readonly<Record<string, MonthlyBody>>>> = {
  western: {
    Sun: "sun", Moon: "moon", Mercury: "mercury", Venus: "venus", Mars: "mars", Jupiter: "jupiter", Saturn: "saturn", Uranus: "uranus",
    Neptune: "neptune", Pluto: "pluto", "North Node": "north_node", "South Node": "south_node", Chiron: "chiron", "Black Moon Lilith": "lilith",
  },
  vedic: { Sun: "sun", Moon: "moon", Mars: "mars", Mercury: "mercury", Jupiter: "jupiter", Venus: "venus", Saturn: "saturn", Rahu: "rahu", Ketu: "ketu" },
};

const SIGNS_EN = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
/** Sağlayıcı boylam ve burç-içi dereceyi ayrı ayrı 4 ondalığa yuvarlar → tutarlılık toleransı 2 yuvarlama adımı. */
const ROUND_TOL_DEG = 0.00021;

/**
 * Cisim bazında BAĞIMSIZ DOĞRULAMA durumu (ekran + rapor tek kaynak; kayıtlı anlık görüntü değişmez, ham değer silinmez):
 *  • 10 gezegen + düğümler: her tabloda çalışma anında yerel DE440 ile kontrol edilir (crossCheck.ts).
 *  • Kiron: çalışma anında yerel motoru yok; 2026-11-24 kanıtında 1600–2100 arasındaki 9 gerçek ayda (270 gün) JPL Horizons ham ICRF
 *    vektörleri + yerel IAU 2006/2000A indirgemesiyle ≤0,22″ ölçüldü → bu yıl aralığında doğrulanmış; dışında örnek yok → doğrulanmamış.
 *    (İlk ölçümdeki 1600 "1,27″" farkı referansın IAU76/80 ekliptik çıktısından geliyordu — aynı çıktı DE440 Mars'ta da −1,07″ verir.)
 *  • Kara Ay Lilith (ortalama apoje): tanım modele bağlıdır; sağlayıcıdan bağımsız referans bulunamadı → doğrulanmamış. Varsayılan
 *    görünümde ve raporda yer almaz; kullanıcı isterse "doğrulanmamış" işaretiyle açabilir.
 */
export const CHIRON_VERIFIED_YEARS = [1600, 2100] as const;
export type BodyVerification = { verified: boolean; note: string };
export function bodyVerification(kind: MonthlyKind, body: MonthlyBody, year: number): BodyVerification {
  if (kind === "western" && body === "lilith") {
    return { verified: false, note: "Kara Ay Lilith (ortalama Ay apojesi) bağımsız bir referansla doğrulanamadı; tanım hesaplama modeline bağlıdır." };
  }
  if (kind === "western" && body === "chiron" && (year < CHIRON_VERIFIED_YEARS[0] || year > CHIRON_VERIFIED_YEARS[1])) {
    return { verified: false, note: `Kiron yalnız ${CHIRON_VERIFIED_YEARS[0]}–${CHIRON_VERIFIED_YEARS[1]} yılları arasında bağımsız olarak doğrulandı; bu dönem için doğrulama yok.` };
  }
  return { verified: true, note: "" };
}

export const daysInMonth =(year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export const monthDates = (year: number, month: number): string[] => {
  const n = daysInMonth(year, month);
  const mm = String(month).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => `${String(year).padStart(4, "0")}-${mm}-${String(i + 1).padStart(2, "0")}`);
};

export function parseMonthlyRequest(raw: unknown): { ok: true; value: MonthlyRequest } | { ok: false; error: MonthlyError } {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== "western" && kind !== "vedic") return { ok: false, error: { code: "INVALID_INPUT", field: "kind", error: "Efemeris türü geçersiz." } };
  const year = typeof r.year === "string" && /^\d{4}$/.test(r.year) ? Number(r.year) : r.year;
  const month = typeof r.month === "string" && /^\d{1,2}$/.test(r.month) ? Number(r.month) : r.month;
  if (typeof year !== "number" || !Number.isInteger(year)) return { ok: false, error: { code: "INVALID_INPUT", field: "year", error: "Yıl geçersiz." } };
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) return { ok: false, error: { code: "INVALID_INPUT", field: "month", error: "Ay geçersiz." } };
  if (year < MONTHLY_MIN_YEAR || year > MONTHLY_MAX_YEAR) return { ok: false, error: { code: "OUT_OF_RANGE", field: "year", error: `Yıl ${MONTHLY_MIN_YEAR}–${MONTHLY_MAX_YEAR} aralığında olmalı.` } };
  return { ok: true, value: { kind, year, month } };
}

/** Sağlayıcı gövdesi. Vedik ucunda koordinat sistemi AÇIKÇA "sidereal" gönderilir (varsayılana güvenilmez). */
export function monthlyProviderBody(req: MonthlyRequest): Record<string, unknown> {
  return req.kind === "western" ? { year: req.year, month: req.month } : { year: req.year, month: req.month, coordinateSystem: "sidereal" };
}

const n360 = (x: number) => ((x % 360) + 360) % 360;
const sepDeg = (a: number, b: number) => Math.abs(((((a - b) % 360) + 540) % 360) - 180);

/** Sağlayıcı yanıtı → yalnız beyaz liste sayısal alanlar. Hata metni kullanıcıya gösterilmez (yalnız kod + kısa neden günlüğe). */
export function projectMonthly(req: MonthlyRequest, raw: unknown): { ok: true; days: MonthlyDay[]; bodies: MonthlyBody[]; missingBodies: MonthlyBody[]; ignoredNames: string[] } | { ok: false; reason: string } {
  const r = raw as { year?: unknown; month?: unknown; days?: unknown } | null;
  if (!r || typeof r !== "object") return { ok: false, reason: "yanıt nesne değil" };
  if (r.year !== req.year || r.month !== req.month) return { ok: false, reason: "yıl/ay yankısı uyuşmuyor" };
  if (!Array.isArray(r.days)) return { ok: false, reason: "days dizisi yok" };
  const dates = monthDates(req.year, req.month);
  if (r.days.length !== dates.length) return { ok: false, reason: `gün sayısı ${r.days.length} ≠ ${dates.length}` };
  const names = PROVIDER_NAME[req.kind];
  const optional = OPTIONAL_MONTHLY_BODIES[req.kind];
  // İsteğe bağlı cismin bu aydaki durumu İLK günden belirlenir; sonraki her gün aynı olmalı.
  const firstNames = new Set(
    Array.isArray((r.days[0] as { positions?: unknown } | null)?.positions)
      ? ((r.days[0] as { positions: unknown[] }).positions.map((p) => names[String((p as { planet?: unknown } | null)?.planet ?? "")]).filter(Boolean) as MonthlyBody[])
      : [],
  );
  const missingBodies = optional.filter((b) => !firstNames.has(b));
  const expected = bodiesOf(req.kind).filter((b) => !missingBodies.includes(b));
  const ignored = new Set<string>();
  const out: MonthlyDay[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d = r.days[i] as { date?: unknown; positions?: unknown } | null;
    if (!d || d.date !== dates[i]) return { ok: false, reason: `tarih sırası bozuk (${i + 1}. gün)` };
    if (!Array.isArray(d.positions)) return { ok: false, reason: `${dates[i]}: positions yok` };
    const got = new Map<MonthlyBody, { lon: number; retro: boolean }>();
    for (const p of d.positions as unknown[]) {
      const q = p as { planet?: unknown; longitude?: unknown; sign?: unknown; degreeInSign?: unknown; isRetrograde?: unknown } | null;
      const name = typeof q?.planet === "string" ? q.planet : "";
      const body = names[name];
      if (!body) {
        if (name) ignored.add(name.slice(0, 40));
        continue;
      }
      if (got.has(body)) return { ok: false, reason: `${dates[i]}: ${name} iki kez` };
      const lon = q!.longitude;
      if (typeof lon !== "number" || !Number.isFinite(lon) || lon < 0 || lon >= 360) return { ok: false, reason: `${dates[i]}: ${name} boylam geçersiz` };
      if (typeof q!.isRetrograde !== "boolean") return { ok: false, reason: `${dates[i]}: ${name} retro alanı yok` };
      const si = Math.floor(lon / 30);
      const dis = q!.degreeInSign;
      // 29,99995 gibi sınır değerlerde iki alanın bağımsız yuvarlanması burcu kaydırabilir → komşu burç + 0/30 eşdeğeri de kabul.
      const signOk = q!.sign === SIGNS_EN[si] && typeof dis === "number" && Math.abs(dis - (lon - si * 30)) <= ROUND_TOL_DEG;
      const edgeOk =
        typeof dis === "number" &&
        ((q!.sign === SIGNS_EN[(si + 1) % 12] && Math.abs(dis) <= ROUND_TOL_DEG && lon - si * 30 >= 30 - ROUND_TOL_DEG) ||
          (q!.sign === SIGNS_EN[(si + 11) % 12] && Math.abs(dis - 30) <= ROUND_TOL_DEG && lon - si * 30 <= ROUND_TOL_DEG));
      if (!signOk && !edgeOk) return { ok: false, reason: `${dates[i]}: ${name} burç/derece boylamla tutarsız` };
      got.set(body, { lon, retro: q!.isRetrograde as boolean });
    }
    for (const b of expected) if (!got.has(b)) return { ok: false, reason: `${dates[i]}: ${b} eksik` };
    for (const b of missingBodies) if (got.has(b)) return { ok: false, reason: `${dates[i]}: ${b} ayın yalnız bazı günlerinde var` };
    const [north, south] = req.kind === "western" ? (["north_node", "south_node"] as const) : (["rahu", "ketu"] as const);
    if (sepDeg(got.get(south)!.lon, n360(got.get(north)!.lon + 180)) > ROUND_TOL_DEG) return { ok: false, reason: `${dates[i]}: düğüm karşıtlığı tutarsız` };
    out.push({ date: dates[i], positions: expected.map((b) => ({ body: b, lon: got.get(b)!.lon, retro: got.get(b)!.retro })) });
  }
  return { ok: true, days: out, bodies: [...expected], missingBodies, ignoredNames: [...ignored] };
}
