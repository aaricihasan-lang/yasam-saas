/**
 * Jost 400 etiket yüzleri (Human Design merkezi). Önceki kurulumda bu bileşen Jost'u yalnız 400 ağırlığıyla isterdi →
 * Google'ın statik 400 alt küme dosyaları; buradaki dosyalar onlarla bayt bayt aynı.
 * Global değildir: yalnız içe aktaran bileşenin rotasında yüklenir. Değişken eşlemesi: degiskenler.css (--font-jost-400).
 */
import jost400Cyrillic from "./jost-400-cyrillic";
import jost400LatinExt from "./jost-400-latin-ext";
import jost400Latin from "./jost-400-latin";

/** Kök öğeye eklenecek değişken sınıfları (--font-jost-400). */
export const jost400Vars = [jost400Cyrillic, jost400LatinExt, jost400Latin].map((f) => f.variable).join(" ");
