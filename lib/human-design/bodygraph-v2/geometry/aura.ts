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
  "C 296 132 350 156 378 200", // sağ orta-boy omuz (V2-7: slim/tall figür)
  "C 392 250 384 305 362 344", // sağ omuz → BEL daralması (hourglass)
  "C 388 378 410 410 412 452", // bel → ölçülü kalça (yan merkez hizası)
  "C 412 500 388 542 344 576", // kalça → uyluk sönüm
  "C 306 594 250 598 230 598", // uyluk → alt orta
  "C 210 598 154 594 116 576", // sol uyluk
  "C 72 542 48 500 48 452", // sol ölçülü kalça
  "C 50 410 76 378 98 344", // sol BEL daralması
  "C 76 305 68 250 82 200", // sol orta-boy omuz
  "C 110 156 164 132 208 122", // sol omuz → boyun
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
