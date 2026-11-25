/**
 * Sözde-yerelleştirme (pseudo-localization) — YALNIZ geliştirme (I18N_PSEUDO=on, production'da kapalı).
 *
 * Hedef dil kataloğundaki metinleri aksanlı harflere çevirip ~%35 uzatır ve ⟪ … ⟫ ile sarar:
 *   - çeviriden GEÇMEYEN sabit metin ekranda düz kalır → hemen göze çarpar,
 *   - uzun dillerde (Almanca) oluşacak taşmalar önceden görünür.
 * ICU sözdizimi korunur: argümanlar ({name}), çoğul/seçim anahtar kelimeleri ve etiket adları (<b>)
 * değişmez; yalnız mesaj metni dönüştürülür (çift derinlik = metin, tek derinlik = argüman sözdizimi).
 */
const MAP: Record<string, string> = {
  // i18n-ignore: sözde-yerelleştirme harf tablosu (kullanıcı metni değil)
  a: "á", b: "ƀ", c: "ç", d: "ď", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "í", j: "ĵ", k: "ķ", l: "ĺ", m: "ɱ",
  n: "ñ", o: "ó", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ť", u: "ú", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  // i18n-ignore: sözde-yerelleştirme harf tablosu (kullanıcı metni değil)
  A: "Á", B: "Ɓ", C: "Ç", D: "Ď", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ", L: "Ĺ", M: "Ṁ",
  N: "Ñ", O: "Ó", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ť", U: "Ú", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
};

export function pseudoLocalizeString(input: string): string {
  let out = "";
  let depth = 0;
  let letters = 0;
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'") {
      // ICU kaçış: '' → tek tırnak, '{…}' → literal
      quoted = input[i + 1] === "'" ? quoted : !quoted;
      out += ch;
      continue;
    }
    if (!quoted && ch === "{") { depth++; out += ch; continue; }
    if (!quoted && ch === "}") { depth = Math.max(0, depth - 1); out += ch; continue; }
    if (!quoted && depth % 2 === 0 && ch === "<") {
      // etiket adı (rich text) olduğu gibi
      const end = input.indexOf(">", i);
      if (end > i) { out += input.slice(i, end + 1); i = end; continue; }
    }
    if (depth % 2 === 0 && MAP[ch]) { out += MAP[ch]; letters++; continue; }
    out += ch;
  }
  if (letters === 0) return input;
  return `⟪${out}${"·".repeat(Math.ceil(letters * 0.35))}⟫`;
}

export function pseudoLocalizeMessages<T>(value: T): T {
  if (typeof value === "string") return pseudoLocalizeString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => pseudoLocalizeMessages(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = pseudoLocalizeMessages(v);
    return out as T;
  }
  return value;
}
