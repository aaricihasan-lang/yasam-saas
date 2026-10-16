/**
 * Yaşam Analiz Merkezi modül kartları — ikonlar, dekor katmanları ve variant'a özgü animasyon atamaları.
 *
 * Tamamen satır içi SVG / CSS gradient: görsel dosyası / dış kaynak yok, CSP ve Android WebView ile uyumlu. Burç ve
 * diğer semboller unicode DEĞİL çizgi (Android'de renkli emojiye dönmesin). Koordinatlar sabit (340×280 tasarım
 * birimi) → SSR/istemci aynı, titreme yok. Gradient kimlikleri kart başına `gid` ile önekli.
 *
 * Katman modeli: statik zemin `Layer` (tam alan SVG); hareketli parçalar `Sprite` (tasarım koordinatında konumlu
 * HTML katmanı) + `Fx` (ortak animasyon sınıfı, AnalysisModuleCard.module.css). `depth` = imleç parallax derinliği.
 * Animasyon hız/aç-kapa/ışıma ayarları analysisModuleMotion.ts'te; burada yalnız hangi parçanın hangi hareketi
 * kullandığı (süre, gecikme, genlik) tanımlıdır.
 *
 * TÜM hareketler dekoratiftir: sayı halkası, Human Design merkez ışıkları ve gezegenler hiçbir hesaplamayı, analiz
 * sonucunu ya da gerçek transit / astronomik konumu temsil etmez.
 */
import { ChartColumn } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import type { AnalysisModuleVariant } from "./analysisModuleThemes";
import styles from "./AnalysisModuleCard.module.css";

export interface ModuleArtProps {
  gid: string;
}

type Vars = Record<`--${string}`, string | number>;
const cssVars = (o: Vars): CSSProperties => o as CSSProperties;

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

/* ── Katman primitifleri ─────────────────────────────────────────────────── */

/** Tam alan statik zemin (340×280, "slice"). */
function Layer({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <span className={styles.layer} style={cssVars({ "--depth": depth })}>
      <svg viewBox={VIEW} preserveAspectRatio="xMidYMid slice" focusable="false">
        {children}
      </svg>
    </span>
  );
}

/**
 * Tasarım koordinatında (x, y merkez; w × h) konumlu parça. `lite`: dar kartta / mobilde gösterilmez.
 * `peak`: ışık parçası — tepe opaklığı; merkezî ışıma çarpanı (--amc-glow) burada (statik) uygulanır.
 */
function Sprite({ x, y, w, h, depth, lite, peak, children }: { x: number; y: number; w: number; h?: number; depth: number; lite?: boolean; peak?: number; children: ReactNode }) {
  const cls = [styles.sprite, lite ? styles.lite : "", peak !== undefined ? styles.glow : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} style={cssVars({ "--x": x, "--y": y, "--w": w, "--h": h ?? w, "--depth": depth, ...(peak !== undefined ? { "--peak": peak } : {}) })}>
      {children}
    </span>
  );
}

type FxKind =
  | "spinCw" | "spinCcw" | "swayNarrow" | "swayWide" | "breathe" | "twinkle"
  | "floatNear" | "float" | "floatFar" | "drift" | "rise" | "pulse";

/** Ortak animasyon sınıfı; ebeveyn parçayı doldurur. `bg` verilirse yuvarlak ışık / küre olarak boyanır. */
function Fx({ kind, dur, delay = 0, bg, children }: { kind: FxKind; dur: number; delay?: number; bg?: string; children?: ReactNode }) {
  const cls = `${styles.fill} ${styles.fx} ${styles[kind]}${bg ? ` ${styles.round}` : ""}`;
  return (
    <span className={cls} style={{ ...cssVars({ "--dur": `${dur}s`, "--delay": `${delay}s` }), background: bg }}>
      {children}
    </span>
  );
}

/** Parça boyutunda SVG (merkez 0,0). */
function PartSvg({ w, h = w, children }: { w: number; h?: number; children: ReactNode }) {
  return (
    <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} focusable="false">
      {children}
    </svg>
  );
}

const glowBg = (rgb: string, a = 0.85, stop = 66) => `radial-gradient(circle, rgba(${rgb},${a}) 0%, rgba(${rgb},0) ${stop}%)`;
const orbBg = (light: string, mid: string, dark: string) => `radial-gradient(circle at 35% 30%, ${light} 0%, ${mid} 55%, ${dark} 100%)`;

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

