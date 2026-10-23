// Astroloji — GEZEGEN DÖNÜŞÜ (Satürn / Jüpiter / Mars / Venüs / Merkür dönüşü) kanonik teknik modeli (SAF, istemci güvenli).
// Dönüş haritası yapısı Solar/Lunar Return ile AYNIDIR (ReturnChart); ek olarak seçilen kavuşum, natal ↔ dönüş anı boylamı ve
// tutarlılık farkı saklanır.

import type { EclipticPoint } from "./western";
import type { ReturnChart } from "./westernTiming";

export const PLANETARY_RETURN_PLANETS = ["saturn", "jupiter", "mars", "venus", "mercury"] as const;
export type PlanetaryReturnPlanet = (typeof PLANETARY_RETURN_PLANETS)[number];
export function isPlanetaryReturnPlanet(v: unknown): v is PlanetaryReturnPlanet {
  return typeof v === "string" && (PLANETARY_RETURN_PLANETS as readonly string[]).includes(v);
}
/** Sağlayıcı enum yazımı (istek gövdesi). */
export const PLANETARY_RETURN_PROVIDER_NAME: Record<PlanetaryReturnPlanet, string> = { saturn: "Saturn", jupiter: "Jupiter", mars: "Mars", venus: "Venus", mercury: "Mercury" };
/** Ardışık dönüş kümeleri arasındaki tipik aralık (gösterim). */
export const PLANETARY_RETURN_TYPICAL_INTERVAL: Record<PlanetaryReturnPlanet, string> = {
  saturn: "yaklaşık 29,5 yıl",
  jupiter: "yaklaşık 11,9 yıl",
  mars: "yaklaşık 1,9–2,2 yıl",
  venus: "yaklaşık 1 yıl (8 yıllık döngüyle değişir)",
  mercury: "yaklaşık 1 yıl",
};

export const PLANETARY_RETURN_TECHNICAL_SCHEMA = "astro.western.planetary_return.v1" as const;
export const PLANETARY_RETURN_INTERP_SCHEMA = "astro.western.planetary_return.interp.v1" as const;

export type PlanetaryReturnTechnical = {
  schema: typeof PLANETARY_RETURN_TECHNICAL_SCHEMA;
  zodiac: "tropical";
  planet: PlanetaryReturnPlanet;
  /**
   * İstenen: uzmanın hedef tarihine en yakın dönüş kümesinde seçilen kavuşum (1..of). Retro döngüsünde of = 2–3; sağlayıcıya
   * seçilen kavuşumun UTC günü gönderilir (approximateDate) ve dönen anın bu kavuşuma ait olduğu doğrulanır.
   */
  requested: { approximateDate: string; crossing: number; of: number; motion: "direct" | "retrograde"; expectedUtc: string };
  /** Dönüş anı — sağlayıcının DOĞUM ofsetli yerel saati ve ofset; returnUtc bunlardan türetilir. */
  returnLocal: string;
  returnOffsetHours: number;
  returnUtc: string;
  /** Sağlayıcının natal gezegen konumu. */
  natalPoint: EclipticPoint;
  /** Dönüş anındaki gezegen konumu (dönüş haritasından). */
  returnPoint: EclipticPoint & { speed: number; retrograde: boolean };
  /** |dönüş anı boylamı − natal boylam| (derece; fail-closed eşik 0,05°). */
  longitudeDelta: number;
  location: { latitude: number; longitude: number };
  chart: ReturnChart;
};

export type PlanetaryReturnInterpretation = { schema: typeof PLANETARY_RETURN_INTERP_SCHEMA; summary: string | null; keyThemes: string[] };

export const PLANETARY_RETURN_LABELS: Record<PlanetaryReturnPlanet, { planet: string; title: string }> = {
  saturn: { planet: "Satürn", title: "Satürn dönüşü" },
  jupiter: { planet: "Jüpiter", title: "Jüpiter dönüşü" },
  mars: { planet: "Mars", title: "Mars dönüşü" },
  venus: { planet: "Venüs", title: "Venüs dönüşü" },
  mercury: { planet: "Merkür", title: "Merkür dönüşü" },
};

/** Ekran + rapor ortak yöntem metni (sağlayıcı adı yok). */
export const PLANETARY_RETURN_METHOD_TEXT =
  "Yöntem: gezegen dönüşü — transit gezegenin natal boylamına geri döndüğü (kavuşum) anın haritası; tropikal zodyak, görünür geosantrik boylam. Dönüş anı doğum anından ve doğum yeri ofsetinden hesaplanır; seçilen konum yalnız Yükselen, MC ve evleri değiştirir. Retro döngüsünde gezegen natal derecesinden 2–3 kez geçebilir: hedef tarihe en yakın dönüş kümesindeki tüm kavuşumlar listelenir ve yalnız seçilen kavuşum hesaplanır (otomatik seçim yapılmaz). Tutarlılık denetimi: dönüş anındaki boylam natal boylamla 0,05° içinde değilse sonuç kaydedilmez.";

export const PLANETARY_RETURN_CYCLE_NOTE =
  "Merkür ve Venüs Güneş'e yakın hareket ettiğinden geosantrik dönüşleri yaklaşık yılda birdir (güneş merkezli 88 / 225 günlük yörünge süreleri dönüş aralığı değildir).";

export const motionLabel = (m: "direct" | "retrograde") => (m === "retrograde" ? "geri hareket (retro)" : "ileri hareket");

/**
 * 2026-10-22 (owner): Türkçe arayüzde sağlayıcı metnindeki İNGİLİZCE GEZEGEN ADLARI Türkçe gösterilir ("Bu Saturn dönüşü" →
 * "Bu Satürn dönüşü"). Yalnız terim değişimi — cümle çevrilmez, anlam değişmez, kayıtlı metin DEĞİŞMEZ (yalnız gösterim).
 * Ek almış ad ("Saturn'un") Türkçe ses uyumu değişebileceği için DOKUNULMAZ; yalnız tek başına geçen ad değiştirilir.
 */
const PLANET_NAME_TR: Record<string, string> = {
  Saturn: "Satürn",
  Jupiter: "Jüpiter",
  Venus: "Venüs",
  Mercury: "Merkür",
  Uranus: "Uranüs",
  Neptune: "Neptün",
  Pluto: "Plüton",
};
export function localizePlanetNamesTr(text: string): string {
  return text.replace(/(?<![\p{L}'’])(Saturn|Jupiter|Venus|Mercury|Uranus|Neptune|Pluto)(?![\p{L}'’])/gu, (m) => PLANET_NAME_TR[m] ?? m);
}
