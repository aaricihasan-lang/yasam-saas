"use client";

/**
 * Yaşam Analiz Merkezi → Gökyüzü Atlası kartı (2026-10-15 owner kararı: Atlas ana panelde ayrı kart değil, merkezin
 * içinde). Görünürlük SUNUCUNUN erişim yoklamasıyla belirlenir (fail-closed): /api/astroloji/access yalnız sistem
 * sahibine ve Astroloji yetkisi açık uzmana 200 döner; diğer herkese tek tip 404 → kart hiç çizilmez (modülün varlığı
 * sızmaz, yanıp sönme yok). Sayfa ve API ayrıca kendi kapılarıyla korunur; bu yalnız görünürlüktür.
 * Adres değişmedi: /astroloji (eski bağlantılar ve yer imleri çalışır).
 *
 * 2026-10-16 görünüm (owner referans görseli): koyu kozmik zemin, altın başlık, yıldızlar ve burç çarkı; dekor tamamen
 * satır içi SVG (görsel dosyası / dış kaynak yok). Burç simgeleri unicode DEĞİL çizgi — Android'de renkli emojiye dönmesin.
 * 2026-10-17 owner kararı: kart diğer modül kartlarıyla AYNI genişlikte (ızgarada tek hücre; tam satır YOK).
 */
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ArrowRight } from "lucide-react";
import { astroFetch } from "@/app/admin/astroloji/_lib/api";

// Sabit yıldız alanı (x%, y%, yarıçap, parlak mı) — rastgele değil → SSR/istemci aynı, titreme yok. Metin bölgesine
// düşenler çizilmez (harf üstünde nokta / aksan gibi görünmesin).
const STARS: [number, number, number, boolean][] = [
  [4, 12, 0.9, false], [9, 70, 1.1, true], [14, 30, 0.7, false], [19, 88, 0.8, false], [24, 18, 1.3, true],
  [29, 55, 0.6, false], [33, 8, 0.8, false], [36, 80, 1.0, false], [40, 36, 0.7, false], [44, 14, 1.2, true],
  [47, 66, 0.6, false], [51, 90, 0.9, false], [54, 28, 0.7, false], [57, 48, 1.4, true], [60, 10, 0.6, false],
  [63, 76, 0.8, false], [3, 46, 0.6, false], [27, 95, 0.6, false], [49, 4, 0.7, false], [66, 40, 0.6, false],
];

/** Burç çarkı + merkez yıldızı + hilal (yalnız çizgi; altın tonları). */
function ZodiacWheel({ gid }: { gid: string }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const signs = Array.from({ length: 12 }, (_, i) => i * 30);
  const star8 = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? 30 : 20) : 6;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="-120 -120 240 240" className="h-full w-full" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor="#F5D08A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#F5D08A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-gold`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE3B0" />
          <stop offset="1" stopColor="#C9944A" />
        </linearGradient>
      </defs>
      <circle r="60" fill={`url(#${gid}-glow)`} />
      <g fill="none" stroke="#E7C383" strokeLinecap="round">
        <circle r="112" strokeOpacity="0.28" strokeWidth="0.8" />
        <circle r="98" strokeOpacity="0.55" strokeWidth="1" />
        <circle r="80" strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="1.5 3" />
        <circle r="58" strokeOpacity="0.55" strokeWidth="1" />
        <circle r="44" strokeOpacity="0.3" strokeWidth="0.7" />
        {ticks.map((d) => (
          <line key={d} x1="0" y1={d % 30 === 0 ? -98 : -98} x2="0" y2={d % 30 === 0 ? -80 : -92} transform={`rotate(${d})`} strokeOpacity={d % 30 === 0 ? 0.6 : 0.3} strokeWidth="0.7" />
        ))}
        {/* Burç dilimleri: her dilimde küçük işaret (sembolik, okunacak metin değil) */}
        {signs.map((d) => (
          <g key={d} transform={`rotate(${d + 15}) translate(0 -105)`} strokeOpacity="0.7" strokeWidth="1.1">
            {d % 90 === 0 ? <circle r="2.6" /> : d % 60 === 0 ? <path d="M-3 2 L0 -3 L3 2" /> : <path d="M-3 -1.5 Q0 3 3 -1.5" />}
          </g>
        ))}
        {/* Açı çizgileri (harita açılarını çağrıştırır) */}
        <polygon points="0,-58 50.2,29 -50.2,29" strokeOpacity="0.25" strokeWidth="0.7" />
        <polygon points="0,58 50.2,-29 -50.2,-29" strokeOpacity="0.18" strokeWidth="0.7" />
      </g>
      <polygon points={star8} fill={`url(#${gid}-gold)`} />
      {/* Hilal */}
      <path d="M-62 30 a18 18 0 1 0 22 26 a14 14 0 1 1 -22 -26 z" fill={`url(#${gid}-gold)`} opacity="0.9" />
      {[[-30, -70], [64, -40], [30, 70], [-78, -18], [84, 18]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="#FBE3B0" className="hidden sm:inline" />
      ))}
    </svg>
  );
}