/* ── A: Numeroloji — dönen sayı halkası, kristal küre, mistik geometri ───── */

const NUM_X = 190;
const NUM_Y = 134;
const NUM_RING_R = 84;
const NUM_RING_W = 196;
/** Sayı halkası ve etiketlerin ters dönüşü AYNI süre → sayılar her an dik ve okunur. */
const NUM_RING_DUR = 150;
const NUM_LABELS: [number, number][] = [
  [9, -90], [3, -45], [6, 0], [2, 45], [8, 90], [4, 135], [1, 180], [5, 225],
];
// [x, y, çap, süre, gecikme, dar kartta gizle]
const NUM_PARTICLES: [number, number, number, number, number, boolean][] = [
  [132, 196, 4, 13, -2, false], [156, 92, 3, 11, -7, true], [246, 74, 3.5, 14, -4, false], [262, 196, 4, 12, -9, false],
  [118, 140, 3, 15, -11, true], [300, 104, 3, 10, -5, true], [214, 214, 3.5, 16, -1, false],
];
// [x, y, çap, renk, süre, gecikme]
const NUM_SPARKLES: [number, number, number, string, number, number][] = [
  [96, 30, 22, "#d9a650", 5.3, -1], [300, 52, 8, "#ffffff", 3.9, -2], [318, 128, 12, "#f2c96f", 6.7, -3],
];
const PEARL = orbBg("#ffffff", "#e6dcf5", "#a993cf");

