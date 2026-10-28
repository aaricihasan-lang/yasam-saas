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
// Owner revizyonu: düz, temiz yatay yazı; orta koyulukta mavi (~%85). Yaylı textPath denemesi harf hizasını bozduğu için
// kaldırıldı (bütün kelimeyi bozmadan bükmek font konturlarının vektöre çevrilmesini gerektirir — kapsam dışı).

import { useLayoutEffect, useMemo, useRef } from "react";
import type { CbgState } from "@/lib/human-design/relations/connectionBodygraphScene";
import { buildConnectionBodygraphScene, CBG_PALETTE_COLOR, CBG_VIEW } from "@/lib/human-design/relations/connectionBodygraphScene";
import { HD_PREMIUM_INDIVIDUAL_TONE } from "@/lib/human-design/bodygraph/rendererConfig";
import { ConnectionBodygraph } from "@/app/human-design/iliski-grup/components/ConnectionBodygraph";

export const HD_PREMIUM_BODYGRAPH_ASPECT = `${CBG_VIEW.width} / ${CBG_VIEW.height}`;

/** İmza ölçüleri BodyGraph'ın ekrandaki yüksekliğine oranla (referans: 746px yükseklikte ad 22px, adres 12px). */
const BRAND_NAME_RATIO = 0.0295;
const BRAND_URL_RATIO = 0.0158;
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
      brand.style.setProperty("--hd-brand-url", `${Math.max(10, drawH * BRAND_URL_RATIO)}px`);
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
          className="pointer-events-none absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap leading-none"
          style={{ visibility: "hidden" }}
          data-hd-brand-signature
        >
          <span
            className="font-semibold tracking-[0.01em] text-[#3f5a9c]/[0.86]"
            style={{ fontSize: "var(--hd-brand-name, 22px)", lineHeight: 1.15 }}
          >
            Yaşam Sistemi
          </span>
          <span
            className="mt-[0.35em] font-medium tracking-[0.16em] text-[#4d659f]/[0.84]"
            style={{ fontSize: "var(--hd-brand-url, 12px)" }}
          >
            yasamsistemi.com
          </span>
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
