"use client";

/**
 * Ana sayfa premium kabuğu (owner onaylı bağımsız prototip: C:\YasamSistemi-Gorsel-Tasarim\ana-sayfa-dashboard, 7a06a57).
 * Yalnız GÖRSEL katman: açılır-kapanır sol menü + üst araç satırı. Yetki / veri / oturum mantığı app/page.tsx'te kalır;
 * menü öğelerinin görünürlüğü oradan gelen hazır kararlarla (props) belirlenir — burada yeni yetki kuralı YOK.
 * Gerçek karşılığı olmayan "Raporlar" öğesi bilinçli olarak eklenmedi.
 * 2026-10-18 owner kararı: Ana Sayfa / Takvim / İçerikler menü öğeleri kaldırıldı (sayfalar ve yetkiler aynen çalışır);
 * "Tüm Modüller" erişilebilir merkez + alt modül listesini açıp kapatır (liste page.tsx → homeModuleNav ile mevcut
 * kurallardan üretilir; burada yetki kararı verilmez).
 */
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import NotificationBell from "@/components/notifications/NotificationBell";
import SideMenu, {
  readSideMenuCollapsed,
  subscribeSideMenuCollapsed,
  writeSideMenuCollapsed,
} from "@/components/layout/side-menu/SideMenu";
import styles from "./home.module.css";
import type { HomeNavGroup } from "./homeModuleNav";

const DRAWER_QUERY = "(max-width: 900px)";

/** Dar ekranda menü çekmece olur; kapalı çekmece klavye/ekran okuyucudan gizlenir (inert). */
function readNarrow(): boolean {
  return window.matchMedia(DRAWER_QUERY).matches;
}

function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(DRAWER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export type HomeShellProps = {
  /** Danışan Yolculuğu merkezi açık mı (Danışanlar menü öğesi). */
  showClients: boolean;
  /** "Tüm Modüller" listesi: kullanıcının erişebildiği merkezler + alt modüller (page.tsx'te mevcut kurallarla üretilir). */
  moduleGroups: HomeNavGroup[];
  /** Liste ilk açıldığında (sunucu yoklamalı alt modüller için) haber verir. */
  onModulesOpen: () => void;
  isAdmin: boolean;
  adminNavLoading: boolean;
  onAdminNav: () => void;
  /** Sağ üst araçlar (dil, bildirim, çıkış) — mevcut gerçek bileşenler. */
  tools: ReactNode;
  children: ReactNode;
};

export default function HomeShell({
  showClients,
  moduleGroups,
  onModulesOpen,
  isAdmin,
  adminNavLoading,
  onAdminNav,
  tools,
  children,
}: HomeShellProps) {
  const t = useTranslations("home.premium");
  const collapsed = useSyncExternalStore(subscribeSideMenuCollapsed, readSideMenuCollapsed, () => false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const narrow = useSyncExternalStore(subscribeNarrow, readNarrow, () => false);
  const [modulesOpen, setModulesOpen] = useState(false);

  function toggleModules() {
    const next = !modulesOpen;
    if (next) {
      onModulesOpen();
      // Daraltılmış (ikon) menüde liste okunamaz → önce menüyü genişlet.
      if (collapsed && !window.matchMedia(DRAWER_QUERY).matches) writeSideMenuCollapsed(false);
    }
    setModulesOpen(next);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function toggleCollapsed() {
    if (window.matchMedia(DRAWER_QUERY).matches) {
      setDrawerOpen(false);
      return;
    }
    writeSideMenuCollapsed(!collapsed);
  }

  // Bildirim zili tek yerde: sol menünün alt bölümü (iç sayfalarla aynı). Araç satırına gelen zil (page.tsx) burada
  // menüye taşınır — sayfada ikinci zil oluşmaz; diğer araçlar (dil, ayarlar, çıkış) aynen kalır.
  const toolItems = isValidElement<{ children?: ReactNode }>(tools) ? Children.toArray(tools.props.children) : [tools];
  const bell = toolItems.find((c) => isValidElement(c) && c.type === NotificationBell) ?? null;
  const otherTools = toolItems.filter((c) => c !== bell);

  return (
    <div
      className={`${styles.shell} ${collapsed ? styles.collapsed : ""}`}
      data-testid="home-premium-shell"
    >
      {/* Tek sol menü (components/layout/side-menu) — iç sayfalarla aynı bileşen. */}
      <SideMenu
        id="home-side"
        variant="home"
        collapsed={collapsed}
        drawerOpen={drawerOpen}
        hidden={narrow && !drawerOpen}
        groups={moduleGroups}
        modulesOpen={modulesOpen}
        onToggleModules={toggleModules}
        onCloseModules={() => setModulesOpen(false)}
        showClients={showClients}
        isAdmin={isAdmin}
        adminNavLoading={adminNavLoading}
        onAdminNav={onAdminNav}
        toggleLabel={collapsed ? t("menuExpand") : t("menuCollapse")}
        onToggle={toggleCollapsed}
        onNavigate={() => setDrawerOpen(false)}
        scrim={drawerOpen ? "home" : "none"}
        onScrimClick={() => setDrawerOpen(false)}
        bell={bell}
      />

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
          <div className={styles.tools}>{otherTools}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
