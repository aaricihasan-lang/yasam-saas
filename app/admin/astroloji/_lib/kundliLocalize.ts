// Astroloji 5.1C/5.1D — Roxy kundli bileşeninin (@roxyapi/ui 0.49.0, sabit sürüm) haritadaki İngilizce
// kısaltmalarını Türkçeleştirme + kalabalık hücre düzeni (SAF metin dönüşümleri; DOM uygulayıcısı VedicPanels'te).
//
// Neden gerekli: kütüphane graha/burç kısaltmalarını yerelleştirmez (PLANET_ABBR/SIGN_ABBR sabit İngilizce);
// "Su" (Sun) Türkçede "su" okunur, lang="tr" ile CSS büyük harfi "Pi/Li/Vi"yi "Pİ/Lİ/Vİ" yapar. Geometri ve
// yerleşim KÜTÜPHANENİNDİR; burada yalnız etiket metni ve kalabalık hücrede yazı boyutu değişir.

import type { VedicGrahaId } from "@/lib/astrology/model/vedic";
import type { SignId } from "@/lib/astrology/model/western";

/** Graha: haritadaki 2 harf (Türkçe), Türkçe ad, Sanskritçe/Vedik ad. */
export const GRAHA_TR: Readonly<Record<VedicGrahaId, { abbr: string; tr: string; skt: string }>> = {
  sun: { abbr: "Gü", tr: "Güneş", skt: "Surya" },
  moon: { abbr: "Ay", tr: "Ay", skt: "Chandra" },
  mars: { abbr: "Ma", tr: "Mars", skt: "Mangala" },
  mercury: { abbr: "Me", tr: "Merkür", skt: "Budha" },
  jupiter: { abbr: "Jü", tr: "Jüpiter", skt: "Guru" },
  venus: { abbr: "Ve", tr: "Venüs", skt: "Shukra" },
  saturn: { abbr: "Sa", tr: "Satürn", skt: "Shani" },
  rahu: { abbr: "Ra", tr: "Rahu", skt: "Rahu" },
  ketu: { abbr: "Ke", tr: "Ketu", skt: "Ketu" },
};
/** "Güneş / Surya" (Rahu/Ketu tek ad). */
export const grahaTrName = (id: VedicGrahaId) => (GRAHA_TR[id].tr === GRAHA_TR[id].skt ? GRAHA_TR[id].tr : `${GRAHA_TR[id].tr} / ${GRAHA_TR[id].skt}`);

/** Kütüphanenin İngilizce graha kısaltması → kimlik (kütüphane PLANET_ABBR, 0.49.0). */
const LIB_GRAHA_ABBR: Record<string, VedicGrahaId> = { Su: "sun", Mo: "moon", Ma: "mars", Me: "mercury", Ju: "jupiter", Ve: "venus", Sa: "saturn", Ra: "rahu", Ke: "ketu" };
/** Kütüphanenin İngilizce burç kısaltması → kimlik (kütüphane SIGN_ABBR, 0.49.0). */
const LIB_SIGN_ABBR: Record<string, SignId> = { Ar: "aries", Ta: "taurus", Ge: "gemini", Cn: "cancer", Le: "leo", Vi: "virgo", Li: "libra", Sc: "scorpio", Sg: "sagittarius", Cp: "capricorn", Aq: "aquarius", Pi: "pisces" };
/** Türkçe 3 harf burç kısaltması (CSS büyük harfiyle lang="tr" altında doğru: İKİ, OĞL, BAŞ…). */
export const SIGN_TR_ABBR: Readonly<Record<SignId, string>> = {
  aries: "Koç", taurus: "Boğ", gemini: "İki", cancer: "Yen", leo: "Asl", virgo: "Baş", libra: "Ter", scorpio: "Akr", sagittarius: "Yay", capricorn: "Oğl", aquarius: "Kov", pisces: "Bal",
};
/** Kütüphanenin İngilizce graha adı (title ilk parçası, `capitalize(graha)`) → kimlik. */
export const LIB_GRAHA_NAME: Record<string, VedicGrahaId> = { Sun: "sun", Moon: "moon", Mars: "mars", Mercury: "mercury", Jupiter: "jupiter", Venus: "venus", Saturn: "saturn", Rahu: "rahu", Ketu: "ketu" };

/** 3 ve üzeri graha olan hücre "kalabalık": haritada derece gösterilmez (tablo + ipucunda var), yazı küçülür. */
export const CROWDED_AT = 3;

/**
 * Hücre içi graha etiketi ("Su 28°ᶜ", "Ra 14°ʳ", "Mo") → Türkçe ("Gü 28°ᶜ"). compact = kalabalık hücre → derece
 * düşer ("Gü ᶜ" değil "Güᶜ"). Tanınmayan metin AYNEN döner (uydurma kısaltma yok). İdempotent: Türkçe etiket
 * yeniden verilirse aynı kalır.
 */
export function localizeGrahaLabel(text: string, compact: boolean): string {
  const m = /^([A-Za-zÇĞİÖŞÜçğıöşü]{2})(?: (\d{1,2})°)?([ʳᶜʷ]*)$/.exec(text.trim());
  if (!m) return text;
  const id = LIB_GRAHA_ABBR[m[1]] ?? (Object.keys(GRAHA_TR) as VedicGrahaId[]).find((k) => GRAHA_TR[k].abbr === m[1]);
  if (!id) return text;
  return `${GRAHA_TR[id].abbr}${m[2] !== undefined && !compact ? ` ${m[2]}°` : ""}${m[3]}`;
}

/** Burç etiketi: Güney/Doğu "Ar" → "Koç"; Kuzey Lagna "7 · Li" → "7 · Ter". Tanınmayan → aynen. */
export function localizeSignLabel(text: string): string {
  const t = text.trim();
  if (LIB_SIGN_ABBR[t]) return SIGN_TR_ABBR[LIB_SIGN_ABBR[t]];
  const m = /^(\d{1,2}) · ([A-Za-z]{2})$/.exec(t);
  if (m && LIB_SIGN_ABBR[m[2]]) return `${m[1]} · ${SIGN_TR_ABBR[LIB_SIGN_ABBR[m[2]]]}`;
  return text;
}

/** Haritanın altındaki kısaltma anahtarı (yalnız haritada görünen grahalar). */
export function kundliLegend(ids: VedicGrahaId[]): string {
  return ids.map((id) => `${GRAHA_TR[id].abbr} = ${grahaTrName(id)}`).join(" · ");
}
