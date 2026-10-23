// Vedik noktalar (22.10.2026) — TEKNİK TANIMLARI (SAF): vedic.upagraha ve vedic.heliacal. Kayıt defterine (techniques.ts) YALNIZ EK
// olarak girer; mevcut tekniklerin gövde / anahtar / sürümleri değişmez.
//
// vedic.upagraha — tek kişi, doğum gövdesi (Vedik D1 ile aynı biçim: tarih, saat, konum, ofset, ayanamsa) → /vedic-astrology/upagraha.
//   Doğum saati ZORUNLU (zaman tabanlı noktalar yükselen derecedir; Güneş türevliler Güneş boylamına bağlı). Vedik D1 kaydı aynı
//   doğum + ayanamsa ile önbellekteyse YALNIZ-ÖNBELLEK bağlam birimi olarak okunur (plana girmez, istek yok): Lagna rashisinden
//   bütün-burç ev + D1 Güneş'i ile Güneş türevli zincirin tutarlılığı.
// vedic.heliacal — doğum anı KULLANILMAZ: YEREL GÜN (boş = doğum günü) + GÖZLEM YERİ (boş = doğum yeri) → /vedic-astrology/heliacal.
//   Gün / yer / ofset sunucuda çözülür (service.ts; Ayrıntılı Panchanga ile aynı kural); |enlem| > 60° → istek YOK. Doğum saati
//   gerekmez. Ayanamsa yok (görünürlük çerçeveden bağımsız).

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import { calcInputHash, type CalcIdentity } from "./inputHash";
import type { CalcUnit, TechniqueDefinition, TechniqueProjection } from "./techniques";
import { vedicBirthBody, VEDIC_AYANAMSAS, type BirthPoint, type VedicAyanamsa } from "../providers/roxy/requests";
import { ROXY_VEDIC_D1 } from "../providers/roxy/vedic";
import { heliacalBody, projectRoxyVedicHeliacal, projectRoxyVedicUpagraha, ROXY_VEDIC_HELIACAL, ROXY_VEDIC_UPAGRAHA } from "../providers/roxy/vedicNoktalar";
import type { AdapterResult } from "../providers/roxy/timing";
import { isValidIsoDate } from "../birth/timeResolution";
import { SIGN_IDS } from "../model/western";
import { VEDIC_D1_TECHNICAL_SCHEMA, type VedicD1Technical } from "../model/vedic";
import { UPAGRAHA_SUN_TOLERANCE, VEDIC_HELIACAL_TECHNICAL_SCHEMA, VEDIC_UPAGRAHA_TECHNICAL_SCHEMA, type VedicUpagrahaTechnical } from "../model/vedicNoktalar";

const o = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
/** techniques.ts ayanamsaOf ile AYNI kural (yoksa lahiri; bilinmeyen → ret). Döngüsel içe aktarmayı önlemek için yerel. */
function ayOf(v: unknown): VedicAyanamsa | null {
  if (v === undefined || v === null || v === "") return "lahiri";
  return typeof v === "string" && (VEDIC_AYANAMSAS as readonly string[]).includes(v) ? (v as VedicAyanamsa) : null;
}
/** techniques.ts `unit()` ile AYNI kimlik → aynı gövdeli mevcut birimle (ör. Vedik D1) aynı anahtar. */
function unitOf(technique: CalcUnit["technique"], meta: { endpoint: string; adapter: string }, body: Record<string, unknown>, extra: Partial<CalcUnit> = {}): CalcUnit {
  const identity: CalcIdentity = { provider: ROXY_PROVIDER, providerApiVersion: ROXY_API_VERSION, adapterVersion: meta.adapter, endpoint: meta.endpoint, lang: ASTRO_PROVIDER_LANG, body };
  return { technique, ...identity, inputHash: calcInputHash(identity), covers: [], timeDependent: false, part: 0, ...extra };
}
function fromAdapter<T>(r: AdapterResult<T, null>, technicalSchema: string, projectionVersion: string): TechniqueProjection {
  if (!r.ok) return r;
  return { ok: true, technical: r.technical, technicalSchema, interpretation: null, interpretationSchema: null, projectionVersion, unmappedFields: r.unmappedFields, droppedValues: r.droppedValues };
}
/** Vedik D1 bağlam birimi (YALNIZ önbellek; plana girmez): vedic.d1 tekniğinin birimiyle BİREBİR aynı kimlik. */
const d1Unit = (b: BirthPoint, ay: VedicAyanamsa) => unitOf("vedic.d1", ROXY_VEDIC_D1, vedicBirthBody(b, ay));

