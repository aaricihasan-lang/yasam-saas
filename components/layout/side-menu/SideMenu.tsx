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
 *   - variant "app": iç sayfalarda sabit (fixed) kart; ana sayfayla AYNI konum, ölçü ve davranış: >900px kalıcı menü
 *     (ortak daraltma tercihi), ≤900px çekmece (2026-10-25 owner düzeltmesi: şerit / üstte açılan panel / karartma yok).
 * Bildirim zili (mevcut NotificationBell) menünün alt bölümünde — ana sayfa ve iç sayfalarda tek zil.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, ChevronsLeft, LayoutGrid, Loader2, Lock, Settings, Shield, UserRound } from "lucide-react";
import { premiumFontVars } from "@/app/_premium/fonts";
import type { HomeNavGroup } from "@/app/_premium/home/homeModuleNav";
import styles from "./sideMenu.module.css";

/**
 * Daraltma durumu (2026-11-23 owner kararı): ana sayfa ve iç sayfalar aynı durumu paylaşır, ancak durum bulunulan ANA
 * MODÜLE bağlıdır ve yalnız bu sekmede (sessionStorage) tutulur:
 *   - ana sayfaya gelişte genişletilmiş, bir modüle (ya da başka bir ana modüle) gelişte daraltılmış başlar;
 *   - aynı modülün alt sayfalarında ve sayfa yenilemesinde uzmanın elle seçtiği durum korunur.
 * Varsayılan yalnız okumadan türetilir (yazmadan), bu yüzden geçişte ara çizimde açılıp kapanma olmaz.
 */
export const SIDE_MENU_COLLAPSE_KEY = "ys-side-menu-state";
export const SIDE_MENU_COLLAPSE_EVENT = "ys-home-side-collapsed-change";
export const SIDE_MENU_HOME_SCOPE = "home";

/** Aynı ana modüle ait olup farklı adres önekiyle açılan sayfalar (menü grupları / merkez bağlantılarıyla aynı). */
const SIDE_MENU_SCOPE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["/dashboard/clients", "danisan-yolculugu"],
  ["/dashboard/ajanda", "danisan-yolculugu"],
  ["/dashboard/refleksoloji", "refleksoloji"],
  ["/admin/astroloji", "astroloji"],
  ["/numeroloji-merkezi", "numeroloji"],
  ["/numeroloji-klasik", "numeroloji"],
  ["/numeroloji-karsilastirma", "numeroloji"],
  ["/sifa-rehberi-v2", "sifa-rehberi"],
];

/** Adresin ana modülü: ana sayfa "home"; diğerleri ilk adres parçası (/dashboard/<x> için iki parça). */
export function sideMenuScope(path: string): string {
  if (path === "/") return SIDE_MENU_HOME_SCOPE;
  for (const [prefix, scope] of SIDE_MENU_SCOPE_ALIASES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return scope;
  }
  const [first = "", second] = path.split("/").filter(Boolean);
  return first === "dashboard" && second ? `dashboard/${second}` : first;
}

const defaultCollapsed = (scope: string): boolean => scope !== SIDE_MENU_HOME_SCOPE;

function readSideMenuState(): { scope: string; collapsed: boolean } | null {
  try {
    const raw = window.sessionStorage.getItem(SIDE_MENU_COLLAPSE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const { scope, collapsed } = parsed as { scope?: unknown; collapsed?: unknown };
      if (typeof scope === "string" && typeof collapsed === "boolean") return { scope, collapsed };
    }
  } catch {
    /* depolama yoksa / bozuksa varsayılan */
  }
  return null;
}

function storeSideMenuState(scope: string, collapsed: boolean): void {
  try {
    window.sessionStorage.setItem(SIDE_MENU_COLLAPSE_KEY, JSON.stringify({ scope, collapsed }));
  } catch {
    /* depolama yoksa durum yalnız bu çizimde */
  }
}

export function readSideMenuCollapsed(scope: string): boolean {
  const state = readSideMenuState();
  return state && state.scope === scope ? state.collapsed : defaultCollapsed(scope);
}

export function writeSideMenuCollapsed(scope: string, value: boolean): void {
  storeSideMenuState(scope, value);
  window.dispatchEvent(new Event(SIDE_MENU_COLLAPSE_EVENT));
}

export function subscribeSideMenuCollapsed(onChange: () => void) {
  window.addEventListener(SIDE_MENU_COLLAPSE_EVENT, onChange);
  return () => window.removeEventListener(SIDE_MENU_COLLAPSE_EVENT, onChange);
}

/**
 * Ana sayfa (HomeShell) ve iç sayfalar (QuickNavShell) için tek daraltma kaynağı. Sunucu çizimi de modülün
 * varsayılanını kullanır (modül sayfası yenilenince önce açık çizilip sonra daralmaz).
 */
