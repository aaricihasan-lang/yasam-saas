// Atlas Vedik aylık zamanlama (2026-10-22) — TEKNİK TANIMI (SAF): `vedic.monthly`.
// Kayıt defterine (techniques.ts) YALNIZ EK olarak girer; mevcut tekniklerin gövde / anahtar / sürümleri değişmez.
//
// Tek teknik, beş İSTEĞE BAĞLI bölüm (ek noktalar tekniğindeki "sections" deseni): her bölüm AYRI uç = ayrı hesap birimi →
// yalnız seçilen bölüm istek açar ve her bölüm kendi önbellek satırında durur. Aylık bölümlerin gövdesi yalnız yıl + ay (+ UTC,
// sidereal) olduğundan doğum verisi GÖNDERİLMEZ ve aynı ay tüm danışanlarda aynı anahtardır. "Doğum anı deklinasyonları" bölümü
// doğum gövdesini kullanır; doğum saati bilinmiyorsa İSTENMEZ (gerekçe planda; diğer bölümler çalışır).
// Gösterim saat dilimi (displayTz) yalnız seçenektedir — gövdeye / anahtara GİRMEZ (aynı ay başka bölgede 0 yeni istek).
// Mevcut Gochara (vedic.transit, tek an + natal), KP rasi geçişleri (kp.transit aralık, KP ayanamsa) ve Graha Drishti
// (vedic.drishti, bütün-burç bakış) DEĞİŞMEZ; bu teknik onların yerine geçmez.

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import { calcInputHash, type CalcIdentity } from "./inputHash";
import type { CalcUnit, TechniqueDefinition, TechniqueProjection, UnitContext } from "./techniques";
import { isValidIanaTimeZone } from "../birth/timeResolution";
import type { AdapterResult } from "../providers/roxy/timing";
import { projectRoxyVedicMonthlySection, ROXY_VEDIC_MONTHLY, vedicMonthlyBody, vedicMonthlySectionOfEndpoint, vedicNatalParallelsBody } from "../providers/roxy/vedicMonthly";
import {
  VEDIC_MONTHLY_PART_SCHEMA,
  VEDIC_MONTHLY_SECTION_LABELS,
  VEDIC_MONTHLY_SECTIONS,
  VEDIC_MONTHLY_TECHNICAL_SCHEMA,
  vedicMonthlySectionsOf,
  vedicMonthOk,
  vedicMonthWindow,
  type VedicMonthlyPart,
  type VedicMonthlySection,
  type VedicMonthlyTechnical,
} from "../model/vedicMonthly";

const o = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;

/** techniques.ts `unit()` ile AYNI kimlik kuralı. */
function unitOf(meta: { endpoint: string; adapter: string }, body: Record<string, unknown>, extra: Partial<CalcUnit> = {}): CalcUnit {
  const identity: CalcIdentity = { provider: ROXY_PROVIDER, providerApiVersion: ROXY_API_VERSION, adapterVersion: meta.adapter, endpoint: meta.endpoint, lang: ASTRO_PROVIDER_LANG, body };
  return { technique: "vedic.monthly", ...identity, inputHash: calcInputHash(identity), covers: [], timeDependent: false, part: 0, ...extra };
}
function fromAdapter<T>(r: AdapterResult<T, null>, projectionVersion: string): TechniqueProjection {
  if (!r.ok) return r;
  return { ok: true, technical: r.technical, technicalSchema: VEDIC_MONTHLY_PART_SCHEMA, interpretation: null, interpretationSchema: null, projectionVersion, unmappedFields: r.unmappedFields, droppedValues: r.droppedValues };
}

/** Bölüm neden istenmez (null = istenir). Yalnız doğum anı bölümü doğum saatine bağlıdır. */
export function vedicMonthlySkipReason(ctx: UnitContext, s: VedicMonthlySection): string | null {
  if (s === "natal_parallels" && ctx.birth.birthTime === null) return "Doğum anı deklinasyonları doğum saatine bağlıdır (Ay deklinasyonu saatte ~0,2°'ye kadar değişir); doğum saati bilinmeden hesaplanmaz.";
  return null;
}

