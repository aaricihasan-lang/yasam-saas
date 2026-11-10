"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ElementType, type KeyboardEvent } from "react";
import { Archive, ChevronDown, MoreHorizontal } from "lucide-react";

export type SettingsTabDef<T extends string> = { id: T; label: string; icon: ElementType };

type Props<T extends string> = {
  tabs: readonly SettingsTabDef<T>[];
  active: T;
  onSelect: (id: T) => void;
};

/** Tek açılır menüde toplanan veri sekmeleri (sıraları korunur). */
const GROUP_IDS: readonly string[] = ["export", "backup", "restore"];
const GROUP_LABEL = "Yedek & Aktarım";
const MORE_LABEL = "Diğer";
const GAP = 6; // gap-1.5
const LG_QUERY = "(min-width: 1024px)";

type Item<T extends string> =
  | { kind: "tab"; key: string; tab: SettingsTabDef<T> }
  | { kind: "group"; key: string; label: string; tabs: SettingsTabDef<T>[] };
type Section<T extends string> = { heading?: string; tabs: SettingsTabDef<T>[] };

const subscribeLg = (cb: () => void) => {
  const mq = window.matchMedia(LG_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const readLg = () => window.matchMedia(LG_QUERY).matches;
const readLgServer = () => false;

const BASE =
  "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-bold transition-all duration-200 md:text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-1";
const tone = (on: boolean) =>
  on ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md" : "text-slate-500 hover:bg-violet-50 hover:text-violet-700";
const LAST_ODD = "col-span-2 mx-auto w-1/2 md:col-span-1 md:mx-0 md:w-auto";

/**
 * Ayarlar sekme çubuğu — ALTERNATİF B (gruplanmış + açılır menü). Hiçbir genişlikte kaydırma / alt satıra kayma yok.
 * - Dışa Aktarım · Sistem Yedeği · Geri Yükleme tek "Yedek & Aktarım" menüsünde; üst düzey öğe sayısı eski ekranla aynı
 *   kalır (en çok 7).
 * - Mobil / tablet (< 1024 px): eski ızgara (2 sütun · md 3 sütun; tek kalan son öğe ortada).
 * - ≥ 1024 px: tek satır eşit genişlik (eski görünüm). Sığmayan SONDAKİ öğeler sırası korunarak "Diğer" menüsüne
 *   alınır (ölçülerek; sığıyorsa "Diğer" hiç görünmez).
 * Klavye: menü düğmesinde Enter/Space/↓ açar ve seçili (yoksa ilk) öğeye odaklanır; menüde ↑/↓/Home/End, Esc kapatır ve
 * odağı düğmeye döndürür; dışarı tıklama / odak çıkışı kapatır.
 */
export function SettingsTabBar<T extends string>({ tabs, active, onSelect }: Props<T>) {
  const grouped = tabs.filter((t) => GROUP_IDS.includes(t.id));
  const useGroup = grouped.length >= 2;
  const items: Item<T>[] = [];
  for (const t of tabs) {
    if (useGroup && GROUP_IDS.includes(t.id)) {
      if (!items.some((i) => i.kind === "group")) items.push({ kind: "group", key: "group-data", label: GROUP_LABEL, tabs: grouped });
    } else items.push({ kind: "tab", key: t.id, tab: t });
  }

  const isLg = useSyncExternalStore(subscribeLg, readLg, readLgServer);
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<number>(items.length);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const recompute = useCallback(() => {
    const row = rowRef.current;
    const m = measureRef.current;
    if (!row || !m) return;
    const cs = getComputedStyle(row);
    const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ws = Array.from(m.children).map((c) => (c as HTMLElement).offsetWidth);
    const more = ws.pop() ?? 0;
    const total = ws.reduce((s, w) => s + w, 0) + GAP * Math.max(0, ws.length - 1);
    let k = ws.length;
    if (total > avail) {
      k = 0;
      let used = more;
      while (k < ws.length && used + ws[k] + GAP <= avail) { used += ws[k] + GAP; k++; }
      k = Math.max(1, k);
    }
    setFit((p) => (p === k ? p : k));
  }, []);

  useEffect(() => {
    if (!isLg) return;
    const row = rowRef.current;
    if (!row) return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(row);
    if (measureRef.current) ro.observe(measureRef.current);
    void document.fonts?.ready.then(() => recompute());
    return () => ro.disconnect();
  }, [isLg, items.length, recompute]);

  // Menü dışına tıklama / pencere boyutu → kapat.
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: PointerEvent) => {
      const el = document.querySelector(`[data-settings-menu-key="${openKey}"]`);
      if (el && !el.contains(e.target as Node)) setOpenKey(null);
    };
    const onResize = () => setOpenKey(null);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, [openKey]);

  const k = isLg ? Math.min(fit, items.length) : items.length;
  const shown = items.slice(0, k);
  const overflow = items.slice(k);
  const lastOdd = !isLg && shown.length % 2 === 1;

  const tabButton = (t: SettingsTabDef<T>, extra: string) => {
    const Icon = t.icon;
    const on = active === t.id;
    return (
      <button
        key={t.id}
        type="button"
        aria-pressed={on}
        data-settings-tab={t.id}
        onClick={() => onSelect(t.id)}
        className={[BASE, "justify-center lg:flex-1", extra, tone(on)].filter(Boolean).join(" ")}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        {t.label}
      </button>
    );
  };

  return (
    <div className="mb-5">
      <div
        ref={rowRef}
        data-settings-tabbar="group"
        className="relative grid grid-cols-2 gap-1.5 rounded-2xl border border-white/80 bg-white/70 p-2 shadow-md backdrop-blur-xl md:grid-cols-3 lg:flex lg:gap-1.5"
      >
        {shown.map((it, idx) => {
          const extra = lastOdd && idx === shown.length - 1 ? LAST_ODD : "";
          if (it.kind === "tab") return tabButton(it.tab, extra);
          return (
            <Menu
              key={it.key}
              menuKey={it.key}
              label={it.label}
              icon={Archive}
              sections={[{ tabs: it.tabs }]}
              active={active}
              onSelect={onSelect}
              open={openKey === it.key}
              setOpen={(o) => setOpenKey(o ? it.key : null)}
              extra={extra}
            />
          );
        })}
        {overflow.length > 0 && (
          <Menu
            menuKey="more"
            label={MORE_LABEL}
            icon={MoreHorizontal}
            sections={overflow.map((it) => (it.kind === "tab" ? { tabs: [it.tab] } : { heading: it.label, tabs: it.tabs }))}
            active={active}
            onSelect={onSelect}
            open={openKey === "more"}
            setOpen={(o) => setOpenKey(o ? "more" : null)}
            extra=""
            alignRight
          />
        )}

        {/* Ölçüm satırı (görünmez): öğelerin doğal genişlikleri + "Diğer" düğmesi. */}
        {isLg && (
          <div ref={measureRef} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1.5">
            {items.map((it) => {
              const Icon = it.kind === "tab" ? it.tab.icon : Archive;
              return (
                <span key={it.key} className={`${BASE} shrink-0`}>
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                  {it.kind === "tab" ? it.tab.label : it.label}
                  {it.kind === "group" && <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                </span>
              );
            })}
            <span className={`${BASE} shrink-0`}>
              <MoreHorizontal className="h-4 w-4 shrink-0" strokeWidth={2} />
              {MORE_LABEL}
              <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Menu<T extends string>(props: {
  menuKey: string;
  label: string;
  icon: ElementType;
  sections: Section<T>[];
  active: T;
  onSelect: (id: T) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  extra: string;
  alignRight?: boolean;
}) {
  const { menuKey, label, icon: Icon, sections, active, onSelect, open, setOpen, extra, alignRight } = props;
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [right, setRight] = useState(!!alignRight);
  const on = sections.some((s) => s.tabs.some((t) => t.id === active));

  const buttons = () => Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>("[data-settings-tab]") ?? []);
  const openPanel = (focus: "none" | "first" | "last") => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (r) setRight(!!alignRight || r.left + 240 > window.innerWidth - 8);
    setOpen(true);
    if (focus === "none") return;
    requestAnimationFrame(() => {
      const b = buttons();
      const cur = b.find((x) => x.getAttribute("aria-pressed") === "true");
      (focus === "last" ? b[b.length - 1] : cur ?? b[0])?.focus();
    });
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) toggleRef.current?.focus();
  };
  const onToggleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); openPanel("first"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); openPanel("last"); }
    else if (e.key === "Escape" && open) { e.preventDefault(); close(true); }
  };
  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const b = buttons();
    const i = b.indexOf(e.target as HTMLButtonElement);
    const n = b.length;
    e.preventDefault();
    const next = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n;
    b[next]?.focus();
  };

  return (
    <div
      ref={wrapRef}
      data-settings-menu-key={menuKey}
      className={["relative lg:flex-1", extra].filter(Boolean).join(" ")}
      onBlur={(e) => { if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    >
      <button
        ref={toggleRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-settings-tab-group={menuKey}
        // Enter/Space (klavye tıklaması, detail 0) açınca odak menüye geçer; fare tıklaması odağı düğmede bırakır.
        onClick={(e) => (open ? close(false) : openPanel(e.detail === 0 ? "first" : "none"))}
        onKeyDown={onToggleKey}
        className={[BASE, "w-full justify-center", tone(on)].join(" ")}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.5} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        onKeyDown={onPanelKey}
        className={[
          "absolute top-full z-30 mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-white/80 bg-white/95 p-1.5",
          "shadow-[0_12px_40px_rgba(88,28,135,0.18)] backdrop-blur-xl",
          right ? "right-0" : "left-0",
        ].join(" ")}
      >
        {sections.map((s, si) => (
          <div key={si} className={si > 0 && s.heading ? "mt-1 border-t border-slate-100 pt-1" : ""}>
            {s.heading && <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{s.heading}</p>}
            <div className="flex flex-col gap-1">
              {s.tabs.map((t) => {
                const TIcon = t.icon;
                const sel = active === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={sel}
                    data-settings-tab={t.id}
                    onClick={() => { onSelect(t.id); close(true); }}
                    className={[BASE, "w-full justify-start", tone(sel)].join(" ")}
                  >
                    <TIcon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
