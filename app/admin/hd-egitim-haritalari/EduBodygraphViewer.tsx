"use client";

/**
 * Hazır Eğitim Haritaları — BÜYÜK, ODAKLI BodyGraph görüntüleyicisi (owner kararı 29.10.2026).
 * Kayıtlı snapshot'tan (computed_result) mevcut premium BodyGraph çizicisiyle çizer — hesap motoru, snapshot, oranlar,
 * merkez konumları, kanal bağlantıları ve renkler DEĞİŞMEZ (aynı HdPremiumBodygraph + HdPlanetColumn bileşenleri).
 * Yakınlaştırma çiziciyi gerçek boyutta yeniden çizer (CSS ölçekleme değil → rakamlar keskin); büyükken sürükleyerek
 * veya kaydırarak gezilir. "Tam Ekran İncele" aynı haritayı tüm ekranda açar (Esc ile kapanır).
 * Gezegen listeleri haritanın yanında sabit genişlikte durur; dar ekranda haritanın ALTINA iner (haritayı daraltmaz).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { HdPremiumBodygraph, HD_PREMIUM_BODYGRAPH_ASPECT } from "@/app/human-design/kayitli-haritalar/components/HdPremiumBodygraph";
import { HdPlanetColumn } from "@/app/human-design/kayitli-haritalar/components/HdPlanetColumn";
import { HdComputedChartView } from "@/app/human-design/kayitli-haritalar/components/HdComputedChartView";
import { premiumStateFromChart } from "@/lib/human-design/bodygraph/premiumChartState";
import { computedChartAppCodes, type HdComputedChart } from "@/lib/human-design/chart/computedChart";
import { HdChartInfoPanel } from "@/app/human-design/kayitli-haritalar/components/HdChartInfoPanel";
import { classifyComputedChartCenters, HD_CENTER_STATE_LABEL } from "@/lib/human-design/chart/centerStates";
import { HUMAN_DESIGN_CENTERS } from "@/lib/human-design/constants";
import { hdCenterLabelFromCode } from "@/lib/human-design/codeHelpers";
import { hdChannelDisplayLabel } from "@/lib/human-design/knowledge/hdNames";
import css from "./ownerViews.module.css";

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
const [AW, AH] = HD_PREMIUM_BODYGRAPH_ASPECT.split("/").map((v) => Number(v.trim()));
const ASPECT = AW > 0 && AH > 0 ? AW / AH : 0.7;

/**
 * Kaydırılabilir yakınlaştırma alanı: harita kutusu piksel boyutuyla büyür (yeniden çizim), merkez korunur.
 * Owner kararı 30.10.2026 (iç kaydırma düzeltmesi): taban ölçü iç boşluk DÜŞÜLEREK alınır ve aşağı yuvarlanır → %100'de
 * harita alana tam sığar, taşma ve iç kaydırma çubuğu oluşmaz; %100'de alan kaydırılmaz (zoomFit), sayfa kaydırması bozulmaz.
 */
function ZoomStage({ result, zoom, label }: { result: HdComputedChart; zoom: number; label: string }) {
  const state = useMemo(() => premiumStateFromChart(result), [result]);
  const vpRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const center = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    const measure = () => {
      const cs = innerRef.current ? window.getComputedStyle(innerRef.current) : null;
      const px = cs ? (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) : 0;
      const py = cs ? (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0) : 0;
      setBox({ w: Math.max(0, el.clientWidth - px), h: Math.max(0, el.clientHeight - py) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Taban: görünür alana sığan en büyük harita; yakınlaştırma bunu çarpar.
  const baseH = box.w && box.h ? Math.min(box.h, box.w / ASPECT) : 0;
  const gh = Math.floor(baseH * zoom);
  const gw = Math.min(Math.floor(gh * ASPECT), zoom > 1 ? Number.MAX_SAFE_INTEGER : Math.floor(box.w));

  // Yakınlaştırma değişince görünen merkez korunur.
  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return;
    el.scrollLeft = center.current.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = center.current.y * el.scrollHeight - el.clientHeight / 2;
  }, [gh]);

  const remember = () => {
    const el = vpRef.current;
    if (!el || !el.scrollWidth || !el.scrollHeight) return;
    center.current = { x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth, y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight };
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || zoom <= 1 || !vpRef.current) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: vpRef.current.scrollLeft, st: vpRef.current.scrollTop };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !vpRef.current) return;
    vpRef.current.scrollLeft = d.sl - (e.clientX - d.x);
    vpRef.current.scrollTop = d.st - (e.clientY - d.y);
  };
  const onUp = () => { drag.current = null; };

  if (!state) return null;
  return (
    <div
      ref={vpRef}
      className={`${css.zoomVp} ${zoom > 1 ? css.zoomPan : css.zoomFit}`}
      onScroll={remember}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-edu-bg-viewport
      data-edu-bg-zoom={zoom}
      aria-label={label}
    >
      <div ref={innerRef} className={css.zoomInner}>
        {gh > 0 ? (
          <div style={{ width: gw, height: gh }} data-edu-bg-graph>
            <HdPremiumBodygraph state={state} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Toolbar({ zoom, setZoom, onFull, fullLabel }: { zoom: number; setZoom: (z: number) => void; onFull?: () => void; fullLabel: string }) {
  return (
    <div className={css.bgTools} role="toolbar" aria-label="BodyGraph görünümü">
      <button type="button" className={css.bgBtn} onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))} disabled={zoom <= ZOOM_MIN} aria-label="Uzaklaştır" data-edu-bg-out>−</button>
      <span className={css.bgPct} aria-live="polite" data-edu-bg-pct>%{Math.round(zoom * 100)}</span>
      <button type="button" className={css.bgBtn} onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))} disabled={zoom >= ZOOM_MAX} aria-label="Yakınlaştır" data-edu-bg-in>+</button>
      <button type="button" className={css.bgBtnText} onClick={() => setZoom(1)} disabled={zoom === 1} data-edu-bg-reset>Görünümü sıfırla</button>
      {onFull ? <button type="button" className={css.bgBtnFull} onClick={onFull} data-edu-bg-full>{fullLabel}</button> : null}
    </div>
  );
}

