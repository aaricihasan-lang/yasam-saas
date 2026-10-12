// Astroloji — GENEL teknik görünümü (SAF). İstemciye giden HER hesap sonucu yalnız burada kurulur.
//
//   • Teknik katman: kayıtlı beyaz liste projeksiyon(lar) (çok parçalıysa birleştirilir).
//   • Yorum katmanı: YALNIZ görünürlük "visible" ise ve TÜM parçaların yorumu varsa eklenir;
//     görünmezse yanıtta yalnız { visible:false, reason } (içerik/boyut/sayı YOK).
//   • Saat bilinmiyorsa (kişi 1 ve/veya kişi 2) tekniğe özel saat-bağımlı alanlar ÇIKARILIR ve neden
//     açık uyarıyla bildirilir (uydurma YOK). Return teknikleri saat bilinmeden planlayıcıda reddedilir.
//   • Ham yanıt, gövde, input_hash, unmapped listesi istemciye GİTMEZ.

import type { InterpretationVisibility } from "../access/entitlements";
import type { NatalInterpretation, NatalTechnical } from "../model/western";
import type {
  CompositeTechnical,
  ForecastInterpretation,
  ForecastTechnical,
  ProgressionTechnical,
  SolarArcInterpretation,
  SolarArcTechnical,
  SynastryInterpretation,
  SynastryTechnical,
  TransitInterpretation,
  TransitTechnical,
} from "../model/westernTiming";
import { maskTimeDependent, PROVIDER_INTERP_NOTICE } from "./natalView";

export type ResultRowLike = {
  id: string;
  technique: string;
  provider: string;
  provider_api_version: string;
  adapter_version: string;
  projection_version: string;
  technical: Record<string, unknown>;
  created_at: string;
};

export type TimeKnowledge = { primary: boolean; partner: boolean | null };

export type TechniqueView = {
  id: string;
  resultIds: string[];
  technique: string;
  provider: string;
  providerApiVersion: string;
  adapterVersion: string;
  projectionVersion: string;
  computedAt: string;
  options: Record<string, unknown>;
  method: { zodiac: Zodiac; houseSystem: string | null; nodeType: string | null };
  timeUnknownMasked: boolean;
  warnings: string[];
  missingParts: number;
  technical: unknown;
  interpretation:
    | { visible: true; provider: string; lang: string; content: unknown; notice: string }
    | { visible: false; reason: "not_entitled" | "owner_preview_hidden" | "unavailable" };
};

export type Zodiac = "tropical" | "sidereal";

/**
 * Aşama 9A-P2-01: zodyak TEKNİĞİN geleneğinden gelir (Batı = tropikal; Vedik/KP = sidereal). Vedik/KP teknik
 * katmanı kendi `zodiac: "sidereal"` alanını taşır; iki kaynak uyuşmazsa sessizce yazılmaz — hata fırlatılır.
 */
export function zodiacOfTechnique(technique: string, technical?: unknown): Zodiac {
  const z: Zodiac = technique.startsWith("vedic.") || technique.startsWith("kp.") ? "sidereal" : "tropical";
  const own = technical && typeof technical === "object" ? (technical as { zodiac?: unknown }).zodiac : undefined;
  if (own !== undefined && own !== z) throw new Error(`zodiac uyuşmazlığı: ${technique} teknik=${String(own)} beklenen=${z}`);
  return z;
}

const MOON_WARN = "Doğum saati bilinmediği için natal Ay konumu gün içinde ~13° değişebilir; Ay ile ilgili sonuçlar yaklaşık kabul edilmelidir.";
const isAngle = (p: string) => p === "ascendant" || p === "midheaven";

