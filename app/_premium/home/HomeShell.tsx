"use client";

/**
 * Ana sayfa premium kabuğu (owner onaylı bağımsız prototip: C:\YasamSistemi-Gorsel-Tasarim\ana-sayfa-dashboard, 7a06a57).
 * Yalnız GÖRSEL katman: açılır-kapanır sol menü + üst araç satırı. Yetki / veri / oturum mantığı app/page.tsx'te kalır;
 * menü öğelerinin görünürlüğü oradan gelen hazır kararlarla (props) belirlenir — burada yeni yetki kuralı YOK.
 * Gerçek karşılığı olmayan "Raporlar" öğesi bilinçli olarak eklenmedi; "Tüm Modüller" aynı sayfadaki modül bölümüne gider.
 */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  CalendarDays,
  ChevronsLeft,
  FileText,
  Home,
  LayoutGrid,
  Loader2,
  Menu,
  Settings,
  Shield,
  UserRound,
} from "lucide-react";
import styles from "./home.module.css";

const COLLAPSE_KEY = "ys-home-side-collapsed";
const COLLAPSE_EVENT = "ys-home-side-collapsed-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false; /* depolama yoksa varsayılan: açık */
  }
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

export type HomeShellProps = {
  /** Danışan Yolculuğu merkezi açık mı (Takvim + Danışanlar menü öğeleri). */
  showClients: boolean;
  /** Dijital İçerik Merkezi açık mı (İçerikler menü öğesi). */
  showContents: boolean;
  isAdmin: boolean;
  adminNavLoading: boolean;
  onAdminNav: () => void;
  /** Sağ üst araçlar (dil, bildirim, çıkış) — mevcut gerçek bileşenler. */
  tools: ReactNode;
  children: ReactNode;
};

export default function HomeShell({
  showClients,
  showContents,
  isAdmin,
  adminNavLoading,
  onAdminNav,
  tools,
  children,
}: HomeShellProps) {
  const t = useTranslations("home.premium");
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setDrawerOpen(false);
      return;
    }
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      /* depolama yoksa daraltma kalıcı olmaz */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  const items: { key: string; href: string; label: string; Icon: typeof Home; active?: boolean }[] = [
    { key: "home", href: "/", label: t("menuHome"), Icon: Home, active: true },
    { key: "modules", href: "/#yasam-modulleri", label: t("menuAllModules"), Icon: LayoutGrid },
  ];
  if (showClients) {
    items.push({ key: "calendar", href: "/dashboard/ajanda", label: t("menuCalendar"), Icon: CalendarDays });
    items.push({ key: "clients", href: "/danisan-yolculugu/liste", label: t("menuClients"), Icon: UserRound });
  }
  if (showContents) {
    items.push({ key: "contents", href: "/digital-content", label: t("menuContents"), Icon: FileText });
  }
  items.push({ key: "settings", href: "/settings", label: t("menuSettings"), Icon: Settings });

  const toggleLabel = collapsed ? t("menuExpand") : t("menuCollapse");

  return (
    <div
      className={`${styles.shell} ${collapsed ? styles.collapsed : ""} ${drawerOpen ? styles.drawerOpen : ""}`}
      data-testid="home-premium-shell"
    >
      <aside className={styles.side} id="home-side" aria-label={t("menuLabel")}>
        <div className={styles.sideHead}>
          <span className={styles.sideLogo} aria-hidden>
            <svg viewBox="-12 -12 24 24" width="22" height="22">
              <path d="M0 -10 L2 -2 L10 0 L2 2 L0 10 L-2 2 L-10 0 L-2 -2 Z" fill="#fff" />
            </svg>
          </span>
          <span className={styles.sideBrand}>
            <strong>Yaşam Sistemi</strong>
            <small>{t("tagline")}</small>
          </span>
          <button
            type="button"
            className={styles.sideToggle}
            onClick={toggleCollapsed}
            aria-controls="home-side"
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            <ChevronsLeft className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <nav>
          <ul className={styles.menu}>
            {items.map(({ key, href, label, Icon, active }) => (
              <li key={key}>
                <Link
                  href={href}
                  className={`${styles.menuItem} ${active ? styles.menuActive : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className={styles.menuIcon}>
                    <Icon className="h-[20px] w-[20px]" strokeWidth={1.7} aria-hidden />
                  </span>
                  <span className={styles.menuLabel}>{label}</span>
                </Link>
              </li>
            ))}
            {isAdmin ? (
              <li>
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuAdmin}`}
                  onClick={onAdminNav}
                  disabled={adminNavLoading}
                  title={t("menuAdmin")}
                >
                  <span className={styles.menuIcon}>
                    {adminNavLoading ? (
                      <Loader2 className="h-[18px] w-[18px] animate-spin" strokeWidth={2.2} aria-hidden />
                    ) : (
                      <Shield className="h-[19px] w-[19px]" strokeWidth={1.9} aria-hidden />
                    )}
                  </span>
                  <span className={styles.menuLabel}>{t("menuAdmin")}</span>
                  <ArrowRight className={`${styles.menuLabel} ml-auto h-4 w-4`} strokeWidth={2.2} aria-hidden />
                </button>
              </li>
            ) : null}
          </ul>
        </nav>
        <div className={styles.sideFoot} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.sideLeaf} src="/premium/ana-sayfa/yaprak.webp" width={200} height={250} alt="" />
          <p className={styles.sideQuote}>
            {t("sideQuote")
              .split("|")
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </p>
        </div>
      </aside>
      {drawerOpen ? <div className={styles.scrim} onClick={() => setDrawerOpen(false)} aria-hidden /> : null}

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.menuBtn}
            onClick={() => setDrawerOpen((o) => !o)}
            aria-controls="home-side"
            aria-expanded={drawerOpen}
            aria-label={t("menuOpen")}
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <div className={styles.tools}>{tools}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
