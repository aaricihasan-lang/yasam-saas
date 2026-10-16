/**
 * Yaşam Analiz Merkezi modül kartları — ikonlar ve dekor çizimleri (variant başına).
 *
 * Tamamen satır içi SVG: görsel dosyası / dış kaynak yok, CSP ve Android WebView ile uyumlu. Burç ve diğer semboller
 * unicode DEĞİL çizgi (Android'de renkli emojiye dönmesin). Koordinatlar sabit → SSR/istemci aynı, titreme yok.
 * Gradient kimlikleri kart başına `gid` ile önekli (aynı sayfada birden çok kart çakışmasın).
 */
import { ChartColumn } from "lucide-react";
import type { ComponentType } from "react";
import type { AnalysisModuleVariant } from "./analysisModuleThemes";

export interface ModuleArtProps {
  gid: string;
  /** Hover'da hafif dönecek öğeye verilecek sınıf (CSS modülünden). */
  spinClassName: string;
}

const SERIF = { fontFamily: "var(--amc-serif), Georgia, serif" } as const;
const VIEW = "0 0 340 280";

function polar(r: number, deg: number, cx = 0, cy = 0): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

/** Dört köşeli parıltı (merkez 0,0). */
function sparklePath(r: number, w = r * 0.18): string {
  return `M0 ${-r} L${w} ${-w} L${r} 0 L${w} ${w} L0 ${r} L${-w} ${w} L${-r} 0 L${-w} ${-w} Z`;
}

/* ── İkonlar ─────────────────────────────────────────────────────────────── */

function NumerologyIcon() {
  return <ChartColumn strokeWidth={2} />;
}

function HumanDesignIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" focusable="false">
      <path d="M12 2.5 L20 14 L12 21.5 L4 14 Z" />
      <path d="M12 2.5 V21.5 M4 14 H20" strokeOpacity="0.7" />
      <circle cx="12" cy="14" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SkyAtlasIcon() {
  return (
    <svg viewBox="-12 -12 24 24" focusable="false">
      <path d={sparklePath(10.5, 2)} fill="currentColor" />
      <path d={sparklePath(5.5, 1.2)} fill="currentColor" opacity="0.55" transform="rotate(45)" />
    </svg>
  );
}

/* ── A: Numeroloji — sayı halkası, kristal küre, mistik geometri ───────── */

const NUM_RING: [number, number][] = [
  [9, -90], [3, -45], [6, 0], [2, 45], [8, 90], [4, 135], [1, 180], [5, 225],
];

