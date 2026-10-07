// Astroloji owner UI — teknik seçimi için İSTEMCİ meta verisi (SAF).
// Sunucudaki teknik tanımları (lib/astrology/engine/techniques) istemci paketine ALINMAZ; burada yalnız
// etiket + hangi parametrenin sorulacağı tutulur. Seçenekler sunucuda yeniden doğrulanır/normalize edilir.

import type { HouseSystem, NodeType } from "@/lib/astrology/model/western";

export const UI_TECHNIQUES = [
  "western.natal",
  "western.transit",
  "western.forecast",
  "western.progression",
  "western.solar_arc",
  "western.solar_return",
  "western.lunar_return",
  "western.synastry",
  "western.composite",
  "western.astrocartography",
  "western.relocation",
  "western.local_space",
] as const;
export type UiTechniqueId = (typeof UI_TECHNIQUES)[number];

export const TECHNIQUE_META: Record<UiTechniqueId, { label: string; hint: string; needsPartner: boolean; needsTime: boolean }> = {
  "western.natal": { label: "Natal", hint: "Doğum haritası", needsPartner: false, needsTime: false },
  "western.transit": { label: "Transit (tek an)", hint: "Seçilen andaki gökyüzü → natal açılar", needsPartner: false, needsTime: false },
  "western.forecast": { label: "Transit takvimi", hint: "Dönem boyunca açı, burç girişi, istasyon, tutulma, Ay evresi", needsPartner: false, needsTime: false },
  "western.progression": { label: "Secondary progression", hint: "Gün = yıl ilerletilmiş harita", needsPartner: false, needsTime: false },
  "western.solar_arc": { label: "Solar arc", hint: "Tüm noktalar ilerletilmiş Güneş yayı kadar", needsPartner: false, needsTime: false },
  "western.solar_return": { label: "Solar return", hint: "Güneş'in natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.lunar_return": { label: "Lunar return", hint: "Ay'ın natal konumuna dönüş haritası (doğum yeri)", needsPartner: false, needsTime: true },
  "western.synastry": { label: "Sinastri", hint: "İki kişinin haritaları arası açılar + ev bindirmesi", needsPartner: true, needsTime: false },
  "western.composite": { label: "Composite", hint: "İki haritanın orta nokta haritası", needsPartner: true, needsTime: false },
  "western.astrocartography": { label: "Astrocartography", hint: "Gezegen MC/IC/AC/DC hatları — dünya haritası", needsPartner: false, needsTime: true },
  "western.relocation": { label: "Relocation", hint: "Aynı doğum anı, yeni konum: ASC/MC/evler", needsPartner: false, needsTime: true },
  "western.local_space": { label: "Local Space", hint: "Doğum anında ufuk yönleri (pusula + harita)", needsPartner: false, needsTime: true },
};

export type TechniqueParams = {
  transitMode: "now" | "custom";
  transitDate: string;
  transitTime: string;
  transitTz: string;
  forecastStart: string;
  forecastDays: number;
  targetDate: string;
  returnYear: number;
  lunarMonth: string;
  /** Ay içindeki dönüş sırası (bir takvim ayında 2 lunar return olabilir). */
  lunarSequence: 1 | 2;
  partnerProfileId: string;
  /** Relocation hedefi (konum kimliği sunucuda çözülür). */
  relocationTarget: { id: string; label: string } | null;
  /** Aşama 4.1: Solar/Lunar return dönüş konumu; null = doğum yeri. */
  solarReturnLocation: { id: string; label: string } | null;
  lunarReturnLocation: { id: string; label: string } | null;
  /** Local space referansı; null = doğum yeri. */
  localSpaceReference: { id: string; label: string } | null;
};

export const FORECAST_CHUNK_DAYS = 90;
export const FORECAST_MAX_DAYS = 366;

export function defaultParams(today: Date): TechniqueParams {
  const iso = today.toISOString().slice(0, 10);
  return {
    transitMode: "now",
    transitDate: iso,
    transitTime: "12:00",
    transitTz: "Europe/Istanbul",
    forecastStart: iso,
    forecastDays: 90,
    targetDate: iso,
    returnYear: today.getUTCFullYear(),
    lunarMonth: iso.slice(0, 7),
    lunarSequence: 1,
    partnerProfileId: "",
    relocationTarget: null,
    localSpaceReference: null,
    solarReturnLocation: null,
    lunarReturnLocation: null,
  };
}

/** Seçili teknikler → sunucu seçim listesi (sıra sabit: UI_TECHNIQUES sırası). */
export function buildSelections(
  checked: Partial<Record<UiTechniqueId, boolean>>,
  p: TechniqueParams,
  method: { houseSystem: HouseSystem; nodeType: NodeType },
): { technique: UiTechniqueId; options: Record<string, unknown> }[] {
  const out: { technique: UiTechniqueId; options: Record<string, unknown> }[] = [];
  for (const id of UI_TECHNIQUES) {
    if (!checked[id]) continue;
    switch (id) {
      case "western.natal":
        out.push({ technique: id, options: { houseSystem: method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.transit":
        out.push({
          technique: id,
          options: p.transitMode === "now" ? { now: true, nodeType: method.nodeType } : { date: p.transitDate, time: p.transitTime, timezone: p.transitTz, nodeType: method.nodeType },
        });
        break;
      case "western.forecast":
        out.push({ technique: id, options: { startDate: p.forecastStart, days: p.forecastDays } });
        break;
      case "western.progression":
      case "western.solar_arc":
        out.push({ technique: id, options: { targetDate: p.targetDate, nodeType: method.nodeType } });
        break;
      case "western.solar_return":
        out.push({ technique: id, options: { returnYear: p.returnYear, houseSystem: method.houseSystem, returnLocationId: p.solarReturnLocation?.id ?? null } });
        break;
      case "western.lunar_return":
        out.push({ technique: id, options: { month: p.lunarMonth, sequence: p.lunarSequence, houseSystem: method.houseSystem, returnLocationId: p.lunarReturnLocation?.id ?? null } });
        break;
      case "western.synastry":
      case "western.composite":
        out.push({ technique: id, options: { partnerProfileId: p.partnerProfileId, houseSystem: method.houseSystem, nodeType: method.nodeType } });
        break;
      case "western.astrocartography":
        out.push({ technique: id, options: {} });
        break;
      case "western.relocation":
        if (p.relocationTarget) out.push({ technique: id, options: { targetLocationId: p.relocationTarget.id, houseSystem: method.houseSystem } });
        break;
      case "western.local_space":
        out.push({ technique: id, options: { referenceLocationId: p.localSpaceReference?.id ?? null } });
        break;
    }
  }
  return out;
}

export function forecastPartCount(days: number): number {
  return Math.max(1, Math.ceil(days / FORECAST_CHUNK_DAYS));
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};

/** Normalize seçeneklerin okunur özeti (sonuç kartı / kayıtlı analiz başlığı). */
export function describeOptions(technique: string, o: Record<string, unknown>, partnerLabel?: (id: string) => string | null): string {
  const partner = typeof o.partnerProfileId === "string" ? (partnerLabel?.(o.partnerProfileId) ?? "karşı taraf") : null;
  switch (technique) {
    case "western.transit":
      return typeof o.atUtc === "string" ? `${fmtDate(o.atUtc)} ${o.atUtc.slice(11, 16)} UTC` : "";
    case "western.forecast": {
      const days = Number(o.days);
      return typeof o.startDate === "string" ? `${fmtDate(o.startDate)} + ${days} gün (${forecastPartCount(days)} parça)` : "";
    }
    case "western.progression":
    case "western.solar_arc":
      return typeof o.targetDate === "string" ? `hedef ${fmtDate(o.targetDate)}` : "";
    case "western.solar_return":
      return `${String(o.returnYear)} dönüşü${returnPlace(o)}`;
    case "western.lunar_return":
      if (typeof o.month !== "string") return "";
      // Eski (Aşama 3) kayıtlarda sıra yok: o zaman yalnız ayın ilk dönüşü hesaplanabiliyordu.
      return `${o.month.slice(5, 7)}.${o.month.slice(0, 4)} · ${o.sequence === 2 ? "2." : "1."} dönüş${o.sequence === undefined ? " (ayın ilk dönüşü)" : ""}${returnPlace(o)}`;
    case "western.synastry":
    case "western.composite":
      return `${partner ?? ""}${o.partnerRevision ? ` (karşı taraf rev ${String(o.partnerRevision)})` : ""}`;
    case "western.relocation": {
      const t = o.target as { label?: string } | undefined;
      return t?.label ? `→ ${t.label}` : typeof o.targetLocationId === "string" ? `→ ${o.targetLocationId}` : "";
    }
    case "western.local_space": {
      const r = o.reference as { label?: string } | undefined;
      return `merkez: ${r?.label ?? (o.referenceLocationId ? String(o.referenceLocationId) : "doğum yeri")}`;
    }
    default:
      return "";
  }
}

/** Dönüş konumu etiketi: farklı konumsa " · konum: Londra", doğum yeriyse " · doğum yeri" (eski kayıtlarda boş). */
function returnPlace(o: Record<string, unknown>): string {
  const rl = o.returnLocation as { locationId?: string | null; label?: string } | undefined;
  if (rl?.locationId) return ` · konum: ${rl.label ?? rl.locationId}`;
  if (typeof o.returnLocationId === "string") return ` · konum: ${o.returnLocationId}`;
  return rl || o.returnLocationId === null ? " · doğum yeri" : "";
}

export function techniqueLabel(id: string): string {
  return (TECHNIQUE_META as Record<string, { label: string }>)[id]?.label ?? id;
}

export type LunarReturnInfo = { sequence: number; approxUtc: string };

/** "2027-06-28T13:58" → "28.06.2027 13:58 UTC" */
export function fmtUtcMinute(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)} ${iso.slice(11, 16)} UTC`;
}
