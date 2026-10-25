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
 * 2026-10-25 owner kararı (TEK MENÜ): görünüm ana sayfanın sol menüsüyle BİREBİR — ikisi de
 * components/layout/side-menu/SideMenu bileşenini kullanır; bu kabuk yalnız kullanıcı/yetki girdisini ve yerleşimi sağlar.
 * 2026-10-25 owner düzeltmesi: davranış da ana sayfayla aynı — >900px kalıcı menü + ortak daraltma tercihi (ikon şeridi,
 * içeriğin üstünde açılan panel ve masaüstü karartması kaldırıldı), ≤900px çekmece. Küresel üst çubuk kaldırıldı:
 * çekmece açma düğmesi yer kaplamayan sabit düğme, bildirim zili menünün alt bölümünde.
 */
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  clearYasamUser,
  hasFullPanelAccess,
  isAdminUser,
  parseLoginUserRecord,
  sessionTokenHeader,
  syncYasamUserFromDbOutcome,
  type YasamUser,
} from "@/lib/auth/yasamUser";
import { confirmSessionInvalid } from "@/lib/auth/sessionExpiry";
import { leaveAfterSessionEnd } from "@/lib/auth/sessionExit";
import { useToast } from "@/components/ui/ToastProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import { buildCenterNavHubs, isExpertMembershipExpired } from "@/app/_premium/home/homeCenters";
import { buildModuleNavGroups, useModuleNavProbes, type HomeNavGroup } from "@/app/_premium/home/homeModuleNav";
import SideMenu, {
  readSideMenuCollapsed,
  subscribeSideMenuCollapsed,
  writeSideMenuCollapsed,
} from "@/components/layout/side-menu/SideMenu";
import {
  QUICK_NAV_CLIENTS_ROUTES,
  QUICK_NAV_MODULES_KEY,
  QUICK_NAV_ROUTE_ALIASES,
  matchesRoute,
  quickNavPlacement,
} from "./quickNavConfig";
import QuickNavMenuButton from "./QuickNavMenuButton";
import { setQuickNavState, useQuickNavState } from "./quickNavStore";
import styles from "./quickNav.module.css";

/** Ana sayfayla AYNI kırılım (HomeShell DRAWER_QUERY / sideMenu.module.css): ≤900px çekmece. */
const DRAWER_QUERY = "(max-width: 900px)";

function readNarrow(): boolean {
  return window.matchMedia(DRAWER_QUERY).matches;
}

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(DRAWER_QUERY);
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

/** Sunucu yoklamalı alt modüllerin (Beslenme, Gökyüzü Atlası) adresleri. */
const PROBE_PATHS = ["/beslenme", "/astroloji", "/admin/astroloji"];