export function EduBodygraphViewer({ result, title, compact = false, roxyRender }: { result: HdComputedChart; title: string; compact?: boolean; roxyRender?: Record<string, unknown> | null }) {
  const premium = useMemo(() => premiumStateFromChart(result), [result]);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);
  const [fullZoom, setFullZoom] = useState(1);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const openFull = useCallback(() => { setFullZoom(1); setFull(true); }, []);

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [full]);

  // Premium çizici kayıtla birebir doğrulanamazsa (beklenmez) mevcut görünüm aynen kullanılır.
  if (!premium) return <HdComputedChartView result={result} roxyRender={roxyRender} showProviderNote={false} />;

  return (
    <div className={`${css.bgWrap} ${compact ? css.bgCompact : ""}`} data-edu-bg-viewer={compact ? "compact" : "full"}>
      <Toolbar zoom={zoom} setZoom={setZoom} onFull={openFull} fullLabel="Tam Ekran İncele" />
      <div className={css.bgStage}>
        {compact ? null : <div className={`${css.bgCol} ${css.bgColD}`} data-edu-bg-col="design"><HdPlanetColumn activations={result.activations} side="design" /></div>}
        <div className={css.bgMain}><ZoomStage result={result} zoom={zoom} label={`${title} BodyGraph`} /></div>
        {compact ? null : <div className={`${css.bgCol} ${css.bgColP}`} data-edu-bg-col="personality"><HdPlanetColumn activations={result.activations} side="personality" /></div>}
      </div>
      {full ? (
        <div className={css.fsOvl} role="dialog" aria-modal="true" aria-label={`${title} — BodyGraph tam ekran`} data-edu-bg-fullscreen>
          <div className={css.fsHead}>
            <b className={css.fsTitle}>{title}</b>
            <Toolbar zoom={fullZoom} setZoom={setFullZoom} fullLabel="" />
            <button ref={closeBtn} type="button" className={css.bgBtnText} onClick={() => setFull(false)} data-edu-bg-close>Kapat (Esc)</button>
          </div>
          <div className={css.fsStage}>
            <div className={`${css.bgCol} ${css.bgColD}`}><HdPlanetColumn activations={result.activations} side="design" /></div>
            <div className={css.fsMain}><ZoomStage result={result} zoom={fullZoom} label={`${title} BodyGraph tam ekran`} /></div>
            <div className={`${css.bgCol} ${css.bgColP}`}><HdPlanetColumn activations={result.activations} side="personality" /></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Harita bilgileri (tip / profil / otorite + merkez durumları + kanallar + kapılar) — kayıtlı sonuçtan, yeni hesap YOK. */
export function EduChartFacts({ result }: { result: HdComputedChart }) {
  const codes = computedChartAppCodes(result);
  const states = classifyComputedChartCenters(result).states;
  return (
    <div className={css.infoGrid} data-edu-chart-facts>
      <div className={css.mini}><HdChartInfoPanel result={result} codes={codes} subject={null} /></div>
      <div className={css.mini}>
        <h4>Merkezler</h4>
        <ul>
          {HUMAN_DESIGN_CENTERS.map((c) => (
            <li key={c.code} data-hd-center={`${c.code}:${states[c.code].state}`}>{hdCenterLabelFromCode(c.code)} — <b>{HD_CENTER_STATE_LABEL[states[c.code].state]}</b></li>
          ))}
        </ul>
      </div>
      <div className={css.mini}>
        <h4>Tanımlı Kanallar ({codes.channels.length})</h4>
        <ul>{codes.channels.length ? codes.channels.map((ch) => <li key={ch} data-hd-channel={ch}>{hdChannelDisplayLabel(ch, null)}</li>) : <li>Tanımlı kanal yok.</li>}</ul>
        <h4 style={{ marginTop: 12 }}>Aktif Kapılar ({codes.gates.length})</h4>
        <div className={css.gates}>{codes.gates.map((g) => <span key={g} className={css.gate} data-hd-gate={g}>{g}</span>)}</div>
      </div>
    </div>
  );
}
