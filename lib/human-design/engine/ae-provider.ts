// FAZ 2A — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Gerçek astronomy-engine tabanlı gezegen boylamı sağlayıcısı.
//
// ÖNEMLİ: Bu dosya yalnızca HAM EKLİPTİK BOYLAM üretir.
//   Gate / line / type / authority / profile / center / channel HESAPLANMAZ.
//   88° design solver YOKTUR.
// Çıktı "production-validated"tır — boylamlar pyswisseph oracle'a karşı ~arcsec
// ve 3 gerçek golden case'in 78/78 gate/line aktivasyonu birebir eşleşti (FAZ 2D).
// (Tam HD chart için type/authority/center/channel katmanı henüz yok.)
//
// ── Astronomik kaynak (lib/cosmic ile aynı kanıtlanmış desen) ────────────────
//   • Gezegenler (Güneş + Merkür..Plüton):
//       AE.Ecliptic(AE.GeoVector(body, date, true)).elon
//       → aberasyon düzeltmeli (apparent), of-date tropikal ekliptik boylam.
//   • Ay: AE.EclipticGeoMoon(date).lon (kozmik motorun doğrulanmış yolu).
//   • NorthNode: osküle eden (true) Ay düğümü — Ay'ın anlık yörünge düzleminin
//       açısal momentumundan (h = r × v) türetilir. Bağımsız çapraz kontrol:
//       AE node-geçiş anında Ay boylamı = hesaplanan düğüm; ayrıca pyswisseph
//       SE_TRUE_NODE ile nokta-testte ~14″ uyum (MEAN_NODE değil).
//
// ── Türetilen cisimler ───────────────────────────────────────────────────────
//   Earth     = Sun + 180°
//   SouthNode = NorthNode + 180°

import * as AE from "astronomy-engine";

import { julianDayToDate } from "./julian";
import type {
  JulianDay,
  PlanetLongitudeProvider,
  PlanetPosition,
  ProviderMetadata,
} from "./types";

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

/** Boylamı [0, 360) aralığına normalize eder. */
function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Gezegen (Ay hariç) apparent of-date tropikal ekliptik boylamı. */
function planetLongitude(body: AE.Body, date: Date): number {
  return AE.Ecliptic(AE.GeoVector(body, date, true)).elon;
}

/** Ay'ın geosentrik of-date ekliptik boylamı. */
function moonLongitude(date: Date): number {
  return AE.EclipticGeoMoon(date).lon;
}

/**
 * Osküle eden (true) yükselen Ay düğümünün ekliptik boylamı.
 *
 * Ay'ın anlık yörünge düzlemi normali h = r × v (açısal momentum). Düğüm çizgisi
 * = ekliptik düzlemiyle kesişim → yükselen düğüm boylamı Ω = atan2(h_x, −h_y).
 * Hız, merkezi sonlu farkla (±1 dk) hesaplanır.
 */
function trueNodeLongitude(date: Date): number {
  const dtMs = 60_000; // ±1 dakika
  const r = AE.Ecliptic(AE.GeoVector(AE.Body.Moon, date, true)).vec;
  const rPlus = AE.Ecliptic(
    AE.GeoVector(AE.Body.Moon, new Date(date.getTime() + dtMs), true),
  ).vec;
  const rMinus = AE.Ecliptic(
    AE.GeoVector(AE.Body.Moon, new Date(date.getTime() - dtMs), true),
  ).vec;

  const v = {
    x: (rPlus.x - rMinus.x) / 2,
    y: (rPlus.y - rMinus.y) / 2,
    z: (rPlus.z - rMinus.z) / 2,
  };

  // h = r × v
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;

  // Yükselen düğüm yönü n = ẑ × h = (−h_y, h_x, 0) → Ω = atan2(h_x, −h_y)
  return norm360((Math.atan2(hx, -hy) * 180) / Math.PI);
}

// ─── Sağlayıcı ────────────────────────────────────────────────────────────────

/**
 * astronomy-engine ile gerçek boylam sağlayıcısı.
 * 11 temel cismi hesaplar; Earth ve SouthNode'u türetir → toplam 13 cisim.
 */
export class AstronomyEnginePlanetLongitudeProvider
  implements PlanetLongitudeProvider
{
  readonly name = "astronomy-engine";

  readonly metadata: ProviderMetadata = {
    provider: "astronomy-engine",
    // FAZ 2D: boylamlar pyswisseph'e karşı ~arcsec doğrulandı; 3 golden case'in
    // 78/78 aktivasyonu birebir eşleşti.
    mode: "production-validated",
    // Osküle eden true node (SE_TRUE_NODE ile ~14″ uyumlu; golden case'lerde doğrulandı).
    nodeType: "true",
  };

  getLongitudes(jd: JulianDay): PlanetPosition[] {
    const date = julianDayToDate(jd);

    const sun = norm360(planetLongitude(AE.Body.Sun, date));
    const northNode = norm360(trueNodeLongitude(date));

    // 11 temel cisim
    const positions: PlanetPosition[] = [
      { planet: "Sun", longitude: sun },
      { planet: "Moon", longitude: norm360(moonLongitude(date)) },
      { planet: "Mercury", longitude: norm360(planetLongitude(AE.Body.Mercury, date)) },
      { planet: "Venus", longitude: norm360(planetLongitude(AE.Body.Venus, date)) },
      { planet: "Mars", longitude: norm360(planetLongitude(AE.Body.Mars, date)) },
      { planet: "Jupiter", longitude: norm360(planetLongitude(AE.Body.Jupiter, date)) },
      { planet: "Saturn", longitude: norm360(planetLongitude(AE.Body.Saturn, date)) },
      { planet: "Uranus", longitude: norm360(planetLongitude(AE.Body.Uranus, date)) },
      { planet: "Neptune", longitude: norm360(planetLongitude(AE.Body.Neptune, date)) },
      { planet: "Pluto", longitude: norm360(planetLongitude(AE.Body.Pluto, date)) },
      { planet: "NorthNode", longitude: northNode },
    ];

    // Türetilen cisimler
    positions.push({ planet: "Earth", longitude: norm360(sun + 180) });
    positions.push({ planet: "SouthNode", longitude: norm360(northNode + 180) });

    return positions;
  }
}
