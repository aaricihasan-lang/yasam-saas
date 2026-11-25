// Gökyüzü Atlası — AYLIK EFEMERİS: BAĞIMSIZ KONTROL (yalnız sunucu; JPL DE440 veri dosyasını okur).
//
// Sağlayıcının her gün 12:00 UTC boylamı, AYNI anda Yaşam Sistemi yerel konum motoruyla (lib/astrology/pro/ephemeris/local.ts:
// değiştirilmemiş resmî NASA/JPL DE440 kerneli + IAU 2006/2000A indirgeme; sağlayıcıdan bağımsız kod ve veri) karşılaştırılır.
//
// TOLERANSLAR (2026-11-24, ücretli doğrulama çağrılarından ÖNCE sabitlendi; sonuçlara göre DEĞİŞTİRİLMEZ):
//   |Δboylam| ≤ TABAN + ΔT terimi
//   • TABAN — Batı 1,0″: sağlayıcı boylamı 4 ondalık (yuvarlama ≤0,18″) + DE440 konum sınırı (≤0,1″; Ay 1600–1799 ≤0,3″) + pay.
//             Vedik 1,5″: Batı tabanı + ayanamsa tanım farkı (sağlayıcı Lahiri ↔ yerel ICRC-1956 Lahiri; kayıtlı yanıtlarda ≈0,22″) + pay.
//   • ΔT terimi — satır anı UTC'dir, konum TT'de hesaplanır: 1961–2027-06 arası 0; öncesi/sonrası ΔT belirsizliği (accuracy.ts
//             `deltaTUncertaintySec`) × cismin en büyük hızı (`deltaTPositionArcsec`). Sağlayıcı ile yerel motor farklı ΔT modeli
//             kullanabilir; bu fark ölçülür ve raporda AYRICA gösterilir (gizlenmez).
//   • Retro bayrağı — yerel anlık hızın işaretiyle aynı olmalı; |hız| < istasyon eşiği (2″/gün) olan gün "istasyon" sayılır ve
//             karşılaştırılmaz (yön ölçü sınırında belirsizdir). Retro başlangıç/bitiş anı TÜRETİLMEZ.
// Karşılaştırılan cisimler: Batı 10 gezegen + Kuzey Ay Düğümü (gerçek düğüm); Vedik 7 graha + Rahu (ortalama düğüm, sideral Lahiri).
// Güney düğüm / Ketu, Kuzey düğüm / Rahu'nun tam karşıtı olarak izdüşümde denetlenir. Kiron ve Kara Ay Lilith'in yerel bağımsız
// motoru YOKTUR → "kontrol dışı" olarak açıkça işaretlenir (test paketinde Kiron ayrıca JPL Horizons ile ölçülür).
import "server-only";
import { assertServerOnly } from "@/lib/server/serverOnlyGuard";
import { deltaTPositionArcsec, deltaTUncertaintySec } from "../ephemeris/accuracy";
import { de440Status } from "../ephemeris/de440/source";
import { proEphemerisEngine } from "../ephemeris/flags";
import { localPosition, STATION_THRESHOLD_DEG_PER_DAY } from "../ephemeris/local";
import type { EphemerisBody, Zodiac } from "../ephemeris/types";
import { checkMethodSource, checkReasonSource } from "./text";
import type { MonthlyBody, MonthlyCrossCheck, MonthlyDay, MonthlyKind } from "./types";

assertServerOnly("lib/astrology/pro/monthly/crossCheck");

export const CROSSCHECK_BASE_ARCSEC: Readonly<Record<MonthlyKind, number>> = { western: 1.0, vedic: 1.5 };

const LOCAL_OF: Readonly<Record<MonthlyKind, Partial<Record<MonthlyBody, EphemerisBody>>>> = {
  western: { sun: "sun", moon: "moon", mercury: "mercury", venus: "venus", mars: "mars", jupiter: "jupiter", saturn: "saturn", uranus: "uranus", neptune: "neptune", pluto: "pluto", north_node: "true_node" },
  vedic: { sun: "sun", moon: "moon", mars: "mars", mercury: "mercury", jupiter: "jupiter", venus: "venus", saturn: "saturn", rahu: "mean_node" },
};
const DERIVED: Readonly<Record<MonthlyKind, MonthlyBody[]>> = { western: ["south_node"], vedic: ["ketu"] };

