"use client";

/**
 * KİŞİSEL DİJİTAL OFİS — uzman logosu "Serbest Yerleştir" (KDO-05, Owner son kararı 2026-11-02).
 *
 * İki çerçeve vardır; her biri sayfada bir `FreeLogoLayer` ile temsil edilir (çerçevenin tamamını kaplayan, tıklamayı
 * geçiren mutlak katman):
 *   - "page": ana sayfa içerik alanı (HomeShell .main → üst araç satırı + karşılama + modüller + sağ sütun)
 *   - "side": sol menünün alt boş alanı (SideMenu .sideFoot). Yaşam Sistemi logosu, adı, menü ve zil bu alanın DIŞINDADIR.
 * Kurallar (lib/workspace/logoPlacement → solveFreeLogo / isFreeBoxValid):
 *   - Korunan öğeler (engeller): karşılama metni, bağlantılar, düğmeler, form öğeleri, başlıklar, modül kartları, sağ sütun
 *     panelleri, sol menü alıntısı. Logo bunları ve çerçeve dışını ASLA örtmez; yatay kaydırma oluşmaz.
 *   - Sürükleme sırasında bırakma noktası canlı doğrulanır (yeşil / kırmızı çerçeve). Geçersiz noktaya bırakılırsa kabul
 *     edilmez, uyarı gösterilir ve logo son geçerli konumunda kalır.
 *   - Klavye (oklar, Shift ile büyük adım, + / −) ve Kişiselleştirme panelindeki düğmeler (pw-logo-nudge olayı) aynı
 *     doğrulamadan geçer. Dokunmatik ekranda parmakla taşınır (touch-action: none).
 *   - Masaüstü (> 640 px) ve mobil (≤ 640 px) konumları ayrı saklanır; her biri kendi ekran genişliğinde çözülür.
 * Görsel yalnız `assetSrc` (sunucu varlık kimliği → blob: URL) ile gelir.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  PLATE_PAD, freeInner, freePlacementFromBox, inflate, isFreeBoxValid, nudgeFreeBox, resizeBox, solveFreeLogo,
  type LogoBox, type PlacementMode, type Rect,
} from "@/lib/workspace/logoPlacement";
import type { FreeLogoZone } from "@/lib/workspace/catalog";
import type { LogoPlacement, WorkspaceDesign } from "@/lib/workspace/schema";
import type { PersonalWorkspace } from "./usePersonalWorkspace";
import { PersonalLogo, useAspect, useMode } from "./PersonalLogo";
import { usePwText } from "./i18n";
import styles from "./personal.module.css";

/** Korunan öğeler: logo bunların üstüne bırakılamaz. */
const OBSTACLE_SELECTOR = [
  "[data-pw-obstacle]", "a[href]", "button", "input", "select", "textarea", "[role='button']", "[role='menu']",
  "h1", "h2", "h3", "[data-testid='home-hub-grid'] > *", "[data-pw-part='content'] > aside > section",
  // Eski bölge logosu engel DEĞİLDİR: aynı ekran modunda serbest logoyla birlikte çizilmez; dönüşüm karesinde engel sayılırsa
  // yeni logo kendi eski kutusundan kaçıp kayardı.
  "[data-pw-protect]",
].join(",");

/* ── Çerçeve kaydı (sürükleme sırasında hedef çerçeveyi bulmak için) ── */
type FrameEntry = { el: HTMLDivElement; measure: () => FrameGeo | null };
const frames = new Map<FreeLogoZone, FrameEntry>();
type FrameGeo = { w: number; h: number; obstacles: Rect[] };

/** Eski bölge kaydından devralınan, hâlâ basılı işaretçi (LogoZone → onConvert). */
let pendingGrab: { pointerId: number; clientX: number; clientY: number; at: number } | null = null;
export function setPendingGrab(g: { pointerId: number; clientX: number; clientY: number } | null) {
  pendingGrab = g ? { ...g, at: Date.now() } : null;
}

/** Bir çerçevenin ölçüsü + engelleri (çerçeve-yerel px). Logo katmanının kendi içi hariç. */
function measureFrame(layer: HTMLDivElement): FrameGeo | null {
  const host = layer.parentElement;
  const lr = layer.getBoundingClientRect();
  if (!host || lr.width < 1 || lr.height < 1 || getComputedStyle(layer).visibility === "hidden") return null;
  const obstacles: Rect[] = [];
  host.querySelectorAll<HTMLElement>(OBSTACLE_SELECTOR).forEach((o) => {
    if (layer.contains(o)) return;
    const r = o.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (r.right < lr.left || r.left > lr.right || r.bottom < lr.top || r.top > lr.bottom) return;
    obstacles.push(inflate({ x: r.left - lr.left, y: r.top - lr.top, w: r.width, h: r.height }, 6));
  });
  return { w: lr.width, h: lr.height, obstacles };
}

