"use client";

/**
 * YAŞAM SİSTEMİ TEK SOL MENÜ — ana sayfanın owner onaylı premium sol menüsü (HomeShell, prototip ana-sayfa-dashboard
 * 7a06a57) tek bileşene taşındı; ana sayfa (app/_premium/home/HomeShell) ve bütün iç sayfalar
 * (components/layout/quick-nav/QuickNavShell) bu bileşeni kullanır (2026-10-25 owner kararı: tek menü, tek tasarım).
 *
 * Yalnız GÖRÜNÜM: yetki / görünürlük kararı burada verilmez. Liste (groups), Danışanlar / Yönetim Paneli görünürlüğü ve
 * aktif sayfa çağıran kabuktan hazır gelir (homeCenters.ts + homeModuleNav.ts — mevcut kurallar).
 * Yerleşim:
 *   - variant "home": ana sayfa ızgarasında yapışkan (sticky) kart; ≤900px çekmece (eski home.module.css birebir).
 *   - variant "app": iç sayfalarda sabit (fixed) kart, aynı konum/ölçüler; 1025–1799px ikon şeridi (içerik genişliği
 *     korunur), genişletilince içeriğin üstünde açılır; ≤1024px ve hassas ekranlarda (drawerAlways) çekmece.
 */
import Link from "next/link";
import { useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type Ref } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, ChevronsLeft, LayoutGrid, Loader2, Settings, Shield, UserRound } from "lucide-react";
import { premiumFontVars } from "@/app/_premium/fonts";
import type { HomeNavGroup } from "@/app/_premium/home/homeModuleNav";
import styles from "./sideMenu.module.css";

/** Daraltma tercihi: ana sayfa ve iç sayfalar AYNI tercihi paylaşır (tek menü). Anahtar ana sayfanın mevcut anahtarıdır. */
export const SIDE_MENU_COLLAPSE_KEY = "ys-home-side-collapsed";
export const SIDE_MENU_COLLAPSE_EVENT = "ys-home-side-collapsed-change";

export function readSideMenuCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDE_MENU_COLLAPSE_KEY) === "1";
  } catch {
    return false; /* depolama yoksa varsayılan: açık */
  }
}

export function writeSideMenuCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(SIDE_MENU_COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* depolama yoksa daraltma kalıcı olmaz */
  }
  window.dispatchEvent(new Event(SIDE_MENU_COLLAPSE_EVENT));
}

export function subscribeSideMenuCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDE_MENU_COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDE_MENU_COLLAPSE_EVENT, onChange);
  };
}

/** Bulunulan sayfa (yalnız gösterim): grup başlığı / alt modül / Danışanlar / Ayarlar vurgusu. */
export type SideMenuActive = {
  group: string | null;
  href: string | null;
  clients: boolean;
  settings: boolean;
};

export type SideMenuProps = {
  id: string;
  variant: "home" | "app";
  /** Kullanıcının daraltma tercihi (ana sayfa; iç sayfalarda ≥1800px). */
  collapsed: boolean;
  drawerOpen: boolean;
  /** İç sayfa: hassas ekran — masaüstünde de yalnız çekmece. */
  drawerAlways?: boolean;
  /** İç sayfa 1025–1799px: ikon şeridinden genişletilmiş (içeriğin üstünde) panel. */
  expanded?: boolean;
  /** Kapalı çekmece klavye / ekran okuyucudan gizlenir. */
  hidden?: boolean;
  groups: HomeNavGroup[];
  modulesOpen: boolean;
  onToggleModules: () => void;
  onCloseModules: () => void;
  showClients: boolean;
  isAdmin: boolean;
  adminNavLoading: boolean;
  onAdminNav: () => void;
  toggleLabel: string;
  onToggle: () => void;
  onNavigate: () => void;
  /** Yarı saydam örtü (çekmece / genişletilmiş panel) — tıklanınca kapanır. */
  scrim: "none" | "home" | "drawer" | "rail";
  onScrimClick: () => void;
  /** İç sayfalarda logo ana sayfaya döner. */
  logoHref?: string;
  logoTitle?: string;
  active?: SideMenuActive | null;
  asideRef?: Ref<HTMLElement>;
};

