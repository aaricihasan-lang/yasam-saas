// FAZ 0 — Human Design Engine Skeleton. Production hesap motoru değildir.
//
// Gezegen boylamı sağlayıcısı — MOCK.
// Bu fazda hiçbir gerçek efemeris (Swiss Ephemeris / astronomy-engine) BAĞLI DEĞİLDİR.
// Döndürülen boylamlar astronomik anlam taşımaz; yalnızca arayüzü ve veri akışını
// doğrulamak için deterministik placeholder değerlerdir.

import type {
  JulianDay,
  PlanetLongitudeProvider,
  PlanetName,
  PlanetPosition,
} from "./types";

const PLANETS: readonly PlanetName[] = [
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "NorthNode",
];

/**
 * Deterministik sahte boylam sağlayıcı.
 *
 * Değerler JD'den türetilir ki çıktı tekrarlanabilir olsun, ama bunlar
 * GERÇEK gök konumları DEĞİLDİR. Yalnızca pipeline doğrulaması içindir.
 */
export class MockPlanetLongitudeProvider implements PlanetLongitudeProvider {
  readonly name = "mock-deterministic-faz0";

  getLongitudes(jd: JulianDay): PlanetPosition[] {
    return PLANETS.map((planet, index) => {
      // Her cisme JD ve sabit bir adımdan türeyen sözde-boylam ata.
      const raw = jd * (index + 1) * 0.137 + index * 30;
      const longitude = ((raw % 360) + 360) % 360;
      return { planet, longitude };
    });
  }
}
