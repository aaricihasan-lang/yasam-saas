/**
 * I18N-F1-R5 — Bilgi Bankası KANONİK değer → görünen etiket (SAF; istemci + sunucu).
 *
 * "3. Çakra | AZ Destek", "Ateş | FAZLA Destek" gibi değerler DB eşleşme anahtarıdır (numerology_knowledge_records.value,
 * stone assignments.value; knowledgeLookup / stoneLookup üretir). Değer ASLA değişmez ve geri yazılmaz; yalnız ekranda /
 * raporda gösterilen metin `numerology.knowledge.valueDisplay` kataloğundan kurulur. Tanınmayan değer (ör. "11/2", uzmanın
 * serbest değeri) AYNEN döner.
 */
export type KbValueT = (key: string, values?: Record<string, string>) => string;

const CHAKRA_RE = /^(\d{1,2})\. Çakra \| (AZ|FAZLA) Destek$/;
const ELEMENT_RE = /^(Ateş|Su|Toprak|Hava) \| (AZ|FAZLA) Destek$/;
const ELEMENT_KEY: Readonly<Record<string, string>> = { "Ateş": "ates", Su: "su", Toprak: "toprak", Hava: "hava" };
const LEVEL_KEY: Readonly<Record<string, string>> = { AZ: "low", FAZLA: "excess" };

export function kbValueDisplay(value: string, t: KbValueT): string {
  const c = CHAKRA_RE.exec(value);
  if (c) return t("chakra", { n: c[1]!, level: t(`level.${LEVEL_KEY[c[2]!]}`) });
  const e = ELEMENT_RE.exec(value);
  if (e) return t("element", { el: t(`el.${ELEMENT_KEY[e[1]!]}`), level: t(`level.${LEVEL_KEY[e[2]!]}`) });
  return value;
}
