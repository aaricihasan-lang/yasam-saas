// Astroloji — KLASİK ASALET ve ALMUTEN (#644) teknik birleştiricisi. Saf; ağ / DB / env yok.
//
// Hesap yolu (owner 01.11.2026, Natal 8 ev deseni): tek birim = Natal birimi (aynı gövde + aynı adaptör → aynı input_hash → aynı
// önbellek satırı). Natal sonucu önbellekteyse YENİ sağlayıcı çağrısı yoktur. Asal + arızi asalet, kabuller, ev başı / harita
// almutenleri ve Lord of the Geniture yerel motorda (lib/astrology/dignities) natal teknik katmanından türetilir.
// Gündüz/gece: Güneş'in geometrik irtifası (motorun natalSect'i). Klasik ev sistemi seçilirse evler Natal'daki gibi türetilir.

import type { NatalTechnical, NodeType } from "../model/western";
import { CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA, DEFAULT_DIGNITY_SCHOOL, isDignitySchool, type ClassicalDignitiesTechnical } from "../model/westernClassicalDignities";
import type { NatalHouseSystemOption } from "../model/natalHouseSystems";
import { buildNatalDignities } from "../dignities/natal";
import { natalSect, prenatalSyzygy } from "../dignities/accidentalNatal";
import type { DignitySchoolId } from "../dignities/schools";
import { CLASSICAL_PLANETS } from "../horary/western/tables";
import { combineNatalTechnical, parseNatalSelectionOptions } from "./natalHouses";

export const CLASSICAL_DIGNITIES_ID = "western.classical_dignities" as const;

export type ClassicalDignitiesOptions = { school: DignitySchoolId; houseSystem: NatalHouseSystemOption; nodeType: NodeType };

/** Seçenekler: ekol (varsayılan Lilly 1647) + Natal'ın 8'li ev sistemi + ay düğümü. Bilinmeyen alan / değer → null (400). */
export function parseClassicalDignitiesOptions(raw: unknown): ClassicalDignitiesOptions | null {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const school = o.school ?? DEFAULT_DIGNITY_SCHOOL;
  if (!isDignitySchool(school)) return null;
  const natal = parseNatalSelectionOptions({ houseSystem: o.houseSystem, nodeType: o.nodeType });
  if (!natal) return null;
  return { school, houseSystem: natal.houseSystem, nodeType: natal.nodeType };
}

/** Natal yankısından doğum anı (UTC ms). Yanıt doğrulanmış sağlayıcı yankısıdır (tarih, saat:dk:sn, UTC ofseti). */
function birthUtcMs(echo: NatalTechnical["echo"]): number {
  const [y, m, d] = echo.date.split("-").map(Number);
  const [hh, mm, ss] = echo.time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, hh, mm, ss || 0) - echo.utcOffsetHours * 3_600_000;
}

/**
 * combineTechnical: Natal teknik katmanından (gerekirse klasik ev türetmesiyle) klasik asalet teknik katmanı. Klasik sistem
 * türetilemezse Natal ile AYNI hata fırlatılır (çağıranlar önce localNatalPrecheck ile açık hata üretir).
 */
export function combineClassicalDignities(parts: unknown[], options: Record<string, unknown>): ClassicalDignitiesTechnical {
  const o = parseClassicalDignitiesOptions(options);
  if (!o) throw new Error("klasik asalet: geçersiz seçenek");
  const natal = combineNatalTechnical(parts, { houseSystem: o.houseSystem, nodeType: o.nodeType }) as NatalTechnical;
  if (!natal.angles) throw new Error("klasik asalet: Yükselen / MC yok (doğum saati gerekli)");
  const byId = new Map(natal.bodies.map((b) => [b.id, b]));
  const positions = Object.fromEntries(
    CLASSICAL_PLANETS.map((p) => {
      const b = byId.get(p);
      if (!b) throw new Error(`klasik asalet: natal konum eksik (${p})`);
      return [p, { lon: b.longitude, speed: Number.isFinite(b.speed) ? b.speed : null }];
    }),
  ) as Parameters<typeof buildNatalDignities>[0]["positions"];
  const cusps = [...natal.houses].sort((a, b) => a.number - b.number).map((h) => h.longitude);
  const utcMs = birthUtcMs(natal.echo);
  const asc = natal.angles.ascendant.longitude;
  const sect = natalSect({ utcMs, latitude: natal.echo.latitude, longitude: natal.echo.longitude, sunLon: positions.sun.lon, asc });
  if ("error" in sect) throw new Error(`klasik asalet: gündüz/gece belirlenemedi (${sect.error})`);
  const syz = prenatalSyzygy(utcMs, "moon");
  const syzygy = "error" in syz ? null : { kind: syz.kind === "new" ? ("new_moon" as const) : ("full_moon" as const), lon: syz.point, atUtc: syz.atUtc, point: syz.chosen };
  const dignities = buildNatalDignities({
    positions,
    asc,
    mc: natal.angles.midheaven.longitude,
    houses: cusps.length === 12 ? { system: o.houseSystem, cusps } : null,
    isDay: sect.day,
    northNode: byId.get("north_node")?.longitude ?? null,
    prenatalSyzygy: syzygy?.lon ?? null,
    school: o.school,
  });
  return {
    schema: CLASSICAL_DIGNITIES_TECHNICAL_SCHEMA,
    zodiac: "tropical",
    houseSystem: o.houseSystem,
    nodeType: o.nodeType,
    sect: { day: sect.day, sunAltitude: sect.sunAltitude, nearHorizon: sect.nearHorizon, disagreesWithEclipticRule: sect.disagreesWithEclipticRule },
    syzygy,
    dignities,
  };
}
