/**
 * Refleksoloji organ kimlik kontratı (TEK merkezi kaynak).
 *
 * Atlas belgesi organ adını NESNE ANAHTARI olarak saklar (UUID yok), bu yüzden
 * "organ kimliği" = adın kanonik biçimidir. Protokol Haritası ↔ Kayıtlı Atlas
 * eşleşmesi ve organ listesi tekilleştirmesi DAİMA bu `organKey` üzerinden
 * yapılmalıdır. Ekranda gösterilen etiket (label) ise ham hâliyle korunur.
 *
 * Kanonikleştirme adımları (sıra önemli):
 *   1. Unicode NFC — "ğ"/"İ" gibi harflerin NFD (taban harf + birleşen imleç)
 *      ve NFC (tek kod noktası) varyantları eşit sayılır. Bu, "karaciğer" atlas
 *      anahtarı NFD, protokol girdisi NFC olduğunda oluşan "Atlas bulunamadı"
 *      regresyonunun kök nedenidir.
 *   2. İç boşlukları tekilleştir + baş/son boşlukları kırp.
 *   3. Türkçe-güvenli küçük harf (İ→i, I→ı) — "KARACİĞER" == "karaciğer".
 *   4. Küçük harfe çevirme yeni birleşen üretebildiğinden tekrar NFC.
 */
export function organKey(name: string): string {
  return name
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFC");
}

export function isDuplicateOrgan(name: string, organs: string[]): boolean {
  const key = organKey(name);
  if (!key) return true;
  return organs.some((o) => organKey(o) === key);
}

/**
 * Kanonik kimliğe göre tekilleştirir; her kanonik organ için İLK görülen
 * ham etiketi korur. Girdi sırası korunur (çağıran taraf istediği kaynak
 * önceliğini + sıralamayı kendisi uygular). Yalnız ekranda gizleme değil,
 * "aynı organ iki kaynaktan iki farklı string olarak geldi" durumunu gerçek
 * anlamda birleştirir.
 */
export function dedupeByOrganKey(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const key = organKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}
