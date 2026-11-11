// KANIT SAYFASI (yalnız CI runner'ında; ürüne girmez). #777'nin dokunduğu ve dışa aktarılan BÜTÜN yazı tipi değişkenleri:
// her değişken × kullanılan ağırlıklar (+ eğik: sentez davranışı) aynı Türkçe metinle. CDP her öğenin çizen fontunu raporlar.
// Dışa aktarılmayan değişkenler gerçek sayfalarında sınanır: --ga-* atlas-giris, --hero-* / --amc-* analiz, --dy-* dy, --hd-* hd.
import { premiumFontVars } from "@/app/_premium/fonts";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const METIN = "Ağaç gölgesinde İğdır şıkışık çiçekleri — ĞÜŞİÖÇ ğüşıöç 0123456789 ₺ € % “Ş”";
const DEGISKENLER: [string, number[]][] = [
  ["--font-geist-sans", [300, 400, 500, 600, 700]],
  ["--font-geist-mono", [400, 600]],
  ["--font-display", [300, 400, 500, 600]],
  ["--eb-serif", [300, 400, 500, 600]],
  ["--eb-label", [400, 500]],
  ["--font-atlas-display", [300, 400]],
  ["--font-atlas-text", [300, 400, 500, 600]],
];

export default function Page() {
  return (
    <main className={`${premiumFontVars} ${energyFontVars} ${atlasDisplay.variable} ${atlasText.variable}`} style={{ padding: 16, background: "#fff", color: "#111" }}>
      {DEGISKENLER.map(([v, ag]) => (
        <section key={v} style={{ marginBottom: 14 }}>
          <h2 data-k={`baslik ${v}`} style={{ font: "600 12px/1.3 monospace", margin: "0 0 4px" }}>
            {v}
          </h2>
          {ag.map((w) => (
            <p key={w} data-k={`${v} ${w}`} style={{ fontFamily: `var(${v})`, fontWeight: w, fontSize: 20, margin: "2px 0" }}>
              {w} · {METIN}
            </p>
          ))}
          <p data-k={`${v} egik`} style={{ fontFamily: `var(${v})`, fontStyle: "italic", fontSize: 20, margin: "2px 0" }}>
            eğik · {METIN}
          </p>
        </section>
      ))}
    </main>
  );
}
