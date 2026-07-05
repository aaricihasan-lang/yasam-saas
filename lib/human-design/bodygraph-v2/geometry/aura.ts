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
  "C 304 128 374 148 412 192", // sağ yuvarlak omuz (genişçe)
  "C 428 232 420 300 398 362", // sağ yan → bel daralması
  "C 392 386 410 412 418 456", // bel → kalça flare (SP x408 kapsar)
  "C 424 508 398 552 352 582", // kalça → uyluk sönüm
  "C 314 596 250 600 230 600", // uyluk → alt orta (geniş taban)
  "C 210 600 146 596 108 582", // sol simetrik sönüm
  "C 62 552 36 508 42 456", // sol kalça flare (Spleen x52 kapsar)
  "C 50 412 68 386 62 362", // sol bel
  "C 40 300 32 232 48 192", // sol yuvarlak omuz
  "C 86 148 156 128 208 122", // sol omuz → boyun
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