// I18N-F1-R5 (ATLAS-E): yöntem ve neden metinleri sonuçla birlikte önbelleğe / kayda yazılır → HER ZAMAN kaynak dilde (tr; katalogdan,
// çeviri öncesiyle bayt-bayt aynı). Ekran ve rapor gösterirken text.checkMethodText / checkReasonText ile seçili dile çevirir.
export const CROSSCHECK_METHOD: Readonly<Record<MonthlyKind, string>> = {
  western: checkMethodSource("western"),
  vedic: checkMethodSource("vedic"),
};

const sepArcsec = (a: number, b: number) => (((((a - b) % 360) + 540) % 360) - 180) * 3600;

export function toleranceArcsec(kind: MonthlyKind, body: EphemerisBody, ms: number): number {
  return CROSSCHECK_BASE_ARCSEC[kind] + deltaTPositionArcsec(body, "lon", deltaTUncertaintySec(ms));
}

/**
 * Bağımsız kontrol yapılabilir mi? (Owner kararı 2026-11-25: yeni hesapta bağımsız DE440 doğrulaması ZORUNLU.)
 * Yalnız yerel motor DE440 seçiliyse VE DE440 kerneli bu sunucuda okunabiliyorsa true. "legacy" motor bağımsız DE440 sayılmaz.
 * Sağlayıcı çağrısından ÖNCE sorulur → kontrol yapılamayacaksa ücretli istek hiç atılmaz.
 */
export function independentCheckReady(): { ok: true } | { ok: false; reason: string } {
  if (proEphemerisEngine() !== "de440") return { ok: false, reason: checkReasonSource("reasonNotDe440") };
  const st = de440Status();
  return st.ok ? { ok: true } : { ok: false, reason: checkReasonSource("reasonNoData") };
}

export function crossCheckMonthly(kind: MonthlyKind, days: MonthlyDay[]): MonthlyCrossCheck {
  const map = LOCAL_OF[kind];
  const checkedBodies = Object.keys(map) as MonthlyBody[];
  const all = days[0]?.positions.map((p) => p.body) ?? [];
  const uncheckedBodies = all.filter((b) => !map[b] && !DERIVED[kind].includes(b));
  const base: MonthlyCrossCheck = { status: "unavailable", compared: 0, maxAbsArcsec: 0, maxAt: null, retroMismatches: 0, retroStationSkipped: 0, checkedBodies, uncheckedBodies, method: CROSSCHECK_METHOD[kind] };
  const eng = independentCheckReady();
  if (!eng.ok) return { ...base, reason: eng.reason };
  const zodiac: Zodiac = kind === "western" ? "tropical" : "sidereal_lahiri";
  let fail = false;
  const out = { ...base };
  try {
    for (const d of days) {
      const ms = Date.parse(`${d.date}T12:00:00Z`);
      for (const p of d.positions) {
        const lb = map[p.body];
        if (!lb) continue;
        const loc = localPosition(lb, ms, zodiac);
        const diff = sepArcsec(p.lon, loc.lon);
        // Sayısal olmayan sonuç (NaN/∞) karşılaştırmada sessizce "tolerans içinde" görünürdü → kontrol YAPILAMADI sayılır.
        if (!Number.isFinite(diff) || !Number.isFinite(loc.speed) || !Number.isFinite(ms)) return { ...base, reason: checkReasonSource("reasonInvalid") };
        out.compared += 1;
        if (Math.abs(diff) > out.maxAbsArcsec) {
          out.maxAbsArcsec = Math.abs(diff);
          out.maxAt = { date: d.date, body: p.body };
        }
        if (Math.abs(diff) > toleranceArcsec(kind, lb, ms)) fail = true;
        if (Math.abs(loc.speed) < STATION_THRESHOLD_DEG_PER_DAY) out.retroStationSkipped += 1;
        else if ((loc.speed < 0) !== p.retro) {
          out.retroMismatches += 1;
          fail = true;
        }
      }
    }
  } catch {
    return { ...base, reason: checkReasonSource("reasonError") };
  }
  // Her gün × her denetlenen cisim karşılaştırılmış olmalı; hiç değer yoksa ya da eksikse PASS verilmez.
  const expected = days.reduce((n, d) => n + d.positions.filter((p) => map[p.body]).length, 0);
  if (out.compared === 0 || out.compared !== expected || out.compared !== days.length * checkedBodies.length) return { ...base, reason: checkReasonSource("reasonIncomplete") };
  out.maxAbsArcsec = Math.round(out.maxAbsArcsec * 100) / 100;
  out.status = fail ? "fail" : "pass";
  return out;
}
