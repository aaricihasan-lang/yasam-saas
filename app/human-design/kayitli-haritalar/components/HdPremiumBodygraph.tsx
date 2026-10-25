"use client";

// Bireysel harita — Yaşam Sistemi PREMIUM BodyGraph (owner PASS 2026-10-18; aktif çizici, bkz. rendererConfig).
// Connection ile AYNI çizim (mühürlü V9 geometri, premium borular, referanstan ölçülen silüet, logo).
// Veri yalnız kayıtlı computed_result (premiumStateFromChart; kayıtlı listelerle birebir doğrulanır).
// Renk (geleneksel HD): Kişilik (bilinçli) SİYAH · Tasarım (bilinçsiz) KIRMIZI · ikisi çizgili / iki renkli kapı.
// Salt görüntü (kanal seçimi yok); Design / Personality sütunları ve kartlar aynen kalır. Ekranda grafiğe logo çizilmez;
// Word görselinde logo vardır.
// 2026-10-25 owner kararı: bilgi panelindeki logo kaldırıldı; marka imzası ("Yaşam Sistemi" + "yasamsistemi.com", iki
// yatay satır) KÖK merkezinin hemen altında, açıklama satırının üstünde. SVG'ye eklenmez (çizim / geometri / Word aynı):
// HTML katmanı, ekrandaki gerçek Kök merkezine göre ölçülür → her ekran boyutunda haritayla hizalı, harita küçülmez.

import { useLayoutEffect, useMemo, useRef } from "react";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { buildConnectionBodygraphScene, CBG_PALETTE_COLOR, CBG_VIEW } from "@/lib/human-design/relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_TONE } from "@/lib/human-design/bodygraph/rendererConfig";
import { ConnectionBodygraph } from "@/app/human-design/iliski-grup/components/ConnectionBodygraph";

export const HD_PREMIUM_BODYGRAPH_ASPECT = `${CBG_VIEW.width} / ${CBG_VIEW.height}`;

/** İmza ölçüsü BodyGraph'ın ekrandaki yüksekliğine oranla (referans: 746px yükseklikte ad 22px; adres adın 0.6'sı). */
const BRAND_NAME_RATIO = 0.0295;
const BRAND_GAP_RATIO = 0.012;

/** Kök merkezinin altına yerleşen marka imzasının konum / boyutu (yalnız sunum; ResizeObserver ile güncel kalır). */
function useRootBrandPlacement() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const brand = brandRef.current;
    if (!wrap || !brand) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const root = wrap.querySelector<SVGGraphicsElement>('[data-hd-cbg-center^="Root:"]');
      const svg = wrap.querySelector("svg");
      if (!root || !svg) {
        brand.style.visibility = "hidden";
        return;
      }
      const w = wrap.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      const g = svg.getBoundingClientRect();
      // Görünür çizim yüksekliği (preserveAspectRatio "meet": viewBox oranı) — imza ölçeği buna bağlı.
      const drawH = Math.min(g.height, (g.width * CBG_VIEW.height) / CBG_VIEW.width);
      brand.style.left = `${r.left + r.width / 2 - w.left}px`;
      brand.style.top = `${r.bottom - w.top + drawH * BRAND_GAP_RATIO}px`;
      brand.style.setProperty("--hd-brand-name", `${Math.max(14, drawH * BRAND_NAME_RATIO)}px`);
      brand.style.visibility = "visible";
    };
    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    apply();
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    window.addEventListener("resize", schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return { wrapRef, brandRef };
}

export function HdPremiumBodygraph({ state }: { state: CbgState }) {
  const prims = useMemo(() => buildConnectionBodygraphScene(state), [state]);
  const { wrapRef, brandRef } = useRootBrandPlacement();
  const pColor = CBG_PALETTE_COLOR.individual[HD_PREMIUM_INDIVIDUAL_TONE.personality];
  const dColor = CBG_PALETTE_COLOR.individual[HD_PREMIUM_INDIVIDUAL_TONE.design];
  return (
    <div className="flex h-full w-full flex-col" data-hd-premium-bodygraph="ready">
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <ConnectionBodygraph prims={prims} label="Human Design BodyGraph" logoSrc={null} sizeClass="h-full w-full" />
        {/* Marka imzası: Kök'ün altında, ortalı, iki yatay satır. Tıklamayı engellemez; ekran okuyucuda tek metin. */}
        <div
          ref={brandRef}
          className="pointer-events-none absolute -translate-x-1/2 leading-none"
          style={{ visibility: "hidden" }}
          data-hd-brand-signature
        >
          {/* Silüetin alt kavisini izleyen ÇOK hafif yay (owner 2026-10-25): bağımsız küçük SVG textPath — BodyGraph SVG'si
              değişmez. viewBox birimi: ad 30, adres 18 (ad ≥14px → adres ≥ ~8.4px; ölçek adın px boyutundan). */}
          <svg
            viewBox="0 0 300 64"
            style={{ width: "calc(var(--hd-brand-name, 22px) * 10)", height: "calc(var(--hd-brand-name, 22px) * 10 * 64 / 300)", overflow: "visible" }}
            role="img"
            aria-label="Yaşam Sistemi — yasamsistemi.com"
          >
            <defs>
              <path id="hd-brand-arc-name" d="M 4 25 Q 150 37 296 25" />
              <path id="hd-brand-arc-url" d="M 24 51 Q 150 60 276 51" />
            </defs>
            <text fill="#3f5a9c" fillOpacity={0.84} fontSize={30} fontWeight={600} letterSpacing={0.3} textAnchor="middle">
              <textPath href="#hd-brand-arc-name" startOffset="50%">Yaşam Sistemi</textPath>
            </text>
            <text fill="#4d659f" fillOpacity={0.82} fontSize={18} fontWeight={500} letterSpacing={2.4} textAnchor="middle">
              <textPath href="#hd-brand-arc-url" startOffset="50%">yasamsistemi.com</textPath>
            </text>
          </svg>
        </div>
      </div>
      <p className="m-0 mt-1 flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-600" data-hd-premium-legend>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: pColor }} />Kişilik (bilinçli)</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: dColor }} />Tasarım (bilinçsiz)</span>
        <span>Çizgili / iki renkli: ikisi birden</span>
      </p>
    </div>
  );
}