/** Tekniğe özel saat-bağımlı maske. */
export function maskTechnical(technique: string, technical: unknown, tk: TimeKnowledge): { technical: unknown; masked: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const unknownA = !tk.primary;
  const unknownB = tk.partner === false;
  if (!unknownA && !unknownB) return { technical, masked: false, warnings };
  switch (technique) {
    case "western.natal":
      return { technical: maskTimeDependent(technical as NatalTechnical), masked: true, warnings: [MOON_WARN] };
    case "western.transit": {
      const t = technical as TransitTechnical;
      const aspects = t.aspects.filter((a) => !isAngle(a.natal));
      // Sağlayıcı özet sayıları açısal hedefleri de sayabilir → maskeden SONRA kalan açılardan yeniden say
      // (aksi hâlde gizlenen açılar sayılarda görünür kalırdı). Transit gezegen verisi saatten bağımsızdır, korunur.
      const count = (n: string) => aspects.filter((a) => a.nature === n).length;
      return {
        technical: { ...t, aspects, summary: { harmonious: count("harmonious"), challenging: count("challenging"), neutral: count("neutral") } },
        masked: true,
        warnings: [MOON_WARN, "Natal Yükselen/MC hedefli transitler gösterilmez."],
      };
    }
    case "western.forecast": {
      const t = technical as ForecastTechnical;
      return { technical: { ...t, events: t.events.filter((e) => !(e.targetBody && isAngle(e.targetBody))) }, masked: true, warnings: [MOON_WARN, "Natal Yükselen/MC hedefli olaylar gösterilmez."] };
    }
    case "western.progression": {
      const t = technical as ProgressionTechnical;
      return {
        technical: { ...t, angles: null, bodies: t.bodies.map((b) => ({ ...b, house: null })) },
        masked: true,
        warnings: [MOON_WARN, "İlerletilmiş Yükselen/MC ve ev yerleşimleri doğum saati gerektirir; gösterilmez."],
      };
    }
    case "western.solar_arc": {
      const t = technical as SolarArcTechnical;
      return {
        technical: { ...t, directed: t.directed.filter((d) => !isAngle(d.id)), aspects: t.aspects.filter((a) => !isAngle(a.directed) && !isAngle(a.natal)) },
        masked: true,
        warnings: [MOON_WARN, "Directed Yükselen/MC ve onlarla açılar doğum saati gerektirir; gösterilmez."],
      };
    }
    case "western.synastry": {
      const t = technical as SynastryTechnical;
      const p1 = unknownA ? { ascendant: null, bodies: t.person1.bodies.map((b) => ({ ...b, house: null })) } : t.person1;
      const p2 = unknownB ? { ascendant: null, bodies: t.person2.bodies.map((b) => ({ ...b, house: null })) } : t.person2;
      // Ev bindirmesi: kişi 1 gezegeni kişi 2'nin evinde → kişi 2'nin saati gerekir (ve tersi).
      const person1 = { ...p1, bodies: p1.bodies.map((b) => ({ ...b, houseInOther: unknownB ? null : b.houseInOther })) };
      const person2 = { ...p2, bodies: p2.bodies.map((b) => ({ ...b, houseInOther: unknownA ? null : b.houseInOther })) };
      if (unknownA) warnings.push("1. kişinin doğum saati bilinmiyor: evleri, Yükselen'i ve 2. kişinin ona göre ev bindirmesi gösterilmez.");
      if (unknownB) warnings.push("2. kişinin doğum saati bilinmiyor: evleri, Yükselen'i ve 1. kişinin ona göre ev bindirmesi gösterilmez.");
      warnings.push("Saati bilinmeyen kişinin Ay'ı yaklaşık kabul edilmelidir.");
      return { technical: { ...t, person1, person2 }, masked: true, warnings };
    }
    case "western.composite": {
      const t = technical as CompositeTechnical;
      return {
        technical: { ...t, houses: [], angles: null, bodies: t.bodies.map((b) => ({ ...b, house: null })) },
        masked: true,
        warnings: ["Kişilerden en az birinin doğum saati bilinmiyor: composite evleri ve Yükselen/MC gösterilmez.", MOON_WARN],
      };
    }
    case "western.astrocartography":
    case "western.relocation":
    case "western.local_space":
      // Bu teknikler saat bilinmeden hesaplanmaz (planlayıcı TIME_REQUIRED). Kayıtlı bir sonuç saati
      // bilinmeyen bir revizyon bağlamında açılırsa hiçbir saat-bağımlı veri gösterilmez.
      return { technical: null, masked: true, warnings: [LOCATION_TIME_WARN] };
    default:
      // Aşama 5: tüm Vedik teknikler saat gerektirir (Lagna/ev/pada/varga/dasha) → hiçbir veri gösterilmez.
      if (technique.startsWith("vedic.")) return { technical: null, masked: true, warnings: ["Doğum saati bilinmiyor: Vedik hesaplar (Lagna, bhava, pada, varga, dasha) saate bağlıdır; sonuç gösterilmez."] };
      // Aşama 6: KP doğum teknikleri saate bağlı (Placidus cusp ~4 dk/sub). Horary doğum verisi KULLANMAZ → maskelenmez.
      if (technique.startsWith("kp.") && !KP_BIRTHLESS.has(technique)) return { technical: null, masked: true, warnings: ["Doğum saati bilinmiyor: KP cusp, sub-lord ve significator sonuçları saate bağlıdır; sonuç gösterilmez."] };
      return { technical, masked: false, warnings };
  }
}

const LOCATION_TIME_WARN = "Doğum saati bilinmiyor: bu konum tekniği tamamen saate bağlıdır; sonuç gösterilmez.";
const TIME_ONLY = new Set(["western.astrocartography", "western.relocation", "western.local_space"]);
/** KP: horary ve transit (efemeris) doğum verisi KULLANMAZ → saat bilinmese de gösterilir. */
const KP_BIRTHLESS = new Set(["kp.horary", "kp.transit"]);
const TIME_ONLY_TECHNIQUES = { has: (t: string) => TIME_ONLY.has(t) || t.startsWith("vedic.") || (t.startsWith("kp.") && !KP_BIRTHLESS.has(t)) };

