"use client";

import { getCuppingMap } from "@/lib/cupping/maps";

/**
 * KUPA & HACAMAT — sabit anatomik SİLUET çizimleri (SVG/vektörel — FOTOĞRAF DEĞİL).
 *
 * Profesyonel, sade çalışma zemini. Her siluet, ilgili map_key'in contentWidth×Height
 * viewBox'ına çizilir; BodyMapCanvas contain-rect'e yerleştirir. Yeni harita eklemek =
 * registry'ye satır + buraya bir case (motor değişmez).
 */

const STROKE = "#94a3b8"; // slate-400 — koyu zeminde okunur
const FILL = "rgba(148,163,184,0.10)";
const CENTER = "rgba(148,163,184,0.25)";

function FullBody({ back }: { back: boolean }) {
  // 480 x 820 şematik tam vücut (ön/arka aynı dış hat; arka = orta çizgi + omurga iması).
  return (
    <svg viewBox="0 0 480 820" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <g fill={FILL} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round">
        <circle cx={240} cy={70} r={52} />
        <path d="M240 122 C200 122 186 150 186 178 L176 210 C150 220 128 250 120 300 L104 430 C132 440 150 420 158 380 L172 300 L176 470 L150 700 C148 760 160 790 190 792 C208 792 214 760 216 700 L240 470 L264 700 C266 760 272 792 290 792 C320 790 332 760 330 700 L304 470 L308 300 L322 380 C330 420 348 440 376 430 L360 300 C352 250 330 220 304 210 L294 178 C294 150 280 122 240 122 Z" />
      </g>
      {back ? (
        <line x1={240} y1={130} x2={240} y2={470} stroke={CENTER} strokeWidth={2} strokeDasharray="6 8" />
      ) : (
        <line x1={240} y1={140} x2={240} y2={430} stroke={CENTER} strokeWidth={1.5} strokeDasharray="3 9" />
      )}
    </svg>
  );
}

function Head({ variant }: { variant: "front" | "back" | "left" | "right" | "top" }) {
  // 480 x 520 şematik baş. Yan görünümlerde profil, tepe için oval.
  if (variant === "top") {
    return (
      <svg viewBox="0 0 480 520" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <g fill={FILL} stroke={STROKE} strokeWidth={2.5}>
          <ellipse cx={240} cy={260} rx={150} ry={190} />
          <line x1={240} y1={80} x2={240} y2={440} stroke={CENTER} strokeWidth={2} strokeDasharray="6 8" />
        </g>
      </svg>
    );
  }
  if (variant === "left" || variant === "right") {
    const flip = variant === "right";
    return (
      <svg viewBox="0 0 480 520" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <g
          fill={FILL}
          stroke={STROKE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          transform={flip ? "translate(480,0) scale(-1,1)" : undefined}
        >
          {/* profil: alın-burun-çene hattı + ense */}
          <path d="M300 90 C210 90 150 160 150 250 C150 300 168 330 150 360 C142 374 150 388 168 390 L172 430 C176 460 200 470 240 470 L320 470 C356 470 372 450 372 410 L372 190 C372 130 344 90 300 90 Z" />
          <circle cx={250} cy={250} r={90} fill="none" stroke={CENTER} strokeWidth={1.5} strokeDasharray="4 8" />
        </g>
      </svg>
    );
  }
  // front / back
  return (
    <svg viewBox="0 0 480 520" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <g fill={FILL} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round">
        <path d="M240 80 C168 80 120 150 120 240 C120 330 160 420 240 460 C320 420 360 330 360 240 C360 150 312 80 240 80 Z" />
        <path d="M200 470 L200 500 L280 500 L280 470" fill="none" />
      </g>
      <line
        x1={240}
        y1={90}
        x2={240}
        y2={455}
        stroke={CENTER}
        strokeWidth={variant === "back" ? 2 : 1.5}
        strokeDasharray={variant === "back" ? "6 8" : "3 9"}
      />
    </svg>
  );
}

function Legs({ back }: { back: boolean }) {
  // 480 x 760 iki bacak şematik.
  return (
    <svg viewBox="0 0 480 760" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      <g fill={FILL} stroke={STROKE} strokeWidth={2.5} strokeLinejoin="round">
        <path d="M150 40 L330 40 L330 120 C330 160 316 220 300 320 L286 560 C282 660 276 710 250 712 C232 712 226 670 224 560 L228 300 L252 300 L256 560 C254 670 248 712 230 712 C204 710 198 660 194 560 L180 320 C164 220 150 160 150 120 Z" />
      </g>
      {back ? (
        <>
          <line x1={192} y1={340} x2={198} y2={560} stroke={CENTER} strokeWidth={1.5} strokeDasharray="5 8" />
          <line x1={288} y1={340} x2={282} y2={560} stroke={CENTER} strokeWidth={1.5} strokeDasharray="5 8" />
        </>
      ) : null}
    </svg>
  );
}

export function BodySilhouette({ mapKey }: { mapKey: string }) {
  const def = getCuppingMap(mapKey);
  const group = def?.group;
  if (group === "bacak") return <Legs back={mapKey === "legs_back"} />;
  if (group === "bas") {
    const variant =
      mapKey === "head_back"
        ? "back"
        : mapKey === "head_left"
          ? "left"
          : mapKey === "head_right"
            ? "right"
            : mapKey === "head_top"
              ? "top"
              : "front";
    return <Head variant={variant} />;
  }
  // govde (varsayılan)
  return <FullBody back={mapKey === "back_body"} />;
}
