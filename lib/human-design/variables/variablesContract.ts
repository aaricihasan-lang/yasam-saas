// Human Design Variables — Roxy yanıt sözleşmesi doğrulayıcısı (SAF; ağ yok). FAIL-CLOSED.
//
// Sözleşme: RoxyAPI OpenAPI 2.0.0 calculateVariables (zorunlu alanlar oradan). Ek YAPISAL tutarlılık:
//   • tam dört ok, anahtarlar tekil ve {determination, environment, motivation, perspective}
//   • her okun konum / katman / taraf / gezegeni sabit eşlemeyle birebir (ARROW_SPECS)
//   • color 1–6, tone 1–6, base 1–5 tamsayı; direction = tone'dan türetilen yön (1–3 left, 4–6 right)
//   • cognition YALNIZ determination'da ve etiketi determination Tone'una karşılık gelen değer
//   • genel `confident` = dört okun `confident` değerlerinin VE'si; `confidenceMarginDeg` sonlu ve (0, 1) aralığında
// Herhangi bir ihlal → { ok: false } (kısmi / bozuk yanıt tamamlanmış dört ok gibi sunulmaz).
// Metinler: düz metin; kontrol karakterleri atılır, boşluklar sadeleşir, uzunluk sınırlanır (HTML olarak İŞLENMEZ).

import { ARROW_SPEC_BY_KEY, ARROW_SPECS, COGNITION_BY_TONE, toneDirection, type VariableDirection, type VariableKey, type VariablePlanet, type VariableSide } from "./variablesMath";

