/**
 * Aromaterapi — kopyalanan kaydın adı (WT5). SAF, DOM'suz, test edilebilir.
 *
 * KÖK NEDEN: Karışım "Kopyala" aksiyonu kaydı ANINDA `"<ad> (Kopya)"` adıyla yazıyordu; uzman
 * adı belirleyemiyordu ve kopyanın kopyası "X (Kopya) (Kopya)" oluyordu → kalıcı isim kirliliği.
 * (Yağlardaki "Akgünlük (Kopya)" gibi adlar 2026-06-15 MVP'sindeki, 2026-08-10'da kaldırılan
 * "Kopyala ve Düzenle" akışından kalmadır; mevcut kayıtlar otomatik YENİDEN ADLANDIRILMAZ.)
 *
 * YENİ DAVRANIŞ: kopyalamadan önce ad sorulur. Öneri = sondaki "(Kopya)" ekleri temizlenmiş taban
 * ad + ilk boş sıra numarası ("Rahatlama 2"). Boş ad ve mevcut bir karışımla aynı ad (harf/boşluk
 * farkı gözetmeksizin) kabul edilmez → aynı adla çakışma koruması korunur, "(Kopya)" eklenmez.
 */

const COPY_SUFFIX_RE = /(\s*\((kopya|copy)\))+\s*$/iu;

function nameKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("tr-TR");
}

/** Sondaki bir veya daha fazla "(Kopya)" ekini atar: "X (Kopya) (Kopya)" → "X". */
export function stripCopySuffix(name: string): string {
  const stripped = name.replace(COPY_SUFFIX_RE, "").trim();
  return stripped || name.trim();
}

/** Mevcut adlarla çakışmayan öneri: "Taban 2", "Taban 3", … */
export function suggestCopyName(original: string, existingNames: readonly string[]): string {
  const base = stripCopySuffix(original);
  const taken = new Set(existingNames.map(nameKey));
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
  return base;
}

/** Kullanıcının girdiği kopya adı geçerli mi? Hata metni veya null. */
export function validateCopyName(name: string, existingNames: readonly string[]): string | null {
  const key = nameKey(name);
  if (!key) return "Yeni kaydın adını yazın.";
  if (existingNames.some((n) => nameKey(n) === key)) return "Bu adla bir kayıt zaten var. Farklı bir ad yazın.";
  return null;
}
