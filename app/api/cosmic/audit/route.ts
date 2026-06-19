/**
 * GET /api/cosmic/audit
 *
 * FAZ 3 karşılaştırma endpoint'i — tüm ay verileri üç sütunlu:
 *   legacy     → eski yaklaşık formüller (epoch+sinodik, sidereal, kosinüs)
 *   production → getMoonPhase/Sign/Illumination (artık tamamı AE tabanlı)
 *   aeRaw      → astronomy-engine doğrudan (referans)
 *
 * Production'da kullanılmaz — sadece doğruluk testi içindir.
 */

export const runtime = "nodejs";

import {
  getMoonPhase,
  getMoonPhaseLegacy,
  getMoonSign,
  getMoonSignLegacy,
  getMoonIllumination,
  getMoonIlluminationLegacy,
  getMoonAge,
} from "@/lib/cosmic/moon";

import { getMoonDataAE } from "@/lib/cosmic/astronomy-engine-helper";

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function fmtTR(date: Date): string {
  return date.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
}
function fmtUTC(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

type Mark = "AYNI ✓" | "~ YAKIN" | "FARK ⚠️";

function cmpStr(a: string, b: string): Mark  { return a === b ? "AYNI ✓" : "FARK ⚠️"; }
function cmpNum(a: number, b: number): Mark {
  const d = Math.abs(a - b);
  return d <= 3 ? "AYNI ✓" : d <= 8 ? "~ YAKIN" : "FARK ⚠️";
}

// ─── Ay burcu geçiş taraması (30 dk adım) ────────────────────────────────────

type SignTx = { utc: string; local: string; newSign: string; lon: number };

function detectSignTransitions(from: Date, days: number): SignTx[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AE = require("astronomy-engine");
  const SIGNS = ["Koç","Boğa","İkizler","Yengeç","Aslan","Başak",
                 "Terazi","Akrep","Yay","Oğlak","Kova","Balık"];
  const out: SignTx[] = [];
  let prev = "";
  for (let i = 0; i <= days * 48; i++) {
    const d   = new Date(from.getTime() + i * 30 * 60_000);
    const ecl = AE.EclipticGeoMoon(d);
    const s   = SIGNS[Math.floor(ecl.lon / 30) % 12] ?? "";
    if (s && s !== prev) {
      if (prev) out.push({ utc: fmtUTC(d), local: fmtTR(d), newSign: s, lon: +ecl.lon.toFixed(2) });
      prev = s;
    }
  }
  return out;
}

// ─── Faz geçiş taraması (1 saatlik adım, prod + legacy) ──────────────────────

type PhaseTx = {
  utc: string; local: string;
  prodFaz: string; legacyFaz: string; aeDerece: number;
  yeniGeçiş: string; eskiGeçiş: string;
};

function detectPhaseTransitions(from: Date, days: number): PhaseTx[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const AE   = require("astronomy-engine");
  const out: PhaseTx[] = [];
  let prevProd   = getMoonPhase(from).name;
  let prevLegacy = getMoonPhaseLegacy(from).name;

  for (let i = 1; i <= days * 24; i++) {
    const d    = new Date(from.getTime() + i * 3_600_000);
    const prod = getMoonPhase(d).name;
    const leg  = getMoonPhaseLegacy(d).name;
    const changed = prod !== prevProd || leg !== prevLegacy;
    if (changed) {
      const deg = AE.MoonPhase(d);
      out.push({
        utc:        fmtUTC(d),
        local:      fmtTR(d),
        prodFaz:    prod,
        legacyFaz:  leg,
        aeDerece:   +deg.toFixed(1),
        yeniGeçiş:  prod !== prevProd ? `${prevProd} → ${prod}` : "(değişmedi)",
        eskiGeçiş:  leg !== prevLegacy ? `${prevLegacy} → ${leg}` : "(değişmedi)",
      });
      prevProd   = prod;
      prevLegacy = leg;
    }
  }
  return out;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  const now  = new Date();
  const days = 14;

  // ── Günlük karşılaştırma ─────────────────────────────────────────────────────
  const comparison = Array.from({ length: days + 1 }, (_, i) => {
    const date = new Date(now);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + i);

    const prodPhase = getMoonPhase(date);
    const prodSign  = getMoonSign(date);
    const prodIllum = getMoonIllumination(date);
    const prodAge   = getMoonAge(date);

    const legPhase  = getMoonPhaseLegacy(date);
    const legSign   = getMoonSignLegacy(date);
    const legIllum  = getMoonIlluminationLegacy(date);

    const ae = getMoonDataAE(date);

    return {
      tarih:   date.toISOString().slice(0, 10),
      tarihTR: date.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" }),

      production: {
        faz:        `${prodPhase.emoji} ${prodPhase.name}`,
        burç:       `${prodSign.emoji} ${prodSign.name}`,
        aydinlanma: `%${prodIllum}`,
        moonAge:    +prodAge.toFixed(2),
      },

      legacy: {
        faz:        `${legPhase.emoji} ${legPhase.name}`,
        burç:       `${legSign.emoji} ${legSign.name}`,
        aydinlanma: `%${legIllum}`,
      },

      aeRaw: {
        faz:         `${ae.phase.emoji} ${ae.phase.name}`,
        fazDerece:   +ae.phase.degrees.toFixed(1),
        burç:        `${ae.sign.emoji} ${ae.sign.name}`,
        ekliptikLon: +ae.sign.lon.toFixed(2),
        aydinlanma:  `%${ae.illumination}`,
        moonAge:     +ae.moonAgeDays.toFixed(2),
      },

      dogrulama: {
        prod_faz_vs_AE:    cmpStr(prodPhase.name, ae.phase.name),
        prod_burc_vs_AE:   cmpStr(prodSign.name,  ae.sign.name),
        prod_illum_vs_AE:  cmpNum(prodIllum,       ae.illumination),
        legacy_faz_vs_AE:  cmpStr(legPhase.name,  ae.phase.name),
        legacy_burc_vs_AE: cmpStr(legSign.name,   ae.sign.name),
        fazIyilestirmesi:  legPhase.name !== ae.phase.name && prodPhase.name === ae.phase.name
          ? `✓ ${legPhase.name} → ${prodPhase.name}` : "",
        illumDelta: `Δ${Math.abs(prodIllum - legIllum)}%`,
      },
    };
  });

  // ── Kritik tarihler ───────────────────────────────────────────────────────────
  const aeToday = getMoonDataAE(now);
  const kritikTarihler = {
    sonrakiYeniAy:  { utc: fmtUTC(aeToday.nextNewMoon),  local: fmtTR(aeToday.nextNewMoon)  },
    sonrakiDolunay: { utc: fmtUTC(aeToday.nextFullMoon), local: fmtTR(aeToday.nextFullMoon) },
  };

  // ── Faz geçişleri ─────────────────────────────────────────────────────────────
  const fazGecisleri = detectPhaseTransitions(now, days);

  // ── Burç geçişleri ────────────────────────────────────────────────────────────
  const burcGecisleri = detectSignTransitions(now, days);

  // ── Özet ─────────────────────────────────────────────────────────────────────
  const t0  = comparison[0]!;
  const ae0 = getMoonDataAE(now);
  const ozet = {
    tarih:          now.toISOString().slice(0, 10),
    saat:           fmtTR(now),
    productionFaz:  t0.production.faz,
    legacyFaz:      t0.legacy.faz,
    aeFaz:          `${ae0.phase.emoji} ${ae0.phase.name} (${ae0.phase.degrees.toFixed(1)}°)`,
    productionBurc: t0.production.burç,
    legacyBurc:     t0.legacy.burç,
    aeBurc:         `${ae0.sign.emoji} ${ae0.sign.name} (${ae0.sign.lon.toFixed(1)}°)`,
    productionIllum: t0.production.aydinlanma,
    legacyIllum:     t0.legacy.aydinlanma,
    aeIllum:         `%${ae0.illumination}`,
    fazDurumu: t0.dogrulama.prod_faz_vs_AE === "AYNI ✓"
      ? "✓ production faz AE ile eşleşiyor"
      : `⚠️ production=${t0.production.faz} AE=${t0.aeRaw.faz}`,
  };

  return Response.json({
    ok:        true,
    modul:     "FAZ 3 — faz adı AE tabanlı",
    aciklama:  "production=getMoonPhase/Sign/Illumination (tümü AE), legacy=eski formüller, aeRaw=doğrudan AE",
    ozet,
    kritikTarihler,
    fazGecisleri,
    burcGecisleri,
    gunlukKarsilastirma: comparison,
  });
}
