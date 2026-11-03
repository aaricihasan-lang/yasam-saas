"use client";

/**
 * Natal çark — Yaşam Sistemi'nin KENDİ SVG çizimi (sağlayıcı-bağımsız; yalnız kanonik teknik
 * veriyi kullanır). Roxy UI bileşeni KULLANILMAZ (lisans/sürüm bağımlılığı yok; ileride başka
 * hesap motoru da aynı çarkı besler).
 *
 * Yerleşim: Yükselen solda (9 yönü), boylam saat yönünün TERSİNE artar (astrolojik standart).
 * Saat bilinmiyorsa (angles=null) 0° Koç solda, evler çizilmez.
 *
 * Natal görünüm katmanı (2026-11-04, isteğe bağlı `display`): yalnız Natal ekranı verir — 1°/5°/10° derece cetveli, sembol
 * yazı tipi, ASC/MC/DSC/IC derece levhası, Temel/Profesyonel açı filtresi, seçilebilir noktalar (Vertex / Şans Noktası
 * yalnız teknik veride varsa). `display` verilmezse çizim önceki sürümle BAYT-AYNIDIR (diğer teknikler etkilenmez).
 * Hiçbir değer hesaplanmaz / yuvarlanmaz; derece metni yine formatDegree (dakika kesilir).
 *
 * Ekran tipografisi (yalnız görünüm): glifler büyük; gezegen derecesi + dakikası tablolarla AYNI biçimlendiriciyle
 * (formatDegree: dakika kesilir) iki satırda. Yarıçaplar ve glif itme aralığı rapor çarkıyla (report/wheelSvg) aynıdır.
 */

import type { AspectNature, AspectType, BodyId, NatalHouse, SignId } from "@/lib/astrology/model/western";
import { SIGN_IDS } from "@/lib/astrology/model/western";
import { BODY_GLYPHS, BODY_LABELS, formatDegree, SIGN_ELEMENT, SIGN_GLYPHS, SIGN_LABELS } from "@/lib/astrology/labels/tr";
import { isAspectDrawn, type NatalWheelMode, type WheelExtraPoint } from "@/lib/astrology/view/natalWheelDisplay";

const SIZE = 604;
const C = SIZE / 2;
const R_OUT = 272;
const R_SIGN_IN = 238;
const R_GLYPH = 212;
const R_DEG = 190;
const R_HOUSE_NUM = 136;
const R_ASPECT = 122;

const ELEMENT_COLOR: Record<string, string> = {
  fire: "#dc2626",
  earth: "#15803d",
  air: "#ca8a04",
  water: "#2563eb",
};

/** Aydınlık masa (tinted): burç bandı için soluk element tonları (yalnız zemin rengi). */
const ELEMENT_TINT: Record<string, string> = {
  fire: "#fde8e8",
  earth: "#e3f5e8",
  air: "#fbf3d0",
  water: "#e1ecfb",
};

const NATURE_COLOR: Record<string, string> = {
  harmonious: "#2563eb",
  challenging: "#dc2626",
  neutral: "#64748b",
};

const MAJOR = new Set(["conjunction", "opposition", "trine", "square", "sextile"]);

