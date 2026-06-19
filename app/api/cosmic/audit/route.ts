/**
 * GET /api/cosmic/audit
 *
 * FAZ 5B karşılaştırma endpoint'i:
 *   - FAZ 2-3: production vs legacy vs aeRaw (faz, burç, aydınlanma)
 *   - FAZ 4:   Yeni Ay / Dolunay events.ts çıktısı + AE doğrudan karşılaştırma
 *   - FAZ 5A:  Moon age AE vs legacy
 *   - FAZ 5B:  Güneş burcu AE vs legacy — cusp tarihleri dahil
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
  getMoonAgeLegacy,
} from "@/lib/cosmic/moon";

import { getMoonDataAE } from "@/lib/cosmic/astronomy-engine-helper";
import { getUpcomingCosmicEvents } from "@/lib/cosmic/events";
import {
  getSunSignInfo,
  getSunSignLegacy,
  getPlanetSigns,
  getMercurySignLegacy,
  getVenusSignLegacy,
  getMarsSignLegacy,
} from "@/lib/cosmic/planets";

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

// ─── Yardımcı — Güneş burcu emoji (audit formatlaması için) ──────────────────

const ZODIAC_SYMBOL_LOCAL: Record<string, string> = {
  "Koç":"♈","Boğa":"♉","İkizler":"♊","Yengeç":"♋","Aslan":"♌","Başak":"♍",
  "Terazi":"♎","Akrep":"♏","Yay":"♐","Oğlak":"♑","Kova":"♒","Balık":"♓",
};

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
    const prodAge   = getMoonAge(date);      // AE-based (FAZ 5A)
    const legAge    = getMoonAgeLegacy(date); // sinodik epoch

    const legPhase  = getMoonPhaseLegacy(date);
    const legSign   = getMoonSignLegacy(date);
    const legIllum  = getMoonIlluminationLegacy(date);

    const ae = getMoonDataAE(date);

    const moonAgeDelta = +(prodAge - legAge).toFixed(3);

    return {
      tarih:   date.toISOString().slice(0, 10),
      tarihTR: date.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric", month: "short" }),

      production: {
        faz:        `${prodPhase.emoji} ${prodPhase.name}`,
        burç:       `${prodSign.emoji} ${prodSign.name}`,
        aydinlanma: `%${prodIllum}`,
        moonAgeAE:  +prodAge.toFixed(3),
      },

      legacy: {
        faz:        `${legPhase.emoji} ${legPhase.name}`,
        burç:       `${legSign.emoji} ${legSign.name}`,
        aydinlanma: `%${legIllum}`,
        moonAgeLeg: +legAge.toFixed(3),
      },

      aeRaw: {
        faz:         `${ae.phase.emoji} ${ae.phase.name}`,
        fazDerece:   +ae.phase.degrees.toFixed(1),
        burç:        `${ae.sign.emoji} ${ae.sign.name}`,
        ekliptikLon: +ae.sign.lon.toFixed(2),
        aydinlanma:  `%${ae.illumination}`,
        moonAgeDays: +ae.moonAgeDays.toFixed(3),
      },

      dogrulama: {
        prod_faz_vs_AE:    cmpStr(prodPhase.name, ae.phase.name),
        prod_burc_vs_AE:   cmpStr(prodSign.name,  ae.sign.name),
        prod_illum_vs_AE:  cmpNum(prodIllum,       ae.illumination),
        legacy_faz_vs_AE:  cmpStr(legPhase.name,  ae.phase.name),
        legacy_burc_vs_AE: cmpStr(legSign.name,   ae.sign.name),
        fazIyilestirmesi:  legPhase.name !== ae.phase.name && prodPhase.name === ae.phase.name
          ? `✓ ${legPhase.name} → ${prodPhase.name}` : "",
        illumDelta:         `Δ${Math.abs(prodIllum - legIllum)}%`,
        moonAgeDelta_saat:  `Δ${(Math.abs(moonAgeDelta) * 24).toFixed(1)}sa (prod-leg: ${moonAgeDelta > 0 ? "+" : ""}${moonAgeDelta} gün)`,
        moonAge_prod_vs_ae: Math.abs(prodAge - ae.moonAgeDays) < 0.05 ? "AYNI ✓" : `FARK ⚠️ Δ${Math.abs(prodAge - ae.moonAgeDays).toFixed(3)}g`,
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
  const legAge0 = getMoonAgeLegacy(now);
  const prodAge0 = getMoonAge(now);
  const ageDeltaSaat = (Math.abs(prodAge0 - legAge0) * 24).toFixed(1);
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
    moonAge: {
      production_AE:  `${prodAge0.toFixed(3)} gün`,
      legacy_sinodik: `${legAge0.toFixed(3)} gün`,
      aeRaw:          `${ae0.moonAgeDays.toFixed(3)} gün`,
      delta_saat:     `Δ${ageDeltaSaat} saat (prod − legacy)`,
      durum:          Math.abs(prodAge0 - ae0.moonAgeDays) < 0.1
        ? "✓ production AE ile eşleşiyor"
        : `⚠️ production=${prodAge0.toFixed(2)} AE=${ae0.moonAgeDays.toFixed(2)}`,
    },
    fazDurumu: t0.dogrulama.prod_faz_vs_AE === "AYNI ✓"
      ? "✓ production faz AE ile eşleşiyor"
      : `⚠️ production=${t0.production.faz} AE=${t0.aeRaw.faz}`,
  };

  // ── FAZ 4: Yeni Ay / Dolunay event karşılaştırması ───────────────────────────
  const productionEvents = getUpcomingCosmicEvents(now, 20)
    .filter(e => e.type === "new_moon" || e.type === "full_moon")
    .slice(0, 6);

  const eventKarsilastirma = productionEvents.map(evt => ({
    type:           evt.type === "new_moon" ? "Yeni Ay 🌑" : "Dolunay 🌕",
    dateTR:         evt.date,
    timeTR:         evt.time   ?? "— (fallback, saat yok)",
    timeUTC:        evt.timeUTC ?? "— (fallback)",
    kaynakAE:       !!evt.timeUTC,
    dogrulama:      evt.timeUTC
      ? `✓ AE SearchMoonPhase — UTC: ${evt.timeUTC?.slice(11,16)} → TR: ${evt.time}`
      : "⚠️ Legacy gün taraması kullanıldı (fallback)",
  }));

  // ── FAZ 5C: Merkür / Venüs / Mars AE vs tablo ───────────────────────────────

  const FAZ5C_TEST_DATES = [
    { label: "Bugün",                   date: now },
    { label: "2026-07-10 (Merkür retro dibe)", date: new Date("2026-07-10T12:00:00Z") },
    { label: "2026-07-24 (Merkür direct)", date: new Date("2026-07-24T12:00:00Z") },
    { label: "2031-01-01 (tablo kapsamı dışı)", date: new Date("2031-01-01T12:00:00Z") },
  ] as const;

  const faz5c_gezegenKarsilastirma = FAZ5C_TEST_DATES.map(({ label, date }) => {
    const signs = getPlanetSigns(date);
    const mercAE  = signs.find(p => p.key === "Merkür")?.sign ?? "?";
    const venAE   = signs.find(p => p.key === "Venüs")?.sign  ?? "?";
    const marsAE  = signs.find(p => p.key === "Mars")?.sign   ?? "?";
    const mercLeg = getMercurySignLegacy(date);
    const venLeg  = getVenusSignLegacy(date);
    const marsLeg = getMarsSignLegacy(date);
    const outRng  = signs.find(p => p.key === "Merkür")?.outOfRange ?? false;
    return {
      tarih:   label,
      utc:     date.toISOString().slice(0, 10),
      merkur:  { ae: mercAE, tablo: mercLeg, eslesme: mercAE === mercLeg ? "AYNI ✓" : "FARK ⚠️" },
      venus:   { ae: venAE,  tablo: venLeg,  eslesme: venAE  === venLeg  ? "AYNI ✓" : "FARK ⚠️" },
      mars:    { ae: marsAE, tablo: marsLeg, eslesme: marsAE === marsLeg ? "AYNI ✓" : "FARK ⚠️" },
      outOfRange_merkur: outRng,
    };
  });

  // ── FAZ 5B: Güneş burcu cusp tarihleri ──────────────────────────────────────
  const CUSP_DATES = [
    { label: "Koç girişi öncesi  — 20 Mart 2026 14:00 UTC", date: new Date("2026-03-20T14:00:00Z") },
    { label: "Koç girişi sonrası — 20 Mart 2026 15:00 UTC", date: new Date("2026-03-20T15:00:00Z") },
    { label: "Yengeç girişi öncesi — 21 Haz 2026 08:00 UTC", date: new Date("2026-06-21T08:00:00Z") },
    { label: "Yengeç girişi sonrası — 21 Haz 2026 09:00 UTC", date: new Date("2026-06-21T09:00:00Z") },
    { label: "Terazi girişi — 23 Eyl 2026 00:00 UTC", date: new Date("2026-09-23T00:00:00Z") },
    { label: "Oğlak girişi — 21 Ara 2026 00:00 UTC", date: new Date("2026-12-21T00:00:00Z") },
  ] as const;

  const sunSignCuspKarsilastirma = CUSP_DATES.map(({ label, date }) => {
    const ae     = getSunSignInfo(date);
    const legacy = getSunSignLegacy(date);
    return {
      tarih:       label,
      utc:         date.toISOString().slice(0, 16) + " UTC",
      local_TR:    fmtTR(date),
      ae_burc:     `${ae.emoji} ${ae.name}`,
      legacy_burc: `${ZODIAC_SYMBOL_LOCAL[legacy] ?? "?"} ${legacy}`,
      eslesme:     ae.name === legacy ? "AYNI ✓" : `FARK ⚠️ (AE=${ae.name}, legacy=${legacy})`,
    };
  });

  return Response.json({
    ok:        true,
    modul:     "FAZ 5C — Merkür/Venüs/Mars AE tabanlı anlık burç",
    aciklama:  "production=Güneş/Merkür/Venüs/Mars AE + Ay AE + Faz AE; Jüpiter-Plüton tablo; legacy=eski formüller",
    ozet,
    kritikTarihler,
    faz5c_gezegenKarsilastirma,
    faz5b_sunSignCuspKarsilastirma: sunSignCuspKarsilastirma,
    faz4_eventKarsilastirma: eventKarsilastirma,
    fazGecisleri,
    burcGecisleri,
    gunlukKarsilastirma: comparison,
  });
}

