// Premium BodyGraph V2 — aura insan silüeti (saf veri). 460×600, x-ekseni 230.
//
// Sola bakan YÜZ PROFİLİ (alın→burun→dudak→çene) + geniş omuz + gövde + leğen.
// Tek KAPALI path (polygon/circle KULLANMAZ → invariant korunur). Merkezleri kapsar;
// omuzlar yan merkezleri (Spleen x60 / SolarPlexus x400) ve kavisli yayları içerir.

// V2-6C: gövde bloğu organik (yuvarlak omuz + bel daralması + kalça flare + doğal bacak);
// büyüyen 6B merkezlerini (Spleen x52 / SolarPlexus x408 / Root y596) kapsar.
// Baş (sağ kafatası) + sol YÜZ PROFİLİ koordinatları DEĞİŞMEDEN korunur.
export const AURA_PATH = [
  "M 232 16",
  "C 254 16 268 34 267 62", // sağ kafatası (KORUNUR)
  "C 266 90 258 106 252 122", // sağ çene → boyun (KORUNUR)
  "C 306 130 386 152 424 198", // sağ yuvarlak omuz (V2-6D: daha geniş beden)
  "C 442 242 436 322 416 374", // sağ yan → bel daralması
  "C 410 400 428 432 432 468", // bel → kalça flare (SP x432 hizası)
  "C 438 516 414 556 362 584", // kalça → uyluk sönüm
  "C 320 598 250 600 230 600", // uyluk → alt orta (geniş taban, Root kapsar)
  "C 210 600 140 598 98 584", // sol simetrik sönüm
  "C 46 556 22 516 28 468", // sol kalça flare (Spleen x28 hizası)
  "C 32 432 50 400 44 374", // sol bel
  "C 24 322 18 242 36 198", // sol yuvarlak omuz
  "C 74 152 154 130 208 122", // sol omuz → boyun
  // sol YÜZ PROFİLİ (çene → dudak → burun → alın) — HEPSİ KORUNUR:
  "C 214 118 214 116 212 112", // boyun → çene
  "C 205 110 202 106 205 101", // çene → alt dudak
  "C 208 98 206 95 201 93", // dudak
  "C 196 91 190 89 189 85", // ağız → burun altı
  "C 188 81 194 78 199 75", // burun çıkıntısı
  "C 203 71 202 66 205 61", // burun köprüsü → göz
  "C 208 52 210 40 216 30", // alın
  "C 220 22 226 17 232 16", // alın → crown (kapanış)
  "Z",
].join(" ");