/** "Tüm Modüller" listesi iç sayfalarda varsayılan AÇIK (bulunulan sayfa görünür); kullanıcı kapatırsa oturum boyunca kapalı. */
function readModulesOpen(): boolean {
  try {
    return window.sessionStorage.getItem(QUICK_NAV_MODULES_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeModulesOpen(open: boolean): void {
  try {
    window.sessionStorage.setItem(QUICK_NAV_MODULES_KEY, open ? "1" : "0");
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
  const router = useRouter();
  const placement = quickNavPlacement(pathname);
  const t = useTranslations("navigation.quickNav");
  const tHome = useTranslations("home");
  const { showToast } = useToast();

  /** İstemcide true (SSR + hidrasyon ilk çizimi false) — oturum bilgisi yalnız tarayıcıda. */
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const userRaw = useSyncExternalStore(subscribeUser, readUserRaw, () => null);
  const cachedUser = useMemo(() => parseUser(userRaw), [userRaw]);
  /** Sunucuyla doğrulanmış kullanıcı (ana sayfadaki profileSynced ile aynı ilke; admin beklemez). */
  const [synced, setSynced] = useState<YasamUser | null>(null);
  /** Daraltma tercihi ana sayfayla ORTAK (tek menü). */
  const collapsedPref = useSyncExternalStore(subscribeSideMenuCollapsed, readSideMenuCollapsed, () => false);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  /** "Tüm Modüller" listesi; null → oturum tercihi (varsayılan açık). */
  const [modulesState, setModulesState] = useState<boolean | null>(null);
  /** Yönetim Paneli geçişi sürüyor — başladığı adrese bağlı (sayfa değişince düğme yeniden kullanılabilir). */
  const [adminNavPath, setAdminNavPath] = useState<string | null>(null);
  const adminNavLoading = adminNavPath === pathname;
  const { drawerOpen } = useQuickNavState();
  const asideRef = useRef<HTMLElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

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
  // Ana sayfa davranışı: masaüstünde kalıcı menü (hassas ekranlar dahil), ≤900px çekmece.
  const drawerMode = narrow;
  /** Ortak daraltma tercihi (ana sayfayla aynı ikon görünümü). */
  const collapsed = !narrow && collapsedPref;
  const iconOnly = collapsed;
  const modulesOpen = modulesState ?? (mounted ? readModulesOpen() : true);

  // Sunucu yoklamalı iki alt modül (Beslenme, Gökyüzü Atlası): ana sayfadaki ilkeyle aynı — yalnız liste GÖRÜNÜR
  // açıkken ya da o modülün adresindeyken bir kez yoklanır (ikon şeridinde / kapalı çekmecede istek yok); hata → gizli.
  const [probeWanted, setProbeWanted] = useState(false);
  const listVisible = modulesOpen && !iconOnly && (!drawerMode || drawerOpen);
  if (mounted && active && listVisible && !probeWanted) setProbeWanted(true);
  const probeByPath = PROBE_PATHS.some((p) => matchesRoute(pathname, p));
  const probes = useModuleNavProbes(mounted && active && user !== null && (probeWanted || probeByPath));

  const hubs = useMemo(
    () =>
      user && permissionsReady && !isExpertMembershipExpired(user)
        ? buildCenterNavHubs(user, hasFullPanelAccess(user), (key) => tHome(`modules.${key}.title`))
        : [],
    [user, permissionsReady, tHome],
  );
  const groups = useMemo<HomeNavGroup[]>(
    () => (user && hubs.length > 0 ? buildModuleNavGroups(user, hubs, probes, (key) => tHome(`premium.nav.${key}`)) : []),
    [user, hubs, probes, tHome],
  );
  // Danışanlar kısayolu: ana sayfadaki kuralla aynı (Danışan Yolculuğu kartı açık mı — isCardOpen("clients")).
  const showClients = hubs.some((h) => h.permissionKey === "clients" && h.open);
  const isAdmin = !!user && permissionsReady && isAdminUser(user);

  const current = useMemo(() => findActive(pathname, groups), [pathname, groups]);
  /** Liste boyu (yoklamalı alt modüller sonradan eklenince bulunulan sayfa yeniden görünür alana alınır). */
  const navSize = groups.reduce((n, g) => n + 1 + g.items.length, 0);

  // Sayfa değişince çekmece kapanır (daraltma tercihi korunur).
  useEffect(() => {
    setQuickNavState({ drawerOpen: false });
  }, [pathname]);

  useEffect(() => {
    setQuickNavState({ available: mounted && active && user !== null, overlay: false });
  }, [mounted, active, user, placement]);

  // Bulunulan sayfa uzun listede görünür alana kaydırılır (yalnız menünün kendi kaydırma alanı).
  useEffect(() => {
    if (!listVisible) return;
    const el = asideRef.current?.querySelector<HTMLElement>("nav [aria-current=page]");
    el?.scrollIntoView({ block: "nearest" });
  }, [pathname, listVisible, navSize]);

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
    asideRef.current?.querySelector<HTMLElement>("[data-side-toggle]")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  useEffect(() => {
    if (!drawerMode && drawerOpen) setQuickNavState({ drawerOpen: false });
  }, [drawerMode, drawerOpen]);

  function setModulesOpen(open: boolean) {
    setModulesState(open);
    writeModulesOpen(open);
  }

  function toggleModules() {
    if (iconOnly) {
      // İkon görünümünde liste okunamaz → menü genişler ve liste açılır (ana sayfadaki davranışla aynı).
      writeSideMenuCollapsed(false);
      setModulesOpen(true);
      return;
    }
    setModulesOpen(!modulesOpen);
  }

  function onToggle() {
    if (drawerMode) closeDrawer();
    else writeSideMenuCollapsed(!collapsedPref);
  }

  const onNavigate = () => {
    if (drawerOpen) setQuickNavState({ drawerOpen: false });
  };

  // Yönetim Paneli: ana sayfadaki akışla aynı sözleşme — tıklama anındaki oturumla admin çerezi istenir; yalnız 200'de
  // /admin'e gidilir; sunucu iki kez kesin "geçersiz" derse oturum kapanış akışı; diğer hatalar → uyarı.
  // Yetki kararı sunucuda (/api/auth/admin-session + /admin koruması) — menü yalnız düğmeyi gösterir.
  async function onAdminNav() {
    if (adminNavLoading) return;
    setAdminNavPath(pathname);
    let status: number | null = null;
    try {
      const r = await fetch("/api/auth/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...sessionTokenHeader() },
      });
      status = r.status;
    } catch {
      status = null;
    }
    if (status === 200) {
      onNavigate();
      router.push("/admin");
      return;
    }
    setAdminNavPath(null);
    if (status === 401) {
      const s = await confirmSessionInvalid();
      if (s) {
        clearYasamUser();
        leaveAfterSessionEnd("/", s.reason, (href) => router.replace(href));
        return;
      }
    }
    showToast({ message: tHome("auth.adminSessionFailed"), type: "error" });
  }

  const shellClass = [styles.shell, active ? styles.side : "", collapsed ? styles.collapsed : ""]
    .filter(Boolean)
    .join(" ");

  const toggleLabel = drawerMode ? t("close") : iconOnly ? t("expand") : t("collapse");
  const asideHidden = drawerMode && !drawerOpen;

  const nav = active ? (
    <>
      <div className={styles.spacer} aria-hidden />
      <SideMenu
        id="quick-nav"
        variant="app"
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        hidden={asideHidden}
        groups={groups}
        modulesOpen={modulesOpen && !iconOnly}
        onToggleModules={toggleModules}
        onCloseModules={() => setModulesOpen(false)}
        showClients={showClients}
        isAdmin={isAdmin}
        adminNavLoading={adminNavLoading}
        onAdminNav={() => {
          void onAdminNav();
        }}
        toggleLabel={toggleLabel}
        onToggle={onToggle}
        onNavigate={onNavigate}
        scrim={drawerMode && drawerOpen ? "drawer" : "none"}
        onScrimClick={closeDrawer}
        logoHref="/"
        logoTitle={t("home")}
        active={{
          group: current.center,
          href: current.child,
          clients: QUICK_NAV_CLIENTS_ROUTES.some((r) => matchesRoute(pathname, r)),
          settings: matchesRoute(pathname, "/settings"),
        }}
        asideRef={asideRef}
        bell={<NotificationBell compact />}
      />
      {/* Tablet / mobil çekmece açma düğmesi: sabit konumlu, sayfada yer kaplamaz (eski üst çubuğun yerine). */}
      <QuickNavMenuButton />
    </>
  ) : null;

  return (
    <div className={shellClass} data-quick-nav={active ? "side" : "off"}>
      {nav}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