export default function SideMenu({
  id,
  variant,
  collapsed,
  drawerOpen,
  drawerAlways = false,
  expanded = false,
  hidden = false,
  groups,
  modulesOpen,
  onToggleModules,
  onCloseModules,
  showClients,
  isAdmin,
  adminNavLoading,
  onAdminNav,
  toggleLabel,
  onToggle,
  onNavigate,
  scrim,
  onScrimClick,
  logoHref,
  logoTitle,
  active = null,
  asideRef,
}: SideMenuProps) {
  const t = useTranslations("home.premium");
  const modulesListId = useId();
  const modulesToggleRef = useRef<HTMLButtonElement>(null);

  function onModulesKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || !modulesOpen) return;
    // Liste açıkken Esc yalnız listeyi kapatır (çekmeceyi değil) ve odağı düğmeye döndürür.
    e.stopPropagation();
    onCloseModules();
    modulesToggleRef.current?.focus();
  }

  const items: { key: string; href: string; label: string; Icon: typeof Settings; isActive: boolean }[] = [];
  if (showClients) {
    items.push({
      key: "clients",
      href: "/danisan-yolculugu/liste",
      label: t("menuClients"),
      Icon: UserRound,
      isActive: !!active?.clients,
    });
  }
  items.push({ key: "settings", href: "/settings", label: t("menuSettings"), Icon: Settings, isActive: !!active?.settings });

  const asideClass = [
    styles.side,
    variant === "home" ? styles.home : styles.app,
    variant === "app" && !drawerAlways ? styles.autoRail : "",
    drawerAlways ? styles.drawerAlways : "",
    collapsed ? styles.collapsed : "",
    drawerOpen ? styles.drawerOpen : "",
    expanded ? styles.expanded : "",
    premiumFontVars,
  ]
    .filter(Boolean)
    .join(" ");

  const logo = (
    // Owner'ın verdiği logo olduğu gibi (yalnız beyaz kenar boşluğu kırpıldı); marka adı ve alt metin logonun içinde.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={styles.sideLogo}
      src="/premium/brand/yasam-sistemi-logo.webp"
      width={600}
      height={501}
      alt={`Yaşam Sistemi — ${t("tagline")}`}
      decoding="async"
      draggable={false}
      data-testid="home-brand-logo"
    />
  );

  return (
    <>
      <aside
        ref={asideRef}
        className={asideClass}
        id={id}
        aria-label={t("menuLabel")}
        aria-hidden={hidden ? true : undefined}
        inert={hidden}
        data-testid="side-menu"
        data-side-menu={variant}
      >
        <div className={styles.sideHead}>
          {logoHref ? (
            <Link href={logoHref} className={styles.logoLink} title={logoTitle} onClick={onNavigate}>
              {logo}
            </Link>
          ) : (
            logo
          )}
          <button
            type="button"
            className={styles.sideToggle}
            onClick={onToggle}
            aria-controls={id}
            aria-expanded={variant === "app" && (drawerAlways || drawerOpen) ? drawerOpen : !collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            data-side-toggle
          >
            <ChevronsLeft className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
          </button>
        </div>
        <nav className={styles.nav}>
          <ul className={styles.menu}>
            {groups.length > 0 ? (
              <li onKeyDown={onModulesKeyDown}>
                <button
                  ref={modulesToggleRef}
                  type="button"
                  className={`${styles.menuItem} ${modulesOpen ? styles.menuItemOpen : ""}`}
                  aria-expanded={modulesOpen}
                  aria-controls={modulesListId}
                  title={t("nav.menuModulesHint")}
                  onClick={onToggleModules}
                  data-testid="home-all-modules-toggle"
                >
                  <span className={styles.menuIcon}>
                    <LayoutGrid className="h-[20px] w-[20px]" strokeWidth={1.7} aria-hidden />
                  </span>
                  <span className={styles.menuLabel}>{t("menuAllModules")}</span>
                  <ChevronDown
                    className={`${styles.menuLabel} ${styles.modChevron} ml-auto h-4 w-4`}
                    strokeWidth={2.2}
                    aria-hidden
                  />
                </button>
                {/* Kapalıyken liste DOM'da yok → bağlantıları klavyeyle odaklanamaz. */}
                {modulesOpen ? (
                  <ul
                    className={styles.modList}
                    id={modulesListId}
                    aria-label={t("nav.menuModulesHint")}
                    data-testid="home-all-modules-list"
                  >
                    {groups.map((group) => {
                      const groupCurrent = active?.group === group.key && active.href === null;
                      return (
                        <li key={group.key} className={styles.modGroup}>
                          {group.href ? (
                            <Link
                              href={group.href}
                              className={`${styles.modGroupTitle} ${groupCurrent ? styles.modActive : ""}`}
                              aria-current={groupCurrent ? "page" : undefined}
                              onClick={onNavigate}
                            >
                              {group.label}
                            </Link>
                          ) : (
                            <span className={styles.modGroupTitle}>{group.label}</span>
                          )}
                          {group.items.length > 0 ? (
                            <ul className={styles.modItems}>
                              {group.items.map((item) => {
                                const cur = active?.group === group.key && active.href === item.href;
                                return (
                                  <li key={item.key}>
                                    <Link
                                      href={item.href}
                                      className={`${styles.modItem} ${cur ? styles.modActive : ""}`}
                                      aria-current={cur ? "page" : undefined}
                                      onClick={onNavigate}
                                    >
                                      {item.label}
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            ) : null}
            {items.map(({ key, href, label, Icon, isActive }) => (
              <li key={key}>
                <Link
                  href={href}
                  className={`${styles.menuItem} ${isActive ? styles.menuActive : ""}`}
                  title={label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={onNavigate}
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
      {scrim !== "none" ? (
        <div
          className={`${styles.scrim} ${scrim === "home" ? styles.scrimHome : scrim === "rail" ? styles.scrimRail : styles.scrimDrawer}`}
          onClick={onScrimClick}
          aria-hidden
        />
      ) : null}
    </>
  );
}