function NumerologyArt({ gid }: ModuleArtProps) {
  const cx = 190;
  const cy = 128;
  const hexA = [0, 120, 240].map((d) => polar(46, d - 90, cx, cy).map((v) => v.toFixed(1)).join(",")).join(" ");
  const hexB = [60, 180, 300].map((d) => polar(46, d - 90, cx, cy).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id={`${gid}-halo`}>
          <stop offset="0" stopColor="#fff6e2" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#e4d4ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#e4d4ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${gid}-orb`} cx="0.38" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#b493f2" />
          <stop offset="0.45" stopColor="#6a3cb8" />
          <stop offset="1" stopColor="#2c1260" />
        </radialGradient>
        <linearGradient id={`${gid}-gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1cc" />
          <stop offset="1" stopColor="#d9a650" />
        </linearGradient>
        <linearGradient id={`${gid}-stone`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2edf7" />
          <stop offset="1" stopColor="#b8aec8" />
        </linearGradient>
        <linearGradient id={`${gid}-wave`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9b2f5" stopOpacity="0" />
          <stop offset="0.5" stopColor="#b292ee" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f3dcb4" stopOpacity="0.6" />
        </linearGradient>
        <radialGradient id={`${gid}-pearl`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#e6dcf5" />
          <stop offset="1" stopColor="#a993cf" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="132" fill={`url(#${gid}-halo)`} />

      <g transform={`translate(${cx} ${cy + 6}) scale(0.84) translate(${-cx} ${-cy})`}>
        {/* Mermer kaide */}
        <ellipse cx={cx} cy={cy + 82} rx="58" ry="11" fill="#9d90b6" opacity="0.4" />
        <path d={`M${cx - 54} ${cy + 66} v11 a54 10 0 0 0 108 0 v-11 z`} fill={`url(#${gid}-stone)`} />
        <ellipse cx={cx} cy={cy + 66} rx="54" ry="10" fill="#f7f3fb" stroke="#d8cde6" strokeWidth="0.6" />

        {/* Yörünge + sayı halkası */}
        <g fill="none" stroke="#c9a15a" strokeLinecap="round">
          <circle cx={cx} cy={cy} r="122" strokeOpacity="0.35" strokeWidth="0.8" />
          <circle cx={cx} cy={cy} r="100" strokeOpacity="0.5" strokeWidth="0.9" />
          <circle cx={cx} cy={cy} r="78" strokeOpacity="0.4" strokeWidth="0.7" strokeDasharray="1.5 3.5" />
        </g>
        {[-60, 20, 160, 250].map((d) => {
          const [x, y] = polar(122, d, cx, cy);
          return <circle key={d} cx={x} cy={y} r="2.2" fill="#f2dcae" stroke="#c9a15a" strokeWidth="0.5" />;
        })}
        {NUM_RING.map(([n, d]) => {
          const [x, y] = polar(100, d, cx, cy);
          return (
            <g key={n}>
              <circle cx={x} cy={y} r="13" fill="#ffffff" fillOpacity="0.22" stroke="#c9a15a" strokeOpacity="0.45" strokeWidth="0.7" />
              <text x={x} y={y + 5.5} textAnchor="middle" fontSize="16" fill="#6b4a2a" fillOpacity="0.85" style={SERIF}>
                {n}
              </text>
            </g>
          );
        })}

        {/* Kristal küre + çiçek-i hayat + hexagram + 7 */}
        <circle cx={cx} cy={cy} r="58" fill={`url(#${gid}-orb)`} />
        <g fill="none" stroke="#f3d9a2" strokeOpacity="0.2" strokeWidth="0.6">
          <circle cx={cx} cy={cy} r="24" />
          {[0, 60, 120, 180, 240, 300].map((d) => {
            const [x, y] = polar(24, d, cx, cy);
            return <circle key={d} cx={x} cy={y} r="24" />;
          })}
        </g>
        <g fill="none" stroke={`url(#${gid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" opacity="0.9">
          <polygon points={hexA} />
          <polygon points={hexB} />
        </g>
        <circle cx={cx} cy={cy} r="58" fill="none" stroke="#f3d9a2" strokeOpacity="0.45" strokeWidth="0.8" />
        <ellipse cx={cx - 20} cy={cy - 30} rx="20" ry="11" fill="#ffffff" opacity="0.16" transform={`rotate(-30 ${cx - 20} ${cy - 30})`} />
        <text x={cx} y={cy + 17} textAnchor="middle" fontSize="50" fontWeight="600" fill={`url(#${gid}-gold)`} style={SERIF}>
          7
        </text>
      </g>

      {/* Hilal, parıltılar, inci */}
      <path d="M96 110 a14 14 0 1 0 16 -18 a10.5 10.5 0 1 1 -16 18 z" fill={`url(#${gid}-gold)`} opacity="0.9" />
      <path d={sparklePath(11)} transform="translate(96 30)" fill="#d9a650" opacity="0.85" />
      <path d={sparklePath(6)} transform="translate(318 128)" fill="#f2c96f" opacity="0.9" />
      <path d={sparklePath(4)} transform="translate(300 52)" fill="#ffffff" opacity="0.8" />
      <circle cx="300" cy="214" r="14" fill={`url(#${gid}-pearl)`} opacity="0.9" />
      <circle cx="312" cy="34" r="9" fill={`url(#${gid}-pearl)`} opacity="0.85" />

      {/* Akan lila dalga */}
      <path d="M0 250 C70 214 130 262 210 236 S318 196 340 206 V280 H0 Z" fill={`url(#${gid}-wave)`} />
      <path d="M0 266 C90 236 150 274 230 252 S320 226 340 232" fill="none" stroke="#f3dcb4" strokeOpacity="0.7" strokeWidth="1" />
    </svg>
  );
}

/* ── B: Human Design — bodygraph merkezleri, enerji kanalları ───────────── */

type Center = { d: string; fill: string; opacity?: number };

/** 9 merkez (beden grafiği yerleşimi), figür merkezine göre. */
const HD_CENTERS: Center[] = [
  { d: "M0 -128 L13 -106 L-13 -106 Z", fill: "#f1e3bd", opacity: 0.85 }, // Baş
  { d: "M-13 -96 L13 -96 L0 -74 Z", fill: "#7fe3c8", opacity: 0.85 }, // Ajna
  { d: "M-10 -60 h20 v20 h-20 Z", fill: "#e8f6f1", opacity: 0.7 }, // Boğaz
  { d: "M0 -26 L15 -11 L0 4 L-15 -11 Z", fill: "#e6b85c" }, // G
  { d: "M24 -4 L36 8 L20 10 Z", fill: "#d98a74", opacity: 0.85 }, // Kalp
  { d: "M-58 28 L-36 42 L-58 56 Z", fill: "#5fd3b3", opacity: 0.8 }, // Dalak
  { d: "M58 28 L36 42 L58 56 Z", fill: "#e6b85c", opacity: 0.85 }, // Solar pleksus
  { d: "M-12 30 h24 v24 h-24 Z", fill: "#d4675a", opacity: 0.9 }, // Sakral
  { d: "M-12 72 h24 v24 h-24 Z", fill: "#e6b85c", opacity: 0.9 }, // Kök
];

const HD_CHANNELS: [number, number, number, number][] = [
  [0, -106, 0, -96], [0, -74, 0, -60], [0, -40, 0, -26], [0, 4, 0, 30], [0, 54, 0, 72],
  [-10, -44, -50, 32], [10, -44, 50, 32], [-42, 48, -12, 78], [42, 48, 12, 78], [15, -11, 26, 4],
  [-36, 42, -12, 42],
];

function HumanDesignArt({ gid }: ModuleArtProps) {
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id={`${gid}-aura`}>
          <stop offset="0" stopColor="#8af0d4" stopOpacity="0.35" />
          <stop offset="1" stopColor="#8af0d4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6f2dc" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3fbfa0" stopOpacity="0.12" />
        </linearGradient>
        <radialGradient id={`${gid}-glass`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#d9fff3" stopOpacity="0.95" />
          <stop offset="0.55" stopColor="#4cc8a8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#0e6b5c" stopOpacity="0.7" />
        </radialGradient>
        <radialGradient id={`${gid}-bead`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff2c8" />
          <stop offset="1" stopColor="#b8862f" />
        </radialGradient>
        <linearGradient id={`${gid}-ribbon`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7fe3c8" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7fe3c8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#7fe3c8" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Akan enerji şeritleri */}
      <path d="M0 210 C80 170 140 250 230 214 S320 170 340 180 V280 H0 Z" fill={`url(#${gid}-ribbon)`} />
      <path d="M20 40 C90 70 120 150 200 160 S300 120 340 150" fill="none" stroke="#9cf0d8" strokeOpacity="0.16" strokeWidth="14" />

      <g transform="translate(192 146) scale(0.84)">
        <circle r="130" fill={`url(#${gid}-aura)`} />
        <g fill="none" stroke="#e2bf78" strokeLinecap="round">
          <circle r="118" strokeOpacity="0.28" strokeWidth="0.8" />
          <circle r="100" strokeOpacity="0.7" strokeWidth="1.8" strokeDasharray="0.1 7" />
          <circle cy="-18" r="74" strokeOpacity="0.3" strokeWidth="0.8" />
          <circle cy="40" r="62" strokeOpacity="0.22" strokeWidth="0.7" />
        </g>
        {/* Meditasyon silueti (yumuşak, saydam) */}
        <circle cy="-110" r="18" fill={`url(#${gid}-body)`} />
        <path
          d="M-12 -90 C-12 -80 -44 -78 -54 -68 C-68 -54 -64 -12 -62 12 C-60 30 -84 42 -104 58 C-114 68 -90 84 -44 84 L44 84 C90 84 114 68 104 58 C84 42 60 30 62 12 C64 -12 68 -54 54 -68 C44 -78 12 -80 12 -90 Z"
          fill={`url(#${gid}-body)`}
          stroke="#a6f2dc"
          strokeOpacity="0.25"
          strokeWidth="0.8"
        />
        {/* Kanallar + omurga */}
        <g stroke="#f0cf86" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round">
          <line x1="0" y1="-140" x2="0" y2="108" strokeOpacity="0.35" />
          {HD_CHANNELS.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        {/* Merkezler */}
        <g stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round">
          {HD_CENTERS.map((c) => (
            <path key={c.d} d={c.d} fill={c.fill} fillOpacity={c.opacity ?? 1} />
          ))}
        </g>
        {[[-74, -60], [74, -60], [-88, 10], [88, 10], [0, -150]].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" fill="#f0cf86" />
        ))}
      </g>

      {/* Cam küreler + altın boncuklar */}
      <circle cx="44" cy="66" r="15" fill={`url(#${gid}-glass)`} />
      <circle cx="322" cy="166" r="20" fill={`url(#${gid}-glass)`} />
      <circle cx="58" cy="236" r="22" fill={`url(#${gid}-glass)`} opacity="0.8" />
      <circle cx="316" cy="42" r="6" fill={`url(#${gid}-bead)`} />
      <circle cx="300" cy="222" r="5" fill={`url(#${gid}-bead)`} />
      <circle cx="24" cy="150" r="3" fill={`url(#${gid}-bead)`} />
    </svg>
  );
}

/* ── C: Gökyüzü Atlası — burç çarkı, takımyıldız, ay, kozmik bulut ─────── */

// Sabit yıldız alanı (x, y, yarıçap, parlak mı) — viewBox koordinatı.
const ATLAS_STARS: [number, number, number, boolean][] = [
  [14, 30, 0.8, false], [32, 90, 1.1, true], [48, 18, 0.7, false], [22, 160, 0.8, false], [60, 240, 0.9, false],
  [304, 20, 1.2, true], [326, 96, 0.8, false], [318, 250, 1.1, true], [268, 266, 0.7, false], [100, 266, 0.8, false],
  [6, 210, 0.7, false], [334, 186, 0.7, false], [244, 12, 0.8, false], [150, 8, 0.7, false],
];

const CONSTELLATION: [number, number][] = [[18, 120], [44, 96], [70, 106], [86, 74], [118, 58], [140, 30]];

/** Burç çarkı + merkez yıldızı + hilal (yalnız çizgi; altın tonları). Merkez 0,0, yarıçap ~112. */
function ZodiacWheel({ gid }: { gid: string }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const signs = Array.from({ length: 12 }, (_, i) => i * 30);
  const star8 = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? 30 : 20) : 6;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  return (
    <>
      <circle r="60" fill={`url(#${gid}-glow)`} />
      <g fill="none" stroke="#E7C383" strokeLinecap="round">
        <circle r="112" strokeOpacity="0.28" strokeWidth="0.8" />
        <circle r="98" strokeOpacity="0.55" strokeWidth="1" />
        <circle r="80" strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="1.5 3" />
        <circle r="58" strokeOpacity="0.55" strokeWidth="1" />
        <circle r="44" strokeOpacity="0.3" strokeWidth="0.7" />
        {ticks.map((d) => (
          <line key={d} x1="0" y1="-98" x2="0" y2={d % 30 === 0 ? -80 : -92} transform={`rotate(${d})`} strokeOpacity={d % 30 === 0 ? 0.6 : 0.3} strokeWidth="0.7" />
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
      {[[-30, -70], [64, -40], [30, 70], [-78, -18], [84, 18]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="#FBE3B0" />
      ))}
    </>
  );
}

function SkyAtlasArt({ gid, spinClassName }: ModuleArtProps) {
  return (
    <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" focusable="false">
      <defs>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor="#F5D08A" stopOpacity="0.4" />
          <stop offset="1" stopColor="#F5D08A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-gold`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE3B0" />
          <stop offset="1" stopColor="#C9944A" />
        </linearGradient>
        <radialGradient id={`${gid}-moon`} cx="0.68" cy="0.32" r="0.85">
          <stop offset="0" stopColor="#fbe7bf" />
          <stop offset="0.35" stopColor="#a99ab8" />
          <stop offset="0.8" stopColor="#3b3466" />
          <stop offset="1" stopColor="#1d1a44" />
        </radialGradient>
        <radialGradient id={`${gid}-planet`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#cfc4ff" />
          <stop offset="1" stopColor="#2f2470" />
        </radialGradient>
        <radialGradient id={`${gid}-cloud`}>
          <stop offset="0" stopColor="#5a45a8" stopOpacity="0.75" />
          <stop offset="1" stopColor="#5a45a8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {ATLAS_STARS.map(([x, y, r, bright]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={bright ? "#FCE7B8" : "#FFFFFF"} opacity={bright ? 0.95 : 0.6} />
      ))}
      <polyline
        points={CONSTELLATION.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="#E7C383"
        strokeOpacity="0.35"
        strokeWidth="0.7"
      />
      {CONSTELLATION.map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.7" fill="#FCE7B8" />
      ))}

      <g transform="translate(206 132)">
        <g className={spinClassName}>
          <ZodiacWheel gid={gid} />
        </g>
      </g>

      {/* Ay + gezegenler */}
      <circle cx="128" cy="222" r="42" fill={`url(#${gid}-moon)`} opacity="0.9" />
      <path d="M142 182 a42 42 0 0 1 26 54" fill="none" stroke="#F5D08A" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="318" cy="64" r="11" fill={`url(#${gid}-planet)`} />
      <circle cx="282" cy="214" r="7" fill={`url(#${gid}-gold)`} opacity="0.85" />

      {/* Kozmik bulutlar (yumuşak; filtre yok) */}
      <ellipse cx="200" cy="270" rx="90" ry="34" fill={`url(#${gid}-cloud)`} />
      <ellipse cx="300" cy="258" rx="70" ry="30" fill={`url(#${gid}-cloud)`} />
      <ellipse cx="90" cy="280" rx="80" ry="28" fill={`url(#${gid}-cloud)`} />

      <path d={sparklePath(7)} transform="translate(326 24)" fill="#ffffff" opacity="0.85" />
    </svg>
  );
}

export const MODULE_ARTWORK: Record<
  AnalysisModuleVariant,
  { Icon: ComponentType; Art: ComponentType<ModuleArtProps> }
> = {
  numerology: { Icon: NumerologyIcon, Art: NumerologyArt },
  humanDesign: { Icon: HumanDesignIcon, Art: HumanDesignArt },
  skyAtlas: { Icon: SkyAtlasIcon, Art: SkyAtlasArt },
};
