"use client";

/**
 * KİŞİSEL DİJİTAL OFİS (P4) — uzman logosu ve güvenli yerleşim bölgeleri.
 *
 * Owner kuralları (P0 son kabul, Revizyon 1–2):
 *  - Sol menüdeki Yaşam Sistemi logosu sabittir; bu bileşen ona dokunmaz, onun üstüne çizilemez (bölgeler yalnız içerik
 *    alanındadır: karşılama, C çerçevesi, üst şerit, modüller başlığı yanı, sağ sütun üstü, sayfa altı).
 *  - Logo bölgenin içinde serbest; oran korunur; karşılama metnini ve diğer içerikleri örtmez.
 *  - Sığmazsa küçülür (uzun kenar ≥ 36 px); yine sığmazsa başka bölgeye OTOMATİK taşınmaz → son geçerli konum + sarı uyarı
 *    (uyarı yalnız düzenlemede görünür).
 *  - Masaüstü (> 640 px) ve mobil (≤ 640 px) yerleşimleri ayrı saklanır.
 * Görsel yalnız `assetSrc` (sunucu varlık kimliği → blob: URL) ile gelir; tasarımdaki metinden URL kurulmaz.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  PLATE_PAD, ZONE_PAD, inflate, isHistoryHead, modeForWidth, moveBox, nudgePlacement, placementFromBox, pushHistory,
  resizeBox, resolveLogo, solveLogo, zoneRect,
  type LogoBox, type PlacementMode, type Rect, type ZoneGeometry,
} from "@/lib/workspace/logoPlacement";
import type { LogoPlacement, WorkspaceDesign } from "@/lib/workspace/schema";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { usePwText } from "./i18n";
import styles from "./personal.module.css";

export type LogoZoneKey = LogoPlacement["zone"];

/* ── Paylaşılan yerleşim deposu (sayfa başına tek): bölge ölçüleri, logo oranları, son geçerli konumlar ── */
type Store = {
  version: number;
  geo: Map<LogoZoneKey, ZoneGeometry>;
  aspect: Map<string, number>;
  history: Record<PlacementMode, LogoPlacement[]>;
  listeners: Set<() => void>;
};
const store: Store = { version: 0, geo: new Map(), aspect: new Map(), history: { desktop: [], mobile: [] }, listeners: new Set() };
function bump() {
  store.version++;
  store.listeners.forEach((l) => l());
}
function subscribeStore(l: () => void) {
  store.listeners.add(l);
  return () => { store.listeners.delete(l); };
}
const getVersion = () => store.version;
const sameRect = (a: Rect, b: Rect) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
function setGeometry(zone: LogoZoneKey, g: ZoneGeometry | null) {
  const cur = store.geo.get(zone);
  if (!g) {
    if (cur) { store.geo.delete(zone); bump(); }
    return;
  }
  if (cur && sameRect(cur.zone, g.zone) && cur.obstacles.length === g.obstacles.length && cur.obstacles.every((o, i) => sameRect(o, g.obstacles[i]))) return;
  store.geo.set(zone, g);
  bump();
}

/* ── Ekran modu (≤ 640 px mobil) ── */
const MOBILE_QUERY = "(max-width: 640px)";
function subscribeMode(l: () => void) {
  const mq = window.matchMedia(MOBILE_QUERY);
  mq.addEventListener("change", l);
  return () => mq.removeEventListener("change", l);
}
const readMode = (): PlacementMode => (window.matchMedia(MOBILE_QUERY).matches ? "mobile" : modeForWidth(window.innerWidth));
function useMode(): PlacementMode {
  return useSyncExternalStore(subscribeMode, readMode, () => "desktop");
}

/** Sağ sütun üstü / sayfa altı yuvaları yalnız kullanıldığında yer kaplar; ölçü için sabit yükseklikleri. */
const SLOT_HEIGHT: Partial<Record<LogoZoneKey, { desktop: number; mobile: number }>> = {
  rightTop: { desktop: 150, mobile: 110 },
  footer: { desktop: 132, mobile: 110 },
};

/** Logo görselinin doğal oranı (blob URL başına bir kez ölçülür). */
function useAspect(src: string | null): number | null {
  useSyncExternalStore(subscribeStore, getVersion, getVersion);
  useEffect(() => {
    if (!src || store.aspect.has(src)) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) { store.aspect.set(src, img.naturalWidth / img.naturalHeight); bump(); }
    };
    img.src = src;
    return () => { img.onload = null; };
  }, [src]);
  return src ? store.aspect.get(src) ?? null : null;
}