export default function AtlasCenterCard() {
  const [allowed, setAllowed] = useState(false);
  const gid = useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    let alive = true;
    void astroFetch<{ ok: true }>("/api/admin/astroloji/access").then((r) => {
      if (alive) setAllowed(r.ok);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!allowed) return null;
  return (
    <Link
      href="/astroloji"
      className="group relative isolate flex min-h-[184px] overflow-hidden rounded-[18px] sm:min-h-[188px] bg-[#0B1030] shadow-[0_14px_32px_-20px_rgba(30,20,90,0.7)] ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-20px_rgba(60,40,160,0.8)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D9B56F]"
      data-testid="life-analysis-atlas-card"
    >
      {/* Kozmik arka plan: lacivert taban + mor bulutsu ışımaları */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_90%_at_85%_45%,rgba(99,62,190,0.5),transparent_70%),radial-gradient(ellipse_55%_60%_at_5%_5%,rgba(76,52,160,0.35),transparent_70%),linear-gradient(125deg,#0A0E2C_0%,#141a4a_60%,#1d1450_100%)]"
      />
      {/* Yıldız alanı */}
      <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 -z-10 h-full w-full" preserveAspectRatio="none">
        {STARS.filter(([x, y]) => !(x < 72 && y > 8 && y < 90)).map(([x, y, r, bright], i) => (
          <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill={bright ? "#FCE7B8" : "#FFFFFF"} opacity={bright ? 0.95 : 0.55} />
        ))}
      </svg>
      {/* Burç çarkı: küçük kartın sağında, kenardan taşarak (kırpılma kasıtlı, metnin altına girmez) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 top-1/2 -z-10 h-[190px] w-[190px] -translate-y-1/2 opacity-40 transition-transform duration-700 group-hover:rotate-[8deg] sm:-right-14 sm:h-[200px] sm:w-[200px] sm:opacity-80"
      >
        <ZodiacWheel gid={gid} />
      </div>

      <div className="relative flex w-full flex-col justify-center gap-1.5 py-5 pl-5 pr-[5.5rem] sm:pr-[10.5rem]">
        <h2 className="text-xl font-bold tracking-tight text-[#F3D7A0] sm:text-2xl">Gökyüzü Atlası</h2>
        <p className="text-sm leading-6 text-white">Tüm astroloji analizleri, danışan arşivi ve haritalı Word / PDF raporları.</p>
      </div>

      <span
        aria-hidden="true"
        className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#E7C383]/80 bg-[#0B1030]/80 text-[#F3D7A0] shadow-[0_0_16px_-4px_rgba(245,208,138,0.55)] backdrop-blur-sm transition duration-200 group-hover:translate-x-0.5 group-hover:border-[#F5D08A] group-hover:shadow-[0_0_22px_-2px_rgba(245,208,138,0.7)]"
      >
        <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
    </Link>
  );
}