function maskInterpretation(technique: string, content: unknown, masked: boolean): unknown {
  if (!masked) return content;
  if (TIME_ONLY_TECHNIQUES.has(technique)) return null;
  if (technique === "western.natal") return { ...(content as NatalInterpretation), bodies: [] };
  if (technique === "western.transit") {
    // Gizlenen (natal Yükselen/MC hedefli) açıların sağlayıcı anlatısı da gönderilmez.
    const c = content as TransitInterpretation;
    return { ...c, aspects: c.aspects.filter((a) => !isAngle(a.natal)) };
  }
  if (technique === "western.forecast") {
    // Gizlenen (natal Yükselen/MC hedefli) olayların sağlayıcı cümlesi de gönderilmez.
    const c = content as ForecastInterpretation;
    return { ...c, events: c.events.filter((e) => !(e.targetBody && isAngle(e.targetBody))) };
  }
  if (technique === "western.solar_arc") {
    const c = content as SolarArcInterpretation;
    return { ...c, directed: c.directed.filter((d) => !isAngle(d.id)) };
  }
  // Saat bilinmiyorsa: ilerletilmiş ve composite anlatıları ev/açı (ASC-MC) ve saate duyarlı Ay konumuna dayanır →
  // teknik katmanda gizlenen bilgiyi anlatıda göstermemek için sağlayıcı yorumu gösterilmez.
  if (technique === "western.progression" || technique === "western.composite") return null;
  if (technique === "western.synastry") {
    const c = content as SynastryInterpretation;
    return { ...c, aspects: c.aspects.filter((a) => !isAngle(a.a) && !isAngle(a.b)) };
  }
  return content;
}

export function buildTechniqueView(args: {
  technique: string;
  rows: ResultRowLike[];
  combined: unknown;
  options: Record<string, unknown>;
  timeKnowledge: TimeKnowledge;
  visibility: InterpretationVisibility;
  /** Satır başına yorum (yalnız görünür olacaksa okunur; tek parçalı tekniklerde 1 öğe). */
  interpretations: ({ provider: string; lang: string; content: Record<string, unknown> } | null)[] | null;
  missingParts?: number;
  /** Çok parçalı tekniğin (forecast) parça yorumlarını birleştirir; yoksa yorum yalnız tek parçada gösterilir. */
  combineInterpretation?: (parts: Record<string, unknown>[]) => Record<string, unknown>;
}): TechniqueView {
  const first = args.rows[0];
  const m = maskTechnical(args.technique, args.combined, args.timeKnowledge);
  const tech = m.technical as { houseSystem?: string; nodeType?: string; chart?: { houseSystem?: string } };

  let interpretation: TechniqueView["interpretation"];
  if (!args.visibility.visible) {
    interpretation = { visible: false, reason: args.visibility.reason };
  } else {
    // Servis yorumu tek (veya zorunlu) birimden verir; çok parçalı teknikte (forecast) yalnız TÜM parçaların yorumu varsa birleştirilir.
    const list = args.interpretations ?? [];
    const combinable = list.length > 1 && !!args.combineInterpretation && list.every((x) => x !== null);
    if ((list.length !== 1 && !combinable) || list[0] === null || (m.masked && TIME_ONLY_TECHNIQUES.has(args.technique))) {
      interpretation = { visible: false, reason: "unavailable" };
    } else {
      const it = combinable ? { ...list[0]!, content: args.combineInterpretation!(list.map((x) => x!.content)) } : list[0]!;
      const content = maskInterpretation(args.technique, it.content, m.masked);
      // Maske tüm anlatıyı kaldırdıysa (saat bilinmiyor) boş katman gösterilmez.
      interpretation = content === null ? { visible: false, reason: "unavailable" } : { visible: true, provider: it.provider, lang: it.lang, content, notice: PROVIDER_INTERP_NOTICE };
    }
  }

  return {
    id: first.id,
    resultIds: args.rows.map((r) => r.id),
    technique: args.technique,
    provider: first.provider,
    providerApiVersion: first.provider_api_version,
    adapterVersion: first.adapter_version,
    projectionVersion: first.projection_version,
    computedAt: first.created_at,
    options: args.options,
    method: { zodiac: zodiacOfTechnique(args.technique, m.technical), houseSystem: tech.houseSystem ?? tech.chart?.houseSystem ?? null, nodeType: tech.nodeType ?? null },
    timeUnknownMasked: m.masked,
    warnings: [...m.warnings, ...(args.missingParts ? [`${args.missingParts} dönem parçası hesaplanamadı; takvim eksik olabilir.`] : [])],
    missingParts: args.missingParts ?? 0,
    technical: m.technical,
    interpretation,
  };
}
