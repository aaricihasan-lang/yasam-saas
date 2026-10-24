/**
 * Hızlı Erişim Menüsü ikonları — owner onaylı prototipteki çizgi ikonlar birebir (quick-nav.js ICONS).
 */
import type { ModulePermissionKey } from "@/lib/auth/modulePermissions";

const PATHS = {
  users: (
    <>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.5" />
      <path d="M20 19v-1.4a3.2 3.2 0 0 0-2.3-3.1M15.5 4.6a3.4 3.4 0 0 1 0 6.6" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3.2 3.2 0 0 0 7 17.5 2.8 2.8 0 0 0 12 19V5.6A2.2 2.2 0 0 0 9.5 4Z" />
      <path d="M14.5 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3.2 3.2 0 0 1-2.5 5.3A2.8 2.8 0 0 1 12 19" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14Z" />
      <path d="M5 19 13 11" />
    </>
  ),
  folder: <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />,
  orbit: (
    <>
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-25 12 12)" />
    </>
  ),
  box: (
    <>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v9.5h12V10" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  collapse: <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
} as const;

export type QuickNavIconName = keyof typeof PATHS;

/** Merkez (ana sayfa kartı permissionKey) → ikon. */
export const CENTER_ICON: Partial<Record<ModulePermissionKey, QuickNavIconName>> = {
  clients: "users",
  yasam_hafizasi: "brain",
  energy_body: "spark",
  sifa_rehberi: "leaf",
  digital_content: "folder",
  numerology: "orbit",
  stok: "box",
};

export default function QuickNavIcon({
  name,
  className,
  strokeWidth = 1.7,
}: {
  name: QuickNavIconName;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
