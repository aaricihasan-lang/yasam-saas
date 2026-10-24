"use client";

/**
 * MERKEZİ HIZLI ERİŞİM MENÜSÜ — tek bileşen, tek yönetim noktası (owner onaylı prototip 6073429; 2026-10-24 PASS).
 *
 * Kök layout'ta (app/layout.tsx) ModuleRouteGuard'ı sarar; modül sayfalarına kod eklenmez.
 * YETKİ KARARI BURADA ÜRETİLMEZ:
 *   - merkezler: app/_premium/home/homeCenters.ts (ana sayfa kartlarıyla aynı görünürlük + kilit kararı),
 *   - alt modüller: app/_premium/home/homeModuleNav.ts (ana sayfa "Tüm Modüller" ile aynı katalog, evaluateRouteModuleGuard,
 *     canSeeHubChild, Beslenme/Atlas sunucu yoklamaları — fail-closed).
 * Menü yalnız bağlantı gösterir; sayfalar ModuleRouteGuard, API'ler requireModuleAccess ile korunmaya devam eder.
 * Yerleşim (gizli / panel / yan menü) components/layout/quick-nav/quickNavConfig.ts'teki tek listeden gelir.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  hasFullPanelAccess,
  isAdminUser,
  parseLoginUserRecord,
  syncYasamUserFromDbOutcome,
  type YasamUser,
} from "@/lib/auth/yasamUser";
import { buildCenterNavHubs, isExpertMembershipExpired } from "@/app/_premium/home/homeCenters";
import { buildModuleNavGroups, useModuleNavProbes, type HomeNavGroup } from "@/app/_premium/home/homeModuleNav";
import QuickNavIcon, { CENTER_ICON } from "./QuickNavIcon";
import {
  QUICK_NAV_COLLAPSE_KEY,
  QUICK_NAV_DRAWER_QUERY,
  QUICK_NAV_OPEN_KEY,
  QUICK_NAV_RAIL_QUERY,
  QUICK_NAV_ROUTE_ALIASES,
  matchesRoute,
  quickNavPlacement,
} from "./quickNavConfig";
import { setQuickNavState, useQuickNavState } from "./quickNavStore";
import styles from "./quickNav.module.css";

const COLLAPSE_EVENT = "ys-quick-nav-collapsed-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(QUICK_NAV_COLLAPSE_KEY) === "1";
  } catch {
    return false; /* depolama yoksa varsayılan: açık */
  }
}

