/**
 * Danışan Yolculuğu — premium kart objeleri ve çizgi ikonlar (owner onaylı v2 prototipi:
 * C:\YasamSistemi-Gorsel-Tasarim\danisan-yolculugu, 0f861c4). Yalnız dekor: tamamen satır içi SVG, görsel dosyası /
 * dış istek yok, ekran okuyucudan gizli. Gradyan kimlikleri useId ile benzersiz (aynı sayfada çakışmaz).
 */
import { useId } from "react";

const ICONS = {
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  calendarPlus: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  journey: (
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M3 21v-2a4 4 0 0 1 4-4h4" />
      <path d="M16 19h6M19 16l3 3-3 3" />
    </>
  ),
} as const;

export type DyIconName = keyof typeof ICONS;

export function DyIcon({ name, size = 22, stroke = 2 }: { name: DyIconName; size?: number; stroke?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}

function KayitObject() {
  const g = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${g}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6ee7c7" />
          <stop offset="0.5" stopColor="#10b981" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id={`${g}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${g}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="84" height="84" rx="24" fill={`url(#${g}t)`} />
      <rect x="6" y="6" width="84" height="46" rx="24" fill={`url(#${g}g)`} />
      <rect x="6.5" y="6.5" width="83" height="83" rx="23.5" fill="none" stroke="#ffffff" strokeOpacity="0.6" />
      <circle cx="44" cy="38" r="12" fill="#ffffff" fillOpacity="0.96" />
      <path d="M23 72c1-12 10-18 21-18s20 6 21 18z" fill="#ffffff" fillOpacity="0.96" />
      <circle cx="74" cy="72" r="15" fill={`url(#${g}b)`} stroke="#ffffff" strokeWidth="3" />
      <path d="M74 65v14M67 72h14" stroke="#ffffff" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

function ListeObject() {
  const g = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 120 104" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${g}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <linearGradient id={`${g}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ede9fe" stopOpacity="0.97" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.93" />
        </linearGradient>
        <linearGradient id={`${g}m`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde7b0" />
          <stop offset="1" stopColor="#c98a2e" />
        </linearGradient>
      </defs>
      <path d="M10 22a9 9 0 0 1 9-9h26l10 10h46a9 9 0 0 1 9 9v52a9 9 0 0 1-9 9H19a9 9 0 0 1-9-9z" fill={`url(#${g}b)`} />
      <rect x="22" y="20" width="76" height="44" rx="5" fill="#ffffff" fillOpacity="0.9" />
      <rect x="30" y="29" width="44" height="5" rx="2.5" fill="#c4b5fd" />
      <rect x="30" y="39" width="56" height="5" rx="2.5" fill="#ddd6fe" />
      <path d="M5 44a9 9 0 0 1 9-9h92a9 9 0 0 1 9 9l-4 40a9 9 0 0 1-9 8H18a9 9 0 0 1-9-8z" fill={`url(#${g}f)`} />
      <path d="M5 44a9 9 0 0 1 9-9h92a9 9 0 0 1 9 9" fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.5" />
      <circle cx="80" cy="64" r="17" fill="#ffffff" fillOpacity="0.32" stroke={`url(#${g}m)`} strokeWidth="5.5" />
      <path d="M71 57a11 11 0 0 1 9-4" fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round" />
      <path d="M92 76l11 11" stroke={`url(#${g}m)`} strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

function TakipObject() {
  const g = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 112 104" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${g}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#dff4fb" stopOpacity="0.96" />
        </linearGradient>
        <linearGradient id={`${g}h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
        <linearGradient id={`${g}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <rect x="6" y="14" width="86" height="80" rx="15" fill={`url(#${g}b)`} stroke="#cdeaf3" strokeWidth="1.5" />
      <path d="M6 29a15 15 0 0 1 15-15h56a15 15 0 0 1 15 15v7H6z" fill={`url(#${g}h)`} />
      <rect x="26" y="5" width="9" height="19" rx="4.5" fill="#0e7490" />
      <rect x="63" y="5" width="9" height="19" rx="4.5" fill="#0e7490" />
      <g fill="#bfe7f5">
        <rect x="18" y="46" width="14" height="9" rx="3" />
        <rect x="38" y="46" width="14" height="9" rx="3" />
        <rect x="58" y="46" width="14" height="9" rx="3" />
        <rect x="18" y="62" width="14" height="9" rx="3" />
        <rect x="38" y="62" width="14" height="9" rx="3" fill="#7dd3fc" />
        <rect x="18" y="78" width="14" height="9" rx="3" />
        <rect x="38" y="78" width="14" height="9" rx="3" />
      </g>
      <circle cx="84" cy="80" r="19" fill={`url(#${g}c)`} stroke="#ffffff" strokeWidth="3" />
      <path d="M75 80l6 6 12-12" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const DY_OBJECTS = {
  kayit: { Svg: KayitObject, w: 92, h: 92 },
  liste: { Svg: ListeObject, w: 104, h: 90 },
  takip: { Svg: TakipObject, w: 98, h: 91 },
} as const;
