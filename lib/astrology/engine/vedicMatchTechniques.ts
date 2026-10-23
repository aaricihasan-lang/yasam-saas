// Atlas yeni teknikler (2026-10-22) — TEKNİK TANIMLARI (SAF): vedic.gun_milan (Ashtakoot Gun Milan + iki kişi Manglik) ve
// vedic.sade_sati. Kayıt defterine (techniques.ts) YALNIZ EK olarak girer; mevcut tekniklerin gövde / anahtar / sürümleri değişmez.
//
// vedic.gun_milan — iki kişili (Sinastri/Kompozit deseni: partnerProfileId + karşı taraf revizyonu sunucuda çözülür):
//   parça 0 (ZORUNLU) /vedic-astrology/compatibility · parça 1 Manglik (analiz edilen kişi) · parça 2 Manglik (karşı taraf).
//   Uyum yanıtı Manglik VERMEZ (golden 2026-10-22) → kişi başına ayrı birim; gövde yalnız o kişinin doğum verisi olduğundan
//   önbellek KİŞİ BAŞINADIR (aynı kişi başka eşleştirmede yeniden ücretlenmez).
//   person1 = analiz edilen kişi, person2 = karşı taraf (geleneksel sırada person1 erkek / person2 kadın kabul edilir; Yaşam
//   bu yönü kullanıcıya dayatmaz — yön ekranda ve raporda açıkça yazılır).
// vedic.sade_sati — sağlayıcı durumu ÇAĞRI ANINA göre verir (gövdede tarih yok). Bu yüzden değerlendirme günü (UTC takvim günü,
//   sunucu saati) önbellek anahtarına girer: aynı gün = aynı anahtar, ertesi gün yeni hesap. Gövdeye tarih EKLENMEZ.
// İki teknik de doğum saati ister (Ay ~13°/gün: nakshatra / burç saatsiz güvenilmez) → TIME_REQUIRED (karşı taraf için de).

import { ASTRO_PROVIDER_LANG, ROXY_API_VERSION, ROXY_PROVIDER } from "../config";
import { calcInputHash, type CalcIdentity } from "./inputHash";
import type { CalcUnit, TechniqueDefinition, TechniqueProjection, UnitContext } from "./techniques";
import { vedicBirthBody, VEDIC_AYANAMSAS, type BirthPoint, type VedicAyanamsa } from "../providers/roxy/requests";
import { vedicCompatibilityBody, vedicDoshaBody } from "../providers/roxy/vedicMatchRequests";
// 22.10 (Draft): Sade Sati dönem tarihleri — bayrak KAPALIYKEN hiçbir şey eklenmez (teknik veri eskisiyle birebir).
import { attachSadeSatiPeriods, isSadeSatiPeriodsEnabled } from "../sadeSati/attach";
import { projectRoxyVedicGunMilan, projectRoxyVedicManglik, projectRoxyVedicSadeSati, ROXY_VEDIC_COMPATIBILITY, ROXY_VEDIC_MANGLIK, ROXY_VEDIC_SADHESATI } from "../providers/roxy/vedicMatch";
import { ROXY_VEDIC_D1 } from "../providers/roxy/vedic";
import type { AdapterResult } from "../providers/roxy/timing";
import { VEDIC_D1_TECHNICAL_SCHEMA, type VedicD1Technical } from "../model/vedic";
import {
  VEDIC_GUN_MILAN_INTERP_SCHEMA,
  VEDIC_GUN_MILAN_PART_SCHEMA,
  VEDIC_GUN_MILAN_TECHNICAL_SCHEMA,
  VEDIC_MANGLIK_INTERP_SCHEMA,
  VEDIC_MANGLIK_PART_SCHEMA,
  VEDIC_SADE_SATI_INTERP_SCHEMA,
  VEDIC_SADE_SATI_TECHNICAL_SCHEMA,
  type MatchMoon,
  type VedicGunMilanPart,
  type VedicGunMilanTechnical,
  type VedicManglikPart,
  type VedicSadeSatiTechnical,
} from "../model/vedicMatch";

const o = (raw: unknown) => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** techniques.ts ayanamsaOf ile AYNI kural (yoksa lahiri; bilinmeyen → ret). Döngüsel içe aktarmayı önlemek için yerel. */
function ayOf(v: unknown): VedicAyanamsa | null {
  if (v === undefined || v === null || v === "") return "lahiri";
  return typeof v === "string" && (VEDIC_AYANAMSAS as readonly string[]).includes(v) ? (v as VedicAyanamsa) : null;
}

