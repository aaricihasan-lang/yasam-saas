/**
 * GET /api/cosmic/audit
 *
 * FAZ 2 karşılaştırma endpoint'i:
 *   legacy   → eski yaklaşık formüller (sidereal epoch, kosinüs)
 *   aeRaw    → astronomy-engine doğrudan
 *   production → getMoonSign / getMoonIllumination (artık AE tabanlı)
 *
 * Production'da kullanılmaz — sadece doğruluk testi içindir.
 */

export const runtime = "nodejs";

import {
  getMoonPhase,
  getMoonSign,
  getMoonSignLegacy,
  getMoonIllumination,
  getMoonIlluminationLegacy,
  getMoonAge,
} from "@/lib/cosmic/moon";

import { getMoonDataAE } from "@/lib/cosmic/astronomy-engine-helper";

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function formatLocalTR(date: Date): string {
  return date.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}

function formatUTC(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

type DiffMark = "AYNI ✓" | "~ YAKIN" | "FARK ⚠️";

function signStatus(a: string, b: string): DiffMark {
  return a === b ? "AYNI ✓" : "FARK ⚠️";
}
function phaseStatus(a: string, b: string): DiffMark {
  return a === b ? "AYNI ✓" : "FARK ⚠️";
}
function illumStatus(a: number, b: number): DiffMark {
  const d = Math.abs(a - b);
  if (d <= 3) return "AYNI ✓";
  if (d <= 8) return "~ YAKIN";
  return "FARK ⚠️";
}

// ─── Ay burcu geçiş tespiti (önümüzdeki N gün, 30 dakika aralıklı tarama) ────

type SignTransition = { utc: string; local: string; newSign: string; lon: number };

function detectSignTransitions(from: Date, days: number): SignTransition[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AE = require("astronomy-engine");
  const SIGNS = [
    "Koç","Boğa","İkizler","Yengeç","Aslan","Başak",
    "Terazi","Akrep","Yay","Oğlak","Kova","Balık",
  ];
  const transitions: SignTransition[] = [];
  let prevSign = "";

  for (let i = 0; i <= days * 24 * 2; i++) {
    const d    = new Date(from.getTime() + i * 30 * 60_000);
    const ecl  = AE.EclipticGeoMoon(d);
    const sign = SIGNS[Math.floor(ecl.lon / 30) % 12] ?? "";
    if (sign && sign !== prevSign) {
      if (prevSign !== "") {
        transitions.push({
          utc:     formatUTC(d),
          local:   formatLocalTR(d),
          newSign: sign,
          lon:     parseFloat(ecl.lon.toFixed(2)),
        });
      }
      prevSign = sign;
    }
  }
  return transitions;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const now  = new Date();
  const days = 7;

  // ── 7 günlük karşılaştırma ──────────────────────────────────────────────────
  const comparison = Array.from({ length: days + 1 }, (_, i) => {
    const date = new Date(now);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + i);

    // production — artık AE tabanlı getMoonSign / getMoonIllumination
    const prodPhase  = getMoonPhase(date);
    const prodSign   = getMoonSign(date);
    const prodIllum  = getMoonIllumination(date);
    const prodAge    = getMoonAge(date);

    // legacy — eski yaklaşık formüller
    const legSign    = getMoonSignLegacy(date);
    const legIllum   = getMoonIlluminationLegacy(date);

    // astronomy-engine doğrudan (referans)
    const ae = getMoonDataAE(date);

    return {
      tarih:   date.toISOString().slice(0, 10),
      tarihTR: date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" }),

      production: {
        faz:        `${prodPhase.emoji} ${prodPhase.name}`,
        burç:       `${prodSign.emoji} ${prodSign.name}`,
        aydinlanma: `%${prodIllum}`,
        moonAge:    parseFloat(prodAge.toFixed(2)),
      },

      legacy: {
        burç:       `${legSign.emoji} ${legSign.name}`,
        aydinlanma: `%${legIllum}`,
      },

      aeRaw: {
        faz:         `${ae.phase.emoji} ${ae.phase.name}`,
        fazDerece:   parseFloat(ae.phase.degrees.toFixed(1)),
        burç:        `${ae.sign.emoji} ${ae.sign.name}`,
        ekliptikLon: parseFloat(ae.sign.lon.toFixed(2)),
        aydinlanma:  `%${ae.illumination}`,
        moonAge:     parseFloat(ae.moonAgeDays.toFixed(2)),
      },

      dogrulama: {
        // production artık AE tabanlı — aeRaw ile eşleşmeli
        prodVsAE_burc:       signStatus(prodSign.name, ae.sign.name),
        prodVsAE_aydinlanma: illumStatus(prodIllum, ae.illumination),
        // legacy vs AE farkı — ne kadar iyileştik?
        legacyVsAE_burc:       signStatus(legSign.name, ae.sign.name),
        legacyVsAE_aydinlanma: illumStatus(legIllum, ae.illumination),
        aydinlanmaDelta:       `Δ${Math.abs(prodIllum - legIllum)}% (production ${prodIllum > legIllum ? "yüksek" : prodIllum === legIllum ? "eşit" : "düşük"})`,
        fazDurumu:             phaseStatus(prodPhase.name, ae.phase.name),
      },
    };
  });

  // ── Kritik tarihler ───────────────────────────────────────────────────────────
  const aeToday = getMoonDataAE(now);
  const kritikTarihler = {
    sonrakiYeniAy: {
      utc:   formatUTC(aeToday.nextNewMoon),
      local: formatLocalTR(aeToday.nextNewMoon),
    },
    sonrakiDolunay: {
      utc:   formatUTC(aeToday.nextFullMoon),
      local: formatLocalTR(aeToday.nextFullMoon),
    },
  };

  // ── Ay burcu geçişleri ────────────────────────────────────────────────────────
  const signTransitions = detectSignTransitions(now, days);

  // ── Genel özet ────────────────────────────────────────────────────────────────
  const today0 = comparison[0]!;
  const ozet = {
    tarih:        now.toISOString().slice(0, 10),
    productionBurc:   today0.production.burç,
    legacyBurc:       today0.legacy.burç,
    aeBurc:           `${aeToday.sign.emoji} ${aeToday.sign.name} (${aeToday.sign.lon.toFixed(1)}°)`,
    productionIllum:  today0.production.aydinlanma,
    legacyIllum:      today0.legacy.aydinlanma,
    aeIllum:          `%${aeToday.illumination}`,
    productionFaz:    today0.production.faz,
    aeFaz:            `${aeToday.phase.emoji} ${aeToday.phase.name} (${aeToday.phase.degrees.toFixed(1)}°)`,
    burcIyilestirmesi: today0.legacy.burç === today0.production.burç
      ? "Bugün legacy ile aynı burç (geçiş günü kontrolü gerekmez)"
      : `✓ ${today0.legacy.burç} → ${today0.production.burç} (düzeltildi)`,
  };

  return Response.json({
    ok:       true,
    faz:      "FAZ 2 — production AE tabanlı",
    aciklama: "production=getMoonSign/getMoonIllumination, legacy=eski formüller, aeRaw=doğrudan AE",
    ozet,
    kritikTarihler,
    ayBurcuGecisleri: signTransitions,
    gunlukKarsilastirma: comparison,
  });
}
