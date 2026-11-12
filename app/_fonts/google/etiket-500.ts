/**
 * Jost 500 etiket yüzleri (Atlas girişi, Analiz Merkezi kartları; Danışan Yolculuğu: etiket-500-dy.ts). Önceki kurulumda
 * bu bileşenler Jost'u yalnız 500 ağırlığıyla isterdi → Google'ın statik 500 alt küme dosyaları; buradaki dosyalar onlarla bayt bayt aynı.
 * Global değildir: yalnız içe aktaran bileşenin rotasında yüklenir. Değişken eşlemesi: degiskenler.css (--font-jost-500).
 */
import jost500Cyrillic from "./jost-500-cyrillic";
import jost500LatinExt from "./jost-500-latin-ext";
import jost500Latin from "./jost-500-latin";

/** Kök öğeye eklenecek değişken sınıfları (--font-jost-500). */
export const jost500Vars = [jost500Cyrillic, jost500LatinExt, jost500Latin].map((f) => f.variable).join(" ");
