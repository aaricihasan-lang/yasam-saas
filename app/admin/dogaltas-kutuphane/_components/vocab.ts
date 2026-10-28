// Kütüphane facet sözlüğü (stone_library_vocab ile birebir; yalnız arayüz etiketleri, lisanslı içerik değil).
// Sözlük için listeleme ucu yoktur; DB yeni değer gelirse owner verisi doğrulamasında (SL098) reddedilir.

import type { StoneLibraryKeyedFacet } from "@/lib/stone-library/contract";

export const VOCAB: Record<StoneLibraryKeyedFacet, [string, string][]> = {
  chakra: [["root", "Kök Çakra"], ["sacral", "Sakral Çakra"], ["solar_plexus", "Solar Pleksus"], ["heart", "Kalp Çakrası"], ["throat", "Boğaz Çakrası"], ["third_eye", "Üçüncü Göz"], ["crown", "Taç Çakra"]],
  zodiac: [["aries", "Koç"], ["taurus", "Boğa"], ["gemini", "İkizler"], ["cancer", "Yengeç"], ["leo", "Aslan"], ["virgo", "Başak"], ["libra", "Terazi"], ["scorpio", "Akrep"], ["sagittarius", "Yay"], ["capricorn", "Oğlak"], ["aquarius", "Kova"], ["pisces", "Balık"]],
  element: [["earth", "Toprak"], ["water", "Su"], ["fire", "Ateş"], ["air", "Hava"], ["storm", "Fırtına"]],
  planet: [["sun", "Güneş"], ["moon", "Ay"], ["mercury", "Merkür"], ["venus", "Venüs"], ["earth", "Dünya"], ["mars", "Mars"], ["jupiter", "Jüpiter"], ["saturn", "Satürn"], ["uranus", "Uranüs"], ["neptune", "Neptün"], ["pluto", "Plüton"]],
  color: [["black", "Siyah"], ["white", "Beyaz"], ["clear", "Şeffaf"], ["grey", "Gri"], ["silver", "Gümüş"], ["golden", "Altın Sarısı"], ["brown", "Kahverengi"], ["red", "Kırmızı"], ["orange", "Turuncu"], ["yellow", "Sarı"], ["green", "Yeşil"], ["blue", "Mavi"], ["indigo", "Çivit Mavisi"], ["violet", "Menekşe"], ["purple", "Mor"], ["pink", "Pembe"], ["peach", "Şeftali"], ["cream", "Krem"], ["multicolor", "Çok Renkli"], ["beige", "Bej"], ["turquoise", "Turkuaz"]],
};