/** techniques.ts `unit()` ile AYNI kimlik → aynı gövdeli mevcut birimle (ör. Vedik D1) aynı anahtar. `keyExtra` yalnız anahtara girer. */
function unitOf(technique: CalcUnit["technique"], meta: { endpoint: string; adapter: string }, body: Record<string, unknown>, extra: Partial<CalcUnit> = {}, keyExtra?: Record<string, string>): CalcUnit {
  const identity: CalcIdentity = { provider: ROXY_PROVIDER, providerApiVersion: ROXY_API_VERSION, adapterVersion: meta.adapter, endpoint: meta.endpoint, lang: ASTRO_PROVIDER_LANG, body };
  // keyExtra: sağlayıcıya GİTMEZ; yalnız anahtar kimliğinde gövdeye eklenmiş gibi hash'lenir (Sade Sati değerlendirme günü).
  const inputHash = calcInputHash(keyExtra ? { ...identity, body: { ...body, ...keyExtra } } : identity);
  return { technique, ...identity, inputHash, covers: [], timeDependent: false, part: 0, ...extra };
}
function fromAdapter<T, I>(r: AdapterResult<T, I>, technicalSchema: string, interpretationSchema: string, projectionVersion: string): TechniqueProjection {
  if (!r.ok) return r;
  return { ok: true, technical: r.technical, technicalSchema, interpretation: r.interpretation, interpretationSchema: r.interpretation === null ? null : interpretationSchema, projectionVersion, unmappedFields: r.unmappedFields, droppedValues: r.droppedValues };
}
/** Vedik D1 bağlam birimi (YALNIZ önbellek; plana girmez): vedic.d1 tekniğinin birimiyle BİREBİR aynı kimlik. */
const d1Unit = (b: BirthPoint, ay: VedicAyanamsa) => unitOf("vedic.d1", ROXY_VEDIC_D1, vedicBirthBody(b, ay));
function moonOf(t: unknown, ay: unknown): MatchMoon | null {
  const d = t as VedicD1Technical | null;
  if (!d || d.schema !== VEDIC_D1_TECHNICAL_SCHEMA || d.frame?.ayanamsa !== ay) return null;
  const m = d.grahas.find((g) => g.id === "moon");
  return m ? { rashi: m.rashi, nakshatra: m.nakshatra.id, pada: m.nakshatra.pada } : null;
}

// ─── Gun Milan ───────────────────────────────────────────────────────────────
export const vedicGunMilan: TechniqueDefinition = {
  id: "vedic.gun_milan",
  label: "Gun Milan (Ashtakoot eşleştirme)",
  family: "vedic",
  requiresPartner: true,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw) => {
    const r = o(raw);
    const ay = ayOf(r.ayanamsa);
    if (typeof r.partnerProfileId !== "string" || !UUID_RE.test(r.partnerProfileId) || !ay) return null;
    const rev = r.partnerRevision === undefined || r.partnerRevision === null ? null : Number(r.partnerRevision);
    if (rev !== null && (!Number.isInteger(rev) || rev < 1)) return null;
    // 22.10 hesaplama rolü: yalnız "partner_first" yazılır → varsayılan seçenek / not bağlamı / anahtar eskisiyle BİREBİR.
    if (r.order !== undefined && r.order !== null && r.order !== "client_first" && r.order !== "partner_first") return null;
    return { partnerProfileId: r.partnerProfileId.toLowerCase(), partnerRevision: rev, ayanamsa: ay, ...(r.order === "partner_first" ? { order: "partner_first" } : {}) };
  },
  units: (ctx: UnitContext, opt) => {
    if (!ctx.partner) return [];
    const ay = opt.ayanamsa as VedicAyanamsa;
    // Rol sırası gövdeyi GERÇEKTEN değiştirir (person1 ↔ person2); Manglik parçaları da rol sırasıyla (1 = 1. rol, 2 = 2. rol) —
    // gövde kişinin kendi doğum verisi olduğundan önbellek kişi başına ortaktır (takas ek Manglik ücreti doğurmaz).
    const [r1, r2] = opt.order === "partner_first" ? [ctx.partner, ctx.birth] : [ctx.birth, ctx.partner];
    return [
      unitOf("vedic.gun_milan", ROXY_VEDIC_COMPATIBILITY, vedicCompatibilityBody(r1, r2, ay)),
      unitOf("vedic.gun_milan", ROXY_VEDIC_MANGLIK, vedicDoshaBody(r1, ay), { part: 1 }),
      unitOf("vedic.gun_milan", ROXY_VEDIC_MANGLIK, vedicDoshaBody(r2, ay), { part: 2 }),
    ];
  },
  // Uyum birimi zorunlu (sağlayıcı yorumu da yalnız ondan); Manglik parçaları isteğe bağlı (eksikse Manglik gösterilmez).
  primaryPart: 0,
  combineTechnical: (parts, opt) => {
    const t = combineGunMilan(parts);
    return t && opt?.order === "partner_first" ? { ...t, order: "partner_first" as const } : t;
  },
  // Ay bağlamı da rol sırasıyla (moons.person1 = 1. rol).
  contextUnits: (ctx, opt) =>
    ctx.partner
      ? (opt.order === "partner_first" ? [ctx.partner, ctx.birth] : [ctx.birth, ctx.partner]).map((b) => d1Unit(b, opt.ayanamsa as VedicAyanamsa))
      : [],
  attachContext: (technical, context, opt) => {
    if (!technical) return technical;
    const p1 = moonOf(context[0] ?? null, opt.ayanamsa);
    const p2 = moonOf(context[1] ?? null, opt.ayanamsa);
    return p1 || p2 ? { ...(technical as object), moons: { person1: p1, person2: p2 } } : technical;
  },
  project: (u, raw, opt) => {
    const ay = opt.ayanamsa as VedicAyanamsa;
    if (u.endpoint === ROXY_VEDIC_MANGLIK.endpoint) return fromAdapter(projectRoxyVedicManglik(raw, { ayanamsa: ay }), VEDIC_MANGLIK_PART_SCHEMA, VEDIC_MANGLIK_INTERP_SCHEMA, ROXY_VEDIC_MANGLIK.projection);
    return fromAdapter(projectRoxyVedicGunMilan(raw, { ayanamsa: ay }), VEDIC_GUN_MILAN_PART_SCHEMA, VEDIC_GUN_MILAN_INTERP_SCHEMA, ROXY_VEDIC_COMPATIBILITY.projection);
  },
};