const MAX_TEXT = 1500;
const MAX_LABEL = 80;
/** Kontrol / görünmez biçim karakterleri (C0, DEL, sıfır genişlikli, satır/paragraf ayırıcı, BOM) — kod noktasıyla kurulur. */
const CONTROL_RANGES: ReadonlyArray<readonly [number, number]> = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x7f], [0x200b, 0x200f], [0xfeff, 0xfeff]];
/** Satır / paragraf ayırıcıları (U+2028 / U+2029) silinmez, boşluğa çevrilir (kelimeler birleşmesin). */
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, "g");
const CONTROL_CHARS = new RegExp(`[${CONTROL_RANGES.map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`).join("")}]`, "g");

export type VariablesArrowDto = {
  key: VariableKey;
  position: string;
  side: VariableSide;
  planet: VariablePlanet;
  color: number;
  tone: number;
  base: number;
  direction: VariableDirection;
  confident: boolean;
  /** Base kesin mi? Sağlayıcı bayrağı Base'i kapsamaz; tarihsel saniyeli ofsette sunucu false yapar (bkz. localVariablesCheck). */
  baseCertain: boolean;
  /** Sağlayıcı İngilizce kanonik etiketleri (karşılaştırma için). */
  name: string;
  layer: string;
  colorLabel: string;
  directionLabel: string;
  baseName: string;
  /** Gösterim metinleri (lang=tr; çeviri yoksa sağlayıcı İngilizce döner). */
  text: {
    name: string;
    layer: string;
    position: string;
    planet: string;
    colorLabel: string;
    directionLabel: string;
    baseName: string;
    description: string;
    layerDescription: string;
    colorMeaning: string;
    toneMeaning: string;
    directionMeaning: string;
  };
  cognition: { label: string; labelText: string; description: string } | null;
};

export type VariablesDto = {
  confident: boolean;
  confidenceMarginDeg: number;
  baseDescription: string;
  /** Doğum anının UTC ofsetinde saniye var (standart saat öncesi yerel ortalama saat) → sunucu kesinliği düşürdü. */
  historicalOffset: boolean;
  /** Sabit sıra: determination, environment, motivation, perspective. */
  arrows: VariablesArrowDto[];
};

export type VariablesValidation = { ok: true; value: VariablesDto } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/** Düz metin temizliği: kontrol karakterleri atılır, boşluklar sadeleşir, uzunluk sınırlanır. */
export function cleanText(v: unknown, max = MAX_TEXT): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(LINE_SEPARATORS, " ").replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export function validateRoxyVariables(raw: unknown): VariablesValidation {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["yanıt nesne değil"] };
  if (!Array.isArray(raw.arrows)) return { ok: false, errors: ["arrows dizi değil"] };
  if (raw.arrows.length !== 4) errors.push(`arrows uzunluğu ${raw.arrows.length} (4 bekleniyor)`);
  if (typeof raw.confident !== "boolean") errors.push("confident boolean değil");
  const margin = raw.confidenceMarginDeg;
  if (typeof margin !== "number" || !Number.isFinite(margin) || margin <= 0 || margin >= 1) errors.push("confidenceMarginDeg geçersiz");
  const baseDescription = cleanText(raw.baseDescription);
  if (!baseDescription) errors.push("baseDescription yok");

  const byKey = new Map<VariableKey, VariablesArrowDto>();
  for (const a of raw.arrows as unknown[]) {
    if (!isObj(a)) { errors.push("ok nesne değil"); continue; }
    const key = a.key;
    if (typeof key !== "string" || !(key in ARROW_SPEC_BY_KEY)) { errors.push(`bilinmeyen ok anahtarı ${String(key).slice(0, 40)}`); continue; }
    const k = key as VariableKey;
    if (byKey.has(k)) { errors.push(`yinelenen ok ${k}`); continue; }
    const spec = ARROW_SPEC_BY_KEY[k];
    const act = isObj(a.activation) ? a.activation : null;
    if (a.position !== spec.position) errors.push(`${k}: konum ${String(a.position)} ≠ ${spec.position}`);
    if (a.layer !== spec.layer) errors.push(`${k}: katman ${String(a.layer)} ≠ ${spec.layer}`);
    if (!act || act.side !== spec.side) errors.push(`${k}: taraf ≠ ${spec.side}`);
    if (!act || act.planet !== spec.planet) errors.push(`${k}: gezegen ≠ ${spec.planet}`);
    if (!isInt(a.color, 1, 6)) errors.push(`${k}: color 1–6 değil`);
    if (!isInt(a.tone, 1, 6)) errors.push(`${k}: tone 1–6 değil`);
    if (!isInt(a.base, 1, 5)) errors.push(`${k}: base 1–5 değil`);
    if (a.direction !== "left" && a.direction !== "right") errors.push(`${k}: direction geçersiz`);
    else if (isInt(a.tone, 1, 6) && a.direction !== toneDirection(a.tone)) errors.push(`${k}: direction tone ile uyuşmuyor`);
    if (typeof a.confident !== "boolean") errors.push(`${k}: confident boolean değil`);
    const req = (f: string, max = MAX_TEXT) => {
      const t = cleanText(a[f], max);
      if (!t) errors.push(`${k}: ${f} yok`);
      return t ?? "";
    };
    const name = req("name", MAX_LABEL);
    const colorLabel = req("colorLabel", MAX_LABEL);
    const directionLabel = req("directionLabel", MAX_LABEL);
    const baseName = req("baseName", MAX_LABEL);
    const description = req("description");
    const layerDescription = req("layerDescription");
    const colorMeaning = req("colorMeaning");
    const toneMeaning = req("toneMeaning");
    const directionMeaning = req("directionMeaning");
    const loc = (f: string, fallback: string) => cleanText(a[f], MAX_LABEL) ?? fallback;
    let cognition: VariablesArrowDto["cognition"] = null;
    if (a.cognition !== undefined && a.cognition !== null) {
      if (k !== "determination") errors.push(`${k}: cognition yalnız determination'da olabilir`);
      else if (!isObj(a.cognition)) errors.push("cognition nesne değil");
      else {
        const label = cleanText(a.cognition.label, MAX_LABEL);
        const desc = cleanText(a.cognition.description);
        if (!label || !desc) errors.push("cognition label/description yok");
        else if (isInt(a.tone, 1, 6) && label !== COGNITION_BY_TONE[a.tone - 1]) errors.push(`cognition ${label} ≠ tone ${a.tone} karşılığı`);
        else cognition = { label, labelText: cleanText(a.cognition.labelLocalized, MAX_LABEL) ?? label, description: desc };
      }
    } else if (k === "determination") errors.push("determination: cognition yok");
    byKey.set(k, {
      key: k,
      position: spec.position,
      side: spec.side,
      planet: spec.planet,
      color: a.color as number,
      tone: a.tone as number,
      base: a.base as number,
      direction: a.direction as VariableDirection,
      confident: a.confident === true,
      baseCertain: true,
      name,
      layer: spec.layer,
      colorLabel,
      directionLabel,
      baseName,
      text: {
        name: loc("nameLocalized", name),
        layer: loc("layerLocalized", spec.layer),
        position: loc("positionLocalized", spec.position),
        planet: act ? cleanText(act.planetLocalized, MAX_LABEL) ?? spec.planet : spec.planet,
        colorLabel: loc("colorLabelLocalized", colorLabel),
        directionLabel: loc("directionLabelLocalized", directionLabel),
        baseName: loc("baseNameLocalized", baseName),
        description,
        layerDescription,
        colorMeaning,
        toneMeaning,
        directionMeaning,
      },
      cognition,
    });
  }
  for (const s of ARROW_SPECS) if (!byKey.has(s.key)) errors.push(`${s.key} oku yok`);
  if (errors.length === 0 && typeof raw.confident === "boolean") {
    const all = ARROW_SPECS.every((s) => byKey.get(s.key)!.confident);
    if (raw.confident !== all) errors.push("genel confident dört okla tutarsız");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      confident: raw.confident as boolean,
      confidenceMarginDeg: margin as number,
      baseDescription: baseDescription!,
      historicalOffset: false,
      arrows: ARROW_SPECS.map((s) => byKey.get(s.key)!),
    },
  };
}
