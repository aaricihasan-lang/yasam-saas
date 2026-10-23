// Atlas Roxy kalan teknikler (2026-10-22 gece) — TEKNİK TANIMLARI (SAF): vedic.dashakoot (Güney Hint On Porutham) ve
// vedic.papasamyam. Kayıt defterine (techniques.ts) YALNIZ EK olarak girer; Gun Milan dahil mevcut tekniklerin gövde / anahtar /
// sürümleri değişmez. Gun Milan'dan AYRI hesap kimliği (ayrı uç + ayrı adaptör sürümü → ayrı önbellek anahtarı) ve ayrı şema.
//
// İki kişi altyapısı Gun Milan'dan AYNEN yeniden kullanılır: seçenek ayrıştırma (partnerProfileId, partnerRevision, ayanamsa,
// rol sırası `order: "partner_first"` — varsayılanda alan YAZILMAZ), karşı tarafın saat denetimi (service.ts, requiresKnownTime),
// PARTNER_SAME_PROFILE, iki kişi gövdesi (vedicCompatibilityBody: person1 = 1. rol / damat, person2 = 2. rol / gelin) ve
// Dashakoot için önbellekteki Vedik D1'den Ay bağlamı (0 ek istek). Rol takası gövdeyi GERÇEKTEN değiştirir (person1 ↔ person2).

import type { TechniqueDefinition } from "./techniques";
import type { BirthPoint, VedicAyanamsa } from "../providers/roxy/requests";
import { vedicCompatibilityBody } from "../providers/roxy/vedicMatchRequests";
import { projectRoxyVedicDashakoot, projectRoxyVedicPapasamyam, ROXY_VEDIC_DASHAKOOT, ROXY_VEDIC_PAPASAMYAM } from "../providers/roxy/vedicPorutham";
import { vedicGunMilan, vedicMatchFromAdapter, vedicMatchUnitOf } from "./vedicMatchTechniques";
import { VEDIC_DASHAKOOT_INTERP_SCHEMA, VEDIC_DASHAKOOT_TECHNICAL_SCHEMA, VEDIC_PAPASAMYAM_INTERP_SCHEMA, VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA } from "../model/vedicPorutham";

/** [1. rol, 2. rol] doğum verisi: varsayılan danışan 1. rol; "partner_first" → karşı taraf 1. rol. */
const roles = (birth: BirthPoint, partner: BirthPoint, opt: Record<string, unknown>): [BirthPoint, BirthPoint] => (opt.order === "partner_first" ? [partner, birth] : [birth, partner]);
const withOrder = (parts: unknown[], opt: Record<string, unknown>) => {
  const t = parts[0];
  if (!t || typeof t !== "object") return null;
  return opt?.order === "partner_first" ? { ...(t as object), order: "partner_first" as const } : t;
};

export const vedicDashakoot: TechniqueDefinition = {
  id: "vedic.dashakoot",
  label: "On Porutham (Dashakoot)",
  family: "vedic",
  requiresPartner: true,
  requiresKnownTime: true,
  timeDependent: false,
  // Gun Milan ile AYNI seçenek sözleşmesi (karşı taraf, revizyon, ayanamsa, rol sırası).
  parseOptions: (raw, now) => vedicGunMilan.parseOptions(raw, now),
  units: (ctx, opt) => {
    if (!ctx.partner) return [];
    const [r1, r2] = roles(ctx.birth, ctx.partner, opt);
    return [vedicMatchUnitOf("vedic.dashakoot", ROXY_VEDIC_DASHAKOOT, vedicCompatibilityBody(r1, r2, opt.ayanamsa as VedicAyanamsa))];
  },
  combineTechnical: (parts, opt) => withOrder(parts, opt),
  // Ay bağlamı (önbellekteki Vedik D1; rol sırasıyla) — Gun Milan ile aynı birimler ve ekleme kuralı.
  contextUnits: (ctx, opt) => vedicGunMilan.contextUnits!(ctx, opt),
  attachContext: (technical, context, opt) => vedicGunMilan.attachContext!(technical, context, opt),
  project: (_u, raw, opt) => vedicMatchFromAdapter(projectRoxyVedicDashakoot(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa }), VEDIC_DASHAKOOT_TECHNICAL_SCHEMA, VEDIC_DASHAKOOT_INTERP_SCHEMA, ROXY_VEDIC_DASHAKOOT.projection),
};

export const vedicPapasamyam: TechniqueDefinition = {
  id: "vedic.papasamyam",
  label: "Papasamyam",
  family: "vedic",
  requiresPartner: true,
  requiresKnownTime: true,
  timeDependent: false,
  parseOptions: (raw, now) => vedicGunMilan.parseOptions(raw, now),
  units: (ctx, opt) => {
    if (!ctx.partner) return [];
    const [r1, r2] = roles(ctx.birth, ctx.partner, opt);
    return [vedicMatchUnitOf("vedic.papasamyam", ROXY_VEDIC_PAPASAMYAM, vedicCompatibilityBody(r1, r2, opt.ayanamsa as VedicAyanamsa))];
  },
  combineTechnical: (parts, opt) => withOrder(parts, opt),
  project: (_u, raw, opt) => vedicMatchFromAdapter(projectRoxyVedicPapasamyam(raw, { ayanamsa: opt.ayanamsa as VedicAyanamsa }), VEDIC_PAPASAMYAM_TECHNICAL_SCHEMA, VEDIC_PAPASAMYAM_INTERP_SCHEMA, ROXY_VEDIC_PAPASAMYAM.projection),
};