export function useSideMenuCollapsed(): readonly [boolean, (value: boolean) => void] {
  const scope = sideMenuScope(usePathname() ?? "/");
  const collapsed = useSyncExternalStore(
    subscribeSideMenuCollapsed,
    () => readSideMenuCollapsed(scope),
    () => defaultCollapsed(scope),
  );
  // Yeni ana modüle gelindi: varsayılan sabitlenir (görünen değer zaten bu; olay gerekmez). Aynı modülde dokunulmaz.
  useEffect(() => {
    if (readSideMenuState()?.scope !== scope) storeSideMenuState(scope, defaultCollapsed(scope));
  }, [scope]);
  const setCollapsed = useCallback((value: boolean) => writeSideMenuCollapsed(scope, value), [scope]);
  return [collapsed, setCollapsed] as const;
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
  /** Yarı saydam örtü (yalnız tablet / mobil çekmece) — tıklanınca kapanır. */
  scrim: "none" | "home" | "drawer";
  /** Bildirim zili (mevcut NotificationBell) — menünün alt bölümünde. */
  bell?: ReactNode;
  /** Owner bildirim zili (yalnız platform owner'ı; diğerlerinde kendini çizmez → satır gizlenir). */
  ownerBell?: ReactNode;
  onScrimClick: () => void;
  /** İç sayfalarda logo ana sayfaya döner. */
  logoHref?: string;
  logoTitle?: string;
  active?: SideMenuActive | null;
  asideRef?: Ref<HTMLElement>;
  /**
   * Yalnız ana sayfa (Kişisel Dijital Ofis, KDO-05): menünün alt boş alanına konan uzman logosu katmanı. Verilmezse
   * (iç sayfalar) alt alan bugünkü hâliyle birebir aynıdır. Süs yaprağı ve alıntı değişmez; logo onları örtmez.
   */
  footSlot?: ReactNode;
  /** ÜYE PASİFLEŞTİRME F5: kilitli (locked) merkeze tıklanınca — modül açılmaz, çağıran kibar uyarı gösterir. */
  onLockedClick?: () => void;
};

export default function SideMenu({
  id,
  variant,
  collapsed,
  drawerOpen,
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
  bell,
  ownerBell,
  footSlot,
  onLockedClick,
}: SideMenuProps) {
  const t = useTranslations("home.premium");
  const locale = useLocale();
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
    collapsed ? styles.collapsed : "",
    drawerOpen ? styles.drawerOpen : "",
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
            aria-expanded={drawerOpen || !collapsed}
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
                        <li key={group.key} className={styles.modGroup} data-locked={group.locked ? "1" : undefined}>
                          {group.locked ? (
                            <button
                              type="button"
                              className={`${styles.modGroupTitle} ${styles.modGroupLocked}`}
                              aria-disabled="true"
                              onClick={() => onLockedClick?.()}
                            >
                              {group.label}
                              <Lock className={`${styles.modLockIcon} h-3.5 w-3.5`} strokeWidth={2.2} aria-label="Kilitli" />
                            </button>
                          ) : group.href ? (
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
        {bell ? (
          // Zil kendi düğmesini, okunmamış rozetini ve panelini çizer; zilin gizlendiği adreslerde satır da gizlenir (CSS :has).
          <div className={styles.bellRow}>
            <span className={styles.bellSlot}>{bell}</span>
            <span className={styles.menuLabel}>{locale === "en" ? "Notifications" : "Bildirimler"}</span>
          </div>
        ) : null}
        {ownerBell ? (
          // Owner bildirim zili ayrı satırda ("Yönetim"); owner değilse düğme çizilmez ve satır CSS :has ile gizlenir.
          <div className={styles.bellRow} data-owner-bell-row>
            <span className={styles.bellSlot}>{ownerBell}</span>
            <span className={styles.menuLabel}>{locale === "en" ? "Admin" : "Yönetim"}</span>
          </div>
        ) : null}
        {/* footSlot yoksa (iç sayfalar) birebir eski hâli; varsa yalnız süsler gizli, logo katmanı erişilebilir kalır. */}
        <div className={styles.sideFoot} aria-hidden={footSlot ? undefined : true}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.sideLeaf} src="/premium/ana-sayfa/yaprak.webp" width={200} height={250} alt="" aria-hidden={footSlot ? true : undefined} />
          <p className={styles.sideQuote} aria-hidden={footSlot ? true : undefined} data-pw-protect={footSlot ? "" : undefined}>
            {t("sideQuote")
              .split("|")
              .map((line) => (
                <span key={line}>{line}</span>
              ))}
          </p>
          {footSlot}
        </div>
      </aside>
      {scrim !== "none" ? (
        <div
          className={`${styles.scrim} ${scrim === "home" ? styles.scrimHome : styles.scrimDrawer}`}
          onClick={onScrimClick}
          aria-hidden
        />
      ) : null}
    </>
  );
}