function writeCollapsed(value: boolean): void {
  try {
    window.localStorage.setItem(QUICK_NAV_COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    /* depolama yoksa yalnız bu görünüm */
  }
  window.dispatchEvent(new Event(COLLAPSE_EVENT));
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function readNarrow(): boolean {
  return window.matchMedia(QUICK_NAV_DRAWER_QUERY).matches;
}

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(QUICK_NAV_DRAWER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function readRail(): boolean {
  return window.matchMedia(QUICK_NAV_RAIL_QUERY).matches;
}

function subscribeRail(onChange: () => void) {
  const mq = window.matchMedia(QUICK_NAV_RAIL_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Oturum kaydı (lib/auth/yasamUser STORAGE_KEY ile aynı anahtar; ModuleRouteGuard da bu anahtarı dinler). */
const USER_STORAGE_KEY = "yasam_user";

function readUserRaw(): string | null {
  try {
    return window.localStorage.getItem(USER_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Başka sekmede giriş/çıkış: menü bayat kullanıcıyla kalmaz (aynı sekmedeki değişiklik sonraki çizimde okunur). */
function subscribeUser(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function parseUser(raw: string | null): YasamUser | null {
  if (!raw) return null;
  try {
    return parseLoginUserRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

const subscribeNothing = () => () => {};

/** Sunucu yoklamalı alt modüllerin bulunduğu merkezler ve adresleri (homeModuleNav "probe" öğeleri). */
const PROBE_CENTERS = new Set(["sifa_rehberi", "numerology"]);
const PROBE_PATHS = ["/beslenme", "/astroloji", "/admin/astroloji"];

function readOpenCenter(): string | null {
  try {
    return window.sessionStorage.getItem(QUICK_NAV_OPEN_KEY) || null;
  } catch {
    return null;
  }
}

function writeOpenCenter(id: string | null): void {
  try {
    window.sessionStorage.setItem(QUICK_NAV_OPEN_KEY, id ?? "");
  } catch {
    /* depolama yoksa yalnız bu görünüm */
  }
}

type ActiveMatch = { center: string | null; child: string | null };

/** Aktif sayfa: en uzun adres öneki (alt sayfalar da kendi modülünü vurgular). */
function findActive(path: string, groups: HomeNavGroup[]): ActiveMatch {
  let best: ActiveMatch & { len: number } = { center: null, child: null, len: -1 };
  for (const group of groups) {
    if (group.href && matchesRoute(path, group.href) && group.href.length > best.len) {
      best = { center: group.key, child: null, len: group.href.length };
    }
    for (const item of group.items) {
      for (const href of [item.href, ...(QUICK_NAV_ROUTE_ALIASES[item.href] ?? [])]) {
        if (matchesRoute(path, href) && href.length > best.len) best = { center: group.key, child: item.href, len: href.length };
      }
    }
  }
  return { center: best.center, child: best.child };
}

export default function QuickNavShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const placement = quickNavPlacement(pathname);
  const t = useTranslations("navigation.quickNav");
  const tHome = useTranslations("home");
  const tNav = useTranslations("navigation");

  /** İstemcide true (SSR + hidrasyon ilk çizimi false) — oturum bilgisi yalnız tarayıcıda. */
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const userRaw = useSyncExternalStore(subscribeUser, readUserRaw, () => null);
  const cachedUser = useMemo(() => parseUser(userRaw), [userRaw]);
  /** Sunucuyla doğrulanmış kullanıcı (ana sayfadaki profileSynced ile aynı ilke; admin beklemez). */
  const [synced, setSynced] = useState<YasamUser | null>(null);
  const collapsedPref = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  /** 1025–1799px: menü ikon şeridi; tam panel yalnız açıkken içeriğin üstünde (midOpen). */
  const rail = useSyncExternalStore(subscribeRail, readRail, () => false);
  /** Kullanıcının bu sayfada elle açtığı/kapattığı merkez; sayfa değişince bulunulan merkez esas alınır. */
  const [openState, setOpenState] = useState<{ path: string; id: string | null } | null>(null);
  /** Şeritten açılan panel — açıldığı adrese bağlı (sayfa değişince kendiliğinden kapanır). */
  const [midPath, setMidPath] = useState<string | null>(null);
  const { drawerOpen } = useQuickNavState();
  const asideRef = useRef<HTMLElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const idBase = useId();

  // Uzman izinleri: sunucu doğrulaması. ModuleRouteGuard aynı senkronu yaptığından syncYasamUserFromDbOutcome
  // önbellek/tekilleştirme ile ek istek üretmez. Hata / geçici sorun → uzman menüsü boş kalır (fail-closed).
  useEffect(() => {
    if (placement === "hidden" || !cachedUser) return;
    let alive = true;
    void syncYasamUserFromDbOutcome(cachedUser).then((outcome) => {
      if (alive && outcome.kind === "fresh") setSynced(outcome.user);
    });
    return () => {
      alive = false;
    };
  }, [pathname, placement, cachedUser]);

  const syncedUser = synced && cachedUser && synced.id === cachedUser.id ? synced : null;
  const user = placement === "hidden" ? null : (syncedUser ?? cachedUser);
  const permissionsReady = !!user && (isAdminUser(user) || syncedUser !== null);

  const active = placement !== "hidden" && (!mounted || user !== null);
  // Sunucu yoklamalı iki alt modül (Beslenme, Gökyüzü Atlası): ana sayfadaki ilkeyle aynı — yalnız ilgili merkez açılınca
  // ya da o modülün adresindeyken bir kez yoklanır (her sayfa yüklemesinde ek istek yok); hata → gizli (fail-closed).
  const [probeWanted, setProbeWanted] = useState(false);
  const probeByPath = PROBE_PATHS.some((p) => matchesRoute(pathname, p));
  const probes = useModuleNavProbes(mounted && active && user !== null && (probeWanted || probeByPath));

  const groups = useMemo<HomeNavGroup[]>(() => {
    if (!user || !permissionsReady || isExpertMembershipExpired(user)) return [];
    return buildModuleNavGroups(
      user,
      buildCenterNavHubs(user, hasFullPanelAccess(user), (key) => tHome(`modules.${key}.title`)),
      probes,
      (key) => tHome(`premium.nav.${key}`),
    );
  }, [user, permissionsReady, probes, tHome]);

  const current = useMemo(() => findActive(pathname, groups), [pathname, groups]);
  const drawerMode = placement === "overlay" || narrow;
  const midOpen = rail && midPath === pathname;
  const collapsed = placement === "side" && !narrow && (rail ? !midOpen : collapsedPref);
  // Sayfa değişince bulunulan merkez açılır (diğerleri kapanır); elle açılan merkez yalnız o sayfada geçerli.
  const openId =
    openState && openState.path === pathname ? openState.id : (current.center ?? (mounted ? readOpenCenter() : null));
  if (openId && PROBE_CENTERS.has(openId) && !probeWanted) setProbeWanted(true);

  useEffect(() => {
    if (current.center) writeOpenCenter(current.center);
  }, [current.center]);

  // Sayfa değişince çekmece kapanır (daraltma tercihi korunur).
  useEffect(() => {
    setQuickNavState({ drawerOpen: false });
  }, [pathname]);

  // Şeritten açılan panel: Esc / dışarı tıklama kapatır.
  useEffect(() => {
    if (!midOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMidPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [midOpen]);

  useEffect(() => {
    setQuickNavState({ available: mounted && active && user !== null, overlay: placement === "overlay" });
  }, [mounted, active, user, placement]);

  const closeDrawer = useCallback(() => {
    setQuickNavState({ drawerOpen: false });
    const back = lastFocusRef.current;
    lastFocusRef.current = null;
    if (back && document.contains(back)) back.focus();
  }, []);

  // Çekmece açılınca odak panele (kapat düğmesi); Esc kapatır ve odağı açan düğmeye döndürür.
  useEffect(() => {
    if (!drawerOpen) return;
    lastFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    asideRef.current?.querySelector<HTMLElement>("[data-qn-collapse]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerMode && drawerOpen) setQuickNavState({ drawerOpen: false });
  }, [drawerMode, drawerOpen]);

  function setOpenCenter(id: string | null) {
    setOpenState({ path: pathname, id });
    writeOpenCenter(id);
  }

  function toggleCenter(id: string) {
    if (collapsed) {
      // Daraltılmış şeritte merkez simgesi: menü genişler ve o merkez açılır (liste ikon şeridinde okunamaz).
      if (rail) setMidPath(pathname);
      else writeCollapsed(false);
      setOpenCenter(id);
      return;
    }
    setOpenCenter(openId === id ? null : id); // aynı başlık: kapat; başka başlık: öncekini kapatıp aç
  }

  function onCollapseClick() {
    if (drawerMode) closeDrawer();
    else if (rail) setMidPath(midOpen ? null : pathname);
    else writeCollapsed(!collapsedPref);
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    // Akordiyon açıkken Esc yalnız listeyi kapatır ve odağı başlığa döndürür (çekmece / şeritten açılan panel açıksa önce o kapanır).
    if (e.key !== "Escape" || drawerOpen || midOpen || !openId) return;
    e.stopPropagation();
    const id = openId;
    setOpenCenter(null);
    asideRef.current?.querySelector<HTMLElement>(`[data-qn-toggle="${id}"]`)?.focus();
  }

  const onLinkClick = () => {
    if (drawerOpen) setQuickNavState({ drawerOpen: false });
    setMidPath(null);
  };

  const shellClass = [
    styles.shell,
    active && placement === "side" ? styles.side : "",
    collapsed ? styles.collapsed : "",
    placement === "overlay" ? styles.drawerMode : "",
    drawerOpen ? styles.drawerOpen : "",
    midOpen ? styles.midOpen : "",
  ]
    .filter(Boolean)
    .join(" ");

  const collapseLabel = drawerMode ? t("close") : collapsed ? t("expand") : t("collapse");
  const asideHidden = drawerMode && !drawerOpen;
  const homeActive = pathname === "/";
  const settingsActive = matchesRoute(pathname, "/settings");

  const nav = active ? (
    <>
      <div className={styles.spacer} aria-hidden />
      <aside
        ref={asideRef}
        id="quick-nav"
        className={styles.aside}
        aria-label={t("label")}
        aria-hidden={asideHidden ? true : undefined}
        inert={asideHidden}
        data-testid="quick-nav"
        onKeyDown={onMenuKeyDown}
      >
        <div className={styles.head}>
          <Link href="/" className={styles.brand} title={t("home")} onClick={onLinkClick}>
            {/* Owner onaylı güncel logo (ana sayfa premium menüsüyle aynı dosya) — değiştirilmeden. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={styles.logo}
              src="/premium/brand/yasam-sistemi-logo.webp"
              width={600}
              height={501}
              alt={`${tNav("brand")} — ${tNav("tagline")}`}
              decoding="async"
              draggable={false}
            />
          </Link>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={onCollapseClick}
            aria-controls="quick-nav"
            aria-expanded={drawerMode ? drawerOpen : !collapsed}
            aria-label={collapseLabel}
            title={collapseLabel}
            data-qn-collapse
          >
            <QuickNavIcon name={drawerMode ? "close" : "collapse"} />
          </button>
        </div>
        <nav className={styles.scroll} aria-label={t("label")}>
          <ul className={styles.menu}>
            <li>
              <Link
                href="/"
                className={`${styles.center} ${homeActive ? styles.isActive : ""}`}
                title={t("home")}
                aria-current={homeActive ? "page" : undefined}
                onClick={onLinkClick}
              >
                <QuickNavIcon name="home" className={styles.ico} />
                <span className={styles.label}>{t("home")}</span>
              </Link>
            </li>
            {groups.length > 0 ? (
              <li className={styles.sep} aria-hidden>
                <span className={styles.label}>{t("centers")}</span>
              </li>
            ) : null}
            {groups.map((group) => {
              const icon = CENTER_ICON[group.key as keyof typeof CENTER_ICON] ?? "folder";
              const isActive = current.center === group.key;
              const isOpen = openId === group.key && !collapsed;
              const listId = `${idBase}-${group.key}`;
              if (group.items.length === 0) {
                // Alt modülü olmayan merkez (ör. Yaşam Hafızası): doğrudan bağlantı (başlığı yalnız açıksa listelenir).
                return (
                  <li key={group.key}>
                    <Link
                      href={group.href ?? "/"}
                      className={`${styles.center} ${isActive ? styles.isActive : ""}`}
                      title={group.label}
                      aria-current={isActive && current.child === null ? "page" : undefined}
                      onClick={onLinkClick}
                    >
                      <QuickNavIcon name={icon} className={styles.ico} />
                      <span className={styles.label}>{group.label}</span>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={group.key}>
                  <button
                    type="button"
                    className={`${styles.center} ${isActive ? styles.isActive : ""} ${isOpen ? styles.isOpen : ""}`}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    title={group.label}
                    onClick={() => toggleCenter(group.key)}
                    data-qn-toggle={group.key}
                  >
                    <QuickNavIcon name={icon} className={styles.ico} />
                    <span className={styles.label}>{group.label}</span>
                    <QuickNavIcon name="chevron" className={`${styles.ico} ${styles.chev}`} />
                  </button>
                  {/* Kapalıyken liste DOM'da yok → bağlantıları klavyeyle odaklanamaz. */}
                  {isOpen ? (
                    <ul className={styles.sub} id={listId}>
                      {group.href ? (
                        <li>
                          <Link
                            href={group.href}
                            className={`${styles.hub} ${isActive && current.child === null ? styles.isCurrent : ""}`}
                            aria-current={isActive && current.child === null ? "page" : undefined}
                            onClick={onLinkClick}
                          >
                            <QuickNavIcon name="arrow" className={`${styles.ico} ${styles.icoSm}`} />
                            <span>{t("goToCenter")}</span>
                          </Link>
                        </li>
                      ) : null}
                      {group.items.map((item) => {
                        const cur = current.child === item.href;
                        return (
                          <li key={item.key}>
                            <Link
                              href={item.href}
                              className={`${styles.item} ${cur ? styles.isCurrent : ""}`}
                              aria-current={cur ? "page" : undefined}
                              onClick={onLinkClick}
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
        </nav>
        <div className={styles.foot}>
          <Link
            href="/settings"
            className={`${styles.center} ${settingsActive ? styles.isActive : ""}`}
            title={t("settings")}
            aria-current={settingsActive ? "page" : undefined}
            onClick={onLinkClick}
          >
            <QuickNavIcon name="settings" className={styles.ico} />
            <span className={styles.label}>{t("settings")}</span>
          </Link>
        </div>
      </aside>
      <div
        className={styles.backdrop}
        onClick={() => {
          if (drawerOpen) closeDrawer();
          setMidPath(null);
        }}
        aria-hidden
      />
    </>
  ) : null;

  return (
    <div className={shellClass} data-quick-nav={active ? placement : "off"}>
      {nav}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