/** Viewport noktası hangi çerçevede? Sol menü önceliklidir (sayfa çerçevesiyle kesişmez ama güvenli tarafta). */
function frameAt(x: number, y: number): FreeLogoZone | null {
  for (const z of ["side", "page"] as const) {
    const f = frames.get(z);
    if (!f) continue;
    const r = f.el.getBoundingClientRect();
    if (r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
  }
  return null;
}

type Drag = {
  id: number; sx: number; sy: number; handle: "nw" | "ne" | "sw" | "se" | null;
  /** Başlangıç kutusu (viewport px). */
  start: Rect; aspect: number; pad: number;
};
type Ghost = { box: Rect; zone: FreeLogoZone | null; valid: boolean };

export function FreeLogoLayer({ zone, design, assetSrc, editable = false, onChange }: {
  zone: FreeLogoZone;
  design: WorkspaceDesign;
  assetSrc: PersonalWorkspace["assetSrc"];
  editable?: boolean;
  onChange?: (mode: PlacementMode, placement: LogoPlacement) => void;
}) {
  const tx = usePwText();
  const mode = useMode();
  const layerRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<FrameGeo | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const portalReady = useSyncExternalStore(() => () => {}, () => true, () => false);

  const logo = design.logo;
  const placement = logo.layout[mode];
  const mine = logo.visible && !!logo.assetId && placement.zone === zone;
  const src = mine ? assetSrc(logo.assetId, mode === "mobile" ? "mobile" : "desktop") ?? assetSrc(logo.assetId, "desktop") : null;
  const aspect = useAspect(src);
  const pad = PLATE_PAD[logo.plate] ?? 0;

  // Çerçeve ölçümü: kaydol + boyut / içerik değişiminde yeniden ölç (rAF ile birleştirilir).
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      raf = 0;
      const g = measureFrame(el);
      setGeo((cur) => (sameGeo(cur, g) ? cur : g));
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(run); };
    const entry: FrameEntry = { el, measure: () => measureFrame(el) };
    frames.set(zone, entry);
    run();
    const host = el.parentElement;
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    if (host) ro.observe(host);
    const mo = host ? new MutationObserver(schedule) : null;
    mo?.observe(host!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-used"] });
    window.addEventListener("resize", schedule);
    const t = window.setTimeout(schedule, 600);
    return () => {
      if (frames.get(zone) === entry) frames.delete(zone);
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", schedule);
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [zone]);

  const result = useMemo(() => (mine && aspect && geo ? solveFreeLogo({ placement, aspect, pad, frame: geo, obstacles: geo.obstacles }) : null), [mine, aspect, geo, placement, pad]);
  const box: LogoBox | null = useMemo(() => (result && result.fit ? { left: result.left, top: result.top, width: result.width, height: result.height } : null), [result]);

  const flash = useCallback((m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice((cur) => (cur === m ? null : cur)), 3200);
  }, []);

  /** Sürükleme boyunca çerçeve ölçüleri önbellekte (her harekette DOM taranmaz); bırakmada taze ölçülür. */
  const dragGeo = useRef(new Map<FreeLogoZone, FrameGeo | null>());
  /** Viewport kutusunu hedef çerçevede doğrular; geçerliyse yerleşimi döndürür. */
  const evaluate = useCallback((vbox: Rect, pointer: { x: number; y: number } | null, fresh = true): { zone: FreeLogoZone | null; valid: boolean; placement: LogoPlacement | null } => {
    const target = pointer ? frameAt(pointer.x, pointer.y) : zone;
    if (!target) return { zone: null, valid: false, placement: null };
    const f = frames.get(target);
    let g: FrameGeo | null | undefined;
    if (fresh || !dragGeo.current.has(target)) {
      g = f?.measure();
      dragGeo.current.set(target, g ?? null);
    } else g = dragGeo.current.get(target);
    if (!f || !g) return { zone: target, valid: false, placement: null };
    const fr = f.el.getBoundingClientRect();
    const local: Rect = { x: vbox.x - fr.left, y: vbox.y - fr.top, w: vbox.w, h: vbox.h };
    const ok = isFreeBoxValid(local, freeInner(g.w, g.h), g.obstacles);
    return { zone: target, valid: ok, placement: ok ? freePlacementFromBox(target, local, g) : null };
  }, [zone]);

  const commit = useCallback((p: LogoPlacement | null): boolean => {
    if (!p || !onChange) { flash(tx("logoDropInvalid")); return false; }
    setNotice(null);
    onChange(mode, p);
    return true;
  }, [onChange, mode, flash, tx]);

  // ── Sürükleme (pencere dinleyicileri: çerçeveler arası taşıma + eski kayıttan devralma) ──
  const startDrag = useCallback((d: Drag) => {
    dragRef.current = d;
    dragGeo.current.clear();
    const move = (e: globalThis.PointerEvent) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.id) return;
      e.preventDefault();
      const dx = e.clientX - cur.sx;
      const dy = e.clientY - cur.sy;
      let vbox: Rect;
      let pointer: { x: number; y: number } | null;
      if (cur.handle) {
        // Boyutlandırma: aynı çerçevede, karşı köşe sabit, oran korunur.
        const fr = layerRef.current?.getBoundingClientRect();
        const g = geo;
        if (!fr || !g) return;
        const inner = freeInner(g.w, g.h);
        const startLocal: Rect = { ...cur.start, x: cur.start.x - fr.left, y: cur.start.y - fr.top };
        const rb = resizeBox(startLocal, cur.handle, dx, dy, inner, cur.aspect, cur.pad);
        vbox = { ...rb, x: rb.x + fr.left, y: rb.y + fr.top };
        pointer = null;
      } else {
        vbox = { ...cur.start, x: cur.start.x + dx, y: cur.start.y + dy };
        pointer = { x: e.clientX, y: e.clientY };
      }
      const ev = evaluate(vbox, pointer, false);
      const gh = { box: vbox, zone: ev.zone, valid: ev.valid };
      ghostRef.current = gh;
      setGhost(gh);
    };
    const end = (e: globalThis.PointerEvent, cancel: boolean) => {
      const cur = dragRef.current;
      if (!cur || e.pointerId !== cur.id) return;
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancelFn);
      const gh = ghostRef.current;
      ghostRef.current = null;
      setGhost(null);
      if (cancel || !gh) return;
      const moved = Math.abs(gh.box.x - cur.start.x) > 0.5 || Math.abs(gh.box.y - cur.start.y) > 0.5 || Math.abs(gh.box.w - cur.start.w) > 0.5;
      if (!moved) return;
      const ev = evaluate(gh.box, cur.handle ? null : { x: e.clientX, y: e.clientY });
      commit(ev.placement);
    };
    const up = (e: globalThis.PointerEvent) => end(e, false);
    const cancelFn = (e: globalThis.PointerEvent) => end(e, true);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancelFn);
  }, [evaluate, commit, geo]);

  // Eski bölge kaydından devralınan basılı işaretçi: logo bu çerçevede çizilince sürükleme kesintisiz başlar.
  useEffect(() => {
    if (!editable || !box || !aspect || !pendingGrab || Date.now() - pendingGrab.at > 4000) return;
    const fr = layerRef.current?.getBoundingClientRect();
    if (!fr) return;
    const g = pendingGrab;
    pendingGrab = null;
    startDrag({ id: g.pointerId, sx: g.clientX, sy: g.clientY, handle: null, aspect, pad, start: { x: box.left + fr.left, y: box.top + fr.top, w: box.width, h: box.height } });
  }, [editable, box, aspect, pad, startDrag]);

  // Panel düğmeleri (erişilebilir alternatif) → { key, shift } veya { toZone }.
  useEffect(() => {
    if (!editable || !mine) return;
    const onNudge = (ev: Event) => {
      const d = (ev as CustomEvent<{ key?: string; shift?: boolean; toZone?: FreeLogoZone; mode?: PlacementMode }>).detail ?? {};
      if (d.mode && d.mode !== mode) return;
      if (d.toZone && d.toZone !== zone) {
        const target = frames.get(d.toZone);
        const g = target?.measure();
        if (!target || !g || !aspect) { flash(tx("logoFrameMissing")); return; }
        const r = solveFreeLogo({ placement: { zone: d.toZone, x: 0.5, y: d.toZone === "side" ? Math.max(0, g.h * 0.25) : 96, w: placement.w }, aspect, pad, frame: g, obstacles: g.obstacles });
        if (!r.fit) { flash(tx("logoDropInvalid")); return; }
        commit(freePlacementFromBox(d.toZone, { x: r.left, y: r.top, w: r.width, h: r.height }, g));
        return;
      }
      if (!d.key || !box || !aspect || !geo) return;
      const nb = nudgeFreeBox({ x: box.left, y: box.top, w: box.width, h: box.height }, d.key, !!d.shift, aspect, pad);
      if (!nb) return;
      if (!isFreeBoxValid(nb, freeInner(geo.w, geo.h), geo.obstacles)) { flash(tx("logoDropInvalid")); return; }
      commit(freePlacementFromBox(zone, nb, geo));
    };
    window.addEventListener("pw-logo-nudge", onNudge);
    return () => window.removeEventListener("pw-logo-nudge", onNudge);
  }, [editable, mine, mode, zone, box, aspect, pad, geo, placement.w, commit, flash, tx]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || !box || !aspect || e.button > 0) return;
    e.preventDefault();
    const fr = layerRef.current?.getBoundingClientRect();
    if (!fr) return;
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-pw-handle]")?.dataset.pwHandle as Drag["handle"] | undefined;
    e.currentTarget.focus({ preventScroll: true });
    startDrag({ id: e.pointerId, sx: e.clientX, sy: e.clientY, handle: h ?? null, aspect, pad, start: { x: box.left + fr.left, y: box.top + fr.top, w: box.width, h: box.height } });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || !box || !aspect || !geo) return;
    if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); return; }
    const nb = nudgeFreeBox({ x: box.left, y: box.top, w: box.width, h: box.height }, e.key, e.shiftKey, aspect, pad);
    if (!nb) return;
    e.preventDefault();
    if (!isFreeBoxValid(nb, freeInner(geo.w, geo.h), geo.obstacles)) { flash(tx("logoDropInvalid")); return; }
    commit(freePlacementFromBox(zone, nb, geo));
  };

  const showWarn = editable && mine && aspect !== null && geo !== null && (!result || !result.fit);
  const dragging = ghost !== null;

  return (
    <div
      ref={layerRef}
      className={`${styles.freeLayer} ${editable ? styles.freeEditing : ""} ${zone === "side" ? styles.freeSide : styles.freePage}`}
      data-pw-free={zone}
      data-pw-mode-place={mode}
      data-pw-drop-target={dragging && ghost?.zone === zone ? (ghost.valid ? "valid" : "invalid") : undefined}
    >
      {mine && box && src ? (
        <div ref={logoRef} className={styles.freeLogoWrap} data-pw-free-logo={zone} data-moved={result && result.fit && result.moved ? "1" : undefined}>
          <PersonalLogo
            src={src}
            plate={logo.plate}
            box={box}
            editable={editable}
            label={editable ? tx("logoFreeEditLabel") : tx("logoLabel")}
            className={`${styles.flogoFree} ${dragging ? styles.flogoGhosted : ""}`}
            onPointerDown={editable ? onPointerDown : undefined}
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
        </div>
      ) : null}
      {showWarn ? <p className={styles.freeWarn} role="status">{tx("logoNoFit")}</p> : null}
      {editable && notice && mine ? <p className={styles.freeNotice} role="status" data-testid="free-logo-notice">{notice}</p> : null}
      {portalReady && ghost && src
        ? createPortal(
          <div
            className={`${styles.freeGhost} ${ghost.valid ? styles.ghostOk : styles.ghostBad}`}
            style={{ left: ghost.box.x, top: ghost.box.y, width: ghost.box.w, height: ghost.box.h }}
            data-testid="free-logo-ghost"
            data-valid={ghost.valid ? "1" : "0"}
            aria-hidden
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" draggable={false} />
            <span className={styles.ghostTag}>{ghost.valid ? tx("logoDropOk") : tx("logoDropNo")}</span>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

function sameGeo(a: FrameGeo | null, b: FrameGeo | null): boolean {
  if (!a || !b) return a === b;
  const near = (x: number, y: number) => Math.abs(x - y) < 0.5;
  if (!near(a.w, b.w) || !near(a.h, b.h) || a.obstacles.length !== b.obstacles.length) return false;
  return a.obstacles.every((o, i) => near(o.x, b.obstacles[i].x) && near(o.y, b.obstacles[i].y) && near(o.w, b.obstacles[i].w) && near(o.h, b.obstacles[i].h));
}

/** Panel düğmeleri için: logoyu taşı / büyüt / küçült / çerçeve değiştir (aynı doğrulama). */
export function nudgeLogo(detail: { key?: string; shift?: boolean; toZone?: FreeLogoZone; mode?: PlacementMode }) {
  window.dispatchEvent(new CustomEvent("pw-logo-nudge", { detail }));
}

/**
 * Eski hazır bölge yerleşimi → aynı noktada serbest yerleşim (sayfa çerçevesi). `vbox`: logonun ekrandaki kutusu
 * (viewport px). Sayfa çerçevesi ekranda değilse null.
 */
export function legacyToFree(vbox: { left: number; top: number; width: number; height: number }): LogoPlacement | null {
  const el = frames.get("page")?.el ?? document.querySelector<HTMLDivElement>('[data-pw-free="page"]');
  const fr = el?.getBoundingClientRect();
  if (!fr || fr.width < 1) return null;
  return freePlacementFromBox("page", { x: vbox.left - fr.left, y: vbox.top - fr.top, w: vbox.width, h: vbox.height }, { w: fr.width, h: fr.height });
}

/** Ekranda çizilmiş eski bölge logosunun kutusu (yoksa null). */
export function legacyLogoBox(): DOMRect | null {
  const el = document.querySelector<HTMLElement>('[data-pw-zone][data-used] > [role="img"]');
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 ? r : null;
}
