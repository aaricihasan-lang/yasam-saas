// Premium BodyGraph V2 — aura insan silüeti (saf veri). 460×600, x-ekseni 230.
//
// Sola bakan YÜZ PROFİLİ (alın→burun→dudak→çene) + geniş omuz + gövde + leğen.
// Tek KAPALI path (polygon/circle KULLANMAZ → invariant korunur). Merkezleri kapsar;
// omuzlar yan merkezleri (Spleen x60 / SolarPlexus x400) ve kavisli yayları içerir.

export const AURA_PATH = [
  "M 232 16",
  "C 254 16 268 34 267 62", // sağ kafatası
  "C 266 90 258 106 252 122", // sağ çene → boyun
  "C 296 130 358 150 398 196", // sağ omuz
  "C 414 236 410 300 400 356", // sağ üst yan
  "C 392 410 372 460 344 502", // sağ bel → kalça
  "C 320 536 288 566 250 588", // sağ bacak → sönüm
  "C 240 592 236 594 230 596", // alt orta
  "C 224 594 220 592 210 588", // sol sönüm
  "C 172 566 140 536 116 502", // sol kalça
  "C 88 460 68 410 60 356", // sol bel/yan
  "C 50 300 46 236 62 196", // sol alt yan
  "C 102 150 164 130 208 122", // sol omuz → boyun
  // sol YÜZ PROFİLİ (çene → dudak → burun → alın):
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