function NumerologyArt({ gid }: ModuleArtProps) {
  const hex = (start: number) =>
    [0, 120, 240].map((d) => polar(38.6, d + start - 90).map((n) => n.toFixed(1)).join(",")).join(" ");
  return (
    <>
      <Layer depth={1.5}>
        <defs>
          <radialGradient id={`${gid}-n-halo`}>
            <stop offset="0" stopColor="#fff6e2" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#e4d4ff" stopOpacity="0.35" />
            <stop offset="1" stopColor="#e4d4ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}-n-gold`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff1cc" />
            <stop offset="1" stopColor="#d9a650" />
          </linearGradient>
          <linearGradient id={`${gid}-n-wave`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#c9b2f5" stopOpacity="0" />
            <stop offset="0.5" stopColor="#b292ee" stopOpacity="0.55" />
            <stop offset="1" stopColor="#f3dcb4" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        <circle cx={NUM_X} cy={128} r="132" fill={`url(#${gid}-n-halo)`} />
        <path d="M96 110 a14 14 0 1 0 16 -18 a10.5 10.5 0 1 1 -16 18 z" fill={`url(#${gid}-n-gold)`} opacity="0.9" />
        <path d="M0 250 C70 214 130 262 210 236 S318 196 340 206 V280 H0 Z" fill={`url(#${gid}-n-wave)`} />
        <path d="M0 266 C90 236 150 274 230 252 S320 226 340 232" fill="none" stroke="#f3dcb4" strokeOpacity="0.7" strokeWidth="1" />
      </Layer>

      {/* Dış yörünge — çok yavaş */}
      <Sprite x={NUM_X} y={NUM_Y} w={210} depth={3}>
        <Fx kind="spinCw" dur={200}>
          <PartSvg w={210}>
            <circle r="102.5" fill="none" stroke="#c9a15a" strokeOpacity="0.35" strokeWidth="0.8" />
            {[-60, 20, 160, 250].map((d) => {
              const [x, y] = polar(102.5, d);
              return <circle key={d} cx={x} cy={y} r="2" fill="#f2dcae" stroke="#c9a15a" strokeWidth="0.5" />;
            })}
          </PartSvg>
        </Fx>
      </Sprite>
      <Sprite x={NUM_X} y={NUM_Y} w={136} depth={4.5}>
        <Fx kind="spinCcw" dur={120}>
          <PartSvg w={136}>
            <circle r="65.5" fill="none" stroke="#c9a15a" strokeOpacity="0.4" strokeWidth="0.7" strokeDasharray="1.5 3.5" strokeLinecap="round" />
          </PartSvg>
        </Fx>
      </Sprite>

      {/* 1–9 sayı halkası: halka döner, her sayı ters döner → yönü hep dik */}
      <Sprite x={NUM_X} y={NUM_Y} w={NUM_RING_W} depth={6}>
        <Fx kind="spinCw" dur={NUM_RING_DUR}>
          <PartSvg w={NUM_RING_W}>
            <circle r={NUM_RING_R} fill="none" stroke="#c9a15a" strokeOpacity="0.5" strokeWidth="0.9" />
          </PartSvg>
          {NUM_LABELS.map(([n, d]) => {
            const [lx, ly] = polar(NUM_RING_R, d);
            return (
              <span
                key={n}
                className={styles.ringLabel}
                style={{ left: `${50 + (lx / NUM_RING_W) * 100}%`, top: `${50 + (ly / NUM_RING_W) * 100}%` }}
              >
                <Fx kind="spinCcw" dur={NUM_RING_DUR}>
                  <span
                    className={styles.ringFace}
                    style={{
                      background: "rgba(255,255,255,0.3)",
                      border: "calc(var(--s) * 0.7) solid rgba(201,161,90,0.45)",
                      color: "rgba(107,74,42,0.9)",
                    }}
                  >
                    {n}
                  </span>
                </Fx>
              </span>
            );
          })}
        </Fx>
      </Sprite>

      {/* Mermer kaide */}
      <Sprite x={NUM_X} y={192} w={100} h={26} depth={8}>
        <PartSvg w={100} h={26}>
          <defs>
            <linearGradient id={`${gid}-n-stone`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f2edf7" />
              <stop offset="1" stopColor="#b8aec8" />
            </linearGradient>
          </defs>
          <ellipse cy="8" rx="48" ry="8" fill="#9d90b6" opacity="0.4" />
          <path d="M-45 -4 v9 a45 8.4 0 0 0 90 0 v-9 z" fill={`url(#${gid}-n-stone)`} />
          <ellipse cy="-4" rx="45" ry="8.4" fill="#f7f3fb" stroke="#d8cde6" strokeWidth="0.6" />
        </PartSvg>
      </Sprite>

      {/* Küre ışığı (nefes alır) */}
      <Sprite x={NUM_X} y={NUM_Y} w={150} depth={9} peak={0.9}>
        <Fx
          kind="breathe"
          dur={8}
          bg="radial-gradient(circle, rgba(255,244,220,0.75) 0%, rgba(206,180,255,0.32) 42%, rgba(206,180,255,0) 70%)"
        />
      </Sprite>

      {/* Kristal küre + çiçek-i hayat + hexagram + 7 (sabit; en öndeki derinlik) */}
      <Sprite x={NUM_X} y={NUM_Y} w={104} depth={10}>
        <PartSvg w={104}>
          <defs>
            <radialGradient id={`${gid}-n-orb`} cx="0.38" cy="0.32" r="0.75">
              <stop offset="0" stopColor="#b493f2" />
              <stop offset="0.45" stopColor="#6a3cb8" />
              <stop offset="1" stopColor="#2c1260" />
            </radialGradient>
            <linearGradient id={`${gid}-n-orbgold`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff1cc" />
              <stop offset="1" stopColor="#d9a650" />
            </linearGradient>
          </defs>
          <circle r="48.7" fill={`url(#${gid}-n-orb)`} />
          <g fill="none" stroke="#f3d9a2" strokeOpacity="0.2" strokeWidth="0.55">
            <circle r="20.2" />
            {[0, 60, 120, 180, 240, 300].map((d) => {
              const [x, y] = polar(20.2, d);
              return <circle key={d} cx={x} cy={y} r="20.2" />;
            })}
          </g>
          <g fill="none" stroke={`url(#${gid}-n-orbgold)`} strokeWidth="1" strokeLinejoin="round" opacity="0.9">
            <polygon points={hex(0)} />
            <polygon points={hex(60)} />
          </g>
          <circle r="48.7" fill="none" stroke="#f3d9a2" strokeOpacity="0.45" strokeWidth="0.7" />
          <text y="14.5" textAnchor="middle" fontSize="42" fontWeight="600" fill={`url(#${gid}-n-orbgold)`} style={SERIF}>
            7
          </text>
        </PartSvg>
      </Sprite>
      {/* Kürede gezinen yumuşak parlama + 7'nin ışığı */}
      <Sprite x={NUM_X} y={NUM_Y} w={97.4} depth={10} peak={1}>
        <Fx
          kind="swayWide"
          dur={18}
          bg="radial-gradient(circle at 30% 24%, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%)"
        />
      </Sprite>
      <Sprite x={NUM_X} y={NUM_Y} w={54} depth={10.5} peak={0.5}>
        <Fx kind="breathe" dur={6} bg={glowBg("255,226,160", 0.85, 65)} />
      </Sprite>

      {/* Süzülen ışık parçacıkları */}
      {NUM_PARTICLES.map(([x, y, d, dur, delay, lite]) => (
        <Sprite key={`${x}-${y}`} x={x} y={y} w={d} depth={7} lite={lite} peak={1}>
          <Fx
            kind="rise"
            dur={dur}
            delay={delay}
            bg="radial-gradient(circle, #fff6dc 0%, rgba(242,201,111,0.6) 50%, rgba(242,201,111,0) 72%)"
          />
        </Sprite>
      ))}
      {NUM_SPARKLES.map(([x, y, d, color, dur, delay]) => (
        <Sprite key={`${x}-${y}`} x={x} y={y} w={d} depth={3} peak={1}>
          <Fx kind="twinkle" dur={dur} delay={delay}>
            <PartSvg w={d}>
              <path d={sparklePath(d / 2)} fill={color} />
            </PartSvg>
          </Fx>
        </Sprite>
      ))}
      {/* İnci küreler */}
      <Sprite x={300} y={214} w={28} depth={9}>
        <Fx kind="float" dur={12} bg={PEARL} />
      </Sprite>
      <Sprite x={312} y={34} w={18} depth={8}>
        <Fx kind="float" dur={15} delay={-6} bg={PEARL} />
      </Sprite>
    </>
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

const HD_X = 192;
const HD_Y = 146;
const HD_K = 0.84;
/** Figür parçası: 200×230, merkezi figür merkezinin 15 birim üstünde. */
const HD_FIG = { y: HD_Y - 15, w: 200, h: 230, inner: `translate(0 15) scale(${HD_K})` } as const;

/** Merkez ışıkları — kökten başa doğru sırayla (dekoratif; gerçek tanım / analiz sonucu DEĞİL). [x, y, rgb] */
const HD_GLOW_SEQUENCE: [number, number, string][] = [
  [0, 84, "255,214,140"], [0, 42, "255,150,130"], [-50, 42, "140,240,210"], [50, 42, "255,214,140"], [27, 4, "255,170,150"],
  [0, -11, "255,214,140"], [0, -50, "230,255,248"], [0, -88, "140,240,210"], [0, -113, "255,240,200"],
];
const HD_GLOW_STEP = 1.2;
const GLASS = orbBg("rgba(217,255,243,0.95)", "rgba(76,200,168,0.55)", "rgba(14,107,92,0.7)");
const GOLD_BEAD = orbBg("#fff2c8", "#e0b45f", "#b8862f");

function HumanDesignFigure({ gid }: ModuleArtProps) {
  return (
    <PartSvg w={HD_FIG.w} h={HD_FIG.h}>
      <defs>
        <linearGradient id={`${gid}-h-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a6f2dc" stopOpacity="0.38" />
          <stop offset="1" stopColor="#3fbfa0" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <g transform={HD_FIG.inner}>
        {/* Meditasyon silueti (yumuşak, saydam) */}
        <circle cy="-110" r="18" fill={`url(#${gid}-h-body)`} />
        <path
          d="M-12 -90 C-12 -80 -44 -78 -54 -68 C-68 -54 -64 -12 -62 12 C-60 30 -84 42 -104 58 C-114 68 -90 84 -44 84 L44 84 C90 84 114 68 104 58 C84 42 60 30 62 12 C64 -12 68 -54 54 -68 C44 -78 12 -80 12 -90 Z"
          fill={`url(#${gid}-h-body)`}
          stroke="#a6f2dc"
          strokeOpacity="0.25"
          strokeWidth="0.8"
        />
        <g stroke="#f0cf86" strokeOpacity="0.55" strokeWidth="1" strokeLinecap="round">
          <line x1="0" y1="-140" x2="0" y2="108" strokeOpacity="0.35" />
          {HD_CHANNELS.map(([x1, y1, x2, y2]) => (
            <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
        </g>
        <g stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.8" strokeLinejoin="round">
          {HD_CENTERS.map((c) => (
            <path key={c.d} d={c.d} fill={c.fill} fillOpacity={c.opacity ?? 1} />
          ))}
        </g>
        {[[-74, -60], [74, -60], [-88, 10], [88, 10], [0, -150]].map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.8" fill="#f0cf86" />
        ))}
      </g>
    </PartSvg>
  );
}

function HumanDesignArt({ gid }: ModuleArtProps) {
  return (
    <>
      <Layer depth={1.5}>
        <defs>
          <radialGradient id={`${gid}-h-aura`}>
            <stop offset="0" stopColor="#8af0d4" stopOpacity="0.35" />
            <stop offset="1" stopColor="#8af0d4" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}-h-ribbon`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7fe3c8" stopOpacity="0" />
            <stop offset="0.5" stopColor="#7fe3c8" stopOpacity="0.28" />
            <stop offset="1" stopColor="#7fe3c8" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d="M0 210 C80 170 140 250 230 214 S320 170 340 180 V280 H0 Z" fill={`url(#${gid}-h-ribbon)`} />
        <path d="M20 40 C90 70 120 150 200 160 S300 120 340 150" fill="none" stroke="#9cf0d8" strokeOpacity="0.16" strokeWidth="14" />
        <circle cx={HD_X} cy={HD_Y} r="109" fill={`url(#${gid}-h-aura)`} />
        <g fill="none" stroke="#e2bf78">
          <circle cx={HD_X} cy={HD_Y - 15} r="62" strokeOpacity="0.3" strokeWidth="0.8" />
          <circle cx={HD_X} cy={HD_Y + 34} r="52" strokeOpacity="0.22" strokeWidth="0.7" />
        </g>
      </Layer>

      {/* Geometrik halkalar — çok yavaş */}
      <Sprite x={HD_X} y={HD_Y} w={204} depth={3}>
        <Fx kind="spinCw" dur={220}>
          <PartSvg w={204}>
            <g fill="none" stroke="#e2bf78" strokeLinecap="round">
              <circle r="99" strokeOpacity="0.28" strokeWidth="0.8" />
              <circle r="84" strokeOpacity="0.7" strokeWidth="1.5" strokeDasharray="0.1 6" />
            </g>
            {[20, 140, 250].map((d) => {
              const [x, y] = polar(99, d);
              return <circle key={d} cx={x} cy={y} r="1.7" fill="#f0cf86" />;
            })}
          </PartSvg>
        </Fx>
      </Sprite>

      {/* Siluet + kanallar + 9 merkez (sabit çizim) */}
      <Sprite x={HD_X} y={HD_FIG.y} w={HD_FIG.w} h={HD_FIG.h} depth={6}>
        <HumanDesignFigure gid={gid} />
      </Sprite>
      {/* Kanallarda yumuşak ışık akışı (geniş kartta) */}
      <Sprite x={HD_X} y={HD_FIG.y} w={HD_FIG.w} h={HD_FIG.h} depth={6} lite>
        <PartSvg w={HD_FIG.w} h={HD_FIG.h}>
          <g transform={HD_FIG.inner}>
            <g
              className={`${styles.fx} ${styles.flow}`}
              style={cssVars({ "--dur": "7s" })}
              stroke="#fff1c4"
              strokeOpacity="0.85"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeDasharray="4 32"
            >
              {HD_CHANNELS.map(([x1, y1, x2, y2]) => (
                <line key={`${x1}${y1}${x2}${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              ))}
            </g>
          </g>
        </PartSvg>
      </Sprite>
      {/* Merkezlerde sırayla yumuşak ışıma */}
      {HD_GLOW_SEQUENCE.map(([x, y, rgb], i) => (
        <Sprite key={`${x}${y}`} x={HD_X + x * HD_K} y={HD_Y + y * HD_K} w={30} depth={6.5} peak={1}>
          <Fx kind="pulse" dur={HD_GLOW_SEQUENCE.length * HD_GLOW_STEP} delay={i * HD_GLOW_STEP} bg={glowBg(rgb, 0.9, 68)} />
        </Sprite>
      ))}

      {/* Cam küreler + altın boncuklar — yavaşça süzülür */}
      <Sprite x={44} y={66} w={30} depth={9}>
        <Fx kind="float" dur={13} bg={GLASS} />
      </Sprite>
      <Sprite x={322} y={166} w={40} depth={10}>
        <Fx kind="float" dur={16} delay={-5} bg={GLASS} />
      </Sprite>
      <Sprite x={58} y={236} w={44} depth={10}>
        <Fx kind="float" dur={18} delay={-9} bg={GLASS} />
      </Sprite>
      <Sprite x={316} y={42} w={12} depth={8}>
        <Fx kind="floatFar" dur={11} delay={-3} bg={GOLD_BEAD} />
      </Sprite>
      <Sprite x={300} y={222} w={10} depth={8}>
        <Fx kind="floatFar" dur={14} delay={-7} bg={GOLD_BEAD} />
      </Sprite>
      <Sprite x={24} y={150} w={6} depth={7} lite>
        <Fx kind="floatFar" dur={12} delay={-2} bg={GOLD_BEAD} />
      </Sprite>
    </>
  );
}

/* ── C: Gökyüzü Atlası — burç çarkı, takımyıldız, ay, kozmik bulut ─────── */

// Sönük yıldız alanı (zemin) — viewBox koordinatı.
const ATLAS_DIM_STARS: [number, number, number][] = [
  [14, 30, 0.8], [48, 18, 0.7], [22, 160, 0.8], [326, 96, 0.8], [268, 266, 0.7], [100, 266, 0.8], [6, 210, 0.7],
  [334, 186, 0.7], [244, 12, 0.8],
];
// Parıldayan yıldızlar — düzensiz süreler. [x, y, çap, süre, gecikme, dar kartta gizle]
const ATLAS_TWINKLES: [number, number, number, number, number, boolean][] = [
  [32, 90, 5, 4.7, -1, false], [304, 20, 6, 5.9, -3, false], [318, 250, 5.5, 3.8, -2, false], [250, 250, 3.5, 6.3, -4, true],
  [150, 8, 3.5, 5.1, -2.5, true], [60, 240, 3.5, 7.1, -5, false],
];
const ATLAS_SPARKLES: [number, number, number, number, number, boolean][] = [
  [326, 24, 14, 6.6, -1, false], [178, 40, 9, 8.2, -4, true],
];
const CONSTELLATION: [number, number][] = [[18, 120], [44, 96], [70, 106], [86, 74], [118, 58], [140, 30]];
// [x, y, w, h, süre, gecikme]
const ATLAS_CLOUDS: [number, number, number, number, number, number][] = [
  [200, 270, 180, 68, 24, -3], [300, 258, 140, 60, 30, -11], [90, 280, 160, 56, 27, -7],
];
const ATLAS_X = 206;
const ATLAS_Y = 132;

/** Burç çarkı + merkez yıldızı (yalnız çizgi; altın tonları). Merkez 0,0, yarıçap ~112. */
function ZodiacWheel({ gid }: ModuleArtProps) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const signs = Array.from({ length: 12 }, (_, i) => i * 30);
  const star8 = Array.from({ length: 16 }, (_, i) => {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? (i % 4 === 0 ? 30 : 20) : 6;
    return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  return (
    <>
      <defs>
        <radialGradient id={`${gid}-a-glow`}>
          <stop offset="0" stopColor="#F5D08A" stopOpacity="0.4" />
          <stop offset="1" stopColor="#F5D08A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-a-gold`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor="#FBE3B0" />
          <stop offset="1" stopColor="#C9944A" />
        </linearGradient>
      </defs>
      <circle r="60" fill={`url(#${gid}-a-glow)`} />
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
      <polygon points={star8} fill={`url(#${gid}-a-gold)`} />
      {[[-30, -70], [64, -40], [30, 70], [-78, -18], [84, 18]].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" fill="#FBE3B0" />
      ))}
    </>
  );
}

function SkyAtlasArt({ gid }: ModuleArtProps) {
  return (
    <>
      <Layer depth={1.5}>
        {ATLAS_DIM_STARS.map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" opacity="0.6" />
        ))}
        <polyline points={CONSTELLATION.map((p) => p.join(",")).join(" ")} fill="none" stroke="#E7C383" strokeOpacity="0.35" strokeWidth="0.7" />
        {CONSTELLATION.map(([x, y]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r="1.7" fill="#FCE7B8" />
        ))}
      </Layer>

      {/* Düzensiz parıldayan yıldızlar */}
      {ATLAS_TWINKLES.map(([x, y, d, dur, delay, lite]) => (
        <Sprite key={`${x}-${y}`} x={x} y={y} w={d} depth={2.5} lite={lite} peak={1}>
          <Fx kind="twinkle" dur={dur} delay={delay} bg="radial-gradient(circle, #fff8e6 0%, rgba(252,231,184,0.6) 40%, rgba(252,231,184,0) 70%)" />
        </Sprite>
      ))}
      {ATLAS_SPARKLES.map(([x, y, d, dur, delay, lite]) => (
        <Sprite key={`${x}-${y}`} x={x} y={y} w={d} depth={2.5} lite={lite} peak={1}>
          <Fx kind="twinkle" dur={dur} delay={delay}>
            <PartSvg w={d}>
              <path d={sparklePath(d / 2)} fill="#ffffff" />
            </PartSvg>
          </Fx>
        </Sprite>
      ))}

      {/* Zodyak çarkı — çok yavaş döner */}
      <Sprite x={ATLAS_X} y={ATLAS_Y} w={232} depth={5}>
        <Fx kind="spinCw" dur={360}>
          <PartSvg w={232}>
            <ZodiacWheel gid={gid} />
          </PartSvg>
        </Fx>
      </Sprite>
      <Sprite x={ATLAS_X} y={ATLAS_Y} w={86} depth={5.5} peak={0.7}>
        <Fx kind="breathe" dur={9} bg={glowBg("245,208,138", 0.75, 62)} />
      </Sprite>

      {/* Dekoratif gezegenler — sınırlı salınım / süzülme (gerçek konum DEĞİL) */}
      <Sprite x={ATLAS_X} y={ATLAS_Y} w={262} depth={7}>
        <Fx kind="swayNarrow" dur={30}>
          <span
            className={styles.round}
            style={{
              position: "absolute",
              left: "92.7%",
              top: "24%",
              width: "calc(var(--s) * 22)",
              height: "calc(var(--s) * 22)",
              transform: "translate(-50%, -50%)",
              background: orbBg("#cfc4ff", "#6b5bc4", "#2f2470"),
            }}
          />
        </Fx>
      </Sprite>
      <Sprite x={282} y={214} w={14} depth={8}>
        <Fx kind="floatFar" dur={12} bg={orbBg("#fbe3b0", "#d9a95a", "#9a6a2a")} />
      </Sprite>

      {/* Ay — yumuşak ışık */}
      <Sprite x={128} y={222} w={130} depth={9} peak={0.85}>
        <Fx
          kind="breathe"
          dur={10}
          bg="radial-gradient(circle, rgba(251,231,191,0.55) 0%, rgba(251,231,191,0.12) 45%, rgba(251,231,191,0) 68%)"
        />
      </Sprite>
      <Sprite x={128} y={222} w={90} depth={10}>
        <Fx kind="floatNear" dur={16}>
          <PartSvg w={90}>
            <defs>
              <radialGradient id={`${gid}-a-moon`} cx="0.68" cy="0.32" r="0.85">
                <stop offset="0" stopColor="#fbe7bf" />
                <stop offset="0.35" stopColor="#a99ab8" />
                <stop offset="0.8" stopColor="#3b3466" />
                <stop offset="1" stopColor="#1d1a44" />
              </radialGradient>
            </defs>
            <circle r="42" fill={`url(#${gid}-a-moon)`} opacity="0.9" />
            <path d="M14 -40 a42 42 0 0 1 26 54" fill="none" stroke="#F5D08A" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
          </PartSvg>
        </Fx>
      </Sprite>

      {/* Kozmik bulutlar — çok hafif sürüklenme */}
      {ATLAS_CLOUDS.map(([x, y, w, h, dur, delay]) => (
        <Sprite key={`${x}-${y}`} x={x} y={y} w={w} h={h} depth={12}>
          <Fx
            kind="drift"
            dur={dur}
            delay={delay}
            bg="radial-gradient(ellipse at center, rgba(90,69,168,0.75) 0%, rgba(90,69,168,0) 70%)"
          />
        </Sprite>
      ))}
    </>
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