/**
 * Parçalar (uyum + Manglik A + Manglik B) → tek teknik veri. Parçalar birim sırasıyla gelir; başarısız parça listeden ÇIKAR.
 * Manglik kişiye ancak ÜÇ parça birden varsa atanır (bir Manglik parçası eksikse hangisinin kaldığı sıradan güvenle bilinemez →
 * Manglik hiç gösterilmez; yanlış kişiye atama YOK).
 */
export function combineGunMilan(parts: unknown[]): VedicGunMilanTechnical | null {
  const base = parts.find((x) => (x as { schema?: string })?.schema === VEDIC_GUN_MILAN_PART_SCHEMA) as VedicGunMilanPart | undefined;
  if (!base) return null;
  const m = parts.filter((x) => (x as { schema?: string })?.schema === VEDIC_MANGLIK_PART_SCHEMA) as VedicManglikPart[];
  const strip = (x: VedicManglikPart) => ({ present: x.present, severity: x.severity, exceptions: x.exceptions });
  return { ...base, schema: VEDIC_GUN_MILAN_TECHNICAL_SCHEMA, manglik: parts.length === 3 && m.length === 2 && parts[0] === base ? { person1: strip(m[0]), person2: strip(m[1]) } : null };
}

// ─── Sade Sati ───────────────────────────────────────────────────────────────
/** Değerlendirme günü: sunucunun UTC takvim günü (istemci değeri kabul EDİLMEZ — gövde tarih taşımadığı için yanlış anahtar olur). */
export const sadeSatiAsOf = (now: Date): string | null => (Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : null);

export const vedicSadeSati: TechniqueDefinition = {
  id: "vedic.sade_sati",
  label: "Sade Sati",
  family: "vedic",
  requiresPartner: false,
  requiresKnownTime: true,
  timeDependent: true,
  parseOptions: (raw, now) => {
    const ay = ayOf(o(raw).ayanamsa);
    const asOf = sadeSatiAsOf(now);
    return ay && asOf ? { ayanamsa: ay, asOf } : null;
  },
  units: (ctx, opt) => [unitOf("vedic.sade_sati", ROXY_VEDIC_SADHESATI, vedicDoshaBody(ctx.birth, opt.ayanamsa as VedicAyanamsa), { timeDependent: true }, { evaluationDateUtc: String(opt.asOf) })],
  // Not bağlamı yalnız ayanamsa (değerlendirme günü değil): aynı danışanın Sade Sati notları güne göre bölünmez.
  noteContext: (opt) => `ayanamsa:${String(opt.ayanamsa)}`,
  parseNoteContextOptions: (raw) => {
    const ay = Object.keys(raw).join() === "ayanamsa" ? ayOf(raw.ayanamsa) : null;
    return ay ? { ayanamsa: ay } : null;
  },
  contextUnits: (ctx, opt) => [d1Unit(ctx.birth, opt.ayanamsa as VedicAyanamsa)],
  attachContext: (technical, context, opt, info) => {
    if (!technical) return technical;
    const j = moonOf(context[0] ?? null, opt.ayanamsa);
    const t = j ? { ...(technical as VedicSadeSatiTechnical), janma: j } : (technical as VedicSadeSatiTechnical);
    // Dönem tarihleri yalnız bayrak açıkken; Janma Rashi önbellekteki D1'den (ücretli istek yok), fail-closed.
    return isSadeSatiPeriodsEnabled() ? attachSadeSatiPeriods(t, context[0] ?? null, info?.birthUtc ?? null) : t;
  },
  project: (_u, raw, opt) =>
    fromAdapter(projectRoxyVedicSadeSati(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa, asOf: String(opt.asOf) }), VEDIC_SADE_SATI_TECHNICAL_SCHEMA, VEDIC_SADE_SATI_INTERP_SCHEMA, ROXY_VEDIC_SADHESATI.projection),
};

// 22.10 gece (yalnız ek): On Porutham / Papasamyam tanımları (vedicPoruthamTechniques.ts) aynı birim kimliği ve projeksiyon
// sarmalayıcısını kullanır. Gun Milan davranışı değişmez.
export { unitOf as vedicMatchUnitOf, fromAdapter as vedicMatchFromAdapter };
