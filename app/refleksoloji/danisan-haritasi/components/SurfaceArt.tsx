/**
 * Danışan İşaret Haritası — yüzey zemini (SVG içinde çizilir; viewBox = yüzey tanımı).
 *
 * Ayak: mevcut klinik atlas PNG'sinin ilgili YARISI (crop `surfaceView` ile).
 * El / yüz: bu modüle özgü SADE şema (dış kaynaklı görsel yok). Tıbbi/anatomik kesinlik
 * iddiası taşımaz; yalnız işaretleme zeminidir. Sol el = sağ el şemasının aynası.
 */
import type { SurfaceView } from "@/lib/refleksoloji/markSurfaces";

const SKIN = "#fde8d8";
const OUTLINE = "#b4532a";
const DETAIL = "#cf8a64";

const HAND_OUTLINE =
  "M 140 556 C 132 500, 112 440, 106 372 L 104 228 A 22 22 0 0 1 148 226 L 150 300 Q 152 312 156 300 " +
  "L 158 150 A 23 23 0 0 1 204 148 L 205 292 Q 207 304 211 292 L 212 124 A 24 24 0 0 1 260 122 " +
  "L 261 294 Q 263 306 267 294 L 268 160 A 22 22 0 0 1 312 162 L 312 340 C 322 330, 336 306, 348 282 " +
  "A 21 21 0 0 1 384 300 C 376 352, 344 410, 312 452 C 296 476, 272 510, 264 556 Z";

function PalmDetails() {
  return (
    <g fill="none" stroke={DETAIL} strokeWidth={2} strokeLinecap="round">
      {/* parmak boğum çizgileri */}
      <path d="M 110 250 L 144 250 M 110 278 L 146 278" />
      <path d="M 162 190 L 200 190 M 162 240 L 202 240" />
      <path d="M 216 165 L 256 165 M 216 222 L 258 222" />
      <path d="M 272 200 L 308 200 M 272 250 L 310 250" />
      {/* avuç çizgileri (şematik) */}
      <path d="M 108 352 Q 190 330 268 318" />
      <path d="M 312 362 Q 230 372 128 402" />
      <path d="M 300 352 Q 250 420 268 530" />
      <path d="M 336 330 Q 350 342 364 334" />
    </g>
  );
}

function DorsumDetails() {
  return (
    <g fill="none" stroke={DETAIL} strokeWidth={2} strokeLinecap="round">
      {/* tırnaklar */}
      <rect x={117} y={212} width={18} height={22} rx={7} fill="#fff5ee" />
      <rect x={172} y={134} width={20} height={24} rx={8} fill="#fff5ee" />
      <rect x={226} y={108} width={20} height={26} rx={8} fill="#fff5ee" />
      <rect x={281} y={146} width={20} height={24} rx={8} fill="#fff5ee" />
      <ellipse cx={366} cy={300} rx={10} ry={13} transform="rotate(-25 366 300)" fill="#fff5ee" />
      {/* parmak eklem kıvrımları */}
      <path d="M 114 268 Q 126 262 140 268 M 166 222 Q 181 214 198 222 M 220 200 Q 236 192 254 200 M 276 232 Q 290 226 306 232" />
      {/* eklem (knuckle) yayları */}
      <path d="M 112 318 Q 126 308 140 318 M 162 312 Q 182 300 200 312 M 216 312 Q 236 300 256 312 M 270 316 Q 290 304 306 318" />
      {/* tendon izleri */}
      <path d="M 128 324 L 160 520 M 182 318 L 192 520 M 236 318 L 224 520 M 288 324 L 250 520" strokeOpacity={0.55} />
    </g>
  );
}

function HandArt({ kind, mirror, width }: { kind: "hand_palm" | "hand_dorsum"; mirror: boolean; width: number }) {
  // Başparmak etiketi ayna DIŞINDA çizilir (metin ters dönmesin).
  const thumbLabelX = mirror ? 4 : width - 4;
  return (
    <>
      <g transform={mirror ? `translate(${width} 0) scale(-1 1)` : undefined}>
        <path d={HAND_OUTLINE} fill={SKIN} stroke={OUTLINE} strokeWidth={3} strokeLinejoin="round" />
        {kind === "hand_palm" ? <PalmDetails /> : <DorsumDetails />}
      </g>
      <text
        x={thumbLabelX}
        y={262}
        textAnchor={mirror ? "start" : "end"}
        fontSize={13}
        fontWeight={700}
        fill="#475569"
        style={{ pointerEvents: "none" }}
      >
        Başparmak
      </text>
    </>
  );
}

function FaceArt({ width }: { width: number }) {
  return (
    <>
      <path d="M 160 448 L 156 520 M 240 448 L 244 520" stroke={OUTLINE} strokeWidth={3} fill="none" />
      <path
        d="M 66 225 C 46 215 40 260 50 285 C 56 300 64 306 72 300 M 334 225 C 354 215 360 260 350 285 C 344 300 336 306 328 300"
        fill={SKIN}
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <path
        d="M 200 70 C 290 70 336 140 334 240 C 332 330 300 400 252 438 C 230 456 214 462 200 462 C 186 462 170 456 148 438 C 100 400 68 330 66 240 C 64 140 110 70 200 70 Z"
        fill={SKIN}
        stroke={OUTLINE}
        strokeWidth={3}
      />
      <g fill="none" stroke={DETAIL} strokeWidth={2} strokeLinecap="round">
        <path d="M 80 186 C 102 112 160 94 200 98 C 240 94 298 112 320 186" />
        <path d="M 122 205 Q 150 190 180 202 M 220 202 Q 250 190 278 205" strokeWidth={3} />
        <path d="M 128 236 Q 152 221 176 236 Q 152 249 128 236 Z M 224 236 Q 248 221 272 236 Q 248 249 224 236 Z" />
        <path d="M 200 244 L 191 310 Q 200 322 212 313" />
        <path d="M 184 318 Q 190 326 198 322 M 216 318 Q 210 326 202 322" strokeOpacity={0.7} />
        <path d="M 160 362 Q 180 352 200 357 Q 220 352 240 362 Q 200 388 160 362 Z" />
        <path d="M 176 418 Q 200 428 224 418" strokeOpacity={0.5} />
      </g>
      <circle cx={152} cy={236} r={6} fill="#64748b" />
      <circle cx={248} cy={236} r={6} fill="#64748b" />
      {/* Ön görünüm: danışanın SAĞI ekranda SOLDA. Metin + konum, renk değil. */}
      <text x={30} y={506} fontSize={16} fontWeight={800} fill="#334155" style={{ pointerEvents: "none" }}>
        Sağ
      </text>
      <text x={width - 30} y={506} textAnchor="end" fontSize={16} fontWeight={800} fill="#334155" style={{ pointerEvents: "none" }}>
        Sol
      </text>
    </>
  );
}

export function SurfaceArt({ view }: { view: SurfaceView }) {
  if (view.image) {
    const img = view.image;
    return (
      <image
        href={img.href}
        x={img.x}
        y={img.y}
        width={img.width}
        height={img.height}
        preserveAspectRatio="none"
        style={{ pointerEvents: "none" }}
      />
    );
  }
  if (view.vector?.kind === "face") return <FaceArt width={view.width} />;
  if (view.vector) return <HandArt kind={view.vector.kind} mirror={view.vector.mirror} width={view.width} />;
  return null;
}