/** Açı çizgisi ipucu (yalnız Natal görünüm katmanı). */
const ASPECT_TITLE: Record<AspectType, string> = {
  conjunction: "Kavuşum (0°)",
  opposition: "Karşıt (180°)",
  trine: "Üçgen (120°)",
  square: "Kare (90°)",
  sextile: "Sekstil (60°)",
  semi_sextile: "Yarım sekstil (30°)",
  semi_square: "Yarım kare (45°)",
  sesquiquadrate: "Bir buçuk kare (135°)",
  quincunx: "Quincunx (150°)",
};

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Çarkın ihtiyaç duyduğu en küçük harita biçimi (natal, solar/lunar return, composite ortak). */
export type WheelChart = {
  bodies: { id: BodyId; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
  houses: NatalHouse[];
  angles: { ascendant: { longitude: number }; midheaven: { longitude: number } } | null;
  aspects: { a: BodyId; b: BodyId; type: AspectType; nature: AspectNature | null; orb?: number }[];
  /**
   * AŞAMA 2.1/2.2 (2026-10-21): isteğe bağlı DIŞ HALKA (ilerletilmiş / Solar Arc gezegenleri; iç halka = natal). Rapor
   * çarkının (report/wheelSvg `outer`) ekran karşılığı; verilmezse çizim eskisiyle BİREBİR aynıdır.
   */
  outer?: {
    /** Dış halka adı (glif ipucunda; ör. "İlerletilmiş", "Solar Arc"). */
    title: string;
    bodies: { id: BodyId; longitude: number; sign: SignId; degreeInSign: number; retrograde: boolean }[];
    /** Halkalar arası açılar (dış → iç; uçlar gerçek boylamda). */
    crossAspects: { outer: BodyId; inner: BodyId; type: AspectType; nature: AspectNature | null }[];
  } | null;
};

/** Dış halka kalınlığı ve rengi (rapor çarkıyla aynı). */
const RING2 = 54;
const OUTER_INK = "#6d28d9";

/** Natal görünüm katmanı (yalnız `display` verildiğinde; bkz. lib/astrology/view/natalWheelDisplay). */
export type NatalWheelDisplay = {
  mode: NatalWheelMode;
  /** Çarkta gösterilmeyen isteğe bağlı gövdeler (düğüm / Kiron / Lilith); açı çizgileri de gizlenir. */
  hiddenBodies: ReadonlySet<BodyId>;
  /** Teknik veride bulunan ve kullanıcının seçtiği özel noktalar (Vertex / Şans Noktası). */
  extraPoints: readonly WheelExtraPoint[];
};

/** Sembol yazı tipi: self-host "Yasam Natal Sembol" (DejaVu alt kümesi; @font-face natalWheel.module.css) → Windows /
 *  Android / iOS'ta aynı glif; Latin metin ve rakamlar sistem yazı tipinde kalır (unicode-range). */
const NATAL_SYMBOL_FONT = "'Yasam Natal Sembol', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
/** Derece cetveli bandı: burç halkasının iç kenarından içeri. */
const RULER_W = 11;
const RETRO_INK = "#be123c";
const POINT_INK = "#0f766e";

export default function NatalWheel({
  technical,
  label = "Natal harita çarkı",
  sizeClassName = "h-auto w-full max-w-[604px]",
  tinted = false,
  display,
}: {
  technical: WheelChart;
  label?: string;
  /** Yalnız görüntü boyutu (SVG viewBox ve çizim aynı; oran korunur). */
  sizeClassName?: string;
  /** Aydınlık çalışma masası: element tonlu burç bandı + büyük yazı. Geometri, konumlar ve açılar AYNI. */
  tinted?: boolean;
  /** Yalnız Natal ekranı: derece cetveli + Temel/Profesyonel + nokta seçimi. Verilmezse önceki çizim aynen. */
  display?: NatalWheelDisplay;
}) {
  const D = display ?? null;
  const fs = tinted ? { sign: 22, glyph: 22, deg: 11, min: 8.5, house: 12, angle: 10.5 } : { sign: 19, glyph: 20, deg: 9.5, min: 7.5, house: 11, angle: 9.5 };
  const ascLon = technical.angles?.ascendant.longitude ?? 0;
  const pt = (r: number, lon: number) => {
    const a = ((180 + (lon - ascLon)) * Math.PI) / 180;
    return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
  };

  const bodies = D ? technical.bodies.filter((b) => !D.hiddenBodies.has(b.id)) : technical.bodies;
  const extras = D ? D.extraPoints : [];
  // Gezegen glifi yerleşimi: üst üste binmeyi önlemek için basit itme (min 7.5°). Özel noktalar (yalnız `display`) aynı
  // itmeye "x:<id>" anahtarıyla katılır; display yokken anahtarlar yalnız gövde kimlikleri → sonuç öncekiyle aynı.
  const sorted = [
    ...bodies.map((b) => ({ id: b.id as string, longitude: b.longitude })),
    ...extras.map((p) => ({ id: `x:${p.id}`, longitude: p.longitude })),
  ].sort((a, b) => a.longitude - b.longitude);
  const disp = new Map<string, number>(sorted.map((b) => [b.id, b.longitude]));
  const MIN_SEP = 7.5;
  for (let iter = 0; iter < 60; iter++) {
    let moved = false;
    const order = [...sorted].sort((a, b) => norm(disp.get(a.id)!) - norm(disp.get(b.id)!));
    for (let i = 0; i < order.length; i++) {
      const a = order[i];
      const b = order[(i + 1) % order.length];
      if (a.id === b.id) continue;
      const la = disp.get(a.id)!;
      const lb = disp.get(b.id)!;
      const gap = norm(lb - la);
      if (gap < MIN_SEP) {
        const push = (MIN_SEP - gap) / 2 + 0.05;
        disp.set(a.id, la - push);
        disp.set(b.id, lb + push);
        moved = true;
      }
    }
    if (!moved) break;
  }

  const posById = new Map(bodies.map((b) => [b.id, b]));
  const houses = technical.houses;
  const drawnAspects = D ? technical.aspects.filter((a) => isAspectDrawn(a, D.mode, D.hiddenBodies)) : technical.aspects;
  const angleLons = technical.angles
    ? [technical.angles.ascendant.longitude, technical.angles.midheaven.longitude, technical.angles.ascendant.longitude + 180, technical.angles.midheaven.longitude + 180]
    : [];
  const angleOfCusp = (n: number): number | null =>
    !technical.angles
      ? null
      : n === 1
        ? technical.angles.ascendant.longitude
        : n === 7
          ? technical.angles.ascendant.longitude + 180
          : n === 10
            ? technical.angles.midheaven.longitude
            : n === 4
              ? technical.angles.midheaven.longitude + 180
              : null;
  const sameLon = (x: number, y: number) => Math.min(norm(x - y), norm(y - x)) < 0.02;
  const axisCusp = (h: NatalHouse) => {
    const a = angleOfCusp(h.number);
    return a !== null && sameLon(h.longitude, a);
  };
  /** Ev başlangıcıyla çakışmayan gerçek eksenler (yalnız Natal görünüm; Placidus'ta boş). */
  const freeAxes = D
    ? [1, 4, 7, 10].flatMap((n) => {
        const a = angleOfCusp(n);
        const h = houses.find((x) => x.number === n);
        return a !== null && !(h && sameLon(h.longitude, a)) ? [{ n, lon: a }] : [];
      })
    : [];
  const nearAngle = (lon: number) => angleLons.some((x) => Math.min(norm(lon - x), norm(x - lon)) < 8);
  const PAD = 16;
  const angleIds = new Set([1, 4, 7, 10]);
  const outer = technical.outer && technical.outer.bodies.length > 0 ? technical.outer : null;
  // Dış halka varsa tuval her yönde genişler; iç geometri (koordinatlar) AYNI kalır.
  const EXTRA = outer ? RING2 : 0;
  const outerDisp = new Map<BodyId, number>();
  if (outer) {
    const os = [...outer.bodies].sort((a, b) => a.longitude - b.longitude);
    for (const b of os) outerDisp.set(b.id, b.longitude);
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      const order = [...os].sort((a, b) => norm(outerDisp.get(a.id)!) - norm(outerDisp.get(b.id)!));
      for (let i = 0; i < order.length; i++) {
        const a = order[i];
        const b = order[(i + 1) % order.length];
        if (a.id === b.id) continue;
        const la = outerDisp.get(a.id)!;
        const lb = outerDisp.get(b.id)!;
        const gap = norm(lb - la);
        if (gap < MIN_SEP) {
          const push = (MIN_SEP - gap) / 2 + 0.05;
          outerDisp.set(a.id, la - push);
          outerDisp.set(b.id, lb + push);
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  return (
    <svg
      viewBox={
        outer
          ? `${-(EXTRA + 10)} ${-(EXTRA + 10)} ${SIZE + 2 * (EXTRA + 10)} ${SIZE + 2 * (EXTRA + 10)}`
          : D
            ? `${-PAD} ${-PAD} ${SIZE + 2 * PAD} ${SIZE + 2 * PAD}`
            : `0 0 ${SIZE} ${SIZE}`
      }
      role="img"
      aria-label={label}
      className={`mx-auto select-none ${sizeClassName}`}
      data-outer-ring={outer ? "1" : undefined}
      fontFamily={D ? NATAL_SYMBOL_FONT : undefined}
      data-natal-mode={D ? D.mode : undefined}
      data-aspects-total={D ? technical.aspects.length : undefined}
      data-aspects-drawn={D ? drawnAspects.length : undefined}
    >
      {outer && <circle cx={C} cy={C} r={R_OUT + RING2} fill="#faf5ff" stroke={OUTER_INK} strokeWidth={1.2} />}
      <circle cx={C} cy={C} r={R_OUT} fill="#fffdf7" stroke="#334155" strokeWidth={1.5} />
      <circle cx={C} cy={C} r={R_SIGN_IN} fill="#ffffff" stroke="#334155" strokeWidth={1} />
      <circle cx={C} cy={C} r={R_ASPECT} fill="#f8fafc" stroke="#94a3b8" strokeWidth={0.8} />

      {/* Burç halkası */}
      {SIGN_IDS.map((sign, i) => {
        const start = i * 30;
        const p1 = pt(R_SIGN_IN, start);
        const p2 = pt(R_OUT, start);
        const g = pt((R_SIGN_IN + R_OUT) / 2, start + 15);
        const o2 = pt(R_OUT, start + 30);
        const i2 = pt(R_SIGN_IN, start + 30);
        return (
          <g key={sign}>
            {tinted && (
              <path
                d={`M ${p2.x} ${p2.y} A ${R_OUT} ${R_OUT} 0 0 0 ${o2.x} ${o2.y} L ${i2.x} ${i2.y} A ${R_SIGN_IN} ${R_SIGN_IN} 0 0 1 ${p1.x} ${p1.y} Z`}
                fill={ELEMENT_TINT[SIGN_ELEMENT[sign]]}
              />
            )}
            {D ? (
              <line
                x1={pt(R_SIGN_IN - RULER_W, start).x}
                y1={pt(R_SIGN_IN - RULER_W, start).y}
                x2={p2.x}
                y2={p2.y}
                stroke="#334155"
                strokeWidth={1.1}
                data-sign-boundary={sign}
              />
            ) : (
              <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#334155" strokeWidth={0.8} />
            )}
            <text
              x={g.x}
              y={g.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fs.sign}
              fill={ELEMENT_COLOR[SIGN_ELEMENT[sign]]}
            >
              <title>{SIGN_LABELS[sign]}</title>
              {SIGN_GLYPHS[sign]}
            </text>
          </g>
        );
      })}

      {/* Derece cetveli (yalnız Natal görünüm katmanı): her 1° kısa, 5° orta, 10° uzun; bandın iç kenarı ince çember.
          Burç sınırları (0°) yukarıdaki kalın sınır çizgisidir. Gezegen işaretleri cetvelin ÜSTÜNDE daha koyu/kalın çizilir. */}
      {D && (
        <g data-testid="natal-degree-ruler">
          <circle cx={C} cy={C} r={R_SIGN_IN - RULER_W} fill="none" stroke="#cbd5e1" strokeWidth={0.6} />
          {Array.from({ length: 360 }, (_, lon) => {
            if (lon % 30 === 0) return null;
            const len = lon % 10 === 0 ? RULER_W - 1 : lon % 5 === 0 ? 6.5 : 3.5;
            const p1 = pt(R_SIGN_IN, lon);
            const p2 = pt(R_SIGN_IN - len, lon);
            return (
              <line
                key={`r${lon}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={lon % 10 === 0 ? "#475569" : lon % 5 === 0 ? "#64748b" : "#94a3b8"}
                strokeWidth={lon % 10 === 0 ? 0.9 : lon % 5 === 0 ? 0.7 : 0.45}
                data-deg={lon % 10 === 0 ? "10" : lon % 5 === 0 ? "5" : "1"}
              />
            );
          })}
        </g>
      )}

      {/* 5° işaretleri */}
      {!D && Array.from({ length: 72 }, (_, i) => {
        const lon = i * 5;
        const p1 = pt(R_SIGN_IN, lon);
        const p2 = pt(R_SIGN_IN - (i % 2 === 0 ? 6 : 3), lon);
        return <line key={`t${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#94a3b8" strokeWidth={0.6} />;
      })}

      {/* Ev çizgileri + numaralar */}
      {houses.map((h, i) => {
        const next = houses[(i + 1) % houses.length];
        const inner = pt(R_ASPECT, h.longitude);
        // Natal görünüm: kalın eksen yalnız ev başlangıcı GERÇEK açıyla çakışıyorsa (Placidus vb.); Tam Burç / Eşit Ev'de
        // 1/4/7/10 başlangıcı ince çizilir ve gerçek ASC–DSC / MC–IC ekseni aşağıda ayrıca çizilir.
        const axis = D ? axisCusp(h) : angleIds.has(h.number);
        const outer = pt(axis ? R_OUT + 6 : R_SIGN_IN, h.longitude);
        const span = norm(next.longitude - h.longitude);
        const mid = pt(R_HOUSE_NUM, h.longitude + span / 2);
        return (
          <g key={`h${h.number}`}>
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke={axis ? "#0f172a" : "#94a3b8"}
              strokeWidth={axis ? 1.6 : 0.7}
            />
            <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.house} fill="#475569">
              {h.number}
            </text>
          </g>
        );
      })}

      {freeAxes.map((x) => {
        const p1 = pt(R_ASPECT, x.lon);
        const p2 = pt(R_OUT + 6, x.lon);
        return <line key={`ax${x.n}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#0f172a" strokeWidth={1.6} data-axis={x.n} />;
      })}

      {/* Ev başlangıç dereceleri (yalnız Natal Profesyonel): açı evleri (1/4/7/10) levhada; diğerleri çemberin dışında,
          açı levhasına 8°'den yakınsa çakışmasın diye yazılmaz (değer Evler tablosunda her zaman var). */}
      {D?.mode === "pro" &&
        houses.map((h) => {
          if (nearAngle(h.longitude)) return null;
          const t1 = pt(R_OUT, h.longitude);
          const t2 = pt(R_OUT + 5, h.longitude);
          const q = pt(R_OUT + 14, h.longitude);
          return (
            <g key={`cd${h.number}`} data-cusp-degree={h.number}>
              <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="#94a3b8" strokeWidth={0.8} />
              <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.min} fill="#475569">
                <title>{`${h.number}. ev başlangıcı — ${SIGN_LABELS[h.sign]} ${formatDegree(h.degreeInSign)}`}</title>
                {formatDegree(h.degreeInSign)}
              </text>
            </g>
          );
        })}

      {/* Açı etiketleri */}
      {technical.angles && (
        <>
          {[
            { lon: technical.angles.ascendant.longitude, t: "ASC", title: "Yükselen" },
            { lon: technical.angles.ascendant.longitude + 180, t: "DSC", title: "Alçalan" },
            { lon: technical.angles.midheaven.longitude, t: "MC", title: "Tepe Noktası (MC)" },
            { lon: technical.angles.midheaven.longitude + 180, t: "IC", title: "Dip Noktası (IC)" },
          ].map((a) => {
            if (D) {
              // Natal: iki satırlı levha — kısaltma + burç içi derece (tablolarla aynı biçimlendirici; dakika kesilir).
              const q2 = pt(R_OUT + 20, a.lon);
              const l = norm(a.lon);
              const sign = SIGN_IDS[Math.floor(l / 30) % 12];
              return (
                <g key={a.t} data-angle={a.t}>
                  <rect x={q2.x - 23} y={q2.y - 13} width={46} height={26} rx={5} fill="#fffdf7" stroke="#334155" strokeWidth={0.8} />
                  <text x={q2.x} y={q2.y - 5.5} textAnchor="middle" dominantBaseline="central" fontSize={fs.angle} fontWeight={700} fill="#0f172a">
                    <title>{`${a.title} — ${SIGN_LABELS[sign]} ${formatDegree(l % 30)}`}</title>
                    {a.t}
                  </text>
                  <text x={q2.x} y={q2.y + 6} textAnchor="middle" dominantBaseline="central" fontSize={fs.angle - 1} fill="#334155">
                    <tspan fill={ELEMENT_COLOR[SIGN_ELEMENT[sign]]}>{SIGN_GLYPHS[sign]}</tspan>
                    {` ${formatDegree(l % 30)}`}
                  </text>
                </g>
              );
            }
            const q = pt(R_OUT + EXTRA + 16, a.lon);
            // Etiket çember DIŞINDA → zemin rengi (koyu masa / açık kâğıt) ne olursa olsun okunur küçük açık levha.
            return (
              <g key={a.t}>
                <rect x={q.x - 14} y={q.y - 7.5} width={28} height={15} rx={4} fill="#fffdf7" stroke="#334155" strokeWidth={0.7} />
                <text x={q.x} y={q.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.angle} fontWeight={700} fill="#0f172a">
                  <title>{a.title}</title>
                  {a.t}
                </text>
              </g>
            );
          })}
        </>
      )}

      {/* Açılar (iç daire) */}
      {drawnAspects.map((a, i) => {
        const pa = posById.get(a.a);
        const pb = posById.get(a.b);
        if (!pa || !pb) return null;
        const p1 = pt(R_ASPECT, pa.longitude);
        const p2 = pt(R_ASPECT, pb.longitude);
        const color = NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b";
        if (D) {
          // Natal: Temel = başlıca açılar tek kalınlık; Profesyonel = sıkı orb daha kalın (orb yalnız okunur, değişmez).
          const major = MAJOR.has(a.type);
          const w = !major ? 0.7 : D.mode === "basic" ? 1.35 : typeof a.orb === "number" ? 0.75 + 1.25 * Math.max(0, 1 - a.orb / 8) : 1.1;
          return (
            <line
              key={`a${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={color}
              strokeWidth={Math.round(w * 100) / 100}
              strokeDasharray={major ? undefined : "3 3"}
              opacity={0.8}
              data-aspect={`${a.a}-${a.b}-${a.type}`}
            >
              <title>{`${BODY_LABELS[a.a]} – ${BODY_LABELS[a.b]} · ${ASPECT_TITLE[a.type]}${typeof a.orb === "number" ? ` · orb ${formatDegree(a.orb)}` : ""}`}</title>
            </line>
          );
        }
        return (
          <line
            key={`a${i}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={color}
            strokeWidth={MAJOR.has(a.type) ? 1.1 : 0.7}
            strokeDasharray={MAJOR.has(a.type) ? undefined : "3 3"}
            opacity={0.75}
          />
        );
      })}

      {/* Halkalar arası açılar (dış halka → natal); mor nokta dış halka gövdesinin ucu */}
      {outer &&
        outer.crossAspects.map((a, i) => {
          const po = outer.bodies.find((b) => b.id === a.outer);
          const pi = posById.get(a.inner);
          if (!po || !pi) return null;
          const p1 = pt(R_ASPECT, po.longitude);
          const p2 = pt(R_ASPECT, pi.longitude);
          return (
            <line
              key={`x${i}`}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={NATURE_COLOR[a.nature ?? "neutral"] ?? "#64748b"}
              strokeWidth={MAJOR.has(a.type) ? 1.1 : 0.7}
              strokeDasharray={MAJOR.has(a.type) ? undefined : "3 3"}
              opacity={0.75}
              data-cross="1"
            />
          );
        })}
      {outer &&
        outer.bodies.map((b) => {
          const dot = pt(R_ASPECT, b.longitude);
          return <circle key={`od${b.id}`} cx={dot.x} cy={dot.y} r={1.8} fill={OUTER_INK} />;
        })}

      {/* Gezegenler */}
      {bodies.map((b) => {
        const d = disp.get(b.id) ?? b.longitude;
        const tick1 = pt(R_SIGN_IN, b.longitude);
        const tick2 = pt(R_SIGN_IN - 9, b.longitude);
        if (D) {
          const g = pt(R_GLYPH, d);
          const deg = pt(R_DEG, d);
          const dot = pt(R_ASPECT, b.longitude);
          const mins = pt(R_DEG - 19, d);
          const k2 = pt(R_SIGN_IN - RULER_W - 2, b.longitude);
          const [degTxt, minTxt] = formatDegree(b.degreeInSign).split("°");
          return (
            <g key={b.id} data-body={b.id}>
              <line x1={tick1.x} y1={tick1.y} x2={k2.x} y2={k2.y} stroke="#0f172a" strokeWidth={1.7} />
              <line x1={k2.x} y1={k2.y} x2={g.x} y2={g.y} stroke="#cbd5e1" strokeWidth={0.6} />
              <circle cx={dot.x} cy={dot.y} r={1.8} fill="#0f172a" />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.glyph} fill="#0f172a">
                <title>{`${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${formatDegree(b.degreeInSign)}${b.retrograde ? " ℞ (geri hareket)" : ""}`}</title>
                {BODY_GLYPHS[b.id]}
              </text>
              <text x={deg.x} y={deg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill="#1e293b">
                {`${degTxt}°`}
                {b.retrograde && (
                  <tspan fill={RETRO_INK} data-retro="1">
                    ℞
                  </tspan>
                )}
              </text>
              <text x={mins.x} y={mins.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.min} fill="#64748b">
                {minTxt}
              </text>
            </g>
          );
        }
        const g = pt(R_GLYPH, d);
        const deg = pt(R_DEG, d);
        const dot = pt(R_ASPECT, b.longitude);
        const mins = pt(R_DEG - 19, d);
        const [degTxt, minTxt] = formatDegree(b.degreeInSign).split("°");
        return (
          <g key={b.id}>
            <line x1={tick1.x} y1={tick1.y} x2={tick2.x} y2={tick2.y} stroke="#0f172a" strokeWidth={1.2} />
            <line x1={tick2.x} y1={tick2.y} x2={g.x} y2={g.y} stroke="#cbd5e1" strokeWidth={0.6} />
            <circle cx={dot.x} cy={dot.y} r={1.8} fill="#0f172a" />
            <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.glyph} fill="#0f172a">
              <title>{`${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${formatDegree(b.degreeInSign)}${b.retrograde ? " ℞" : ""}`}</title>
              {BODY_GLYPHS[b.id]}
            </text>
            <text x={deg.x} y={deg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill="#1e293b">
              {`${degTxt}°${b.retrograde ? "℞" : ""}`}
            </text>
            <text x={mins.x} y={mins.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.min} fill="#64748b">
              {minTxt}
            </text>
          </g>
        );
      })}

      {/* Özel noktalar (yalnız Natal; teknik veride varsa ve seçildiyse): Şans Noktası ⊗, Vertex Vx — açı çizgisi yok. */}
      {extras.map((p) => {
        const d = disp.get(`x:${p.id}`) ?? p.longitude;
        const t1 = pt(R_SIGN_IN, p.longitude);
        const t2 = pt(R_SIGN_IN - RULER_W - 2, p.longitude);
        const g = pt(R_GLYPH, d);
        const deg = pt(R_DEG, d);
        const mins = pt(R_DEG - 19, d);
        const [degTxt, minTxt] = formatDegree(p.degreeInSign).split("°");
        return (
          <g key={`x${p.id}`} data-point={p.id}>
            <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={POINT_INK} strokeWidth={1.5} />
            <line x1={t2.x} y1={t2.y} x2={g.x} y2={g.y} stroke="#99d5cc" strokeWidth={0.6} />
            <text
              x={g.x}
              y={g.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={p.id === "vertex" ? fs.glyph - 7 : fs.glyph}
              fontWeight={p.id === "vertex" ? 700 : undefined}
              fontStyle={p.id === "vertex" ? "italic" : undefined}
              fill={POINT_INK}
            >
              <title>{`${p.label} — ${SIGN_LABELS[p.sign]} ${formatDegree(p.degreeInSign)}`}</title>
              {p.glyph}
            </text>
            <text x={deg.x} y={deg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill={POINT_INK}>
              {`${degTxt}°`}
            </text>
            <text x={mins.x} y={mins.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.min} fill="#5f8f88">
              {minTxt}
            </text>
          </g>
        );
      })}

      {/* Dış halka gövdeleri (ilerletilmiş / Solar Arc) — R_OUT dışında, mor; gerçek derece çentiği R_OUT çizgisinde */}
      {outer &&
        outer.bodies.map((b) => {
          const d = outerDisp.get(b.id) ?? b.longitude;
          const t1 = pt(R_OUT, b.longitude);
          const t2 = pt(R_OUT + 7, b.longitude);
          const g = pt(R_OUT + 22, d);
          const dg = pt(R_OUT + 42, d);
          const [degTxt] = formatDegree(b.degreeInSign).split("°");
          return (
            <g key={`o${b.id}`} data-outer-body={b.id}>
              <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke={OUTER_INK} strokeWidth={1.4} />
              <text x={g.x} y={g.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.glyph - 2} fill={OUTER_INK}>
                <title>{`${outer.title} ${BODY_LABELS[b.id]} — ${SIGN_LABELS[b.sign]} ${formatDegree(b.degreeInSign)}${b.retrograde ? " ℞" : ""}`}</title>
                {BODY_GLYPHS[b.id]}
              </text>
              <text x={dg.x} y={dg.y} textAnchor="middle" dominantBaseline="central" fontSize={fs.deg} fontWeight={600} fill={OUTER_INK}>
                {`${degTxt}°${b.retrograde ? "℞" : ""}`}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
