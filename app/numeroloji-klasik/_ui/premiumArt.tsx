"use client";

// Numeroloji Merkezi · açık premium vitrin görselleri (YALNIZ ekran düzeyi dekor; kayıt içeriğine bağlı DEĞİL).
// Tamamı bu projede üretilmiş SVG çizimlerdir (dış görsel / lisans bağımlılığı yok). Hepsi aria-hidden.

import { useId } from "react";

const NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** {9/4} yıldız çokgeni noktaları (dokuz köşeli Pisagor yıldızı). */
function starPoints(cx: number, cy: number, r: number, step = 4): string {
  const pts: string[] = [];
  for (let i = 0; i < 9; i++) {
    const k = (i * step) % 9;
    const a = (-90 + k * 40) * (Math.PI / 180);
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function polar(cx: number, cy: number, r: number, i: number): [number, number] {
  const a = (-90 + i * 40) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Sayı çarkı: 1–9 halkası, dokuz köşeli yıldız, usta sayı merkezi. */
function Wheel({ cx, cy, r, gid, center = true }: { cx: number; cy: number; r: number; gid: string; center?: boolean }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 10} fill={`url(#${gid}-halo)`} />
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gid}-disc)`} stroke={`url(#${gid}-gold)`} strokeWidth={1.4} />
      <circle cx={cx} cy={cy} r={r * 0.8} fill="none" stroke="#c9a24f" strokeOpacity={0.55} strokeWidth={0.8} strokeDasharray="1.5 4" />
      <circle cx={cx} cy={cy} r={r * 0.58} fill="none" stroke="#7fa9d9" strokeOpacity={0.6} strokeWidth={0.8} />
      <polygon points={starPoints(cx, cy, r * 0.58)} fill="none" stroke={`url(#${gid}-blue)`} strokeWidth={1.3} strokeLinejoin="round" />
      {NUMS.map((n, i) => {
        const [x, y] = polar(cx, cy, r * 0.9, i);
        const [tx, ty] = polar(cx, cy, r * 0.58, (i * 4) % 9);
        return (
          <g key={n}>
            <circle cx={tx} cy={ty} r={2.2} fill="#d8b25f" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif" fontSize={r * 0.15} fontWeight={600} fill="#1f3c74">{n}</text>
          </g>
        );
      })}
      {center ? (
        <g>
          <circle cx={cx} cy={cy} r={r * 0.27} fill="#ffffff" stroke="#d8b25f" strokeWidth={1.2} />
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, 'Times New Roman', serif" fontSize={r * 0.105} fontWeight={700} fill="#8a6420">11·22·33</text>
        </g>
      ) : null}
    </g>
  );
}

