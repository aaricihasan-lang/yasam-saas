// GEÇİCİ CI GÖRSEL KANIT SAYFASI (.github/font-kanit; final commit'te kaldırılır). Sonra (next/font/local) sürümü: uygulamadaki yeni tanımların birebir kopyası.
import localFont from "next/font/local";
import { premiumFontVars } from "@/app/_premium/fonts";
import { energyFontVars } from "@/app/_premium/enerji-beden/fonts";
import { atlasDisplay, atlasText } from "@/app/admin/astroloji/_components/atlas/fonts";

const gaDisplay = localFont({ src: "../_fonts/fraunces.woff2", weight: "100 900", variable: "--ga-display", display: "swap", adjustFontFallback: "Times New Roman" });
const gaLabel = localFont({ src: [{ path: "../_fonts/jost.woff2", weight: "500", style: "normal" }], variable: "--ga-label", display: "swap" });
const hdLabel = localFont({ src: [{ path: "../_fonts/jost.woff2", weight: "400", style: "normal" }], variable: "--hd-label", display: "swap" });
const serif = localFont({ src: [{ path: "../_fonts/playfair-display.ttf", weight: "600", style: "normal" }], variable: "--amc-serif", display: "swap", adjustFontFallback: "Times New Roman" });

const METIN = "Pijamalı hasta yağız şoföre çabucak güvendi. İĞŞÇÖÜ ığşçöü 0123456789 ₺ € ‰ † _ ǖ “Yaşam”";

function Satir({ aile, agirlik, boyut, ek }: { aile: string; agirlik: number; boyut: number; ek?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", whiteSpace: "nowrap" }}>
      <code style={{ width: 210, flex: "none", fontFamily: "monospace", fontSize: 11, color: "#666" }}>{aile} {agirlik} {boyut}px</code>
      <span data-kanit={`${aile} ${agirlik}`} style={{ fontFamily: `var(${aile})`, fontWeight: agirlik, fontSize: boyut, ...ek }}>{METIN}</span>
    </div>
  );
}

export default function Kanit() {
  const vars = [premiumFontVars, energyFontVars, atlasDisplay.variable, atlasText.variable, gaDisplay.variable, gaLabel.variable, hdLabel.variable, serif.variable].join(" ");
  return (
    <main className={vars} style={{ padding: 16, background: "#fff", color: "#111" }}>
      {[100, 400, 500, 700, 900].map((w) => <Satir key={`g${w}`} aile="--font-geist-sans" agirlik={w} boyut={16} />)}
      {[400, 700].map((w) => <Satir key={`m${w}`} aile="--font-geist-mono" agirlik={w} boyut={14} />)}
      {[300, 600, 900].map((w) => <Satir key={`f${w}`} aile="--font-display" agirlik={w} boyut={30} />)}
      <Satir aile="--font-display" agirlik={400} boyut={56} ek={{ fontVariationSettings: '"SOFT" 100' }} />
      <Satir aile="--eb-serif" agirlik={500} boyut={12} />
      <Satir aile="--ga-display" agirlik={400} boyut={40} />
      {[400, 500, 600].map((w) => <Satir key={`j${w}`} aile="--eb-label" agirlik={w} boyut={18} />)}
      <Satir aile="--ga-label" agirlik={500} boyut={14} ek={{ letterSpacing: "0.18em", textTransform: "uppercase" }} />
      <Satir aile="--hd-label" agirlik={400} boyut={15} />
      {[300, 400, 500, 600, 700].map((w) => <Satir key={`r${w}`} aile="--font-atlas-text" agirlik={w} boyut={16} />)}
      {[300, 400, 600].map((w) => <Satir key={`u${w}`} aile="--font-atlas-display" agirlik={w} boyut={26} />)}
      {[400, 600, 800].map((w) => <Satir key={`p${w}`} aile="--amc-serif" agirlik={w} boyut={28} />)}
    </main>
  );
}
