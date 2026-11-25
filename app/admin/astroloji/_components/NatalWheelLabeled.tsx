"use client";

/**
 * Natal çark — G2 ETİKET KATMANI (onaylı tasarım G1-R4-S2). Yalnız Natal ekranı, `display.labels` verildiğinde kullanılır
 * (NatalWheel bu durumda buraya devreder; `labels` verilmezse NatalWheel'in önceki çizimi AYNEN kalır).
 *
 * Geometri KORUNUR: R_OUT 272 · R_SIGN_IN 238 · ev numarası 136 · açı dairesi 122; ev çizgileri, gerçek ASC–DSC / MC–IC ekseni,
 * açı çizgileri ve gezegenlerin gerçek boylamları ürünle aynı. Yalnız ETİKETİN yeri ve içeriği değişir:
 *   • Ayrıntılı: gezegen / derece (+℞) / burç / dakika; Sade: gezegen / derece / dakika. Ev başlangıçları (ayrıntılı) çemberin
 *     dışında "derece · burç · dakika"; ASC/DSC/MC/IC levhası "burç derece′".
 *   • Gerçek konum: cetvel üstündeki koyu çentik + kısa bağlantı her zaman GERÇEK boylamda; etiket kendi burç diliminde kalır.
 *   • Yoğun küme → burç içinde grup etiketi (dokununca / tıklayınca ayrıntı paneli; masaüstünde yan alanda sürekli).
 *   • Anlamsal yakınlaştırma: ChartViewport ölçeği büyüdükçe yazı ölçeği küçülür (ekranda sabit) → gruplar gerçekten ayrılır.
 *   • Saat bilinmiyor: Ay çizilmez (varsayımsal burç diliminde simge yok, grup sayısına girmez); açı çizgisi yok; diğerleri "≈".
 * Hiçbir değer hesaplanmaz / yuvarlanmaz; derece metni formatDegree (dakika kesilir).
 */

import { useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import type { BodyId, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { BODY_GLYPHS, formatDegree, SIGN_ELEMENT, SIGN_GLYPHS } from "@/lib/astrology/labels/tr";
import { isAspectDrawn } from "@/lib/astrology/view/natalWheelDisplay";
import { adist, drawnOnWheel, groupBox, layoutLabels, norm, semanticZoom, WHEEL, type LabelGroup, type LabelItem, type LabelProfile } from "@/lib/astrology/view/natalLabelLayout";
import { ChartViewportScaleContext } from "./atlas/ChartViewport";
import type { NatalWheelDisplay, WheelChart } from "./NatalWheel";

const { SIZE, C, R_OUT, R_SIGN_IN, RULER_W, R_HOUSE_NUM, R_ASPECT } = WHEEL;

const ELEMENT_COLOR: Record<string, string> = { fire: "#dc2626", earth: "#15803d", air: "#ca8a04", water: "#2563eb" };
const ELEMENT_TINT: Record<string, string> = { fire: "#fde8e8", earth: "#e3f5e8", air: "#fbf3d0", water: "#e1ecfb" };
const NATURE_COLOR: Record<string, string> = { harmonious: "#2563eb", challenging: "#dc2626", neutral: "#64748b" };
const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);
const NATAL_SYMBOL_FONT = "'Yasam Natal Sembol', var(--font-geist-sans), Arial, Helvetica, sans-serif";
const RETRO_INK = "#be123c";
const POINT_INK = "#0f766e";
const HALO = { stroke: "#fffdf7", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" } as const;

/** Çarkta seçilen öğe (ayrıntı paneli için). */
export type NatalLabelPick =
  | { kind: "group"; sign: SignId; ids: string[] }
  | { kind: "body"; id: BodyId }
  | { kind: "point"; id: "vertex" | "fortune" }
  | { kind: "cusp"; n: number }
  | { kind: "angle"; id: "ASC" | "DSC" | "MC" | "IC" };

/** Çarkın o anki etiket düzeni (yan grup alanı için). */
export type NatalWheelLayoutInfo = { profile: LabelProfile; K: number; groups: LabelGroup[] };

type Entry = { kind: "body" | "point"; key: string; id: string; glyph: string; name: string; lon: number; sign: SignId; deg: number; retro: boolean };

const f2 = (n: number) => Math.round(n * 100) / 100;

export default function NatalWheelLabeled({
  technical,
  label,
  sizeClassName,
  display,
}: {
  technical: WheelChart;
  label: string;
  sizeClassName: string;
  display: NatalWheelDisplay & { labels: NonNullable<NatalWheelDisplay["labels"]> };
}) {
  const { detailed, timeUnknown, onPick, onLayout } = display.labels;
  const tl = useTranslations("atlas.natalLabels");
  const tt = useTranslations("terms");
  const signName = (s: SignId) => tt(`zodiac.${s}`);
  const instance = useId();
  const scale = useContext(ChartViewportScaleContext);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [wheelPx, setWheelPx] = useState(0);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // Yerleşim boyu (CSS dönüşümünden bağımsız): viewBox "meet" → çark = kısa kenar.
    const ro = new ResizeObserver((es) => {
      const r = es[0]?.contentRect;
      if (r) setWheelPx(Math.round(Math.min(r.width, r.height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { eff, compact, K } = semanticZoom(wheelPx, scale);
  const profile = compact ? "compact" : "screen";

  // Dokunma / tıklama: ChartViewport işaretçiyi yakaladığı için "click" etikete ulaşmayabilir → basış etikette kaydedilir,
  // bırakış (≤ 6 px hareket) pencerede yakalanır. Sürükleme / iki parmak seçim üretmez.
  const press = useRef<{ pick: NatalLabelPick; x: number; y: number; id: number } | null>(null);
  useEffect(() => {
    if (!onPick) return;
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      if (p && p.id === e.pointerId && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) onPick(p.pick);
    };
    const cancel = () => {
      press.current = null;
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [onPick]);
  const act = (pick: NatalLabelPick) =>
    onPick
      ? {
          tabIndex: 0,
          role: "button" as const,
          onPointerDown: (e: ReactPointerEvent) => {
            if (e.isPrimary) press.current = { pick, x: e.clientX, y: e.clientY, id: e.pointerId };
            else press.current = null;
          },
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onPick(pick);
            }
          },
          style: { cursor: "pointer" },
        }
      : {};

  const ascLon = technical.angles?.ascendant.longitude ?? 0;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - ascLon)) * Math.PI) / 180;
    return { x: f2(C + r * Math.cos(a)), y: f2(C - r * Math.sin(a)) };
  };

  const hidden = display.hiddenBodies;
  const bodies = technical.bodies.filter((b) => !hidden.has(b.id) && drawnOnWheel(timeUnknown, b.id));
  const entries: Entry[] = [
    ...bodies.map((b) => ({ kind: "body" as const, key: b.id, id: b.id, glyph: BODY_GLYPHS[b.id], name: tt(`body.${b.id}`), lon: b.longitude, sign: b.sign, deg: b.degreeInSign, retro: b.retrograde })),
    ...display.extraPoints.map((p) => ({ kind: "point" as const, key: `x:${p.id}`, id: p.id, glyph: p.glyph, name: tl(`point.${p.id}`), lon: p.longitude, sign: p.sign, deg: p.degreeInSign, retro: false })),
  ];
  const items: LabelItem[] = entries.map((e) => ({ id: e.key, lon: e.lon }));
  const itemsKey = items.map((x) => `${x.id}@${x.lon}`).join(",");
  // Düzen yalnız girdiler değişince yeniden kurulur (kararlı gruplar → yan alana bildirim döngüsü yok).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- items içeriği itemsKey ile temsil edilir
  const { G, groups, disp } = useMemo(() => layoutLabels(items, { detailed, profile, K, assumed: timeUnknown }), [itemsKey, detailed, profile, K, timeUnknown]);
  const groupedKeys = new Set(groups.flatMap((g) => g.ids));
  // G2-K: ev başlangıcı derecesi ekranda en az 7 px okunamıyorsa (dar mobil çark) yazılmaz; yakınlaştırınca geri gelir. Değer
  // Evler bölümünde ve ev numarasına / levhaya dokununca açılan panelde her zaman tam. Ölçü bilinmeden (sunucu çizimi) gösterilir.
  const cuspReadable = wheelPx === 0 || (!compact && G.f.cusp * eff >= 7);
  const VB = SIZE + 2 * G.pad;
  // Yan grup alanı çarkın GERÇEK düzenini gösterir (dar profil / yakınlaştırma dahil); çizim kaldırılınca kayıt silinir.
  useEffect(() => {
    onLayout?.(instance, { profile, K, groups });
  }, [onLayout, instance, profile, K, groups]);
  useEffect(() => () => onLayout?.(instance, null), [onLayout, instance]);

  const houses = technical.houses;
  const A = technical.angles;
  const angleOf = (n: number): number | null =>
    !A ? null : n === 1 ? A.ascendant.longitude : n === 7 ? A.ascendant.longitude + 180 : n === 10 ? A.midheaven.longitude : n === 4 ? A.midheaven.longitude + 180 : null;
  const sameLon = (x: number, y: number) => adist(x, y) < 0.02;
  const axisCusp = (n: number, lon: number) => {
    const a = angleOf(n);
    return a !== null && sameLon(lon, a);
  };
  const freeAxes = [1, 4, 7, 10].flatMap((n) => {
    const a = angleOf(n);
    const h = houses.find((x) => x.number === n);
    return a !== null && !(h && sameLon(h.longitude, a)) ? [{ n, lon: a }] : [];
  });

  const drawnAspects = timeUnknown ? [] : technical.aspects.filter((a) => isAspectDrawn(a, display.mode, hidden, display.aspectFilter));
  const posById = new Map(bodies.map((b) => [b.id as string, b]));
  const assumed = timeUnknown;
  const focus = display.aspectFilter?.focus ?? null;
  const tickEnd = R_SIGN_IN - RULER_W - 2;

  const svgLabel = `${label}${timeUnknown ? tl("svgTimeUnknown") : ""}`;

  return (
    <svg
      ref={svgRef}
      viewBox={`${-G.pad} ${-G.pad} ${VB} ${VB}`}
      role="img"
      aria-label={svgLabel}
      className={`mx-auto select-none ${sizeClassName}`}
      style={{ fontFamily: NATAL_SYMBOL_FONT }}
      data-natal-mode={display.mode}
      data-aspects-total={technical.aspects.length}
      data-aspects-drawn={drawnAspects.length}
      data-label-layout={detailed ? "detailed" : "simple"}
      data-label-profile={profile}
      data-label-k={K.toFixed(2)}
      data-label-groups={groups.length}
      data-cusp-labels={A && detailed ? (cuspReadable ? "shown" : "hidden") : undefined}
      data-time-unknown={timeUnknown ? "1" : undefined}
    >
      <circle cx={C} cy={C} r={R_OUT} fill="#fffdf7" stroke="#334155" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={R_SIGN_IN} fill="#ffffff" stroke="#334155" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_ASPECT} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.8} />

      {/* Burç halkası (element tonlu) + kalın burç sınırları */}
      {SIGN_IDS.map((sign, i) => {
        const st = i * 30;
        const p1 = pt(R_SIGN_IN, st);
        const p2 = pt(R_OUT, st);
        const o2 = pt(R_OUT, st + 30);
        const i2 = pt(R_SIGN_IN, st + 30);
        const g = pt((R_SIGN_IN + R_OUT) / 2, st + 15);
        const b1 = pt(R_SIGN_IN - RULER_W, st);
        return (
          <g key={sign}>
            <path d={`M ${p2.x} ${p2.y} A ${R_OUT} ${R_OUT} 0 0 0 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_SIGN_IN} ${R_SIGN_IN} 0 0 1 ${p1.x} ${p1.y} Z`} fill={ELEMENT_TINT[SIGN_ELEMENT[sign]]} />
            <line x1={b1.x} y1={b1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth={1.1} data-sign-boundary={sign} />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={22} fill={ELEMENT_COLOR[SIGN_ELEMENT[sign]]}>
              <title>{signName(sign)}</title>
              {SIGN_GLYPHS[sign]}
            </text>
          </g>
        );
      })}

      {/* Derece cetveli: her 1° kısa, 5° orta, 10° uzun */}
      <g data-testid="natal-degree-ruler">
        <circle cx={C} cy={C} r={R_SIGN_IN - RULER_W} fill="none" stroke="#cbd5e1" strokeWidth={0.6} />
        {Array.from({ length: 360 }, (_, lon) => {
          if (lon % 30 === 0) return null;
          const len = lon % 10 === 0 ? RULER_W - 1 : lon % 5 === 0 ? 6.5 : 3.5;
          const a = pt(R_SIGN_IN, lon);
          const b = pt(R_SIGN_IN - len, lon);
          return (
            <line
              key={lon}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={lon % 10 === 0 ? "#475569" : lon % 5 === 0 ? "#64748b" : "#94a3b8"}
              strokeWidth={lon % 10 === 0 ? 0.9 : lon % 5 === 0 ? 0.7 : 0.45}
              data-deg={lon % 10 === 0 ? "10" : lon % 5 === 0 ? "5" : "1"}
            />
          );
        })}
      </g>

      {/* Ev çizgileri + numaralar (136; ev aralığının ortası) */}
      {houses.map((h, i) => {
        const next = houses[(i + 1) % houses.length];
        const axis = axisCusp(h.number, h.longitude);
        const a = pt(R_ASPECT, h.longitude);
        const b = pt(axis ? R_OUT + 6 : R_SIGN_IN, h.longitude);
        const mid = pt(R_HOUSE_NUM, h.longitude + norm(next.longitude - h.longitude) / 2);
        return (
          <g key={`h${h.number}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={axis ? "#0f172a" : "#94a3b8"} strokeWidth={axis ? 1.6 : 0.7} data-cusp-line={h.number} />
            {/* Ev numarasına dokunma → o evin başlangıcı (burç / derece / dakika) panelde; görünmez geniş dokunma alanı. */}
            <g data-house-hit={h.number} aria-label={tl("cuspAria", { n: h.number })} {...act({ kind: "cusp", n: h.number })}>
              {onPick && <circle cx={mid.x} cy={mid.y} r={16} fill="transparent" />}
              <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="#475569" data-house-num={h.number} {...HALO}>
                {h.number}
              </text>
            </g>
          </g>
        );
      })}
      {freeAxes.map((x) => {
        const a = pt(R_ASPECT, x.lon);
        const b = pt(R_OUT + 6, x.lon);
        return <line key={`ax${x.n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0f172a" strokeWidth={1.6} data-axis={x.n} />;
      })}

      {/* Ev başlangıçları (ayrıntılı): çemberin dışında derece · burç · dakika; açı levhasına yakınsa daha dışarıda */}
      {A &&
        detailed &&
        cuspReadable &&
        (() => {
          const angleLons = [A.ascendant.longitude, A.midheaven.longitude, A.ascendant.longitude + 180, A.midheaven.longitude + 180];
          const placed: { lon: number; r: number }[] = [];
          return [...houses]
            .sort((a, b) => a.longitude - b.longitude)
            .map((h) => {
              if (axisCusp(h.number, h.longitude)) return null;
              const nearPlate = angleLons.some((x) => adist(h.longitude, x) < 9);
              const nearPrev = placed.some((p) => adist(h.longitude, p.lon) < 9 && p.r === R_OUT + 15);
              // Levhaya yakın ev başlangıcı levhanın DIŞINDA (ASC/DSC levhası yatayda R_OUT+45e kadar uzanır → +68; tuval sınırı +90).
              const r = nearPlate ? R_OUT + 68 : nearPrev ? R_OUT + 37 : R_OUT + 15;
              placed.push({ lon: h.longitude, r });
              const t1 = pt(R_OUT, h.longitude);
              const t2 = pt(r - 8, h.longitude);
              const q = pt(r, h.longitude);
              const full = formatDegree(h.degreeInSign);
              const [dg, mn] = full.split("°");
              const title = tl("cuspTitleFull", { n: h.number, sign: signName(h.sign), deg: full });
              return (
                <g key={`cd${h.number}`} data-cusp-degree={h.number} aria-label={title} {...act({ kind: "cusp", n: h.number })}>
                  <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#94a3b8" strokeWidth={0.8} />
                  <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={G.f.cusp} fill="#475569" {...HALO}>
                    <title>{title}</title>
                    {`${dg}°`}
                    <tspan fill={ELEMENT_COLOR[SIGN_ELEMENT[h.sign]]} fontSize={G.f.cuspSign}>
                      {SIGN_GLYPHS[h.sign]}
                    </tspan>
                    {mn}
                  </text>
                </g>
              );
            });
        })()}

      {/* ASC / DSC / MC / IC levhası — burç + derece (dar görünümde yalnız kısaltma; değer dokunarak) */}
      {A &&
        [
          { lon: A.ascendant.longitude, t: "ASC" as const, title: tl("angleShort.ASC") },
          { lon: A.ascendant.longitude + 180, t: "DSC" as const, title: tl("angleShort.DSC") },
          { lon: A.midheaven.longitude, t: "MC" as const, title: tl("angleShort.MC") },
          { lon: A.midheaven.longitude + 180, t: "IC" as const, title: tl("angleShort.IC") },
        ].map((a) => {
          const q = pt(R_OUT + 20, a.lon);
          const l = norm(a.lon);
          const sign = SIGN_IDS[Math.floor(l / 30) % 12];
          const title = `${a.title} — ${signName(sign)} ${formatDegree(l % 30)}`;
          if (compact)
            return (
              <g key={a.t} data-angle={a.t} aria-label={title} {...act({ kind: "angle", id: a.t })}>
                <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={700} fill="#0f172a" {...HALO}>
                  <title>{title}</title>
                  {a.t}
                </text>
              </g>
            );
          const w = 50 * K;
          const h = 28 * K;
          return (
            <g key={a.t} data-angle={a.t} aria-label={title} {...act({ kind: "angle", id: a.t })}>
              <rect x={f2(q.x - w / 2)} y={f2(q.y - h / 2)} width={f2(w)} height={f2(h)} rx={5} fill="#fffdf7" stroke="#334155" strokeWidth={0.8} />
              <text x={q.x} y={f2(q.y - h / 4.6)} textAnchor="middle" dominantBaseline="central" fontSize={G.f.plateT} fontWeight={700} fill="#0f172a">
                <title>{title}</title>
                {a.t}
              </text>
              <text x={q.x} y={f2(q.y + h / 4.3)} textAnchor="middle" dominantBaseline="central" fontSize={G.f.plateV} fill="#334155">
                <tspan fill={ELEMENT_COLOR[SIGN_ELEMENT[sign]]} fontSize={G.f.plateV + 1}>
                  {SIGN_GLYPHS[sign]}
                </tspan>
                {` ${formatDegree(l % 30)}`}
              </text>
            </g>
          );
        })}

      {/* Açı çizgileri — saat bilinmiyorsa ÇİZİLMEZ (12:00 varsayımı kesin sonuç değildir) */}
      {drawnAspects.map((a, i) => {
        const pa = posById.get(a.a);
        const pb = posById.get(a.b);
        if (!pa || !pb) return null;
        const p1 = pt(R_ASPECT, pa.longitude);
        const p2 = pt(R_ASPECT, pb.longitude);
        const major = MAJOR.has(a.type);
        const w = !major ? 0.7 : display.mode === "basic" ? 1.35 : typeof a.orb === "number" ? 0.75 + 1.25 * Math.max(0, 1 - a.orb / 8) : 1.1;
        return (
          <line
            key={`a${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b"}
            strokeWidth={Math.round(w * 100) / 100}
            strokeDasharray={major ? undefined : "3 3"}
            opacity={0.8}
            data-aspect={`${a.a}-${a.b}-${a.type}`}
          >
            <title>{`${tt(`body.${a.a}`)} – ${tt(`body.${a.b}`)}${typeof a.orb === "number" ? ` · orb ${formatDegree(a.orb)}` : ""}`}</title>
          </line>
        );
      })}

      {/* Gruptaki gövdelerin GERÇEK konum çentiği (cetvel üstünde) */}
      {entries
        .filter((e) => groupedKeys.has(e.key))
        .map((e) => {
          const t1 = pt(R_SIGN_IN, e.lon);
          const t2 = pt(R_SIGN_IN - RULER_W - 6, e.lon);
          const focused = focus === e.id;
          return (
            <g key={`gt${e.key}`}>
              {/* Açı filtresi odağı grupta kalan gövdedeyse: gerçek konum çentiğinin ucunda odak halkası. */}
              {focused && <circle cx={t2.x} cy={t2.y} r={6} fill="#ccfbf1" stroke={POINT_INK} strokeWidth={1.4} />}
              <line
                x1={t1.x}
                y1={t1.y}
                x2={t2.x}
                y2={t2.y}
                stroke={e.kind === "point" ? POINT_INK : "#0f172a"}
                strokeWidth={2.2}
                data-grouped="1"
                data-focus={focused ? "1" : undefined}
                {...(e.kind === "body" ? { "data-body": e.id } : { "data-point": e.id })}
              />
            </g>
          );
        })}
      {!timeUnknown &&
        entries
          .filter((e) => e.kind === "body")
          .map((e) => {
            const dot = pt(R_ASPECT, e.lon);
            return <circle key={`dot${e.key}`} cx={dot.x} cy={dot.y} r={1.8} fill="#0f172a" />;
          })}

      {/* Bağlantı çizgileri (etiketlerin arkasında): gerçek çentikten etikete kısa düz çizgi */}
      {entries
        .filter((e) => !groupedKeys.has(e.key))
        .map((e) => {
          const k2 = pt(tickEnd, e.lon);
          const g = pt(G.tier.g, disp.get(e.key) ?? e.lon);
          const vx = g.x - k2.x;
          const vy = g.y - k2.y;
          const L = Math.hypot(vx, vy) || 1;
          const gap = Math.min(compact ? 16 : 11, L * 0.6);
          return <line key={`ld${e.key}`} x1={k2.x} y1={k2.y} x2={f2(g.x - (vx / L) * gap)} y2={f2(g.y - (vy / L) * gap)} stroke="#94a3b8" strokeWidth={0.8} data-leader={e.id} />;
        })}

      {/* Grup etiketleri: burç dilimi içinde (burç + sayı + semboller) */}
      {groups.map((gr) => {
        const box = groupBox(gr.ids.length, profile, K);
        const c = pt(box.r, gr.mid);
        const ent = gr.ids.map((k) => entries.find((e) => e.key === k)!);
        const names = ent.map((e) => e.name).join(", ");
        const aria = tl("groupAria", { sign: signName(gr.sign), n: gr.ids.length, names, assumed: assumed ? tl("groupAssumed") : "" });
        const ink = ELEMENT_COLOR[SIGN_ELEMENT[gr.sign]];
        if (compact)
          return (
            <g key={`g${gr.sign}`} data-group={gr.sign} data-ids={gr.ids.join(" ")} aria-label={aria} {...act({ kind: "group", sign: gr.sign, ids: gr.ids })}>
              <title>{names}</title>
              <rect x={f2(c.x - box.w / 2)} y={f2(c.y - box.h / 2)} width={box.w} height={box.h} rx={12} fill="#ffffff" stroke={ink} strokeWidth={2} />
              <text x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={700} fill="#0f172a" data-group-count={gr.ids.length}>
                <tspan fill={ink}>{SIGN_GLYPHS[gr.sign]}</tspan> {gr.ids.length}
              </text>
            </g>
          );
        const w = box.w;
        const hh = box.h;
        const fs = 13 * K;
        return (
          <g key={`g${gr.sign}`} data-group={gr.sign} data-ids={gr.ids.join(" ")} aria-label={aria} {...act({ kind: "group", sign: gr.sign, ids: gr.ids })}>
            <title>{names}</title>
            <rect x={f2(c.x - w / 2)} y={f2(c.y - hh / 2)} width={f2(w)} height={f2(hh)} rx={10} fill="#ffffff" stroke={ink} strokeWidth={1.6} />
            <text x={c.x} y={f2(c.y - hh * 0.23)} textAnchor="middle" dominantBaseline="central" fontSize={f2(fs)} fontWeight={700} fill="#0f172a" data-group-count={gr.ids.length}>
              <tspan fill={ink} fontSize={f2(fs + 1)}>
                {SIGN_GLYPHS[gr.sign]}
              </tspan>{" "}
              {`${gr.ids.length} nokta`}
            </text>
            <text x={c.x} y={f2(c.y + hh * 0.23)} textAnchor="middle" dominantBaseline="central" fontSize={f2(fs)} fill="#0f172a">
              {ent.map((e) => e.glyph).join(" ")}
            </text>
          </g>
        );
      })}

      {/* Tekil etiketler */}
      {entries
        .filter((e) => !groupedKeys.has(e.key))
        .map((e) => {
          const d = disp.get(e.key) ?? e.lon;
          const t1 = pt(R_SIGN_IN, e.lon);
          const k2 = pt(tickEnd, e.lon);
          const g = pt(G.tier.g, d);
          const full = formatDegree(e.deg);
          const [dg, mn] = full.split("°");
          const ink = e.kind === "point" ? POINT_INK : "#0f172a";
          const gsize = e.id === "vertex" ? G.f.v : G.f.g;
          const title = `${e.name} — ${signName(e.sign)} ${full}${e.retro ? tl("retroSuffix") : ""}${assumed ? tl("assumedSuffix") : ""}`;
          const pick: NatalLabelPick = e.kind === "body" ? { kind: "body", id: e.id as BodyId } : { kind: "point", id: e.id as "vertex" | "fortune" };
          const glyph = (
            <text
              x={g.x}
              y={g.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={f2(gsize)}
              fontWeight={e.id === "vertex" ? 700 : undefined}
              fontStyle={e.id === "vertex" ? "italic" : undefined}
              fill={ink}
              {...HALO}
            >
              <title>{title}</title>
              {e.glyph}
            </text>
          );
          const rx = e.retro ? (
            <tspan fill={RETRO_INK} data-retro="1">
              ℞
            </tspan>
          ) : null;
          let rows;
          // Dar profil (çark < ~0,7 px/birim): iki düzende de onaylı R4 mobil etiketi (gezegen + burç); derece / dakika dokunarak,
          // yakınlaştırarak ya da yan alanda — 11 birimlik derece yazısı bu ölçekte ~5 px olur, okunmaz.
          if (!detailed && !compact) {
            // Sade: gezegen / derece (+℞) / dakika — ayrıntılı düzenle aynı yarıçap ve punto (yalnız burç satırı yok).
            const d1 = pt(G.tier.d, d);
            const m1 = pt(G.tier.s, d);
            rows = (
              <>
                <text x={d1.x} y={d1.y} textAnchor="middle" dominantBaseline="central" fontSize={f2(G.f.d)} fontWeight={600} fill={e.kind === "point" ? POINT_INK : "#1e293b"} data-row="deg" {...HALO}>
                  {`${assumed ? "≈" : ""}${dg}°`}
                  {rx}
                </text>
                <text x={m1.x} y={m1.y} textAnchor="middle" dominantBaseline="central" fontSize={f2(G.f.m)} fill="#64748b" data-row="min" {...HALO}>
                  {mn}
                </text>
              </>
            );
          } else if (compact) {
            const s1 = pt(G.tier.s, d);
            rows = (
              <text x={s1.x} y={s1.y} textAnchor="middle" dominantBaseline="central" data-row="sign" {...HALO}>
                <tspan fill={ELEMENT_COLOR[SIGN_ELEMENT[e.sign]]} fontSize={G.f.s}>
                  {SIGN_GLYPHS[e.sign]}
                </tspan>
                {assumed && (
                  <tspan fontSize={16} fill="#7a4f05">
                    ≈
                  </tspan>
                )}
              </text>
            );
          } else {
            const d1 = pt(G.tier.d, d);
            const s1 = pt(G.tier.s, d);
            const m1 = pt(G.tier.m, d);
            rows = (
              <>
                <text x={d1.x} y={d1.y} textAnchor="middle" dominantBaseline="central" fontSize={f2(G.f.d)} fontWeight={600} fill={e.kind === "point" ? POINT_INK : "#1e293b"} data-row="deg" {...HALO}>
                  {`${assumed ? "≈" : ""}${dg}°`}
                  {rx}
                </text>
                <text x={s1.x} y={s1.y} textAnchor="middle" dominantBaseline="central" fontSize={f2(G.f.s)} fill={ELEMENT_COLOR[SIGN_ELEMENT[e.sign]]} data-row="sign" {...HALO}>
                  {SIGN_GLYPHS[e.sign]}
                </text>
                <text x={m1.x} y={m1.y} textAnchor="middle" dominantBaseline="central" fontSize={f2(G.f.m)} fill="#64748b" data-row="min" {...HALO}>
                  {mn}
                </text>
              </>
            );
          }
          return (
            <g
              key={e.key}
              {...(e.kind === "body" ? { "data-body": e.id } : { "data-point": e.id })}
              data-focus={focus === e.id ? "1" : undefined}
              data-disp={f2(norm(d))}
              aria-label={title}
              {...act(pick)}
            >
              <line x1={t1.x} y1={t1.y} x2={k2.x} y2={k2.y} stroke={ink} strokeWidth={1.8} data-true-tick="1" />
              <circle cx={k2.x} cy={k2.y} r={1.7} fill={ink} />
              {focus === e.id && <circle cx={g.x} cy={g.y} r={f2(gsize * 0.78)} fill="#ccfbf1" stroke={POINT_INK} strokeWidth={1.4} />}
              <g data-label-text="1">
                {glyph}
                {rows}
              </g>
            </g>
          );
        })}

      {timeUnknown && (
        <g data-time-unknown-note="1">
          <text x={C} y={C - 6} textAnchor="middle" fontSize={12} fill="#7a4f05" fontWeight={600}>
            {tl("centerTimeUnknown")}
          </text>
          <text x={C} y={C + 10} textAnchor="middle" fontSize={10.5} fill="#7a4f05">
            {tl("centerNoAspects")}
          </text>
        </g>
      )}
    </svg>
  );
}
