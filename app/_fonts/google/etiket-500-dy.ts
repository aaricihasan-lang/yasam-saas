/**
 * Jost 500 etiket yüzleri — yalnız Danışan Yolculuğu. etiket-500.ts ile aynı dosyalar ve aynı aile (Jost500); ayrı modül
 * olması, ortak modülün Turbopack'te Atlas / Analiz Merkezi CSS parçasıyla birleşip bu rotaya Atlas yazı tiplerini ön
 * yükletmesini önler. Değişken eşlemesi: degiskenler.css (--font-jost-500 → --dy-label).
 */
import jost500Cyrillic from "./jost-500-dy-cyrillic";
import jost500LatinExt from "./jost-500-dy-latin-ext";
import jost500Latin from "./jost-500-dy-latin";

/** Kök öğeye eklenecek değişken sınıfları (--font-jost-500). */
export const jost500Vars = [jost500Cyrillic, jost500LatinExt, jost500Latin].map((f) => f.variable).join(" ");
