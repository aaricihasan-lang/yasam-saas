// Gökyüzü Atlası — PROFESYONEL EFEMERİS: gösterim biçimleri + CSV (SAF; istemci de kullanır).
//
// Hassasiyet ölçülü hataya bağlıdır (accuracy.ts): "arcsec" saniye, "tenth_arcmin" 0,1′, "arcmin" dakika. Daha ince basamak
// GÖSTERİLMEZ (sahte kesinlik yok). Yuvarlama taşıması (59,96′ → 1°00′) burç ve derece düzeyine kadar yapılır.

import type { DisplayPrecision, EphemerisBody, EphemerisEvent, EphemerisResult } from "./types";

export const SIGN_ABBR_TR = ["Koç", "Boğ", "İkz", "Yen", "Asl", "Baş", "Ter", "Akr", "Yay", "Oğl", "Kov", "Bal"] as const;
export const SIGN_NAME_TR = ["Koç", "Boğa", "İkizler", "Yengeç", "Aslan", "Başak", "Terazi", "Akrep", "Yay", "Oğlak", "Kova", "Balık"] as const;
export const BODY_NAME_TR: Readonly<Record<EphemerisBody, string>> = {
  sun: "Güneş", moon: "Ay", mercury: "Merkür", venus: "Venüs", mars: "Mars", jupiter: "Jüpiter", saturn: "Satürn",
  uranus: "Uranüs", neptune: "Neptün", pluto: "Plüton", mean_node: "Ortalama düğüm", true_node: "Gerçek düğüm",
};

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const unitsOf = (p: DisplayPrecision) => (p === "arcsec" ? 3600 : p === "tenth_arcmin" ? 600 : 60); // derece başına birim

/** Derece değerini seçilen hassasiyette (d, m, s|ondalık) parçalara ayırır; yuvarlama taşıması dahil. */
function parts(deg: number, p: DisplayPrecision): { d: number; m: number; s: number } {
  const u = unitsOf(p);
  const total = Math.round(Math.abs(deg) * u);
  const d = Math.floor(total / u);
  const rem = total - d * u;
  if (p === "arcsec") return { d, m: Math.floor(rem / 60), s: rem % 60 };
  if (p === "tenth_arcmin") return { d, m: rem / 10, s: 0 };
  return { d, m: rem, s: 0 };
}

const minStr = (m: number, p: DisplayPrecision) => (p === "tenth_arcmin" ? m.toFixed(1).padStart(4, "0").replace(".", ",") : pad(m));

/** Ekliptik boylam: "08°19′42″ Ter" (burç içi derece + burç kısaltması). */
export function formatLon(lon: number, p: DisplayPrecision): string {
  const u = unitsOf(p);
  const total = Math.round((((lon % 360) + 360) % 360) * u) % (360 * u);
  const sign = Math.floor(total / (30 * u));
  const inSign = (total - sign * 30 * u) / u;
  const x = parts(inSign, p);
  return `${pad(x.d)}°${minStr(x.m, p)}′${p === "arcsec" ? `${pad(x.s)}″` : ""} ${SIGN_ABBR_TR[sign]}`;
}

/** İşaretli açı (enlem, deklinasyon, hız): "+05°08′54″" / "−0°04′11″". `degWidth` derece hanesi. */
export function formatSigned(deg: number, p: DisplayPrecision, degWidth = 2): string {
  const x = parts(deg, p);
  const neg = deg < 0 && (x.d > 0 || x.m > 0 || x.s > 0);
  return `${neg ? "−" : "+"}${pad(x.d, degWidth)}°${minStr(x.m, p)}′${p === "arcsec" ? `${pad(x.s)}″` : ""}`;
}

/** Sağ açıklık zaman biriminde: arcsec → ss,s; tenth_arcmin → ss; arcmin → dakika 0,1. */
export function formatRa(raDeg: number, p: DisplayPrecision): string {
  const hours = ((((raDeg % 360) + 360) % 360) / 15);
  if (p === "arcmin") {
    const tm = Math.round(hours * 600) % (24 * 600);
    return `${pad(Math.floor(tm / 600))}s ${(tm % 600 / 10).toFixed(1).padStart(4, "0").replace(".", ",")}d`;
  }
  const scale = p === "arcsec" ? 36000 : 3600; // 0,1 s ya da 1 s
  const t = Math.round(hours * scale) % (24 * scale);
  const h = Math.floor(t / scale);
  const rem = t - h * scale;
  const per = scale / 60;
  const m = Math.floor(rem / per);
  const s = (rem - m * per) / (scale / 3600);
  return `${pad(h)}s ${pad(m)}d ${p === "arcsec" ? s.toFixed(1).padStart(4, "0").replace(".", ",") : pad(s)}sn`;
}

export function formatUncertainty(sec: number): string {
  if (!Number.isFinite(sec)) return "belirsiz";
  if (sec < 60) return `±${Math.max(1, Math.round(sec))} sn`;
  if (sec < 3600) return `±${Math.round(sec / 60)} dk`;
  return `±${(sec / 3600).toFixed(1).replace(".", ",")} sa`;
}

export function eventLabel(e: EphemerisEvent): string {
  if (e.kind === "ingress") return `${BODY_NAME_TR[e.body]} ${SIGN_NAME_TR[e.toSign]} burcuna girer${e.retrograde ? " (geri)" : ""}`;
  return `${BODY_NAME_TR[e.body]} ${e.direction === "retrograde" ? "geri dönüş istasyonu" : "düz dönüş istasyonu"}`;
}

const csvCell = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * CSV (yalnız YEREL kaynak — sağlayıcı verisi toplu veri ürünü olarak dışa verilmez; bkz. rapor "lisans"). Sayısal sütunlar ondalık
 * derece, gösterim hassasiyetine göre yuvarlanır (sahte basamak yok). Ayraç ";" (Türkçe Excel), ondalık ".".
 */
export function toCsv(r: EphemerisResult): string {
  if (r.meta.source !== "local") throw new Error("CSV yalnız yerel kaynak için");
  const dec = (p: DisplayPrecision) => (p === "arcsec" ? 5 : p === "tenth_arcmin" ? 3 : 2);
  const PB = r.meta.bodyPrecision;
  const head = ["tarih", "saat_UT", "cisim", "boylam_derece", "burç", "enlem_derece", "RA_derece", "deklinasyon_derece", "hız_derece_gün", "geri", "durağan"];
  const lines = [`# Yaşam Sistemi profesyonel efemeris — ${r.meta.timeStandard} Zodyak: ${r.meta.zodiac === "tropical" ? "tropikal" : "sidereal (Lahiri)"}. ${r.meta.deltaTNote}`, head.join(";")];
  for (const row of r.rows) {
    for (const p of row.positions) {
      const P = PB[p.body] ?? r.meta.precision;
      const sign = SIGN_NAME_TR[Math.floor((((p.lon % 360) + 360) % 360) / 30)];
      lines.push(
        [row.date, "00:00", BODY_NAME_TR[p.body], p.lon.toFixed(dec(P.lon)), sign, p.lat === null ? "" : p.lat.toFixed(dec(P.lat)), p.ra === null ? "" : p.ra.toFixed(dec(P.ra)), p.dec === null ? "" : p.dec.toFixed(dec(P.dec)), p.speed.toFixed(dec(P.speed) + 1), p.retro ? "E" : "H", p.stationary ? "E" : "H"].map(csvCell).join(";"),
      );
    }
  }
  return lines.join("\r\n") + "\r\n";
}
