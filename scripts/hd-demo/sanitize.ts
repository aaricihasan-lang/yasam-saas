/**
 * D3 — Lisanslı sağlayıcı AÇIKLAMA METİNLERİNİ ayıklar (owner kuralı 2026-11-02: herkese açık depo / demoda yayımlanmaz).
 * Yalnız yapısal veri (kodlar, kapı.hat, merkez/kanal kimlikleri, sayılar) ve kısa terim etiketleri kalır; açıklama alanlarının
 * değeri tek tip demo notuyla değiştirilir (doğrulayıcılar boş olmayan metin istediği için alan silinmez).
 */
export const DEMO_TEXT_PLACEHOLDER = "Demo görünümünde lisanslı sağlayıcı açıklaması gösterilmez.";

const TEXT_KEYS = new Set([
  "typeDescription", "aura", "strategyDescription", "authorityDescription", "profileDescription", "definitionDescription",
  "description", "circuitDescription", "theme", "notSelfQuestion", "biology", "gateDescription", "lineMeaning", "planetDescription",
  "layerDescription", "colorMeaning", "toneMeaning", "directionMeaning", "baseDescription",
]);
/** Bu üst alanların altındaki tüm metinler açıklamadır (profil anahtar sözleri, taraf açıklamaları). */
const TEXT_PARENTS = new Set(["profileKeynotes", "sides"]);

export function sanitizeProviderTexts(v: unknown, parentKey = ""): unknown {
  if (Array.isArray(v)) return v.map((x) => sanitizeProviderTexts(x, parentKey));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (typeof x === "string" && (TEXT_KEYS.has(k) || TEXT_PARENTS.has(parentKey))) out[k] = DEMO_TEXT_PLACEHOLDER;
      else out[k] = sanitizeProviderTexts(x, k);
    }
    return out;
  }
  return v;
}

/** Ayıklanmış yapıda kalan uzun metinler (sızıntı denetimi): yer tutucu dışında `min` karakterden uzun her dize. */
export function longStrings(v: unknown, min = 40, path = "$", acc: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x, i) => longStrings(x, min, `${path}[${i}]`, acc));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) longStrings(x, min, `${path}.${k}`, acc);
  else if (typeof v === "string" && v !== DEMO_TEXT_PLACEHOLDER && v.length >= min) acc.push(`${path} (${v.length})`);
  return acc;
}