export function parseVedicMonthlyOptions(raw: unknown): Record<string, unknown> | null {
  const r = o(raw);
  if (!vedicMonthOk(r.year, r.month)) return null;
  const sections = vedicMonthlySectionsOf(r.sections);
  if (!sections) return null;
  // Sağlayıcının aylık takvimleri yalnız Lahiri sidereal (veya tropikal) verir → Vedik teknikte yalnız Lahiri.
  if (r.ayanamsa !== undefined && r.ayanamsa !== null && r.ayanamsa !== "" && r.ayanamsa !== "lahiri") return null;
  const out: Record<string, unknown> = { year: r.year, month: r.month, sections, ayanamsa: "lahiri" };
  if (r.displayTz !== undefined) {
    if (typeof r.displayTz !== "string" || !isValidIanaTimeZone(r.displayTz)) return null;
    out.displayTz = r.displayTz;
  }
  return out;
}

export function combineVedicMonthly(parts: unknown[], opt: Record<string, unknown>): VedicMonthlyTechnical {
  const ps = parts.filter((p): p is VedicMonthlyPart => !!p && (p as { schema?: unknown }).schema === VEDIC_MONTHLY_PART_SCHEMA);
  const find = <S extends VedicMonthlySection>(s: S) => ps.find((p) => p.section === s) as Extract<VedicMonthlyPart, { section: S }> | undefined;
  const sections = (vedicMonthlySectionsOf(opt.sections) ?? []) as VedicMonthlySection[];
  const year = Number(opt.year);
  const month = Number(opt.month);
  const ing = find("ingress");
  const asp = find("aspects");
  const lun = find("lunar");
  const par = find("parallels");
  const nat = find("natal_parallels");
  return {
    schema: VEDIC_MONTHLY_TECHNICAL_SCHEMA,
    zodiac: "sidereal",
    frame: { ayanamsa: "lahiri" },
    window: { year, month, ...vedicMonthWindow(year, month) },
    sections,
    ingress: ing ? { start: ing.start, events: ing.events } : null,
    aspects: asp ? { events: asp.events } : null,
    lunar: lun ? { events: lun.events } : null,
    parallels: par ? { events: par.events } : null,
    natalParallels: nat ? { atLocal: nat.atLocal, orb: nat.orb, planets: nat.planets, parallels: nat.parallels } : null,
    missing: sections.filter((s) => !ps.some((p) => p.section === s)),
  };
}

export const vedicMonthly: TechniqueDefinition = {
  id: "vedic.monthly",
  label: "Vedik aylık zamanlama",
  family: "vedic",
  requiresPartner: false,
  // Aylık bölümler doğum verisi kullanmaz; doğum anı bölümü saat yoksa yalnız kendisi atlanır.
  requiresKnownTime: false,
  timeDependent: true,
  parseOptions: (raw) => parseVedicMonthlyOptions(raw),
  units: (ctx, opt) =>
    (opt.sections as VedicMonthlySection[])
      .filter((s) => vedicMonthlySkipReason(ctx, s) === null)
      .map((s) =>
        s === "natal_parallels"
          ? unitOf(ROXY_VEDIC_MONTHLY[s], vedicNatalParallelsBody(ctx.birth), { part: VEDIC_MONTHLY_SECTIONS.indexOf(s) })
          : unitOf(ROXY_VEDIC_MONTHLY[s], vedicMonthlyBody(s, Number(opt.year), Number(opt.month)), { timeDependent: true, part: VEDIC_MONTHLY_SECTIONS.indexOf(s) }),
      ),
  noUnitsReason: (ctx, opt) =>
    (opt.sections as VedicMonthlySection[])
      .map((s) => vedicMonthlySkipReason(ctx, s))
      .filter((x): x is string => !!x)
      .join(" ") || "hesap birimi oluşturulamadı.",
  planInfo: (ctx, opt) => {
    const skipped = (opt.sections as VedicMonthlySection[]).map((s) => ({ section: s, label: VEDIC_MONTHLY_SECTION_LABELS[s], reason: vedicMonthlySkipReason(ctx, s) })).filter((x) => x.reason !== null);
    return skipped.length ? { skippedSections: skipped } : null;
  },
  // Not bağlamı yalnız ayanamsa: aynı danışanın aylık notları aya göre bölünmez.
  noteContext: () => "ayanamsa:lahiri",
  parseNoteContextOptions: (raw) => (Object.keys(raw).join() === "ayanamsa" && raw.ayanamsa === "lahiri" ? { ayanamsa: "lahiri" } : null),
  project: (u, raw) => {
    const s = vedicMonthlySectionOfEndpoint(u.endpoint);
    if (!s) return { ok: false, errors: ["bilinmeyen aylık zamanlama ucu"] };
    return fromAdapter(projectRoxyVedicMonthlySection(s, raw, u.body), ROXY_VEDIC_MONTHLY[s].projection);
  },
  combineTechnical: (parts, opt) => combineVedicMonthly(parts, opt),
};