/** D1 bağlamı → ev (Lagna'dan bütün-burç) + Güneş tutarlılığı. Bağlam yoksa / çerçeve farklıysa teknik veri AYNEN döner. */
export function attachUpagrahaD1(technical: unknown, d1raw: unknown, ayanamsa: unknown): unknown {
  const t = technical as VedicUpagrahaTechnical | null;
  const d = d1raw as VedicD1Technical | null;
  if (!t || t.schema !== VEDIC_UPAGRAHA_TECHNICAL_SCHEMA || !d || d.schema !== VEDIC_D1_TECHNICAL_SCHEMA || d.frame?.ayanamsa !== ayanamsa || !d.lagna) return technical;
  const sun = d.grahas.find((g) => g.id === "sun");
  if (!sun) return technical;
  const lagna = d.lagna.rashi;
  const house = (r: string) => ((SIGN_IDS.indexOf(r as (typeof SIGN_IDS)[number]) - SIGN_IDS.indexOf(lagna) + 12) % 12) + 1;
  const diff = Math.abs(((t.impliedSun - sun.longitude + 540) % 360) - 180);
  return {
    ...t,
    timeBased: t.timeBased.map((p) => ({ ...p, house: house(p.rashi) })),
    sunBased: t.sunBased.map((p) => ({ ...p, house: house(p.rashi) })),
    d1: { lagnaRashi: lagna, sunLongitude: sun.longitude, sunDiff: Math.round(diff * 1e4) / 1e4, sunConsistent: diff <= UPAGRAHA_SUN_TOLERANCE },
  };
}

// ─── Upagraha ────────────────────────────────────────────────────────────────
export const vedicUpagraha: TechniqueDefinition = {
  id: "vedic.upagraha",
  label: "Upagrahalar",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const ay = ayOf(o(raw).ayanamsa);
    return ay ? { ayanamsa: ay } : null;
  },
  units: (ctx, opt) => [unitOf("vedic.upagraha", ROXY_VEDIC_UPAGRAHA, vedicBirthBody(ctx.birth, opt.ayanamsa as VedicAyanamsa))],
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}`,
  contextUnits: (ctx, opt) => [d1Unit(ctx.birth, opt.ayanamsa as VedicAyanamsa)],
  attachContext: (technical, context, opt) => attachUpagrahaD1(technical, context[0] ?? null, opt.ayanamsa),
  project: (_u, raw, opt) => fromAdapter(projectRoxyVedicUpagraha(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa }), VEDIC_UPAGRAHA_TECHNICAL_SCHEMA, ROXY_VEDIC_UPAGRAHA.projection),
};

// ─── Heliakal ────────────────────────────────────────────────────────────────
const LOCATION_ID_RE = /^[A-Za-z0-9_\-]{2,64}$/;
/**
 * Seçenekler: `date` (YYYY-MM-DD, 1600–2600; boş = doğum günü) + `placeLocationId` (konum kimliği; boş = doğum yeri). Sunucunun çözdüğü
 * alanlar (place, offsetHours) ayrıştırmada YOK SAYILIR ve service.ts tarafından her seferinde yeniden üretilir.
 */
export function heliacalOptionsOf(raw: unknown): { date: string | null; placeLocationId: string | null } | null {
  const r = o(raw);
  const d = r.date;
  const date = d === undefined || d === null || d === "" ? null : typeof d === "string" && isValidIsoDate(d) && d >= "1600-01-01" && d <= "2600-12-31" ? d : undefined;
  const p = r.placeLocationId;
  const place = p === undefined || p === null || p === "" ? null : typeof p === "string" && LOCATION_ID_RE.test(p) ? p : undefined;
  if (date === undefined || place === undefined) return null;
  return { date, placeLocationId: place };
}

export const vedicHeliacal: TechniqueDefinition = {
  id: "vedic.heliacal",
  label: "Graha Asta / Udaya (heliakal görünürlük)",
  family: "vedic",
  requiresPartner: false,
  // Doğum anı kullanılmaz (gün + yer): saat bilinmeyen danışan için de hesaplanır.
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => heliacalOptionsOf(raw),
  units: (ctx, opt) => {
    if (typeof opt.date !== "string" || typeof opt.offsetHours !== "number") return [];
    const place = ctx.places?.target ?? { latitude: ctx.birth.latitude, longitude: ctx.birth.longitude };
    return [unitOf("vedic.heliacal", ROXY_VEDIC_HELIACAL, heliacalBody(opt.date, place, opt.offsetHours), { timeDependent: true })];
  },
  noUnitsReason: () => "Değerlendirme günü veya yerin saat dilimi çözülemedi.",
  project: (u, raw, opt) => {
    const b = u.body as { date: string; latitude: number; longitude: number; timezone: number };
    const pl = (opt.place ?? null) as { label?: unknown; timezone?: unknown } | null;
    return fromAdapter(
      projectRoxyVedicHeliacal(raw, {
        date: b.date,
        latitude: b.latitude,
        longitude: b.longitude,
        utcOffsetHours: b.timezone,
        label: typeof pl?.label === "string" ? pl.label.slice(0, 120) : null,
        timeZone: typeof pl?.timezone === "string" ? pl.timezone : null,
      }),
      VEDIC_HELIACAL_TECHNICAL_SCHEMA,
      ROXY_VEDIC_HELIACAL.projection,
    );
  },
};