/* ── Logo görseli + plaket ── */
export function PersonalLogo({ src, plate, box, editable, label, className, children, ...handlers }: {
  src: string;
  plate: WorkspaceDesign["logo"]["plate"];
  box: LogoBox;
  editable?: boolean;
  label: string;
  className?: string;
  children?: ReactNode;
  onPointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLDivElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const plateCls = plate === "cam" ? styles.plateCam : plate === "beyaz" ? styles.plateBeyaz : styles.plateYok;
  return (
    <div
      className={`${styles.flogo} ${plateCls} ${editable ? styles.flogoEdit : ""} ${className ?? ""}`}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      role="img"
      aria-label={label}
      tabIndex={editable ? 0 : undefined}
      data-pw-logo={plate}
      {...handlers}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} data-pw-logo="" />
      {children}
    </div>
  );
}

type Drag = { id: number; sx: number; sy: number; start: Rect; handle: "nw" | "ne" | "sw" | "se" | null; zb: Rect; aspect: number; pad: number };

/**
 * Güvenli yerleşim bölgesi. Sayfa her bölge konumuna bir tane koyar (`zone`). Logo yalnız çözümün seçtiği bölgede çizilir.
 * Düzenlemede (`editable`) sürükle, köşeden boyutlandır (oran korunur), klavye (oklar / + − / Esc); değişiklik
 * `onChange(mode, placement)` ile yalnız o ekran modunun yerleşimine yazılır (çağıran pw.updateWorking çağırır).
 */
