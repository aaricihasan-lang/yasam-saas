/**
 * "Sabit taban" kilit testleri için (J / E SABİT: mevcut tekniklerin gövde + adaptör + input_hash özeti) — ATL-B03 (14.11.2026).
 *
 * kp.horary gövdesi ve adaptörü BİLİNÇLİ değişti (UTC / timezone 0 + astro-roxy-kp-horary-1 → yerel saat + ofset + -2). Kilit
 * özetleri değiştirilmez: kp.horary satırı ESKİ kuralla (o kurulumun birebir kopyası) yeniden üretilir ve taban özete girer → özet
 * tutuyorsa diğer HER teknik bayt düzeyinde aynıdır. Aynı çağrıda yeni birim de kurulur ve farkın YALNIZ amaçlanan alanlarda olduğu
 * denetlenir (tarih/saat/ofset + adaptör; aynı UTC an, aynı uç, aynı diğer alanlar). Ürün kodu bu dosyayı kullanmaz.
 */
import assert from "node:assert/strict";
import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "@/lib/astrology/config";
import { calcInputHash } from "@/lib/astrology/engine/inputHash";
import type { CalcUnit, TechniqueDefinition } from "@/lib/astrology/engine/techniques";
import { ROXY_KP_HORARY } from "@/lib/astrology/providers/roxy/kp";

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
const LEGACY_ADAPTER = "astro-roxy-kp-horary-1";

/** ATL-B03 öncesi kp.horary birimi (birebir eski kurulum: UTC an, timezone 0, adaptör -1). */
export function legacyKpHoraryUnit(ctx: { birth: { latitude: number; longitude: number }; places?: { target?: { latitude: number; longitude: number } } }, o: Record<string, unknown>): CalcUnit {
  const place = ctx.places?.target ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
  const at = String(o.atUtc);
  const body = { horaryNumber: Number(o.horaryNumber), date: at.slice(0, 10), time: `${at.slice(11, 16)}:00`, latitude: r6(place.latitude), longitude: r6(place.longitude), timezone: 0, ayanamsa: o.ayanamsa, nodeType: o.nodeType };
  const identity = { provider: ROXY_PROVIDER, providerApiVersion: ROXY_API_VERSION, adapterVersion: LEGACY_ADAPTER, endpoint: ROXY_KP_HORARY.endpoint, lang: ASTRO_PROVIDER_LANG, body };
  return { technique: "kp.horary", ...identity, inputHash: calcInputHash(identity), covers: [], timeDependent: true, part: 0 } as CalcUnit;
}

/** Kilit testinde def.units yerine: kp.horary → eski birim (+ yeni birimin farkı denetlenir); diğer teknikler → def.units aynen. */
export function lockUnits(def: TechniqueDefinition, ctx: unknown, o: Record<string, unknown>): CalcUnit[] {
  if (def.id !== "kp.horary") return def.units(ctx as never, o);
  const legacy = legacyKpHoraryUnit(ctx as never, o);
  const fresh = def.units(ctx as never, { ...o, offsetHours: 3 })[0];
  const lb = legacy.body as Record<string, unknown>;
  const fb = fresh.body as Record<string, unknown>;
  assert.equal(fresh.endpoint, legacy.endpoint);
  assert.equal(fresh.adapterVersion, ROXY_KP_HORARY.adapter);
  assert.notEqual(fresh.inputHash, legacy.inputHash, "yeni gövde ayrı önbellek anahtarı");
  assert.equal(Date.parse(`${String(fb.date)}T${String(fb.time)}Z`) - Number(fb.timezone) * 3_600_000, Date.parse(`${String(lb.date)}T${String(lb.time)}Z`), "aynı UTC an");
  const strip = (b: Record<string, unknown>) => Object.fromEntries(Object.entries(b).filter(([k]) => !["date", "time", "timezone"].includes(k)));
  assert.deepEqual(strip(fb), strip(lb), "tarih/saat/ofset dışında gövde aynı");
  return [legacy];
}
