/**
 * Whole Sign haritada sect (gündüz/gece) + Şans Noktası (ATL-P2-05 — 2026-10-20).
 *
 * Sağlayıcı whole-sign isteklerinde sect'i "Güneş whole-sign 7–12. evde ⇒ gündüz" kuralıyla veriyor (328/328 gerçek yanıtla
 * açıklandı); bu kural ASC burcunun derecesine göre ufku kaydırır → doğumların bir kısmında sect ve onunla birlikte Şans
 * Noktası (konum + ev) yanlış. Aynı doğumun Placidus yanıtında sect geometrik ufukla birebir (|enlem|<66,56°: 217/217).
 *
 * Düzeltme: sect, sağlayıcının kendi MC'sinden (RAMC) + doğum/dönüş enlemi + Güneş boylamından hesaplanan GEOMETRİK Güneş
 * irtifasıyla belirlenir (kırılmasız; Placidus yanıtıyla aynı konvansiyon). Bağımsız referans: pyswisseph 2.10.03 — 328/328
 * (kutup 36/36), maks. irtifa farkı 0,024°. PoF: gündüz ASC + Ay − Güneş, gece ASC + Güneş − Ay; ev = whole-sign.
 * Yeni hesap motoru değildir: yalnız sağlayıcının döndürdüğü ASC/MC/Güneş/Ay ile basit küresel trigonometri.
 */
import { SIGN_IDS, type EclipticPoint } from "../../model/western";

/** Ortalama ekliptik eğikliği (J2000; 1500–2700 aralığında irtifa etkisi <0,03° — sect sınırında belirsizlik yalnız |irtifa|<0,03°). */
const OBLIQUITY_DEG = 23.4393;
const RAD = Math.PI / 180;

function n360(x: number): number {
  return ((x % 360) + 360) % 360;
}

/** Güneş'in geometrik irtifası (derece): MC boylamından RAMC, Güneş boylamından RA/δ (ekliptik enlem ≈ 0). */
export function sunAltitudeFromMc(sunLon: number, mcLon: number, latitudeDeg: number): number {
  const e = OBLIQUITY_DEG * RAD;
  const ramc = Math.atan2(Math.sin(mcLon * RAD) * Math.cos(e), Math.cos(mcLon * RAD));
  const ra = Math.atan2(Math.sin(sunLon * RAD) * Math.cos(e), Math.cos(sunLon * RAD));
  const dec = Math.asin(Math.sin(e) * Math.sin(sunLon * RAD));
  const phi = latitudeDeg * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ramc - ra)) / RAD;
}

export type WholeSignPof = EclipticPoint & { house: number; sect: "day" | "night" };

export function wholeSignSectPof(p: { ascLon: number; mcLon: number; sunLon: number; moonLon: number; latitude: number }): WholeSignPof {
  const sect = sunAltitudeFromMc(p.sunLon, p.mcLon, p.latitude) > 0 ? "day" : "night";
  const longitude = n360(sect === "day" ? p.ascLon + p.moonLon - p.sunLon : p.ascLon + p.sunLon - p.moonLon);
  const si = Math.floor(longitude / 30) % 12;
  const ascSi = Math.floor(n360(p.ascLon) / 30) % 12;
  return { longitude, sign: SIGN_IDS[si], degreeInSign: longitude - si * 30, house: ((si - ascSi + 12) % 12) + 1, sect };
}