export function LogoZone({ zone, design, assetSrc, editable = false, onChange, className }: {
  zone: LogoZoneKey;
  design: WorkspaceDesign;
  assetSrc: PersonalWorkspace["assetSrc"];
  editable?: boolean;
  onChange?: (mode: PlacementMode, placement: LogoPlacement) => void;
  className?: string;
}) {
  const tx = usePwText();
  const mode = useMode();
  const ref = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragBox, setDragBox] = useState<Rect | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useSyncExternalStore(subscribeStore, getVersion, getVersion);

  const logo = design.logo;
  const active = logo.visible && !!logo.assetId;
  const src = active ? assetSrc(logo.assetId, mode === "mobile" ? "mobile" : "desktop") ?? assetSrc(logo.assetId, "desktop") : null;
  const aspect = useAspect(src);
  const requested = logo.layout[mode];
  const pad = PLATE_PAD[logo.plate] ?? 0;
  const zonePad = ZONE_PAD[zone];
  const slot = SLOT_HEIGHT[zone];

  // Ölçüm: bölge kutusu + aynı kapsayıcıdaki [data-pw-obstacle] engelleri (ResizeObserver + içerik değişimi).
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const host = el.parentElement;
    const measure = () => {
      const hidden = getComputedStyle(el).display === "none";
      // Kullanılmayan yuva (sağ sütun üstü / sayfa altı) yer kaplamaz; ölçüsü kapsayıcı genişliği + sabit yükseklikten.
      const w = hidden ? (slot && host && host.offsetParent !== null ? host.clientWidth : 0) : el.clientWidth;
      const h = slot ? Math.max(hidden ? 0 : el.clientHeight, window.matchMedia(MOBILE_QUERY).matches ? slot.mobile : slot.desktop) : el.clientHeight;
      if (w <= 0 || h <= 0) { setGeometry(zone, null); return; }
      const zr = el.getBoundingClientRect();
      const obstacles: Rect[] = [];
      host?.querySelectorAll<HTMLElement>("[data-pw-obstacle]").forEach((o) => {
        const r = o.getBoundingClientRect();
        if (r.width && r.height) obstacles.push(inflate({ x: r.left - zr.left, y: r.top - zr.top, w: r.width, h: r.height }));
      });
      setGeometry(zone, { zone: zoneRect(w, h, zonePad), obstacles });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (host) {
      ro.observe(host);
      host.querySelectorAll("[data-pw-obstacle]").forEach((o) => ro.observe(o));
    }
    const mo = host ? new MutationObserver(measure) : null;
    mo?.observe(host!, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", measure);
      setGeometry(zone, null);
    };
  }, [active, zone, zonePad, slot, mode, requested.zone]);

  const result = active && aspect
    ? resolveLogo({ placement: requested, history: store.history[mode], aspect, pad, geometry: (z) => store.geo.get(z) })
    : null;
  const mine = result && result.status !== "nofit" && result.used.zone === zone ? result : null;

  // Gerçekten sığan istenen yerleşim "son geçerli konum" olarak kaydedilir (yalnız çizen bölge; aynı kayıt tekrar edilmez).
  const okToRecord = mine?.status === "ok";
  useEffect(() => {
    if (!okToRecord) return;
    const h = store.history[mode];
    if (!isHistoryHead(h, requested)) { store.history[mode] = pushHistory(h, requested); bump(); }
  }, [okToRecord, mode, requested]);

  if (!active) return null;

  const isRequested = requested.zone === zone;
  const used = !!mine;
  const showWarn = editable && isRequested && result !== null && result.status !== "ok";
  const warnText = result?.status === "kept" ? tx("logoKept") : tx("logoNoFit");
  const geo = store.geo.get(zone);

  const commit = (next: LogoPlacement): boolean => {
    if (!onChange || !aspect || !geo) return false;
    const r = solveLogo({ placement: next, aspect, pad, zone: geo.zone, obstacles: geo.obstacles });
    if (!r.fit) { setNotice(tx("logoRejected")); return false; }
    setNotice(null);
    onChange(mode, next);
    return true;
  };

  const box = mine ? (dragBox ? { left: dragBox.x, top: dragBox.y, width: dragBox.w, height: dragBox.h } : mine.box) : null;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || !mine || !aspect || !geo || e.button > 0) return;
    e.preventDefault();
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-pw-handle]")?.dataset.pwHandle as Drag["handle"] | undefined;
    dragRef.current = {
      id: e.pointerId, sx: e.clientX, sy: e.clientY, handle: h ?? null, zb: geo.zone, aspect, pad,
      start: { x: mine.box.left, y: mine.box.top, w: mine.box.width, h: mine.box.height },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    setDragBox(d.handle ? resizeBox(d.start, d.handle, dx, dy, d.zb, d.aspect, d.pad) : moveBox(d.start, dx, dy, d.zb));
  };
  const finish = (e: PointerEvent<HTMLDivElement>, cancel: boolean) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    const b = dragBox;
    setDragBox(null);
    if (cancel || !b) return;
    if (b.x === d.start.x && b.y === d.start.y && b.w === d.start.w) return;
    commit(placementFromBox(zone, b, d.zb, d.aspect, d.pad));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => finish(e, false);
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => finish(e, true);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !mine) return;
    if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); return; }
    // Klavye her zaman ekranda görünen (çözülmüş) yerleşimden başlar.
    const next = nudgePlacement(mine.used, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    commit({ ...next, zone: mine.used.zone });
  };

  const zoneCls = [
    styles.zone,
    styles[`zone_${zone}`],
    used ? styles.zoneUsed : "",
    className ?? "",
  ].join(" ");

  return (
    <div
      ref={ref}
      className={zoneCls}
      data-pw-zone={zone}
      data-requested={isRequested ? "1" : undefined}
      data-used={used ? "1" : undefined}
      data-editing={editable ? "1" : undefined}
    >
      {editable ? <span className={styles.zLabel}>{tx(`zone_${zone}`)}</span> : null}
      {mine && box && src ? (
        <PersonalLogo
          src={src}
          plate={logo.plate}
          box={box}
          editable={editable}
          label={editable ? tx("logoEditLabel") : tx("logoLabel")}
          className={dragBox ? styles.flogoDragging : ""}
          onPointerDown={editable ? onPointerDown : undefined}
          onPointerMove={editable ? onPointerMove : undefined}
          onPointerUp={editable ? onPointerUp : undefined}
          onPointerCancel={editable ? onPointerCancel : undefined}
          onKeyDown={editable ? onKeyDown : undefined}
        >
          {editable ? (
            <>
              <span className={`${styles.fh} ${styles.fhNw}`} data-pw-handle="nw" aria-hidden />
              <span className={`${styles.fh} ${styles.fhNe}`} data-pw-handle="ne" aria-hidden />
              <span className={`${styles.fh} ${styles.fhSw}`} data-pw-handle="sw" aria-hidden />
              <span className={`${styles.fh} ${styles.fhSe}`} data-pw-handle="se" aria-hidden />
            </>
          ) : null}
        </PersonalLogo>
      ) : null}
      {editable && (showWarn || (notice && used)) ? (
        <p className={styles.zoneWarn} role="status">{notice && used ? notice : warnText}</p>
      ) : null}
    </div>
  );
}