function Defs({ gid }: { gid: string }) {
  return (
    <defs>
      <radialGradient id={`${gid}-halo`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
        <stop offset="70%" stopColor="#e3eefb" stopOpacity={0.55} />
        <stop offset="100%" stopColor="#e3eefb" stopOpacity={0} />
      </radialGradient>
      <radialGradient id={`${gid}-disc`} cx="40%" cy="35%" r="75%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="100%" stopColor="#e6effa" />
      </radialGradient>
      <linearGradient id={`${gid}-gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#f1d48c" />
        <stop offset="55%" stopColor="#c9a24f" />
        <stop offset="100%" stopColor="#9b7426" />
      </linearGradient>
      <linearGradient id={`${gid}-blue`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3b82c4" />
        <stop offset="100%" stopColor="#1f3c74" />
      </linearGradient>
      <linearGradient id={`${gid}-glass`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.96} />
        <stop offset="100%" stopColor="#eef4fb" stopOpacity={0.92} />
      </linearGradient>
    </defs>
  );
}

function Sparkle({ x, y, s = 6, o = 0.9 }: { x: number; y: number; s?: number; o?: number }) {
  return <path d={`M${x} ${y - s}L${x + s * 0.28} ${y - s * 0.28}L${x + s} ${y}L${x + s * 0.28} ${y + s * 0.28}L${x} ${y + s}L${x - s * 0.28} ${y + s * 0.28}L${x - s} ${y}L${x - s * 0.28} ${y - s * 0.28}Z`} fill="#d8b25f" opacity={o} />;
}

const PY_ROWS = ["ABCDEFGHI", "JKLMNOPQR", "STUVWXYZ"];

/** Pisagor harf tablosu kartı (1–9 × A–Z). */
function PyTable({ x, y, w, gid }: { x: number; y: number; w: number; gid: string }) {
  const cw = w / 9;
  const h = cw * 4 + 10;
  return (
    <g>
      <rect x={x} y={y} width={w + 16} height={h + 16} rx={14} fill={`url(#${gid}-glass)`} stroke="#c9d9ee" strokeWidth={1} />
      <rect x={x} y={y} width={w + 16} height={h + 16} rx={14} fill="none" stroke="#e7cf8f" strokeOpacity={0.6} strokeWidth={0.8} transform={`translate(3 3)`} />
      {NUMS.map((n, i) => (
        <text key={`h${n}`} x={x + 8 + cw * i + cw / 2} y={y + 8 + cw * 0.55} textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, serif" fontSize={cw * 0.5} fontWeight={700} fill="#9b7426">{n}</text>
      ))}
      <line x1={x + 10} x2={x + w + 6} y1={y + 8 + cw * 1.08} y2={y + 8 + cw * 1.08} stroke="#d8b25f" strokeOpacity={0.7} strokeWidth={0.8} />
      {PY_ROWS.map((row, r) =>
        [...row].map((L, i) => (
          <text key={`${r}${L}`} x={x + 8 + cw * i + cw / 2} y={y + 12 + cw * (1.55 + r)} textAnchor="middle" dominantBaseline="central" fontFamily="ui-monospace, Consolas, monospace" fontSize={cw * 0.44} fontWeight={600} fill="#1f3c74" opacity={0.92}>{L}</text>
        )),
      )}
    </g>
  );
}

/** Klasik Numeroloji vitrin görseli (ana sayfa üst bandı ve yöntem kartı). */
export function ClassicHeroArt({ className, variant = "hero" }: { className?: string; variant?: "hero" | "card" }) {
  const gid = `nkA${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (variant === "card") {
    return (
      <svg className={className} viewBox="84 0 476 178" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <Defs gid={gid} />
        <ellipse cx={190} cy={86} rx={150} ry={92} fill="#ffffff" opacity={0.55} />
        <g opacity={0.55} stroke="#9ec2e6" strokeWidth={0.8} fill="none">
          <circle cx={190} cy={84} r={112} strokeDasharray="2 7" />
          <path d="M20 160 C 170 110, 380 190, 590 104" stroke="#d8b25f" strokeOpacity={0.7} />
        </g>
        <Wheel cx={190} cy={84} r={76} gid={gid} />
        <PyTable x={330} y={22} w={200} gid={gid} />
        <Sparkle x={316} y={18} s={7} />
        <Sparkle x={572} y={150} s={5} o={0.7} />
        <Sparkle x={62} y={26} s={4} o={0.6} />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 560 230" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <Defs gid={gid} />
      <g opacity={0.5} stroke="#9ec2e6" strokeWidth={0.7} fill="none">
        <circle cx={160} cy={115} r={150} strokeDasharray="2 7" />
        <path d="M10 200 C 160 140, 360 230, 550 130" stroke="#d8b25f" strokeOpacity={0.7} />
      </g>
      <Wheel cx={160} cy={115} r={96} gid={gid} />
      <PyTable x={316} y={42} w={210} gid={gid} />
      <Sparkle x={292} y={30} s={7} />
      <Sparkle x={540} y={196} s={5} o={0.7} />
      <Sparkle x={46} y={34} s={4} o={0.6} />
      <text x={421} y={206} textAnchor="middle" fontFamily="Georgia, serif" fontSize={11} letterSpacing="3" fill="#6a7fa3">PİSAGOR · KALDE</text>
    </svg>
  );
}

/** Kart amblemleri (sağ üst köşe; silik). Ad = kartın işlevi; kayıt içeriğine bağlı değildir. */
export type EmblemName = "analysis" | "archive" | "library" | "relation" | "business" | "names" | "stone" | "compare";

export function Emblem({ name, className }: { name: EmblemName; className?: string }) {
  const gid = `nkE${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <Defs gid={gid} />
      {name === "analysis" ? (
        <g>
          <Wheel cx={60} cy={60} r={46} gid={gid} center={false} />
          <circle cx={60} cy={60} r={11} fill="#1f5fa8" />
          <path d="M60 54v12M54 60h12" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" />
        </g>
      ) : null}
      {name === "archive" ? (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${22 + i * 9} ${18 + i * 11})`}>
              <rect width={58} height={74} rx={8} fill={`url(#${gid}-glass)`} stroke={i === 2 ? "#c9a24f" : "#b9cfe8"} strokeWidth={1.1} />
              <path d={`M10 ${18} h30 M10 ${28} h38 M10 ${38} h24`} stroke="#9ab7da" strokeWidth={2} strokeLinecap="round" opacity={i === 2 ? 1 : 0.5} />
            </g>
          ))}
          <text x={69} y={93} textAnchor="middle" fontFamily="Georgia, serif" fontSize={20} fontWeight={600} fill="#9b7426">7</text>
        </g>
      ) : null}
      {name === "library" ? (
        <g>
          <path d="M14 34c16-8 30-8 46 2v62c-16-10-30-10-46-2z" fill={`url(#${gid}-glass)`} stroke="#b9cfe8" strokeWidth={1.2} />
          <path d="M106 34c-16-8-30-8-46 2v62c16-10 30-10 46-2z" fill={`url(#${gid}-glass)`} stroke="#b9cfe8" strokeWidth={1.2} />
          <text x={37} y={66} textAnchor="middle" fontFamily="Georgia, serif" fontSize={22} fontWeight={600} fill="#1f3c74">11</text>
          <text x={83} y={66} textAnchor="middle" fontFamily="Georgia, serif" fontSize={22} fontWeight={600} fill="#9b7426">33</text>
          <Sparkle x={60} y={22} s={6} />
        </g>
      ) : null}
      {name === "relation" ? (
        <g>
          <circle cx={46} cy={60} r={30} fill="none" stroke={`url(#${gid}-blue)`} strokeWidth={2} />
          <circle cx={74} cy={60} r={30} fill="none" stroke={`url(#${gid}-gold)`} strokeWidth={2} />
          <path d="M60 34a30 30 0 0 1 0 52a30 30 0 0 1 0-52z" fill="#e3eefb" opacity={0.9} />
          <Sparkle x={60} y={60} s={7} />
        </g>
      ) : null}
      {name === "business" ? (
        <g>
          <rect x={30} y={24} width={44} height={76} rx={6} fill={`url(#${gid}-glass)`} stroke="#b9cfe8" strokeWidth={1.2} />
          <rect x={74} y={50} width={22} height={50} rx={5} fill={`url(#${gid}-glass)`} stroke="#b9cfe8" strokeWidth={1.2} />
          {[0, 1, 2, 3].map((r) => [0, 1].map((c) => <rect key={`${r}${c}`} x={38 + c * 16} y={34 + r * 14} width={10} height={7} rx={2} fill="#9ab7da" opacity={0.7} />))}
          <circle cx={92} cy={32} r={13} fill="#fff" stroke="#c9a24f" strokeWidth={1.2} />
          <text x={92} y={33} textAnchor="middle" dominantBaseline="central" fontFamily="Georgia, serif" fontSize={15} fontWeight={600} fill="#9b7426">8</text>
        </g>
      ) : null}
      {name === "names" ? (
        <g>
          <path d="M18 50V30a6 6 0 0 1 6-6h40l38 36-38 36H24a6 6 0 0 1-6-6z" fill={`url(#${gid}-glass)`} stroke="#b9cfe8" strokeWidth={1.2} transform="rotate(-8 60 60)" />
          <circle cx={34} cy={44} r={5} fill="none" stroke="#c9a24f" strokeWidth={1.5} transform="rotate(-8 60 60)" />
          <text x={56} y={68} textAnchor="middle" fontFamily="ui-monospace, Consolas, monospace" fontSize={17} fontWeight={700} fill="#1f3c74" transform="rotate(-8 60 60)">A·B·C</text>
        </g>
      ) : null}
      {name === "stone" ? (
        <g>
          <path d="M36 30h48l18 22-42 50-42-50z" fill={`url(#${gid}-glass)`} stroke={`url(#${gid}-blue)`} strokeWidth={1.4} strokeLinejoin="round" />
          <path d="M18 52h84M48 30l12 72M72 30l-12 72M36 30l12 22M84 30l-12 22" stroke="#9ab7da" strokeWidth={1} fill="none" />
          <Sparkle x={94} y={26} s={6} />
        </g>
      ) : null}
      {name === "compare" ? (
        <g>
          <rect x={14} y={26} width={44} height={68} rx={10} fill="#f3ecfd" stroke="#c9b2f0" strokeWidth={1.2} />
          <rect x={62} y={26} width={44} height={68} rx={10} fill="#e6f0fa" stroke="#a9c8e8" strokeWidth={1.2} />
          <text x={36} y={64} textAnchor="middle" fontFamily="Georgia, serif" fontSize={24} fontWeight={600} fill="#4f2596">A</text>
          <text x={84} y={64} textAnchor="middle" fontFamily="Georgia, serif" fontSize={24} fontWeight={600} fill="#1f3c74">B</text>
          <path d="M50 104h20" stroke="#c9a24f" strokeWidth={2} strokeLinecap="round" />
        </g>
      ) : null}
    </svg>
  );
}

/** Sayfa zemini için silik geometrik desen (sabit dekor). */
export function SceneOrnament({ className }: { className?: string }) {
  const gid = `nkO${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 600 600" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${gid}-l`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c9a24f" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#7fa9d9" stopOpacity={0.45} />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gid}-l)`} strokeWidth={0.9}>
        <circle cx={300} cy={300} r={280} strokeDasharray="2 8" />
        <circle cx={300} cy={300} r={220} />
        <circle cx={300} cy={300} r={150} strokeDasharray="1 6" />
        <polygon points={starPoints(300, 300, 220)} />
        <polygon points={starPoints(300, 300, 150, 2)} />
      </g>
    </svg>
  );
}
